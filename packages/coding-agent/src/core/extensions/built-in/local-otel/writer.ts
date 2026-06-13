/**
 * local-otel/writer — async, non-blocking JSONL span writer.
 *
 * Writes one JSON span per line. The writer:
 *   - Holds a single in-flight write to keep memory low
 *   - Auto-rotates the file when the day changes (file name has the
 *     date baked in) or when `rotatePerSession` is on (one file per
 *     session, by session id)
 *   - Creates the parent directory on first write (mode 0o700)
 *   - Creates the file with mode 0o600
 *   - Batches up to 64 spans or 250ms before flushing, so a busy
 *     session does not stall on disk I/O
 *   - Falls back to a no-op on any I/O error and logs a one-line
 *     warning to stderr (NOT to the span file — that would loop)
 */

import { appendFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { SpanRecord } from "./spans.ts";

const BATCH_MAX = 64;
const BATCH_FLUSH_MS = 250;

export interface WriterOptions {
	logPath: string;
	rotatePerSession?: boolean;
	sessionId?: string;
}

export class SpanWriter {
	private queue: SpanRecord[] = [];
	private flushing = false;
	private currentPath: string | undefined;
	// biome-ignore lint/correctness/noUnusedPrivateClassMembers: assigned in pathForNow; kept for symmetry with the path/date/session trio
	private currentDate: string | undefined;
	// biome-ignore lint/correctness/noUnusedPrivateClassMembers: assigned in pathForNow; kept for symmetry with the path/date/session trio
	private currentSession: string | undefined;
	private timer: NodeJS.Timeout | undefined;
	private closed = false;
	private readonly options: WriterOptions;

	constructor(options: WriterOptions) {
		this.options = options;
	}

	/** Resolve the actual log file path for the current moment. */
	private pathForNow(): string {
		const base = this.options.logPath || this.defaultPath();
		if (!this.options.rotatePerSession) {
			// Date-stamped filename: append -YYYY-MM-DD before the .jsonl
			const date = new Date().toISOString().slice(0, 10);
			return base.replace(/\.jsonl$/i, `-${date}.jsonl`);
		}
		const session = this.options.sessionId ?? "session";
		// session-stamped filename
		return base.replace(/\.jsonl$/i, `-${session}.jsonl`);
	}

	/** Resolve the current path and re-evaluate on day/session change. */
	private resolvePath(): string {
		const path = this.pathForNow();
		const date = new Date().toISOString().slice(0, 10);
		const session = this.options.sessionId ?? "session";
		if (this.currentPath !== path) {
			this.currentPath = path;
			this.currentDate = date;
			this.currentSession = session;
		}
		return path;
	}

	private defaultPath(): string {
		return join(homedir(), ".ai", "agent", "logs", "ai-otel.jsonl");
	}

	/** Enqueue a span for writing. */
	push(span: SpanRecord): void {
		if (this.closed) return;
		this.queue.push(span);
		if (this.queue.length >= BATCH_MAX) {
			void this.flush();
		} else if (!this.timer) {
			this.timer = setTimeout(() => {
				this.timer = undefined;
				void this.flush();
			}, BATCH_FLUSH_MS);
			this.timer.unref?.();
		}
	}

	/** Flush the in-memory queue to disk. Idempotent and async-safe. */
	async flush(): Promise<void> {
		if (this.flushing) return;
		if (this.queue.length === 0) return;
		const batch = this.queue;
		this.queue = [];
		this.flushing = true;
		try {
			const path = this.resolvePath();
			await mkdir(dirname(path), { recursive: true, mode: 0o700 });
			const lines = `${batch.map((s) => JSON.stringify(s)).join("\n")}\n`;
			await appendFile(path, lines, { encoding: "utf-8", mode: 0o600 });
		} catch (err) {
			// Non-fatal: log to stderr but do not throw (we would crash
			// the agent loop). One-line warning per failed batch.
			const msg = err instanceof Error ? err.message : String(err);
			process.stderr.write(`[local-otel] write failed: ${msg}\n`);
		} finally {
			this.flushing = false;
		}
	}

	/** Force a flush (used at session shutdown). */
	async close(): Promise<void> {
		this.closed = true;
		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = undefined;
		}
		await this.flush();
	}

	/** Returns the path of the log file the writer is currently using. */
	getCurrentPath(): string {
		return this.currentPath ?? this.resolvePath();
	}
}
