import type { AgentTool } from "@simpletoolsindiaorg/ai-agent";
import { Text } from "@simpletoolsindiaorg/ai-tui";
import { type Static, Type } from "typebox";
import type { Theme } from "../../modes/interactive/theme/theme.ts";
import type { ToolDefinition, ToolRenderContext } from "../extensions/types.ts";
import { formatTodoListForLlm, getTodoStore, type TodoItem, type TodoStatus } from "../todo/store.ts";
import { getTextOutput } from "./render-utils.ts";
import { wrapToolDefinition } from "./tool-definition-wrapper.ts";

const todoItemSchema = Type.Object({
	content: Type.String({
		description: 'Imperative form of the next action. Example: "Investigate the auth flow".',
		minLength: 1,
	}),
	activeForm: Type.Optional(
		Type.String({
			description:
				'Present-continuous form shown when the item is in_progress. Example: "Investigating the auth flow". If omitted, the content is used as-is.',
		}),
	),
	status: Type.Union([Type.Literal("pending"), Type.Literal("in_progress"), Type.Literal("completed")], {
		description:
			"Status of this todo item. Transitions: pending → in_progress → completed. Never go backwards (completed → in_progress). At most one item in_progress at a time.",
	}),
});

const todoSchema = Type.Object({
	todos: Type.Optional(
		Type.Array(todoItemSchema, {
			description:
				"Complete replacement of the todo list. Always pass the FULL list, not just the changed items. The LLM is the source of truth; the user only observes.",
			minItems: 1,
		}),
	),
	clear: Type.Optional(
		Type.Boolean({
			description:
				"If true, clear the entire todo list. Equivalent to passing an empty list. Use this when work is complete or to reset.",
		}),
	),
});

export type TodoToolInput = Static<typeof todoSchema>;

export interface TodoToolDetails {
	previousCount: number;
	newCount: number;
	previousVersion: number;
	newVersion: number;
}

const STATUS_DESCRIPTIONS: Record<TodoStatus, string> = {
	pending: "not started",
	in_progress: "currently working on",
	completed: "done",
};

function renderItemsForCall(args: TodoToolInput, theme: Theme): string {
	if (args.clear === true) {
		return `${theme.fg("toolTitle", theme.bold("todo"))} ${theme.fg("muted", "clear")}`;
	}
	if (!Array.isArray(args.todos)) {
		return `${theme.fg("toolTitle", theme.bold("todo"))}`;
	}
	const count = args.todos.length;
	const inProgress = args.todos.find((t) => t.status === "in_progress");
	let summary: string;
	if (inProgress) {
		const label = inProgress.activeForm ?? inProgress.content;
		summary = `working: ${label}`;
	} else if (count === 0) {
		summary = "cleared";
	} else {
		summary = `${count} item${count === 1 ? "" : "s"}`;
	}
	return `${theme.fg("toolTitle", theme.bold("todo"))} ${theme.fg("muted", summary)}`;
}

function renderItemsForResult(result: { content: Array<{ type: string; text?: string }> }, theme: Theme): string {
	const text = getTextOutput(result, true);
	if (!text) return "";
	// Take just the first line as the header; the LLM sees the rest as content.
	const lines = text.split("\n");
	const header = lines[0] ?? "";
	const body = lines.slice(1).join("\n");
	return `${theme.fg("muted", header)}${body ? `\n${body}` : ""}`;
}
export function createTodoToolDefinition(_cwd: string): ToolDefinition<typeof todoSchema, TodoToolDetails | undefined> {
	return {
		name: "todo",
		label: "Todo",
		description: [
			"Maintain a session-scoped todo list that the user can see while you work.",
			"Use this for any non-trivial multi-step task so the user understands what you're doing and what's left.",
			"",
			"Usage:",
			"- Call this BEFORE starting work to plan the steps",
			"- Update it as you make progress (mark items in_progress when starting, completed when done)",
			"- Always pass the FULL list, not just the changes",
			"- At most 10 items; keep the list focused on what's actually left to do",
			"- At most one item should be in_progress at a time",
			'- Use the imperative form in `content` (e.g. "Investigate the auth flow") and the present-continuous form in `activeForm` (e.g. "Investigating the auth flow")',
			"- Mark items completed BEFORE moving to the next; don't skip ahead",
			"",
			"The list is shown to the user as a checklist at the top of the conversation.",
			"Pass an empty list (or don't call this tool) for simple single-step tasks.",
		].join("\n"),
		parameters: todoSchema,
		async execute(_toolCallId, params, _signal) {
			const p = params as TodoToolInput;
			const store = getTodoStore();
			const previous = store.getState();

			// Allow either `todos` or `clear: true`
			if (p.clear === true) {
				store.clear();
				const after = store.getState();
				return {
					content: [{ type: "text" as const, text: "Todo list cleared." }],
					details: {
						previousCount: previous.items.length,
						newCount: 0,
						previousVersion: previous.version,
						newVersion: after.version,
					},
				};
			}

			if (!Array.isArray(p.todos)) {
				throw new Error("Missing required argument: either `todos` (array) or `clear: true`");
			}

			// Normalize items
			const items: TodoItem[] = p.todos.map((t) => {
				const item: TodoItem = {
					content: typeof t.content === "string" ? t.content.trim() : "",
					status: t.status as TodoStatus,
				};
				if (typeof t.activeForm === "string" && t.activeForm.trim().length > 0) {
					item.activeForm = t.activeForm.trim();
				}
				return item;
			});

			store.set(items);

			const after = store.getState();
			const summary = formatTodoListForLlm(items);
			const statusBreakdown: string[] = [];
			for (const status of ["pending", "in_progress", "completed"] as TodoStatus[]) {
				const n = items.filter((i) => i.status === status).length;
				if (n > 0) {
					statusBreakdown.push(`${n} ${STATUS_DESCRIPTIONS[status]}`);
				}
			}

			return {
				content: [
					{
						type: "text" as const,
						text: `${summary}\n\n${statusBreakdown.join(". ")}.`,
					},
				],
				details: {
					previousCount: previous.items.length,
					newCount: items.length,
					previousVersion: previous.version,
					newVersion: after.version,
				},
			};
		},
		renderCall(args, theme: Theme, context: ToolRenderContext) {
			const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
			text.setText(renderItemsForCall(args, theme));
			return text;
		},
		renderResult(result, _options, theme: Theme, context: ToolRenderContext) {
			const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
			text.setText(renderItemsForResult(result, theme));
			return text;
		},
	};
}

export function createTodoTool(_cwd: string): AgentTool<Static<typeof todoSchema>> {
	return wrapToolDefinition(createTodoToolDefinition(_cwd));
}
