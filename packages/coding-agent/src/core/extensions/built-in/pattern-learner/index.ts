/**
 * pattern-learner — built-in extension for the ai coding agent.
 *
 * Observes tool-call and turn events, runs pattern detection in a
 * background worker thread (so the main agent loop is never blocked),
 * and injects a compact "learned user patterns" hint into the system
 * prompt via the `before_agent_start` event hook.
 *
 * OFF BY DEFAULT — enable it in `~/.ai/agent/settings.json`:
 *   { "patternLearner": { "enabled": true } }
 *
 * Disable at runtime: `/patterns off`.
 *
 * Storage: `~/.ai/agent/patterns/<project-hash>.json` (chmod 0o700
 * dir). One profile per project (cwd hash). Plain JSON, no DB.
 *
 * What it tracks:
 *   - Per-tool call counts
 *   - Per-tool duration running average
 *   - Top tool transitions (A -> B)
 *   - Recurring user phrases (truncated to 20)
 *   - Turn count
 *
 * What it deliberately does NOT track:
 *   - Secrets, file contents, env vars
 *   - PII beyond the file paths the user navigated to
 *   - Cross-project data (each project has its own profile)
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import type { ExtensionAPI } from "@simpletoolsindiaorg/ai-coding-agent";
import { loadProfile, type PatternProfile, summarizeProfile } from "./store.ts";

const SETTINGS_KEY = "patternLearner";

interface PatternLearnerSettings {
	enabled?: boolean;
}

function loadSettings(): Required<PatternLearnerSettings> {
	try {
		const settingsPath = join(homedir(), ".ai", "agent", "settings.json");
		if (!existsSync(settingsPath)) return { enabled: false };
		const raw = JSON.parse(readFileSync(settingsPath, "utf-8")) as Record<string, unknown>;
		const pl = (raw?.[SETTINGS_KEY] ?? {}) as PatternLearnerSettings;
		return { enabled: pl.enabled === true };
	} catch {
		return { enabled: false };
	}
}

interface PatternEvent {
	kind: "tool_call" | "tool_end" | "turn_start" | "user_message";
	toolName?: string;
	durationMs?: number;
	phrase?: string;
}

const FLUSH_INTERVAL_MS = 15_000;
const INGEST_BATCH_INTERVAL_MS = 2_000;
const INGEST_BATCH_MAX = 32;

export default function (pi: ExtensionAPI) {
	const settings = loadSettings();
	if (!settings.enabled) {
		pi.on("session_start", async () => {
			process.stderr.write(
				"[pattern-learner] installed but disabled. Enable with `patternLearner.enabled = true` in ~/.ai/agent/settings.json.\n",
			);
		});
		return;
	}

	let cwd = "";
	let worker: Worker | undefined;
	let flushTimer: NodeJS.Timeout | undefined;
	let ingestTimer: NodeJS.Timeout | undefined;
	let ingestQueue: PatternEvent[] = [];
	let lastProfile: PatternProfile | undefined;
	let disabled = false;

	function ensureWorker(cwdArg: string): Worker | undefined {
		if (disabled) return undefined;
		if (worker) return worker;
		try {
			const here = dirname(fileURLToPath(import.meta.url));
			const script = join(here, "worker-script.ts");
			const w = new Worker(script);
			w.on("error", (err) => {
				process.stderr.write(`[pattern-learner] worker error: ${err.message}\n`);
				worker = undefined;
			});
			w.on("exit", (code) => {
				if (code !== 0) {
					process.stderr.write(`[pattern-learner] worker exited with code ${code}\n`);
				}
				worker = undefined;
			});
			worker = w;
			cwd = cwdArg;
			return w;
		} catch (err) {
			process.stderr.write(
				`[pattern-learner] could not start worker: ${err instanceof Error ? err.message : err}\n`,
			);
			disabled = true;
			return undefined;
		}
	}

	function dispatch(events: PatternEvent[], cwdArg: string): void {
		const w = ensureWorker(cwdArg);
		if (!w) return;
		w.postMessage({ type: "ingest", events, cwd: cwdArg });
	}

	function flush(cwdArg: string): void {
		const w = ensureWorker(cwdArg);
		if (!w) return;
		w.postMessage({ type: "flush", cwd: cwdArg });
	}

	function enqueue(ev: PatternEvent, cwdArg: string): void {
		ingestQueue.push(ev);
		if (ingestQueue.length >= INGEST_BATCH_MAX) {
			const batch = ingestQueue;
			ingestQueue = [];
			dispatch(batch, cwdArg);
		}
	}

	// On session start: load existing profile, set up timers.
	pi.on("session_start", async () => {
		const startCwd = process.cwd();
		cwd = startCwd;
		lastProfile = loadProfile(startCwd);
		ensureWorker(startCwd);

		flushTimer = setInterval(() => {
			if (cwd) flush(cwd);
		}, FLUSH_INTERVAL_MS);
		// Allow the process to exit even with the timer running.
		flushTimer.unref?.();

		ingestTimer = setInterval(() => {
			if (ingestQueue.length > 0 && cwd) {
				const batch = ingestQueue;
				ingestQueue = [];
				dispatch(batch, cwd);
			}
		}, INGEST_BATCH_INTERVAL_MS);
		ingestTimer.unref?.();
	});

	pi.on("session_shutdown", async () => {
		if (ingestQueue.length > 0 && cwd) {
			dispatch(ingestQueue, cwd);
			ingestQueue = [];
		}
		if (cwd) flush(cwd);
		if (flushTimer) clearInterval(flushTimer);
		if (ingestTimer) clearInterval(ingestTimer);
		if (worker) {
			await worker.terminate().catch(() => {});
			worker = undefined;
		}
	});

	pi.on("turn_start", async () => {
		const c = cwd || process.cwd();
		enqueue({ kind: "turn_start" }, c);
	});

	pi.on("tool_execution_start", async (event) => {
		const c = cwd || process.cwd();
		const toolName = (event as { toolName?: string }).toolName;
		if (toolName) enqueue({ kind: "tool_call", toolName }, c);
	});

	pi.on("tool_execution_end", async (event) => {
		const c = cwd || process.cwd();
		const toolName = (event as { toolName?: string }).toolName;
		const durationMs = (event as { durationMs?: number }).durationMs;
		if (toolName) enqueue({ kind: "tool_end", toolName, durationMs }, c);
	});

	// Capture user prompts (truncated, only the first 200 chars).
	pi.on("input", async (event) => {
		const c = cwd || process.cwd();
		const text = (event as { text?: string }).text;
		if (typeof text === "string" && text.length >= 4) {
			enqueue({ kind: "user_message", phrase: text.slice(0, 200) }, c);
		}
	});

	// Inject the learned patterns into the system prompt before each
	// turn. The hint is short and human-readable so the LLM can use
	// it as a tie-breaker for style / workflow decisions without
	// dominating the context window.
	pi.on("before_agent_start", async (event) => {
		// Reload from disk in case another ai process wrote a fresher
		// profile since session_start. Cheap JSON read.
		if (cwd) lastProfile = loadProfile(cwd) ?? lastProfile;
		const summary = summarizeProfile(lastProfile);
		const hint = `<user_patterns>\nAuto-learned from previous sessions in this project. Use as a soft hint, not a hard rule. Disable with /patterns off.\n\n${summary}\n</user_patterns>`;
		return { systemPrompt: `${event.systemPrompt}\n\n${hint}` };
	});

	// Slash command: /patterns [on|off|show|clear]
	pi.registerCommand("patterns", {
		description: "Manage the pattern learner (on, off, show, clear).",
		handler: async (args, ctx) => {
			const sub = (args.trim().split(/\s+/)[0] || "").toLowerCase();
			if (sub === "off") {
				disabled = true;
				if (worker) {
					await worker.terminate().catch(() => {});
					worker = undefined;
				}
				ctx.ui.notify("Pattern learner disabled for this session.", "info");
				return;
			}
			if (sub === "on") {
				disabled = false;
				ensureWorker(cwd || process.cwd());
				ctx.ui.notify("Pattern learner re-enabled.", "info");
				return;
			}
			if (sub === "clear") {
				const fs = await import("node:fs/promises");
				const dir = join(homedir(), ".ai", "agent", "patterns");
				if (existsSync(dir)) {
					const files = await fs.readdir(dir);
					for (const f of files) await fs.unlink(join(dir, f)).catch(() => {});
				}
				lastProfile = undefined;
				ctx.ui.notify("Cleared all pattern profiles.", "info");
				return;
			}
			// Default: show current profile summary
			const summary = summarizeProfile(lastProfile);
			ctx.ui.notify(summary, "info");
		},
	});
}
