<div align="center">

# ai

**A self-extensible coding agent for the terminal.**

Read · Run · Edit · Search · Remember

[![npm version](https://img.shields.io/npm/v/@simpletoolsindiaorg/ai-coding-agent.svg?label=version)](https://www.npmjs.com/package/@simpletoolsindiaorg/ai-coding-agent)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node >= 22.19](https://img.shields.io/badge/node-%3E%3D22.19-brightgreen.svg)](https://nodejs.org)

[**Website & Docs**](https://simpletoolsindia.github.io/ai/) · [Install](#install) · [Features](#features) · [Commands](#commands)

```bash
curl -fsSL https://raw.githubusercontent.com/simpletoolsindia/ai/main/install.sh | bash
```

</div>

---

## What is ai?

`ai` is a terminal-native coding agent that reads your project, edits files, runs shell commands, and queries the web — all in a single agent loop, with full session history you can replay, branch, fork, and resume. Pluggable models (Ollama, Anthropic, OpenAI, Bedrock, Groq, …). Persistent memory across sessions. Sandboxed tools. PLAN/EXECUTE modes for safe exploration. Web search and fetch built in. **No SaaS, no cloud relay, no data leaving your machine unless you ask.**

```
  █████   ██╗     ai v0.81.0
 ██╔══██  ██║     a coding agent for the terminal
 ███████  ██║     reads, runs, writes, remembers
 ██╔══██  ██║     self-extensible · 20+ providers
 ██║  ██  ██║     PLAN-first · Tab to execute
 ╚═╝  ╚═  ╚═╝

  ● PLAN   read-only · press Tab to execute
  Plan     no active plan
  ──────────────────────────────────────────
  esc interrupt  ·  ctrl+c/ctrl+d clear/exit  ·  / commands  ·  ! bash  ·  Tab plan/exec

  Try one of these
  ! Read & refactor   "split auth.ts into a folder, one file per concern"
  ! Debug a test      "why is test_x flaky? trace the imports"
  ! Onboard a repo    "summarize this repo, find entry points, list TODOs"
  ! Add a feature     "add a /stats slash command that shows token usage"
```

It is structured as four focused packages on npm, each independently usable:

| Package | Purpose |
|---|---|
| `@simpletoolsindiaorg/ai-provider` | Model API contracts, streaming, tool-call parsing, 20+ built-in providers |
| `@simpletoolsindiaorg/ai-tui` | Terminal UI primitives: editor, autocomplete, dialogs, keybindings, theming |
| `@simpletoolsindiaorg/ai-agent` | Core agent loop: messages, tools, subagents, telemetry, prompt caching |
| `@simpletoolsindiaorg/ai-coding-agent` | The `ai` CLI: slash commands, settings, mode, extensions, hermes-memory |

---

## Install

The one-liner downloads, builds, links the binary, and appends the path to your shell rc:

```bash
curl -fsSL https://raw.githubusercontent.com/simpletoolsindia/ai/main/install.sh | bash
```

Or from npm (no source tree, faster):

```bash
npm install -g @simpletoolsindiaorg/ai-coding-agent
npm rebuild -g better-sqlite3
```

Requirements: **Node 22+**, **macOS or Linux** (Windows works under WSL2). Full guide: [simpletoolsindia.github.io/ai/install](https://simpletoolsindia.github.io/ai/install).

## Uninstall

```bash
curl -fsSL https://raw.githubusercontent.com/simpletoolsindia/ai/main/uninstall.sh | bash
# Or: bash uninstall.sh --force  (non-interactive)
```
This removes the binary, npm package, and all user data (~/.ai/).

---

## Quick start

```bash
$ ai
# A polished welcome panel appears with the current mode, model, working
# directory, and a live plan progress bar.
# Default mode is PLAN — the model can only read, search, and propose a plan.
# Press Tab to switch to EXECUTE.

> add a /help slash command to the slash-command table
[PLAN]  read packages/coding-agent/src/core/slash-commands.ts
[PLAN]  draft a plan via the todo tool: 4 items

Plan ready — press Tab (or run /mode execute) to start applying the plan.

# Press Tab. Now the model is in EXECUTE mode and works through the todos.

[EXECUTE]  edit slash-commands.ts
[EXECUTE]  edit interactive-mode.ts (handleHelpCommand)
[EXECUTE]  npm test  →  362 passed
✓ Done. /help now lists every command.
```

That's the whole loop: **prompt → plan → apply → verify**, with the active plan visible in the sticky todo list at the bottom of the screen as the agent works through it.

---

## Features

- **🛡️ PLAN by default** — every new session starts in read-only PLAN mode. The model can only read, search, and propose a plan. Press <kbd>Tab</kbd> to switch to EXECUTE and let it write.
- **🔌 Self-extensible** — drop a TypeScript file in `extensions/` and you have a new slash command, tool, or message renderer.
- **🌐 20+ providers out of the box** — Anthropic, OpenAI, Google, Mistral, Bedrock, Groq, Together, Fireworks, LM Studio, vLLM, Ollama (auto-discovered).
- **🔍 Web search & fetch** — built-in `websearch` via SearXNG (configurable), `webfetch` for any URL.
- **🧠 Hermes persistent memory** — optional built-in extension that records what the agent learns and surfaces it across sessions, scoped per project.
- **🗜️ Auto-compaction at 90%** — when the context fills, the session compacts itself. Configurable threshold.
- **📦 Subagents & parallel work** — spawn a subagent to investigate while the main agent keeps going. Results merge back.
- **⌨️ Full keyboard control** — every action has a keybinding. Press <kbd>Tab</kbd> to flip mode, <kbd>Ctrl+O</kbd> to expand tool output, <kbd>Ctrl+L</kbd> to pick a model.
- **📝 30+ slash commands** — run `/help` for the full list, or add your own.

See the [features page](https://simpletoolsindia.github.io/ai/features) for the full deep dive.

---

## Commands

Run any command by typing it after `/`. Press <kbd>Tab</kbd> to autocomplete. Run `/help` for a categorized list inside the TUI.

| Command | What it does |
|---|---|
| `/mode` | Switch the agent between PLAN (read-only) and EXECUTE (full tools) |
| `/model` | Open the model picker |
| `/login` | OAuth/API key login, or add a custom OpenAI-compatible provider |
| `/searcheng` | View or update the SearXNG endpoint for `websearch` |
| `/compact` | Manually compact the session context |
| `/export` | Export the current session (json / html / md) |
| `/memory` | Browse or pin hermes-memory entries |
| `/hotkeys` | Show all keyboard shortcuts |
| `/help` | Show all available commands with descriptions |
| `/tree` | Open the session tree picker |
| `/fork` | Create a new fork from a previous user message |

Full list with examples: [simpletoolsindia.github.io/ai/commands](https://simpletoolsindia.github.io/ai/commands).

---

## Keybindings

Defaults can be overridden in `~/.ai/agent/keybindings.json`. Run `/hotkeys` in the TUI for the live reference.

| Key | Action |
|---|---|
| <kbd>Tab</kbd> | Toggle PLAN/EXECUTE mode |
| <kbd>Enter</kbd> | Submit message |
| <kbd>Shift+Enter</kbd> | Newline in editor |
| <kbd>Escape</kbd> | Interrupt the current operation |
| <kbd>Ctrl+O</kbd> | Toggle tool output expansion |
| <kbd>Ctrl+L</kbd> | Open model picker |
| <kbd>Ctrl+P</kbd> / <kbd>Shift+Ctrl+P</kbd> | Cycle models forward / backward |
| <kbd>Shift+Tab</kbd> | Cycle thinking level |
| <kbd>Ctrl+T</kbd> | Toggle thinking blocks |
| <kbd>Ctrl+G</kbd> | Open external editor |
| <kbd>Ctrl+C</kbd> | Clear editor (press twice to exit) |
| <kbd>Ctrl+D</kbd> | Exit when editor is empty |
| <kbd>!</kbd> at start | Run a bash command without context |
| <kbd>/</kbd> at start | Open the slash-command picker |

---

## Configuration

All settings live in `~/.ai/agent/settings.json`. The file is created lazily on first run. Project-scoped overrides go in `.ai/settings.json` (only loaded when the project is trusted).

```json
{
  "agentMode": "plan",
  "defaultProvider": "ollama",
  "defaultModel": "gemma4:e2b",
  "compaction": {
    "enabled": true,
    "threshold": 0.9,
    "reserveTokens": 16384,
    "keepRecentTokens": 20000
  },
  "enabledModels": ["ollama/gemma4:e2b"]
}
```

| Key | Default | What it does |
|---|---|---|
| `agentMode` | `"plan"` | Read-only by default. Use `"execute"` to skip the gate. |
| `defaultProvider` | — | Last provider you used (auto-set on model pick). |
| `defaultModel` | — | Last model id you used (auto-set on model pick). |
| `enabledModels` | — | Array of `provider/modelId` patterns. Used as the default when no `--model` is passed. |
| `compaction.threshold` | `0.9` | Compact when the context is 90% full. |
| `compaction.reserveTokens` | `16384` | Reserve for the next turn. |
| `compaction.keepRecentTokens` | `20000` | Most-recent tokens always preserved verbatim. |
| `quietStartup` | `false` | Suppress the welcome screen (still expandable with <kbd>Ctrl+O</kbd>). |
| `theme` | `"dark"` | `dark` or `light`. |

Full reference: [simpletoolsindia.github.io/ai/configuration](https://simpletoolsindia.github.io/ai/configuration).

---

## Adding a custom provider

The fastest path is the in-app dialog:

```
/login  →  Add OpenAI-compatible provider
```

A 5-step form asks for the name, base URL, API key, model id, and optional display name. It writes the entry to `~/.ai/agent/models.json` and the API key to `~/.ai/agent/auth.json`, then refreshes the model registry. The new provider shows up in the model picker.

For local Ollama, set `autoDiscover: "ollama"` in `~/.ai/agent/models.json` and the picker auto-populates with whatever your `localhost:11434` is serving.

---

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│                         ai CLI                              │
│  (slash commands, settings, mode, extensions, hermes-memory)│
├────────────────────────────────────────────────────────────┤
│                       ai-agent                              │
│  (core loop: messages, tools, subagents, telemetry)        │
├────────────────────────────────────────────────────────────┤
│                          ai-tui                             │
│  (editor, autocomplete, dialogs, keybindings, theming)      │
├────────────────────────────────────────────────────────────┤
│                       ai-provider                           │
│  (API contracts, streaming, OAuth, 20+ providers)           │
└────────────────────────────────────────────────────────────┘
```

Each layer is published to npm and usable independently. The agent layer has zero UI knowledge. The TUI layer is generic. The provider layer is the only place that knows what a "model" is.

---

## Documentation

- [Install guide](https://simpletoolsindia.github.io/ai/install)
- [Features](https://simpletoolsindia.github.io/ai/features)
- [Commands reference](https://simpletoolsindia.github.io/ai/commands)
- [Configuration reference](https://simpletoolsindia.github.io/ai/configuration)
- [Troubleshooting](https://simpletoolsindia.github.io/ai/troubleshooting)
- [Changelog](https://simpletoolsindia.github.io/ai/changelog)

Source: [github.com/simpletoolsindia/ai](https://github.com/simpletoolsindia/ai)

---

## License

MIT © 2026 simpletoolsindia. See [LICENSE](LICENSE).

A fork of [pi](https://github.com/earendil-works/pi) by Mario Zechner / earendil-works. See [NOTICE.md](NOTICE.md) for the full attribution.
