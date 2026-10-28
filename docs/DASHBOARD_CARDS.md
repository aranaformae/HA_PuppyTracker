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
| `journal` | Dossier, Quick log, Behavior, Temperature | All observation and dossier workflows |
| `care` | Carry out care, Calculator / Care programs, Reminders | Daily care and calculations, separated from schedule management |
| `mobile` | Weigh, Calculator, Quick log, Today, Carry out care, Behavior | Touch-first daily workflow without leaving the card |

Care navigation is grouped into **Daily** (Carry out care, Calculator) and
**Management** (Care programs, Reminders). Dutch labels are **Dagelijks**,
**Zorg uitvoeren**, **Rekentool**, **Beheer**, **Zorgprogramma's** and
**Herinneringen**. Daily work records what happened; management changes the
schedule or instructions. On phones the same groups appear in the view selector.
No extra navigation step or dashboard card is needed. Mobile keeps daily tasks
only, using the same **Carry out care** label.

With custom `tabs`, empty groups disappear. Daily tabs precede management tabs;
the configured order within each group is retained. Keyboard navigation follows
that visible order. The YAML keys (`care`, `calculator`, `programs`, `reminders`),
tab options and saved data do not change.

Administrators also have a settings icon beside Care navigation, labelled
**Manage litter details**. It opens the Puppy Tracker integration page; choose
**Configure → Manage litter → Edit litter details** there for litter details,
or use the direct puppy actions. Existing inline drafts are
protected by the usual discard confirmation and saves block navigation.

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

## Getting started

Home and Mobile include a small administrator-only setup checklist. It opens
automatically only when that administrator first uses it without any litters.
Existing litters do not trigger it. The checklist icon in the navigation bar
opens it manually; the close button hides it. That preference is stored per HA
user, shared across devices, independently of dashboard YAML.

Steps follow the selected litter: create a litter, link its mother, add puppies,
record the first non-birth weighing and export a backup. Steps are derived from
stored data, not editable checkboxes. Deleted or superseded measurement versions
and a birth weight alone do not count; an active correction does. The automatically opened
checklist closes when all steps are complete; a manually opened checklist stays
available until closed.

Setup actions open the existing Puppy Tracker integration page, where **Configure**
offers litter and puppy management. Mobile uses its Weigh tab when available;
otherwise the existing weighing surface opens in a bounded dialog. No dashboard
URL or extra card is needed. The backup action creates the same complete JSON
export as integration data management, including external stores and managed files.

Administrators can also add or edit puppy profiles directly in the Home
Workspace's **Pups** tab (the litter overview). Select the litter, use **Pup
toevoegen** above the list, or tap the pencil beside a puppy to edit its name,
collar colour, birth details, chip number and profile note. Save to update the
profile; if someone changed the puppy meanwhile, reopen the editor and review
the newer data. The integration's **Configure** route remains available.

Full/litter JSON exports and successful full/litter file backups can complete the
backup step. Merely generating a signed download link, a puppy-only export, PDF,
CSV or a failed backup cannot. This tracks an exported backup, not proof that the
browser saved the file or that an off-device backup is current. New evidence is
remembered across HA restarts; older exports cannot be reconstructed retrospectively.

Checklist updates replace only the checklist region, not active forms or tabs.
Hidden checklists keep no additional update subscription.

## Recommended dashboard structure

A compact dashboard normally needs only one Workspace instance per workflow.
This avoids repeating the same data in several cards while keeping each page
focused:

| Dashboard view | Cards | Replaces |
| --- | --- | --- |
| Home | Workspace `home` plus camera, climate or other Home Assistant cards | Separate Summary, Today, Attention and Puppies cards |
| Mobile | Workspace `mobile` | The former Mobile Controls card |
| Growth | Workspace `growth` | Separate Weighing and Growth pages |
| Journal | Workspace `journal` | Dossier, Quick Log, Behavior, Temperature and Bulk Dossier workflows |
| Care | Workspace `care` | Care Execution, per-kilogram Calculator, Programs and Reminders cards |
| Management | Owners and Report | No change |

The standalone Today and Weighing dashboard views can usually be removed:
Today is a Home tab and Weighing is a Growth tab. Give each Workspace a unique
`state_key` when the same preset occurs more than once so remembered tabs and
filters do not overlap.

Today keeps the completed day's weighing counts after finishing/resetting a
session or reloading the dashboard. Outside an active session it counts each
active puppy once when it has a valid measurement today, in Home Assistant's
timezone. Yesterday's completed session does not count as today's progress.

A complete six-view example, including a Home view with ordinary Home
Assistant cards, is available in
[`examples/puppy-tracker-dashboard.yaml`](examples/puppy-tracker-dashboard.yaml).
Its non-Puppy Tracker entities are installation-specific and can be replaced or
removed.

## Unified Dossier (v0.29.0 breaking change)

The Journal preset now starts with Dossier and has four tabs: Dossier, Quick
Log, Behavior and Temperature. The former Timeline tab and internal
`puppy-tracker-timeline-card` element are removed, not aliased. Remove
`timeline` from explicit `tabs`, use `default_tab: dossier`, and move relevant
settings from `tab_config.timeline` into `tab_config.dossier`. Replace Dossier's
former `show_timeline_items` option with `show_history`. Remove
`show_history_toggle`; advanced history is now under Filters. No saved care or
weight data is migrated. See [Dossier history](DOSSIER_HISTORY.md).

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
`behavior`, `temperature`, `care`, `calculator`, `programs` and
`reminders`.

Aggregate scope `all` is supported by Dossier. Quick Log and
Temperature require one exact owner and therefore fall back to `litter` when
the workspace default is `all`. Existing dossier items remain editable in the
aggregate view. New entry asks for an explicit owner when opened from All.
Puppy names consistently show `Name (collar colour)` in lists, dossier/activity
items, weighing feedback, chart labels, care actions and reminders, as well as
selectors, owner linking/preferences, bulk selection and the Change owner dialog.
Without a collar colour they show only the name; a colour already used as the
complete name is not repeated (case-insensitive), so `Nova (paars)` and `Paars`
remain distinct without displaying `Paars (paars)`. Cross-litter choices retain their litter prefix.
This affects display labels only, not puppy IDs, saved selections or CSV values.
Dossier provides title/note/result search within the current
scope and filters. The query is retained after editing. Administrators can use each
saved item's pencil directly, without a card-level edit mode. Dossier,
Today's activity list (also in Mobile), Temperature
and Behavior history share one item editor. Planned care keeps its execution
dialog; weight entries open a correction, not a dossier edit. Dossier's item menu
contains owner changes and deletion; deleted records can be restored.
Deworming and vaccination follow-ups in Dossier and Attention instead show a
checkmark for **Record completion**: review the proposed product/vaccine, enter
the actual execution and optional next due date, then save a new logbook entry.
The original administration remains unchanged. This is separate from acknowledging
an Attention alert, which does not create a care record.
Recurring reminders offer the same check-and-save workflow in Attention, Today
(including Mobile), and Care's Reminders tab. Category-specific inputs create
a new entry for the reminder's fixed owner. **Mark as seen** is a separate eye
action, not completion. Today's reminder list shares the category filters and
scroll container with the activity list and respects `show_today_only` in the
Home Assistant timezone. Successful saves identify the owner and offer editing
of the new logbook item; the reminder's pencil still edits its schedule.
The compact **Last execution** row expands to show planned/actual times, values
and the complete note, with **Edit log entry** for that exact registration.
Immediately after a new save, **Undo execution** asks for confirmation and
recalculates planning without changing older history. Undo is refused when the
entry has changed or a newer execution exists. Read-only users can inspect the
details but cannot edit, execute or undo. Expanded rows stay expanded through
background refreshes of the same card.
The clock action **Postpone once** moves only the pending reminder, without
creating a log entry. It shares one draft-safe dialog across these surfaces,
offers date/time and short-delay choices, and shows the next fixed-time boundary.
Postponed reminders leave Attention until their new time but remain visible in
Today/Mobile and Reminders, subject to date/category filters. **Cancel
postponement** restores the original moment. See
[Postpone one reminder moment](puppy-dossiers.md#postpone-one-reminder-moment).
Clearing the query leaves owner and category filters unchanged. Search terms are
not persisted or exported. See [Dossier editing](puppy-dossiers.md#one-editing-workflow).

Quick Log, Dossier and the Journal **Multiple puppies** action share one
category schema: Note, Feeding, Temperature, Vaccination, Test/result,
Deworming, Medication, Vet visit, Milestone and Other. Their structured fields
and required-field validation therefore stay aligned. Quick Log also keeps a
Stool/urine shortcut that saves a titled note. Bulk Log remains puppy-only,
while Quick Log can write to the litter, mother or one puppy.
The **Multiple puppies** action fixes the litter, selected puppies and shared
values when saving starts. Selection, form changes and Workspace navigation
stay locked until that batch finishes. A partial failure keeps only the failed
puppies selected, with the original values, so retrying does not repeat the
successful entries. Background refreshes cannot replace an active draft or
change a running batch.
Quick Log keeps your chosen owner when opening another category, saving or
refreshing data. A remembered category owner is only an initial suggestion
before you choose an owner; an explicitly configured mother or puppy takes
precedence over that suggestion.
Its **Complete reminder** selector defaults to **Log only**. Only enabled open
reminders for the exact litter, owner and category appear, including overdue
moments. Saving with a choice completes only that reminder; Log only completes
none. Changing owner/category clears the choice while retaining typed values.
The refresh icon preserves the draft and the originally selected moment for
safe retries. Confirmation names the completed reminder and offers editing and
undo. The same controls are used by Mobile's Quick Log tab.
See [Quick Log and owner selection](puppy-dossiers.md#quick-log-and-owner-selection)
for draft behavior and the difference between initial defaults and manual choices.

The visual editor changes with the selected preset. It exposes navigation and
the relevant Home, Growth, Journal, Care or Mobile surface options in grouped
sections, while writing those values to the same `tab_config` structure used
by YAML. Set `puppy_id` together with `default_selected: puppy`; it is ignored
for the other initial scopes. YAML remains available for uncommon options that
are not part of the visual editor.

`show_litter_selector: false` is inherited by Today, Attention, Puppies,
Weighing, Analysis, Quick Log, Dossier, Temperature, Bulk, Execute,
Calculator, Programs and Reminders. It only hides the nest control; owner,
puppy, metric, period and day controls remain available. The Home Summary has
no separate nest selector because it follows the Workspace's shared nest
context.

## Drafts and save feedback

Quick Log, Owners, Temperature, Behavior, profile notes, Bulk Log, Programs,
Reminders and care-result entry protect entered values. Cancelling or replacing
a changed form asks before discarding it; empty, untouched forms do not add a
confirmation step. Failed saves retain the draft, and known validation problems
appear beside their fields. Save confirmations identify the item or owner;
saved-record, contact, program and reminder confirmations offer an edit action
when their saved ID is available. Bulk Log offers edits for successful entries
while keeping failed puppies selected for retry.

Workspace tab switches retain inline drafts without prompting. A requested
litter change checks drafts on hidden tabs too and asks once before replacing
them. A native weighing/entity update does not silently discard a draft or
reassign it to another owner: that surface keeps its original litter and values.
Selectors show the actual owner of the draft. Navigation is blocked while its
save is in progress. Once the retained draft is saved or cancelled, reopening
its tab follows the current Workspace litter again. Closing a saved-item dialog
still uses its own discard guard. Deleting a reminder or program asks for confirmation.

Drafts are temporary memory only. They are not added to backups or browser
storage and do not survive a full page reload or removal of the Workspace.
This is not automatic dossier/contact saving. Calculator preferences retain
their separate, existing per-litter automatic-save behavior.

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
- `dossier`: `show_profile_note`, `show_history`, `show_weights`, `show_details`, `max_items`, `max_height`;
- `behavior`: `show_profile`, `show_history`, `max_items`;
- `temperature`: range, chart, thresholds, history and editor options documented in [Temperature](temperature-card.md);
- `care`: `show_day_selector`, `days_ahead`, `max_items`;
- `calculator`: `active_only`, `stale_after_hours`, `max_height`, `default_unit`, `default_mode` (`per_kg` or `feeding`);
- `programs`: `show_disabled`, `max_items`, `compact`, `sort_order`.

Temperature and Behavior confirm the saved item and its owner even if the
subsequent overview refresh fails. **Refresh overview** retries only the read;
it does not save another copy. If saving itself fails, the draft stays open.

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
`show_puppies: false` hides only the puppy list: the selected puppy, next puppy
and enabled weighing details remain visible from the initial load. Session
selection and next/remaining puppy indicators use backend IDs, including when
puppies share the same name or collar colour.

The session action toggles between **Start session** and **Reset session**;
it shares one row with **Edit measurement**, including on phones. Edit opens
the exact last saved measurement with its puppy name and weight, even if a
different puppy is now selected. Saving creates a historical correction,
preserves the original measurement time, and does not add a new session count.
This action requires administrator access and an available last saved measurement.
A failed correction keeps the form open.
An interrupted session shows **Resume / Close session** with saved progress;
the shared ordinary/mobile surface blocks new weights until it is resolved.
**Undo** names the exact saved puppy and weight and is available for two minutes.
It restores session progress without erasing history, including after automatic
advance or completion. After expiry it stays disabled without shrinking the card.
See [Weighing workflow](GROWTH_ANALYSIS.md#weighing-workflow) for recovery and limits.
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

The create/edit form starts collapsed. Assigned puppies appear directly in each
owner row with call name, collar colour and litter name, without expanding it.
When creating or editing, contact details start open. Address, placement, puppy
preferences, finance and notes can be opened independently; the chosen litter
stays visible above them. A pencil beside a detail category opens that part of
the editor, and the matrix opens puppy preferences. A draft indicator shows
unsaved changes without refreshing the form. Collapsed fields are still included
when saving. Validation reveals the relevant section; toggles do not save data,
and open sections and input survive redraws and failed saves.
Multiple puppy links are supported; preferences alone do not count as assignments.
The **Owners for** filter starts on the first active litter and also offers
**All litters** and **Without litter**. Search matches contact details and linked
puppy names. Completed and archived dossiers start hidden and can be revealed.
The owner list scrolls internally above 600px. Each contact has independent
placement, preference, payment and note data per litter; contact/address details
are shared. The expanded **Dossier for litter** selector switches dossiers, and
**Add litter dossier** reuses a contact for another litter before a puppy is
selected. **Archive dossier** affects only the selected litter. Ambiguous old
data is preserved under **Without litter**, with an explicit assignment action
that never overwrites an existing target dossier.

Changes made on another device appear automatically. While an editor, changed
puppy-link selection or focused input is active, refresh waits so typing and
scroll position are not disturbed. Cancelling the editor resumes refresh.
If a contact or puppy link changed elsewhere before saving, the card keeps your
input and offers **Load latest details**. Discarding changed input requires
confirmation; the older form cannot overwrite the newer details. A confirmed
save whose overview refresh fails remains saved, with a separate **Refresh
overview** action that never repeats the write. Reconnecting retains same-user
drafts; changing user or losing administrator access clears private card data.

Selecting an owner reveals independently
collapsible categories: **Contact details**, **Address details**, **Placement**,
**Top 3 puppy preferences**, **Financial**, **Notes** and **Status history**.
Notes keeps general contact notes and litter-specific notes separately labelled.
Contact, placement and notes start open; the remaining categories start closed.
Open/closed choices are retained separately for each owner during the card session,
including when switching owners or refreshing data. Category toggles do not reload
the card or make service calls. Notes use the full available width and remain
fully readable without truncation when expanded. The ordered top-three shortlist
has one short note per preference. The shortlist is
planning data; it does not alter placement status or create a puppy link. Its
selectors include puppies from all available litters and label them with litter
and call name. Puppy linking remains a separate step. **Export CSV** downloads
one Word/Excel-friendly row per owner-puppy link
and retains unlinked candidates once per visible litter dossier, with empty
puppy columns. The shared **Status filter** defaults to **Active (including
sold)**. Placed and archived dossiers start hidden; select any individual status,
**All dossiers** or **Archived dossiers** to include them. Specific statuses
include archived dossiers with that status. Sold and placed describe sale versus
handover; payment status remains separate. **Export selection (CSV)** follows
the open view: litter/search/status in management, selected litter/status and
matching owner rows in the matrix (including its conflicts-only filter).
Each row uses its own litter payment data. Set `csv_delimiter` to
`comma` (default and suitable for Nextcloud) or `semicolon`; both choices are
also available in the visual editor. Address entry is split into street/house
number, postal code and city. Linked rows include the complete puppy and parent
contract identity, including registered/call names, coat colour, breed/type and
WALA values and both parent chip numbers. The six shortlist columns are included
on every owner row.

Phone and chip numbers are exported verbatim as quoted text, including leading
zeroes and international `+` prefixes. CSV has no column-type metadata: spreadsheet
software can still interpret these values as numbers when opening the file.
Import the original CSV with **Phone** and all chip-number columns set to **Text**,
rather than opening and resaving it with automatic number detection. Merely
changing the display format after conversion does not restore lost digits.
See the [Excel import guidance](https://support.microsoft.com/en-au/excel/keeping-leading-zeros-and-large-numbers)
or [Calc Text Import](https://help.libreoffice.org/latest/en-US/text/shared/00/00000208.html).

The **Preference matrix** is calculated from the same shortlist and puppy-link
data; it does not store a second matching state. Select one litter to place
owners on rows and puppies on columns. Cells show first, second or third choice,
whether a note exists and whether that owner is already linked to the puppy.
Puppy headers use their collar colours. The summary identifies puppies with
multiple first choices, puppies without any choice, owners without a choice and
existing links. The status filter is shared with management and retains its
selection across tabs. An optional switch reduces the table to first-choice
conflicts. Selecting a populated cell exposes its complete note
and an edit action without rerendering the matrix.

At narrow card widths the same information becomes a puppy-focused list with a
puppy selector. This avoids horizontal page overflow on mobile while retaining
rank, note, placement status and link information. The matrix remains planning
support only: use **Link owner to puppy** in the management view for an
authoritative link.

Management rows also show each visible dossier's pickup date and recorded
outstanding amount. A visible/total contact count and **Clear filters** reveal
hidden contacts across all litters without resetting sorting or puppy-link drafts.
The expandable **Pickup schedule** follows the management filters, groups dates
and opens the corresponding placement editor. It excludes placed/archived
dossiers and scrolls after 360px; past dates remain marked for review.
Phase-aware attention actions open the relevant fields;
name/pickup/status/balance sorting applies before CSV export. Expanded contact
details offer call, mail, WhatsApp and copy actions. The contact editor warns
about possible duplicate email/phone matches without blocking a legitimate
shared contact value or changing stored data automatically. See the
[owner workflow](puppy-dossiers.md#ownercontact-card) for the exact inclusion,
sorting, contact-link and duplicate-comparison rules.

The complete workflow, matrix legend, inclusion rules and summary definitions
are documented in
[Owner puppy-preference matrix](OWNER_PREFERENCE_MATRIX.md).

Report also remains separate. Its **PDF report** and **Data export and backup**
sections can be expanded or collapsed independently. The PDF section starts
open; data export starts closed. Opening the latter reveals CSV and the
importable JSON backup. Their open state survives ordinary card refreshes.
PDF profile and language are inside the PDF section; litter, puppy and period
remain above both sections because they also determine the CSV export.

Its collapsible **Documents and contracts** panel creates and archives
per-puppy contracts from editable text/field templates. It has its own litter,
puppy and buyer selections, independent of the PDF dossier's period and section
switches. No extra card type or YAML options are needed. See
[Document templates](DOCUMENT_TEMPLATES.md).

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
| Dossier, Quick Log, Behavior, Temperature, Bulk Dossier | Workspace with `preset: journal` |
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
