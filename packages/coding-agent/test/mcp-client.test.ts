/**
 * Tests for the context-mode MCP client.
 *
 * The client spawns a long-lived subprocess and speaks JSON-RPC over
 * stdio. We use a tiny inline mock server in Node (also spawned) so
 * the test doesn't depend on the real context-mode bundle being
 * built correctly. The mock just echoes back the initialize /
 * tools/list / tools/call flow.
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MCPStdioClient } from "../src/core/extensions/mcp-stdio-client.ts";

/**
 * A minimal mock MCP server that:
 *   - responds to `initialize` with capabilities
 *   - responds to `tools/list` with two canned tools
 *   - responds to `tools/call` with a text result
 *   - echoes the `name` and `arguments` fields in the response
 */
function writeMockServer(dir: string): string {
	const path = join(dir, "mock-mcp-server.mjs");
	const code = `
let nextId = 1;
const pending = new Map();
let buffer = "";
process.stdin.setEncoding("utf-8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let idx;
  while ((idx = buffer.indexOf("\\n")) !== -1) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    handle(msg);
  }
});

function reply(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\\n");
}

function handle(msg) {
  if (msg.id == null) return;
  if (msg.method === "initialize") {
    reply(msg.id, { protocolVersion: "2024-11-05", capabilities: {}, serverInfo: { name: "mock", version: "0.0.1" } });
  } else if (msg.method === "tools/list") {
    reply(msg.id, {
      tools: [
        { name: "echo", description: "Echo back the input", inputSchema: { type: "object", properties: { text: { type: "string" } } } },
        { name: "add", description: "Add two numbers", inputSchema: { type: "object", properties: { a: { type: "number" }, b: { type: "number" } } } }
      ]
    });
  } else if (msg.method === "tools/call") {
    const args = msg.params?.arguments ?? {};
    reply(msg.id, {
      content: [{ type: "text", text: JSON.stringify({ tool: msg.params.name, args }) }]
    });
  } else {
    reply(msg.id, { error: { code: -32601, message: "Method not found: " + msg.method } });
  }
}
`;
	writeFileSync(path, code);
	return path;
}

let tempDir: string;
let mockServerPath: string;

beforeEach(() => {
	tempDir = mkdtempSync(join(tmpdir(), "mcp-test-"));
	mockServerPath = writeMockServer(tempDir);
});

afterEach(() => {
	rmSync(tempDir, { recursive: true, force: true });
});

describe("MCPStdioClient", () => {
	it("performs initialize and tools/list, returns the tool list", async () => {
		const client = new MCPStdioClient({ serverBundlePath: mockServerPath, timeoutMs: 5000 });
		expect(client.isAvailable()).toBe(true);
		const tools = await client.start();
		expect(tools).toHaveLength(2);
		expect(tools.map((t) => t.name).sort()).toEqual(["add", "echo"]);
		expect(tools[0].inputSchema.type).toBe("object");
		await client.stop();
	});

	it("forwards tools/call and returns the text content", async () => {
		const client = new MCPStdioClient({ serverBundlePath: mockServerPath, timeoutMs: 5000 });
		await client.start();
		const result = await client.callTool("echo", { text: "hello" });
		expect(result.isError).toBeFalsy();
		const text = result.content
			.filter((c) => c.type === "text")
			.map((c) => (c as any).text)
			.join("");
		expect(text).toContain("echo");
		expect(text).toContain("hello");
		await client.stop();
	});

	it("is idempotent: calling start() twice returns the cached tool list", async () => {
		const client = new MCPStdioClient({ serverBundlePath: mockServerPath, timeoutMs: 5000 });
		const t1 = await client.start();
		const t2 = await client.start();
		expect(t1).toBe(t2); // same array reference
		await client.stop();
	});

	it("throws a clear error when the server bundle is missing", async () => {
		const client = new MCPStdioClient({
			serverBundlePath: "/nonexistent/server.bundle.mjs",
			timeoutMs: 2000,
		});
		expect(client.isAvailable()).toBe(false);
		await expect(client.start()).rejects.toThrow(/not found/);
	});

	it("rejects tool calls before start()", async () => {
		const client = new MCPStdioClient({ serverBundlePath: mockServerPath, timeoutMs: 5000 });
		await expect(client.callTool("echo", {})).rejects.toThrow(/not initialized/);
	});

	it("stop() is safe to call multiple times", async () => {
		const client = new MCPStdioClient({ serverBundlePath: mockServerPath, timeoutMs: 5000 });
		await client.start();
		await client.stop();
		await client.stop();
		// No assertion needed; just should not throw
	});
});
