/**
 * Tests for SessionUI.
 */

import { describe, expect, it, vi } from "vitest";
import { SessionUI } from "../src/modes/interactive/session-ui.ts";

// Mock dependencies
const mockSession = {
	isStreaming: false,
	isBashRunning: false,
};

const mockSessionManager = {
	getSessionId: vi.fn().mockReturnValue("test-session-id"),
	getSessionName: vi.fn().mockReturnValue("test-session"),
};

const mockSettingsManager = {
	getDoubleEscapeAction: vi.fn().mockReturnValue("none"),
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
	footerInvalidate: vi.fn(),
};

describe("SessionUI", () => {
	it("should create an instance", () => {
		const ui = new SessionUI(
			mockSession as any,
			mockSessionManager as any,
			mockSettingsManager as any,
			mockThemeProvider as any,
			mockTui as any,
			mockUI,
		);
		expect(ui).toBeDefined();
	});

	it("should show session selector", () => {
		const ui = new SessionUI(
			mockSession as any,
			mockSessionManager as any,
			mockSettingsManager as any,
			mockThemeProvider as any,
			mockTui as any,
			mockUI,
		);

		ui.showSessionSelector();
		expect(mockUI.showStatus).toHaveBeenCalledWith("Session selector");
	});

	it("should show tree selector", () => {
		const ui = new SessionUI(
			mockSession as any,
			mockSessionManager as any,
			mockSettingsManager as any,
			mockThemeProvider as any,
			mockTui as any,
			mockUI,
		);

		ui.showTreeSelector();
		expect(mockUI.showStatus).toHaveBeenCalledWith("Tree selector");
	});

	it("should show user message selector", () => {
		const ui = new SessionUI(
			mockSession as any,
			mockSessionManager as any,
			mockSettingsManager as any,
			mockThemeProvider as any,
			mockTui as any,
			mockUI,
		);

		ui.showUserMessageSelector();
		expect(mockUI.showStatus).toHaveBeenCalledWith("User message selector");
	});

	it("should handle session command", () => {
		const ui = new SessionUI(
			mockSession as any,
			mockSessionManager as any,
			mockSettingsManager as any,
			mockThemeProvider as any,
			mockTui as any,
			mockUI,
		);

		ui.handleSessionCommand();
		expect(mockUI.showStatus).toHaveBeenCalledWith("Session command");
	});

	it("should handle tree command", () => {
		const ui = new SessionUI(
			mockSession as any,
			mockSessionManager as any,
			mockSettingsManager as any,
			mockThemeProvider as any,
			mockTui as any,
			mockUI,
		);

		ui.handleTreeCommand();
		expect(mockUI.showStatus).toHaveBeenCalledWith("Tree selector");
	});

	it("should handle fork command", () => {
		const ui = new SessionUI(
			mockSession as any,
			mockSessionManager as any,
			mockSettingsManager as any,
			mockThemeProvider as any,
			mockTui as any,
			mockUI,
		);

		ui.handleForkCommand();
		expect(mockUI.showStatus).toHaveBeenCalledWith("User message selector");
	});

	it("should handle clone command", async () => {
		const ui = new SessionUI(
			mockSession as any,
			mockSessionManager as any,
			mockSettingsManager as any,
			mockThemeProvider as any,
			mockTui as any,
			mockUI,
		);

		const result = await ui.handleCloneCommand();
		expect(result.ok).toBe(true);
		expect(mockUI.showStatus).toHaveBeenCalledWith("Clone command");
	});

	it("should handle new session command", async () => {
		const ui = new SessionUI(
			mockSession as any,
			mockSessionManager as any,
			mockSettingsManager as any,
			mockThemeProvider as any,
			mockTui as any,
			mockUI,
		);

		const result = await ui.handleNewSessionCommand();
		expect(result.ok).toBe(true);
		expect(mockUI.showStatus).toHaveBeenCalledWith("New session command");
	});

	it("should handle resume command", () => {
		const ui = new SessionUI(
			mockSession as any,
			mockSessionManager as any,
			mockSettingsManager as any,
			mockThemeProvider as any,
			mockTui as any,
			mockUI,
		);

		ui.handleResumeCommand();
		expect(mockUI.showStatus).toHaveBeenCalledWith("Session selector");
	});

	it("should handle name command", () => {
		const ui = new SessionUI(
			mockSession as any,
			mockSessionManager as any,
			mockSettingsManager as any,
			mockThemeProvider as any,
			mockTui as any,
			mockUI,
		);

		const result = ui.handleNameCommand("test-name");
		expect(result.ok).toBe(true);
		expect(mockUI.showStatus).toHaveBeenCalledWith("Session name: test-name");
	});

	it("should handle trust command", () => {
		const ui = new SessionUI(
			mockSession as any,
			mockSessionManager as any,
			mockSettingsManager as any,
			mockThemeProvider as any,
			mockTui as any,
			mockUI,
		);

		ui.handleTrustCommand();
		expect(mockUI.showStatus).toHaveBeenCalledWith("Trust command");
	});

	it("should get session ID", () => {
		const ui = new SessionUI(
			mockSession as any,
			mockSessionManager as any,
			mockSettingsManager as any,
			mockThemeProvider as any,
			mockTui as any,
			mockUI,
		);

		const sessionId = ui.getSessionId();
		expect(sessionId).toBe("test-session-id");
	});

	it("should get session name", () => {
		const ui = new SessionUI(
			mockSession as any,
			mockSessionManager as any,
			mockSettingsManager as any,
			mockThemeProvider as any,
			mockTui as any,
			mockUI,
		);

		const sessionName = ui.getSessionName();
		expect(sessionName).toBe("test-session");
	});

	it("should get session manager", () => {
		const ui = new SessionUI(
			mockSession as any,
			mockSessionManager as any,
			mockSettingsManager as any,
			mockThemeProvider as any,
			mockTui as any,
			mockUI,
		);

		const manager = ui.getSessionManager();
		expect(manager).toBe(mockSessionManager);
	});

	it("should get session", () => {
		const ui = new SessionUI(
			mockSession as any,
			mockSessionManager as any,
			mockSettingsManager as any,
			mockThemeProvider as any,
			mockTui as any,
			mockUI,
		);

		const session = ui.getSession();
		expect(session).toBe(mockSession);
	});
});
