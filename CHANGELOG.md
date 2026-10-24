# Changelog

User-facing changes and important maintenance are recorded here. Categories are
Added, Changed, Fixed, Deprecated, Removed and Security; omit empty categories
from a released entry. Breaking changes must include migration instructions.

This curated log starts with 0.29.5. Earlier releases remain documented in the
[GitHub release archive](https://github.com/aranaformae/HA_PuppyTracker/releases);
they have not been reconstructed as a complete historical changelog.

## [Unreleased]

### Added

- Phase-aware owner attention actions open the relevant litter/contact fields
  for missing contact details, missing pickup dates or recorded outstanding payments.
- Collapsed owner rows show pickup dates and explicit outstanding balances per
  visible litter dossier, without treating unknown balances as zero.
- One shared owner status filter for management and the preference matrix:
  active dossiers, all dossiers, each placement status or archived dossiers.

### Changed

- Sold dossiers stay visible in the default active view until the puppy is
  placed. Only placed and archived dossiers start hidden. Status and payments
  remain independent; filtering never changes stored data.
- Owner CSV follows the open view's selection, including matrix litter/status
  and conflict filters. Management search and linked-puppy labels use only the
  matching litter dossiers. Saving a status change reveals the saved dossier
  when it would otherwise fall outside the current status filter.

## [0.31.0] - 2026-10-23

**Breaking API change:** interactive owner updates/deletions now require the
revision returned by the owner API; puppy-link changes require the previously
displayed links. Restart Home Assistant and reload open dashboards after updating.
Custom API clients must send these concurrency fields. Stored owner data and
backups are unchanged from 0.30.0; upgrades from older versions still require
the backup and migration precautions described under 0.30.0 below.

### Added

- Compact owner editing with independently collapsible contact, address,
  placement, puppy-preference, financial and note sections. Contact opens by
  default; section-specific edit actions and the matrix open the relevant fields.
- A localized unsaved-changes indicator updates without rebuilding the form.
  Validation opens the section containing the invalid field before focusing it.

### Fixed

- Owners refresh after changes on other devices and reconnects without replacing
  active forms or focused inputs. Unchanged data does not rebuild the card;
  measurement-only updates do not redraw owner profiles or the preference matrix.
- Stale owner saves, deletions, dossier assignments and puppy-link edits are
  rejected instead of silently overwriting newer changes. Drafts remain available
  until the user explicitly loads the latest data and confirms discarding edits.
- Confirmed owner changes remain visible when their follow-up refresh fails.
  A separate refresh action retries only the read, never the saved operation.
- Late responses and subscriptions cannot reintroduce data after changing user,
  permissions, connection or removing the card. Reconnecting keeps same-user drafts.

### Changed

- Interactive owner updates/deletions now require the revision returned by the
  owner API; puppy-link changes require the previously displayed links. Reload
  open dashboards after updating. Stored owner data and backups are unchanged.

## [0.30.0] - 2026-10-23

**Breaking change:** owner placement/payment data migrates to separate litter
dossiers. Create a full JSON backup before installing. Do not downgrade directly
to an older release after migration; reverting requires restoring the original
backup with the compatible older release. If the litter cannot be identified
unambiguously, the original dossier remains available under **Without litter**
for explicit assignment. See [storage migrations](docs/storage-migrations.md#ownercontact-data-version-2).

### Added

- Owner contacts now have independent litter dossiers for preferences, placement,
  payments, notes and archiving. Litter/search filters and expandable dossiers
  keep multiple litters manageable; assigned puppies are visible in collapsed rows.
- Durable weighing-session checkpoints with explicit restart recovery. Weight,
  progress and completion summary commit together; discarding keeps saved history.
- Shared ordinary/mobile recovery controls with saved progress, explicit
  resume/close, confirmation, permission checks and stable input elements.
- A two-minute Undo action for the last station weighing, including correct
  progress after auto-advance/reweighing, completed-session reopening and tagged
  completion-notification withdrawal. Corrections and history remain intact.

### Changed

- Owner data migrates to version 2. Legacy placement data is assigned only when
  one litter is unambiguous; otherwise it stays under **Without litter** for
  explicit assignment. Take a full JSON backup before upgrading and do not
  downgrade to an older release after migration. CSV now exports the visible
  dossier selection; select all litters and show completed dossiers for everything.
- Updated the pinned browser-test runtime to Playwright 1.64.1, with a separate
  long-run WebKit lifecycle diagnostic.

### Fixed

- Weighing saves target the reviewed puppy and value atomically, even when
  another dashboard changes the shared station controls.
- Backup rollback cannot erase separately acknowledged concurrent edits.
- Failed or cancelled dossier/history writes no longer leak into later saves.
- Active weighing progress follows deleted, restored and corrected measurements.
- Explicit weight automations remain available during interrupted sessions and
  leave unrelated station drafts untouched.
- Invalid operational checkpoints no longer prevent starting/resetting sessions.
- Completion notifications are withdrawn even after session alerts are disabled.
- Background checklist/navigation updates no longer replay stale scroll positions
  after the user has continued scrolling.

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

[Unreleased]: https://github.com/aranaformae/HA_PuppyTracker/compare/v0.31.0...HEAD
[0.31.0]: https://github.com/aranaformae/HA_PuppyTracker/compare/v0.30.0...v0.31.0
[0.30.0]: https://github.com/aranaformae/HA_PuppyTracker/compare/v0.29.6...v0.30.0
[0.29.6]: https://github.com/aranaformae/HA_PuppyTracker/compare/v0.29.5...v0.29.6
[0.29.5]: https://github.com/aranaformae/HA_PuppyTracker/compare/v0.29.4...v0.29.5
