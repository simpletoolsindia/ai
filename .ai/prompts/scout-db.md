---
description: Investigate the database/persistence side of a question using the db-scout subagent.
argument-hint: "<question-or-topic>"
---

Use the subagent tool with `agentScope: "both"` so project-local agents are loaded.

```
subagent({
  agentScope: "both",
  agent: "db-scout",
  task: "$ARGUMENTS"
})
```

Summarize the scout's findings for the user. Do NOT implement anything.
