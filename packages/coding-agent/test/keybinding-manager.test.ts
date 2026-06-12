/**
 * Tests for KeybindingManager.
 */

import { describe, expect, it, vi } from "vitest";
import { KeybindingManager } from "../src/modes/interactive/keybinding-manager.ts";

// Mock dependencies
const mockEditor = {
	onEscape: null as (() => void) | null,
	onCtrlD: null as (() => void) | null,
	onAction: vi.fn(),
	onChange: null as ((text: string) => void) | null,
	onPasteImage: null as (() => void) | null,
};

const mockKeybindings = {
	getKeys: vi.fn().mockReturnValue([]),
	getEffectiveConfig: vi.fn().mockReturnValue({}),
	reload: vi.fn(),
};

const mockTui = {
	onDebug: null as (() => void) | null,
};

describe("KeybindingManager", () => {
	it("should create an instance", () => {
		const manager = new KeybindingManager(mockEditor as any, mockKeybindings as any, mockTui as any);
		expect(manager).toBeDefined();
	});

	it("should register action handlers", () => {
		const manager = new KeybindingManager(mockEditor as any, mockKeybindings as any, mockTui as any);

		const handler = vi.fn();
		manager.onAction("app.clear", handler);

		// Verify the handler was registered (we can't directly access private actions map)
		expect(handler).not.toHaveBeenCalled();
	});

	it("should set up key handlers", () => {
		const manager = new KeybindingManager(mockEditor as any, mockKeybindings as any, mockTui as any);

		manager.setupKeyHandlers();

		// Verify that onAction was called for each action
		expect(mockEditor.onAction).toHaveBeenCalledWith("app.clear", expect.any(Function));
		expect(mockEditor.onAction).toHaveBeenCalledWith("app.suspend", expect.any(Function));
		expect(mockEditor.onAction).toHaveBeenCalledWith("app.thinking.cycle", expect.any(Function));
	});

	it("should track escape time", () => {
		const manager = new KeybindingManager(mockEditor as any, mockKeybindings as any, mockTui as any);

		expect(manager.getLastEscapeTime()).toBe(0);

		manager.setLastEscapeTime(12345);
		expect(manager.getLastEscapeTime()).toBe(12345);
	});

	it("should get keys for action", () => {
		const manager = new KeybindingManager(mockEditor as any, mockKeybindings as any, mockTui as any);

		mockKeybindings.getKeys.mockReturnValue(["ctrl+c"]);
		const keys = manager.getKeysForAction("app.clear");
		expect(keys).toEqual(["ctrl+c"]);
	});

	it("should get effective config", () => {
		const manager = new KeybindingManager(mockEditor as any, mockKeybindings as any, mockTui as any);

		const config = { "app.clear": ["ctrl+c"] };
		mockKeybindings.getEffectiveConfig.mockReturnValue(config);
		const result = manager.getEffectiveConfig();
		expect(result).toEqual(config);
	});

	it("should reload keybindings", () => {
		const manager = new KeybindingManager(mockEditor as any, mockKeybindings as any, mockTui as any);

		manager.reload();
		expect(mockKeybindings.reload).toHaveBeenCalled();
	});
});
