# Security Policy

## Pre-release status

Model Steward is not yet released. Report security findings privately to the repository owner. Do not file public vulnerability details until a private reporting channel exists on the future public repository.

## Security architecture

Model Steward intentionally does not:

- receive or store provider credentials
- intercept, proxy, decrypt, or rewrite model traffic
- monkey-patch HTTP clients or subprocess APIs
- persist prompts, responses, source code, tool arguments, or headers
- expose a daemon or listening network port
- automatically activate newly discovered models

Telemetry is local structured metadata. Disk persistence uses owner-only modes where supported. Routing fails open to Pi's existing model, while high-risk candidate eligibility fails closed to an explicit allowlist.

## Supported versions

No version is currently supported for production use.

## Before public release

A release requires dependency, static-analysis, secret-scanning, provenance, package-content, and privacy tests; immutable CI action references; protected branches; private vulnerability reporting; and explicit owner approval.
