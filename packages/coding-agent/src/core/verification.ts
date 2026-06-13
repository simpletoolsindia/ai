/**
 * Verification Loop — runs a verifier LLM call after agent_end to
 * check if the task was completed correctly.
 *
 * If the verifier detects issues, the issues are fed back to the
 * agent as a follow-up message, and the agent continues the loop.
 * This prevents the agent from ending in a broken or incomplete
 * state and ensures deliverables meet the user's intent.
 *
 * Design:
 * - Non-streaming LLM call (completeSimple) for speed
 * - Verifier gets the last turn's messages
 * - Parses structured output: "PASS" or "FAIL: <issues>"
 * - Max loops configurable (default 3) to prevent infinite loops
 */

import {
	type AssistantMessage,
	type Context,
	completeSimple,
	type Message,
	type Model,
	type TextContent,
	type ThinkingContent,
	type ToolCall,
	type ToolResultMessage,
} from "@simpletoolsindiaorg/ai-provider";

/** Result of a verification check. */
export interface VerificationResult {
	/** Whether the verification passed. */
	passed: boolean;
	/** Summary from the verifier (always present). */
	summary: string;
	/** List of issues detected (only when !passed). */
	issues: string[];
}

/** Context needed to build the verification prompt. */
export interface VerificationContext {
	/** The user's original request (most recent user message). */
	userRequest: string;
	/** The last assistant response (includes tool calls and final text). */
	assistantResponse: string;
	/** Summary of tool results from the last turn. */
	toolResults: string;
	/** Whether the model was in PLAN mode (no code was written). */
	isPlanMode: boolean;
}

/** Options for the verification call. */
export interface VerificationOptions {
	/** Model to use for verification. */
	model: Model<any>;
	/** API key for the model. */
	apiKey?: string;
	/** Maximum tokens for the verifier response (default: 1024). */
	maxTokens?: number;
}

/**
 * Run a verification check on the last turn of the agent.
 *
 * Returns a `VerificationResult` indicating pass/fail and any
 * detected issues. This is a non-streaming call for speed.
 */
export async function verifyTurnCompletion(
	context: VerificationContext,
	options: VerificationOptions,
): Promise<VerificationResult> {
	// Build the verification prompt
	const prompt = buildVerificationPrompt(context);

	// Make a non-streaming LLM call
	const ctx: Context = {
		messages: [{ role: "user", content: prompt, timestamp: Date.now() }],
	};
	const response = await completeSimple(options.model, ctx, {
		maxTokens: options.maxTokens ?? 1024,
		apiKey: options.apiKey,
	});

	// Extract text from the assistant response
	const responseText = extractTextFromAssistantMessage(response);

	// Parse the response
	return parseVerificationResponse(responseText, context);
}

/** Extract plain text from an AssistantMessage's content blocks. */
export function extractTextFromAssistantMessage(msg: AssistantMessage): string {
	if (typeof msg.content === "string") return msg.content;
	const parts: string[] = [];
	for (const block of msg.content) {
		if (block.type === "text") parts.push((block as TextContent).text);
		else if (block.type === "thinking") parts.push((block as ThinkingContent).thinking);
	}
	return parts.join("\n");
}

/**
 * Build the verification prompt from conversation context.
 */
export function buildVerificationPrompt(context: VerificationContext): string {
	if (context.isPlanMode) {
		return `You are a verification agent. Your job is to review a PLAN (not code) created by a coding agent and verify it's complete and actionable.

USER'S REQUEST:
${context.userRequest}

PLAN PRESENTED:
${context.assistantResponse}

Verify that:
1. The plan addresses ALL aspects of the user's request
2. Each step is specific and actionable (file paths, function names, expected behavior)
3. The plan is in a logical order
4. Nothing was overlooked or assumed

If the plan is complete and correct, respond with:
"VERIFICATION PASSED: <one-sentence summary of why it's good>"

If there are issues, respond with:
"VERIFICATION FAILED:
- <issue 1>
- <issue 2>
..." (each issue on a new line starting with "- ")

IMPORTANT: Only report actual problems. Don't nitpick style. Be concise.`;
	}

	return `You are a verification agent. Your job is to review work done by a coding agent and verify it was completed correctly. Look at what the user asked for and what the agent actually did.

USER'S REQUEST:
${context.userRequest}

AGENT'S ACTIONS AND RESULTS:
${context.assistantResponse}

TOOL RESULTS SUMMARY:
${context.toolResults}

Verify that:
1. The agent completed what the user asked for — every part of the request
2. There are no obvious errors in the output (compile errors, missing files, broken imports)
3. The changes are consistent with the project's existing patterns and conventions
4. Tests were written or updated if needed
5. No unfinished work was left behind

If everything looks correct and complete, respond with:
"VERIFICATION PASSED: <one-sentence summary>"

If there are ANY issues (incomplete work, errors, missing pieces), respond with:
"VERIFICATION FAILED:
- <issue 1>
- <issue 2>
- <issue 3>"
(each issue on a new line starting with "- ", be specific about what's wrong and where)

IMPORTANT: 
- Be thorough but fair. Only flag real problems.
- If the user's request was multi-part, check EVERY part was addressed.
- Don't nitpick formatting or style unless it would cause a real issue.
- If you're unsure about something, mention it as a minor concern at the end.`;
}

/**
 * Parse the verifier's response. Expects either:
 * - "VERIFICATION PASSED: <summary>"
 * - "VERIFICATION FAILED:\n- <issue 1>\n- <issue 2>..."
 */
export function parseVerificationResponse(text: string, _context?: VerificationContext): VerificationResult {
	const normalized = text.trim();

	// Check for pass
	const passMatch = normalized.match(/^VERIFICATION\s+PASSED:?\s*(.*)$/im);
	if (passMatch) {
		return {
			passed: true,
			summary: passMatch[1]?.trim() || "Task completed correctly",
			issues: [],
		};
	}

	// Check for fail
	const failMatch = normalized.match(/^VERIFICATION\s+FAILED:?\s*$/im);
	if (failMatch || normalized.includes("VERIFICATION FAILED")) {
		// Extract issues: lines starting with "- " or "* "
		const lines = normalized.split(/\r?\n/);
		const issues: string[] = [];
		let inFail = false;
		for (const line of lines) {
			if (/^VERIFICATION\s+FAILED/i.test(line.trim())) {
				inFail = true;
				continue;
			}
			if (inFail) {
				const trimmed = line.trim();
				if (trimmed.startsWith("- ") || trimmed.startsWith("* ") || trimmed.startsWith("• ")) {
					issues.push(trimmed.slice(2).trim());
				} else if (/^[-*•]/.test(trimmed)) {
					issues.push(trimmed.slice(1).trim());
				}
			}
		}

		if (issues.length === 0) {
			// The model said FAILED but didn't format issues as bullets
			// Extract everything after the FAILED line
			const afterFailed = normalized.replace(/^.*?VERIFICATION\s+FAILED:?\s*/ims, "");
			if (afterFailed.trim()) {
				issues.push(afterFailed.trim());
			}
		}

		return {
			passed: false,
			summary: issues[0] || "Verification failed — no specific issues listed",
			issues: issues.length > 0 ? issues : ["Verification failed — no specific issues listed"],
		};
	}

	// Fallback: if the response doesn't match the exact format,
	// check for strong indicators of success or failure.
	const lower = normalized.toLowerCase();
	const negativeWords = ["fail", "error", "missing", "incomplete", "not done", "unfinished"];
	const positiveWords = ["pass", "correct", "good", "looks good", "no issues", "well done"];
	const hasNegative = negativeWords.some((w) => lower.includes(w));
	const hasPositive = positiveWords.some((w) => lower.includes(w));

	// Strong negative signals without any positive counter-signal
	if (hasNegative && !hasPositive) {
		return {
			passed: false,
			summary: "Verification indicated issues (unstructured response)",
			issues: [normalized.slice(0, 500)],
		};
	}

	// Treat as pass (benefit of doubt)
	return {
		passed: true,
		summary: lower.slice(0, 200),
		issues: [],
	};
}

/**
 * Extract the user's most recent request from conversation messages.
 */
export function extractUserRequest(messages: Message[]): string {
	for (let i = messages.length - 1; i >= 0; i--) {
		const msg = messages[i];
		if (msg.role !== "user") continue;
		const content = msg.content;
		if (typeof content === "string") return content;
		const textBlocks = content.filter((c) => c.type === "text");
		return textBlocks.map((c) => (c as TextContent).text ?? "").join("\n");
	}
	return "(no user request found)";
}

/**
 * Extract the most recent assistant response from conversation messages.
 */
export function extractAssistantResponse(messages: Message[]): string {
	const parts: string[] = [];
	for (let i = messages.length - 1; i >= 0; i--) {
		const msg = messages[i];
		if (msg.role !== "assistant") continue;
		const content = msg.content;
		if (typeof content === "string") {
			parts.unshift(content);
		} else {
			for (const block of content) {
				if (block.type === "text") {
					parts.unshift((block as TextContent).text);
				} else if (block.type === "toolCall") {
					const tool = block as ToolCall;
					const args = typeof tool.arguments === "string" ? tool.arguments : JSON.stringify(tool.arguments);
					parts.unshift(`[Tool: ${tool.name}(${args.length > 200 ? `${args.slice(0, 200)}…` : args})]`);
				}
			}
		}
		break;
	}
	return parts.join("\n");
}

/**
 * Extract tool result summaries from the last turn.
 */
export function extractToolResults(messages: Message[]): string {
	const parts: string[] = [];
	// Find the last assistant message index
	let lastAssistantIdx = -1;
	for (let i = messages.length - 1; i >= 0; i--) {
		if (messages[i].role === "assistant") {
			lastAssistantIdx = i;
			break;
		}
	}
	if (lastAssistantIdx < 0) return "";
	// Collect tool results that follow the last assistant
	for (let i = lastAssistantIdx + 1; i < messages.length; i++) {
		const msg = messages[i];
		if (msg.role !== "toolResult") continue;
		const tr = msg as ToolResultMessage;
		const textContent = tr.content.filter((c) => c.type === "text");
		const text = textContent.map((c) => (c as TextContent).text).join("\n");
		const truncated = text.length > 200 ? `${text.slice(0, 200)}…` : text;
		parts.push(`[${tr.toolName}]: ${truncated}`);
	}
	return parts.join("\n");
}
