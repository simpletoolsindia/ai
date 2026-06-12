/**
 * Tests for ModelSelectorUI.
 */

import { describe, expect, it, vi } from "vitest";
import { ModelSelectorUI } from "../src/modes/interactive/model-selector-ui.ts";

// Mock dependencies
const mockSession = {
	model: { id: "test-model", provider: "test-provider" },
	setModel: vi.fn(),
	cycleModel: vi.fn(),
	scopedModels: [],
	modelRegistry: {
		refresh: vi.fn(),
		refreshDiscoveredModels: vi.fn(),
		getAvailable: vi.fn().mockResolvedValue([]),
	},
};

const mockSettingsManager = {
	getEnabledModels: vi.fn().mockReturnValue([]),
};

const mockModelRegistry = {
	refresh: vi.fn(),
	refreshDiscoveredModels: vi.fn(),
	getAvailable: vi.fn().mockResolvedValue([]),
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
	updateEditorBorderColor: vi.fn(),
};

describe("ModelSelectorUI", () => {
	it("should create an instance", () => {
		const ui = new ModelSelectorUI(
			mockSession as any,
			mockSettingsManager as any,
			mockModelRegistry as any,
			mockThemeProvider as any,
			mockTui as any,
			mockUI,
		);
		expect(ui).toBeDefined();
	});

	it("should show model selector", () => {
		const ui = new ModelSelectorUI(
			mockSession as any,
			mockSettingsManager as any,
			mockModelRegistry as any,
			mockThemeProvider as any,
			mockTui as any,
			mockUI,
		);

		ui.showModelSelector();
		expect(mockUI.showStatus).toHaveBeenCalledWith("Model selector");
	});

	it("should handle model command", async () => {
		const ui = new ModelSelectorUI(
			mockSession as any,
			mockSettingsManager as any,
			mockModelRegistry as any,
			mockThemeProvider as any,
			mockTui as any,
			mockUI,
		);

		const result = await ui.handleModelCommand();
		expect(result.ok).toBe(true);
		expect(mockUI.showStatus).toHaveBeenCalledWith("Model selector");
	});

	it("should cycle model forward", async () => {
		const ui = new ModelSelectorUI(
			mockSession as any,
			mockSettingsManager as any,
			mockModelRegistry as any,
			mockThemeProvider as any,
			mockTui as any,
			mockUI,
		);

		mockSession.cycleModel.mockResolvedValue({ id: "new-model", provider: "test" });
		const result = await ui.cycleModel("forward");
		expect(result.ok).toBe(true);
		expect(mockUI.showStatus).toHaveBeenCalledWith("Model: new-model");
	});

	it("should handle cycle model error", async () => {
		const ui = new ModelSelectorUI(
			mockSession as any,
			mockSettingsManager as any,
			mockModelRegistry as any,
			mockThemeProvider as any,
			mockTui as any,
			mockUI,
		);

		mockSession.cycleModel.mockRejectedValue(new Error("Cycle failed"));
		const result = await ui.cycleModel("forward");
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.code).toBe("MODEL_CYCLE_FAILED");
		}
	});

	it("should get current model", () => {
		const ui = new ModelSelectorUI(
			mockSession as any,
			mockSettingsManager as any,
			mockModelRegistry as any,
			mockThemeProvider as any,
			mockTui as any,
			mockUI,
		);

		const model = ui.getCurrentModel();
		expect(model).toEqual({ id: "test-model", provider: "test-provider" });
	});

	it("should get model registry", () => {
		const ui = new ModelSelectorUI(
			mockSession as any,
			mockSettingsManager as any,
			mockModelRegistry as any,
			mockThemeProvider as any,
			mockTui as any,
			mockUI,
		);

		const registry = ui.getModelRegistry();
		expect(registry).toBe(mockModelRegistry);
	});

	it("should get session", () => {
		const ui = new ModelSelectorUI(
			mockSession as any,
			mockSettingsManager as any,
			mockModelRegistry as any,
			mockThemeProvider as any,
			mockTui as any,
			mockUI,
		);

		const session = ui.getSession();
		expect(session).toBe(mockSession);
	});
});
