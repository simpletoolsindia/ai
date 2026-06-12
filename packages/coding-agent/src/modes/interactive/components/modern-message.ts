/**
 * Modern message components — clean, readable message display.
 *
 * Design principles:
 * 1. Clear separation between different message types
 * 2. Consistent spacing and alignment
 * 3. Subtle visual cues without being distracting
 * 4. Efficient rendering with minimal allocations
 */

import { type Component, truncateToWidth, visibleWidth } from "@simpletoolsindiaorg/ai-tui";
import { theme } from "../theme/theme.ts";

export type MessageType = "user" | "assistant" | "system" | "tool" | "error" | "success";

export interface ModernMessageOptions {
	/** Message type determines styling */
	type: MessageType;
	/** Message content */
	content: string;
	/** Optional label (e.g., tool name, username) */
	label?: string;
	/** Whether to show a border */
	showBorder?: boolean;
	/** Whether to indent content */
	indent?: boolean;
	/** Maximum width for the message */
	maxWidth?: number;
	/** Whether the message is collapsed */
	collapsed?: boolean;
}

/**
 * Get colors for message type.
 */
function getMessageColors(type: MessageType): { bg: string; text: string; border: string; label: string } {
	switch (type) {
		case "user":
			return {
				bg: "userMessageBg",
				text: "userMessageText",
				border: "border",
				label: "accent",
			};
		case "assistant":
			return {
				bg: "surface",
				text: "text",
				border: "borderMuted",
				label: "muted",
			};
		case "system":
			return {
				bg: "surface",
				text: "muted",
				border: "borderMuted",
				label: "dim",
			};
		case "tool":
			return {
				bg: "toolPendingBg",
				text: "toolOutput",
				border: "borderMuted",
				label: "toolTitle",
			};
		case "error":
			return {
				bg: "toolErrorBg",
				text: "error",
				border: "error",
				label: "error",
			};
		case "success":
			return {
				bg: "toolSuccessBg",
				text: "success",
				border: "success",
				label: "success",
			};
		default:
			return {
				bg: "surface",
				text: "text",
				border: "borderMuted",
				label: "muted",
			};
	}
}

/**
 * Modern message component with clean styling.
 */
export class ModernMessage implements Component {
	private type: MessageType;
	private content: string;
	private label: string | undefined;
	private showBorder: boolean;
	private indent: boolean;
	private maxWidth: number;
	private collapsed: boolean;

	constructor(options: ModernMessageOptions) {
		this.type = options.type;
		this.content = options.content;
		this.label = options.label;
		this.showBorder = options.showBorder ?? false;
		this.indent = options.indent ?? true;
		this.maxWidth = options.maxWidth ?? 80;
		this.collapsed = options.collapsed ?? false;
	}

	/**
	 * Set collapsed state.
	 */
	setCollapsed(collapsed: boolean): void {
		this.collapsed = collapsed;
	}

	render(width: number): string[] {
		const colors = getMessageColors(this.type);
		const effectiveWidth = Math.min(width, this.maxWidth);
		const lines: string[] = [];

		// Label line (if present)
		if (this.label) {
			const labelLine = theme.fg(colors.label, this.label);
			lines.push(labelLine);
		}

		// Content
		if (this.collapsed) {
			// Show only first line when collapsed
			const firstLine = this.content.split("\n")[0] ?? "";
			const truncated =
				firstLine.length > effectiveWidth - 4 ? firstLine.substring(0, effectiveWidth - 7) + "..." : firstLine;
			lines.push(theme.fg(colors.text, truncated));
		} else {
			// Split content into lines and apply styling
			const contentLines = this.content.split("\n");
			for (const line of contentLines) {
				if (this.indent) {
					lines.push(theme.fg(colors.text, `  ${line}`));
				} else {
					lines.push(theme.fg(colors.text, line));
				}
			}
		}

		return lines;
	}

	invalidate(): void {
		// No-op
	}
}

/**
 * Tool execution message with status indicator.
 */
export class ModernToolMessage implements Component {
	private toolName: string;
	private status: "pending" | "running" | "success" | "error";
	private content: string;
	private duration: number | undefined;
	private collapsed: boolean;
	private frameIndex = 0;
	private timer: ReturnType<typeof setInterval> | null = null;
	private onUpdate: (() => void) | null = null;

	constructor(options: {
		toolName: string;
		status: "pending" | "running" | "success" | "error";
		content?: string;
		duration?: number;
		collapsed?: boolean;
	}) {
		this.toolName = options.toolName;
		this.status = options.status;
		this.content = options.content ?? "";
		this.duration = options.duration;
		this.collapsed = options.collapsed ?? true;
	}

	setUpdateCallback(callback: () => void): void {
		this.onUpdate = callback;
		if (this.status === "running") {
			this.startAnimation();
		}
	}

	setStatus(status: "pending" | "running" | "success" | "error"): void {
		if (this.status !== status) {
			this.status = status;
			if (status === "running") {
				this.startAnimation();
			} else {
				this.stopAnimation();
			}
			this.onUpdate?.();
		}
	}

	setContent(content: string): void {
		if (this.content !== content) {
			this.content = content;
			this.onUpdate?.();
		}
	}

	setDuration(duration: number): void {
		this.duration = duration;
		this.onUpdate?.();
	}

	setCollapsed(collapsed: boolean): void {
		if (this.collapsed !== collapsed) {
			this.collapsed = collapsed;
			this.onUpdate?.();
		}
	}

	private startAnimation(): void {
		if (this.timer) return;
		this.timer = setInterval(() => {
			this.frameIndex = (this.frameIndex + 1) % 4;
			this.onUpdate?.();
		}, 150);
	}

	private stopAnimation(): void {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
		}
	}

	private getStatusIcon(): string {
		switch (this.status) {
			case "pending":
				return theme.fg("dim", "○");
			case "running": {
				const frames = ["◐", "◓", "◑", "◒"];
				return theme.fg("accent", frames[this.frameIndex]);
			}
			case "success":
				return theme.fg("success", "●");
			case "error":
				return theme.fg("error", "●");
			default:
				return theme.fg("dim", "○");
		}
	}

	private formatDuration(): string {
		if (this.duration === undefined) return "";
		if (this.duration < 1000) return `${this.duration}ms`;
		return `${(this.duration / 1000).toFixed(1)}s`;
	}

	render(width: number): string[] {
		const lines: string[] = [];
		const icon = this.getStatusIcon();
		const name = theme.fg("text", this.toolName);
		const duration = this.formatDuration();
		const durationStr = duration ? theme.fg("dim", ` ${duration}`) : "";

		// Header line
		lines.push(`${icon} ${name}${durationStr}`);

		// Content (if not collapsed)
		if (!this.collapsed && this.content) {
			const contentLines = this.content.split("\n").slice(0, 5); // Limit to 5 lines
			for (const line of contentLines) {
				const truncated = line.length > width - 4 ? line.substring(0, width - 7) + "..." : line;
				lines.push(theme.fg("toolOutput", `  ${truncated}`));
			}

			if (this.content.split("\n").length > 5) {
				lines.push(theme.fg("dim", "  ..."));
			}
		}

		return lines;
	}

	invalidate(): void {
		// No-op
	}

	dispose(): void {
		this.stopAnimation();
	}
}

/**
 * User message component with clean styling.
 */
export class ModernUserMessage implements Component {
	private content: string;
	private timestamp: Date;

	constructor(content: string) {
		this.content = content;
		this.timestamp = new Date();
	}

	render(width: number): string[] {
		const lines: string[] = [];
		const contentLines = this.content.split("\n");

		for (const line of contentLines) {
			// Wrap long lines
			if (visibleWidth(line) > width - 2) {
				// Simple word wrap
				const words = line.split(" ");
				let currentLine = "";
				for (const word of words) {
					if (visibleWidth(`${currentLine} ${word}`.trim()) > width - 2) {
						if (currentLine) {
							lines.push(theme.fg("userMessageText", currentLine));
						}
						currentLine = word;
					} else {
						currentLine = currentLine ? `${currentLine} ${word}` : word;
					}
				}
				if (currentLine) {
					lines.push(theme.fg("userMessageText", currentLine));
				}
			} else {
				lines.push(theme.fg("userMessageText", line));
			}
		}

		return lines;
	}

	invalidate(): void {
		// No-op
	}
}

/**
 * Assistant message component with streaming support.
 */
export class ModernAssistantMessage implements Component {
	private content: string;
	private isStreaming: boolean;
	private thinkingContent: string | undefined;
	private showThinking: boolean;

	constructor(
		options: {
			content?: string;
			isStreaming?: boolean;
			thinkingContent?: string;
			showThinking?: boolean;
		} = {},
	) {
		this.content = options.content ?? "";
		this.isStreaming = options.isStreaming ?? false;
		this.thinkingContent = options.thinkingContent;
		this.showThinking = options.showThinking ?? false;
	}

	setContent(content: string): void {
		this.content = content;
	}

	setStreaming(streaming: boolean): void {
		this.isStreaming = streaming;
	}

	setThinkingContent(content: string): void {
		this.thinkingContent = content;
	}

	setShowThinking(show: boolean): void {
		this.showThinking = show;
	}

	render(width: number): string[] {
		const lines: string[] = [];

		// Thinking content (collapsible)
		if (this.showThinking && this.thinkingContent) {
			lines.push(theme.fg("thinkingText", "💭 Thinking..."));
			const thinkingLines = this.thinkingContent.split("\n").slice(0, 3);
			for (const line of thinkingLines) {
				lines.push(theme.fg("thinkingText", `  ${line}`));
			}
			if (this.thinkingContent.split("\n").length > 3) {
				lines.push(theme.fg("dim", "  ..."));
			}
			lines.push(""); // Spacer
		}

		// Main content
		if (this.content) {
			const contentLines = this.content.split("\n");
			for (const line of contentLines) {
				lines.push(theme.fg("text", line));
			}
		} else if (this.isStreaming) {
			lines.push(theme.fg("dim", "..."));
		}

		return lines;
	}

	invalidate(): void {
		// No-op
	}
}
