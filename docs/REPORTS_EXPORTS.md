# Reports and exports

The Report card creates a readable PDF dossier, a weight CSV or an importable
JSON backup. PDF and CSV are presentation exports; JSON deliberately keeps the
complete stored history so it can be restored later.

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

## PDF sections

Every main section can be enabled or disabled independently.

| Section | Content |
| --- | --- |
| Identity | Litter identity plus puppy collar colour, chip number, birth time and birth weight |
| Summary | Current weight and growth summary for the selected puppy or puppies |
| Chart | Weight chart for the selected period, using each puppy's collar colour |
| Measurements | Effective weight measurements, difference, kind and note |
| Care results | Completed/missed care, result, score, day-specific instruction and note |
| Behavior profile | Derived profile, criterion/group averages and matching observation history |
| Dossier items | Ordinary dossier entries selected by source and category |
| Weight attention | Current canonical weight warnings and status column |
| Owners and placement | Linked contact name, role, placement and payment state |
| Contact details | E-mail, telephone and address for linked owners |

**Contact details** is a privacy-sensitive child option of **Owners and
placement**. Turning the parent off also turns contact details off. Care results
and behavior observations have their own sections and are excluded from
ordinary dossier items, so records are not printed twice.

Disabling **Identity** removes the identity tables and puppy profile line, but
the document title and section headings still identify the report subject.
When an enabled section has no matching data, the PDF contains a clear empty
state instead of silently omitting the section.

## PDF profiles

| Profile | Sections |
| --- | --- |
| `full` | All sections, including owner contact details |
| `handover` | All sections except weight-attention warnings/status |
| `internal` | All sections except owner contact details |

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

The bundled Puppy Tracker brand logo is included in generated PDFs. Replacing
the integration's logo file is an advanced customization and can be overwritten
by an update.

## CSV and JSON

- **CSV** contains effective weight measurements for the selected litter or
  puppy and selected period. It is intended for external analysis.
- **Litter JSON backup** always contains the complete importable litter data,
  including history required for safe restore. PDF section/category/period
  filters do not alter it.
- **Mother JSON** contains the selected mother's dossier and can be limited to
  the current litter or include every linked litter.

Use [Backup, restore and transfer](backup-restore.md) for backup scopes,
automatic file rotation, validation and restore behavior.
