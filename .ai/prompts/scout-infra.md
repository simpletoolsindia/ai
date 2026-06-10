---
description: Investigate infrastructure code (Dockerfiles, CI, build config, deploy scripts) using the infra-scout subagent.
argument-hint: "<question-or-topic>"
---

Use the subagent tool with `agentScope: "both"` so project-local agents are loaded.

```
subagent({
  agentScope: "both",
  agent: "infra-scout",
  task: "$ARGUMENTS"
})
```

Summarize the scout's findings for the user. Do NOT implement anything.
