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

The Dossier, Quick Log and Temperature surfaces use these same scopes.
Reminder completion also matches the exact scope: a mother's temperature record
does not complete a whole-litter or puppy reminder.

Dossier can show **All** as an aggregate view. Existing
records remain editable there because their source owner remains known. To add
from All, use New entry and choose the exact litter, mother or puppy in the dialog.

### One editing workflow

Administrators see a pencil beside each active saved dossier item in Dossier,
Today's activity list (including the mobile Workspace), Temperature
history and Behavior history. There is no separate
**Edit items** mode. Every pencil opens the same dialog with the complete saved
item and its original owner, independent of the current category/search filters.
The cards remain readable without write controls for non-administrators.

Dossier's three-dot item menu contains **Change owner** and **Delete**. Both open
an explicit dialog; deleted items in Dossier history offer
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
restores completion. Older unlinked entries and ordinary entries from other
logging routes can still complete reminders by matching their owner, category
and optional exact title. New Quick Log entries default to **Log only** and do
not complete recurring reminders unless you explicitly select one. A direct execution
is linked to the selected reminder and does not complete other reminders of the
same category. Today-only and category filters also apply to the reminder list.

Each reminder shows **Last execution**. Expand it to see the scheduled and actual
time, recorded values and the full note. **Edit log entry** corrects that exact
past registration; the reminder's own pencil still changes its schedule. If an
older completion has no linked log entry, only its known timestamp is shown.

After a new execution is saved, **Undo execution** is available beside the save
confirmation. Confirm it to remove only that new entry and recalculate planning
from the remaining history. A changed entry or a newer execution blocks undo so
later work cannot be lost. This shortcut disappears when another recurring
execution is saved, the entry is corrected, or the card is reloaded;
previously saved entries remain accessible through Last execution and
Dossier. Undo uses recoverable deletion, not permanent removal. An already-saved
retry does not offer undo for an older execution.

## Postpone one reminder moment

The clock action **Postpone once** is available in Attention, Today (including
Mobile), and Care's Reminders tab. Choose a new date/time or use a 15-, 30- or
60-minute shortcut. Only the pending moment moves: no execution is logged and
the recurrence definition stays unchanged. For fixed daily times, choose a time
before the next fixed moment; postponement cannot swallow the following turn.
If that next moment has already passed, resolve the overdue moment rather than
postponing it across later turns.

Active persistent and tagged mobile notifications are withdrawn. The reminder
stays out of Attention until the postponed time, even within the normal advance
notification window. Today and Reminders show **Postponed** with the new time;
Today's date/category filters still apply. Use **Cancel postponement** in the
same dialog to restore the original moment. The Reminders tab remains available
when Today filters hide an item.

Postponement survives restart and backup/restore. A later execution consumes the
original moment; interval reminders still follow the actual execution time.
Last execution shows both planned times when applicable. Undoing or deleting
that execution reopens its postponed moment; changing the recurrence, owner or
matching definition cancels old postponement. You can still deliberately record
an execution early, including through Quick Log's explicit reminder choice.

## Quick Log and owner selection

1. Select the intended litter and owner: the whole litter, mother or one puppy.
2. Choose a category and enter the observation and any structured values.
3. Leave **Complete reminder** on **Log only**, or select the intended open
   reminder for this owner and category. Overdue moments remain selectable.
4. Check **Log for**, then save. The selected owner stays selected for the next
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
categories or owners. Changing either clears only the reminder choice; switching
back to a category restores its field values, not its old reminder selection.
Changing litter or cancelling a changed form asks before discarding entered
values. Declining keeps both the original selection and the draft. An untouched
form closes without that extra confirmation. Background
data updates wait while the form is active. Browser-local remembered owners
are not included in backups.

After a successful save, the confirmation names the category and owner, including
the puppy's collar colour where available. Its pencil opens the exact saved
record for a quick correction. A failed save keeps all entered values for retry;
known validation errors are shown beside the relevant input.

### Reuse a previous feeding or medication entry

In Journal and Mobile Quick Log, choose the owner and Feeding or Medication,
then **Use previous entry**. The card reads that owner's current-litter dossier
on demand and copies the most recent suitable active entry by occurrence time.
It does not use an unsaved/failed draft, a deleted record, a missed care result
or a future-dated entry. There is no age-based expiry: the source's category,
owner and timestamp remain visible so you can judge whether it is still useful.
Mother history is limited to the current litter, not all her litters.

Feeding reuses food/feeding type, amount and unit. Medication reuses medicine
name and the literal dose, without recalculation. Frequency, duration, old
observations/notes and care/reminder metadata are not copied. A note-only legacy
entry is not a structured source. Missing copied fields are cleared, so a new
amount cannot inherit an unrelated unit already in the form. Current notes,
observations and other manually entered fields are retained.

Copying sets the execution timestamp to now and never changes the selected
owner. Modified forms ask for confirmation before replacement. All values remain
editable and require the normal Save action; selecting a reminder remains a
separate explicit choice. Check the medicine/dose: copying is not dosage advice.
If you explicitly change owner afterwards, the draft follows the existing rules
above and its source label still names the original owner. Use the action again
to fetch the new owner's own history.

Loading failure or missing history keeps existing input. If you type while the
read is running, it does not overwrite your newer input. Owner/category/litter
changes, cancellation, tab detachment, connection/permission changes and saving
invalidate pending reads. Source labels and draft fields are held in memory,
not browser storage or backups; only an explicitly saved record is persistent.

When you select a reminder, saving creates one new entry and completes only that
reminder. The confirmation names it and offers the same editing and confirmed
undo actions as direct reminder execution. **Log only** never silently falls
back to automatic completion, even if the new entry matches several reminders.
A lone candidate is not selected automatically. Use the refresh icon to reload
choices without losing the draft. A previous choice remains tied to its original
moment, so retrying after a lost connection cannot complete the next moment by
accident. If the reminder changed, choose its new moment explicitly or choose
Log only. If loading choices fails, Log only remains available. If the owner
disappears during an edit, choose a valid owner before saving; the draft never
silently switches to the litter. These rules also apply in Mobile.

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

Dossier has one combined history with optional weight events, dates, categories,
search and deleted/corrected history. Entries start compact; expand Details for
the complete note and structured fields. The profile note starts collapsed.
The list scrolls after its configured `max_height` (default 520 px).
`show_history` controls initial visibility; `show_weights` and `show_details`
control weight inclusion and initial entry expansion. `max_items` is the display
batch; Show more reveals older results. Search runs over the full loaded history
before that batch limit and ignores capitalization and accents. Clearing search
leaves other filters unchanged. See [Dossier history](DOSSIER_HISTORY.md).

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
The editor opens contact details first and groups address, placement, puppy
preferences, finance and notes into separate collapsible sections. The litter
selector stays outside those sections. Use a category's pencil to edit just that
part; **Edit payment** opens finance and the matrix opens puppy preferences.
History is read-only and has no editing shortcut. **Unsaved changes** appears
when values differ from the original form. Opening or closing sections does not
save or mark the form changed, and collapsing a section never excludes its data
from Save. Invalid fields automatically open their section. All changes still
use the same explicit Save/Cancel workflow and discard confirmation.
Assigned puppies are also visible in the collapsed owner row, with their call
name, collar colour and litter name. All actual links are shown, including links
across litters when **All litters** is selected; preferences alone are not assignments.
Each visible litter dossier also shows its expected pickup date and recorded
outstanding balance when present. Missing amounts stay absent, not zero; a
recorded zero stays visible. Currency follows Home Assistant's configured
currency, falling back to EUR. Different litters retain separate amounts/dates.
For reserved/sold dossiers, compact **To arrange** actions identify missing
contact details or a recorded positive outstanding balance. A missing pickup
date is flagged only once sold. Interested/option, placed and archived dossiers
do not get these prompts. Unknown balances are never inferred. Selecting an
action opens the relevant section and exact litter dossier as an unsaved draft;
ordinary Save/Cancel still applies. These are dashboard hints, not notifications.
**Sort by** defaults to name and also offers next pickup date, placement status
(interest through placed), or highest recorded outstanding amount. Unknown dates
and balances sort last, not as zero. With several matching litter dossiers, the
earliest pickup/phase or sum of known matching balances determines the order;
ties use name and stable contact identity. Filters still apply first, management
CSV follows this order, and the preference matrix retains its own name ordering.
Sorting updates only the list, not focused controls or unsaved linking choices.
Expanded contact details offer icon actions to call, compose email, open a
WhatsApp chat or copy the original value. WhatsApp requires a saved international
number (`+31...` or `0031...`); national numbers remain callable/copyable without
guessing a country. Nothing is sent automatically. Links use validated contact
values, with mail addresses safely encoded; unexpected text remains copyable
without becoming an active link. Clipboard success/failure is shown locally
without rebuilding the card. If clipboard access is denied, the text stays
selectable for manual copying. These actions do not edit stored contact values.
While adding/editing, a non-blocking hint lists contacts with the same email or
phone across all litters, including archived dossiers. Email comparison ignores
case/outer whitespace; phone separators and explicit `+`/`00` international
prefixes normalize for comparison only. National/international equivalents are
not guessed. Empty/invalid values, names and addresses are not duplicate keys;
the contact being edited is excluded. **Open existing owner** asks before
discarding a changed draft and opens the existing contact's appropriate litter
dossier. Save remains available for legitimate shared partner details. No merge,
uniqueness constraint or stored-value normalization is introduced. The hints use
the loaded snapshot; they are not a cross-device uniqueness guarantee.
The list starts on the first active litter. **Owners for** also offers all
litters and **Without litter**. Search by contact name, email, phone or linked
puppy. **Status filter** starts at **Active (including sold)**: interested,
option, reserved and sold dossiers remain visible until placed or archived.
**Sold** means the sale is agreed; **Placed** means the puppy has moved to its
new home. Neither changes payments or puppy links automatically. Choose one
placement status, **All dossiers**, or **Archived dossiers** to find other
dossiers. A specific status also includes archived dossiers with that status;
the archived label remains visible. The same selection is retained when switching
to the preference matrix. Long lists scroll inside the card at a 600px maximum.

One contact can have a separate dossier for each litter. Contact details and
general contact notes are shared; placement status, pickup date, top-three
preferences, payments, history and litter notes are independent per litter.
Choose **Dossier for litter** in the expanded details to inspect another
dossier, or **Add litter dossier** to register interest in another litter
without selecting a puppy. In the editor, switching litter asks before discarding
unsaved changes. A new litter starts with empty payment and preference fields.

**Archive dossier** hides only that litter's dossier, not the contact or its
other dossiers. Deleting a contact removes all its dossiers and is refused
while any puppy still links to the contact; unlink those puppies first.

On upgrade, old placement/payment data is assigned automatically only when
puppy links and preferences identify exactly one litter. Otherwise it remains
under **Without litter**. Expand that contact and use **Assign dossier to litter**
to move the original data explicitly. Existing target dossiers are never
overwritten. No balance is copied to several litters.
Changing or closing a modified contact form asks before discarding it. A failed
save or another card redraw retains contact, preference, payment and note inputs.
The save confirmation names the contact and offers a pencil to reopen it. These
drafts stay in memory only; they are not auto-saved contacts or backup data.

Changes made on another device appear automatically when you are not entering
data. An open editor, changed puppy-link selection or focused input postpones
refresh; cancelling or leaving the input resumes it. Reconnecting keeps your
draft, while changing user or losing administrator access clears private data.
If another device changed the same contact (including another litter dossier)
or the puppy's links, saving is blocked and your input remains available. Use
**Load latest details** to review the current data; discarding unsaved changes
requires confirmation. If that read fails, your draft is still retained.
When a save succeeds but the overview cannot refresh, the confirmation remains
and **Refresh overview** retries only loading, never the saved action. Reload
open dashboards after upgrading so they use the guarded editing workflow.

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
record a first, second and third choice for the selected litter dossier. Each
selector shows that litter's puppies as `Litter name · puppy call name (collar colour)`, so equal call names remain
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
A final puppy link creates an empty litter dossier when needed. To move existing
unassigned payment or preference history, use **Assign dossier to litter** first;
linking alone never guesses which historical balance belongs to this litter.

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
and owners. The shared **Status filter** includes sold dossiers by default and
offers each individual status, all dossiers or archived dossiers. Select a cell
to read the complete preference note or open
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

In an owner's expanded **Financial** section, select **Record payment in full**
to open the contact editor with payment status **Paid in full**, outstanding
amount **0** and today's date proposed when no final-payment date is present.
Check or adjust the date and payment method, then save. The shortcut itself
does not write data, and cancelling leaves the saved payment unchanged.
Selecting **Paid in full** directly in the editor has the same effect. While
that status is selected, the outstanding amount stays read-only at zero;
choose another status to enter an outstanding amount again. Reverting an
unsaved status change restores the previous balance. The agreed total,
registration fee, deposit and calculated final-payment amount are unchanged.
Existing fully-paid contacts are normalized to zero outstanding without
inventing a missing historical payment date. The saved status, date and zero
balance are included in backups, CSV export and owner-enabled PDF reports.

Use **Export selection (CSV)** in the Owners card to download the visible
contact list for Word, Nextcloud or another mail-merge tool. The UTF-8 file
contains localized column headings and one row per owner-puppy link. Choose
`csv_delimiter: comma` (the default, suitable for Nextcloud) or
`csv_delimiter: semicolon` (often convenient for regional Excel settings) in
YAML or the visual card editor. An owner linked to two puppies therefore has two
rows with the payment and preference data of the corresponding litter dossier.
An unlinked candidate receives one row per visible litter dossier, with the
litter name but empty puppy columns. A contact without a litter receives an
unassigned row with empty litter and puppy columns. In management, the litter,
search and status filters also apply to this export; select **All litters**,
clear search and choose **All dossiers** for a complete list. In the matrix,
CSV exports matching dossiers for the selected litter/status, respecting
**First-choice conflicts only** when enabled. Hidden management search/scope
settings do not affect matrix exports. The mobile puppy/owner selector focuses
the comparison; it does not narrow the dossier export to one match.
Contact, placement, payment, notes, the three puppy preferences with their notes
and status history are included, together with litter notes and archive state.
Linked rows also contain the litter, puppy
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
