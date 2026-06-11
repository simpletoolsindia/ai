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

import type { ExtensionFactory } from "./extensions/types.ts";

// Each built-in is a factory `(pi) => void` that follows the same shape
// as a user-extension's default export.
import hermesMemoryFactory from "./extensions/built-in/hermes-memory/index.ts";

/**
 * Built-in extensions that are always loaded. Order matters for tool
 * registration: later factories can override earlier ones, but in
 * practice each built-in registers a distinct tool namespace.
 */
export const BUILT_IN_EXTENSION_FACTORIES: ExtensionFactory[] = [
	hermesMemoryFactory,
];

/**
 * Built-in extension identifiers (one per factory). Used to allow
 * per-extension disable via settings.
 */
export const BUILT_IN_EXTENSION_IDS: readonly string[] = [
	"hermes-memory",
] as const;
