# Puppy Tracker storage migrations

Puppy Tracker treats persistent storage migrations as a compatibility contract. A migration may add or normalize metadata, but it must not silently replace the identity or historical meaning of existing litter, puppy, measurement, dossier, mother, or audit data.

The production runtime currently ends on **storage schema 8** through `MotherScopeIntegrityStorage`.

## Historical schema path

| Schema | Historical role | Migration invariant |
| --- | --- | --- |
| 1 | Legacy/pre-versioned Puppy Weight Tracker data. Stores without a schema marker are interpreted as schema 1. | Preserve existing litter, puppy and measurement data while filling the versioned storage envelope and missing measurement metadata. |
| 2 | Versioned measurement storage with non-destructive measurement/correction metadata and birth-measurement synchronization. | Existing measurement IDs and timestamps remain authoritative; birth profile synchronization may add a correction version instead of overwriting history. |
| 3 | Persistent litter weighing-session summary (`last_completed_session`). | Completed-session history remains attached to the same litter and puppy identities. |
| 4 | Correction-chain recovery generation. This schema includes data produced around the historical deleted-terminal-correction bug. | A deleted terminal correction may cause its predecessor's stale `superseded_by` link to be cleared, but both measurement versions and the correction's `source_measurement_id` remain stored. |
| 5 | Timezone-safe measurement storage. | Measurement, birth and related timestamps are normalized to timezone-aware UTC values without changing the instant they represent. |
| 6 | Storage-integrity and metadata-timestamp hardening. | Only unambiguous integrity repairs are automatic; IDs, correction history and audit history remain stable. |
| 7 | Generic dossier records and `profile_note`. | Legacy puppy `notes` migrate to `profile_note`; litter/puppy dossier record UUIDs, ownership, soft-delete state and occurred-at history are preserved. |
| 8 | Persistent reusable mother profiles and mother-scoped dossier records. | Existing mother IDs remain stable, litter-to-mother links remain exact, and mother record ownership/identity is preserved. |

## Automated regression fixtures

`tests/fixtures/storage_schema_versions.json` contains one representative historical fixture for each schema 1 through 8. Schema 1 intentionally has no `schema_version` field because that is how the loader recognizes pre-versioned data.

`tests/test_storage_schema_migrations.py` loads every fixture through the same `MotherScopeIntegrityStorage.async_load()` path used by the Home Assistant integration. The suite verifies that migration to schema 8 preserves:

- litter and puppy IDs;
- archived/inactive state;
- measurement weights and the instants represented by measurement timestamps;
- measurement correction IDs and source/successor relationships;
- soft-deleted measurement state;
- the intentional schema-4 deleted-terminal-correction repair;
- birth measurement/profile synchronization;
- persistent completed weighing-session summaries;
- legacy `notes` → `profile_note` content;
- dossier record UUIDs, ownership and soft-delete state;
- mother profile and mother-record identity/ownership;
- original audit entries;
- storage integrity with no unresolved critical issues after a supported migration.

Every migrated fixture is then loaded a second time. The second load must be **idempotent**: the resulting data must be identical and the Home Assistant Store must not be written again.

## Rules for future schema changes

When adding schema 9 or later:

1. Add the migration before increasing the runtime schema number.
2. Add a fixture representing the previous schema before the migration.
3. Add or extend explicit assertions for every identity or history field touched by the change.
4. Keep migrations non-destructive. Prefer a new versioned record over rewriting historical data.
5. Automatically repair only when the intended result is unambiguous. Otherwise report an integrity problem.
6. Preserve the ability to migrate every historical schema still declared supported directly to the current schema.
7. Run the full backend, frontend E2E, Hassfest, HACS and metadata CI gates before release.

Backup format versions are a separate contract from internal storage schema versions. See [`backup-restore.md`](backup-restore.md) for backup v4/v5 compatibility and restore behavior.
