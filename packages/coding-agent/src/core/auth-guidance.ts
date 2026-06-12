import { join } from "node:path";
import { getDocsPath } from "../config.ts";

const UNKNOWN_PROVIDER = "unknown";

export function getProviderLoginHelp(): string {
	return [
		"Use /login to log into a provider via OAuth or API key. See:",
		`  ${join(getDocsPath(), "providers.md")}`,
		`  ${join(getDocsPath(), "models.md")}`,
	].join("\n");
}

export function formatNoModelsAvailableMessage(): string {
	return [
		"No models available.",
		"",
		"Quick start:",
		"  1. Local models: install Ollama (https://ollama.com) and pull a model,",
		"     e.g. `ollama pull gemma4:e2b`. The default models.json already",
		"     auto-discovers Ollama at http://localhost:11434/v1.",
		"  2. Cloud providers: run `/login` to add an API key. Built-in",
		"     providers include anthropic, openai, google, and 20+ others.",
		"  3. Edit ~/.ai/agent/models.json by hand to add LM Studio, vLLM,",
		"     or any OpenAI-compatible server. See docs/models.md.",
		"",
		`Full provider reference: ${join(getDocsPath(), "providers.md")}`,
		`Models reference: ${join(getDocsPath(), "models.md")}`,
	].join("\n");
}

export function formatNoModelSelectedMessage(): string {
	return `No model selected.\n\n${getProviderLoginHelp()}\n\nThen use /model to select a model.`;
}

export function formatNoApiKeyFoundMessage(provider: string): string {
	const providerDisplay = provider === UNKNOWN_PROVIDER ? "the selected model" : provider;
	return `No API key found for ${providerDisplay}.\n\n${getProviderLoginHelp()}`;
}
