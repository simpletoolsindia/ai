/**
 * Pattern store — persists learned user patterns to disk and reads
 * them back for system-prompt injection.
 *
 * Patterns are written to `~/.ai/agent/patterns/<project-hash>.json`.
 * The project hash is `sha256(cwd)` truncated to 16 hex chars, so each
 * project gets its own pattern profile and a user working in three
 * different repos does not contaminate the others.
 *
 * The store is intentionally simple: the pattern learner is opt-in
 * and the data is fully derived from public tool-call events. No
 * secrets, no PII beyond tool names and file paths the user
 * themselves navigated to.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface PatternProfile {
	projectHash: string;
	updatedAt: number;
	/** Total number of tool calls observed across all sessions. */
	totalToolCalls: number;
	/** Per-tool call count, e.g. { read: 42, edit: 17, bash: 9 }. */
	toolCounts: Record<string, number>;
	/** Per-tool median duration (ms). Useful to detect slow patterns. */
	toolDurationsMs: Record<string, number>;
	/** Top tool pairs (A -> B), e.g. { "edit->bash": 12, "bash->read": 9 }. */
	topTransitions: Array<{ from: string; to: string; count: number }>;
	/** Phrases the model / user said frequently. Capped to 20. */
	topPhrases: string[];
	/** Recent turn count the profile was built over. */
	turns: number;
}

const MAX_TOP_TRANSITIONS = 12;
const MAX_TOP_PHRASES = 20;

function getPatternsDir(): string {
	return join(homedir(), ".ai", "agent", "patterns");
}

export function hashProject(cwd: string): string {
	return createHash("sha256").update(cwd).digest("hex").slice(0, 16);
}

function getPatternPath(cwd: string): string {
	return join(getPatternsDir(), `${hashProject(cwd)}.json`);
}

function emptyProfile(cwd: string): PatternProfile {
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

export function loadProfile(cwd: string): PatternProfile | undefined {
	const path = getPatternPath(cwd);
	if (!existsSync(path)) return undefined;
	try {
		const raw = JSON.parse(readFileSync(path, "utf-8")) as PatternProfile;
		if (typeof raw.projectHash !== "string" || typeof raw.toolCounts !== "object") return undefined;
		return raw;
	} catch {
		return undefined;
	}
}

export function saveProfile(cwd: string, profile: PatternProfile): void {
	const dir = getPatternsDir();
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
	const path = getPatternPath(cwd);
	const next: PatternProfile = {
		...profile,
		updatedAt: Date.now(),
		topTransitions: profile.topTransitions.slice(0, MAX_TOP_TRANSITIONS),
		topPhrases: profile.topPhrases.slice(0, MAX_TOP_PHRASES),
	};
	writeFileSync(path, JSON.stringify(next, null, 2), "utf-8");
}

export function newProfile(cwd: string): PatternProfile {
	return emptyProfile(cwd);
}

/**
 * Build a short, human-readable summary of a pattern profile. Used
 * by the system-prompt appender so the LLM sees a compact hint, not
 * a raw counter dump.
 */
export function summarizeProfile(profile: PatternProfile | undefined): string {
	if (!profile || profile.totalToolCalls === 0) {
		return "No user patterns learned yet for this project.";
	}

	const top = Object.entries(profile.toolCounts)
		.sort((a, b) => b[1] - a[1])
		.slice(0, 5)
		.map(([name, count]) => `${name} (${count})`)
		.join(", ");

	const transitions = profile.topTransitions
		.slice(0, 4)
		.map((t) => `${t.from} \u2192 ${t.to} (\u00d7${t.count})`)
		.join("; ");

	const phrases = profile.topPhrases.slice(0, 4).join(" / ");

	const parts = [
		`Profile across ${profile.turns} turns / ${profile.totalToolCalls} tool calls.`,
		`Top tools: ${top}.`,
		transitions ? `Common transitions: ${transitions}.` : null,
		phrases ? `Recurring phrases: ${phrases}.` : null,
	].filter((p): p is string => !!p);

	return parts.join("\n");
}
