/**
 * Tests for Dynamic Skills Loading
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	createDynamicSkillsLoader,
	type DynamicSkillsLoader,
	formatSkillsForPromptLazy,
	loadSkillsForQuery,
} from "../src/core/dynamic-skills.ts";
import type { Skill } from "../src/core/skills.ts";

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

describe("DynamicSkillsLoader", () => {
	let loader: DynamicSkillsLoader;

	beforeEach(() => {
		loader = createDynamicSkillsLoader({
			maxSkills: 5,
			minRelevance: 0.1,
			cacheSkills: true,
			cacheTTL: 60000,
		});
	});

	it("should create an instance", () => {
		expect(loader).toBeDefined();
	});

	it("should load skills for query", async () => {
		const result = await loader.loadSkillsForQuery("help me with code", mockSkills);
		expect(result).toBeDefined();
		expect(Array.isArray(result)).toBe(true);
	});

	it("should filter by relevance", async () => {
		const result = await loader.loadSkillsForQuery("xyz123", mockSkills);
		expect(result.length).toBeLessThanOrEqual(mockSkills.length);
	});

	it("should sort by relevance score", async () => {
		const result = await loader.loadSkillsForQuery("testing", mockSkills);
		if (result.length > 1) {
			for (let i = 0; i < result.length - 1; i++) {
				expect(result[i].relevance.score).toBeGreaterThanOrEqual(result[i + 1].relevance.score);
			}
		}
	});

	it("should exclude disabled skills from prompt", () => {
		const prompt = loader.formatSkillsForPrompt(mockSkills);
		expect(prompt).not.toContain("disabled-skill");
	});

	it("should include enabled skills in prompt", () => {
		const prompt = loader.formatSkillsForPrompt(mockSkills);
		expect(prompt).toContain("dev");
		expect(prompt).toContain("qa");
		expect(prompt).toContain("devops");
	});

	it("should include relevance scores in prompt", () => {
		const scoredSkills = mockSkills.map((skill) => ({
			...skill,
			relevance: {
				score: 0.8,
				nameMatch: 0.9,
				descriptionMatch: 0.7,
				keywordMatch: 0.6,
				recencyBonus: 0.5,
			},
			usageCount: 5,
		}));

		const prompt = loader.formatSkillsForPrompt(scoredSkills);
		expect(prompt).toContain("relevance");
		expect(prompt).toContain("usage_count");
	});

	it("should handle empty skills array", async () => {
		const result = await loader.loadSkillsForQuery("test", []);
		expect(result).toEqual([]);
	});

	it("should cache skills", async () => {
		await loader.loadSkillsForQuery("test", mockSkills);
		const stats = loader.getCacheStats();
		expect(stats.size).toBeGreaterThan(0);
	});

	it("should clear cache", async () => {
		await loader.loadSkillsForQuery("test", mockSkills);
		loader.clearCache();
		const stats = loader.getCacheStats();
		expect(stats.size).toBe(0);
	});

	it("should get cache statistics", async () => {
		await loader.loadSkillsForQuery("test", mockSkills);
		const stats = loader.getCacheStats();
		expect(stats).toHaveProperty("size");
		expect(stats).toHaveProperty("hits");
		expect(stats).toHaveProperty("misses");
		expect(stats).toHaveProperty("hitRate");
	});
});

describe("createDynamicSkillsLoader", () => {
	it("should create loader with default options", () => {
		const loader = createDynamicSkillsLoader();
		expect(loader).toBeDefined();
	});

	it("should create loader with custom options", () => {
		const loader = createDynamicSkillsLoader({
			maxSkills: 20,
			minRelevance: 0.5,
			cacheSkills: false,
		});
		expect(loader).toBeDefined();
	});
});

describe("loadSkillsForQuery", () => {
	it("should load skills for query", async () => {
		const result = await loadSkillsForQuery("help me with code", mockSkills);
		expect(result).toBeDefined();
		expect(Array.isArray(result)).toBe(true);
	});

	it("should load skills with options", async () => {
		const result = await loadSkillsForQuery("testing", mockSkills, {
			maxSkills: 2,
			minRelevance: 0.5,
		});
		expect(result).toBeDefined();
		expect(result.length).toBeLessThanOrEqual(2);
	});
});

describe("formatSkillsForPromptLazy", () => {
	it("should format skills for lazy loading", () => {
		const scoredSkills = mockSkills.map((skill) => ({
			...skill,
			relevance: {
				score: 0.8,
				nameMatch: 0.9,
				descriptionMatch: 0.7,
				keywordMatch: 0.6,
				recencyBonus: 0.5,
			},
			usageCount: 5,
		}));

		const prompt = formatSkillsForPromptLazy(scoredSkills);
		expect(prompt).toContain("<available_skills>");
		expect(prompt).toContain("dev");
		expect(prompt).toContain("qa");
		expect(prompt).toContain("devops");
	});

	it("should handle empty skills array", () => {
		const prompt = formatSkillsForPromptLazy([]);
		expect(prompt).toBe("");
	});

	it("should exclude disabled skills", () => {
		const prompt = formatSkillsForPromptLazy(mockSkills);
		expect(prompt).not.toContain("disabled-skill");
	});
});

describe("Skill Relevance Scoring", () => {
	let loader: DynamicSkillsLoader;

	beforeEach(() => {
		loader = createDynamicSkillsLoader({
			maxSkills: 10,
			minRelevance: 0.0,
		});
	});

	it("should score skills based on name match", async () => {
		const result = await loader.loadSkillsForQuery("dev", mockSkills);
		const devSkill = result.find((s) => s.name === "dev");
		expect(devSkill).toBeDefined();
		expect(devSkill!.relevance.nameMatch).toBeGreaterThan(0);
	});

	it("should score skills based on description match", async () => {
		const result = await loader.loadSkillsForQuery("testing", mockSkills);
		const qaSkill = result.find((s) => s.name === "qa");
		expect(qaSkill).toBeDefined();
		expect(qaSkill!.relevance.descriptionMatch).toBeGreaterThan(0);
	});

	it("should score skills based on keyword match", async () => {
		const result = await loader.loadSkillsForQuery("docker kubernetes", mockSkills);
		const devopsSkill = result.find((s) => s.name === "devops");
		expect(devopsSkill).toBeDefined();
		expect(devopsSkill!.relevance.keywordMatch).toBeGreaterThan(0);
	});

	it("should handle multiple word queries", async () => {
		const result = await loader.loadSkillsForQuery("code refactoring debugging", mockSkills);
		expect(result.length).toBeGreaterThan(0);
	});

	it("should handle single word queries", async () => {
		const result = await loader.loadSkillsForQuery("test", mockSkills);
		expect(result.length).toBeGreaterThan(0);
	});

	it("should handle empty queries", async () => {
		const result = await loader.loadSkillsForQuery("", mockSkills);
		expect(result).toBeDefined();
	});

	it("should handle queries with no matches", async () => {
		const result = await loader.loadSkillsForQuery("xyz123", mockSkills);
		expect(result).toBeDefined();
	});
});

describe("Skill Caching", () => {
	let loader: DynamicSkillsLoader;

	beforeEach(() => {
		loader = createDynamicSkillsLoader({
			maxSkills: 10,
			minRelevance: 0.0,
			cacheSkills: true,
			cacheTTL: 60000,
		});
	});

	it("should cache skills after loading", async () => {
		await loader.loadSkillsForQuery("test", mockSkills);
		const stats = loader.getCacheStats();
		expect(stats.size).toBeGreaterThan(0);
	});

	it("should return cached skills", async () => {
		await loader.loadSkillsForQuery("test", mockSkills);
		const cached = loader.getCachedSkill("dev");
		expect(cached).toBeDefined();
	});

	it("should track cache hits", async () => {
		await loader.loadSkillsForQuery("test", mockSkills);
		await loader.loadSkillsForQuery("test", mockSkills);
		const stats = loader.getCacheStats();
		expect(stats.hits).toBeGreaterThan(0);
	});

	it("should clean expired cache entries", async () => {
		// Create loader with very short TTL
		const shortTtlLoader = createDynamicSkillsLoader({
			cacheTTL: 1, // 1ms
		});

		await shortTtlLoader.loadSkillsForQuery("test", mockSkills);

		// Wait for cache to expire
		await new Promise((resolve) => setTimeout(resolve, 10));

		const stats = shortTtlLoader.getCacheStats();
		expect(stats.size).toBe(0);
	});
});

describe("Prompt Optimization", () => {
	it("should generate compact prompt", () => {
		const loader = createDynamicSkillsLoader();
		const prompt = loader.formatSkillsForPrompt(mockSkills);

		expect(prompt).toContain("<available_skills>");
		expect(prompt).toContain("</available_skills>");
		expect(prompt).toContain("<skill>");
		expect(prompt).toContain("</skill>");
	});

	it("should include skill metadata", () => {
		const loader = createDynamicSkillsLoader();
		const prompt = loader.formatSkillsForPrompt(mockSkills);

		expect(prompt).toContain("<name>");
		expect(prompt).toContain("<description>");
		expect(prompt).toContain("<location>");
	});

	it("should escape XML characters", () => {
		const skillsWithXml: Skill[] = [
			{
				name: "test-skill",
				description: 'Test skill with <special> & "characters"',
				filePath: "/skills/test/SKILL.md",
				baseDir: "/skills/test",
				sourceInfo: { path: "/skills/test/SKILL.md", source: "local", scope: "user", origin: "top-level" },
				disableModelInvocation: false,
			},
		];

		const loader = createDynamicSkillsLoader();
		const prompt = loader.formatSkillsForPrompt(skillsWithXml);

		expect(prompt).toContain("&lt;special&gt;");
		expect(prompt).toContain("&amp;");
		expect(prompt).toContain("&quot;");
	});
});
