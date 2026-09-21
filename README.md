# Puppy Tracker for Home Assistant

Puppy Tracker is a Home Assistant custom integration for managing a litter, its
mother dog and individual puppies. It combines weighing and growth monitoring
with dossiers, temperature logging, care schedules, reminders, owner contacts,
reports and backups.

> **Status:** Puppy Tracker is pre-1.0. The current stable development line is
> **0.25.x**. Back up your data before updating because compatibility changes
> are still possible before 1.0.

## What You Can Do

- Manage multiple litters, mother dogs and puppies.
- Record weights with collar-colour charts, correction history and growth
  monitoring.
- Keep separate dossiers for the whole litter, the mother and every puppy.
- Quickly log feeding, temperature, medication, tests, vaccination,
  deworming, veterinary visits, milestones and notes.
- Use recurring reminders and age-based care programs such as ENS, ESI and
  deworming schedules.
- Complete daily care from the Home, Care or Mobile workspace.
- Store owner/contact, placement and payment information and link contacts to
  puppies later.
- Create configurable PDF reports and export CSV or JSON data.
- Make validated manual or automated JSON backups.

Puppy Tracker is a registration and monitoring aid. Its templates, growth
indicators and estimates are not veterinary advice or diagnoses.

## Installation

### HACS

1. Open **HACS -> Integrations**.
2. Add `https://github.com/aranaformae/HA_PuppyTracker` as a custom repository
   if it is not listed yet.
3. Install **Puppy Tracker**.
4. Restart Home Assistant.
5. Open **Settings -> Devices & services -> Add integration** and search for
   **Puppy Tracker**.

### Manual

Copy `custom_components/puppy_tracker/` to
`/config/custom_components/puppy_tracker/`, restart Home Assistant and add the
integration through **Settings -> Devices & services**.

After an update, restart Home Assistant and fully refresh the browser or
Companion App when a dashboard still shows an older card.

## Getting Started

1. Add or select a mother dog and create a litter in the integration options.
2. Add the puppies, including birth time, birth weight, collar colour and
   optionally a chip number.
3. Add one or more Puppy Tracker cards to a dashboard.
4. Use **Weighing Station** for weights and **Quick Log** or **Dossier** for
   daily observations.
5. Add recurring reminders or care programs when scheduled actions are needed.
6. Create a full JSON backup after the initial setup.

## Dashboard Cards

The integration serves and registers its cards automatically. Most cards can
be configured with Home Assistant's visual dashboard editor or with YAML.

| Card | YAML type | Main use |
| --- | --- | --- |
| Workspace | `custom:puppy-tracker-workspace-card` | Home, Growth, Journal, Care or Mobile workflow |
| Owners | `custom:puppy-tracker-owner-card` | Manage contacts and puppy links |
| Report | `custom:puppy-tracker-report-card` | Create PDF, CSV and JSON exports |

Example phone card:

```yaml
type: custom:puppy-tracker-workspace-card
preset: mobile
title: Puppy Tracker
```

> **Breaking change in 0.25.0:** the former standalone dashboard card types
> are no longer public or supported in dashboard YAML. Replace them with a
> Workspace preset. Owners and Report keep their existing types. The migration
> table is in [Dashboard cards](docs/DASHBOARD_CARDS.md#migrating-from-024).

See [Dashboard cards](docs/DASHBOARD_CARDS.md) for card options, initial scope
selection and focused examples.

## Daily Use

### Owner scopes

Dossier and care data always belongs to the **whole litter**, the linked
**mother dog** or one **puppy**. Choosing the correct owner matters because
filters, reminders, reports and completion matching use that ownership.

The Dossier and Timeline cards can open in an aggregate **All** view. Existing
items remain editable there, but a specific owner must be selected before a new
item can be added. This prevents a new entry from being stored under an
unexpected owner.

### Reminders and care programs

Use a recurring reminder when the next action follows the last completion, a
fixed daily time or one date. Use a care program when actions are tied to each
puppy's age. Care results are saved in the puppy dossier, including configured
result, score, note and day-specific instructions.

The Care workspace is the complete checklist even when a program is not
configured to appear in Attention. See
[Age-based care programs](docs/CARE_PROGRAMS.md) and
[Notifications](docs/NOTIFICATIONS.md).

### Owners and puppy identity

The Owners card stores reusable contact, placement and payment information.
Contacts can be created before puppy placement and linked later. A puppy's chip
number is a separate puppy field and can be included in its PDF dossier.

See [Puppy dossiers and owners](docs/puppy-dossiers.md).

## Reports And Backups

- **PDF** is a readable dossier with selectable sections, report profiles,
  owner information, care results and collar-colour charts.
- **CSV** contains effective weight measurements for analysis.
- **JSON** is the importable backup and transfer format.

Use **Settings -> Devices & services -> Puppy Tracker -> Configure -> Data
management** for manual backup and restore. The `puppy_tracker.backup_to_file`
action can create timestamped rotating backups from a Home Assistant
automation.

Read [Backup, restore and transfer](docs/backup-restore.md) before restoring or
moving data.

## Documentation

The [documentation index](docs/README.md) links the user and technical guides.
The most useful starting points are:

- [Dashboard cards](docs/DASHBOARD_CARDS.md)
- [Puppy dossiers and owners](docs/puppy-dossiers.md)
- [Temperature card](docs/temperature-card.md)
- [Age-based care programs and template format](docs/CARE_PROGRAMS.md)
- [Notifications](docs/NOTIFICATIONS.md)
- [Backup, restore and transfer](docs/backup-restore.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Local tests](tests/README.md)

## Troubleshooting

- Restart Home Assistant after installing or updating the integration.
- Fully refresh the dashboard when a card looks older than the installed
  release.
- Verify that the correct litter and owner scope are selected when data appears
  in an unexpected dossier.
- Check **Settings -> System -> Logs** for `puppy_tracker` errors.
- Keep the original JSON backup until imported data and schedules have been
  checked.

## License

See [LICENSE](LICENSE).
