import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import ignore from "ignore";
import { basename, dirname, join, relative, resolve, sep } from "path";
import { CONFIG_DIR_NAME, getAgentDir } from "../config.ts";
import { parseFrontmatter } from "../utils/frontmatter.ts";
import { canonicalizePath, resolvePath } from "../utils/paths.ts";
import type { ResourceDiagnostic } from "./diagnostics.ts";
import { createSyntheticSourceInfo, type SourceInfo } from "./source-info.ts";

/** Max name length per spec */
const MAX_NAME_LENGTH = 64;

/** Max description length per spec */
const MAX_DESCRIPTION_LENGTH = 1024;

const IGNORE_FILE_NAMES = [".gitignore", ".ignore", ".fdignore"];

type IgnoreMatcher = ReturnType<typeof ignore>;

function toPosixPath(p: string): string {
	return p.split(sep).join("/");
}

function prefixIgnorePattern(line: string, prefix: string): string | null {
	const trimmed = line.trim();
	if (!trimmed) return null;
	if (trimmed.startsWith("#") && !trimmed.startsWith("\\#")) return null;

	let pattern = line;
	let negated = false;

	if (pattern.startsWith("!")) {
		negated = true;
		pattern = pattern.slice(1);
	} else if (pattern.startsWith("\\!")) {
		pattern = pattern.slice(1);
	}

	if (pattern.startsWith("/")) {
		pattern = pattern.slice(1);
	}

	const prefixed = prefix ? `${prefix}${pattern}` : pattern;
	return negated ? `!${prefixed}` : prefixed;
}

function addIgnoreRules(ig: IgnoreMatcher, dir: string, rootDir: string): void {
	const relativeDir = relative(rootDir, dir);
	const prefix = relativeDir ? `${toPosixPath(relativeDir)}/` : "";

	for (const filename of IGNORE_FILE_NAMES) {
		const ignorePath = join(dir, filename);
		if (!existsSync(ignorePath)) continue;
		try {
			const content = readFileSync(ignorePath, "utf-8");
			const patterns = content
				.split(/\r?\n/)
				.map((line) => prefixIgnorePattern(line, prefix))
				.filter((line): line is string => Boolean(line));
			if (patterns.length > 0) {
				ig.add(patterns);
			}
		} catch {}
	}
}

export interface SkillFrontmatter {
	name?: string;
	description?: string;
	"disable-model-invocation"?: boolean;
	[key: string]: unknown;
}

export interface Skill {
	name: string;
	description: string;
	filePath: string;
	baseDir: string;
	sourceInfo: SourceInfo;
	disableModelInvocation: boolean;
}

export interface LoadSkillsResult {
	skills: Skill[];
	diagnostics: ResourceDiagnostic[];
}

/**
 * Validate skill name per Agent Skills spec.
 * Returns array of validation error messages (empty if valid).
 */
function validateName(name: string): string[] {
	const errors: string[] = [];

	if (name.length > MAX_NAME_LENGTH) {
		errors.push(`name exceeds ${MAX_NAME_LENGTH} characters (${name.length})`);
	}

	if (!/^[a-z0-9-]+$/.test(name)) {
		errors.push(`name contains invalid characters (must be lowercase a-z, 0-9, hyphens only)`);
	}

	if (name.startsWith("-") || name.endsWith("-")) {
		errors.push(`name must not start or end with a hyphen`);
	}

	if (name.includes("--")) {
		errors.push(`name must not contain consecutive hyphens`);
	}

	return errors;
}

/**
 * Validate description per Agent Skills spec.
 */
function validateDescription(description: string | undefined): string[] {
	const errors: string[] = [];

	if (description && description.length > MAX_DESCRIPTION_LENGTH) {
		errors.push(`description exceeds ${MAX_DESCRIPTION_LENGTH} characters (${description.length})`);
	}

	return errors;
}

/**
 * Derive a description from the skill body when the frontmatter
 * doesn't include one. Uses the first non-empty meaningful line:
 * - First H1/H2 heading if present
 * - Otherwise the first non-empty paragraph line, truncated
 *
 * The goal is to give the LLM *something* to decide when to invoke
 * the skill, even when the author didn't write an explicit description.
 * Returns undefined if no useful text can be extracted.
 */
export function deriveDescriptionFromBody(body: string): string | undefined {
	const MAX_LEN = 200;
	const lines = body.split(/\r?\n/);

	// First, look for a heading (H1 or H2) and use its text
	for (const rawLine of lines) {
		const line = rawLine.trim();
		if (!line) continue;
		const headingMatch = line.match(/^#{1,2}\s+(.+?)\s*#*\s*$/);
		if (headingMatch) {
			const text = headingMatch[1].trim();
			if (text.length > 0) {
				return text.length > MAX_LEN ? `${text.slice(0, MAX_LEN - 1)}…` : text;
			}
		}
		// Stop scanning at the first non-empty line regardless of whether it was a heading
		break;
	}

	// No heading: take the first non-empty paragraph line
	for (const rawLine of lines) {
		const line = rawLine.trim();
		if (!line) continue;
		// Skip things that look like frontmatter or code fences
		if (line.startsWith("---") || line.startsWith("```") || line.startsWith("#")) continue;
		// Strip leading bullet/number list markers
		const cleaned = line.replace(/^[-*+]\s+/, "").replace(/^\d+\.\s+/, "");
		if (cleaned.length === 0) continue;
		return cleaned.length > MAX_LEN ? `${cleaned.slice(0, MAX_LEN - 1)}…` : cleaned;
	}

	return undefined;
}

export interface LoadSkillsFromDirOptions {
	/** Directory to scan for skills */
	dir: string;
	/** Source identifier for these skills */
	source: string;
}

function createSkillSourceInfo(filePath: string, baseDir: string, source: string): SourceInfo {
	switch (source) {
		case "user":
			return createSyntheticSourceInfo(filePath, {
				source: "local",
				scope: "user",
				baseDir,
			});
		case "project":
			return createSyntheticSourceInfo(filePath, {
				source: "local",
				scope: "project",
				baseDir,
			});
		case "path":
			return createSyntheticSourceInfo(filePath, {
				source: "local",
				baseDir,
			});
		default:
			return createSyntheticSourceInfo(filePath, { source, baseDir });
	}
}

/**
 * Load skills from a directory.
 *
 * Discovery rules:
 * - if a directory contains SKILL.md, treat it as a skill root and do not recurse further
 * - otherwise, load direct .md children in the root
 * - recurse into subdirectories to find SKILL.md
 */
export function loadSkillsFromDir(options: LoadSkillsFromDirOptions): LoadSkillsResult {
	const { dir, source } = options;
	return loadSkillsFromDirInternal(dir, source, true);
}

function loadSkillsFromDirInternal(
	dir: string,
	source: string,
	includeRootFiles: boolean,
	ignoreMatcher?: IgnoreMatcher,
	rootDir?: string,
): LoadSkillsResult {
	const skills: Skill[] = [];
	const diagnostics: ResourceDiagnostic[] = [];

	if (!existsSync(dir)) {
		return { skills, diagnostics };
	}

	const root = rootDir ?? dir;
	const ig = ignoreMatcher ?? ignore();
	addIgnoreRules(ig, dir, root);

	try {
		const entries = readdirSync(dir, { withFileTypes: true });

		for (const entry of entries) {
			if (entry.name !== "SKILL.md") {
				continue;
			}

			const fullPath = join(dir, entry.name);

			let isFile = entry.isFile();
			if (entry.isSymbolicLink()) {
				try {
					isFile = statSync(fullPath).isFile();
				} catch {
					continue;
				}
			}

			const relPath = toPosixPath(relative(root, fullPath));
			if (!isFile || ig.ignores(relPath)) {
				continue;
			}

			const result = loadSkillFromFile(fullPath, source);
			if (result.skill) {
				skills.push(result.skill);
			}
			diagnostics.push(...result.diagnostics);
			return { skills, diagnostics };
		}

		for (const entry of entries) {
			if (entry.name.startsWith(".")) {
				continue;
			}

			// Skip node_modules to avoid scanning dependencies
			if (entry.name === "node_modules") {
				continue;
			}

			const fullPath = join(dir, entry.name);

			// For symlinks, check if they point to a directory and follow them
			let isDirectory = entry.isDirectory();
			let isFile = entry.isFile();
			if (entry.isSymbolicLink()) {
				try {
					const stats = statSync(fullPath);
					isDirectory = stats.isDirectory();
					isFile = stats.isFile();
				} catch {
					// Broken symlink, skip it
					continue;
				}
			}

			const relPath = toPosixPath(relative(root, fullPath));
			const ignorePath = isDirectory ? `${relPath}/` : relPath;
			if (ig.ignores(ignorePath)) {
				continue;
			}

			if (isDirectory) {
				const subResult = loadSkillsFromDirInternal(fullPath, source, false, ig, root);
				skills.push(...subResult.skills);
				diagnostics.push(...subResult.diagnostics);
				continue;
			}

			if (!isFile || !includeRootFiles || !entry.name.endsWith(".md")) {
				continue;
			}

			const result = loadSkillFromFile(fullPath, source);
			if (result.skill) {
				skills.push(result.skill);
			}
			diagnostics.push(...result.diagnostics);
		}
	} catch {}

	return { skills, diagnostics };
}

function loadSkillFromFile(
	filePath: string,
	source: string,
): { skill: Skill | null; diagnostics: ResourceDiagnostic[] } {
	const diagnostics: ResourceDiagnostic[] = [];

	try {
		const rawContent = readFileSync(filePath, "utf-8");
		const { frontmatter, body } = parseFrontmatter<SkillFrontmatter>(rawContent);
		const skillDir = dirname(filePath);
		const parentDirName = basename(skillDir);

		// Use description from frontmatter, or fall back to deriving it from the body
		let description = frontmatter.description?.trim();
		if (!description || description.length === 0) {
			const derived = deriveDescriptionFromBody(body);
			if (derived) {
				description = derived;
				// Skill loaded successfully using a derived description.
				// No need to nag the user — the skill works. We just keep
				// the `descriptionWasDerived` flag available for callers
				// that want to surface it.
			} else {
				diagnostics.push({
					type: "warning",
					message:
						"Skill has no description and no extractable heading; skipping load. Add a 'description' field to the frontmatter.",
					path: filePath,
				});
				return { skill: null, diagnostics };
			}
		}

		// Validate description length
		const descErrors = validateDescription(description);
		for (const error of descErrors) {
			diagnostics.push({ type: "warning", message: error, path: filePath });
		}

		// Use name from frontmatter, or fall back to parent directory name
		const name = frontmatter.name || parentDirName;

		// Validate name
		const nameErrors = validateName(name);
		for (const error of nameErrors) {
			diagnostics.push({ type: "warning", message: error, path: filePath });
		}

		// Skill is loaded (description is guaranteed non-empty at this point)
		return {
			skill: {
				name,
				description,
				filePath,
				baseDir: skillDir,
				sourceInfo: createSkillSourceInfo(filePath, skillDir, source),
				disableModelInvocation: frontmatter["disable-model-invocation"] === true,
			},
			diagnostics,
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : "failed to parse skill file";
		diagnostics.push({ type: "warning", message, path: filePath });
		return { skill: null, diagnostics };
	}
}

/**
 * Format skills for inclusion in a system prompt.
 * Uses XML format per Agent Skills standard.
 * See: https://agentskills.io/integrate-skills
 *
 * Skills with disableModelInvocation=true are excluded from the prompt
 * (they can only be invoked explicitly via /skill:name commands).
 */
export function formatSkillsForPrompt(skills: Skill[]): string {
	const visibleSkills = skills.filter((s) => !s.disableModelInvocation);

	if (visibleSkills.length === 0) {
		return "";
	}

	const lines = [
		"\n\nThe following skills provide specialized instructions for specific tasks.",
		"Use the read tool to load a skill's file when the task matches its description.",
		"When a skill file references a relative path, resolve it against the skill directory (parent of SKILL.md / dirname of the path) and use that absolute path in tool commands.",
		"",
		"<available_skills>",
	];

	for (const skill of visibleSkills) {
		lines.push("  <skill>");
		lines.push(`    <name>${escapeXml(skill.name)}</name>`);
		lines.push(`    <description>${escapeXml(skill.description)}</description>`);
		lines.push(`    <location>${escapeXml(skill.filePath)}</location>`);
		lines.push("  </skill>");
	}

	lines.push("</available_skills>");

	return lines.join("\n");
}

function escapeXml(str: string): string {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}

export interface LoadSkillsOptions {
	/** Working directory for project-local skills. */
	cwd: string;
	/** Agent config directory for global skills. */
	agentDir: string;
	/** Explicit skill paths (files or directories) */
	skillPaths: string[];
	/** Include default skills directories. */
	includeDefaults: boolean;
}

/**
 * Load skills from all configured locations.
 * Returns skills and any validation diagnostics.
 */
export function loadSkills(options: LoadSkillsOptions): LoadSkillsResult {
	const { agentDir, skillPaths, includeDefaults } = options;

	// Resolve agentDir - if not provided, use default from config
	const resolvedCwd = resolvePath(options.cwd);
	const resolvedAgentDir = resolvePath(agentDir ?? getAgentDir());

	const skillMap = new Map<string, Skill>();
	const realPathSet = new Set<string>();
	const allDiagnostics: ResourceDiagnostic[] = [];
	const collisionDiagnostics: ResourceDiagnostic[] = [];

	function addSkills(result: LoadSkillsResult) {
		allDiagnostics.push(...result.diagnostics);
		for (const skill of result.skills) {
			// Resolve symlinks to detect duplicate files
			const realPath = canonicalizePath(skill.filePath);

			// Skip silently if we've already loaded this exact file (via symlink)
			if (realPathSet.has(realPath)) {
				continue;
			}

			const existing = skillMap.get(skill.name);
			if (existing) {
				collisionDiagnostics.push({
					type: "collision",
					message: `name "${skill.name}" collision`,
					path: skill.filePath,
					collision: {
						resourceType: "skill",
						name: skill.name,
						winnerPath: existing.filePath,
						loserPath: skill.filePath,
					},
				});
			} else {
				skillMap.set(skill.name, skill);
				realPathSet.add(realPath);
			}
		}
	}

	if (includeDefaults) {
		// Install built-in skills first so they're available for loading
		ensureBuiltinSkills(resolvedAgentDir);
		addSkills(loadSkillsFromDirInternal(join(resolvedAgentDir, "skills"), "user", true));
		addSkills(loadSkillsFromDirInternal(resolve(resolvedCwd, CONFIG_DIR_NAME, "skills"), "project", true));
	}

	const userSkillsDir = join(resolvedAgentDir, "skills");
	const projectSkillsDir = resolve(resolvedCwd, CONFIG_DIR_NAME, "skills");

	const isUnderPath = (target: string, root: string): boolean => {
		const normalizedRoot = resolve(root);
		if (target === normalizedRoot) {
			return true;
		}
		const prefix = normalizedRoot.endsWith(sep) ? normalizedRoot : `${normalizedRoot}${sep}`;
		return target.startsWith(prefix);
	};

	const getSource = (resolvedPath: string): "user" | "project" | "path" => {
		if (!includeDefaults) {
			if (isUnderPath(resolvedPath, userSkillsDir)) return "user";
			if (isUnderPath(resolvedPath, projectSkillsDir)) return "project";
		}
		return "path";
	};

	for (const rawPath of skillPaths) {
		const resolvedPath = resolvePath(rawPath, resolvedCwd, { trim: true });
		if (!existsSync(resolvedPath)) {
			allDiagnostics.push({ type: "warning", message: "skill path does not exist", path: resolvedPath });
			continue;
		}

		try {
			const stats = statSync(resolvedPath);
			const source = getSource(resolvedPath);
			if (stats.isDirectory()) {
				addSkills(loadSkillsFromDirInternal(resolvedPath, source, true));
			} else if (stats.isFile() && resolvedPath.endsWith(".md")) {
				const result = loadSkillFromFile(resolvedPath, source);
				if (result.skill) {
					addSkills({ skills: [result.skill], diagnostics: result.diagnostics });
				} else {
					allDiagnostics.push(...result.diagnostics);
				}
			} else {
				allDiagnostics.push({ type: "warning", message: "skill path is not a markdown file", path: resolvedPath });
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : "failed to read skill path";
			allDiagnostics.push({ type: "warning", message, path: resolvedPath });
		}
	}

	return {
		skills: Array.from(skillMap.values()),
		diagnostics: [...allDiagnostics, ...collisionDiagnostics],
	};
}

// ── Built-in skill files (shipped with the agent, auto-installed) ──

const BUILTIN_SKILLS: Record<string, string> = {
	dev: `---
name: dev
description: Software development expertise — code design, implementation, refactoring, debugging, testing, and code review. Use when the user asks about writing code, fixing bugs, refactoring, or implementing features.
---

# Development Expert

## Approach
1. Understand first — read the relevant code before suggesting changes
2. Check conventions — match existing patterns
3. Keep it simple — prefer clarity over cleverness
4. Test as you go — write or update tests with every change
5. Handle errors — every function should handle or propagate errors

## Code Quality
- Functions should be small and single-purpose
- No magic numbers; use named constants
- Avoid deep nesting; extract helpers
- Use guard clauses to flatten conditionals
- Document public APIs with JSDoc

## When Refactoring
- Don't change behavior — only structure
- Make one change at a time, verify tests pass
- Rename for clarity — names should reveal intent
`,
	qa: `---
name: qa
description: Quality assurance and testing expertise — test strategy, test case design, automated testing, regression testing, test frameworks, and coverage analysis. Use when the user asks about testing, QA, test coverage, or test failures.
---

# QA Expert

## Test Strategy
1. Test pyramid — unit tests > integration tests > e2e tests
2. Coverage targets — aim for 80%+ on critical paths
3. Test behavior, not implementation

## When Writing Tests
- Arrange → Act → Assert: three clear sections
- One logical assertion per test
- Test names should describe the scenario
- Test edge cases: empty inputs, nulls, boundary values, errors

## When Debugging Test Failures
- Isolate — reproduce with a minimal case
- Check test assumptions
- Check for test pollution
- Look for flaky tests: timing, randomness, shared state
`,
	devops: `---
name: devops
description: DevOps and infrastructure expertise — CI/CD pipelines, Docker, Kubernetes, cloud deployment, monitoring, logging, infrastructure-as-code, and build systems. Use when the user asks about deployment, containers, pipelines, cloud, or infrastructure.
---

# DevOps Expert

## Core Principles
1. Infrastructure as Code — everything version-controlled
2. Immutable deployments — deploy artifacts, not mutable servers
3. Observability — logs, metrics, traces
4. Least privilege — minimal permissions
5. Automate everything — if you do it twice, script it

## CI/CD Best Practices
- Fast feedback loops: lint → test → build → deploy
- Cache dependencies between runs
- Run tests in parallel where possible
- Fail fast — lint and unit tests before integration tests

## Docker Guidelines
- Multi-stage builds to minimize image size
- Pin base image versions
- Run as non-root user
- Health checks for every container
`,
	"business-analyst": `---
name: business-analyst
description: Business analysis expertise — requirements gathering, stakeholder analysis, user stories, acceptance criteria, process mapping, and project scoping. Use when the user asks about requirements, user stories, project scope, feature definition, or business needs.
---

# Business Analyst Expert

## Requirements Gathering
1. Ask clarifying questions — who is the user? what problem?
2. Distinguish needs from wants — must-haves before nice-to-haves
3. Identify stakeholders — primary users, secondary users
4. Prioritize with impact/effort

## User Stories
Format: As a <role>, I want <goal> so that <benefit>
Good stories are: Independent, Negotiable, Valuable, Estimable, Small, Testable

## Acceptance Criteria
- Given / When / Then format
- Specific, measurable, unambiguous
- Include both happy path and edge cases
`,
	manager: `---
name: manager
description: Project management expertise — task breakdown, estimation, milestone planning, risk management, stakeholder communication, and team coordination. Use when the user asks about planning, sprint planning, task prioritization, timelines, or project organization.
---

# Project Manager Expert

## Task Breakdown
1. Start with the goal — what is the desired outcome?
2. Decompose into milestones
3. Break milestones into tasks (1-3 days each)
4. Identify dependencies
5. Estimate effort — S/M/L/XL or story points

## Risk Management
1. Identify risks — what could go wrong?
2. Assess — probability × impact
3. Mitigate — reduce probability or impact
4. Contingency — plan B
5. Monitor — review risks weekly
`,
	"tech-architect": `---
name: tech-architect
description: Technical architecture expertise — system design, architecture patterns, technology selection, API design, data modeling, scalability, security architecture, and technical decision-making. Use when the user asks about system design, architecture, technology choices, API design, or scalability.
---

# Technical Architect Expert

## Architecture Principles
1. Simple first — start with the simplest architecture
2. Evolve intentionally — add complexity only when needed
3. Separation of concerns — single responsibility
4. Loose coupling — well-defined interfaces
5. Design for change — isolate what's likely to change

## System Design Process
1. Clarify requirements — functional and non-functional
2. Estimate scale — requests/sec, storage, ratios
3. Define interfaces — APIs, events, contracts
4. Choose data stores — SQL vs NoSQL, caching
5. Design for failure — redundancy, failover
6. Review tradeoffs — CAP theorem

## API Design
- RESTful: Resources over actions
- Versioning: URL-based or header-based
- Pagination: Cursor-based for large datasets
- Errors: Consistent format with code, message, details
`,
};

/**
 * Ensure built-in skill files exist in the user's skills directory.
 * Called during skills loading so the agent always has the 6 role-based
 * skills available even after a fresh install.
 */
function ensureBuiltinSkills(agentDir: string): void {
	try {
		const skillsDir = join(agentDir, "skills");
		mkdirSync(skillsDir, { recursive: true });
		for (const [name, content] of Object.entries(BUILTIN_SKILLS)) {
			const skillDir = join(skillsDir, name);
			const skillFile = join(skillDir, "SKILL.md");
			if (existsSync(skillFile)) continue; // Already exists — respect user edits
			mkdirSync(skillDir, { recursive: true });
			writeFileSync(skillFile, content);
		}
	} catch {
		// Best-effort — don't crash if we can't write skills
	}
}
