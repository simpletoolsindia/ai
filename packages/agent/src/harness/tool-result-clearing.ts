/**
 * Tool-result clearing — replaces the content of stale `toolResult`
 * messages with a one-line marker, so a long session doesn't run
 * out of context window.
 *
 * Why this matters: a single `read` of a 50 KB file or a `bash` that
 * returns a long log is typically 10-100× larger than the message
 * that produced it. The Anthropic cookbook and Microsoft Agent
 * Framework both recommend "tool clearing" as a separate strategy
 * from session-level compaction. Compaction loses the whole
 * transcript at once; tool clearing is targeted and reversible per
 * message.
 *
 * Rules (all configurable):
 *   - Never clear the most recent `keepRecent` tool results
 *   - Clear any tool result older than `clearAfterTurns` turns
 *   - Only clear content for "noisy" tool names (read, bash, grep,
 *     find, ls, webfetch, websearch, resolveDocs) — tool results
 *     from a write/edit are usually short and load-bearing
 *   - Replace content with a single line: "[cleared: <toolName>
 *     result trimmed, original size <N> bytes]" so the LLM knows
 *     the data was there but is gone
 *
 * The clearing is wrapped in a `transformContext` so it runs at
 * every LLM call, not at session boundaries. The cost is a single
 * O(n) walk over messages — for a 100-turn session this is well
 * under 1 ms.
 */

import type { ToolResultMessage } from "@simpletoolsindiaorg/ai-provider";
import type { AgentMessage } from "../types.ts";

export interface ToolResultClearingSettings {
	/** Master switch. Default: true (tool-result clearing is cheap and good). */
	enabled?: boolean;
	/** Clear results older than this many turns. Default: 5 turns. */
	clearAfterTurns?: number;
	/** Never clear the most recent N tool results. Default: 3. */
	keepRecent?: number;
	/**
	 * Maximum content size in bytes before clearing kicks in. Tool
	 * results smaller than this are kept verbatim (the LLM probably
	 * needs them). Default: 2048.
	 */
	minSizeToClear?: number;
	/**
	 * Tool names whose results are eligible for clearing. Default:
	 * the read-heavy / log-heavy tools. Edit/write results are kept
	 * because they tend to be small and load-bearing.
	 */
	eligibleTools?: ReadonlySet<string>;
}

const DEFAULT_ELIGIBLE_TOOLS: ReadonlySet<string> = new Set([
	"read",
	"bash",
	"grep",
	"find",
	"ls",
	"webfetch",
	"websearch",
	"resolveDocs",
	"subagent",
]);

const DEFAULT_SETTINGS: Required<ToolResultClearingSettings> = {
	enabled: true,
	clearAfterTurns: 5,
	keepRecent: 3,
	minSizeToClear: 2048,
	eligibleTools: DEFAULT_ELIGIBLE_TOOLS,
};

/** Compose the user's settings on top of the defaults. */
export function resolveToolResultClearingSettings(
	settings: ToolResultClearingSettings | undefined,
): Required<ToolResultClearingSettings> {
	if (!settings) return DEFAULT_SETTINGS;
	return {
		enabled: settings.enabled !== false,
		clearAfterTurns:
			typeof settings.clearAfterTurns === "number" && settings.clearAfterTurns > 0
				? settings.clearAfterTurns
				: DEFAULT_SETTINGS.clearAfterTurns,
		keepRecent:
			typeof settings.keepRecent === "number" && settings.keepRecent >= 0
				? settings.keepRecent
				: DEFAULT_SETTINGS.keepRecent,
		minSizeToClear:
			typeof settings.minSizeToClear === "number" && settings.minSizeToClear > 0
				? settings.minSizeToClear
				: DEFAULT_SETTINGS.minSizeToClear,
		eligibleTools: settings.eligibleTools ?? DEFAULT_SETTINGS.eligibleTools,
	};
}

/**
 * `transformContext` implementation: clear stale tool results in place.
 *
 * The original messages are NOT mutated. We return a new array with
 * replaced entries so call sites can pass it to the LLM. A small
 * "cleared" marker replaces the content so the LLM still knows a
 * result was there (and the tool result id, which is required by
 * the OpenAI/Anthropic APIs, is preserved).
 */
export function clearStaleToolResults(
	messages: AgentMessage[],
	settings: ToolResultClearingSettings | undefined = undefined,
): AgentMessage[] {
	const cfg = resolveToolResultClearingSettings(settings);
	if (!cfg.enabled) return messages;

	// First pass: collect tool results in order, oldest first.
	const toolResultIndices: number[] = [];
	for (let i = 0; i < messages.length; i += 1) {
		if (messages[i].role === "toolResult") {
			toolResultIndices.push(i);
		}
	}

	if (toolResultIndices.length === 0) return messages;

	// Decide which results to clear. Keep the most recent N. The
	// "clear after N turns" rule is implemented as: the result is
	// cleared if it is older than (clearAfterTurns) user-message
	// boundaries away. We approximate that as "not in the last K
	// results" where K = clearAfterTurns * 2 (rough heuristic: ~2
	// tool results per turn).
	const totalResults = toolResultIndices.length;
	const clearThresholdIdx = Math.max(0, totalResults - cfg.keepRecent - cfg.clearAfterTurns * 2);

	let changed = false;
	const out: AgentMessage[] = messages.slice();

	for (let n = 0; n < totalResults; n += 1) {
		if (n >= clearThresholdIdx) continue; // keep recent
		const idx = toolResultIndices[n];
		const msg = out[idx] as ToolResultMessage;
		// Only clear eligible tools.
		const toolName = msg.toolName;
		if (toolName && !cfg.eligibleTools.has(toolName)) continue;
		// Only clear messages whose content is at least minSizeToClear.
		const content = msg.content;
		const size = measureContentSize(content);
		if (size < cfg.minSizeToClear) continue;
		// Build the replacement.
		const replacement: ToolResultMessage = {
			...msg,
			content: [
				{
					type: "text",
					text: `[cleared: ${toolName ?? "tool"} result trimmed, original size ${size} bytes; re-run the tool if you need the data again]`,
				},
			],
		};
		out[idx] = replacement;
		changed = true;
	}

	return changed ? out : messages;
}

function measureContentSize(content: ToolResultMessage["content"]): number {
	if (typeof content === "string") return Buffer.byteLength(content, "utf-8");
	if (Array.isArray(content)) {
		let total = 0;
		for (const block of content) {
			if (typeof block === "string") {
				total += Buffer.byteLength(block, "utf-8");
			} else if (block && typeof block === "object" && "text" in block && typeof block.text === "string") {
				total += Buffer.byteLength(block.text, "utf-8");
			} else {
				total += 64; // image or other — count as 64 bytes
			}
		}
		return total;
	}
	return 0;
}
