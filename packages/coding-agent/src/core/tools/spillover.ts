/**
 * Spillover helper for large tool outputs.
 *
 * When a tool's response is truncated to fit inline in the LLM context,
 * the full content can be written to a temp file. The tool then
 * references the path in its response, and the LLM can use the `read`
 * tool to view the file on demand.
 *
 * Files are written to ~/.ai/agent/cache/webfetch/ with a random
 * suffix. Old files are garbage-collected at startup.
 */

import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "../../config.ts";

const SPILLOVER_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Resolved lazily so test overrides via $AI_CODING_AGENT_DIR take effect
// after the module has been imported.
let _spilloverDir: string | undefined;
function spilloverDir(): string {
	if (!_spilloverDir) {
		_spilloverDir = join(getAgentDir(), "cache", "webfetch");
	}
	return _spilloverDir;
}

export interface SpilloverResult {
	/** Absolute path to the temp file containing the full content. */
	path: string;
	/** Size of the file in bytes. */
	bytes: number;
}

/**
 * Ensure the spillover directory exists. Called lazily on first use.
 */
function ensureSpilloverDir(): void {
	if (!existsSync(spilloverDir())) {
		mkdirSync(spilloverDir(), { recursive: true });
	}
}

/**
 * Write content to a temp file in the spillover directory.
 * Returns the absolute path and byte count.
 *
 * @param content The full (untruncated) content to spill to disk.
 * @param extension File extension (default "md"; use "txt" for plain, "json" for JSON).
 */
export function spillToDisk(content: string, extension: string = "md"): SpilloverResult {
	ensureSpilloverDir();
	const suffix = randomBytes(8).toString("hex");
	const filename = `fetch-${Date.now()}-${suffix}.${extension}`;
	const filepath = join(spilloverDir(), filename);
	writeFileSync(filepath, content, "utf-8");
	const bytes = statSync(filepath).size;
	return { path: filepath, bytes };
}

/**
 * Garbage-collect spillover files older than the TTL.
 * Safe to call repeatedly; typically called once at session start.
 */
export function gcSpillover(olderThanMs: number = SPILLOVER_TTL_MS): number {
	if (!existsSync(spilloverDir())) {
		return 0;
	}
	const now = Date.now();
	let removed = 0;
	for (const entry of readdirSync(spilloverDir())) {
		const filepath = join(spilloverDir(), entry);
		try {
			const stat = statSync(filepath);
			if (now - stat.mtimeMs > olderThanMs) {
				rmSync(filepath, { force: true });
				removed++;
			}
		} catch {
			// Ignore unreadable files
		}
	}
	return removed;
}
