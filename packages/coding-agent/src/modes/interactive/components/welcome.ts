/**
 * Welcome screen — a polished, modern TUI panel shown on first launch.
 *
 * Design notes
 * ------------
 * The welcome screen is the user's first impression. We optimize for
 * three goals in order:
 *
 *   1. **Brand identity** — a multi-line ASCII logo so the user
 *      immediately knows what tool they're in. Uses the theme accent
 *      color and a secondary color for the tagline.
 *   2. **Live status** — mode (PLAN/EXECUTE), model, working directory,
 *      git branch, and todo progress. This answers "what state am I
 *      in?" before the user types a thing.
 *   3. **Discoverability** — a compact keybinding strip and a few
 *      quick-start example prompts. Both the model picker and the
 *      help screen are one keystroke away.
 *
 * The screen is composed of multiple Text components inside a
 * Container, so each section can have its own padding and the user
 * gets a real, layered TUI panel rather than a wall of text.
 *
 * The screen is a passive renderer — it reads from the session, the
 * settings, the todo store, and the footer-data-provider. Updates
 * happen when the agent state changes (mode toggle, model change,
 * todo update). The TUI re-render is debounced via the host's
 * `requestRender()`.
 */

import { Container, Spacer, Text } from "@simpletoolsindiaorg/ai-tui";
import { FooterDataProvider } from "../../../core/footer-data-provider.ts";
import { getTodoStore, type TodoItem } from "../../../core/todo/store.ts";
import { theme as defaultTheme } from "../theme/theme.ts";

/** Inputs the welcome screen needs from the host (interactive-mode). */
export interface WelcomeInputs {
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

const BOX_W = 78;

function pad(s: string, width: number): string {
	const v = visibleWidth(s);
	if (v >= width) return s;
	return s + " ".repeat(width - v);
}

function visibleWidth(s: string): number {
	// Strip ANSI escape codes for length calculation.
	// eslint-disable-next-line no-control-regex
	return s.replace(/\u001b\[[0-9;]*m/g, "").length;
}

function boxLine(left: string, right: string, width: number = BOX_W): string {
	const innerWidth = width - 4; // "│ " ... " │"
	const total = visibleWidth(left) + visibleWidth(right);
	const gap = total >= innerWidth ? 1 : innerWidth - total;
	return `${defaultTheme.fg("borderMuted", "│ ")}${left}${" ".repeat(gap)}${right}${defaultTheme.fg("borderMuted", " │")}`;
}

function boxBorder(width: number = BOX_W): string {
	return defaultTheme.fg("borderMuted", "┌" + "─".repeat(width - 2) + "┐");
}

function boxFooter(width: number = BOX_W): string {
	return defaultTheme.fg("borderMuted", "└" + "─".repeat(width - 2) + "┘");
}

function renderLogo(version: string, accent: (s: string) => string, dim: (s: string) => string): string[] {
	// Two-line bold ASCII logo. Wide blocks (█) read well at any
	// terminal width and don't have descender/ascender issues.
	// Composed of two letterforms ('a' and 'i') side by side.
	const topLines: string[] = [
		accent(" █████   ██╗ "),
		accent("██╔══██  ██║ "),
		accent("███████  ██║ "),
		accent("██╔══██  ██║ "),
		accent("██║  ██  ██║ "),
		accent("╚═╝  ╚═  ╚═╝ "),
	];
	// Tagline aligned to the right
	const tagline: string[] = [
		dim("a coding agent for the terminal"),
		dim("reads, runs, writes, remembers"),
		dim("self-extensible · 20+ providers"),
		dim("PLAN-first · Tab to execute"),
		dim(`v${version}`),
		"" /* spacer */,
	];
	// Compose side by side, padding the shorter side
	const maxLen = Math.max(topLines.length, tagline.length);
	const out: string[] = [];
	for (let i = 0; i < maxLen; i += 1) {
		const left = topLines[i] ?? "";
		const right = tagline[i] ?? "";
		const gap = right ? "  " : "";
		out.push(`${left}${gap}${right}`);
	}
	return out;
}

function shortPath(p: string): string {
	if (p === process.env.HOME || p === (process.env.USERPROFILE ?? "")) {
		return "~";
	}
	const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
	if (home && p.startsWith(home)) {
		return "~" + p.slice(home.length);
	}
	return p;
}

function modeBadge(mode: "plan" | "execute"): string {
	if (mode === "plan") {
		return (
			defaultTheme.fg("warning", " ") +
			defaultTheme.bold(defaultTheme.fg("warning", "●")) +
			defaultTheme.fg("warning", " PLAN ") +
			defaultTheme.fg("dim", "read-only · press Tab to execute")
		);
	}
	return (
		defaultTheme.fg("success", " ") +
		defaultTheme.bold(defaultTheme.fg("success", "●")) +
		defaultTheme.fg("success", " EXECUTE ") +
		defaultTheme.fg("dim", "full tools · press Tab to plan")
	);
}

function todoSummary(): string {
	const items = getTodoStore().getState().items;
	if (items.length === 0) {
		return defaultTheme.fg("dim", "no active plan");
	}
	const completed = items.filter((i: TodoItem) => i.status === "completed").length;
	const inProgress = items.filter((i: TodoItem) => i.status === "in_progress").length;
	const pct = Math.round((completed / items.length) * 100);
	const bar = "▰".repeat(Math.round(pct / 10)) + "▱".repeat(10 - Math.round(pct / 10));
	const color = inProgress > 0 ? "warning" : completed === items.length ? "success" : "accent";
	const label = `${completed}/${items.length} done`;
	const tip = inProgress > 0 ? " · in progress" : completed === items.length ? " · all done" : "";
	return defaultTheme.fg(color, `${bar} ${label}`) + defaultTheme.fg("dim", tip);
}

export class WelcomePanel extends Container {
	constructor(inputs: WelcomeInputs) {
		super();
		this.build(inputs);
	}

	private build(inputs: WelcomeInputs): void {
		const accent = (s: string) => defaultTheme.fg("accent", s);
		const dim = (s: string) => defaultTheme.fg("dim", s);
		const warning = (s: string) => defaultTheme.fg("warning", s);
		const success = (s: string) => defaultTheme.fg("success", s);
		const muted = (s: string) => defaultTheme.fg("muted", s);
		const borderAccent = (s: string) => defaultTheme.fg("borderAccent", s);
		const text = (s: string) => defaultTheme.fg("text", s);

		const { appName, version, cwd, gitBranch, sessionName, modelLabel, mode } = inputs;

		// Detect cwd basename for the title row
		const cwdBase = cwd.split(/[/\\]/).filter(Boolean).pop() || cwd;
		const title = sessionName ? `${appName} · ${sessionName}` : appName;

		// ── HERO: logo + tagline side by side, framed by a box ────────────
		this.addChild(new Spacer(1));
		this.addChild(new Text(borderAccent(boxBorder()), 0, 0));
		this.addChild(
			new Text(
				`${defaultTheme.fg("borderMuted", "│ ")}${pad(borderAccent(title) + dim(`  v${version}`), BOX_W - 4)}${defaultTheme.fg("borderMuted", " │")}`,
				0,
				0,
			),
		);
		this.addChild(
			new Text(
				defaultTheme.fg("borderMuted", "│") + " ".repeat(BOX_W - 2) + defaultTheme.fg("borderMuted", "│"),
				0,
				0,
			),
		);

		const logoLines = renderLogo(version, accent, dim);
		for (const line of logoLines) {
			this.addChild(
				new Text(
					`${defaultTheme.fg("borderMuted", "│ ")}${pad(line, BOX_W - 4)}${defaultTheme.fg("borderMuted", " │")}`,
					0,
					0,
				),
			);
		}

		// Sub-hero: model + directory in one line, then mode badge alone
		const modelShort = modelLabel.length > 30 ? modelLabel.slice(0, 27) + "…" : modelLabel;
		const dirLabel = `${shortPath(cwd)}${gitBranch ? ` ${dim("on")} ${muted(gitBranch)}` : ""}`;

		this.addChild(
			new Text(
				defaultTheme.fg("borderMuted", "│") + " ".repeat(BOX_W - 2) + defaultTheme.fg("borderMuted", "│"),
				0,
				0,
			),
		);
		this.addChild(
			new Text(
				`${defaultTheme.fg("borderMuted", "│ ")}${pad(text(modelShort) + dim("  ·  ") + text(dirLabel), BOX_W - 4)}${defaultTheme.fg("borderMuted", " │")}`,
				0,
				0,
			),
		);

		this.addChild(
			new Text(
				defaultTheme.fg("borderMuted", "│") + " ".repeat(BOX_W - 2) + defaultTheme.fg("borderMuted", "│"),
				0,
				0,
			),
		);
		this.addChild(
			new Text(
				`${defaultTheme.fg("borderMuted", "│ ")}${pad(modeBadge(mode), BOX_W - 4)}${defaultTheme.fg("borderMuted", " │")}`,
				0,
				0,
			),
		);
		this.addChild(
			new Text(
				defaultTheme.fg("borderMuted", "│") + " ".repeat(BOX_W - 2) + defaultTheme.fg("borderMuted", "│"),
				0,
				0,
			),
		);

		// Plan progress (only shows something when the todo list has items)
		this.addChild(
			new Text(
				`${defaultTheme.fg("borderMuted", "│ ")}${pad(dim("Plan  ") + todoSummary(), BOX_W - 4)}${defaultTheme.fg("borderMuted", " │")}`,
				0,
				0,
			),
		);
		this.addChild(new Text(borderAccent(boxFooter()), 0, 0));

		// ── KEYBINDINGS STRIP ──────────────────────────────────────────────
		this.addChild(new Spacer(1));
		const keyRow = [
			inputs.keyHint("app.interrupt", "interrupt"),
			inputs.rawKeyHint(`${inputs.keyText("app.clear")}/${inputs.keyText("app.exit")}`, "clear/exit"),
			inputs.rawKeyHint("/", "commands"),
			inputs.rawKeyHint("!", "bash"),
			inputs.rawKeyHint("Tab", "plan/exec"),
		].join(defaultTheme.fg("muted", "  ·  "));
		this.addChild(new Text(`  ${keyRow}`, 0, 0));
		this.addChild(
			new Text(
				`  ${dim(`Press ${inputs.keyText("app.tools.expand")} for the full reference · /help for all commands`)}`,
				0,
				0,
			),
		);

		// ── QUICK START ────────────────────────────────────────────────────
		this.addChild(new Spacer(1));
		this.addChild(new Text(`  ${defaultTheme.bold(defaultTheme.fg("accent", "Try one of these"))}`, 0, 0));
		const examples: ReadonlyArray<{ label: string; prompt: string }> = [
			{
				label: `${warning("!")} ${success("Read & refactor")}`,
				prompt: `${dim('"split auth.ts into a folder, one file per concern"')}`,
			},
			{
				label: `${warning("!")} ${success("Debug a test")}`,
				prompt: `${dim('"why is test_x flaky? trace the imports"')}`,
			},
			{
				label: `${warning("!")} ${success("Onboard a repo")}`,
				prompt: `${dim('"summarize this repo, find entry points, list TODOs"')}`,
			},
			{
				label: `${warning("!")} ${success("Add a feature")}`,
				prompt: `${dim('"add a /stats slash command that shows token usage"')}`,
			},
		];
		for (const ex of examples) {
			this.addChild(new Text(`  ${ex.label}  ${ex.prompt}`, 0, 0));
		}

		// Tip footer
		this.addChild(new Spacer(1));
		this.addChild(
			new Text(
				`  ${dim("Tip:")} ${text(`${inputs.appName} is in PLAN mode by default. The model can only read, search, and propose a plan.`)}`,
				0,
				0,
			),
		);
		this.addChild(
			new Text(`  ${dim("Press ")}${warning("Tab")}${dim(" when ready to start applying the plan.")}`, 0, 0),
		);
		this.addChild(new Spacer(1));
	}
}
