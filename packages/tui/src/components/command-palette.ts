import type { Component } from "../tui.ts";
import { fuzzyFilter } from "../fuzzy.ts";

export interface CommandPaletteItem {
	id: string;
	label: string;
	description?: string;
	shortcut?: string;
	category?: string;
	keywords?: string[];
}

export interface CommandPaletteTheme {
	bg?: (text: string) => string;
	fg?: (text: string) => string;
	selectedBg?: (text: string) => string;
	selectedFg?: (text: string) => string;
	dim?: (text: string) => string;
	border?: (text: string) => string;
	accent?: (text: string) => string;
}

/**
 * CommandPalette - searchable, keyboard-driven command launcher.
 *
 * `Ctrl+P`-style palette. Caller passes a list of items; the palette
 * filters them with fuzzy matching, renders them, and invokes `onSelect`
 * when the user picks one. Hidden by default; `show()` / `hide()` toggle.
 */
export class CommandPalette implements Component {
	private items: CommandPaletteItem[];
	private query: string = "";
	private selectedIndex: number = 0;
	private visible: boolean = false;
	private theme: CommandPaletteTheme;
	private onSelect: (item: CommandPaletteItem) => void;
	private onClose: () => void;
	private maxVisible: number = 8;
	private cache?: { width: number; query: string; selected: number; lines: string[] };

	constructor(options: {
		items: CommandPaletteItem[];
		theme?: CommandPaletteTheme;
		onSelect: (item: CommandPaletteItem) => void;
		onClose: () => void;
	}) {
		this.items = options.items;
		this.theme = options.theme ?? {};
		this.onSelect = options.onSelect;
		this.onClose = options.onClose;
	}

	setItems(items: CommandPaletteItem[]): void {
		this.items = items;
		this.selectedIndex = 0;
		this.invalidate();
	}

	isVisible(): boolean {
		return this.visible;
	}

	show(): void {
		this.visible = true;
		this.query = "";
		this.selectedIndex = 0;
		this.invalidate();
	}

	hide(): void {
		this.visible = false;
		this.invalidate();
	}

	setQuery(query: string): void {
		this.query = query;
		this.selectedIndex = 0;
		this.invalidate();
	}

	getQuery(): string {
		return this.query;
	}

	getSelectedItem(): CommandPaletteItem | undefined {
		return this.getFilteredItems()[this.selectedIndex];
	}

	getFilteredItems(): CommandPaletteItem[] {
		if (!this.query) return this.items;
		return fuzzyFilter(this.items, this.query, (item) => {
			const terms = [item.label, item.category ?? "", ...(item.keywords ?? [])];
			return terms.join(" ");
		});
	}

	moveSelection(delta: number): void {
		const filtered = this.getFilteredItems();
		if (filtered.length === 0) return;
		this.selectedIndex = (this.selectedIndex + delta + filtered.length) % filtered.length;
		this.invalidate();
	}

	confirm(): void {
		const item = this.getSelectedItem();
		if (item) {
			this.onSelect(item);
			this.hide();
		}
	}

	cancel(): void {
		this.hide();
		this.onClose();
	}

	invalidate(): void {
		this.cache = undefined;
	}

	render(width: number): string[] {
		if (!this.visible) return [];
		if (this.cache && this.cache.width === width && this.cache.query === this.query && this.cache.selected === this.selectedIndex) {
			return this.cache.lines;
		}

		const filtered = this.getFilteredItems();
		const lines: string[] = [];
		const prompt = " > ";
		const queryLine = `${prompt}${this.query}`.padEnd(width, " ");
		lines.push(this.applyBg(queryLine, width));

		const separator = "─".repeat(width);
		lines.push(this.applyDim(separator, width));

		const visible = filtered.slice(0, this.maxVisible);
		if (visible.length === 0) {
			lines.push(this.applyDim("  No matches".padEnd(width, " "), width));
		} else {
			for (let i = 0; i < visible.length; i++) {
				const item = visible[i]!;
				const isSelected = i === this.selectedIndex;
				const shortcut = item.shortcut ? `  ${item.shortcut}` : "";
				const line = `  ${item.label}${shortcut}`;
				const desc = item.description ? `  ${item.description}` : "";
				const full = (line + desc).slice(0, width).padEnd(width, " ");
				if (isSelected) {
					lines.push(this.applySelectedBg(full, width));
				} else {
					lines.push(this.applyDim(full, width));
				}
			}
		}

		this.cache = { width, query: this.query, selected: this.selectedIndex, lines };
		return lines;
	}

	private applyBg(text: string, width: number): string {
		const fn = this.theme.bg ?? this.theme.fg;
		if (!fn) return text.padEnd(width, " ").slice(0, width);
		return fn(text.padEnd(width, " ").slice(0, width));
	}
	private applyDim(text: string, width: number): string {
		const fn = this.theme.dim ?? this.theme.fg;
		const padded = text.padEnd(width, " ").slice(0, width);
		return fn ? fn(padded) : padded;
	}
	private applySelectedBg(text: string, width: number): string {
		const fg = this.theme.selectedFg ?? this.theme.fg;
		const bg = this.theme.selectedBg;
		const padded = text.padEnd(width, " ").slice(0, width);
		if (bg) return bg(padded);
		if (fg) return fg(padded);
		return padded;
	}
}
