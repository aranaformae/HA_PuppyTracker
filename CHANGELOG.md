# Changelog

User-facing changes and important maintenance are recorded here. Categories are
Added, Changed, Fixed, Deprecated, Removed and Security; omit empty categories
from a released entry. Breaking changes must include migration instructions.

This curated log starts with 0.29.5. Earlier releases remain documented in the
[GitHub release archive](https://github.com/aranaformae/HA_PuppyTracker/releases);
they have not been reconstructed as a complete historical changelog.

## [Unreleased]

### Added

- Unsaved document templates can be previewed with a selected puppy, buyer and
  recorded payment, with missing required fields shown before saving.

### Changed

- The document card keeps document creation and the archive together, with
  template management in a separate collapsed section below the workflow.

## [0.32.6] - 2026-10-26

### Added

- Individual payment receipts can be recorded per owner and litter with amount,
  date, type, method and optional reference. Corrections retain the original
  entry. Existing balances remain manual and are not inferred as past receipts.
- Document templates can use placement date and status, litter and puppy birth
  details, latest valid puppy weight with measurement date, and an optional
  puppy profile note.

### Changed

- The bilingual payment receipt now uses one explicitly selected, active
  payment from the primary buyer's litter dossier. A corrected or withdrawn
  payment cannot be saved from an outdated preview. The recipient signature
  remains a manual confirmation on the PDF.
- Puppy information templates include birth and latest weight details, and
  handover checklists can show the actual placement date. Existing archived
  documents and backups remain readable.

## [0.32.5] - 2026-10-26

### Changed

- Document template editing now offers a simple mode with readable field labels,
  searchable field insertion and section insertion in place. The advanced block
  editor remains available; both modes edit the same template and draft.
- Template layout previews open inside the document card with page and zoom controls
  and a separate PDF download. The preview loads on demand, works as a mobile
  overlay and is invalidated when the template changes.

## [0.32.4] - 2026-10-26

### Added

- Five standard document types in Dutch and English: puppy handover, puppy
  information, payment overview, reservation notes and a printable handover
  checklist. Standard templates are grouped by language and can be copied or
  downloaded; custom templates remain separate. The original Dutch handover
  remains unchanged. Document date/save labels now also suit non-contract forms.

### Fixed

- Browser CI uses matching preinstalled
  Playwright browsers and system dependencies. This avoids slow package-mirror
  downloads timing out and leaving an `apt-get` lock that blocks installation
  retries. Frontend dependencies now install from the exact npm lockfile.

### Changed

- Releases reuse successful CI for the exact commit instead of repeating all
  checks. Publication resumes automatically when CI completes; compact status
  and bounded failure output replace agent polling and full-log dumps.
- Browser CI runs in four parallel shards with the same complete test coverage.
  Release notes come from the curated changelog, and publication is idempotent.

## [0.32.3] - 2026-10-25

### Added

- Template edits are automatically kept as a local concept per HA user/browser,
  including incomplete text, open parts and the original template revision.
  Reloading restores the concept; explicit discard or successful template save
  clears it. Clear status distinguishes local recovery from an HA template save,
  with recovery downloads available on storage failures or another-tab conflicts.

## [0.32.2] - 2026-10-25

### Changed

- Document PDFs have a calmer print layout: title and logo aligned side by side,
  clearer section hierarchy, shaded data labels, more readable text spacing and
  separate seller/buyer signature and initials areas. Small data groups stay
  together; large values paginate without entering the footer. Archived PDFs
  retain their original appearance.
- Document templates can use custom watermark text or the configured breeder
  logo, faintly on every page. Header logos remain independently selectable;
  watermark settings are retained in template downloads, backups and previews.

## [0.32.1] - 2026-10-25

### Fixed

- Document template import, editing and contract saving now work on local HTTP
  Home Assistant connections without the secure-context-only `randomUUID` API.
  File reading, invalid JSON and editor errors are reported separately.

## [0.32.0] - 2026-10-25

### Added

- Report & export now includes document templates and per-puppy contracts, with
  linked buyers, breeder/parent identities and litter-specific payment fields.
  Includes a neutral handover example, a block editor and JSON
  template import/download. Missing required fields and changed source data
  prevent final saving until checked again.
- Template editing includes block navigation, duplication and deletion recovery,
  explicitly ordered data fields, errors linked to their parts, an unsaved PDF
  layout preview and draft JSON downloads.
- Private PDF archive retains exact generated bytes and template/data snapshots.
  Full backup format v7 includes the archive and custom templates; v4/v5/v6
  backups remain readable. Full file-import limit is now 128 MiB. Restoring v7
  requires this or a newer compatible integration version.
- Breeder options now include structured contact/address, representatives,
  registration, UBN and bank details for document fields.

### Changed

- Default PDF branding uses the Puppy Tracker integration icon. Private breeder
  artwork and private contract wording are not bundled; users can upload their
  own logo and import their own document templates.

## [0.31.2] - 2026-10-24

### Added

- Owner management shows visible/total contact counts and clears litter, status
  and search filters without losing sorting or unsaved puppy-link choices.
- A collapsible pickup schedule groups matching dossiers by expected date, with
  owner, litter and linked puppy/collar labels, past-date hints and direct editing.
  Placed/archived dossiers are excluded; long schedules scroll internally.

## [0.31.1] - 2026-10-24

### Added

- Non-blocking duplicate-contact hints compare email/phone values across all
  dossiers, exclude the edited contact and offer explicit reuse with draft-discard
  confirmation. Shared partner details remain allowed; nothing is merged automatically.
- Owner contact details offer call, compose-email, explicit-international-number
  WhatsApp and copy actions, with localized feedback and no automatic messages.
- Owner management sorts by name, next pickup, placement phase or highest
  recorded outstanding balance; unknown dates/amounts sort last and CSV follows.
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

[Unreleased]: https://github.com/aranaformae/HA_PuppyTracker/compare/v0.32.6...HEAD
[0.32.6]: https://github.com/aranaformae/HA_PuppyTracker/compare/v0.32.5...v0.32.6
[0.32.5]: https://github.com/aranaformae/HA_PuppyTracker/compare/v0.32.4...v0.32.5
[0.32.4]: https://github.com/aranaformae/HA_PuppyTracker/compare/v0.32.3...v0.32.4
[0.32.3]: https://github.com/aranaformae/HA_PuppyTracker/compare/v0.32.2...v0.32.3
[0.32.2]: https://github.com/aranaformae/HA_PuppyTracker/compare/v0.32.1...v0.32.2
[0.32.1]: https://github.com/aranaformae/HA_PuppyTracker/compare/v0.32.0...v0.32.1
[0.32.0]: https://github.com/aranaformae/HA_PuppyTracker/compare/v0.31.2...v0.32.0
[0.31.2]: https://github.com/aranaformae/HA_PuppyTracker/compare/v0.31.1...v0.31.2
[0.31.1]: https://github.com/aranaformae/HA_PuppyTracker/compare/v0.31.0...v0.31.1
[0.31.0]: https://github.com/aranaformae/HA_PuppyTracker/compare/v0.30.0...v0.31.0
[0.30.0]: https://github.com/aranaformae/HA_PuppyTracker/compare/v0.29.6...v0.30.0
[0.29.6]: https://github.com/aranaformae/HA_PuppyTracker/compare/v0.29.5...v0.29.6
[0.29.5]: https://github.com/aranaformae/HA_PuppyTracker/compare/v0.29.4...v0.29.5
