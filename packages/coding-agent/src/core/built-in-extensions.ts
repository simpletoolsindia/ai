/**
 * Built-in extensions that ship with `ai` and are always available.
 *
 * Unlike user-installed extensions (which live under `~/.ai/agent/extensions/`
 * or `.ai/extensions/`), these are part of the binary itself. They are loaded
 * by default unless the user passes `--no-extensions` (in which case ALL
 * extensions, including these, are disabled).
 *
 * To disable a specific built-in, set the corresponding flag in
 * `~/.ai/agent/settings.json` under `disabledBuiltInExtensions`.
 *
 * Lazy loading: each factory is registered as a dynamic-import thunk.
 * The actual `import()` of the built-in source happens at extension-load
 * time, not at module-load time. This means:
 *   - The ai startup cost is roughly constant regardless of how many
 *     built-ins exist.
 *   - An opt-in built-in that the user has not enabled in settings is
 *     loaded but its factory short-circuits early without doing any work
 *     (see e.g. context-mode, rpiv-args, rpiv-btw, context7 — all four
 *     return after a single session_start log when disabled).
 *   - If a future built-in's module fails to parse, only the lazy thunk
 *     surfaces the error; the rest of the agent starts cleanly.
 *
 * Loading is performed by `loadBuiltInExtension(id)` below.
 */

import type { ExtensionFactory } from "./extensions/types.ts";

/** Map of built-in id → dynamic-import thunk. */
type LazyFactory = () => Promise<ExtensionFactory>;
const LAZY_FACTORIES: Record<string, LazyFactory> = {
	"hermes-memory": () => import("./extensions/built-in/hermes-memory/index.ts").then((m) => m.default),
	"context-mode": () => import("./extensions/built-in/context-mode/index.ts").then((m) => m.default),
	"docs-resolver": () => import("./extensions/built-in/docs-resolver/index.ts").then((m) => m.default),
	"pattern-learner": () => import("./extensions/built-in/pattern-learner/index.ts").then((m) => m.default),
	"local-otel": () => import("./extensions/built-in/local-otel/index.ts").then((m) => m.default),
	"rpiv-args": () => import("./extensions/built-in/rpiv-args/index.ts").then((m) => m.default),
	"rpiv-btw": () => import("./extensions/built-in/rpiv-btw/index.ts").then((m) => m.default),
	context7: () => import("./extensions/built-in/context7/index.ts").then((m) => m.default),
};

/**
 * Built-in extension identifiers, in load order. Order matters for tool
 * registration: later factories can override earlier ones, but in
 * practice each built-in registers a distinct tool namespace.
 *
 * context-mode is OPT-IN (controlled by `contextMode.enabled` in
 * settings.json). When disabled, its factory returns early after a
 * single session_start log; no MCP subprocess is spawned and no ctx_*
 * tools are registered. This keeps the default ai experience
 * unchanged and avoids the cost of a subprocess + SQLite for users
 * who don't need it.
 *
 * rpiv-args is OPT-IN (controlled by `rpivArgs.enabled` in
 * settings.json). When disabled, its factory returns early after a
 * single session_start log; no input-hook interception and no
 * system-prompt prefix is added.
 *
 * rpiv-btw is OPT-IN (controlled by `rpivBtw.enabled` in
 * settings.json). When disabled, no `/btw` command is registered and
 * the message_end snapshot hook is not fired.
 *
 * context7 is OPT-IN (controlled by `context7.enabled` in
 * settings.json). When disabled, no tools are registered. When
 * enabled, the agent will spawn the `@upstash/context7-mcp` server
 * (via `npx`) and call out to https://context7.com.
 */
export const BUILT_IN_EXTENSION_IDS: readonly string[] = [
	"hermes-memory",
	"context-mode",
	"docs-resolver",
	"pattern-learner",
	"local-otel",
	"rpiv-args",
	"rpiv-btw",
	"context7",
] as const;

/**
 * Load a built-in extension by id. Returns the resolved factory or
 * `undefined` if the id is unknown. The first call for a given id
 * triggers a dynamic import of the source module; subsequent calls
 * hit the module cache.
 */
export async function loadBuiltInExtension(id: string): Promise<ExtensionFactory | undefined> {
	const thunk = LAZY_FACTORIES[id];
	if (!thunk) return undefined;
	return thunk();
}

/**
 * Load all built-in extensions in the canonical order, in parallel.
 * Each dynamic import is independent; the agent-session code awaits
 * `Promise.all(LAZY_FACTORIES.map(load))` to get the resolved factories
 * before wiring them up.
 */
export async function loadAllBuiltInExtensions(): Promise<ExtensionFactory[]> {
	return Promise.all(
		BUILT_IN_EXTENSION_IDS.map(async (id) => {
			const factory = await loadBuiltInExtension(id);
			if (!factory) {
				throw new Error(`Built-in extension "${id}" has no factory registered`);
			}
			return factory;
		}),
	);
}
