# Dependency Policy

Model Steward uses exact dependency versions and commits `package-lock.json`.

## Current compatibility holdback

TypeScript 7.0.2 is the newest registry release, but the latest `typescript-eslint` 8.65.0 declares support for TypeScript `>=4.8.4 <6.1.0`. Model Steward therefore uses TypeScript 6.0.3, the latest mutually compatible stable version.

This is a compatibility constraint, not an ignored update. Upgrade TypeScript only after the lint toolchain declares support and the complete check suite passes.

## Update requirements

Every dependency update must pass:

- clean deterministic install
- formatting and zero-warning lint
- strict typecheck
- tests and coverage thresholds
- production build
- package-content inspection
- `npm audit --audit-level=moderate`
- Pi integration tests

Runtime dependencies are avoided. Pi packages are optional peers for consumers and exact development dependencies for integration testing.

Package install scripts are denied by default except for the explicitly required `esbuild` binary setup. Blocked scripts from optional provider SDKs remain denied unless separately reviewed.
