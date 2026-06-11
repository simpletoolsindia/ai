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
- [What's in the box](#whats-in-the-box)
- [Local Ollama](#local-ollama)
- [Persistent memory](#persistent-memory)
- [Sandboxed tools (context-mode)](#sandboxed-tools-context-mode)
- [Pluggable web tools](#pluggable-web-tools)
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
curl -fsSL https://raw.githubusercontent.com/simpletoolsindia/ai/main/install.sh | bash -s -- --ref v0.79.0

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
#   0.79.0

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
| `/login` | OAuth / API key login for a cloud provider |
| `/scout-stack-auto` | run all configured subagents in parallel |
| `/scout-backend` `/scout-db` `/scout-frontend` | run a specific domain scout |
| `/scout-infra` `/scout-tests` `/scout-security` `/scout-config` | more domain scouts |
| `/scout-save` | save the latest scout findings to `.ai/agents/.findings/` |
| `/todo` `/clear-todo` | manage the session todo list |
| `/subagent` | spawn a subagent manually |
| `Esc Esc` | session tree (branch / fork / resume) |
| `Ctrl+C` | cancel the current operation |

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

Now `ai` will:

- **Auto-discover** all your installed Ollama models on every startup
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

`websearch` queries a SearXNG (or compatible) instance. Configure in `~/.ai/agent/models.json`:

```json
{
  "providers": {
    "websearch": {
      "baseUrl": "https://search.sridharhomelab.in",
      "maxResults": 10
    }
  }
}
```

`webfetch` retrieves any URL. If the response exceeds the inline cap (default 100KB), the full content is written to `~/.ai/agent/cache/webfetch/` and the LLM is told the path so it can `read` the file on demand.

```bash
$ ai -p "What's the gold price in India today? Use websearch."
# [Uses websearch, returns current prices with source URLs]

$ ai -p "Fetch https://www.rfc-editor.org/rfc/rfc2616.txt and tell me the file path"
# Full content saved to ~/.ai/agent/cache/webfetch/fetch-XXXX.md
# Use the read tool to view it
```

Localhost and private IPs are not blocked by default. Only fetch URLs you trust.

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
