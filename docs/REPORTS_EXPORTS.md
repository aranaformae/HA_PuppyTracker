# Reports and exports

Reports and all CSV/JSON/PDF exports require a Home Assistant administrator,
regardless of selected sections. Owner/contact reads and signed JSON backup
downloads follow the same policy. See [Security and privacy](SECURITY_PRIVACY.md).

The Report card creates a readable PDF dossier, a weight CSV or an importable
JSON backup. The separate Owners card exports contact, placement and puppy
preference data as a mail-merge CSV. PDF and CSV are presentation exports; JSON
deliberately keeps the complete stored history so it can be restored later.

```yaml
type: custom:puppy-tracker-report-card
title: Reports
default_range: all
default_profile: full
```

`default_range` accepts `24h`, `3d`, `7d`, `14d`, `30d` or `all`.
`default_profile` accepts `full`, `handover` or `internal`.

## Choose the report subject

Select a litter first, then choose one of these subjects:

- **Whole litter** includes every puppy in that litter. Inactive puppies remain
  part of the report and historical export.
- **One puppy** creates an individual dossier for that puppy. Whole-litter
  dossier records can still be included through the dossier-source filter.
- **Mother** offers JSON dossier export only. It can contain the mother's
  complete history across all linked litters or only the selected litter.

The preview immediately shows the selected subject and matching counts before
the PDF is downloaded.

While an export is being prepared, its choices and download buttons are locked.
The download uses the litter, subject, period, language and PDF options selected
when it started, even if fetching the logo takes longer. Background updates wait
until it finishes. A failed export unlocks the controls so you can retry; it does
not start a second download automatically. Removing the card or losing
administrator access cancels the pending download.

## PDF sections

Every main section can be enabled or disabled independently.

| Section | Content |
| --- | --- |
| Identity | Litter date, full puppy contract identity and registered/call names, birth dates, breed/type, WALA and chip numbers for both parents |
| Summary | Current weight and growth summary for the selected puppy or puppies |
| Chart | Weight chart for the selected period, using each puppy's collar colour |
| Measurements | Effective weight measurements, difference, kind and note |
| Care results | Completed/missed care, result, score, day-specific instruction and note |
| Behavior profile | Derived profile, criterion/group averages and matching observation history |
| Dossier items | Ordinary dossier entries selected by source and category |
| Weight attention | Current canonical weight warnings and status column |
| Owners and placement | Linked contact name, role, placement and payment state |
| Contact details | E-mail, telephone, street/house number, postal code and city for linked owners |
| Logo | Custom logo, or bundled logo when no valid custom image is available |
| Breeder name | Configured kennel/breeder name |
| Breeder contact details | Configured breeder contact text, independently optional |
| Puppy profile note | Stored free-text puppy profile note, only with Identity enabled |

**Contact details** is a privacy-sensitive child option of **Owners and
placement**. Turning the parent off also turns contact details off. Care results
and behavior observations have their own sections and are excluded from
ordinary dossier items, so records are not printed twice.

The Owners-card top-three puppy shortlist is placement-planning data, not a
linked-owner fact, and is therefore not included in the current PDF owner
section. It remains available in Home Assistant, the Owners CSV and a complete
JSON backup.

Disabling **Identity** removes the identity tables and puppy profile line, but
the document title and section headings still identify the report subject.
When an enabled section has no matching data, the PDF contains a clear empty
state instead of silently omitting the section.

Names and section headings stay with the information that follows. Compact
identity tables stay together, and ordinary records move to the next page
instead of being cut in half. Exceptionally long records can continue across
pages, with the table header repeated. The weight chart has light gridlines,
regular weight-axis values and date labels; short periods also show times.
The growth lines retain each puppy's collar colour.

## PDF profiles

| Profile | Sections |
| --- | --- |
| `full` | Main sections, including owner contact details |
| `handover` | Main sections except weight-attention warnings/status |
| `internal` | Main sections except owner contact details |

All built-in profiles include the logo and configured breeder name. Breeder
contact details and puppy profile notes require explicit selection, even in
the full profile. Disabling Identity also disables Puppy profile note.

## Breeder branding and profile notes

Open **Settings -> Devices & services -> Puppy Tracker -> Configure -> Breeder
information**. Set the kennel/breeder name, contact text and local logo path
once for all reports. **Upload logo** accepts a PNG/JPEG directly from your
computer or phone. Reopen the form to preview the saved logo; uploading another
image replaces it. **Remove uploaded logo** deletes that managed image after
the settings are saved. Do not select upload and remove at the same time.

An uploaded logo takes precedence. The optional **Logo path** remains a fallback:
for example, use `/local/kennel-logo.png` for an image
stored as `/config/www/kennel-logo.png`. On the Report card, choose only which
details to include using Logo, Breeder name and Breeder contact details.

Existing `breeder_name`, `breeder_contact` and `logo_url` card fields are no
longer used. Copy their values into the central form once, then remove those
obsolete YAML fields. Card configuration cannot be migrated automatically
because it belongs to Home Assistant's dashboard, not Puppy Tracker's storage.

Upload the image to Home Assistant's `www` directory to use `/local/...`.
Use a same-origin PNG or JPEG of at most 2 MB and 16 million pixels. The browser
converts it to a white-backed RGB JPEG, scales the longest side to at most
1024 pixels and sends at most 512 KB of JPEG data. The PDF preserves the aspect
ratio within a 96 x 64 point box. Transparent areas become white.
An unavailable, external, oversized or invalid image falls back to the bundled
logo. Turning Logo off excludes both logos and skips image loading.

Uploaded logos are normalized to a bounded, white-backed JPEG without original
image metadata and stored privately under `/config/puppy_tracker/files/`.
Preview and report downloads use authenticated routes with short-lived signed
URLs. The integration's metadata database contains references, not image bytes.

Breeder information and the uploaded image are included in complete JSON
and full backup-to-file exports (backup format v6). Full replace restores both
metadata and the image, even on another installation; merge-as-new and
partial pup/litter imports keep the existing central identity. Older full
backups without breeder fields restore empty identity fields and the default
logo. The optional legacy logo path is backed up, but its file in `www` must be backed up
separately by Home Assistant. The PDF contact and profile-note switches are independent from owner
contact details; review all three before sharing a report. Profile notes are
printed for the selected puppy, or each puppy in a whole-litter report, and
are current identity data rather than period-filtered dossier entries.

Changing any checkbox creates a custom selection. **Save profile** stores that
selection in this browser's local card state. A saved custom profile is not
integration data and is therefore not part of a JSON backup or automatically
shared with another browser.

## Dossier filters

When **Dossier items** is enabled, its expandable filters control two separate
dimensions:

- sources: whole-litter records, selected-puppy records, both or neither;
- categories: any combination of Note, Feeding, Temperature, Vaccination,
  Test/result, Deworming, Medication, Vet visit, Milestone and Other.

For an individual puppy report, enabling both sources prints matching
whole-litter records once and that puppy's matching records. Mother records are
not mixed into a puppy PDF; use the mother JSON export for those.

## Period and current state

The period applies to:

- PDF and CSV weight measurements;
- PDF chart points;
- PDF care results;
- PDF behavior observations and the profile derived from those observations;
- PDF ordinary dossier items.

Summary metrics, weight-attention state and owner/placement information show
the current state because they describe the report subject now. The first
measurement inside a limited period still compares with the latest effective
measurement before that period when one exists.

## Language and entered text

PDF language can follow Home Assistant automatically or be fixed to Dutch or
English. Labels, status text and structured values are translated. User-entered
names, titles, notes, results and care instructions remain exactly as entered.

The bundled Puppy Tracker brand logo is the fallback when no valid central
logo is available. Replacing the integration's logo file is an advanced customization and can be overwritten
by an update.

## CSV and JSON

- **CSV** contains effective weight measurements for the selected litter or
  puppy and selected period. It is intended for external analysis.
- **Owners CSV** is downloaded with **Export selection (CSV)** in the Owners card.
  In management it follows litter/search/status filters; in the preference
  matrix it uses the selected litter/status and matching owner rows, including
  the conflicts-only filter. Hidden management search/scope settings do not
  affect matrix downloads. The mobile owner/puppy selector focuses the
  comparison, not the exported dossiers. It contains one row per matching
  owner-puppy link, or one row per visible unlinked litter dossier. A dossier
  without a puppy retains the litter name; unassigned contacts have blank litter
  and puppy columns. For a complete list use management, select all litters,
  clear search and choose **All dossiers** in **Status filter**. The card's
  `csv_delimiter` option selects `comma` (default, including Nextcloud) or
  `semicolon` (useful for some regional Excel settings). Delimiters, quotes and
  line breaks inside values are safely quoted. It includes contact and placement
  data, the top three puppy preferences with their short notes, the detailed
  payment schedule and actual outstanding amount, shared contact notes, litter
  notes, archive state and status history. Payment and preference fields always
  come from the row's litter dossier, never another placement for that contact.
  The six preference columns are repeated for each linked-puppy row; an unlinked
  candidate still receives one row per visible dossier with those preference values.
  Linked puppy rows add registered and call names, birth date,
  sex, coat and collar colours, microchip number and breed/type. Both parents
  add registered and call names, birth date, breed/type, WALA and chip number without
  exposing internal IDs.
  Phone and chip columns preserve the saved text, including leading zeroes.
  CSV has no column-type metadata: import them as text rather than letting a
  spreadsheet infer numbers. See [CSV privacy and import limits](SECURITY_PRIVACY.md#diagnostics-logs-and-exports).
- **Litter JSON backup** always contains the complete importable litter data,
  including history required for safe restore. PDF section/category/period
  filters do not alter it.
- **Mother JSON** contains the selected mother's dossier and can be limited to
  the current litter or include every linked litter.

Use [Backup, restore and transfer](backup-restore.md) for backup scopes,
automatic file rotation, validation and restore behavior.
