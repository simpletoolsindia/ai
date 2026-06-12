/**
 * Skills Prompt Optimizer
 *
 * This module optimizes the prompt generation for loaded skills,
 * reducing token usage while maintaining clarity and effectiveness.
 */

import type { ScoredSkill } from "./dynamic-skills.ts";
import type { Skill } from "./skills.ts";

/**
 * Prompt optimization options.
 */
export interface PromptOptimizationOptions {
	/** Maximum characters for skill descriptions */
	maxDescriptionLength?: number;
	/** Whether to include skill file paths */
	includePaths?: boolean;
	/** Whether to include relevance scores */
	includeRelevance?: boolean;
	/** Whether to use compact format */
	compact?: boolean;
	/** Whether to group skills by category */
	groupByCategory?: boolean;
}

/**
 * Skill category for grouping.
 */
export interface SkillCategory {
	/** Category name */
	name: string;
	/** Category description */
	description: string;
	/** Skills in this category */
	skills: (Skill | ScoredSkill)[];
}

/**
 * Optimized skills prompt generator.
 */
export class SkillsPromptOptimizer {
	private options: Required<PromptOptimizationOptions>;

	constructor(options: PromptOptimizationOptions = {}) {
		this.options = {
			maxDescriptionLength: options.maxDescriptionLength ?? 100,
			includePaths: options.includePaths ?? true,
			includeRelevance: options.includeRelevance ?? false,
			compact: options.compact ?? false,
			groupByCategory: options.groupByCategory ?? false,
		};
	}

	/**
	 * Generate optimized prompt for skills.
	 */
	generatePrompt(skills: (Skill | ScoredSkill)[]): string {
		if (skills.length === 0) {
			return "";
		}

		// Filter out skills with disable-model-invocation
		const available = skills.filter((s) => !s.disableModelInvocation);
		if (available.length === 0) {
			return "";
		}

		if (this.options.groupByCategory) {
			return this.generateCategorizedPrompt(available);
		}

		return this.generateFlatPrompt(available);
	}

	/**
	 * Generate flat prompt (no categories).
	 */
	private generateFlatPrompt(skills: (Skill | ScoredSkill)[]): string {
		const lines: string[] = [];

		lines.push("<available_skills>");
		lines.push("Skills provide specialized instructions. Use `read` to load when task matches.");
		lines.push("");

		for (const skill of skills) {
			lines.push(this.formatSkillCompact(skill));
		}

		lines.push("</available_skills>");

		return lines.join("\n");
	}

	/**
	 * Generate categorized prompt.
	 */
	private generateCategorizedPrompt(skills: (Skill | ScoredSkill)[]): string {
		const categories = this.categorizeSkills(skills);
		const lines: string[] = [];

		lines.push("<available_skills>");
		lines.push("Skills provide specialized instructions. Use `read` to load when task matches.");
		lines.push("");

		for (const category of categories) {
			lines.push(`<category name="${this.escapeXml(category.name)}">`);
			lines.push(`  <description>${this.escapeXml(category.description)}</description>`);

			for (const skill of category.skills) {
				lines.push(`  ${this.formatSkillCompact(skill)}`);
			}

			lines.push("</category>");
			lines.push("");
		}

		lines.push("</available_skills>");

		return lines.join("\n");
	}

	/**
	 * Format a skill in compact format.
	 */
	private formatSkillCompact(skill: Skill | ScoredSkill): string {
		const parts: string[] = [];

		// Name (required)
		parts.push(`<skill name="${this.escapeXml(skill.name)}">`);

		// Description (truncated if needed)
		const description = this.truncateDescription(skill.description);
		parts.push(`  <desc>${this.escapeXml(description)}</desc>`);

		// Path (optional)
		if (this.options.includePaths) {
			parts.push(`  <path>${this.escapeXml(skill.filePath)}</path>`);
		}

		// Relevance score (optional)
		if (this.options.includeRelevance && "relevance" in skill) {
			const scoredSkill = skill as ScoredSkill;
			if (scoredSkill.relevance) {
				parts.push(`  <score>${scoredSkill.relevance.score.toFixed(2)}</score>`);
			}
		}

		parts.push("</skill>");

		return parts.join("\n");
	}

	/**
	 * Categorize skills by their domain.
	 */
	private categorizeSkills(skills: (Skill | ScoredSkill)[]): SkillCategory[] {
		const categories: Map<string, SkillCategory> = new Map();

		// Define category patterns
		const categoryPatterns: Array<{
			name: string;
			description: string;
			patterns: string[];
		}> = [
			{
				name: "Development",
				description: "Code design, implementation, refactoring",
				patterns: ["dev", "code", "implement", "refactor", "debug"],
			},
			{
				name: "Testing",
				description: "Quality assurance, testing, coverage",
				patterns: ["test", "qa", "quality", "coverage"],
			},
			{
				name: "DevOps",
				description: "CI/CD, deployment, infrastructure",
				patterns: ["devops", "deploy", "ci", "cd", "docker", "kubernetes"],
			},
			{
				name: "Architecture",
				description: "System design, architecture, API design",
				patterns: ["architect", "design", "api", "system"],
			},
			{
				name: "Analysis",
				description: "Requirements, business analysis, documentation",
				patterns: ["analyst", "business", "requirements", "documentation"],
			},
			{
				name: "Management",
				description: "Project management, planning, coordination",
				patterns: ["manager", "management", "planning", "coordinate"],
			},
		];

		// Initialize categories
		for (const cat of categoryPatterns) {
			categories.set(cat.name, {
				name: cat.name,
				description: cat.description,
				skills: [],
			});
		}

		// Add "Other" category
		categories.set("Other", {
			name: "Other",
			description: "Specialized skills",
			skills: [],
		});

		// Categorize each skill
		for (const skill of skills) {
			const skillName = skill.name.toLowerCase();
			const skillDesc = skill.description.toLowerCase();
			const skillText = `${skillName} ${skillDesc}`;

			let categorized = false;

			for (const cat of categoryPatterns) {
				const matches = cat.patterns.some(
					(pattern) => skillText.includes(pattern) || skillName.startsWith(pattern) || skillName.endsWith(pattern),
				);

				if (matches) {
					categories.get(cat.name)!.skills.push(skill);
					categorized = true;
					break;
				}
			}

			if (!categorized) {
				categories.get("Other")!.skills.push(skill);
			}
		}

		// Filter out empty categories
		return Array.from(categories.values()).filter((cat) => cat.skills.length > 0);
	}

	/**
	 * Truncate description to max length.
	 */
	private truncateDescription(description: string): string {
		if (description.length <= this.options.maxDescriptionLength) {
			return description;
		}

		// Try to truncate at word boundary
		const truncated = description.substring(0, this.options.maxDescriptionLength);
		const lastSpace = truncated.lastIndexOf(" ");

		if (lastSpace > this.options.maxDescriptionLength * 0.8) {
			return truncated.substring(0, lastSpace) + "...";
		}

		return truncated + "...";
	}

	/**
	 * Escape XML special characters.
	 */
	private escapeXml(text: string): string {
		return text
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;")
			.replace(/'/g, "&apos;");
	}

	/**
	 * Generate minimal prompt (absolute minimum tokens).
	 */
	generateMinimalPrompt(skills: (Skill | ScoredSkill)[]): string {
		if (skills.length === 0) {
			return "";
		}

		const available = skills.filter((s) => !s.disableModelInvocation);
		if (available.length === 0) {
			return "";
		}

		// Ultra-compact format: just names and short descriptions
		const skillEntries = available.map((skill) => {
			const desc = this.truncateDescription(skill.description);
			return `${skill.name}: ${desc}`;
		});

		return `<skills>\n${skillEntries.join("\n")}\n</skills>`;
	}

	/**
	 * Generate prompt with lazy loading instructions.
	 */
	generateLazyLoadingPrompt(skills: (Skill | ScoredSkill)[]): string {
		if (skills.length === 0) {
			return "";
		}

		const available = skills.filter((s) => !s.disableModelInvocation);
		if (available.length === 0) {
			return "";
		}

		const lines: string[] = [];

		lines.push("<available_skills>");
		lines.push("Skills provide specialized instructions for specific tasks.");
		lines.push("To use a skill, call `read` with its path when the task matches.");
		lines.push("");

		for (const skill of available) {
			lines.push(`- ${skill.name}: ${this.truncateDescription(skill.description)}`);
			if (this.options.includePaths) {
				lines.push(`  Path: ${skill.filePath}`);
			}
		}

		lines.push("");
		lines.push("When a skill is loaded, follow its instructions carefully.");
		lines.push("</available_skills>");

		return lines.join("\n");
	}
}

/**
 * Create a skills prompt optimizer instance.
 */
export function createSkillsPromptOptimizer(options?: PromptOptimizationOptions): SkillsPromptOptimizer {
	return new SkillsPromptOptimizer(options);
}

/**
 * Generate optimized prompt for skills.
 */
export function generateOptimizedSkillsPrompt(
	skills: (Skill | ScoredSkill)[],
	options?: PromptOptimizationOptions,
): string {
	const optimizer = createSkillsPromptOptimizer(options);
	return optimizer.generatePrompt(skills);
}

/**
 * Generate minimal prompt for skills.
 */
export function generateMinimalSkillsPrompt(skills: (Skill | ScoredSkill)[]): string {
	const optimizer = createSkillsPromptOptimizer();
	return optimizer.generateMinimalPrompt(skills);
}

/**
 * Generate lazy loading prompt for skills.
 */
export function generateLazyLoadingSkillsPrompt(
	skills: (Skill | ScoredSkill)[],
	options?: PromptOptimizationOptions,
): string {
	const optimizer = createSkillsPromptOptimizer(options);
	return optimizer.generateLazyLoadingPrompt(skills);
}
