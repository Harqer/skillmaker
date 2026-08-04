import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export interface SandboxLogLine {
	data: string;
	stream: "stdout" | "stderr";
	timestamp: number;
}

export interface SandboxFile {
	path: string;
	content: Uint8Array;
}

export interface SandboxCommandHandle {
	cmdId: string;
	startedAt: number;
	wait(): Promise<{
		stdout(): Promise<string>;
		stderr(): Promise<string>;
		exitCode: number;
	}>;
	logs(): AsyncIterable<SandboxLogLine>;
}

export interface CreateSandboxParams {
	timeout?: number;
	ports?: number[];
}

class LocalCommand implements SandboxCommandHandle {
	readonly cmdId: string;
	readonly startedAt: number;
	private process: ChildProcess | null;
	private logsList: SandboxLogLine[] = [];
	private waiters: Array<() => void> = [];
	private done = false;
	private exitResult: {
		stdout(): Promise<string>;
		stderr(): Promise<string>;
		exitCode: number;
	} = { stdout: () => Promise.resolve(""), stderr: () => Promise.resolve(""), exitCode: 0 };
	private exitPromise: Promise<{
		stdout(): Promise<string>;
		stderr(): Promise<string>;
		exitCode: number;
	}>;

	constructor(sandbox: LocalSandbox, command: string, args: string[]) {
		this.cmdId = randomUUID();
		this.startedAt = Date.now();

		this.process = spawn(command, args, {
			cwd: sandbox.rootDir,
			env: { ...process.env },
			shell: false,
		});

		this.exitPromise = new Promise((resolve) => {
			this.waiters.push(() => resolve(this.exitResult));
		});

		let stdout = "";
		let stderr = "";

		this.process.stdout?.on("data", (chunk: Buffer) => {
			const data = chunk.toString("utf8");
			stdout += data;
			this.appendLog({ data, stream: "stdout", timestamp: Date.now() });
		});

		this.process.stderr?.on("data", (chunk: Buffer) => {
			const data = chunk.toString("utf8");
			stderr += data;
			this.appendLog({ data, stream: "stderr", timestamp: Date.now() });
		});

		this.process.on("error", (error) => {
			const data = `${error.message}\n`;
			stderr += data;
			this.appendLog({ data, stream: "stderr", timestamp: Date.now() });
			this.finish(1, stdout, stderr);
		});

		this.process.on("close", (code) => {
			this.finish(code ?? 0, stdout, stderr);
		});
	}

	private appendLog(log: SandboxLogLine) {
		this.logsList.push(log);
		for (const waiter of this.waiters) {
			waiter();
		}
	}

	kill() {
		this.process?.kill();
	}

	private finish(exitCode: number, stdout: string, stderr: string) {
		if (this.done) {
			return;
		}
		this.done = true;
		this.exitResult = {
			stdout: () => Promise.resolve(stdout),
			stderr: () => Promise.resolve(stderr),
			exitCode,
		};
		for (const waiter of this.waiters) {
			waiter();
		}
	}

	wait() {
		return this.exitPromise;
	}

	async *logs(): AsyncIterable<SandboxLogLine> {
		let index = 0;
		while (true) {
			if (index < this.logsList.length) {
				yield this.logsList[index++];
			} else if (this.done) {
				return;
			} else {
				await new Promise<void>((resolve) => {
					this.waiters.push(resolve);
				});
			}
		}
	}
}

export class LocalSandbox {
	readonly sandboxId: string;
	readonly rootDir: string;
	readonly createdAt: number;
	private processes: Map<string, LocalCommand> = new Map();
	private stoppedFlag = false;
	private timeoutHandle: ReturnType<typeof setTimeout> | null = null;

	constructor(timeout?: number) {
		this.sandboxId = `sbx_${randomUUID().replaceAll("-", "").slice(0, 24)}`;
		this.createdAt = Date.now();
		this.rootDir = join(tmpdir(), this.sandboxId);
		if (typeof timeout === "number" && timeout > 0) {
			this.timeoutHandle = setTimeout(() => {
				this.stop();
			}, timeout);
		}
	}

	get stopped() {
		return this.stoppedFlag;
	}

	async init() {
		await mkdir(this.rootDir, { recursive: true });
	}

	domain(port: number): string {
		return `http://localhost:${port}`;
	}

	async writeFiles(files: SandboxFile[]) {
		if (this.stoppedFlag) {
			throw new Error("sandbox_stopped: The sandbox has already been stopped.");
		}
		for (const file of files) {
			const target = join(this.rootDir, file.path);
			await mkdir(dirname(target), { recursive: true });
			await writeFile(target, Buffer.from(file.content));
		}
	}

	async readFile({ path }: { path: string }): Promise<AsyncIterable<Uint8Array> | null> {
		try {
			const data = await readFile(join(this.rootDir, path));
			return (async function* () {
				yield new Uint8Array(data);
			})();
		} catch (error) {
			const code = (error as NodeJS.ErrnoException).code;
			if (code === "ENOENT" || code === "ENOTDIR") {
				return null;
			}
			throw error;
		}
	}

	runCommand(options: {
		cmd: string;
		args: string[];
		sudo?: boolean;
		detached?: boolean;
	}): SandboxCommandHandle {
		if (this.stoppedFlag) {
			throw new Error("sandbox_stopped: The sandbox has already been stopped.");
		}
		const command = new LocalCommand(this, options.cmd, options.args);
		this.processes.set(command.cmdId, command);
		return command;
	}

	getCommand(cmdId: string): SandboxCommandHandle {
		const command = this.processes.get(cmdId);
		if (!command) {
			throw new Error(`Command not found: ${cmdId}`);
		}
		return command;
	}

	stop() {
		if (this.stoppedFlag) {
			return;
		}
		this.stoppedFlag = true;
		if (this.timeoutHandle) {
			clearTimeout(this.timeoutHandle);
			this.timeoutHandle = null;
		}
		for (const command of this.processes.values()) {
			command.kill();
		}
	}
}

class WorkspaceManager {
	private static instance_: WorkspaceManager | null = null;
	private sandboxes: Map<string, LocalSandbox> = new Map();

	static get instance(): WorkspaceManager {
		if (!WorkspaceManager.instance_) {
			WorkspaceManager.instance_ = new WorkspaceManager();
		}
		return WorkspaceManager.instance_;
	}

	async create(params: CreateSandboxParams = {}): Promise<LocalSandbox> {
		const sandbox = new LocalSandbox(params.timeout);
		await sandbox.init();
		this.sandboxes.set(sandbox.sandboxId, sandbox);
		return sandbox;
	}

	get(sandboxId: string): LocalSandbox {
		const sandbox = this.sandboxes.get(sandboxId);
		if (!sandbox) {
			throw new Error(`Sandbox not found: ${sandboxId}`);
		}
		return sandbox;
	}
}

export const Sandbox = {
	create(params: CreateSandboxParams = {}): Promise<LocalSandbox> {
		return WorkspaceManager.instance.create(params);
	},
	get({ sandboxId }: { sandboxId: string }): LocalSandbox {
		return WorkspaceManager.instance.get(sandboxId);
	},
};
