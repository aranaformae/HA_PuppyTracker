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

The Dossier, Quick Log, Timeline and Temperature cards use these same scopes.
Reminder completion also matches the exact scope: a mother's temperature record
does not complete a whole-litter or puppy reminder.

The Dossier and Timeline cards can show **All** as an aggregate view. Existing
records can be edited, deleted, restored or moved there because their source
owner remains known. To add a new record, first select the intended litter,
mother or puppy owner.

## Record types and editing

Current dossier concepts include notes, feeding, temperature, vaccination,
tests, deworming, medication, veterinary visits, milestones and other events.
Type-specific values are stored as structured fields so cards, reminders and
reports do not need to interpret free text.

Feeding supports feeding type, amount, unit and an observation. Temperature
supports a Celsius value, method/location and observation. Existing legacy
free-text records remain readable.

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

The mother destination is available only when the litter has a linked mother.
The backend rejects invalid owner/ID combinations.

## Profile notes and chip numbers

A puppy has one editable profile note for long-lived summary information.
Chronological observations belong in dossier records with their own event time.

The microchip number is a separate `chip_number` puppy field. It is stored as
text so leading zeroes and registry formatting are preserved. It can be shown
in dashboard data and included in a per-puppy PDF report.

## Owner/contact card

Add the Owners card to create and manage contacts:

```yaml
type: custom:puppy-tracker-owner-card
title: Baasjes
```

The create/edit form starts collapsed. Select **Add owner** or edit an existing
contact to expose it. Clicking an owner row expands the complete stored details,
including long notes.

Contact fields include:

- name, email, telephone and address;
- role and preferred contact method;
- placement status and placement date;
- payment status, date, amount, outstanding balance and method;
- status history and free notes.

Linking contacts to a puppy is a separate section. One or more contacts can be
linked later, and editing a contact updates the reusable information without
duplicating it into each puppy.

## Reports and backups

PDF report sections can include linked owners and, when selected, their contact,
placement and payment details. The full JSON backup includes contacts and puppy
links. Partial litter and puppy transfers intentionally omit reusable contacts
because safely remapping those links requires an explicit transfer workflow.

See [Backup, restore and transfer](backup-restore.md) for the exact backup
contract and [Architecture](ARCHITECTURE.md#dossier-record-envelope) for the
technical record model.
