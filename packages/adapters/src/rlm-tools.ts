import type { ConnectorTool } from "@rakazo/adapter-kit";

/**
 * RLM (Recursive Language Model) tool definitions.
 *
 * The `rlm_repl` tool evaluates sandboxed Python expressions against a loaded
 * documentation corpus (variable P) and knowledge graph (variable G).  The
 * actual REPL runs server-side — this module only defines the tool schemas
 * that the LLM sees.  Execution is handled by `executeRlmTool()` in the
 * executor.
 */

export const RLM_REPL_TOOL: ConnectorTool = {
  name: "rlm_repl",
  description:
    "Evaluate a sandboxed Python expression against the loaded documentation corpus (P) and knowledge graph (G). " +
    "Use P.search('regex') for targeted snippets, G.search('query', n) for ranked chunks, " +
    "llm_batch([...]) for parallel sub-queries, recurse('question', [node_ids]) for scoped synthesis, " +
    "and answer(text, evidence=[...]) to finalize. " +
    "P and G must be loaded first via rlm_load_corpus before calling this tool.",
  inputSchema: {
    type: "object",
    properties: {
      expression: {
        type: "string",
        description:
          "A Python expression to evaluate. Allowed: P, G, len, llm_batch(), recurse(), answer(). " +
          "Examples: P.search('API endpoint'), G.search('auth', 5), llm_batch(['q1', 'q2'])",
      },
    },
    required: ["expression"],
  },
};

export const RLM_LOAD_CORPUS_TOOL: ConnectorTool = {
  name: "rlm_load_corpus",
  description:
    "Load a documentation corpus into the RLM system. Must be called before rlm_repl. " +
    "Accepts a JSON object mapping URLs to markdown content, or a plain-text markdown string.",
  inputSchema: {
    type: "object",
    properties: {
      corpus: {
        type: "object",
        description: 'JSON object mapping URLs to markdown content, e.g. {"https://docs.example.com/page": "# Page\\n..."}',
        additionalProperties: { type: "string" },
      },
      markdown: {
        type: "string",
        description: "Plain-text markdown corpus (used when corpus object is not provided).",
      },
      target_url: {
        type: "string",
        description: "The primary documentation URL this corpus was scraped from.",
      },
    },
    required: [],
  },
};

export const RLM_TOOLS: ConnectorTool[] = [RLM_LOAD_CORPUS_TOOL, RLM_REPL_TOOL];
