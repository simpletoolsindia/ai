import { describe, expect, test } from "vitest";
import type { SubagentRunResult } from "../src/core/subagent/runner.ts";
import type { SubagentOperations, SubagentToolInput } from "../src/core/tools/subagent.ts";
import { createSubagentTool } from "../src/core/tools/subagent.ts";

function makeResult(overrides: Partial<SubagentRunResult> = {}): SubagentRunResult {
	return {
		agent: "test-agent",
		agentSource: "user",
		task: "test task",
		exitCode: 0,
		messages: [
			{
				role: "assistant",
				content: [
					{ type: "text", text: "Here are my findings." },
					{ type: "toolCall", name: "grep", arguments: { pattern: "foo" } },
				],
				usage: { input: 100, output: 50, cacheRead: 0, cacheWrite: 0, cost: { total: 0.001 } },
				model: "claude-3-5-sonnet",
				stopReason: "end_turn",
				timestamp: Date.now(),
			},
		],
		stderr: "",
		usage: { input: 100, output: 50, cacheRead: 0, cacheWrite: 0, cost: 0.001, contextTokens: 150, turns: 1 },
		model: "claude-3-5-sonnet",
		stopReason: "end_turn",
		elapsedMs: 1234,
		...overrides,
	};
}

function makeOps(overrides: Partial<SubagentOperations> = {}): SubagentOperations {
	return {
		run: async (agentName, task) => makeResult({ agent: agentName, task }),
		listAgents: () => [
			{ name: "test-agent", description: "Test agent", source: "user" },
			{ name: "another-agent", description: "Another", source: "user" },
		],
		...overrides,
	};
}

describe("subagent tool — single mode", () => {
	test("returns formatted markdown for successful run", async () => {
		const tool = createSubagentTool("/tmp", { operations: makeOps() });
		const result = await tool.execute("call1", { agent: "test-agent", task: "find auth code" }, undefined);
		const text = result.content[0]?.type === "text" ? result.content[0].text : "";
		expect(text).toContain("# Subagent dispatch (single mode)");
		expect(text).toContain("### test-agent");
		expect(text).toContain("claude-3-5-sonnet");
		expect(text).toContain("Here are my findings.");
		expect(text).toContain("1 turn");
		expect(text).toContain("↑100 in");
		expect(text).toContain("↓50 out");
		expect(result.details?.mode).toBe("single");
		expect(result.details?.results).toHaveLength(1);
	});

	test("shows error when agent does not exist", async () => {
		const tool = createSubagentTool("/tmp", {
			operations: makeOps({
				run: async () =>
					makeResult({
						agent: "missing",
						exitCode: 1,
						stderr: 'Unknown agent: "missing". Available: foo, bar.',
					}),
			}),
		});
		const result = await tool.execute("call1", { agent: "missing", task: "x" }, undefined);
		const resultItem = result.details?.results[0];
		expect(resultItem?.exitCode).toBe(1);
		expect(resultItem?.stderr).toContain("Unknown agent");
	});

	test("respects includeSteps flag", async () => {
		const tool = createSubagentTool("/tmp", {
			operations: makeOps({
				run: async () => makeResult(),
			}),
		});
		// Without includeSteps
		const r1 = await tool.execute("c1", { agent: "test-agent", task: "x" }, undefined);
		const t1 = r1.content[0]?.type === "text" ? r1.content[0].text : "";
		expect(t1).not.toContain("Subagent steps");

		// With includeSteps
		const r2 = await tool.execute("c2", { agent: "test-agent", task: "x", includeSteps: true }, undefined);
		const t2 = r2.content[0]?.type === "text" ? r2.content[0].text : "";
		expect(t2).toContain("Subagent steps");
		expect(t2).toContain("Activity:");
	});

	test("includes errorMessage in output when present", async () => {
		const tool = createSubagentTool("/tmp", {
			operations: makeOps({
				run: async () =>
					makeResult({
						messages: [
							{
								role: "assistant",
								content: [{ type: "text", text: "I cannot proceed" }],
								model: "claude-3-5-sonnet",
								usage: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, cost: { total: 0 } },
								stopReason: "error",
								errorMessage: "Rate limit exceeded",
								timestamp: Date.now(),
							},
						],
						stopReason: "error",
						errorMessage: "Rate limit exceeded",
					}),
			}),
		});
		const result = await tool.execute("c1", { agent: "test-agent", task: "x" }, undefined);
		const text = result.content[0]?.type === "text" ? result.content[0].text : "";
		expect(text).toContain("**Error:** Rate limit exceeded");
	});
});

describe("subagent tool — validation", () => {
	test("throws when no mode is specified", async () => {
		const tool = createSubagentTool("/tmp", { operations: makeOps() });
		await expect(tool.execute("c1", {}, undefined)).rejects.toThrow(/must specify one of/);
	});

	test("throws when multiple modes are specified", async () => {
		const tool = createSubagentTool("/tmp", { operations: makeOps() });
		await expect(
			tool.execute(
				"c1",
				{
					agent: "a",
					task: "x",
					tasks: [{ agent: "b", task: "y" }],
				},
				undefined,
			),
		).rejects.toThrow(/mutually exclusive/);
	});

	test("throws when single mode missing agent or task", async () => {
		const tool = createSubagentTool("/tmp", { operations: makeOps() });
		// Bypass schema validation by passing partial inputs through type cast
		await expect(tool.execute("c1", { agent: "a" } as unknown as SubagentToolInput, undefined)).rejects.toThrow(
			/agent and task/,
		);
		await expect(tool.execute("c1", { task: "x" } as unknown as SubagentToolInput, undefined)).rejects.toThrow(
			/agent and task/,
		);
	});

	test("throws when parallel exceeds 8 tasks", async () => {
		const tool = createSubagentTool("/tmp", { operations: makeOps() });
		const tasks = Array.from({ length: 9 }, (_, i) => ({ agent: "a", task: `t${i}` }));
		await expect(tool.execute("c1", { tasks }, undefined)).rejects.toThrow(/too many parallel/);
	});

	test("throws when chain is empty", async () => {
		const tool = createSubagentTool("/tmp", { operations: makeOps() });
		// Bypass schema minLength:1 to actually reach our runtime check
		await expect(tool.execute("c1", { chain: [] } as unknown as SubagentToolInput, undefined)).rejects.toThrow(
			/chain must have/,
		);
	});
});

describe("subagent tool — parallel mode", () => {
	test("runs all tasks in parallel and reports each result", async () => {
		const ops = makeOps({
			run: async (agentName, task) => {
				const output = `Output for ${agentName}:${task}`;
				return makeResult({
					agent: agentName,
					task,
					messages: [
						{
							role: "assistant",
							content: [{ type: "text", text: output }],
							timestamp: Date.now(),
						},
					],
				});
			},
		});
		const tool = createSubagentTool("/tmp", { operations: ops });
		const result = await tool.execute(
			"c1",
			{
				tasks: [
					{ agent: "db-scout", task: "find queries" },
					{ agent: "backend-scout", task: "find handlers" },
				],
			},
			undefined,
		);
		expect(result.details?.mode).toBe("parallel");
		expect(result.details?.results).toHaveLength(2);
		const text = result.content[0]?.type === "text" ? result.content[0].text : "";
		expect(text).toContain("# Subagent dispatch (parallel mode)");
		expect(text).toContain("Dispatched 2 agent(s)");
		expect(text).toContain("db-scout");
		expect(text).toContain("backend-scout");
		expect(text).toContain("Output for db-scout:find queries");
		expect(text).toContain("Output for backend-scout:find handlers");
	});

	test("continues even if one subagent errors", async () => {
		const ops = makeOps({
			run: async (agentName, task) => {
				if (agentName === "broken") {
					return makeResult({
						agent: agentName,
						task,
						exitCode: 1,
						errorMessage: "Spawn failed",
						messages: [],
					});
				}
				return makeResult({
					agent: agentName,
					task,
					messages: [
						{
							role: "assistant",
							content: [{ type: "text", text: `Good output for ${agentName}` }],
							timestamp: Date.now(),
						},
					],
				});
			},
		});
		const tool = createSubagentTool("/tmp", { operations: ops });
		const result = await tool.execute(
			"c1",
			{
				tasks: [
					{ agent: "good", task: "x" },
					{ agent: "broken", task: "y" },
				],
			},
			undefined,
		);
		expect(result.details?.results).toHaveLength(2);
		const broken = result.details?.results.find((r: { agent: string }) => r.agent === "broken");
		const good = result.details?.results.find((r: { agent: string }) => r.agent === "good");
		expect(broken?.errorMessage).toBe("Spawn failed");
		expect(good?.output).toContain("Good output for good");
	});

	test("captures thrown errors as a per-task error", async () => {
		const ops = makeOps({
			run: async (agentName) => {
				if (agentName === "throws") {
					throw new Error("network error");
				}
				return makeResult({ agent: agentName });
			},
		});
		const tool = createSubagentTool("/tmp", { operations: ops });
		const result = await tool.execute("c1", { tasks: [{ agent: "throws", task: "x" }] }, undefined);
		expect(result.details?.results[0].error).toBe("network error");
		expect(result.details?.results[0].exitCode).toBe(1);
	});
});

describe("subagent tool — chain mode", () => {
	test("runs sequentially, passing previous output to next task", async () => {
		const calls: Array<{ agent: string; task: string }> = [];
		const ops = makeOps({
			run: async (agentName, task) => {
				calls.push({ agent: agentName, task });
				return makeResult({
					agent: agentName,
					task,
					messages: [
						{
							role: "assistant",
							content: [{ type: "text", text: `result of ${agentName}` }],
							timestamp: Date.now(),
						},
					],
				});
			},
		});
		const tool = createSubagentTool("/tmp", { operations: ops });
		const result = await tool.execute(
			"c1",
			{
				chain: [
					{ agent: "first", task: "do step 1" },
					{ agent: "second", task: "use {previous} to do step 2" },
					{ agent: "third", task: "no placeholder here" },
				],
			},
			undefined,
		);
		expect(result.details?.mode).toBe("chain");
		expect(calls).toEqual([
			{ agent: "first", task: "do step 1" },
			{ agent: "second", task: "use result of first to do step 2" },
			{ agent: "third", task: "no placeholder here" },
		]);
		expect(result.details?.results).toHaveLength(3);
	});

	test("empty previous output is left as empty in placeholder substitution", async () => {
		const calls: string[] = [];
		const ops = makeOps({
			run: async (_agent, task) => {
				calls.push(task);
				return makeResult({
					messages: [{ role: "assistant", content: "", timestamp: Date.now() }],
				});
			},
		});
		const tool = createSubagentTool("/tmp", { operations: ops });
		await tool.execute(
			"c1",
			{
				chain: [
					{ agent: "x", task: "start" },
					{ agent: "y", task: "use {previous}" },
				],
			},
			undefined,
		);
		expect(calls[1]).toBe("use ");
	});
});

describe("subagent tool — result formatting", () => {
	test("formatResultMarkdown handles no-output case", async () => {
		const tool = createSubagentTool("/tmp", {
			operations: makeOps({
				run: async () => makeResult({ messages: [{ role: "assistant", content: "", timestamp: Date.now() }] }),
			}),
		});
		const result = await tool.execute("c1", { agent: "test-agent", task: "x" }, undefined);
		const text = result.content[0]?.type === "text" ? result.content[0].text : "";
		expect(text).toContain("_(no output)_");
	});

	test("formatResultMarkdown handles string content", async () => {
		const tool = createSubagentTool("/tmp", {
			operations: makeOps({
				run: async () =>
					makeResult({
						messages: [
							{
								role: "assistant",
								content: "Plain string content",
								timestamp: Date.now(),
							},
						],
					}),
			}),
		});
		const result = await tool.execute("c1", { agent: "test-agent", task: "x" }, undefined);
		const text = result.content[0]?.type === "text" ? result.content[0].text : "";
		expect(text).toContain("Plain string content");
	});

	test("usage stats include cost and token counts", async () => {
		const tool = createSubagentTool("/tmp", {
			operations: makeOps({
				run: async () => makeResult(),
			}),
		});
		const result = await tool.execute("c1", { agent: "test-agent", task: "x" }, undefined);
		const text = result.content[0]?.type === "text" ? result.content[0].text : "";
		expect(text).toMatch(/↑100 in/);
		expect(text).toMatch(/↓50 out/);
		expect(text).toMatch(/\$0\.0010/);
	});
});
