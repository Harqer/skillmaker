package rlm

// Result is the machine-readable contract both the `rlm` and `skillplan`
// subcommands emit on stdout. The Python bridge parses this JSON directly.
//
//	{"success": bool, "answer": str, "iterations": int,
//	 "tokens_used": int, "sub_calls_count": int,
//	 "fallback_used": bool, "selected_skills": [str],
//	 "applications": [{"skill": str, "output": str}], "error": str}
type Result struct {
	Success        bool          `json:"success"`
	Answer         string        `json:"answer,omitempty"`
	Iterations     int           `json:"iterations"`
	TokensUsed     int           `json:"tokens_used"`
	SubCallsCount  int           `json:"sub_calls_count"`
	FallbackUsed   bool          `json:"fallback_used,omitempty"`
	SelectedSkills []string      `json:"selected_skills,omitempty"`
	Applications   []Application `json:"applications,omitempty"`
	Error          string        `json:"error,omitempty"`
}

// Application is one skill-shaped contribution produced by the `skillplan`
// subcommand (Contract 2).
type Application struct {
	Skill  string `json:"skill"`
	Output string `json:"output"`
}

// ApproxTokens mirrors the Python engines' `len(s) // 4` accounting.
func ApproxTokens(s string) int {
	return len(s) / 4
}
