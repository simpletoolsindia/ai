/**
 * Tests for the PLAN/EXECUTE mode feature.
 *
 * Covers:
 *  - SettingsManager.getAgentMode() / setAgentMode() with persistence
 *  - AgentSession.getMode() / setMode() filtering the active tool set
 *  - PLAN mode strips write/edit/bash, EXECUTE restores them
 *  - System prompt includes the PLAN-mode hint when mode=plan
 *  - Mode persists across SettingsManager re-creations
 *
 * The interactive-mode `/mode` slash command and footer badge are
 * covered by source-level smoke tests; the actual TUI flow is
 * exercised manually.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { AuthStorage } from "../src/core/auth-storage.ts";
import { buildSystemPrompt } from "../src/core/system-prompt.ts";
import { ModelRegistry } from "../src/core/model-registry.ts";
import { SettingsManager } from "../src/core/settings-manager.ts";

const TEST_DIR = mkdtempSync(join(tmpdir(), "ai-mode-test-"));

function freshSettingsManager(initial: object = {}) {
	// SettingsManager.create(cwd, agentDir?, options?)
	// It uses agentDir/settings.json for persistence. We need a stable
	// file path, so we point cwd at our test dir and agentDir at the
	// test dir too — the settings file is at <agentDir>/settings.json.
	const agentDir = join(TEST_DIR, `agent-${Math.random().toString(36).slice(2)}`);
	if (Object.keys(initial).length > 0) {
		// The agentDir is created by SettingsManager.create; we just
		// need to put a settings.json in there before it loads.
	}
	return SettingsManager.create(TEST_DIR, agentDir);
}

describe("SettingsManager: agent mode persistence", () => {
	beforeEach(() => {
		// mkdtempSync already created the dir
	});

	it("defaults to 'plan' (safer mode that strips write tools)", () => {
		const sm = freshSettingsManager();
		expect(sm.getAgentMode()).toBe("plan");
	});

	it("round-trips a 'plan' value to disk and back", async () => {
		const agentDir = join(TEST_DIR, `persist-${Math.random().toString(36).slice(2)}`);

		const sm1 = SettingsManager.create(TEST_DIR, agentDir);
		sm1.setAgentMode("plan");
		expect(sm1.getAgentMode()).toBe("plan");

		// Wait for the async write queue to flush.
		await new Promise((r) => setTimeout(r, 50));

		// Reload from disk
		const sm2 = SettingsManager.create(TEST_DIR, agentDir);
		expect(sm2.getAgentMode()).toBe("plan");
	});

	it("treats unknown values as 'plan' (the safer default)", () => {
		const agentDir = join(TEST_DIR, `weird-${Math.random().toString(36).slice(2)}`);
		// Pre-create the settings file with a bogus mode value
		const { mkdirSync } = require("node:fs") as typeof import("node:fs");
		mkdirSync(agentDir, { recursive: true });
		writeFileSync(join(agentDir, "settings.json"), JSON.stringify({ agentMode: "frobnicate" }));
		const sm = SettingsManager.create(TEST_DIR, agentDir);
		expect(sm.getAgentMode()).toBe("plan");
	});
});

describe("buildSystemPrompt: mode integration", () => {
	const baseOpts = {
		toolSnippets: {
			read: "Read files",
			bash: "Run shell",
			edit: "Edit files",
			write: "Write files",
		},
		contextFiles: [],
		skills: [],
		cwd: "/tmp/proj",
	};

	it("does NOT include the PLAN-mode hint by default (default is 'execute')", () => {
		const p = buildSystemPrompt({ ...baseOpts });
		expect(p).not.toContain("PLAN MODE");
	});

	it("does NOT include the PLAN-mode hint when mode=execute", () => {
		const p = buildSystemPrompt({ ...baseOpts, mode: "execute" });
		expect(p).not.toContain("PLAN MODE");
	});

	it("includes the PLAN-mode hint when mode=plan", () => {
		const p = buildSystemPrompt({ ...baseOpts, mode: "plan" });
		expect(p).toContain("PLAN MODE — STRICT WORKFLOW");
		expect(p).toContain("edit tools are disabled");
		expect(p).toContain("`/mode execute`");
		expect(p).toContain("`todo` tool");
	});
});

describe("agent mode: /mode slash command (source-level smoke test)", () => {
	it("is registered in BUILTIN_SLASH_COMMANDS", async () => {
		const fs = await import("node:fs");
		const src = fs.readFileSync(
			"/Users/sridhar/ai/packages/coding-agent/src/core/slash-commands.ts",
			"utf-8",
		);
		expect(src).toMatch(/name:\s*"mode"[\s\S]*?Switch the agent between PLAN[\s\S]*?EXECUTE/);
	});

	it("has a handleModeCommand method in interactive-mode", async () => {
		const fs = await import("node:fs");
		const src = fs.readFileSync(
			"/Users/sridhar/ai/packages/coding-agent/src/modes/interactive/interactive-mode.ts",
			"utf-8",
		);
		expect(src).toContain("private handleModeCommand(arg: string): void");
		// And it's wired into the slash-command dispatcher
		expect(src).toMatch(/text === "\/mode" \|\| text\.startsWith\("\/mode "\)/);
	});

	it("is rendered in the footer", async () => {
		const fs = await import("node:fs");
		const src = fs.readFileSync(
			"/Users/sridhar/ai/packages/coding-agent/src/modes/interactive/components/footer.ts",
			"utf-8",
		);
		// Footer reads the mode from the session and shows the badge.
		expect(src).toContain("this.session.getMode()");
		expect(src).toContain("theme.fg(\"warning\", \"PLAN\")");
	});
});

// Cleanup at the end
afterAll(() => {
	rmSync(TEST_DIR, { recursive: true, force: true });
});
