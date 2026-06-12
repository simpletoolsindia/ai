import type { Component } from "../tui.ts";

export type ToastLevel = "info" | "success" | "warning" | "error";

/**
 * Toast - non-blocking notification banner.
 *
 * Used for transient status messages (e.g. "Build complete", "Tests failed",
 * "File saved"). Self-dismisses after `durationMs`; can also be dismissed
 * manually via `dismiss()`. Re-render is cheap and memoized.
 */
export class Toast implements Component {
	private message: string;
	private level: ToastLevel;
	private durationMs: number;
	private createdAt: number;
	private dismissedFlag: boolean = false;
	private id: string;
	private cache?: { width: number; lines: string[] };

	constructor(message: string, level: ToastLevel = "info", durationMs: number = 3000) {
		this.message = message;
		this.level = level;
		this.durationMs = durationMs;
		this.createdAt = Date.now();
		this.id = `toast-${Math.random().toString(36).slice(2, 11)}`;
	}

	getId(): string {
		return this.id;
	}

	getLevel(): ToastLevel {
		return this.level;
	}

	getMessage(): string {
		return this.message;
	}

	getRemainingMs(): number {
		return Math.max(0, this.durationMs - (Date.now() - this.createdAt));
	}

	isExpired(): boolean {
		return this.getRemainingMs() === 0;
	}

	isDismissed(): boolean {
		return this.dismissedFlag;
	}

	dismiss(): void {
		this.dismissedFlag = true;
	}

	invalidate(): void {
		this.cache = undefined;
	}

	render(width: number): string[] {
		if (this.cache && this.cache.width === width) {
			return this.cache.lines;
		}
		const icon = this.iconFor(this.level);
		const line = ` ${icon}  ${this.message} `;
		const truncated = line.length > width ? line.slice(0, width) : line;
		const padded = truncated.padEnd(width, " ");
		this.cache = { width, lines: [padded] };
		return this.cache.lines;
	}

	private iconFor(level: ToastLevel): string {
		switch (level) {
			case "info":
				return "ⓘ";
			case "success":
				return "✓";
			case "warning":
				return "⚠";
			case "error":
				return "✗";
		}
	}
}

/**
 * ToastManager - lightweight container that tracks active toasts and
 * ticks them. UI hosts add this as a child component.
 */
export class ToastManager implements Component {
	private toasts: Toast[] = [];
	private onChange?: () => void;
	private tickInterval?: ReturnType<typeof setInterval>;
	private cache?: { width: number; lines: string[] };

	constructor(onChange?: () => void) {
		this.onChange = onChange;
	}

	add(toast: Toast): void {
		this.toasts.push(toast);
		this.invalidate();
		this.onChange?.();
	}

	remove(id: string): void {
		const before = this.toasts.length;
		this.toasts = this.toasts.filter((t) => t.getId() !== id);
		if (this.toasts.length !== before) {
			this.invalidate();
			this.onChange?.();
		}
	}

	clear(): void {
		this.toasts = [];
		this.invalidate();
		this.onChange?.();
	}

	getActive(): Toast[] {
		return this.toasts.filter((t) => !t.isDismissed());
	}

	start(): void {
		if (this.tickInterval) return;
		this.tickInterval = setInterval(() => {
			const before = this.toasts.length;
			this.toasts = this.toasts.filter((t) => !t.isExpired() && !t.isDismissed());
			if (this.toasts.length !== before) {
				this.invalidate();
				this.onChange?.();
			}
		}, 250);
	}

	stop(): void {
		if (this.tickInterval) {
			clearInterval(this.tickInterval);
			this.tickInterval = undefined;
		}
	}

	invalidate(): void {
		this.cache = undefined;
	}

	render(width: number): string[] {
		if (this.cache && this.cache.width === width) {
			return this.cache.lines;
		}
		const lines: string[] = [];
		for (const toast of this.getActive()) {
			lines.push(...toast.render(width));
		}
		this.cache = { width, lines };
		return lines;
	}
}
