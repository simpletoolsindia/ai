/**
 * Tests for SlashCommandHandler.
 */

import { describe, expect, it, vi } from "vitest";
import { SlashCommandHandler } from "../src/modes/interactive/slash-command-handler.ts";

// Mock dependencies
const mockSession = {
	setModel: vi.fn(),
	isStreaming: false,
	isBashRunning: false,
	scopedModels: [],
	modelRegistry: {
		refresh: vi.fn(),
		refreshDiscoveredModels: vi.fn(),
		getAvailable: vi.fn().mockResolvedValue([]),
	},
};

const mockSessionManager = {
	getCwd: vi.fn().mockReturnValue("/test"),
};

const mockSettingsManager = {
	getDoubleEscapeAction: vi.fn().mockReturnValue("none"),
};

const mockModelRegistry = {
	refresh: vi.fn(),
	refreshDiscoveredModels: vi.fn(),
	getAvailable: vi.fn().mockResolvedValue([]),
};

const mockUI = {
	showModelSelector: vi.fn(),
	showSettingsSelector: vi.fn(),
	showSessionSelector: vi.fn(),
	showTreeSelector: vi.fn(),
	showUserMessageSelector: vi.fn(),
	showStatus: vi.fn(),
	showError: vi.fn(),
	showWarning: vi.fn(),
	updateEditorBorderColor: vi.fn(),
	footerInvalidate: vi.fn(),
};

describe("SlashCommandHandler", () => {
	it("should create an instance", () => {
		const handler = new SlashCommandHandler(
			mockSession as any,
			mockSessionManager as any,
			mockSettingsManager as any,
			mockModelRegistry as any,
			mockUI,
		);
		expect(handler).toBeDefined();
	});

	it("should handle /model command", async () => {
		const handler = new SlashCommandHandler(
			mockSession as any,
			mockSessionManager as any,
			mockSettingsManager as any,
			mockModelRegistry as any,
			mockUI,
		);

		const handled = await handler.handleCommand("/model");
		expect(handled).toBe(true);
		expect(mockUI.showModelSelector).toHaveBeenCalled();
	});

	it("should handle /settings command", async () => {
		const handler = new SlashCommandHandler(
			mockSession as any,
			mockSessionManager as any,
			mockSettingsManager as any,
			mockModelRegistry as any,
			mockUI,
		);

		const handled = await handler.handleCommand("/settings");
		expect(handled).toBe(true);
		expect(mockUI.showSettingsSelector).toHaveBeenCalled();
	});

	it("should handle /session command", async () => {
		const handler = new SlashCommandHandler(
			mockSession as any,
			mockSessionManager as any,
			mockSettingsManager as any,
			mockModelRegistry as any,
			mockUI,
		);

		const handled = await handler.handleCommand("/session");
		expect(handled).toBe(true);
		expect(mockUI.showStatus).toHaveBeenCalledWith("Session command");
	});

	it("should handle /tree command", async () => {
		const handler = new SlashCommandHandler(
			mockSession as any,
			mockSessionManager as any,
			mockSettingsManager as any,
			mockModelRegistry as any,
			mockUI,
		);

		const handled = await handler.handleCommand("/tree");
		expect(handled).toBe(true);
		expect(mockUI.showTreeSelector).toHaveBeenCalled();
	});

	it("should handle /fork command", async () => {
		const handler = new SlashCommandHandler(
			mockSession as any,
			mockSessionManager as any,
			mockSettingsManager as any,
			mockModelRegistry as any,
			mockUI,
		);

		const handled = await handler.handleCommand("/fork");
		expect(handled).toBe(true);
		expect(mockUI.showUserMessageSelector).toHaveBeenCalled();
	});

	it("should return false for unknown commands", async () => {
		const handler = new SlashCommandHandler(
			mockSession as any,
			mockSessionManager as any,
			mockSettingsManager as any,
			mockModelRegistry as any,
			mockUI,
		);

		const handled = await handler.handleCommand("not a command");
		expect(handled).toBe(false);
	});

	it("should handle /help command", async () => {
		const handler = new SlashCommandHandler(
			mockSession as any,
			mockSessionManager as any,
			mockSettingsManager as any,
			mockModelRegistry as any,
			mockUI,
		);

		const handled = await handler.handleCommand("/help");
		expect(handled).toBe(true);
		expect(mockUI.showStatus).toHaveBeenCalledWith("Help command");
	});

	it("should handle /quit command", async () => {
		const handler = new SlashCommandHandler(
			mockSession as any,
			mockSessionManager as any,
			mockSettingsManager as any,
			mockModelRegistry as any,
			mockUI,
		);

		const handled = await handler.handleCommand("/quit");
		expect(handled).toBe(true);
		expect(mockUI.showStatus).toHaveBeenCalledWith("Quit command");
	});
});
