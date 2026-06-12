# NOTICE

`ai` is released under the MIT License. The full license text is in [LICENSE](LICENSE).

## Third-party components

`ai` includes vendor JavaScript for HTML-to-PDF export in `packages/coding-agent/src/core/export-html/vendor/`. Each file retains its original license header.

`ai` also ships the `context-mode` MCP server bundle (a single-file ESM build) at `packages/coding-agent/src/core/extensions/built-in/context-mode/mcp-server/server.bundle.mjs`. It is from [mksglu/context-mode](https://github.com/mksglu/context-mode) and is licensed under the **Elastic License v2.0** (ELv2). The full text is in `packages/coding-agent/src/core/extensions/built-in/context-mode/THIRD-PARTY/ELv2-LICENSE`. ELv2 is a source-available license: you may use, modify, and redistribute the bundle, but you may not provide it as a managed or hosted service that competes with the original product. The bundle is shipped unmodified.

The `pi-hermes-memory` source code is vendored at `packages/coding-agent/src/core/extensions/built-in/hermes-memory/` under the MIT License. The full text is in `THIRD-PARTY/LICENSE` in that directory.
