/**
 * On-disk cache for the docs-resolver extension.
 *
 * Stores resolved documentation under `~/.ai/agent/cache/docs/<hash>.md`
 * with a TTL (default 1 day). Keeps recent lookups fast and reduces
 * load on the npm registry / GitHub raw endpoints.
 *
 * Cache entries are simple Markdown files with a sidecar JSON file
 * for metadata (fetchedAt, sourceUrl, ttlMs). Missing or corrupt
 * cache entries are treated as cache misses, never fatal.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 1 day

export interface CacheEntry {
	content: string;
	meta: {
		fetchedAt: number;
		sourceUrl: string;
		ttlMs: number;
		libraryId: string;
		topic?: string;
	};
}

function getCacheDir(): string {
	return join(homedir(), ".ai", "agent", "cache", "docs");
}

function ensureCacheDir(): void {
	const dir = getCacheDir();
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true, mode: 0o700 });
	}
}

function hashKey(libraryId: string, topic: string | undefined): string {
	const key = `${libraryId}\0${topic ?? ""}`;
	return createHash("sha256").update(key).digest("hex").slice(0, 32);
}

function cachePaths(hash: string): { contentPath: string; metaPath: string } {
	const dir = getCacheDir();
	return {
		contentPath: join(dir, `${hash}.md`),
		metaPath: join(dir, `${hash}.json`),
	};
}

/**
 * Look up a cached entry. Returns `undefined` on miss, expiry, or
 * corrupt cache. Never throws.
 */
export function cacheGet(libraryId: string, topic: string | undefined): CacheEntry | undefined {
	try {
		const hash = hashKey(libraryId, topic);
		const { contentPath, metaPath } = cachePaths(hash);
		if (!existsSync(contentPath) || !existsSync(metaPath)) return undefined;
		const meta = JSON.parse(readFileSync(metaPath, "utf-8")) as CacheEntry["meta"];
		if (typeof meta.fetchedAt !== "number" || typeof meta.ttlMs !== "number") {
			return undefined;
		}
		if (Date.now() - meta.fetchedAt > meta.ttlMs) {
			// Expired. Leave the file in place — we don't aggressively GC
			// to avoid extra filesystem I/O on every cache miss.
			return undefined;
		}
		const content = readFileSync(contentPath, "utf-8");
		return { content, meta };
	} catch {
		return undefined;
	}
}

/**
 * Write a cache entry. Failures are non-fatal: the resolver falls
 * back to the live fetch.
 */
export function cacheSet(libraryId: string, topic: string | undefined, content: string, sourceUrl: string): void {
	try {
		ensureCacheDir();
		const hash = hashKey(libraryId, topic);
		const { contentPath, metaPath } = cachePaths(hash);
		const meta: CacheEntry["meta"] = {
			fetchedAt: Date.now(),
			sourceUrl,
			ttlMs: DEFAULT_TTL_MS,
			libraryId,
			topic,
		};
		mkdirSync(dirname(contentPath), { recursive: true, mode: 0o700 });
		writeFileSync(contentPath, content, "utf-8");
		writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf-8");
	} catch {
		// Non-fatal.
	}
}

/** Clear the docs cache. Used by `/docs clear`. */
export function cacheClear(): { removed: number } {
	let removed = 0;
	const dir = getCacheDir();
	if (!existsSync(dir)) return { removed: 0 };
	try {
		const { readdirSync, statSync, unlinkSync } = require("node:fs") as typeof import("node:fs");
		for (const name of readdirSync(dir)) {
			const p = join(dir, name);
			try {
				if (statSync(p).isFile()) {
					unlinkSync(p);
					removed += 1;
				}
			} catch {
				// ignore individual file errors
			}
		}
	} catch {
		// ignore
	}
	return { removed };
}
