# Puppy Tracker for Home Assistant

Puppy Tracker is a Home Assistant custom integration for managing a litter, its
mother dog and individual puppies. It combines weighing and growth monitoring
with dossiers, temperature logging, care schedules, reminders, owner contacts,
longitudinal behavior observations, reports and backups.

> **Personal project:** I originally developed Puppy Tracker for my own use.
> Suggestions, practical tips and ideas for improvements are very welcome. Feel
> free to share them through [GitHub Issues](https://github.com/aranaformae/HA_PuppyTracker/issues)!

> **Status:** Puppy Tracker is pre-1.0. Back up your data before updating because
> compatibility changes are still possible before 1.0.

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
- Calculate per-kilogram amounts or kibble/meat rations from the latest puppy
  weights, with separate food portions and litter totals.
- Score repeated behavior observations per puppy and build a neutral profile
  over time.
- Store owner/contact, placement and payment information, record an ordered top
  three puppy shortlist with notes, and link contacts to puppies later.
- Create configurable PDF reports with central breeder details and export CSV or JSON data.
- Make validated manual or automated JSON backups.

Puppy Tracker is a registration and monitoring aid. Its templates, growth
indicators and estimates are not veterinary advice or diagnoses.

Owner/contact and payment details, reports, exports and custom data-management
actions require a Home Assistant administrator. Dashboard information is shared
with authenticated HA users; Puppy Tracker is not a private portal per owner.
See [Security and privacy](docs/SECURITY_PRIVACY.md) for the exact permissions.

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
3. Add a Workspace card to a dashboard and choose the Home, Growth, Journal,
   Care or Mobile preset in its visual editor.
4. Use the **Weigh** tab for weights and **Quick Log** or **Dossier** for daily
   observations. Use **Calculator** in Care or Mobile for per-kilogram amounts
   or daily feeding portions, including age-specific tables and optional kcal
   allocation, and **Behavior** for scored puppy observations.
5. Add recurring reminders or care programs when scheduled actions are needed.
6. Create a full JSON backup after the initial setup.

Administrators starting without a litter see a **Getting started** checklist in
the Home and Mobile Workspace. It follows the actual setup progress and can be
hidden or reopened with the checklist icon. Existing litters remain opt-in.

## Dashboard Cards

The integration serves and registers its cards automatically. The Workspace
visual editor changes its option groups when a different preset is selected;
the same settings can also be written in YAML.

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
selection and focused examples. A complete six-view dashboard is available as
[example YAML](docs/examples/puppy-tracker-dashboard.yaml).

## Daily Use

### Owner scopes

Dossier and care data always belongs to the **whole litter**, the linked
**mother dog** or one **puppy**. Choosing the correct owner matters because
filters, reminders, reports and completion matching use that ownership.

Dossier combines care entries and optional weights in one history. Existing
items remain editable in All. **New entry** asks for an explicit owner when
opened from All, so a new observation is never assigned to the litter by default.

Use the pencil beside an existing item to open the shared editor, including
from Today on mobile, Temperature and Behavior history. Weight items open a
correction instead. Quick Log keeps your chosen owner after saving or changing
category. See [Dossier history](docs/DOSSIER_HISTORY.md) for filters, details and editing.
Quick Log defaults to **Log only**, without completing reminders. Select an
open reminder explicitly to save a new entry and complete only that reminder.

### Reminders and care programs

Use a recurring reminder when the next action follows the last completion, a
fixed daily time or one date. Use a care program when actions are tied to each
puppy's age. Care results are saved in the puppy dossier, including configured
result, score, note and day-specific instructions.
Use **Postpone once** to move only the pending reminder moment, without changing
its recurrence. You can cancel postponement from Today/Mobile or Reminders.

The Care workspace is the complete checklist even when a program is not
configured to appear in Attention. See
[Age-based care programs](docs/CARE_PROGRAMS.md) and
[Notifications](docs/NOTIFICATIONS.md).

### Owners and puppy identity

The Owners card stores reusable contact, placement and payment information plus
an optional top three puppy shortlist with a short note per preference. Contacts
can be created before puppy placement and linked later. A puppy's chip
number, registered/nest name, call name, coat colour and breed/type are separate
profile fields. Parent profiles can store registered/call names, birth date,
breed/type, WALA number and microchip number. Owner addresses use separate street,
postal-code and city fields; these contract-ready values are available in owner
CSV and PDF reports.

The shortlist is planning information only: it does not reserve a puppy, change
its placement status or create the final owner link. Switch the Owners card to
**Preference matrix** to compare the ranked choices per litter, identify shared
first choices and inspect preference notes or existing links. Narrow cards
automatically use a puppy-focused list instead of a wide table.

See [Puppy dossiers and owners](docs/puppy-dossiers.md) and the focused
[owner puppy-preference matrix guide](docs/OWNER_PREFERENCE_MATRIX.md).

## Reports And Backups

- **PDF** is a readable pup- or nestdossier with selectable sections, dossier
  categories, report profiles, owner information, care results and
  collar-colour charts. Individual puppy reports can include the derived
  behavior profile and its observation history. Choose Dutch or English and
  check the content summary before downloading.
- **CSV** from Report contains effective weight measurements for analysis;
  Owners has a separate contact and contract-data CSV for mail merge.
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
- [Weighing and growth analysis](docs/GROWTH_ANALYSIS.md)
- [Calculator and feeding portions](docs/CALCULATOR.md)
- [Logo uploads and managed files](docs/MANAGED_FILES.md)
- [Puppy dossiers and owners](docs/puppy-dossiers.md)
- [Temperature card](docs/temperature-card.md)
- [Behavior observations](docs/BEHAVIOR.md)
- [Reports and exports](docs/REPORTS_EXPORTS.md)
- [Age-based care programs and template format](docs/CARE_PROGRAMS.md)
- [Notifications](docs/NOTIFICATIONS.md)
- [Backup, restore and transfer](docs/backup-restore.md)
- [Home Assistant entities and actions](docs/HOME_ASSISTANT.md)
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
