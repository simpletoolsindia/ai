/**
 * Worker script for diff-worker.ts. Runs in a separate thread.
 * Receives `{ id, kind, oldContent, newContent, contextLines }` and
 * posts back the result. Two kinds:
 *   - "unified": { id, diff: string } (a unified patch)
 *   - "display": { id, diff: string, firstChangedLine: number | null }
 *                (the line-numbered display diff used by the TUI)
 */

import { parentPort } from "node:worker_threads";
import { createTwoFilesPatch, diffLines } from "diff";

interface DiffRequestUnified {
	id: string;
	kind: "unified";
	oldContent: string;
	newContent: string;
	contextLines?: number;
}

interface DiffRequestDisplay {
	id: string;
	kind: "display";
	oldContent: string;
	newContent: string;
	contextLines?: number;
}

type DiffRequest = DiffRequestUnified | DiffRequestDisplay;

type DiffResponseUnified = { id: string; kind: "unified"; diff: string };
type DiffResponseDisplay = { id: string; kind: "display"; diff: string; firstChangedLine: number | null };
type DiffResponseError = { id: string; error: string };
type DiffResponse = DiffResponseUnified | DiffResponseDisplay | DiffResponseError;

function isDiffRequest(value: unknown): value is DiffRequest {
	if (!value || typeof value !== "object") return false;
	const v = value as Record<string, unknown>;
	return (
		typeof v.id === "string" &&
		typeof v.oldContent === "string" &&
		typeof v.newContent === "string" &&
		(v.kind === "unified" || v.kind === "display")
	);
}

function computeDisplayDiff(
	oldContent: string,
	newContent: string,
	contextLines: number,
): {
	diff: string;
	firstChangedLine: number | null;
} {
	const parts = diffLines(oldContent, newContent);
	const output: string[] = [];

	const oldLines = oldContent.split("\n");
	const newLines = newContent.split("\n");
	const maxLineNum = Math.max(oldLines.length, newLines.length);
	const padWidth = String(maxLineNum).length;

	let oldLineNo = 0;
	let newLineNo = 0;
	let firstChangedLine: number | null = null;

	for (const part of parts) {
		const partLines = part.value.split("\n");
		// diff library appends a trailing empty string if value ends with \n
		if (partLines.length > 0 && partLines[partLines.length - 1] === "") {
			partLines.pop();
		}
		for (const line of partLines) {
			if (part.added) {
				newLineNo += 1;
				if (firstChangedLine === null) firstChangedLine = newLineNo;
				const lineNo = String(newLineNo).padStart(padWidth, " ");
				output.push(`+ ${lineNo} ${line}`);
			} else if (part.removed) {
				oldLineNo += 1;
				const lineNo = String(oldLineNo).padStart(padWidth, " ");
				output.push(`- ${lineNo} ${line}`);
			} else {
				oldLineNo += 1;
				newLineNo += 1;
				if (contextLines === -1 || oldLineNo <= contextLines * 2) {
					const lineNo = String(newLineNo).padStart(padWidth, " ");
					output.push(`  ${lineNo} ${line}`);
				}
			}
		}
	}

	return { diff: output.join("\n"), firstChangedLine };
}

const port = parentPort;
if (!port) {
	throw new Error("diff-worker-script requires parentPort");
}

port.on("message", (message: unknown) => {
	try {
		if (!isDiffRequest(message)) {
			throw new Error("Invalid diff worker request");
		}
		if (message.kind === "unified") {
			const diff = createTwoFilesPatch("a", "b", message.oldContent, message.newContent, "", "", {
				context: message.contextLines ?? 4,
			});
			const response: DiffResponse = { id: message.id, kind: "unified", diff };
			port.postMessage(response);
		} else {
			const { diff, firstChangedLine } = computeDisplayDiff(
				message.oldContent,
				message.newContent,
				message.contextLines ?? 4,
			);
			const response: DiffResponse = { id: message.id, kind: "display", diff, firstChangedLine };
			port.postMessage(response);
		}
	} catch (error) {
		const response: DiffResponse = {
			id: isDiffRequest(message) ? message.id : "unknown",
			error: error instanceof Error ? error.message : String(error),
		};
		port.postMessage(response);
	}
});
