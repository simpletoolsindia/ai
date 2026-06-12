/**
 * Minimal MCP stdio client for the context-mode server bundle.
 *
 * Spawns the bundled `server.bundle.mjs` as a child process, performs
 * the MCP initialize handshake, calls `tools/list`, and forwards
 * `tools/call` requests to it. The result is a list of tools (with
 * JSON-Schema parameters) that the ai extension can register via
 * `pi.registerTool()`.
 *
 * This is a deliberately small subset of the upstream
 * `mcp-bridge.ts` (~200 lines vs ~950). It does NOT support:
 *  - Sampling / elicitation (ai doesn't need them)
 *  - Notifications (we just don't subscribe)
 *  - Session lifecycle hooks (FTS5 indexing, resume, etc. — punted
 *    to a future version; the server still writes its DB regardless
 *    because the server's internal lifecycle handles it)
 *
 * If the server bundle is missing or fails to spawn, all operations
 * resolve to a friendly error message rather than crashing the agent.
 */

import { type ChildProcess, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEFAULT_SERVER_BUNDLE = join(__dirname, "mcp-server", "server.bundle.mjs");

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
	/** Path to the server bundle. Defaults to ../mcp-server/server.bundle.mjs. */
	serverBundlePath?: string;
	/** Working dir for the spawned server. */
	cwd?: string;
	/** Env vars to add to the spawned server. */
	env?: Record<string, string>;
	/** Per-request timeout in ms (default 30000). */
	timeoutMs?: number;
}

/**
 * Spawns the bundled MCP server and exposes a minimal JSON-RPC client.
 *
 * The server bundle expects to be invoked as `node server.bundle.mjs`
 * and speaks newline-delimited JSON-RPC 2.0 over stdio.
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
		this.options = {
			serverBundlePath: options.serverBundlePath ?? DEFAULT_SERVER_BUNDLE,
			cwd: options.cwd ?? process.cwd(),
			env: options.env ?? {},
			timeoutMs: options.timeoutMs ?? 30000,
		};
	}

	/**
	 * Returns true if the server bundle exists at the configured path.
	 */
	isAvailable(): boolean {
		return existsSync(this.options.serverBundlePath);
	}

	/**
	 * Start the server and perform the MCP initialize handshake.
	 * Returns the server's tool list. Idempotent.
	 */
	async start(): Promise<MCPToolDefinition[]> {
		if (this.initialized) {
			return this.tools;
		}
		if (!this.isAvailable()) {
			throw new Error(
				`context-mode MCP server bundle not found at ${this.options.serverBundlePath}. ` +
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
		const env = {
			...process.env,
			...this.options.env,
			CONTEXT_MODE_BRIDGE_DEPTH: "0",
		};
		const child = spawn(process.execPath, [this.options.serverBundlePath], {
			stdio: ["pipe", "pipe", "pipe"],
			cwd: this.options.cwd,
			env,
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
			process.stderr.write(`[context-mode] ${chunk}`);
		});

		child.on("exit", (code, signal) => {
			this.child = undefined;
			this.initialized = false;
			this.serverExitedError = `context-mode MCP server exited (code=${code}, signal=${signal})`;
			for (const { reject } of this.pending.values()) {
				reject(new Error(this.serverExitedError));
			}
			this.pending.clear();
		});
		child.on("error", (err) => {
			this.serverExitedError = `context-mode MCP server error: ${err.message}`;
		});
	}

	private onStdout(chunk: string): void {
		this.buffer += chunk;
		// Newline-delimited JSON-RPC.
		let idx: number;
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
		const message = JSON.stringify({ jsonrpc: "2.0", id, method, params: params ?? {} }) + "\n";
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
			this.child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
		}
	}

	private async listTools(): Promise<MCPToolDefinition[]> {
		const result = await this.request<{ tools: MCPToolDefinition[] }>("tools/list");
		return result.tools ?? [];
	}
}
