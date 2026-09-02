# Puppy Tracker backup, restore and puppy transfer

Puppy Tracker provides authoritative JSON backup and restore from the integration configuration in Home Assistant.

> **Pre-1.0 backup contract:** new exports use backup format **v5**. The restore workflow also accepts production backup format **v4** for backward compatibility. Earlier experimental v2/v3 backups are intentionally rejected because backup/restore was not yet considered production-stable when those formats existed.

## Open Data management

1. Open **Settings → Devices & services → Puppy Tracker**.
2. Open **Configure**.
3. Choose **Data management**.
4. Choose **Export backup** or **Import / restore backup**.

## Export options

### Complete Puppy Tracker backup

Use this for disaster recovery. A current full v5 backup contains the authoritative Puppy Tracker data and the portable configuration needed to reconstruct scheduled care:

- complete main storage, including mother profiles, litters, puppies, measurement versions, dossier records, settings and audit history;
- portable care-reminder preferences such as category toggles and the default notification lead time;
- age-based care-program definitions, including optional per-program notification lead-time overrides;
- recurring-reminder definitions, including optional per-reminder notification lead-time overrides;
- quarantined scheduler definitions preserved byte-for-byte as opaque compatibility data where possible.

Scheduler definitions remain in their existing dedicated stores; the v5 backup envelope simply carries snapshots of those stores together with the main database so disaster recovery can restore them as one coordinated operation.

Operational delivery/deduplication state is deliberately **not** included. That state describes what the current Home Assistant runtime already delivered and must be rebuilt after a restore instead of being transferred as user configuration.

Before a v5 full backup is emitted, Puppy Tracker validates active scheduler references against the authoritative main data. A care program must reference an existing litter. A recurring reminder must reference the exact existing litter, puppy or mother it claims to own. Quarantined definitions are not interpreted by this check because they may belong to a future schema this runtime cannot understand.

### One complete litter

Exports one litter with all puppies, full measurement/correction history, dossier records and the audit history belonging to that litter. Global settings and scheduler stores are not included.

### One individual puppy

Exports one puppy with:

- profile data;
- birth measurement reference;
- all measurement versions, including deleted and superseded versions;
- correction chains and correction metadata;
- all dossier records, including deleted records where present in storage;
- relevant audit history;
- basic source-litter metadata so the puppy can also be restored into a newly created litter.

Global settings and scheduler stores are not included in a single-puppy transfer.

Export downloads use a signed Home Assistant URL that expires after 10 minutes. The generated backup is not left behind in `/www`.

## Import safety model

Every import follows the same sequence:

1. Upload a Puppy Tracker JSON file.
2. The integration validates the backup format, supported storage schema and basic structure.
3. Choose an import mode.
4. Puppy Tracker builds the complete candidate database in memory.
5. Supported legacy schema-7 data is normalized to the current mother-aware schema before it can be committed.
6. The candidate is checked for normal storage integrity and mother-scope integrity.
7. For a v5 full replacement, active care-program and recurring-reminder references are checked against that normalized candidate.
8. Review the dry-run summary.
9. Explicitly confirm the import.
10. The candidate is written atomically.

If Puppy Tracker data changes after the preview but before confirmation, the import is refused. Review the import again so new measurements or dossier entries cannot be overwritten accidentally.

Partial imports always receive new identifiers. Puppy, litter, measurement and dossier record UUIDs are remapped together with internal references such as `birth_measurement_id`, `source_measurement_id`, `superseded_by` and relevant audit references. Existing history is therefore never silently overwritten.

## Coordinated full restore

A v5 **Replace all** restore is a coordinated multi-store transaction. The main Puppy Tracker storage, portable care-reminder settings, age-based care-program store and recurring-reminder store are treated as one restore operation.

If saving one of those stores fails, Puppy Tracker restores the snapshots of every store already touched by the transaction. This prevents a failed disaster recovery from leaving the main database and scheduler definitions at different points in time.

A v4 full backup predates portable scheduler-store snapshots. Restoring v4 therefore updates the main database and portable care-reminder preferences while leaving the current care-program and recurring-reminder stores untouched.

## Disaster recovery

For a complete restore:

1. Export a **Complete Puppy Tracker backup** regularly and store it outside Home Assistant.
2. In the replacement or recovered Home Assistant installation, install a Puppy Tracker version that supports backup format v5/v4 and storage schema 7/8 restore.
3. Open **Data management → Import / restore backup**.
4. Upload the full JSON backup.
5. Choose **Replace all current Puppy Tracker data with this backup**.
6. Review the dry-run counts and integrity warnings carefully.
7. Confirm only when the preview matches the backup you intend to restore.

A full replacement preserves the identifiers from the backup. This is intentional for disaster recovery so restored litter, mother and puppy identities remain stable.

For v5, the scheduler definitions are restored with those same identities. Cross-store validation therefore refuses orphaned or mismatched scheduler ownership before the transaction is allowed to commit.

Portable care-reminder preferences are restored. Delivery state is rebuilt instead of copied so a restored installation does not inherit stale “already sent” state from another runtime.

## Transfer one puppy to another litter

1. On the source installation, export **One individual puppy**.
2. On the destination installation, open **Data management → Import / restore backup** and upload that JSON file.
3. Choose one of the following:
   - **Create a new litter from the backup** to create a new litter using the source litter name, birth date and parent metadata; or
   - **Add to an existing litter** and choose the destination litter.
4. Review the dry-run summary.
5. Confirm the import.

The imported puppy receives a new puppy ID. All of its measurement IDs, dossier record IDs and internal correction references are also remapped consistently. The original source puppy and any existing destination puppies remain untouched.

## Import one complete litter

A litter backup can be imported as a new litter or its puppy/record contents can be added to an existing litter. Partial imports use new identifiers so they cannot replace an existing litter, puppy, measurement or dossier record by UUID collision.

Scheduler definitions are intentionally not part of partial litter or puppy backups. Moving schedulers safely would require remapping their owner identities alongside the partial import rather than guessing ownership.

## Full backup merge

A complete backup can also be imported while keeping current Puppy Tracker data. In **merge as new** mode, each litter from the backup receives new identifiers and is added alongside existing data.

Because merge-as-new changes litter and puppy identities, a v5 full backup containing scheduler definitions or scheduler quarantine data is currently refused in this mode. Scheduler identifier remapping must be explicit before such a merge can be considered safe.

A v5 full backup with an empty scheduler envelope can still be merged as new. A legacy v4 merge keeps the destination installation's existing scheduler stores and global care-reminder preferences.

Use full replacement only for intentional disaster recovery. Use merge-as-new when both the current and backup datasets need to remain available and the backup contains no scheduler identity data that would require remapping.

## Compatibility

The restore workflow accepts backup formats **v4 and v5**.

Supported main-storage schemas are **7 and 8**. Schema 7 is treated as a supported legacy input and is normalized to the current mother-aware schema 8 in the in-memory restore candidate before integrity validation and commit. Future unknown storage schemas are rejected rather than guessed.

Backup v5 is the current format and adds portable scheduler-store snapshots plus coordinated restore semantics. Backup v4 remains readable so existing production backups do not become unusable merely because scheduler backup support was added.

Earlier experimental backup formats v2/v3 remain intentionally unsupported.

## After an import

Puppy Tracker resynchronizes devices and refreshes dashboard data after a successful import.

After a v5 full replacement, restored care-program and recurring-reminder definitions again derive their due state from the restored authoritative data. Notification/delivery deduplication state is not transferred and is rebuilt by the running integration.

After a v4 full replacement, the scheduler stores already present on the destination are left untouched because v4 had no portable scheduler snapshot to restore.

Keep the original JSON file until the restored data has been checked in the Puppy Tracker cards and integration configuration.
