/**
 * Modern welcome screen — clean, minimal aesthetic inspired by Claude Code/Codex.
 *
 * Design principles:
 * 1. Minimalist - only essential information, no visual clutter
 * 2. Clear hierarchy - important info stands out
 * 3. Professional color palette - muted, high-contrast
 * 4. Responsive - adapts to terminal width
 * 5. Fast - no unnecessary animations or decorations
 */

import { Container, Spacer, Text, visibleWidth } from "@simpletoolsindiaorg/ai-tui";
import { FooterDataProvider } from "../../../core/footer-data-provider.ts";
import { getTodoStore, type TodoItem } from "../../../core/todo/store.ts";
import { theme } from "../theme/theme.ts";

/** Inputs the welcome screen needs from the host (interactive-mode). */
export interface ModernWelcomeInputs {
	appName: string;
	version: string;
	cwd: string;
	gitBranch: string | null | undefined;
	sessionName: string | null | undefined;
	modelLabel: string;
	mode: "plan" | "execute";
	keyText: (binding: any) => string;
	rawKeyHint: (text: string, description: string) => string;
	keyHint: (binding: any, description: string) => string;
}

const MIN_WIDTH = 40;
const MAX_WIDTH = 80;

function truncatePath(p: string, maxWidth: number): string {
	if (visibleWidth(p) <= maxWidth) return p;
	const parts = p.split(/[/\\]/).filter(Boolean);
	if (parts.length <= 2) return p;

	const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
	let displayPath = p;
	if (home && p.startsWith(home)) {
		displayPath = "~" + p.slice(home.length);
	}

	const segments = displayPath.split(/[/\\]/).filter(Boolean);
	if (segments.length <= 3) return displayPath;

	// Show first and last segments with ellipsis
	return `${segments[0]}/.../${segments[segments.length - 1]}`;
}

function formatModelLabel(label: string, maxWidth: number): string {
	if (visibleWidth(label) <= maxWidth) return label;
	// Truncate provider/model format
	const parts = label.split("/");
	if (parts.length === 2) {
		const provider = parts[0].substring(0, 3);
		return `${provider}/${parts[1]}`;
	}
	return label.substring(0, maxWidth - 3) + "...";
}

function modeIndicator(mode: "plan" | "execute"): string {
	if (mode === "plan") {
		return theme.fg("warning", "●") + theme.fg("text", " Plan") + theme.fg("dim", " (read-only)");
	}
	return theme.fg("success", "●") + theme.fg("text", " Execute") + theme.fg("dim", " (full access)");
}

function todoProgress(): string | null {
	const items = getTodoStore().getState().items;
	if (items.length === 0) return null;

	const completed = items.filter((i: TodoItem) => i.status === "completed").length;
	const inProgress = items.filter((i: TodoItem) => i.status === "in_progress").length;
	const total = items.length;
	const pct = Math.round((completed / total) * 100);

	// Simple progress bar
	const barWidth = 10;
	const filled = Math.round((pct / 100) * barWidth);
	const bar = "█".repeat(filled) + "░".repeat(barWidth - filled);

	let status = "";
	if (inProgress > 0) {
		status = theme.fg("warning", ` ${inProgress} active`);
	} else if (completed === total) {
		status = theme.fg("success", " done");
	}

	return `${bar} ${completed}/${total}${status}`;
}

export class ModernWelcomePanel extends Container {
	constructor(inputs: ModernWelcomeInputs) {
		super();
		this.build(inputs);
	}

	private build(inputs: ModernWelcomeInputs): void {
		const { appName, version, cwd, gitBranch, sessionName, modelLabel, mode } = inputs;
		const width = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, 60));

		// Top spacer
		this.addChild(new Spacer(1));

		// App name and version - simple, clean header
		const header = theme.bold(theme.fg("accent", appName)) + theme.fg("dim", ` v${version}`);
		this.addChild(new Text(header, 0, 0));

		// Session name if set
		if (sessionName) {
			this.addChild(new Text(theme.fg("muted", sessionName), 0, 0));
		}

		this.addChild(new Spacer(1));

		// Mode indicator - prominent
		this.addChild(new Text(modeIndicator(mode), 0, 0));

		// Current directory
		const displayPath = truncatePath(cwd, width - 6);
		const branchInfo = gitBranch ? theme.fg("dim", ` (${gitBranch})`) : "";
		this.addChild(new Text(theme.fg("text", displayPath) + branchInfo, 0, 0));

		// Model info
		const displayModel = formatModelLabel(modelLabel, width - 6);
		this.addChild(new Text(theme.fg("muted", displayModel), 0, 0));

		// Todo progress if active
		const todoStr = todoProgress();
		if (todoStr) {
			this.addChild(new Spacer(1));
			this.addChild(new Text(todoStr, 0, 0));
		}

		this.addChild(new Spacer(1));

		// Quick start hints - minimal, just the essentials
		const hints = [
			{ key: "Tab", desc: "switch mode" },
			{ key: "Ctrl+L", desc: "change model" },
			{ key: "/", desc: "commands" },
			{ key: "!", desc: "bash" },
		];

		const hintText = hints
			.map((h) => {
				const key = theme.fg("accent", h.key);
				const desc = theme.fg("dim", h.desc);
				return `${key} ${desc}`;
			})
			.join(theme.fg("dim", " · "));

		this.addChild(new Text(hintText, 0, 0));

		// Example prompts - very minimal
		this.addChild(new Spacer(1));
		this.addChild(new Text(theme.fg("dim", "Try:"), 0, 0));

		const examples = ['"summarize this codebase"', '"find and fix the bug in auth.ts"', '"add a /stats command"'];

		for (const example of examples) {
			this.addChild(new Text(theme.fg("muted", `  ${example}`), 0, 0));
		}
	}
}
