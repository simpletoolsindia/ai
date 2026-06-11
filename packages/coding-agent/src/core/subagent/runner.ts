/**
 * Subagent spawn utility.
 *
 * Spawns a separate `ai` process running a named agent with a task,
 * streams the JSON event stream from stdout, and returns a structured
 * result. Used by:
 *   - The built-in `subagent` tool (LLM-callable)
 *   - The subagent extension (user-invoked via /scout-* prompts)
 *
 * The two callers share agent discovery but the spawn logic is small
 * enough that we keep it here rather than cross-importing from the
 * extension (which is an example, not part of the core).
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { withFileMutationQueue } from "../tools/file-mutation-queue.ts";
import type { AgentScope } from "./agents.ts";
import { discoverAgents } from "./agents.ts";

/** Minimal Message shape (subset of @simpletoolsindiaorg/ai-provider's Message). */
export interface SubagentMessage {
	role: "user" | "assistant" | "toolResult";
	content: unknown;
	timestamp?: number;
	usage?: {
		input?: number;
		output?: number;
		cacheRead?: number;
		cacheWrite?: number;
		cost?: { total?: number };
		totalTokens?: number;
	};
	model?: string;
	stopReason?: string;
	errorMessage?: string;
	toolName?: string;
	toolCallId?: string;
	isError?: boolean;
}

export interface SubagentRunResult {
	/** Name of the agent that was run. */
	agent: string;
	/** Where the agent was found: "user" | "project" | "unknown". */
	agentSource: "user" | "project" | "unknown";
	/** The task that was given. */
	task: string;
	/** Process exit code. -1 if it didn't exit normally. */
	exitCode: number;
	/** All messages received during the run (assistant + toolResult). */
	messages: SubagentMessage[];
	/** Stderr from the process. */
	stderr: string;
	/** Aggregated usage stats. */
	usage: {
		input: number;
		output: number;
		cacheRead: number;
		cacheWrite: number;
		cost: number;
		contextTokens: number;
		turns: number;
	};
	/** Resolved model. */
	model?: string;
	/** Final stop reason. */
	stopReason?: string;
	/** Error message if the run errored. */
	errorMessage?: string;
	/** When did the run complete. */
	elapsedMs: number;
}

export interface SubagentRunOptions {
	/** Working directory. Defaults to the current process cwd. */
	cwd?: string;
	/** Agent scope to discover from. Default: "user". */
	scope?: AgentScope;
	/** Abort signal for cancellation. */
	signal?: AbortSignal;
	/** Timeout in milliseconds. Default 10 minutes. */
	timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Determine how to invoke the `ai` binary.
 * Walks up from the current module to find the `packages/coding-agent` root,
 * then uses `dist/cli.js` (or `src/cli.ts` for dev). Falls back to the
 * `ai` binary on PATH.
 */
function getAiInvocation(args: string[]): { command: string; args: string[] } {
	// Try to find the coding-agent package's CLI entry point by walking up
	// from the current module's URL. Works whether we're in dist/ or src/.
	try {
		const moduleUrl = import.meta.url;
		const modulePath = fileURLToPath(moduleUrl);
		// Walk up looking for a `packages/coding-agent` directory
		let dir = path.dirname(modulePath);
		while (dir !== path.dirname(dir)) {
			const candidate = path.join(dir, "packages", "coding-agent", "dist", "cli.js");
			if (fs.existsSync(candidate)) {
				return { command: process.execPath, args: [candidate, ...args] };
			}
			dir = path.dirname(dir);
		}
	} catch {
		// ignore - fall through
	}

	// Last resort: assume `ai` is on PATH
	return { command: "ai", args };
}

async function writePromptToTempFile(agentName: string, prompt: string): Promise<{ dir: string; filePath: string }> {
	const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "ai-subagent-tool-"));
	const safeName = agentName.replace(/[^\w.-]+/g, "_");
	const filePath = path.join(tmpDir, `prompt-${safeName}.md`);
	await withFileMutationQueue(filePath, async () => {
		await fs.promises.writeFile(filePath, prompt, { encoding: "utf-8", mode: 0o600 });
	});
	return { dir: tmpDir, filePath };
}

/** Extract the final textual output from a sequence of messages. */
export function extractFinalOutput(messages: SubagentMessage[]): string {
	const parts: string[] = [];
	for (const msg of messages) {
		if (msg.role !== "assistant") continue;
		const content = msg.content;
		if (typeof content === "string") {
			parts.push(content);
			continue;
		}
		if (Array.isArray(content)) {
			for (const block of content) {
				if (block && typeof block === "object" && (block as { type?: string }).type === "text") {
					const text = (block as { text?: string }).text;
					if (typeof text === "string" && text.length > 0) {
						parts.push(text);
					}
				}
			}
		}
	}
	return parts.join("\n").trim();
}

/** Get a one-line summary of what the subagent did. */
export function extractActivitySummary(messages: SubagentMessage[]): string {
	const toolsUsed = new Set<string>();
	let textBlocks = 0;
	for (const msg of messages) {
		if (msg.role === "assistant" && Array.isArray(msg.content)) {
			for (const block of msg.content) {
				if (block && typeof block === "object") {
					const b = block as { type?: string; name?: string };
					if (b.type === "text") textBlocks++;
					if (b.type === "toolCall" && typeof b.name === "string") toolsUsed.add(b.name);
				}
			}
		}
	}
	const toolList = Array.from(toolsUsed);
	const toolSummary = toolList.length > 0 ? `, used ${toolList.join(", ")}` : "";
	return `${textBlocks} text block(s)${toolSummary}`;
}

/**
 * Run a single named agent with a task. Returns the structured result.
 * Throws on spawn failure or if the agent doesn't exist.
 */
export async function runSubagent(
	agentName: string,
	task: string,
	options: SubagentRunOptions = {},
): Promise<SubagentRunResult> {
	const cwd = options.cwd ?? process.cwd();
	const scope = options.scope ?? "user";
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const startMs = Date.now();

	const discovery = discoverAgents(cwd, scope);
	const agent = discovery.agents.find((a) => a.name === agentName);

	if (!agent) {
		const available = discovery.agents.map((a) => `"${a.name}"`).join(", ") || "none";
		return {
			agent: agentName,
			agentSource: "unknown",
			task,
			exitCode: 1,
			messages: [],
			stderr: `Unknown agent: "${agentName}". Available agents: ${available}.`,
			usage: emptyUsage(),
			elapsedMs: 0,
		};
	}

	const args: string[] = ["--mode", "json", "-p", "--no-session"];
	if (agent.model) args.push("--model", agent.model);
	if (agent.tools && agent.tools.length > 0) args.push("--tools", agent.tools.join(","));

	let tmpPromptDir: string | null = null;

	const result: SubagentRunResult = {
		agent: agentName,
		agentSource: agent.source,
		task,
		exitCode: 0,
		messages: [],
		stderr: "",
		usage: emptyUsage(),
		model: agent.model,
		elapsedMs: 0,
	};

	try {
		if (agent.systemPrompt.trim()) {
			const tmp = await writePromptToTempFile(agent.name, agent.systemPrompt);
			tmpPromptDir = tmp.dir;
			args.push("--append-system-prompt", tmp.filePath);
		}

		args.push(`Task: ${task}`);

		const exitCode = await new Promise<number>((resolve) => {
			const invocation = getAiInvocation(args);
			const proc = spawn(invocation.command, invocation.args, {
				cwd,
				shell: false,
				stdio: ["ignore", "pipe", "pipe"],
				env: { ...process.env, AI_OFFLINE: process.env.AI_OFFLINE ?? "0" },
			});

			let buffer = "";

			const processLine = (line: string) => {
				if (!line.trim()) return;
				let event: { type?: string; message?: SubagentMessage };
				try {
					event = JSON.parse(line);
				} catch {
					return;
				}

				if (event.type === "message_end" && event.message) {
					result.messages.push(event.message);
					if (event.message.role === "assistant") {
						result.usage.turns++;
						const u = event.message.usage;
						if (u) {
							result.usage.input += u.input || 0;
							result.usage.output += u.output || 0;
							result.usage.cacheRead += u.cacheRead || 0;
							result.usage.cacheWrite += u.cacheWrite || 0;
							result.usage.cost += u.cost?.total || 0;
							if (typeof u.totalTokens === "number") result.usage.contextTokens = u.totalTokens;
						}
						if (!result.model && event.message.model) result.model = event.message.model;
						if (event.message.stopReason) result.stopReason = event.message.stopReason;
						if (event.message.errorMessage) result.errorMessage = event.message.errorMessage;
					}
				} else if (event.type === "tool_result_end" && event.message) {
					result.messages.push(event.message);
				}
			};

			proc.stdout?.on("data", (data: Buffer) => {
				buffer += data.toString();
				const lines = buffer.split("\n");
				buffer = lines.pop() ?? "";
				for (const line of lines) processLine(line);
			});

			proc.stderr?.on("data", (data: Buffer) => {
				result.stderr += data.toString();
			});

			proc.on("close", (code) => {
				if (buffer.trim()) processLine(buffer);
				resolve(code ?? 0);
			});

			proc.on("error", () => {
				resolve(1);
			});

			// Timeout
			const timeoutHandle = setTimeout(() => {
				proc.kill("SIGTERM");
				setTimeout(() => {
					if (!proc.killed) proc.kill("SIGKILL");
				}, 5000);
			}, timeoutMs);
			proc.on("close", () => clearTimeout(timeoutHandle));

			// External abort
			if (options.signal) {
				const onAbort = () => {
					proc.kill("SIGTERM");
					setTimeout(() => {
						if (!proc.killed) proc.kill("SIGKILL");
					}, 5000);
				};
				if (options.signal.aborted) onAbort();
				else options.signal.addEventListener("abort", onAbort, { once: true });
			}
		});

		result.exitCode = exitCode;
	} finally {
		// Best-effort cleanup of temp dir
		if (tmpPromptDir) {
			try {
				await fs.promises.rm(tmpPromptDir, { recursive: true, force: true });
			} catch {
				// ignore
			}
		}
	}

	result.elapsedMs = Date.now() - startMs;
	return result;
}

function emptyUsage(): SubagentRunResult["usage"] {
	return {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		cost: 0,
		contextTokens: 0,
		turns: 0,
	};
}

/** Re-export the AgentConfig type for callers. */
export type { AgentConfig } from "./agents.ts";
