# Stack-Scouting Subagents

Parallel investigation agents that split a question across the full stack — backend, database, frontend, infrastructure, tests, security, configuration — and return compressed, structured findings for synthesis. A meta-agent (router) can also pick the right scouts automatically.

## How it works

The existing subagent extension (symlinked into `~/.ai/agent/extensions/subagent/`) spawns a separate `ai` process per subagent, each with its own context window. The 7 project agents in `.ai/agents/` are loaded with `agentScope: "both"` and dispatched in parallel (max 8 tasks, 4 concurrent).

## Agents (project-local, in `.ai/agents/`)

| Agent | Scope | Model | Effort tier |
|-------|-------|-------|-------------|
| `backend-scout` | APIs, services, middleware, business logic | `granite4.1:8b` | High (8B params, for layered architecture) |
| `db-scout` | Schemas, migrations, ORM models, queries | `granite4.1:8b` | High (reads full schema files, traces query chains) |
| `frontend-scout` | Pages, components, state, data fetching | `gemma4:latest` | Medium (component + state-flow reading) |
| `infra-scout` | Dockerfiles, CI, IaC, deploy scripts, build | `gemma4:latest` | Medium (multi-file config tracing) |
| `tests-scout` | Test files, fixtures, mocking, coverage | `gemma4:latest` | Medium (test pattern + coverage mapping) |
| `security-scout` | Auth, secrets, validation, crypto, deps | `granite4.1:8b` | High (subtle vulnerability tracing) |
| `config-scout` | Env vars, config files, feature flags | `gemma4:latest` | Medium (config merge order + schema) |
| `router-scout` | Meta: picks which scouts to dispatch | `granite4.1:8b` | Decision-making only, doesn't investigate |

### Model tiering rationale

`granite4.1:8b` (largest local) for scouts whose domains need deep reading of layered architecture, full schema files, and subtle auth flow tracing. `gemma4:latest` (mid-size) for scouts whose domains are more about pattern recognition (component structure, test patterns, build configs, config layouts).

For trivial lookups ("does X exist?"), all models short-circuit via targeted grep and don't use their full capability. The "high effort" capability is reserved for when the question actually requires it.

## Workflow prompts (in `.ai/prompts/`)

### Single-area scouts

| Prompt | What it does |
|--------|--------------|
| `/scout-backend <q>` | Single backend scout |
| `/scout-db <q>` | Single database scout |
| `/scout-frontend <q>` | Single frontend scout |
| `/scout-infra <q>` | Single infrastructure scout |
| `/scout-tests <q>` | Single tests scout |
| `/scout-security <q>` | Single security scout (severity-tagged findings) |
| `/scout-config <q>` | Single config scout |

### Multi-area stacks (parallel dispatch)

| Prompt | What it does |
|--------|--------------|
| `/scout-stack <q>` | **3-way parallel** — backend, db, frontend. Fast. |
| `/scout-stack-full <q>` | **5-way parallel** — backend, db, frontend, infra, tests. Thorough. |
| `/scout-stack-auto <q>` | **2-phase** — router-scout picks the right scouts, then dispatches in parallel. Flexible. |

### Memory

| Prompt | What it does |
|--------|--------------|
| `/scout-save <slug>` | Save the most recent scout findings to `.ai/agents/.findings/<slug>.md` for cross-session memory. |

## Usage

From inside the ai TUI, with cwd at `/Users/sridhar/ai` (or any subdirectory — the extension walks up to find `.ai/agents/`):

```
/scout-stack how does authentication work?
/scout-stack-full trace the build pipeline
/scout-stack-auto the cart page is slow, find out why
/scout-security audit the auth flow for vulnerabilities
/scout-backend where is rate limiting implemented?
/scout-save auth-audit
```

After a `/scout-*` completes, you can call `/scout-save <slug>` to persist the findings. Next time you ask a related question, prepend "read `.ai/agents/.findings/<slug>.md` first" to give the scouts prior context.

The first time you run any of these, ai will **prompt for confirmation** because `.ai/agents/*.md` are project-local (repo-controlled prompts that could instruct the model to read files or run bash). This is the example extension's safety default and is appropriate for a workspace you control.

## When to use which prompt

| Question type | Prompt |
|---------------|--------|
| "How does X work?" — feature explanation | `/scout-stack` (3-way) |
| "Explain the whole system" / "do a deep dive" | `/scout-stack-full` (5-way) |
| Open-ended investigation, unsure which area | `/scout-stack-auto` (router) |
| "Is this secure?" / "audit the auth" | `/scout-security` |
| "How is X tested?" / "is X covered?" | `/scout-tests` |
| "How do I deploy this?" / "how is it built?" | `/scout-infra` |
| "What env vars does X need?" / "how is X configured?" | `/scout-config` |
| Want to remember findings for later | `/scout-save <slug>` |

## The router-scout in detail

`router-scout` is a meta-agent that does NOT investigate. It reads the question and returns a JSON dispatch plan like:

```json
{
  "scouts": [
    { "name": "security-scout", "thoroughness": "thorough", "task": "..." },
    { "name": "backend-scout", "thoroughness": "medium", "task": "..." }
  ],
  "rationale": "Auth question touches security, backend routes, and config keys."
}
```

Then the parent agent calls those scouts in parallel using the `tasks` parameter. The two-phase approach costs slightly more total time (router first) but picks the right scouts automatically.

## Adding a new scout area

Drop a new `.md` file in `.ai/agents/`:

```markdown
---
name: my-area-scout
description: What this agent investigates
tools: read, grep, find, ls, bash
model: <model-id-from-your-models.json>
---

You are a my-area scout. ...

## Scope
...

## Model: <effort tier>
When to use the full capability vs. short-circuiting.

## Strategy
...

## Output format
## Files Retrieved
...
```

Then either:
- Create a new `/scout-my-area` prompt that calls it directly
- Or update the router-scout's "Available scouts" section so `/scout-stack-auto` knows about it

## Cross-session memory

Findings saved with `/scout-save` go to `.ai/agents/.findings/<slug>.md`. These are plain markdown files. Conventions:

- One file per investigation topic
- Slug is `[a-z0-9-]+`
- Filename: `<slug>.md`, `<slug>-v2.md` for revisions
- Use git to track changes
- After 30 days, consider whether findings are still relevant (the code may have moved on)

## Limitations

- Output truncated to last 10 items in collapsed view (Ctrl+O to expand).
- Parallel model-visible output capped at 50 KB per task; full results remain in tool details.
- The subagent extension's max is 8 tasks / 4 concurrent. `/scout-stack-full` uses 5, `/scout-stack-auto` may use up to 7. All within the cap.
- Local Ollama models are slower than the cloud Haiku/Sonnet the example agents assume; expect the parallel dispatch to take noticeably longer than cloud-only setups. The trade-off is no data leaves your machine.
- Subagent memory (`/scout-save`) is opt-in. Findings don't auto-persist; you must call `/scout-save` explicitly.
