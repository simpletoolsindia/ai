/**
 * Modern loader component — smooth, minimal loading indicators.
 *
 * Design principles:
 * 1. Smooth animations - fluid transitions, no jarring changes
 * 2. Minimal footprint - small, unobtrusive
 * 3. Informative - show what's happening
 * 4. Performance - efficient rendering, no unnecessary updates
 */

import { type Component, CURSOR_MARKER, type Focusable, visibleWidth } from "@simpletoolsindiaorg/ai-tui";
import { theme } from "../theme/theme.ts";

/** Animation frame definitions */
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const DOTS_FRAMES = ["⣾", "⣽", "⣻", "⢿", "⡿", "⣟", "⣯", "⣷"];
const PULSE_FRAMES = ["◐", "◓", "◑", "◒"];

export type LoaderStyle = "spinner" | "dots" | "pulse" | "minimal";

export interface ModernLoaderOptions {
	/** Animation style */
	style?: LoaderStyle;
	/** Text to display alongside animation */
	text?: string;
	/** Whether to show elapsed time */
	showTime?: boolean;
	/** Animation speed in ms */
	speed?: number;
	/** Color for the animation */
	color?: string;
	/** Whether to show a progress bar */
	showProgress?: boolean;
	/** Progress value 0-100 */
	progress?: number;
}

/**
 * Modern loader component with smooth animations.
 */
export class ModernLoader implements Component {
	private style: LoaderStyle;
	private text: string;
	private showTime: boolean;
	private speed: number;
	private color: string;
	private showProgress: boolean;
	private progress: number;

	private frameIndex = 0;
	private startTime = Date.now();
	private lastUpdateTime = 0;
	private animationTimer: ReturnType<typeof setInterval> | null = null;
	private onUpdate: (() => void) | null = null;

	constructor(options: ModernLoaderOptions = {}) {
		this.style = options.style ?? "spinner";
		this.text = options.text ?? "";
		this.showTime = options.showTime ?? false;
		this.speed = options.speed ?? 80;
		this.color = options.color ?? "accent";
		this.showProgress = options.showProgress ?? false;
		this.progress = options.progress ?? 0;
	}

	/**
	 * Set update callback for animation.
	 */
	setUpdateCallback(callback: () => void): void {
		this.onUpdate = callback;
		this.startAnimation();
	}

	/**
	 * Update loader text.
	 */
	setText(text: string): void {
		if (this.text !== text) {
			this.text = text;
			this.onUpdate?.();
		}
	}

	/**
	 * Update progress value.
	 */
	setProgress(progress: number): void {
		const clamped = Math.max(0, Math.min(100, progress));
		if (this.progress !== clamped) {
			this.progress = clamped;
			this.onUpdate?.();
		}
	}

	/**
	 * Start animation loop.
	 */
	private startAnimation(): void {
		if (this.animationTimer) return;

		this.animationTimer = setInterval(() => {
			this.frameIndex = (this.frameIndex + 1) % this.getFrameCount();
			this.onUpdate?.();
		}, this.speed);
	}

	/**
	 * Stop animation loop.
	 */
	stopAnimation(): void {
		if (this.animationTimer) {
			clearInterval(this.animationTimer);
			this.animationTimer = null;
		}
	}

	/**
	 * Get animation frames for current style.
	 */
	private getFrames(): string[] {
		switch (this.style) {
			case "spinner":
				return SPINNER_FRAMES;
			case "dots":
				return DOTS_FRAMES;
			case "pulse":
				return PULSE_FRAMES;
			case "minimal":
				return ["·", "✢", "·"];
			default:
				return SPINNER_FRAMES;
		}
	}

	/**
	 * Get frame count for current style.
	 */
	private getFrameCount(): number {
		return this.getFrames().length;
	}

	/**
	 * Format elapsed time.
	 */
	private formatElapsed(): string {
		const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
		if (elapsed < 60) return `${elapsed}s`;
		const minutes = Math.floor(elapsed / 60);
		const seconds = elapsed % 60;
		return `${minutes}m${seconds.toString().padStart(2, "0")}s`;
	}

	/**
	 * Render progress bar.
	 */
	private renderProgressBar(width: number): string {
		const barWidth = Math.min(20, width - 10);
		const filled = Math.round((this.progress / 100) * barWidth);
		const empty = barWidth - filled;

		const bar = theme.fg(this.color, "█".repeat(filled)) + theme.fg("dim", "░".repeat(empty));
		const percent = theme.fg("text", `${this.progress}%`);

		return `${bar} ${percent}`;
	}

	render(width: number): string[] {
		const frames = this.getFrames();
		const frame = frames[this.frameIndex % frames.length];

		// Build components
		const parts: string[] = [];

		// Animation frame
		parts.push(theme.fg(this.color, frame));

		// Text
		if (this.text) {
			parts.push(theme.fg("text", this.text));
		}

		// Elapsed time
		if (this.showTime) {
			parts.push(theme.fg("dim", this.formatElapsed()));
		}

		// Progress bar
		if (this.showProgress) {
			parts.push(this.renderProgressBar(width - visibleWidth(parts.join(" ")) - 2));
		}

		const line = parts.join(" ");

		// Truncate if needed
		if (visibleWidth(line) > width) {
			return [line.substring(0, width)];
		}

		return [line];
	}

	invalidate(): void {
		// No-op
	}

	/**
	 * Clean up resources.
	 */
	dispose(): void {
		this.stopAnimation();
	}
}

/**
 * Simple spinner component for quick operations.
 */
export class SimpleSpinner implements Component {
	private frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
	private frameIndex = 0;
	private text: string;
	private color: string;
	private timer: ReturnType<typeof setInterval> | null = null;
	private onUpdate: (() => void) | null = null;

	constructor(text: string = "", color: string = "accent") {
		this.text = text;
		this.color = color;
	}

	setUpdateCallback(callback: () => void): void {
		this.onUpdate = callback;
		this.start();
	}

	setText(text: string): void {
		if (this.text !== text) {
			this.text = text;
			this.onUpdate?.();
		}
	}

	private start(): void {
		if (this.timer) return;
		this.timer = setInterval(() => {
			this.frameIndex = (this.frameIndex + 1) % this.frames.length;
			this.onUpdate?.();
		}, 80);
	}

	stop(): void {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
		}
	}

	render(width: number): string[] {
		const frame = this.frames[this.frameIndex];
		const text = this.text ? ` ${this.text}` : "";
		const line = theme.fg(this.color, frame) + theme.fg("text", text);

		if (visibleWidth(line) > width) {
			return [line.substring(0, width)];
		}

		return [line];
	}

	invalidate(): void {
		// No-op
	}

	dispose(): void {
		this.stop();
	}
}

/**
 * Progress bar component for determinate operations.
 */
export class ProgressBar implements Component {
	private value: number;
	private maxValue: number;
	private width: number;
	private showPercent: boolean;
	private color: string;
	private label: string;

	constructor(
		options: {
			value?: number;
			maxValue?: number;
			width?: number;
			showPercent?: boolean;
			color?: string;
			label?: string;
		} = {},
	) {
		this.value = options.value ?? 0;
		this.maxValue = options.maxValue ?? 100;
		this.width = options.width ?? 30;
		this.showPercent = options.showPercent ?? true;
		this.color = options.color ?? "accent";
		this.label = options.label ?? "";
	}

	setValue(value: number): void {
		this.value = Math.max(0, Math.min(this.maxValue, value));
	}

	render(width: number): string[] {
		const percent = Math.round((this.value / this.maxValue) * 100);
		const filled = Math.round((percent / 100) * this.width);
		const empty = this.width - filled;

		const bar = theme.fg(this.color, "█".repeat(filled)) + theme.fg("dim", "░".repeat(empty));
		const percentStr = this.showPercent ? ` ${percent}%` : "";
		const labelStr = this.label ? `${this.label} ` : "";

		const line = `${labelStr}${bar}${percentStr}`;

		if (visibleWidth(line) > width) {
			return [line.substring(0, width)];
		}

		return [line];
	}

	invalidate(): void {
		// No-op
	}
}
