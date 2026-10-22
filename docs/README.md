# Puppy Tracker documentation

This index separates day-to-day use from implementation and maintenance
details. Start with the root [README](../README.md) for installation and a short
feature overview.

## User guides

| Guide | Contents |
| --- | --- |
| [Dashboard cards](DASHBOARD_CARDS.md) | Workspace presets, visual editor, recommended layout, migration and YAML options |
| [Weighing and growth analysis](GROWTH_ANALYSIS.md) | Weighing workflow, metric meanings, monitoring, trends and milestones |
| [Calculator and feeding portions](CALCULATOR.md) | Per-kilogram amounts, configurable kibble/meat methods, kcal allocation and separate portions |
| [Puppy dossiers and owners](puppy-dossiers.md) | Ownership scopes, shared item editing, Quick Log selection, contacts, puppy preferences and payments |
| [Dossier history](DOSSIER_HISTORY.md) | One combined history, owner choice, compact details, filters, weight corrections and Timeline migration |
| [Owner puppy-preference matrix](OWNER_PREFERENCE_MATRIX.md) | Compare ranked choices, conflicts, notes and final puppy links per litter |
| [Temperature](temperature-card.md) | Journal temperature view, entry and configuration |
| [Behavior observations](BEHAVIOR.md) | Repeated puppy scoring, profile calculation and PDF output |
| [Reports and exports](REPORTS_EXPORTS.md) | Per-puppy/litter PDF sections, profiles, filters, CSV and JSON behavior |
| [Logo uploads and managed files](MANAGED_FILES.md) | Central breeder logo, private storage, backup and restore |
| [Age-based care programs](CARE_PROGRAMS.md) | Programs, built-in templates and the template JSON format |
| [Notifications](NOTIFICATIONS.md) | Reminder delivery, lead times, mobile clearing and test workflow |
| [Backup, restore and transfer](backup-restore.md) | Manual/automatic backup, restore and partial transfer |
| [Home Assistant entities and actions](HOME_ASSISTANT.md) | Created devices/entities and automation actions |

## Technical and release guides

| Guide | Contents |
| --- | --- |
| [Architecture](ARCHITECTURE.md) | Data ownership, stores, APIs, frontend contracts and extension rules |
| [Contributing](../CONTRIBUTING.md) | Bug reports, feature requests, local setup and contribution expectations |
| [Commit and release conventions](RELEASING.md) | Versioning, changelog maintenance, gated publication and failure handling |
| [Changelog](../CHANGELOG.md) | Curated recent release changes and links to earlier releases |
| [Security and privacy](SECURITY_PRIVACY.md) | Role policy, private exports, signed URLs, file boundaries and review evidence |
| [Storage migrations](storage-migrations.md) | Supported schema path and migration invariants |
| [Standalone feeding calculator](FEEDING_CALCULATOR_STANDALONE.md) | Data model and calculation contract for a separate owner-facing web tool |
| [Local tests](../tests/README.md) | Python, JavaScript and Playwright test environment |
| [iOS/iPadOS checklist](ios-ipados-release-checklist.md) | Manual release verification for touch devices |

The example care-program import file is available at
[`examples/care-program-template-example.json`](examples/care-program-template-example.json).
The complete dashboard example is available at
[`examples/puppy-tracker-dashboard.yaml`](examples/puppy-tracker-dashboard.yaml).
