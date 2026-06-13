/**
 * context7 built-in extension for ai.
 *
 * Adds the context7 MCP tools (resolve-library-id, get-library-docs) to
 * the agent. context7 (https://context7.com) is an Upstash service that
 * resolves a library name to a context7 ID and returns up-to-date,
 * version-specific documentation and code examples — designed to reduce
 * hallucinated APIs and stale training-data code examples.
 *
 * Implementation:
 *   1. Spawn the published `@upstash/context7-mcp` server as a child
 *      process via `npx -y @upstash/context7-mcp` (downloaded on first
 *      use, cached by npm afterwards).
 *   2. Perform the MCP initialize handshake.
 *   3. Register each returned tool (currently `resolve-library-id` and
 *      `get-library-docs`) via `pi.registerTool()`.
 *   4. Forward `tools/call` requests to the server.
 *
 * Off by default. Enable with `context7.enabled = true` in
 * `~/.ai/agent/settings.json`. The first call downloads the server
 * via npx; subsequent calls use the npm cache.
 *
 * Privacy: as of 0.85.0 ai does not send any data to a remote endpoint
 * unless the user opts in. context7 IS a remote service — its tools
 * send library names and document queries to https://context7.com.
 * Enable only if you accept this.
 *
 * Settings (in `~/.ai/agent/settings.json` under `context7`):
 *   - `enabled: true`         — turn the extension on. Default: false.
 *   - `timeoutMs: 30000`      — per-request timeout to the MCP server.
 *   - `maxOutputBytes: 50000` — cap on tool output size inline; larger
 *                                outputs are truncated with a hint.
 *
 * The MIT LICENSE in `THIRD-PARTY/` covers the use of the protocol /
 * service. The actual server code is downloaded at runtime from npm and
 * is MIT-licensed by Upstash, Inc. (2021). No code from context7 is
 * vendored in this repo.
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@simpletoolsindiaorg/ai-coding-agent";
import { MCPStdioClient } from "../../mcp-stdio-client.ts";

const SETTINGS_KEY = "context7";

/**
 * Settings shape under "context7" in ~/.ai/agent/settings.json:
 *
 * {
 *   "context7": {
 *     "enabled": true,         // default: false
 *     "timeoutMs": 30000,      // default
 *     "maxOutputBytes": 50000  // default
 *   }
 * }
 */
interface Context7Settings {
	enabled?: boolean;
	timeoutMs?: number;
	maxOutputBytes?: number;
}

function loadSettings(): Required<Context7Settings> {
	try {
		const settingsPath = join(homedir(), ".ai", "agent", "settings.json");
		if (!existsSync(settingsPath)) return defaults();
		const raw = JSON.parse(readFileSync(settingsPath, "utf-8"));
		const cm = raw?.[SETTINGS_KEY] ?? {};
		return {
			enabled: cm.enabled === true,
			timeoutMs: typeof cm.timeoutMs === "number" ? cm.timeoutMs : 30_000,
			maxOutputBytes: typeof cm.maxOutputBytes === "number" ? cm.maxOutputBytes : 50 * 1024,
		};
	} catch (err) {
		process.stderr.write(`[context7] failed to load settings: ${err instanceof Error ? err.message : err}\n`);
		return defaults();
	}
}

function defaults(): Required<Context7Settings> {
	return { enabled: false, timeoutMs: 30_000, maxOutputBytes: 50 * 1024 };
}

/**
 * Find an `npx` binary on the user's PATH. Falls back to a guess
 * (`/usr/local/bin/npx`, `C:\Program Files\nodejs\npx.cmd`) if the
 * which-style probe fails. Returns `undefined` if nothing usable.
 */
function findNpx(): string | undefined {
	const candidates = [
		process.env.NPX_PATH,
		"npx",
		"/usr/local/bin/npx",
		"/usr/bin/npx",
		"/opt/homebrew/bin/npx",
		process.platform === "win32" ? "C:\\Program Files\\nodejs\\npx.cmd" : undefined,
		process.platform === "win32" ? "C:\\Program Files (x86)\\nodejs\\npx.cmd" : undefined,
	].filter((c): c is string => Boolean(c));
	return candidates[0];
}

export default function (pi: ExtensionAPI) {
	const settings = loadSettings();
	if (!settings.enabled) {
		// Opt-in. Log a single-line message at session_start so the user
		// knows the extension is installed but inactive.
		pi.on("session_start", async () => {
			process.stderr.write(
				`[context7] installed but disabled. Enable with \`${SETTINGS_KEY}.enabled = true\` in ~/.ai/agent/settings.json to add resolve-library-id and get-library-docs tools (data sent to https://context7.com).\n`,
			);
		});
		return;
	}

	const npx = findNpx();
	if (!npx) {
		process.stderr.write(`[context7] could not find 'npx' on PATH. Install Node.js 22+ to use the context7 tools.\n`);
		return;
	}

	let client: MCPStdioClient | undefined;
	let bootstrapped = false;
	let bootstrapError: string | undefined;

	async function bootstrap(): Promise<void> {
		if (bootstrapped) return;
		if (bootstrapError) return;
		client = new MCPStdioClient({
			command: npx,
			args: ["-y", "@upstash/context7-mcp"],
			timeoutMs: settings.timeoutMs,
			serverLabel: "context7",
		});
		try {
			await client.start();
			bootstrapped = true;
		} catch (err) {
			bootstrapError = err instanceof Error ? err.message : String(err);
			process.stderr.write(
				`[context7] failed to start MCP server: ${bootstrapError}. The resolve-library-id / get-library-docs tools will not be available.\n`,
			);
		}
	}

	// Register the two known tools. We declare the parameter shapes up
	// front (the upstream tool list is fetched at runtime, but we want
	// the LLM to see stable schemas).
	const KNOWN_TOOLS = ["resolve-library-id", "get-library-docs"];

	pi.on("session_start", async () => {
		await bootstrap();
		if (bootstrapped && client) {
			const tools = client.getTools();
			process.stderr.write(
				`[context7] enabled, ${tools.length} tool(s) registered: ${tools.map((t) => t.name).join(", ")}\n`,
			);
		}
	});

	for (const toolName of KNOWN_TOOLS) {
		pi.registerTool({
			name: toolName,
			label: toolName,
			description: [
				`context7 MCP tool: ${toolName}.`,
				`Context7 (https://context7.com) is an Upstash service that resolves`,
				`a library name to a context7 ID and returns up-to-date,`,
				`version-specific documentation and code examples.`,
				`These tools send library names and document queries to`,
				`https://context7.com (remote service, not local).`,
				`Prefer these over websearch/webfetch when the user is asking about a`,
				`specific library, framework, or API — context7 returns`,
				`docs that are current as of the request, not the model's training data.`,
				`If context7 is unavailable, fall back to webfetch and explicitly`,
				`note the docs may be older.`,
			].join(" "),
			parameters: {
				type: "object",
				properties: {},
				additionalProperties: true,
			},
			async execute(_toolCallId, params, _signal) {
				if (!client || !bootstrapped) {
					await bootstrap();
					if (!bootstrapped) {
						throw new Error(
							bootstrapError
								? `context7 MCP server is not available: ${bootstrapError}`
								: "context7 MCP server failed to start; tools are unavailable",
						);
					}
				}
				const args = (params ?? {}) as Record<string, unknown>;
				try {
					const result = await client!.callTool(toolName, args);
					const text = result.content
						.filter((c): c is { type: "text"; text: string } => c.type === "text")
						.map((c) => c.text)
						.join("\n");
					let displayText = text;
					if (text.length > settings.maxOutputBytes) {
						displayText =
							text.slice(0, settings.maxOutputBytes) +
							`\n\n[Output truncated at ${settings.maxOutputBytes} bytes of ${text.length}. ` +
							`If you need a specific section, call get-library-docs with a more focused topic parameter.]`;
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
