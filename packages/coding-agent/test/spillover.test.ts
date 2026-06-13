/**
 * Tests for the webfetch tool's spillover behavior.
 *
 * When the response exceeds the inline maxBytes cap, the full decoded
 * content is written to a temp file in ~/.ai/agent/cache/webfetch/
 * and the LLM is told the path. This test exercises that path.
 */

import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { gcSpillover, spillToDisk } from "../src/core/tools/spillover.ts";

const SPILLOVER_ROOT = join(tmpdir(), `spillover-test-${process.pid}-${Date.now()}`);

beforeEach(() => {
	// Force a clean spillover dir under getAgentDir() for the duration of the test
	mkdirSync(SPILLOVER_ROOT, { recursive: true });
	process.env.AI_CODING_AGENT_DIR = SPILLOVER_ROOT;
});

afterEach(() => {
	rmSync(SPILLOVER_ROOT, { recursive: true, force: true });
	delete process.env.AI_CODING_AGENT_DIR;
});

describe("spillToDisk", () => {
	it("writes content to ~/.ai/agent/cache/webfetch/", () => {
		const result = spillToDisk("hello world", "md");
		expect(existsSync(result.path)).toBe(true);
		expect(readFileSync(result.path, "utf-8")).toBe("hello world");
		expect(result.bytes).toBe(11);
		// Path should be under the spillover dir
		expect(result.path).toContain("cache/webfetch/");
	});

	it("uses the requested extension", () => {
		const r1 = spillToDisk("{}", "json");
		expect(r1.path.endsWith(".json")).toBe(true);
		const r2 = spillToDisk("<p>x</p>", "html");
		expect(r2.path.endsWith(".html")).toBe(true);
	});

	it("creates the dir if missing", () => {
		// Remove the dir if it exists
		const dir = join(SPILLOVER_ROOT, "cache", "webfetch");
		rmSync(dir, { recursive: true, force: true });
		expect(existsSync(dir)).toBe(false);
		spillToDisk("hi", "txt");
		expect(existsSync(dir)).toBe(true);
	});

	it("handles large content", () => {
		const big = "x".repeat(1024 * 1024); // 1MB
		const result = spillToDisk(big, "md");
		expect(result.bytes).toBe(1024 * 1024);
		// Verify the file is actually that big
		const stat = require("node:fs").statSync(result.path);
		expect(stat.size).toBe(1024 * 1024);
	});
});

describe("gcSpillover", () => {
	it("removes old files, keeps recent ones", async () => {
		// Write one file
		const result = spillToDisk("recent", "md");
		// Manually backdate the mtime by 30 days
		const fs = await import("node:fs");
		const old = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
		fs.utimesSync(result.path, old, old);

		// Write another that's "fresh"
		const fresh = spillToDisk("fresh", "md");

		// GC with default TTL (7 days) — should remove the old one
		const removed = gcSpillover();
		expect(removed).toBe(1);

		// Old one gone, fresh one still there
		expect(existsSync(result.path)).toBe(false);
		expect(existsSync(fresh.path)).toBe(true);
	});
});
