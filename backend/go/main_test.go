package main

import (
	"encoding/json"
	"reflect"
	"testing"
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
			if !contains(got, tc.want) {
				t.Fatalf("structuralReason = %q, want substring %q", got, tc.want)
			}
		})
	}
}

func contains(s, sub string) bool {
	return len(s) >= len(sub) && (sub == "" || indexOf(s, sub) >= 0)
}

func indexOf(s, sub string) int {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}
