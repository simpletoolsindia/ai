/**
 * User Persona / Personalized Skills System
 *
 * Observes user behavior during agent conversations and builds a
 * "persona" profile with preferences, coding conventions, project
 * patterns, and workflow habits. On session end, this profile is
 * synthesized into a personalized skill file that the agent loads
 * in future sessions, so it adapts to each user's style over time.
 *
 * Architecture:
 *   PersonaStore (in-memory) → observes conversations → builds profile
 *   SessionEnd → synthesize persona skill → write to ~/.ai/agent/skills/personalized/SKILL.md
 *   Next session → skills loader picks it up → injected into system prompt
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "../config.ts";

// ── Types ──────────────────────────────────────────────────

export interface PersonaProfile {
	/** When this profile was last updated. */
	updatedAt: string;
	/** Coding conventions observed. */
	conventions: PersonaConventions;
	/** Project patterns (directory structure, config, testing). */
	projectPatterns: PersonaProjectPatterns;
	/** User preferences and workflow habits. */
	preferences: PersonaPreferences;
	/** Languages and frameworks the user works with. */
	techStack: string[];
	/** Total observations (turns analyzed). */
	observationCount: number;
}

export interface PersonaConventions {
	/** Indentation style: "spaces" | "tabs" */
	indentation: string;
	/** Quote style: "single" | "double" */
	quotes: string;
	/** Semicolons: "always" | "never" */
	semicolons: string;
	/** Import style: "esm" | "commonjs" */
	importStyle: string;
	/** Naming convention: "camelCase" | "PascalCase" | "snake_case" | "kebab-case" */
	naming: string;
	/** Max function length preference (in lines). */
	maxFunctionLength?: number;
}

export interface PersonaProjectPatterns {
	/** Test directory conventions. */
	testDir: string;
	/** Test file naming pattern. */
	testPattern: string;
	/** Config file preference. */
	configFormat: string;
	/** Package manager preference. */
	packageManager: string;
	/** Monorepo or single-repo. */
	repoStyle: string;
}

export interface PersonaPreferences {
	/** Verbosity: "concise" | "detailed" | "normal" */
	verbosity: string;
	/** Does the user prefer plans before execution? */
	preferPlanFirst: boolean;
	/** Preferred comment style: "inline" | "jsdoc" | "none" */
	commentStyle: string;
	/** Does the user run tests after changes? */
	testAfterChanges: boolean;
	/** Error handling preference: "propagate" | "wrap" | "handle-inline" */
	errorStyle: string;
}

/** Observation from a single agent turn. */
export interface TurnObservation {
	/** User message text. */
	userInput: string;
	/** Tools used in response. */
	toolsUsed: string[];
	/** Files modified. */
	filesModified: string[];
	/** Any user corrections/follow-ups. */
	corrections: string[];
	/** Mode: plan or execute. */
	mode: "plan" | "execute";
}

// ── Defaults ───────────────────────────────────────────────

function defaultProfile(): PersonaProfile {
	return {
		updatedAt: new Date().toISOString(),
		conventions: {
			indentation: "spaces",
			quotes: "single",
			semicolons: "always",
			importStyle: "esm",
			naming: "camelCase",
		},
		projectPatterns: {
			testDir: "__tests__",
			testPattern: "*.test.ts",
			configFormat: "json",
			packageManager: "npm",
			repoStyle: "single",
		},
		preferences: {
			verbosity: "normal",
			preferPlanFirst: true,
			commentStyle: "jsdoc",
			testAfterChanges: true,
			errorStyle: "propagate",
		},
		techStack: ["typescript", "node.js"],
		observationCount: 0,
	};
}

// ── Observation & Learning ─────────────────────────────────

export class PersonaStore {
	private profile: PersonaProfile;
	private observations: TurnObservation[] = [];
	private skillDir: string;

	constructor() {
		this.skillDir = join(getAgentDir(), "skills", "personalized");
		this.profile = this.loadProfile();
	}

	/** Load existing profile from disk, or return default. */
	private loadProfile(): PersonaProfile {
		const profilePath = join(getAgentDir(), "persona.json");
		try {
			if (existsSync(profilePath)) {
				const raw = readFileSync(profilePath, "utf-8");
				const parsed = JSON.parse(raw);
				return { ...defaultProfile(), ...parsed };
			}
		} catch {}
		return defaultProfile();
	}

	/** Save profile to disk. */
	private saveProfile(): void {
		const profilePath = join(getAgentDir(), "persona.json");
		try {
			writeFileSync(profilePath, JSON.stringify(this.profile, null, 2));
		} catch {}
	}

	/**
	 * Observe a single agent turn and update the persona profile.
	 * Call this from interactive-mode after each agent_end.
	 */
	observe(observation: TurnObservation): void {
		this.observations.push(observation);
		this.profile.observationCount += 1;

		// Analyze user input for patterns
		this.analyzeInput(observation.userInput);

		// Analyze tools used
		this.analyzeTools(observation.toolsUsed);

		// Analyze corrections and adjust
		if (observation.corrections.length > 0) {
			this.learnFromCorrections(observation.corrections);
		}

		// Update timestamp
		this.profile.updatedAt = new Date().toISOString();

		// Persist
		this.saveProfile();
	}

	/** Analyze user input for coding conventions. */
	private analyzeInput(input: string): void {
		// Detect indentation preference from code references
		if (input.includes("  ") && !input.includes("\t")) {
			this.profile.conventions.indentation = "spaces";
		} else if (input.includes("\t")) {
			this.profile.conventions.indentation = "tabs";
		}

		// Detect quote preference
		const singleQuotes = (input.match(/'/g) || []).length;
		const doubleQuotes = (input.match(/"/g) || []).length;
		if (singleQuotes > doubleQuotes) {
			this.profile.conventions.quotes = "single";
		} else if (doubleQuotes > singleQuotes) {
			this.profile.conventions.quotes = "double";
		}

		// Detect naming convention
		if (/\bcamelCase\b/.test(input)) this.profile.conventions.naming = "camelCase";
		if (/\bPascalCase\b/.test(input)) this.profile.conventions.naming = "PascalCase";
		if (/\bsnake_case\b/.test(input)) this.profile.conventions.naming = "snake_case";

		// Detect tech stack mentions
		const techMentions: Record<string, string> = {
			react: "react",
			"next\\.js": "next.js",
			vue: "vue",
			angular: "angular",
			svelte: "svelte",
			"node\\.js": "node.js",
			deno: "deno",
			bun: "bun",
			python: "python",
			rust: "rust",
			go: "golang",
			docker: "docker",
			kubernetes: "kubernetes",
			postgres: "postgresql",
			mongodb: "mongodb",
			redis: "redis",
			graphql: "graphql",
			prisma: "prisma",
		};
		for (const [pattern, label] of Object.entries(techMentions)) {
			if (new RegExp(`\\b${pattern}\\b`, "i").test(input) && !this.profile.techStack.includes(label)) {
				this.profile.techStack.push(label);
			}
		}
	}

	/** Analyze tools used to infer project patterns. */
	private analyzeTools(tools: string[]): void {
		if (tools.includes("bash")) {
			// Check for npm/yarn/pnpm
		}
		if (tools.includes("write") || tools.includes("edit")) {
			// User is actively coding
		}
	}

	/** Learn from user corrections. */
	private learnFromCorrections(corrections: string[]): void {
		for (const correction of corrections) {
			const lower = correction.toLowerCase();
			if (lower.includes("too verbose") || lower.includes("shorter")) {
				this.profile.preferences.verbosity = "concise";
			}
			if (lower.includes("more detail") || lower.includes("explain more")) {
				this.profile.preferences.verbosity = "detailed";
			}
			if (lower.includes("add comment") || lower.includes("document")) {
				this.profile.preferences.commentStyle = "jsdoc";
			}
			if (lower.includes("don't comment") || lower.includes("no comments")) {
				this.profile.preferences.commentStyle = "none";
			}
			if (lower.includes("test") || lower.includes("coverage")) {
				this.profile.preferences.testAfterChanges = true;
			}
			if (lower.includes("skip test") || lower.includes("no test")) {
				this.profile.preferences.testAfterChanges = false;
			}
			if (lower.includes("plan first") || lower.includes("read-only first")) {
				this.profile.preferences.preferPlanFirst = true;
			}
			if (lower.includes("just do it") || lower.includes("skip plan")) {
				this.profile.preferences.preferPlanFirst = false;
			}
		}
	}

	/** Get the current profile. */
	getProfile(): PersonaProfile {
		return this.profile;
	}

	/**
	 * Synthesize a personalized skill file from the persona profile.
	 * Writes to ~/.ai/agent/skills/personalized/SKILL.md and
	 * returns the file path.
	 */
	synthesizeSkill(): string {
		const p = this.profile;
		const lines: string[] = [
			"---",
			"name: personalized",
			`description: Personalized AI agent persona — auto-generated from ${p.observationCount} observations. Adapts coding style, conventions, and workflow to match this user's preferences. Use when the user doesn't specify explicit constraints — these are the learned defaults.`,
			"---",
			"",
			"# Personalized Agent Persona",
			"",
			`> Auto-generated from ${p.observationCount} observations over time. Updated continuously as you work.`,
			"",
			"## Coding Conventions",
			"",
			`- Indentation: **${p.conventions.indentation}**`,
			`- Quotes: **${p.conventions.quotes}**`,
			`- Semicolons: **${p.conventions.semicolons}**`,
			`- Imports: **${p.conventions.importStyle}**`,
			`- Naming: **${p.conventions.naming}**`,
			p.conventions.maxFunctionLength ? `- Max function length: **~${p.conventions.maxFunctionLength} lines**` : "",
			"",
			"## Project Patterns",
			"",
			`- Test directory: **${p.projectPatterns.testDir}/**`,
			`- Test pattern: **${p.projectPatterns.testPattern}**`,
			`- Config format: **${p.projectPatterns.configFormat}**`,
			`- Package manager: **${p.projectPatterns.packageManager}**`,
			`- Repo style: **${p.projectPatterns.repoStyle}**`,
			"",
			"## User Preferences",
			"",
			`- Verbosity: **${p.preferences.verbosity}**`,
			p.preferences.preferPlanFirst
				? "- Plan-first workflow: prefer to outline a plan before making changes"
				: "- Execute-first workflow: jump into implementation, skip planning",
			`- Comments: **${p.preferences.commentStyle}**`,
			p.preferences.testAfterChanges ? "- Run tests after every change" : "- Only run tests when explicitly asked",
			`- Error handling: **${p.preferences.errorStyle}**`,
			"",
			"## Tech Stack",
			"",
			p.techStack.map((t) => `- **${t}**`).join("\n"),
			"",
			"## When to Apply",
			"",
			"These conventions should be applied when:",
			"- Creating new files — follow naming, import, and comment conventions",
			"- Editing existing files — match the existing style but apply learned conventions",
			"- Writing tests — use the test directory and naming pattern",
			"- Running commands — use the preferred package manager",
			"- The user doesn't specify explicit constraints — these are the defaults",
			"",
			"> **Tip:** The more you work with the agent, the better these defaults become. Corrections and follow-up messages help the agent learn faster.",
			"",
		];

		const content = lines.join("\n");
		mkdirSync(this.skillDir, { recursive: true });
		const skillPath = join(this.skillDir, "SKILL.md");
		writeFileSync(skillPath, content);
		return skillPath;
	}

	/**
	 * Check if the persona has enough observations to be useful.
	 * Returns true when there are at least 3 observations.
	 */
	isReady(): boolean {
		return this.profile.observationCount >= 3;
	}
}

/** Singleton persona store instance. */
let _store: PersonaStore | null = null;

export function getPersonaStore(): PersonaStore {
	if (!_store) _store = new PersonaStore();
	return _store;
}
