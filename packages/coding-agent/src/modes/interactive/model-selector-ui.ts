/**
 * ModelSelectorUI - Handles model selection UI operations.
 *
 * Extracted from InteractiveMode to improve separation of concerns
 * and make the codebase more maintainable.
 */

import type { Model } from "@simpletoolsindiaorg/ai-provider";
import type { OverlayHandle, TUI } from "@simpletoolsindiaorg/ai-tui";
import type { AgentSession } from "../../core/agent-session.ts";
import type { ModelRegistry } from "../../core/model-registry.ts";
import { err, ok, type Result } from "../../core/result.ts";
import type { SettingsManager } from "../../core/settings-manager.ts";
import type { ThemeProvider } from "../../core/theme-provider.ts";

/**
 * Callback interface for model selector UI operations.
 */
export interface ModelSelectorUICallbacks {
	showStatus: (message: string) => void;
	showError: (message: string) => void;
	showWarning: (message: string) => void;
	requestRender: () => void;
	footerInvalidate: () => void;
	updateEditorBorderColor: () => void;
}

/**
 * Model selector error types.
 */
export interface ModelSelectorError {
	code: string;
	message: string;
	cause?: Error;
}

/**
 * Manages model selection UI operations.
 */
export class ModelSelectorUI {
	private session: AgentSession;
	private settingsManager: SettingsManager;
	private modelRegistry: ModelRegistry;
	private themeProvider: ThemeProvider;
	private tui: TUI;
	private ui: ModelSelectorUICallbacks;
	private currentOverlay: OverlayHandle | null = null;

	constructor(
		session: AgentSession,
		settingsManager: SettingsManager,
		modelRegistry: ModelRegistry,
		themeProvider: ThemeProvider,
		tui: TUI,
		ui: ModelSelectorUICallbacks,
	) {
		this.session = session;
		this.settingsManager = settingsManager;
		this.modelRegistry = modelRegistry;
		this.themeProvider = themeProvider;
		this.tui = tui;
		this.ui = ui;
	}

	/**
	 * Show the model selector overlay.
	 */
	showModelSelector(initialSearchInput?: string): void {
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
	 * Show the scoped models selector overlay.
	 */
	async showModelsSelector(): Promise<Result<void, ModelSelectorError>> {
		// Close existing overlay if open
		if (this.currentOverlay) {
			this.currentOverlay.hide();
			this.currentOverlay = null;
		}

		// Get all available models
		this.modelRegistry.refresh();
		const allModels = this.modelRegistry.getAvailable();

		if (allModels.length === 0) {
			return err({
				code: "NO_MODELS",
				message: "No models available",
			});
		}

		// Check if session has scoped models (from previous session-only changes or CLI --models)
		const sessionScopedModels = this.session.scopedModels;
		const hasSessionScope = sessionScopedModels.length > 0;

		// Build enabled model IDs from session state or settings
		let currentEnabledIds: string[] | null = null;

		if (hasSessionScope) {
			// Use current session's scoped models
			currentEnabledIds = sessionScopedModels.map((scoped) => `${scoped.model.provider}/${scoped.model.id}`);
		} else {
			// Fall back to settings
			const patterns = this.settingsManager.getEnabledModels();
			if (patterns !== undefined && patterns.length > 0) {
				// This would need to be imported from model-resolver
				// For now, we'll skip this part
				currentEnabledIds = null;
			}
		}

		// Implementation would go here
		// This would create a scoped models selector component and show it as an overlay
		this.ui.showStatus("Scoped models selector");
		return ok(undefined);
	}

	/**
	 * Cycle through models in the specified direction.
	 */
	async cycleModel(direction: "forward" | "backward"): Promise<Result<void, ModelSelectorError>> {
		try {
			const result = await this.session.cycleModel(direction);
			if (result) {
				this.ui.footerInvalidate();
				this.ui.updateEditorBorderColor();
				this.ui.showStatus(`Model: ${result.id}`);
			}
			return ok(undefined);
		} catch (error) {
			return err({
				code: "MODEL_CYCLE_FAILED",
				message: error instanceof Error ? error.message : String(error),
				cause: error instanceof Error ? error : undefined,
			});
		}
	}

	/**
	 * Handle the model command.
	 */
	async handleModelCommand(searchTerm?: string): Promise<Result<void, ModelSelectorError>> {
		if (!searchTerm) {
			this.showModelSelector();
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

		this.showModelSelector(searchTerm);
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
	 * Update the available provider count.
	 */
	private async updateAvailableProviderCount(): Promise<void> {
		const models = await this.getModelCandidates();
		const uniqueProviders = new Set(models.map((m) => m.provider));
		// This would need to be delegated to the footer data provider
		// For now, we'll skip this part
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
	 * Get the current model.
	 */
	getCurrentModel(): Model<any> | undefined {
		return this.session.model;
	}

	/**
	 * Get the model registry.
	 */
	getModelRegistry(): ModelRegistry {
		return this.modelRegistry;
	}

	/**
	 * Get the session.
	 */
	getSession(): AgentSession {
		return this.session;
	}
}
