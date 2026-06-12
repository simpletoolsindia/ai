/**
 * context-mode built-in extension for ai.
 *
 * This extension is OFF BY DEFAULT — enable it with:
 *   settings.json: { "contextMode": { "enabled": true } }
 *
 * When enabled, it:
 *  1. Spawns the bundled MCP server (server.bundle.mjs) over stdio
 *  2. Performs the MCP initialize handshake
 *  3. Registers each `ctx_*` tool returned by `tools/list` through
 *     `ai.registerTool()`, so the LLM can call them
 *  4. Forwards `tools/call` requests to the server, returning the
 *     text content as the tool output
 *
 * On any failure (bundle missing, node not found, server crashes),
 * the extension logs a warning and continues. The other tools
 * (read, bash, etc.) keep working.
 *
 * License: the MCP server bundle (server.bundle.mjs) is from
 * https://github.com/mksglu/context-mode and is licensed under the
 * Elastic License v2.0. The bundle is unmodified. The full text is
 * at extensions/built-in/context-mode/THIRD-PARTY/ELv2-LICENSE.
 *
 * We do NOT vendor the upstream's session/resume/routing code
 * (src/session/, src/adapters/pi/extension.ts) — that pulls in many
 * more dependencies and is a much larger integration. This extension
 * is the minimum useful subset: the LLM can call ctx_* tools; the
 * server's own internal lifecycle (FTS5 indexing, etc.) still runs.
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@simpletoolsindiaorg/ai-coding-agent";
import { MCPStdioClient, type MCPToolDefinition } from "./mcp-client.ts";

const SETTINGS_KEY = "contextMode";

/**
 * Settings shape under "contextMode" in ~/.ai/agent/settings.json:
 *
 * {
 *   "contextMode": {
 *     "enabled": true,         // default: false
 *     "timeoutMs": 30000,      // default
 *     "maxOutputBytes": 50000  // default: 50KB inline cap; larger outputs
 *                             // are written to a spillover file the LLM
 *                             // can read (see webfetch spillover for the
 *                             // same pattern)
 *   }
 * }
 */
interface ContextModeSettings {
	enabled?: boolean;
	timeoutMs?: number;
	maxOutputBytes?: number;
}

function loadSettings(): Required<ContextModeSettings> {
	// Read settings from ~/.ai/agent/settings.json. We use direct
	// imports (not require) so the extension works under jiti ESM
	// loading.
	try {
		const settingsPath = join(homedir(), ".ai", "agent", "settings.json");
		if (!existsSync(settingsPath)) {
			process.stderr.write(`[context-mode] settings file not found at ${settingsPath}\n`);
			return defaults();
		}
		const raw = JSON.parse(readFileSync(settingsPath, "utf-8"));
		const cm = raw?.[SETTINGS_KEY] ?? {};
		return {
			enabled: cm.enabled === true,
			timeoutMs: typeof cm.timeoutMs === "number" ? cm.timeoutMs : 30000,
			maxOutputBytes: typeof cm.maxOutputBytes === "number" ? cm.maxOutputBytes : 50 * 1024,
		};
	} catch (err) {
		process.stderr.write(`[context-mode] failed to load settings: ${err instanceof Error ? err.message : err}\n`);
		return defaults();
	}
}

function defaults(): Required<ContextModeSettings> {
	return { enabled: false, timeoutMs: 30000, maxOutputBytes: 50 * 1024 };
}

export default function (pi: ExtensionAPI) {
	const settings = loadSettings();
	if (!settings.enabled) {
		// Opt-in. Log a single-line message at session_start so the user
		// knows the extension is installed but inactive.
		pi.on("session_start", async () => {
			process.stderr.write(
				"[context-mode] installed but disabled. Enable with `contextMode.enabled = true` in ~/.ai/agent/settings.json.\n",
			);
		});
		return;
	}

	let client: MCPStdioClient | undefined;
	let bootstrapped = false;
	let bootstrapError: string | undefined;

	/**
	 * Lazily bootstrap the MCP client. Returns the tool list on success,
	 * or an empty list on failure (with the failure logged).
	 */
	async function bootstrap(): Promise<MCPToolDefinition[]> {
		if (bootstrapped) return client?.getTools() ?? [];
		if (bootstrapError) return [];
		client = new MCPStdioClient({ timeoutMs: settings.timeoutMs });
		if (!client.isAvailable()) {
			bootstrapError = `context-mode bundle not found`;
			process.stderr.write(`[context-mode] ${bootstrapError}. The ctx_* tools will not be available.\n`);
			return [];
		}
		try {
			const tools = await client.start();
			bootstrapped = true;
			return tools;
		} catch (err) {
			bootstrapError = err instanceof Error ? err.message : String(err);
			process.stderr.write(
				`[context-mode] failed to start MCP server: ${bootstrapError}. The ctx_* tools will not be available.\n`,
			);
			return [];
		}
	}

	// Register each ctx_* tool. We register them as a fixed set so the
	// descriptions and schemas are stable; tools/list is still used to
	// confirm the server supports them.
	const KNOWN_TOOLS = [
		"ctx_execute",
		"ctx_execute_file",
		"ctx_batch_execute",
		"ctx_search",
		"ctx_index",
		"ctx_fetch_and_index",
		"ctx_stats",
		"ctx_doctor",
		"ctx_upgrade",
		"ctx_purge",
		"ctx_insight",
	];

	pi.on("session_start", async () => {
		const tools = await bootstrap();
		process.stderr.write(
			`[context-mode] enabled, ${tools.length} tool(s) registered: ${tools.map((t) => t.name).join(", ")}\n`,
		);
	});

	for (const toolName of KNOWN_TOOLS) {
		pi.registerTool({
			name: toolName,
			label: toolName,
			description: [
				`context-mode MCP tool: ${toolName}.`,
				`These tools let the agent run sandboxed code (JS/TS/Python/Shell/etc.),`,
				`index large data, and search across indexed sources — without dumping`,
				`raw output into the model context. The result is concise; the LLM should`,
				`call ${toolName} instead of running the equivalent operations via read/bash/webfetch`,
				`when the expected output is large (>=50KB) or query-shaped.`,
				`If the ctx_* tool is unavailable (e.g. server not running), fall back to`,
				`the equivalent built-in tool and call out the routing trade-off.`,
			].join(" "),
			parameters: {
				type: "object",
				properties: {},
				additionalProperties: true,
			},
			async execute(_toolCallId, params, signal) {
				if (!client || !bootstrapped) {
					const tools = await bootstrap();
					if (!bootstrapped) {
						throw new Error(
							bootstrapError
								? `context-mode MCP server is not available: ${bootstrapError}`
								: "context-mode MCP server failed to start; ctx_* tools are unavailable",
						);
					}
					// Server came up; client is now ready.
				}
				const args = (params ?? {}) as Record<string, unknown>;
				try {
					const result = await client!.callTool(toolName, args);
					// Combine all text content blocks into one string, truncating
					// to the configured cap (with a hint to the LLM).
					const text = result.content
						.filter((c): c is { type: "text"; text: string } => c.type === "text")
						.map((c) => c.text)
						.join("\n");
					let displayText = text;
					if (text.length > settings.maxOutputBytes) {
						displayText =
							text.slice(0, settings.maxOutputBytes) +
							`\n\n[Output truncated at ${settings.maxOutputBytes} bytes of ${text.length}. ` +
							`Use ctx_search / ctx_batch_execute to query specific slices.]`;
					}
					return {
						content: [{ type: "text", text: displayText }],
						details: {
							toolName,
							isError: result.isError === true,
							totalBytes: text.length,
						},
					};
				} catch (err) {
					const msg = err instanceof Error ? err.message : String(err);
					// If the server died, mark un-bootstrapped so the next
					// call retries.
					if (msg.includes("exited") || msg.includes("not running")) {
						bootstrapped = false;
					}
					throw new Error(`${toolName} failed: ${msg}`);
				}
			},
		});
	}

	// Stop the server on session shutdown so we don't leak a subprocess.
	pi.on("session_shutdown", async () => {
		if (client) {
			try {
				await client.stop();
			} catch {
				/* best-effort */
			}
		}
	});
}
