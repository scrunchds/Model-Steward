# Changelog

## 0.1.1 - 2026-07-29

### Added

- `auto` routing mode that infers task type from task metadata before selecting a model.
- Task-type-aware candidate preference for Command Center workflows.
- Soft workflow-tag bias for close candidate scores.
- Richer discovery tags for models discovered through Pi.

### Changed

- Hardened config loading and validation.
- Hardened pricing snapshot validation and freshness handling.
- Hardened provider discovery and local observation storage against malformed data.
- Updated README, example config, and skill docs for standalone and Command Center usage.
- Bumped package version to `0.1.1`.

### Fixed

- Missing latency is treated as unknown instead of zero.
- Malformed observation lines are skipped instead of breaking local telemetry reads.
- Tie handling and fallback behavior now respect routing configuration.
- `~` paths are expanded when loading config files.
