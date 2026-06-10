import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, test } from "vitest";
import { EXPORTER_VERSION, exportSessionToJson } from "../src/core/export-transcript/json.ts";
import { exportSessionToMarkdown } from "../src/core/export-transcript/markdown.ts";
import { SessionManager } from "../src/core/session-manager.ts";

function makeSessionFile(): { sessionFile: string; sm: SessionManager; cleanup: () => void } {
	const tmp = mkdtempSync(join(tmpdir(), "ai-export-test-"));
	const sessionFile = join(tmp, "test-session.jsonl");
	// Minimal valid session header
	const header = {
		type: "session",
		version: 1,
		id: "test-session-123",
		timestamp: new Date().toISOString(),
		cwd: "/tmp",
	};
	const entries: unknown[] = [
		{
			id: "e1",
			parentId: null,
			type: "message",
			message: {
				role: "user",
				content: "Hello, can you help me with TypeScript?",
				timestamp: Date.parse("2024-06-15T10:00:00Z"),
			},
		},
		{
			id: "e2",
			parentId: "e1",
			type: "message",
			message: {
				role: "assistant",
				content: [
					{ type: "text", text: "Of course! TypeScript is a typed superset of JavaScript." },
					{
						type: "thinking",
						thinking: "The user is asking a general question. I should provide a helpful overview.",
					},
					{
						type: "toolCall",
						id: "tc1",
						name: "read",
						arguments: { file_path: "/tmp/example.ts" },
					},
				],
				api: "anthropic-messages",
				provider: "anthropic",
				model: "claude-3-5-sonnet",
				usage: { input: 50, output: 100, cacheRead: 0, cacheWrite: 0, totalTokens: 150 },
				stopReason: "end_turn",
				timestamp: Date.parse("2024-06-15T10:00:05Z"),
			},
		},
		{
			id: "e3",
			parentId: "e2",
			type: "message",
			message: {
				role: "toolResult",
				toolCallId: "tc1",
				toolName: "read",
				content: [{ type: "text", text: "export const x: number = 42;" }],
				isError: false,
				timestamp: Date.parse("2024-06-15T10:00:06Z"),
			},
		},
		{
			id: "e4",
			parentId: "e3",
			type: "message",
			message: {
				role: "assistant",
				content: [
					{
						type: "text",
						text: "I see the file. The value `42` is fine, but you might want to add a JSDoc comment.",
					},
				],
				api: "anthropic-messages",
				provider: "anthropic",
				model: "claude-3-5-sonnet",
				usage: { input: 80, output: 60, cacheRead: 0, cacheWrite: 0, totalTokens: 140 },
				stopReason: "end_turn",
				timestamp: Date.parse("2024-06-15T10:00:08Z"),
			},
		},
	];
	const lines = [JSON.stringify(header), ...entries.map((e) => JSON.stringify(e))];
	writeFileSync(sessionFile, `${lines.join("\n")}\n`);
	const sm = SessionManager.open(sessionFile);
	return {
		sessionFile,
		sm,
		cleanup: () => rmSync(tmp, { recursive: true, force: true }),
	};
}

describe("exportSessionToMarkdown", () => {
	test("produces a readable markdown transcript", () => {
		const { sm, cleanup } = makeSessionFile();
		try {
			const out = exportSessionToMarkdown(sm, undefined, { outputPath: "/tmp/test-export.md" });
			expect(out).toBe("/tmp/test-export.md");
			const md = readFileSync(out, "utf8");

			// Header
			expect(md).toContain("# ai Session Transcript");
			expect(md).toContain("## Session Metadata");
			expect(md).toContain("Session ID:");
			expect(md).toContain("User turns");
			expect(md).toContain("Assistant turns");
			expect(md).toContain("Tool calls");
			expect(md).toMatch(/\*\*Thinking blocks:\*\* excluded/);

			// User turn
			expect(md).toContain("## User —");
			expect(md).toContain("Hello, can you help me with TypeScript?");

			// Assistant turn with text + tool call
			expect(md).toContain("## Assistant —");
			expect(md).toContain("claude-3-5-sonnet");
			expect(md).toContain("Of course! TypeScript is a typed superset");
			expect(md).toContain("### Tool call: `read`");
			expect(md).toContain("```json");
			expect(md).toContain('"file_path": "/tmp/example.ts"');

			// Tool result
			expect(md).toContain("### Tool result: `read` — ✅ Success");
			expect(md).toContain("export const x: number = 42;");

			// Second assistant turn
			expect(md).toContain("I see the file. The value `42` is fine");

			// Thinking block is excluded by default
			expect(md).not.toContain("The user is asking a general question");

			// Should not have raw JSONL data
			expect(md).not.toContain('"type":"session"');
		} finally {
			cleanup();
			try {
				rmSync("/tmp/test-export.md", { force: true });
			} catch {
				// ignore
			}
		}
	});

	test("includes thinking blocks when requested", () => {
		const { sm, cleanup } = makeSessionFile();
		try {
			const out = exportSessionToMarkdown(sm, undefined, {
				outputPath: "/tmp/test-export-thinking.md",
				includeThinking: true,
			});
			const md = readFileSync(out, "utf8");
			expect(md).toMatch(/\*\*Thinking blocks:\*\* included/);
			expect(md).toContain("**Thinking:**");
			expect(md).toContain("The user is asking a general question");
		} finally {
			cleanup();
			try {
				rmSync("/tmp/test-export-thinking.md", { force: true });
			} catch {
				// ignore
			}
		}
	});

	test("excludes tool results when requested", () => {
		const { sm, cleanup } = makeSessionFile();
		try {
			const out = exportSessionToMarkdown(sm, undefined, {
				outputPath: "/tmp/test-export-no-results.md",
				includeToolResults: false,
			});
			const md = readFileSync(out, "utf8");
			expect(md).not.toContain("Tool result");
			expect(md).not.toContain("export const x: number = 42;");
		} finally {
			cleanup();
			try {
				rmSync("/tmp/test-export-no-results.md", { force: true });
			} catch {
				// ignore
			}
		}
	});

	test("shows stop reason and error when present", () => {
		const tmp = mkdtempSync(join(tmpdir(), "ai-export-test-"));
		const sessionFile = join(tmp, "session.jsonl");
		const header = {
			type: "session",
			version: 1,
			id: "x",
			timestamp: new Date().toISOString(),
			cwd: "/tmp",
		};
		const entries: unknown[] = [
			{
				id: "e1",
				parentId: null,
				type: "message",
				message: {
					role: "user",
					content: "do something",
					timestamp: Date.now(),
				},
			},
			{
				id: "e2",
				parentId: "e1",
				type: "message",
				message: {
					role: "assistant",
					content: [{ type: "text", text: "I cannot proceed." }],
					api: "anthropic-messages",
					provider: "anthropic",
					model: "claude-3-5-sonnet",
					usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2 },
					stopReason: "error",
					errorMessage: "Rate limit exceeded",
					timestamp: Date.now(),
				},
			},
		];
		writeFileSync(sessionFile, `${[JSON.stringify(header), ...entries.map((e) => JSON.stringify(e))].join("\n")}\n`);
		const sm = SessionManager.open(sessionFile);
		try {
			const out = exportSessionToMarkdown(sm, undefined, { outputPath: "/tmp/test-export-err.md" });
			const md = readFileSync(out, "utf8");
			expect(md).toContain("**Error:** Rate limit exceeded");
			expect(md).toContain("**Stop reason:** `error`");
		} finally {
			rmSync(tmp, { recursive: true, force: true });
			try {
				rmSync("/tmp/test-export-err.md", { force: true });
			} catch {
				// ignore
			}
		}
	});
});

describe("exportSessionToJson", () => {
	test("produces a structured JSON file with metadata", () => {
		const { sm, cleanup } = makeSessionFile();
		try {
			const out = exportSessionToJson(sm, undefined, { outputPath: "/tmp/test-export.json" });
			const json = JSON.parse(readFileSync(out, "utf8"));

			expect(json.exporterVersion).toBe(EXPORTER_VERSION);
			expect(json.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
			expect(json.header.id).toBe("test-session-123");
			expect(json.leafId).toBeDefined();
			expect(json.entries).toHaveLength(4);
			expect(json.entries[0].message.role).toBe("user");
			expect(json.entries[1].message.content[0].type).toBe("text");
			expect(json.entries[1].message.content[1].type).toBe("thinking");
			expect(json.entries[1].message.content[2].name).toBe("read");
		} finally {
			cleanup();
			try {
				rmSync("/tmp/test-export.json", { force: true });
			} catch {
				// ignore
			}
		}
	});

	test("compact JSON output (indent 0) is single-line", () => {
		const { sm, cleanup } = makeSessionFile();
		try {
			const out = exportSessionToJson(sm, undefined, {
				outputPath: "/tmp/test-export-compact.json",
				indent: 0,
			});
			const body = readFileSync(out, "utf8");
			// No newlines inside the JSON object
			const withoutTrailing = body.replace(/\n$/, "");
			expect(withoutTrailing).not.toContain("\n");
		} finally {
			cleanup();
			try {
				rmSync("/tmp/test-export-compact.json", { force: true });
			} catch {
				// ignore
			}
		}
	});

	test("includes model and tools when state is provided", () => {
		const { sm, cleanup } = makeSessionFile();
		try {
			exportSessionToJson(
				sm,
				{
					systemPrompt: "You are a test assistant.",
					model: { id: "claude-3-5-sonnet", provider: "anthropic", api: "anthropic-messages" },
					tools: [{ name: "read", description: "Read a file", parameters: {} }],
				} as any,
				{ outputPath: "/tmp/test-export-state.json" },
			);
			const json = JSON.parse(readFileSync("/tmp/test-export-state.json", "utf8"));
			expect(json.model.id).toBe("claude-3-5-sonnet");
			expect(json.systemPrompt).toBe("You are a test assistant.");
			expect(json.tools).toHaveLength(1);
			expect(json.tools[0].name).toBe("read");
		} finally {
			cleanup();
			try {
				rmSync("/tmp/test-export-state.json", { force: true });
			} catch {
				// ignore
			}
		}
	});

	test("EXPORTER_VERSION is a semver-like string", () => {
		expect(EXPORTER_VERSION).toMatch(/^\d+\.\d+\.\d+/);
	});
});
