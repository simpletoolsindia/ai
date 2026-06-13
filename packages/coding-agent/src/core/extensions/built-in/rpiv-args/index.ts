/**
 * rpiv-args — built-in extension for ai.
 *
 * Vendored from @juicesharp/rpiv-args v1.19.1 (MIT, juicesharp 2026).
 * Source: https://github.com/juicesharp/rpiv-mono/tree/main/packages/rpiv-args
 *
 * Intercepts `/skill:<name> <args>` at the input hook and emits a skill
 * wrapper. Pipeline:
 *   strip frontmatter → $N/$ARGUMENTS substitution (opt-in via TOKEN_REGEX)
 *   → ${SKILL_DIR}/${SESSION_ID} substitution (always-on)
 *   → shell execution via `!`cmd`` (inline) and ```!…``` (block) (always-on)
 *   → wrap in <skill name=… location=…>…</skill> block
 *
 * Also prepends a skill-invocation protocol to the system prompt every turn
 * via `before_agent_start` so the LLM treats trailing text after `</skill>`
 * as the skill's argument input rather than a separate imperative.
 *
 * Settings (in `~/.ai/agent/settings.json` under `rpivArgs`):
 *   - `enabled: true`  — turn the extension on. Default: false.
 *
 * License: see THIRD-PARTY/MIT-LICENSE.
 *
 * Differences from upstream:
 *   - Imports rewritten to `@simpletoolsindiaorg/ai-coding-agent` (canonical
 *     scope for this fork). The loader's back-compat aliases would also
 *     resolve `@earendil-works/pi-coding-agent`, but built-in code uses the
 *     canonical name.
 *   - Settings gate added (upstream has no settings — it's unconditionally
 *     on once installed). The gate is opt-in (default off) so users who
 *     don't ask for it don't get the system-prompt prefix or the
 *     input-hook interception.
 *   - The original `index.ts` (which re-exported from `./args.js`) is
 *     collapsed into this file for clarity. All logic still lives in args.ts.
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@simpletoolsindiaorg/ai-coding-agent";
import { registerArgsHandler } from "./args.ts";

const SETTINGS_KEY = "rpivArgs";

interface RpivArgsSettings {
	enabled?: boolean;
}

function loadSettings(): RpivArgsSettings {
	try {
		const settingsPath = join(homedir(), ".ai", "agent", "settings.json");
		if (!existsSync(settingsPath)) return {};
		const raw = JSON.parse(readFileSync(settingsPath, "utf-8"));
		const section = raw?.[SETTINGS_KEY];
		return typeof section === "object" && section !== null ? (section as RpivArgsSettings) : {};
	} catch {
		return {};
	}
}

export default function (pi: ExtensionAPI): void {
	const settings = loadSettings();
	if (settings.enabled !== true) {
		// Off by default. Log once at session_start so users know the
		// extension is installed but inactive. Same pattern as context-mode.
		pi.on("session_start", async () => {
			process.stderr.write(
				`[rpiv-args] installed but disabled. Enable with \`${SETTINGS_KEY}.enabled = true\` in ~/.ai/agent/settings.json to add $N/$ARGUMENTS placeholder expansion and shell substitution to skill invocations.\n`,
			);
		});
		return;
	}

	registerArgsHandler(pi);
}
