# ai — your local-first coding agent

A self-extensible, terminal-native AI coding agent. Reads, edits, runs. Pluggable models, pluggable skills, pluggable tools, pluggable memory. Stays out of your way.

> One-line install: `curl -fsSL https://raw.githubusercontent.com/simpletoolsindia/ai/main/install.sh | bash`

## What it is

`ai` is a coding agent that runs in your terminal. It reads your project, edits files, runs shell commands, and searches the web — all in a single session, with full session history you can replay, branch, and resume.

Key features:

- **Local-first.** Runs in your shell, against your files. No SaaS lock-in, no cloud relay, no data leaving your machine unless you ask.
- **Pluggable models.** Any OpenAI-compatible API (Ollama, LM Studio, vLLM, OpenRouter, Anthropic, Google, OpenAI, Bedrock, …). Set the base URL, point at your local server, and you're done.
- **Local model auto-discovery.** If you run Ollama locally, all your installed models show up in `/model` automatically — no `models.json` enumeration needed. [See below](#local-ollama).
- **Built-in tools.** `read`, `write`, `edit`, `bash`, `grep`, `find`, `ls`, `websearch`, `webfetch`, `subagent`, `todo` — all available by default, no setup.
- **Web tools.** `websearch` queries your SearXNG (or compatible) instance, `webfetch` retrieves any URL. Both are opt-in and work with private-network endpoints.
- **Subagents.** Spawn a focused LLM call against a single skill (e.g. `backend-scout`, `tests-scout`). Parallel and chain modes.
- **Skills & prompts.** Project-local (`.ai/agents/`, `.ai/prompts/`) and user-global (`~/.ai/agent/agents/`, `~/.ai/agent/prompts/`). Skills are auto-invocable by description.
- **Sessions.** JSONL on disk. Resume, branch, fork, export to Markdown or JSON.
- **Todo overlay.** Persistent task list across the session, visible in the TUI.
- **Plan / execute modes.** (in progress) Toggle between read-only exploration and full read-write.

## Install

### One-liner (macOS / Linux)

```bash
curl -fsSL https://raw.githubusercontent.com/simpletoolsindia/ai/main/install.sh | bash
```

This script:

1. Verifies Node ≥ 20 and git
2. Clones the repo to `~/.ai/source/`
3. Runs `npm install --ignore-scripts` and `npm run build`
4. Symlinks `~/.local/bin/ai` → `~/.ai/source/packages/coding-agent/dist/cli.js`
5. Runs the smoke test (`ai --version`)

The install is self-contained. To uninstall:

```bash
rm -rf ~/.ai ~/.local/bin/ai
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
```

Run `ai --help` to see all flags.

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

In the interactive mode you can:

| Key/command | Action |
|---|---|
| `Tab` | (planned) toggle plan / execute mode |
| `/model` | pick a model |
| `/login` | OAuth / API key login for a cloud provider |
| `/logout` | clear credentials |
| `/scout-stack-auto` | run the full stack analysis using all configured subagents |
| `/scout-backend` `/scout-db` `/scout-frontend` `/scout-infra` `/scout-tests` `/scout-security` `/scout-config` | run a specific domain scout |
| `/scout-save` | save the latest scout findings to `.ai/agents/.findings/` |
| `/todo` `/clear-todo` | manage the session todo list |
| `/subagent` | spawn a subagent manually |
| `Esc Esc` | session tree (branch / fork / resume) |
| `Ctrl+C` | cancel current operation |

## Local Ollama

If you run Ollama locally on the default port (`http://localhost:11434/v1`), add this to `~/.ai/agent/models.json`:

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

- Auto-discover all your installed Ollama models on every startup (and on `/model`)
- Show them in `ai --list-models`
- Let you select any of them with `--model ollama/<tag>` or via the interactive picker
- Send requests without requiring an API key (`optionalApiKey: true`)

The same pattern works for **LM Studio**, **vLLM**, and any other OpenAI-compatible local server. Just point `baseUrl` at the right port and set `optionalApiKey: true`.

## Pluggable web tools

The built-in `websearch` and `webfetch` tools hit a configurable HTTP endpoint. Defaults assume a SearXNG instance, but any compatible JSON API works.

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

Localhost and private IPs are **not** blocked by default — you can point `webfetch` at a local service for testing. If you want to lock it down, configure your firewall or use a proxy.

## Configuration

| What | Where |
|---|---|
| User config (auth, models, settings, trust) | `~/.ai/agent/` |
| Project-local config | `.ai/` in your working directory |
| Sessions | `~/.ai/agent/sessions/` |
| Subagents (project) | `.ai/agents/` |
| Subagents (user) | `~/.ai/agent/agents/` |
| Prompt templates (project) | `.ai/prompts/` |
| Prompt templates (user) | `~/.ai/agent/prompts/` |
| Skills (project) | `.ai/skills/<name>/SKILL.md` |
| Skills (user) | `~/.ai/agent/skills/<name>/SKILL.md` |

The model registry looks at `~/.ai/agent/models.json` first, then the project `.ai/models.json`. Project wins on conflict.

A SKILL.md file looks like:

```markdown
---
name: senior-typescript-genai-architect
description: Use this skill when the user wants a production-grade TypeScript + GenAI architecture review or implementation plan.
---

# Your skill prompt here

The body becomes the skill content. The LLM sees the description in its system prompt and decides when to invoke your skill.
```

A `description` is recommended (the LLM uses it to decide when to invoke) but not required — if missing, ai derives one from your first heading.

## Architecture

`ai` is a TypeScript monorepo with four packages:

| Package | Purpose |
|---|---|
| `@simpletoolsindiaorg/ai-provider` | Unified multi-provider LLM API (OpenAI, Anthropic, Google, Bedrock, Ollama-compat, …) |
| `@simpletoolsindiaorg/ai-agent` | Agent runtime: tool calling loop, state, message handling |
| `@simpletoolsindiaorg/ai-coding-agent` | The interactive coding agent CLI — the `ai` binary |
| `@simpletoolsindiaorg/ai-tui` | Terminal UI library (differential rendering, keybinding system) |

The agent session is a state machine: `user message → tool calls → tool results → assistant message → repeat`. The TUI renders the conversation in a streaming fashion and lets you interrupt, branch, and edit the message log at any point.

Read [AGENTS.md](AGENTS.md) for a deep dive into the codebase.

## License

MIT. See [LICENSE](LICENSE) for the full text and [NOTICE.md](NOTICE.md) for attribution.

## Support

- **Issues:** https://github.com/simpletoolsindia/ai/issues
- **Docs:** this README + [AGENTS.md](AGENTS.md)
- **Examples:** `packages/coding-agent/examples/extensions/` for the extension SDK
