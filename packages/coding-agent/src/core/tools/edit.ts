import type { AgentTool } from "@simpletoolsindiaorg/ai-agent";
import { Box, Container, Spacer, Text } from "@simpletoolsindiaorg/ai-tui";
import { constants } from "fs";
import { access as fsAccess, readFile as fsReadFile, writeFile as fsWriteFile } from "fs/promises";
import { type Static, Type } from "typebox";
import { renderDiff } from "../../modes/interactive/components/diff.ts";
import type { Theme } from "../../modes/interactive/theme/theme.ts";
import type { ToolDefinition } from "../extensions/types.ts";
import {
	applyEditsToNormalizedContent,
	computeEditsDiff,
	detectLineEnding,
	type Edit,
	type EditDiffError,
	type EditDiffResult,
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

type EditPreview = EditDiffResult | EditDiffError;

type EditRenderState = {
	callComponent?: EditCallRenderComponent;
};

const replaceEditSchema = Type.Object(
	{
		oldText: Type.String({
			description:
				"Exact text for one targeted replacement. It must be unique in the original file and must not overlap with any other edits[].oldText in the same call.",
		}),
		newText: Type.String({ description: "Replacement text for this targeted edit." }),
		/**
		 * Optional: replace every occurrence of oldText in the file. Default false.
		 * Useful for batch rename / refactor. When true, oldText does NOT need to be
		 * unique; all matches are replaced.
		 */
		replaceAll: Type.Optional(
			Type.Boolean({
				description: "Replace all occurrences of oldText in the file (default false).",
			}),
		),
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

const editSchema = Type.Object(
	{
		path: Type.String({ description: "Path to the file to edit (relative or absolute)" }),
		edits: Type.Optional(
			Type.Array(replaceEditSchema, {
				description:
					"Text-based replacements. Each edit matches oldText against the file. Use replaceLines instead for line-number based edits (more reliable).",
			}),
		),
		replaceLines: Type.Optional(
			Type.Array(replaceLinesSchema, {
				description:
					"Line-number based replacements (preferred). Specify startLine and endLine (1-indexed) to replace those lines. More reliable than text matching. Read the file first to get accurate line numbers.",
			}),
		),
	},
	{ additionalProperties: false },
);

export type EditToolInput = Static<typeof editSchema>;
type LegacyEditToolInput = EditToolInput & {
	oldText?: unknown;
	newText?: unknown;
};

export interface EditToolDetails {
	/** Display-oriented diff of the changes made */
	diff: string;
	/** Standard unified patch of the changes made */
	patch: string;
	/** Line number of the first change in the new file (for editor navigation) */
	firstChangedLine?: number;
}

/**
 * Pluggable operations for the edit tool.
 * Override these to delegate file editing to remote systems (for example SSH).
 */
export interface EditOperations {
	/** Read file contents as a Buffer */
	readFile: (absolutePath: string) => Promise<Buffer>;
	/** Write content to a file */
	writeFile: (absolutePath: string, content: string) => Promise<void>;
	/** Check if file is readable and writable (throw if not) */
	access: (absolutePath: string) => Promise<void>;
}

const defaultEditOperations: EditOperations = {
	readFile: (path) => fsReadFile(path),
	writeFile: (path, content) => fsWriteFile(path, content, "utf-8"),
	access: (path) => fsAccess(path, constants.R_OK | constants.W_OK),
};

export interface EditToolOptions {
	/** Custom operations for file editing. Default: local filesystem */
	operations?: EditOperations;
}

function prepareEditArguments(input: unknown): EditToolInput {
	if (!input || typeof input !== "object") {
		return input as EditToolInput;
	}

	const args = input as Record<string, unknown>;

	// Some models (Opus 4.6, GLM-5.1) send edits as a JSON string instead of an array
	if (typeof args.edits === "string") {
		try {
			const parsed = JSON.parse(args.edits);
			if (Array.isArray(parsed)) args.edits = parsed;
		} catch {}
	}

	const legacy = args as LegacyEditToolInput;
	if (typeof legacy.oldText !== "string" || typeof legacy.newText !== "string") {
		return args as EditToolInput;
	}

	const edits = Array.isArray(legacy.edits) ? [...legacy.edits] : [];
	edits.push({ oldText: legacy.oldText, newText: legacy.newText });
	const { oldText: _oldText, newText: _newText, ...rest } = legacy;
	return { ...rest, edits } as EditToolInput;
}

function validateEditInput(input: EditToolInput): { path: string; edits: Edit[] } {
	// Support replaceLines (line-number based, more reliable)
	if (Array.isArray(input.replaceLines) && input.replaceLines.length > 0) {
		input = convertReplaceLinesToEdits(input);
	}
	if (!Array.isArray(input.edits) || input.edits.length === 0) {
		throw new Error(
			"Edit tool requires either edits (text matching) or replaceLines (line numbers). Use replaceLines when you know the line numbers — it's more reliable. Read the file first with the read tool to get exact line numbers.",
		);
	}
	return { path: input.path, edits: input.edits };
}

/** Convert replaceLines input to text edits by reading the file and extracting line ranges. */
async function convertReplaceLinesInput(
	input: EditToolInput,
	cwd: string,
	ops: { readFile: (path: string) => Promise<Buffer> },
): Promise<{ path: string; edits: Edit[] }> {
	const absolutePath = resolveToCwd(input.path, cwd);
	const buffer = await ops.readFile(absolutePath);
	const content = buffer.toString("utf-8");
	const lines = content.split(/\r?\n/);

	const edits: Edit[] = [];
	for (const rl of input.replaceLines!) {
		const start = Math.max(1, Math.min(rl.startLine, lines.length));
		const end = Math.max(start, Math.min(rl.endLine, lines.length));
		// Extract the old text from specified lines (1-indexed → 0-indexed)
		const oldLines = lines.slice(start - 1, end);
		const oldText = oldLines.join("\n");
		const newText = rl.newText;
		edits.push({ oldText, newText });
	}
	return { path: input.path, edits };
}

function convertReplaceLinesToEdits(input: EditToolInput): EditToolInput {
	return input;
}

type RenderableEditArgs = {
	path?: string;
	file_path?: string;
	edits?: Edit[];
	oldText?: string;
	newText?: string;
};

type EditToolResultLike = {
	content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
	details?: EditToolDetails;
};

type EditCallRenderComponent = Box & {
	preview?: EditPreview;
	previewArgsKey?: string;
	previewPending?: boolean;
	settledError?: boolean;
};

function createEditCallRenderComponent(): EditCallRenderComponent {
	return Object.assign(new Box(1, 1, (text: string) => text), {
		preview: undefined as EditPreview | undefined,
		previewArgsKey: undefined as string | undefined,
		previewPending: false,
		settledError: false,
	});
}

function getEditCallRenderComponent(state: EditRenderState, lastComponent: unknown): EditCallRenderComponent {
	if (lastComponent instanceof Box) {
		const component = lastComponent as EditCallRenderComponent;
		state.callComponent = component;
		return component;
	}
	if (state.callComponent) {
		return state.callComponent;
	}
	const component = createEditCallRenderComponent();
	state.callComponent = component;
	return component;
}

function getRenderablePreviewInput(args: RenderableEditArgs | undefined): { path: string; edits: Edit[] } | null {
	if (!args) {
		return null;
	}

	const path = typeof args.path === "string" ? args.path : typeof args.file_path === "string" ? args.file_path : null;
	if (!path) {
		return null;
	}

	if (
		Array.isArray(args.edits) &&
		args.edits.length > 0 &&
		args.edits.every((edit) => typeof edit?.oldText === "string" && typeof edit?.newText === "string")
	) {
		return { path, edits: args.edits };
	}

	if (typeof args.oldText === "string" && typeof args.newText === "string") {
		return { path, edits: [{ oldText: args.oldText, newText: args.newText }] };
	}

	return null;
}

function formatEditCall(args: RenderableEditArgs | undefined, theme: Theme, cwd: string): string {
	const pathDisplay = renderToolPath(str(args?.file_path ?? args?.path), theme, cwd);
	return `${theme.fg("toolTitle", theme.bold("edit"))} ${pathDisplay}`;
}

function formatEditResult(
	args: RenderableEditArgs | undefined,
	preview: EditPreview | undefined,
	result: EditToolResultLike,
	theme: Theme,
	isError: boolean,
): string | undefined {
	const rawPath = str(args?.file_path ?? args?.path);
	const previewDiff = preview && !("error" in preview) ? preview.diff : undefined;
	const previewError = preview && "error" in preview ? preview.error : undefined;
	if (isError) {
		const errorText = result.content
			.filter((c) => c.type === "text")
			.map((c) => c.text || "")
			.join("\n");
		if (!errorText || errorText === previewError) {
			return undefined;
		}
		return theme.fg("error", errorText);
	}

	const resultDiff = result.details?.diff;
	if (resultDiff && resultDiff !== previewDiff) {
		return renderDiff(resultDiff, { filePath: rawPath ?? undefined });
	}

	return undefined;
}

function getEditHeaderBg(
	preview: EditPreview | undefined,
	settledError: boolean | undefined,
	theme: Theme,
): (text: string) => string {
	if (preview) {
		if ("error" in preview) {
			return (text: string) => theme.bg("toolErrorBg", text);
		}
		return (text: string) => theme.bg("toolSuccessBg", text);
	}
	if (settledError) {
		return (text: string) => theme.bg("toolErrorBg", text);
	}
	return (text: string) => theme.bg("toolPendingBg", text);
}

function buildEditCallComponent(
	component: EditCallRenderComponent,
	args: RenderableEditArgs | undefined,
	theme: Theme,
	cwd: string,
): EditCallRenderComponent {
	component.setBgFn(getEditHeaderBg(component.preview, component.settledError, theme));
	component.clear();
	component.addChild(new Text(formatEditCall(args, theme, cwd), 0, 0));

	if (!component.preview) {
		return component;
	}

	const body =
		"error" in component.preview ? theme.fg("error", component.preview.error) : renderDiff(component.preview.diff);
	component.addChild(new Spacer(1));
	component.addChild(new Text(body, 0, 0));
	return component;
}

function setEditPreview(
	component: EditCallRenderComponent,
	preview: EditPreview,
	argsKey: string | undefined,
): boolean {
	const current = component.preview;
	const changed =
		current === undefined ||
		("error" in current && "error" in preview
			? current.error !== preview.error
			: "error" in current !== "error" in preview) ||
		(!("error" in current) &&
			!("error" in preview) &&
			(current.diff !== preview.diff || current.firstChangedLine !== preview.firstChangedLine));
	component.preview = preview;
	component.previewArgsKey = argsKey;
	component.previewPending = false;
	return changed;
}

export function createEditToolDefinition(
	cwd: string,
	options?: EditToolOptions,
): ToolDefinition<typeof editSchema, EditToolDetails | undefined, EditRenderState> {
	const ops = options?.operations ?? defaultEditOperations;
	return {
		name: "edit",
		label: "edit",
		description: `Performs exact string replacements in files. For surgical, reliable edits.

Usage:
- ALWAYS read the file first with the \`read\` tool. Use the line numbers it returns.
- When matching text from the read tool output, preserve the exact indentation (tabs/spaces) as it appears. Do NOT include the line number prefix in oldText.
- Prefer \`replaceLines\` (1-indexed startLine/endLine) — it is FAR more reliable than \`edits[].oldText\` because line numbers don't shift between calls.
- If a change covers more than ~30% of the file, use \`write\` instead of edit.
- For multiple independent changes in the same file, batch them into one edit call with multiple \`edits[]\` or \`replaceLines[]\` entries.

Matching rules:
- \`oldText\` must match EXACTLY (character for character) including whitespace and newlines. If it's not unique, the edit fails — provide more surrounding context to make it unique, or use \`replaceAll: true\`.
- \`replaceAll: true\` replaces every occurrence of \`oldText\`. Useful for renaming variables across a file. When true, \`oldText\` does NOT need to be unique.
- The tool auto-normalizes smart quotes (\u201c\u201d \u2018\u2019) and trailing whitespace, so minor formatting drift is usually fine.
- The edit will FAIL with a 'not found' error if oldText is not present. Re-read the file if necessary.`,
		promptSnippet:
			"Make precise file edits — prefer replaceLines, never write huge oldText blocks, batch multiple edits in one call",
		promptGuidelines: [
			"Always read the file with `read` before editing. Use the line numbers from the read output.",
			"Prefer `replaceLines` (startLine/endLine, 1-indexed). It is FAR more reliable than `edits[].oldText`.",
			"Use `edits[].oldText` only when line numbers are not practical. oldText must match EXACTLY; copy-paste from the read output.",
			"If a change covers > 30% of the file, use `write` instead of edit. A huge oldText is almost always wrong.",
			"For multiple independent changes in the same file, batch them into one edit call with multiple `edits[]` or `replaceLines[]` entries — not multiple edit calls.",
			"Keep each `oldText` as small as possible while still being unique. Do not pad with large unchanged regions.",
		],
		parameters: editSchema,
		renderShell: "self",
		prepareArguments: prepareEditArguments,
		async execute(_toolCallId, input: EditToolInput, signal?: AbortSignal, _onUpdate?, _ctx?) {
			// Handle replaceLines: convert to text edits by reading the file
			let edits: Edit[];
			let path: string;

			if (Array.isArray(input.replaceLines) && input.replaceLines.length > 0) {
				const result = await convertReplaceLinesInput(input, cwd, ops);
				path = result.path;
				edits = result.edits;
			} else {
				const validated = validateEditInput(input);
				path = validated.path;
				edits = validated.edits;
			}

			const absolutePath = resolveToCwd(path, cwd);

			return withFileMutationQueue(absolutePath, async () => {
				// Do not reject from an abort event listener here: that would release the
				// mutation queue while an in-flight filesystem operation may still finish.
				// Checking signal.aborted after each await observes the same aborts while
				// keeping the queue locked until the current operation has settled.
				const throwIfAborted = (): void => {
					if (signal?.aborted) throw new Error("Operation aborted");
				};

				throwIfAborted();

				// Check if file exists.
				try {
					await ops.access(absolutePath);
				} catch (error: unknown) {
					throwIfAborted();
					const errorMessage =
						error instanceof Error && "code" in error ? `Error code: ${error.code}` : String(error);
					throw new Error(`Could not edit file: ${path}. ${errorMessage}.`);
				}
				throwIfAborted();

				// Read the file.
				const buffer = await ops.readFile(absolutePath);
				const rawContent = buffer.toString("utf-8");
				throwIfAborted();

				// Strip BOM before matching. The model will not include an invisible BOM in oldText.
				const { bom, text: content } = stripBom(rawContent);
				const originalEnding = detectLineEnding(content);
				const normalizedContent = normalizeToLF(content);

				// If the user passed `replaceAll: true` on every edit, treat
				// this as a global rename. We can also enable the new
				// single-pass apply path that is far more reliable than the
				// per-edit unique-match guard.
				const allReplaceAll = edits.length > 0 && edits.every((e) => e.replaceAll === true);

				// Soft guard: if any single oldText covers more than 30% of
				// the file, the LLM is almost certainly trying to rewrite
				// the whole file via edit. Return a helpful error so it
				// switches to `write` or narrows the change. Skipped when
				// the LLM used `replaceLines` — that path is unambiguous
				// because the model picked explicit line numbers. Also
				// skipped when replaceAll is true (the LLM is intentionally
				// doing a global replace, so a large oldText is fine).
				if (input.replaceLines === undefined && !allReplaceAll) {
					const totalChars = normalizedContent.length;
					const threshold = Math.max(200, Math.floor(totalChars * 0.3));
					for (const e of edits) {
						if (e.oldText.length > threshold) {
							throw new Error(
								`Refusing to edit ${path}: one edits[].oldText block is ${e.oldText.length} chars, which is more than 30% of the file (${totalChars} chars). This is almost always a mistake — either use the \`write\` tool to rewrite the whole file, or use \`replaceLines\` to target a specific line range. To force the edit anyway, switch to \`replaceLines\` with explicit startLine/endLine.`,
							);
						}
					}
				}

				const { baseContent, newContent } = applyEditsToNormalizedContent(
					normalizedContent,
					edits,
					path,
					{ allReplaceAll },
				);
				throwIfAborted();

				const finalContent = bom + restoreLineEndings(newContent, originalEnding);
				await ops.writeFile(absolutePath, finalContent);
				throwIfAborted();

				const diffResult = generateDiffString(baseContent, newContent);
				const patch = generateUnifiedPatch(path, baseContent, newContent);
				return {
					content: [
						{
							type: "text",
							text: allReplaceAll
								? `Successfully replaced all occurrences across ${edits.length} block(s) in ${path}.`
								: `Successfully replaced ${edits.length} block(s) in ${path}.`,
						},
					],
					details: { diff: diffResult.diff, patch, firstChangedLine: diffResult.firstChangedLine },
				};
			});
		},
		renderCall(args, theme, context) {
			const component = getEditCallRenderComponent(context.state, context.lastComponent);
			const previewInput = getRenderablePreviewInput(args as RenderableEditArgs | undefined);
			const argsKey = previewInput
				? JSON.stringify({ path: previewInput.path, edits: previewInput.edits })
				: undefined;

			if (component.previewArgsKey !== argsKey) {
				component.preview = undefined;
				component.previewArgsKey = argsKey;
				component.previewPending = false;
				component.settledError = false;
			}

			if (context.argsComplete && previewInput && !component.preview && !component.previewPending) {
				component.previewPending = true;
				const requestKey = argsKey;
				void computeEditsDiff(previewInput.path, previewInput.edits, context.cwd).then((preview) => {
					if (component.previewArgsKey === requestKey) {
						setEditPreview(component, preview, requestKey);
						context.invalidate();
					}
				});
			}

			return buildEditCallComponent(component, args, theme, context.cwd);
		},
		renderResult(result, _options, theme, context) {
			const callComponent = context.state.callComponent;
			const previewInput = getRenderablePreviewInput(context.args as RenderableEditArgs | undefined);
			const argsKey = previewInput
				? JSON.stringify({ path: previewInput.path, edits: previewInput.edits })
				: undefined;
			const typedResult = result as EditToolResultLike;
			const resultDiff = !context.isError ? typedResult.details?.diff : undefined;
			let changed = false;
			if (callComponent) {
				if (typeof resultDiff === "string") {
					changed =
						setEditPreview(
							callComponent,
							{ diff: resultDiff, firstChangedLine: typedResult.details?.firstChangedLine },
							argsKey,
						) || changed;
				}
				if (callComponent.settledError !== context.isError) {
					callComponent.settledError = context.isError;
					changed = true;
				}
				if (changed) {
					buildEditCallComponent(
						callComponent,
						context.args as RenderableEditArgs | undefined,
						theme,
						context.cwd,
					);
				}
			}

			const output = formatEditResult(context.args, callComponent?.preview, typedResult, theme, context.isError);
			const component = (context.lastComponent as Container | undefined) ?? new Container();
			component.clear();
			if (!output) {
				return component;
			}
			component.addChild(new Spacer(1));
			component.addChild(new Text(output, 1, 0));
			return component;
		},
	};
}

export function createEditTool(cwd: string, options?: EditToolOptions): AgentTool<typeof editSchema> {
	return wrapToolDefinition(createEditToolDefinition(cwd, options));
}
