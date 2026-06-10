# NOTICE — Attribution and modifications

This project is a fork of [`pi`](https://github.com/earendil-works/pi), originally created and maintained by **Mario Zechner** and the **earendil-works** community.

## Upstream

- **Project:** pi (https://pi.dev, https://github.com/earendil-works/pi)
- **Original author:** Mario Zechner
- **Copyright:** (c) 2025 Mario Zechner
- **License:** MIT
- **Upstream LICENSE file:** preserved verbatim in this repository at [LICENSE](LICENSE)

We (simpletoolsindiaorg) did not author the original code. We are grateful for the upstream project and acknowledge that all credit for the design, architecture, and implementation belongs to its original authors.

## Modifications in this fork

This fork contains the following categories of changes to the upstream code:

### 1. Identity and naming

- Package scope: `@earendil-works/pi-*` → `@simpletoolsindiaorg/ai-*`
- Package names: `pi-ai` → `ai-provider`, `pi-agent-core` → `ai-agent`, `pi-coding-agent` → `ai-coding-agent`, `pi-tui` → `ai-tui`
- Monorepo name: `pi-monorepo` → `ai-monorepo`
- CLI binary: `pi` → `ai`
- User config dir default: `~/.pi/agent/` → `~/.ai/agent/`
- Project config dir default: `.pi/` → `.ai/`
- App title character: `π` → `α`
- Repository URL: `github.com/earendil-works/pi` → `github.com/simpletoolsindiaorg/ai`

### 2. Public API and config keys

- `package.json` `piConfig` key → `aiConfig` (with back-compat: `piConfig` is still accepted and behaves identically)
- Extension manifest key `pi.extensions/skills/prompts/themes` → `ai.*` (with back-compat: `pi.*` is still accepted)
- Environment variables: `PI_OFFLINE` → `AI_OFFLINE`, `PI_TELEMETRY` → `AI_TELEMETRY`, `PI_SHARE_VIEWER_URL` → `AI_SHARE_VIEWER_URL`, `PI_CLEAR_ON_SHRINK` → `AI_CLEAR_ON_SHRINK`, `PI_HARDWARE_CURSOR` → `AI_HARDWARE_CURSOR`
- Skill discovery mode enum value: `"pi"` → `"ai"` (with back-compat: `"pi"` is still accepted)
- `update self` subcommand alias: `update pi` → `update ai` (with back-compat: `update pi` is still accepted)

### 3. External endpoints

- Version check URL: `https://pi.dev/api/latest-version` → `https://api.simpletoolsindiaorg.invalid/latest-version` (placeholder; replace with a real endpoint before shipping)
- Install telemetry URL: `https://pi.dev/api/report-install` → `https://api.simpletoolsindiaorg.invalid/report-install` (placeholder)
- Share viewer URL: `https://pi.dev/session/` → `https://api.simpletoolsindiaorg.invalid/session/` (placeholder)
- Changelog URL: `https://pi.dev/changelog` → `https://github.com/simpletoolsindiaorg/ai/blob/main/packages/coding-agent/CHANGELOG.md`
- GitHub release download URL: `https://github.com/earendil-works/pi-mono/releases/latest` → `https://github.com/simpletoolsindiaorg/ai/releases/latest`
- Upstream issue links: `https://github.com/earendil-works/pi-mono/issues/...` → `https://github.com/simpletoolsindiaorg/ai/issues/...`

### 4. Internal identifiers and file paths

These are not user-facing but were renamed for consistency:

- Internal temp file prefixes: `pi-output`, `pi-bash`, `pi-editor`, `pi-extensions` → `ai-*` equivalents
- Log file paths: `~/.pi/agent/pi-debug.log`, `pi-crash.log` → `~/.ai/agent/ai-debug.log`, `ai-crash.log`
- Windows self-update quarantine dir: `.pi-native-quarantine` → `.ai-native-quarantine`
- HTTP user agent string: `pi/<version> (...)` → `ai/<version> (...)`
- Provider attribution headers (OpenRouter, OpenCode, Cloudflare, Bedrock middleware name)
- User-facing messages in `main.ts`, `interactive-mode.ts`, `package-manager-cli.ts`, and other UI surfaces
- System prompt references to "pi" (the LLM is told to read about "ai" instead)
- JSDoc examples using `pi.registerProvider(...)` etc.
- Example extension code: function parameter renamed from `pi` to `ai` in all `examples/extensions/*.ts`
- `piConfig` types and interfaces renamed to `aiConfig`; type names `PiManifest` → `AiManifest`

### 5. Documentation

- `README.md` rewritten to describe the fork and how it differs from upstream
- This `NOTICE.md` added (did not exist upstream)
- `LICENSE` preserved verbatim from upstream

### 6. Things explicitly NOT changed

- All algorithmic behavior: agent loop, tool execution, compaction, session management, extension lifecycle
- All public TypeScript types (renames preserve the same shape; only the *names* differ)
- All provider implementations (Anthropic, OpenAI, Google, Bedrock, etc.)
- The TUI rendering engine
- The full test suite (ported as-is; any test failures should be reported as fork bugs)
- All CHANGELOG entries prior to the fork (the historical changelogs describe the upstream project, which is accurate — that's where the code came from)

## What we did not do

- We did not remove upstream copyright or attribution from the source files.
- We did not relicense the upstream code.
- We did not claim authorship of the original code or design.
- We did not attempt to mislead anyone about the origin of the code.
- We did not strip the upstream's `pi.dev` references from historical CHANGELOG entries or comments that quote the upstream.

## If you want to contribute back upstream

The cleanest path is to develop the change in the upstream `pi` repo (where Mario and the maintainers review contributions) and then port the change to this fork. Bug fixes and improvements belong upstream first.

## Trademark

`pi`, `earendil-works`, and the `π` symbol are associated with the upstream project and its maintainer. This fork uses `ai` and `α` as its own product identity. If the upstream maintainer asks us to make a change to how the fork identifies itself, we will.
