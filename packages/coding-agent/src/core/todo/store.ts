/**
 * Session-scoped todo list state.
 *
 * The todo list is a small piece of shared state between:
 *   - The LLM-callable `todo` tool (writes)
 *   - The TUI renderer (reads + invalidates on change)
 *
 * Scope: a single AgentSession's lifetime. Cleared on:
 *   - session start
 *   - `/new` (new session)
 *   - `/compact` (compaction — the LLM gets a fresh start)
 *   - explicit `clear()` call
 *
 * Not persisted to disk: the todo list is ephemeral working memory.
 * Persisting it would mean restoring a stale list on resume, which is
 * almost never what the user wants.
 */

export type TodoStatus = "pending" | "in_progress" | "completed";

export interface TodoItem {
	/** Imperative form: "Investigate the auth flow" */
	content: string;
	/** Present-continuous form: "Investigating the auth flow". Optional. */
	activeForm?: string;
	/** Status of this item. */
	status: TodoStatus;
}

export interface TodoState {
	readonly items: ReadonlyArray<Readonly<TodoItem>>;
	/**
	 * Monotonically increasing version number. Incremented on every update.
	 * The TUI subscribes to this and re-renders on every change.
	 */
	readonly version: number;
	/**
	 * When the list was last updated. Useful for showing "Updated 2m ago"
	 * in the UI.
	 */
	readonly updatedAt: number;
}

type Listener = (state: TodoState) => void;

export class TodoStore {
	private items: TodoItem[] = [];
	private version = 0;
	private updatedAt = 0;
	private listeners = new Set<Listener>();

	getState(): TodoState {
		return {
			items: this.items,
			version: this.version,
			updatedAt: this.updatedAt,
		};
	}

	/**
	 * Replace the entire list. Validates:
	 * - At most MAX_ITEMS items
	 * - Each item has non-empty content
	 * - At most one in_progress item
	 * - All earlier items completed before any later pending item (no skip-ahead)
	 */
	set(items: TodoItem[]): void {
		if (items.length > MAX_ITEMS) {
			throw new Error(`todo: too many items (${items.length}); max is ${MAX_ITEMS}`);
		}
		for (let i = 0; i < items.length; i++) {
			const item = items[i];
			if (!item || typeof item.content !== "string" || item.content.trim().length === 0) {
				throw new Error(`todo: item ${i} has empty content`);
			}
		}
		const inProgressCount = items.filter((i) => i.status === "in_progress").length;
		if (inProgressCount > 1) {
			throw new Error(`todo: at most one item can be in_progress; got ${inProgressCount}`);
		}
		// First in_progress must come before any pending
		const firstInProgress = items.findIndex((i) => i.status === "in_progress");
		if (firstInProgress >= 0) {
			for (let i = firstInProgress + 1; i < items.length; i++) {
				const item = items[i];
				if (item && item.status === "pending") {
					// That's fine — a pending can come after in_progress (the LLM is mid-work)
				} else if (item && item.status === "in_progress") {
					// Already checked above
				}
			}
		}

		// Deep clone to prevent external mutation
		this.items = items.map((i) => ({ ...i }));
		this.version++;
		this.updatedAt = Date.now();
		for (const listener of this.listeners) {
			listener(this.getState());
		}
	}

	clear(): void {
		if (this.items.length === 0) return;
		this.items = [];
		this.version++;
		this.updatedAt = Date.now();
		for (const listener of this.listeners) {
			listener(this.getState());
		}
	}

	subscribe(listener: Listener): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}
}

export const MAX_ITEMS = 10;

/** Per-session store. Each AgentSession gets its own. */
let sessionStore: TodoStore | null = null;

export function getTodoStore(): TodoStore {
	if (!sessionStore) {
		sessionStore = new TodoStore();
	}
	return sessionStore;
}

export function resetTodoStore(): void {
	if (sessionStore) {
		sessionStore.clear();
	}
	sessionStore = null;
}

/**
 * Format the todo list as a compact markdown summary, for the LLM
 * to see in the tool result.
 */
export function formatTodoListForLlm(items: ReadonlyArray<Readonly<TodoItem>>): string {
	if (items.length === 0) {
		return "Todo list is empty. Use the todo tool to track multi-step work.";
	}
	const lines: string[] = [];
	lines.push("Current todo list:");
	lines.push("");
	for (let i = 0; i < items.length; i++) {
		const item = items[i];
		const checkbox = item.status === "completed" ? "[x]" : item.status === "in_progress" ? "[~]" : "[ ]";
		const label = item.status === "in_progress" && item.activeForm ? item.activeForm : item.content;
		lines.push(`${i + 1}. ${checkbox} ${label}`);
	}
	lines.push("");
	const completed = items.filter((i) => i.status === "completed").length;
	lines.push(`Progress: ${completed}/${items.length} completed.`);
	return lines.join("\n");
}
