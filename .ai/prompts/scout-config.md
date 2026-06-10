---
description: Investigate configuration code (env vars, config files, feature flags) using the config-scout subagent.
argument-hint: "<question-or-topic>"
---

Use the subagent tool with `agentScope: "both"` so project-local agents are loaded.

```
subagent({
  agentScope: "both",
  agent: "config-scout",
  task: "$ARGUMENTS"
})
```

Summarize the scout's findings for the user. Do NOT implement anything.
