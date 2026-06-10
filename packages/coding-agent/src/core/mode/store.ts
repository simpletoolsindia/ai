/**
 * Plan / Execute mode.
 *
 * The agent can run in two modes:
 * - `plan`: read-only investigation + planning. Mutating tools (bash, edit, write) are
 *   blocked at the tool boundary. The agent is expected to use the `todo` tool to write
 *   a plan and then signal readiness. The user reviews the plan and switches to execute.
 * - `execute`: full tool set. Default once a plan is approved.
 *
 * Mode is session-scoped. A new session resets to `plan`.
 *
 * The Tab keybinding toggles mode. `/mode [plan|execute]` does the same.
 */

export type Mode = "plan" | "execute";

export interface ModeState {
	readonly mode: Mode;
	readonly changedAt: number;
}

type Listener = (state: ModeState) => void;

/**
 * Tools that mutate state (filesystem, processes). Blocked in plan mode.
 *
 * Read-only tools (read, grep, find, ls, websearch, webfetch, subagent, todo)
 * are allowed in both modes. The todo tool is the primary planning tool.
 */
export const MUTATING_TOOLS: ReadonlySet<string> = new Set([
	"bash", // shell — can read OR mutate, but the distinction is hard to enforce
	"edit", // file mutation
	"write", // file mutation
]);

/**
 * Tools that are always blocked regardless of mode. Currently none — but
 * the list exists for future restrictions (e.g. for "auto" mode).
 */
export const ALWAYS_BLOCKED_TOOLS: ReadonlySet<string> = new Set([]);

export class ModeStore {
	private mode: Mode = "plan";
	private changedAt = Date.now();
	private listeners = new Set<Listener>();

	getState(): ModeState {
		return { mode: this.mode, changedAt: this.changedAt };
	}

	getMode(): Mode {
		return this.mode;
	}

	setMode(mode: Mode): void {
		if (this.mode === mode) return;
		this.mode = mode;
		this.changedAt = Date.now();
		for (const listener of this.listeners) {
			listener(this.getState());
		}
	}

	toggle(): Mode {
		const next: Mode = this.mode === "plan" ? "execute" : "plan";
		this.setMode(next);
		return next;
	}

	subscribe(listener: Listener): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	/**
	 * Check whether a tool is allowed in the current mode.
	 * Returns null if allowed, or an error string explaining why it's blocked.
	 */
	checkTool(toolName: string): string | null {
		if (ALWAYS_BLOCKED_TOOLS.has(toolName)) {
			return `Tool "${toolName}" is not available.`;
		}
		if (this.mode === "plan" && MUTATING_TOOLS.has(toolName)) {
			return (
				`Tool "${toolName}" is not available in plan mode. ` +
				`Plan mode is for investigation and planning only. ` +
				`Press Tab or run /mode execute to switch to execute mode and use mutating tools.`
			);
		}
		return null;
	}
}

let sessionModeStore: ModeStore | null = null;

export function getModeStore(): ModeStore {
	if (!sessionModeStore) {
		sessionModeStore = new ModeStore();
	}
	return sessionModeStore;
}

export function resetModeStore(): void {
	if (sessionModeStore) {
		sessionModeStore.setMode("plan");
	}
	sessionModeStore = null;
}

/**
 * Format a one-line summary of the current mode for system prompts and TUI.
 */
export function formatModeLabel(mode: Mode): string {
	return mode === "plan" ? "PLAN (read-only)" : "EXECUTE (full tools)";
}
