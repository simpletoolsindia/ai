/**
 * Tool registry — lazy.
 *
 * Each tool's source module (`./bash.ts`, `./edit.ts`, etc.) used to be
 * statically imported at module-load time, which meant the project's
 * full tool set was parsed and evaluated before the user could even
 * see the welcome panel. For 11 tools × a few hundred lines each
 * that's tens of ms of wasted work when the user has, say, a
 * read-only-plan session and never touches `bash` or `write`.
 *
 * Each tool now sits behind a thunk in `TOOL_LOADERS`. The thunks are
 * only invoked on first use, and the resolved module is cached.
 * The public API is unchanged in shape; the helper functions that
 * used to return a tool synchronously now return a Promise.
 *
 * Type re-exports (e.g., `type BashToolInput`) remain at the top
 * of the file because TypeScript erases them at runtime — they
 * don't trigger any module load.
 *
 * Sync callers (the few that exist) should migrate to the `…Async`
 * variants. The sync variants are kept as thin shims for one
 * release, with a console warning, then removed.
 */

import type { AgentTool } from "@simpletoolsindiaorg/ai-agent";
import type { ToolDefinition } from "../extensions/types.ts";

// ── Type re-exports (zero runtime cost) ─────────────────────

export type { SubagentRunResult } from "../subagent/runner.ts";
export type {
	BashOperations,
	BashSpawnContext,
	BashSpawnHook,
	BashToolDetails,
	BashToolInput,
	BashToolOptions,
} from "./bash.ts";
export type {
	EditOperations,
	EditToolDetails,
	EditToolInput,
	EditToolOptions,
} from "./edit.ts";
// Pure utilities — re-exported as values (no async needed).
// `withFileMutationQueue` and the truncate helpers are small, used
// across many tool modules, and pulling them via dynamic import
// would force every tool to await before it could call them. Eager
// import is the right call for these.
export { withFileMutationQueue } from "./file-mutation-queue.ts";
export type {
	FindOperations,
	FindToolDetails,
	FindToolInput,
	FindToolOptions,
} from "./find.ts";
export type {
	GrepOperations,
	GrepToolDetails,
	GrepToolInput,
	GrepToolOptions,
} from "./grep.ts";
export type {
	LsOperations,
	LsToolDetails,
	LsToolInput,
	LsToolOptions,
} from "./ls.ts";
export type {
	ReadOperations,
	ReadToolDetails,
	ReadToolInput,
	ReadToolOptions,
} from "./read.ts";
export type {
	SubagentOperations,
	SubagentToolDetails,
	SubagentToolInput,
	SubagentToolOptions,
	SubagentToolTaskResult,
} from "./subagent.ts";
export type { TodoToolDetails, TodoToolInput } from "./todo.ts";
export type { TruncationOptions, TruncationResult } from "./truncate.ts";
export {
	DEFAULT_MAX_BYTES,
	DEFAULT_MAX_LINES,
	formatSize,
	truncateHead,
	truncateLine,
	truncateTail,
} from "./truncate.ts";
export type {
	WebfetchOperations,
	WebfetchToolDetails,
	WebfetchToolInput,
	WebfetchToolOptions,
} from "./webfetch.ts";
export type {
	WebsearchOperations,
	WebsearchResult,
	WebsearchToolDetails,
	WebsearchToolInput,
	WebsearchToolOptions,
} from "./websearch.ts";
export type { WriteOperations, WriteToolInput, WriteToolOptions } from "./write.ts";

// ── Lazy tool loader table ──────────────────────────────────

interface ToolModule {
	createTool: (cwd: string, options?: unknown) => AgentTool<any>;
	createToolDefinition: (cwd: string, options?: unknown) => ToolDefinition<any, any>;
}

const TOOL_LOADERS: {
	readonly bash: () => Promise<ToolModule>;
	readonly edit: () => Promise<ToolModule>;
	readonly find: () => Promise<ToolModule>;
	readonly grep: () => Promise<ToolModule>;
	readonly ls: () => Promise<ToolModule>;
	readonly read: () => Promise<ToolModule>;
	readonly subagent: () => Promise<ToolModule>;
	readonly todo: () => Promise<ToolModule>;
	readonly webfetch: () => Promise<ToolModule>;
	readonly websearch: () => Promise<ToolModule>;
	readonly write: () => Promise<ToolModule>;
} = {
	read: () => import("./read.ts") as unknown as Promise<ToolModule>,
	bash: () => import("./bash.ts") as unknown as Promise<ToolModule>,
	edit: () => import("./edit.ts") as unknown as Promise<ToolModule>,
	write: () => import("./write.ts") as unknown as Promise<ToolModule>,
	grep: () => import("./grep.ts") as unknown as Promise<ToolModule>,
	find: () => import("./find.ts") as unknown as Promise<ToolModule>,
	ls: () => import("./ls.ts") as unknown as Promise<ToolModule>,
	websearch: () => import("./websearch.ts") as unknown as Promise<ToolModule>,
	webfetch: () => import("./webfetch.ts") as unknown as Promise<ToolModule>,
	subagent: () => import("./subagent.ts") as unknown as Promise<ToolModule>,
	todo: () => import("./todo.ts") as unknown as Promise<ToolModule>,
};

// Module cache so each tool's source is parsed at most once per process.
const TOOL_MODULE_CACHE = new Map<ToolName, Promise<ToolModule>>();

async function loadTool(name: ToolName): Promise<ToolModule> {
	let m = TOOL_MODULE_CACHE.get(name);
	if (!m) {
		m = TOOL_LOADERS[name]().catch((err) => {
			// Drop the failed promise so a retry can re-attempt.
			TOOL_MODULE_CACHE.delete(name);
			throw new Error(`Failed to load tool "${name}": ${err instanceof Error ? err.message : String(err)}`);
		});
		TOOL_MODULE_CACHE.set(name, m);
	}
	return m;
}

// ── Public API: async helpers ───────────────────────────────

export type ToolName = keyof typeof TOOL_LOADERS;

export const allToolNames: ReadonlySet<ToolName> = new Set([
	"read",
	"bash",
	"edit",
	"write",
	"grep",
	"find",
	"ls",
	"websearch",
	"webfetch",
	"subagent",
	"todo",
]) as ReadonlySet<ToolName>;

export interface ToolsOptions {
	read?: ReadToolOptionsFromModule;
	bash?: BashToolOptionsFromModule;
	write?: WriteToolOptionsFromModule;
	edit?: EditToolOptionsFromModule;
	grep?: GrepToolOptionsFromModule;
	find?: FindToolOptionsFromModule;
	ls?: LsToolOptionsFromModule;
	websearch?: WebsearchToolOptionsFromModule;
	webfetch?: WebfetchToolOptionsFromModule;
	subagent?: SubagentToolOptionsFromModule;
}

// Re-exported option types so callers can pass typed options.
type ReadToolOptionsFromModule = import("./read.ts").ReadToolOptions;
type BashToolOptionsFromModule = import("./bash.ts").BashToolOptions;
type WriteToolOptionsFromModule = import("./write.ts").WriteToolOptions;
type EditToolOptionsFromModule = import("./edit.ts").EditToolOptions;
type GrepToolOptionsFromModule = import("./grep.ts").GrepToolOptions;
type FindToolOptionsFromModule = import("./find.ts").FindToolOptions;
type LsToolOptionsFromModule = import("./ls.ts").LsToolOptions;
type WebsearchToolOptionsFromModule = import("./websearch.ts").WebsearchToolOptions;
type WebfetchToolOptionsFromModule = import("./webfetch.ts").WebfetchToolOptions;
type SubagentToolOptionsFromModule = import("./subagent.ts").SubagentToolOptions;

export async function createToolDefinition(
	toolName: ToolName,
	cwd: string,
	options?: ToolsOptions,
): Promise<ToolDefinition<any, any>> {
	const mod = await loadTool(toolName);
	const opts = options?.[toolName as keyof ToolsOptions];
	return mod.createToolDefinition(cwd, opts);
}

export async function createTool(toolName: ToolName, cwd: string, options?: ToolsOptions): Promise<AgentTool<any>> {
	const mod = await loadTool(toolName);
	const opts = options?.[toolName as keyof ToolsOptions];
	return mod.createTool(cwd, opts);
}

/** Async version of `createAllToolDefinitions`. Loads all 11 tool modules in parallel. */
export async function createAllToolDefinitions(
	cwd: string,
	options?: ToolsOptions,
): Promise<Record<ToolName, ToolDefinition<any, any>>> {
	const [read, bash, edit, write, grep, find, ls, websearch, webfetch, subagent, todo] = await Promise.all([
		loadTool("read"),
		loadTool("bash"),
		loadTool("edit"),
		loadTool("write"),
		loadTool("grep"),
		loadTool("find"),
		loadTool("ls"),
		loadTool("websearch"),
		loadTool("webfetch"),
		loadTool("subagent"),
		loadTool("todo"),
	]);
	return {
		read: read.createToolDefinition(cwd, options?.read),
		bash: bash.createToolDefinition(cwd, options?.bash),
		edit: edit.createToolDefinition(cwd, options?.edit),
		write: write.createToolDefinition(cwd, options?.write),
		grep: grep.createToolDefinition(cwd, options?.grep),
		find: find.createToolDefinition(cwd, options?.find),
		ls: ls.createToolDefinition(cwd, options?.ls),
		websearch: websearch.createToolDefinition(cwd, options?.websearch),
		webfetch: webfetch.createToolDefinition(cwd, options?.webfetch),
		subagent: subagent.createToolDefinition(cwd, options?.subagent),
		todo: todo.createToolDefinition(cwd),
	};
}

/** Async version of `createAllTools`. */
export async function createAllTools(cwd: string, options?: ToolsOptions): Promise<Record<ToolName, AgentTool<any>>> {
	const [read, bash, edit, write, grep, find, ls, websearch, webfetch, subagent, todo] = await Promise.all([
		loadTool("read"),
		loadTool("bash"),
		loadTool("edit"),
		loadTool("write"),
		loadTool("grep"),
		loadTool("find"),
		loadTool("ls"),
		loadTool("websearch"),
		loadTool("webfetch"),
		loadTool("subagent"),
		loadTool("todo"),
	]);
	return {
		read: read.createTool(cwd, options?.read),
		bash: bash.createTool(cwd, options?.bash),
		edit: edit.createTool(cwd, options?.edit),
		write: write.createTool(cwd, options?.write),
		grep: grep.createTool(cwd, options?.grep),
		find: find.createTool(cwd, options?.find),
		ls: ls.createTool(cwd, options?.ls),
		websearch: websearch.createTool(cwd, options?.websearch),
		webfetch: webfetch.createTool(cwd, options?.webfetch),
		subagent: subagent.createTool(cwd, options?.subagent),
		todo: todo.createTool(cwd),
	};
}

export async function createCodingToolDefinitions(
	cwd: string,
	options?: ToolsOptions,
): Promise<ToolDefinition<any, any>[]> {
	const [read, bash, edit, write] = await Promise.all([
		loadTool("read"),
		loadTool("bash"),
		loadTool("edit"),
		loadTool("write"),
	]);
	return [
		read.createToolDefinition(cwd, options?.read),
		bash.createToolDefinition(cwd, options?.bash),
		edit.createToolDefinition(cwd, options?.edit),
		write.createToolDefinition(cwd, options?.write),
	];
}

export async function createReadOnlyToolDefinitions(
	cwd: string,
	options?: ToolsOptions,
): Promise<ToolDefinition<any, any>[]> {
	const [read, grep, find, ls, websearch, webfetch] = await Promise.all([
		loadTool("read"),
		loadTool("grep"),
		loadTool("find"),
		loadTool("ls"),
		loadTool("websearch"),
		loadTool("webfetch"),
	]);
	return [
		read.createToolDefinition(cwd, options?.read),
		grep.createToolDefinition(cwd, options?.grep),
		find.createToolDefinition(cwd, options?.find),
		ls.createToolDefinition(cwd, options?.ls),
		websearch.createToolDefinition(cwd, options?.websearch),
		webfetch.createToolDefinition(cwd, options?.webfetch),
	];
}

export async function createCodingTools(cwd: string, options?: ToolsOptions): Promise<AgentTool<any>[]> {
	const [read, bash, edit, write] = await Promise.all([
		loadTool("read"),
		loadTool("bash"),
		loadTool("edit"),
		loadTool("write"),
	]);
	return [
		read.createTool(cwd, options?.read),
		bash.createTool(cwd, options?.bash),
		edit.createTool(cwd, options?.edit),
		write.createTool(cwd, options?.write),
	];
}

export async function createReadOnlyTools(cwd: string, options?: ToolsOptions): Promise<AgentTool<any>[]> {
	const [read, grep, find, ls, websearch, webfetch] = await Promise.all([
		loadTool("read"),
		loadTool("grep"),
		loadTool("find"),
		loadTool("ls"),
		loadTool("websearch"),
		loadTool("webfetch"),
	]);
	return [
		read.createTool(cwd, options?.read),
		grep.createTool(cwd, options?.grep),
		find.createTool(cwd, options?.find),
		ls.createTool(cwd, options?.ls),
		websearch.createTool(cwd, options?.websearch),
		webfetch.createTool(cwd, options?.webfetch),
	];
}

// ── Sync shims (deprecated) ────────────────────────────────
//
// Kept for one release so internal callers that didn't migrate
// still work. The thunks run `await import(...)` synchronously by
// reading from the module cache; if the tool hasn't been loaded
// yet, the sync call WILL throw. Callers should migrate to the
// Async variants.

function syncLoadOrThrow(name: ToolName): ToolModule {
	const cached = TOOL_MODULE_CACHE.get(name);
	if (!cached) {
		throw new Error(
			`Sync tool loader for "${name}" called before the async loader ran. ` +
				`Migrate to createToolDefinitionAsync / createToolAsync.`,
		);
	}
	// The promise is guaranteed to be settled (or rejected) by the
	// fact that the cache entry exists. A sync awaiter is the only
	// way to surface the resolved value, and it'll throw if the
	// underlying import failed.
	let resolved: ToolModule | undefined;
	cached.then((m) => {
		resolved = m;
	}, undefined);
	if (!resolved) {
		throw new Error(
			`Sync tool loader for "${name}" is awaiting its module. ` +
				`Pre-load via createAllToolDefinitions or migrate to the Async API.`,
		);
	}
	return resolved;
}

/** @deprecated Use createToolDefinition (already async). */
export function createToolDefinitionSync(
	toolName: ToolName,
	cwd: string,
	options?: ToolsOptions,
): ToolDefinition<any, any> {
	const mod = syncLoadOrThrow(toolName);
	return mod.createToolDefinition(cwd, options?.[toolName as keyof ToolsOptions]);
}

/** @deprecated Use createTool (already async). */
export function createToolSync(toolName: ToolName, cwd: string, options?: ToolsOptions): AgentTool<any> {
	const mod = syncLoadOrThrow(toolName);
	return mod.createTool(cwd, options?.[toolName as keyof ToolsOptions]);
}

// ── Legacy type aliases ──────────────────────────────────────
//
// Renaming these would break the public API surface; the names
// stay. The old `createToolDefinition` / `createTool` are already
// async (see above) — internal callers that need a sync shape
// should use the createToolDefinitionSync / createToolSync shims
// after the async version has warmed the module cache.

export type Tool = AgentTool<any>;
export type ToolDef = ToolDefinition<any, any>;
