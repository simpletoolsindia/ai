# Contributing to ai

Thanks for your interest in improving `ai`. Bug reports, fixes, and small focused improvements are welcome.

## Code of conduct

Be respectful. No harassment, no personal attacks. Technical disagreement is welcome; rudeness is not.

## Filing issues

- Search first. Check the existing issue tracker to avoid duplicates.
- Include: a clear description, steps to reproduce, expected vs. actual behaviour, and the `ai --version` output.
- For security issues, see [SECURITY.md](SECURITY.md) — do not open a public issue.

## Pull requests

- Keep changes small and focused. Multiple unrelated changes should be in separate PRs.
- Follow the code style enforced by `npm run check` (Biome formatter, TypeScript checks).
- Do not edit generated files (`dist/`, `npm-shrinkwrap.json`) directly — they regenerate from source.
- Add or update tests for any behavior change. The bar is: every behavior the user can observe has at least one test.

## Running the project

```bash
git clone https://github.com/simpletoolsindia/ai.git
cd ai
npm install --ignore-scripts
npm run build
npm run check
./test.sh
```

`./test.sh` runs the full vitest suite. Some tests need a live Ollama or SearXNG endpoint and are skipped if unreachable — the rest run on every commit in CI.

## Development rules

Read [AGENTS.md](AGENTS.md) for the codebase map, naming conventions, and contribution ground rules. It is the canonical reference for "where do I put X" in this repo.

## Release process

- Bump `version` in the relevant `packages/*/package.json`.
- Update `CHANGELOG.md` with a one-line summary.
- Tag the commit (`git tag v0.x.y`) and push (`git push --tags`).
- The release workflow builds binaries for macOS and Linux, runs the test suite, and publishes the GitHub release.
