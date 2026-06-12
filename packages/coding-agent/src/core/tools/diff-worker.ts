/**
 * diff-worker — runs unified-diff + display-diff generation in a worker
 * thread.
 *
 * The TUI render path calls into the diff algorithm for every edit
 * preview, including edits to large files. Myers diff is O(n+d) and
 * synchronous, so a multi-MB file can block the main thread for
 * hundreds of milliseconds and cause visible TUI jank.
 *
 * `runDiffInWorker` / `runDisplayDiffInWorker` offload the work to a
 * single shared worker thread. Pool size is 1 by design: a single
 * worker saturates one core for diffs, and the TUI only renders one
 * preview at a time, so adding workers would just compete for the
 * same memory bandwidth.
 *
 * Falls back to the inline diff if the worker cannot be started.
 *
 * Worker script: ./diff-worker-script.ts
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { generateDiffString, generateUnifiedPatch } from "./edit-diff.ts";

/** Threshold (chars) above which the worker is used. ~256 KB keeps
 *  the inline path fast for the common case (small/medium files) and
 *  offloads only the rare large-file edit. */
export const DIFF_WORKER_THRESHOLD = 256 * 1024;

interface PendingResult {
	diff: string;
	firstChangedLine: number | null;
}

interface PendingRequest {
	resolve: (value: PendingResult) => void;
	reject: (err: Error) => void;
}

let worker: Worker | undefined;
let nextId = 0;
const pending = new Map<string, PendingRequest>();

function getWorkerScriptPath(): string {
	const here = dirname(fileURLToPath(import.meta.url));
	return join(here, "diff-worker-script.ts");
}

function spawnWorker(): Worker | undefined {
	try {
		const w = new Worker(getWorkerScriptPath());
		w.on("message", (msg: { id: string; diff?: string; firstChangedLine?: number | null; error?: string }) => {
			const p = pending.get(msg.id);
			if (!p) return;
			pending.delete(msg.id);
			if (msg.error) p.reject(new Error(msg.error));
			else p.resolve({ diff: msg.diff ?? "", firstChangedLine: msg.firstChangedLine ?? null });
		});
		w.on("error", (err) => {
			for (const p of pending.values()) p.reject(err);
			pending.clear();
			worker = undefined;
		});
		w.on("exit", (code) => {
			if (code !== 0) {
				const err = new Error(`diff worker exited with code ${code}`);
				for (const p of pending.values()) p.reject(err);
				pending.clear();
			}
			worker = undefined;
		});
		return w;
	} catch {
		return undefined;
	}
}

function ensureWorker(): Worker | undefined {
	if (worker) return worker;
	worker = spawnWorker();
	return worker;
}

function totalSize(oldContent: string, newContent: string): number {
	return oldContent.length + newContent.length;
}

function isLarge(oldContent: string, newContent: string): boolean {
	return totalSize(oldContent, newContent) >= DIFF_WORKER_THRESHOLD;
}

function dispatch(
	oldContent: string,
	newContent: string,
	kind: "unified" | "display",
	contextLines: number,
): Promise<PendingResult> {
	const w = ensureWorker();
	if (!w) return Promise.resolve({ diff: "", firstChangedLine: null });
	const id = `d${++nextId}`;
	return new Promise<PendingResult>((resolve, reject) => {
		pending.set(id, { resolve, reject });
		w.postMessage({ id, kind, oldContent, newContent, contextLines });
	});
}

/**
 * Compute a unified patch for `oldContent` -> `newContent`. Falls back
 * to the inline `generateUnifiedPatch` for small content or if the
 * worker cannot be spawned.
 */
export async function runDiffInWorker(oldContent: string, newContent: string, contextLines = 4): Promise<string> {
	if (!isLarge(oldContent, newContent)) {
		return generateUnifiedPatch("", oldContent, newContent, contextLines);
	}
	const r = await dispatch(oldContent, newContent, "unified", contextLines);
	return r.diff || generateUnifiedPatch("", oldContent, newContent, contextLines);
}

/**
 * Compute the display diff (with line numbers) for `oldContent` ->
 * `newContent`. Returns `{ diff, firstChangedLine }`.
 *
 * Falls back to the inline `generateDiffString` for small content.
 */
export async function runDisplayDiffInWorker(
	oldContent: string,
	newContent: string,
	contextLines = 4,
): Promise<{ diff: string; firstChangedLine: number | undefined }> {
	if (!isLarge(oldContent, newContent)) {
		return generateDiffString(oldContent, newContent, contextLines);
	}
	const r = await dispatch(oldContent, newContent, "display", contextLines);
	if (r.diff) {
		return { diff: r.diff, firstChangedLine: r.firstChangedLine ?? undefined };
	}
	return generateDiffString(oldContent, newContent, contextLines);
}

/** For tests: reset the worker state. */
export function _resetDiffPool(): void {
	if (worker) {
		worker.terminate().catch(() => {});
		worker = undefined;
	}
	for (const p of pending.values()) {
		p.reject(new Error("diff pool reset"));
	}
	pending.clear();
}
