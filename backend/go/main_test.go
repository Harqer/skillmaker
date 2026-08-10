package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"
)

func TestExtractEveBundle(t *testing.T) {
	valid := map[string]string{"instructions.md": "# Instructions", "skills/SKILL.md": "# Skill"}
	validJSON, err := json.Marshal(valid)
	if err != nil {
		t.Fatal(err)
	}
	cases := []struct {
		name   string
		output string
		want   map[string]string
		ok     bool
	}{
		{
			name:   "empty",
			output: "",
			ok:     false,
		},
		{
			name:   "empty JSON object",
			output: "{}",
			ok:     false,
		},
		{
			name:   "banner only",
			output: "EverosBackend.recall failed; returning empty\n[DONE]",
			ok:     false,
		},
		{
			name:   "raw JSON",
			output: string(validJSON),
			want:   valid,
			ok:     true,
		},
		{
			name:   "fenced JSON",
			output: "```json\n" + string(validJSON) + "\n```\n",
			want:   valid,
			ok:     true,
		},
		{
			name:   "stray prefix and suffix",
			output: "[notice] init\n" + string(validJSON) + "\n[DONE]",
			want:   valid,
			ok:     true,
		},
		{
			name:   "non-string values marshaled",
			output: `{"a.md": {"nested": [1, 2]}}`,
			want:   map[string]string{"a.md": "{\n  \"nested\": [\n    1,\n    2\n  ]\n}"},
			ok:     true,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, ok := extractEveBundle(tc.output)
			if ok != tc.ok {
				t.Fatalf("ok = %v, want %v", ok, tc.ok)
			}
			if !ok {
				return
			}
			if !reflect.DeepEqual(got, tc.want) {
				t.Fatalf("extract = %#v, want %#v", got, tc.want)
			}
		})
	}
}

func TestStructuralReason(t *testing.T) {
	cases := []struct {
		name   string
		output string
		want   string
	}{
		{"empty", "", "empty output"},
		{"whitespace", "  \n  ", "empty output"},
		{"no brace", "just some prose", "no JSON object"},
		{"corrupted", `{foo}`, "corrupted"},
		{"valid", `{"instructions.md": "x"}`, ""},
		{"valid with prefix", "[notice]\n{\"a\":1}", ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := structuralReason(tc.output)
			if tc.want == "" {
				if got != "" {
					t.Fatalf("structuralReason = %q, want no failure", got)
				}
				return
			}
			if !strings.Contains(got, tc.want) {
				t.Fatalf("structuralReason = %q, want substring %q", got, tc.want)
			}
		})
	}
}

func TestRunResearchRespectsDeadline(t *testing.T) {
	// A raven module that sleeps longer than the deadline: the runner must
	// terminate it and report a clean structural deadline failure instead of
	// hanging on the caller's budget.
	oldDeadline, oldWait := researchDeadline, waitDelay
	researchDeadline = 300 * time.Millisecond
	waitDelay = 1 * time.Second
	defer func() {
		researchDeadline, waitDelay = oldDeadline, oldWait
	}()

	dir := t.TempDir()
	ravenMod := filepath.Join(dir, "raven")
	if err := os.MkdirAll(ravenMod, 0o755); err != nil {
		t.Fatal(err)
	}
	// A module that exits after a delay that exceeds the deadline.
	if err := os.WriteFile(
		filepath.Join(ravenMod, "__init__.py"),
		[]byte("import time\ntime.sleep(10)\n"),
		0o644,
	); err != nil {
		t.Fatal(err)
	}

	// Point -m raven at the temp dir via a wrapper module that imports the
	// sleeping module. PYTHONPATH picks up the temp dir first.
	t.Setenv("PYTHONPATH", dir)

	res := runResearch("brief", "python3")
	if res.Success {
		t.Fatalf("expected deadline failure, got success: %+v", res)
	}
	if !res.Structural {
		t.Fatalf("expected structural failure, got %+v", res)
	}
	if !strings.Contains(res.Error, "deadline") {
		t.Fatalf("expected deadline error, got %q", res.Error)
	}
}
