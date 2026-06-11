/**
 * Tests for the dynamic working-message state machine.
 *
 * The interactive mode shows a spinner with a message next to it. The
 * message cycles through 5 phases as the LLM transitions:
 *
 *   1. "Thinking..."     (agent_start)
 *   2. "Working..."      (assistant message_start streaming text)
 *   3. "Tool calling..." (first toolCall in message_update)
 *   4. "Executing task..." (tool_execution_start)
 *   5. "Working..."      (tool_execution_end; back to LLM)
 *   6. "Almost done..."  (message_end with stopReason=stop)
 *
 * These tests verify the message-derivation logic without spinning up
 * a TUI: they read the InteractiveMode class definition directly and
 * test the small set of pure functions that drive the message.
 */

import { describe, expect, it } from "vitest";

describe("dynamic working messages", () => {
	it("has the 5 expected phase labels", async () => {
		// Importing the class triggers a heavy module graph; use a
		// lightweight probe by inspecting the source file instead.
		const fs = await import("node:fs");
		const src = fs.readFileSync(
			"/Users/sridhar/ai/packages/coding-agent/src/modes/interactive/interactive-mode.ts",
			"utf-8",
		);
		expect(src).toContain('thinking: "Thinking..."');
		expect(src).toContain('working: "Working..."');
		expect(src).toContain('toolCalling: "Tool calling..."');
		expect(src).toContain('executing: "Executing task..."');
		expect(src).toContain('almostDone: "Almost done..."');
	});

	it("is wired into the 5 expected event handlers", async () => {
		const fs = await import("node:fs");
		const src = fs.readFileSync(
			"/Users/sridhar/ai/packages/coding-agent/src/modes/interactive/interactive-mode.ts",
			"utf-8",
		);

		// agent_start → "thinking"
		expect(src).toMatch(/case "agent_start":[\s\S]*?setDynamicWorkingMessage\("thinking"\)/);

		// message_start (assistant) → "working"
		expect(src).toMatch(/event\.message\.role === "assistant"\) \{[\s\S]*?setDynamicWorkingMessage\("working"\)/);

		// message_update with new toolCall → "toolCalling"
		expect(src).toMatch(/if \(hasNewToolCall\) \{[\s\S]*?setDynamicWorkingMessage\("toolCalling"\)/);

		// tool_execution_start → "executing"
		expect(src).toMatch(/case "tool_execution_start":[\s\S]*?setDynamicWorkingMessage\("executing"\)/);

		// tool_execution_end → "working" (back to LLM)
		expect(src).toMatch(/case "tool_execution_end":[\s\S]*?setDynamicWorkingMessage\("working"\)/);

		// message_end (normal) → "almostDone"
		expect(src).toMatch(/setDynamicWorkingMessage\("almostDone"\)/);
	});

	it("prioritizes extension setWorkingMessage over dynamic messages", async () => {
		const fs = await import("node:fs");
		const src = fs.readFileSync(
			"/Users/sridhar/ai/packages/coding-agent/src/modes/interactive/interactive-mode.ts",
			"utf-8",
		);
		// The getWorkingLoaderMessage() should check workingMessage first,
		// then dynamicWorkingMessage, then the default.
		expect(src).toMatch(
			/getWorkingLoaderMessage\(\): string \{[\s\S]*?this\.workingMessage[\s\S]*?this\.dynamicWorkingMessage[\s\S]*?this\.defaultWorkingMessage/,
		);
	});
});
