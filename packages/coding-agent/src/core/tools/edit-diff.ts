/**
 * Shared diff computation utilities for the edit tool.
 * Used by both edit.ts (for execution) and tool-execution.ts (for preview rendering).
 */

import * as Diff from "diff";
import { constants } from "fs";
import { access, readFile } from "fs/promises";
import { resolveToCwd } from "./path-utils.ts";

export function detectLineEnding(content: string): "\r\n" | "\n" {
	const crlfIdx = content.indexOf("\r\n");
	const lfIdx = content.indexOf("\n");
	if (lfIdx === -1) return "\n";
	if (crlfIdx === -1) return "\n";
	return crlfIdx < lfIdx ? "\r\n" : "\n";
}

export function normalizeToLF(text: string): string {
	return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export function restoreLineEndings(text: string, ending: "\r\n" | "\n"): string {
	return ending === "\r\n" ? text.replace(/\n/g, "\r\n") : text;
}

/**
 * Normalize text for fuzzy matching. Applies progressive transformations:
 * - Strip trailing whitespace from each line
 * - Normalize leading whitespace (any mix of tabs/spaces → single space)
 * - Normalize smart quotes to ASCII equivalents
 * - Normalize Unicode dashes/hyphens to ASCII hyphen
 * - Normalize special Unicode spaces to regular space
 */
export function normalizeForFuzzyMatch(text: string): string {
	return (
		text
			.normalize("NFKC")
			// Strip trailing whitespace per line
			.split("\n")
			.map((line) => line.trimEnd())
			// Normalize leading whitespace: any indentation → consistent
			.map((line) => line.replace(/^[\t ]+/, (m) => " ".repeat(m.length)))
			.join("\n")
			// Smart single quotes → '
			.replace(/[\u2018\u2019\u201A\u201B]/g, "'")
			// Smart double quotes → "
			.replace(/[\u201C\u201D\u201E\u201F]/g, '"')
			// Various dashes/hyphens → -
			// U+2010 hyphen, U+2011 non-breaking hyphen, U+2012 figure dash,
			// U+2013 en-dash, U+2014 em-dash, U+2015 horizontal bar, U+2212 minus
			.replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, "-")
			// Special spaces → regular space
			// U+00A0 NBSP, U+2002-U+200A various spaces, U+202F narrow NBSP,
			// U+205F medium math space, U+3000 ideographic space
			.replace(/[\u00A0\u2002-\u200A\u202F\u205F\u3000]/g, " ")
	);
}

export interface FuzzyMatchResult {
	/** Whether a match was found */
	found: boolean;
	/** The index where the match starts (in the content that should be used for replacement) */
	index: number;
	/** Length of the matched text */
	matchLength: number;
	/** Whether fuzzy matching was used (false = exact match) */
	usedFuzzyMatch: boolean;
	/**
	 * The content to use for replacement operations.
	 * When exact match: original content. When fuzzy match: normalized content.
	 */
	contentForReplacement: string;
}

export interface Edit {
	oldText: string;
	newText: string;
	/** When true, replace every occurrence of oldText (Claude Code / openclaude `replace_all`). */
	replaceAll?: boolean;
}

interface MatchedEdit {
	editIndex: number;
	matchIndex: number;
	matchLength: number;
	newText: string;
}

export interface AppliedEditsResult {
	baseContent: string;
	newContent: string;
}

/**
 * Find oldText in content, trying exact match first, then progressively
 * more aggressive fuzzy matching. Uses 4 fallback strategies before giving up.
 */
export function fuzzyFindText(content: string, oldText: string): FuzzyMatchResult {
	// Strategy 1: Exact match
	const exactIndex = content.indexOf(oldText);
	if (exactIndex !== -1) {
		return {
			found: true,
			index: exactIndex,
			matchLength: oldText.length,
			usedFuzzyMatch: false,
			contentForReplacement: content,
		};
	}

	// Strategy 2: Fuzzy match (normalize quotes/dashes/indentation)
	const fuzzyContent = normalizeForFuzzyMatch(content);
	const fuzzyOldText = normalizeForFuzzyMatch(oldText);
	const fuzzyIndex = fuzzyContent.indexOf(fuzzyOldText);
	if (fuzzyIndex !== -1) {
		return {
			found: true,
			index: fuzzyIndex,
			matchLength: fuzzyOldText.length,
			usedFuzzyMatch: true,
			contentForReplacement: fuzzyContent,
		};
	}

	// Strategy 3: Line-by-line fuzzy match — match each line independently
	// with relaxed whitespace. Useful when the LLM gets indentation wrong
	// but the line content is correct.
	const fuzzyLines = fuzzyContent.split("\n");
	const oldLines = fuzzyOldText.split("\n");
	if (oldLines.length >= 2) {
		// Match first line, then verify consecutive lines
		for (let i = 0; i <= fuzzyLines.length - oldLines.length; i++) {
			const firstMatch = fuzzyLines[i].trim() === oldLines[0].trim();
			if (!firstMatch) continue;
			let allMatch = true;
			for (let j = 1; j < oldLines.length; j++) {
				if (fuzzyLines[i + j].trim() !== oldLines[j].trim()) {
					allMatch = false;
					break;
				}
			}
			if (allMatch) {
				// Found! Reconstruct the exact slice from fuzzyContent
				const matchedLines = fuzzyLines.slice(i, i + oldLines.length).join("\n");
				const matchIndex = fuzzyContent.indexOf(matchedLines);
				if (matchIndex !== -1) {
					return {
						found: true,
						index: matchIndex,
						matchLength: matchedLines.length,
						usedFuzzyMatch: true,
						contentForReplacement: fuzzyContent,
					};
				}
			}
		}
	}

	// Strategy 4: Relaxed match — collapse all whitespace and try substring
	const relaxedContent = fuzzyContent.replace(/\s+/g, " ").trim();
	const relaxedOld = fuzzyOldText.replace(/\s+/g, " ").trim();
	const relaxedIdx = relaxedContent.indexOf(relaxedOld);
	if (relaxedIdx !== -1 && relaxedOld.length > 10) {
		// Reverse-map the relaxed index to fuzzy content
		let charCount = 0;
		let fuzzyMatchStart = 0;
		for (let ci = 0; ci < fuzzyContent.length; ci++) {
			if (fuzzyContent[ci] !== " " || (ci > 0 && fuzzyContent[ci - 1] !== " ")) {
				if (charCount === relaxedIdx) {
					fuzzyMatchStart = ci;
					break;
				}
				charCount++;
			}
		}
		return {
			found: true,
			index: fuzzyMatchStart,
			matchLength: oldText.length,
			usedFuzzyMatch: true,
			contentForReplacement: fuzzyContent,
		};
	}

	// Strategy 5: Try matching just the first and last line (structural match)
	if (oldLines.length >= 3) {
		const firstLine = oldLines[0].trim();
		const lastLine = oldLines[oldLines.length - 1].trim();
		if (firstLine.length > 2 && lastLine.length > 2) {
			for (let i = 0; i <= fuzzyLines.length - oldLines.length; i++) {
				if (fuzzyLines[i].trim() === firstLine && fuzzyLines[i + oldLines.length - 1].trim() === lastLine) {
					const matchedLines = fuzzyLines.slice(i, i + oldLines.length).join("\n");
					const matchIndex = fuzzyContent.indexOf(matchedLines);
					if (matchIndex !== -1) {
						return {
							found: true,
							index: matchIndex,
							matchLength: matchedLines.length,
							usedFuzzyMatch: true,
							contentForReplacement: fuzzyContent,
						};
					}
				}
			}
		}
	}

	return {
		found: false,
		index: -1,
		matchLength: 0,
		usedFuzzyMatch: false,
		contentForReplacement: content,
	};
}

/** Strip UTF-8 BOM if present, return both the BOM (if any) and the text without it */
export function stripBom(content: string): { bom: string; text: string } {
	return content.startsWith("\uFEFF") ? { bom: "\uFEFF", text: content.slice(1) } : { bom: "", text: content };
}

function countOccurrences(content: string, oldText: string): number {
	const fuzzyContent = normalizeForFuzzyMatch(content);
	const fuzzyOldText = normalizeForFuzzyMatch(oldText);
	return fuzzyContent.split(fuzzyOldText).length - 1;
}

function getNotFoundError(
	path: string,
	editIndex: number,
	totalEdits: number,
	oldText?: string,
	content?: string,
): Error {
	const hint = `

Tip: Use the \`read\` tool to see the exact file content before editing. The \`oldText\` must match EXACTLY — character for character including indentation, blank lines, and trailing spaces. Smart quotes (\u201c\u201d) and straight quotes ("") are different; the edit tool normalizes them automatically when fuzzy matching.${oldText && content ? buildDidYouMeanHint(oldText, content) : ""}
  → read ${path}`;

	const whichEdit = totalEdits === 1 ? "" : `edits[${editIndex}] `;
	if (totalEdits === 1) {
		return new Error(`Could not find the text in ${path}.${hint}`);
	}
	return new Error(`Could not find ${whichEdit}in ${path}.${hint}`);
}

/**
 * Find the closest line in the file to a non-matching oldText and suggest it
 * as a "did you mean?" hint. Uses a tiny longest-common-substring heuristic
 * that is fast enough to run on every not-found error and dramatically helps
 * the LLM self-correct on the next turn.
 */
function buildDidYouMeanHint(oldText: string, content: string): string {
	const target = oldText.slice(0, 60).toLowerCase();
	if (target.length < 8) return "";
	const lines = content.split("\n");
	let bestLine = "";
	let bestScore = 0;
	for (const line of lines) {
		const lower = line.toLowerCase();
		// score = number of characters from target found in order in the line
		let ti = 0;
		for (let li = 0; li < lower.length && ti < target.length; li++) {
			if (lower[li] === target[ti]) ti++;
		}
		if (ti > bestScore) {
			bestScore = ti;
			bestLine = line;
		}
	}
	if (bestScore < 5 || !bestLine.trim()) return "";
	const truncated = bestLine.length > 80 ? `${bestLine.slice(0, 77)}...` : bestLine;
	return `\n  → Did you mean a line like: "${truncated}"?`;
}

function getDuplicateError(path: string, editIndex: number, totalEdits: number, occurrences: number): Error {
	if (totalEdits === 1) {
		return new Error(
			`Found ${occurrences} occurrences of the text in ${path}. The text must be unique. Please provide more context to make it unique.`,
		);
	}
	return new Error(
		`Found ${occurrences} occurrences of edits[${editIndex}] in ${path}. Each oldText must be unique. Please provide more context to make it unique.`,
	);
}

function getEmptyOldTextError(path: string, editIndex: number, totalEdits: number): Error {
	if (totalEdits === 1) {
		return new Error(`oldText must not be empty in ${path}.`);
	}
	return new Error(`edits[${editIndex}].oldText must not be empty in ${path}.`);
}

function getNoChangeError(path: string, totalEdits: number): Error {
	if (totalEdits === 1) {
		return new Error(
			`No changes made to ${path}. The replacement produced identical content. This might indicate an issue with special characters or the text not existing as expected.`,
		);
	}
	return new Error(`No changes made to ${path}. The replacements produced identical content.`);
}

/**
 * Apply one or more exact-text replacements to LF-normalized content.
 *
 * All edits are matched against the same original content. Replacements are
 * then applied in reverse order so offsets remain stable. If any edit needs
 * fuzzy matching, the operation runs in fuzzy-normalized content space to
 * preserve current single-edit behavior.
 */
export function applyEditsToNormalizedContent(
	normalizedContent: string,
	edits: Edit[],
	path: string,
	options: { allReplaceAll?: boolean } = {},
): AppliedEditsResult {
	const { allReplaceAll = false } = options;
	const normalizedEdits = edits.map((edit) => ({
		oldText: normalizeToLF(edit.oldText),
		newText: normalizeToLF(edit.newText),
		replaceAll: edit.replaceAll === true,
	}));

	for (let i = 0; i < normalizedEdits.length; i++) {
		if (normalizedEdits[i].oldText.length === 0) {
			throw getEmptyOldTextError(path, i, normalizedEdits.length);
		}
	}

	const initialMatches = normalizedEdits.map((edit) => fuzzyFindText(normalizedContent, edit.oldText));
	const baseContent = initialMatches.some((match) => match.usedFuzzyMatch)
		? normalizeForFuzzyMatch(normalizedContent)
		: normalizedContent;

	// Fast path: when ALL edits are replaceAll, skip uniqueness check and
	// just do sequential global replacements.
	if (allReplaceAll) {
		let newContent = baseContent;
		let _totalReplacements = 0;
		for (const edit of normalizedEdits) {
			const occurrences = countOccurrences(newContent, edit.oldText);
			if (occurrences === 0) {
				throw getNotFoundError(
					path,
					normalizedEdits.indexOf(edit),
					normalizedEdits.length,
					edit.oldText,
					baseContent,
				);
			}
			newContent = newContent.split(edit.oldText).join(edit.newText);
			_totalReplacements += occurrences;
		}
		if (baseContent === newContent) {
			throw getNoChangeError(path, normalizedEdits.length);
		}
		return { baseContent, newContent };
	}

	const matchedEdits: MatchedEdit[] = [];
	for (let i = 0; i < normalizedEdits.length; i++) {
		const edit = normalizedEdits[i];
		const matchResult = fuzzyFindText(baseContent, edit.oldText);
		if (!matchResult.found) {
			throw getNotFoundError(path, i, normalizedEdits.length, edit.oldText, baseContent);
		}

		// Skip uniqueness check when this individual edit has replaceAll=true
		if (!edit.replaceAll) {
			const occurrences = countOccurrences(baseContent, edit.oldText);
			if (occurrences > 1) {
				throw getDuplicateError(path, i, normalizedEdits.length, occurrences);
			}
		}

		matchedEdits.push({
			editIndex: i,
			matchIndex: matchResult.index,
			matchLength: matchResult.matchLength,
			newText: edit.newText,
		});
	}

	matchedEdits.sort((a, b) => a.matchIndex - b.matchIndex);
	const overlapErrors: Array<{ previousIndex: number; currentIndex: number }> = [];
	for (let i = 1; i < matchedEdits.length; i++) {
		const previous = matchedEdits[i - 1];
		const current = matchedEdits[i];
		if (previous.matchIndex + previous.matchLength > current.matchIndex) {
			overlapErrors.push({ previousIndex: previous.editIndex, currentIndex: current.editIndex });
		}
	}
	if (overlapErrors.length > 0) {
		const merged = mergeOverlappingEdits(baseContent, normalizedEdits, path, overlapErrors);
		return merged;
	}

	let newContent = baseContent;
	for (let i = matchedEdits.length - 1; i >= 0; i--) {
		const edit = matchedEdits[i];
		newContent =
			newContent.substring(0, edit.matchIndex) +
			edit.newText +
			newContent.substring(edit.matchIndex + edit.matchLength);
	}

	if (baseContent === newContent) {
		throw getNoChangeError(path, normalizedEdits.length);
	}

	return { baseContent, newContent };
}

/**
 * When the model passes overlapping edits (e.g. two edits[].oldText blocks
 * that share lines), merge them into a single edit that covers the union
 * region. This is far more reliable than throwing an error and asking
 * the model to retry — overlapping edits are usually a sign the model
 * just isn't tracking the file state closely, not a hard error.
 */
function mergeOverlappingEdits(
	baseContent: string,
	normalizedEdits: Array<{ oldText: string; newText: string; replaceAll: boolean }>,
	path: string,
	overlapErrors: Array<{ previousIndex: number; currentIndex: number }>,
): AppliedEditsResult {
	// Build union groups of overlapping indices
	const parent = new Map<number, number>();
	for (let i = 0; i < normalizedEdits.length; i++) parent.set(i, i);
	const find = (x: number): number => {
		let root = x;
		while (parent.get(root) !== root) root = parent.get(root)!;
		while (parent.get(x) !== root) {
			const next = parent.get(x)!;
			parent.set(x, root);
			x = next;
		}
		return root;
	};
	const union = (a: number, b: number) => {
		const ra = find(a);
		const rb = find(b);
		if (ra !== rb) parent.set(ra, rb);
	};
	for (const { previousIndex, currentIndex } of overlapErrors) {
		union(previousIndex, currentIndex);
	}

	const groups = new Map<number, number[]>();
	for (let i = 0; i < normalizedEdits.length; i++) {
		const root = find(i);
		if (!groups.has(root)) groups.set(root, []);
		groups.get(root)!.push(i);
	}

	const merged: Array<{ oldText: string; newText: string; replaceAll: boolean }> = [];
	for (const indices of groups.values()) {
		if (indices.length === 1) {
			merged.push(normalizedEdits[indices[0]!]!);
			continue;
		}
		// Find the union of the match ranges
		let start = Number.POSITIVE_INFINITY;
		let end = 0;
		for (const idx of indices) {
			const m = fuzzyFindText(baseContent, normalizedEdits[idx]!.oldText);
			if (!m.found) {
				throw getNotFoundError(path, idx, normalizedEdits.length, normalizedEdits[idx]!.oldText, baseContent);
			}
			start = Math.min(start, m.index);
			end = Math.max(end, m.index + m.matchLength);
		}
		const originalBlock = baseContent.substring(start, end);
		// Build the new block: each edit's newText replaces its oldText range within the union
		let rebuilt = originalBlock;
		for (const idx of indices) {
			const m = fuzzyFindText(baseContent, normalizedEdits[idx]!.oldText);
			const localStart = m.index - start;
			const localEnd = localStart + m.matchLength;
			rebuilt = rebuilt.substring(0, localStart) + normalizedEdits[idx]!.newText + rebuilt.substring(localEnd);
		}
		merged.push({ oldText: originalBlock, newText: rebuilt, replaceAll: false });
	}

	return applyEditsToNormalizedContent(baseContent, merged, path);
}

/** Generate a standard unified patch. */
export function generateUnifiedPatch(path: string, oldContent: string, newContent: string, contextLines = 4): string {
	return Diff.createTwoFilesPatch(path, path, oldContent, newContent, undefined, undefined, {
		context: contextLines,
		headerOptions: Diff.FILE_HEADERS_ONLY,
	});
}

/**
 * Generate a display-oriented diff string with line numbers and context.
 * Returns both the diff string and the first changed line number (in the new file).
 */
export function generateDiffString(
	oldContent: string,
	newContent: string,
	contextLines = 4,
): { diff: string; firstChangedLine: number | undefined } {
	const parts = Diff.diffLines(oldContent, newContent);
	const output: string[] = [];

	const oldLines = oldContent.split("\n");
	const newLines = newContent.split("\n");
	const maxLineNum = Math.max(oldLines.length, newLines.length);
	const lineNumWidth = String(maxLineNum).length;

	let oldLineNum = 1;
	let newLineNum = 1;
	let lastWasChange = false;
	let firstChangedLine: number | undefined;

	for (let i = 0; i < parts.length; i++) {
		const part = parts[i];
		const raw = part.value.split("\n");
		if (raw[raw.length - 1] === "") {
			raw.pop();
		}

		if (part.added || part.removed) {
			// Capture the first changed line (in the new file)
			if (firstChangedLine === undefined) {
				firstChangedLine = newLineNum;
			}

			// Show the change
			for (const line of raw) {
				if (part.added) {
					const lineNum = String(newLineNum).padStart(lineNumWidth, " ");
					output.push(`+${lineNum} ${line}`);
					newLineNum++;
				} else {
					// removed
					const lineNum = String(oldLineNum).padStart(lineNumWidth, " ");
					output.push(`-${lineNum} ${line}`);
					oldLineNum++;
				}
			}
			lastWasChange = true;
		} else {
			// Context lines - only show a few before/after changes
			const nextPartIsChange = i < parts.length - 1 && (parts[i + 1].added || parts[i + 1].removed);
			const hasLeadingChange = lastWasChange;
			const hasTrailingChange = nextPartIsChange;

			if (hasLeadingChange && hasTrailingChange) {
				if (raw.length <= contextLines * 2) {
					for (const line of raw) {
						const lineNum = String(oldLineNum).padStart(lineNumWidth, " ");
						output.push(` ${lineNum} ${line}`);
						oldLineNum++;
						newLineNum++;
					}
				} else {
					const leadingLines = raw.slice(0, contextLines);
					const trailingLines = raw.slice(raw.length - contextLines);
					const skippedLines = raw.length - leadingLines.length - trailingLines.length;

					for (const line of leadingLines) {
						const lineNum = String(oldLineNum).padStart(lineNumWidth, " ");
						output.push(` ${lineNum} ${line}`);
						oldLineNum++;
						newLineNum++;
					}

					output.push(` ${"".padStart(lineNumWidth, " ")} ...`);
					oldLineNum += skippedLines;
					newLineNum += skippedLines;

					for (const line of trailingLines) {
						const lineNum = String(oldLineNum).padStart(lineNumWidth, " ");
						output.push(` ${lineNum} ${line}`);
						oldLineNum++;
						newLineNum++;
					}
				}
			} else if (hasLeadingChange) {
				const shownLines = raw.slice(0, contextLines);
				const skippedLines = raw.length - shownLines.length;

				for (const line of shownLines) {
					const lineNum = String(oldLineNum).padStart(lineNumWidth, " ");
					output.push(` ${lineNum} ${line}`);
					oldLineNum++;
					newLineNum++;
				}

				if (skippedLines > 0) {
					output.push(` ${"".padStart(lineNumWidth, " ")} ...`);
					oldLineNum += skippedLines;
					newLineNum += skippedLines;
				}
			} else if (hasTrailingChange) {
				const skippedLines = Math.max(0, raw.length - contextLines);
				if (skippedLines > 0) {
					output.push(` ${"".padStart(lineNumWidth, " ")} ...`);
					oldLineNum += skippedLines;
					newLineNum += skippedLines;
				}

				for (const line of raw.slice(skippedLines)) {
					const lineNum = String(oldLineNum).padStart(lineNumWidth, " ");
					output.push(` ${lineNum} ${line}`);
					oldLineNum++;
					newLineNum++;
				}
			} else {
				// Skip these context lines entirely
				oldLineNum += raw.length;
				newLineNum += raw.length;
			}

			lastWasChange = false;
		}
	}

	return { diff: output.join("\n"), firstChangedLine };
}

export interface EditDiffResult {
	diff: string;
	firstChangedLine: number | undefined;
}

export interface EditDiffError {
	error: string;
}

/**
 * Compute the diff for one or more edit operations without applying them.
 * Used for preview rendering in the TUI before the tool executes.
 */
export async function computeEditsDiff(
	path: string,
	edits: Edit[],
	cwd: string,
): Promise<EditDiffResult | EditDiffError> {
	const absolutePath = resolveToCwd(path, cwd);

	try {
		// Check if file exists and is readable
		try {
			await access(absolutePath, constants.R_OK);
		} catch (error: unknown) {
			const errorMessage = error instanceof Error && "code" in error ? `Error code: ${error.code}` : String(error);
			return { error: `Could not edit file: ${path}. ${errorMessage}.` };
		}

		// Read the file
		const rawContent = await readFile(absolutePath, "utf-8");

		// Strip BOM before matching (LLM won't include invisible BOM in oldText)
		const { text: content } = stripBom(rawContent);
		const normalizedContent = normalizeToLF(content);
		const { baseContent, newContent } = applyEditsToNormalizedContent(normalizedContent, edits, path);

		// Generate the diff. For very large files, the diff is computed in
		// a worker thread (see diff-worker.ts) so the TUI render thread
		// doesn't block on Myers diff.
		const { runDisplayDiffInWorker } = await import("./diff-worker.ts");
		return await runDisplayDiffInWorker(baseContent, newContent);
	} catch (err) {
		return { error: err instanceof Error ? err.message : String(err) };
	}
}

/**
 * Compute the diff for a single edit operation without applying it.
 * Kept as a convenience wrapper for single-edit callers.
 */
export async function computeEditDiff(
	path: string,
	oldText: string,
	newText: string,
	cwd: string,
): Promise<EditDiffResult | EditDiffError> {
	return computeEditsDiff(path, [{ oldText, newText }], cwd);
}
