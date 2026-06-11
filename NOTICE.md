# NOTICE

`ai` is released under the MIT License. The full license text is in [LICENSE](LICENSE).

## Attribution

`ai` incorporates and builds on the design and code of the [pi](https://github.com/earendil-works/pi) self-extensible coding agent by **Mario Zechner / earendil-works** (MIT, Copyright (c) 2025 Mario Zechner). We are grateful to the upstream project and its maintainer.

Specifically, `ai` carries over from the upstream project:

- The four-package monorepo structure (`provider` / `agent` / `tui` / `coding-agent`)
- The agent loop, tool execution model, and session manager
- The TUI rendering engine and keybinding system
- The provider abstraction (Anthropic, OpenAI, Google, Bedrock, etc.)
- The extension lifecycle, subagent spawn pattern, and skill discovery rules

The original license and copyright are preserved in [LICENSE](LICENSE).

## Re-branding only

In addition to the upstream code, `ai` introduces product-identity renames (package scope `@simpletoolsindiaorg/ai-*`, binary name `ai`, config directory `~/.ai/agent/`) and a small set of additive features:

- Built-in `websearch` and `webfetch` tools
- Built-in `subagent` tool with parallel/chain modes
- Built-in `todo` tool with a TUI overlay
- Ollama local model auto-discovery (`autoDiscover: "ollama"`)
- Local-server auth skip (`optionalApiKey: true`)
- Auto-derive a skill `description` from its first heading
- Markdown / JSON session export
- Skip Windows builds in CI

Behavior, public TypeScript types, and the agent loop are intentionally identical to the upstream code where they overlap. Any divergence is a bug.

## Third-party components

`ai` includes vendor JavaScript for HTML-to-PDF export in `packages/coding-agent/src/core/export-html/vendor/`. Each file retains its original license header.
