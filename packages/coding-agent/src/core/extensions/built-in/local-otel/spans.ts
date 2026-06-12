/**
 * local-otel/spans — span record types and helpers.
 *
 * Span shape is OTel-compatible (a subset) so the JSONL output can be
 * post-processed with standard tools (otel-cli, jq, ES ingest
 * pipelines, etc.) without an OTel collector. Each line in the log
 * file is a self-contained JSON object representing one span.
 */

import { createHash, randomBytes } from "node:crypto";

/** Monotonic clock for duration. */
const NS_PER_MS = 1_000_000;

function randomHex(bytes: number): string {
	return randomBytes(bytes).toString("hex");
}

export type SpanKind = "internal" | "llm" | "tool" | "session";

export interface SpanEvent {
	/** Event name (e.g. "gen_ai.prompt", "tool.exception"). */
	name: string;
	/** Time of the event in ms since epoch. */
	timeMs: number;
	/** Event attributes. */
	attributes: Record<string, unknown>;
}

export interface SpanRecord {
	traceId: string;
	spanId: string;
	parentSpanId: string | undefined;
	name: string;
	kind: SpanKind;
	startTimeMs: number;
	endTimeMs: number;
	durationMs: number;
	attributes: Record<string, unknown>;
	events: SpanEvent[];
	status: { code: "ok" | "error"; message?: string };
}

/** Build a stable 16-byte trace ID from a session id. */
export function makeTraceId(sessionId: string | undefined): string {
	const seed = sessionId ?? `${Date.now()}-${Math.random()}`;
	return createHash("sha256").update(seed).digest("hex").slice(0, 32);
}

/** 16-byte random span ID. */
export function makeSpanId(): string {
	return randomHex(8);
}

/** A safe, small random ID for attribute references. */
export function shortId(): string {
	return randomHex(4);
}

/** Get current time in ms since epoch. */
export function nowMs(): number {
	return Date.now();
}

/** Convert ms to a coarse nanosecond-style integer (we keep ms, no ns precision). */
export function msToNs(ms: number): number {
	return Math.round(ms * NS_PER_MS);
}

/** Helper to truncate long text in attributes to keep spans small. */
export function truncate(text: string, maxBytes: number): string {
	if (typeof text !== "string") return String(text);
	const bytes = Buffer.byteLength(text, "utf-8");
	if (bytes <= maxBytes) return text;
	// Slice by character count (good enough — bytes ≈ chars for ASCII, close
	// enough for most prompts). Mark the truncation explicitly so the
	// reader knows there is more.
	const slice = text.slice(0, maxBytes);
	return `${slice}\n\n[... truncated, original size: ${bytes} bytes ...]`;
}

/** Try to read a string field from an unknown args bag. */
export function getArgString(args: unknown, key: string): string | undefined {
	if (args && typeof args === "object") {
		const v = (args as Record<string, unknown>)[key];
		if (typeof v === "string") return v;
	}
	return undefined;
}
