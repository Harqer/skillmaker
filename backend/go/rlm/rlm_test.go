package rlm

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestApproxTokens(t *testing.T) {
	if ApproxTokens("abcd") != 1 {
		t.Fatalf("ApproxTokens(abcd) = %d, want 1", ApproxTokens("abcd"))
	}
}

func TestExtractPythonCode(t *testing.T) {
	response := "Some prose\n```python\nprint(len_p())\nanswer = 'x'\nready = True\n```\ntrailing"
	got := ExtractPythonCode(response)
	want := "print(len_p())\nanswer = 'x'\nready = True"
	if got != want {
		t.Fatalf("ExtractPythonCode = %q, want %q", got, want)
	}

	bare := "```\nanswer = 'y'\n```"
	if got := ExtractPythonCode(bare); got != "answer = 'y'" {
		t.Fatalf("bare fence = %q, want answer = 'y'", got)
	}

	if got := ExtractPythonCode("no code here"); got != "" {
		t.Fatalf("no-code = %q, want empty", got)
	}
}

func TestBuildCorpusDeterministic(t *testing.T) {
	pages := map[string]string{
		"https://b.example/": "second page",
		"https://a.example/": "first page",
	}
	c := BuildCorpus(pages)
	if len(c.PageOrder) != 2 || c.PageOrder[0] != "https://a.example/" || c.PageOrder[1] != "https://b.example/" {
		t.Fatalf("PageOrder not sorted: %v", c.PageOrder)
	}
	if !strings.Contains(c.P, "## Page: https://a.example/") {
		t.Fatalf("P missing page heading: %q", c.P)
	}
	if c.Pages["https://a.example/"] != "first page" {
		t.Fatalf("Pages map corrupted")
	}

	c2 := BuildCorpus(pages)
	if c.P != c2.P {
		t.Fatalf("BuildCorpus not deterministic")
	}

	chunks := c.ChunkP(20, 5)
	if len(chunks) < 2 {
		t.Fatalf("ChunkP returned %d chunks, want >= 2", len(chunks))
	}
	if !strings.Contains(c.P, chunks[0]) {
		t.Fatalf("first chunk not a substring of P")
	}
	// Overlap: consecutive chunks share text when overlap > 0.
	if !strings.Contains(chunks[1], chunks[0][len(chunks[0])-5:]) {
		t.Fatalf("expected overlap between chunks")
	}
}

func TestLoadCorpusPlainText(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "corpus.md")
	if err := os.WriteFile(path, []byte("plain markdown body"), 0o644); err != nil {
		t.Fatal(err)
	}
	c, err := LoadCorpus(path)
	if err != nil {
		t.Fatal(err)
	}
	if c.P != "plain markdown body" {
		t.Fatalf("plain corpus P = %q", c.P)
	}
	if len(c.PageOrder) != 1 || c.PageOrder[0] != "" {
		t.Fatalf("plain corpus PageOrder = %v", c.PageOrder)
	}
}

func TestGraphSearchAndSummary(t *testing.T) {
	pages := map[string]string{
		"https://docs.example/api":   "# API Reference\n\nThe RatelimitClient handles quotas.",
		"https://docs.example/guide": "# Guide\n\nSet up RatelimitClient for your project.",
	}
	c := BuildCorpus(pages)
	g := BuildGraph(c)

	sum := g.Summary()
	if sum["documents"] != 2 {
		t.Fatalf("documents = %v, want 2", sum["documents"])
	}
	if sum["chunks"].(int) < 2 {
		t.Fatalf("chunks = %v, want >= 2", sum["chunks"])
	}

	results := g.Search("ratelimitclient quota", 3)
	if len(results) == 0 {
		t.Fatal("Search returned no results")
	}
	top := results[0]
	if !strings.Contains(top["text"].(string), "RatelimitClient") {
		t.Fatalf("top result text = %q", top["text"])
	}

	docs := g.Find("", map[string]string{"type": "doc"})
	if len(docs) != 2 {
		t.Fatalf("Find(doc) = %d, want 2", len(docs))
	}

	n := g.Get("doc:0")
	if n == nil || n.Type != "doc" {
		t.Fatalf("Get(doc:0) = %v", n)
	}
	nb := g.Neighbors("doc:0", 1)
	if nb["nodes"] == nil {
		t.Fatal("Neighbors returned no nodes")
	}
}

// TestSandboxRoundTrip exercises the real sandbox subprocess end to end with a
// stub command handler: code blocks read P, chunk it, query G, and set answer.
func TestSandboxRoundTrip(t *testing.T) {
	dir := t.TempDir()
	corpusPath := filepath.Join(dir, "corpus.md")
	body := strings.Repeat("the quick brown fox jumps over lazy docs. ", 20)
	if err := os.WriteFile(corpusPath, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}

	handler := func(method string, args map[string]any) (any, error) {
		switch method {
		case "g_summary":
			return map[string]any{"chunks": 3}, nil
		case "llm_query":
			return "stub:" + args["prompt"].(string)[:16], nil
		default:
			return map[string]any{"method": method}, nil
		}
	}

	sb, err := NewSandbox("python3", corpusPath, 0, handler)
	if err != nil {
		t.Fatal(err)
	}
	defer sb.Close()

	code := `
n = len_p()
chunks = chunk_p(4000, 200)
summary = G.summary()
q = llm_query("summarize the corpus")
ans = "n=%d|chunks=%d|q=%s" % (n, len(chunks), q)
answer = ans
ready = True
`
	res, err := sb.Exec(context.Background(), 1, code)
	if err != nil {
		t.Fatal(err)
	}
	if !res.OK {
		t.Fatalf("exec not OK: %s", res.Output)
	}
	if !res.Ready {
		t.Fatalf("ready = false, output: %s", res.Output)
	}
	want := "n=" + itoa(len(body)) + "|chunks=1|q=stub:summarize the co"
	if res.Answer != want {
		t.Fatalf("answer = %q, want %q", res.Answer, want)
	}

	// Error path surfaces a Python traceback without killing the sandbox.
	errRes, err := sb.Exec(context.Background(), 2, "1/0")
	if err != nil {
		t.Fatal(err)
	}
	if errRes.OK {
		t.Fatalf("expected exec failure, got OK")
	}
	if !strings.Contains(errRes.Output, "ZeroDivisionError") {
		t.Fatalf("error output missing traceback: %s", errRes.Output)
	}

	// A later exec still works after the error.
	okRes, err := sb.Exec(context.Background(), 3, "answer = 'still alive'; ready = True")
	if err != nil {
		t.Fatal(err)
	}
	if !okRes.Ready || okRes.Answer != "still alive" {
		t.Fatalf("post-error exec = %+v", okRes)
	}
}

func TestSandboxExecTimeout(t *testing.T) {
	dir := t.TempDir()
	corpusPath := filepath.Join(dir, "corpus.md")
	if err := os.WriteFile(corpusPath, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	sb, err := NewSandbox("python3", corpusPath, 0, func(string, map[string]any) (any, error) {
		return "stub", nil
	})
	if err != nil {
		t.Fatal(err)
	}
	defer sb.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	_, err = sb.Exec(ctx, 1, "while True:\n    pass")
	if err == nil {
		t.Fatal("expected deadline error")
	}
	if !strings.Contains(err.Error(), "deadline") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestBudgetReservation(t *testing.T) {
	e := &Engine{cfg: Config{TokenBudget: 100}}
	if !e.reserve(40) {
		t.Fatal("reserve 40 should fit")
	}
	if !e.reserve(60) {
		t.Fatal("reserve 60 should exactly fit budget")
	}
	if e.reserve(1) {
		t.Fatal("reserve 1 past budget must be refused")
	}
}

func TestLoadAndSelectSkills(t *testing.T) {
	dir := t.TempDir()
	writeSkill := func(name, desc, body string) {
		path := filepath.Join(dir, name, "SKILL.md")
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		content := "---\nname: " + name + "\ndescription: " + desc + "\n---\n\n" + body
		if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	writeSkill("api-client", "Talks about RatelimitClient and API usage", "# Body\nRatelimitClient usage docs.")
	writeSkill("pdf-parser", "Parses PDF files", "# Body\nPDF parsing details.")
	writeSkill("database", "Schema and queries for databases", "# Body\nPostgres schema.")

	skills, err := LoadSkills(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(skills) != 3 {
		t.Fatalf("Loaded %d skills, want 3", len(skills))
	}
	if skills[0].Name != "api-client" {
		t.Fatalf("skills not sorted: first = %q", skills[0].Name)
	}

	selected := SelectSkills(skills, "RatelimitClient API quotas", 2)
	if len(selected) != 2 {
		t.Fatalf("Selected %d, want 2", len(selected))
	}
	if selected[0].Name != "api-client" {
		t.Fatalf("top selection = %q, want api-client", selected[0].Name)
	}
}

func TestSkillPlanIntegration(t *testing.T) {
	if os.Getenv("GEMINI_API_KEY") == "" && os.Getenv("GOOGLE_API_KEY") == "" {
		t.Skip("GEMINI_API_KEY not set")
	}
	dir := t.TempDir()
	writeSkill := func(name, desc, body string) {
		path := filepath.Join(dir, name, "SKILL.md")
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		content := "---\nname: " + name + "\ndescription: " + desc + "\n---\n\n" + body
		if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	writeSkill("api-client", "RatelimitClient API usage", "Apply the RatelimitClient conventions.")
	skills, err := LoadSkills(dir)
	if err != nil {
		t.Fatal(err)
	}
	selected := SelectSkills(skills, "RatelimitClient", 1)
	if len(selected) != 1 {
		t.Fatal("no skills selected")
	}
	apps, err := ApplySkills(context.Background(), selected, "Design the RatelimitClient API", "sequence", SkillPlanConfig{})
	if err != nil {
		t.Fatal(err)
	}
	if len(apps) != 1 || apps[0].Skill != "api-client" {
		t.Fatalf("apps = %+v", apps)
	}
	if apps[0].Output == "" {
		t.Fatal("empty skill application output")
	}
}

func TestEngineIntegration(t *testing.T) {
	if os.Getenv("GEMINI_API_KEY") == "" && os.Getenv("GOOGLE_API_KEY") == "" {
		t.Skip("GEMINI_API_KEY not set")
	}
	dir := t.TempDir()
	corpusPath := filepath.Join(dir, "corpus.md")
	body := "# RatelimitClient\n\nThe RatelimitClient enforces API quotas. Call reset() to clear counters.\n"
	if err := os.WriteFile(corpusPath, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
	engine, err := NewEngine(Config{MaxIterations: 4, Python: "python3"})
	if err != nil {
		t.Fatal(err)
	}
	res := engine.Run(context.Background(), corpusPath, "Summarize the RatelimitClient corpus in one sentence.")
	if !res.Success {
		t.Fatalf("engine run failed: %+v", res)
	}
	if res.Answer == "" {
		t.Fatal("empty answer")
	}
}
