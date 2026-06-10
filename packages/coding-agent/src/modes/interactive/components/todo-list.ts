/**
 * TUI component that displays the current todo list as a checklist.
 *
 * Subscribes to the TodoStore and re-renders on every change. The user
 * sees an in-progress item marked differently from pending/completed,
 * with a one-line summary at the bottom.
 *
 * This component is a passive renderer; the LLM-callable `todo` tool
 * is the only writer to the store.
 */

import { Container, Text } from "@simpletoolsindiaorg/ai-tui";
import { getTodoStore, type TodoItem, type TodoState } from "../../../core/todo/store.ts";
import { theme as defaultTheme } from "../theme/theme.ts";

/** Callback to invalidate the parent TUI when state changes. */
export type TodoInvalidator = () => void;

const STATUS_GLYPHS: Record<TodoItem["status"], string> = {
	pending: "[ ]",
	in_progress: "[~]",
	completed: "[x]",
};

const STATUS_COLORS: Record<TodoItem["status"], "muted" | "warning" | "success"> = {
	pending: "muted",
	in_progress: "warning",
	completed: "success",
};

function renderRow(item: TodoItem, index: number): Text {
	const glyph = STATUS_GLYPHS[item.status];
	const label = item.status === "in_progress" && item.activeForm ? item.activeForm : item.content;
	const statusBadge = item.status === "in_progress" ? ` ${defaultTheme.fg("warning", "(in progress)")}` : "";
	const colorName = STATUS_COLORS[item.status];
	return new Text(`${defaultTheme.fg(colorName, `${index + 1}. ${glyph}`)} ${label}${statusBadge}`, 1, 0);
}

function renderSummary(items: ReadonlyArray<TodoItem>): string {
	const completed = items.filter((i) => i.status === "completed").length;
	const inProgress = items.filter((i) => i.status === "in_progress").length;
	const parts: string[] = [];
	if (inProgress > 0) {
		parts.push(`${defaultTheme.fg("warning", `${inProgress} in progress`)}`);
	}
	parts.push(`${defaultTheme.fg("muted", `${completed}/${items.length} done`)}`);
	return parts.join(` ${defaultTheme.fg("dim", "·")} `);
}

export class TodoListComponent extends Container {
	private unsubscribe: (() => void) | null = null;
	private invalidateCallback: TodoInvalidator | null = null;

	constructor() {
		super();
		this.renderInitial();
		this.unsubscribe = getTodoStore().subscribe((state) => this.onStateChange(state));
	}

	/**
	 * Set the callback to invoke when the store changes.
	 * Typically set to () => this.ui.invalidate() so the TUI re-renders.
	 */
	setInvalidator(callback: TodoInvalidator): void {
		this.invalidateCallback = callback;
	}

	private renderInitial(): void {
		this.clear();
		this.renderState(getTodoStore().getState());
	}

	private onStateChange(state: TodoState): void {
		this.clear();
		this.renderState(state);
		if (this.invalidateCallback) this.invalidateCallback();
	}

	private renderState(state: TodoState): void {
		if (state.items.length === 0) return;

		this.addChild(new Text(defaultTheme.fg("muted", "Todo"), 1, 0));
		this.addChild(new Text("", 1, 0));

		for (let i = 0; i < state.items.length; i++) {
			const item = state.items[i];
			if (item) this.addChild(renderRow(item, i));
		}

		this.addChild(new Text("", 1, 0));
		this.addChild(new Text(renderSummary(state.items), 1, 0));
	}

	override invalidate(): void {
		super.invalidate();
	}

	dispose(): void {
		if (this.unsubscribe) {
			this.unsubscribe();
			this.unsubscribe = null;
		}
	}
}
