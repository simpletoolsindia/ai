/**
 * Tests for ModelRegistry.addOpenAICompatibleProvider().
 *
 * Covers:
 *  - happy path: writes models.json + auth.json, registry refreshes
 *  - URL validation (scheme, protocol, malformed)
 *  - name validation (illegal characters, built-in name collision)
 *  - missing-field validation
 *  - overwriting an existing custom provider with the same name
 *  - rejection when no models.json path is configured
 *  - refusing to clobber a malformed existing models.json
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { AuthStorage } from "../src/core/auth-storage.ts";
import { ModelRegistry } from "../src/core/model-registry.ts";

const TEST_DIR = mkdtempSync(join(tmpdir(), "ai-add-provider-test-"));

function makeRegistry(initialModels: object = {}) {
	const authPath = join(TEST_DIR, `auth-${Math.random().toString(36).slice(2)}.json`);
	const modelsPath = join(TEST_DIR, `models-${Math.random().toString(36).slice(2)}.json`);
	if (Object.keys(initialModels).length > 0) {
		writeFileSync(modelsPath, JSON.stringify(initialModels, null, 2));
	}
	writeFileSync(authPath, "{}");
	const auth = AuthStorage.create(authPath);
	return { registry: ModelRegistry.create(auth, modelsPath), modelsPath, authPath };
}

describe("ModelRegistry.addOpenAICompatibleProvider()", () => {
	beforeEach(() => {
		// mkdtempSync already created the dir
	});

	afterEach(() => {
		// Leave TEST_DIR in place for debugging; rm at the end of the suite
	});

	it("writes models.json and auth.json on the happy path", () => {
		const { registry, modelsPath, authPath } = makeRegistry();
		const result = registry.addOpenAICompatibleProvider({
			name: "my-groq",
			baseUrl: "https://api.groq.com/openai/v1",
			apiKey: "gsk_test_123",
			modelId: "llama-3.1-70b-versatile",
			modelName: "Llama 3.1 70B (Groq)",
		});

		expect(result.providerId).toBe("my-groq");
		expect(result.modelId).toBe("llama-3.1-70b-versatile");

		// models.json written
		expect(existsSync(modelsPath)).toBe(true);
		const models = JSON.parse(readFileSync(modelsPath, "utf-8"));
		expect(models.providers["my-groq"]).toEqual({
			baseUrl: "https://api.groq.com/openai/v1",
			api: "openai-completions",
			apiKey: "gsk_test_123",
			models: [
				{ id: "llama-3.1-70b-versatile", name: "Llama 3.1 70B (Groq)" },
			],
		});

		// auth.json written
		const auth = JSON.parse(readFileSync(authPath, "utf-8"));
		expect(auth["my-groq"]).toEqual({ type: "api_key", key: "gsk_test_123" });

		// registry refreshed: model is available
		const model = registry.find("my-groq", "llama-3.1-70b-versatile");
		expect(model).toBeDefined();
		expect(model?.baseUrl).toBe("https://api.groq.com/openai/v1");
	});

	it("defaults modelName to modelId when not provided", () => {
		const { registry, modelsPath } = makeRegistry();
		registry.addOpenAICompatibleProvider({
			name: "my-fireworks",
			baseUrl: "https://api.fireworks.ai/inference/v1",
			apiKey: "fw_test",
			modelId: "accounts/fireworks/models/llama-v3p1-70b-instruct",
		});
		const models = JSON.parse(readFileSync(modelsPath, "utf-8"));
		expect(models.providers["my-fireworks"].models[0].name).toBe(
			"accounts/fireworks/models/llama-v3p1-70b-instruct",
		);
	});

	it("preserves other providers when adding a new one", () => {
		const { registry, modelsPath } = makeRegistry({
			providers: {
				ollama: {
					baseUrl: "http://localhost:11434/v1",
					api: "openai-completions",
					optionalApiKey: true,
				},
			},
		});
		registry.addOpenAICompatibleProvider({
			name: "my-groq",
			baseUrl: "https://api.groq.com/openai/v1",
			apiKey: "gsk_123",
			modelId: "llama-3.1-70b-versatile",
		});
		const models = JSON.parse(readFileSync(modelsPath, "utf-8"));
		expect(models.providers.ollama.optionalApiKey).toBe(true);
		expect(models.providers["my-groq"].baseUrl).toBe("https://api.groq.com/openai/v1");
	});

	it("replaces existing provider with the same name", () => {
		const { registry, modelsPath } = makeRegistry();
		registry.addOpenAICompatibleProvider({
			name: "my-groq",
			baseUrl: "https://api.groq.com/openai/v1",
			apiKey: "gsk_1",
			modelId: "llama-3.1-8b-instant",
		});
		registry.addOpenAICompatibleProvider({
			name: "my-groq",
			baseUrl: "https://api.groq.com/openai/v1",
			apiKey: "gsk_2",
			modelId: "llama-3.1-70b-versatile",
		});
		const models = JSON.parse(readFileSync(modelsPath, "utf-8"));
		expect(models.providers["my-groq"].models).toHaveLength(1);
		expect(models.providers["my-groq"].models[0].id).toBe("llama-3.1-70b-versatile");
	});

	it("rejects built-in provider names (anthropic, openai, etc.)", () => {
		const { registry } = makeRegistry();
		expect(() =>
			registry.addOpenAICompatibleProvider({
				name: "anthropic",
				baseUrl: "https://api.example.com/v1",
				apiKey: "key",
				modelId: "model",
			}),
		).toThrow(/built-in provider/);

		expect(() =>
			registry.addOpenAICompatibleProvider({
				name: "openai",
				baseUrl: "https://api.example.com/v1",
				apiKey: "key",
				modelId: "model",
			}),
		).toThrow(/built-in provider/);

		expect(() =>
			registry.addOpenAICompatibleProvider({
				name: "groq",
				baseUrl: "https://api.example.com/v1",
				apiKey: "key",
				modelId: "model",
			}),
		).toThrow(/built-in provider/);
	});

	it("rejects provider names with illegal characters", () => {
		const { registry } = makeRegistry();
		const illegal = ["my llm", "my/llm", "my.llm", "my:llm", "my!llm", ""];
		for (const name of illegal) {
			expect(() =>
				registry.addOpenAICompatibleProvider({
					name,
					baseUrl: "https://api.example.com/v1",
					apiKey: "key",
					modelId: "model",
				}),
			).toThrow();
		}
	});

	it("accepts provider names with hyphens, underscores, and digits", () => {
		const { registry } = makeRegistry();
		const legal = ["my-groq", "my-llm", "my_llm", "llm1", "x", "a-b-c-d"];
		for (const name of legal) {
			registry.addOpenAICompatibleProvider({
				name,
				baseUrl: "https://api.example.com/v1",
				apiKey: "key",
				modelId: "m",
			});
		}
		// All written
		const allModels = registry.getAll();
		const customNames = new Set(allModels.map((m) => m.provider));
		for (const name of legal) {
			expect(customNames.has(name)).toBe(true);
		}
	});

	it("rejects invalid URLs", () => {
		const { registry } = makeRegistry();
		const cases = [
			"not-a-url",
			"://missing-scheme",
			"ftp://api.example.com/v1",
			"file:///etc/passwd",
		];
		for (const baseUrl of cases) {
			expect(() =>
				registry.addOpenAICompatibleProvider({
					name: "test",
					baseUrl,
					apiKey: "k",
					modelId: "m",
				}),
			).toThrow();
		}
	});

	it("rejects empty/missing required fields", () => {
		const { registry } = makeRegistry();
		expect(() =>
			registry.addOpenAICompatibleProvider({
				name: "",
				baseUrl: "https://api.example.com/v1",
				apiKey: "k",
				modelId: "m",
			}),
		).toThrow(/name is required/);
		expect(() =>
			registry.addOpenAICompatibleProvider({
				name: "x",
				baseUrl: "",
				apiKey: "k",
				modelId: "m",
			}),
		).toThrow(/Base URL is required/);
		expect(() =>
			registry.addOpenAICompatibleProvider({
				name: "x",
				baseUrl: "https://api.example.com/v1",
				apiKey: "",
				modelId: "m",
			}),
		).toThrow(/API key is required/);
		expect(() =>
			registry.addOpenAICompatibleProvider({
				name: "x",
				baseUrl: "https://api.example.com/v1",
				apiKey: "k",
				modelId: "",
			}),
		).toThrow(/Model ID is required/);
	});

	it("refuses to clobber a malformed existing models.json", () => {
		const modelsPath = join(TEST_DIR, "malformed.json");
		writeFileSync(modelsPath, "{ this is : not, valid JSON");
		const authPath = join(TEST_DIR, "malformed-auth.json");
		writeFileSync(authPath, "{}");
		const auth = AuthStorage.create(authPath);
		const registry = ModelRegistry.create(auth, modelsPath);

		expect(() =>
			registry.addOpenAICompatibleProvider({
				name: "my-groq",
				baseUrl: "https://api.groq.com/openai/v1",
				apiKey: "k",
				modelId: "m",
			}),
		).toThrow(/Failed to read existing models.json/);

		// Original file should be untouched
		const original = readFileSync(modelsPath, "utf-8");
		expect(original).toBe("{ this is : not, valid JSON");
	});

	it("creates models.json when none exists", () => {
		const modelsPath = join(TEST_DIR, "fresh-models.json");
		const authPath = join(TEST_DIR, "fresh-auth.json");
		writeFileSync(authPath, "{}");
		const auth = AuthStorage.create(authPath);
		const registry = ModelRegistry.create(auth, modelsPath);

		expect(existsSync(modelsPath)).toBe(false);
		registry.addOpenAICompatibleProvider({
			name: "first",
			baseUrl: "https://api.example.com/v1",
			apiKey: "k",
			modelId: "m",
		});
		expect(existsSync(modelsPath)).toBe(true);
		const models = JSON.parse(readFileSync(modelsPath, "utf-8"));
		expect(models.providers.first.baseUrl).toBe("https://api.example.com/v1");
	});

	it("the new model is immediately invokable after add", async () => {
		const { registry } = makeRegistry();
		registry.addOpenAICompatibleProvider({
			name: "testprov",
			baseUrl: "https://api.example.com/v1",
			apiKey: "sk_test",
			modelId: "test-model",
		});
		// getApiKeyAndHeaders should return ok: true with the key from auth.json
		const result = await registry.getApiKeyAndHeaders({
			provider: "testprov",
			id: "test-model",
		} as any);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.apiKey).toBe("sk_test");
		}
	});
});

// Cleanup
afterAll(() => {
	rmSync(TEST_DIR, { recursive: true, force: true });
});
