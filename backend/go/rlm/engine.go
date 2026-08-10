package rlm

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"
)

// Config bounds one RLM engine run. Zero values fall back to the defaults,
// which mirror agent/rlm_engine.RLMEngine and the shared routing contract.
type Config struct {
	RootModel      string        // default gemini-2.5-flash
	SubModel       string        // default gemini-2.5-flash
	MaxIterations  int           // default 8
	TokenBudget    int           // default 500000 (approx chars/4)
	MaxWorkers     int           // default 5 (parallel depth-1 sub-calls)
	Python         string        // default python3 (sandbox interpreter)
	SubCallTimeout time.Duration // default 120s per Gemini request
}

// ReplHistoryEntry mirrors rlm_engine's repl_history records.
type ReplHistoryEntry struct {
	Iteration int    `json:"iteration"`
	Code      string `json:"code"`
	Output    string `json:"output"`
	Success   bool   `json:"success"`
}

// Engine is the RLM root controller: it owns the Gemini client, the corpus P
// and graph G, and the sandboxed REPL subprocess.
type Engine struct {
	cfg    Config
	root   *GeminiClient
	sub    *GeminiClient
	corpus *Corpus
	graph  *Graph

	mu          sync.Mutex
	tokensUsed  int
	subCalls    int
	replHistory []ReplHistoryEntry
}

// NewEngine builds an engine, resolving the API key up front (loud failure
// when GEMINI_API_KEY is missing).
func NewEngine(cfg Config) (*Engine, error) {
	if cfg.RootModel == "" {
		cfg.RootModel = "gemini-2.5-flash"
	}
	if cfg.SubModel == "" {
		cfg.SubModel = "gemini-2.5-flash"
	}
	if cfg.MaxIterations <= 0 {
		cfg.MaxIterations = 8
	}
	if cfg.TokenBudget <= 0 {
		cfg.TokenBudget = 500000
	}
	if cfg.MaxWorkers <= 0 {
		cfg.MaxWorkers = 5
	}
	if cfg.Python == "" {
		cfg.Python = "python3"
	}
	if cfg.SubCallTimeout <= 0 {
		cfg.SubCallTimeout = 120 * time.Second
	}
	root, err := NewGeminiClient(cfg.RootModel)
	if err != nil {
		return nil, err
	}
	sub, err := NewGeminiClient(cfg.SubModel)
	if err != nil {
		return nil, err
	}
	return &Engine{cfg: cfg, root: root, sub: sub}, nil
}

// Run executes the full RLM loop over the corpus file at corpusPath. It owns
// the sandbox lifecycle and kills the process tree when ctx is done.
func (e *Engine) Run(ctx context.Context, corpusPath, task string) Result {
	if e.corpus == nil {
		corpus, err := LoadCorpus(corpusPath)
		if err != nil {
			return Result{Error: err.Error()}
		}
		e.corpus = corpus
	}
	e.graph = BuildGraph(e.corpus)

	sandbox, err := NewSandbox(e.cfg.Python, corpusPath, 0, e.commandHandler)
	if err != nil {
		return Result{Error: "sandbox start failed: " + err.Error()}
	}
	defer sandbox.Close()

	// ── root loop (parity with RLMEngine.run) ──────────────────────────────
	systemPrompt := fmt.Sprintf("You are an RLM (Recursive Language Model) Root Orchestrator operating in a Python REPL.\n"+
		"\n"+
		"## Context Environment\n"+
		"- The entire input corpus (%d chars) is stored in variable 'P'.\n"+
		"- Do NOT try to view or print all of 'P' directly into your context window.\n"+
		"- Instead, write Python code to programmatically inspect, slice, regex search, partition, and delegate sub-tasks to sub-LLMs.\n"+
		"\n"+
		"## Available Helper APIs in REPL:\n"+
		"1. len_p() -> int: returns total character length of P.\n"+
		"2. peek(start=0, end=2000) -> str: returns substring slice of P.\n"+
		"3. search_regex(pattern, max_matches=20, context_chars=300) -> list[dict]: finds regex pattern matches in P with context snippets.\n"+
		"4. chunk_p(chunk_size=40000, overlap=2000) -> list[str]: partitions P into overlapping chunks.\n"+
		"5. llm_query(prompt, sub_model=None) -> str: calls a sub-LLM (Depth 1) on a specific prompt snippet.\n"+
		"6. llm_batch(prompts, sub_model=None, max_workers=5) -> list[str]: executes multiple sub-LLM calls in parallel across snippets.\n"+
		"7. combine_results(results, instruction) -> str: synthesizes list of sub-call findings into a consolidated summary.\n"+
		"8. G is the corpus as a knowledge graph (Doc -> Section -> Chunk, Chunk -MENTIONS-> Entity):\n"+
		"   G.summary(), G.search(query, k=5), G.get(node_id), G.neighbors(node_id, depth=1),\n"+
		"   G.subgraph(node_ids, depth=2), G.find(label='', type='', url='').\n"+
		"\n"+
		"## Rules:\n"+
		"1. Write Python code in fenced python blocks.\n"+
		"2. Your goal is to construct the final response for the user's task.\n"+
		"3. When you are ready with the final result, set 'answer' to your final output string and 'ready' to True in your Python code.\n"+
		"4. Always bound recursion: sub-calls are Depth 1. Do NOT spawn recursive sub-calls within sub-calls.\n",
		len(e.corpus.P))

	conversationHistory := fmt.Sprintf(
		"Task to solve:\n%s\n\nCorpus Length: %d chars.\n\nWrite your first Python code block to inspect or partition P and execute sub-calls.",
		task, len(e.corpus.P),
	)

	lastRootErr := ""
	for iteration := 1; iteration <= e.cfg.MaxIterations; iteration++ {
		if ctx.Err() != nil {
			break
		}
		rootResponse, err := e.root.Generate(ctx, conversationHistory, systemPrompt, 0.1)
		if err != nil {
			lastRootErr = err.Error()
			e.replHistory = append(e.replHistory, ReplHistoryEntry{
				Iteration: iteration,
				Output:    "[root model error] " + err.Error(),
				Success:   false,
			})
			continue
		}

		code := ExtractPythonCode(rootResponse)
		if code == "" {
			// No code block: treat the root response as the final answer.
			return Result{
				Success:       true,
				Answer:        strings.TrimSpace(rootResponse),
				Iterations:    iteration,
				TokensUsed:    e.tokensUsed,
				SubCallsCount: e.subCalls,
			}
		}

		res, err := sandbox.Exec(ctx, iteration, code)
		if err != nil {
			if ctx.Err() != nil {
				break
			}
			e.replHistory = append(e.replHistory, ReplHistoryEntry{
				Iteration: iteration,
				Code:      code,
				Output:    "[sandbox error] " + err.Error(),
				Success:   false,
			})
			continue
		}
		e.replHistory = append(e.replHistory, ReplHistoryEntry{
			Iteration: iteration,
			Code:      code,
			Output:    truncate(res.Output, 2000),
			Success:   res.OK,
		})

		if res.Ready || (res.Answer != nil && strings.TrimSpace(fmt.Sprint(res.Answer)) != "" &&
			fmt.Sprint(res.Answer) != "None") {
			return Result{
				Success:       true,
				Answer:        fmt.Sprint(res.Answer),
				Iterations:    iteration,
				TokensUsed:    e.tokensUsed,
				SubCallsCount: e.subCalls,
			}
		}

		conversationHistory += fmt.Sprintf(
			"\n\n--- Iteration %d Code Executed ---\nOutput:\n%s\n\nNext Step: Analyze output and continue or assign `answer = ...` and `ready = True`.",
			iteration, truncate(res.Output, 4000),
		)
	}

	// ── fallback auto-synthesis (parity with RLMEngine.run) ────────────────
	chunks := e.corpus.ChunkP(50000, 2000)
	if len(chunks) > 10 {
		chunks = chunks[:10] // bounded fallback batch, mirrors RLMREPL._fallback_answer
	}
	prompts := make([]string, 0, len(chunks))
	for i, c := range chunks {
		prompts = append(prompts, fmt.Sprintf(
			"Extract all key information, endpoints, rules, and details relevant to:\n%s\n\nContent Chunk (%d/%d):\n%s",
			task, i+1, len(chunks), c,
		))
	}
	subResults := e.subBatchRaw(prompts)
	final, _ := e.combineRaw(subResults, fmt.Sprintf("Synthesize all findings for the task: %s", task))
	if final == "" {
		final = "[fallback synthesis unavailable]"
	}
	if lastRootErr != "" {
		return Result{
			Success:       true,
			Answer:        final,
			Iterations:    e.cfg.MaxIterations,
			TokensUsed:    e.tokensUsed,
			SubCallsCount: e.subCalls,
			FallbackUsed:  true,
			Error:         "root model errors (" + lastRootErr + "); fallback used",
		}
	}
	return Result{
		Success:       true,
		Answer:        final,
		Iterations:    e.cfg.MaxIterations,
		TokensUsed:    e.tokensUsed,
		SubCallsCount: e.subCalls,
		FallbackUsed:  true,
	}
}

// commandHandler services sandbox requests. Sub-LLM calls run through the
// budget-aware depth-1 path; G calls read the in-engine knowledge graph.
func (e *Engine) commandHandler(method string, args map[string]any) (any, error) {
	switch method {
	case "llm_query":
		prompt, _ := args["prompt"].(string)
		model, _ := args["model"].(string)
		return e.subQuery(prompt, model)
	case "llm_batch":
		prompts := toStrings(args["prompts"])
		model, _ := args["model"].(string)
		return e.subBatch(prompts, model)
	case "combine_results":
		results := toStrings(args["results"])
		instruction, _ := args["instruction"].(string)
		return e.combineRaw(results, instruction)
	case "g_summary":
		return e.graph.Summary(), nil
	case "g_search":
		query, _ := args["query"].(string)
		return e.graph.Search(query, toInt(args["k"])), nil
	case "g_get":
		id, _ := args["node_id"].(string)
		n := e.graph.Get(id)
		if n == nil {
			return nil, fmt.Errorf("node %q not found", id)
		}
		return nodeJSON(n), nil
	case "g_neighbors":
		id, _ := args["node_id"].(string)
		return e.graph.Neighbors(id, toInt(args["depth"])), nil
	case "g_subgraph":
		return e.graph.Subgraph(toStrings(args["node_ids"]), toInt(args["depth"])), nil
	case "g_find":
		label, _ := args["label"].(string)
		props := map[string]string{}
		if t, _ := args["type"].(string); t != "" {
			props["type"] = t
		}
		if u, _ := args["url"].(string); u != "" {
			props["url"] = u
		}
		nodes := e.graph.Find(label, props)
		out := make([]map[string]any, 0, len(nodes))
		for _, n := range nodes {
			out = append(out, nodeJSON(n))
		}
		return out, nil
	}
	return nil, fmt.Errorf("unknown sandbox method %q", method)
}

// subQuery is one depth-1 sub-LLM call with budget enforcement.
func (e *Engine) subQuery(prompt, model string) (string, error) {
	if model == "" {
		model = e.cfg.SubModel
	}
	if !e.reserve(ApproxTokens(prompt) + 2000) {
		return "refused: token budget exceeded — call answer() directly.", nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), e.cfg.SubCallTimeout)
	defer cancel()
	out, err := e.sub.Generate(ctx, prompt, "", 0.2)
	e.charge(ApproxTokens(out))
	if err != nil {
		return fmt.Sprintf("Error calling Gemini model (sub): %v", err), nil
	}
	return out, nil
}

// subBatch runs N depth-1 sub-calls in parallel, preserving prompt order.
func (e *Engine) subBatch(prompts []string, model string) ([]any, error) {
	raw := e.subBatchRaw(prompts)
	out := make([]any, len(raw))
	for i, r := range raw {
		out[i] = r
	}
	return out, nil
}

// subBatchRaw is subBatch without the any-slice re-wrap, used by the fallback.
func (e *Engine) subBatchRaw(prompts []string) []string {
	results := make([]string, len(prompts))
	if len(prompts) == 0 {
		return results
	}
	workers := e.cfg.MaxWorkers
	if workers > len(prompts) {
		workers = len(prompts)
	}
	var wg sync.WaitGroup
	queue := make(chan int)
	for w := 0; w < workers; w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := range queue {
				results[i], _ = e.subQuery(prompts[i], e.cfg.SubModel)
			}
		}()
	}
	for i := range prompts {
		queue <- i
	}
	close(queue)
	wg.Wait()
	return results
}

func (e *Engine) combineRaw(results []string, instruction string) (string, error) {
	if len(results) == 0 {
		return "No results to combine", nil
	}
	joined := strings.Join(results, "\n\n--- ITEM ---\n\n")
	if len(joined) > 120000 {
		joined = joined[:120000]
	}
	prompt := instruction + "\n\nFindings:\n" + joined
	return e.subQuery(prompt, "")
}

// reserve checks and reserves estimated tokens; refusal is returned as a
// sub-call result string (parity with the depth guard, not an error).
func (e *Engine) reserve(est int) bool {
	e.mu.Lock()
	defer e.mu.Unlock()
	if e.tokensUsed+est > e.cfg.TokenBudget {
		return false
	}
	e.tokensUsed += est
	return true
}

func (e *Engine) charge(extra int) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.tokensUsed += extra
	e.subCalls++
}

// ExtractPythonCode pulls the first fenced ```python block (falling back to
// any fenced block), mirroring rlm_engine._extract_python_code. Empty means
// "the model answered directly".
func ExtractPythonCode(response string) string {
	if idx := strings.Index(response, "```python"); idx != -1 {
		openEnd := idx + 9
		if close := strings.Index(response[openEnd:], "```"); close != -1 {
			block := response[openEnd : openEnd+close]
			return strings.TrimSpace(block)
		}
	}
	if idx := strings.Index(response, "```"); idx != -1 {
		openEnd := idx + 3
		if close := strings.Index(response[openEnd:], "```"); close != -1 {
			block := response[openEnd : openEnd+close]
			block = strings.TrimPrefix(block, "python\n")
			block = strings.TrimPrefix(block, "python")
			return strings.TrimSpace(block)
		}
	}
	return ""
}

func toStrings(v any) []string {
	if v == nil {
		return nil
	}
	items, ok := v.([]any)
	if !ok {
		return nil
	}
	out := make([]string, 0, len(items))
	for _, item := range items {
		if s, ok := item.(string); ok {
			out = append(out, s)
		}
	}
	return out
}

func toInt(v any) int {
	switch n := v.(type) {
	case float64:
		return int(n)
	case int:
		return n
	}
	return 0
}
