/**
 * Dynamic Skills Loading Module
 *
 * This module provides dynamic skills loading based on user queries,
 * implementing relevance scoring and lazy loading for improved efficiency.
 */

import type { ResourceDiagnostic } from "./diagnostics.ts";
import type { Skill } from "./skills.ts";

/**
 * Skill relevance score breakdown.
 */
export interface SkillRelevanceScore {
	/** Overall relevance score (0-1) */
	score: number;
	/** Name match score */
	nameMatch: number;
	/** Description match score */
	descriptionMatch: number;
	/** Keyword match score */
	keywordMatch: number;
	/** Recency bonus */
	recencyBonus: number;
}

/**
 * Skill with relevance information.
 */
export interface ScoredSkill extends Skill {
	/** Relevance score for the current query */
	relevance: SkillRelevanceScore;
	/** Timestamp of last use */
	lastUsed?: number;
	/** Usage count */
	usageCount: number;
}

/**
 * Dynamic skills loading options.
 */
export interface DynamicSkillsOptions {
	/** Maximum number of skills to include in prompt */
	maxSkills?: number;
	/** Minimum relevance score threshold (0-1) */
	minRelevance?: number;
	/** Whether to include skill content in prompt */
	includeContent?: boolean;
	/** Whether to cache loaded skills */
	cacheSkills?: boolean;
	/** Cache TTL in milliseconds */
	cacheTTL?: number;
}

/**
 * Skill cache entry.
 */
interface SkillCacheEntry {
	/** Cached skill data */
	skill: ScoredSkill;
	/** Cache timestamp */
	timestamp: number;
	/** Cache hit count */
	hits: number;
}

/**
 * Dynamic skills loader with relevance scoring and caching.
 */
export class DynamicSkillsLoader {
	private skills: Map<string, ScoredSkill> = new Map();
	private cache: Map<string, SkillCacheEntry> = new Map();
	private options: Required<DynamicSkillsOptions>;

	constructor(options: DynamicSkillsOptions = {}) {
		this.options = {
			maxSkills: options.maxSkills ?? 10,
			minRelevance: options.minRelevance ?? 0.3,
			includeContent: options.includeContent ?? false,
			cacheSkills: options.cacheSkills ?? true,
			cacheTTL: options.cacheTTL ?? 5 * 60 * 1000, // 5 minutes
		};
	}

	/**
	 * Load skills dynamically based on user query.
	 */
	async loadSkillsForQuery(query: string, allSkills: Skill[]): Promise<ScoredSkill[]> {
		// Score all skills for relevance
		const scoredSkills = allSkills.map((skill) => this.scoreSkill(skill, query));

		// Filter by minimum relevance
		const relevantSkills = scoredSkills.filter((skill) => skill.relevance.score >= this.options.minRelevance);

		// Sort by relevance score (descending)
		relevantSkills.sort((a, b) => b.relevance.score - a.relevance.score);

		// Limit to max skills
		const limitedSkills = relevantSkills.slice(0, this.options.maxSkills);

		// Update cache
		if (this.options.cacheSkills) {
			this.updateCache(limitedSkills);
		}

		return limitedSkills;
	}

	/**
	 * Score a skill for relevance to a query.
	 */
	private scoreSkill(skill: Skill, query: string): ScoredSkill {
		const queryLower = query.toLowerCase();
		const queryWords = queryLower.split(/\s+/).filter((word) => word.length > 2);

		// Name match score
		const nameMatch = this.calculateNameMatch(skill.name, queryLower, queryWords);

		// Description match score
		const descriptionMatch = this.calculateDescriptionMatch(skill.description, queryLower, queryWords);

		// Keyword match score
		const keywordMatch = this.calculateKeywordMatch(skill, queryWords);

		// Recency bonus
		const recencyBonus = this.calculateRecencyBonus(skill.name);

		// Calculate overall score (weighted average)
		const score = nameMatch * 0.3 + descriptionMatch * 0.4 + keywordMatch * 0.2 + recencyBonus * 0.1;

		return {
			...skill,
			relevance: {
				score,
				nameMatch,
				descriptionMatch,
				keywordMatch,
				recencyBonus,
			},
			lastUsed: this.skills.get(skill.name)?.lastUsed,
			usageCount: this.skills.get(skill.name)?.usageCount ?? 0,
		};
	}

	/**
	 * Calculate name match score.
	 */
	private calculateNameMatch(name: string, queryLower: string, queryWords: string[]): number {
		const nameLower = name.toLowerCase();

		// Exact match
		if (nameLower === queryLower) {
			return 1.0;
		}

		// Contains match
		if (nameLower.includes(queryLower) || queryLower.includes(nameLower)) {
			return 0.8;
		}

		// Word overlap
		const nameWords = nameLower.split(/[-_\s]+/);
		const overlap = queryWords.filter((word) =>
			nameWords.some((nameWord) => nameWord.includes(word) || word.includes(nameWord)),
		);

		if (overlap.length > 0) {
			return 0.6 * (overlap.length / queryWords.length);
		}

		return 0.0;
	}

	/**
	 * Calculate description match score.
	 */
	private calculateDescriptionMatch(description: string, queryLower: string, queryWords: string[]): number {
		const descLower = description.toLowerCase();

		// Exact phrase match
		if (descLower.includes(queryLower)) {
			return 1.0;
		}

		// Word overlap
		const descWords = descLower.split(/\s+/);
		const overlap = queryWords.filter((word) =>
			descWords.some((descWord) => descWord.includes(word) || word.includes(descWord)),
		);

		if (overlap.length > 0) {
			return 0.8 * (overlap.length / queryWords.length);
		}

		// Partial word matches
		const partialMatches = queryWords.filter((word) =>
			descWords.some((descWord) => descWord.startsWith(word) || word.startsWith(descWord)),
		);

		if (partialMatches.length > 0) {
			return 0.4 * (partialMatches.length / queryWords.length);
		}

		return 0.0;
	}

	/**
	 * Calculate keyword match score.
	 */
	private calculateKeywordMatch(skill: Skill, queryWords: string[]): number {
		// Extract keywords from skill name and description
		const skillText = `${skill.name} ${skill.description}`.toLowerCase();
		const skillWords = skillText.split(/[-_\s]+/);

		// Calculate keyword overlap
		const overlap = queryWords.filter((word) =>
			skillWords.some((skillWord) => skillWord.includes(word) || word.includes(skillWord)),
		);

		if (overlap.length > 0) {
			return overlap.length / queryWords.length;
		}

		return 0.0;
	}

	/**
	 * Calculate recency bonus.
	 */
	private calculateRecencyBonus(skillName: string): number {
		const cached = this.cache.get(skillName);
		if (!cached) {
			return 0.0;
		}

		const timeSinceUse = Date.now() - cached.timestamp;
		const maxAge = this.options.cacheTTL;

		// Exponential decay bonus
		return Math.exp(-timeSinceUse / maxAge);
	}

	/**
	 * Update skill cache.
	 */
	private updateCache(skills: ScoredSkill[]): void {
		const now = Date.now();

		for (const skill of skills) {
			const existing = this.cache.get(skill.name);

			if (existing) {
				existing.hits++;
				existing.timestamp = now;
			} else {
				this.cache.set(skill.name, {
					skill,
					timestamp: now,
					hits: 1,
				});
			}

			// Update skill usage tracking
			this.skills.set(skill.name, {
				...skill,
				lastUsed: now,
				usageCount: (skill.usageCount ?? 0) + 1,
			});
		}

		// Clean expired cache entries
		this.cleanCache();
	}

	/**
	 * Clean expired cache entries.
	 */
	private cleanCache(): void {
		const now = Date.now();
		const maxAge = this.options.cacheTTL;

		for (const [key, entry] of this.cache.entries()) {
			if (now - entry.timestamp > maxAge) {
				this.cache.delete(key);
			}
		}
	}

	/**
	 * Get cached skill.
	 */
	getCachedSkill(skillName: string): ScoredSkill | undefined {
		const entry = this.cache.get(skillName);
		if (!entry) {
			return undefined;
		}

		// Check if cache entry is expired
		const timeSinceUse = Date.now() - entry.timestamp;
		if (timeSinceUse > this.options.cacheTTL) {
			this.cache.delete(skillName);
			return undefined;
		}

		return entry.skill;
	}

	/**
	 * Clear cache.
	 */
	clearCache(): void {
		this.cache.clear();
	}

	/**
	 * Get cache statistics.
	 */
	getCacheStats(): {
		size: number;
		hits: number;
		misses: number;
		hitRate: number;
	} {
		let totalHits = 0;
		const totalMisses = 0;

		for (const entry of this.cache.values()) {
			totalHits += entry.hits;
		}

		return {
			size: this.cache.size,
			hits: totalHits,
			misses: totalMisses,
			hitRate: totalHits > 0 ? totalHits / (totalHits + totalMisses) : 0,
		};
	}

	/**
	 * Format skills for prompt with lazy loading support.
	 */
	formatSkillsForPrompt(skills: ScoredSkill[]): string {
		if (skills.length === 0) {
			return "";
		}

		const available = skills.filter((s) => !s.disableModelInvocation);
		if (available.length === 0) {
			return "";
		}

		let prompt = "\n<available_skills>\n";
		prompt += "The following skills provide specialized instructions for specific tasks.\n";
		prompt += "Use the read tool to load a skill's file when the task matches its description.\n";
		prompt += "When a skill file references a relative path, resolve it against the skill directory.\n\n";

		for (const skill of available) {
			prompt += `<skill>\n`;
			prompt += `  <name>${this.escapeXml(skill.name)}</name>\n`;
			prompt += `  <description>${this.escapeXml(skill.description)}</description>\n`;
			prompt += `  <location>${this.escapeXml(skill.filePath)}</location>\n`;

			// Include relevance score if available
			if (skill.relevance) {
				prompt += `  <relevance>${skill.relevance.score.toFixed(2)}</relevance>\n`;
			}

			// Include usage statistics if available
			if (skill.usageCount > 0) {
				prompt += `  <usage_count>${skill.usageCount}</usage_count>\n`;
			}

			prompt += `</skill>\n`;
		}

		prompt += "</available_skills>\n";

		return prompt;
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
}

/**
 * Create a dynamic skills loader instance.
 */
export function createDynamicSkillsLoader(options?: DynamicSkillsOptions): DynamicSkillsLoader {
	return new DynamicSkillsLoader(options);
}

/**
 * Load skills dynamically for a query.
 */
export async function loadSkillsForQuery(
	query: string,
	allSkills: Skill[],
	options?: DynamicSkillsOptions,
): Promise<ScoredSkill[]> {
	const loader = createDynamicSkillsLoader(options);
	return loader.loadSkillsForQuery(query, allSkills);
}

/**
 * Format skills for prompt with lazy loading.
 */
export function formatSkillsForPromptLazy(skills: ScoredSkill[]): string {
	const loader = createDynamicSkillsLoader();
	return loader.formatSkillsForPrompt(skills);
}
