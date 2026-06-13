/**
 * Generic MCP stdio client.
 *
 * Spawns an MCP server as a child process, performs the initialize
 * handshake, fetches the tool list, and forwards `tools/call` requests
 * over newline-delimited JSON-RPC 2.0.
 *
 * Promoted from `core/extensions/built-in/context-mode/mcp-client.ts`
 * (originally ~300 lines, hard-coded for the context-mode server). This
 * version is parameterized by:
 *   - `command` + `args` (default: `process.execPath` + a single server
 *     bundle path, for backward compat with the context-mode case)
 *   - `serverLabel` (default: "mcp-server") — used in error messages
 *     and the stderr tag, so the same client can drive context-mode,
 *     context7, or any future stdio MCP server
 *
 * Used by:
 *   - `core/extensions/built-in/context-mode/index.ts`  (bundled server)
 *   - `core/extensions/built-in/context7/index.ts`        (npx wrapper)
 *
 * This client does NOT support:
 *   - Sampling / elicitation (ai doesn't need them)
 *   - Notifications (we just don't subscribe)
 *
 * If the server fails to spawn, all operations resolve to a friendly
 * error message rather than crashing the agent.
 */

import { type ChildProcess, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEFAULT_SERVER_BUNDLE = join(__dirname, "built-in", "context-mode", "mcp-server", "server.bundle.mjs");

/** JSON-RPC request id generator. */
let _nextId = 1;
function nextId(): number {
	return _nextId++;
}

export interface MCPToolDefinition {
	name: string;
	description?: string;
	inputSchema: {
		type: "object";
		properties?: Record<string, unknown>;
		required?: string[];
		[key: string]: unknown;
	};
}

export interface MCPTextContent {
	type: "text";
	text: string;
}

export type MCPContent = MCPTextContent | { type: string; [key: string]: unknown };

export interface MCPCallResult {
	content: MCPContent[];
	isError?: boolean;
}

interface PendingRequest {
	resolve: (value: unknown) => void;
	reject: (reason: unknown) => void;
	id: number;
}

export interface MCPStdioClientOptions {
	/**
	 * Server bundle path. Used when `command` / `args` are not provided.
	 * Defaults to the bundled context-mode server for back-compat.
	 */
	serverBundlePath?: string;
	/** Custom spawn command. If set, `serverBundlePath` is ignored. */
	command?: string;
	/** Custom spawn args. */
	args?: string[];
	/** Working dir for the spawned server. */
	cwd?: string;
	/** Env vars to add to the spawned server. */
	env?: Record<string, string>;
	/** Per-request timeout in ms (default 30000). */
	timeoutMs?: number;
	/**
	 * Human-readable label for the server. Used in error messages and the
	 * stderr tag, so logs are distinguishable when multiple MCP servers run.
	 * Default: "mcp-server".
	 */
	serverLabel?: string;
}

/**
 * Spawns an MCP server and exposes a minimal JSON-RPC client.
 *
 * The server expects to be invoked and speaks newline-delimited JSON-RPC
 * 2.0 over stdio.
 */
export class MCPStdioClient {
	private child?: ChildProcess;
	private pending = new Map<number, PendingRequest>();
	private buffer = "";
	private tools: MCPToolDefinition[] = [];
	private initialized = false;
	private readonly options: Required<MCPStdioClientOptions>;
	private serverExitedError?: string;

	constructor(options: MCPStdioClientOptions = {}) {
		const serverBundlePath = options.serverBundlePath ?? DEFAULT_SERVER_BUNDLE;
		this.options = {
			serverBundlePath,
			command: options.command ?? process.execPath,
			args: options.args ?? [serverBundlePath],
			cwd: options.cwd ?? process.cwd(),
			env: options.env ?? {},
			timeoutMs: options.timeoutMs ?? 30000,
			serverLabel: options.serverLabel ?? "mcp-server",
		};
	}

	/**
	 * Returns true if the server bundle exists at the configured path.
	 * Always true for custom `command`/`args` configurations.
	 */
	isAvailable(): boolean {
		if (this.options.args[0] && existsSync(this.options.args[0])) return true;
		return false;
	}

	/**
	 * Start the server and perform the MCP initialize handshake.
	 * Returns the server's tool list. Idempotent.
	 */
	async start(): Promise<MCPToolDefinition[]> {
		if (this.initialized) {
			return this.tools;
		}
		if (this.options.args[0] && !this.isAvailable()) {
			throw new Error(
				`${this.options.serverLabel} MCP server bundle not found at ${this.options.args[0]}. ` +
					`Reinstall ai or run 'ai update self' to restore it.`,
			);
		}

		await this.spawn();
		await this.initialize();
		this.tools = await this.listTools();
		this.initialized = true;
		return this.tools;
	}

	/**
	 * Returns the tools registered with this client (empty if start() hasn't run).
	 */
	getTools(): MCPToolDefinition[] {
		return this.tools;
	}

	/**
	 * Forward a tool call to the server.
	 */
	async callTool(name: string, args: Record<string, unknown>): Promise<MCPCallResult> {
		if (!this.initialized) {
			throw new Error("MCPStdioClient not initialized; call start() first");
		}
		const result = await this.request("tools/call", { name, arguments: args });
		return result as MCPCallResult;
	}

	/**
	 * Stop the server. Safe to call multiple times.
	 */
	async stop(): Promise<void> {
		if (!this.child) return;
		const child = this.child;
		this.child = undefined;
		this.initialized = false;
		this.tools = [];
		for (const { reject } of this.pending.values()) {
			reject(new Error("MCP client stopped"));
		}
		this.pending.clear();
		return new Promise<void>((resolve) => {
			let done = false;
			const finish = () => {
				if (done) return;
				done = true;
				resolve();
			};
			child.once("exit", finish);
			try {
				child.kill("SIGTERM");
			} catch {
				finish();
			}
			// Force-kill after 2s
			setTimeout(() => {
				try {
					child.kill("SIGKILL");
				} catch {
					/* already dead */
				}
				finish();
			}, 2000).unref();
		});
	}

	// ── Internals ──────────────────────────────────────────

	private async spawn(): Promise<void> {
		const label = this.options.serverLabel;
		const child = spawn(this.options.command, this.options.args, {
			stdio: ["pipe", "pipe", "pipe"],
			cwd: this.options.cwd,
			env: { ...process.env, ...this.options.env },
			windowsHide: true,
		});
		this.child = child;
		this.buffer = "";
		this.serverExitedError = undefined;

		child.stdout?.setEncoding("utf-8");
		child.stdout?.on("data", (chunk: string) => this.onStdout(chunk));
		child.stderr?.setEncoding("utf-8");
		child.stderr?.on("data", (chunk: string) => {
			// The MCP server may emit warnings on stderr; we don't
			// want to log them in the agent UI. They go to process
			// stderr which the agent already routes separately.
			process.stderr.write(`[${label}] ${chunk}`);
		});

		child.on("exit", (code, signal) => {
			this.child = undefined;
			this.initialized = false;
			this.serverExitedError = `${label} MCP server exited (code=${code}, signal=${signal})`;
			for (const { reject } of this.pending.values()) {
				reject(new Error(this.serverExitedError));
			}
			this.pending.clear();
		});
		child.on("error", (err) => {
			this.serverExitedError = `${label} MCP server error: ${err.message}`;
		});
	}

	private onStdout(chunk: string): void {
		this.buffer += chunk;
		// Newline-delimited JSON-RPC.
		let idx: number;
		// biome-ignore lint/suspicious/noAssignInExpressions: while-loop with index pattern; biome's suggested refactor loses clarity for delimiter-framed streams
		while ((idx = this.buffer.indexOf("\n")) !== -1) {
			const line = this.buffer.slice(0, idx).trim();
			this.buffer = this.buffer.slice(idx + 1);
			if (!line) continue;
			let parsed: { id?: number; result?: unknown; error?: { code: number; message: string; data?: unknown } };
			try {
				parsed = JSON.parse(line);
			} catch {
				// Ignore non-JSON lines (server may emit debug noise).
				continue;
			}
			if (parsed.id != null && this.pending.has(parsed.id)) {
				const { resolve, reject } = this.pending.get(parsed.id)!;
				this.pending.delete(parsed.id);
				if (parsed.error) {
					reject(new Error(`${parsed.error.message} (code ${parsed.error.code})`));
				} else {
					resolve(parsed.result);
				}
			}
		}
	}

	private request<T = unknown>(method: string, params?: unknown): Promise<T> {
		if (!this.child?.stdin) {
			return Promise.reject(new Error(this.serverExitedError ?? "MCP server not running"));
		}
		const id = nextId();
		const message = `${JSON.stringify({ jsonrpc: "2.0", id, method, params: params ?? {} })}\n`;
		return new Promise<T>((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				reject(new Error(`MCP request '${method}' timed out after ${this.options.timeoutMs}ms`));
			}, this.options.timeoutMs);
			this.pending.set(id, {
				resolve: (v) => {
					clearTimeout(timer);
					resolve(v as T);
				},
				reject: (e) => {
					clearTimeout(timer);
					reject(e);
				},
				id,
			});
			try {
				this.child!.stdin!.write(message);
			} catch (err) {
				this.pending.delete(id);
				clearTimeout(timer);
				reject(err);
			}
		});
	}

	private async initialize(): Promise<void> {
		await this.request("initialize", {
			protocolVersion: "2024-11-05",
			capabilities: {},
			clientInfo: { name: "ai", version: "0.78.1" },
		});
		// The "initialized" notification is fire-and-forget per the spec.
		if (this.child?.stdin) {
			this.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
		}
	}

	private async listTools(): Promise<MCPToolDefinition[]> {
		const result = await this.request<{ tools: MCPToolDefinition[] }>("tools/list");
		return result.tools ?? [];
	}
}
