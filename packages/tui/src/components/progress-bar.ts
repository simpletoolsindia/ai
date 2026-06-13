import type { Component } from "../tui.ts";

export type ProgressBarStyle = "block" | "thin" | "ascii";

/**
 * ProgressBar - horizontal progress indicator.
 *
 * Renders a filled bar with optional label and percentage. Memoized for
 * cheap re-render. Caller is responsible for `setProgress` / `setLabel`
 * updates and for triggering an invalidation on the parent.
 */
export class ProgressBar implements Component {
	private value: number = 0; // 0..1
	private label?: string;
	private showPercent: boolean;
	private style: ProgressBarStyle;
	private width: number;
	private cache?: { width: number; value: number; label: string | undefined; lines: string[] };

	constructor(
		options: {
			width?: number;
			label?: string;
			showPercent?: boolean;
			style?: ProgressBarStyle;
		} = {},
	) {
		this.width = options.width ?? 30;
		this.label = options.label;
		this.showPercent = options.showPercent ?? true;
		this.style = options.style ?? "block";
	}

	setProgress(value: number, label?: string): void {
		this.value = Math.max(0, Math.min(1, value));
		if (label !== undefined) this.label = label;
		this.invalidate();
	}

	getProgress(): number {
		return this.value;
	}

	setWidth(width: number): void {
		if (width !== this.width) {
			this.width = width;
			this.invalidate();
		}
	}

	invalidate(): void {
		this.cache = undefined;
	}

	render(width: number): string[] {
		const label = this.label;
		if (this.cache && this.cache.width === width && this.cache.value === this.value && this.cache.label === label) {
			return this.cache.lines;
		}
		const chars = this.glyphs(this.style);
		const percentText = this.showPercent ? ` ${Math.round(this.value * 100)}%` : "";
		const reserved = percentText.length;
		const barWidth = Math.max(1, width - reserved);
		const filled = Math.round(this.value * barWidth);
		const empty = Math.max(0, barWidth - filled);
		const bar = chars.filled.repeat(filled) + chars.empty.repeat(empty);
		const line = `${bar}${percentText}`;
		this.cache = { width, value: this.value, label, lines: [line] };
		return this.cache.lines;
	}

	private glyphs(style: ProgressBarStyle): { filled: string; empty: string } {
		switch (style) {
			case "ascii":
				return { filled: "#", empty: "-" };
			case "thin":
				return { filled: "━", empty: "─" };
			default:
				return { filled: "█", empty: "░" };
		}
	}
}
