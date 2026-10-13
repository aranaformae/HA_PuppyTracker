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
records can be edited, deleted, restored or moved there because their source
owner remains known. To add a new record, first select the intended litter,
mother or puppy owner.

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
mother. The Dossier surface preserves and summarizes these entries without
exposing the raw score object. See [Behavior observations](BEHAVIOR.md).

Fields marked required are validated before saving in Dossier, Quick Log and
Bulk Log. Switching categories while entering data retains the draft values
for the categories already visited. Existing legacy free-text records remain
readable even when they predate the structured fields.

Care-program results are normal puppy dossier records. Their expanded details
show the care day, scheduled time, localized status, result, score,
day-specific instruction and additional care data. When item management is
enabled, status, result and score can be changed in the normal Dossier editor.
Internal program, revision, occurrence and source identifiers are preserved but
are not shown as user-facing fields.

The dossier list scrolls after 520 px. `show_timeline_items` controls whether it
starts expanded; the visible toggle and matching item count remain available.

## Changing a record owner

Use **Change owner** on a Dossier item to move it to the whole litter, the
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
from their call name and can store birth date, breed/type and WALA number. The
default breed/type for new dogs is `Multi-generation Australian Labradoodle`
and remains editable. Manage these fields under **Settings -> Devices &
services -> Puppy Tracker -> Configure**, or through the corresponding Home
Assistant actions.

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
available litter as `Litter name · puppy call name`, so equal call names remain
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
call name, birth date, breed/type and WALA columns. Internal Puppy Tracker IDs
are not exported.

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
