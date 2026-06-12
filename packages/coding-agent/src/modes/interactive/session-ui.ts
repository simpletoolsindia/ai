/**
 * SessionUI - Handles session-related UI operations.
 *
 * Extracted from InteractiveMode to improve separation of concerns
 * and make the codebase more maintainable.
 */

import type { OverlayHandle, TUI } from "@simpletoolsindiaorg/ai-tui";
import type { AgentSession } from "../../core/agent-session.ts";
import { err, ok, type Result } from "../../core/result.ts";
import type { SessionManager } from "../../core/session-manager.ts";
import type { SettingsManager } from "../../core/settings-manager.ts";
import type { ThemeProvider } from "../../core/theme-provider.ts";

/**
 * Callback interface for session UI operations.
 */
export interface SessionUICallbacks {
	showStatus: (message: string) => void;
	showError: (message: string) => void;
	showWarning: (message: string) => void;
	requestRender: () => void;
	footerInvalidate: () => void;
}

/**
 * Session UI error types.
 */
export interface SessionUIError {
	code: string;
	message: string;
	cause?: Error;
}

/**
 * Manages session-related UI operations.
 */
export class SessionUI {
	private session: AgentSession;
	private sessionManager: SessionManager;
	private settingsManager: SettingsManager;
	private themeProvider: ThemeProvider;
	private tui: TUI;
	private ui: SessionUICallbacks;
	private currentOverlay: OverlayHandle | null = null;

	constructor(
		session: AgentSession,
		sessionManager: SessionManager,
		settingsManager: SettingsManager,
		themeProvider: ThemeProvider,
		tui: TUI,
		ui: SessionUICallbacks,
	) {
		this.session = session;
		this.sessionManager = sessionManager;
		this.settingsManager = settingsManager;
		this.themeProvider = themeProvider;
		this.tui = tui;
		this.ui = ui;
	}

	/**
	 * Show the session selector overlay.
	 */
	showSessionSelector(): void {
		// Close existing overlay if open
		if (this.currentOverlay) {
			this.currentOverlay.hide();
			this.currentOverlay = null;
		}

		// Implementation would go here
		// This would create a session selector component and show it as an overlay
		this.ui.showStatus("Session selector");
	}

	/**
	 * Show the tree selector overlay.
	 */
	showTreeSelector(): void {
		// Close existing overlay if open
		if (this.currentOverlay) {
			this.currentOverlay.hide();
			this.currentOverlay = null;
		}

		// Implementation would go here
		// This would create a tree selector component and show it as an overlay
		this.ui.showStatus("Tree selector");
	}

	/**
	 * Show the user message selector overlay (for forking).
	 */
	showUserMessageSelector(): void {
		// Close existing overlay if open
		if (this.currentOverlay) {
			this.currentOverlay.hide();
			this.currentOverlay = null;
		}

		// Implementation would go here
		// This would create a user message selector component and show it as an overlay
		this.ui.showStatus("User message selector");
	}

	/**
	 * Handle the session command.
	 */
	handleSessionCommand(): void {
		// Implementation would go here
		// This would show session information
		this.ui.showStatus("Session command");
	}

	/**
	 * Handle the tree command.
	 */
	handleTreeCommand(): void {
		this.showTreeSelector();
	}

	/**
	 * Handle the fork command.
	 */
	handleForkCommand(): void {
		this.showUserMessageSelector();
	}

	/**
	 * Handle the clone command.
	 */
	async handleCloneCommand(): Promise<Result<void, SessionUIError>> {
		try {
			// Implementation would go here
			// This would clone the current session
			this.ui.showStatus("Clone command");
			return ok(undefined);
		} catch (error) {
			return err({
				code: "CLONE_FAILED",
				message: error instanceof Error ? error.message : String(error),
				cause: error instanceof Error ? error : undefined,
			});
		}
	}

	/**
	 * Handle the new session command.
	 */
	async handleNewSessionCommand(): Promise<Result<void, SessionUIError>> {
		try {
			// Implementation would go here
			// This would create a new session
			this.ui.showStatus("New session command");
			return ok(undefined);
		} catch (error) {
			return err({
				code: "NEW_SESSION_FAILED",
				message: error instanceof Error ? error.message : String(error),
				cause: error instanceof Error ? error : undefined,
			});
		}
	}

	/**
	 * Handle the resume command.
	 */
	handleResumeCommand(): void {
		this.showSessionSelector();
	}

	/**
	 * Handle the name command.
	 */
	handleNameCommand(name: string): Result<void, SessionUIError> {
		try {
			// Implementation would go here
			// This would set the session name
			this.ui.showStatus(`Session name: ${name}`);
			return ok(undefined);
		} catch (error) {
			return err({
				code: "NAME_FAILED",
				message: error instanceof Error ? error.message : String(error),
				cause: error instanceof Error ? error : undefined,
			});
		}
	}

	/**
	 * Handle the trust command.
	 */
	handleTrustCommand(): void {
		// Implementation would go here
		// This would show the trust selector
		this.ui.showStatus("Trust command");
	}

	/**
	 * Close the current overlay if open.
	 */
	closeCurrentOverlay(): void {
		if (this.currentOverlay) {
			this.currentOverlay.hide();
			this.currentOverlay = null;
		}
	}

	/**
	 * Check if an overlay is currently open.
	 */
	isOverlayOpen(): boolean {
		return this.currentOverlay !== null;
	}

	/**
	 * Get the current session ID.
	 */
	getSessionId(): string {
		return this.sessionManager.getSessionId();
	}

	/**
	 * Get the current session name.
	 */
	getSessionName(): string | undefined {
		return this.sessionManager.getSessionName();
	}

	/**
	 * Get the session manager.
	 */
	getSessionManager(): SessionManager {
		return this.sessionManager;
	}

	/**
	 * Get the session.
	 */
	getSession(): AgentSession {
		return this.session;
	}
}
