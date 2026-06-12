import type { Component } from "../tui.ts";

export interface BreadcrumbItem {
	label: string;
	href?: string; // logical id only - no URL handling
}

export interface BreadcrumbTheme {
	fg?: (text: string) => string;
	dim?: (text: string) => string;
	accent?: (text: string) => string;
	separator?: string;
}

/**
 * Breadcrumb - simple separator-joined path display.
 *
 * Example: "Project › src › utils › tui". Renders into a single line,
 * truncating the middle if the path is wider than `width` and a
 * `maxItems` value is provided.
 */
export class Breadcrumb implements Component {
	private items: BreadcrumbItem[];
	private theme: BreadcrumbTheme;
	private maxItems: number;
	private cache?: { width: number; key: string; lines: string[] };

	constructor(options: { items: BreadcrumbItem[]; theme?: BreadcrumbTheme; maxItems?: number }) {
		this.items = options.items;
		this.theme = options.theme ?? {};
		this.maxItems = options.maxItems ?? 0;
	}

	setItems(items: BreadcrumbItem[]): void {
		this.items = items;
		this.invalidate();
	}

	invalidate(): void {
		this.cache = undefined;
	}

	render(width: number): string[] {
		const key = this.items.map((i) => i.label).join(">");
		if (this.cache && this.cache.width === width && this.cache.key === key) {
			return this.cache.lines;
		}
		const separator = this.theme.separator ?? " › ";
		let visible = this.items;
		if (this.maxItems > 0 && this.items.length > this.maxItems) {
			visible = [this.items[0]!, { label: "…" }, ...this.items.slice(this.items.length - this.maxItems + 1)];
		}
		const fg = this.theme.fg ?? ((s: string) => s);
		const dim = this.theme.dim ?? fg;
		const accent = this.theme.accent ?? fg;
		const parts = visible.map((item, idx) => {
			const isFirst = idx === 0;
			const isLast = idx === visible.length - 1;
			const label = isLast ? accent(item.label) : isFirst ? fg(item.label) : dim(item.label);
			return label;
		});
		let line = parts.join(separator);
		if (line.length > width) {
			line = `…${line.slice(line.length - Math.max(0, width - 1))}`;
		} else {
			line = line.padEnd(width, " ");
		}
		this.cache = { width, key, lines: [line] };
		return this.cache.lines;
	}
}
