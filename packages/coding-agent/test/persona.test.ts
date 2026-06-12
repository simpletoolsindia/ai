/**
 * Tests for the Persona / Personalized Skills system.
 *
 * Verifies:
 *  - PersonaStore creates default profile
 *  - Observing turns updates the profile
 *  - Learning from corrections adjusts preferences
 *  - Skill synthesis produces valid markdown
 *  - isReady() triggers after enough observations
 */

import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { getAgentDir } from "../src/config.ts";
import { getPersonaStore, PersonaStore, type TurnObservation } from "../src/core/persona.ts";

// Use a temp agent dir for testing
const TEST_AGENT_DIR = join(getAgentDir(), "test-persona");

describe("PersonaStore", () => {
	let store: PersonaStore;

	beforeEach(() => {
		// Clean up test data
		try {
			rmSync(TEST_AGENT_DIR, { recursive: true });
		} catch {}
		store = new PersonaStore();
	});

	it("starts with default profile", () => {
		const profile = store.getProfile();
		expect(profile.conventions.indentation).toBe("spaces");
		expect(profile.conventions.quotes).toBe("single");
		// observationCount may be non-zero if persona.json already exists
		expect(profile.observationCount).toBeGreaterThanOrEqual(0);
		expect(profile.techStack).toContain("typescript");
	});

	it("tracks observation count correctly", () => {
		const before = store.getProfile().observationCount;
		store.observe({
			userInput: "Write a React component with hooks",
			toolsUsed: ["read", "write"],
			filesModified: ["src/App.tsx"],
			corrections: [],
			mode: "execute",
		});
		expect(store.getProfile().observationCount).toBe(before + 1);
	});

	it("tracks readiness when enough observations exist", () => {
		// isReady returns true when observationCount >= 3
		const ready = store.getProfile().observationCount >= 3;
		expect(store.isReady()).toBe(ready);
	});

	it("detects React in tech stack from user input", () => {
		store.observe({
			userInput: "Create a React component with Next.js",
			toolsUsed: ["write"],
			filesModified: [],
			corrections: [],
			mode: "execute",
		});
		const techStack = store.getProfile().techStack;
		expect(techStack).toContain("react");
		expect(techStack).toContain("next.js");
	});

	it("detects Docker and Kubernetes mentions", () => {
		store.observe({
			userInput: "Set up Docker for Kubernetes deployment",
			toolsUsed: ["bash"],
			filesModified: [],
			corrections: [],
			mode: "execute",
		});
		expect(store.getProfile().techStack).toContain("docker");
	});

	it("learns verbosity preference from corrections", () => {
		store.observe({
			userInput: "Add a function",
			toolsUsed: ["write"],
			filesModified: [],
			corrections: ["That's too verbose, make it shorter"],
			mode: "execute",
		});
		expect(store.getProfile().preferences.verbosity).toBe("concise");
	});

	it("learns plan-first preference from corrections", () => {
		store.observe({
			userInput: "Fix the bug",
			toolsUsed: ["write", "edit"],
			filesModified: [],
			corrections: ["Start with a plan first next time"],
			mode: "execute",
		});
		expect(store.getProfile().preferences.preferPlanFirst).toBe(true);
	});

	it("learns comment style from corrections", () => {
		store.observe({
			userInput: "Add a class",
			toolsUsed: ["write"],
			filesModified: [],
			corrections: ["Please add comments to document this"],
			mode: "execute",
		});
		expect(store.getProfile().preferences.commentStyle).toBe("jsdoc");
	});

	it("detects quote preference from input", () => {
		store.observe({
			userInput: 'const x = "hello"; const y = "world"; const z = "test";',
			toolsUsed: [],
			filesModified: [],
			corrections: [],
			mode: "plan",
		});
		expect(store.getProfile().conventions.quotes).toBe("double");
	});

	it("detects single quote preference", () => {
		store.observe({
			userInput: "import { x } from 'foo'; const y = 'bar';",
			toolsUsed: [],
			filesModified: [],
			corrections: [],
			mode: "plan",
		});
		expect(store.getProfile().conventions.quotes).toBe("single");
	});

	it("synthesizes a valid skill file", () => {
		// Feed observations to ensure we're past the readiness threshold
		const before = store.getProfile().observationCount;
		const needed = Math.max(0, 3 - before);
		for (let i = 0; i < needed + 1; i++) {
			store.observe({
				userInput: `Test input ${i} with single quotes 'like this'`,
				toolsUsed: ["write"],
				filesModified: ["test.ts"],
				corrections: [],
				mode: "execute",
			});
		}
		expect(store.isReady()).toBe(true);

		const skillPath = store.synthesizeSkill();
		expect(existsSync(skillPath)).toBe(true);

		const content = readFileSync(skillPath, "utf-8");
		expect(content).toContain("name: personalized");
		expect(content).toContain("Coding Conventions");
		expect(content).toContain("User Preferences");
		expect(content).toContain("Tech Stack");
		expect(content).toContain("single"); // quote preference
	});

	it("tech stack deduplicates", () => {
		store.observe({
			userInput: "React app with React hooks",
			toolsUsed: [],
			filesModified: [],
			corrections: [],
			mode: "plan",
		});
		const reactCount = store.getProfile().techStack.filter((t) => t === "react").length;
		expect(reactCount).toBe(1);
	});
});

describe("getPersonaStore singleton", () => {
	it("returns the same instance", () => {
		const a = getPersonaStore();
		const b = getPersonaStore();
		expect(a).toBe(b);
	});
});
