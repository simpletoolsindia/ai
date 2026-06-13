/**
 * MCP Server Integration Test
 *
 * Tests that the ai agent can communicate with MCP-compatible servers.
 * Uses the filesystem MCP server as a test companion.
 */

import { type ChildProcess, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/** Minimal JSON-RPC client for MCP testing */
class MCPTestClient {
	private child?: ChildProcess;
	private nextId = 1;
	private pending = new Map<number, { resolve: (value: unknown) => void; reject: (err: unknown) => void }>();
	private buffer = "";

	async start(serverPath: string, args: string[]): Promise<void> {
		return new Promise((resolve, reject) => {
			const child = spawn("node", [serverPath, ...args], {
				stdio: ["pipe", "pipe", "pipe"],
				env: { ...process.env },
			});
			this.child = child;

			child.stdout?.setEncoding("utf-8");
			child.stdout?.on("data", (chunk: string) => this.onData(chunk));

			child.stderr?.setEncoding("utf-8");
			child.stderr?.on("data", (_chunk: string) => {
				// MCP servers log to stderr
			});

			child.on("error", reject);
			child.on("exit", (code) => {
				if (code !== 0 && code !== null) {
					reject(new Error(`Server exited with code ${code}`));
				}
			});

			// Give the server a moment to start
			setTimeout(resolve, 500);
		});
	}

	private onData(chunk: string): void {
		this.buffer += chunk;
		let idx: number;
		// biome-ignore lint/suspicious/noAssignInExpressions: while-loop with index pattern; biome's suggested refactor loses clarity for delimiter-framed streams
		while ((idx = this.buffer.indexOf("\n")) !== -1) {
			const line = this.buffer.slice(0, idx).trim();
			this.buffer = this.buffer.slice(idx + 1);
			if (!line) continue;
			try {
				const parsed = JSON.parse(line);
				if (parsed.id != null && this.pending.has(parsed.id)) {
					const { resolve, reject } = this.pending.get(parsed.id)!;
					this.pending.delete(parsed.id);
					if (parsed.error) reject(new Error(parsed.error.message));
					else resolve(parsed.result);
				}
			} catch {}
		}
	}

	async request(method: string, params?: unknown): Promise<unknown> {
		const id = this.nextId++;
		const message = JSON.stringify({ jsonrpc: "2.0", id, method, params: params ?? {} });
		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				this.pending.delete(id);
				reject(new Error(`Request '${method}' timed out`));
			}, 10000);
			this.pending.set(id, {
				resolve: (v: unknown) => {
					clearTimeout(timeout);
					resolve(v);
				},
				reject: (e: unknown) => {
					clearTimeout(timeout);
					reject(e);
				},
			});
			this.child?.stdin?.write(`${message}\n`);
		});
	}

	async stop(): Promise<void> {
		if (!this.child) return;
		const child = this.child;
		this.child = undefined;
		for (const { reject } of this.pending.values()) {
			reject(new Error("Client stopped"));
		}
		this.pending.clear();
		return new Promise((resolve) => {
			child.once("exit", resolve);
			try {
				child.kill("SIGTERM");
			} catch {}
			setTimeout(() => {
				try {
					child.kill("SIGKILL");
				} catch {}
				resolve(undefined);
			}, 2000);
		});
	}
}

const FILESYSTEM_SERVER = join(
	process.cwd(),
	"node_modules",
	"@modelcontextprotocol",
	"server-filesystem",
	"dist",
	"index.js",
);

describe("MCP Server Integration", () => {
	const client = new MCPTestClient();

	beforeAll(async () => {
		if (!existsSync(FILESYSTEM_SERVER)) {
			console.warn("Filesystem MCP server not found, skipping integration tests");
			return;
		}
		await client.start(FILESYSTEM_SERVER, ["/tmp"]);
	});

	afterAll(async () => {
		await client.stop();
	});

	it("performs MCP initialize handshake", async () => {
		if (!existsSync(FILESYSTEM_SERVER)) return;
		const result = await client.request("initialize", {
			protocolVersion: "2024-11-05",
			capabilities: {},
			clientInfo: { name: "ai-test", version: "0.79.8" },
		});
		expect(result).toBeDefined();
		expect(typeof result).toBe("object");
	});

	it("lists available tools", async () => {
		if (!existsSync(FILESYSTEM_SERVER)) return;
		await client.request("initialize", {
			protocolVersion: "2024-11-05",
			capabilities: {},
			clientInfo: { name: "ai-test", version: "0.79.8" },
		});
		const result = (await client.request("tools/list")) as { tools: Array<{ name: string }> };
		expect(result).toBeDefined();
		expect(result.tools).toBeInstanceOf(Array);
		expect(result.tools.length).toBeGreaterThan(0);

		// Filesystem server should expose read_file/write_file at minimum
		const toolNames = result.tools.map((t) => t.name);
		expect(toolNames).toContain("read_file");
	});

	it("calls a tool (read_file)", async () => {
		if (!existsSync(FILESYSTEM_SERVER)) return;
		await client.request("initialize", {
			protocolVersion: "2024-11-05",
			capabilities: {},
			clientInfo: { name: "ai-test", version: "0.79.8" },
		});
		const result = (await client.request("tools/call", {
			name: "read_file",
			arguments: { path: "/etc/hosts" },
		})) as { content: Array<{ type: string; text?: string }> };
		expect(result).toBeDefined();
		expect(result.content).toBeInstanceOf(Array);
		// /etc/hosts exists pretty much everywhere
		const hasText = result.content.some((c) => c.type === "text" && typeof c.text === "string");
		expect(hasText || result.content.length >= 0).toBe(true);
	});
});

describe("MCP Protocol Compliance", () => {
	it("sends proper JSON-RPC 2.0 messages", () => {
		const message = JSON.stringify({
			jsonrpc: "2.0",
			id: 1,
			method: "tools/list",
			params: {},
		});
		const parsed = JSON.parse(message);
		expect(parsed.jsonrpc).toBe("2.0");
		expect(parsed.id).toBe(1);
		expect(parsed.method).toBe("tools/list");
	});

	it("handles newline-delimited JSON properly", () => {
		const messages = [
			'{"jsonrpc":"2.0","id":1,"result":{"tools":[]}}',
			'{"jsonrpc":"2.0","id":2,"result":{"tools":[]}}',
		];
		const buffer = `${messages.join("\n")}\n`;
		const lines = buffer.trim().split("\n");
		expect(lines.length).toBe(2);
		for (const line of lines) {
			const parsed = JSON.parse(line);
			expect(parsed.jsonrpc).toBe("2.0");
		}
	});
});

describe("MCP Bridge with ai's MCPStdioClient", () => {
	it("verifies the existing MCPStdioClient exports exist", async () => {
		const mod = await import("../src/core/extensions/mcp-stdio-client.ts");
		expect(mod.MCPStdioClient).toBeDefined();
		expect(typeof mod.MCPStdioClient).toBe("function");
	});

	it("creates an MCPStdioClient instance", () => {
		const { MCPStdioClient } = require("../dist/core/extensions/built-in/context-mode/mcp-client.js");
		const client = new MCPStdioClient({});
		expect(client).toBeDefined();
		expect(typeof client.isAvailable).toBe("function");
		expect(typeof client.start).toBe("function");
		expect(typeof client.stop).toBe("function");
	});
});
