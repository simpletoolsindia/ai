/**
 * ExtensionUI - Handles extension-related UI operations.
 *
 * Extracted from InteractiveMode to improve separation of concerns
 * and make the codebase more maintainable.
 */

import type { OverlayHandle, TUI } from "@simpletoolsindiaorg/ai-tui";
import type { AgentSession } from "../../core/agent-session.ts";
import type { ExtensionRunner } from "../../core/extensions/index.ts";
import { err, ok, type Result } from "../../core/result.ts";
import type { ThemeProvider } from "../../core/theme-provider.ts";

/**
 * Callback interface for extension UI operations.
 */
export interface ExtensionUICallbacks {
	showStatus: (message: string) => void;
	showError: (message: string) => void;
	showWarning: (message: string) => void;
	requestRender: () => void;
}

/**
 * Extension UI error types.
 */
export interface ExtensionUIError {
	code: string;
	message: string;
	cause?: Error;
}

/**
 * Manages extension-related UI operations.
 */
export class ExtensionUI {
	private session: AgentSession;
	private extensionRunner: ExtensionRunner;
	private themeProvider: ThemeProvider;
	private tui: TUI;
	private ui: ExtensionUICallbacks;
	private currentOverlay: OverlayHandle | null = null;

	constructor(
		session: AgentSession,
		extensionRunner: ExtensionRunner,
		themeProvider: ThemeProvider,
		tui: TUI,
		ui: ExtensionUICallbacks,
	) {
		this.session = session;
		this.extensionRunner = extensionRunner;
		this.themeProvider = themeProvider;
		this.tui = tui;
		this.ui = ui;
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
	 * Show the OAuth selector overlay.
	 */
	showOAuthSelector(mode: "login" | "logout"): void {
		// Close existing overlay if open
		if (this.currentOverlay) {
			this.currentOverlay.hide();
			this.currentOverlay = null;
		}

		// Implementation would go here
		// This would create an OAuth selector component and show it as an overlay
		this.ui.showStatus(`OAuth ${mode} selector`);
	}

	/**
	 * Handle the extension command.
	 */
	async handleExtensionCommand(commandName: string, fullText: string): Promise<Result<boolean, ExtensionUIError>> {
		try {
			// Check if this is an extension-registered command
			const commands = this.extensionRunner.getRegisteredCommands();
			const command = commands.find((cmd) => cmd.name === commandName || cmd.invocationName === commandName);

			if (!command) {
				return ok(false);
			}

			// Execute the extension command
			await this.extensionRunner.executeCommand(command.name, fullText);
			return ok(true);
		} catch (error) {
			return err({
				code: "EXTENSION_COMMAND_FAILED",
				message: error instanceof Error ? error.message : String(error),
				cause: error instanceof Error ? error : undefined,
			});
		}
	}

	/**
	 * Handle the reload command.
	 */
	async handleReloadCommand(): Promise<Result<void, ExtensionUIError>> {
		try {
			// Implementation would go here
			// This would reload extensions, skills, prompts, and themes
			this.ui.showStatus("Reload command");
			return ok(undefined);
		} catch (error) {
			return err({
				code: "RELOAD_FAILED",
				message: error instanceof Error ? error.message : String(error),
				cause: error instanceof Error ? error : undefined,
			});
		}
	}

	/**
	 * Handle the login command.
	 */
	handleLoginCommand(): void {
		this.showOAuthSelector("login");
	}

	/**
	 * Handle the logout command.
	 */
	handleLogoutCommand(): void {
		this.showOAuthSelector("logout");
	}

	/**
	 * Handle the help command.
	 */
	handleHelpCommand(): void {
		// Implementation would go here
		// This would show help information
		this.ui.showStatus("Help command");
	}

	/**
	 * Handle the hotkeys command.
	 */
	handleHotkeysCommand(): void {
		// Implementation would go here
		// This would show hotkeys information
		this.ui.showStatus("Hotkeys command");
	}

	/**
	 * Handle the changelog command.
	 */
	handleChangelogCommand(): void {
		// Implementation would go here
		// This would show changelog information
		this.ui.showStatus("Changelog command");
	}

	/**
	 * Handle the diagnostics command.
	 */
	async handleDiagnosticsCommand(): Promise<Result<void, ExtensionUIError>> {
		try {
			// Implementation would go here
			// This would show diagnostics information
			this.ui.showStatus("Diagnostics command");
			return ok(undefined);
		} catch (error) {
			return err({
				code: "DIAGNOSTICS_FAILED",
				message: error instanceof Error ? error.message : String(error),
				cause: error instanceof Error ? error : undefined,
			});
		}
	}

	/**
	 * Handle the update command.
	 */
	async handleUpdateCommand(text: string): Promise<Result<void, ExtensionUIError>> {
		try {
			// Implementation would go here
			// This would handle update commands
			this.ui.showStatus("Update command");
			return ok(undefined);
		} catch (error) {
			return err({
				code: "UPDATE_FAILED",
				message: error instanceof Error ? error.message : String(error),
				cause: error instanceof Error ? error : undefined,
			});
		}
	}

	/**
	 * Handle the logs command.
	 */
	async handleLogsCommand(text: string): Promise<Result<void, ExtensionUIError>> {
		try {
			// Implementation would go here
			// This would handle logs commands
			this.ui.showStatus("Logs command");
			return ok(undefined);
		} catch (error) {
			return err({
				code: "LOGS_FAILED",
				message: error instanceof Error ? error.message : String(error),
				cause: error instanceof Error ? error : undefined,
			});
		}
	}

	/**
	 * Handle the memory command.
	 */
	async handleMemoryCommand(text: string): Promise<Result<void, ExtensionUIError>> {
		try {
			// Implementation would go here
			// This would handle memory commands
			this.ui.showStatus("Memory command");
			return ok(undefined);
		} catch (error) {
			return err({
				code: "MEMORY_FAILED",
				message: error instanceof Error ? error.message : String(error),
				cause: error instanceof Error ? error : undefined,
			});
		}
	}

	/**
	 * Handle the skill command.
	 */
	async handleSkillCommand(text: string): Promise<Result<void, ExtensionUIError>> {
		try {
			// Implementation would go here
			// This would handle skill commands
			this.ui.showStatus("Skill command");
			return ok(undefined);
		} catch (error) {
			return err({
				code: "SKILL_FAILED",
				message: error instanceof Error ? error.message : String(error),
				cause: error instanceof Error ? error : undefined,
			});
		}
	}

	/**
	 * Check if a command is an extension command.
	 */
	isExtensionCommand(text: string): boolean {
		if (!text.startsWith("/")) return false;
		const commandName = text.slice(1).split(" ")[0];
		const commands = this.extensionRunner.getRegisteredCommands();
		return commands.some((cmd) => cmd.name === commandName || cmd.invocationName === commandName);
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
	 * Get the extension runner.
	 */
	getExtensionRunner(): ExtensionRunner {
		return this.extensionRunner;
	}

	/**
	 * Get the session.
	 */
	getSession(): AgentSession {
		return this.session;
	}
}
