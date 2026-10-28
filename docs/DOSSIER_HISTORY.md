# Dossier history

The **Journal / Logboek** workspace starts with **Dossier**: one place to find,
add and manage saved observations. Quick Log remains available for fast entry;
Behavior and Temperature keep their specialist views.

## Choose whose history to view

- **All** combines litter records, the mother's records for this litter, and
  records and weights for every puppy.
- **Whole litter** shows only entries recorded for the litter itself.
- **Mother** shows the linked mother's records. The separate mother-history
  selector can include her other litters, with a litter label on each entry.
- A named puppy shows only that puppy's records and weights.

Puppy choices show name and collar color. Viewing All never changes an entry's
stored owner. **New entry** is always available to administrators; from All it
requires an explicit owner before saving. Changing category preserves that
choice and the draft. A missing owner never silently becomes the whole litter.
The owner label at the top of the editor follows the selected owner, including
the puppy's collar color.

## Read and find entries

History is visible by default, newest first. Compact entries show their type,
date, owner where needed and key values. Expand **Details** for the complete
note, care instructions and structured values. Each entry remembers whether its
details were expanded during background updates. The persistent profile note
is a separate, initially collapsed section for a selected puppy or mother.

Search titles, notes and results. Open **Filters** for categories, start/end
dates and, for administrators, deleted entries and previous weight versions.
No categories selected means no entries, including in All or Mother views.
**Clear filters** resets the date/category filters, search and deleted-version
selection; changing owner
does not automatically reset them. The empty state offers a reset when filters
hide existing entries.

The history area scrolls after its configured height. Initially it renders at
most `max_items` matches. **Show more** reveals the next batch. Search and filters
always inspect the complete loaded history, not just the first batch.

## Add and correct entries

Use **New entry** to add a saved observation. Use **Edit** (the pencil) beside an existing
entry to change it, even in All or filtered results. The three-dot menu offers
**Change owner** and **Delete**. Deleted care entries offer **Restore**.

A weight's pencil opens **Correct measurement**, preserving the original weight
version. Weight entries cannot be moved to another owner or edited as ordinary
care records. Old/deleted weight versions remain read-only.
Showing these versions does not increase the active-item count.

**To do** contains follow-ups derived from saved care entries, separate from
the completed history. It follows the owner selection, including the mother
and her selected litter history. **Record completion** creates a new registration; it
does not rewrite the original administration. Full recurring reminders and
age-based schedules remain in the Care workspace.

Administrators can change data; other users can inspect the permitted history
without write controls. Saving failures retain the open editor and typed data.

## Configure

```yaml
type: custom:puppy-tracker-workspace-card
preset: journal
default_tab: dossier
default_selected: all
tab_config:
  dossier:
    show_profile_note: true
    show_history: true
    show_weights: true
    show_details: false
    max_items: 250
    max_height: 520
```

These controls are also available in the visual editor. `show_history` and
`show_details` set initial expansion, not editing permission. `show_weights`
only changes this history view, not stored measurements or reports.

## Breaking change in v0.29.0

The duplicate Timeline tab and `puppy-tracker-timeline-card` element are removed.
Remove `timeline` from explicit tab lists, select `dossier` as the default tab,
and move relevant `tab_config.timeline` settings to `tab_config.dossier`.
Replace `show_timeline_items` with `show_history`; remove
`show_history_toggle`. The unified view uses the same saved records and weights:
no backup, export or storage migration is needed.
