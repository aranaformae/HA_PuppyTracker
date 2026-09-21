# Puppy Tracker documentation

This index separates day-to-day use from implementation and maintenance
details. Start with the root [README](../README.md) for installation and a short
feature overview.

## User guides

| Guide | Contents |
| --- | --- |
| [Dashboard cards](DASHBOARD_CARDS.md) | Workspace presets, owners/report cards, migration and YAML options |
| [Puppy dossiers and owners](puppy-dossiers.md) | Ownership scopes, record editing, contacts, placement and payment data |
| [Temperature](temperature-card.md) | Journal temperature view, entry and configuration |
| [Age-based care programs](CARE_PROGRAMS.md) | Programs, built-in templates and the template JSON format |
| [Notifications](NOTIFICATIONS.md) | Reminder delivery, lead times, mobile clearing and test workflow |
| [Backup, restore and transfer](backup-restore.md) | Manual/automatic backup, restore and partial transfer |

## Technical and release guides

| Guide | Contents |
| --- | --- |
| [Architecture](ARCHITECTURE.md) | Data ownership, stores, APIs, frontend contracts and extension rules |
| [Storage migrations](storage-migrations.md) | Supported schema path and migration invariants |
| [Local tests](../tests/README.md) | Python, JavaScript and Playwright test environment |
| [iOS/iPadOS checklist](ios-ipados-release-checklist.md) | Manual release verification for touch devices |

The example care-program import file is available at
[`examples/care-program-template-example.json`](examples/care-program-template-example.json).
