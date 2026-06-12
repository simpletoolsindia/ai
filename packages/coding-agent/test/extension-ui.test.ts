/**
 * Tests for ExtensionUI.
 */

import { describe, expect, it, vi } from "vitest";
import { ExtensionUI } from "../src/modes/interactive/extension-ui.ts";

// Mock dependencies
const mockSession = {
	isStreaming: false,
	isBashRunning: false,
};

const mockExtensionRunner = {
	getRegisteredCommands: vi.fn().mockReturnValue([]),
	executeCommand: vi.fn(),
};

const mockThemeProvider = {
	fg: vi.fn().mockReturnValue(""),
	bg: vi.fn().mockReturnValue(""),
	bold: vi.fn().mockReturnValue(""),
};

const mockTui = {
	requestRender: vi.fn(),
};

const mockUI = {
	showStatus: vi.fn(),
	showError: vi.fn(),
	showWarning: vi.fn(),
	requestRender: vi.fn(),
};

describe("ExtensionUI", () => {
	it("should create an instance", () => {
		const ui = new ExtensionUI(
			mockSession as any,
			mockExtensionRunner as any,
			mockThemeProvider as any,
			mockTui as any,
			mockUI,
		);
		expect(ui).toBeDefined();
	});

	it("should show extension selector", () => {
		const ui = new ExtensionUI(
			mockSession as any,
			mockExtensionRunner as any,
			mockThemeProvider as any,
			mockTui as any,
			mockUI,
		);

		ui.showExtensionSelector();
		expect(mockUI.showStatus).toHaveBeenCalledWith("Extension selector");
	});

	it("should show theme selector", () => {
		const ui = new ExtensionUI(
			mockSession as any,
			mockExtensionRunner as any,
			mockThemeProvider as any,
			mockTui as any,
			mockUI,
		);

		ui.showThemeSelector();
		expect(mockUI.showStatus).toHaveBeenCalledWith("Theme selector");
	});

	it("should show OAuth selector for login", () => {
		const ui = new ExtensionUI(
			mockSession as any,
			mockExtensionRunner as any,
			mockThemeProvider as any,
			mockTui as any,
			mockUI,
		);

		ui.showOAuthSelector("login");
		expect(mockUI.showStatus).toHaveBeenCalledWith("OAuth login selector");
	});

	it("should show OAuth selector for logout", () => {
		const ui = new ExtensionUI(
			mockSession as any,
			mockExtensionRunner as any,
			mockThemeProvider as any,
			mockTui as any,
			mockUI,
		);

		ui.showOAuthSelector("logout");
		expect(mockUI.showStatus).toHaveBeenCalledWith("OAuth logout selector");
	});

	it("should handle extension command", async () => {
		const ui = new ExtensionUI(
			mockSession as any,
			mockExtensionRunner as any,
			mockThemeProvider as any,
			mockTui as any,
			mockUI,
		);

		mockExtensionRunner.getRegisteredCommands.mockReturnValue([{ name: "test", invocationName: "test" }]);
		mockExtensionRunner.executeCommand.mockResolvedValue(undefined);

		const result = await ui.handleExtensionCommand("test", "/test arg");
		expect(result.ok).toBe(true);
		expect(result.value).toBe(true);
		expect(mockExtensionRunner.executeCommand).toHaveBeenCalledWith("test", "/test arg");
	});

	it("should return false for unknown extension command", async () => {
		const ui = new ExtensionUI(
			mockSession as any,
			mockExtensionRunner as any,
			mockThemeProvider as any,
			mockTui as any,
			mockUI,
		);

		mockExtensionRunner.getRegisteredCommands.mockReturnValue([]);

		const result = await ui.handleExtensionCommand("unknown", "/unknown");
		expect(result.ok).toBe(true);
		expect(result.value).toBe(false);
	});

	it("should handle extension command error", async () => {
		const ui = new ExtensionUI(
			mockSession as any,
			mockExtensionRunner as any,
			mockThemeProvider as any,
			mockTui as any,
			mockUI,
		);

		mockExtensionRunner.getRegisteredCommands.mockReturnValue([{ name: "test", invocationName: "test" }]);
		mockExtensionRunner.executeCommand.mockRejectedValue(new Error("Command failed"));

		const result = await ui.handleExtensionCommand("test", "/test");
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.code).toBe("EXTENSION_COMMAND_FAILED");
		}
	});

	it("should handle reload command", async () => {
		const ui = new ExtensionUI(
			mockSession as any,
			mockExtensionRunner as any,
			mockThemeProvider as any,
			mockTui as any,
			mockUI,
		);

		const result = await ui.handleReloadCommand();
		expect(result.ok).toBe(true);
		expect(mockUI.showStatus).toHaveBeenCalledWith("Reload command");
	});

	it("should handle login command", () => {
		const ui = new ExtensionUI(
			mockSession as any,
			mockExtensionRunner as any,
			mockThemeProvider as any,
			mockTui as any,
			mockUI,
		);

		ui.handleLoginCommand();
		expect(mockUI.showStatus).toHaveBeenCalledWith("OAuth login selector");
	});

	it("should handle logout command", () => {
		const ui = new ExtensionUI(
			mockSession as any,
			mockExtensionRunner as any,
			mockThemeProvider as any,
			mockTui as any,
			mockUI,
		);

		ui.handleLogoutCommand();
		expect(mockUI.showStatus).toHaveBeenCalledWith("OAuth logout selector");
	});

	it("should handle help command", () => {
		const ui = new ExtensionUI(
			mockSession as any,
			mockExtensionRunner as any,
			mockThemeProvider as any,
			mockTui as any,
			mockUI,
		);

		ui.handleHelpCommand();
		expect(mockUI.showStatus).toHaveBeenCalledWith("Help command");
	});

	it("should handle hotkeys command", () => {
		const ui = new ExtensionUI(
			mockSession as any,
			mockExtensionRunner as any,
			mockThemeProvider as any,
			mockTui as any,
			mockUI,
		);

		ui.handleHotkeysCommand();
		expect(mockUI.showStatus).toHaveBeenCalledWith("Hotkeys command");
	});

	it("should handle changelog command", () => {
		const ui = new ExtensionUI(
			mockSession as any,
			mockExtensionRunner as any,
			mockThemeProvider as any,
			mockTui as any,
			mockUI,
		);

		ui.handleChangelogCommand();
		expect(mockUI.showStatus).toHaveBeenCalledWith("Changelog command");
	});

	it("should handle diagnostics command", async () => {
		const ui = new ExtensionUI(
			mockSession as any,
			mockExtensionRunner as any,
			mockThemeProvider as any,
			mockTui as any,
			mockUI,
		);

		const result = await ui.handleDiagnosticsCommand();
		expect(result.ok).toBe(true);
		expect(mockUI.showStatus).toHaveBeenCalledWith("Diagnostics command");
	});

	it("should handle update command", async () => {
		const ui = new ExtensionUI(
			mockSession as any,
			mockExtensionRunner as any,
			mockThemeProvider as any,
			mockTui as any,
			mockUI,
		);

		const result = await ui.handleUpdateCommand("/update");
		expect(result.ok).toBe(true);
		expect(mockUI.showStatus).toHaveBeenCalledWith("Update command");
	});

	it("should handle logs command", async () => {
		const ui = new ExtensionUI(
			mockSession as any,
			mockExtensionRunner as any,
			mockThemeProvider as any,
			mockTui as any,
			mockUI,
		);

		const result = await ui.handleLogsCommand("/logs");
		expect(result.ok).toBe(true);
		expect(mockUI.showStatus).toHaveBeenCalledWith("Logs command");
	});

	it("should handle memory command", async () => {
		const ui = new ExtensionUI(
			mockSession as any,
			mockExtensionRunner as any,
			mockThemeProvider as any,
			mockTui as any,
			mockUI,
		);

		const result = await ui.handleMemoryCommand("/memory");
		expect(result.ok).toBe(true);
		expect(mockUI.showStatus).toHaveBeenCalledWith("Memory command");
	});

	it("should handle skill command", async () => {
		const ui = new ExtensionUI(
			mockSession as any,
			mockExtensionRunner as any,
			mockThemeProvider as any,
			mockTui as any,
			mockUI,
		);

		const result = await ui.handleSkillCommand("/skill:test");
		expect(result.ok).toBe(true);
		expect(mockUI.showStatus).toHaveBeenCalledWith("Skill command");
	});

	it("should check if command is extension command", () => {
		const ui = new ExtensionUI(
			mockSession as any,
			mockExtensionRunner as any,
			mockThemeProvider as any,
			mockTui as any,
			mockUI,
		);

		mockExtensionRunner.getRegisteredCommands.mockReturnValue([{ name: "test", invocationName: "test" }]);

		expect(ui.isExtensionCommand("/test")).toBe(true);
		expect(ui.isExtensionCommand("/unknown")).toBe(false);
		expect(ui.isExtensionCommand("not a command")).toBe(false);
	});

	it("should get extension runner", () => {
		const ui = new ExtensionUI(
			mockSession as any,
			mockExtensionRunner as any,
			mockThemeProvider as any,
			mockTui as any,
			mockUI,
		);

		const runner = ui.getExtensionRunner();
		expect(runner).toBe(mockExtensionRunner);
	});

	it("should get session", () => {
		const ui = new ExtensionUI(
			mockSession as any,
			mockExtensionRunner as any,
			mockThemeProvider as any,
			mockTui as any,
			mockUI,
		);

		const session = ui.getSession();
		expect(session).toBe(mockSession);
	});
});
