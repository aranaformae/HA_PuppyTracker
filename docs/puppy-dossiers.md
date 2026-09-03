# Puppy dossiers

Puppy Tracker stores the chip number as a dedicated `chip_number` field on each puppy. It is available when adding or editing a puppy, is included in the dashboard data and is printed in the per-puppy PDF dossier. The value is intentionally stored as text so leading zeroes and the formatting used by a chip registry are preserved.

Owner/contact information is stored separately in the `puppy_tracker_owners` Home Assistant storage store. Add the `custom:puppy-tracker-owner-card` to a dashboard to create, edit, remove, and link contacts. The records contain name, e-mail, telephone, address, and notes. A puppy stores only an `owner_ids` reference list, so one or more reusable contacts can be linked without duplicating personal data.

The owner store is included in the integration runtime and has websocket commands for list, save, delete, and link operations. Each contact also has a role, placement status, optional placement date, payment status (`geen`, `inschrijfgeld`, `aanbetaling`, or `volledig`), and optional payment date. The PDF report card has a `Baasjes` section toggle; when enabled, linked contact names, role, placement status/date, payment status/date, and available e-mail/telephone details are included in the report.
