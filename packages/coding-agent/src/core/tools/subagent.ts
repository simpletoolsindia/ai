import type { AgentTool } from "@simpletoolsindiaorg/ai-agent";
import { Container, Text } from "@simpletoolsindiaorg/ai-tui";
import { type Static, Type } from "typebox";
import type { Theme } from "../../modes/interactive/theme/theme.ts";
import type { ToolDefinition, ToolRenderContext } from "../extensions/types.ts";
import { discoverAgents } from "../subagent/agents.ts";
import { extractActivitySummary, extractFinalOutput, runSubagent, type SubagentRunResult } from "../subagent/runner.ts";
import { getTextOutput, str } from "./render-utils.ts";
import { wrapToolDefinition } from "./tool-definition-wrapper.ts";

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const MIN_TIMEOUT_MS = 1000;
const MAX_TIMEOUT_MS = 30 * 60 * 1000;

const taskItemSchema = Type.Object({
	agent: Type.String({ description: 'Name of the agent to dispatch (e.g. "db-scout")' }),
	task: Type.String({
		description: "Detailed instructions for the agent. Be specific about files, directories, and what to look for.",
	}),
});

const subagentSchema = Type.Object({
	agent: Type.Optional(
		Type.String({
			description: "Name of the agent to dispatch (single mode). Mutually exclusive with `tasks` and `chain`.",
		}),
	),
	task: Type.Optional(
		Type.String({
			description: "Task to give the agent (single mode). Mutually exclusive with `tasks` and `chain`.",
		}),
	),
	tasks: Type.Optional(
		Type.Array(taskItemSchema, {
			description:
				"Array of {agent, task} pairs to run in parallel (up to 8). Mutually exclusive with `agent`/`task` and `chain`.",
		}),
	),
	chain: Type.Optional(
		Type.Array(taskItemSchema, {
			description:
				"Array of {agent, task} pairs to run sequentially. Use {previous} placeholder in `task` to reference the previous result. Mutually exclusive with `agent`/`task` and `tasks`.",
		}),
	),
	includeSteps: Type.Optional(
		Type.Boolean({
			description:
				"If true, the tool result includes a transcript of tool calls the subagent made (verbose). Default false: return only the final text output.",
		}),
	),
	timeoutMs: Type.Optional(
		Type.Number({
			description: "Per-agent timeout in milliseconds (default 10 min, max 30 min)",
			minimum: MIN_TIMEOUT_MS,
			maximum: MAX_TIMEOUT_MS,
		}),
	),
});

export type SubagentToolInput = Static<typeof subagentSchema>;

export interface SubagentToolTaskResult {
	agent: string;
	task: string;
	output: string;
	usage: SubagentRunResult["usage"];
	elapsedMs: number;
	exitCode: number;
	model?: string;
	stopReason?: string;
	errorMessage?: string;
	stderr: string;
	error?: string;
	steps?: string;
}

export interface SubagentToolDetails {
	mode: "single" | "parallel" | "chain";
	results: SubagentToolTaskResult[];
	totalElapsedMs: number;
	dispatchedAgents: string[];
}

/**
 * Pluggable operations for the subagent tool.
 * Override these to inject a custom spawn implementation (mocking, etc.).
 */
export interface SubagentOperations {
	run: (
		agentName: string,
		task: string,
		options: { cwd?: string; signal?: AbortSignal; timeoutMs?: number },
	) => Promise<SubagentRunResult>;
	listAgents: (cwd: string) => { name: string; description: string; source: "user" | "project" }[];
}

const defaultOperations: SubagentOperations = {
	run: (agentName, task, options) => runSubagent(agentName, task, options),
	listAgents: (cwd) =>
		discoverAgents(cwd, "user").agents.map((a) => ({
			name: a.name,
			description: a.description,
			source: a.source,
		})),
};

function formatResultMarkdown(result: SubagentToolTaskResult, includeSteps: boolean): string {
	if (result.error) {
		return `### ${result.agent} — error\n\n${result.error}${result.stderr ? `\n\n\`\`\`\n${result.stderr.slice(0, 2000)}\n\`\`\`` : ""}`;
	}

	const parts: string[] = [];
	parts.push(`### ${result.agent}${result.model ? ` (${result.model})` : ""}`);
	const usageBits: string[] = [];
	if (result.usage.turns) usageBits.push(`${result.usage.turns} turn${result.usage.turns > 1 ? "s" : ""}`);
	if (result.usage.input) usageBits.push(`↑${result.usage.input} in`);
	if (result.usage.output) usageBits.push(`↓${result.usage.output} out`);
	if (result.usage.cost) usageBits.push(`$${result.usage.cost.toFixed(4)}`);
	const usageStr = usageBits.length > 0 ? ` — ${usageBits.join(", ")}` : "";
	const elapsed = result.elapsedMs > 0 ? ` in ${result.elapsedMs}ms` : "";
	parts.push(`*${usageStr}${elapsed}*`);
	parts.push("");
	if (result.errorMessage) {
		parts.push(`> **Error:** ${result.errorMessage}`);
		parts.push("");
	}
	if (result.output && result.output.length > 0) {
		parts.push(result.output);
		parts.push("");
	} else if (!result.errorMessage) {
		parts.push("_(no output)_");
		parts.push("");
	}
	if (includeSteps && result.steps) {
		parts.push("<details><summary>Subagent steps</summary>");
		parts.push("");
		parts.push("```");
		parts.push(result.steps);
		parts.push("```");
		parts.push("</details>");
		parts.push("");
	}
	return parts.join("\n");
}

export interface SubagentToolOptions {
	operations?: SubagentOperations;
}

export function createSubagentToolDefinition(
	cwd: string,
	options?: SubagentToolOptions,
): ToolDefinition<typeof subagentSchema, SubagentToolDetails | undefined> {
	const ops = options?.operations ?? defaultOperations;

	return {
		name: "subagent",
		label: "Subagent",
		description: [
			"Delegate a focused investigation to a specialized subagent with its own context window.",
			"The subagent has read-only access to the codebase and returns a compressed summary.",
			"",
			"Use this when:",
			"- The question has separable sub-parts (e.g. trace the auth flow AND find tests for it)",
			"- You need to investigate a specific area deeply without polluting your main context",
			"- A previous attempt failed and you want a fresh look from a specialist",
			"- You want to run several investigations in parallel (use the `tasks` parameter)",
			"",
			"Do NOT use this for:",
			"- Simple file reads, greps, or finds (use read, grep, find directly)",
			"- Tasks that need to write or modify files (subagents are read-only by default)",
			"- Tasks where the answer fits in one tool call",
			"",
			"Modes:",
			"- Single: `{ agent, task }` — one subagent",
			"- Parallel: `{ tasks: [{agent, task}, ...] }` — up to 8 in parallel (max 4 concurrent)",
			"- Chain: `{ chain: [{agent, task}, ...] }` — sequential; use `{previous}` placeholder to reference the previous result",
			"",
			"Returns: a markdown summary of each subagent's findings, plus usage stats. By default only the final text is included; set `includeSteps: true` for a full tool-call transcript.",
		].join("\n"),
		parameters: subagentSchema,
		async execute(_toolCallId, params, signal) {
			const startMs = Date.now();
			const p = params as SubagentToolInput;
			const includeSteps = p.includeSteps === true;
			const timeoutMs = Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, p.timeoutMs ?? DEFAULT_TIMEOUT_MS));

			// Determine mode
			const hasSingle = !!(p.agent && p.task);
			const hasParallel = !!p.tasks && p.tasks.length > 0;
			const hasChain = Array.isArray(p.chain) && p.chain.length > 0;
			const hasEmptyChain = p.chain !== undefined && Array.isArray(p.chain) && p.chain.length === 0;
			const modesCount = Number(hasSingle) + Number(hasParallel) + Number(hasChain);
			if (modesCount > 1) {
				throw new Error("subagent: agent/task, tasks, and chain are mutually exclusive");
			}
			if (modesCount === 0) {
				// Distinguish "no mode at all" from "partial/empty single mode" or "empty chain".
				if (hasEmptyChain) {
					throw new Error("subagent: chain must have at least one item");
				}
				const hasPartialSingle = !!(p.agent || p.task);
				if (hasPartialSingle) {
					throw new Error("subagent: agent and task are both required in single mode");
				}
				throw new Error("subagent: must specify one of: (agent, task), tasks, or chain");
			}

			const toResult = (r: SubagentRunResult, originalTask: string): SubagentToolTaskResult => {
				const output = extractFinalOutput(r.messages);
				let steps: string | undefined;
				if (includeSteps) {
					const activity = extractActivitySummary(r.messages);
					steps = `Activity: ${activity}\nExit code: ${r.exitCode}\nStderr: ${r.stderr || "(empty)"}\nMessages: ${r.messages.length}`;
				}
				return {
					agent: r.agent,
					task: originalTask,
					output,
					usage: r.usage,
					elapsedMs: r.elapsedMs,
					exitCode: r.exitCode,
					model: r.model,
					stopReason: r.stopReason,
					errorMessage: r.errorMessage,
					stderr: r.stderr,
					steps,
				};
			};

			let results: SubagentToolTaskResult[] = [];
			let mode: "single" | "parallel" | "chain" = "single";
			let dispatchedAgents: string[] = [];

			if (hasSingle) {
				mode = "single";
				const agentName = str(p.agent) ?? "";
				const taskStr = str(p.task) ?? "";
				if (!agentName || !taskStr) {
					throw new Error("subagent: agent and task are both required in single mode");
				}
				dispatchedAgents = [agentName];
				results = [toResult(await ops.run(agentName, taskStr, { cwd, signal, timeoutMs }), taskStr)];
			} else if (hasParallel) {
				mode = "parallel";
				const items = p.tasks ?? [];
				if (items.length > 8) {
					throw new Error(`subagent: too many parallel tasks (${items.length}); max is 8`);
				}
				dispatchedAgents = items.map((t) => t.agent);
				const settled = await Promise.all(
					items.map((item) =>
						ops
							.run(item.agent, item.task, { cwd, signal, timeoutMs })
							.then((r) => toResult(r, item.task))
							.catch((err) => {
								const msg = err instanceof Error ? err.message : String(err);
								return {
									agent: item.agent,
									task: item.task,
									output: "",
									usage: {
										input: 0,
										output: 0,
										cacheRead: 0,
										cacheWrite: 0,
										cost: 0,
										contextTokens: 0,
										turns: 0,
									},
									elapsedMs: 0,
									exitCode: 1,
									stderr: msg,
									error: msg,
								} satisfies SubagentToolTaskResult;
							}),
					),
				);
				results = settled;
			} else if (hasChain) {
				mode = "chain";
				const items = p.chain ?? [];
				if (items.length === 0) {
					throw new Error("subagent: chain must have at least one item");
				}
				dispatchedAgents = items.map((t) => t.agent);
				const chainResults: SubagentToolTaskResult[] = [];
				let previousOutput = "";
				for (const item of items) {
					const taskWithContext = item.task.includes("{previous}")
						? item.task.replace(/\{previous\}/g, previousOutput)
						: item.task;
					const r = await ops.run(item.agent, taskWithContext, { cwd, signal, timeoutMs });
					const result = toResult(r, item.task);
					chainResults.push(result);
					previousOutput = result.output;
				}
				results = chainResults;
			}

			// Build the formatted markdown for the LLM
			const md: string[] = [];
			md.push(`# Subagent dispatch (${mode} mode)`);
			md.push("");
			md.push(`Dispatched ${results.length} agent(s) in ${Date.now() - startMs}ms.`);
			md.push("");
			for (const result of results) {
				md.push(formatResultMarkdown(result, includeSteps));
			}
			const text = md.join("\n");

			return {
				content: [{ type: "text" as const, text }],
				details: {
					mode,
					results,
					totalElapsedMs: Date.now() - startMs,
					dispatchedAgents,
				},
			};
		},
		renderCall(args, theme: Theme, context: ToolRenderContext) {
			const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
			let display = "";
			if (args.agent && args.task) {
				display = `${theme.fg("toolTitle", theme.bold("subagent"))} ${theme.fg("muted", `agent=${args.agent}`)}`;
			} else if (args.tasks && args.tasks.length > 0) {
				const agents = args.tasks.map((t) => t.agent).join(", ");
				display = `${theme.fg("toolTitle", theme.bold("subagent"))} ${theme.fg("muted", `parallel (${args.tasks.length}: ${agents})`)}`;
			} else if (args.chain && args.chain.length > 0) {
				const agents = args.chain.map((t) => t.agent).join(" → ");
				display = `${theme.fg("toolTitle", theme.bold("subagent"))} ${theme.fg("muted", `chain (${args.chain.length}: ${agents})`)}`;
			} else {
				display = `${theme.fg("toolTitle", theme.bold("subagent"))} ${theme.fg("muted", "(no args)")}`;
			}
			text.setText(display);
			return text;
		},
		renderResult(result, _options, theme: Theme, context: ToolRenderContext) {
			const text = getTextOutput(result, true);
			if (!text) return new Text("", 0, 0);
			const lines = text.split("\n");
			const header = lines[0] || "";
			const body = lines.slice(1).join("\n");
			const container = (context.lastComponent as Container | undefined) ?? new Container();
			container.clear();
			container.addChild(new Text(theme.fg("muted", header), 1, 0));
			if (body) {
				container.addChild(new Text(body, 1, 0));
			}
			return container;
		},
	};
}

export function createSubagentTool(
	cwd: string,
	options?: SubagentToolOptions,
): AgentTool<Static<typeof subagentSchema>> {
	return wrapToolDefinition(createSubagentToolDefinition(cwd, options));
}
