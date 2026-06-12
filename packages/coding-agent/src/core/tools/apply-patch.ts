/**
 * Apply Patch tool — combines read + edit in one step for more efficient file modifications.
 *
 * This tool applies a unified diff patch to a file, eliminating the need for separate
 * read and edit calls when making multiple changes to the same file.
 */

import type { AgentTool } from "@simpletoolsindiaorg/ai-agent";
import { Text } from "@simpletoolsindiaorg/ai-tui";
import { constants } from "fs";
import { access as fsAccess, readFile as fsReadFile, writeFile as fsWriteFile } from "fs/promises";
import { type Static, Type } from "typebox";
import { renderDiff } from "../../modes/interactive/components/diff.ts";
import type { Theme } from "../../modes/interactive/theme/theme.ts";
import type { ToolDefinition } from "../extensions/types.ts";
import { normalizeToLF, restoreLineEndings, stripBom } from "./edit-diff.ts";
import { withFileMutationQueue } from "./file-mutation-queue.ts";
import { resolveToCwd } from "./path-utils.ts";
import { renderToolPath, str } from "./render-utils.ts";
import { wrapToolDefinition } from "./tool-definition-wrapper.ts";

const applyPatchSchema = Type.Object({
	path: Type.String({ description: "Path to the file to patch (relative or absolute)" }),
	patch: Type.String({
		description:
			'Unified diff patch to apply. Format: "@@ -start,count +start,count @@\\n-old line\\n+new line". Each hunk must match the file exactly.',
	}),
});

export type ApplyPatchToolInput = Static<typeof applyPatchSchema>;

export interface ApplyPatchToolDetails {
	/** Display-oriented diff of the changes made */
	diff: string;
	/** Standard unified patch of the changes made */
	patch: string;
	/** Line number of the first change in the new file (for editor navigation) */
	firstChangedLine?: number;
}

/**
 * Pluggable operations for the apply_patch tool.
 * Override these to delegate file patching to remote systems (for example SSH).
 */
export interface ApplyPatchOperations {
	/** Read file contents as a Buffer */
	readFile: (absolutePath: string) => Promise<Buffer>;
	/** Write content to a file */
	writeFile: (absolutePath: string, content: string) => Promise<void>;
	/** Check if file is readable and writable (throw if not) */
	access: (absolutePath: string) => Promise<void>;
}

const defaultApplyPatchOperations: ApplyPatchOperations = {
	readFile: (path) => fsReadFile(path),
	writeFile: (path, content) => fsWriteFile(path, content, "utf-8"),
	access: (path) => fsAccess(path, constants.R_OK | constants.W_OK),
};

export interface ApplyPatchToolOptions {
	/** Custom operations for file patching. Default: local filesystem */
	operations?: ApplyPatchOperations;
}

/**
 * Parse a unified diff patch into structured hunks.
 */
function parsePatch(patch: string): Array<{
	startLine: number;
	endLine: number;
	lines: string[];
}> {
	const hunks: Array<{ startLine: number; endLine: number; lines: string[] }> = [];
	const lines = patch.split("\n");

	let currentHunk: { startLine: number; endLine: number; lines: string[] } | null = null;

	for (const line of lines) {
		// Parse hunk header: @@ -start,count +start,count @@
		const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
		if (hunkMatch) {
			if (currentHunk) {
				hunks.push(currentHunk);
			}
			const startLine = parseInt(hunkMatch[1], 10);
			const count = hunkMatch[2] ? parseInt(hunkMatch[2], 10) : 1;
			currentHunk = {
				startLine,
				endLine: startLine + count - 1,
				lines: [],
			};
			continue;
		}

		if (currentHunk) {
			// Skip context lines (starting with space)
			if (line.startsWith(" ")) {
				continue;
			}
			// Collect added/removed lines
			if (line.startsWith("+") || line.startsWith("-")) {
				currentHunk.lines.push(line);
			}
		}
	}

	if (currentHunk) {
		hunks.push(currentHunk);
	}

	return hunks;
}

/**
 * Apply parsed hunks to file content.
 */
function applyHunks(content: string, hunks: Array<{ startLine: number; endLine: number; lines: string[] }>): string {
	const lines = content.split("\n");
	const result: string[] = [];
	let currentIndex = 0;

	// Sort hunks by start line
	const sortedHunks = [...hunks].sort((a, b) => a.startLine - b.startLine);

	for (const hunk of sortedHunks) {
		// Add lines before this hunk
		while (currentIndex < hunk.startLine - 1 && currentIndex < lines.length) {
			result.push(lines[currentIndex]);
			currentIndex++;
		}

		// Apply hunk changes
		for (const line of hunk.lines) {
			if (line.startsWith("-")) {
				// Skip removed line
				currentIndex++;
			} else if (line.startsWith("+")) {
				// Add new line
				result.push(line.substring(1));
			}
		}
	}

	// Add remaining lines
	while (currentIndex < lines.length) {
		result.push(lines[currentIndex]);
		currentIndex++;
	}

	return result.join("\n");
}

function prepareApplyPatchArguments(input: unknown): ApplyPatchToolInput {
	if (!input || typeof input !== "object") {
		return input as ApplyPatchToolInput;
	}
	return input as ApplyPatchToolInput;
}

function formatApplyPatchCall(args: ApplyPatchToolInput | undefined, theme: Theme, cwd: string): string {
	const pathDisplay = renderToolPath(str(args?.path), theme, cwd);
	const patchPreview = args?.patch ? theme.fg("dim", ` (${args.patch.split("\n").length} lines)`) : "";
	return `${theme.fg("toolTitle", theme.bold("apply_patch"))} ${pathDisplay}${patchPreview}`;
}

function formatApplyPatchResult(
	result: { content: Array<{ type: string; text?: string }>; details?: ApplyPatchToolDetails },
	options: { theme: Theme; cwd: string; width: number },
	theme: Theme,
): string {
	const diff = result.details?.diff;
	if (!diff) {
		return theme.fg("success", "Patch applied successfully");
	}

	const lines = diff.split("\n");
	const maxLines = 20;
	const truncated = lines.length > maxLines;
	const displayLines = truncated ? lines.slice(0, maxLines) : lines;

	let output = displayLines
		.map((line) => {
			if (line.startsWith("+")) {
				return theme.fg("toolDiffAdded", line);
			} else if (line.startsWith("-")) {
				return theme.fg("toolDiffRemoved", line);
			} else if (line.startsWith("@@")) {
				return theme.fg("toolDiffContext", line);
			}
			return line;
		})
		.join("\n");

	if (truncated) {
		output += `\n${theme.fg("dim", `... ${lines.length - maxLines} more lines`)}`;
	}

	return output;
}

export function createApplyPatchToolDefinition(
	_cwd: string,
	options?: ApplyPatchToolOptions,
): ToolDefinition<typeof applyPatchSchema, ApplyPatchToolDetails> {
	const operations = options?.operations ?? defaultApplyPatchOperations;

	return {
		name: "apply_patch",
		label: "Apply Patch",
		description: [
			"Apply a unified diff patch to a file. More efficient than read+edit for multiple changes.",
			"",
			"Use this when you need to make multiple changes to the same file.",
			"The patch format is: @@ -start,count +start,count @@",
			"Lines starting with - are removed, lines starting with + are added.",
			"",
			"Example:",
			"patch: '@@ -5,3 +5,4 @@\\n-old line 1\\n+new line 1\\n+new line 2\\n old line 2'",
		].join("\n"),
		promptSnippet: "Apply unified diff patch to file (more efficient than read+edit)",
		promptGuidelines: [
			"Use apply_patch for multiple changes to the same file",
			"Patch format: @@ -start,count +start,count @@",
			"Lines starting with - are removed, + are added",
		],
		parameters: applyPatchSchema,
		prepareArguments: prepareApplyPatchArguments,
		async execute(args, context) {
			const { path: filePath, patch } = args;
			const absolutePath = resolveToCwd(filePath, _cwd);

			// Validate patch format
			if (!patch.includes("@@")) {
				throw new Error("Invalid patch format. Must contain @@ hunk headers. Example: @@ -5,3 +5,4 @@");
			}

			// Read the file
			let content: string;
			try {
				await operations.access(absolutePath);
				const buffer = await operations.readFile(absolutePath);
				content = buffer.toString("utf-8");
			} catch (error) {
				throw new Error(`Cannot read file: ${filePath}. ${error instanceof Error ? error.message : String(error)}`);
			}

			// Parse and apply patch
			const hunks = parsePatch(patch);
			if (hunks.length === 0) {
				throw new Error("No valid hunks found in patch");
			}

			const originalContent = content;
			const newContent = applyHunks(content, hunks);

			// Detect line endings and preserve them
			const lineEnding = content.includes("\r\n") ? "\r\n" : "\n";
			const normalizedNew = normalizeToLF(newContent);
			const restoredNew = restoreLineEndings(normalizedNew, lineEnding);

			// Generate diff for display
			const diff = generateDiff(originalContent, restoredNew, filePath);

			// Apply the patch
			await withFileMutationQueue(absolutePath, async () => {
				await operations.writeFile(absolutePath, restoredNew);
			});

			// Find first changed line for editor navigation
			const firstChangedLine = findFirstChangedLine(originalContent, restoredNew);

			return {
				content: [{ type: "text", text: `Patch applied to ${filePath}` }],
				details: {
					diff,
					patch,
					firstChangedLine,
				},
			};
		},
		renderCall: (args, theme, _context) => new Text(formatApplyPatchCall(args, theme, _cwd)),
		renderResult: (result, options, theme) => new Text(formatApplyPatchResult(result as any, options as any, theme)),
	};
}

/**
 * Generate a simple diff between two strings.
 */
function generateDiff(oldContent: string, newContent: string, filePath: string): string {
	const oldLines = oldContent.split("\n");
	const newLines = newContent.split("\n");
	const diff: string[] = [];

	const maxLines = Math.max(oldLines.length, newLines.length);
	for (let i = 0; i < maxLines; i++) {
		const oldLine = i < oldLines.length ? oldLines[i] : undefined;
		const newLine = i < newLines.length ? newLines[i] : undefined;

		if (oldLine !== newLine) {
			if (oldLine !== undefined) {
				diff.push(`-${oldLine}`);
			}
			if (newLine !== undefined) {
				diff.push(`+${newLine}`);
			}
		}
	}

	return diff.join("\n");
}

/**
 * Find the first changed line number (1-indexed).
 */
function findFirstChangedLine(oldContent: string, newContent: string): number | undefined {
	const oldLines = oldContent.split("\n");
	const newLines = newContent.split("\n");

	for (let i = 0; i < Math.max(oldLines.length, newLines.length); i++) {
		const oldLine = i < oldLines.length ? oldLines[i] : undefined;
		const newLine = i < newLines.length ? newLines[i] : undefined;

		if (oldLine !== newLine) {
			return i + 1; // 1-indexed
		}
	}

	return undefined;
}
