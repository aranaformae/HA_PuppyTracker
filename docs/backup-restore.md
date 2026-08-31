# Puppy Tracker backup, restore and puppy transfer

Puppy Tracker provides authoritative JSON backup and restore from the integration configuration in Home Assistant.

## Open Data management

1. Open **Settings → Devices & services → Puppy Tracker**.
2. Open **Configure**.
3. Choose **Data management**.
4. Choose **Export backup** or **Import / restore backup**.

## Export options

### Complete Puppy Tracker backup

Use this for disaster recovery. It contains the complete Puppy Tracker storage database, including all litters, puppies, measurement versions, dossier records, settings and audit history.

### One complete litter

Exports one litter with all puppies, full measurement/correction history, dossier records and the audit history belonging to that litter.

### One individual puppy

Exports one puppy with:

- profile data;
- birth measurement reference;
- all measurement versions, including deleted and superseded versions;
- correction chains and correction metadata;
- all dossier records, including deleted records where present in storage;
- relevant audit history;
- basic source-litter metadata so the puppy can also be restored into a newly created litter.

Export downloads use a signed Home Assistant URL that expires after 10 minutes. The generated backup is not left behind in `/www`.

## Import safety model

Every import follows the same sequence:

1. Upload a Puppy Tracker JSON file.
2. The integration validates the export version, storage schema and structure.
3. Choose an import mode.
4. Puppy Tracker builds the complete candidate database in memory and runs an integrity check without modifying live data.
5. Review the dry-run summary.
6. Explicitly confirm the import.
7. The candidate is written atomically.

If Puppy Tracker data changes after the preview but before confirmation, the import is refused. Review the import again so new measurements or dossier entries cannot be overwritten accidentally.

Partial imports always receive new identifiers. Puppy, litter, measurement and dossier record UUIDs are remapped together with internal references such as `birth_measurement_id`, `source_measurement_id`, `superseded_by` and relevant audit references. Existing history is therefore never silently overwritten.

## Disaster recovery

For a complete restore:

1. Export a **Complete Puppy Tracker backup** regularly and store it outside Home Assistant.
2. In the replacement or recovered Home Assistant installation, install the compatible Puppy Tracker version.
3. Open **Data management → Import / restore backup**.
4. Upload the full JSON backup.
5. Choose **Replace all current Puppy Tracker data with this backup**.
6. Review the dry-run counts and integrity warnings carefully.
7. Confirm only when the preview matches the backup you intend to restore.

A full replacement preserves the identifiers from the backup. This is intentional for disaster recovery so restored litter and puppy identities remain the same.

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

## Full backup merge

A complete backup can also be imported while keeping current Puppy Tracker data. In **merge as new** mode, each litter from the backup receives new identifiers and is added alongside existing data.

Use full replacement only for intentional disaster recovery. Use merge-as-new when both the current and backup datasets need to remain available.

## Compatibility

The restore workflow accepts current export version 3 backups and the previous export version 2 litter JSON format where its schema can be validated safely. Backups with an unsupported storage schema are rejected instead of being guessed or partially imported.

## After an import

Puppy Tracker resynchronizes litter and puppy devices and refreshes dashboard data after a successful import. For a full replacement, persisted care-reminder delivery state is cleared so reminder state cannot refer to records that no longer exist.

Keep the original JSON file until the restored data has been checked in the Puppy Tracker cards and integration configuration.
