/**
 * Worker script for the pattern-learner extension.
 *
 * Runs in a separate thread so pattern detection never blocks the
 * main agent loop. Receives:
 *   - { type: "ingest", events: PatternEvent[] }: batch of tool-call
 *     / turn-start events from the main thread
 *   - { type: "flush" }: write the current profile to disk now
 *   - { type: "snapshot" }: return the current in-memory profile
 *
 * Posts back:
 *   - { type: "snapshot", profile: PatternProfile }
 *   - { type: "error", message: string }
 *
 * The worker is long-lived for the duration of the session and is
 * terminated on session_shutdown.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parentPort } from "node:worker_threads";

interface IngestEvent {
	kind: "tool_call" | "tool_end" | "turn_start" | "user_message";
	toolName?: string;
	durationMs?: number;
	phrase?: string;
}

interface IngestMessage {
	type: "ingest";
	events: IngestEvent[];
	cwd: string;
}

interface FlushMessage {
	type: "flush";
	cwd: string;
}

interface SnapshotMessage {
	type: "snapshot";
}

type IncomingMessage = IngestMessage | FlushMessage | SnapshotMessage;

interface Profile {
	projectHash: string;
	updatedAt: number;
	totalToolCalls: number;
	toolCounts: Record<string, number>;
	toolDurationsMs: Record<string, number>;
	topTransitions: Array<{ from: string; to: string; count: number }>;
	topPhrases: string[];
	turns: number;
}

function hashProject(cwd: string): string {
	return createHash("sha256").update(cwd).digest("hex").slice(0, 16);
}

function profilePath(cwd: string): string {
	return join(homedir(), ".ai", "agent", "patterns", `${hashProject(cwd)}.json`);
}

let lastToolName: string | undefined;

function emptyProfile(cwd: string): Profile {
	return {
		projectHash: hashProject(cwd),
		updatedAt: Date.now(),
		totalToolCalls: 0,
		toolCounts: {},
		toolDurationsMs: {},
		topTransitions: [],
		topPhrases: [],
		turns: 0,
	};
}

const profile: Profile = emptyProfile(process.cwd());

function ingest(events: IngestEvent[]): void {
	for (const ev of events) {
		if (ev.kind === "tool_call" && ev.toolName) {
			profile.toolCounts[ev.toolName] = (profile.toolCounts[ev.toolName] ?? 0) + 1;
			profile.totalToolCalls += 1;
			if (lastToolName && lastToolName !== ev.toolName) {
				recordTransition(lastToolName, ev.toolName);
			}
			lastToolName = ev.toolName;
		} else if (ev.kind === "tool_end" && ev.toolName) {
			if (typeof ev.durationMs === "number" && ev.durationMs > 0) {
				const prev = profile.toolDurationsMs[ev.toolName] ?? ev.durationMs;
				// Running median-ish: average of prev and new, biased toward new.
				profile.toolDurationsMs[ev.toolName] = Math.round(prev * 0.7 + ev.durationMs * 0.3);
			}
		} else if (ev.kind === "turn_start") {
			profile.turns += 1;
		} else if (ev.kind === "user_message" && ev.phrase) {
			const phrase = ev.phrase.trim();
			if (phrase.length < 4 || phrase.length > 200) continue;
			// Trivial frequency model: count, then keep top 20.
			const idx = profile.topPhrases.indexOf(phrase);
			if (idx === -1) {
				profile.topPhrases.push(phrase);
				if (profile.topPhrases.length > 20) profile.topPhrases.shift();
			}
		}
	}
}

function recordTransition(from: string, to: string): void {
	const existing = profile.topTransitions.find((t) => t.from === from && t.to === to);
	if (existing) {
		existing.count += 1;
	} else {
		profile.topTransitions.push({ from, to, count: 1 });
	}
	profile.topTransitions.sort((a, b) => b.count - a.count);
	if (profile.topTransitions.length > 12) {
		profile.topTransitions.length = 12;
	}
}

function flush(cwd: string): void {
	const dir = join(homedir(), ".ai", "agent", "patterns");
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
	const path = profilePath(cwd);
	if (existsSync(path)) {
		try {
			const existing = JSON.parse(readFileSync(path, "utf-8")) as Profile;
			// Merge with on-disk profile so a restart doesn't lose data.
			profile.toolCounts = mergeCounts(existing.toolCounts, profile.toolCounts);
			profile.totalToolCalls = Math.max(existing.totalToolCalls, profile.totalToolCalls);
			profile.turns = Math.max(existing.turns, profile.turns);
			profile.topTransitions = mergeTransitions(existing.topTransitions, profile.topTransitions);
			profile.topPhrases = mergePhrases(existing.topPhrases, profile.topPhrases);
		} catch {
			// Ignore corrupt on-disk profile; we will overwrite it.
		}
	}
	profile.updatedAt = Date.now();
	writeFileSync(path, JSON.stringify(profile, null, 2), "utf-8");
}

function mergeCounts(a: Record<string, number>, b: Record<string, number>): Record<string, number> {
	const out: Record<string, number> = { ...a };
	for (const [k, v] of Object.entries(b)) out[k] = (out[k] ?? 0) + v;
	return out;
}

function mergeTransitions(
	a: Array<{ from: string; to: string; count: number }>,
	b: Array<{ from: string; to: string; count: number }>,
): Array<{ from: string; to: string; count: number }> {
	const map = new Map<string, { from: string; to: string; count: number }>();
	for (const t of a) map.set(`${t.from}\0${t.to}`, { ...t });
	for (const t of b) {
		const key = `${t.from}\0${t.to}`;
		const existing = map.get(key);
		if (existing) existing.count += t.count;
		else map.set(key, { ...t });
	}
	const out = Array.from(map.values());
	out.sort((x, y) => y.count - x.count);
	return out.slice(0, 12);
}

function mergePhrases(a: string[], b: string[]): string[] {
	// Keep phrases that appear in either list (simple union).
	const set = new Set([...a, ...b]);
	return Array.from(set).slice(-20);
}

const port = parentPort;
if (!port) {
	throw new Error("pattern-learner worker requires parentPort");
}

port.on("message", (message: IncomingMessage) => {
	try {
		if (message.type === "ingest") {
			ingest(message.events);
		} else if (message.type === "flush") {
			flush(message.cwd);
		} else if (message.type === "snapshot") {
			port.postMessage({ type: "snapshot", profile });
		}
	} catch (error) {
		port.postMessage({
			type: "error",
			message: error instanceof Error ? error.message : String(error),
		});
	}
});
