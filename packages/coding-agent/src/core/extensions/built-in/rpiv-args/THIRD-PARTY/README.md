# Third-party code in `rpiv-args`

This extension is a vendor of upstream code. The original source is
maintained by the upstream project; this fork only ships a snapshot.

## What is vendored

| File | Upstream path | Upstream version |
|------|---------------|------------------|
| `../args.ts` | [`juicesharp/rpiv-mono` › `packages/rpiv-args/args.ts`](https://github.com/juicesharp/rpiv-mono/blob/main/packages/rpiv-args/args.ts) | 1.19.1 |
| `../index.ts` | [`juicesharp/rpiv-mono` › `packages/rpiv-args/index.ts`](https://github.com/juicesharp/rpiv-mono/blob/main/packages/rpiv-args/index.ts) | 1.19.1 |

## License

Both files are MIT-licensed. The full text is at `MIT-LICENSE` in this
folder. Copyright (c) 2026 juicesharp.

## Why vendored (not installed via `pi install`)

Vendoring keeps the feature on by default for users who don't know to
install it, and avoids a network dependency at install time. The
trade-off is that this fork does not pick up upstream fixes
automatically — we re-vendor on demand.

## Local modifications

1. The single import of `@earendil-works/pi-coding-agent` was rewritten
   to `@simpletoolsindiaorg/ai-coding-agent` (canonical scope for this
   fork). Functionally identical — the loader's back-compat alias maps
   the upstream scope to the same module.
2. `index.ts` was rewritten to add a settings-gate doc block. Behaviour
   matches upstream: it calls `registerArgsHandler(pi)`.
3. No changes to `args.ts` other than the import rewrite (next section).

## Re-syncing from upstream

To pick up upstream changes, diff `args.ts` against the latest
`juicesharp/rpiv-mono` `packages/rpiv-args/args.ts` and re-apply the
local-modifications list above. Watch for:
- new dependencies added upstream (would require a `package.json` bump)
- removed/renamed event types (`input`, `before_agent_start`, `session_start`)
- changes to the byte-exact `<skill …>` wrapper format (load-bearing
  contract — the upstream comment in `args.ts` calls this out explicitly)
