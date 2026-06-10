---
description: Auto-dispatch — let the router-scout decide which domain scouts to invoke, then call them in parallel. Use for open-ended investigation questions.
argument-hint: "<question-or-topic-to-investigate>"
---

Use the subagent tool to invoke the `router-scout` first. The router will return a JSON dispatch plan describing which scouts to call and what each should investigate. Then call those scouts in parallel using the `tasks` parameter.

## Task

$ARGUMENTS

## Two-phase dispatch

### Phase 1: ask the router

```
subagent({
  agentScope: "both",
  agent: "router-scout",
  task: "Decide which scouts to dispatch for this question. Return a JSON object only, no prose. The JSON has shape: { scouts: [{ name, thoroughness, task }, ...], rationale: '...' }. The user's question is: $ARGUMENTS"
})
```

The router will return a JSON object like:

```json
{
  "scouts": [
    { "name": "backend-scout", "thoroughness": "medium", "task": "..." },
    { "name": "db-scout", "thoroughness": "medium", "task": "..." }
  ],
  "rationale": "..."
}
```

Parse the JSON and use the `scouts` array for phase 2.

### Phase 2: parallel dispatch

```
subagent({
  agentScope: "both",
  tasks: [
    { agent: "<scout1.name>", task: "<scout1.task>" },
    { agent: "<scout2.name>", task: "<scout2.task>" },
    ...
  ]
})
```

### Phase 3: synthesize

After the parallel scouts return, synthesize their findings:
1. Cross-reference — note where multiple scouts touch the same files/areas
2. Identify gaps — if the router missed an area the user might care about, mention it
3. Give the user a unified answer with file:line references
4. Note the router's rationale was: <router's rationale>

## When to use this vs. /scout-stack

- `/scout-stack` — hardcoded: backend, db, frontend in parallel. Good for "explain this feature" questions.
- `/scout-stack-full` — hardcoded: backend, db, frontend, infra, tests. Good for "explain the whole project" questions.
- `/scout-stack-auto` — this one, let the router pick. Good for open-ended questions where you don't know which areas matter.

## Limitations

- Two-phase dispatch costs more total time (router first, then scouts) but picks the right scouts automatically
- Router is a single LLM call; if it picks wrong scouts, you can re-run with `/scout-stack` or `/scout-stack-full` instead
- Router may dispatch up to 4-7 scouts; if too many, the parallel call may hit subagent's max parallel limit (8)
