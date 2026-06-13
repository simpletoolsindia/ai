/**
 * rpiv-btw — built-in extension for ai.
 *
 * Vendored from @juicesharp/rpiv-btw v1.19.1 (MIT, juicesharp 2026).
 * Source: https://github.com/juicesharp/rpiv-mono/tree/main/packages/rpiv-btw
 *
 * Adds the `/btw <question>` slash command. The agent's primary model
 * is asked the side question in parallel, with the main conversation
 * cloned as background context. The answer is rendered in a
 * bottom-anchored TUI overlay and never enters the main agent's
 * messages. History is kept in process-scoped globalThis state
 * (survives /new, /fork, /reload, /resume; lost on ai process exit).
 *
 * Settings (in `~/.ai/agent/settings.json` under `rpivBtw`):
 *   - `enabled: true`  — turn the extension on. Default: false.
 *
 * License: see THIRD-PARTY/MIT-LICENSE.
 *
 * Differences from upstream:
 *   - Imports rewritten to `@simpletoolsindiaorg/ai-{provider,coding-agent,tui}`.
 *     The loader's back-compat aliases would also resolve the upstream
 *     `@earendil-works/*` scopes, but built-in code uses the canonical names.
 *   - The original upstream `index.ts` (which called three register* helpers)
 *     is collapsed into this file. All logic still lives in btw.ts / btw-ui.ts.
 *   - Settings gate added (upstream has no settings — installed via
 *     `pi install` and unconditionally on). The gate is opt-in (default
 *     off) so users who don't ask for it don't get a `/btw` command
 *     registered or the message_end snapshot hook fired.
 *   - The relative imports `./btw-ui.js` / `./btw.js` are rewritten to
 *     `./btw-ui.ts` / `./btw.ts` to match this project's import-extension
 *     convention (allowImportingTsExtensions is on).
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@simpletoolsindiaorg/ai-coding-agent";
import { registerBtwCommand, registerInvalidationHooks, registerMessageEndSnapshot } from "./btw.ts";

const SETTINGS_KEY = "rpivBtw";

interface RpivBtwSettings {
	enabled?: boolean;
}

function loadSettings(): RpivBtwSettings {
	try {
		const settingsPath = join(homedir(), ".ai", "agent", "settings.json");
		if (!existsSync(settingsPath)) return {};
		const raw = JSON.parse(readFileSync(settingsPath, "utf-8"));
		const section = raw?.[SETTINGS_KEY];
		return typeof section === "object" && section !== null ? (section as RpivBtwSettings) : {};
	} catch {
		return {};
	}
}

export default function (pi: ExtensionAPI): void {
	const settings = loadSettings();
	if (settings.enabled !== true) {
		// Off by default. Log once at session_start so users know the
		// extension is installed but inactive. Same pattern as context-mode
		// and rpiv-args.
		pi.on("session_start", async () => {
			process.stderr.write(
				`[rpiv-btw] installed but disabled. Enable with \`${SETTINGS_KEY}.enabled = true\` in ~/.ai/agent/settings.json to register the /btw side-question slash command.\n`,
			);
		});
		return;
	}

	registerBtwCommand(pi);
	registerMessageEndSnapshot(pi);
	registerInvalidationHooks(pi);
}
