import type { AgentTool } from "@simpletoolsindiaorg/ai-agent";
import { Text } from "@simpletoolsindiaorg/ai-tui";
import { type Static, Type } from "typebox";
import type { Theme } from "../../modes/interactive/theme/theme.ts";
import type { ToolDefinition, ToolRenderContext } from "../extensions/types.ts";
import { getTextOutput, str } from "./render-utils.ts";
import { wrapToolDefinition } from "./tool-definition-wrapper.ts";

const DEFAULT_SEARCH_URL = "https://search.sridharhomelab.in/search";
const DEFAULT_RESULT_LIMIT = 10;
const MAX_RESULT_LIMIT = 20;
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 120_000;
const MIN_TIMEOUT_MS = 1000;
const USER_AGENT = `ai-websearch/1.0 (+${DEFAULT_SEARCH_URL})`;

const ALLOWED_CATEGORIES = new Set([
	"general",
	"images",
	"videos",
	"news",
	"map",
	"music",
	"it",
	"science",
	"files",
	"social media",
]);

const ALLOWED_LANGUAGES = new Set([
	"en",
	"de",
	"fr",
	"es",
	"it",
	"nl",
	"pt",
	"ru",
	"zh",
	"ja",
	"ko",
	"ar",
	"hi",
	"tr",
	"pl",
	"sv",
	"fi",
	"da",
	"no",
	"cs",
	"hu",
	"el",
	"he",
	"id",
	"vi",
	"th",
]);

const ALLOWED_SAFESEARCH = new Set(["0", "1", "2"]);
const ALLOWED_TIME_RANGE = new Set(["", "day", "week", "month", "year"]);

const websearchSchema = Type.Object({
	query: Type.String({
		description: "Search query string. Use specific terms for better results.",
		minLength: 1,
	}),
	limit: Type.Optional(
		Type.Number({
			description: "Maximum number of results to return (default: 10, max: 20)",
			minimum: 1,
			maximum: MAX_RESULT_LIMIT,
		}),
	),
	categories: Type.Optional(
		Type.String({
			description:
				'Comma-separated SearXNG categories. One or more of: general, images, videos, news, map, music, it, science, files, "social media". Default: general.',
		}),
	),
	language: Type.Optional(
		Type.String({
			description: "Two-letter language code for results (default: en). Examples: en, de, fr, es, ja, zh.",
		}),
	),
	safesearch: Type.Optional(
		Type.String({
			description: 'Safe-search filter: 0 = none, 1 = moderate, 2 = strict. Default: "0".',
		}),
	),
	timeRange: Type.Optional(
		Type.String({
			description: "Restrict results to a recent time window: day, week, month, year. Default: no restriction.",
		}),
	),
	timeoutMs: Type.Optional(
		Type.Number({
			description: "Request timeout in milliseconds (default: 30000, max: 120000)",
			minimum: 1000,
			maximum: MAX_TIMEOUT_MS,
		}),
	),
});

export type WebsearchToolInput = Static<typeof websearchSchema>;

export interface WebsearchResult {
	title: string;
	url: string;
	content?: string;
	engine?: string;
	category?: string;
	publishedDate?: string | null;
}

export interface WebsearchToolDetails {
	query: string;
	searchUrl: string;
	resultCount: number;
	elapsedMs: number;
	engine?: string;
	error?: string;
}

/**
 * Pluggable operations for the websearch tool.
 * Override these to inject mocks, caching, or alternative search backends.
 */
export interface WebsearchOperations {
	fetch: (
		url: string,
		options: { signal: AbortSignal },
	) => Promise<{
		ok: boolean;
		status: number;
		statusText: string;
		json: () => Promise<unknown>;
	}>;
}

const defaultOperations: WebsearchOperations = {
	fetch: async (url, options) => {
		const response = await fetch(url, {
			signal: options.signal,
			headers: { "User-Agent": USER_AGENT },
		});
		return {
			ok: response.ok,
			status: response.status,
			statusText: response.statusText,
			json: () => response.json() as Promise<unknown>,
		};
	},
};

function parseCsv(value: string | undefined, allowed: Set<string>): string | undefined {
	if (!value) return undefined;
	const parts = value
		.split(",")
		.map((s) => s.trim().toLowerCase())
		.filter(Boolean);
	const valid = parts.filter((p) => allowed.has(p));
	return valid.length > 0 ? valid.join(",") : undefined;
}

function formatResultsMarkdown(
	query: string,
	results: WebsearchResult[],
	searchUrl: string,
	elapsedMs: number,
): string {
	if (results.length === 0) {
		return `No results for "${query}".`;
	}
	const lines: string[] = [];
	lines.push(`Found ${results.length} result${results.length === 1 ? "" : "s"} for "${query}" in ${elapsedMs}ms.`);
	lines.push("");
	results.forEach((r, i) => {
		const title = r.title?.trim() || "(untitled)";
		lines.push(`${i + 1}. **${title}**`);
		lines.push(`   URL: ${r.url}`);
		if (r.content && r.content.trim().length > 0) {
			const snippet = r.content.replace(/\s+/g, " ").trim();
			lines.push(`   Snippet: ${snippet}`);
		}
		if (r.publishedDate) {
			lines.push(`   Published: ${r.publishedDate}`);
		}
		if (r.engine) {
			lines.push(`   Engine: ${r.engine}`);
		}
		lines.push("");
	});
	lines.push(`Source: ${searchUrl}`);
	return lines.join("\n");
}

function buildSearxngUrl(
	searchUrl: string,
	query: string,
	options: {
		limit: number;
		categories: string;
		language: string;
		safesearch: string;
		timeRange: string;
	},
): string {
	const url = new URL(searchUrl);
	url.searchParams.set("q", query);
	url.searchParams.set("format", "json");
	url.searchParams.set("categories", options.categories);
	url.searchParams.set("language", options.language);
	url.searchParams.set("safesearch", options.safesearch);
	if (options.timeRange) {
		url.searchParams.set("time_range", options.timeRange);
	}
	url.searchParams.set("pageno", "1");
	return url.toString();
}

export interface WebsearchToolOptions {
	searchUrl?: string;
	operations?: WebsearchOperations;
}

export function createWebsearchToolDefinition(
	_cwd: string,
	options?: WebsearchToolOptions,
): ToolDefinition<typeof websearchSchema, WebsearchToolDetails | undefined> {
	const ops = options?.operations ?? defaultOperations;
	const searchUrl = options?.searchUrl ?? DEFAULT_SEARCH_URL;

	return {
		name: "websearch",
		label: "Websearch",
		description: [
			"Search the public web via SearXNG (search.sridharhomelab.in) and return the top results as a markdown list.",
			"Each result includes title, URL, and snippet. Use webfetch to read a specific result's content.",
			"",
			"**Use this tool whenever the user asks for:**",
			"- Current or real-time information (prices, weather, news, current events, sports scores, stock quotes)",
			"- Information that may have changed since your training cutoff",
			"- Library / framework / API documentation lookups",
			"- Specific URLs you don't already know the contents of",
			"- External services, products, or companies you can't recall from training data",
			"",
			"Do NOT use this for:",
			"- General knowledge you already have (basic programming, math, science, etc.)",
			"- Code in the current project (use read, grep, find, ls instead)",
			"- Reformatting or summarizing content the user already gave you",
			"",
			"After getting search results, use webfetch on a specific URL to read the actual content if you need more than the snippet.",
		].join("\n"),
		parameters: websearchSchema,
		async execute(_toolCallId, params, signal) {
			const p = params as WebsearchToolInput;
			const query = str(p.query);
			if (!query) {
				throw new Error("Missing required argument: query");
			}

			const limit = Math.min(MAX_RESULT_LIMIT, Math.max(1, p.limit ?? DEFAULT_RESULT_LIMIT));
			const categories = parseCsv(p.categories, ALLOWED_CATEGORIES) ?? "general";
			const language = p.language === undefined ? "en" : String(p.language).toLowerCase();
			if (!ALLOWED_LANGUAGES.has(language)) {
				throw new Error(`Unsupported language "${language}". Allowed: ${Array.from(ALLOWED_LANGUAGES).join(", ")}`);
			}
			const safesearch = p.safesearch === undefined ? "0" : String(p.safesearch);
			if (!ALLOWED_SAFESEARCH.has(safesearch)) {
				throw new Error(`safesearch must be "0", "1", or "2", got "${p.safesearch}"`);
			}
			const timeRange = p.timeRange === undefined ? "" : String(p.timeRange);
			if (!ALLOWED_TIME_RANGE.has(timeRange)) {
				throw new Error(`timeRange must be one of: day, week, month, year`);
			}
			const timeoutMs = Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, p.timeoutMs ?? DEFAULT_TIMEOUT_MS));

			const fullUrl = buildSearxngUrl(searchUrl, query, {
				limit,
				categories,
				language,
				safesearch,
				timeRange,
			});
			const startMs = Date.now();

			// Combine caller signal with internal timeout
			const timeoutController = new AbortController();
			const timeoutId = setTimeout(() => timeoutController.abort(new Error("Request timed out")), timeoutMs);
			const onCallerAbort = () => timeoutController.abort(signal?.reason);
			if (signal) {
				if (signal.aborted) {
					clearTimeout(timeoutId);
					throw new Error("Request aborted by caller");
				}
				signal.addEventListener("abort", onCallerAbort, { once: true });
			}

			let response: Awaited<ReturnType<WebsearchOperations["fetch"]>> | undefined;
			let timedOut = false;
			let callerAborted = false;
			try {
				response = await ops.fetch(fullUrl, { signal: timeoutController.signal });
			} catch (err) {
				clearTimeout(timeoutId);
				if (signal) signal.removeEventListener("abort", onCallerAbort);
				const msg = err instanceof Error ? err.message : String(err);
				const lower = msg.toLowerCase();
				if (signal?.aborted) {
					callerAborted = true;
				} else if (lower.includes("abort") || lower.includes("timeout")) {
					timedOut = true;
				}
				const text = callerAborted
					? `Search request to ${searchUrl} was aborted by caller.`
					: timedOut
						? `Search request to ${searchUrl} timed out after ${timeoutMs}ms.`
						: `Failed to search ${searchUrl}: ${msg}`;
				return {
					content: [{ type: "text" as const, text }],
					details: { query, searchUrl: fullUrl, resultCount: 0, elapsedMs: Date.now() - startMs, error: msg },
				};
			}
			clearTimeout(timeoutId);
			if (signal) signal.removeEventListener("abort", onCallerAbort);

			if (!response.ok) {
				const text = `Search engine returned HTTP ${response.status} ${response.statusText || ""}`.trim();
				return {
					content: [{ type: "text" as const, text }],
					details: {
						query,
						searchUrl: fullUrl,
						resultCount: 0,
						elapsedMs: Date.now() - startMs,
						error: text,
					},
				};
			}

			let payload: unknown;
			try {
				payload = await response.json();
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return {
					content: [{ type: "text" as const, text: `Search engine returned invalid JSON: ${msg}` }],
					details: {
						query,
						searchUrl: fullUrl,
						resultCount: 0,
						elapsedMs: Date.now() - startMs,
						error: msg,
					},
				};
			}

			const payloadObj = (payload ?? {}) as { results?: unknown };
			const rawResults = Array.isArray(payloadObj.results) ? payloadObj.results : [];
			const results: WebsearchResult[] = [];
			for (const r of rawResults) {
				if (!r || typeof r !== "object") continue;
				const item = r as Record<string, unknown>;
				const url = typeof item.url === "string" ? item.url : "";
				if (!url) continue;
				results.push({
					title: typeof item.title === "string" ? item.title : "",
					url,
					content: typeof item.content === "string" ? item.content : undefined,
					engine: typeof item.engine === "string" ? item.engine : undefined,
					category: typeof item.category === "string" ? item.category : undefined,
					publishedDate:
						typeof item.publishedDate === "string" || item.publishedDate === null
							? (item.publishedDate as string | null)
							: undefined,
				});
				if (results.length >= limit) break;
			}

			const elapsedMs = Date.now() - startMs;
			const markdown = formatResultsMarkdown(query, results, searchUrl, elapsedMs);
			return {
				content: [{ type: "text" as const, text: markdown }],
				details: { query, searchUrl: fullUrl, resultCount: results.length, elapsedMs },
			};
		},
		renderCall(args, theme: Theme, context: ToolRenderContext) {
			const query = str(args.query) ?? "";
			const cats = args.categories ? `, ${args.categories}` : "";
			const lang = args.language ? `, ${args.language}` : "";
			const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
			text.setText(
				`${theme.fg("toolTitle", theme.bold("websearch"))} ${theme.fg("muted", `"${query}"`)}${theme.fg(
					"dim",
					cats + lang,
				)}`,
			);
			return text;
		},
		renderResult(result, _options, theme: Theme, _context: ToolRenderContext) {
			const text = getTextOutput(result, true);
			if (!text) return new Text("", 0, 0);
			const lines = text.split("\n");
			const header = lines[0] || "";
			const body = lines.slice(1).join("\n");
			const container = new Text(`${theme.fg("muted", header)}${body ? `\n${body}` : ""}`, 1, 0);
			return container;
		},
	};
}

export function createWebsearchTool(
	cwd: string,
	options?: WebsearchToolOptions,
): AgentTool<Static<typeof websearchSchema>> {
	return wrapToolDefinition(createWebsearchToolDefinition(cwd, options));
}
