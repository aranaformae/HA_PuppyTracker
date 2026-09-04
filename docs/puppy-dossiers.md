# Puppy dossiers

Puppy Tracker stores the chip number as a dedicated `chip_number` field on each puppy. It is available when adding or editing a puppy, is included in the dashboard data and is printed in the per-puppy PDF dossier. The value is intentionally stored as text so leading zeroes and the formatting used by a chip registry are preserved.

Owner/contact information is stored separately in the `puppy_tracker_owners` Home Assistant storage store. Add the `custom:puppy-tracker-owner-card` to a dashboard to create, edit, remove, and link contacts. The records contain name, e-mail, telephone, address, and notes. A puppy stores only an `owner_ids` reference list, so one or more reusable contacts can be linked without duplicating personal data.

The owner store is included in the integration runtime and has websocket commands for list, save, delete, and link operations. Each contact also has a role, placement status, optional placement date, payment status (`geen`, `inschrijfgeld`, `aanbetaling`, or `volledig`), and optional payment date. The PDF report card has a `Baasjes` and a separate contact-details section toggle; when enabled, linked contact names, role, placement status/date, payment status/date, and, when allowed, e-mail/telephone details are included in the report. Full v5 backups include the reusable owner store and restore it transactionally; partial litter and puppy transfers intentionally do not.

## Dossier ownership

Every dossier record belongs to exactly one owner scope within its litter context:

| Scope | Meaning |
| --- | --- |
| `litter` | The whole nest |
| `mother` | The linked mother dog profile |
| `puppy` | One specific puppy |

From the Dossier card, use the record's owner action to move an existing record to another scope. The action keeps the record ID, timestamps and history, and updates the ownership metadata atomically. The destination can be the whole nest, the linked mother dog, or any puppy in the selected nest. A move is therefore a change of ownership, not a copy; the record appears only under its new owner after saving. Existing reminder matching follows the new owner scope from that point onward.

The mother option is available when the selected nest has a linked mother profile. Moving a record to the mother scope requires that link, while moving it back to the nest or a puppy clears the mother-specific ownership reference. The backend validates the scope and ID combination, so an invalid direct WebSocket request cannot create a record that claims puppy ownership without a puppy ID.

## Structured feeding records

The Dossier card has a dedicated **Feeding** record type. It stores the feeding type, optional amount and unit, and a wide observation/note field in the record's `data` object. This keeps feeding information searchable and exportable without forcing users to encode it in a free-text title. Quick Log also uses this same `feeding` type for its feeding shortcut, so entries made in either card remain visible in the other dossier surfaces.
