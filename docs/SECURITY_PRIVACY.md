# Security and Privacy Review for 1.0

Review baseline: v0.28.16 (`df75a70`), with the permission hardening in `3205c5c`
included in v0.28.17. This is a scoped application review, not an independent penetration test
or a claim of protection against a compromised Home Assistant host.

## Trust Model and Policy

Puppy Tracker is a shared Home Assistant household/breeder dashboard, not a buyer
portal. It has no per-owner login, per-litter ACL or field-level dossier privacy.
Home Assistant authenticates users and supplies the authorization principal;
the integration never accepts a caller-supplied `is_admin` or user identifier.
Do not copy private contact or payment information into shared dossier/profile
notes: their free text is not automatically classified or redacted.

| Surface / action | Anonymous | Authenticated non-admin / read-only account | Administrator |
| --- | --- | --- | --- |
| Litter/puppy dashboards, active measurements, dossier history, growth, behavior and care schedule reads | Denied | Allowed | Allowed |
| Read acknowledgement state; subscribe to update timestamps | Denied | Allowed | Allowed |
| Read the selected breeder logo | Denied without a signed URL | Allowed | Allowed |
| Read owners, addresses, contact methods, payments and puppy preferences | Denied | Denied | Allowed |
| CSV, JSON and PDF exports, regardless of section switches | Denied without an authorized signed URL | Denied | Allowed |
| Complete/litter/puppy/mother backup HTTP downloads | Denied without an authorized signed URL | Denied | Allowed |
| WebSocket dossier/measurement mutations, care completion, acknowledgement changes, feeding settings, program/template/reminder and owner management | Denied | Denied | Allowed |
| Raw editable measurement history, integrity checks and repair | Denied | Denied | Allowed |
| Integration configuration, file upload and backup import | Denied by HA | Denied by HA | Allowed through HA configuration flows |
| Setup checklist preferences/progress and its full-backup download | Denied | Denied | Allowed; user identity comes from the HA connection |
| Custom `puppy_tracker.*` actions: create litter, add puppy, record weight, backup to file | Denied by HA | Denied | Allowed |

**Native HA entity controls are a separate interface.** Weight input, selection,
weighing-session buttons and reminder-control number/switch entities use Home
Assistant's entity read/control permissions. Normal users with entity control
permission can operate them; HA read-only users cannot. Custom WebSocket write
and export permissions do not replace or bypass those HA entity permissions.
Do not describe the entire integration as read-only for all non-admin accounts.

Trusted HA automation/system calls without a user context remain supported by
HA's `async_register_admin_service` policy. This is needed for scheduled backups.
A user-originating service call must carry the authenticated HA context and pass
the administrator check. An administrator is responsible for automations that
deliberately expose privileged actions through an accessible trigger or script.

## Backend Enforcement

- `@websocket_api.require_admin` protects each private/read-sensitive command and
  each custom WebSocket mutation before runtime data is accessed.
- An explicit read-command allowlist in the permission tests makes a newly added
  unprotected command fail the review test unless it is deliberately classified.
- Non-admin dashboard payloads return an empty `owner_ids` list. The canonical
  stored links are unchanged and still available to administrators.
- All four backup HTTP views require HA authentication **and** check the request's
  `KEY_HASS_USER.is_admin` before looking up an owner or serializing data.
- PDF/CSV/JSON export is admin-only even with owner/contact sections disabled:
  free-form dossier/profile notes may themselves contain private information.
- Owner CSV is produced in the frontend only after the admin-only owner API has
  supplied the data. Hiding a button is not its authorization boundary.
- The owner and report cards show localized access messages for non-admins and
  avoid private reads/actions. Owner details are cleared on an observed role
  change; a late response cannot repopulate the removed information.
- Owner contact actions never send a message automatically. Explicit clicks open
  validated `tel:`/encoded `mailto:` links or an explicit international-number
  WhatsApp URL (`noopener noreferrer`). Clipboard copies retain the original
  text, require the current admin context and show local success/failure only;
  late completion cannot restore feedback after identity/permission changes.
  Clipboard contents or details already passed to an external app cannot be revoked.
- Care-result and acknowledgement controls reflect their backend write policy.
  The server remains authoritative if old frontend code still shows a button.
- Weighing recovery and Undo WebSocket commands are admin-only. Recovery checks
  the displayed session ID/revision; Undo accepts only a server-issued short-lived
  token and exact measurement ID, with ownership/version checks inside the
  storage lock. Tokens are runtime-only and are not portable backup credentials.
  Native station Start/Reset remain subject to the separate HA entity policy.

## Download Data Flow and Signed URLs

Backups are serialized on demand from runtime storage and downloaded directly;
they are not staged in `/www`. Responses use attachment filenames,
`Cache-Control: no-store` and `X-Content-Type-Options: nosniff`.

The configuration flow and mother-export WebSocket command use HA's native
`async_sign_path`, with a ten-minute expiry. The authenticated HA context binds
the signature to the refresh token of the creating administrator. The HTTP view
checks the current user associated with that token, not the mere presence of an
`authSig` query parameter. A non-admin cannot use HA's generic path-signing API
to turn their own credentials into admin access.

Signatures cover the route and substantive query parameters. Modified paths or
parameters, expired signatures and revoked refresh tokens are rejected by HA.
Removing the administrator role also blocks the download at the view check.
A signature made using HA's fallback read-only content user cannot download a
private backup. Configuration-flow links must retain their real admin context.

**A valid admin-signed link is a temporary bearer credential.** Someone receiving
that exact link may download without a separate login until it expires or its
issuing token/role is revoked. It is reusable during that interval, not one-time.
Do not put signed links in public dashboards, logs, issues or chat messages.
Already downloaded files and previously displayed information cannot be revoked.

## File Actions, Logos and Future Attachments

`backup_to_file` checks the resolved destination stays inside the HA configuration
directory, rejects non-JSON destinations, and rejects `/config/www` including
symlinks resolving into it. A temporary file is atomically replaced; temporary-file
permissions restrict file reads. Existing retention rules apply only to matching
timestamped backups. Arbitrary local processes with config-directory write access
are outside this threat model, including filesystem race attacks by a local actor.

The backup-status sensor contains operational information, including the configured
backup path, scope, counts and timestamps. Do not put owner/contact details or
credentials in filenames. Failure state uses the generic `backup_failed` code,
not raw exception text. The requesting admin action can still report its exception.

Managed-logo storage already enforces content-addressed IDs, private file modes,
size/pixel/type limits, metadata stripping, checksums and symlink/traversal checks.
Only the currently configured branding image is served; future puppy photos or
dossier attachments are not automatically exposed by that route. The logo is
shared branding, not a private document. See [MANAGED_FILES.md](MANAGED_FILES.md).
Future attachments require an explicit owner/scope permission design and another
file/download review before enabling any new served type.

## Diagnostics, Logs and Exports

Downloaded diagnostics contain version/status metadata, aggregate storage and
scheduler counts, notification target counts and aggregate integrity results.
The integrity `unresolved` list is excluded because its identifiers can be
user-controlled. Unknown future integrity fields are not automatically included.
Diagnostics do not include owners, emails, phones, addresses, payment values,
free-form notes, notification destinations, logo blobs or signed URLs.

Subscription messages contain update timestamps, not snapshots of private stores.
Frontend static resources contain code and built-in templates only, not runtime
contacts, exports or configuration-store contents. HA controls authenticated
configuration/import/upload routes; native file-upload IDs are resolved through
HA's upload helper rather than an uploaded filename used as a filesystem path.

Exports and full backups intentionally contain private data when an administrator
requests them. PDF section switches and report profiles still govern content;
authorization is checked independently. Store and share the resulting files with
the same care as the integration data. The integration does not encrypt exported
files or protect files after they have left HA.

CSV preserves actual phone/chip values, including leading zeroes. CSV has no type
metadata and spreadsheet applications may reinterpret numeric values or formula-
like text. Import these files as text with formula evaluation disabled where
available. Do not treat a spreadsheet importer's automatic type inference as a
security or data-integrity guarantee. No spreadsheet formula expressions are
added to force text formatting or work around the leading-zero issue.

## Executable Review Evidence

- `tests/test_permissions.py`: every registered non-read WebSocket command rejects
  missing/non-admin principals before accessing data; real normal/read-only HA
  accounts cannot read owners or export CSV/JSON/PDF; ordinary dashboards remain
  readable without owner links; admin access and exports still work.
- The same suite exercises all four real HTTP backup routes for anonymous,
  normal/read-only and admin principals; non-admin signed links; expiry, query
  tampering, role changes and token revocation; admin-context options-flow and
  mother-export downloads; service role checks, automation compatibility, private
  destination checks and diagnostics content isolation.
- `tests/test_managed_files.py`: logo restrictions, malformed/oversized uploads,
  authenticated/signed serving, traversal/symlink rejection, checksums and rollback.
- Existing report-export tests verify selected-puppy and section/contact isolation;
  backup suites cover multi-store validation, transactions and failure rollback.
- Browser tests verify localized access messages, no private reads/buttons for
  non-admins and no late-response disclosure after an observed role change.

Run these in the supported local test environment and CI before releasing this
hardening. Revisit this policy whenever a WebSocket command, custom action,
export, public route or attachment type is added. This completes the scoped
permission/privacy review workstream; the repository-hygiene tasks in issue #21
are separate from that review. Contributor guidance, issue forms and release
procedures are documented in [CONTRIBUTING.md](../CONTRIBUTING.md) and
[Commit and release conventions](RELEASING.md). These procedures do not extend
the security review to future attachment types or new API boundaries.
