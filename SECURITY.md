# Security policy

The `ai` agent runs with the permissions of the user and process that launched it. By default, it has full read/write/execute access to the filesystem, network, and credentials of the running user. This is by design — extensions, skills, and prompt templates are powerful, and there is no built-in permission system.

**Treat `ai` extensions, themes, skills, and prompt templates as executable code.** Files in those locations can instruct the model to read your files, run shell commands, exfiltrate data, or take other actions. Only install them from sources you trust.

## Reporting a vulnerability

Email the address listed in the GitHub repository's security contact. Please include:

- A description of the vulnerability and its impact
- Steps to reproduce (or a minimal repro repo)
- Affected versions
- Any context that helps triage (OS, Node version, model provider, installed extensions)

We aim to acknowledge within 3 business days and ship a fix or mitigation within 30 days, depending on severity.

## Threat model

The threat model for `ai` is the same as for a shell, an editor, or a build tool. The user is expected to be the source of trust. Anything that runs in user space, can read user files, and can spawn subprocesses is in the threat model.

Specifically, `ai` reads and writes:

- `~/.ai/agent/` (user-level config, models, auth, sessions, extensions, skills, themes)
- `~/.ai/agent/models.json`, `~/.ai/agent/auth.json`, `~/.ai/agent/settings.json`, `~/.ai/agent/trust.json`
- Workspace files (cwd and ancestors)
- `AGENTS.md`, `CLAUDE.md` (project instructions)
- `.ai/` directories in the project (settings, extensions, skills, prompts)
- Anything reachable via the `bash`, `read`, `write`, `edit`, `find`, `grep`, `ls`, `websearch`, `webfetch` tools

If your threat model excludes any of these, containerize or sandbox `ai`. See `docs/containerization.md` for three patterns (OpenShell, Gondolin, plain Docker).

## Network egress

`websearch` and `webfetch` are opt-in (you can disable them per-session with `--no-builtin-tools` or similar flags). They are not blocked from `localhost` or private IPs by default — only point them at endpoints you trust.

## Supply-chain hardening

- Direct external dependencies are pinned to exact versions
- `.npmrc` sets `save-exact=true` and `min-release-age=2`
- `package-lock.json` is the dependency ground truth
- CI uses `npm ci --ignore-scripts`
- A scheduled audit runs `npm audit --omit=dev` and `npm audit signatures --omit=dev`
- Lifecycle scripts require an explicit allowlist; new lifecycle-script deps fail checks

## Out of scope

The following are not considered security vulnerabilities:

- Behavior of extensions or skills installed by the user
- Behavior of the model itself (prompt injection, jailbreaks, etc.)
- Local privilege escalation that requires the user to have already run `ai` with the relevant permissions
- Resource exhaustion that requires local control to induce
