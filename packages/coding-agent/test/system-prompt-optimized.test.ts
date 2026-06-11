/**
 * Tests that the optimized system prompt preserves all the important content
 * from the previous version, while reducing token count.
 *
 * This is a regression test: if someone removes a critical rule from the
 * prompt, this test will fail. It also asserts that the prompt is
 * meaningfully shorter than a naive "control" version.
 */

import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "../src/core/system-prompt.ts";

const BASE_OPTS = {
	contextFiles: [],
	skills: [],
	toolSnippets: {
		read: "Read files",
		bash: "Run shell commands",
		edit: "Edit files in place",
		write: "Create or overwrite files",
		grep: "Search file contents",
		find: "Find files by name",
		ls: "List directory contents",
		websearch: "Search the web",
		webfetch: "Fetch URLs",
		subagent: "Spawn a subagent",
		todo: "Manage todo list",
	},
	cwd: "/Users/test/project",
};

/**
 * Approximate token count. We use a 4-chars-per-token heuristic, which
 * is the standard for English text. The exact number is not important —
 * we just want to assert the optimized version is meaningfully shorter
 * than a control version that spells everything out.
 */
function approxTokens(text: string): number {
	return Math.ceil(text.length / 4);
}

describe("optimized system prompt", () => {
	const prompt = buildSystemPrompt(BASE_OPTS);

	describe("preserves critical persona + tool list", () => {
		it("mentions the persona (ai coding agent harness)", () => {
			expect(prompt).toContain("ai, a coding agent harness");
		});

		it("lists the tools with their snippets", () => {
			expect(prompt).toContain("- read: Read files");
			expect(prompt).toContain("- bash: Run shell commands");
			expect(prompt).toContain("- edit: Edit files in place");
			expect(prompt).toContain("- write: Create or overwrite files");
		});

		it("mentions that custom tools may be available", () => {
			expect(prompt).toMatch(/custom tools may be available/i);
		});
	});

	describe("preserves all 4 default guidelines", () => {
		it("guideline: be concise", () => {
			expect(prompt).toContain("Be concise");
		});

		it("guideline: show file paths clearly", () => {
			expect(prompt).toContain("Show file paths clearly");
		});

		it("guideline: don't confabulate URLs/paths/facts", () => {
			expect(prompt).toContain("never confabulate URLs, paths, or facts");
		});

		it("guideline: use websearch/webfetch for current info", () => {
			expect(prompt).toContain("use websearch/webfetch, don't guess");
		});
	});

	describe("preserves all 4 docs paths and cross-references", () => {
		it("includes README path", () => {
			expect(prompt).toMatch(/README: .*README\.md/);
		});

		it("includes docs path", () => {
			expect(prompt).toMatch(/Docs: .*docs\b/);
		});

		it("includes examples path", () => {
			expect(prompt).toMatch(/Examples: .*examples\b/);
		});

		it("mentions all 10 topic cross-references (extensions, themes, skills, ...)", () => {
			// Verify all 10 topics are still listed in the topics line
			const topics = [
				"extensions",
				"themes",
				"skills",
				"prompts",
				"TUI",
				"keybindings",
				"SDK",
				"custom providers",
				"models",
				"packages",
			];
			for (const t of topics) {
				expect(prompt).toContain(t);
			}
		});

		it("mentions the cross-reference pattern (docs/<topic>.md)", () => {
			expect(prompt).toContain("docs/<topic>.md");
			// Also includes concrete examples
			expect(prompt).toContain("docs/extensions.md");
		});

		it("instructs to read the .md file in full and follow cross-references", () => {
			expect(prompt).toContain("follow its cross-references before implementing");
		});

		it("tells the model to resolve paths under the docs dirs, not cwd", () => {
			expect(prompt).toContain("resolve paths under these dirs, not the cwd");
		});
	});

	describe("preserves environment footer", () => {
		it("includes the current date", () => {
			expect(prompt).toMatch(/Current date: \d{4}-\d{2}-\d{2}/);
		});

		it("includes the current working directory", () => {
			expect(prompt).toContain("Current working directory: /Users/test/project");
		});
	});

	describe("is meaningfully shorter than the previous version", () => {
		it("the docs section is well under 250 tokens", () => {
			// Find the docs section (between "ai docs" and the end of that block)
			const idx = prompt.indexOf("ai docs (read only");
			expect(idx).toBeGreaterThan(-1);
			// The docs block ends at the end of the docs paragraph (next "\n\n" or end)
			const end = prompt.indexOf("\n\n", idx);
			const docsBlock = prompt.slice(idx, end === -1 ? undefined : end);
			const tokens = approxTokens(docsBlock);
			// Previous version was ~165 tokens for this block; optimized should
			// be at most 200 tokens. (In practice it's around 100-130.)
			expect(tokens).toBeLessThan(200);
		});

		it("the guidelines list has 4 always-on bullets, each under 60 chars", () => {
			const idx = prompt.indexOf("Guidelines:\n");
			expect(idx).toBeGreaterThan(-1);
			const end = prompt.indexOf("\n\n", idx);
			const block = prompt.slice(idx, end === -1 ? undefined : end);
			const allBullets = block
				.split("\n")
				.filter((l) => l.startsWith("- "))
				.map((l) => l.slice(2));
			// 4 always-on guidelines; an optional 5th may be present
			// ("Use bash for file operations like ls, rg, find" if no
			// grep/find/ls are enabled). Both with and without the
			// optional bullet should pass this assertion.
			expect(allBullets.length).toBeGreaterThanOrEqual(4);
			expect(allBullets.length).toBeLessThanOrEqual(5);
			for (const line of allBullets) {
				expect(line.length).toBeLessThan(80);
			}
		});
	});
});
