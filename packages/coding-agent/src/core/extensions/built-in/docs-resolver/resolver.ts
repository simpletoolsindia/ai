/**
 * Library documentation resolver.
 *
 * Implements a minimal context7-style approach: given a library
 * identifier, fetch the README + a few key files from the npm
 * registry (for npm packages) or GitHub (for "owner/repo" form).
 * Returns a compact markdown summary, cached on disk.
 *
 * No external service is contacted — the resolver is self-hosted:
 *   - npm: https://registry.npmjs.org/<pkg>/<version> for the README
 *   - GitHub: https://raw.githubusercontent.com/<owner>/<repo>/<ref>/<path>
 *
 * This keeps the system prompt small: we no longer stuff the entire
 * ai docs tree into the prompt. The LLM calls this tool on demand
 * for the library it actually needs.
 */

import { cacheGet, cacheSet } from "./cache.ts";

const FETCH_TIMEOUT_MS = 8_000;
const MAX_OUTPUT_BYTES = 50 * 1024; // 50 KB inline cap

export type LibraryKind = "npm" | "github" | "unknown";

export interface ResolveRequest {
	libraryId: string;
	topic?: string;
}

export interface ResolveResult {
	ok: boolean;
	libraryId: string;
	kind: LibraryKind;
	topic?: string;
	sourceUrl?: string;
	cached: boolean;
	/** Truncated markdown content. Empty on failure. */
	content: string;
	/** Short human summary. */
	summary: string;
	/** If non-ok, the reason. */
	error?: string;
}

/** Detect whether the id is an npm package name, "owner/repo", or something else. */
function classifyId(id: string): LibraryKind {
	const trimmed = id.trim();
	if (!trimmed) return "unknown";
	// Scoped npm: "@scope/name"
	if (trimmed.startsWith("@") && trimmed.includes("/")) return "npm";
	// Plain npm: must start with a lowercase letter or digit; may contain
	// letters, digits, dot, dash, underscore. We are conservative and
	// accept anything that doesn't look like owner/repo.
	if (/^github:/i.test(trimmed)) return "github";
	if (/^[a-z0-9][a-z0-9._-]*$/.test(trimmed)) return "npm";
	// owner/repo with optional #ref
	if (/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+(?:#[A-Za-z0-9._/-]+)?$/.test(trimmed)) return "github";
	return "unknown";
}

interface NpmPackageMeta {
	name?: string;
	"dist-tags"?: { latest?: string };
	versions?: Record<string, { description?: string; readme?: string; homepage?: string }>;
	readme?: string;
}

async function fetchNpmReadme(libraryId: string): Promise<{ content: string; sourceUrl: string }> {
	// Encoded scoped name: "@scope/name" -> "@scope%2Fname"
	const encoded = libraryId.startsWith("@")
		? `@${encodeURIComponent(libraryId.slice(1))}`
		: encodeURIComponent(libraryId);
	const url = `https://registry.npmjs.org/${encoded}`;
	const res = await fetch(url, {
		headers: { Accept: "application/json" },
		signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
	});
	if (!res.ok) {
		throw new Error(`npm registry returned ${res.status} for ${libraryId}`);
	}
	const meta = (await res.json()) as NpmPackageMeta;
	const latest = meta["dist-tags"]?.latest;
	const readme = (latest && meta.versions?.[latest]?.readme) || meta.readme || "";
	if (!readme) {
		throw new Error(`No README found for ${libraryId} on npm registry`);
	}
	return { content: readme, sourceUrl: url };
}

async function fetchGithubReadme(libraryId: string): Promise<{ content: string; sourceUrl: string }> {
	// Accept "owner/repo" or "owner/repo#ref"
	const [repo, ref] = libraryId.split("#");
	const branch = ref || "HEAD";
	// Try common README filenames in order
	const candidates = ["README.md", "readme.md", "README.rst", "README", "Readme.md"];
	let lastErr: unknown;
	for (const name of candidates) {
		const url = `https://raw.githubusercontent.com/${repo}/${branch}/${name}`;
		try {
			const res = await fetch(url, {
				redirect: "follow",
				signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
			});
			if (res.ok) {
				return { content: await res.text(), sourceUrl: url };
			}
			lastErr = new Error(`GitHub returned ${res.status} for ${url}`);
		} catch (err) {
			lastErr = err;
		}
	}
	throw new Error(`No README found at ${repo} (${branch}). Last error: ${String(lastErr)}`);
}

/** Truncate long READMEs to a sensible inline size and surface the lead section. */
function trimContent(content: string, _topic: string | undefined): string {
	if (content.length <= MAX_OUTPUT_BYTES) return content;
	const head = content.slice(0, MAX_OUTPUT_BYTES);
	// Try to end at a paragraph or section boundary for cleaner output
	const cut = head.lastIndexOf("\n\n");
	return cut > MAX_OUTPUT_BYTES / 2 ? head.slice(0, cut) : head;
}

function buildSummary(content: string, kind: LibraryKind, libraryId: string, topic: string | undefined): string {
	const bytes = content.length;
	const firstLine =
		content
			.split("\n")
			.find((l) => l.trim() && !l.startsWith("#"))
			?.trim() ?? "";
	const headline = firstLine.length > 120 ? `${firstLine.slice(0, 117)}...` : firstLine;
	const parts = [
		`${kind === "npm" ? "npm package" : "GitHub repo"}: ${libraryId}`,
		topic ? `topic: ${topic}` : null,
		`${(bytes / 1024).toFixed(1)} KB`,
		headline ? `> ${headline}` : null,
	];
	return parts.filter((p): p is string => !!p).join(" | ");
}

export async function resolveDocs(req: ResolveRequest): Promise<ResolveResult> {
	const libraryId = req.libraryId.trim();
	const topic = req.topic?.trim() || undefined;
	const kind = classifyId(libraryId);

	if (kind === "unknown") {
		return {
			ok: false,
			libraryId,
			kind,
			topic,
			cached: false,
			content: "",
			summary: `Unrecognized library id: "${libraryId}". Use an npm package name (e.g. "react", "@types/node") or "owner/repo" for GitHub.`,
			error: "unrecognized_id",
		};
	}

	// Cache lookup
	const cached = cacheGet(libraryId, topic);
	if (cached) {
		return {
			ok: true,
			libraryId,
			kind,
			topic,
			sourceUrl: cached.meta.sourceUrl,
			cached: true,
			content: trimContent(cached.content, topic),
			summary: buildSummary(cached.content, kind, libraryId, topic),
		};
	}

	// Live fetch
	try {
		const fetched = kind === "npm" ? await fetchNpmReadme(libraryId) : await fetchGithubReadme(libraryId);
		cacheSet(libraryId, topic, fetched.content, fetched.sourceUrl);
		return {
			ok: true,
			libraryId,
			kind,
			topic,
			sourceUrl: fetched.sourceUrl,
			cached: false,
			content: trimContent(fetched.content, topic),
			summary: buildSummary(fetched.content, kind, libraryId, topic),
		};
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return {
			ok: false,
			libraryId,
			kind,
			topic,
			cached: false,
			content: "",
			summary: `Failed to resolve ${libraryId}: ${message}`,
			error: message,
		};
	}
}
