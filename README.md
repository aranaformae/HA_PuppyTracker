# Puppy Tracker for Home Assistant

Puppy Tracker helps you manage puppy litters from birth through handover:
weighing and growth, daily observations, care schedules, owner contacts,
payments, documents and backups.

> **Personal project:** I developed Puppy Tracker for my own use. Suggestions,
> practical tips and improvements are welcome through
> [GitHub Issues](https://github.com/aranaformae/HA_PuppyTracker/issues).

> **Pre-1.0:** compatibility changes are still possible. Make a full JSON backup
> before updating. Home Assistant **2026.9.4 or newer** is supported.

**New to Puppy Tracker?** Start with the practical user manual:
[English](docs/USER_MANUAL.md) or [Nederlands](docs/GEBRUIKERSHANDLEIDING.md).
It explains basic actions step by step, without requiring YAML or programming
knowledge. The [documentation index](docs/README.md) links to detailed task guides.

## What you can do

- Weigh puppies, correct measurements without losing history and compare growth
  with littermates or earlier own litters.
- Keep separate litter, mother and puppy dossiers, including temperature,
  feeding, daily care and repeated behavior observations.
- Plan and carry out care programs, finite treatments and recurring reminders.
- Calculate per-kg amounts or daily kibble/meat portions from recorded weights.
- Manage reusable owner contacts, litter-specific placement/payment details,
  puppy preferences and final puppy links.
- Export PDF dossiers and CSV data, create documents from editable templates,
  and make complete manual or automated JSON backups.

Puppy Tracker is a registration and monitoring aid. Calculated amounts, growth
estimates, templates and observations are not veterinary advice or diagnoses.
Owner/contact information, payments, documents and exports require a Home
Assistant administrator. Ordinary dashboard information is shared with
signed-in HA users; this is not a private portal for puppy buyers.
See [Security and privacy](docs/SECURITY_PRIVACY.md) for the permission boundaries.

## Installation

### Marketplace — Home Assistant 2026.11 and newer

1. Open **Settings → Marketplace**.
2. Add `https://github.com/aranaformae/HA_PuppyTracker` as a custom repository
   with category **Integration** if needed.
3. Install **Puppy Tracker**. A first installation can load without a restart.
4. If setup did not open, choose **Settings → Devices & services → Add
   integration → Puppy Tracker**.

Marketplace takes over existing HACS installations and custom repositories.
Do not remove or recreate Puppy Tracker to migrate. See the
[official Marketplace explanation](https://contributors.home-assistant.io/marketplace/how-it-works/).

### HACS — Home Assistant 2026.9.4 through 2026.10

1. Open **HACS → Integrations**.
2. Add `https://github.com/aranaformae/HA_PuppyTracker` as a custom repository
   with category **Integration** if needed.
3. Install **Puppy Tracker** and restart Home Assistant.
4. Choose **Settings → Devices & services → Add integration → Puppy Tracker**.

### Manual installation

Copy `custom_components/puppy_tracker/` into your Home Assistant configuration's
`custom_components/` directory, restart Home Assistant and add the integration
through **Settings → Devices & services**.

After an **update**, restart Home Assistant. Fully refresh the browser or
Companion App if the dashboard still displays an older card.

## First use

1. Open **Puppy Tracker → Configure → Nests and puppies**. Create a litter and
   fill in the parent details.
2. Add the puppies with their names, collar colours, birth times and birth
   weights. Unknown optional information can be completed later.
3. Add a **Workspace** dashboard card and choose a preset in the visual editor.
4. Use **Weigh** for weights, **Quick Log** for new observations and **Dossier**
   for finding or correcting saved entries.
5. Create a full backup through **Configure → Data and maintenance → Backup
   and import → Export backup**. Keep a copy outside Home Assistant.

Home and Mobile offer a **Getting started** checklist to administrators.
Its steps follow the actual saved data; the checklist icon reopens it.

## Dashboard cards

The integration loads its cards automatically. Add them through the dashboard
card chooser; the Workspace editor exposes options for the selected preset.

| Card | Purpose |
| --- | --- |
| **Workspace — Home** | Today, attention items and puppy overview |
| **Workspace — Growth** | Weighing and growth analysis |
| **Workspace — Journal** | Dossier, Quick Log, behavior and temperature |
| **Workspace — Care** | Carry out care, calculator, programs and reminders |
| **Workspace — Mobile** | Daily tasks together on a phone or tablet |
| **Owners** | Contacts, puppy links, preferences and payments |
| **Report & export** | PDF/CSV/JSON, documents and templates |

Example phone card:

```yaml
type: custom:puppy-tracker-workspace-card
preset: mobile
title: Puppy Tracker
```

Only Workspace, Owners and Report are supported public card types. Old
standalone cards were replaced in 0.25.0; the duplicate Timeline tab was removed
in 0.29.0. Follow the [migration guide](docs/DASHBOARD_CARDS.md#migrating-from-024)
for older dashboard YAML. Saved records are still available in Dossier.

## Find the right instructions

| Task | Guide |
| --- | --- |
| Basic daily actions, in simple language | [English](docs/USER_MANUAL.md), [Nederlands](docs/GEBRUIKERSHANDLEIDING.md) |
| Dashboard layout and card options | [Dashboard cards](docs/DASHBOARD_CARDS.md) |
| Weighing, milestones and nest comparisons | [Growth](docs/GROWTH_ANALYSIS.md) |
| Find, edit or move a saved entry | [Dossier history](docs/DOSSIER_HISTORY.md) |
| Care programs and templates | [Care programs](docs/CARE_PROGRAMS.md) |
| Reminders, notifications and lead times | [Notifications](docs/NOTIFICATIONS.md) |
| Per-kg calculations and feeding portions | [Calculator](docs/CALCULATOR.md) |
| Weight-based care amounts and stale weights | [Weight-based amounts](docs/WEIGHT_BASED_AMOUNTS.md) |
| Contacts, puppy links and payments | [Owners](docs/puppy-dossiers.md#ownercontact-card) |
| PDF dossiers, contact CSV and backups | [Reports](docs/REPORTS_EXPORTS.md), [backup and restore](docs/backup-restore.md) |
| Documents and breeder logo | [Templates](docs/DOCUMENT_TEMPLATES.md), [logo upload](docs/MANAGED_FILES.md) |

The [documentation index](docs/README.md) also covers temperature, behavior,
preference matching and automations. Implementation details belong in
[Architecture](docs/ARCHITECTURE.md); development and tests are in
[Contributing](CONTRIBUTING.md) and [Local tests](tests/README.md).

## If something looks wrong

- Check the selected litter, dossier owner, date range and category filters.
  Selecting no categories deliberately shows no matching items.
- Use **Record completion** for work just carried out; **Edit** changes an
  existing entry. **Mark as seen** only acknowledges an alert.
- Refresh the dashboard after updating. Inspect **Settings → System → Logs**
  for `puppy_tracker` errors if a problem remains.
- In older HACS, a missing update icon can be a
  [known HACS limitation](https://github.com/hacs/integration/issues/5171#issuecomment-6222990878),
  even when the integration icon is present in Devices & services.
- Keep the original JSON backup until restored data has been checked. PDFs and
  CSV files are readable exports, not restorable backups.

See the [changelog](CHANGELOG.md) for changes and [LICENSE](LICENSE) for the license.
