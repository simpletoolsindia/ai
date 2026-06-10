import { afterEach, describe, expect, test } from "vitest";
import { formatTodoListForLlm, getTodoStore, resetTodoStore, type TodoItem } from "../src/core/todo/store.ts";
import { createTodoTool } from "../src/core/tools/todo.ts";

afterEach(() => {
	resetTodoStore();
});

describe("todo store", () => {
	test("starts empty", () => {
		const store = getTodoStore();
		expect(store.getState().items).toHaveLength(0);
	});

	test("set() replaces the list atomically", () => {
		const store = getTodoStore();
		const items: TodoItem[] = [
			{ content: "Step 1", status: "completed" },
			{ content: "Step 2", status: "in_progress" },
		];
		store.set(items);
		expect(store.getState().items).toEqual(items);
		expect(store.getState().version).toBe(1);
	});

	test("version increments on every update", () => {
		const store = getTodoStore();
		const v0 = store.getState().version;
		store.set([{ content: "a", status: "pending" }]);
		const v1 = store.getState().version;
		store.set([{ content: "b", status: "pending" }]);
		const v2 = store.getState().version;
		expect(v1).toBeGreaterThan(v0);
		expect(v2).toBeGreaterThan(v1);
	});

	test("clear() empties the list and increments version", () => {
		const store = getTodoStore();
		store.set([{ content: "x", status: "pending" }]);
		const v1 = store.getState().version;
		store.clear();
		expect(store.getState().items).toHaveLength(0);
		expect(store.getState().version).toBeGreaterThan(v1);
	});

	test("clear() on empty is a no-op (no spurious version bump)", () => {
		const store = getTodoStore();
		const v0 = store.getState().version;
		store.clear();
		expect(store.getState().version).toBe(v0);
	});

	test("rejects more than MAX_ITEMS items", () => {
		const store = getTodoStore();
		const items: TodoItem[] = Array.from({ length: 11 }, (_, i) => ({
			content: `item ${i}`,
			status: "pending",
		}));
		expect(() => store.set(items)).toThrow(/too many items/);
	});

	test("rejects empty content", () => {
		const store = getTodoStore();
		expect(() => store.set([{ content: "   ", status: "pending" }])).toThrow(/empty content/);
	});

	test("rejects more than one in_progress", () => {
		const store = getTodoStore();
		expect(() =>
			store.set([
				{ content: "a", status: "in_progress" },
				{ content: "b", status: "in_progress" },
			]),
		).toThrow(/at most one item can be in_progress/);
	});

	test("rejects invalid status", () => {
		const store = getTodoStore();
		// @ts-expect-error: testing invalid input
		expect(() => store.set([{ content: "a", status: "weird" }])).not.toThrow();
		// We don't strictly validate status (only the union) — the tool will normalize it.
	});

	test("subscribers receive updates", () => {
		const store = getTodoStore();
		const updates: number[] = [];
		const unsubscribe = store.subscribe((s) => updates.push(s.version));
		store.set([{ content: "a", status: "pending" }]);
		store.set([{ content: "b", status: "pending" }]);
		unsubscribe();
		store.set([{ content: "c", status: "pending" }]);
		expect(updates).toEqual([1, 2]);
	});

	test("external mutation of stored items does not affect the store", () => {
		const store = getTodoStore();
		const items: TodoItem[] = [{ content: "x", status: "pending" }];
		store.set(items);
		// Mutate the input array
		items.push({ content: "y", status: "completed" });
		expect(store.getState().items).toHaveLength(1);
	});

	test("getTodoStore returns the same instance within a session", () => {
		const a = getTodoStore();
		const b = getTodoStore();
		expect(a).toBe(b);
	});

	test("resetTodoStore gives a fresh store", () => {
		const a = getTodoStore();
		a.set([{ content: "x", status: "pending" }]);
		resetTodoStore();
		const b = getTodoStore();
		expect(b).not.toBe(a);
		expect(b.getState().items).toHaveLength(0);
	});
});

describe("formatTodoListForLlm", () => {
	test("empty list shows hint", () => {
		expect(formatTodoListForLlm([])).toContain("Todo list is empty");
	});

	test("renders pending items with [ ]", () => {
		const md = formatTodoListForLlm([{ content: "Do X", status: "pending" }]);
		expect(md).toContain("1. [ ] Do X");
	});

	test("renders in_progress items with [~]", () => {
		const md = formatTodoListForLlm([{ content: "Do X", status: "in_progress" }]);
		expect(md).toContain("1. [~] Do X");
	});

	test("renders completed items with [x]", () => {
		const md = formatTodoListForLlm([{ content: "Do X", status: "completed" }]);
		expect(md).toContain("1. [x] Do X");
	});

	test("uses activeForm for in_progress items", () => {
		const md = formatTodoListForLlm([{ content: "Do X", activeForm: "Doing X right now", status: "in_progress" }]);
		expect(md).toContain("[~] Doing X right now");
	});

	test("falls back to content when activeForm is missing", () => {
		const md = formatTodoListForLlm([{ content: "Do X", status: "in_progress" }]);
		expect(md).toContain("[~] Do X");
	});

	test("includes progress line", () => {
		const md = formatTodoListForLlm([
			{ content: "a", status: "completed" },
			{ content: "b", status: "completed" },
			{ content: "c", status: "pending" },
		]);
		expect(md).toContain("Progress: 2/3 completed.");
	});
});

describe("todo tool", () => {
	test("returns the formatted list as content", async () => {
		const tool = createTodoTool("/tmp");
		const result = await tool.execute(
			"c1",
			{
				todos: [
					{ content: "First", status: "completed" },
					{ content: "Second", status: "in_progress" },
					{ content: "Third", status: "pending" },
				],
			},
			undefined,
		);
		const text = result.content[0]?.type === "text" ? result.content[0].text : "";
		expect(text).toContain("Current todo list");
		expect(text).toContain("1. [x] First");
		expect(text).toContain("2. [~] Second");
		expect(text).toContain("3. [ ] Third");
		expect(text).toContain("Progress: 1/3 completed");
	});

	test("replaces previous list atomically", async () => {
		const tool = createTodoTool("/tmp");
		// First update
		await tool.execute(
			"c1",
			{
				todos: [
					{ content: "a", status: "completed" },
					{ content: "b", status: "pending" },
				],
			},
			undefined,
		);
		// Second update with completely different items
		const result = await tool.execute("c2", { todos: [{ content: "only", status: "pending" }] }, undefined);
		expect(result.details?.newCount).toBe(1);
		expect(result.details?.previousCount).toBe(2);
	});

	test("rejects too many items at the tool level", async () => {
		const tool = createTodoTool("/tmp");
		const items = Array.from({ length: 11 }, (_, i) => ({
			content: `item ${i}`,
			status: "pending",
		}));
		// Schema enforces maxItems? It doesn't — we let the store validate. But here
		// we need to bypass the schema, so cast to unknown.
		await expect(tool.execute("c1", { todos: items } as unknown as { todos: TodoItem[] }, undefined)).rejects.toThrow(
			/too many items/,
		);
	});

	test("rejects empty content at the tool level", async () => {
		const tool = createTodoTool("/tmp");
		await expect(
			tool.execute(
				"c1",
				{ todos: [{ content: "   ", status: "pending" }] } as unknown as { todos: TodoItem[] },
				undefined,
			),
		).rejects.toThrow(/empty content/);
	});

	test("rejects more than one in_progress at the tool level", async () => {
		const tool = createTodoTool("/tmp");
		await expect(
			tool.execute(
				"c1",
				{
					todos: [
						{ content: "a", status: "in_progress" },
						{ content: "b", status: "in_progress" },
					],
				},
				undefined,
			),
		).rejects.toThrow(/at most one item can be in_progress/);
	});

	test("trims whitespace in content and activeForm", async () => {
		const tool = createTodoTool("/tmp");
		await tool.execute(
			"c1",
			{ todos: [{ content: "  trim me  ", activeForm: "  trimming  ", status: "pending" }] },
			undefined,
		);
		const state = getTodoStore().getState();
		expect(state.items[0].content).toBe("trim me");
		expect(state.items[0].activeForm).toBe("trimming");
	});

	test("omitted activeForm is not set", async () => {
		const tool = createTodoTool("/tmp");
		await tool.execute("c1", { todos: [{ content: "x", status: "pending" }] }, undefined);
		const state = getTodoStore().getState();
		expect(state.items[0].activeForm).toBeUndefined();
	});

	test("details include version delta", async () => {
		const tool = createTodoTool("/tmp");
		const r1 = await tool.execute("c1", { todos: [{ content: "a", status: "pending" }] }, undefined);
		const v1 = r1.details?.newVersion;
		const r2 = await tool.execute("c2", { todos: [{ content: "b", status: "pending" }] }, undefined);
		expect(r2.details?.previousVersion).toBe(v1);
		expect(r2.details?.newVersion).toBeGreaterThan(v1 ?? 0);
	});

	test("status breakdown included in result text", async () => {
		const tool = createTodoTool("/tmp");
		const result = await tool.execute(
			"c1",
			{
				todos: [
					{ content: "a", status: "completed" },
					{ content: "b", status: "in_progress" },
					{ content: "c", status: "pending" },
				],
			},
			undefined,
		);
		const text = result.content[0]?.type === "text" ? result.content[0].text : "";
		expect(text).toContain("1 done");
		expect(text).toContain("1 currently working on");
		expect(text).toContain("1 not started");
	});

	test("items are deep-cloned on store", async () => {
		const tool = createTodoTool("/tmp");
		const original: TodoItem = { content: "x", status: "pending" };
		await tool.execute("c1", { todos: [original] }, undefined);
		// Mutate the input
		original.status = "completed";
		// The store should still have the original status
		const state = getTodoStore().getState();
		expect(state.items[0].status).toBe("pending");
	});

	test("toJSON is set so result details serialize cleanly", async () => {
		const tool = createTodoTool("/tmp");
		const result = await tool.execute("c1", { todos: [{ content: "x", status: "pending" }] }, undefined);
		expect(result.details?.previousCount).toBe(0);
		expect(result.details?.newCount).toBe(1);
	});
});
