# Puppy dossiers and owners

Puppy Tracker separates chronological care records, reusable owner contacts and
per-puppy identity fields. This prevents contact changes from rewriting dossier
history and lets a contact be created before puppy placement is known.

## Dossier ownership

Every dossier record belongs to exactly one owner scope within its litter:

| Scope | Meaning |
| --- | --- |
| `litter` | The whole litter |
| `mother` | The persistent mother-dog profile linked to the litter |
| `puppy` | One specific puppy |

The Dossier, Quick Log, Timeline and Temperature surfaces use these same scopes.
Reminder completion also matches the exact scope: a mother's temperature record
does not complete a whole-litter or puppy reminder.

The Dossier and Timeline surfaces can show **All** as an aggregate view. Existing
records remain editable there because their source owner remains known. To add
a new record, first select the intended litter, mother or puppy owner.

### One editing workflow

Administrators see a pencil beside each active saved dossier item in Dossier,
Timeline, Today's activity list (including the mobile Workspace), Temperature
history and Behavior history. There is no separate
**Edit items** mode. Every pencil opens the same dialog with the complete saved
item and its original owner, independent of the current category/search filters.
The cards remain readable without write controls for non-administrators.

Dossier's three-dot item menu contains **Change owner** and **Delete**. Both open
an explicit dialog; deleted items in Dossier and Timeline history offer
**Restore**, not editing. Changing owner
uses a named destination selector rather than a numbered prompt.

The editor stays open with its draft during background refreshes and failed
saves. Closing a changed draft asks for confirmation. While saving, actions are
disabled to avoid duplicate submissions. Closing returns focus without scrolling
the page. Removing the source card also removes its editor.

Planned care occurrences are not stored dossier items: their existing execution
dialog records the result and notes. Once saved, the dossier result can be edited
with the shared editor. A weight entry opens a measurement **correction** instead
of becoming a dossier note; the original measurement remains in its version history.

### Complete a planned deworming or vaccination

The checkmark beside a deworming/vaccination follow-up in Dossier or Attention
opens **Record completion** (**Uitgevoerd registreren**), not an edit of the
earlier administration. Check the owner and execution date, review or change the
suggested product/vaccine, and enter the actual dose and any notes. An optional
**Next due date** schedules the next follow-up; leave it empty when none is needed.

The execution date starts at now. Old doses, administration weights, batch
numbers, reactions and notes are not copied. Nothing is completed until saving
succeeds. Cancelling or a failed save leaves the reminder open. Successful saving
adds a new logbook item for the same puppy, mother or litter, preserves the
earlier record unchanged, and resolves only its linked due date. The new entry
and the original can still be corrected from their history pencils.

Deleting the new completion reopens the original follow-up; restoring it resolves
that follow-up again. An independently entered care record does not automatically
resolve every reminder of the same category. Backups retain the link; PDF reports
show the actual care entries without internal linking IDs.

## Execute a recurring reminder

Recurring reminders have a separate **Record completion** action in Attention,
Today's reminder list (also in Mobile), and the Reminders tab under Care. It
opens a new entry for the reminder's exact litter, mother or puppy and category.
The reminder's matching title is proposed; enter the actual medication, dose,
food, temperature or notes before saving. Earlier values are not copied.

Saving adds a new logbook entry and advances the reminder. Its schedule remains
unchanged: intervals follow the actual execution time, fixed times keep their
clock schedule, and a one-time reminder finishes. An early execution consumes
the selected fixed-time slot; merely passing its time does not complete it.
**Mark as seen** only acknowledges the alert and never records an execution.

Failed saving retains the form. Retrying a saved execution does not duplicate
it; the confirmation offers its exact log entry for editing. Deleting or moving
that entry away from its owner recalculates the reminder, while restoring it
restores completion. Ordinary Quick Log entries can still complete reminders
by matching their owner, category and optional exact title. A direct execution
is linked to the selected reminder and does not complete other reminders of the
same category. Today-only and category filters also apply to the reminder list.

## Quick Log and owner selection

1. Select the intended litter and owner: the whole litter, mother or one puppy.
2. Choose a category and enter the observation and any structured values.
3. Check **Log for**, then save. The selected owner stays selected for the next
   entry, including after a live update or a category change.

Puppy choices show the name and collar colour, for example `Alice (Red)`.
The label does not change the saved puppy ID or record ownership.

Quick Log remembers the last owner used for each category in this browser. It
uses that history only when opening the first category in a new card session
without a manually chosen owner or a configured mother/puppy default. Once an
owner has been chosen, opening Note or another category does not switch back to
that category's older owner. Saving, cancelling and background refreshes do not
reapply a configured default puppy. The same rules apply in Journal and Mobile.

The draft keeps its timestamp, note and category-specific fields when switching
categories. Changing owner or litter, or cancelling a changed form, asks before
discarding entered values. Declining keeps both the original selection and the
draft. An untouched form closes without that extra confirmation. Background
data updates wait while the form is active. Browser-local remembered owners
are not included in backups.

After a successful save, the confirmation names the category and owner, including
the puppy's collar colour where available. Its pencil opens the exact saved
record for a quick correction. A failed save keeps all entered values for retry;
known validation errors are shown beside the relevant input.

Quick Log creates entries; it is not an editor for saved records. Use a pencil
in one of the history views described above to correct an existing entry.

## Record types and editing

Current dossier concepts include notes, feeding, temperature, vaccination,
tests, deworming, medication, veterinary visits, milestones and other events.
Type-specific values are stored as structured fields so cards, reminders and
reports do not need to interpret free text.

| Category | Structured fields |
| --- | --- |
| Note / Other | Free title and note |
| Feeding | Feeding type, amount, unit and observation |
| Temperature | Celsius value (required), method/location and observation |
| Vaccination | Vaccine (required), indication, batch, veterinarian, clinic, reaction, administration weight and next due date |
| Test / result | Test name, result and laboratory |
| Deworming | Product (required), active ingredient, amount/unit, free-text dose, route, batch, administrator, administration weight and next due date |
| Medication | Medication, dose, frequency and duration |
| Vet visit | Veterinarian, clinic, reason, diagnosis and treatment |
| Milestone | Milestone and category |

Dossier, Quick Log and Bulk Log use this same category list and the same
type-specific fields. Quick Log additionally offers **Stool / urine** as a
shortcut for a titled note. Adding a normal dossier category to the shared
schema therefore makes it available in all three general logging workflows.
Care Programs and Recurring Reminders also use this list when choosing which
dossier type a completion should create.

Behavior observations are also timestamped puppy dossier records, but are
created in the dedicated **Behavior** surface because one observation can hold
multiple 1-5 criterion scores. They are puppy-only: changing the owner may
correct an observation to another puppy, but not move it to the litter or
mother. Dossier summarizes these entries without exposing the raw score object;
the shared editor provides the individual criterion scores, observer and context.
See [Behavior observations](BEHAVIOR.md).

Fields marked required are validated before saving in Dossier, Quick Log and
Bulk Log. Switching categories while entering data retains the draft values
for the categories already visited. Existing legacy free-text records remain
readable even when they predate the structured fields.

Care-program results are normal puppy dossier records. Their expanded details
show the care day, scheduled time, localized status, result, score,
day-specific instruction and additional care data. Status, result and score can
be changed in the shared item editor from any surface displaying that result.
Internal program, revision, occurrence and source identifiers are preserved but
are not shown as user-facing fields.

The dossier list scrolls after 520 px. `show_timeline_items` controls whether it
starts expanded; the visible toggle and matching item count remain available.
Both Dossier and Timeline have a search field for titles, notes and results,
including care-program results. Search ignores capitalization and accents;
multiple words must all occur somewhere in those fields. It is combined with
the selected owner, categories and (in Timeline) dates/history settings.
Clearing the search leaves those other filters unchanged. Timeline searches
the complete loaded scope before applying its display limit.

Search also applies to editable results, including the combined **All** scope.
A matching item is edited under its original owner. The modal editor does not
change the card's search, owner or categories. After saving, an item that no longer
matches the current search/filter disappears from that list. Search terms are
temporary card state, not saved data or part of backups. Internal care
program/occurrence IDs are not searched.

## Changing a record owner

Use the three-dot menu's **Change owner** on a Dossier item to move it to the whole litter, the
linked mother or another puppy. This is a move, not a copy: the same record ID,
timestamps and audit history are retained and the item appears only under its
new owner after saving.

Behavior observations are the exception: their destination list contains only
other puppies because a longitudinal profile always belongs to one puppy.

The mother destination is available only when the litter has a linked mother.
The backend rejects invalid owner/ID combinations.

## Profile notes and chip numbers

A puppy has one editable profile note for long-lived summary information.
Chronological observations belong in dossier records with their own event time.

The microchip number is a separate `chip_number` puppy field. It is stored as
text so leading zeroes and registry formatting are preserved. It can be shown
in dashboard data and included in a per-puppy PDF report.

Puppy identity also keeps the **nestnaam** (official/registered name),
**roepnaam**, birth date, sex, coat colour, collar colour and breed/type as
separate values. Mother and father profiles distinguish their registered name
from their call name and can store birth date, breed/type, WALA number and a
separate microchip number. Parent chip numbers are optional text fields, preserve
leading zeroes and are included in PDF identity output, both CSV exports and
JSON backups. The default breed/type for new dogs is
`Multi-generation Australian Labradoodle`
and remains editable. Manage these fields under **Settings -> Devices &
services -> Puppy Tracker -> Configure**, or through the corresponding Home
Assistant actions.

In the management forms, optional saved values are prefilled and can be cleared
before submitting. Clearing a puppy's birth weight also removes its active
birth-weight measurement; the historical measurement remains available for
restore. An unchanged birth time retains its original stored precision.

## Owner/contact card

Add the Owners card to create and manage contacts:

```yaml
type: custom:puppy-tracker-owner-card
title: Baasjes
csv_delimiter: comma
```

The create/edit form starts collapsed. Select **Add owner** or edit an existing
contact to expose it. Clicking an owner row expands the complete stored details,
including long notes.
Changing or closing a modified contact form asks before discarding it. A failed
save or another card redraw retains contact, preference, payment and note inputs.
The save confirmation names the contact and offers a pencil to reopen it. These
drafts stay in memory only; they are not auto-saved contacts or backup data.

Contact fields include:

- name, email, telephone, street/house number, postal code and city;
- role and preferred contact method;
- placement status, actual placement date and expected pickup date;
- an ordered top three of preferred puppies, with a short note per preference;
- payment status, total amount, registration fee, deposit amount/date, actual
  outstanding amount, final-payment date and method;
- status history and free notes.

### Puppy preferences and final placement

Open **Add owner** or **Edit owner** and use **Top 3 puppy preferences** to
record a first, second and third choice. Each selector shows puppies from every
available litter as `Litter name · puppy call name (collar colour)`, so equal call names remain
distinguishable. All three rows are optional. When used, fill them in order and
select each puppy only once. Every selected puppy can have a separate note of up
to 240 characters.

This shortlist is planning information. It does not:

- change the owner's placement status;
- reserve or sell a puppy;
- add the owner to that puppy's linked contacts.

Use the separate **Link owner to puppy** section when placement is final. A
puppy can have multiple linked contacts. Linking does not erase the shortlist,
so the original matching considerations remain available until you edit or
clear them. If a selected puppy is later unavailable or removed, the saved
position is shown as unavailable instead of silently switching to another pup.

### Comparing preferences

Use **Preference matrix** at the top of the Owners card to compare one litter at
a time. On a wide card, owners are rows and puppies are columns. Every populated
cell shows the preference rank, a note indicator where applicable and a link
indicator when the owner is already connected to that puppy. Puppy headings use
the stored collar colour, while totals below each puppy show the number of first,
second and third choices.

The summary highlights shared first choices, puppies without preferences,
owners who have not selected a puppy for the litter and existing owner-puppy
links. **First-choice conflicts only** reduces the matrix to the affected pups
and owners. Sold and placed owners are hidden initially and can be revealed with
the adjacent switch. Select a cell to read the complete preference note or open
that owner in the editor.

On a narrow card, the matrix automatically becomes a per-puppy list. Choose a
puppy to see interested owners in rank order without horizontally scrolling the
dashboard. These views never reserve, sell or link a puppy automatically.

See [Owner puppy-preference matrix](OWNER_PREFERENCE_MATRIX.md) for the complete
matching workflow, exact inclusion and counting rules, signal legend, mobile
behavior and troubleshooting.

### Payments

The final-payment amount is shown as a calculated read-only value:
`total amount - registration fee - deposit`. **Actual outstanding amount** is a
separate editable value, so partial or additional payments after the deposit can
be represented without changing the agreed payment schedule. The registration
fee plus deposit cannot exceed the configured total amount.

Use **CSV exporteren** in the Owners card to download the complete visible
contact list for Word, Nextcloud or another mail-merge tool. The UTF-8 file
contains localized column headings and one row per owner-puppy link. Choose
`csv_delimiter: comma` (the default, suitable for Nextcloud) or
`csv_delimiter: semicolon` (often convenient for regional Excel settings) in
YAML or the visual card editor. An owner linked to two puppies therefore has two
rows; an owner without a puppy is kept once with empty litter and puppy columns.
Contact, placement, payment, notes, the three puppy preferences with their notes
and status history are included. Linked rows also contain the litter, puppy
registered name and call name, birth date, sex, coat and collar colours, chip
number and breed/type. Father and mother each have separate registered name,
call name, birth date, breed/type, WALA and chip-number columns. Internal Puppy
Tracker IDs are not exported.
The card refreshes saved contact and puppy/parent data before downloading, so
recently entered parent chip numbers are included without reopening the card.
If refreshing fails, no file is downloaded and the card shows the error.
Telephone and chip numbers retain their original text in the CSV. Import these
columns as text in a spreadsheet or mail-merge tool to prevent that application
from removing leading zeroes; CSV itself cannot specify column types.

Legacy contacts with one free-form address are migrated without data loss: the
complete old address becomes the street field, while postal code and city stay
empty until you split them manually.

## Reports and backups

PDF report sections can include linked owners and, when selected, their contact,
placement schedule and detailed payment values. The preference shortlist is not
currently printed in PDF reports; use the Owners-card CSV when that planning
information is needed outside Home Assistant. This CSV is a presentation export
and cannot be restored. The full JSON backup includes contacts, preferences and
puppy links.

Partial litter and puppy transfers intentionally omit reusable contacts because
safely remapping those links requires an explicit transfer workflow.

See [Backup, restore and transfer](backup-restore.md) for the exact backup
contract and [Architecture](ARCHITECTURE.md#dossier-record-envelope) for the
technical record model.
