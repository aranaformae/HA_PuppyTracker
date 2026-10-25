# Documents and contracts

The **Report & export** card has a collapsible **Documents and contracts**
section. It creates a PDF for one puppy and its linked buyer(s), using reusable
text and fields from Puppy Tracker. Only Home Assistant administrators can use
the editor, generate documents or read the archive. No extra dashboard card is
needed.

## First contract

1. In **Settings → Devices & services → Puppy Tracker → Configure → Breeder
   information**, enter the breeder's name, representatives, address, phone,
   email, registration, UBN, IBAN and account holder. Upload the logo there too.
   The existing free-text report contact field remains separate.
2. Complete the puppy and parent identities in the integration options. Add or
   update the buyers in the Owners card and link them to the puppy.
3. Open **Documents and contracts**, choose a template, litter and puppy, then
   explicitly select the **primary buyer**. Payment amounts and pickup date
   come from that buyer's dossier for the selected litter. Additional buyers
   must also be linked to the puppy; their contact details are included too.
4. Fill the contract date and signing location. Choose **Check and download PDF
   preview**. The card lists missing required fields; the preview marks them.
5. Complete missing source data, press **Refresh** and check again. Review the
   downloaded PDF. Only a complete, current preview can be saved to the archive.
6. Choose **Save and download contract**. The archive retains the exact PDF and
   the template/data snapshot used to create it. Later edits do not change it.

Changing the selection invalidates the previous check. If another dashboard
changes source data or the template after checking, final saving is refused
until you check again. Retrying the same save after a lost response does not
create a duplicate document.

The included Dutch **Overdrachtsbewijs** is a short, neutral example showing
fields and signature space. No private sales contract, legal clauses or breeder
branding is bundled. Import your own contract template as JSON, or create a new
one. The built-in example can be copied but not overwritten. The module fills
and lays out your text; it does not assess its legal or veterinary contents.

## Edit or exchange a template

Use **Copy and edit**, **New template**, or **Import template**. The editor
supports these collapsible parts:

| Part | Purpose |
| --- | --- |
| Heading | Section title that stays with the following content where possible |
| Text | Paragraphs, with an optional bold setting |
| Data block | Selected fields as labelled identity/contact rows |
| Signatures | Text followed by room for seller and buyer signatures |
| Page break | Start the next part on a new page |

Insert a field from the picker, or type its identifier inside double braces,
for example `{{ pup.naam }}`. The field picker groups fields by buyer, puppy,
parents, payment and other subjects. Move, duplicate or delete parts with their
buttons. **Restore deleted block** restores the last deletion without undoing
later edits; up to 20 deleted parts are retained during the editing session.
Use **Go to block** to navigate a long template inside its scrolling list.
Data blocks have an ordered field list with individual move/remove buttons;
the displayed order is also the order in the PDF. Article
numbers and cross-references are ordinary text: they are not renumbered.
Long text continues on another page; headers, page numbers and optional initials
space are generated automatically. Logo and a faint **text** watermark can be
switched independently. There is no image-background/watermark editor.

All fields used by a template are required unless explicitly selected under
**Fields allowed to remain empty**. An empty optional field prints `n.v.t.` in
Dutch or `N/A` in English. A known zero monetary amount is a value, not missing
data. Only make a date or amount optional when that is appropriate for the text.
If several buyers are selected, a contact field is considered complete only
when each selected buyer has it.

The optional-field list shows only fields used in the current template. Before
saving or previewing, the editor points to incomplete parts, unknown fields and
size limits. Click an error to open the affected part.

**Layout preview (PDF)** downloads the current draft with field labels in place
of personal values. It works before choosing buyers and does not save a template
or contract. Use it to check paragraphs, page breaks and field order. Actual
names and addresses can change pagination, so still check the filled PDF before
final saving. **Download draft** also works for an incomplete draft, so you
can keep a local copy before leaving the editor; correct validation errors before
using that draft as a saved template.

**Document language** controls field labels, dates and empty-field markers;
it does not translate the contract text. The interface follows HA's Dutch or
English language. Editing keeps the draft during dashboard refreshes and failed
saves; cancelling a changed draft asks before discarding it. Drafts are not saved
across browser reloads. A conflicting template edit never silently overwrites
another editor's changes.

Download a template as JSON to edit it externally or import it into another
installation. The JSON contains wording and field identifiers, not filled buyer
data. Text you manually enter in a template is included in that download.
Removing a custom template does not remove already saved contracts.

Template editing and contract saving also work when Home Assistant is opened
through a local HTTP address. If importing fails, the card distinguishes an
unreadable file, invalid JSON and an unsupported template. For an unreadable
iCloud file, download it fully in Files and select it again. An editor error is
not reported as a problem with the template file.

## Template format

The format is `puppy_tracker_document_template`, version `1`. A small working
example is available in [document-template-example.json](examples/document-template-example.json).
The built-in neutral example is in
[handover-example.nl.json](../custom_components/puppy_tracker/document_templates/handover-example.nl.json).
Private templates are imported into your own Home Assistant installation and
are not distributed with Puppy Tracker. Full backups of that installation do
include its imported templates and must remain private.

```json
{
  "format": "puppy_tracker_document_template",
  "version": 1,
  "name": "Overdrachtsbewijs",
  "language": "nl",
  "logo": true,
  "watermark": false,
  "initials": true,
  "optional_fields": [],
  "blocks": [
    {"type": "heading", "text": "Overdracht"},
    {"type": "data", "text": "Pup", "fields": ["pup.naam", "pup.chipnummer"]},
    {"type": "text", "text": "{{ koper.naam }} neemt {{ pup.naam }} over op {{ overdracht.datum }}."},
    {"type": "signature", "text": "{{ contract.plaats }}, {{ contract.datum }}"}
  ]
}
```

Templates are plain text with substitution, not HTML, Markdown, Jinja or DOCX.
There are no executable expressions, loops or external file includes. Unknown
fields, invalid blocks and unsupported format versions are rejected.

| Prefix | Available field suffixes |
| --- | --- |
| `fokker.` | `naam`, `vertegenwoordigers`, `straat`, `postcode`, `plaats`, `telefoon`, `email`, `registratie`, `ubn`, `iban`, `rekeninghouder` |
| `koper.` | `naam`, `straat`, `postcode`, `plaats`, `telefoon`, `email` |
| `nest.` | `naam` |
| `pup.` | `nestnaam`, `naam`, `bandkleur`, `geboortedatum`, `geslacht`, `vachtkleur`, `chipnummer`, `soort` |
| `vader.` / `moeder.` | `nestnaam`, `naam`, `geboortedatum`, `chipnummer`, `soort`, `registratie` |
| `betaling.` | `totaal`, `inschrijfgeld`, `aanbetaling`, `datum_aanbetaling`, `slotbetaling`, `datum_slotbetaling`, `openstaand` |
| `overdracht.` | `datum` |
| `contract.` | `datum`, `plaats` |

`pup.nestnaam` is the puppy's registered name; `nest.naam` identifies the litter.
Parent `registratie` uses WALA. Monetary fields use euros.
`betaling.slotbetaling` is the agreed final instalment (total minus registration
fee and deposit); `betaling.openstaand` is the actually unpaid balance. These
are deliberately different. The contract date/place are entered for this
document only; they do not change the buyer dossier.

## Archive and backups

Saved documents can be downloaded or explicitly deleted from the archive.
They are historical snapshots, not editable dossier entries. To correct one,
change the source/template and generate a new document. Deleting or unlinking
a buyer or puppy does not automatically erase a saved contract.

Full JSON backups and full backup-to-file runs include custom templates,
archive metadata, exact PDF bytes and their data/template snapshots. Full
replacement restores them together. Litter/puppy exports and merge transfers
do not transfer the global archive; they retain the destination archive.
New backups use **format v7**; v4/v5/v6 remain readable. Older Puppy Tracker
versions cannot read v7, so use the matching/newer integration for restoration.

Files live privately under `/config/puppy_tracker/files/`, not `www`. Contract
downloads use the admin WebSocket API; the logo URL cannot expose them. Keep
downloaded PDFs, template text and full backups appropriately private.

Limits: 30 custom templates, 150 kB per template, 200 parts, 12,000 characters
per part, four buyers per document, 100 saved documents, 2 MB per PDF and 32 MB
total managed files. The JSON snapshot limit is 512 kB. Full-backup file imports
accept up to 128 MiB. Delete/export obsolete archive items deliberately when a
limit is reached; no contract is silently removed.
