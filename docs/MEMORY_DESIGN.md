# Local Memory Design

## Goal

Reduce repeated context tokens without storing transcripts or injecting an ever-growing memory file on every turn.

## Memory tiers

1. **Routing telemetry** — content-free observations of provider/model, task category, outcome, tokens, latency, and cost.
2. **Pi session compaction** — the primary mechanism for compressing active conversation history.
3. **Task memory** — optional concise facts loaded only when relevant.

## Task-memory schema

A task-memory entry may contain:

- project-scoped opaque identifier
- task category and timestamp
- concise decisions and rationale
- repository-relative file paths changed
- validation commands and outcomes
- blockers and next steps
- expiry and importance

It must not contain raw prompts, responses, source files, tool output, credentials, HTTP headers, environment values, vulnerability disclosure details, or personal data by default.

## Token policy

- Never inject the complete memory store.
- Estimate retrieval token cost before injection.
- Retrieve by project, task category, recency, and explicit tags.
- Deduplicate stable facts.
- Cap entries returned, characters per entry, and aggregate estimated tokens.
- Prefer a short durable fact over a narrative summary.
- If confidence is low, inject nothing and let Pi use current context.

## Storage policy

- Disabled by default because it contains user/project-authored content.
- Store beneath the configured local data directory, outside Git.
- Use atomic writes and owner-only permissions where supported.
- Provide inspect, edit, compact, export, and clear operations.
- Apply retention and maximum-size limits.
- Reject secret-like material before writing.
- Never synchronize or upload memory automatically.

## Compaction interaction

Compaction runs only after `agent_settled`, when Pi is idle and has no queued messages. Before future custom compaction is enabled, its summary quality must be tested against Pi's native compaction. Task memory is supplementary and must not replace the authoritative Git working tree, tests, issue tracker, or session history.
