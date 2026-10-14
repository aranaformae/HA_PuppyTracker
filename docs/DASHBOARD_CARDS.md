# Dashboard cards

From Puppy Tracker 0.25.0, one task-focused Workspace card replaces separate
cards for every feature. Owners and Report remain separate because they are
distinct management workflows. The integration registers all three public
cards automatically.

## Public cards

| Card | Type | Purpose |
| --- | --- | --- |
| Workspace | `custom:puppy-tracker-workspace-card` | Daily use through Home, Growth, Journal, Care or Mobile presets |
| Owners | `custom:puppy-tracker-owner-card` | Contact, placement, payment and puppy-link management |
| Report | `custom:puppy-tracker-report-card` | PDF, CSV and JSON export |

## Workspace presets

Choose a preset in the visual editor or YAML. Each preset loads only its own
surfaces and remembers the last active tab. Only the visible tab is attached
and subscribed; inactive tabs keep their local element state but do no
background work. This reduces updates and avoids unnecessary dashboard
movement.

| Preset | Tabs | Use |
| --- | --- | --- |
| `home` | Today, Attention, Puppies | Current status and exceptions; includes Summary by default |
| `growth` | Weigh, Analysis | Weighing sessions, collar-colour charts and growth analysis |
| `journal` | Quick log, Dossier, Behavior, Timeline, Temperature | All observation and dossier workflows |
| `care` | Execute, Calculator, Programs, Reminders | Complete and manage scheduled care or calculate per-kilogram amounts |
| `mobile` | Weigh, Calculator, Quick log, Today, Execute, Behavior | Touch-first daily workflow without leaving the card |

Basic examples:

```yaml
type: custom:puppy-tracker-workspace-card
preset: home
title: Puppy Tracker
```

```yaml
type: custom:puppy-tracker-workspace-card
preset: mobile
show_today_only: true
default_selected: litter
```

## Recommended dashboard structure

A compact dashboard normally needs only one Workspace instance per workflow.
This avoids repeating the same data in several cards while keeping each page
focused:

| Dashboard view | Cards | Replaces |
| --- | --- | --- |
| Home | Workspace `home` plus camera, climate or other Home Assistant cards | Separate Summary, Today, Attention and Puppies cards |
| Mobile | Workspace `mobile` | The former Mobile Controls card |
| Growth | Workspace `growth` | Separate Weighing and Growth pages |
| Journal | Workspace `journal` | Quick Log, Dossier, Behavior, Timeline, Temperature and Bulk Dossier workflows |
| Care | Workspace `care` | Care Execution, per-kilogram Calculator, Programs and Reminders cards |
| Management | Owners and Report | No change |

The standalone Today and Weighing dashboard views can usually be removed:
Today is a Home tab and Weighing is a Growth tab. Give each Workspace a unique
`state_key` when the same preset occurs more than once so remembered tabs and
filters do not overlap.

A complete six-view example, including a Home view with ordinary Home
Assistant cards, is available in
[`examples/puppy-tracker-dashboard.yaml`](examples/puppy-tracker-dashboard.yaml).
Its non-Puppy Tracker entities are installation-specific and can be replaced or
removed.

## Workspace options

| Setting | Values | Purpose |
| --- | --- | --- |
| `preset` | `home`, `growth`, `journal`, `care`, `mobile` | Selects the workflow and available tabs |
| `title` | text | Adds an optional heading above the Workspace |
| `tabs` | preset tab keys | Shows a subset of tabs from the selected preset |
| `default_tab` | one visible tab key | Selects the initial tab when no remembered tab exists |
| `litter_id` | litter ID | Fixes the initial litter |
| `show_litter_selector` | boolean | Shows or hides litter selection across every selectable Workspace tab |
| `show_summary` | boolean | Shows the Summary above Home tabs |
| `show_today_only` | boolean | Limits care occurrences on Today and Attention to today |
| `show_bulk_action` | boolean | Shows the multi-puppy action in Journal |
| `default_selected` | `all`, `litter`, `mother`, `puppy` | Sets the initial owner scope where supported |
| `puppy_id` | puppy ID | Selects a specific puppy when `default_selected: puppy` |
| `state_key` | unique text | Separates remembered tab and filter state between otherwise identical Workspaces |
| `tab_config` | mapping | Applies advanced settings to one internal surface |

Only tabs belonging to the chosen preset are accepted. The available keys are
`today`, `attention`, `puppies`, `weighing`, `analysis`, `quickLog`, `dossier`,
`behavior`, `timeline`, `temperature`, `care`, `calculator`, `programs` and
`reminders`.

Aggregate scope `all` is supported by Dossier and Timeline. Quick Log and
Temperature require one exact owner and therefore fall back to `litter` when
the workspace default is `all`. Existing dossier items remain editable in the
aggregate view; select a specific owner before adding a new item.
Both Dossier and Timeline provide title/note/result search within the current
scope and filters. Search also applies in Dossier item-management mode and is
retained after editing. Clearing the query leaves owner and category filters
unchanged. Search terms are not persisted or exported.

Quick Log, Dossier and the Journal **Multiple puppies** action share one
category schema: Note, Feeding, Temperature, Vaccination, Test/result,
Deworming, Medication, Vet visit, Milestone and Other. Their structured fields
and required-field validation therefore stay aligned. Quick Log also keeps a
Stool/urine shortcut that saves a titled note. Bulk Log remains puppy-only,
while Quick Log can write to the litter, mother or one puppy.

The visual editor changes with the selected preset. It exposes navigation and
the relevant Home, Growth, Journal, Care or Mobile surface options in grouped
sections, while writing those values to the same `tab_config` structure used
by YAML. Set `puppy_id` together with `default_selected: puppy`; it is ignored
for the other initial scopes. YAML remains available for uncommon options that
are not part of the visual editor.

`show_litter_selector: false` is inherited by Today, Attention, Puppies,
Weighing, Analysis, Quick Log, Dossier, Timeline, Temperature, Bulk, Execute,
Calculator, Programs and Reminders. It only hides the nest control; owner,
puppy, metric, period and day controls remain available. The Home Summary has
no separate nest selector because it follows the Workspace's shared nest
context.

## Advanced tab configuration

In YAML, use `tab_config` for settings that belong to one internal surface.
The visual editor writes its surface-specific controls into the same
structure. Keys are the tab names above; values are passed to that surface.
For example, a compact Growth workspace and a Journal focused on temperature
can be configured as:

```yaml
type: custom:puppy-tracker-workspace-card
preset: growth
default_tab: analysis
tab_config:
  weighing:
    show_puppies: true
    show_details: true
  analysis:
    default_range: 7d
    default_metric: weight
    show_summary: true
    show_puppy_cards: true
    show_advanced_analysis: false
    show_growth_milestones: true
    show_milestone_chart_annotations: true
```

```yaml
type: custom:puppy-tracker-workspace-card
preset: journal
tabs:
  - quickLog
  - temperature
default_tab: temperature
default_selected: mother
tab_config:
  temperature:
    default_range: 3d
    chart_height: 170
    history_limit: 10
    max_height: 520
    history_sort: newest
    show_selectors: true
    show_thresholds: true
    show_latest: true
    show_chart: true
    show_history: true
    show_editor: true
```

Useful surface-specific options include:

- `weighing`: `show_puppies`, `show_details`;
- `analysis`: `default_range`, `default_metric`, summary, analysis and milestone switches;
- `dossier`: `show_profile_note`, `show_timeline_items`;
- `behavior`: `show_profile`, `show_history`, `max_items`;
- `timeline`: `max_items`, `show_history_toggle`, `show_timeline_items`;
- `temperature`: range, chart, thresholds, history and editor options documented in [Temperature](temperature-card.md);
- `care`: `show_day_selector`, `days_ahead`, `max_items`;
- `calculator`: `active_only`, `stale_after_hours`, `max_height`, `default_unit`, `default_mode` (`per_kg` or `feeding`);
- `programs`: `show_disabled`, `max_items`, `compact`, `sort_order`.

The Mobile preset hides the care day selector by default and loads today plus
overdue care actions. Set `tab_config.care.show_day_selector: true` to browse
other days without leaving the mobile Workspace. Opening a care item uses the
full result and note editor. Its Calculator tab uses the same litter context
and latest puppy weights as the Care preset. Mobile Quick Log exposes the
complete shared dossier category list, so temperature, deworming and
medication do not require switching to the Journal Workspace.
Changing the litter in any visible Workspace surface updates the other tabs.
The Calculator's Feeding variant combines kibble and meat, with a meat-share
slider and independent kibble/meat portion counts per day. The card shows the
total feeding moments with their food breakdown; per-portion quantities are
calculated separately, without a combined per-portion total.
Each food independently supports an editable
formula, weight table, fixed g/kg rate or age-specific weight tables. Expand its settings to inspect or
change the calculation. Results show both foods and their total per puppy and
for the litter.
The allocation selector switches between proportional full daily rations and
daily kcal. Kcal mode uses an explicitly configured kcal/kg/day target and each
included food's kcal/100 g, retaining the inactive ration settings. Age tables
select the current stage from the puppy birth time (or litter birth date), with
warnings for missing ages or an age/weight outside the configured stages/table.
Both methods keep the independent food portions and total feeding moments.
Feeding preferences save automatically per litter and return after reloading,
including on other devices. The chosen variant is remembered in this browser;
the visual editor selects the initial variant when no choice is remembered. Formula sources,
weight boundaries and an example are in [Calculator](CALCULATOR.md).
The active weighing surface is retained during that change so a draft weight
and input focus are not discarded.
Within the Weigh tab, changing the selected puppy also retains the entered
weight (including an intentionally empty field), so you can enter a weight
before choosing its puppy. The dropdown marks puppies already weighed in the
current session with **Weighed** and lighter text where the browser supports
option styling. These puppies remain selectable for corrections; the marker
is cleared when the session is reset and never comes from older measurements.
The session action toggles between **Start session** and **Reset session**;
it shares one row with **Edit measurement**, including on phones. Edit opens
the exact last saved measurement with its puppy name and weight, even if a
different puppy is now selected. Saving creates a historical correction,
preserves the original measurement time, and does not add a new session count.
This action requires administrator access and is unavailable until a weight
has been saved in the current runtime. A failed correction keeps the form open.
Unusual weight jumps receive a backend pre-save check and require a second
press of Save weight for the unchanged pup/value/baseline. Ordinary weights
need no extra confirmation. Analysis adds `growth48`, `growth72` and the
optional `weightAverage48` chart mode to `default_metric`; see
[Growth analysis](GROWTH_ANALYSIS.md) for window and missing-data semantics.
The selected puppy can also show an indicative eight-week weight from a broad
14-day trend. `tab_config.analysis.show_eight_week_weight` controls visibility
and is available in the Growth visual editor. It requires at least four
different measurement times spanning seven days; it is not a breed norm.

Options inside `tab_config` override the inherited Workspace values for that
one surface. This is useful for specialist layouts, but a single top-level
`show_litter_selector`, `default_selected` or `show_today_only` setting is
clearer when every tab should behave consistently.

## Owners and Report

Owners remains a separate card:

```yaml
type: custom:puppy-tracker-owner-card
title: Baasjes
default_view: owners
csv_delimiter: comma
```

Use `default_view: owners` for contact management or `default_view: matrix` to
open directly on the puppy-preference comparison. Both choices are available
in the visual editor and the segmented control remains available in the card.
The matrix uses compact, expandable lists by puppy or by owner in narrow cards.
Wide cards show the comparison table, with selected details alongside it when
at least 1000 pixels are available. Preference ranks and actual puppy links stay
separate; switching a view never creates a link.

The create/edit form starts collapsed. Selecting an owner expands all stored
contact, placement, payment and note information, including an ordered top
three puppy shortlist with one short note per preference. The shortlist is
planning data; it does not alter placement status or create a puppy link. Its
selectors include puppies from all available litters and label them with litter
and call name. Puppy linking remains a separate step. **Export CSV** downloads
one Word/Excel-friendly row per owner-puppy link
and retains unlinked owners with empty puppy columns. Set `csv_delimiter` to
`comma` (default and suitable for Nextcloud) or `semicolon`; both choices are
also available in the visual editor. Address entry is split into street/house
number, postal code and city. Linked rows include the complete puppy and parent
contract identity, including registered/call names, coat colour, breed/type and
WALA values and both parent chip numbers. The six shortlist columns are included
on every owner row.

The **Preference matrix** is calculated from the same shortlist and puppy-link
data; it does not store a second matching state. Select one litter to place
owners on rows and puppies on columns. Cells show first, second or third choice,
whether a note exists and whether that owner is already linked to the puppy.
Puppy headers use their collar colours. The summary identifies puppies with
multiple first choices, puppies without any choice, owners without a choice and
existing links. Optional switches reveal sold/placed owners or reduce the table
to first-choice conflicts. Selecting a populated cell exposes its complete note
and an edit action without rerendering the matrix.

At narrow card widths the same information becomes a puppy-focused list with a
puppy selector. This avoids horizontal page overflow on mobile while retaining
rank, note, placement status and link information. The matrix remains planning
support only: use **Link owner to puppy** in the management view for an
authoritative link.

The complete workflow, matrix legend, inclusion rules and summary definitions
are documented in
[Owner puppy-preference matrix](OWNER_PREFERENCE_MATRIX.md).

Report also remains separate:

```yaml
type: custom:puppy-tracker-report-card
title: Rapporten
default_range: 7d
default_profile: full
```

`default_range` accepts `24h`, `3d`, `7d`, `14d`, `30d` or `all`.
`default_profile` accepts `full`, `handover` or `internal`. PDF sections remain
individually selectable in the card.

The report selection contains one unambiguous **Whole litter** option, every
individual puppy and the linked mother. Inactive puppies remain selectable so
their historical dossier can still be exported. Mother export is JSON-only;
when the mother is selected, PDF profiles and section controls are hidden.

The period filters PDF/CSV measurements, PDF chart data, care results and
general dossier items. The PDF summary, weight-attention state and owner
details intentionally show the current state. JSON remains a complete
importable litter backup and therefore does not follow presentation filters.

| PDF profile | Included content |
| --- | --- |
| `full` | Main PDF sections, including owner contact details and dossier items |
| `handover` | Main sections except weight-attention warnings and status column |
| `internal` | Main sections except owner contact details |

Configure breeder identity once under **Puppy Tracker -> Configure -> Breeder
information**. Use a local HA PNG/JPEG path such as `/local/kennel-logo.png`;
invalid images use the bundled logo instead. The old `breeder_name`,
`breeder_contact` and `logo_url` card fields no longer apply: copy their values
into the integration form once. The Report card only controls visibility.
Logo and breeder name are included by default; breeder contact details and the
stored puppy profile note are separate opt-in checkboxes for all profiles.
The profile note requires Identity. See the export guide for image limits and
privacy considerations.

Individual checkboxes can create a custom profile. **Identity** controls the
nest/puppy identity table and puppy profile fields; the report title and
headings still identify the selected subject when other sections need them.
The Identity section includes the litter date, full puppy identity and the
registered/call names, birth dates, breed/type and WALA details of both parents.
**Dossier items** includes ordinary notes, temperature, feeding, veterinary
and other dossier entries. Care-program results and behavior observations are
separate and never duplicated there. **Behavior profile** independently adds
the per-puppy summary and matching observation history. Its expandable dossier
filters can include whole-litter records,
selected-puppy records, any available categories, or none. For a single-puppy
report, whole-litter items are included once when that source is selected;
mother records remain in the mother JSON export only. The PDF language can be
automatic (following Home Assistant), Dutch or English. User-entered notes
remain as written. The preview shows the chosen scope, period, language,
sections and matching item counts before download.

See [Reports and exports](REPORTS_EXPORTS.md) for the exact section
dependencies, individual-puppy behavior, dossier filters and CSV/JSON rules.

**Contact details** is a privacy-sensitive sub-option of **Owners and placement** and is automatically
disabled when that parent section is off. A selected section remains visible in
the PDF with an explanatory empty-state message when no chart data, care result,
dossier item or linked owner data is available. A one-point chart shows a
marker; the first weight change in a selected period uses the latest earlier
effective measurement as its baseline.

## Migrating from 0.24

This is an intentional breaking change. Standalone feature-card YAML is no
longer supported. Replace old types as follows:

| Previous card types | Replacement |
| --- | --- |
| Summary, Today, Attention, Litter | Workspace with `preset: home` |
| Weighing Station, Growth Overview | Workspace with `preset: growth` |
| Quick Log, Dossier, Behavior, Timeline, Temperature, Bulk Dossier | Workspace with `preset: journal` |
| Care Execution, Care Programs, Recurring Reminders | Workspace with `preset: care` |
| Mobile Controls | Workspace with `preset: mobile` |
| Owners | No change |
| Report | No change |

Move old card options under the matching `tab_config` key. For example:

```yaml
# Before 0.25.0
type: custom:puppy-tracker-temperature-card
default_range: 14d
show_thresholds: true
```

```yaml
# From 0.25.0
type: custom:puppy-tracker-workspace-card
preset: journal
tabs:
  - temperature
default_tab: temperature
tab_config:
  temperature:
    default_range: 14d
    show_thresholds: true
```

Restart Home Assistant and fully refresh the browser or Companion App after
updating so the versioned frontend resource is reloaded.
