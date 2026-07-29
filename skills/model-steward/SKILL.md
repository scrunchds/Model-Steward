---
name: model-steward
description: Evaluate, benchmark, and safely route among multiple LLM candidates across cloud, local, and custom Pi providers. Use for model benchmarking, cost/latency/quality comparisons, routing configuration, fallback diagnosis, and skill-aware model selection. Does not proxy traffic or store prompts.
license: PolyForm-Noncommercial-1.0.0
compatibility: Requires Node.js 20+; optional Pi extension integration requires pi coding agent 0.40+; compatible with Command Center task categories.
---

# Model Steward

Model Steward is a local-first evaluation and routing skill. It compares **provider/model pairs**, not providers as a single unit.

## Use this skill when

- comparing models by quality, latency, cost, or reliability
- designing or reviewing routing and fallback behavior
- validating config files for Model Steward or Command Center integration
- diagnosing why a candidate was rejected or why a route changed
- choosing the best candidate inside a **specific task category**
- refreshing or assessing pricing snapshots from public metadata sources

## Core rules

1. Keep prompts, responses, credentials, and source code out of telemetry.
2. Never proxy traffic, intercept TLS, or rewrite provider requests.
3. Start in `observe` mode unless the user explicitly wants routing or `auto` inference.
4. Keep Pi's current model as the terminal fallback.
5. Treat unknown or stale pricing as unknown, not free.
6. High-risk work may only use `highRiskAllowlist` entries.
7. New candidates should remain disabled unless explicitly approved.
8. For Command Center integrations, prefer the requested task category first, then the best eligible candidate inside that category.

## Decision process

When evaluating candidates, apply this order:

1. Respect the requested task category, if provided.
2. Filter to candidates that are eligible for the task.
3. Prefer the best candidate within the same category or workflow profile.
4. Use freshness-aware pricing only when the snapshot is still valid.
5. Preserve the current model on a tie when configured.
6. Fall back to Pi's current model if no candidate can be selected.
7. In `auto` mode, infer the task category first, then apply the same selection rules.

## Command Center task categories

Command Center may request one of these task types for a workflow or subtask:

- `coding` — implementation, code edits, structural changes, and tool-heavy work
- `vision` — multimodal or image-aware tasks
- `reading` — summarization, retrieval, analysis, and long-context review
- `reasoning` — planning, orchestration, multi-step decision making, and ReAct work
- `fast` — short-turn utility, lookup, and low-latency responses

If a candidate declares `taskTypes`, treat them as preferred categories. If the requested type has no eligible match, expand to the broader eligible pool rather than failing immediately.

## Workflow tags and soft bias

`workflowTags` are soft preferences, not hard requirements. Use them to improve ranking when multiple candidates are otherwise close.

Examples:

- `implementation`, `security` → coding or reasoning-heavy candidates
- `debugging`, `review` → fast, reasoning, or coding candidates
- `reading`, `research` → long-context readers
- `vision`, `multimodal` → image-capable candidates

## Candidate shape

A candidate is a distinct `provider/model` pair.

Recommended fields:

```json
{
  "provider": "openrouter",
  "model": "anthropic/claude-sonnet",
  "enabled": true,
  "taskTypes": ["reasoning", "coding"],
  "workflowTags": ["implementation", "general"],
  "tags": ["cloud", "general"],
  "supportsTools": true
}
```

## Pricing guidance

- Remote pricing refresh is explicit and optional.
- Use validated public metadata only.
- Prefer last-known-good snapshots over ad hoc guesses.
- Do not apply stale snapshots as if they were current market data.
- Unknown cost should remain unknown in the explanation and score.

## Output expectations

When answering as a skill assistant, be concise and action-oriented.

Prefer outputs in one of these forms:

- a configuration recommendation
- a routing explanation
- a fallback diagnosis
- a validation result
- a small patch plan

If the user asks for changes, name the file(s), the behavior change, and any test coverage that should accompany it.

## Example standalone usage

- “Which candidate is best for coding tasks if I need tool use and low latency?”
- “Why did the fallback plan reject every model?”
- “Update the config so reasoning tasks prefer the cloud model, but reading tasks prefer the long-context model.”
- “Switch this workflow to auto mode so the category is inferred instead of passed explicitly.”
- “Refresh pricing only if the snapshot is still current enough to reflect the market.”

## Example Command Center usage

Command Center can call this skill when a workflow already knows its category. In that case, Model Steward should:

1. honor the category requested by the workflow or router,
2. score only compatible candidates,
3. choose the best candidate within the category,
4. then consider broader eligible fallbacks only if needed.

This keeps the skill standalone while remaining compatible with Command Center’s routing model.
