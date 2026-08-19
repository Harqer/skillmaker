import { setTimeout as delay } from "node:timers/promises";
import type {
  AdapterContext,
  CommandRequest,
  ComputerActionRequest,
  ComputerFileEntry,
  ComputerInput,
  ComputerObservation,
  ComputerRef,
  ControlLeaseRef,
  PortableFile,
  ProcessEvent,
  SandboxProvider,
  ScreenRequest,
  ScreenSession,
  SnapshotRef,
} from "@rakazo/adapter-kit";
import { boundedSandboxCommandTimeoutMs } from "@rakazo/core";
import {
  boundedComputerActions,
  clampRounded,
  computerObservation,
  normalizeWorkspacePath,
  shellQuote,
  workspacePath,
} from "./computer-support.js";

const EVE_WORKSPACE = "/home/user/rakazo-home";

export interface EveSession {
  sessionId: string;
  createdAt: number;
}

export interface EveApiConfig {
  apiUrl: string;
  token?: string;
}

export class EveSandboxProvider implements SandboxProvider {
  private readonly sessions = new Map<string, EveSession>();
  private readonly lastTouchedAt = new Map<string, number>();

  constructor(
    private readonly config: EveApiConfig,
  ) {}

  describe() {
    return {
      id: "eve",
      contractVersion: "1",
      adapterVersion: "0.1.0",
      capabilities: {
        graphical: true,
        pty: true,
        snapshots: true,
        takeover: true,
        persistentHome: true,
        multiScreen: false,
      },
    };
  }

  private url(path: string) {
    return `${this.config.apiUrl.replace(/\/$/, "")}${path}`;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (this.config.token) h["Authorization"] = `Bearer ${this.config.token}`;
    return h;
  }

  private async getSession(computer: ComputerRef): Promise<EveSession> {
    const id = computer.providerRef || computer.id;
    const existing = this.sessions.get(id);
    if (existing) {
      this.lastTouchedAt.set(id, Date.now());
      return existing;
    }
    const res = await fetch(this.url("/eve/v1/session"), {
      method: "POST",
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`EVE session create failed: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as { sessionId: string };
    const session: EveSession = { sessionId: data.sessionId, createdAt: Date.now() };
    this.sessions.set(id, session);
    this.lastTouchedAt.set(id, Date.now());
    return session;
  }

  private async sendCommand(sessionId: string, message: string, signal?: AbortSignal): Promise<{
    status: string;
    outcome?: { message: string };
    error?: string;
  }> {
    const res = await fetch(this.url(`/eve/v1/session/${sessionId}`), {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ message }),
      signal,
    });
    if (!res.ok) throw new Error(`EVE command failed: ${res.status} ${await res.text()}`);
    return res.json() as Promise<{ status: string; outcome?: { message: string }; error?: string }>;
  }

  async provision(
    request: { botId: string; homePath: string; providerRef?: string; providerKind?: ComputerRef["kind"] },
    _context: AdapterContext,
  ): Promise<ComputerRef> {
    if (request.providerRef && request.providerKind === "eve") {
      const existing = this.sessions.get(request.providerRef);
      if (existing) {
        this.lastTouchedAt.set(request.providerRef, Date.now());
        return {
          id: request.providerRef,
          botId: request.botId,
          kind: "eve",
          providerRef: request.providerRef,
          fresh: false,
        };
      }
    }
    const session = await this.getSession({ id: "", botId: request.botId, kind: "eve", providerRef: "" });
    return {
      id: session.sessionId,
      botId: request.botId,
      kind: "eve",
      providerRef: session.sessionId,
      fresh: true,
    };
  }

  async prepare(computer: ComputerRef, _context: AdapterContext): Promise<void> {
    const session = await this.getSession(computer);
    await this.sendCommand(session.sessionId, `mkdir -p ${EVE_WORKSPACE}`);
  }

  async *execute(
    computer: ComputerRef,
    request: CommandRequest,
    context: AdapterContext,
  ): AsyncIterable<ProcessEvent> {
    const session = await this.getSession(computer);
    const cmd = request.argv.map(shellQuote).join(" ");
    const timeoutMs = boundedSandboxCommandTimeoutMs(request.timeoutMs);

    const timeout = delay(timeoutMs, undefined, { ref: false }).then(() => {
      throw new Error(`command timed out after ${timeoutMs} ms`);
    });

    try {
      const result = await Promise.race([
        this.sendCommand(session.sessionId, `cd ${EVE_WORKSPACE} && ${cmd}`, context.signal),
        timeout,
      ]);

      if (result.outcome?.message) yield { type: "stdout", data: result.outcome.message };
      if (result.error) yield { type: "stderr", data: result.error };
      yield { type: "exit", code: result.status === "completed" ? 0 : 1 };
    } catch (error) {
      if (error instanceof Error && /timed out/.test(error.message)) {
        yield { type: "stderr", data: error.message + "\n" };
        yield { type: "exit", code: 124 };
        return;
      }
      throw error;
    }
  }

  async connectScreen(
    computer: ComputerRef,
    _request: ScreenRequest,
    _context: AdapterContext,
  ): Promise<ScreenSession> {
    const session = await this.getSession(computer);
    const result = await this.sendCommand(session.sessionId, "eve screenshot --url-only").catch(() => null);
    const url = result?.outcome?.message?.trim() || null;
    return {
      url,
      mimeType: "text/html",
      close: async () => undefined,
    };
  }

  async sendInput(
    computer: ComputerRef,
    input: ComputerInput,
    _lease: ControlLeaseRef,
    context: AdapterContext,
  ): Promise<void> {
    const session = await this.getSession(computer);
    if (input.kind === "key") {
      const mods = input.modifiers?.length ? input.modifiers.join("+") + "+" : "";
      await this.sendCommand(session.sessionId, `eve input key ${mods}${input.key}`, context.signal);
    } else if (input.kind === "pointer") {
      await this.sendCommand(
        session.sessionId,
        `eve input mouse ${input.type} ${input.x} ${input.y} ${input.button ?? "left"}`,
        context.signal,
      );
    } else if (input.kind === "clipboard") {
      await this.sendCommand(session.sessionId, `eve input clipboard ${shellQuote(input.text)}`, context.signal);
    }
  }

  async observe(computer: ComputerRef, context: AdapterContext): Promise<ComputerObservation> {
    const session = await this.getSession(computer);
    const result = await this.sendCommand(session.sessionId, "eve screenshot --base64", context.signal);
    const b64 = result.outcome?.message?.trim() || "";
    const image = Uint8Array.from(Buffer.from(b64, "base64"));
    return computerObservation(image, {
      mimeType: "image/png",
      width: 1280,
      height: 800,
    });
  }

  async act(computer: ComputerRef, request: ComputerActionRequest, context: AdapterContext) {
    const session = await this.getSession(computer);
    const actions = boundedComputerActions(request.actions);
    let completed = 0;

    for (const action of actions) {
      if (context.signal.aborted) throw context.signal.reason ?? new Error("computer action aborted");

      if (action.kind === "key") {
        const mods = action.modifiers?.length ? action.modifiers.join("+") + "+" : "";
        await this.sendCommand(session.sessionId, `eve input key ${mods}${action.key}`, context.signal);
      } else if (action.kind === "pointer") {
        await this.sendCommand(
          session.sessionId,
          `eve input mouse ${action.type} ${action.x} ${action.y} ${action.button ?? "left"}`,
          context.signal,
        );
      } else if (action.kind === "clipboard") {
        await this.sendCommand(session.sessionId, `eve input clipboard ${shellQuote(action.text)}`, context.signal);
      } else if (action.kind === "scroll") {
        await this.sendCommand(
          session.sessionId,
          `eve input scroll ${action.direction} ${clampRounded(action.amount ?? 3, 1, 20)}`,
          context.signal,
        );
      } else if (action.kind === "wait") {
        await delay(clampRounded(action.ms, 0, 5_000));
      } else if (action.kind === "open") {
        const target = /^https?:\/\//i.test(action.path)
          ? action.path
          : workspacePath(EVE_WORKSPACE, action.path);
        await this.sendCommand(session.sessionId, `eve open ${shellQuote(target)}`, context.signal);
      } else if (action.kind === "launch") {
        await this.sendCommand(
          session.sessionId,
          `eve launch ${shellQuote(action.application)}${action.uri ? ` ${shellQuote(action.uri)}` : ""}`,
          context.signal,
        );
      }
      completed += 1;
    }

    if (request.settleMs) await delay(clampRounded(request.settleMs, 0, 5_000));
    return {
      completed,
      ...(request.observe === false ? {} : { observation: await this.observe(computer, context) }),
    };
  }

  async listFiles(
    computer: ComputerRef,
    directory: string,
    context: AdapterContext,
  ): Promise<ComputerFileEntry[]> {
    const session = await this.getSession(computer);
    const relative = normalizeWorkspacePath(directory);
    const target = workspacePath(EVE_WORKSPACE, relative);
    const result = await this.sendCommand(session.sessionId, `ls -la ${target}`, context.signal);
    const output = result.outcome?.message || "";
    return output
      .split("\n")
      .filter((line) => line && !line.startsWith("total"))
      .map((line) => {
        const parts = line.split(/\s+/);
        const name = parts[8];
        if (!name || name === "." || name === "..") return null;
        const isDir = parts[0]?.startsWith("d");
        const size = parseInt(parts[4] || "0", 10);
        const isExec = parts[0]?.includes("x");
        return {
          path: normalizeWorkspacePath(relative ? `${relative}/${name}` : name),
          kind: isDir ? "dir" : "file",
          size: isNaN(size) ? 0 : size,
          ...(isExec ? { executable: true } : {}),
        } as ComputerFileEntry;
      })
      .filter((e): e is ComputerFileEntry => e !== null);
  }

  async readFile(
    computer: ComputerRef,
    filePath: string,
    context: AdapterContext,
    options?: { maxBytes?: number },
  ): Promise<Uint8Array> {
    const session = await this.getSession(computer);
    const target = workspacePath(EVE_WORKSPACE, filePath);
    const result = await this.sendCommand(
      session.sessionId,
      `base64 ${target}`,
      context.signal,
    );
    const b64 = result.outcome?.message?.trim() || "";
    const bytes = Uint8Array.from(Buffer.from(b64, "base64"));
    if (options?.maxBytes !== undefined && bytes.byteLength > options.maxBytes) {
      throw new Error(`computer file exceeds ${options.maxBytes} bytes`);
    }
    return bytes;
  }

  async writeFile(computer: ComputerRef, file: PortableFile, context: AdapterContext): Promise<void> {
    const session = await this.getSession(computer);
    const target = workspacePath(EVE_WORKSPACE, file.path);
    const b64 = Buffer.from(file.content).toString("base64");
    await this.sendCommand(session.sessionId, `echo ${shellQuote(b64)} | base64 -d > ${target}`, context.signal);
    if (file.executable) {
      await this.sendCommand(session.sessionId, `chmod +x ${target}`, context.signal);
    }
  }

  async *exportWorkspace(
    computer: ComputerRef,
    context: AdapterContext,
  ): AsyncIterable<PortableFile> {
    yield* walkEveWorkspace(this, computer, "", context);
  }

  async importWorkspace(
    computer: ComputerRef,
    files: AsyncIterable<PortableFile>,
    context: AdapterContext,
  ): Promise<void> {
    for await (const file of files) {
      await this.writeFile(computer, file, context);
    }
  }

  async snapshot(computer: ComputerRef, context: AdapterContext): Promise<SnapshotRef> {
    const observation = await this.observe(computer, context);
    return { id: observation.frameId, createdAt: observation.capturedAt };
  }

  async keepAlive(computer: ComputerRef): Promise<void> {
    const id = computer.providerRef || computer.id;
    this.lastTouchedAt.set(id, Date.now());
  }

  async stop(computer: ComputerRef, _context: AdapterContext): Promise<void> {
    const id = computer.providerRef || computer.id;
    const session = this.sessions.get(id);
    this.sessions.delete(id);
    this.lastTouchedAt.delete(id);
    if (session) {
      await fetch(this.url(`/eve/v1/session/${session.sessionId}`), {
        method: "DELETE",
        headers: this.headers(),
      }).catch(() => undefined);
    }
  }

  async destroy(computer: ComputerRef, context: AdapterContext): Promise<void> {
    await this.stop(computer, context);
  }
}

async function* walkEveWorkspace(
  provider: EveSandboxProvider,
  computer: ComputerRef,
  directory: string,
  context: AdapterContext,
): AsyncIterable<PortableFile> {
  const entries = await provider.listFiles(computer, directory, context);
  for (const entry of entries) {
    if (entry.kind === "dir") {
      yield* walkEveWorkspace(provider, computer, entry.path, context);
    } else {
      const content = await provider.readFile(computer, entry.path, context);
      yield { path: entry.path, content, executable: entry.executable };
    }
  }
}
