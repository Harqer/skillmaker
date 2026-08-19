/**
 * RLM (Recursive Language Model) session manager.
 *
 * Manages per-thread RLM sessions: corpus (P), knowledge graph (G), and
 * sandboxed REPL evaluation.  Each thread gets its own isolated session so
 * concurrent conversations don't interfere.
 *
 * The actual Python REPL runs in a child process via `raven agent --corpus`.
 * This module manages the lifecycle and provides a typed interface for the
 * executor's tool dispatch.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface RlmSession {
  sessionId: string;
  threadId: string;
  corpusPath: string;
  createdAt: number;
  lastAccessedAt: number;
  /** Map of P.search / G.search results cached in-process */
  corpusSize: number;
}

export interface RlmReplResult {
  ok: boolean;
  result?: string;
  error?: string;
  timedOut?: boolean;
}

export interface RlmLoadResult {
  ok: boolean;
  sessionId?: string;
  corpusSize?: number;
  pageCount?: number;
  error?: string;
}

// ── Session store ────────────────────────────────────────────────────────

const sessions = new Map<string, RlmSession>();
const MAX_SESSIONS = 50;
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 min

function sessionKey(threadId: string): string {
  return threadId;
}

function evictStale(): void {
  const now = Date.now();
  for (const [key, session] of sessions) {
    if (now - session.lastAccessedAt > SESSION_TTL_MS) {
      sessions.delete(key);
      void unlink(session.corpusPath).catch(() => undefined);
    }
  }
}

function ensureCapacity(): void {
  evictStale();
  if (sessions.size >= MAX_SESSIONS) {
    // evict oldest
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [key, session] of sessions) {
      if (session.lastAccessedAt < oldestTime) {
        oldestTime = session.lastAccessedAt;
        oldestKey = key;
      }
    }
    if (oldestKey) {
      const removed = sessions.get(oldestKey)!;
      sessions.delete(oldestKey);
      void unlink(removed.corpusPath).catch(() => undefined);
    }
  }
}

// ── Corpus loading ───────────────────────────────────────────────────────

export async function loadCorpus(
  threadId: string,
  corpus: Record<string, string> | undefined,
  markdown: string | undefined,
  targetUrl: string | undefined,
): Promise<RlmLoadResult> {
  evictStale();

  const existing = sessions.get(sessionKey(threadId));
  if (existing) {
    // Reuse existing session — caller can just update the corpus
    void unlink(existing.corpusPath).catch(() => undefined);
  }

  let payload: string;
  let suffix: string;
  let pageCount: number;

  if (corpus && Object.keys(corpus).length > 0) {
    payload = JSON.stringify(corpus);
    suffix = ".json";
    pageCount = Object.keys(corpus).length;
  } else if (markdown) {
    payload = markdown;
    suffix = ".md";
    pageCount = 1;
  } else {
    return { ok: false, error: "provide either corpus (object) or markdown (string)" };
  }

  // Cap at 4MB to prevent unbounded memory
  if (payload.length > 4_000_000) {
    payload = payload.slice(0, 4_000_000);
  }

  ensureCapacity();

  const sessionId = `rlm-${threadId}-${Date.now()}`;
  const corpusPath = join(tmpdir(), `${sessionId}${suffix}`);
  await writeFile(corpusPath, payload, "utf-8");

  const session: RlmSession = {
    sessionId,
    threadId,
    corpusPath,
    createdAt: Date.now(),
    lastAccessedAt: Date.now(),
    corpusSize: payload.length,
  };
  sessions.set(sessionKey(threadId), session);

  return {
    ok: true,
    sessionId,
    corpusSize: payload.length,
    pageCount,
  };
}

// ── REPL evaluation ──────────────────────────────────────────────────────

const RLM_TIMEOUT_MS = 60_000;

export async function evaluateRepl(
  threadId: string,
  expression: string,
): Promise<RlmReplResult> {
  const session = sessions.get(sessionKey(threadId));
  if (!session) {
    return { ok: false, error: "no RLM corpus loaded for this thread — call rlm_load_corpus first" };
  }
  session.lastAccessedAt = Date.now();

  // Validate expression — only allow safe operations
  const rejected = validateExpression(expression);
  if (rejected) {
    return { ok: false, error: rejected };
  }

  try {
    const result = await runRavenRepl(session, expression);
    return { ok: true, result };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("timeout") || msg.includes("TIMEOUT")) {
      return { ok: false, timedOut: true, error: `RLM expression timed out after ${RLM_TIMEOUT_MS}ms` };
    }
    return { ok: false, error: msg };
  }
}

// ── Expression validation ────────────────────────────────────────────────

const BLOCKED_PATTERNS = [
  /\bimport\b/,
  /\bexec\b/,
  /\beval\b/,
  /\bcompile\b/,
  /\b__\w+__\b/,
  /\bos\./,
  /\bsys\./,
  /\bsubprocess\b/,
  /\bopen\b\s*\(/,
  /\bwrite\b\s*\(/,
  /\bdelete\b/,
  /\bunlink\b/,
  /\brmdir\b/,
  /\bchmod\b/,
];

function validateExpression(expr: string): string | null {
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(expr)) {
      return `expression contains blocked pattern: ${pattern.source}`;
    }
  }
  return null;
}

// ── Raven subprocess ─────────────────────────────────────────────────────

async function runRavenRepl(session: RlmSession, expression: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const python = process.env.PYTHON ?? "python3";
    const args = [
      "-m", "raven", "agent",
      "-m", `Evaluate this RLM expression and return the result: ${expression}`,
      "--corpus", session.corpusPath,
      "--json",
    ];

    const child = spawn(python, args, {
      env: {
        ...process.env,
        PYTHONUNBUFFERED: "1",
        RAVEN_SKILL_MODE: "1",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let killed = false;

    const timer = setTimeout(() => {
      killed = true;
      child.kill("SIGKILL");
    }, RLM_TIMEOUT_MS);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (killed) {
        reject(new Error("timeout"));
        return;
      }
      if (code !== 0) {
        reject(new Error(`raven exited ${code}: ${stderr.slice(0, 500)}`));
        return;
      }
      // Try to extract the result from JSON output
      const extracted = extractResult(stdout);
      resolve(extracted || stdout.slice(0, 2000));
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function extractResult(output: string): string {
  // Look for JSON result in output
  const jsonMatch = output.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
      if (typeof parsed.result === "string") return parsed.result;
      if (typeof parsed.outcome === "string") return parsed.outcome;
      if (typeof parsed.text === "string") return parsed.text;
    } catch {
      // not JSON, return raw
    }
  }
  // Return last non-empty line as the result
  const lines = output.split("\n").filter((l) => l.trim());
  return lines.at(-1) ?? output.slice(0, 2000);
}

// ── Cleanup ──────────────────────────────────────────────────────────────

export function destroySession(threadId: string): void {
  const session = sessions.get(sessionKey(threadId));
  if (session) {
    sessions.delete(sessionKey(threadId));
    void unlink(session.corpusPath).catch(() => undefined);
  }
}

export function getSession(threadId: string): RlmSession | undefined {
  evictStale();
  return sessions.get(sessionKey(threadId));
}
