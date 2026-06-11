/**
 * Tests for the verification loop feature.
 */

import { describe, expect, it } from "vitest";
import {
	buildVerificationPrompt,
	extractAssistantResponse,
	extractTextFromAssistantMessage,
	extractToolResults,
	extractUserRequest,
	parseVerificationResponse,
} from "../src/core/verification.ts";
import type { Message, AssistantMessage, ToolResultMessage, TextContent, ToolCall } from "@simpletoolsindiaorg/ai-provider";

describe("buildVerificationPrompt", () => {
	const ctx = {
		userRequest: "Add a /stats command",
		assistantResponse: "[Tool: read(/file)] I'll add the command.",
		toolResults: "[read]: file content truncated…",
		isPlanMode: false,
	};

	it("includes the user request", () => {
		const prompt = buildVerificationPrompt(ctx);
		expect(prompt).toContain("Add a /stats command");
	});

	it("includes the assistant response", () => {
		const prompt = buildVerificationPrompt(ctx);
		expect(prompt).toContain("I'll add the command");
	});

	it("includes VERIFICATION PASSED/FAILED format instructions", () => {
		const prompt = buildVerificationPrompt(ctx);
		expect(prompt).toContain("VERIFICATION PASSED");
		expect(prompt).toContain("VERIFICATION FAILED");
	});

	it("generates a plan-mode prompt when isPlanMode is true", () => {
		const planCtx = { ...ctx, isPlanMode: true };
		const prompt = buildVerificationPrompt(planCtx);
		expect(prompt).toContain("PLAN (not code)");
		expect(prompt).toContain("specific and actionable");
	});
});

describe("parseVerificationResponse", () => {
	it("detects VERIFICATION PASSED", () => {
		const result = parseVerificationResponse("VERIFICATION PASSED: All files updated correctly");
		expect(result.passed).toBe(true);
		expect(result.summary).toBe("All files updated correctly");
		expect(result.issues).toEqual([]);
	});

	it("detects VERIFICATION PASSED without colon", () => {
		const result = parseVerificationResponse("VERIFICATION PASSED");
		expect(result.passed).toBe(true);
	});

	it("detects VERIFICATION FAILED with bullet issues", () => {
		const response = `VERIFICATION FAILED:
- Missing import in utils.ts
- Test not updated
- Edge case not handled`;
		const result = parseVerificationResponse(response);
		expect(result.passed).toBe(false);
		expect(result.issues).toEqual([
			"Missing import in utils.ts",
			"Test not updated",
			"Edge case not handled",
		]);
	});

	it("handles unstructured negative responses", () => {
		const result = parseVerificationResponse("The task is incomplete. There are errors in the output.");
		expect(result.passed).toBe(false);
		expect(result.issues.length).toBeGreaterThan(0);
	});

	it("handles unstructured positive responses", () => {
		const result = parseVerificationResponse("Everything looks good, the changes are complete.");
		expect(result.passed).toBe(true);
	});

	it("handles mixed positive + negative conservatively", () => {
		// "looks good" + "issue" → positive wins when both present
		const result = parseVerificationResponse("This looks good but there is one minor issue.");
		expect(result.passed).toBe(true);
	});
});

describe("extractTextFromAssistantMessage", () => {
	it("extracts text from content blocks", () => {
		const msg: AssistantMessage = {
			role: "assistant",
			content: [
				{ type: "text", text: "Hello" },
				{ type: "text", text: "World" },
			],
			api: "openai-completions" as any,
			provider: "" as any,
			model: "",
			usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
			stopReason: "end_turn",
			timestamp: Date.now(),
		};
		expect(extractTextFromAssistantMessage(msg)).toBe("Hello\nWorld");
	});
});

describe("extractUserRequest", () => {
	it("finds the most recent user message", () => {
		const messages: Message[] = [
			{ role: "user", content: "Fix the bug", timestamp: 1 },
			{
				role: "assistant",
				content: [{ type: "text", text: "Ok" }],
				api: "openai-completions" as any, provider: "" as any, model: "",
				usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
				stopReason: "end_turn", timestamp: 2,
			},
			{ role: "user", content: "Also add a test", timestamp: 3 },
		];
		const result = extractUserRequest(messages);
		expect(result).toBe("Also add a test");
	});

	it("returns placeholder when no user message found", () => {
		const messages: Message[] = [
			{
				role: "assistant",
				content: [{ type: "text", text: "Help" }],
				api: "openai-completions" as any, provider: "" as any, model: "",
				usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
				stopReason: "end_turn", timestamp: 1,
			},
		];
		const result = extractUserRequest(messages);
		expect(result).toContain("no user request found");
	});
});

describe("extractAssistantResponse", () => {
	it("extracts text and tool calls from last assistant message", () => {
		const messages: Message[] = [
			{
				role: "assistant",
				content: [
					{ type: "toolCall" as const, id: "1", name: "read", arguments: { path: "foo.ts" } },
					{ type: "text" as const, text: "I read the file." },
				],
				api: "openai-completions" as any, provider: "" as any, model: "",
				usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
				stopReason: "end_turn", timestamp: 1,
			},
		];
		const result = extractAssistantResponse(messages);
		expect(result).toContain("[Tool: read(");
		expect(result).toContain("I read the file");
	});
});

describe("extractToolResults", () => {
	it("extracts tool result summaries after last assistant message", () => {
		const messages: Message[] = [
			{
				role: "assistant",
				content: [{ type: "text", text: "Checking..." }],
				api: "openai-completions" as any, provider: "" as any, model: "",
				usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
				stopReason: "end_turn", timestamp: 1,
			},
			{
				role: "toolResult",
				toolCallId: "1",
				toolName: "bash",
				content: [{ type: "text", text: "test passed" }],
				isError: false,
				timestamp: 2,
			},
			{
				role: "toolResult",
				toolCallId: "2",
				toolName: "write",
				content: [{ type: "text", text: "file written" }],
				isError: false,
				timestamp: 3,
			},
		];
		const result = extractToolResults(messages);
		expect(result).toContain("[bash]:");
		expect(result).toContain("[write]:");
	});

	it("truncates long tool results", () => {
		const longText = "x".repeat(500);
		const messages: Message[] = [
			{
				role: "assistant",
				content: [{ type: "text", text: "Done" }],
				api: "openai-completions" as any, provider: "" as any, model: "",
				usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
				stopReason: "end_turn", timestamp: 1,
			},
			{
				role: "toolResult",
				toolCallId: "1",
				toolName: "read",
				content: [{ type: "text", text: longText }],
				isError: false,
				timestamp: 2,
			},
		];
		const result = extractToolResults(messages);
		expect(result.length).toBeLessThan(300);
		expect(result).toContain("…");
	});
});
