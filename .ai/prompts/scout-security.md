---
description: Audit security-relevant code (auth, secrets, validation, crypto) using the security-scout subagent.
argument-hint: "<question-or-topic>"
---

Use the subagent tool with `agentScope: "both"` so project-local agents are loaded.

```
subagent({
  agentScope: "both",
  agent: "security-scout",
  task: "$ARGUMENTS"
})
```

Summarize the scout's findings, including any severity-tagged issues (CRITICAL/HIGH/MEDIUM/LOW). Do NOT implement anything.
