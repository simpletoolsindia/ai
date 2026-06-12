/**
 * Async skills loading implementation.
 *
 * This module provides async versions of the skills loading functions,
 * replacing the synchronous fs calls with async operations.
 * This improves startup performance by not blocking the event loop.
 */

import { constants, type Dirent } from "node:fs";
import { access as fsAccess, readdir as fsReaddir, readFile as fsReadFile, stat as fsStat } from "node:fs/promises";
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

async function addIgnoreRulesAsync(ig: IgnoreMatcher, dir: string, rootDir: string): Promise<void> {
	const relativeDir = relative(rootDir, dir);
	const prefix = relativeDir ? `${toPosixPath(relativeDir)}/` : "";

	for (const filename of IGNORE_FILE_NAMES) {
		const ignorePath = join(dir, filename);
		try {
			await fsAccess(ignorePath, constants.R_OK);
			const content = await fsReadFile(ignorePath, "utf-8");
			const patterns = content
				.split(/\r?\n/)
				.map((line) => prefixIgnorePattern(line, prefix))
				.filter((line): line is string => Boolean(line));
			if (patterns.length > 0) {
				ig.add(patterns);
			}
		} catch {
			// File doesn't exist or can't be read, skip
		}
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
 * Load a skill from a file asynchronously.
 */
async function loadSkillFromFileAsync(
	filePath: string,
	source: string,
): Promise<{ skill: Skill | null; diagnostics: ResourceDiagnostic[] }> {
	const diagnostics: ResourceDiagnostic[] = [];

	try {
		const content = await fsReadFile(filePath, "utf-8");
		const { frontmatter, body } = parseFrontmatter(content);
		const fm = frontmatter as SkillFrontmatter;

		// Derive name from directory name if not in frontmatter
		const dirName = basename(dirname(filePath));
		const name = fm.name ?? dirName;

		// Validate name
		const nameErrors = validateName(name);
		if (nameErrors.length > 0) {
			diagnostics.push({
				type: "warning",
				code: "invalid_skill_name",
				message: `Invalid skill name "${name}": ${nameErrors.join(", ")}`,
				path: filePath,
			});
			return { skill: null, diagnostics };
		}

		// Derive description from body if not in frontmatter
		const description = fm.description ?? deriveDescriptionFromBody(body) ?? "";

		// Validate description
		const descErrors = validateDescription(fm.description);
		if (descErrors.length > 0) {
			diagnostics.push({
				type: "warning",
				code: "invalid_skill_description",
				message: `Invalid skill description: ${descErrors.join(", ")}`,
				path: filePath,
			});
		}

		const baseDir = dirname(filePath);

		return {
			skill: {
				name,
				description,
				filePath,
				baseDir,
				sourceInfo: createSkillSourceInfo(filePath, baseDir, source),
				disableModelInvocation: fm["disable-model-invocation"] ?? false,
			},
			diagnostics,
		};
	} catch (error) {
		diagnostics.push({
			type: "warning",
			code: "skill_load_failed",
			message: `Failed to load skill: ${error instanceof Error ? error.message : String(error)}`,
			path: filePath,
		});
		return { skill: null, diagnostics };
	}
}

/**
 * Load skills from a directory asynchronously.
 *
 * Discovery rules:
 * - if a directory contains SKILL.md, treat it as a skill root and do not recurse further
 * - otherwise, load direct .md children in the root
 * - recurse into subdirectories to find SKILL.md
 */
export async function loadSkillsFromDirAsync(options: LoadSkillsFromDirOptions): Promise<LoadSkillsResult> {
	const { dir, source } = options;
	return loadSkillsFromDirInternalAsync(dir, source, true);
}

async function loadSkillsFromDirInternalAsync(
	dir: string,
	source: string,
	includeRootFiles: boolean,
	ignoreMatcher?: IgnoreMatcher,
	rootDir?: string,
): Promise<LoadSkillsResult> {
	const skills: Skill[] = [];
	const diagnostics: ResourceDiagnostic[] = [];

	// Check if directory exists
	try {
		await fsAccess(dir, constants.R_OK);
	} catch {
		return { skills, diagnostics };
	}

	const root = rootDir ?? dir;
	const ig = ignoreMatcher ?? ignore();
	await addIgnoreRulesAsync(ig, dir, root);

	try {
		const entries = await fsReaddir(dir, { withFileTypes: true });

		// First pass: look for SKILL.md
		for (const entry of entries) {
			if (entry.name !== "SKILL.md") {
				continue;
			}

			const fullPath = join(dir, entry.name);

			let isFile = entry.isFile();
			if (entry.isSymbolicLink()) {
				try {
					const stats = await fsStat(fullPath);
					isFile = stats.isFile();
				} catch {
					continue;
				}
			}

			const relPath = toPosixPath(relative(root, fullPath));
			if (!isFile || ig.ignores(relPath)) {
				continue;
			}

			const result = await loadSkillFromFileAsync(fullPath, source);
			if (result.skill) {
				skills.push(result.skill);
			}
			diagnostics.push(...result.diagnostics);
			return { skills, diagnostics };
		}

		// Second pass: recurse into subdirectories
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
					const stats = await fsStat(fullPath);
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
				const subResult = await loadSkillsFromDirInternalAsync(fullPath, source, false, ig, root);
				skills.push(...subResult.skills);
				diagnostics.push(...subResult.diagnostics);
			} else if (isFile && includeRootFiles && entry.name.endsWith(".md") && entry.name !== "SKILL.md") {
				// Load direct .md children in the root as skills
				const result = await loadSkillFromFileAsync(fullPath, source);
				if (result.skill) {
					skills.push(result.skill);
				}
				diagnostics.push(...result.diagnostics);
			}
		}
	} catch (error) {
		diagnostics.push({
			type: "warning",
			code: "skill_dir_read_failed",
			message: `Failed to read directory: ${error instanceof Error ? error.message : String(error)}`,
			path: dir,
		});
	}

	return { skills, diagnostics };
}

/**
 * Load skills from multiple directories asynchronously.
 */
export async function loadSkillsFromDirsAsync(options: LoadSkillsFromDirOptions[]): Promise<LoadSkillsResult> {
	const allSkills: Skill[] = [];
	const allDiagnostics: ResourceDiagnostic[] = [];

	for (const opt of options) {
		const result = await loadSkillsFromDirAsync(opt);
		allSkills.push(...result.skills);
		allDiagnostics.push(...result.diagnostics);
	}

	return { skills: allSkills, diagnostics: allDiagnostics };
}

/**
 * Format skills for system prompt.
 * This function is shared between sync and async implementations.
 */
export function formatSkillsForPrompt(skills: Skill[]): string {
	if (skills.length === 0) return "";

	const available = skills.filter((s) => !s.disableModelInvocation);
	if (available.length === 0) return "";

	let prompt = "\n<available_skills>\n";
	for (const skill of available) {
		prompt += `<skill>\n<name>${skill.name}</name>\n<description>${skill.description}</description>\n<location>${skill.filePath}</location>\n</skill>\n`;
	}
	prompt += "</available_skills>\n";

	return prompt;
}

/**
 * Load skills options interface (compatible with sync version).
 */
export interface LoadSkillsOptions {
	/** Working directory for resolving paths */
	cwd: string;
	/** Agent directory for user-level skills */
	agentDir: string;
	/** Additional skill paths to load */
	skillPaths?: string[];
	/** Whether to include default skill locations */
	includeDefaults?: boolean;
}

/**
 * Load skills from multiple sources asynchronously.
 * This is the async equivalent of the sync loadSkills function.
 */
export async function loadSkillsAsync(options: LoadSkillsOptions): Promise<LoadSkillsResult> {
	const { cwd, agentDir, skillPaths = [], includeDefaults = true } = options;
	const dirs: Array<{ dir: string; source: string }> = [];

	// Add default locations if requested
	if (includeDefaults) {
		// User skills
		dirs.push({ dir: join(agentDir, "skills"), source: "user" });
		// Project skills
		dirs.push({ dir: resolve(cwd, CONFIG_DIR_NAME, "skills"), source: "project" });
	}

	// Add additional skill paths
	for (const skillPath of skillPaths) {
		dirs.push({ dir: resolvePath(skillPath, cwd), source: "path" });
	}

	// Load skills from all directories
	const result = await loadSkillsFromDirsAsync(dirs);

	// Deduplicate skills by name (later entries override earlier ones)
	const skillMap = new Map<string, Skill>();
	for (const skill of result.skills) {
		const existing = skillMap.get(skill.name);
		if (existing) {
			// Keep the one with higher priority (project > user > path)
			const priority = { project: 3, user: 2, path: 1 };
			const existingPriority = priority[existing.sourceInfo.scope as keyof typeof priority] ?? 0;
			const newPriority = priority[skill.sourceInfo.scope as keyof typeof priority] ?? 0;
			if (newPriority > existingPriority) {
				skillMap.set(skill.name, skill);
			}
		} else {
			skillMap.set(skill.name, skill);
		}
	}

	return {
		skills: Array.from(skillMap.values()),
		diagnostics: result.diagnostics,
	};
}
