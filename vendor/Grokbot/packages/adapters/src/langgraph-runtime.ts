import type {
  AdapterContext,
  AgentRunRequest,
  AgentRuntime,
  AgentRuntimeEvent,
} from "@rakazo/adapter-kit";

export interface LangGraphRuntimeOptions {
  /** URL of the Python LangGraph orchestrator service. */
  serviceUrl: string;
  /** Optional bearer token for authenticating with the LangGraph service. */
  token?: string;
  /** Default timeout per request in ms (default 300000 — 5 min). */
  timeoutMs?: number;
}

const running = new Map<string, AbortController>();

export class LangGraphRuntime implements AgentRuntime {
  private readonly serviceUrl: string;
  private readonly token?: string;
  private readonly timeoutMs: number;

  constructor(opts: LangGraphRuntimeOptions) {
    this.serviceUrl = opts.serviceUrl.replace(/\/+$/, "");
    this.token = opts.token;
    this.timeoutMs = opts.timeoutMs ?? 300_000;
  }

  describe() {
    return {
      id: "langgraph",
      contractVersion: "1",
      adapterVersion: "0.1.0",
      capabilities: { streaming: true, compaction: false, tools: true, scripted: false },
    };
  }

  async abort(runId: string): Promise<void> {
    running.get(runId)?.abort();
  }

  async *run(request: AgentRunRequest, context: AdapterContext): AsyncIterable<AgentRuntimeEvent> {
    const controller = new AbortController();
    running.set(request.runId, controller);
    const signal = context.signal ?? controller.signal;

    const queue = createQueue();

    const work = (async () => {
      try {
        queue.push({ type: "progress", text: "connecting to orchestrator…" });

        // 1. Create a LangGraph session
        const sessionId = await this.createSession(request, signal);
        if (signal.aborted) {
          queue.push({ type: "done", text: "stopped" });
          return;
        }

        queue.push({ type: "progress", text: "working…" });

        // 2. Send the user prompt and stream the response
        await this.streamResponse(sessionId, request, signal, queue);
      } catch (error) {
        const message = sanitizeError(error instanceof Error ? error.message : String(error));
        if (signal.aborted) {
          queue.push({ type: "done", text: "stopped" });
        } else {
          queue.push({ type: "text", text: `I hit a problem: ${message}` });
          queue.push({ type: "done", text: message });
        }
      } finally {
        queue.close();
      }
    })();

    try {
      yield* queue.iterate();
      await work;
    } finally {
      running.delete(request.runId);
    }
  }

  // ── HTTP helpers ────────────────────────────────────────────────────────

  private headers(): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (this.token) h["Authorization"] = `Bearer ${this.token}`;
    return h;
  }

  private async createSession(
    request: AgentRunRequest,
    signal: AbortSignal,
  ): Promise<string> {
    const body = {
      task: request.prompt,
      botId: request.botId,
      threadId: request.threadId,
      runId: request.runId,
      instructions: request.instructions,
      history: request.history,
      model: request.model,
      tools: request.tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })),
    };

    const res = await fetch(`${this.serviceUrl}/eve/v1/session`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
      signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`LangGraph session creation failed (${res.status}): ${text}`);
    }

    const data = (await res.json()) as { sessionId?: string; session_id?: string };
    return data.sessionId ?? data.session_id ?? "";
  }

  private async streamResponse(
    sessionId: string,
    request: AgentRunRequest,
    signal: AbortSignal,
    queue: ReturnType<typeof createQueue>,
  ): Promise<void> {
    // Send the prompt message and stream SSE events back
    const body = { message: request.prompt };

    const res = await fetch(`${this.serviceUrl}/eve/v1/session/${sessionId}`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
      signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`LangGraph message failed (${res.status}): ${text}`);
    }

    const contentType = res.headers.get("content-type") ?? "";

    if (contentType.includes("text/event-stream")) {
      // SSE stream — parse events
      await this.processSSEStream(res, queue, signal);
    } else {
      // JSON response — single result
      const data = (await res.json()) as {
        status?: string;
        outcome?: string;
        error?: string;
        text?: string;
        events?: Array<{ type: string; data: Record<string, unknown> }>;
      };

      if (data.error) {
        queue.push({ type: "text", text: data.error });
      } else if (data.outcome) {
        queue.push({ type: "text", text: data.outcome });
      } else if (data.text) {
        queue.push({ type: "text", text: data.text });
      }

      // Process any embedded events
      if (data.events) {
        for (const event of data.events) {
          this.mapEvent(event, queue);
        }
      }
    }

    queue.push({ type: "done", text: "completed" });
  }

  private async processSSEStream(
    res: Response,
    queue: ReturnType<typeof createQueue>,
    signal: AbortSignal,
  ): Promise<void> {
    const reader = res.body?.getReader();
    if (!reader) throw new Error("No response body for SSE stream");

    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (!signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const jsonStr = line.slice(6).trim();
            if (!jsonStr || jsonStr === "[DONE]") continue;

            try {
              const event = JSON.parse(jsonStr) as { type: string; data: Record<string, unknown> };
              this.mapEvent(event, queue);
            } catch {
              // Non-JSON data line — treat as text
              queue.push({ type: "text", text: jsonStr });
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private mapEvent(
    event: { type: string; data: Record<string, unknown> },
    queue: ReturnType<typeof createQueue>,
  ): void {
    switch (event.type) {
      case "text":
      case "text_delta": {
        const text = (event.data.text ?? event.data.delta ?? "") as string;
        if (text) queue.push({ type: "text", text });
        break;
      }
      case "tool_call":
      case "tool": {
        const name = (event.data.name ?? "") as string;
        const args = (event.data.arguments ?? event.data.args ?? {}) as Record<string, unknown>;
        const executionId = (event.data.executionId ?? event.data.execution_id ?? "") as string;
        if (name) queue.push({ type: "tool", name, args, executionId });
        break;
      }
      case "usage": {
        queue.push({
          type: "usage",
          inputTokens: (event.data.inputTokens ?? 0) as number,
          outputTokens: (event.data.outputTokens ?? 0) as number,
          provider: (event.data.provider ?? "langgraph") as string,
          model: (event.data.model ?? "") as string,
        });
        break;
      }
      case "checkpoint": {
        const blob = (event.data.blob ?? "") as string;
        if (blob) queue.push({ type: "checkpoint", blob });
        break;
      }
      case "progress": {
        const text = (event.data.text ?? "") as string;
        if (text) queue.push({ type: "progress", text });
        break;
      }
      case "error": {
        const text = (event.data.message ?? event.data.text ?? "") as string;
        if (text) queue.push({ type: "text", text: `Error: ${text}` });
        break;
      }
      case "done":
      case "end": {
        // handled by the stream terminator
        break;
      }
    }
  }
}

// ── Queue (identical to pi-runtime) ──────────────────────────────────────

function sanitizeError(message: string) {
  return message
    .replace(/sk-or-v1-[a-zA-Z0-9]+/g, "[redacted]")
    .replace(/sk-[a-zA-Z0-9-]+/g, "[redacted]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, "[redacted]");
}

interface EventQueue {
  push(event: AgentRuntimeEvent): void;
  close(): void;
  iterate(): AsyncIterable<AgentRuntimeEvent>;
}

function createQueue(): EventQueue {
  const items: AgentRuntimeEvent[] = [];
  let wake: (() => void) | undefined;
  let closed = false;
  return {
    push(event) {
      items.push(event);
      wake?.();
    },
    close() {
      closed = true;
      wake?.();
    },
    async *iterate() {
      while (!closed || items.length) {
        if (items.length) {
          yield items.shift()!;
          continue;
        }
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
      }
    },
  };
}
