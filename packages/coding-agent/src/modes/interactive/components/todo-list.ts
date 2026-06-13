/**
 * TUI component that displays the current todo list as a sticky checklist.
 *
 * Designed to live in a dedicated container between the chat history and
 * the status/editor area, so the user always sees the active plan while
 * the agent works. The component is a passive renderer; the LLM-callable
 * `todo` tool is the only writer to the store.
 *
 * Renders:
 *   ┌─ Plan ──────────────────────────────────────── 2/5 done ─┐
 *   │  1. [x] Investigate the auth flow                       │
 *   │  2. [~] Add a new login endpoint     (in progress)      │
 *   │  3. [ ] Wire the route in app.tsx                       │
 *   │  4. [ ] Add a regression test                           │
 *   │  5. [ ] Run the test suite                              │
 *   └─────────────────────────────────────────────────────────┘
 *
 * Animations: a one-shot "flash" highlights a row when its status
 * changes, so the user can see what just happened.
 */

import { Container, Spacer, Text } from "@simpletoolsindiaorg/ai-tui";
import { getTodoStore, type TodoItem, type TodoState } from "../../../core/todo/store.ts";
import { theme as defaultTheme } from "../theme/theme.ts";

/** Callback to invalidate the parent TUI when state changes. */
export type TodoInvalidator = () => void;

const STATUS_GLYPHS: Record<TodoItem["status"], string> = {
	pending: "○",
	in_progress: "◉",
	completed: "●",
};

const STATUS_COLORS: Record<TodoItem["status"], "muted" | "warning" | "success"> = {
	pending: "muted",
	in_progress: "warning",
	completed: "success",
};

/** Track which items got newly updated so we can flash them. */
interface DiffState {
	/** Set of indices that changed in the latest state update. */
	changedIndices: Set<number>;
	/** Generation counter — incremented on every store update. */
	generation: number;
}

const MAX_VISIBLE_ITEMS = 5;
const FLASH_DURATION_MS = 1200;

export class TodoListComponent extends Container {
	private unsubscribe: (() => void) | null = null;
	private invalidateCallback: TodoInvalidator | null = null;
	private flashTimers = new Map<number, ReturnType<typeof setTimeout>>();
	private lastRenderedItems: ReadonlyArray<Readonly<TodoItem>> = [];
	private diff: DiffState = { changedIndices: new Set(), generation: 0 };
	/** True when this component is in sticky (always-visible) mode. */
	private sticky = true;
	/** Current agent mode — changes the header label. */
	private agentMode: "plan" | "execute" = "plan";

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

	/**
	 * Set the current agent mode. The header label changes from
	 * "Plan" in PLAN mode to "Tasks" in EXECUTE mode.
	 * Call this whenever the mode changes so the display is accurate.
	 */
	setMode(mode: "plan" | "execute"): void {
		if (this.agentMode === mode) return;
		this.agentMode = mode;
		this.renderState(getTodoStore().getState());
	}

	/**
	 * Whether the component should always reserve its slot in the layout
	 * (showing a one-line summary even when empty). Default: true.
	 */
	setSticky(sticky: boolean): void {
		this.sticky = sticky;
	}

	private renderInitial(): void {
		this.renderState(getTodoStore().getState());
	}

	private onStateChange(state: TodoState): void {
		// Compute the diff: which item indices changed between the last
		// render and the new state.
		const previous = this.lastRenderedItems;
		const next = state.items;
		const changed = new Set<number>();

		const maxLen = Math.max(previous.length, next.length);
		for (let i = 0; i < maxLen; i++) {
			const a = previous[i];
			const b = next[i];
			if (!a || !b || a.status !== b.status || a.content !== b.content || a.activeForm !== b.activeForm) {
				changed.add(i);
			}
		}

		this.diff = { changedIndices: changed, generation: this.diff.generation + 1 };

		// Schedule clear-flas timers for the changed rows.
		for (const idx of changed) {
			const existing = this.flashTimers.get(idx);
			if (existing) clearTimeout(existing);
			const t = setTimeout(() => {
				this.flashTimers.delete(idx);
				if (this.invalidateCallback) this.invalidateCallback();
			}, FLASH_DURATION_MS);
			this.flashTimers.set(idx, t);
		}

		this.renderState(state);
		if (this.invalidateCallback) this.invalidateCallback();
	}

	private renderState(state: TodoState): void {
		this.clear();
		this.lastRenderedItems = state.items;

		if (state.items.length === 0) {
			if (!this.sticky) return;
			// Sticky mode: show a one-line placeholder so the slot doesn't
			// jump in/out as the todo list grows/shrinks.
			this.addChild(
				new Text(
					defaultTheme.fg(
						"dim",
						"  Plan  —  (the agent will outline a step-by-step plan here before making changes)",
					),
					0,
					0,
				),
			);
			return;
		}

		const total = state.items.length;
		const completed = state.items.filter((i) => i.status === "completed").length;
		const inProgress = state.items.filter((i) => i.status === "in_progress").length;

		// Header line — shows "Plan" in PLAN mode, "Tasks" in EXECUTE
		const headerParts: string[] = [];
		const headerLabel = this.agentMode === "plan" ? "Plan" : "Tasks";
		headerParts.push(defaultTheme.bold(defaultTheme.fg("accent", headerLabel)));
		headerParts.push(defaultTheme.fg("dim", "—"));
		headerParts.push(defaultTheme.fg("muted", `${completed}/${total} done`));
		if (inProgress > 0) {
			headerParts.push(defaultTheme.fg("dim", "·"));
			headerParts.push(defaultTheme.fg("warning", `${inProgress} in progress`));
		}
		this.addChild(new Text(`  ${headerParts.join(" ")}`, 0, 0));

		// Progress bar with pulse animation indicator when work is active
		const pct = total === 0 ? 0 : Math.round((completed / total) * 20);
		const filled = "█".repeat(pct);
		const empty = "░".repeat(20 - pct);
		const barColor = inProgress > 0 ? "warning" : completed === total ? "success" : "muted";
		// Pulse indicator: show a spinning character next to the bar when work is happening
		const pulseChars = ["◐", "◓", "◑", "◒"];
		const pulseIdx = Math.floor(Date.now() / 400) % pulseChars.length;
		const pulse = inProgress > 0 ? defaultTheme.fg("warning", ` ${pulseChars[pulseIdx]}`) : "";
		this.addChild(
			new Text(
				`  ${defaultTheme.fg(barColor, filled + empty)}${pulse} ${defaultTheme.fg(
					"dim",
					`${Math.round((completed / total) * 100)}%`,
				)}`,
				0,
				0,
			),
		);

		this.addChild(new Spacer(1));

		// Item rows (cap visible at MAX_VISIBLE_ITEMS, with a "+N more" footer)
		const visible = state.items.slice(0, MAX_VISIBLE_ITEMS);
		for (let i = 0; i < visible.length; i++) {
			const item = visible[i];
			if (!item) continue;
			this.addChild(this.renderRow(item, i));
		}

		if (state.items.length > MAX_VISIBLE_ITEMS) {
			this.addChild(
				new Text(
					defaultTheme.fg(
						"dim",
						`  … ${state.items.length - MAX_VISIBLE_ITEMS} more item(s) — see chat for the full list`,
					),
					0,
					0,
				),
			);
		}
	}

	private renderRow(item: TodoItem, index: number): Text {
		const glyph = STATUS_GLYPHS[item.status];
		const colorName = STATUS_COLORS[item.status];
		const label = item.status === "in_progress" && item.activeForm ? item.activeForm : item.content;
		const statusBadge = item.status === "in_progress" ? `  ${defaultTheme.fg("warning", "(in progress)")}` : "";

		// Flash: if this index is in the diff, prepend a ▸ marker that
		// will disappear when the flash timer fires.
		const flashing = this.diff.changedIndices.has(index) && this.flashTimers.has(index);
		const flashMarker = flashing ? defaultTheme.fg("accent", "▸ ") : "  ";
		const number = defaultTheme.fg("dim", `${(index + 1).toString().padStart(2, " ")}.`);

		return new Text(`${flashMarker}${number} ${defaultTheme.fg(colorName, glyph)} ${label}${statusBadge}`, 0, 0);
	}

	override invalidate(): void {
		super.invalidate();
	}

	dispose(): void {
		if (this.unsubscribe) {
			this.unsubscribe();
			this.unsubscribe = null;
		}
		for (const t of this.flashTimers.values()) clearTimeout(t);
		this.flashTimers.clear();
	}
}
