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
6. Choose **Save and download document**. The archive retains the exact PDF and
   the template/data snapshot used to create it. Later edits do not change it.

Changing the selection invalidates the previous check. If another dashboard
changes source data or the template after checking, final saving is refused
until you check again. Retrying the same save after a lost response does not
create a duplicate document.

## Standard templates

Six neutral starter documents are included in **Dutch and English**:

| Dutch | English | Purpose |
| --- | --- | --- |
| Overdrachtsbewijs | Puppy handover | Short handover record with puppy, buyer, date and signatures |
| Pupgegevens | Puppy information | Puppy identity, breeder/owner contacts and a separate parent-information page |
| Betalingsoverzicht | Payment overview | Agreed amounts, recorded payment dates and actual outstanding balance |
| Betalingsbewijs | Payment receipt | Printable receipt with known parties and puppy filled in; actual amount, receipt date, payment method and signature are completed by hand |
| Reserveringsafspraken | Reservation notes | Contacts, puppy/planning, agreed instalments, space for additional arrangements and signatures |
| Overdrachtschecklist | Handover checklist | A printable checklist and notes area for reviewing the handover together |

The selector groups standard documents by language and keeps your own templates
separate. Its initial default follows the HA interface language; later explicit
selections are retained while the card is open. **Document date** is the date
used by the `contract.datum` field, including in non-contract documents.

Choose a standard template directly, or **Copy and edit** it to create your own
version. Built-ins can be downloaded but not overwritten or deleted. Copies and
imports count toward the 30-custom-template limit; built-ins do not. Optional
identity/contact fields are marked accordingly in the starters, so a puppy not
yet microchipped or incomplete parent registration does not block those forms.
The original short Dutch handover still requires the fields it previously used.

Payment and reservation documents distinguish planned instalments from recorded
receipts; they do not certify that the configured amounts were paid. The payment
receipt likewise does **not** derive an individual payment from the agreed
instalments or outstanding balance. Fill in the actual amount, date, method and
recipient's signature on the printed form before using it as proof of receipt.
Generating or archiving the blank form does not record a payment. The printed
checklist starts unchecked and does not change dossier or care-program results.
The Owners card can now record individual receipts per litter dossier, including
partial payments and voided corrections. The printable payment receipt does not
yet choose one of those entries automatically; its transaction details are
still completed by hand.
No private sales contract, legal clauses or personal breeder branding is bundled.
Import your own contract template as JSON, or create a new one. The module fills
and lays out your text; it does not assess its legal or veterinary contents.

## Edit or exchange a template

Use **Copy and edit**, **New template**, or **Import template**. Copies of
standard templates and new templates start in **Simple** mode. Imported
templates start in **Advanced** mode. Switch modes at any time; both edit the
same template, so no conversion or separate save is needed. A local recovery
draft also restores the selected mode.

Simple mode shows the document as named, collapsible sections. Data fields in
text appear between `⟦...⟧` as readable labels instead of `{{ ... }}` codes. Search by a field's
ordinary name (for example, *father microchip*), then select it to insert it at
the cursor. The same search works for data-block rows and in Advanced mode.
Use **Add section here** above or between sections to put a new part exactly
where it belongs. **More actions** holds move, duplicate and delete controls.
Advanced mode shows the underlying placeholder text and the original block
controls when you need finer editing.

The editor supports these collapsible parts:

| Part | Purpose |
| --- | --- |
| Heading | Section title that stays with the following content where possible |
| Text | Paragraphs, with an optional bold setting |
| Data block | Selected fields as labelled identity/contact rows |
| Signatures | Text followed by room for seller and buyer signatures |
| Page break | Start the next part on a new page |

In Advanced mode, insert a field from the picker or type its identifier inside double braces,
for example `{{ pup.naam }}`. The field picker groups fields by buyer, puppy,
parents, payment and other subjects. Move, duplicate or delete parts with their
buttons. **Restore deleted block** restores the last deletion without undoing
later edits; up to 20 deleted parts are retained during the editing session.
Use **Go to block** to navigate a long template inside its scrolling list.
Data blocks have an ordered field list with individual move/remove buttons;
the displayed order is also the order in the PDF. Article
numbers and cross-references are ordinary text: they are not renumbered.
Long text continues on another page; headers, page numbers and optional initials
space are generated automatically. The editor offers **No watermark**, **Text**
or **Logo**. Text appears faintly and diagonally on every page; enter a custom
label such as `CONCEPT`, or leave it empty to use the document title. Logo mode
centres a faint copy of your configured breeder logo, with the Puppy Tracker
logo as fallback. Upload/change the breeder logo through the integration's
**Breeder information** settings.

The **Header logo** checkbox is independent: a logo watermark also works with
the header logo switched off. Watermarks are drawn behind document content
and retain fixed light transparency so the text remains readable. These choices
are saved in the template and included in JSON template downloads and full
backups. They apply to the layout preview and final PDF; archived PDFs retain
their existing appearance.

The PDF uses a print-friendly layout with a large title, an optional logo beside
it, section dividers and aligned data rows with a lightly shaded label column.
Ordinary data groups stay together where they fit; long values continue safely
on the next page. Signatures have separate seller and buyer areas, and the
optional initials footer provides space for both parties. Templates do not need
to be reimported for layout improvements. Previously archived PDFs keep their
original bytes and appearance.

All fields used by a template are required unless explicitly selected under
**Fields allowed to remain empty**. An empty optional field prints `n.v.t.` in
Dutch or `N/A` in English. A known zero monetary amount is a value, not missing
data. Only make a date or amount optional when that is appropriate for the text.
If several buyers are selected, a contact field is considered complete only
when each selected buyer has it.

The optional-field list shows only fields used in the current template. Before
saving or previewing, the editor points to incomplete parts, unknown fields and
size limits. Click an error to open the affected part.

**View preview** displays the current draft inside the document card, with field
labels in place of personal values. On wide screens it appears beside the
editor; on phones it opens in a full-screen overlay with page and zoom controls. It works
before choosing buyers and does not save a template or contract. Use **Download
PDF** in the preview for a separate copy. The PDF viewer loads only when needed;
changes to the template close the older preview, so choose **View preview**
again after editing. If the browser cannot display it, the download still works.
Actual names and addresses can change pagination, so still check the filled PDF
before final saving. **Download draft** also works for an incomplete draft, so you
can keep a local copy before leaving the editor; correct validation errors before
using that draft as a saved template.

**Document language** controls field labels, dates and empty-field markers;
it does not translate the contract text. The interface follows HA's Dutch or
English language. Editing keeps the draft during dashboard refreshes and failed
saves. Changes are also automatically kept as a **local concept** after a short
typing pause. When you return in the same browser with the same Home Assistant
user, the editor restores the template, incomplete text and open parts. Pending
changes are flushed when the page is hidden or left. Autosaving does not replace
the focused input or save the shared Home Assistant template.

**Draft saved locally** and **Template saved** are different: only **Save
template** stores the template in Home Assistant for use on other devices and
in full backups. Local concepts belong to this browser/profile and are not
included in those backups. Clearing browser site data removes them. Cancelling
a changed draft asks before discarding it and its local copy; successfully
saving the template removes that recovery copy too.

If local storage is unavailable/full, the card preserves the open editor and
shows a message to keep the page open or download the draft. If another tab
changes the recovery copy, the current editor does not overwrite it; download
your current draft before closing that tab. A restored edit retains its original
server revision, so a conflicting shared-template edit still cannot silently
overwrite another editor's changes. Contract selections, buyer data and final
document previews are not automatically saved as local concepts.

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
One built-in neutral example is in
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

Optional watermark settings within version 1:

```json
"logo": false,
"watermark": true,
"watermark_type": "text",
"watermark_text": "CONCEPT"
```

`watermark_type` accepts `text` or `logo`; `watermark: false` switches either
off. `watermark_text` is literal text (up to 150 characters), not a substituted
data field. An omitted/empty text uses the document title. Existing templates
without these optional keys keep their previous text-watermark behaviour and
revision. Import templates using the new keys into a version that supports
these options.

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
