/**
 * Tests for the `websearch` config plumbing through ModelRegistry.
 *
 * Covers:
 *  - normalizeWebsearchUrl (trailing slash, /search suffix)
 *  - getWebsearchConfig() defaulting to undefined when no websearch provider
 *  - getWebsearchConfig() reading from models.json
 *  - resolveWebsearchConfig validation (maxResults, language, safesearch)
 *  - refresh() clears the cached config
 *  - setWebsearchConfig (used by /searcheng) overrides
 */

import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AuthStorage } from "../src/core/auth-storage.ts";
import { ModelRegistry } from "../src/core/model-registry.ts";

let testIdx = 0;
const TEST_DIR = mkdtempSync(join(tmpdir(), "ai-websearch-test-"));
const AUTH_PATH = join(TEST_DIR, "auth.json");

beforeEach(() => {
	// Each test gets a fresh, empty auth.json. We don't share state
	// across tests; mkdtempSync already created the parent dir.
	testIdx++;
	if (!existsSync(AUTH_PATH)) {
		writeFileSync(AUTH_PATH, "{}");
	}
});

afterEach(() => {
	// No-op: tests write their own models-<random>.json under TEST_DIR.
	// We do NOT delete TEST_DIR here so we can debug failures by
	// inspecting the leftover files. Each test's random suffix avoids
	// collisions across runs.
});

function makeRegistry(modelsJson: object | undefined): ModelRegistry {
	const path = join(TEST_DIR, `models-${Math.random().toString(36).slice(2)}.json`);
	if (modelsJson !== undefined) {
		writeFileSync(path, JSON.stringify(modelsJson));
	}
	return ModelRegistry.create(AuthStorage.create(AUTH_PATH), path);
}

describe("ModelRegistry.getWebsearchConfig", () => {
	it("returns undefined when models.json has no websearch provider", () => {
		const r = makeRegistry({ providers: { ollama: { baseUrl: "http://localhost:11434/v1" } } });
		expect(r.getWebsearchConfig()).toBeUndefined();
	});

	it("returns undefined when models.json does not exist", () => {
		const r = makeRegistry(undefined);
		expect(r.getWebsearchConfig()).toBeUndefined();
	});

	it("reads baseUrl and normalizes trailing slash", () => {
		const r = makeRegistry({ providers: { websearch: { baseUrl: "https://search.example.com/" } } });
		expect(r.getWebsearchConfig()?.baseUrl).toBe("https://search.example.com/search");
	});

	it("appends /search to a host-only URL", () => {
		const r = makeRegistry({ providers: { websearch: { baseUrl: "https://search.example.com" } } });
		expect(r.getWebsearchConfig()?.baseUrl).toBe("https://search.example.com/search");
	});

	it("preserves a custom path but strips trailing slash", () => {
		const r = makeRegistry({ providers: { websearch: { baseUrl: "https://proxy.example.com/searxng/" } } });
		expect(r.getWebsearchConfig()?.baseUrl).toBe("https://proxy.example.com/searxng");
	});

	it("applies defaults for maxResults, language, safesearch", () => {
		const r = makeRegistry({ providers: { websearch: { baseUrl: "https://search.example.com" } } });
		const cfg = r.getWebsearchConfig()!;
		expect(cfg.maxResults).toBe(10);
		expect(cfg.language).toBe("en");
		expect(cfg.safesearch).toBe("0");
		expect(cfg.timeRange).toBeUndefined();
	});

	it("respects user-supplied maxResults, language, safesearch, timeRange", () => {
		const r = makeRegistry({
			providers: {
				websearch: {
					baseUrl: "https://search.example.com",
					maxResults: 15,
					language: "DE",
					safesearch: "2",
					timeRange: "week",
				},
			},
		});
		const cfg = r.getWebsearchConfig()!;
		expect(cfg.maxResults).toBe(15);
		expect(cfg.language).toBe("de"); // normalized to lowercase
		expect(cfg.safesearch).toBe("2");
		expect(cfg.timeRange).toBe("week");
	});

	it("clamps out-of-range maxResults to default", () => {
		const r1 = makeRegistry({ providers: { websearch: { baseUrl: "https://x", maxResults: 0 } } });
		expect(r1.getWebsearchConfig()?.maxResults).toBe(10);
		const r2 = makeRegistry({ providers: { websearch: { baseUrl: "https://x", maxResults: 100 } } });
		expect(r2.getWebsearchConfig()?.maxResults).toBe(10);
		const r3 = makeRegistry({ providers: { websearch: { baseUrl: "https://x", maxResults: 7.5 } } });
		expect(r3.getWebsearchConfig()?.maxResults).toBe(7); // Math.floor
	});

	it("falls back to 'en' for invalid language", () => {
		const r = makeRegistry({ providers: { websearch: { baseUrl: "https://x", language: "klingon" } } });
		expect(r.getWebsearchConfig()?.language).toBe("en");
	});

	it("falls back to '0' for invalid safesearch", () => {
		const r = makeRegistry({ providers: { websearch: { baseUrl: "https://x", safesearch: "9" } } });
		expect(r.getWebsearchConfig()?.safesearch).toBe("0");
	});

	it("ignores invalid timeRange", () => {
		const r = makeRegistry({ providers: { websearch: { baseUrl: "https://x", timeRange: "fortnight" } } });
		expect(r.getWebsearchConfig()?.timeRange).toBeUndefined();
	});

	it("preserves headers when present", () => {
		const r = makeRegistry({
			providers: {
				websearch: {
					baseUrl: "https://x",
					headers: { "X-Auth-Token": "secret" },
				},
			},
		});
		expect(r.getWebsearchConfig()?.headers).toEqual({ "X-Auth-Token": "secret" });
	});

	it("drops empty headers object", () => {
		const r = makeRegistry({
			providers: {
				websearch: { baseUrl: "https://x", headers: {} },
			},
		});
		expect(r.getWebsearchConfig()?.headers).toBeUndefined();
	});
});

describe("ModelRegistry.setWebsearchConfig (used by /searcheng)", () => {
	it("overrides the config from disk without a refresh", () => {
		const r = makeRegistry({ providers: { websearch: { baseUrl: "https://old.example.com" } } });
		expect(r.getWebsearchConfig()?.baseUrl).toBe("https://old.example.com/search");
		r.setWebsearchConfig({
			baseUrl: "https://new.example.com/search",
			maxResults: 5,
			language: "fr",
			safesearch: "1",
		});
		expect(r.getWebsearchConfig()?.baseUrl).toBe("https://new.example.com/search");
		expect(r.getWebsearchConfig()?.maxResults).toBe(5);
	});

	it("can clear the config by passing undefined", () => {
		const r = makeRegistry({ providers: { websearch: { baseUrl: "https://x" } } });
		expect(r.getWebsearchConfig()).toBeDefined();
		r.setWebsearchConfig(undefined);
		expect(r.getWebsearchConfig()).toBeUndefined();
	});
});

describe("ModelRegistry.refresh clears websearch config", () => {
	it("re-reads websearch config from disk on refresh", () => {
		const path = join(TEST_DIR, `models-${Math.random().toString(36).slice(2)}.json`);
		writeFileSync(path, JSON.stringify({ providers: { websearch: { baseUrl: "https://first.com" } } }));
		const r = ModelRegistry.create(AuthStorage.create(AUTH_PATH), path);
		expect(r.getWebsearchConfig()?.baseUrl).toBe("https://first.com/search");

		// Edit on disk
		writeFileSync(path, JSON.stringify({ providers: { websearch: { baseUrl: "https://second.com" } } }));
		r.refresh();
		expect(r.getWebsearchConfig()?.baseUrl).toBe("https://second.com/search");
	});
});
