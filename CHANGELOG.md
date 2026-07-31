# Changelog

## 0.1.2 - 2026-07-31

### Changed

- Refactored CLI and Pi extension execution into explicit controllers with dependency injection boundaries.
- Added structured JSON logging with timestamps, scope, and context for CLI, store, and extension operations.
- Improved user-facing failure messages for config loading, routing, pricing refresh, telemetry storage, and compaction.
- Hardened provider discovery and candidate scoring into smaller, testable helper functions.

### Fixed

- Missing or malformed runtime data now emits actionable feedback while preserving fallback behavior.
- Invalid observations, pricing snapshots, and model-switch failures are logged and handled without aborting the host agent.
- Route selection and fallback logic now preserve the existing model as a terminal safety net.
