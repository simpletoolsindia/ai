# Third-party code in `context7`

This extension **does not vendor any third-party code**. Instead, it
spawns the published `@upstash/context7-mcp` server as a child process
on first use. The package is downloaded via `npx -y` and cached by
npm afterwards.

## What runs

| Component | Source | How obtained |
|-----------|--------|--------------|
| MCP server | [`@upstash/context7-mcp`](https://www.npmjs.com/package/@upstash/context7-mcp) (Upstash) | `npx -y @upstash/context7-mcp` at runtime |
| Client wrapper | `../index.ts` | Written for ai; uses shared `../../mcp-stdio-client.ts` |
| `MCPStdioClient` | `../../mcp-stdio-client.ts` | Promoted from the context-mode built-in; ai-owned |

## License

The context7 server is MIT-licensed. The full text is at `MIT-LICENSE`
in this folder. Copyright (c) 2021 Upstash, Inc.

## Privacy

The context7 MCP server is a **remote service** hosted at
https://context7.com. The two tools (`resolve-library-id`,
`get-library-docs`) send library names and topic queries to that
endpoint. No data is sent unless the user explicitly enables
`context7.enabled = true` in `~/.ai/agent/settings.json`.

## Why not vendored

- context7 is a hosted service — vendoring the server code would not
  change the data flow (the server still talks to context7.com).
- context7 is actively maintained by Upstash; vendoring would mean
  re-vendoring on every release.
- The first call downloads ~1-2 MB of code via `npx` and caches it
  in the npm cache. Subsequent starts are near-instant.

If vendoring is later required (offline use, supply-chain hardening),
copy the upstream `packages/mcp/dist` output into a `mcp-server/`
folder in this directory and adjust the `command` / `args` in
`../index.ts` to invoke the bundled `.mjs` instead of `npx`.
