/**
 * JSON transcript exporter.
 *
 * Produces a structured JSON file with the full session state:
 * - session header
 * - leaf id (the current branch point)
 * - ordered entries on the current branch (post-fork/skip filtering already applied)
 * - tool list snapshot (if AgentState provided)
 * - system prompt snapshot (if AgentState provided)
 * - export metadata (when, what version)
 *
 * The shape is `SessionData` matching the HTML export's payload, with an
 * added `exportedAt` and `exporterVersion` for downstream tooling.
 */

import type { AgentState } from "@simpletoolsindiaorg/ai-agent";
import { existsSync, writeFileSync } from "fs";
import { basename } from "path";
import { APP_NAME } from "../../config.ts";
import { normalizePath } from "../../utils/paths.ts";
import type { SessionManager } from "../session-manager.ts";

export interface JsonExportOptions {
	/** Pretty-print with this indent (default 2). Set to 0 for compact JSON. */
	indent?: number;
	/** Output file path. If omitted, generates a default name next to the session. */
	outputPath?: string;
}

export const EXPORTER_VERSION = "1.0.0";

/**
 * Export a session to JSON.
 * @param sm SessionManager with the session loaded
 * @param state Optional AgentState for model/tool/system-prompt metadata
 * @param options Output path and formatting
 * @returns Path to the exported file
 */
export function exportSessionToJson(
	sm: SessionManager,
	state?: AgentState,
	options?: JsonExportOptions | string,
): string {
	const opts: JsonExportOptions = typeof options === "string" ? { outputPath: options } : options || {};
	const indent = opts.indent ?? 2;

	const sessionFile = sm.getSessionFile();
	if (!sessionFile) {
		throw new Error("Cannot export in-memory session to JSON");
	}
	if (!existsSync(sessionFile)) {
		throw new Error("Nothing to export yet — start a conversation first");
	}

	const data = {
		$schema: `https://${APP_NAME}.invalid/schemas/session-export-v1.json`,
		exportedAt: new Date().toISOString(),
		exporterVersion: EXPORTER_VERSION,
		header: sm.getHeader(),
		leafId: sm.getLeafId(),
		entries: sm.getBranch(),
		systemPrompt: state?.systemPrompt,
		model: state?.model ? { id: state.model.id, provider: state.model.provider, api: state.model.api } : undefined,
		tools: state?.tools?.map((t) => ({
			name: t.name,
			description: t.description,
			parameters: t.parameters,
		})),
	};

	const json = JSON.stringify(data, null, indent === 0 ? undefined : indent);
	const body = indent === 0 ? json : `${json}\n`;

	let outputPath = opts.outputPath ? normalizePath(opts.outputPath) : undefined;
	if (!outputPath) {
		const sessionBasename = basename(sessionFile, ".jsonl");
		outputPath = `${APP_NAME}-session-${sessionBasename}.json`;
	}
	writeFileSync(outputPath, body, "utf8");
	return outputPath;
}
