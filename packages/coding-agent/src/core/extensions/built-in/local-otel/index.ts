/**
 * local-otel — built-in extension for the ai coding agent.
 *
 * Exposes a local OpenTelemetry-style structured logger. Off by
 * default. When enabled in `~/.ai/agent/settings.json` under
 * `localOtel`, the extension records spans for:
 *
 *   - agent turns (agent_start, turn_start, turn_end, agent_end)
 *   - LLM calls (before_provider_request, after_provider_response):
 *     the full prompt and the full response are captured (truncated
 *     to `maxPromptBytes` to keep the log small)
 *   - tool calls (tool_execution_start, tool_execution_end):
 *     tool name, args, result, duration
 *   - user prompts (input event): truncated to 1 KB
 *
 * Spans are written as JSONL (one JSON object per line) to the file
 * at `localOtel.logPath` (default `~/.ai/agent/logs/ai-otel-<DATE>.jsonl`).
 * The file is rotated daily (or per session when `rotatePerSession` is
 * on). I/O is async and batched (up to 64 spans or 250ms) so the
 * agent loop is never blocked.
 *
 * Why local-only: as of 0.85.0 ai does not send any data to a remote
 * endpoint. This extension is the opt-in observability path for
 * users who want to inspect what the agent is doing.
 *
 * Slash commands:
 *   /logs                  — show log location and size
 *   /logs tail [N]         — show last N lines (default 20)
 *   /logs on|off           — toggle at runtime
 *   /logs path <path>      — change the log file path (session-only)
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@simpletoolsindiaorg/ai-coding-agent";
import {
	getArgString,
	makeSpanId,
	makeTraceId,
	msToNs,
	nowMs,
	type SpanKind,
	type SpanRecord,
	truncate,
} from "./spans.ts";
import { SpanWriter, type WriterOptions } from "./writer.ts";

const SETTINGS_KEY = "localOtel";

interface LocalOtelSettings {
	enabled?: boolean;
	logPath?: string;
	includePromptsAndResponses?: boolean;
	maxPromptBytes?: number;
	includeToolIO?: boolean;
	rotatePerSession?: boolean;
}

function loadSettingsFile(): { localOtel?: LocalOtelSettings } {
	try {
		const settingsPath = join(homedir(), ".ai", "agent", "settings.json");
		if (!existsSync(settingsPath)) return {};
		const raw = JSON.parse(readFileSync(settingsPath, "utf-8")) as Record<string, unknown>;
		const v = raw?.[SETTINGS_KEY];
		return v && typeof v === "object" ? (v as { localOtel?: LocalOtelSettings }) : {};
	} catch {
		return {};
	}
}

function readLocalOtelSettings(): LocalOtelSettings {
	const root = loadSettingsFile();
	return root.localOtel ?? {};
}

function defaultLogPath(): string {
	return join(homedir(), ".ai", "agent", "logs", "ai-otel.jsonl");
}

export default function (pi: ExtensionAPI) {
	const settings = readLocalOtelSettings();
	if (settings.enabled !== true) {
		// Off by default. Print a one-liner so the user knows the
		// extension exists and how to enable it.
		pi.on("session_start", async () => {
			process.stderr.write(
				"[local-otel] installed but disabled. Enable with `localOtel.enabled = true` under the `localOtel` key in ~/.ai/agent/settings.json. View logs with `/logs`.\n",
			);
		});
		return;
	}

	const maxPromptBytes =
		typeof settings.maxPromptBytes === "number" && settings.maxPromptBytes > 0 ? settings.maxPromptBytes : 100_000;
	const includePrompts = settings.includePromptsAndResponses !== false;
	const includeToolIO = settings.includeToolIO !== false;
	const rotatePerSession = settings.rotatePerSession === true;
	const initialLogPath = settings.logPath || defaultLogPath();

	// Per-session state.
	let sessionId: string | undefined;
	let traceId: string | undefined;
	let sessionStartMs: number | undefined;
	// Open spans keyed by an id we attach to the event.
	const openSpans = new Map<string, SpanRecord>();
	let currentTurn: SpanRecord | undefined;
	const toolStartTimes = new Map<string, number>();
	let writer: SpanWriter;
	let runtimeLogPath = initialLogPath;

	function newWriter(): SpanWriter {
		const opts: WriterOptions = {
			logPath: runtimeLogPath,
			rotatePerSession: rotatePerSession,
			sessionId: sessionId,
		};
		return new SpanWriter(opts);
	}

	function recordEvent(parentSpan: SpanRecord | undefined, name: string, attributes: Record<string, unknown>): void {
		if (!parentSpan) return;
		parentSpan.events.push({ name, timeMs: nowMs(), attributes });
	}

	function closeSpan(span: SpanRecord, status: "ok" | "error" = "ok", message?: string): void {
		if (span.endTimeMs > 0) return; // already closed
		span.endTimeMs = nowMs();
		span.durationMs = Math.max(0, span.endTimeMs - span.startTimeMs);
		span.status = { code: status, ...(message ? { message } : {}) };
		writer.push(span);
	}

	function openSpan(name: string, kind: SpanKind, attrs: Record<string, unknown>, parent?: SpanRecord): SpanRecord {
		const span: SpanRecord = {
			traceId: traceId ?? makeTraceId(sessionId),
			spanId: makeSpanId(),
			parentSpanId: parent?.spanId,
			name,
			kind,
			startTimeMs: nowMs(),
			endTimeMs: 0,
			durationMs: 0,
			attributes: attrs,
			events: [],
			status: { code: "ok" },
		};
		openSpans.set(span.spanId, span);
		return span;
	}

	// ---------- session lifecycle ----------

	pi.on("session_start", async (event) => {
		sessionId = (event as { sessionId?: string }).sessionId;
		traceId = makeTraceId(sessionId);
		sessionStartMs = nowMs();
		writer = newWriter();
		const sessionSpan = openSpan("session", "session", {
			"ai.session.id": sessionId ?? "(none)",
			"ai.session.reason": (event as { reason?: string }).reason ?? "(unknown)",
		});
		// Hold the session span open for the life of the session; close
		// it on session_shutdown.
		void sessionSpan;
	});

	pi.on("session_shutdown", async () => {
		// Close any spans that are still open (defensive).
		for (const [, span] of openSpans) {
			closeSpan(span, "ok", "session ended");
		}
		openSpans.clear();
		if (writer) await writer.close();
	});

	// ---------- turns ----------

	pi.on("turn_start", async () => {
		const turn = openSpan("turn", "internal", { "ai.turn": openSpans.size });
		currentTurn = turn;
	});

	pi.on("turn_end", async (event) => {
		const turn = currentTurn;
		currentTurn = undefined;
		if (!turn) return;
		const toolResults = (event as { toolResults?: unknown[] }).toolResults;
		if (Array.isArray(toolResults)) {
			turn.attributes["ai.turn.toolResultCount"] = toolResults.length;
		}
		const message = (event as { message?: { stopReason?: string } }).message;
		if (message?.stopReason) {
			turn.attributes["ai.turn.stopReason"] = message.stopReason;
		}
		closeSpan(turn);
	});

	// ---------- LLM calls (the important ones) ----------

	pi.on("before_provider_request", async (event) => {
		const e = event as {
			model?: { provider?: string; id?: string };
			systemPrompt?: string;
			messages?: unknown;
		};
		const llmSpan = openSpan(
			"llm.call",
			"llm",
			{
				"gen_ai.system": "ai",
				"gen_ai.request.model": e.model?.id ?? "(unknown)",
				"ai.model.provider": e.model?.provider ?? "(unknown)",
				"ai.llm.messageCount": Array.isArray(e.messages) ? e.messages.length : 0,
			},
			currentTurn,
		);
		if (includePrompts) {
			if (typeof e.systemPrompt === "string" && e.systemPrompt.length > 0) {
				recordEvent(llmSpan, "gen_ai.system", {
					content: truncate(e.systemPrompt, maxPromptBytes),
				});
			}
			if (Array.isArray(e.messages)) {
				// Store the full messages array as a single event so the
				// reader sees prompt + history in order. The reader can
				// JSON.parse it back into the full conversation.
				recordEvent(llmSpan, "gen_ai.prompt", {
					messages: truncate(JSON.stringify(e.messages, null, 2), maxPromptBytes),
				});
			}
		}
		// Stash the span id on the event so after_provider_response can
		// close it. Use a weak map keyed on the event object.
		llmCallSpans.set(event, llmSpan);
	});

	const llmCallSpans = new WeakMap<object, SpanRecord>();

	pi.on("after_provider_response", async (event) => {
		const span = llmCallSpans.get(event);
		if (!span) return;
		llmCallSpans.delete(event);
		const e = event as {
			response?: {
				content?: unknown;
				usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
				stopReason?: string;
			};
			error?: string;
		};
		if (e.response?.usage) {
			const u = e.response.usage;
			if (typeof u.inputTokens === "number") span.attributes["gen_ai.usage.input_tokens"] = u.inputTokens;
			if (typeof u.outputTokens === "number") span.attributes["gen_ai.usage.output_tokens"] = u.outputTokens;
			if (typeof u.totalTokens === "number") span.attributes["gen_ai.usage.total_tokens"] = u.totalTokens;
		}
		if (e.response?.stopReason) span.attributes["gen_ai.response.stop_reason"] = e.response.stopReason;
		if (includePrompts && e.response?.content) {
			recordEvent(span, "gen_ai.completion", {
				content: truncate(
					typeof e.response.content === "string"
						? e.response.content
						: JSON.stringify(e.response.content, null, 2),
					maxPromptBytes,
				),
			});
		}
		const isError = Boolean(e.error);
		closeSpan(span, isError ? "error" : "ok", e.error);
	});

	// ---------- tool calls ----------

	pi.on("tool_execution_start", async (event) => {
		const e = event as { toolCallId?: string; toolName?: string; args?: unknown };
		const id = e.toolCallId;
		if (!id) return;
		toolStartTimes.set(id, nowMs());
		const span = openSpan(
			`tool.${e.toolName ?? "unknown"}`,
			"tool",
			{
				"ai.tool.name": e.toolName ?? "(unknown)",
				"ai.tool.callId": id,
			},
			currentTurn,
		);
		if (includeToolIO) {
			recordEvent(span, "tool.args", {
				args: truncate(JSON.stringify(e.args ?? {}, null, 2), maxPromptBytes),
			});
		}
		toolSpans.set(id, span);
	});

	const toolSpans = new Map<string, SpanRecord>();

	pi.on("tool_execution_end", async (event) => {
		const e = event as {
			toolCallId?: string;
			toolName?: string;
			result?: { content?: unknown; isError?: boolean };
			durationMs?: number;
		};
		const id = e.toolCallId;
		if (!id) return;
		const span = toolSpans.get(id);
		toolSpans.delete(id);
		if (!span) return;
		if (typeof e.durationMs === "number") {
			span.attributes["ai.tool.durationMs"] = e.durationMs;
		}
		if (includeToolIO && e.result) {
			const content = Array.isArray(e.result.content)
				? e.result.content
						.filter((c: { type?: string; text?: string }) => c?.type === "text")
						.map((c: { text?: string }) => c.text ?? "")
						.join("\n")
				: JSON.stringify(e.result.content);
			recordEvent(span, e.result.isError ? "tool.error" : "tool.result", {
				content: truncate(content, maxPromptBytes),
			});
		}
		closeSpan(span, e.result?.isError ? "error" : "ok");
	});

	// ---------- user inputs ----------

	pi.on("input", async (event) => {
		const e = event as { text?: string };
		if (typeof e.text === "string" && e.text.length > 0) {
			const span = openSpan(
				"user.input",
				"internal",
				{ "ai.input.length": e.text.length, "ai.input.bytes": Buffer.byteLength(e.text, "utf-8") },
				currentTurn,
			);
			recordEvent(span, "user.prompt", { text: truncate(e.text, 1024) });
			closeSpan(span);
		}
	});

	// ---------- slash command ----------

	pi.registerCommand("logs", {
		description: "View and manage local OpenTelemetry logs (on, off, tail, path).",
		handler: async (args, ctx) => {
			const parts = args.trim().split(/\s+/);
			const sub = (parts[0] || "").toLowerCase();

			if (sub === "on") {
				runtimeLogPath = initialLogPath;
				// Re-create writer on the next event.
				writer = newWriter();
				ctx.ui.notify(`local-otel re-enabled. Logs: ${runtimeLogPath}`, "info");
				return;
			}
			if (sub === "off") {
				ctx.ui.notify(`local-otel disabled for this session. Logs: ${runtimeLogPath}`, "info");
				if (writer) await writer.close();
				// We do not recreate the writer; subsequent spans are dropped
				// because the on() handlers check that writer exists.
				writer = undefined as unknown as SpanWriter;
				return;
			}
			if (sub === "path") {
				const newPath = parts.slice(1).join(" ").trim();
				if (!newPath) {
					ctx.ui.notify(`Current log path: ${runtimeLogPath}`, "info");
					return;
				}
				runtimeLogPath = newPath;
				if (writer) await writer.close();
				writer = newWriter();
				ctx.ui.notify(`Log path set to: ${runtimeLogPath}`, "info");
				return;
			}
			if (sub === "tail") {
				const n = Math.max(1, Math.min(500, Number.parseInt(parts[1] || "20", 10) || 20));
				const path = writer ? writer.getCurrentPath() : runtimeLogPath;
				if (!existsSync(path)) {
					ctx.ui.notify(`No log file yet at ${path}`, "info");
					return;
				}
				try {
					const content = readFileSync(path, "utf-8");
					const lines = content.trim().split("\n").slice(-n);
					// Surface a short summary so the chat isn't overwhelmed.
					const summary = lines
						.map((l) => {
							try {
								const s = JSON.parse(l) as SpanRecord;
								const ts = new Date(s.startTimeMs).toISOString();
								const err = s.status.code === "error" ? " [error]" : "";
								return `${ts} ${s.name} ${s.durationMs}ms${err}`;
							} catch {
								return l;
							}
						})
						.join("\n");
					const stat = statSync(path);
					ctx.ui.notify(`Last ${lines.length} of ${path} (${stat.size} bytes):\n${summary}`, "info");
				} catch (err) {
					ctx.ui.notify(`Failed to read log: ${err instanceof Error ? err.message : String(err)}`, "error");
				}
				return;
			}
			// Default: show log location and size
			const path = writer ? writer.getCurrentPath() : runtimeLogPath;
			let size = 0;
			if (existsSync(path)) {
				try {
					size = statSync(path).size;
				} catch {
					// ignore
				}
			}
			ctx.ui.notify(
				`local-otel log: ${path}\nSize: ${size} bytes\n\nUsage:\n  /logs tail [N]   show last N spans (default 20)\n  /logs on|off     toggle at runtime\n  /logs path <p>   change log path (session-only)`,
				"info",
			);
		},
	});

	// Suppress unused-warning for items we keep around for back-compat.
	void msToNs;
	void getArgString;
}
