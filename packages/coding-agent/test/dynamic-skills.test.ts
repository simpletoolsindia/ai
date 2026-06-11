/**
 * Tests for dynamic role-based skills loading.
 *
 * Verifies that the 6 role-based skills (dev, qa, devops,
 * business-analyst, manager, tech-architect) are loadable and
 * have correct descriptions that enable the agent to discover
 * and load them dynamically based on user queries.
 */

import { describe, expect, it, beforeAll } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const SKILLS_DIR = join(homedir(), ".ai", "agent", "skills");

const skills = [
	{
		name: "dev",
		file: "dev/SKILL.md",
		expectedTriggers: [
			"writing code",
			"fixing bugs",
			"refactoring",
			"implementing features",
			"code review",
		],
	},
	{
		name: "qa",
		file: "qa/SKILL.md",
		expectedTriggers: [
			"testing",
			"QA",
			"test coverage",
			"test failures",
			"automated testing",
		],
	},
	{
		name: "devops",
		file: "devops/SKILL.md",
		expectedTriggers: [
			"deployment",
			"containers",
			"pipelines",
			"cloud",
			"infrastructure",
			"CI/CD",
		],
	},
	{
		name: "business-analyst",
		file: "business-analyst/SKILL.md",
		expectedTriggers: [
			"requirements",
			"user stories",
			"project scope",
			"feature definition",
			"business needs",
		],
	},
	{
		name: "manager",
		file: "manager/SKILL.md",
		expectedTriggers: [
			"planning",
			"sprint planning",
			"task prioritization",
			"timelines",
			"project organization",
		],
	},
	{
		name: "tech-architect",
		file: "tech-architect/SKILL.md",
		expectedTriggers: [
			"system design",
			"architecture",
			"technology choices",
			"API design",
			"scalability",
		],
	},
];

describe("Dynamic Role-based Skills", () => {
	// Ensure skills exist before tests (loadSkills auto-creates them)
	beforeAll(async () => {
		const { loadSkills } = await import("../src/core/skills.ts");
		loadSkills({
			cwd: process.cwd(),
			agentDir: join(homedir(), ".ai", "agent"),
			skillPaths: [],
			includeDefaults: true,
		});
	});
	for (const skill of skills) {
		describe(`Skill: ${skill.name}`, () => {
			const filePath = join(SKILLS_DIR, skill.file);

			it("exists on disk", () => {
				expect(existsSync(filePath)).toBe(true);
			});

			it("has valid frontmatter (name and description)", () => {
				const content = readFileSync(filePath, "utf-8");
				expect(content).toMatch(/^---$/m);
				expect(content).toContain(`name: ${skill.name}`);
				expect(content).toContain("description:");

				// Description should not be empty
				const descMatch = content.match(/^description:\s*(.+)$/m);
				expect(descMatch).toBeTruthy();
				expect(descMatch![1].trim().length).toBeGreaterThan(10);
			});

			it("description contains expected trigger words for dynamic loading", () => {
				const content = readFileSync(filePath, "utf-8");
				const descMatch = content.match(/^description:\s*(.+)$/m);
				const description = descMatch![1].trim().toLowerCase();

				// At least one trigger word should be present
				const found = skill.expectedTriggers.filter((trigger) =>
					description.includes(trigger.toLowerCase()),
				);
				expect(
					found.length,
					`Expected at least 1 trigger word in description, found: ${found.join(", ")}`,
				).toBeGreaterThan(0);
			});

			it("has meaningful body content (not just frontmatter)", () => {
				const content = readFileSync(filePath, "utf-8");
				// Split on frontmatter delimiters
				const parts = content.split(/^---$/m);
				expect(parts.length).toBeGreaterThanOrEqual(3);
				const body = parts.slice(2).join("---");
				expect(body.trim().length).toBeGreaterThan(100);
			});
		});
	}

	it("all 6 skills are unique (no name collisions)", () => {
		const names = skills.map((s) => s.name);
		const unique = new Set(names);
		expect(unique.size).toBe(names.length);
	});

	it("all skills loadable via the skills module", async () => {
		const { loadSkills } = await import("../src/core/skills.ts");
		const result = loadSkills({
			cwd: process.cwd(),
			agentDir: join(homedir(), ".ai", "agent"),
			skillPaths: [],
			includeDefaults: true,
		});

		expect(result.skills.length).toBeGreaterThanOrEqual(6);
		const loadedNames = result.skills.map((s) => s.name);
		for (const skill of skills) {
			expect(
				loadedNames,
				`Expected skill "${skill.name}" to be loaded`,
			).toContain(skill.name);
		}
	});

	it("skills are formatted for system prompt correctly", async () => {
		const { loadSkills } = await import("../src/core/skills.ts");
		const { formatSkillsForPrompt } = await import("../src/core/skills.ts");
		const result = loadSkills({
			cwd: process.cwd(),
			agentDir: join(homedir(), ".ai", "agent"),
			skillPaths: [],
			includeDefaults: true,
		});

		const formatted = formatSkillsForPrompt(result.skills);
		expect(formatted).toContain("<available_skills>");
		expect(formatted).toContain("</available_skills>");
		for (const skill of skills) {
			expect(formatted).toContain(`<name>${skill.name}</name>`);
		}
	});
});
