# ai — your local-first coding agent

A self-extensible, terminal-native AI coding agent. Reads, edits, runs. Pluggable models, pluggable skills, pluggable tools, pluggable memory. Stays out of your way.

> **One-line install:** `curl -fsSL https://raw.githubusercontent.com/simpletoolsindia/ai/main/install.sh | bash`

## What it is

`ai` is a coding agent that runs in your terminal. It reads your project, edits files, runs shell commands, and searches the web — all in a single session, with full session history you can replay, branch, and resume.

- **Local-first.** Runs in your shell, against your files. No SaaS lock-in, no cloud relay, no data leaving your machine unless you ask.
- **Pluggable models.** Any OpenAI-compatible API (Ollama, LM Studio, vLLM, OpenRouter, Anthropic, Google, OpenAI, Bedrock, …).
- **Local Ollama auto-discovery.** Run Ollama locally; all installed models show up in `/model` automatically. [Details below.](#local-ollama)
- **Built-in tools.** `read`, `write`, `edit`, `bash`, `grep`, `find`, `ls`, `websearch`, `webfetch`, `subagent`, `todo` — all available by default, no setup.
- **Persistent memory** across sessions. Built-in `pi-hermes-memory` extension. The agent remembers what it learned, what you prefer, and what didn't work. [Details below.](#persistent-memory)
- **Sandboxed tools** for large data. Optional `context-mode` extension gives the LLM `ctx_*` tools that run code, index, and search without dumping raw output into context. [Details below.](#sandboxed-tools-context-mode)
- **Subagents.** Spawn a focused LLM call against a single skill. Parallel and chain modes.
- **Skills & prompts.** Project-local (`.ai/agents/`, `.ai/prompts/`) and user-global (`~/.ai/agent/agents/`, `~/.ai/agent/prompts/`).
- **Sessions.** JSONL on disk. Resume, branch, fork, export to Markdown or JSON.
- **Todo overlay.** Persistent task list across the session, visible in the TUI.

## Install

### One-liner (macOS / Linux)

```bash
curl -fsSL https://raw.githubusercontent.com/simpletoolsindia/ai/main/install.sh | bash
```

This script:

1. Verifies Node ≥ 22.19 and git
2. On first run, clones the repo to `~/.ai/source/`
3. Runs `npm install --ignore-scripts` and `npm run build`
4. Symlinks `~/.local/bin/ai` → `~/.ai/source/packages/coding-agent/dist/cli.js`
5. Runs the smoke test (`ai --version`)

Re-run the same command later to **update** in place — the script detects the existing install at `~/.ai/source/`, does a `git pull`, rebuilds, and re-links the binary.

### Update

```bash
# Same command as install; detects existing install and updates in place
curl -fsSL https://raw.githubusercontent.com/simpletoolsindia/ai/main/install.sh | bash

# Or, if you have it locally:
./install.sh --source ~/.ai/source --skip-tests
```

### Options

```bash
# Pick a different version / branch / commit
curl -fsSL https://raw.githubusercontent.com/simpletoolsindia/ai/main/install.sh | bash -s -- --ref v0.79.0

# Install from a local checkout (for development)
git clone https://github.com/simpletoolsindia/ai.git
./ai/install.sh --source ./ai --bin-dir ~/.local/bin

# Custom install location
curl -fsSL https://raw.githubusercontent.com/simpletoolsindia/ai/main/install.sh | bash -s -- --prefix ~/.ai/dev --bin-dir ~/.local/bin

# Skip rebuild (faster update)
curl -fsSL https://raw.githubusercontent.com/simpletoolsindia/ai/main/install.sh | bash -s -- --skip-build --skip-tests
```

Run `ai --help` to see all flags.

### Uninstall

```bash
rm -rf ~/.ai ~/.local/bin/ai
```

## Quick start

```bash
# Sanity check
ai --version

# Ask anything (default model)
ai -p "What is the gold price in India right now?"

# Use a specific model
ai -p "Refactor this function" --model ollama/gemma4:e2b

# Interactive mode
cd ~/myproject
ai
```

In interactive mode:

| Command | Action |
|---|---|
| `/model` | pick a model |
| `/login` | OAuth / API key login for a cloud provider |
| `/scout-stack-auto` | run all configured subagents in parallel |
| `/scout-backend` `/scout-db` `/scout-frontend` | run a specific domain scout |
| `/scout-infra` `/scout-tests` `/scout-security` `/scout-config` | more domain scouts |
| `/scout-save` | save the latest scout findings to `.ai/agents/.findings/` |
| `/todo` `/clear-todo` | manage the session todo list |
| `/subagent` | spawn a subagent manually |
| `Esc Esc` | session tree (branch / fork / resume) |
| `Ctrl+C` | cancel current operation |

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

- **Auto-discover** all your installed Ollama models on every startup (and on `/model`)
- Show them in `ai --list-models`
- Let you select any of them with `--model ollama/<tag>` or via the interactive picker
- Send requests **without requiring an API key** (`optionalApiKey: true`)

The same pattern works for **LM Studio**, **vLLM**, and any other OpenAI-compatible local server. Just point `baseUrl` at the right port and set `optionalApiKey: true`.

```bash
# Test
ai --list-models
#   ollama        gemma4:latest       ...
#   ollama        granite4.1:8b       ...
#   ollama        ... (auto-discovered)

ai -p "say hi" --model ollama/gemma4:e2b
#   hi
```

## Persistent memory

`ai` ships with `pi-hermes-memory` (MIT) as a built-in extension. The agent remembers facts, preferences, conventions, and failure modes across sessions. SQLite FTS5 powers session search; a learning loop saves notable facts every N turns.

Default state: **enabled**, no setup required. To opt out, set `disabledBuiltInExtensions: ["hermes-memory"]` in `~/.ai/agent/settings.json`.

```bash
# The agent saves what it learns automatically
ai -p "Save to memory: my name is sridhar and I prefer dark mode"
#   I have saved that information into your memory:
#   1. Your name is Sridhar (Target: user)
#   2. You prefer dark mode (Target: user, Category: preference)

# Search past sessions
ai -p "What did we work on last week?"

# Where it's stored
ls ~/.ai/agent/pi-hermes-memory/
#   USER.md  MEMORY.md  sessions.db  skills/
```

## Sandboxed tools (context-mode)

`ai` ships with `mksglu/context-mode` (Elastic License v2.0) as a built-in extension. When enabled, it spawns a sandboxed MCP server that exposes 11 `ctx_*` tools (`ctx_execute`, `ctx_search`, `ctx_index`, `ctx_batch_execute`, etc.). The LLM uses these tools for data-heavy operations: instead of reading 50 files into context to count functions, it writes a script and reads the result.

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
# After enabling
ai -p "What tools are available?"
#   ...
#   ctx_execute, ctx_execute_file, ctx_batch_execute, ctx_search,
#   ctx_index, ctx_fetch_and_index, ctx_stats, ctx_doctor, ...

ai -p "Use ctx_execute to count the lines in every .ts file under src/"
#   10 files counted, ~1KB output
```

If the MCP server fails to start, the rest of `ai` keeps working. The extension logs to stderr and the LLM falls back to the built-in tools.

**License note:** The MCP server bundle is from [mksglu/context-mode](https://github.com/mksglu/context-mode) and is licensed under the **Elastic License v2.0** (ELv2). The full text is in `packages/coding-agent/src/core/extensions/built-in/context-mode/THIRD-PARTY/ELv2-LICENSE`. ELv2 is source-available: use, modify, and redistribute freely, but you may not provide the bundle as a managed service that competes with the original.

## Web tools

Built-in `websearch` and `webfetch` tools. Both are opt-in via `--no-builtin-tools` if you want to disable.

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
ai -p "What's the gold price in India today? Use websearch."
#   [Uses websearch, returns current prices with source URLs]

ai -p "Fetch https://www.rfc-editor.org/rfc/rfc2616.txt and tell me the file path"
#   Full content saved to ~/.ai/agent/cache/webfetch/fetch-XXXX.md
#   Use the read tool to view it
```

Localhost and private IPs are not blocked by default.

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

The body becomes the skill content. The LLM sees the description in its system prompt and decides when to invoke your skill.
```

A `description` is recommended (the LLM uses it to decide when to invoke) but not required — if missing, `ai` derives one from your first heading.

## Architecture

`ai` is a TypeScript monorepo with four packages:

| Package | Purpose |
|---|---|
| `@simpletoolsindiaorg/ai-provider` | Unified multi-provider LLM API (OpenAI, Anthropic, Google, Bedrock, Ollama-compat, …) |
| `@simpletoolsindiaorg/ai-agent` | Agent runtime: tool calling loop, state, message handling |
| `@simpletoolsindiaorg/ai-coding-agent` | The interactive coding agent CLI — the `ai` binary |
| `@simpletoolsindiaorg/ai-tui` | Terminal UI library (differential rendering, keybinding system) |

### Built-in extensions

| Extension | License | Default | What it does |
|---|---|---|---|
| `hermes-memory` | MIT | enabled | Persistent memory across sessions; FTS5 session search; learning loop |
| `context-mode` | ELv2 | **opt-in** | Spawns a sandboxed MCP server; 11 `ctx_*` tools for large data |

Both are vendored under `packages/coding-agent/src/core/extensions/built-in/`. To disable a specific built-in, add it to `disabledBuiltInExtensions` in `~/.ai/agent/settings.json`.

Read [AGENTS.md](AGENTS.md) for a deep dive into the codebase.

## License

MIT. See [LICENSE](LICENSE) for the full text and [NOTICE.md](NOTICE.md) for third-party attribution (including the ELv2 context-mode bundle).

## Support

- **Issues:** https://github.com/simpletoolsindia/ai/issues
- **Docs:** this README + [AGENTS.md](AGENTS.md)
- **Examples:** `packages/coding-agent/examples/extensions/` for the extension SDK
