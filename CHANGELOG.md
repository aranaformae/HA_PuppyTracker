# Changelog

User-facing changes and important maintenance are recorded here. Categories are
Added, Changed, Fixed, Deprecated, Removed and Security; omit empty categories
from a released entry. Breaking changes must include migration instructions.

This curated log starts with 0.29.5. Earlier releases remain documented in the
[GitHub release archive](https://github.com/aranaformae/HA_PuppyTracker/releases);
they have not been reconstructed as a complete historical changelog.

## [Unreleased]

### Added

- Durable weighing-session checkpoints with explicit restart recovery. Weight,
  progress and completion summary commit together; discarding keeps saved history.
- Shared ordinary/mobile recovery controls with saved progress, explicit
  resume/close, confirmation, permission checks and stable input elements.

### Changed

### Fixed

### Deprecated

### Removed

### Security

## [0.29.6] - 2026-10-22

### Added

- Contributor guide with local setup, test expectations and privacy guidance.
- Bug-report and feature-request forms for reproducible, privacy-conscious issues.
- Maintainer conventions for commits, versioning, release validation and failed
  releases.
- This changelog and links from the documentation index.

### Changed

- Clarified the separation between the completed security review and ongoing
  contributor/release procedures. No user workflows, data formats or permission
  policies change in this documentation release.

## [0.29.5] - 2026-10-22

### Added

- Guided setup checklist for administrators in the Home and Mobile workspaces.
- Clear empty-care states with relevant next actions.
- Daily progress per care program, with missed items counted separately.
- Explicit reuse of a previous feeding or medication entry as an editable draft
  for the selected owner, with a fresh timestamp and visible source. Medication
  doses are copied literally, never calculated; saving remains explicit.

### Changed

- Separated daily execution from schedule management in Care workspace navigation.

[Unreleased]: https://github.com/aranaformae/HA_PuppyTracker/compare/v0.29.6...HEAD
[0.29.6]: https://github.com/aranaformae/HA_PuppyTracker/compare/v0.29.5...v0.29.6
[0.29.5]: https://github.com/aranaformae/HA_PuppyTracker/compare/v0.29.4...v0.29.5
