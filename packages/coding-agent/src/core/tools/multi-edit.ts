/**
 * Multi-Edit tool — apply multiple edits across multiple files in one call.
 *
 * This tool is more efficient than making multiple separate edit calls when
 * you need to modify multiple files in a single operation.
 */

import type { AgentTool } from "@simpletoolsindiaorg/ai-agent";
import { Text } from "@simpletoolsindiaorg/ai-tui";
import { constants } from "fs";
import { access as fsAccess, readFile as fsReadFile, writeFile as fsWriteFile } from "fs/promises";
import { type Static, Type } from "typebox";
import type { Theme } from "../../modes/interactive/theme/theme.ts";
import type { ToolDefinition } from "../extensions/types.ts";
import {
	applyEditsToNormalizedContent,
	computeEditsDiff,
	detectLineEnding,
	type Edit,
	generateDiffString,
	generateUnifiedPatch,
	normalizeToLF,
	restoreLineEndings,
	stripBom,
} from "./edit-diff.ts";
import { withFileMutationQueue } from "./file-mutation-queue.ts";
import { resolveToCwd } from "./path-utils.ts";
import { renderToolPath, str } from "./render-utils.ts";
import { wrapToolDefinition } from "./tool-definition-wrapper.ts";

const replaceEditSchema = Type.Object(
	{
		oldText: Type.String({
			description: "Exact text for one targeted replacement. It must be unique in the file.",
		}),
		newText: Type.String({ description: "Replacement text for this targeted edit." }),
	},
	{ additionalProperties: false },
);

const replaceLinesSchema = Type.Object({
	startLine: Type.Number({ description: "1-indexed start line number to replace (inclusive)." }),
	endLine: Type.Number({
		description: "1-indexed end line number to replace (inclusive). Same as startLine to replace a single line.",
	}),
	newText: Type.String({ description: "Replacement text (can be multiple lines)." }),
});

const fileEditSchema = Type.Object({
	path: Type.String({ description: "Path to the file to edit (relative or absolute)" }),
	edits: Type.Optional(
		Type.Array(replaceEditSchema, {
			description: "Text-based replacements. Each edit matches oldText against the file.",
		}),
	),
	replaceLines: Type.Optional(
		Type.Array(replaceLinesSchema, {
			description: "Line-number based replacements (preferred). Specify startLine and endLine (1-indexed).",
		}),
	),
});

const multiEditSchema = Type.Object({
	edits: Type.Array(fileEditSchema, {
		description: "Array of file edits. Each entry specifies a file path and the edits to apply.",
		minItems: 1,
	}),
});

export type MultiEditToolInput = Static<typeof multiEditSchema>;

export interface MultiEditToolDetails {
	/** Summary of changes made */
	summary: string;
	/** Number of files modified */
	filesModified: number;
	/** Total edits applied */
	editsApplied: number;
}

/**
 * Pluggable operations for the multi_edit tool.
 */
export interface MultiEditOperations {
	/** Read file contents as a Buffer */
	readFile: (absolutePath: string) => Promise<Buffer>;
	/** Write content to a file */
	writeFile: (absolutePath: string, content: string) => Promise<void>;
	/** Check if file is readable and writable (throw if not) */
	access: (absolutePath: string) => Promise<void>;
}

const defaultMultiEditOperations: MultiEditOperations = {
	readFile: (path) => fsReadFile(path),
	writeFile: (path, content) => fsWriteFile(path, content, "utf-8"),
	access: (path) => fsAccess(path, constants.R_OK | constants.W_OK),
};

export interface MultiEditToolOptions {
	/** Custom operations for file editing. Default: local filesystem */
	operations?: MultiEditOperations;
}

function prepareMultiEditArguments(input: unknown): MultiEditToolInput {
	if (!input || typeof input !== "object") {
		return input as MultiEditToolInput;
	}
	return input as MultiEditToolInput;
}

function formatMultiEditCall(args: MultiEditToolInput | undefined, theme: Theme, cwd: string): string {
	const fileCount = args?.edits?.length ?? 0;
	const editCount =
		args?.edits?.reduce((sum, file) => {
			return sum + (file.edits?.length ?? 0) + (file.replaceLines?.length ?? 0);
		}, 0) ?? 0;

	return `${theme.fg("toolTitle", theme.bold("multi_edit"))} ${theme.fg("dim", `${fileCount} files, ${editCount} edits`)}`;
}

function formatMultiEditResult(
	result: { content: Array<{ type: string; text?: string }>; details?: MultiEditToolDetails },
	options: { theme: Theme; cwd: string; width: number },
	theme: Theme,
): string {
	const details = result.details;
	if (!details) {
		return theme.fg("success", "Edits applied successfully");
	}

	const summary = [
		theme.fg("success", `✓ ${details.filesModified} file${details.filesModified !== 1 ? "s" : ""} modified`),
		theme.fg("dim", `${details.editsApplied} edit${details.editsApplied !== 1 ? "s" : ""} applied`),
	].join(theme.fg("dim", " · "));

	return summary;
}

/**
 * Convert replaceLines input to text edits by reading the file and extracting line ranges.
 */
async function convertReplaceLinesInput(
	filePath: string,
	input: { replaceLines?: Array<{ startLine: number; endLine: number; newText: string }> },
	operations: MultiEditOperations,
	cwd: string,
): Promise<Edit[]> {
	if (!input.replaceLines || input.replaceLines.length === 0) {
		return [];
	}

	const absolutePath = resolveToCwd(filePath, cwd);
	await operations.access(absolutePath);
	const buffer = await operations.readFile(absolutePath);
	const rawContent = buffer.toString("utf-8");
	const { text: content } = stripBom(normalizeToLF(rawContent));
	const lines = content.split("\n");

	return input.replaceLines.map((rl) => {
		const startIdx = rl.startLine - 1; // Convert to 0-indexed
		const endIdx = rl.endLine - 1;

		if (startIdx < 0 || startIdx >= lines.length) {
			throw new Error(
				`startLine ${rl.startLine} is out of range (file has ${lines.length} lines). ` +
					`Use the read tool first to get accurate line numbers.`,
			);
		}
		if (endIdx < startIdx || endIdx >= lines.length) {
			throw new Error(
				`endLine ${rl.endLine} is out of range or before startLine ${rl.startLine}. ` +
					`Use the read tool first to get accurate line numbers.`,
			);
		}

		const oldText = lines.slice(startIdx, endIdx + 1).join("\n");
		return { oldText, newText: rl.newText };
	});
}

export function createMultiEditToolDefinition(
	_cwd: string,
	options?: MultiEditToolOptions,
): ToolDefinition<typeof multiEditSchema, MultiEditToolDetails> {
	const operations = options?.operations ?? defaultMultiEditOperations;

	return {
		name: "multi_edit",
		label: "Multi Edit",
		description: [
			"Apply multiple edits across multiple files in one call.",
			"",
			"Use this when you need to modify multiple files in a single operation.",
			"More efficient than making separate edit calls for each file.",
			"",
			"Each file edit can use either:",
			"- edits: Text-based replacements (oldText must match exactly)",
			"- replaceLines: Line-number based replacements (preferred, more reliable)",
			"",
			"Example:",
			"edits: [",
			"  { path: 'src/a.ts', replaceLines: [{ startLine: 5, endLine: 5, newText: 'const x = 1;' }] },",
			"  { path: 'src/b.ts', edits: [{ oldText: 'old', newText: 'new' }] }",
			"]",
		].join("\n"),
		promptSnippet: "Apply multiple edits across multiple files in one call",
		promptGuidelines: [
			"Use multi_edit for batch file modifications",
			"Prefer replaceLines over edits for reliability",
			"Always read files first to get accurate line numbers",
		],
		parameters: multiEditSchema,
		prepareArguments: prepareMultiEditArguments,
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			const { edits } = params;
			let filesModified = 0;
			let editsApplied = 0;
			const errors: string[] = [];

			for (const fileEdit of edits) {
				try {
					const absolutePath = resolveToCwd(fileEdit.path, _cwd);

					// Convert replaceLines to edits if needed
					let editList: Edit[] = [];
					if (fileEdit.edits && fileEdit.edits.length > 0) {
						editList = [...fileEdit.edits];
					}
					if (fileEdit.replaceLines && fileEdit.replaceLines.length > 0) {
						const convertedEdits = await convertReplaceLinesInput(
							fileEdit.path,
							{ replaceLines: fileEdit.replaceLines },
							operations,
							_cwd,
						);
						editList = [...editList, ...convertedEdits];
					}

					if (editList.length === 0) {
						errors.push(`No edits specified for ${fileEdit.path}`);
						continue;
					}

					// Apply edits
					await withFileMutationQueue(absolutePath, async () => {
						await operations.access(absolutePath);
						const buffer = await operations.readFile(absolutePath);
						const rawContent = buffer.toString("utf-8");
						const lineEnding = detectLineEnding(rawContent);
						const content = stripBom(normalizeToLF(rawContent));

						// Apply edits
						const { newContent } = applyEditsToNormalizedContent(content, editList, fileEdit.path);
						const appliedCount = editList.length;

						// Restore line endings and write
						const restoredContent = restoreLineEndings(newContent, lineEnding);
						await operations.writeFile(absolutePath, restoredContent);

						filesModified++;
						editsApplied += appliedCount;
					});
				} catch (error) {
					errors.push(`${fileEdit.path}: ${error instanceof Error ? error.message : String(error)}`);
				}
			}

			if (errors.length > 0) {
				const successMsg =
					filesModified > 0
						? `Modified ${filesModified} file${filesModified !== 1 ? "s" : ""} (${editsApplied} edits). `
						: "";
				throw new Error(
					`${successMsg}Failed to edit ${errors.length} file${errors.length !== 1 ? "s" : ""}:\n${errors.join("\n")}`,
				);
			}

			return {
				content: [
					{
						type: "text",
						text: `Modified ${filesModified} file${filesModified !== 1 ? "s" : ""} (${editsApplied} edits)`,
					},
				],
				details: {
					summary: `Modified ${filesModified} file${filesModified !== 1 ? "s" : ""} (${editsApplied} edits)`,
					filesModified,
					editsApplied,
				},
			};
		},
		renderCall: (args, theme, _context) => new Text(formatMultiEditCall(args, theme, _cwd)),
		renderResult: (result, options, theme) => new Text(formatMultiEditResult(result as any, options as any, theme)),
	};
}
