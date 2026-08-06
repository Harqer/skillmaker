// deep-research-runner — thin Go executor that runs the vendored Raven CLI in
// machine-readable mode and emits the extracted EVE bundle as a result JSON.
//
// The Python bridge (agent/raven_bridge.py) owns orchestration: brief building,
// full spec verification, bounded retries and fast-fail decisions. This binary
// is deliberately single-shot — one research run, one machine-readable result.
//
// Contract (stdout JSON, exit 0 on completed research regardless of research
// outcome; exit 1 only on internal errors such as a missing brief file):
//
//	{"success": bool, "eve_files": {path: content} | null,
//	 "output": "<raw raven stdout>", "error": string | null,
//	 "structural": bool}
package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"strings"
)

type result struct {
	Success    bool              `json:"success"`
	EveFiles   map[string]string `json:"eve_files"`
	Output     string            `json:"output"`
	Error      string            `json:"error"`
	Structural bool              `json:"structural"`
}

func main() {
	brief, err := parseArgs(os.Args[1:])
	if err != nil {
		fmt.Fprintln(os.Stderr, "deep-research-runner:", err)
		os.Exit(1)
	}
	res := runResearch(brief.brief, brief.python)
	out, err := json.Marshal(res)
	if err != nil {
		fmt.Fprintln(os.Stderr, "deep-research-runner: cannot marshal result:", err)
		os.Exit(1)
	}
	fmt.Println(string(out))
	os.Exit(0)
}

type briefArgs struct {
	brief  string
	python string
}

func parseArgs(args []string) (briefArgs, error) {
	var path string
	python := "python3"
	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "research":
		case "--brief":
			if i+1 >= len(args) {
				return briefArgs{}, errors.New("--brief requires a path")
			}
			i++
			path = args[i]
		case "--python":
			if i+1 >= len(args) {
				return briefArgs{}, errors.New("--python requires a path")
			}
			i++
			python = args[i]
		default:
			return briefArgs{}, fmt.Errorf("unexpected argument: %s", args[i])
		}
	}
	if path == "" {
		return briefArgs{}, errors.New("usage: deep-research-runner research --brief <path> [--python <python>]")
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return briefArgs{}, fmt.Errorf("cannot read brief %s: %w", path, err)
	}
	return briefArgs{brief: string(data), python: python}, nil
}

func runResearch(brief, python string) result {
	res := result{EveFiles: map[string]string{}}

	var stdout, stderr strings.Builder
	cmd := exec.Command(python, "-m", "raven", "agent", "-m", brief, "--json")
	cmd.Env = append(os.Environ(), "PYTHONUNBUFFERED=1")
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()
	output := stdout.String()
	res.Output = output

	if files, ok := extractEveBundle(output); ok {
		// The output is parseable regardless of the exit code: raven's native
		// runtimes (lancedb/torch) can segfault during interpreter finalization
		// after a fully-rendered response, so a non-zero exit is only a hard
		// failure when stdout is unusable.
		res.Success = true
		res.EveFiles = files
		return res
	}

	if err != nil {
		res.Error = fmt.Sprintf("Raven exited with code %d: %s", exitCode(err), tail(stderr.String(), 500))
		res.Structural = true
		return res
	}

	if reason := structuralReason(output); reason != "" {
		res.Error = reason
		res.Structural = true
		return res
	}
	res.Error = "Could not extract EVE bundle from Raven output"
	return res
}

func exitCode(err error) int {
	var ee *exec.ExitError
	if errors.As(err, &ee) {
		return ee.ExitCode()
	}
	return -1
}

func tail(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[len(s)-n:]
}

// extractEveBundle mirrors raven_bridge._extract_eve_from_raven_output: tolerant
// of stray leading/trailing lines by scanning candidate slices in order of
// likelihood (fenced JSON block, first { to last } slice, then the whole text).
func extractEveBundle(output string) (map[string]string, bool) {
	output = strings.TrimSpace(output)
	if output == "" {
		return nil, false
	}

	var candidates []string

	inBlock := false
	var block []string
	for _, line := range strings.Split(output, "\n") {
		stripped := strings.TrimSpace(line)
		if strings.HasPrefix(stripped, "```") {
			if inBlock {
				candidates = append(candidates, strings.Join(block, "\n"))
				inBlock = false
			} else {
				inBlock = true
				block = nil
			}
			continue
		}
		if inBlock {
			block = append(block, line)
		}
	}

	first := strings.Index(output, "{")
	last := strings.LastIndex(output, "}")
	if first != -1 && last != -1 && last > first {
		candidates = append(candidates, output[first:last+1])
	}
	candidates = append(candidates, output)

	for _, candidate := range candidates {
		var parsed map[string]any
		if err := json.Unmarshal([]byte(candidate), &parsed); err != nil {
			continue
		}
		files := make(map[string]string, len(parsed))
		for key, value := range parsed {
			switch v := value.(type) {
			case string:
				files[key] = v
			case nil:
				files[key] = ""
			default:
				b, err := json.MarshalIndent(v, "", "  ")
				if err != nil {
					files[key] = fmt.Sprintf("%v", v)
				} else {
					files[key] = string(b)
				}
			}
		}
		return files, true
	}
	return nil, false
}

// structuralReason mirrors raven_bridge._output_is_structural_failure: a retry
// can only help when the model produced a parseable bundle the verifier rejected;
// empty, banner-only, or JSON-corrupted output is a contract failure.
func structuralReason(output string) string {
	if strings.TrimSpace(output) == "" {
		return "Raven returned empty output"
	}
	if !strings.Contains(output, "{") {
		return "Raven output contains no JSON object"
	}
	first := strings.Index(output, "{")
	last := strings.LastIndex(output, "}")
	if first == -1 || last <= first {
		return "Raven output contains no complete JSON object"
	}
	if !json.Valid([]byte(output[first : last+1])) {
		return "Raven output JSON is corrupted (unparseable)"
	}
	return ""
}
