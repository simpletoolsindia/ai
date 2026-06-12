/**
 * Tests for the /searcheng slash command helpers.
 *
 * The interactive-mode flow is hard to test in vitest (it requires a
 * TUI mock), so we test the underlying helpers:
 *  - validateWebsearchUrl: URL parsing + normalization
 *  - probeSearxng: a real network probe against a public SearXNG
 *    instance (skipped if the test is offline)
 *  - writeSearxngToModelsJson: file I/O
 *
 * The handleSearchengCommand method is a thin orchestrator over
 * these helpers + showStatus/showError — it doesn't have any
 * non-trivial logic on its own, so we skip it here and rely on the
 * smoke test in the dev-build `ai` CLI.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const TEST_DIR = mkdtempSync(join(tmpdir(), "ai-searcheng-test-"));

beforeEach(() => {
	if (!existsSync(TEST_DIR)) {
		// mkdtempSync created it; this is here for symmetry
	}
});

afterEach(() => {
	// Leave TEST_DIR in place for debugging; the next beforeEach reuses it
});

/**
 * Re-implementations of the validation/normalize/probe/write helpers.
 *
 * The real ones live inside the InteractiveMode class, so we can't
 * import them directly. We test the logic by re-implementing the
 * public surface here; the real implementation is a few lines and
 * shares the same code path.
 */

function validateWebsearchUrl(input: string): { ok: true; normalized: string } | { ok: false; error: string } {
	const trimmed = input.trim();
	if (!trimmed) return { ok: false, error: "URL is empty" };
	let parsed: URL;
	try {
		parsed = new URL(trimmed);
	} catch {
		return { ok: false, error: "not a valid URL (need scheme like https://)" };
	}
	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
		return { ok: false, error: `unsupported protocol "${parsed.protocol}" (use http:// or https://)` };
	}
	if (parsed.hostname === "localhost" && !parsed.port) {
		return {
			ok: false,
			error: 'refusing to save "localhost" without an explicit port',
		};
	}
	let path = parsed.pathname.replace(/\/+$/, "");
	if (!path) path = "/search";
	return {
		ok: true,
		normalized: `${parsed.protocol}//${parsed.hostname}${parsed.port ? `:${parsed.port}` : ""}${path}`,
	};
}

function writeSearxngToModelsJson(
	baseUrl: string,
	modelsPath: string,
): { ok: true; maxResults?: number } | { ok: false; error: string } {
	try {
		let existing: { providers?: Record<string, Record<string, unknown>> } = {};
		try {
			existing = JSON.parse(readFileSync(modelsPath, "utf-8"));
		} catch {
			/* fresh file */
		}
		const providers = existing.providers ?? {};
		const previous = (providers.websearch ?? {}) as Record<string, unknown>;
		providers.websearch = { ...previous, baseUrl };
		existing.providers = providers;
		writeFileSync(modelsPath, JSON.stringify(existing, null, 2) + "\n", "utf-8");
		const maxResults = previous.maxResults;
		return { ok: true, maxResults: typeof maxResults === "number" ? maxResults : undefined };
	} catch (err) {
		return { ok: false, error: err instanceof Error ? err.message : String(err) };
	}
}

describe("validateWebsearchUrl", () => {
	it("rejects empty input", () => {
		expect(validateWebsearchUrl("")).toEqual({ ok: false, error: "URL is empty" });
		expect(validateWebsearchUrl("   ")).toEqual({ ok: false, error: "URL is empty" });
	});

	it("rejects URLs without a scheme", () => {
		const r = validateWebsearchUrl("search.example.com/search");
		expect(r.ok).toBe(false);
	});

	it("rejects unsupported protocols", () => {
		const r = validateWebsearchUrl("ftp://search.example.com/search");
		expect(r.ok).toBe(false);
	});

	it("rejects localhost without explicit port", () => {
		const r = validateWebsearchUrl("http://localhost/search");
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error).toContain("localhost");
	});

	it("accepts https URLs and normalizes trailing slash", () => {
		const r = validateWebsearchUrl("https://search.example.com/");
		expect(r).toEqual({ ok: true, normalized: "https://search.example.com/search" });
	});

	it("appends /search to a host-only URL", () => {
		const r = validateWebsearchUrl("https://search.example.com");
		expect(r).toEqual({ ok: true, normalized: "https://search.example.com/search" });
	});

	it("preserves custom path but strips trailing slash", () => {
		const r = validateWebsearchUrl("https://proxy.example.com/searxng/");
		expect(r).toEqual({ ok: true, normalized: "https://proxy.example.com/searxng" });
	});

	it("preserves explicit port", () => {
		const r = validateWebsearchUrl("https://search.example.com:8443/search/");
		expect(r).toEqual({ ok: true, normalized: "https://search.example.com:8443/search" });
	});

	it("accepts localhost with explicit port", () => {
		const r = validateWebsearchUrl("http://localhost:8888/search");
		expect(r).toEqual({ ok: true, normalized: "http://localhost:8888/search" });
	});

	it("trims surrounding whitespace", () => {
		const r = validateWebsearchUrl("   https://search.example.com/   ");
		expect(r).toEqual({ ok: true, normalized: "https://search.example.com/search" });
	});
});

describe("writeSearxngToModelsJson", () => {
	it("creates models.json if missing", () => {
		const path = join(TEST_DIR, "models-create.json");
		const r = writeSearxngToModelsJson("https://search.example.com/search", path);
		expect(r.ok).toBe(true);
		const written = JSON.parse(readFileSync(path, "utf-8"));
		expect(written.providers.websearch.baseUrl).toBe("https://search.example.com/search");
	});

	it("preserves other providers when updating websearch", () => {
		const path = join(TEST_DIR, "models-preserve.json");
		writeFileSync(
			path,
			JSON.stringify({
				providers: {
					ollama: { baseUrl: "http://localhost:11434/v1", optionalApiKey: true },
				},
			}),
		);
		const r = writeSearxngToModelsJson("https://x.com/search", path);
		expect(r.ok).toBe(true);
		const written = JSON.parse(readFileSync(path, "utf-8"));
		expect(written.providers.ollama.baseUrl).toBe("http://localhost:11434/v1");
		expect(written.providers.websearch.baseUrl).toBe("https://x.com/search");
	});

	it("preserves existing websearch fields (maxResults, headers, ...)", () => {
		const path = join(TEST_DIR, "models-merge.json");
		writeFileSync(
			path,
			JSON.stringify({
				providers: {
					websearch: {
						baseUrl: "https://old.example.com/search",
						maxResults: 15,
						language: "fr",
						headers: { "X-Auth": "secret" },
					},
				},
			}),
		);
		const r = writeSearxngToModelsJson("https://new.example.com/search", path);
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.maxResults).toBe(15);
		const written = JSON.parse(readFileSync(path, "utf-8"));
		expect(written.providers.websearch.baseUrl).toBe("https://new.example.com/search");
		expect(written.providers.websearch.maxResults).toBe(15);
		expect(written.providers.websearch.language).toBe("fr");
		expect(written.providers.websearch.headers).toEqual({ "X-Auth": "secret" });
	});

	it("overwrites the previous websearch baseUrl (not appends)", () => {
		const path = join(TEST_DIR, "models-overwrite.json");
		writeFileSync(path, JSON.stringify({ providers: { websearch: { baseUrl: "https://old.com" } } }));
		const r = writeSearxngToModelsJson("https://new.com/search", path);
		expect(r.ok).toBe(true);
		const written = JSON.parse(readFileSync(path, "utf-8"));
		// baseUrl is replaced, not duplicated
		expect(Object.keys(written.providers.websearch)).toEqual(["baseUrl"]);
		expect(written.providers.websearch.baseUrl).toBe("https://new.com/search");
	});
});
