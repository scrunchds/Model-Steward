# Design Research

Model Steward is an independent implementation. External projects informed requirements and trade-offs, not source code.

## RouteLLM

- Source: https://github.com/lm-sys/RouteLLM
- Useful concepts: calibrate on representative workloads; expose an explicit quality/cost trade-off; retain evaluation separate from serving.
- Adaptation: Model Steward uses task-category observations and configurable objective weights. It does not proxy requests or require embeddings.

## Semantic Router

- Source: https://github.com/aurelio-labs/semantic-router
- Useful concepts: low-latency local classification, route thresholds, and a no-confident-route result.
- Adaptation: deterministic local feature classification; no external encoder; Pi's current model is retained when no route is eligible.

## LiteLLM

- Source: https://github.com/BerriAI/litellm
- Useful concepts: provider capability normalization, ordered retries, fallbacks, health tracking, and budget awareness.
- Adaptation: consume Pi's model registry and metadata; maintain per-provider/model health and circuit breakers. No gateway or credential handling.

## AIBrix

- Source: https://github.com/vllm-project/aibrix
- Useful concepts: distinguish model selection from serving endpoint health and SLO management.
- Adaptation: model quality scoring and candidate health are separate inputs.

## Design conclusions

1. Routing is calibrated from representative coding tasks, never generic benchmark claims alone.
2. `provider/model` is the identity; one provider may expose many independent candidates.
3. Unknown confidence produces observation or recommendation, not forced routing.
4. Newly discovered models remain disabled until explicitly approved.
5. High-risk tasks use an explicit allowlist.
6. Every route has an ordered fallback ending with Pi's current model.
7. Compaction occurs only after the agent settles and no messages remain queued.
8. No prompt embeddings, prompt storage, proxy, daemon, or response cache are required.
