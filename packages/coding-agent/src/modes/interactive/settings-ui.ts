/**
 * SettingsUI - Handles settings-related UI operations.
 *
 * Extracted from InteractiveMode to improve separation of concerns
 * and make the codebase more maintainable.
 */

import type { OverlayHandle, TUI } from "@simpletoolsindiaorg/ai-tui";
import type { AgentSession } from "../../core/agent-session.ts";
import type { SettingsManager } from "../../core/settings-manager.ts";
import type { ThemeProvider } from "../../core/theme-provider.ts";

/**
 * Callback interface for settings UI operations.
 */
export interface SettingsUICallbacks {
	showStatus: (message: string) => void;
	showError: (message: string) => void;
	showWarning: (message: string) => void;
	requestRender: () => void;
}

/**
 * Manages settings-related UI operations.
 */
export class SettingsUI {
	private session: AgentSession;
	private settingsManager: SettingsManager;
	private themeProvider: ThemeProvider;
	private tui: TUI;
	private ui: SettingsUICallbacks;
	private currentOverlay: OverlayHandle | null = null;

	constructor(
		session: AgentSession,
		settingsManager: SettingsManager,
		themeProvider: ThemeProvider,
		tui: TUI,
		ui: SettingsUICallbacks,
	) {
		this.session = session;
		this.settingsManager = settingsManager;
		this.themeProvider = themeProvider;
		this.tui = tui;
		this.ui = ui;
	}

	/**
	 * Show the settings selector overlay.
	 */
	showSettingsSelector(): void {
		// Close existing overlay if open
		if (this.currentOverlay) {
			this.currentOverlay.hide();
			this.currentOverlay = null;
		}

		// Implementation would go here
		// This would create a settings selector component and show it as an overlay
		this.ui.showStatus("Settings selector");
	}

	/**
	 * Show the model selector overlay.
	 */
	showModelSelector(searchTerm?: string): void {
		// Close existing overlay if open
		if (this.currentOverlay) {
			this.currentOverlay.hide();
			this.currentOverlay = null;
		}

		// Implementation would go here
		// This would create a model selector component and show it as an overlay
		this.ui.showStatus("Model selector");
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
	 * Show the scoped models selector overlay.
	 */
	async showModelsSelector(): Promise<void> {
		// Close existing overlay if open
		if (this.currentOverlay) {
			this.currentOverlay.hide();
			this.currentOverlay = null;
		}

		// Implementation would go here
		// This would create a scoped models selector component and show it as an overlay
		this.ui.showStatus("Scoped models selector");
	}

	/**
	 * Show the OAuth selector overlay.
	 */
	showOAuthSelector(): void {
		// Close existing overlay if open
		if (this.currentOverlay) {
			this.currentOverlay.hide();
			this.currentOverlay = null;
		}

		// Implementation would go here
		// This would create an OAuth selector component and show it as an overlay
		this.ui.showStatus("OAuth selector");
	}

	/**
	 * Show the trust selector overlay.
	 */
	showTrustSelector(): void {
		// Close existing overlay if open
		if (this.currentOverlay) {
			this.currentOverlay.hide();
			this.currentOverlay = null;
		}

		// Implementation would go here
		// This would create a trust selector component and show it as an overlay
		this.ui.showStatus("Trust selector");
	}

	/**
	 * Show the extension selector overlay.
	 */
	showExtensionSelector(): void {
		// Close existing overlay if open
		if (this.currentOverlay) {
			this.currentOverlay.hide();
			this.currentOverlay = null;
		}

		// Implementation would go here
		// This would create an extension selector component and show it as an overlay
		this.ui.showStatus("Extension selector");
	}

	/**
	 * Show the theme selector overlay.
	 */
	showThemeSelector(): void {
		// Close existing overlay if open
		if (this.currentOverlay) {
			this.currentOverlay.hide();
			this.currentOverlay = null;
		}

		// Implementation would go here
		// This would create a theme selector component and show it as an overlay
		this.ui.showStatus("Theme selector");
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
	 * Get the current theme provider.
	 */
	getThemeProvider(): ThemeProvider {
		return this.themeProvider;
	}

	/**
	 * Get the settings manager.
	 */
	getSettingsManager(): SettingsManager {
		return this.settingsManager;
	}

	/**
	 * Get the session.
	 */
	getSession(): AgentSession {
		return this.session;
	}
}
