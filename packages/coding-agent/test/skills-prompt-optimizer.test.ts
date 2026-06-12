/**
 * Tests for Skills Prompt Optimizer
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Skill } from "../src/core/skills.ts";
import {
	createSkillsPromptOptimizer,
	generateLazyLoadingSkillsPrompt,
	generateMinimalSkillsPrompt,
	generateOptimizedSkillsPrompt,
	type SkillsPromptOptimizer,
} from "../src/core/skills-prompt-optimizer.ts";

// Mock skills for testing
const mockSkills: Skill[] = [
	{
		name: "dev",
		description: "Software development expertise — code design, implementation, refactoring, debugging, testing",
		filePath: "/skills/dev/SKILL.md",
		baseDir: "/skills/dev",
		sourceInfo: { path: "/skills/dev/SKILL.md", source: "local", scope: "user", origin: "top-level" },
		disableModelInvocation: false,
	},
	{
		name: "qa",
		description: "Quality assurance and testing expertise — test strategy, test case design, coverage analysis",
		filePath: "/skills/qa/SKILL.md",
		baseDir: "/skills/qa",
		sourceInfo: { path: "/skills/qa/SKILL.md", source: "local", scope: "user", origin: "top-level" },
		disableModelInvocation: false,
	},
	{
		name: "devops",
		description: "DevOps expertise — CI/CD, Docker, Kubernetes, cloud deployment, infrastructure",
		filePath: "/skills/devops/SKILL.md",
		baseDir: "/skills/devops",
		sourceInfo: { path: "/skills/devops/SKILL.md", source: "local", scope: "user", origin: "top-level" },
		disableModelInvocation: false,
	},
	{
		name: "disabled-skill",
		description: "This skill is disabled",
		filePath: "/skills/disabled/SKILL.md",
		baseDir: "/skills/disabled",
		sourceInfo: { path: "/skills/disabled/SKILL.md", source: "local", scope: "user", origin: "top-level" },
		disableModelInvocation: true,
	},
];

describe("SkillsPromptOptimizer", () => {
	let optimizer: SkillsPromptOptimizer;

	beforeEach(() => {
		optimizer = createSkillsPromptOptimizer({
			maxDescriptionLength: 100,
			includePaths: true,
			includeRelevance: false,
			compact: false,
			groupByCategory: false,
		});
	});

	it("should create an instance", () => {
		expect(optimizer).toBeDefined();
	});

	it("should generate prompt for skills", () => {
		const prompt = optimizer.generatePrompt(mockSkills);
		expect(prompt).toContain("<available_skills>");
		expect(prompt).toContain("dev");
		expect(prompt).toContain("qa");
		expect(prompt).toContain("devops");
	});

	it("should exclude disabled skills", () => {
		const prompt = optimizer.generatePrompt(mockSkills);
		expect(prompt).not.toContain("disabled-skill");
	});

	it("should handle empty skills array", () => {
		const prompt = optimizer.generatePrompt([]);
		expect(prompt).toBe("");
	});

	it("should handle all disabled skills", () => {
		const disabledSkills: Skill[] = [
			{
				name: "disabled1",
				description: "Disabled skill 1",
				filePath: "/skills/disabled1/SKILL.md",
				baseDir: "/skills/disabled1",
				sourceInfo: { path: "/skills/disabled1/SKILL.md", source: "local", scope: "user", origin: "top-level" },
				disableModelInvocation: true,
			},
		];

		const prompt = optimizer.generatePrompt(disabledSkills);
		expect(prompt).toBe("");
	});

	it("should include paths when configured", () => {
		const prompt = optimizer.generatePrompt(mockSkills);
		expect(prompt).toContain("/skills/dev/SKILL.md");
		expect(prompt).toContain("/skills/qa/SKILL.md");
	});

	it("should exclude paths when configured", () => {
		const optimizerNoPaths = createSkillsPromptOptimizer({
			includePaths: false,
		});

		const prompt = optimizerNoPaths.generatePrompt(mockSkills);
		expect(prompt).not.toContain("/skills/dev/SKILL.md");
	});

	it("should truncate long descriptions", () => {
		const longDescSkill: Skill[] = [
			{
				name: "long-desc",
				description: "A".repeat(200),
				filePath: "/skills/long-desc/SKILL.md",
				baseDir: "/skills/long-desc",
				sourceInfo: { path: "/skills/long-desc/SKILL.md", source: "local", scope: "user", origin: "top-level" },
				disableModelInvocation: false,
			},
		];

		const prompt = optimizer.generatePrompt(longDescSkill);
		expect(prompt).toContain("...");
	});

	it("should escape XML characters", () => {
		const xmlSkill: Skill[] = [
			{
				name: "xml-skill",
				description: 'Test with <special> & "characters"',
				filePath: "/skills/xml/SKILL.md",
				baseDir: "/skills/xml",
				sourceInfo: { path: "/skills/xml/SKILL.md", source: "local", scope: "user", origin: "top-level" },
				disableModelInvocation: false,
			},
		];

		const prompt = optimizer.generatePrompt(xmlSkill);
		expect(prompt).toContain("&lt;special&gt;");
		expect(prompt).toContain("&amp;");
		expect(prompt).toContain("&quot;");
	});
});

describe("Categorized Prompt", () => {
	it("should generate categorized prompt", () => {
		const optimizer = createSkillsPromptOptimizer({
			groupByCategory: true,
		});

		const prompt = optimizer.generatePrompt(mockSkills);
		expect(prompt).toContain("<category");
		expect(prompt).toContain("Development");
		expect(prompt).toContain("Testing");
		expect(prompt).toContain("DevOps");
	});

	it("should include category descriptions", () => {
		const optimizer = createSkillsPromptOptimizer({
			groupByCategory: true,
		});

		const prompt = optimizer.generatePrompt(mockSkills);
		expect(prompt).toContain("<description>");
	});

	it("should handle skills that don't match any category", () => {
		const otherSkill: Skill[] = [
			{
				name: "custom-skill",
				description: "A custom skill that doesn't match standard categories",
				filePath: "/skills/custom/SKILL.md",
				baseDir: "/skills/custom",
				sourceInfo: { path: "/skills/custom/SKILL.md", source: "local", scope: "user", origin: "top-level" },
				disableModelInvocation: false,
			},
		];

		const optimizer = createSkillsPromptOptimizer({
			groupByCategory: true,
		});

		const prompt = optimizer.generatePrompt(otherSkill);
		expect(prompt).toContain("Other");
	});
});

describe("Minimal Prompt", () => {
	it("should generate minimal prompt", () => {
		const optimizer = createSkillsPromptOptimizer();
		const prompt = optimizer.generateMinimalPrompt(mockSkills);

		expect(prompt).toContain("<skills>");
		expect(prompt).toContain("</skills>");
		expect(prompt).toContain("dev:");
		expect(prompt).toContain("qa:");
		expect(prompt).toContain("devops:");
	});

	it("should exclude disabled skills from minimal prompt", () => {
		const optimizer = createSkillsPromptOptimizer();
		const prompt = optimizer.generateMinimalPrompt(mockSkills);

		expect(prompt).not.toContain("disabled-skill");
	});

	it("should handle empty skills array", () => {
		const optimizer = createSkillsPromptOptimizer();
		const prompt = optimizer.generateMinimalPrompt([]);

		expect(prompt).toBe("");
	});
});

describe("Lazy Loading Prompt", () => {
	it("should generate lazy loading prompt", () => {
		const optimizer = createSkillsPromptOptimizer();
		const prompt = optimizer.generateLazyLoadingPrompt(mockSkills);

		expect(prompt).toContain("<available_skills>");
		expect(prompt).toContain("Skills provide specialized instructions");
		expect(prompt).toContain("To use a skill, call `read`");
	});

	it("should include skill names and descriptions", () => {
		const optimizer = createSkillsPromptOptimizer();
		const prompt = optimizer.generateLazyLoadingPrompt(mockSkills);

		expect(prompt).toContain("- dev:");
		expect(prompt).toContain("- qa:");
		expect(prompt).toContain("- devops:");
	});

	it("should include paths when configured", () => {
		const optimizer = createSkillsPromptOptimizer({
			includePaths: true,
		});

		const prompt = optimizer.generateLazyLoadingPrompt(mockSkills);
		expect(prompt).toContain("Path:");
	});

	it("should exclude paths when configured", () => {
		const optimizer = createSkillsPromptOptimizer({
			includePaths: false,
		});

		const prompt = optimizer.generateLazyLoadingPrompt(mockSkills);
		expect(prompt).not.toContain("Path:");
	});

	it("should handle empty skills array", () => {
		const optimizer = createSkillsPromptOptimizer();
		const prompt = optimizer.generateLazyLoadingPrompt([]);

		expect(prompt).toBe("");
	});
});

describe("createSkillsPromptOptimizer", () => {
	it("should create optimizer with default options", () => {
		const optimizer = createSkillsPromptOptimizer();
		expect(optimizer).toBeDefined();
	});

	it("should create optimizer with custom options", () => {
		const optimizer = createSkillsPromptOptimizer({
			maxDescriptionLength: 50,
			includePaths: false,
			compact: true,
			groupByCategory: true,
		});

		expect(optimizer).toBeDefined();
	});
});

describe("generateOptimizedSkillsPrompt", () => {
	it("should generate optimized prompt", () => {
		const prompt = generateOptimizedSkillsPrompt(mockSkills);
		expect(prompt).toContain("<available_skills>");
		expect(prompt).toContain("dev");
	});

	it("should use custom options", () => {
		const prompt = generateOptimizedSkillsPrompt(mockSkills, {
			maxDescriptionLength: 50,
			includePaths: false,
		});

		expect(prompt).not.toContain("/skills/dev/SKILL.md");
	});
});

describe("generateMinimalSkillsPrompt", () => {
	it("should generate minimal prompt", () => {
		const prompt = generateMinimalSkillsPrompt(mockSkills);
		expect(prompt).toContain("<skills>");
		expect(prompt).toContain("dev:");
	});
});

describe("generateLazyLoadingSkillsPrompt", () => {
	it("should generate lazy loading prompt", () => {
		const prompt = generateLazyLoadingSkillsPrompt(mockSkills);
		expect(prompt).toContain("<available_skills>");
		expect(prompt).toContain("To use a skill, call `read`");
	});

	it("should use custom options", () => {
		const prompt = generateLazyLoadingSkillsPrompt(mockSkills, {
			includePaths: false,
		});

		expect(prompt).not.toContain("Path:");
	});
});

describe("Prompt Token Efficiency", () => {
	it("should generate shorter prompt than raw format", () => {
		const optimizer = createSkillsPromptOptimizer({
			maxDescriptionLength: 80,
			includePaths: false,
			compact: true,
		});

		const optimizedPrompt = optimizer.generatePrompt(mockSkills);

		// Raw format would be much longer
		const rawPrompt = mockSkills
			.filter((s) => !s.disableModelInvocation)
			.map((s) => `${s.name}: ${s.description} - ${s.filePath}`)
			.join("\n");

		expect(optimizedPrompt.length).toBeLessThanOrEqual(rawPrompt.length);
	});

	it("should generate minimal prompt with fewest tokens", () => {
		const optimizer = createSkillsPromptOptimizer();
		const minimalPrompt = optimizer.generateMinimalPrompt(mockSkills);
		const regularPrompt = optimizer.generatePrompt(mockSkills);

		expect(minimalPrompt.length).toBeLessThan(regularPrompt.length);
	});
});
