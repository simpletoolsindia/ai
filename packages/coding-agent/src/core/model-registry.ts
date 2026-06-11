/**
 * Model registry - manages built-in and custom models, provides API key resolution.
 */

import {
	type AnthropicMessagesCompat,
	type Api,
	type AssistantMessageEventStream,
	type Context,
	getModels,
	getProviders,
	type KnownProvider,
	type Model,
	type OAuthProviderInterface,
	type OpenAICompletionsCompat,
	type OpenAIResponsesCompat,
	registerApiProvider,
	resetApiProviders,
	type SimpleStreamOptions,
} from "@simpletoolsindiaorg/ai-provider";
import { registerOAuthProvider, resetOAuthProviders } from "@simpletoolsindiaorg/ai-provider/oauth";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { type Static, Type } from "typebox";
import { Compile } from "typebox/compile";
import type { TLocalizedValidationError } from "typebox/error";
import { getAgentDir } from "../config.ts";
import { warnDeprecation } from "../utils/deprecation.ts";
import { stripJsonComments } from "../utils/json.ts";
import { normalizePath } from "../utils/paths.ts";
import type { AuthStatus, AuthStorage } from "./auth-storage.ts";
import { BUILT_IN_PROVIDER_DISPLAY_NAMES } from "./provider-display-names.ts";
import {
	clearConfigValueCache,
	getConfigValueEnvVarNames,
	isCommandConfigValue,
	isConfigValueConfigured,
	isLegacyEnvVarNameConfigValue,
	resolveConfigValueOrThrow,
	resolveConfigValueUncached,
	resolveHeadersOrThrow,
} from "./resolve-config-value.ts";

// Schema for OpenRouter routing preferences
const PercentileCutoffsSchema = Type.Object({
	p50: Type.Optional(Type.Number()),
	p75: Type.Optional(Type.Number()),
	p90: Type.Optional(Type.Number()),
	p99: Type.Optional(Type.Number()),
});

const OpenRouterRoutingSchema = Type.Object({
	allow_fallbacks: Type.Optional(Type.Boolean()),
	require_parameters: Type.Optional(Type.Boolean()),
	data_collection: Type.Optional(Type.Union([Type.Literal("deny"), Type.Literal("allow")])),
	zdr: Type.Optional(Type.Boolean()),
	enforce_distillable_text: Type.Optional(Type.Boolean()),
	order: Type.Optional(Type.Array(Type.String())),
	only: Type.Optional(Type.Array(Type.String())),
	ignore: Type.Optional(Type.Array(Type.String())),
	quantizations: Type.Optional(Type.Array(Type.String())),
	sort: Type.Optional(
		Type.Union([
			Type.String(),
			Type.Object({
				by: Type.Optional(Type.String()),
				partition: Type.Optional(Type.Union([Type.String(), Type.Null()])),
			}),
		]),
	),
	max_price: Type.Optional(
		Type.Object({
			prompt: Type.Optional(Type.Union([Type.Number(), Type.String()])),
			completion: Type.Optional(Type.Union([Type.Number(), Type.String()])),
			image: Type.Optional(Type.Union([Type.Number(), Type.String()])),
			audio: Type.Optional(Type.Union([Type.Number(), Type.String()])),
			request: Type.Optional(Type.Union([Type.Number(), Type.String()])),
		}),
	),
	preferred_min_throughput: Type.Optional(Type.Union([Type.Number(), PercentileCutoffsSchema])),
	preferred_max_latency: Type.Optional(Type.Union([Type.Number(), PercentileCutoffsSchema])),
});

// Schema for Vercel AI Gateway routing preferences
const VercelGatewayRoutingSchema = Type.Object({
	only: Type.Optional(Type.Array(Type.String())),
	order: Type.Optional(Type.Array(Type.String())),
});

// Schema for thinking level support and provider-specific values
const ThinkingLevelMapValueSchema = Type.Union([Type.String(), Type.Null()]);
const ThinkingLevelMapSchema = Type.Object({
	off: Type.Optional(ThinkingLevelMapValueSchema),
	minimal: Type.Optional(ThinkingLevelMapValueSchema),
	low: Type.Optional(ThinkingLevelMapValueSchema),
	medium: Type.Optional(ThinkingLevelMapValueSchema),
	high: Type.Optional(ThinkingLevelMapValueSchema),
	xhigh: Type.Optional(ThinkingLevelMapValueSchema),
});

const OpenAICompletionsCompatSchema = Type.Object({
	supportsStore: Type.Optional(Type.Boolean()),
	supportsDeveloperRole: Type.Optional(Type.Boolean()),
	supportsReasoningEffort: Type.Optional(Type.Boolean()),
	supportsUsageInStreaming: Type.Optional(Type.Boolean()),
	maxTokensField: Type.Optional(Type.Union([Type.Literal("max_completion_tokens"), Type.Literal("max_tokens")])),
	requiresToolResultName: Type.Optional(Type.Boolean()),
	requiresAssistantAfterToolResult: Type.Optional(Type.Boolean()),
	requiresThinkingAsText: Type.Optional(Type.Boolean()),
	requiresReasoningContentOnAssistantMessages: Type.Optional(Type.Boolean()),
	thinkingFormat: Type.Optional(
		Type.Union([
			Type.Literal("openai"),
			Type.Literal("openrouter"),
			Type.Literal("together"),
			Type.Literal("deepseek"),
			Type.Literal("zai"),
			Type.Literal("qwen"),
			Type.Literal("qwen-chat-template"),
		]),
	),
	cacheControlFormat: Type.Optional(Type.Literal("anthropic")),
	openRouterRouting: Type.Optional(OpenRouterRoutingSchema),
	vercelGatewayRouting: Type.Optional(VercelGatewayRoutingSchema),
	supportsStrictMode: Type.Optional(Type.Boolean()),
	supportsLongCacheRetention: Type.Optional(Type.Boolean()),
});

const OpenAIResponsesCompatSchema = Type.Object({
	supportsDeveloperRole: Type.Optional(Type.Boolean()),
	sendSessionIdHeader: Type.Optional(Type.Boolean()),
	supportsLongCacheRetention: Type.Optional(Type.Boolean()),
});

const AnthropicMessagesCompatSchema = Type.Object({
	supportsEagerToolInputStreaming: Type.Optional(Type.Boolean()),
	supportsLongCacheRetention: Type.Optional(Type.Boolean()),
	sendSessionAffinityHeaders: Type.Optional(Type.Boolean()),
	supportsCacheControlOnTools: Type.Optional(Type.Boolean()),
	forceAdaptiveThinking: Type.Optional(Type.Boolean()),
});

const ProviderCompatSchema = Type.Union([
	OpenAICompletionsCompatSchema,
	OpenAIResponsesCompatSchema,
	AnthropicMessagesCompatSchema,
]);

// Schema for custom model definition
// Most fields are optional with sensible defaults for local models (Ollama, LM Studio, etc.)
const ModelDefinitionSchema = Type.Object({
	id: Type.String({ minLength: 1 }),
	name: Type.Optional(Type.String({ minLength: 1 })),
	api: Type.Optional(Type.String({ minLength: 1 })),
	baseUrl: Type.Optional(Type.String({ minLength: 1 })),
	reasoning: Type.Optional(Type.Boolean()),
	thinkingLevelMap: Type.Optional(ThinkingLevelMapSchema),
	input: Type.Optional(Type.Array(Type.Union([Type.Literal("text"), Type.Literal("image")]))),
	cost: Type.Optional(
		Type.Object({
			input: Type.Number(),
			output: Type.Number(),
			cacheRead: Type.Number(),
			cacheWrite: Type.Number(),
		}),
	),
	contextWindow: Type.Optional(Type.Number()),
	maxTokens: Type.Optional(Type.Number()),
	headers: Type.Optional(Type.Record(Type.String(), Type.String())),
	compat: Type.Optional(ProviderCompatSchema),
});

// Schema for per-model overrides (all fields optional, merged with built-in model)
const ModelOverrideSchema = Type.Object({
	name: Type.Optional(Type.String({ minLength: 1 })),
	reasoning: Type.Optional(Type.Boolean()),
	thinkingLevelMap: Type.Optional(ThinkingLevelMapSchema),
	input: Type.Optional(Type.Array(Type.Union([Type.Literal("text"), Type.Literal("image")]))),
	cost: Type.Optional(
		Type.Object({
			input: Type.Optional(Type.Number()),
			output: Type.Optional(Type.Number()),
			cacheRead: Type.Optional(Type.Number()),
			cacheWrite: Type.Optional(Type.Number()),
		}),
	),
	contextWindow: Type.Optional(Type.Number()),
	maxTokens: Type.Optional(Type.Number()),
	headers: Type.Optional(Type.Record(Type.String(), Type.String())),
	compat: Type.Optional(ProviderCompatSchema),
});

type ModelOverride = Static<typeof ModelOverrideSchema>;

const ProviderConfigSchema = Type.Object({
	name: Type.Optional(Type.String({ minLength: 1 })),
	baseUrl: Type.Optional(Type.String({ minLength: 1 })),
	apiKey: Type.Optional(Type.String({ minLength: 1 })),
	api: Type.Optional(Type.String({ minLength: 1 })),
	headers: Type.Optional(Type.Record(Type.String(), Type.String())),
	compat: Type.Optional(ProviderCompatSchema),
	authHeader: Type.Optional(Type.Boolean()),
	models: Type.Optional(Type.Array(ModelDefinitionSchema)),
	modelOverrides: Type.Optional(Type.Record(Type.String(), ModelOverrideSchema)),
	/**
	 * When true, the provider does not require an API key. The model is
	 * considered "configured" and invokable even when no apiKey is set in
	 * models.json, env, or auth storage. Use this for local inference
	 * servers (Ollama, LM Studio, vLLM, etc.) where the endpoint accepts
	 * unauthenticated requests.
	 */
	optionalApiKey: Type.Optional(Type.Boolean()),
	/**
	 * When set, dynamically discover models from the provider's local API
	 * and merge them into the registry on refresh. Currently supported:
	 *   - "ollama": hits <baseUrl without /v1>/api/tags
	 * Discovered models are appended to any models listed in `models`.
	 * Discovery is best-effort; if the server is unreachable the static
	 * list is still available.
	 */
	autoDiscover: Type.Optional(Type.Union([Type.Literal("ollama"), Type.Literal("openai")])),
});

const ModelsConfigSchema = Type.Object({
	providers: Type.Record(Type.String(), ProviderConfigSchema),
});

const validateModelsConfig = Compile(ModelsConfigSchema);

type ModelsConfig = Static<typeof ModelsConfigSchema>;

function formatValidationPath(error: TLocalizedValidationError): string {
	if (error.keyword === "required") {
		const requiredProperties = (error.params as { requiredProperties?: string[] }).requiredProperties;
		const requiredProperty = requiredProperties?.[0];
		if (requiredProperty) {
			const basePath = error.instancePath.replace(/^\//, "").replace(/\//g, ".");
			return basePath ? `${basePath}.${requiredProperty}` : requiredProperty;
		}
	}
	const path = error.instancePath.replace(/^\//, "").replace(/\//g, ".");
	return path || "root";
}

/** Provider override config (baseUrl, compat) without request auth/headers */
interface ProviderOverride {
	baseUrl?: string;
	compat?: Model<Api>["compat"];
}

interface ProviderRequestConfig {
	apiKey?: string;
	headers?: Record<string, string>;
	authHeader?: boolean;
}

/**
 * Per-provider flags loaded from models.json that aren't part of the
 * request auth/headers config but affect how the provider is presented
 * to the user (auth requirement) and how models are sourced (auto-discovery).
 */
interface ProviderOptions {
	/** True if the provider does not require an API key. */
	optionalApiKey?: boolean;
	/** Auto-discovery mode (e.g., "ollama", "openai"). */
	autoDiscover?: "ollama" | "openai";
	/** Last-known baseUrl for discovery (so it survives across refreshes). */
	baseUrl?: string;
}

/**
 * Resolved `websearch` provider config (SearXNG endpoint, defaults).
 *
 * Read from `models.json` under `providers.websearch.*`. The `websearch`
 * provider is a tool-config provider (not an LLM provider) — it has no
 * `api`, no `models`, no `apiKey` — so it doesn't fit the model-merging
 * pipeline. We store its resolved form here.
 */
export interface WebsearchProviderConfig {
	/** SearXNG base URL. Trailing `/search` is appended if missing. */
	baseUrl: string;
	/** Default result count (1..20). */
	maxResults: number;
	/** Default language code (e.g., "en"). */
	language: string;
	/** Default safesearch level: "0" (none), "1" (moderate), "2" (strict). */
	safesearch: "0" | "1" | "2";
	/** Optional time-range filter: "day" | "week" | "month" | "year". */
	timeRange?: "day" | "week" | "month" | "year";
	/** Optional custom headers (e.g., for auth-proxy). */
	headers?: Record<string, string>;
}

function migrateLegacyRegisterProviderConfigValue(providerName: string, field: string, value: string): string {
	if (!isLegacyEnvVarNameConfigValue(value)) return value;
	warnDeprecation(
		`registerProvider("${providerName}") ${field} value "${value}" is treated as a legacy environment variable reference. This will no longer be detected as an environment variable reference in a future release. Pass "$${value}" instead.`,
	);
	return `$${value}`;
}

function migrateLegacyRegisterProviderHeaders(
	providerName: string,
	field: string,
	headers: Record<string, string> | undefined,
): Record<string, string> | undefined {
	if (!headers) return undefined;
	let migratedHeaders: Record<string, string> | undefined;
	for (const [key, value] of Object.entries(headers)) {
		const migratedValue = migrateLegacyRegisterProviderConfigValue(providerName, `${field} header "${key}"`, value);
		if (migratedValue === value) continue;
		migratedHeaders ??= { ...headers };
		migratedHeaders[key] = migratedValue;
	}
	return migratedHeaders ?? headers;
}

function migrateLegacyRegisterProviderConfigValues(
	providerName: string,
	config: ProviderConfigInput,
): ProviderConfigInput {
	let migratedConfig: ProviderConfigInput | undefined;

	const setMigratedConfigValue = <TKey extends keyof ProviderConfigInput>(
		key: TKey,
		value: ProviderConfigInput[TKey],
	) => {
		migratedConfig ??= { ...config };
		migratedConfig[key] = value;
	};

	if (config.apiKey) {
		const apiKey = migrateLegacyRegisterProviderConfigValue(providerName, "apiKey", config.apiKey);
		if (apiKey !== config.apiKey) {
			setMigratedConfigValue("apiKey", apiKey);
		}
	}

	const headers = migrateLegacyRegisterProviderHeaders(providerName, "headers", config.headers);
	if (headers !== config.headers) {
		setMigratedConfigValue("headers", headers);
	}

	if (config.models) {
		let models: ProviderConfigInput["models"] | undefined;
		for (let index = 0; index < config.models.length; index++) {
			const model = config.models[index];
			const modelHeaders = migrateLegacyRegisterProviderHeaders(
				providerName,
				`model "${model.id}" headers`,
				model.headers,
			);
			if (modelHeaders === model.headers) continue;
			models ??= [...config.models];
			models[index] = { ...model, headers: modelHeaders };
		}
		if (models) {
			setMigratedConfigValue("models", models);
		}
	}

	return migratedConfig ?? config;
}

export type ResolvedRequestAuth =
	| {
			ok: true;
			apiKey?: string;
			headers?: Record<string, string>;
	  }
	| {
			ok: false;
			error: string;
	  };

/** Result of loading custom models from models.json */
interface CustomModelsResult {
	models: Model<Api>[];
	/** Providers with baseUrl/headers/apiKey overrides for built-in models */
	overrides: Map<string, ProviderOverride>;
	/** Per-model overrides: provider -> modelId -> override */
	modelOverrides: Map<string, Map<string, ModelOverride>>;
	error: string | undefined;
}

function emptyCustomModelsResult(error?: string): CustomModelsResult {
	return { models: [], overrides: new Map(), modelOverrides: new Map(), error };
}

function mergeCompat(
	baseCompat: Model<Api>["compat"],
	overrideCompat: ModelOverride["compat"],
): Model<Api>["compat"] | undefined {
	if (!overrideCompat) return baseCompat;

	const base = baseCompat as OpenAICompletionsCompat | OpenAIResponsesCompat | AnthropicMessagesCompat | undefined;
	const override = overrideCompat as OpenAICompletionsCompat | OpenAIResponsesCompat | AnthropicMessagesCompat;
	const merged = { ...base, ...override } as OpenAICompletionsCompat | OpenAIResponsesCompat | AnthropicMessagesCompat;

	const baseCompletions = base as OpenAICompletionsCompat | undefined;
	const overrideCompletions = override as OpenAICompletionsCompat;
	const mergedCompletions = merged as OpenAICompletionsCompat;

	if (baseCompletions?.openRouterRouting || overrideCompletions.openRouterRouting) {
		mergedCompletions.openRouterRouting = {
			...baseCompletions?.openRouterRouting,
			...overrideCompletions.openRouterRouting,
		};
	}

	if (baseCompletions?.vercelGatewayRouting || overrideCompletions.vercelGatewayRouting) {
		mergedCompletions.vercelGatewayRouting = {
			...baseCompletions?.vercelGatewayRouting,
			...overrideCompletions.vercelGatewayRouting,
		};
	}

	return merged as Model<Api>["compat"];
}

/**
 * Deep merge a model override into a model.
 * Handles nested objects (cost, compat) by merging rather than replacing.
 */
function applyModelOverride(model: Model<Api>, override: ModelOverride): Model<Api> {
	const result = { ...model };

	// Simple field overrides
	if (override.name !== undefined) result.name = override.name;
	if (override.reasoning !== undefined) result.reasoning = override.reasoning;
	if (override.thinkingLevelMap !== undefined) {
		result.thinkingLevelMap = { ...model.thinkingLevelMap, ...override.thinkingLevelMap };
	}
	if (override.input !== undefined) result.input = override.input as ("text" | "image")[];
	if (override.contextWindow !== undefined) result.contextWindow = override.contextWindow;
	if (override.maxTokens !== undefined) result.maxTokens = override.maxTokens;

	// Merge cost (partial override)
	if (override.cost) {
		result.cost = {
			input: override.cost.input ?? model.cost.input,
			output: override.cost.output ?? model.cost.output,
			cacheRead: override.cost.cacheRead ?? model.cost.cacheRead,
			cacheWrite: override.cost.cacheWrite ?? model.cost.cacheWrite,
		};
	}

	// Deep merge compat
	result.compat = mergeCompat(model.compat, override.compat);

	return result;
}

/** Clear the config value command cache. Exported for testing. */
export const clearApiKeyCache = clearConfigValueCache;

/**
 * Model registry - loads and manages models, resolves API keys via AuthStorage.
 */
export class ModelRegistry {
	private models: Model<Api>[] = [];
	private providerRequestConfigs: Map<string, ProviderRequestConfig> = new Map();
	private modelRequestHeaders: Map<string, Record<string, string>> = new Map();
	private registeredProviders: Map<string, ProviderConfigInput> = new Map();
	private loadError: string | undefined = undefined;
	/**
	 * Per-provider flags from models.json: optionalApiKey, autoDiscover.
	 * These are loaded alongside models and used by hasConfiguredAuth() and
	 * discoverOllamaModels().
	 */
	private providerOptions: Map<string, ProviderOptions> = new Map();
	/**
	 * Resolved `websearch` provider config (SearXNG endpoint, defaults).
	 * Stored separately from the model-registry because the websearch
	 * tool is not an LLM provider; it doesn't fit the model-merging
	 * pipeline. Set in `loadCustomModels`, read by `getWebsearchConfig()`.
	 */
	private websearchConfig: WebsearchProviderConfig | undefined;
	/**
	 * Cache of last successful Ollama discovery per provider, so the model
	 * selector doesn't re-hit /api/tags on every refresh. Keyed by provider.
	 */
	private ollamaDiscoveryCache: Map<string, { models: Model<Api>[]; fetchedAt: number }> = new Map();
	/**
	 * In-flight Ollama discovery promises, so concurrent calls share one fetch.
	 */
	private ollamaDiscoveryInflight: Map<string, Promise<Model<Api>[]>> = new Map();
	readonly authStorage: AuthStorage;
	private modelsJsonPath: string | undefined;

	private constructor(authStorage: AuthStorage, modelsJsonPath: string | undefined) {
		this.authStorage = authStorage;
		this.modelsJsonPath = modelsJsonPath ? normalizePath(modelsJsonPath) : undefined;
		this.loadModels();
	}

	static create(authStorage: AuthStorage, modelsJsonPath: string = join(getAgentDir(), "models.json")): ModelRegistry {
		return new ModelRegistry(authStorage, modelsJsonPath);
	}

	static inMemory(authStorage: AuthStorage): ModelRegistry {
		return new ModelRegistry(authStorage, undefined);
	}

	/**
	 * Reload models from disk (built-in + custom from models.json).
	 */
	refresh(): void {
		this.providerRequestConfigs.clear();
		this.modelRequestHeaders.clear();
		this.providerOptions.clear();
		this.websearchConfig = undefined;
		// Note: ollamaDiscoveryCache is NOT cleared so a transient /api/tags
		// failure doesn't make the user lose their model list until the
		// next successful fetch.
		this.loadError = undefined;

		// Ensure dynamic API/OAuth registrations are rebuilt from current provider state.
		resetApiProviders();
		resetOAuthProviders();

		this.loadModels();

		for (const [providerName, config] of this.registeredProviders.entries()) {
			this.applyProviderConfig(providerName, config);
		}
	}

	/**
	 * Get any error from loading models.json (undefined if no error).
	 */
	getError(): string | undefined {
		return this.loadError;
	}

	/**
	 * Add a custom OpenAI-compatible provider at runtime.
	 *
	 * This is the runtime path used by the `/login` "Add OpenAI-compatible
	 * provider" slash-command option. It writes the new provider's config
	 * to `models.json` and the API key to `auth.json`, then refreshes
	 * the in-memory registry so the new model is immediately selectable.
	 *
	 * If the provider name already exists in `models.json`, its model
	 * list is replaced (not merged).
	 *
	 * @param options.name      Provider name (e.g., "groq", "my-llm").
	 *                          Must be unique across built-in providers.
	 * @param options.baseUrl   OpenAI-compatible base URL (e.g.,
	 *                          "https://api.groq.com/openai/v1"). Must
	 *                          use http:// or https://.
	 * @param options.apiKey    API key for the provider. Stored in
	 *                          `auth.json` (the secure store).
	 * @param options.modelId   Model ID (e.g., "llama-3.1-70b-versatile").
	 * @param options.modelName Optional human-readable model name. Defaults
	 *                          to `modelId`.
	 *
	 * @returns The full model id in `<provider>/<modelId>` form.
	 * @throws Error on invalid input, missing models.json path, or
	 *         provider-name conflicts with built-in providers.
	 */
	addOpenAICompatibleProvider(options: {
		name: string;
		baseUrl: string;
		apiKey: string;
		modelId: string;
		modelName?: string;
	}): { providerId: string; modelId: string } {
		// ---- Validate input ----
		const name = options.name?.trim() ?? "";
		const baseUrl = options.baseUrl?.trim() ?? "";
		const apiKey = options.apiKey?.trim() ?? "";
		const modelId = options.modelId?.trim() ?? "";
		const modelName = options.modelName?.trim() || modelId;

		if (!name) throw new Error("Provider name is required");
		if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
			throw new Error(
				`Invalid provider name "${name}". Use only letters, digits, hyphens, and underscores (no spaces or slashes).`,
			);
		}
		if (!baseUrl) throw new Error("Base URL is required");
		let parsedUrl: URL;
		try {
			parsedUrl = new URL(baseUrl);
		} catch {
			throw new Error(`Invalid base URL "${baseUrl}". Include the scheme (e.g., https://...).`);
		}
		if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
			throw new Error(`Invalid protocol "${parsedUrl.protocol}". Use http:// or https://`);
		}
		if (!apiKey) throw new Error("API key is required");
		if (!modelId) throw new Error("Model ID is required");

		// ---- Reject built-in provider names ----
		const builtIn = new Set<string>(getProviders());
		if (builtIn.has(name)) {
			throw new Error(
				`"${name}" is a built-in provider. Choose a different name (e.g., "${name}-custom" or "${name}-proxy").`,
			);
		}

		// ---- Reject if no models.json path is set ----
		if (!this.modelsJsonPath) {
			throw new Error(
				"Cannot add a custom provider: this session was started without a models.json path. Use the SDK or check your agentDir.",
			);
		}

		// ---- Read existing models.json (or start fresh) ----
		let config: { providers?: Record<string, Record<string, unknown>> } = {};
		try {
			if (existsSync(this.modelsJsonPath)) {
				const content = readFileSync(this.modelsJsonPath, "utf-8");
				const parsed = JSON.parse(content);
				if (parsed && typeof parsed === "object") {
					config = parsed as { providers?: Record<string, Record<string, unknown>> };
				}
			}
		} catch (err) {
			// Either the file is unreadable or the JSON is malformed.
			// Refuse to clobber a non-empty file: surface the error.
			if (existsSync(this.modelsJsonPath)) {
				const msg = err instanceof Error ? err.message : String(err);
				throw new Error(
					`Failed to read existing models.json: ${msg}\n\nFix the file manually, or delete it and re-run this command.`,
				);
			}
		}
		if (!config.providers) {
			config.providers = {};
		}

		// ---- Upsert the provider entry ----
		// Note: we write the apiKey to models.json because the schema
		// validator requires either `apiKey` or `optionalApiKey: true`
		// when defining custom models. We ALSO write to auth.json for
		// consistency with the `/login` flow (the secure store is the
		// single source of truth; models.json is the schema-required copy).
		config.providers[name] = {
			baseUrl,
			api: "openai-completions",
			apiKey,
			models: [
				{
					id: modelId,
					name: modelName,
				},
			],
		};

		// ---- Write models.json ----
		mkdirSync(dirname(this.modelsJsonPath), { recursive: true });
		writeFileSync(this.modelsJsonPath, JSON.stringify(config, null, 2) + "\n", "utf-8");

		// ---- Save API key to auth.json ----
		this.authStorage.set(name, { type: "api_key", key: apiKey });

		// ---- Refresh in-memory state so the new model is selectable ----
		this.refresh();

		// Auto-discover models from the new provider immediately so
		// they show up in /model without requiring a restart.
		this.refreshDiscoveredModels().catch(() => {});

		return { providerId: name, modelId };
	}

	private loadModels(): void {
		// Load custom models and overrides from models.json
		const {
			models: customModels,
			overrides,
			modelOverrides,
			error,
		} = this.modelsJsonPath ? this.loadCustomModels(this.modelsJsonPath) : emptyCustomModelsResult();

		if (error) {
			this.loadError = error;
			// Keep built-in models even if custom models failed to load
		}

		const builtInModels = this.loadBuiltInModels(overrides, modelOverrides);
		let combined = this.mergeCustomModels(builtInModels, customModels);

		// Let OAuth providers modify their models (e.g., update baseUrl)
		for (const oauthProvider of this.authStorage.getOAuthProviders()) {
			const cred = this.authStorage.get(oauthProvider.id);
			if (cred?.type === "oauth" && oauthProvider.modifyModels) {
				combined = oauthProvider.modifyModels(combined, cred);
			}
		}

		this.models = combined;
	}

	/** Load built-in models and apply provider/model overrides */
	private loadBuiltInModels(
		overrides: Map<string, ProviderOverride>,
		modelOverrides: Map<string, Map<string, ModelOverride>>,
	): Model<Api>[] {
		return getProviders().flatMap((provider) => {
			const models = getModels(provider as KnownProvider) as Model<Api>[];
			const providerOverride = overrides.get(provider);
			const perModelOverrides = modelOverrides.get(provider);

			return models.map((m) => {
				let model = m;

				// Apply provider-level baseUrl/headers/compat override
				if (providerOverride) {
					model = {
						...model,
						baseUrl: providerOverride.baseUrl ?? model.baseUrl,
						compat: mergeCompat(model.compat, providerOverride.compat),
					};
				}

				// Apply per-model override
				const modelOverride = perModelOverrides?.get(m.id);
				if (modelOverride) {
					model = applyModelOverride(model, modelOverride);
				}

				return model;
			});
		});
	}

	/** Merge custom models into built-in list by provider+id (custom wins on conflicts). */
	private mergeCustomModels(builtInModels: Model<Api>[], customModels: Model<Api>[]): Model<Api>[] {
		const merged = [...builtInModels];
		for (const customModel of customModels) {
			const existingIndex = merged.findIndex((m) => m.provider === customModel.provider && m.id === customModel.id);
			if (existingIndex >= 0) {
				merged[existingIndex] = customModel;
			} else {
				merged.push(customModel);
			}
		}
		return merged;
	}

	private loadCustomModels(modelsJsonPath: string): CustomModelsResult {
		if (!existsSync(modelsJsonPath)) {
			return emptyCustomModelsResult();
		}

		try {
			const content = readFileSync(modelsJsonPath, "utf-8");
			const parsed = JSON.parse(stripJsonComments(content)) as unknown;

			if (!validateModelsConfig.Check(parsed)) {
				const errors =
					validateModelsConfig
						.Errors(parsed)
						.map((error) => `  - ${formatValidationPath(error)}: ${error.message}`)
						.join("\n") || "Unknown schema error";
				return emptyCustomModelsResult(`Invalid models.json schema:\n${errors}\n\nFile: ${modelsJsonPath}`);
			}

			const config = parsed as ModelsConfig;

			// Additional validation
			this.validateConfig(config);

			const overrides = new Map<string, ProviderOverride>();
			const modelOverrides = new Map<string, Map<string, ModelOverride>>();

			for (const [providerName, providerConfig] of Object.entries(config.providers)) {
				if (providerConfig.baseUrl || providerConfig.compat) {
					overrides.set(providerName, {
						baseUrl: providerConfig.baseUrl,
						compat: providerConfig.compat,
					});
				}

				this.storeProviderRequestConfig(providerName, providerConfig);

				if (providerConfig.modelOverrides) {
					modelOverrides.set(providerName, new Map(Object.entries(providerConfig.modelOverrides)));
					for (const [modelId, modelOverride] of Object.entries(providerConfig.modelOverrides)) {
						this.storeModelHeaders(providerName, modelId, modelOverride.headers);
					}
				}

				// Capture per-provider flags (optionalApiKey, autoDiscover) used
				// by hasConfiguredAuth() and discoverOllamaModels().
				if (providerConfig.optionalApiKey || providerConfig.autoDiscover) {
					this.providerOptions.set(providerName, {
						optionalApiKey: providerConfig.optionalApiKey,
						autoDiscover: providerConfig.autoDiscover,
						baseUrl: providerConfig.baseUrl,
					});
				}
			}

			// The websearch provider is special: it's not an LLM provider,
			// just a bag of tool-config options (SearXNG URL, defaults).
			// We extract it here so getWebsearchConfig() can return a
			// typed view of the resolved values.
			this.websearchConfig = this.resolveWebsearchConfig(config.providers.websearch);

			return { models: this.parseModels(config), overrides, modelOverrides, error: undefined };
		} catch (error) {
			if (error instanceof SyntaxError) {
				return emptyCustomModelsResult(`Failed to parse models.json: ${error.message}\n\nFile: ${modelsJsonPath}`);
			}
			return emptyCustomModelsResult(
				`Failed to load models.json: ${error instanceof Error ? error.message : error}\n\nFile: ${modelsJsonPath}`,
			);
		}
	}

	private validateConfig(config: ModelsConfig): void {
		const builtInProviders = new Set<string>(getProviders());

		for (const [providerName, providerConfig] of Object.entries(config.providers)) {
			const isBuiltIn = builtInProviders.has(providerName);
			const hasProviderApi = !!providerConfig.api;
			const models = providerConfig.models ?? [];
			const hasModelOverrides =
				providerConfig.modelOverrides && Object.keys(providerConfig.modelOverrides).length > 0;

			if (models.length === 0) {
				// Override-only config: needs baseUrl, headers, compat, modelOverrides, or some combination.
				if (!providerConfig.baseUrl && !providerConfig.headers && !providerConfig.compat && !hasModelOverrides) {
					throw new Error(
						`Provider ${providerName}: must specify "baseUrl", "headers", "compat", "modelOverrides", or "models".`,
					);
				}
			} else if (!isBuiltIn) {
				// Non-built-in providers with custom models require endpoint + auth.
				if (!providerConfig.baseUrl) {
					throw new Error(`Provider ${providerName}: "baseUrl" is required when defining custom models.`);
				}
				if (!providerConfig.apiKey && !providerConfig.optionalApiKey) {
					throw new Error(
						`Provider ${providerName}: "apiKey" is required when defining custom models (or set "optionalApiKey: true" for local servers that don't need auth).`,
					);
				}
			}
			// Built-in providers with custom models: baseUrl/apiKey/api are optional,
			// inherited from built-in models. Auth comes from env vars / auth storage.

			for (const modelDef of models) {
				const hasModelApi = !!modelDef.api;

				if (!hasProviderApi && !hasModelApi && !isBuiltIn) {
					throw new Error(
						`Provider ${providerName}, model ${modelDef.id}: no "api" specified. Set at provider or model level.`,
					);
				}				// For built-in providers, api is optional — inherited from built-in models.

				if (!modelDef.id) throw new Error(`Provider ${providerName}: model missing "id"`);
				// Validate contextWindow/maxTokens only if provided (they have defaults)
				if (modelDef.contextWindow !== undefined && modelDef.contextWindow <= 0)
					throw new Error(`Provider ${providerName}, model ${modelDef.id}: invalid contextWindow`);
				if (modelDef.maxTokens !== undefined && modelDef.maxTokens <= 0)
					throw new Error(`Provider ${providerName}, model ${modelDef.id}: invalid maxTokens`);
			}
		}
	}

	private parseModels(config: ModelsConfig): Model<Api>[] {
		const models: Model<Api>[] = [];
		const builtInProviders = new Set<string>(getProviders());

		// Cache built-in defaults (api, baseUrl) per provider, extracted from first model.
		const builtInDefaultsCache = new Map<string, { api: string; baseUrl: string }>();
		const getBuiltInDefaults = (providerName: string): { api: string; baseUrl: string } | undefined => {
			if (!builtInProviders.has(providerName)) return undefined;
			if (builtInDefaultsCache.has(providerName)) return builtInDefaultsCache.get(providerName);
			const builtIn = getModels(providerName as KnownProvider) as Model<Api>[];
			if (builtIn.length === 0) return undefined;
			const defaults = { api: builtIn[0].api, baseUrl: builtIn[0].baseUrl };
			builtInDefaultsCache.set(providerName, defaults);
			return defaults;
		};

		for (const [providerName, providerConfig] of Object.entries(config.providers)) {
			const modelDefs = providerConfig.models ?? [];
			if (modelDefs.length === 0) continue; // Override-only, no custom models

			const builtInDefaults = getBuiltInDefaults(providerName);

			for (const modelDef of modelDefs) {
				const api = modelDef.api ?? providerConfig.api ?? builtInDefaults?.api;
				if (!api) continue;

				const baseUrl = modelDef.baseUrl ?? providerConfig.baseUrl ?? builtInDefaults?.baseUrl;
				if (!baseUrl) continue;

				const compat = mergeCompat(providerConfig.compat, modelDef.compat);
				this.storeModelHeaders(providerName, modelDef.id, modelDef.headers);

				const defaultCost = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
				models.push({
					id: modelDef.id,
					name: modelDef.name ?? modelDef.id,
					api: api as Api,
					provider: providerName,
					baseUrl,
					reasoning: modelDef.reasoning ?? false,
					thinkingLevelMap: modelDef.thinkingLevelMap,
					input: (modelDef.input ?? ["text"]) as ("text" | "image")[],
					cost: modelDef.cost ?? defaultCost,
					contextWindow: modelDef.contextWindow ?? 128000,
					maxTokens: modelDef.maxTokens ?? 16384,
					headers: undefined,
					compat,
				} as Model<Api>);
			}
		}

		return models;
	}

	/**
	 * Get all models (built-in + custom).
	 * If models.json had errors, returns only built-in models.
	 */
	getAll(): Model<Api>[] {
		return this.models;
	}

	/**
	 * Get only models that have auth configured.
	 * This is a fast check that doesn't refresh OAuth tokens.
	 */
	getAvailable(): Model<Api>[] {
		return this.models.filter((m) => this.hasConfiguredAuth(m));
	}

	/**
	 * Discover models from a local Ollama server. Called by the model
	 * selector for any provider that has `autoDiscover: "ollama"` in
	 * models.json.
	 *
	 * Hits `<baseUrl with /v1 stripped>/api/tags` (Ollama's native REST
	 * endpoint). Each discovered model is shaped as an openai-completions
	 * model pointing at the same baseUrl, so the rest of the pipeline
	 * (auth, request, streaming) works unchanged.
	 *
	 * The result is cached for 60s per provider, so re-opening the model
	 * selector doesn't keep hitting the server. A fetch is in-flight at
	 * most once per provider.
	 *
	 * On any failure (server down, network error, non-Ollama server) the
	 * previously-cached models are kept, so a transient outage doesn't
	 * empty the model list. If no cache exists, returns [].
	 */
	async discoverOllamaModels(provider: string): Promise<Model<Api>[]> {
		const cached = this.ollamaDiscoveryCache.get(provider);
		if (cached && Date.now() - cached.fetchedAt < 60_000) {
			return cached.models;
		}
		const inflight = this.ollamaDiscoveryInflight.get(provider);
		if (inflight) {
			return inflight;
		}
		const promise = this.fetchOllamaModels(provider);
		this.ollamaDiscoveryInflight.set(provider, promise);
		try {
			const models = await promise;
			this.ollamaDiscoveryCache.set(provider, { models, fetchedAt: Date.now() });
			return models;
		} finally {
			this.ollamaDiscoveryInflight.delete(provider);
		}
	}

	private async fetchOllamaModels(provider: string): Promise<Model<Api>[]> {
		const options = this.providerOptions.get(provider);
		if (!options?.autoDiscover || !options.baseUrl) return [];

		const baseUrl = options.baseUrl;
		const providerConfig = this.providerRequestConfigs.get(provider);
		const apiKey = providerConfig?.apiKey
			? resolveConfigValueUncached(providerConfig.apiKey)
			: undefined;
		const headers: Record<string, string> = { Accept: "application/json" };
		if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

		const previous = this.ollamaDiscoveryCache.get(provider)?.models;

		let url: string;
		let extractNames: (body: unknown) => string[];

		if (options.autoDiscover === "ollama") {
			url = baseUrl.replace(/\/v1\/?$/, "") + "/api/tags";
			extractNames = (body) => {
				const tags = (body as { models?: Array<{ name: string }> }).models;
				return Array.isArray(tags) ? tags.filter((t) => t?.name).map((t) => t.name) : [];
			};
		} else if (options.autoDiscover === "openai") {
			url = baseUrl.replace(/\/+$/, "") + "/models";
			extractNames = (body) => {
				const data = (body as { data?: Array<{ id: string }> }).data;
				return Array.isArray(data) ? data.filter((d) => d?.id).map((d) => d.id) : [];
			};
		} else {
			return [];
		}

		let response: Response;
		try {
			response = await fetch(url, { method: "GET", headers, signal: AbortSignal.timeout(5000) });
		} catch {
			return previous ?? [];
		}
		if (!response.ok) {
			return previous ?? [];
		}

		let body: unknown;
		try {
			body = await response.json();
		} catch {
			return previous ?? [];
		}

		const names = extractNames(body);
		const models: Model<Api>[] = names.map((name) => ({
			id: name,
			name,
			api: "openai-completions" as const,
			provider,
			baseUrl,
			reasoning: false,
			input: ["text"] as ("text" | "image")[],
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			contextWindow: 128000,
			maxTokens: 16384,
			headers: undefined,
			compat: undefined,
		}));

		const overrides = this.loadModelOverridesForProvider(provider);
		if (overrides) {
			for (let i = 0; i < models.length; i++) {
				const ov = overrides.get(models[i].id);
				if (ov) models[i] = applyModelOverride(models[i], ov);
			}
		}

		return models;
	}

	/**
	 * Get the list of providers configured for auto-discovery.
	 */
	getAutoDiscoverProviders(): string[] {
		const out: string[] = [];
		for (const [name, opts] of this.providerOptions.entries()) {
			if (opts.autoDiscover) out.push(name);
		}
		return out;
	}

	/**
	 * Resolve the `providers.websearch` config into a typed shape.
	 * Returns `undefined` if no websearch provider is configured (the tool
	 * will use its hardcoded default in that case).
	 */
	private resolveWebsearchConfig(
		raw: Static<typeof ProviderConfigSchema> | undefined,
	): WebsearchProviderConfig | undefined {
		if (!raw || !raw.baseUrl) return undefined;
		const baseUrl = this.normalizeWebsearchUrl(raw.baseUrl);
		const maxResultsRaw = (raw as Record<string, unknown>).maxResults;
		const languageRaw = (raw as Record<string, unknown>).language;
		const safesearchRaw = (raw as Record<string, unknown>).safesearch;
		const timeRangeRaw = (raw as Record<string, unknown>).timeRange;
		const headers = raw.headers;

		const maxResults =
			typeof maxResultsRaw === "number" && maxResultsRaw >= 1 && maxResultsRaw <= 20
				? Math.floor(maxResultsRaw)
				: 10;
		const language = typeof languageRaw === "string" && /^[a-z]{2}$/i.test(languageRaw) ? languageRaw.toLowerCase() : "en";
		const safesearch: "0" | "1" | "2" =
			safesearchRaw === "0" || safesearchRaw === "1" || safesearchRaw === "2" ? safesearchRaw : "0";
		const timeRange: WebsearchProviderConfig["timeRange"] =
			timeRangeRaw === "day" ||
			timeRangeRaw === "week" ||
			timeRangeRaw === "month" ||
			timeRangeRaw === "year"
				? timeRangeRaw
				: undefined;

		return {
			baseUrl,
			maxResults,
			language,
			safesearch,
			timeRange,
			headers: headers && Object.keys(headers).length > 0 ? headers : undefined,
		};
	}

	/**
	 * Normalize a SearXNG base URL: strip trailing slash and ensure the
	 * path ends in `/search` (SearXNG's JSON endpoint). If the user
	 * passes a host-only URL like `https://search.example.com`, we add
	 * `/search`. If they pass `https://search.example.com/foo/`, we
	 * strip the trailing slash but leave the path alone (they know
	 * what they want).
	 */
	private normalizeWebsearchUrl(input: string): string {
		let url = input.trim();
		// Strip trailing slashes
		while (url.endsWith("/")) url = url.slice(0, -1);
		// If the path is empty or just "/", append /search
		const slash = url.indexOf("//");
			if (slash !== -1) {
				const afterScheme = url.indexOf("/", slash + 2);
				if (afterScheme === -1) {
					url = `${url}/search`;
				}
			}
		return url;
	}

	/**
	 * Read the resolved `providers.websearch` config. Returns
	 * `undefined` if no websearch provider is configured in
	 * models.json (the tool will fall back to its hardcoded default).
	 */
	getWebsearchConfig(): WebsearchProviderConfig | undefined {
		return this.websearchConfig;
	}

	/**
	 * Update the websearch config in-memory. Use this when the
	 * models.json file is edited at runtime (e.g., by the /searcheng
	 * slash command) and you want the next websearch call to use the
	 * new value without forcing a full registry refresh.
	 */
	setWebsearchConfig(config: WebsearchProviderConfig | undefined): void {
		this.websearchConfig = config;
	}

	/**
	 * Returns true if the provider is configured to NOT require an API
	 * key (i.e. `optionalApiKey: true` in models.json). Used by
	 * callers that need to skip the "no API key configured" error and
	 * proceed with an unauthenticated request.
	 */
	isProviderAuthOptional(provider: string): boolean {
		return this.providerOptions.get(provider)?.optionalApiKey === true;
	}

	/**
	 * Discover models for all configured auto-discover providers in
	 * parallel, and add the results to `this.models` (deduped by
	 * provider+id against existing models). The merge is idempotent —
	 * calling this multiple times is safe.
	 *
	 * Returns the number of newly-added models.
	 *
	 * Note: this mutates the registry's model list. Callers that want
	 * a non-mutating list should call `getAutoDiscoverProviders()` and
	 * `discoverOllamaModels()` directly.
	 */
	async refreshDiscoveredModels(): Promise<number> {
		const providers = this.getAutoDiscoverProviders();
		if (providers.length === 0) return 0;
		const results = await Promise.allSettled(providers.map((p) => this.discoverOllamaModels(p)));
		const existing = new Set(this.models.map((m) => `${m.provider}/${m.id}`));
		let added = 0;
		for (let i = 0; i < results.length; i++) {
			const r = results[i];
			if (r.status !== "fulfilled") continue;
			for (const m of r.value) {
				const key = `${m.provider}/${m.id}`;
				if (!existing.has(key)) {
					this.models.push(m);
					existing.add(key);
					added++;
				}
			}
		}
		return added;
	}

	/**
	 * Return the per-model override map for a provider (loaded from
	 * models.json's `modelOverrides` field). Used by Ollama discovery
	 * to apply user-configured contextWindow/maxTokens/compat to
	 * auto-discovered models.
	 */
	private loadModelOverridesForProvider(provider: string): Map<string, ModelOverride> | undefined {
		if (!this.modelsJsonPath) return undefined;
		// Cheap path: re-parse models.json. The alternative is to cache
		// the override map on the registry instance; the current load
		// already does this internally but doesn't expose it. For now,
		// re-reading the file is acceptable because:
		//  - it happens at most once per provider per 60s (cache TTL)
		//  - models.json is tiny (typically a few KB)
		//  - it picks up edits to models.json that happened after refresh
		try {
			const content = readFileSync(this.modelsJsonPath, "utf-8");
			const parsed = JSON.parse(stripJsonComments(content)) as { providers?: Record<string, { modelOverrides?: Record<string, ModelOverride> }> };
			const providerConfig = parsed.providers?.[provider];
			const overrides = providerConfig?.modelOverrides;
			if (!overrides) return undefined;
			return new Map(Object.entries(overrides));
		} catch {
			return undefined;
		}
	}


	/**
	 * Find a model by provider and ID.
	 */
	find(provider: string, modelId: string): Model<Api> | undefined {
		return this.models.find((m) => m.provider === provider && m.id === modelId);
	}

	/**
	 * Get API key for a model.
	 *
	 * Returns true if the model can be invoked. True when:
	 *  - auth is configured in auth storage (env var, OAuth, etc.)
	 *  - apiKey is configured in models.json and is a usable value
	 *  - the provider is marked optionalApiKey: true in models.json
	 *    (e.g. local Ollama, LM Studio, vLLM)
	 */
	hasConfiguredAuth(model: Model<Api>): boolean {
		if (this.providerOptions.get(model.provider)?.optionalApiKey) {
			return true;
		}
		const providerApiKey = this.providerRequestConfigs.get(model.provider)?.apiKey;
		return (
			this.authStorage.hasAuth(model.provider) ||
			(providerApiKey !== undefined && isConfigValueConfigured(providerApiKey))
		);
	}

	private getModelRequestKey(provider: string, modelId: string): string {
		return `${provider}:${modelId}`;
	}

	private storeProviderRequestConfig(
		providerName: string,
		config: {
			apiKey?: string;
			headers?: Record<string, string>;
			authHeader?: boolean;
		},
	): void {
		if (!config.apiKey && !config.headers && !config.authHeader) {
			return;
		}

		this.providerRequestConfigs.set(providerName, {
			apiKey: config.apiKey,
			headers: config.headers,
			authHeader: config.authHeader,
		});
	}

	private storeModelHeaders(providerName: string, modelId: string, headers?: Record<string, string>): void {
		const key = this.getModelRequestKey(providerName, modelId);
		if (!headers || Object.keys(headers).length === 0) {
			this.modelRequestHeaders.delete(key);
			return;
		}
		this.modelRequestHeaders.set(key, headers);
	}

	/**
	 * Get API key and request headers for a model.
	 *
	 * For providers marked `optionalApiKey: true` in models.json, returns
	 * `ok: true` with no apiKey when none is configured, so the local
	 * inference server can be invoked without auth.
	 */
	async getApiKeyAndHeaders(model: Model<Api>): Promise<ResolvedRequestAuth> {
		try {
			const providerConfig = this.providerRequestConfigs.get(model.provider);
			const providerOptions = this.providerOptions.get(model.provider);
			const optionalApiKey = providerOptions?.optionalApiKey === true;
			const apiKeyFromAuthStorage = await this.authStorage.getApiKey(model.provider, { includeFallback: false });
			let apiKey: string | undefined;
			try {
				apiKey =
					apiKeyFromAuthStorage ??
					(providerConfig?.apiKey
						? resolveConfigValueOrThrow(providerConfig.apiKey, `API key for provider "${model.provider}"`)
						: undefined);
			} catch (resolveError) {
				// If the user provided an apiKey in models.json that fails to
				// resolve, fall back to "no key" rather than erroring out
				// — but only for optionalApiKey providers. For required-auth
				// providers, surface the error as before.
				if (!optionalApiKey) {
					throw resolveError;
				}
				apiKey = undefined;
			}

			const providerHeaders = resolveHeadersOrThrow(providerConfig?.headers, `provider "${model.provider}"`);
			const modelHeaders = resolveHeadersOrThrow(
				this.modelRequestHeaders.get(this.getModelRequestKey(model.provider, model.id)),
				`model "${model.provider}/${model.id}"`,
			);

			let headers =
				model.headers || providerHeaders || modelHeaders
					? { ...model.headers, ...providerHeaders, ...modelHeaders }
					: undefined;

			if (providerConfig?.authHeader) {
				if (!apiKey) {
					return { ok: false, error: `No API key found for "${model.provider}"` };
				}
				headers = { ...headers, Authorization: `Bearer ${apiKey}` };
			}

			return {
				ok: true,
				apiKey,
				headers: headers && Object.keys(headers).length > 0 ? headers : undefined,
			};
		} catch (error) {
			return {
				ok: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	/**
	 * Return auth status for a provider, including request auth configured in models.json.
	 * This intentionally does not execute command-backed config values.
	 */
	getProviderAuthStatus(provider: string): AuthStatus {
		const authStatus = this.authStorage.getAuthStatus(provider);
		if (authStatus.source) {
			return authStatus;
		}

		const providerApiKey = this.providerRequestConfigs.get(provider)?.apiKey;
		if (!providerApiKey) {
			return authStatus;
		}

		if (isCommandConfigValue(providerApiKey)) {
			return { configured: true, source: "models_json_command" };
		}

		const envVarNames = getConfigValueEnvVarNames(providerApiKey);
		if (envVarNames.length > 0) {
			return isConfigValueConfigured(providerApiKey)
				? { configured: true, source: "environment", label: envVarNames.join(", ") }
				: { configured: false };
		}

		return { configured: true, source: "models_json_key" };
	}

	/**
	 * Get display name for a provider.
	 */
	getProviderDisplayName(provider: string): string {
		const registeredProvider = this.registeredProviders.get(provider);
		const oauthProvider = this.authStorage.getOAuthProviders().find((p) => p.id === provider);

		return (
			registeredProvider?.name ??
			registeredProvider?.oauth?.name ??
			oauthProvider?.name ??
			BUILT_IN_PROVIDER_DISPLAY_NAMES[provider] ??
			provider
		);
	}

	/**
	 * Get API key for a provider.
	 */
	async getApiKeyForProvider(provider: string): Promise<string | undefined> {
		const apiKey = await this.authStorage.getApiKey(provider, { includeFallback: false });
		if (apiKey !== undefined) {
			return apiKey;
		}

		const providerApiKey = this.providerRequestConfigs.get(provider)?.apiKey;
		return providerApiKey ? resolveConfigValueUncached(providerApiKey) : undefined;
	}

	/**
	 * Check if a model is using OAuth credentials (subscription).
	 */
	isUsingOAuth(model: Model<Api>): boolean {
		const cred = this.authStorage.get(model.provider);
		return cred?.type === "oauth";
	}

	/**
	 * Register a provider dynamically (from extensions).
	 *
	 * If provider has models: replaces all existing models for this provider.
	 * If provider has only baseUrl/headers: overrides existing models' URLs.
	 * If provider has oauth: registers OAuth provider for /login support.
	 */
	registerProvider(providerName: string, config: ProviderConfigInput): void {
		const migratedConfig = migrateLegacyRegisterProviderConfigValues(providerName, config);
		this.validateProviderConfig(providerName, migratedConfig);
		this.applyProviderConfig(providerName, migratedConfig);
		this.upsertRegisteredProvider(providerName, migratedConfig);
	}

	/**
	 * Unregister a previously registered provider.
	 *
	 * Removes the provider from the registry and reloads models from disk so that
	 * built-in models overridden by this provider are restored to their original state.
	 * Also resets dynamic OAuth and API stream registrations before reapplying
	 * remaining dynamic providers.
	 * Has no effect if the provider was never registered.
	 */
	unregisterProvider(providerName: string): void {
		if (!this.registeredProviders.has(providerName)) return;
		this.registeredProviders.delete(providerName);
		this.refresh();
	}

	/**
	 * Upsert a provider config into registeredProviders.
	 * If the provider is already registered, defined values in the incoming config
	 * override existing ones; undefined values are preserved from the stored config.
	 * If the provider is not registered, the incoming config is stored as-is.
	 */
	private upsertRegisteredProvider(providerName: string, config: ProviderConfigInput): void {
		const existing = this.registeredProviders.get(providerName);
		if (!existing) {
			this.registeredProviders.set(providerName, config);
			return;
		}
		for (const k of Object.keys(config) as (keyof ProviderConfigInput)[]) {
			if (config[k] !== undefined) {
				(existing as Record<string, unknown>)[k] = config[k];
			}
		}
	}

	private validateProviderConfig(providerName: string, config: ProviderConfigInput): void {
		if (config.streamSimple && !config.api) {
			throw new Error(`Provider ${providerName}: "api" is required when registering streamSimple.`);
		}

		if (!config.models || config.models.length === 0) {
			return;
		}

		if (!config.baseUrl) {
			throw new Error(`Provider ${providerName}: "baseUrl" is required when defining models.`);
		}
		if (!config.apiKey && !config.oauth && !config.optionalApiKey) {
			throw new Error(
				`Provider ${providerName}: "apiKey", "oauth", or "optionalApiKey: true" is required when defining models.`,
			);
		}

		for (const modelDef of config.models) {
			const api = modelDef.api || config.api;
			if (!api) {
				throw new Error(`Provider ${providerName}, model ${modelDef.id}: no "api" specified.`);
			}
		}
	}

	private applyProviderConfig(providerName: string, config: ProviderConfigInput): void {
		// Register OAuth provider if provided
		if (config.oauth) {
			// Ensure the OAuth provider ID matches the provider name
			const oauthProvider: OAuthProviderInterface = {
				...config.oauth,
				id: providerName,
			};
			registerOAuthProvider(oauthProvider);
		}

		if (config.streamSimple) {
			const streamSimple = config.streamSimple;
			registerApiProvider(
				{
					api: config.api!,
					stream: (model, context, options) => streamSimple(model, context, options as SimpleStreamOptions),
					streamSimple,
				},
				`provider:${providerName}`,
			);
		}

		this.storeProviderRequestConfig(providerName, config);

		if (config.models && config.models.length > 0) {
			// Full replacement: remove existing models for this provider
			this.models = this.models.filter((m) => m.provider !== providerName);

			// Parse and add new models
			for (const modelDef of config.models) {
				const api = modelDef.api || config.api;
				this.storeModelHeaders(providerName, modelDef.id, modelDef.headers);

				this.models.push({
					id: modelDef.id,
					name: modelDef.name,
					api: api as Api,
					provider: providerName,
					baseUrl: modelDef.baseUrl ?? config.baseUrl!,
					reasoning: modelDef.reasoning,
					thinkingLevelMap: modelDef.thinkingLevelMap,
					input: modelDef.input as ("text" | "image")[],
					cost: modelDef.cost,
					contextWindow: modelDef.contextWindow,
					maxTokens: modelDef.maxTokens,
					headers: undefined,
					compat: modelDef.compat,
				} as Model<Api>);
			}

			// Apply OAuth modifyModels if credentials exist (e.g., to update baseUrl)
			if (config.oauth?.modifyModels) {
				const cred = this.authStorage.get(providerName);
				if (cred?.type === "oauth") {
					this.models = config.oauth.modifyModels(this.models, cred);
				}
			}
		} else if (config.baseUrl || config.headers) {
			// Override-only: update baseUrl for existing models. Request headers are resolved per request.
			this.models = this.models.map((m) => {
				if (m.provider !== providerName) return m;
				return {
					...m,
					baseUrl: config.baseUrl ?? m.baseUrl,
				};
			});
		}
	}
}

/**
 * Input type for registerProvider API.
 */
export interface ProviderConfigInput {
	name?: string;
	baseUrl?: string;
	apiKey?: string;
	api?: Api;
	streamSimple?: (model: Model<Api>, context: Context, options?: SimpleStreamOptions) => AssistantMessageEventStream;
	headers?: Record<string, string>;
	authHeader?: boolean;
	/** When true, the provider does not require an API key. Use for local
	 *  inference servers (Ollama, LM Studio, vLLM) that accept unauthenticated
	 *  requests. */
	optionalApiKey?: boolean;
	/** Auto-discover models from the provider's local API. Currently
	 *  supported: "ollama" — hits `<baseUrl>/api/tags`; "openai" — hits `<baseUrl>/v1/models`. */
	autoDiscover?: "ollama" | "openai";
	/** OAuth provider for /login support */
	oauth?: Omit<OAuthProviderInterface, "id">;
	models?: Array<{
		id: string;
		name: string;
		api?: Api;
		baseUrl?: string;
		reasoning: boolean;
		thinkingLevelMap?: Model<Api>["thinkingLevelMap"];
		input: ("text" | "image")[];
		cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
		contextWindow: number;
		maxTokens: number;
		headers?: Record<string, string>;
		compat?: Model<Api>["compat"];
	}>;
}
