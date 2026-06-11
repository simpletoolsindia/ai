<div align="center">

# ai

**Your local-first coding agent.**

Read · Edit · Run · Search · Remember

[![npm version](https://img.shields.io/npm/v/@simpletoolsindiaorg/ai-coding-agent.svg?label=version)](https://www.npmjs.com/package/@simpletoolsindiaorg/ai-coding-agent)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node >= 22.19](https://img.shields.io/badge/node-%3E%3D22.19-brightgreen.svg)](https://nodejs.org)
[![Built on pi](https://img.shields.io/badge/built_on-pi%20%E2%9F%A8-lightgrey.svg)](https://github.com/earendil-works/pi)

```bash
curl -fsSL https://raw.githubusercontent.com/simpletoolsindia/ai/main/install.sh | bash
```

</div>

---

`ai` is a terminal-native coding agent that reads your project, edits files, runs shell commands, and queries the web — all in a single session, with full history you can replay, branch, fork, and resume. Pluggable models (Ollama, OpenRouter, Anthropic, OpenAI, …). Persistent memory across sessions. Sandboxed tools for large data. No SaaS, no cloud relay, no data leaving your machine unless you ask.

```
┌────────────────────────────────────────────────────────────┐
│                                                            │
│   you ──prompt──> ai ──> LLM (your model)                  │
│                  │   │                                     │
│                  │   └──> tool calls (read, bash, edit,    │
│                  │         websearch, subagent, …)        │
│                  │                                         │
│                  ├──> local Ollama  (auto-discovered)     │
│                  ├──> SearXNG        (your instance)      │
│                  ├──> ~/.ai/agent/  (memory, sessions,     │
│                  │                      extensions,         │
│                  │                      skills)             │
│                  └──> MCP servers   (opt-in)               │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

## Contents

- [Install](#install)
- [Quick start](#quick-start)
- [What's new in 0.79.1](#whats-new-in-0791)
- [What's in the box](#whats-in-the-box)
- [Local Ollama](#local-ollama)
- [Persistent memory](#persistent-memory)
- [Sandboxed tools (context-mode)](#sandboxed-tools-context-mode)
- [Pluggable web tools](#pluggable-web-tools)
- [Custom OpenAI-compatible providers](#custom-openai-compatible-providers)
- [Configuration](#configuration)
- [Architecture](#architecture)
- [Updating](#updating)
- [License](#license)

## Install

**macOS or Linux, with Node ≥ 22.19 and git:**

```bash
curl -fsSL https://raw.githubusercontent.com/simpletoolsindia/ai/main/install.sh | bash
```

That's it. The script:

1. Verifies Node ≥ 22.19 and git are on `PATH`
2. Clones the repo to `~/.ai/source/`
3. Installs dependencies (`npm install --ignore-scripts`, then `npm rebuild better-sqlite3`)
4. Builds the four packages
5. Symlinks `~/.local/bin/ai` → `~/.ai/source/packages/coding-agent/dist/cli.js`
6. Smoke-tests with `ai --version`

The install is self-contained. To uninstall:

```bash
rm -rf ~/.ai ~/.local/bin/ai
```

### Install options

```bash
# Specific version / branch / commit
curl -fsSL https://raw.githubusercontent.com/simpletoolsindia/ai/main/install.sh | bash -s -- --ref v0.79.5

# Local checkout (for development)
git clone https://github.com/simpletoolsindia/ai.git
./ai/install.sh --source ./ai --bin-dir ~/.local/bin

# Custom install location
curl -fsSL https://raw.githubusercontent.com/simpletoolsindia/ai/main/install.sh | bash -s -- --prefix ~/.ai/dev

# Skip rebuild (faster, for re-running after a tiny edit)
curl -fsSL https://raw.githubusercontent.com/simpletoolsindia/ai/main/install.sh | bash -s -- --skip-build --skip-tests
```

Run `ai --help` for the full CLI reference.

## Quick start

```bash
# Sanity check
ai --version
#   0.79.1

# Ask anything (uses the default model from settings.json)
ai -p "What is the gold price in India right now?"

# Pick a different model
ai -p "Refactor this function to use async/await" --model ollama/gemma4:e2b

# Interactive mode (the real experience)
cd ~/your-project
ai
```

In interactive mode you can:

| Command | Action |
|---|---|
| `/model` | pick a model (fuzzy search, recent, scoped) |
| `/login` | OAuth / API key login for a cloud provider, or add a custom OpenAI-compatible endpoint |
| `/mode` | switch between PLAN (read-only) and EXECUTE (full tools) modes |
| `/searcheng` | view or update the SearXNG endpoint used by `websearch` |
| `/scout-stack-auto` | run all configured subagents in parallel |
| `/scout-backend` `/scout-db` `/scout-frontend` | run a specific domain scout |
| `/scout-infra` `/scout-tests` `/scout-security` `/scout-config` | more domain scouts |
| `/scout-save` | save the latest scout findings to `.ai/agents/.findings/` |
| `/todo` `/clear-todo` | manage the session todo list |
| `/subagent` | spawn a subagent manually |
| `Esc Esc` | session tree (branch / fork / resume) |
| `Ctrl+C` | cancel the current operation |

## What's new in 0.79.5

Hotfix release:

- **Plan mode is now honored at session startup** — the persisted `agentMode` in `settings.json` filters the initial tool list, so a brand-new session launched in plan mode already has `write`/`edit`/`bash` removed. Previously, the filter only applied if you ran `/mode` interactively.

## What's new in 0.79.4

The final production build. Two new features for safe, visible control over the agent:

- **PLAN / EXECUTE modes** — switch the agent between a read-only "planning" mode and the default "execute" mode. In PLAN mode, `write`, `edit`, and `bash` are stripped from the active tool set; the system prompt gets a one-line note explaining that the model can only read, search, and propose a plan. The new `/mode` slash command toggles:
  ```
  /mode                  # show current mode
  /mode plan             # switch to PLAN (read-only)
  /mode execute          # switch to EXECUTE (full tools)
  /mode toggle           # flip
  ```
  Mode is persisted to `~/.ai/agent/settings.json: { "agentMode": "plan" | "execute" }`.
- **Mode badge in the footer** — the status bar always shows the current mode next to the cwd/branch line: `PLAN` (warning color) or `EXECUTE` (dim). You'll never be surprised by which tools the model can use.
- 9 new tests in `test/agent-mode.test.ts` (persistence, system-prompt hint, slash-command wiring, footer wiring).

## What's new in 0.79.3

A polish release focused on perceived responsiveness:

- **Dynamic progress messages** — the spinner next to the working indicator no longer just says "Working...". It now cycles through 5 phase labels as the agent turns progress:
  | Phase | When | Message |
  |---|---|---|
  | 1 | Agent turn starts | `Thinking...` |
  | 2 | Assistant message starts streaming | `Working...` |
  | 3 | Model emits a tool call | `Tool calling...` |
  | 4 | Tool is actually executing | `Executing task...` |
  | 5 | Final response shaping up | `Almost done...` |
  Extensions can still override with `setWorkingMessage()`. See the new test in `test/dynamic-working-messages.test.ts`.
- 3 regression tests in `test/dynamic-working-messages.test.ts` guard the phase→event wiring so a future refactor can't silently break it.

## What's new in 0.79.2

The final production build. This release adds **runtime provider onboarding** (the last major workflow that used to require hand-editing `models.json`), makes auto-compaction **percentage-based and intuitive**, and tightens the system prompt so the LLM responds faster and more reliably.

- **`/login` → "Add OpenAI-compatible provider"** — add Groq, Together, Fireworks, LM Studio, vLLM, or any other OpenAI-compatible endpoint *at runtime* via a 5-step dialog. No hand-editing `~/.ai/agent/models.json` required. The slash command writes the provider config to `models.json`, saves the API key to `auth.json`, refreshes the registry, and tells you the exact `--model <provider>/<id>` line to use.
- **Auto-compact at 90% by default** — new `compaction.threshold` setting (default `0.9`). Compaction now triggers when the context reaches 90% of the model's window, not on a fixed 16K-reserve heuristic. Set `compaction.threshold = 0` to restore the old reserve-token behavior; `compaction.enabled = false` disables it entirely. Unknown context windows defer to the existing overflow safety net.
- **Optimized system prompt** — 17% shorter, all rules preserved. Adds a compact **Tool usage** section (when to use `read` vs `grep`/`find`/`ls`, when to delegate to `subagent`, prefer editing existing files, summarize tool output, ask one clarifying question when ambiguous) and a one-liner about the **agent loop** so the model knows it can iterate. The docs section is now 5 lines instead of 7, with all 10 topic cross-references intact.
- **Drive-by cleanup** — extracted the 70-line `convertToLlmWithBlockImages` closure from `sdk.ts` into its own `core/image-block-filter.ts` module. No behavior change.

## What's new in 0.79.1

A batch of quality-of-life fixes that were requested in real testing:

- **`/searcheng` slash command** — view or update the SearXNG endpoint used by `websearch` at runtime. No restart required. With no arg it prints the current URL; with a URL it validates, probes with a 5-second `GET`, and writes the new value to `~/.ai/agent/models.json`. See [Pluggable web tools](#pluggable-web-tools).
- **`providers.websearch` is now actually honored** — the `baseUrl` field was documented but the code used a hardcoded default. The full config (`baseUrl`, `maxResults`, `language`, `safesearch`, `timeRange`, `headers`) is plumbed end-to-end from `models.json` through to the tool.
- **Local Ollama "No API key" regression fixed** — auto-discovered Ollama models could not be selected by name on the first invocation with a freshly-written `models.json` because model discovery ran *after* CLI model resolution. Discovery now runs first.
- **Local Ollama SDK error fixed** — the OpenAI SDK throws `MissingApiKeyError` for `new OpenAI({apiKey: ""})`, so optional-auth providers (local Ollama, vLLM, LM Studio) failed at the SDK boundary. A placeholder is now substituted only for `optionalApiKey: true` providers; Ollama and friends ignore the resulting `Authorization: Bearer anonymous` header.
- **Skill missing-description is now an info note, not a warning** — if your `SKILL.md` has no `description` in the frontmatter, `ai` derives one from the first heading and shows a muted `[Skill notes]` line at startup. Add `description: …` to silence it.
- **Better model-registry schema** — `optionalApiKey: true` and `autoDiscover: "ollama"` are now first-class fields in the `models.json` provider config.

## What's in the box

### Built-in tools (default-on)

| Tool | What it does |
|---|---|
| `read` / `write` / `edit` | file ops with precise text replacement |
| `bash` | shell commands, with output truncation and SIGTERM handling |
| `grep` / `find` / `ls` | file exploration with structured output |
| `websearch` | SearXNG (or compatible) JSON API; markdown-formatted results |
| `webfetch` | fetch any URL; truncates inline + spills large responses to a temp file the LLM can `read` on demand |
| `subagent` | spawn a focused LLM call against a single skill (single / parallel / chain) |
| `todo` | session-scoped task list, visible in the TUI overlay |

### Built-in extensions (default-on)

| Extension | What it does |
|---|---|
| `hermes-memory` | Persistent memory across sessions — facts, preferences, failure modes. SQLite FTS5 powers session search. |

### Built-in extensions (opt-in)

| Extension | What it does | How to enable |
|---|---|---|
| `context-mode` | Spawns a sandboxed MCP server; 11 `ctx_*` tools for data-heavy operations | `~/.ai/agent/settings.json: { "contextMode": { "enabled": true } }` |

### Pluggable model providers

| Provider | Type | Notes |
|---|---|---|
| Anthropic | built-in | OAuth or API key |
| OpenAI | built-in | OAuth or API key |
| Google (Gemini) | built-in | OAuth or API key |
| AWS Bedrock | built-in | IAM credentials |
| OpenRouter | built-in | API key |
| Ollama | **auto-discover** | Local server, no API key needed |
| LM Studio | OpenAI-compat | Local server, no API key needed |
| vLLM | OpenAI-compat | Local server, no API key needed |
| Anything else | `models.json` | Pluggable via JSON config |

### Sessions, skills, prompts, themes

- **Sessions** — JSONL on disk. Resume, branch, fork, export to Markdown or JSON.
- **Skills** — Markdown files (`.ai/skills/<name>/SKILL.md`). Auto-invocable by description.
- **Prompts** — Slash commands (`.ai/prompts/<name>.md`).
- **Themes** — TUI color schemes (`~/.ai/agent/themes/`).

## Local Ollama

If you run Ollama locally on the default port, add this to `~/.ai/agent/models.json`:

```json
{
  "providers": {
    "ollama": {
      "baseUrl": "http://localhost:11434/v1",
      "api": "openai-completions",
      "optionalApiKey": true,
      "autoDiscover": "ollama"
    }
  }
}
```

| Field | Notes |
|---|---|
| `baseUrl` | OpenAI-compatible endpoint. `11434` is the default Ollama port. |
| `api` | `"openai-completions"` (Ollama exposes an OpenAI-compatible API). |
| `optionalApiKey` | `true` — Ollama doesn't require auth. The SDK is given a placeholder key. |
| `autoDiscover` | `"ollama"` — calls `GET <baseUrl-stripped-of-/v1>/api/tags` at startup and adds every model. |

Now `ai` will:

- **Auto-discover** all your installed Ollama models on every startup (and on demand from the model picker)
- Show them in `ai --list-models`
- Let you select any of them with `--model ollama/<tag>` or via the interactive picker
- Send requests **without requiring an API key** (`optionalApiKey: true`)

```bash
$ ai --list-models
provider      model                                                         context  max-out
ollama        deepseek-v4-pro:cloud                                         128K     16.4K
ollama        gemma4:31b-cloud                                              128K     16.4K
ollama        gemma4:e2b                                                    128K     16.4K
ollama        gemma4:latest                                                 128K     16.4K
ollama        glm-5.1:cloud                                                 128K     16.4K
ollama        granite4.1:8b                                                 131.1K   16.4K   # 131K context applied via modelOverrides
ollama        kimi-k2.6:cloud                                               128K     16.4K
ollama        qwen3.5:35b-a3b-coding-nvfp4                                  128K     16.4K
# ... (and all 30 ollama-cloud models, plus any other provider)

$ ai -p "say OK" --model ollama/gemma4:e2b
OK
```

The same pattern works for **LM Studio**, **vLLM**, and any other OpenAI-compatible local server. Just point `baseUrl` at the right port and set `optionalApiKey: true`.

## Persistent memory

`ai` ships with `pi-hermes-memory` (MIT-licensed, vendored) as a built-in extension. The agent remembers facts, preferences, and failure modes across sessions. SQLite FTS5 powers session search; a learning loop saves notable facts every N turns.

```bash
$ ai -p "Save to memory: my name is sridhar and I prefer dark mode"
I have saved that information into your memory:
1. Your name is Sridhar (Target: user)
2. You prefer dark mode (Target: user, Category: preference)

$ ls ~/.ai/agent/pi-hermes-memory/
MEMORY.md  USER.md  sessions.db  skills/

# In a future session:
$ ai -p "What do you know about me?"
Your name is Sridhar and you prefer dark mode. (from memory)
```

To disable: set `disabledBuiltInExtensions: ["hermes-memory"]` in `~/.ai/agent/settings.json`.

## Sandboxed tools (context-mode)

`ai` ships with `mksglu/context-mode` (Elastic License v2.0, vendored bundle) as a built-in extension. When enabled, it spawns a sandboxed MCP server that exposes 11 `ctx_*` tools (`ctx_execute`, `ctx_search`, `ctx_index`, `ctx_batch_execute`, etc.). The LLM uses these tools for data-heavy operations: instead of reading 50 files into context to count functions, it writes a script and reads the result.

**Default state: disabled** (it spawns a subprocess + SQLite, so opt-in is the safe default). Enable:

```json
{
  "contextMode": {
    "enabled": true,
    "timeoutMs": 30000,
    "maxOutputBytes": 50000
  }
}
```

```bash
$ ai -p "What tools are available?"
# ...
#   ctx_execute, ctx_execute_file, ctx_batch_execute, ctx_search,
#   ctx_index, ctx_fetch_and_index, ctx_stats, ctx_doctor, ...

$ ai -p "Use ctx_execute to count lines in every .ts file under src/"
#   10 files counted, ~1KB output
```

If the MCP server fails to start, the rest of `ai` keeps working. The extension logs to stderr and the LLM falls back to the built-in tools.

**License note:** The MCP server bundle is from [mksglu/context-mode](https://github.com/mksglu/context-mode) and is licensed under the **Elastic License v2.0** (ELv2). The full text is in `packages/coding-agent/src/core/extensions/built-in/context-mode/THIRD-PARTY/ELv2-LICENSE`. ELv2 is source-available: use, modify, and redistribute freely; you may not provide the bundle as a managed service that competes with the original.

## Pluggable web tools

Built-in `websearch` and `webfetch` tools.

### `websearch` (SearXNG)

`websearch` queries a SearXNG (or compatible) instance. The endpoint is configurable end-to-end via `~/.ai/agent/models.json`:

```json
{
  "providers": {
    "websearch": {
      "baseUrl": "https://search.sridharhomelab.in",
      "maxResults": 10,
      "language": "en",
      "safesearch": "0",
      "timeRange": "week",
      "headers": { "X-Proxy-Auth": "token" }
    }
  }
}
```

| Field | Default | Notes |
|---|---|---|
| `baseUrl` | `https://search.sridharhomelab.in/search` | The SearXNG instance. Add or strip `/search`; the tool normalizes it. |
| `maxResults` | `10` | Number of results to fetch. |
| `language` | `"en"` | SearXNG language code (`en`, `de`, `fr`, …). |
| `safesearch` | `"0"` | `"0"` (off), `"1"` (moderate), `"2"` (strict). |
| `timeRange` | (none) | `"day"`, `"week"`, `"month"`, or `"year"`. |
| `headers` | `{}` | Extra HTTP headers to send with every request. `Accept: application/json` is always sent. |

**Runtime updates** — use the built-in `/searcheng` slash command to view or change the endpoint without restarting:

```
/searcheng                              # show current endpoint
/searcheng https://search.example.com   # validate, test, and save
```

The slash command writes the new value to `models.json` and updates the in-memory registry; the next `websearch` call uses the new value immediately.

### `webfetch` (any URL)

`webfetch` retrieves any URL. If the response exceeds the inline cap (default 100KB), the full content is written to `~/.ai/agent/cache/webfetch/` and the LLM is told the path so it can `read` the file on demand.

```bash
$ ai -p "What's the gold price in India today? Use websearch."
# [Uses websearch, returns current prices with source URLs]

$ ai -p "Fetch https://www.rfc-editor.org/rfc/rfc2616.txt and tell me the file path"
# Full content saved to ~/.ai/agent/cache/webfetch/fetch-XXXX.md
# Use the read tool to view it
```

Localhost and private IPs are not blocked by default. Only fetch URLs you trust.

## Custom OpenAI-compatible providers

Any endpoint that speaks the OpenAI `/v1/chat/completions` API can be added at runtime — no need to hand-edit `~/.ai/agent/models.json`. Groq, Together, Fireworks, OpenRouter, LM Studio, vLLM, llama.cpp's server, LocalAI, etc. all work.

In interactive mode:

```
> /login
> Select authentication method: Add OpenAI-compatible provider
> Provider name: my-groq
> Base URL:      https://api.groq.com/openai/v1
> API key:       gsk_...
> Model ID:      llama-3.1-70b-versatile
> Display name:  Llama 3.1 70B (Groq)
✓ Added provider "my-groq". Use /model to pick "my-groq/llama-3.1-70b-versatile",
  or run: ai -p "..." --model my-groq/llama-3.1-70b-versatile
```

The new model is **immediately selectable** — the registry is refreshed in-memory. The provider is written to `~/.ai/agent/models.json`:

```json
{
  "providers": {
    "my-groq": {
      "baseUrl": "https://api.groq.com/openai/v1",
      "api": "openai-completions",
      "apiKey": "gsk_...",
      "models": [
        { "id": "llama-3.1-70b-versatile", "name": "Llama 3.1 70B (Groq)" }
      ]
    }
  }
}
```

The API key is also written to `~/.ai/agent/auth.json` (the secure store used by the `/login` flow for built-in providers).

### Programmatic / scripted add

If you don't want to use the TUI, you can call the same API from a script:

```js
import { ModelRegistry, AuthStorage } from "@simpletoolsindiaorg/ai-coding-agent";

const registry = ModelRegistry.create(
  AuthStorage.create("~/.ai/agent/auth.json"),
  "~/.ai/agent/models.json",
);

registry.addOpenAICompatibleProvider({
  name: "my-groq",
  baseUrl: "https://api.groq.com/openai/v1",
  apiKey: process.env.GROQ_API_KEY!,
  modelId: "llama-3.1-70b-versatile",
  modelName: "Llama 3.1 70B (Groq)",
});
```

Validation:

- Provider name must match `[a-zA-Z0-9_-]+` (no slashes, spaces, or punctuation)
- Provider name must not collide with a built-in (anthropic, openai, groq, etc.) — the slash command suggests an alternative
- `baseUrl` must be a valid `http://` or `https://` URL
- Refuses to clobber a malformed existing `models.json` (you'll see the original parse error)

## Configuration

| What | Where |
|---|---|
| User config (auth, models, settings, trust) | `~/.ai/agent/` |
| Project-local config | `.ai/` in your working directory |
| Sessions | `~/.ai/agent/sessions/` |
| Memory store (hermes) | `~/.ai/agent/pi-hermes-memory/` |
| Webfetch spillover cache | `~/.ai/agent/cache/webfetch/` |
| Subagents (project) | `.ai/agents/` |
| Subagents (user) | `~/.ai/agent/agents/` |
| Prompt templates (project) | `.ai/prompts/` |
| Prompt templates (user) | `~/.ai/agent/prompts/` |
| Skills (project) | `.ai/skills/<name>/SKILL.md` |
| Skills (user) | `~/.ai/agent/skills/<name>/SKILL.md` |

A SKILL.md file:

```markdown
---
name: senior-typescript-genai-architect
description: Use this skill when the user wants a production-grade TypeScript + GenAI architecture review or implementation plan.
---

# Your skill prompt here
```

The `description` is recommended (the LLM uses it to decide when to invoke) but not required. If missing, `ai` derives one from your first heading and emits a warning so you can clean it up later.

## Architecture

`ai` is a TypeScript monorepo with four packages and a clean separation of concerns:

```
┌──────────────────────────────────────────────────────────────────┐
│                       ai  (interactive TUI)                      │
│   packages/coding-agent                                         │
│   ↑ loads extensions, runs the agent loop, drives the TUI        │
├──────────────────────────────────────────────────────────────────┤
│                       ai-agent  (runtime)                        │
│   packages/agent                                                │
│   ↑ tool calling loop, message handling, state machine           │
├──────────────────────────────────────────────────────────────────┤
│                       ai-tui  (terminal UI)                      │
│   packages/tui                                                  │
│   ↑ differential rendering, keybinding system, components        │
├──────────────────────────────────────────────────────────────────┤
│                       ai-provider  (LLM API)                     │
│   packages/ai                                                   │
│   ↑ OpenAI, Anthropic, Google, Bedrock, OpenRouter, Ollama, …    │
└──────────────────────────────────────────────────────────────────┘
```

The agent session is a state machine:

```
user message
   ↓
LLM responds with text + tool calls
   ↓
tools execute (read / bash / edit / write / subagent / webfetch / …)
   ↓
tool results returned to the LLM
   ↓
repeat until the LLM emits a final text response
   ↓
session written to ~/.ai/agent/sessions/<id>.jsonl
```

The TUI renders the conversation in a streaming fashion. You can interrupt, branch, fork, and edit the message log at any point.

Read [AGENTS.md](AGENTS.md) for a deep dive into the codebase.

## Updating

The same install command handles updates. Re-run it whenever you want to pull the latest:

```bash
curl -fsSL https://raw.githubusercontent.com/simpletoolsindia/ai/main/install.sh | bash
```

The script detects the existing install at `~/.ai/source/`, does a `git pull` and rebuild, and re-links the binary. Your `~/.ai/agent/` config and `~/.ai/source/` repo stay intact.

Inside `ai`, you can also run:

```bash
ai update self
```

to upgrade the binary in place.

## License

MIT. See [LICENSE](LICENSE) for the full text and [NOTICE.md](NOTICE.md) for full attribution and the third-party license disclosures (including the ELv2 context-mode bundle).

`ai` is built on the [pi](https://github.com/earendil-works/pi) coding agent by **Mario Zechner / earendil-works** (MIT, Copyright (c) 2025). We are grateful to the upstream project and its maintainer.

## Support

- **Issues:** https://github.com/simpletoolsindia/ai/issues
- **Source:** https://github.com/simpletoolsindia/ai
- **npm:** https://www.npmjs.com/package/@simpletoolsindiaorg/ai-coding-agent
- **Docs:** this README + [AGENTS.md](AGENTS.md) + `packages/coding-agent/docs/`
- **Examples:** `packages/coding-agent/examples/extensions/` for the extension SDK
