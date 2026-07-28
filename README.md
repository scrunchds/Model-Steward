# Model Steward

Local-first, privacy-preserving model evaluation and fail-safe routing for coding agents.

> **Development status:** experimental source preview. Model Steward is not yet recommended for production routing or npm installation.

## Design

Model Steward learns from structured outcomes for individual `provider/model` pairs. It supports any cloud, local, or custom model already exposed through Pi's model registry. It does not handle credentials, proxy traffic, intercept TLS, patch subprocesses, or persist prompts and responses.

Modes are intentionally progressive:

1. **observe** — record metadata; never change the model (default)
2. **recommend** — explain a recommendation; never change the model
3. **route** — select an eligible model with ordered fallbacks

Every routing failure retains Pi's current model. High-risk tasks are fail-closed to an explicit model allowlist.

## Features

- multiple models per provider and multiple providers per installation
- OpenAI, Anthropic, Google, OpenRouter, local servers, and custom endpoints through Pi
- quality/cost/latency/uncertainty scoring
- bounded exploration only among eligible models
- circuit breakers and ordered fallbacks
- structured local telemetry with no prompt or response content
- optional validated pricing snapshots from OpenRouter and LiteLLM, with manual refresh and last-known-good fallback
- unknown model prices remain unknown rather than being treated as free
- disk cache of LLM content: **none**
- network service or daemon: **none**
- provider HTTP interception: **none**
- explicit release guard

## Development

```bash
npm install
npm run check
npm run pack:check
```

The Pi extension entry point is `model-steward/pi`; the discoverable skill is in `skills/model-steward/`.

## Configuration

Copy `examples/config.example.json` to `.model-steward/config.json` in a trusted project and edit the candidates. Start in `observe` mode.

Local runtime observations default to `~/.model-steward/observations.jsonl`. `.model-steward/` is ignored from Git.

## Release policy

npm publication, package registries, version tags, and GitHub Releases require a separate explicit owner authorization. `npm run release:guard` also requires `MODEL_STEWARD_RELEASE_APPROVED=yes`, but that variable is only a secondary safeguard—not a substitute for direct authorization.

## Support the project

If Model Steward is useful to you, you can support continued development:

[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20me%20a%20coffee-DustinS-FFDD00?logo=buymeacoffee&logoColor=000000)](https://www.buymeacoffee.com/DustinS)

The public README uses a normal link because GitHub strips executable `<script>` tags. A website-only embed snippet is available in [`docs/WEBSITE_SUPPORT.md`](docs/WEBSITE_SUPPORT.md).

## Licensing

Model Steward is **source-available**, not OSI open source.

Noncommercial use is available under the [PolyForm Noncommercial License 1.0.0](LICENSE). Commercial use—including business use, paid hosting, resale, commercial redistribution, or inclusion in a paid product or service—requires a separate commercial license from the copyright holder.

See [`COMMERCIAL-LICENSE.md`](COMMERCIAL-LICENSE.md) for commercial licensing information.
