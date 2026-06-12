/**
 * SlashCommandHandler - Handles all slash command dispatch and execution.
 *
 * Extracted from InteractiveMode to improve separation of concerns
 * and make the codebase more maintainable.
 */

import type { Model } from "@simpletoolsindiaorg/ai-provider";
import type { AgentSession } from "../../core/agent-session.ts";
import type { ModelRegistry } from "../../core/model-registry.ts";
import { err, ok, type Result } from "../../core/result.ts";
import type { SessionManager } from "../../core/session-manager.ts";
import type { SettingsManager } from "../../core/settings-manager.ts";

/**
 * Callback interface for UI operations.
 */
export interface SlashCommandUICallbacks {
	showModelSelector: (searchTerm?: string) => void;
	showSettingsSelector: () => void;
	showSessionSelector: () => void;
	showTreeSelector: () => void;
	showUserMessageSelector: () => void;
	showStatus: (message: string) => void;
	showError: (message: string) => void;
	showWarning: (message: string) => void;
	updateEditorBorderColor: () => void;
	footerInvalidate: () => void;
}

/**
 * Command execution error.
 */
export interface CommandError {
	code: string;
	message: string;
	cause?: Error;
}

/**
 * Handles slash command dispatch and execution.
 */
export class SlashCommandHandler {
	private session: AgentSession;
	private sessionManager: SessionManager;
	private settingsManager: SettingsManager;
	private modelRegistry: ModelRegistry;
	private ui: SlashCommandUICallbacks;

	constructor(
		session: AgentSession,
		sessionManager: SessionManager,
		settingsManager: SettingsManager,
		modelRegistry: ModelRegistry,
		ui: SlashCommandUICallbacks,
	) {
		this.session = session;
		this.sessionManager = sessionManager;
		this.settingsManager = settingsManager;
		this.modelRegistry = modelRegistry;
		this.ui = ui;
	}

	/**
	 * Handle a slash command.
	 * Returns true if the command was handled, false otherwise.
	 */
	async handleCommand(text: string): Promise<boolean> {
		const trimmed = text.trim();

		// Model command
		if (trimmed === "/model" || trimmed.startsWith("/model ")) {
			const searchTerm = trimmed.startsWith("/model ") ? trimmed.slice(7).trim() : undefined;
			const result = await this.handleModelCommand(searchTerm);
			if (!result.ok) {
				this.ui.showError(result.error.message);
			}
			return true;
		}

		// Settings command
		if (trimmed === "/settings") {
			this.ui.showSettingsSelector();
			return true;
		}

		// Scoped models command
		if (trimmed === "/scoped-models") {
			const result = await this.showModelsSelector();
			if (!result.ok) {
				this.ui.showError(result.error.message);
			}
			return true;
		}

		// Export command
		if (trimmed === "/export" || trimmed.startsWith("/export ")) {
			const result = await this.handleExportCommand(trimmed);
			if (!result.ok) {
				this.ui.showError(result.error.message);
			}
			return true;
		}

		// Import command
		if (trimmed === "/import" || trimmed.startsWith("/import ")) {
			const result = await this.handleImportCommand(trimmed);
			if (!result.ok) {
				this.ui.showError(result.error.message);
			}
			return true;
		}

		// Share command
		if (trimmed === "/share") {
			const result = await this.handleShareCommand();
			if (!result.ok) {
				this.ui.showError(result.error.message);
			}
			return true;
		}

		// Copy command
		if (trimmed === "/copy") {
			const result = await this.handleCopyCommand();
			if (!result.ok) {
				this.ui.showError(result.error.message);
			}
			return true;
		}

		// Todo commands
		if (trimmed === "/todo") {
			this.handleTodoShowCommand();
			return true;
		}
		if (trimmed === "/clear-todo") {
			this.handleTodoClearCommand();
			return true;
		}

		// Name command
		if (trimmed === "/name" || trimmed.startsWith("/name ")) {
			const result = await this.handleNameCommand(trimmed);
			if (!result.ok) {
				this.ui.showError(result.error.message);
			}
			return true;
		}

		// Session command
		if (trimmed === "/session") {
			this.handleSessionCommand();
			return true;
		}

		// Trust command
		if (trimmed === "/trust") {
			this.handleTrustCommand();
			return true;
		}

		// Mode command
		if (trimmed === "/mode" || trimmed.startsWith("/mode ")) {
			const result = await this.handleModeCommand(trimmed);
			if (!result.ok) {
				this.ui.showError(result.error.message);
			}
			return true;
		}

		// Compact command
		if (trimmed === "/compact" || trimmed.startsWith("/compact ")) {
			const result = await this.handleCompactCommand(trimmed);
			if (!result.ok) {
				this.ui.showError(result.error.message);
			}
			return true;
		}

		// Reload command
		if (trimmed === "/reload") {
			const result = await this.handleReloadCommand();
			if (!result.ok) {
				this.ui.showError(result.error.message);
			}
			return true;
		}

		// Quit command
		if (trimmed === "/quit") {
			this.handleQuitCommand();
			return true;
		}

		// Help command
		if (trimmed === "/help") {
			this.handleHelpCommand();
			return true;
		}

		// Hotkeys command
		if (trimmed === "/hotkeys") {
			this.handleHotkeysCommand();
			return true;
		}

		// Changelog command
		if (trimmed === "/changelog") {
			this.handleChangelogCommand();
			return true;
		}

		// Diagnostics command
		if (trimmed === "/diagnostics") {
			const result = await this.handleDiagnosticsCommand();
			if (!result.ok) {
				this.ui.showError(result.error.message);
			}
			return true;
		}

		// Update command
		if (trimmed === "/update" || trimmed.startsWith("/update ")) {
			const result = await this.handleUpdateCommand(trimmed);
			if (!result.ok) {
				this.ui.showError(result.error.message);
			}
			return true;
		}

		// Logs command
		if (trimmed === "/logs" || trimmed.startsWith("/logs ")) {
			const result = await this.handleLogsCommand(trimmed);
			if (!result.ok) {
				this.ui.showError(result.error.message);
			}
			return true;
		}

		// Memory commands
		if (trimmed === "/memory" || trimmed.startsWith("/memory ")) {
			const result = await this.handleMemoryCommand(trimmed);
			if (!result.ok) {
				this.ui.showError(result.error.message);
			}
			return true;
		}

		// Skill commands
		if (trimmed.startsWith("/skill:") || trimmed.startsWith("/skill ")) {
			const result = await this.handleSkillCommand(trimmed);
			if (!result.ok) {
				this.ui.showError(result.error.message);
			}
			return true;
		}

		// Extension commands
		if (trimmed.startsWith("/")) {
			// Check for extension-registered commands
			const commandName = trimmed.slice(1).split(" ")[0];
			if (commandName) {
				const result = await this.handleExtensionCommand(commandName, trimmed);
				if (result.ok && result.value) {
					return true;
				}
			}
		}

		return false;
	}

	/**
	 * Handle the model command.
	 */
	private async handleModelCommand(searchTerm?: string): Promise<Result<void, CommandError>> {
		if (!searchTerm) {
			this.ui.showModelSelector();
			return ok(undefined);
		}

		const model = await this.findExactModelMatch(searchTerm);
		if (model) {
			try {
				await this.session.setModel(model);
				this.ui.footerInvalidate();
				this.ui.updateEditorBorderColor();
				this.ui.showStatus(`Model: ${model.id}`);
				return ok(undefined);
			} catch (error) {
				return err({
					code: "MODEL_SET_FAILED",
					message: error instanceof Error ? error.message : String(error),
					cause: error instanceof Error ? error : undefined,
				});
			}
		}

		this.ui.showModelSelector(searchTerm);
		return ok(undefined);
	}

	/**
	 * Find an exact model match for a search term.
	 */
	private async findExactModelMatch(searchTerm: string): Promise<Model<any> | undefined> {
		const models = await this.getModelCandidates();
		// This would need to be imported from model-resolver
		// For now, return undefined
		return undefined;
	}

	/**
	 * Get available model candidates.
	 */
	private async getModelCandidates(): Promise<Model<any>[]> {
		if (this.session.scopedModels.length > 0) {
			return this.session.scopedModels.map((scoped) => scoped.model);
		}

		this.modelRegistry.refresh();
		try {
			await this.modelRegistry.refreshDiscoveredModels();
			return await this.modelRegistry.getAvailable();
		} catch {
			return [];
		}
	}

	/**
	 * Show the models selector.
	 */
	private async showModelsSelector(): Promise<Result<void, CommandError>> {
		// This would need to be delegated to the UI layer
		// For now, just show a status message
		this.ui.showStatus("Scoped models selector");
		return ok(undefined);
	}

	/**
	 * Handle the export command.
	 */
	private async handleExportCommand(text: string): Promise<Result<void, CommandError>> {
		// Implementation would go here
		this.ui.showStatus("Export command");
		return ok(undefined);
	}

	/**
	 * Handle the import command.
	 */
	private async handleImportCommand(text: string): Promise<Result<void, CommandError>> {
		// Implementation would go here
		this.ui.showStatus("Import command");
		return ok(undefined);
	}

	/**
	 * Handle the share command.
	 */
	private async handleShareCommand(): Promise<Result<void, CommandError>> {
		// Implementation would go here
		this.ui.showStatus("Share command");
		return ok(undefined);
	}

	/**
	 * Handle the copy command.
	 */
	private async handleCopyCommand(): Promise<Result<void, CommandError>> {
		// Implementation would go here
		this.ui.showStatus("Copy command");
		return ok(undefined);
	}

	/**
	 * Handle the todo show command.
	 */
	private handleTodoShowCommand(): void {
		// Implementation would go here
		this.ui.showStatus("Todo show command");
	}

	/**
	 * Handle the todo clear command.
	 */
	private handleTodoClearCommand(): void {
		// Implementation would go here
		this.ui.showStatus("Todo clear command");
	}

	/**
	 * Handle the name command.
	 */
	private async handleNameCommand(text: string): Promise<Result<void, CommandError>> {
		// Implementation would go here
		this.ui.showStatus("Name command");
		return ok(undefined);
	}

	/**
	 * Handle the session command.
	 */
	private handleSessionCommand(): void {
		// Implementation would go here
		this.ui.showStatus("Session command");
	}

	/**
	 * Handle the trust command.
	 */
	private handleTrustCommand(): void {
		// Implementation would go here
		this.ui.showStatus("Trust command");
	}

	/**
	 * Handle the mode command.
	 */
	private async handleModeCommand(text: string): Promise<Result<void, CommandError>> {
		// Implementation would go here
		this.ui.showStatus("Mode command");
		return ok(undefined);
	}

	/**
	 * Handle the compact command.
	 */
	private async handleCompactCommand(text: string): Promise<Result<void, CommandError>> {
		// Implementation would go here
		this.ui.showStatus("Compact command");
		return ok(undefined);
	}

	/**
	 * Handle the reload command.
	 */
	private async handleReloadCommand(): Promise<Result<void, CommandError>> {
		// Implementation would go here
		this.ui.showStatus("Reload command");
		return ok(undefined);
	}

	/**
	 * Handle the quit command.
	 */
	private handleQuitCommand(): void {
		// Implementation would go here
		this.ui.showStatus("Quit command");
	}

	/**
	 * Handle the help command.
	 */
	private handleHelpCommand(): void {
		// Implementation would go here
		this.ui.showStatus("Help command");
	}

	/**
	 * Handle the hotkeys command.
	 */
	private handleHotkeysCommand(): void {
		// Implementation would go here
		this.ui.showStatus("Hotkeys command");
	}

	/**
	 * Handle the changelog command.
	 */
	private handleChangelogCommand(): void {
		// Implementation would go here
		this.ui.showStatus("Changelog command");
	}

	/**
	 * Handle the diagnostics command.
	 */
	private async handleDiagnosticsCommand(): Promise<Result<void, CommandError>> {
		// Implementation would go here
		this.ui.showStatus("Diagnostics command");
		return ok(undefined);
	}

	/**
	 * Handle the update command.
	 */
	private async handleUpdateCommand(text: string): Promise<Result<void, CommandError>> {
		// Implementation would go here
		this.ui.showStatus("Update command");
		return ok(undefined);
	}

	/**
	 * Handle the logs command.
	 */
	private async handleLogsCommand(text: string): Promise<Result<void, CommandError>> {
		// Implementation would go here
		this.ui.showStatus("Logs command");
		return ok(undefined);
	}

	/**
	 * Handle the memory command.
	 */
	private async handleMemoryCommand(text: string): Promise<Result<void, CommandError>> {
		// Implementation would go here
		this.ui.showStatus("Memory command");
		return ok(undefined);
	}

	/**
	 * Handle the skill command.
	 */
	private async handleSkillCommand(text: string): Promise<Result<void, CommandError>> {
		// Implementation would go here
		this.ui.showStatus("Skill command");
		return ok(undefined);
	}

	/**
	 * Handle an extension-registered command.
	 */
	private async handleExtensionCommand(commandName: string, fullText: string): Promise<Result<boolean, CommandError>> {
		// Implementation would go here
		return ok(false);
	}
}
