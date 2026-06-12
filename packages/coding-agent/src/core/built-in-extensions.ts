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
 */

import contextModeFactory from "./extensions/built-in/context-mode/index.ts";
import docsResolverFactory from "./extensions/built-in/docs-resolver/index.ts";
// Each built-in is a factory `(pi) => void` that follows the same shape
// as a user-extension's default export.
import hermesMemoryFactory from "./extensions/built-in/hermes-memory/index.ts";
import localOtelFactory from "./extensions/built-in/local-otel/index.ts";
import patternLearnerFactory from "./extensions/built-in/pattern-learner/index.ts";
import type { ExtensionFactory } from "./extensions/types.ts";

/**
 * Built-in extensions that are always loaded. Order matters for tool
 * registration: later factories can override earlier ones, but in
 * practice each built-in registers a distinct tool namespace.
 *
 * context-mode is OPT-IN (controlled by `contextMode.enabled` in
 * settings.json). When disabled, its factory returns early after a
 * single session_start log; no MCP subprocess is spawned and no ctx_*
 * tools are registered. This keeps the default ai experience
 * unchanged and avoids the cost of a subprocess + SQLite for users
 * who don't need it.
 */
export const BUILT_IN_EXTENSION_FACTORIES: ExtensionFactory[] = [
	hermesMemoryFactory,
	contextModeFactory,
	docsResolverFactory,
	patternLearnerFactory,
	localOtelFactory,
];

/**
 * Built-in extension identifiers (one per factory). Used to allow
 * per-extension disable via settings.
 */
export const BUILT_IN_EXTENSION_IDS: readonly string[] = [
	"hermes-memory",
	"context-mode",
	"docs-resolver",
	"pattern-learner",
	"local-otel",
] as const;
