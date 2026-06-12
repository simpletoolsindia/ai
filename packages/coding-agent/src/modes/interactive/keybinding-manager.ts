/**
 * KeybindingManager - Handles all keyboard input and action dispatch.
 *
 * Extracted from InteractiveMode to improve separation of concerns
 * and make the codebase more maintainable.
 */

import type { TUI } from "@simpletoolsindiaorg/ai-tui";
import type { KeybindingsManager as CoreKeybindingsManager } from "../../core/keybindings.ts";
import type { CustomEditor } from "./components/custom-editor.ts";

/**
 * Action handler type.
 */
export type ActionHandler = () => void | Promise<void>;

/**
 * Keybinding action definitions.
 */
export interface KeybindingActions {
	// App actions
	"app.clear": ActionHandler;
	"app.suspend": ActionHandler;
	"app.thinking.cycle": ActionHandler;
	"app.model.cycleForward": ActionHandler;
	"app.model.cycleBackward": ActionHandler;
	"app.model.select": ActionHandler;
	"app.tools.expand": ActionHandler;
	"app.mode.toggle": ActionHandler;
	"app.thinking.toggle": ActionHandler;
	"app.editor.external": ActionHandler;
	"app.message.followUp": ActionHandler;
	"app.message.dequeue": ActionHandler;
	"app.session.new": ActionHandler;
	"app.session.tree": ActionHandler;
	"app.session.fork": ActionHandler;
	"app.session.resume": ActionHandler;

	// Editor events
	"editor.escape": ActionHandler;
	"editor.ctrlD": ActionHandler;
	"editor.change": (text: string) => void;
	"editor.pasteImage": ActionHandler;
}

/**
 * Manages keyboard input and action dispatch.
 */
export class KeybindingManager {
	private editor: CustomEditor;
	private keybindings: CoreKeybindingsManager;
	private tui: TUI;
	private actions: Partial<KeybindingActions> = {};
	private lastEscapeTime = 0;

	constructor(editor: CustomEditor, keybindings: CoreKeybindingsManager, tui: TUI) {
		this.editor = editor;
		this.keybindings = keybindings;
		this.tui = tui;
	}

	/**
	 * Register an action handler.
	 */
	onAction<K extends keyof KeybindingActions>(action: K, handler: KeybindingActions[K]): void {
		this.actions[action] = handler;
	}

	/**
	 * Set up all key handlers on the editor.
	 */
	setupKeyHandlers(): void {
		// Set up escape handler
		this.editor.onEscape = () => {
			this.actions["editor.escape"]?.();
		};

		// Set up Ctrl+D handler
		this.editor.onCtrlD = () => {
			this.actions["editor.ctrlD"]?.();
		};

		// Register app action handlers
		this.editor.onAction("app.clear", () => this.actions["app.clear"]?.());
		this.editor.onAction("app.suspend", () => this.actions["app.suspend"]?.());
		this.editor.onAction("app.thinking.cycle", () => this.actions["app.thinking.cycle"]?.());
		this.editor.onAction("app.model.cycleForward", () => this.actions["app.model.cycleForward"]?.());
		this.editor.onAction("app.model.cycleBackward", () => this.actions["app.model.cycleBackward"]?.());
		this.editor.onAction("app.model.select", () => this.actions["app.model.select"]?.());
		this.editor.onAction("app.tools.expand", () => this.actions["app.tools.expand"]?.());
		this.editor.onAction("app.mode.toggle", () => this.actions["app.mode.toggle"]?.());
		this.editor.onAction("app.thinking.toggle", () => this.actions["app.thinking.toggle"]?.());
		this.editor.onAction("app.editor.external", () => this.actions["app.editor.external"]?.());
		this.editor.onAction("app.message.followUp", () => this.actions["app.message.followUp"]?.());
		this.editor.onAction("app.message.dequeue", () => this.actions["app.message.dequeue"]?.());
		this.editor.onAction("app.session.new", () => this.actions["app.session.new"]?.());
		this.editor.onAction("app.session.tree", () => this.actions["app.session.tree"]?.());
		this.editor.onAction("app.session.fork", () => this.actions["app.session.fork"]?.());
		this.editor.onAction("app.session.resume", () => this.actions["app.session.resume"]?.());

		// Set up editor change handler
		this.editor.onChange = (text: string) => {
			this.actions["editor.change"]?.(text);
		};

		// Set up clipboard image paste handler
		this.editor.onPasteImage = () => {
			this.actions["editor.pasteImage"]?.();
		};

		// Global debug handler on TUI
		this.tui.onDebug = () => {
			// Debug handler can be registered separately
		};
	}

	/**
	 * Get the keybindings manager.
	 */
	getKeybindings(): CoreKeybindingsManager {
		return this.keybindings;
	}

	/**
	 * Reload keybindings.
	 */
	reload(): void {
		this.keybindings.reload();
	}

	/**
	 * Get the last escape time (for double-escape detection).
	 */
	getLastEscapeTime(): number {
		return this.lastEscapeTime;
	}

	/**
	 * Set the last escape time.
	 */
	setLastEscapeTime(time: number): void {
		this.lastEscapeTime = time;
	}

	/**
	 * Get keys for a specific action.
	 */
	getKeysForAction(action: string): string[] {
		return this.keybindings.getKeys(action);
	}

	/**
	 * Get the effective keybinding configuration.
	 */
	getEffectiveConfig(): Record<string, string[]> {
		return this.keybindings.getEffectiveConfig();
	}
}
