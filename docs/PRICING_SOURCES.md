# Pricing Sources

Model Steward supports optional public metadata from:

- OpenRouter: `https://openrouter.ai/api/v1/models`
- LiteLLM: `https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json`

Remote refresh is disabled by default and must be explicitly enabled in local policy and invoked with `/steward pricing refresh`.

## Security and correctness rules

- No prompts, responses, source code, telemetry, credentials, or headers are uploaded.
- HTTPS redirects are rejected.
- Time and response-size limits are enforced.
- Responses are schema validated.
- Negative, non-finite, and incomplete rates are rejected.
- Source bodies are identified by SHA-256 in the snapshot.
- Snapshot replacement is atomic.
- A failed refresh leaves the previous snapshot intact.
- Catalogs cannot add or enable routing candidates.
- Explicit user pricing takes precedence.
- OpenRouter is authoritative for OpenRouter-served model IDs when sources overlap.
- Dynamic routers such as `openrouter/auto` retain unknown/variable cost and are never interpreted as free.
- Unknown price receives a neutral score and an explicit `cost unknown` explanation.

## Local models

A local model's marginal API price may be zero, but its full operational cost is not necessarily zero. Users may explicitly configure rates that include electricity, hardware amortization, hosting, or endpoint charges. Model Steward never invents those values.
