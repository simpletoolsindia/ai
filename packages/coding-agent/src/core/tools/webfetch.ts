import type { AgentTool } from "@simpletoolsindiaorg/ai-agent";
import { Text } from "@simpletoolsindiaorg/ai-tui";
import { type Static, Type } from "typebox";
import type { Theme } from "../../modes/interactive/theme/theme.ts";
import type { ToolDefinition, ToolRenderContext } from "../extensions/types.ts";
import { getTextOutput, str } from "./render-utils.ts";
import { gcSpillover, spillToDisk } from "./spillover.ts";
import { wrapToolDefinition } from "./tool-definition-wrapper.ts";
import { formatSize, type TruncationResult, truncateHead } from "./truncate.ts";

const webfetchSchema = Type.Object({
	url: Type.String({
		description: "HTTP or HTTPS URL to fetch. Must be a valid URL with a host.",
	}),
	maxBytes: Type.Optional(
		Type.Number({
			description:
				"Maximum response size in bytes to return inline (default: 102400 = 100KB, max: 1048576 = 1MB). Larger responses are truncated in the inline output and the full content is written to a temp file the LLM can read on demand.",
			minimum: 1024,
			maximum: 1048576,
		}),
	),
	spilloverMaxBytes: Type.Optional(
		Type.Number({
			description:
				"If the response exceeds maxBytes, write up to this many bytes to the spillover temp file (default: 10485760 = 10MB, max: 104857600 = 100MB). Set to 0 to disable spillover entirely.",
			minimum: 0,
			maximum: 104857600,
		}),
	),
	timeoutMs: Type.Optional(
		Type.Number({
			description: "Request timeout in milliseconds (default: 30000, max: 120000)",
			minimum: 1000,
			maximum: 120000,
		}),
	),
});

export type WebfetchToolInput = Static<typeof webfetchSchema>;

export interface WebfetchToolDetails {
	url: string;
	status: number;
	contentType: string;
	finalUrl: string;
	bytes: number;
	truncation?: TruncationResult;
	timedOut?: boolean;
	spilloverPath?: string;
	spilloverBytes?: number;
}

/**
 * Pluggable operations for the webfetch tool.
 * Override these to inject a custom fetch implementation (mocking, rate limiting, etc.).
 */
export interface WebfetchOperations {
	fetch: (
		url: string,
		options: { signal: AbortSignal; redirect: "follow" },
	) => Promise<{
		ok: boolean;
		status: number;
		statusText: string;
		headers: Headers;
		body: ReadableStream<Uint8Array> | null;
	}>;
	htmlToText: (html: string) => string;
}

const DEFAULT_MAX_BYTES_VALUE = 100 * 1024; // 100KB
const DEFAULT_SPILLOVER_MAX_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_SPILLOVER_MAX_BYTES = 100 * 1024 * 1024; // 100MB
const DEFAULT_TIMEOUT_MS = 30_000;
const MIN_TIMEOUT_MS = 1000;
const MAX_TIMEOUT_MS = 120_000;

// Best-effort GC of old spillover files on tool module load.
gcSpillover();

const TEXT_CONTENT_TYPES = new Set([
	"text/html",
	"text/plain",
	"text/markdown",
	"text/xml",
	"application/xml",
	"application/xhtml+xml",
	"application/json",
	"application/javascript",
	"application/x-javascript",
	"text/javascript",
]);

function validateUrl(raw: string): URL {
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		throw new Error(`Invalid URL: ${raw}`);
	}
	if (url.protocol !== "http:" && url.protocol !== "https:") {
		throw new Error(`Only http: and https: URLs are allowed, got: ${url.protocol}`);
	}
	if (!url.hostname) {
		throw new Error(`URL has no hostname: ${raw}`);
	}
	return url;
}

/**
 * Minimal HTML → text converter.
 * - Strips script, style, noscript, iframe, svg, head, nav, header, footer, aside blocks entirely (including contents)
 * - Removes all remaining HTML tags
 * - Decodes the most common HTML entities
 * - Collapses whitespace
 *
 * Not a full HTML parser; intentionally dependency-free.
 */
export function htmlToText(html: string): string {
	let s = html;
	// Strip element blocks whose content is noise (script, style, navigation, etc.)
	s = s.replace(/<(script|style|noscript|iframe|svg|head|nav|header|footer|aside)\b[^>]*>[\s\S]*?<\/\1>/gi, "");
	// Insert newlines for block elements
	s = s.replace(/<(br|hr|li|tr|td|th|p|div|h[1-6])\b[^>]*>/gi, "\n");
	// Strip remaining tags
	s = s.replace(/<[^>]+>/g, "");
	// Decode common entities
	s = s
		.replace(/&nbsp;/g, " ")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&apos;/g, "'")
		.replace(/&#(\d+);/g, (_m, n) => {
			const code = Number.parseInt(n, 10);
			return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
		})
		.replace(/&#x([0-9a-fA-F]+);/g, (_m, n) => {
			const code = Number.parseInt(n, 16);
			return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
		});
	// Collapse whitespace
	s = s
		.split("\n")
		.map((line) => line.replace(/[ \t]+/g, " ").trim())
		.filter((line) => line.length > 0)
		.join("\n");
	return s;
}

const defaultOperations: WebfetchOperations = {
	fetch: async (url, options) => {
		const response = await fetch(url, { signal: options.signal, redirect: "follow" });
		return {
			ok: response.ok,
			status: response.status,
			statusText: response.statusText,
			headers: response.headers,
			body: response.body,
		};
	},
	htmlToText,
};

async function readResponseBody(
	body: ReadableStream<Uint8Array> | null,
	maxBytes: number,
): Promise<{ bytes: Uint8Array; truncated: boolean }> {
	if (!body) {
		return { bytes: new Uint8Array(0), truncated: false };
	}
	const reader = body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	let truncated = false;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		if (!value) continue;
		if (total + value.byteLength > maxBytes) {
			const remaining = maxBytes - total;
			if (remaining > 0) {
				chunks.push(value.slice(0, remaining));
			}
			total = maxBytes;
			truncated = true;
			try {
				await reader.cancel();
			} catch {
				// ignore
			}
			break;
		}
		chunks.push(value);
		total += value.byteLength;
	}
	const bytes = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return { bytes, truncated };
}

function decodeBody(bytes: Uint8Array, contentType: string): string {
	const charsetMatch = contentType.match(/charset=([\w-]+)/i);
	const charset = charsetMatch?.[1]?.toLowerCase() || "utf-8";
	try {
		return new TextDecoder(charset, { fatal: false }).decode(bytes);
	} catch {
		return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
	}
}

export interface WebfetchToolOptions {
	operations?: WebfetchOperations;
}

export function createWebfetchToolDefinition(
	_cwd: string,
	options?: WebfetchToolOptions,
): ToolDefinition<typeof webfetchSchema, WebfetchToolDetails | undefined> {
	const ops = options?.operations ?? defaultOperations;

	return {
		name: "webfetch",
		label: "Webfetch",
		description: [
			"Fetch the content of a public URL and return it as text.",
			"For HTML pages: script/style/nav is stripped, tags removed, entities decoded, whitespace collapsed (no markdown conversion).",
			"For plain text, JSON, XML, JavaScript, markdown: returned as-is.",
			"Binary content (images, PDFs, etc.) returns an error.",
			"Response is capped at maxBytes (default 100KB, max 1MB). Larger responses are truncated and the truncation is noted.",
			"Follows HTTP redirects automatically.",
			"",
			"**Use this tool to:**",
			"- Read a specific webpage the user mentions or that websearch returned",
			"- Fetch documentation from a specific URL (e.g. https://api.example.com/docs)",
			"- Get current data from a public API endpoint",
			"- Verify content at a URL",
			"",
			"Do NOT use this for:",
			"- Files in the current project (use the read tool instead)",
			"- Searching (use websearch instead)",
			"- URLs the user expects you to know the contents of from training (call out: 'based on my training data, this URL contains...')",
			"",
			"After fetching, summarize or extract the relevant information for the user. Always cite the source URL.",
			"",
			"NOTE: localhost and private IPs are NOT blocked by default. Only fetch URLs you trust.",
		].join("\n"),
		parameters: webfetchSchema,
		async execute(_toolCallId, params, signal) {
			const p = params as WebfetchToolInput;
			const urlStr = str(p.url);
			if (!urlStr) {
				throw new Error("Missing required argument: url");
			}
			const maxBytes = p.maxBytes ?? DEFAULT_MAX_BYTES_VALUE;
			const timeoutMs = Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, p.timeoutMs ?? DEFAULT_TIMEOUT_MS));

			const parsedUrl = validateUrl(urlStr);

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

			let response: Awaited<ReturnType<WebfetchOperations["fetch"]>> | undefined;
			let timedOut = false;
			let callerAborted = false;
			try {
				response = await ops.fetch(parsedUrl.href, {
					signal: timeoutController.signal,
					redirect: "follow",
				});
			} catch (err) {
				clearTimeout(timeoutId);
				if (signal) signal.removeEventListener("abort", onCallerAbort);
				const msg = err instanceof Error ? err.message : String(err);
				const lower = msg.toLowerCase();
				// Distinguish caller abort from internal timeout
				if (signal?.aborted) {
					callerAborted = true;
				} else if (lower.includes("abort") || lower.includes("timeout")) {
					timedOut = true;
				}
				const text = callerAborted
					? `Request to ${parsedUrl.href} was aborted by caller.`
					: timedOut
						? `Request to ${parsedUrl.href} timed out after ${timeoutMs}ms.`
						: `Failed to fetch ${parsedUrl.href}: ${msg}`;
				return {
					content: [
						{
							type: "text" as const,
							text,
						},
					],
					details: {
						url: parsedUrl.href,
						status: 0,
						contentType: "",
						finalUrl: parsedUrl.href,
						bytes: 0,
						timedOut: timedOut || callerAborted,
					},
				};
			}
			clearTimeout(timeoutId);
			if (signal) signal.removeEventListener("abort", onCallerAbort);

			const finalUrl = parsedUrl.href;
			const contentType = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
			const status = response.status;

			if (!response.ok) {
				return {
					content: [
						{
							type: "text" as const,
							text: `HTTP ${status} ${response.statusText || ""} for ${parsedUrl.href}`.trim(),
						},
					],
					details: { url: parsedUrl.href, status, contentType, finalUrl, bytes: 0 },
				};
			}

			if (contentType && !TEXT_CONTENT_TYPES.has(contentType) && !contentType.startsWith("text/")) {
				return {
					content: [
						{
							type: "text" as const,
							text: `Unsupported content type "${contentType}" at ${finalUrl}. webfetch only supports text-like responses (HTML, plain text, JSON, XML, JavaScript, markdown).`,
						},
					],
					details: { url: parsedUrl.href, status, contentType, finalUrl, bytes: 0 },
				};
			}

			const { bytes, truncated } = await readResponseBody(response.body, maxBytes);
			const rawText = decodeBody(bytes, contentType || "text/plain");
			const isHtml = contentType === "text/html" || contentType === "application/xhtml+xml";
			const text = isHtml ? ops.htmlToText(rawText) : rawText;

			let truncation: TruncationResult | undefined;
			let displayText = text;
			if (truncated) {
				const result = truncateHead(text, { maxBytes });
				truncation = result;
				displayText = result.content;
			}

			// Spillover: if the response was truncated and spillover is enabled
			// (spilloverMaxBytes > 0), write the full decoded text to a temp
			// file and tell the LLM where to find it. The file lives in
			// ~/.ai/agent/cache/webfetch/ and is GC'd after 7 days.
			let spilloverPath: string | undefined;
			let spilloverBytes: number | undefined;
			const spilloverMaxBytes = Math.min(
				MAX_SPILLOVER_MAX_BYTES,
				Math.max(0, p.spilloverMaxBytes ?? DEFAULT_SPILLOVER_MAX_BYTES),
			);
			if (truncated && spilloverMaxBytes > 0) {
				try {
					// If the full text is larger than spilloverMaxBytes, truncate at
					// a char boundary (TextDecoder-safe) before writing.
					const content = text.length > spilloverMaxBytes ? text.slice(0, spilloverMaxBytes) : text;
					const ext =
						isHtml || contentType.includes("html") ? "html" : contentType.includes("json") ? "json" : "md";
					const result = spillToDisk(content, ext);
					spilloverPath = result.path;
					spilloverBytes = result.bytes;
				} catch (err) {
					// Spillover is best-effort; a failure here doesn't fail the
					// fetch. The LLM just loses access to the full content.
				}
			}

			const summary =
				`Fetched ${formatSize(bytes.byteLength)} of ${contentType || "text"} from ${finalUrl} (HTTP ${status})` +
				(truncation ? ` [truncated to first ${truncation.outputLines} of ${truncation.totalLines} lines]` : "") +
				(spilloverPath
					? ` [full content (${formatSize(spilloverBytes ?? 0)}) saved to ${spilloverPath} — use the read tool to view]`
					: "");

			return {
				content: [
					{ type: "text" as const, text: summary },
					{ type: "text" as const, text: displayText },
				],
				details: {
					url: parsedUrl.href,
					status,
					contentType,
					finalUrl,
					bytes: bytes.byteLength,
					truncation,
					spilloverPath,
					spilloverBytes,
				},
			};
		},
		renderCall(args, theme: Theme, context: ToolRenderContext) {
			const url = str(args.url) ?? "";
			const max = typeof args.maxBytes === "number" ? `, max=${formatSize(args.maxBytes)}` : "";
			const timeout = typeof args.timeoutMs === "number" ? `, ${args.timeoutMs}ms` : "";
			const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
			text.setText(
				`${theme.fg("toolTitle", theme.bold("webfetch"))} ${theme.fg("muted", url)}${theme.fg("dim", max + timeout)}`,
			);
			return text;
		},
		renderResult(result, _options, theme: Theme, context: ToolRenderContext) {
			const text = getTextOutput(result, true);
			if (!text) return new Text("", 0, 0);
			const firstLine = text.split("\n")[0];
			const rest = text.split("\n").slice(1).join("\n");
			const combined =
				rest && rest.length > 0 ? `${theme.fg("muted", firstLine)}\n${rest}` : theme.fg("muted", firstLine);
			const out = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
			out.setText(combined);
			return out;
		},
	};
}

export function createWebfetchTool(
	cwd: string,
	options?: WebfetchToolOptions,
): AgentTool<Static<typeof webfetchSchema>> {
	return wrapToolDefinition(createWebfetchToolDefinition(cwd, options));
}
