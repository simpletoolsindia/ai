# Ai — Coding Agent Monorepo (Fork)

Ai is a fork of the [pi](https://github.com/earendil-works/pi) self-extensible coding agent, repackaged and renamed.

The upstream `pi` project is a coding agent CLI with a layered architecture (LLM provider abstraction, agent runtime, TUI, interactive CLI) and a rich extension system. This fork preserves all of that and renames the product identity from `pi` to `ai`.

> **Upstream:** [github.com/earendil-works/pi](https://github.com/earendil-works/pi)
> **This fork:** [github.com/simpletoolsindiaorg/ai](https://github.com/simpletoolsindiaorg/ai)
> **License:** MIT (see [LICENSE](LICENSE) — copyright Mario Zechner / earendil-works; see [NOTICE.md](NOTICE.md) for full attribution)

---

## What's different from upstream

This is a **rename and repackage fork**. Behavior, architecture, and APIs are intentionally identical to upstream pi. The differences are:

| Concern | Upstream `pi` | This fork `ai` |
|---|---|---|
| Package scope | `@earendil-works/pi-*` | `@simpletoolsindiaorg/ai-*` |
| Package names | `pi-ai`, `pi-agent-core`, `pi-tui`, `pi-coding-agent` | `ai-provider`, `ai-agent`, `ai-tui`, `ai-coding-agent` |
| CLI binary | `pi` | `ai` |
| User config dir | `~/.pi/agent/` | `~/.ai/agent/` |
| Project config dir | `.pi/` | `.ai/` |
| Extension manifest key | `pi.extensions` etc. | `ai.extensions` etc. (`pi` accepted for back-compat) |
| `piConfig` package.json key | `piConfig` | `aiConfig` (`piConfig` accepted for back-compat) |
| `update self` subcommand alias | `update pi` | `update ai` (`pi` accepted for back-compat) |
| Env vars | `PI_OFFLINE`, `PI_TELEMETRY`, `PI_SHARE_VIEWER_URL`, `PI_CLEAR_ON_SHRINK`, `PI_HARDWARE_CURSOR` | `AI_OFFLINE`, `AI_TELEMETRY`, `AI_SHARE_VIEWER_URL`, `AI_CLEAR_ON_SHRINK`, `AI_HARDWARE_CURSOR` |
| Default version-check / share / install-telemetry endpoints | `https://pi.dev/api/*` | `https://api.simpletoolsindiaorg.invalid/*` (placeholder — replace before shipping) |
| App title character | `π` | `α` |

Everything else — agent loop, tool definitions, extension system, TUI, session management, compaction, model registry, provider clients — is the upstream code.

### Why a fork and not an upstream rename?

We needed a different product name (`ai` instead of `pi`) and a different package scope. Renaming someone else's project in-place would lose the upstream's identity and break the maintainer's distribution. The fork lets us ship a re-branded binary while leaving the upstream project intact for its maintainer (Mario Zechner / earendil-works) and the existing community.

### Configuration that still expects the old name

The `models.json`, `auth.json`, `settings.json`, and `trust.json` files in your `~/.pi/agent/` config are not auto-migrated. If you have existing data there, copy it to `~/.ai/agent/`:

```sh
cp -R ~/.pi/agent/* ~/.ai/agent/   # copy models.json, auth.json, settings.json, etc.
```

Session files (in `~/.pi/agent/sessions/`) are readable as-is — the on-disk format does not embed the app name.

---

## Packages

| Package | Description |
|---------|-------------|
| **[@simpletoolsindiaorg/ai-provider](packages/ai)** | Unified multi-provider LLM API (OpenAI, Anthropic, Google, Bedrock, etc.) |
| **[@simpletoolsindiaorg/ai-agent](packages/agent)** | Agent runtime with tool calling, state management, and harness support |
| **[@simpletoolsindiaorg/ai-coding-agent](packages/coding-agent)** | Interactive coding agent CLI with `read`, `bash`, `edit`, `write` tools and session management |
| **[@simpletoolsindiaorg/ai-tui](packages/tui)** | Terminal UI library with differential rendering |

## Installation (local development)

```bash
npm install --ignore-scripts  # install all deps without lifecycle scripts
npm run build                  # builds tui → ai-provider → ai-agent → ai-coding-agent
./test.sh                      # run tests (skips LLM-dependent tests without API keys)
./ai-test.sh                   # run ai from sources (run from any directory)
```

After the first build, the `ai` binary is at `packages/coding-agent/dist/cli.js`.

## Publishing

This fork uses npm scope `@simpletoolsindiaorg`. To publish, you need an npm account with write access to that scope (or a different scope of your choosing — see "Renaming the fork" below).

```bash
npm run publish:dry   # dry run
npm run publish       # actual publish
```

The `prepublishOnly` script runs `clean`, `build`, and `check` (lint + format + typecheck + supply-chain checks).

## Renaming the fork

To rename the package scope, edit:

1. `package.json` — `name` field at root
2. Each `packages/*/package.json` — `name` field, `repository.url`
3. The strings in this README and the comments in source files
4. `scripts/check-pinned-deps.mjs` and `scripts/generate-coding-agent-shrinkwrap.mjs` — the `internalPackagePrefix` constant

The bulk find/replace is mechanical:

```sh
find . -type f \( -name "*.ts" -o -name "*.json" -o -name "*.md" -o -name "*.mjs" \) \
  -not -path "*/node_modules/*" -not -path "*/dist/*" \
  -exec sed -i '' 's|@simpletoolsindiaorg/ai-|@your-scope/ai-|g' {} \;
```

## Permissions & containerization

The agent has no built-in permission system. By default it runs with the permissions of the user and process that launched it. For stronger boundaries, see the upstream's `containerization.md` (the patterns apply unchanged).

## License & attribution

- Original code: MIT, Copyright (c) 2025 Mario Zechner — see [LICENSE](LICENSE)
- This fork's modifications: MIT, Copyright (c) 2025 simpletoolsindiaorg
- Full attribution and a list of changes from upstream: see [NOTICE.md](NOTICE.md)

We are grateful to Mario Zechner and the earendil-works community for the upstream project.
# ai
