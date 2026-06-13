# Third-party code in `rpiv-btw`

This extension is a vendor of upstream code. The original source is
maintained by the upstream project; this fork only ships a snapshot.

## What is vendored

| File | Upstream path | Upstream version |
|------|---------------|------------------|
| `../btw.ts` | [`juicesharp/rpiv-mono` › `packages/rpiv-btw/btw.ts`](https://github.com/juicesharp/rpiv-mono/blob/main/packages/rpiv-btw/btw.ts) | 1.19.1 |
| `../btw-ui.ts` | [`juicesharp/rpiv-mono` › `packages/rpiv-btw/btw-ui.ts`](https://github.com/juicesharp/rpiv-mono/blob/main/packages/rpiv-btw/btw-ui.ts) | 1.19.1 |
| `../prompts/btw-system.txt` | [`juicesharp/rpiv-mono` › `packages/rpiv-btw/prompts/btw-system.txt`](https://github.com/juicesharp/rpiv-mono/blob/main/packages/rpiv-btw/prompts/btw-system.txt) | 1.19.1 |

## License

All three files are MIT-licensed. The full text is at `MIT-LICENSE` in
this folder. Copyright (c) 2026 juicesharp.

## Why vendored (not installed via `pi install`)

Vendoring keeps the feature on by default for users who don't know to
install it, and avoids a network dependency at install time. The
trade-off is that this fork does not pick up upstream fixes
automatically — we re-vendor on demand.

## Local modifications

1. The imports of `@earendil-works/pi-{ai,coding-agent,tui}` were
   rewritten to the canonical `@simpletoolsindiaorg/ai-{provider,coding-agent,tui}`
   scopes for this fork. Functionally identical — the loader's back-compat
   aliases map the upstream scope to the same modules.
2. Relative imports of `./btw-ui.js` / `./btw.js` were rewritten to
   `./btw-ui.ts` / `./btw.ts` to match this project's
   `allowImportingTsExtensions` import convention.
3. `index.ts` was rewritten to add a settings gate. Behaviour
   matches upstream: it calls `registerBtwCommand(pi)`,
   `registerMessageEndSnapshot(pi)`, and `registerInvalidationHooks(pi)`.
4. The top-of-file docblock on `btw.ts` was updated to point at the
   vendored-from URL and license; logic unchanged.

## Re-syncing from upstream

To pick up upstream changes, diff the three source files against the
latest `juicesharp/rpiv-mono` `packages/rpiv-btw/` and re-apply the
local-modifications list above. Watch for:
- new TUI dependencies added upstream (would require a `package.json` bump)
- changes to `ctx.ui.custom` options shape
- changes to `completeSimple` signature
- changes to the `ExtensionCommandContext` fields the handler reads
  (`hasUI`, `model`, `modelRegistry`, `sessionManager`, `ui`)
