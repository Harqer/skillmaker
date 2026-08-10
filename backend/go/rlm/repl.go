package rlm

import (
	"bufio"
	"context"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"sync"
	"time"
)

//go:embed sandbox/runner.py
var sandboxScript []byte

// CommandHandler services a request line the sandbox sent (llm_query,
// llm_batch, combine_results, g_*). The engine owns budgets, parallelism and
// the knowledge graph; the sandbox never calls an LLM itself.
type CommandHandler func(method string, args map[string]any) (any, error)

// ExecResult is the sandbox's reply to one exec message.
type ExecResult struct {
	OK     bool
	Output string
	Answer any
	Ready  bool
}

// Sandbox is the Go side of the sandboxed RLM REPL subprocess.
type Sandbox struct {
	cmd        *exec.Cmd
	stdin      io.WriteCloser
	out        io.Reader
	handler    CommandHandler
	python     string
	scriptPath string
	mu         sync.Mutex // serializes writes to the sandbox's stdin
}

// NewSandbox spawns the Python runner with the corpus at corpusPath. The
// runner is the embedded sandbox script written to a temp file. The temp file
// is only removed once the subprocess has exited (Close), because execve opens
// the script by path — deleting it right after Start races the child.
func NewSandbox(python, corpusPath string, guardChars int, handler CommandHandler) (*Sandbox, error) {
	if python == "" {
		python = "python3"
	}
	script, err := writeSandboxScript()
	if err != nil {
		return nil, err
	}

	cmd := exec.CommandContext(context.Background(), python, script)
	cmd.Env = append(os.Environ(), "PYTHONUNBUFFERED=1")
	cmd.Cancel = func() error { return cmd.Process.Kill() }
	cmd.WaitDelay = 5 * time.Second

	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, err
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return nil, err
	}
	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("start rlm sandbox: %w", err)
	}

	s := &Sandbox{cmd: cmd, stdin: stdin, out: stdout, handler: handler, python: python, scriptPath: script}

	// Drain stderr so a wedged subprocess can never block on a full pipe.
	if f, ok := os.LookupEnv("RLM_DEBUG_STDERR"); ok {
		fh, _ := os.Create(f)
		go io.Copy(fh, stderr)
	} else {
		go io.Copy(io.Discard, stderr)
	}

	initMsg, err := json.Marshal(map[string]any{
		"cmd":         "init",
		"corpus_path": corpusPath,
		"guard_chars": guardChars,
	})
	if err != nil {
		s.Close()
		return nil, err
	}
	if err := s.writeLine(string(initMsg)); err != nil {
		s.Close()
		return nil, fmt.Errorf("init rlm sandbox: %w", err)
	}
	return s, nil
}

// writeLine writes one JSON object to the sandbox's stdin.
func (s *Sandbox) writeLine(line string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.stdin == nil {
		return errors.New("sandbox stdin closed")
	}
	if _, err := io.WriteString(s.stdin, line+"\n"); err != nil {
		return err
	}
	return nil
}

// Exec sends one code block and waits for the sandbox's result. The reader
// loop services nested requests (llm_*) synchronously, so sub-call latency
// counts against the provided context deadline. On timeout the whole process
// tree is killed.
func (s *Sandbox) Exec(ctx context.Context, id int, code string) (ExecResult, error) {
	if err := s.writeLine(mustJSON(map[string]any{"cmd": "exec", "id": id, "code": code})); err != nil {
		return ExecResult{}, fmt.Errorf("sandbox exec write: %w", err)
	}

	type outcome struct {
		res ExecResult
		err error
	}
	ch := make(chan outcome, 1)
	go func() {
		res, err := s.runReader(ctx, id)
		ch <- outcome{res, err}
	}()

	select {
	case <-ctx.Done():
		s.kill()
		return ExecResult{}, fmt.Errorf("sandbox exec deadline exceeded: %w", ctx.Err())
	case o := <-ch:
		return o.res, o.err
	}
}

// runReader reads stdout lines until the exec's result is delivered, servicing
// requests as they arrive.
func (s *Sandbox) runReader(ctx context.Context, wantID int) (ExecResult, error) {
	reader := bufio.NewReaderSize(s.stdoutReader(), 1<<20)
	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			if ctx.Err() != nil {
				return ExecResult{}, fmt.Errorf("sandbox exec deadline exceeded: %w", ctx.Err())
			}
			return ExecResult{}, fmt.Errorf("sandbox stdout: %w", err)
		}
		var msg map[string]any
		if err := json.Unmarshal([]byte(line), &msg); err != nil {
			continue
		}
		switch msg["cmd"] {
		case "request":
			reqID, _ := msg["req_id"].(float64)
			method, _ := msg["method"].(string)
			args, _ := msg["args"].(map[string]any)
			result, rerr := s.handler(method, args)
			resp := map[string]any{"cmd": "response", "req_id": int(reqID)}
			if rerr != nil {
				resp["error"] = rerr.Error()
			} else {
				resp["result"] = result
			}
			if werr := s.writeLine(mustJSON(resp)); werr != nil {
				return ExecResult{}, werr
			}
		case "result":
			id, _ := msg["id"].(float64)
			if int(id) != wantID {
				continue
			}
			ok, _ := msg["ok"].(bool)
			output, _ := msg["output"].(string)
			answer, _ := msg["answer"].(any)
			ready, _ := msg["ready"].(bool)
			return ExecResult{OK: ok, Output: output, Answer: answer, Ready: ready}, nil
		}
	}
}

// stdoutReader returns a fresh reader over the sandbox's stdout pipe. A
// pipeline of execs reads the pipe sequentially, so a new reader per exec
// avoids Scanner buffer-size pitfalls on large llm_batch responses.
func (s *Sandbox) stdoutReader() io.Reader {
	return s.out
}

// Close terminates the sandbox, waits for it to exit, then removes the temp
// script (which the child opened by path during execve).
func (s *Sandbox) Close() error {
	_ = s.writeLine(`{"cmd":"quit"}`)
	if s.cmd != nil && s.cmd.Process != nil {
		s.kill()
	}
	err := s.cmd.Wait()
	if s.scriptPath != "" {
		_ = os.Remove(s.scriptPath)
	}
	return err
}

func (s *Sandbox) kill() {
	if s.cmd != nil && s.cmd.Process != nil {
		_ = s.cmd.Process.Kill()
	}
}

func writeSandboxScript() (string, error) {
	f, err := os.CreateTemp("", "rlm-sandbox-*.py")
	if err != nil {
		return "", err
	}
	if _, err := f.Write(sandboxScript); err != nil {
		f.Close()
		os.Remove(f.Name())
		return "", err
	}
	if err := f.Close(); err != nil {
		os.Remove(f.Name())
		return "", err
	}
	return f.Name(), nil
}

func mustJSON(v any) string {
	b, err := json.Marshal(v)
	if err != nil {
		return `{"cmd":"response","error":"marshal failed"}`
	}
	return string(b)
}
