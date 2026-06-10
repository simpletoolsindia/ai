/**
 * Markdown transcript exporter.
 *
 * Produces a clean, readable Markdown file from a session:
 * - Session metadata header
 * - Each message as a section with role, timestamp, model (for assistant)
 * - User text content as plain paragraphs / quoted blocks
 * - Assistant text as Markdown content (preserved as-is)
 * - Assistant thinking as blockquoted sections
 * - Tool calls as fenced code blocks with the tool name, args, and a details summary
 * - Tool results as fenced code blocks with a success/error indicator
 * - Compaction and branch summary as special callouts
 *
 * Designed to be copy-pasteable into docs, wikis, and chat tools.
 */

import type { AgentState } from "@simpletoolsindiaorg/ai-agent";
import { existsSync, writeFileSync } from "fs";
import { basename } from "path";
import { APP_NAME } from "../../config.ts";
import { normalizePath } from "../../utils/paths.ts";
import type { SessionEntry, SessionManager } from "../session-manager.ts";

export interface MarkdownExportOptions {
	/** Output file path. If omitted, generates a default name next to the session. */
	outputPath?: string;
	/** Include thinking blocks in the output. Default: false (folded into a details block). */
	includeThinking?: boolean;
	/** Include tool result details. Default: true. */
	includeToolResults?: boolean;
	/** Include compaction / branch summary entries. Default: true. */
	includeCompaction?: boolean;
}

function formatTimestamp(ts: number | string | undefined): string {
	if (!ts) return "unknown";
	const n = typeof ts === "string" ? Date.parse(ts) : ts;
	if (!Number.isFinite(n)) return "unknown";
	try {
		return new Date(n).toISOString();
	} catch {
		return "unknown";
	}
}

function escapeMarkdownInline(s: string): string {
	// Escape characters that have special meaning in inline contexts
	return s.replace(/([\\`*_{}[\]()#.!+-])/g, "\\$1");
}

function renderUserText(text: string): string {
	// User-typed text is rendered as plain Markdown. Don't escape — preserve user formatting.
	// Trim trailing newlines and ensure single trailing newline.
	return text.replace(/\r\n/g, "\n").replace(/\n+$/, "\n");
}

function renderAssistantText(text: string): string {
	// Assistant text is already Markdown from the model — pass through.
	return text.replace(/\r\n/g, "\n").replace(/\n+$/, "\n");
}

function renderToolArgsJson(value: unknown): string {
	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return String(value);
	}
}

function renderToolResultText(content: unknown): string {
	if (Array.isArray(content)) {
		const parts: string[] = [];
		for (const block of content) {
			if (block && typeof block === "object" && "type" in block) {
				if (block.type === "text" && typeof (block as { text?: string }).text === "string") {
					parts.push((block as { text: string }).text);
				} else if (block.type === "image") {
					const data = (block as { data?: string; mimeType?: string }).data;
					const mime = (block as { mimeType?: string }).mimeType || "image";
					parts.push(`[image: ${mime}${data ? `, ${data.length} bytes of base64 data` : ""}]`);
				} else {
					parts.push(JSON.stringify(block));
				}
			} else {
				parts.push(String(block));
			}
		}
		return parts.join("\n");
	}
	if (content === null || content === undefined) return "";
	if (typeof content === "string") return content;
	try {
		return JSON.stringify(content, null, 2);
	} catch {
		return String(content);
	}
}

function renderEntryAsMarkdown(
	entry: SessionEntry,
	options: Required<Omit<MarkdownExportOptions, "outputPath">>,
): string {
	const out: string[] = [];

	switch (entry.type) {
		case "message": {
			const msg = entry.message;
			if (msg.role === "user") {
				const ts = formatTimestamp((msg as { timestamp?: number }).timestamp);
				const userText = Array.isArray((msg as { content: unknown }).content)
					? (msg as { content: Array<{ type: string; text?: string }> }).content
							.filter((b) => b.type === "text" && typeof b.text === "string")
							.map((b) => (b as { text: string }).text)
							.join("\n")
					: ((msg as { content: string }).content as string);
				out.push(`## User — ${ts}`);
				out.push("");
				out.push(renderUserText(userText));
				out.push("");
			} else if (msg.role === "assistant") {
				const ts = formatTimestamp((msg as { timestamp?: number }).timestamp);
				const model = (msg as { model?: string }).model || "unknown";
				const responseModel = (msg as { responseModel?: string }).responseModel;
				const stopReason = (msg as { stopReason?: string }).stopReason;
				const errorMessage = (msg as { errorMessage?: string }).errorMessage;
				const usage = (msg as { usage?: { input: number; output: number; totalTokens?: number } }).usage;
				const blocks = (msg as { content: unknown[] }).content;
				const hasThinking = blocks.some((b) => (b as { type?: string }).type === "thinking");
				const modelLine = responseModel && responseModel !== model ? `${model} → ${responseModel}` : model;
				out.push(`## Assistant — ${ts} — ${modelLine}`);
				if (errorMessage) {
					out.push("");
					out.push(`> **Error:** ${errorMessage}`);
				}
				if (stopReason && stopReason !== "stop" && stopReason !== "end_turn") {
					out.push("");
					out.push(`> **Stop reason:** \`${stopReason}\``);
				}
				if (usage && (usage.input || usage.output)) {
					const parts: string[] = [];
					if (usage.input) parts.push(`↑${usage.input} in`);
					if (usage.output) parts.push(`↓${usage.output} out`);
					if (typeof usage.totalTokens === "number") parts.push(`${usage.totalTokens} total`);
					out.push(`> _Usage:_ ${parts.join(", ")}`);
				}
				out.push("");

				for (const block of blocks) {
					const b = block as {
						type?: string;
						text?: string;
						thinking?: string;
						name?: string;
						arguments?: unknown;
						id?: string;
					};
					if (b.type === "text" && typeof b.text === "string") {
						out.push(renderAssistantText(b.text));
						out.push("");
					} else if (b.type === "thinking" && typeof b.thinking === "string") {
						if (options.includeThinking) {
							out.push("> **Thinking:**");
							out.push(">");
							for (const line of b.thinking.split("\n")) {
								out.push(`> ${line}`);
							}
							out.push("");
						}
						// When not including thinking, skip silently
					} else if (b.type === "toolCall" && typeof b.name === "string") {
						const toolName = b.name;
						const args = b.arguments;
						const id = b.id || "";
						out.push(`### Tool call: \`${toolName}\``);
						if (id) {
							out.push(`<sub>id: \`${id}\`</sub>`);
						}
						out.push("");
						out.push("```json");
						out.push(renderToolArgsJson(args));
						out.push("```");
						out.push("");
					}
				}

				// If a turn had both text and tool calls, append a note about stop reason
				if (hasThinking && !options.includeThinking) {
					// Already explained inline — nothing more
				}
			} else if (msg.role === "toolResult") {
				if (!options.includeToolResults) {
					return "";
				}
				const ts = formatTimestamp((msg as { timestamp?: number }).timestamp);
				const toolName = (msg as { toolName?: string }).toolName || "unknown";
				const toolCallId = (msg as { toolCallId?: string }).toolCallId || "";
				const isError = (msg as { isError?: boolean }).isError || false;
				const content = (msg as { content: unknown }).content;
				const status = isError ? "❌ Error" : "✅ Success";
				out.push(`### Tool result: \`${toolName}\` — ${status} — ${ts}`);
				if (toolCallId) {
					out.push(`<sub>for: \`${toolCallId}\`</sub>`);
				}
				out.push("");
				out.push("```");
				out.push(renderToolResultText(content));
				out.push("```");
				out.push("");
			}
			break;
		}
		case "compaction": {
			if (!options.includeCompaction) return "";
			out.push(`## Compaction — ${formatTimestamp((entry as { timestamp?: string }).timestamp)}`);
			out.push("");
			out.push("> _Context was compacted at this point._");
			out.push("");
			const summary = (entry as { summary?: string }).summary;
			if (summary) {
				out.push("**Summary:**");
				out.push("");
				out.push(renderAssistantText(summary));
				out.push("");
			}
			break;
		}
		case "branch_summary": {
			if (!options.includeCompaction) return "";
			const summary = (entry as { summary?: string; fromId?: string }).summary;
			const fromId = (entry as { fromId?: string }).fromId;
			out.push(`## Branch summary${fromId ? ` (from \`${fromId.slice(0, 8)}\`)` : ""}`);
			out.push("");
			if (summary) {
				out.push(renderAssistantText(summary));
				out.push("");
			}
			break;
		}
		case "custom": {
			const custom = entry as { customType?: string; data?: unknown; display?: boolean };
			if (custom.display === false) return "";
			out.push(`## Custom: \`${custom.customType || "unknown"}\``);
			out.push("");
			out.push("```json");
			out.push(renderToolArgsJson(custom.data));
			out.push("```");
			out.push("");
			break;
		}
		case "label": {
			const label = (entry as { label?: string }).label;
			if (label) {
				out.push(`> **Label:** ${escapeMarkdownInline(label)}`);
				out.push("");
			}
			break;
		}
		// Other entry types (session_header, etc.) are emitted as front-matter at the top, not here
		default:
			break;
	}

	return out.join("\n");
}

function buildMarkdownHeader(sm: SessionManager, includeThinking: boolean, state?: AgentState): string {
	const header = sm.getHeader();
	const entries = sm.getEntries();
	const userTurns = entries.filter(
		(e) => e.type === "message" && (e as { message?: { role?: string } }).message?.role === "user",
	).length;
	const assistantTurns = entries.filter(
		(e) => e.type === "message" && (e as { message?: { role?: string } }).message?.role === "assistant",
	).length;
	const toolCalls = entries.filter(
		(e) =>
			e.type === "message" &&
			(e as { message?: { role?: string; content?: unknown[] } }).message?.role === "assistant" &&
			Array.isArray((e as { message: { content: unknown[] } }).message.content) &&
			(e as { message: { content: Array<{ type?: string }> } }).message.content.some((b) => b.type === "toolCall"),
	).length;
	const compactions = entries.filter((e) => e.type === "compaction").length;

	const out: string[] = [];
	out.push(`# ${APP_NAME} Session Transcript`);
	out.push("");
	out.push("## Session Metadata");
	out.push("");
	out.push(`- **Session ID:** \`${header?.id || sm.getSessionId() || "unknown"}\``);
	if (header?.timestamp) {
		out.push(`- **Created:** ${formatTimestamp(header.timestamp)}`);
	}
	if (header?.cwd) {
		out.push(`- **Working directory:** \`${header.cwd}\``);
	}
	if (state?.model?.id) {
		out.push(`- **Model:** \`${state.model.id}\``);
	}
	if (state?.systemPrompt) {
		// Show just the first line of the system prompt as a preview
		const firstLine = state.systemPrompt.split("\n").find((l) => l.trim().length > 0) || "";
		if (firstLine.length > 0) {
			const preview = firstLine.length > 100 ? `${firstLine.slice(0, 100)}…` : firstLine;
			out.push(`- **System prompt preview:** ${escapeMarkdownInline(preview)}`);
		}
	}
	out.push(`- **User turns:** ${userTurns}`);
	out.push(`- **Assistant turns:** ${assistantTurns}`);
	out.push(`- **Tool calls:** ${toolCalls}`);
	out.push(`- **Compactions:** ${compactions}`);
	if (includeThinking) {
		out.push(`- **Thinking blocks:** included`);
	} else {
		out.push(`- **Thinking blocks:** excluded (default)`);
	}
	out.push("");
	out.push("---");
	out.push("");
	return out.join("\n");
}

/**
 * Export a session to Markdown.
 * @param sm SessionManager with the session loaded
 * @param state Optional AgentState for model/system-prompt metadata
 * @param options Output path and content filters
 * @returns Path to the exported file
 */
export function exportSessionToMarkdown(
	sm: SessionManager,
	state?: AgentState,
	options?: MarkdownExportOptions | string,
): string {
	const opts: MarkdownExportOptions = typeof options === "string" ? { outputPath: options } : options || {};
	const includeThinking = opts.includeThinking ?? false;
	const includeToolResults = opts.includeToolResults ?? true;
	const includeCompaction = opts.includeCompaction ?? true;

	const sessionFile = sm.getSessionFile();
	if (!sessionFile) {
		throw new Error("Cannot export in-memory session to Markdown");
	}
	if (!existsSync(sessionFile)) {
		throw new Error("Nothing to export yet — start a conversation first");
	}

	const branchEntries = sm.getBranch();

	const out: string[] = [];
	out.push(buildMarkdownHeader(sm, includeThinking, state));
	for (const entry of branchEntries) {
		const md = renderEntryAsMarkdown(entry, {
			includeThinking,
			includeToolResults,
			includeCompaction,
		});
		if (md) out.push(md);
	}
	const body = out.join("").replace(/\n{3,}/g, "\n\n");

	let outputPath = opts.outputPath ? normalizePath(opts.outputPath) : undefined;
	if (!outputPath) {
		const sessionBasename = basename(sessionFile, ".jsonl");
		outputPath = `${APP_NAME}-session-${sessionBasename}.md`;
	}
	writeFileSync(outputPath, body, "utf8");
	return outputPath;
}
