---
description: Full-stack scout — fans out backend, db, frontend, infra, and tests scouts in parallel. Use for comprehensive questions that touch all areas of the codebase.
argument-hint: "<question-or-topic-to-investigate>"
---

Use the subagent tool with the `tasks` parameter to dispatch FIVE scouts in parallel. Set `agentScope: "both"` so project-local agents in `.ai/agents/` are loaded.

Each scout returns compressed, structured findings. Synthesize their outputs into one unified answer that highlights cross-area relationships.

## Task

$ARGUMENTS

## Dispatch

```
subagent({
  agentScope: "both",
  tasks: [
    {
      agent: "backend-scout",
      task: "Investigate the backend / API / service-layer side of: $ARGUMENTS\n\nReturn: relevant endpoints, services, middleware with file:line refs, key handler signatures, the request lifecycle for this concern, and a 'start here' recommendation."
    },
    {
      agent: "db-scout",
      task: "Investigate the database / persistence side of: $ARGUMENTS\n\nReturn: relevant schema/models/tables with file:line refs, the actual model definitions, the queries used by the relevant backend code, recent migrations touching these tables, and a 'start here' recommendation."
    },
    {
      agent: "frontend-scout",
      task: "Investigate the frontend side of: $ARGUMENTS\n\nReturn: relevant pages/components/stores with file:line refs, key component signatures, the data-fetching/state-management flow, and a 'start here' recommendation."
    },
    {
      agent: "infra-scout",
      task: "Investigate the build / deploy / CI side of: $ARGUMENTS\n\nReturn: relevant Dockerfile, CI workflow, build config with file:line refs, the pipeline summary, env vars / secrets needed, and a 'start here' recommendation."
    },
    {
      agent: "tests-scout",
      task: "Investigate the test coverage for: $ARGUMENTS\n\nReturn: relevant test files with file:line refs, the testing pattern used, fixtures/mocks, a coverage map of what IS and ISN'T tested, and a 'start here' recommendation."
    }
  ]
})
```

## After all five return

1. Cross-reference findings — note where backend and db point to the same file, where frontend's data-fetching calls into backend endpoints the backend-scout found, where infra's build commands reference packages the backend-scout found, etc.
2. Identify gaps — if any scout returned little, that area might be thin or the question didn't apply to it; say so.
3. Give the user a unified answer that links findings across all five areas, with the most important file:line references up top.
4. Suggest a "start here" reading order spanning the areas that matter for the question.

Do NOT implement anything. This is a recon workflow only.

## When to use /scout-stack-full vs /scout-stack

- `/scout-stack` (no -full) — dispatches only backend, db, frontend. Faster, narrower.
- `/scout-stack-full` — this one, dispatches all 5. Use when the question is "explain the whole system", "do a deep dive", or you specifically need to know about build/test alongside code.
