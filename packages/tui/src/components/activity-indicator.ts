import type { Component, TUI } from "../tui.ts";

const DEFAULT_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const DEFAULT_INTERVAL_MS = 80;

export interface ActivityIndicatorTheme {
	fg?: (text: string) => string;
	dim?: (text: string) => string;
}

/**
 * ActivityIndicator - simple animated status spinner with optional
 * inline text. Self-contained, drives its own animation loop.
 *
 * Used for "working" / "thinking" / "loading" states. Callers can swap
 * frames, change color, or change the message at runtime.
 */
export class ActivityIndicator implements Component {
	private ui: TUI | null;
	private frames: string[];
	private intervalMs: number;
	private currentFrame: number = 0;
	private intervalId: ReturnType<typeof setInterval> | null = null;
	private message: string;
	private theme: ActivityIndicatorTheme;
	private cache?: { width: number; frame: string; message: string; lines: string[] };

	constructor(
		options: {
			ui?: TUI;
			message?: string;
			frames?: string[];
			intervalMs?: number;
			theme?: ActivityIndicatorTheme;
		} = {},
	) {
		this.ui = options.ui ?? null;
		this.frames = options.frames ?? [...DEFAULT_FRAMES];
		this.intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
		this.message = options.message ?? "";
		this.theme = options.theme ?? {};
	}

	setMessage(message: string): void {
		this.message = message;
		this.invalidate();
	}

	getMessage(): string {
		return this.message;
	}

	setFrames(frames: string[]): void {
		this.frames = frames;
		this.currentFrame = 0;
		this.restartAnimation();
		this.invalidate();
	}

	start(): void {
		this.restartAnimation();
		this.invalidate();
	}

	stop(): void {
		if (this.intervalId) {
			clearInterval(this.intervalId);
			this.intervalId = null;
		}
	}

	invalidate(): void {
		this.cache = undefined;
	}

	render(width: number): string[] {
		const frame = this.frames[this.currentFrame] ?? "";
		if (
			this.cache &&
			this.cache.width === width &&
			this.cache.frame === frame &&
			this.cache.message === this.message
		) {
			return this.cache.lines;
		}
		const line = frame
			? `${frame} ${this.message}`.padEnd(width, " ").slice(0, width)
			: this.message.padEnd(width, " ").slice(0, width);
		const fg = this.theme.fg;
		const out = fg ? fg(line) : line;
		this.cache = { width, frame, message: this.message, lines: [out] };
		return this.cache.lines;
	}

	private restartAnimation(): void {
		this.stop();
		if (this.frames.length <= 1) return;
		this.intervalId = setInterval(() => {
			this.currentFrame = (this.currentFrame + 1) % this.frames.length;
			this.invalidate();
			if (this.ui) this.ui.requestRender();
		}, this.intervalMs);
	}
}
