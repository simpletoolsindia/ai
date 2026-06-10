---
description: Save the most recent scout findings to .ai/agents/.findings/ for cross-session memory. Use after any /scout-* prompt completes.
argument-hint: "<topic-slug-for-filename>"
---

When this prompt is called, the calling agent should write a structured summary of the most recent scout investigation(s) to a file in `.ai/agents/.findings/`.

## File location

`$ARGUMENTS` is the topic slug for the filename. Write to:

`.ai/agents/.findings/<slug>.md`

Where `<slug>` is `$ARGUMENTS` with spaces replaced by hyphens, lowercased, and stripped of anything that's not `[a-z0-9-]`.

If the slug is empty, use `latest` as the filename.

## File format

```markdown
# <topic>

**Recorded:** <ISO 8601 date, e.g. 2024-06-15>
**Scouts invoked:** <comma-separated list, e.g. "backend-scout, db-scout, frontend-scout">
**Question:** <the original question that was investigated>

## Summary

<2-3 sentence TL;DR of the most important findings.>

## Key files

<Bulleted list of the most important file:line references, with one-line description of each.>

## Findings

<Structured findings organized by topic. Use h3 headings. Include code snippets where relevant.>

## Cross-references

<Any relationships between findings — e.g. "the endpoint in backend-scout's findings uses the schema from db-scout's findings">

## Open questions

<Anything the investigation didn't fully answer, or that the next investigation should focus on.>
```

## Why this exists

Future /scout-* invocations can read these files first (with the read tool) to avoid re-investigating the same areas. A scout prompt can be augmented with "first read .ai/agents/.findings/<topic>.md to leverage prior findings, then investigate what's changed or missing".

## Maintenance

- Files older than 30 days are candidates for archival or deletion
- Before writing a new file with the same slug, read the existing one and either replace it (if the new investigation supersedes it) or write a new file with a versioned slug like `<slug>-v2.md`
- To list existing findings: `ls .ai/agents/.findings/`
