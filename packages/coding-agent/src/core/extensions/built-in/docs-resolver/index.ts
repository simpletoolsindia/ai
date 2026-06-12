/**
 * docs-resolver — built-in extension for the ai coding agent.
 *
 * Exposes a single LLM-callable tool: `resolveDocs(libraryId, topic?)`.
 *
 * The tool fetches the README + a few key files for a library and
 * returns a compact markdown summary. It is "context7-style" in the
 * sense that the model can pull just-in-time docs for the library it
 * is currently working with, instead of having every library's docs
 * loaded into the system prompt up front.
 *
 * Self-hosted: no external service is called. Fetches go directly to
 * the npm registry and to raw.githubusercontent.com. Cached on disk
 * under `~/.ai/agent/cache/docs/` with a 1-day TTL.
 *
 * OFF BY DEFAULT — enable it in `~/.ai/agent/settings.json`:
 *   { "docsResolver": { "enabled": true } }
 *
 * Why opt-in: the extension adds a network dependency for every
 * session, which some users (e.g. fully-offline workflows) do not
 * want. With it disabled, the system prompt stays the same as
 * before — no regression.
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@simpletoolsindiaorg/ai-coding-agent";
import { Type } from "typebox";
import { cacheClear } from "./cache.ts";
import { resolveDocs as resolveDocsImpl } from "./resolver.ts";

const SETTINGS_KEY = "docsResolver";

interface DocsResolverSettings {
	enabled?: boolean;
	timeoutMs?: number;
	maxOutputBytes?: number;
}

function loadSettings(): Required<DocsResolverSettings> {
	try {
		const settingsPath = join(homedir(), ".ai", "agent", "settings.json");
		if (!existsSync(settingsPath)) return defaults();
		const raw = JSON.parse(readFileSync(settingsPath, "utf-8"));
		const dr = raw?.[SETTINGS_KEY] ?? {};
		return {
			enabled: dr.enabled === true,
			timeoutMs: typeof dr.timeoutMs === "number" ? dr.timeoutMs : 8000,
			maxOutputBytes: typeof dr.maxOutputBytes === "number" ? dr.maxOutputBytes : 50 * 1024,
		};
	} catch {
		return defaults();
	}
}

function defaults(): Required<DocsResolverSettings> {
	return { enabled: false, timeoutMs: 8000, maxOutputBytes: 50 * 1024 };
}

export default function (pi: ExtensionAPI) {
	const settings = loadSettings();

	if (!settings.enabled) {
		// Opt-in. Log a one-liner at session start so users know it
		// exists and how to enable it.
		pi.on("session_start", async () => {
			process.stderr.write(
				"[docs-resolver] installed but disabled. Enable with `docsResolver.enabled = true` in ~/.ai/agent/settings.json.\n",
			);
		});
		return;
	}

	// Register the LLM-callable tool.
	pi.registerTool({
		name: "resolveDocs",
		label: "resolveDocs",
		description:
			'Fetch up-to-date documentation for a library or framework. Use this BEFORE writing code that depends on a third-party library if you are not 100% sure of the current API. Pass an npm package name (e.g. "react", "@types/node") or a GitHub "owner/repo" string. The result is cached on disk for 1 day, so repeat calls for the same library are instant.',
		parameters: Type.Object({
			libraryId: Type.String({
				description:
					'Library identifier. Either an npm package name (e.g. "react", "@types/node", "next") or a GitHub "owner/repo" (optionally with "#ref").',
				minLength: 1,
			}),
			topic: Type.Optional(
				Type.String({
					description:
						'Optional focus area. Reserved for future use; today the full README is returned (capped at ~50KB). Pass e.g. "routing" or "server actions" to hint at the area of interest.',
				}),
			),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			const { libraryId, topic } = params as { libraryId: string; topic?: string };
			const result = await resolveDocsImpl({ libraryId, topic });
			if (!result.ok) {
				return {
					content: [{ type: "text", text: result.summary }],
					details: { ok: false, error: result.error, libraryId, kind: result.kind },
					isError: true,
				};
			}
			const text = [
				result.summary,
				"",
				result.cached ? "(served from local cache)" : "(fetched live; cached for 1 day)",
				"",
				result.content,
			].join("\n");
			return {
				content: [{ type: "text", text }],
				details: {
					ok: true,
					libraryId,
					kind: result.kind,
					topic: result.topic,
					sourceUrl: result.sourceUrl,
					cached: result.cached,
					bytes: result.content.length,
				},
			};
		},
	});

	// Slash command to manage the cache.
	pi.registerCommand("docs", {
		description: "Manage the docs-resolver cache (clear: empty the on-disk cache).",
		handler: async (args, ctx) => {
			const subcommand = (args.trim().split(/\s+/)[0] || "").toLowerCase();
			if (subcommand === "clear") {
				const { removed } = cacheClear();
				ctx.ui.notify(`Cleared ${removed} docs cache entries.`, "info");
				return;
			}
			ctx.ui.notify("Usage: /docs clear  — clear the on-disk docs cache (~/.ai/agent/cache/docs/)", "info");
		},
	});
}
