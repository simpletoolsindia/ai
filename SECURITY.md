# Security policy

This is the security policy for **ai** (a fork of [pi](https://github.com/earendil-works/pi) by Mario Zechner / earendil-works). For upstream's security policy, see [earendil-works/pi/security](https://github.com/earendil-works/pi/security).

The ai agent runs with the permissions of the user and process that launched it. By default, it has full read/write/execute access to the filesystem, network, and credentials of the running user. This is by design — extensions, skills, and prompt templates are powerful, and there is no built-in permission system.

You should only install ai extensions, themes, skills, and only use ai within trusted repositories. This is because files in those locations can contain prompts that instruct the model to read your files, run shell commands, exfiltrate data, or take other actions. Treat these files as executable code that the model will follow.

## Reporting a vulnerability in this fork

If you believe you found a security vulnerability in **this fork** (the `simpletoolsindiaorg/ai` repo), please email the address in the GitHub repository's security contact.

Please include:

- A description of the vulnerability and its impact
- Steps to reproduce
- Affected versions
- Whether the issue also affects the upstream `pi` project (if so, please also report it upstream at [earendil-works/pi/security](https://github.com/earendil-works/pi/security) — fixes should land there first when possible)

## Out of scope

The following are not considered security vulnerabilities for this fork, because they are inherited from upstream design and out of scope for the fork's small changes:

- Behavior of ai extensions or skills installed by the user
- Behavior of the model itself (prompt injection, jailbreaks, etc.)
- Local privilege escalation that requires the user to have already run ai with the relevant permissions
- Resource exhaustion that requires local control to induce
- Issues that affect only the upstream `pi` project (report those upstream)

## Threat model

The threat model for ai is the same as for a shell, an editor, or a build tool. The user is expected to be the source of trust. Anything that runs in user space, can read user files, and can spawn subprocesses is in the threat model.

Specifically, ai reads and writes:
- `~/.ai/agent/` (user-level config, models, auth, sessions, extensions, skills, themes)
- `~/.ai/agent/models.json`, `~/.ai/agent/auth.json`, `~/.ai/agent/settings.json`, `~/.ai/agent/trust.json`
- Workspace files (cwd and ancestors)
- `AGENTS.md`, `CLAUDE.md` (project instructions)
- `.ai/` directories in the project (settings, extensions, skills, prompts)
- Anything reachable via `bash`, `read`, `write`, `edit`, `find`, `grep`, `ls` tools

If your threat model excludes any of these, containerize or sandbox ai. See the upstream `containerization.md` for three patterns (OpenShell, Gondolin, plain Docker) that apply to this fork unchanged.

## Supply-chain hardening

This fork preserves the upstream's supply-chain posture:

- Direct external dependencies are pinned to exact versions
- `.npmrc` sets `save-exact=true` and `min-release-age=2`
- `package-lock.json` is the dependency ground truth
- CI uses `npm ci --ignore-scripts`
- A scheduled audit runs `npm audit --omit=dev` and `npm audit signatures --omit=dev`
- Lifecycle scripts require an explicit allowlist; new lifecycle-script deps fail checks
