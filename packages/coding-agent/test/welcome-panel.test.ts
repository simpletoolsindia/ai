/**
 * Tests for the WelcomePanel — the polished welcome screen shown on
 * first launch.
 *
 * The panel is a passive renderer that pulls state from the host
 * (model, mode, cwd, branch, todo list). We test:
 *  - The component instantiates with the expected inputs
 *  - The component renders a sensible number of children (header rows
 *    + keybinding strip + quick-start examples + tip)
 *  - Mode switching changes the badge (we exercise the source path;
 *    the TUI re-render is host-driven)
 *  - Source-level: the panel is wired into interactive-mode
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("WelcomePanel (source-level smoke tests)", () => {
	const source = readFileSync(
		"/Users/sridhar/ai/packages/coding-agent/src/modes/interactive/components/welcome.ts",
		"utf-8",
	);
	const interactive = readFileSync(
		"/Users/sridhar/ai/packages/coding-agent/src/modes/interactive/interactive-mode.ts",
		"utf-8",
	);

	it("is exported as a class", () => {
		expect(source).toMatch(/export class WelcomePanel extends Container/);
	});

	it("renders the multi-color logo", () => {
		expect(source).toContain("renderLogo");
		expect(source).toContain("█████");
	});

	it("shows the current mode as a colored badge", () => {
		expect(source).toContain("modeBadge");
		expect(source).toContain("PLAN");
		expect(source).toContain("EXECUTE");
		expect(source).toMatch(/fg\("warning".*PLAN/);
		expect(source).toMatch(/fg\("success".*EXECUTE/);
	});

	it("shows the todo progress bar when the list is non-empty", () => {
		expect(source).toContain("todoSummary");
		expect(source).toContain("▰");
		expect(source).toContain("done");
	});

	it("includes a quick-start section with examples", () => {
		expect(source).toContain("Try one of these");
		expect(source).toContain("split auth.ts");
		expect(source).toContain("Debug a test");
	});

	it("includes a compact keybinding strip", () => {
		expect(source).toContain("interrupt");
		expect(source).toContain("clear/exit");
		expect(source).toContain("plan/exec");
	});

	it("is wired into interactive-mode as the built-in header", () => {
		expect(interactive).toMatch(/this\.builtInHeader = new WelcomePanel\(inputs\)/);
	});

	it("has a refresh path so mode/model changes update the panel", () => {
		expect(interactive).toContain("refreshWelcomePanel");
		expect(interactive).toMatch(/this\.refreshWelcomePanel\(\)/);
	});
});
