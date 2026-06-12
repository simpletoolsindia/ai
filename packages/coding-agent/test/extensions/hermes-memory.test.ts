/**
 * Tests for the vendored pi-hermes-memory extension.
 *
 * We vendor a subset of the upstream tests: enough to lock in the
 * behavior of loadConfig, the AGENT_ROOT resolution, and the SQLite
 * FTS5 session search (since the rest is exercised by the upstream
 * 32-file suite that lives in the original repo).
 *
 * Original repo: https://github.com/chandra447/pi-hermes-memory
 * License: MIT (see THIRD-PARTY/LICENSE)
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/core/extensions/built-in/hermes-memory/config.js";
import { AGENT_ROOT } from "../../src/core/extensions/built-in/hermes-memory/paths.js";
import { DatabaseManager } from "../../src/core/extensions/built-in/hermes-memory/store/db.js";
import { MemoryStore } from "../../src/core/extensions/built-in/hermes-memory/store/memory-store.js";

const TEST_DIR = join(tmpdir(), `hermes-memory-test-${process.pid}-${Date.now()}`);

beforeEach(() => {
	mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
	rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("loadConfig", () => {
	const cfg = join(TEST_DIR, "config.json");

	it("returns defaults when no config file exists", () => {
		const config = loadConfig(cfg);
		expect(config.memoryMode).toBe("policy-only");
		expect(config.memoryCharLimit).toBe(5000);
		expect(config.userCharLimit).toBe(5000);
		expect(config.nudgeInterval).toBe(10);
		expect(config.reviewEnabled).toBe(true);
		expect(config.flushOnCompact).toBe(true);
		expect(config.flushOnShutdown).toBe(true);
		expect(config.flushMinTurns).toBe(6);
		expect(config.memoryOverflowStrategy).toBe("auto-consolidate");
		expect(config.failureInjectionEnabled).toBe(true);
		expect(config.projectsMemoryDir).toBe("projects-memory");
	});

	it("overrides defaults when config file exists", () => {
		writeFileSync(
			cfg,
			JSON.stringify({
				memoryCharLimit: 3000,
				nudgeInterval: 15,
				reviewEnabled: false,
			}),
		);
		const config = loadConfig(cfg);
		expect(config.memoryCharLimit).toBe(3000);
		expect(config.nudgeInterval).toBe(15);
		expect(config.reviewEnabled).toBe(false);
		// Untouched values use defaults
		expect(config.userCharLimit).toBe(5000);
		expect(config.flushOnCompact).toBe(true);
	});

	it("falls back to defaults on malformed JSON", () => {
		writeFileSync(cfg, "{ bad json }");
		const config = loadConfig(cfg);
		expect(config.memoryCharLimit).toBe(5000);
		expect(config.reviewEnabled).toBe(true);
	});

	it("ignores unknown keys", () => {
		writeFileSync(
			cfg,
			JSON.stringify({
				unknownKey: "value",
				memoryCharLimit: 1000,
			}),
		);
		const config = loadConfig(cfg);
		expect(config.memoryCharLimit).toBe(1000);
		expect(config.memoryMode).toBe("policy-only");
	});

	it("expands ~/ in memoryDir", () => {
		writeFileSync(cfg, JSON.stringify({ memoryDir: "~/my-hermes" }));
		const config = loadConfig(cfg);
		expect(config.memoryDir).toBeTruthy();
		expect(config.memoryDir).not.toContain("~");
	});
});

describe("AGENT_ROOT", () => {
	it("resolves to a real path (not .pi/agent)", () => {
		// The vendored paths.ts should now use getAgentDir() (which is
		// .ai/agent), not the legacy .pi/agent. This test guards
		// against accidental reverts.
		expect(AGENT_ROOT).toBeTruthy();
		expect(AGENT_ROOT).not.toContain(".pi");
	});
});

describe("MemoryStore", () => {
	it("persists memory entries across instances", async () => {
		const memDir = join(TEST_DIR, "memory");
		mkdirSync(memDir, { recursive: true });

		// First instance: write entries
		const store1 = new MemoryStore({ memoryDir: memDir, memoryCharLimit: 5000 } as any);
		await store1.add("memory", "user prefers dark mode");
		await store1.add("user", "name: sridhar");

		// Second instance: load and verify
		const store2 = new MemoryStore({ memoryDir: memDir, memoryCharLimit: 5000 } as any);
		await store2.loadFromDisk();
		const memory = store2.getMemoryEntries();
		const user = store2.getUserEntries();
		expect(memory.some((e: string) => e.includes("dark mode"))).toBe(true);
		expect(user.some((e: string) => e.includes("sridhar"))).toBe(true);
	});

	it("deduplicates identical entries", async () => {
		const memDir = join(TEST_DIR, "dedup");
		mkdirSync(memDir, { recursive: true });

		const store = new MemoryStore({ memoryDir: memDir, memoryCharLimit: 5000 } as any);
		await store.add("memory", "duplicate entry");
		await store.add("memory", "duplicate entry");
		const entries = store.getMemoryEntries();
		const dups = entries.filter((e: string) => e.includes("duplicate entry"));
		expect(dups.length).toBe(1);
	});
});

describe("DatabaseManager (SQLite FTS5)", () => {
	it("creates a sessions.db with the expected schema", () => {
		const memDir = join(TEST_DIR, "db");
		mkdirSync(memDir, { recursive: true });
		const dbManager = new DatabaseManager(memDir);

		// Initially no db file
		expect(dbManager.exists()).toBe(false);

		// First getDb() opens the database
		const db = dbManager.getDb();
		expect(db).toBeDefined();
		expect(dbManager.exists()).toBe(true);
		expect(dbManager.getPath()).toBe(join(memDir, "sessions.db"));

		// Smoke check: a basic SELECT works (proves the db is open and queryable)
		const stmt = db.prepare("SELECT count(*) as c FROM sqlite_master WHERE type='table'");
		const result = stmt.get() as { c: number };
		expect(result.c).toBeGreaterThan(0);

		// FTS5 is available (better-sqlite3 ships with FTS5 by default)
		const ftsCheck = db.prepare("SELECT count(*) as c FROM sqlite_master WHERE type='table' AND name LIKE '%fts%'");
		const ftsResult = ftsCheck.get() as { c: number };
		expect(ftsResult.c).toBeGreaterThan(0);

		dbManager.close();
	});
});
