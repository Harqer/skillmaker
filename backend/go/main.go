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
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"time"

	"abso.local/deep-research-runner/rlm"
)

type result struct {
	Success    bool              `json:"success"`
	EveFiles   map[string]string `json:"eve_files"`
	Output     string            `json:"output"`
	Error      string            `json:"error"`
	Structural bool              `json:"structural"`
}

// The Python bridge gives this binary a 120s subprocess budget, so the research
// run must stay below it: the runner enforces its own tighter deadline and
// reports a clean structural failure when Raven exceeds it. Variables (not
// constants) so tests can shrink them.
var (
	researchDeadline = 110 * time.Second
	waitDelay        = 5 * time.Second
)

func main() {
	args := os.Args[1:]
	if len(args) > 0 {
		switch args[0] {
		case "rlm":
			runRLMSubcommand(args[1:])
			return
		case "skillplan":
			runSkillPlanSubcommand(args[1:])
			return
		}
	}
	brief, err := parseArgs(args)
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

// emitResult prints a JSON result on stdout and exits 0, keeping the
// single-shot contract: internal errors (bad flags, missing files) exit 1;
// a completed run always exits 0 regardless of the result payload.
func emitResult(v any) {
	out, err := json.Marshal(v)
	if err != nil {
		fmt.Fprintln(os.Stderr, "deep-research-runner: cannot marshal result:", err)
		os.Exit(1)
	}
	fmt.Println(string(out))
	os.Exit(0)
}

// rlmArgs holds the flags for the `rlm` subcommand.
type rlmArgs struct {
	corpus        string
	task          string
	rootModel     string
	subModel      string
	maxIterations int
	python        string
}

func runRLMSubcommand(args []string) {
	var a rlmArgs
	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "--corpus":
			if i+1 >= len(args) {
				fmt.Fprintln(os.Stderr, "deep-research-runner rlm: --corpus requires a path")
				os.Exit(1)
			}
			i++
			a.corpus = args[i]
		case "--task":
			if i+1 >= len(args) {
				fmt.Fprintln(os.Stderr, "deep-research-runner rlm: --task requires a value")
				os.Exit(1)
			}
			i++
			a.task = args[i]
		case "--root-model":
			if i+1 >= len(args) {
				fmt.Fprintln(os.Stderr, "deep-research-runner rlm: --root-model requires a value")
				os.Exit(1)
			}
			i++
			a.rootModel = args[i]
		case "--sub-model":
			if i+1 >= len(args) {
				fmt.Fprintln(os.Stderr, "deep-research-runner rlm: --sub-model requires a value")
				os.Exit(1)
			}
			i++
			a.subModel = args[i]
		case "--max-iterations":
			if i+1 >= len(args) {
				fmt.Fprintln(os.Stderr, "deep-research-runner rlm: --max-iterations requires a value")
				os.Exit(1)
			}
			i++
			if n, err := fmt.Sscanf(args[i], "%d", &a.maxIterations); err != nil || n != 1 || a.maxIterations <= 0 {
				fmt.Fprintln(os.Stderr, "deep-research-runner rlm: invalid --max-iterations:", args[i])
				os.Exit(1)
			}
		case "--python":
			if i+1 >= len(args) {
				fmt.Fprintln(os.Stderr, "deep-research-runner rlm: --python requires a path")
				os.Exit(1)
			}
			i++
			a.python = args[i]
		default:
			fmt.Fprintln(os.Stderr, "deep-research-runner rlm: unexpected argument:", args[i])
			os.Exit(1)
		}
	}
	if a.corpus == "" || a.task == "" {
		fmt.Fprintln(os.Stderr, "usage: deep-research-runner rlm --corpus <path> --task <task> [--root-model M] [--sub-model M] [--max-iterations N] [--python <python>]")
		os.Exit(1)
	}

	engine, err := rlm.NewEngine(rlm.Config{
		RootModel:     a.rootModel,
		SubModel:      a.subModel,
		MaxIterations: a.maxIterations,
		Python:        a.python,
	})
	if err != nil {
		emitResult(rlm.Result{Error: err.Error()})
	}
	emitResult(engine.Run(context.Background(), a.corpus, a.task))
}

// skillplanArgs holds the flags for the `skillplan` subcommand.
type skillplanArgs struct {
	skillsDir string
	task      string
	mode      string
	topK      int
	model     string
}

func runSkillPlanSubcommand(args []string) {
	var a skillplanArgs
	a.mode = "sequence"
	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "--skills":
			if i+1 >= len(args) {
				fmt.Fprintln(os.Stderr, "deep-research-runner skillplan: --skills requires a path")
				os.Exit(1)
			}
			i++
			a.skillsDir = args[i]
		case "--task":
			if i+1 >= len(args) {
				fmt.Fprintln(os.Stderr, "deep-research-runner skillplan: --task requires a value")
				os.Exit(1)
			}
			i++
			a.task = args[i]
		case "--mode":
			if i+1 >= len(args) {
				fmt.Fprintln(os.Stderr, "deep-research-runner skillplan: --mode requires a value")
				os.Exit(1)
			}
			i++
			a.mode = args[i]
		case "--top-k":
			if i+1 >= len(args) {
				fmt.Fprintln(os.Stderr, "deep-research-runner skillplan: --top-k requires a value")
				os.Exit(1)
			}
			i++
			if n, err := fmt.Sscanf(args[i], "%d", &a.topK); err != nil || n != 1 || a.topK <= 0 {
				fmt.Fprintln(os.Stderr, "deep-research-runner skillplan: invalid --top-k:", args[i])
				os.Exit(1)
			}
		case "--model":
			if i+1 >= len(args) {
				fmt.Fprintln(os.Stderr, "deep-research-runner skillplan: --model requires a value")
				os.Exit(1)
			}
			i++
			a.model = args[i]
		default:
			fmt.Fprintln(os.Stderr, "deep-research-runner skillplan: unexpected argument:", args[i])
			os.Exit(1)
		}
	}
	if a.skillsDir == "" || a.task == "" {
		fmt.Fprintln(os.Stderr, "usage: deep-research-runner skillplan --skills <dir> --task <task> [--mode sequence|parallel] [--top-k N] [--model M]")
		os.Exit(1)
	}

	skills, err := rlm.LoadSkills(a.skillsDir)
	if err != nil {
		emitResult(rlm.Result{Error: err.Error()})
	}
	selected := rlm.SelectSkills(skills, a.task, a.topK)
	names := make([]string, 0, len(selected))
	for _, s := range selected {
		names = append(names, s.Name)
	}
	if len(selected) == 0 {
		emitResult(rlm.Result{Success: true, SelectedSkills: names})
	}
	apps, err := rlm.ApplySkills(context.Background(), selected, a.task, a.mode, rlm.SkillPlanConfig{Model: a.model})
	if err != nil {
		emitResult(rlm.Result{SelectedSkills: names, Error: err.Error()})
	}
	emitResult(rlm.Result{
		Success:        true,
		SelectedSkills: names,
		Applications:   apps,
	})
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
	// Bound the research run below the Python bridge's 120s subprocess budget
	// so a hung Raven never leaves the bridge waiting on its own timeout.
	ctx, cancel := context.WithTimeout(context.Background(), researchDeadline)
	defer cancel()
	cmd := exec.CommandContext(ctx, python, "-m", "raven", "agent", "-m", brief, "--json")
	cmd.Env = append(os.Environ(), "PYTHONUNBUFFERED=1")
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	// Kill the whole process tree on deadline instead of just the shell, and
	// cap how long we wait for the killed tree to actually exit.
	cmd.Cancel = func() error {
		return cmd.Process.Kill()
	}
	cmd.WaitDelay = waitDelay

	err := cmd.Run()
	output := stdout.String()
	res.Output = output

	if ctx.Err() != nil {
		res.Error = fmt.Sprintf("Raven exceeded the %s research deadline", researchDeadline)
		res.Structural = true
		return res
	}

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
		if len(parsed) == 0 {
			// An empty JSON object yields no EVE files; treat it as an
			// extraction failure rather than a valid empty bundle.
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
