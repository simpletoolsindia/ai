# Contributing to ai

ai is a fork of [pi](https://github.com/earendil-works/pi) by Mario Zechner / earendil-works. We welcome bug reports, fixes, and improvements that are specific to this fork.

> **Most changes should go upstream first.** If you find a bug in the agent loop, a tool, a provider, the TUI, or the extension system, the right place to fix it is the upstream [earendil-works/pi](https://github.com/earendil-works/pi) repository. After the upstream fix lands, this fork can be rebased onto it. We do not want to maintain a long-lived divergence from upstream.

## What belongs in this fork vs. upstream

**Belongs in this fork (small, focused):**
- Renaming and re-branding bugs (e.g. a user-facing string still says "pi")
- Renaming and re-branding the new package names (`@simpletoolsindiaorg/ai-*`)
- Bugs in the placeholder endpoint handling (`api.simpletoolsindiaorg.invalid`)
- Fork-specific config or docs

**Belongs upstream first:**
- Anything in the agent loop, compaction, session management
- Tool definitions (`read`, `bash`, `edit`, `write`, etc.)
- Provider implementations
- The TUI engine
- The extension system internals
- Security and supply-chain hardening

## Filing issues

- **Auto-closing:** New issues and PRs from new contributors are auto-closed by default. Maintainers review auto-closed issues regularly.
- **Search first:** Check if the issue exists in upstream's issue tracker. If yes, comment there instead.

## Filing pull requests

- Keep changes small and focused. Multiple unrelated changes should be in separate PRs.
- Follow the code style enforced by `npm run check` (Biome formatter, TypeScript checks).
- Do not edit generated files (`dist/`, `npm-shrinkwrap.json`) directly — they regenerate from source.
- Do not commit `package-lock.json` unless `PI_ALLOW_LOCKFILE_CHANGE=1` is set (yes, the env var is named `PI_` for back-compat with upstream's tooling).
- Do not introduce dependencies on lifecycle scripts without a security review.

## Running the project

```bash
npm install --ignore-scripts
npm run build
npm run check
./test.sh
./ai-test.sh    # runs the ai CLI from sources
```

## Development rules

The development rules in `AGENTS.md` apply to this fork unchanged.

## Code of conduct

Be respectful. No harassment, no personal attacks. Technical disagreement is welcome; rudeness is not.
