---
name: model-steward
description: Evaluates and safely recommends or routes among multiple LLM models across cloud, local, and custom Pi providers. Use for model benchmarking, cost/latency/quality comparisons, routing configuration, fallback diagnosis, and Model Steward status. Does not proxy traffic or store prompts.
license: Apache-2.0
compatibility: Requires Node.js 20+; optional Pi extension integration requires pi coding agent 0.40+.
---

# Model Steward

Model Steward is local-first and privacy preserving. It evaluates **provider/model pairs**, not providers as a single unit.

## Safety rules

- Never publish, tag, create a remote, or install globally without the owner's explicit approval.
- Never place prompts, responses, source code, credentials, or HTTP headers in telemetry.
- Never intercept TLS, patch subprocesses, or rewrite provider requests.
- Start in `observe` mode. Moving to `recommend` or `route` requires explicit configuration.
- Keep Pi's current model as the terminal fallback.
- High-risk tasks may only use models listed in `highRiskAllowlist`.

## Commands

- `/steward` — show current status.
- `/steward reload` — reload local configuration and observations.
- `/steward feedback success|failure` — score the most recently recorded turn.
- `/steward pricing` — inspect local pricing snapshot freshness.
- `/steward pricing refresh` — explicitly refresh enabled public metadata sources; sends no prompts, outputs, telemetry, or credentials.

## Configuration

Project configuration lives at `.model-steward/config.json`. Runtime observations live under `~/.model-steward/` by default and must never be committed.

Each candidate is a distinct pair:

```json
{
  "mode": "observe",
  "candidates": [
    {
      "provider": "openrouter",
      "model": "anthropic/claude-sonnet",
      "enabled": true
    },
    {
      "provider": "openrouter",
      "model": "google/gemini-flash",
      "enabled": true
    },
    { "provider": "ollama", "model": "qwen2.5-coder:32b", "enabled": true }
  ],
  "highRiskAllowlist": ["openrouter/anthropic/claude-sonnet"]
}
```

Use Pi's `models.json` to define local or custom endpoints. Model Steward consumes Pi's authenticated model registry and adds no provider-specific credential handling.
