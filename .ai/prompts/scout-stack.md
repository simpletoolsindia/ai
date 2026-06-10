---
description: Fan out backend-scout, db-scout, and frontend-scout in parallel to investigate a question across the full stack simultaneously.
argument-hint: "<question-or-topic-to-investigate>"
---

Use the subagent tool with the `tasks` parameter to dispatch three scouts in parallel. Set `agentScope: "both"` so project-local agents in `.pi/agents/` are loaded.

Each scout returns compressed, structured findings (files retrieved, key code, architecture, "start here"). Synthesize their outputs into a single answer for the user.

## Task

$ARGUMENTS

## Dispatch

```
subagent({
  agentScope: "both",
  tasks: [
    {
      agent: "backend-scout",
      task: "Investigate the backend side of: $ARGUMENTS\n\nReturn: relevant endpoints/services/middleware with file:line refs, key handler signatures, the request lifecycle for this concern, and a 'start here' recommendation."
    },
    {
      agent: "db-scout",
      task: "Investigate the database/persistence side of: $ARGUMENTS\n\nReturn: relevant schema/models/tables with file:line refs, the actual model definitions, the queries used by the relevant backend code, recent migrations touching these tables, and a 'start here' recommendation."
    },
    {
      agent: "frontend-scout",
      task: "Investigate the frontend side of: $ARGUMENTS\n\nReturn: relevant pages/components/stores with file:line refs, key component signatures, the data-fetching/state-management flow, and a 'start here' recommendation."
    }
  ]
})
```

## After all three return

1. Cross-reference findings — note where backend and db point to the same file, where frontend's data-fetching calls into backend endpoints the backend-scout found, etc.
2. Identify gaps — if one scout returned little, that area might be thin or the question didn't apply to it; say so.
3. Give the user a unified answer that links findings across the stack, with the most important file:line references up top.
4. Suggest a "start here" reading order spanning all three areas.

Do NOT implement anything. This is a recon workflow only.
