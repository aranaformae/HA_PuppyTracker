import { DocumentTemplateEditor, DOCUMENT_BLOCK_KINDS as KINDS } from "./puppy-tracker-document-editor.js";
import { DocumentDraftStore } from "./puppy-tracker-document-draft.js";
import { escapeHtml as esc, languageForHass, puppySelectorLabel, downloadExportFile, preserveScrollPosition, createUuid } from "./puppy-tracker-card-common.js";

const templateUsesLogo = template => Boolean(template?.logo || (template?.watermark && template?.watermark_type === "logo"));

const COPY = {
  nl: {
    draftHint: "Wijzigingen worden automatisch als concept in deze browser bewaard.", draftPending: "Concept lokaal bewaren…", draftSaved: "Concept lokaal bewaard. Het sjabloon is nog niet opgeslagen in Home Assistant.", draftRestored: "Je lokale concept is hersteld. Gebruik Sjabloon opslaan om het definitief op te slaan.", draftUnavailable: "Automatisch bewaren is niet gelukt. Houd deze pagina open of download je concept.", draftRestoreFailed: "Het lokale concept kon niet worden hersteld. Je kunt een gedownload concept opnieuw importeren.", draftConflict: "Een ander tabblad heeft een concept bewaard. Deze invoer is behouden; download je concept voordat je deze pagina sluit.", draftClearFailed: "De lokale conceptkopie kon niet worden verwijderd. Controleer deze bij het opnieuw openen.",
    watermark: "Watermerk", watermarkNone: "Geen watermerk", watermarkTextMode: "Tekst", watermarkLogoMode: "Logo", watermarkText: "Watermerktekst", watermarkTextHint: "Leeg laten om de documenttitel te gebruiken.", watermarkLogoHint: "Gebruikt het ingestelde fokkerlogo, of anders het Puppy Tracker-logo. Licht op iedere pagina, onafhankelijk van het logo bovenaan.",
    importReadError: "Het bestand kon niet worden gelezen. Download het eerst volledig in Bestanden en selecteer het opnieuw.", importJsonError: "Het bestand bevat geen geldige JSON. Kies het originele sjabloonbestand of controleer de JSON-opmaak.",
    duplicate: "Dupliceren", restoreBlock: "Verwijderd onderdeel herstellen", jumpBlock: "Ga naar onderdeel", block: "Onderdeel", addField: "Gegevensveld toevoegen", noUsedFields: "Dit sjabloon gebruikt nog geen invulvelden.",
    nameRequired: "Vul een sjabloonnaam in (maximaal 150 tekens).", blockLimit: "Een sjabloon heeft 1 tot 200 onderdelen nodig.", templateTooLarge: "Het sjabloon is groter dan 150 kB. Kort de tekst in of splits het document.", emptyDataBlock: "Voeg minstens één gegevensveld toe.", invalid_document_text: "Gebruik maximaal 12.000 tekens per onderdeel, zonder ongeldige besturingstekens.",
    previewTemplate: "Opmaakvoorbeeld (PDF)", downloadDraft: "Concept downloaden", previewTemplateHint: "Het opmaakvoorbeeld gebruikt veldnamen als voorbeeldwaarden en slaat niets op. Controleer later ook de PDF met de werkelijke gegevens.", previewTemplateDone: "Opmaakvoorbeeld gedownload. Het sjabloon is niet opgeslagen.",
    group_fokker: "Fokker", group_koper: "Koper(s)", group_nest: "Nest", group_pup: "Pup", group_vader: "Vader", group_moeder: "Moeder", group_betaling: "Betalingen", group_overdracht: "Overdracht", group_contract: "Ondertekening",
    working: "Bezig…",
    deleteTemplate: "Sjabloon verwijderen", deleteTemplateConfirm: "Dit sjabloon verwijderen? Opgeslagen documenten blijven behouden.", templateDeleted: "Sjabloon verwijderd.",
    title: "Document uit sjabloon", loading: "Documenten laden…", refresh: "Vernieuwen", template: "Sjabloon", litter: "Nest", puppy: "Pup", choose: "Maak een keuze",
    buyer: "Hoofdkoper (betalingsgegevens)", others: "Overige kopers", buyerHint: "Alleen gekoppelde baasjes zijn beschikbaar. Bedragen en ophaaldatum komen uit het nestdossier van de hoofdkoper.",
    date: "Contractdatum", place: "Plaats ondertekening", preview: "Controleren en PDF-voorbeeld", saveDocument: "Contract opslaan en downloaden", ready: "Alle gebruikte verplichte velden zijn ingevuld. Controleer het PDF-voorbeeld voordat je opslaat.", missing: "Nog invullen", edit: "Sjabloon aanpassen", copy: "Kopie maken en aanpassen", create: "Nieuw sjabloon", import: "Sjabloon importeren", export: "Sjabloon downloaden",
    archive: "Opgeslagen documenten", emptyArchive: "Nog geen documenten opgeslagen.", download: "Downloaden", remove: "Verwijderen", removeConfirm: "Dit opgeslagen document definitief verwijderen?",
    name: "Sjabloonnaam", language: "Documenttaal", logo: "Logo bovenaan", initials: "Paraafruimte per pagina", saveTemplate: "Sjabloon opslaan", cancel: "Annuleren", discard: "Dit concept verwerpen en de lokale kopie verwijderen?",
    heading: "Kop", text: "Tekst", data: "Gegevensblok", signature: "Ondertekening", page_break: "Nieuwe pagina", add: "Onderdeel toevoegen", up: "Omhoog", down: "Omlaag", content: "Tekst / kop", bold: "Vetgedrukt", fields: "Velden in gegevensblok", insert: "Veld invoegen", optional: "Velden die leeg mogen blijven", optionalHint: "Lege optionele velden verschijnen als n.v.t. Gebruik dit alleen waar dat voor jouw document klopt.",
    editorHint: "Artikelnummering en verwijzingen staan in je tekst. Controleer ze na het verplaatsen of verwijderen van onderdelen. De inhoud wordt niet automatisch vertaald.",
    saved: "Document opgeslagen. Latere gegevenswijzigingen veranderen dit document niet.", templateSaved: "Sjabloon opgeslagen.", deleted: "Document verwijderd.", noBuyers: "Koppel eerst een baasje aan de pup via de baasjeskaart.", admin: "Documenten zijn alleen beschikbaar voor beheerders.",
    failure: "De opdracht is niet gelukt. Je invoer is behouden; probeer opnieuw.", document_conflict: "Gegevens of sjabloon zijn gewijzigd. Vernieuw en controleer opnieuw vóór opslaan.", document_missing_fields: "Vul eerst de ontbrekende gegevens in of markeer het veld bewust als optioneel in je sjabloon.",
    choose_document_parties: "Kies een pup en gekoppelde koper(s).", unknown_template_field: "Er staat een onbekend of ongeldig invulveld in het sjabloon. Gebruik de veldkiezer.", invalid_template: "Controleer de sjabloonnaam, taal en onderdelen.", invalid_template_block: "Controleer de onderdelen. Een gegevensblok heeft minstens één veld nodig.", unsupported_template_version: "Dit sjabloonformaat wordt niet ondersteund.", document_limit: "De document- of sjabloonlimiet is bereikt. Verwijder ongebruikte items voordat je verdergaat.", importError: "Kies een geldig Puppy Tracker-sjabloonbestand van maximaal 150 kB.",
  },
  en: {
    draftHint: "Changes are automatically kept as a draft in this browser.", draftPending: "Saving local draft…", draftSaved: "Draft saved locally. The template has not yet been saved to Home Assistant.", draftRestored: "Your local draft has been restored. Use Save template to save it permanently.", draftUnavailable: "Automatic saving failed. Keep this page open or download your draft.", draftRestoreFailed: "The local draft could not be restored. You can import a downloaded draft again.", draftConflict: "Another tab saved a draft. Your input is preserved; download your draft before closing this page.", draftClearFailed: "The local draft copy could not be removed. Check it when reopening.",
    watermark: "Watermark", watermarkNone: "No watermark", watermarkTextMode: "Text", watermarkLogoMode: "Logo", watermarkText: "Watermark text", watermarkTextHint: "Leave empty to use the document title.", watermarkLogoHint: "Uses the configured breeder logo, or the Puppy Tracker logo as fallback. Faintly on every page, independently of the header logo.",
    importReadError: "The file could not be read. Download it fully in Files, then select it again.", importJsonError: "The file does not contain valid JSON. Choose the original template file or check its JSON syntax.",
    duplicate: "Duplicate", restoreBlock: "Restore deleted block", jumpBlock: "Go to block", block: "Block", addField: "Add data field", noUsedFields: "This template does not use any placeholders yet.",
    nameRequired: "Enter a template name (up to 150 characters).", blockLimit: "A template needs 1 to 200 blocks.", templateTooLarge: "The template exceeds 150 kB. Shorten the text or split the document.", emptyDataBlock: "Add at least one data field.", invalid_document_text: "Use up to 12,000 characters per block without invalid control characters.",
    previewTemplate: "Layout preview (PDF)", downloadDraft: "Download draft", previewTemplateHint: "The layout preview uses field names as sample values and saves nothing. Also check the PDF with actual data later.", previewTemplateDone: "Layout preview downloaded. The template has not been saved.",
    group_fokker: "Breeder", group_koper: "Buyer(s)", group_nest: "Litter", group_pup: "Puppy", group_vader: "Father", group_moeder: "Mother", group_betaling: "Payments", group_overdracht: "Handover", group_contract: "Signing",
    working: "Working…",
    deleteTemplate: "Delete template", deleteTemplateConfirm: "Delete this template? Saved documents will be kept.", templateDeleted: "Template deleted.",
    title: "Document from template", loading: "Loading documents…", refresh: "Refresh", template: "Template", litter: "Litter", puppy: "Puppy", choose: "Choose an option",
    buyer: "Primary buyer (payment details)", others: "Additional buyers", buyerHint: "Only linked contacts are available. Amounts and pickup date come from the primary buyer's litter dossier.",
    date: "Contract date", place: "Signing location", preview: "Check and download PDF preview", saveDocument: "Save and download contract", ready: "All required fields used in the template are filled. Review the PDF preview before saving.", missing: "Still missing", edit: "Edit template", copy: "Copy and edit", create: "New template", import: "Import template", export: "Download template",
    archive: "Saved documents", emptyArchive: "No saved documents yet.", download: "Download", remove: "Delete", removeConfirm: "Permanently delete this saved document?",
    name: "Template name", language: "Document language", logo: "Header logo", initials: "Initials on every page", saveTemplate: "Save template", cancel: "Cancel", discard: "Discard this draft and remove its local copy?",
    heading: "Heading", text: "Text", data: "Data block", signature: "Signatures", page_break: "Page break", add: "Add block", up: "Move up", down: "Move down", content: "Text / heading", bold: "Bold", fields: "Fields in data block", insert: "Insert field", optional: "Fields allowed to remain empty", optionalHint: "Empty optional fields appear as N/A. Use this only where appropriate for your document.",
    editorHint: "Article numbers and references are part of your text. Check them after moving or removing blocks. Content is not automatically translated.",
    saved: "Document saved. Later data changes will not alter this document.", templateSaved: "Template saved.", deleted: "Document deleted.", noBuyers: "First link a contact to the puppy using the Owners card.", admin: "Documents are available to administrators only.",
    failure: "The operation failed. Your input is preserved; please retry.", document_conflict: "Data or template changed. Refresh and check again before saving.", document_missing_fields: "Fill the missing details or deliberately mark the field as optional in your template.",
    choose_document_parties: "Choose a puppy and linked buyer(s).", unknown_template_field: "The template contains an unknown or invalid placeholder. Use the field picker.", invalid_template: "Check template name, language and blocks.", invalid_template_block: "Check the blocks. A data block needs at least one field.", unsupported_template_version: "This template format is not supported.", document_limit: "The document or template limit has been reached. Remove unused items before continuing.", importError: "Choose a valid Puppy Tracker template file of at most 150 kB.",
  },
};


class PuppyTrackerDocuments extends HTMLElement {
  constructor() {
    super(); this.attachShadow({ mode: "open" });
    this._epoch = 0; this._model = null; this._busy = false; this._error = ""; this._status = "";
    this._template = ""; this._litter = ""; this._puppy = ""; this._buyer = ""; this._others = [];
    this._details = { date: "", place: "" }; this._preview = null; this._requestId = null; this._editor = null; this._templateEditor = null; this._dirty = false;
    this._draftStore = null; this._draftState = ""; this._draftChecked = false;
    this._pageHide = () => this._flushDraft();
    this._visibility = () => { if (document.visibilityState === "hidden") this._flushDraft(); };
  }
  t(key) { const copy = COPY[this.language] || COPY.en; return copy[key] || COPY.en[key] || copy.failure; }
  get language() { return languageForHass(this._hass); }
  set hass(value) {
    const principal = `${value?.user?.id || ""}:${value?.user?.is_admin !== false}`;
    const changed = this._principal !== undefined && this._principal !== principal;
    const reconnected = this._hass && this._hass.connection !== value?.connection;
    if (changed || value?.user?.is_admin === false) {
      this._flushDraft(); this._draftStore?.dispose();
      this._draftStore = null; this._draftState = ""; this._draftChecked = false;
    }
    this._principal = principal; this._hass = value;
    if (changed || value?.user?.is_admin === false) {
      this._epoch++; this._model = null; this._editor = null; this._templateEditor = null; this._dirty = false; this._preview = null; this._busy = false;
      this._buyer = ""; this._others = []; this._requestId = null; this._details = { date: "", place: "" }; this._error = ""; this._status = "";
      this._render();
    } else if (reconnected) { this._epoch++; this._busy = false; this._preview = null; this._render(); }
    if (this.isConnected && !this._model && !this._busy && value?.user?.is_admin !== false) this._load();
  }
  connectedCallback() {
    window.addEventListener("pagehide", this._pageHide);
    document.addEventListener("visibilitychange", this._visibility);
    if (this._hass && !this._model && !this._busy && this._hass.user?.is_admin !== false) this._load();
  }
  disconnectedCallback() { queueMicrotask(() => {
    if (!this.isConnected) {
      this._flushDraft(); this._draftStore?.dispose();
      window.removeEventListener("pagehide", this._pageHide);
      document.removeEventListener("visibilitychange", this._visibility);
      this._epoch++; this._busy = false;
    }
  }); }
  _draftSnapshot() {
    if (!this._editor || !this._dirty || this._hass?.user?.is_admin === false) return null;
    this._templateEditor.capture();
    return { editor: this._editor, view: {
      open: this._templateEditor.keys.flatMap((key, index) => this._templateEditor.open.has(key) ? [index] : []),
      scroll: this._templateEditor.scroll, optional: this._templateEditor.optionalOpen,
    } };
  }
  _draftStatus(state) {
    if (state === this._draftState) return;
    this._draftState = state;
    this._updateDraftStatus();
  }
  _updateDraftStatus() {
    const node = this.shadowRoot.querySelector("#draft-status");
    if (!node) return;
    node.textContent = this._draftState ? this.t(this._draftState) : this._editor ? this.t("draftHint") : "";
    node.classList.toggle("error", ["draftUnavailable", "draftRestoreFailed", "draftConflict", "draftClearFailed"].includes(this._draftState));
  }
  _draftChanged() {
    this._dirty = true;
    this._draftStore?.schedule(() => this._draftSnapshot());
  }
  _flushDraft() { this._draftStore?.flush(() => this._draftSnapshot()); }
  _restoreDraft() {
    if (this._draftChecked || this._editor) return;
    this._draftChecked = true;
    this._draftStore = new DocumentDraftStore(this._hass?.user?.id, state => this._draftStatus(state));
    const saved = this._draftStore.load();
    if (!saved) return;
    this._edit(saved.editor.template, saved.editor.id, saved.editor.revision, saved.view);
    this._dirty = true;
    this._draftStatus("draftRestored");
  }
  async _run(operation) {
    if (this._busy || this._hass?.user?.is_admin === false) return;
    const epoch = this._epoch, hass = this._hass, principal = this._principal;
    const current = () => this.isConnected && epoch === this._epoch && principal === this._principal && hass.connection === this._hass?.connection;
    this._busy = true; this._error = ""; this._status = "";
    if (!this._model) this._render(); else this._setBusy();
    try { await operation(hass, current); }
    catch (error) { if (current()) this._error = this.t(error?.message); }
    finally { if (current()) { this._busy = false; this._render(); } }
  }
  _setBusy() {
    const fieldset = this.shadowRoot.querySelector("fieldset");
    if (fieldset) { fieldset.disabled = this._busy; fieldset.setAttribute("aria-busy", String(this._busy)); }
    const status = this.shadowRoot.querySelector("#document-status");
    if (status) status.textContent = this._busy ? this.t("working") : this._status;
    const error = this.shadowRoot.querySelector("#document-error");
    if (error) error.textContent = this._error;
  }
  _load() {
    this._run(async (hass, current) => {
      const model = await hass.callWS({ type: "puppy_tracker/documents/list" });
      if (!current()) return;
      this._model = model; this._preview = null;
      if (!model.templates.some(t => t.id === this._template)) this._template = model.templates[0]?.id || "";
      if (!model.litters.some(l => l.id === this._litter)) this._litter = model.litters[0]?.id || "";
      this._syncSelection();
      if (!this._details.date) {
        const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: hass.config?.time_zone || undefined, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()).map(p => [p.type, p.value]));
        this._details.date = `${p.year}-${p.month}-${p.day}`;
      }
      this._restoreDraft();
    });
  }
  _syncSelection() {
    const puppies = this._model?.litters.find(l => l.id === this._litter)?.puppies || [];
    if (!puppies.some(p => p.id === this._puppy)) this._puppy = puppies[0]?.id || "";
    const ids = puppies.find(p => p.id === this._puppy)?.owner_ids || [];
    if (!ids.includes(this._buyer)) this._buyer = "";
    this._others = this._others.filter(id => ids.includes(id) && id !== this._buyer);
  }
  _invalidate() {
    this._preview = null; this._requestId = null;
    const save = this.shadowRoot.querySelector("#save-document"); if (save) save.disabled = true;
    const checks = this.shadowRoot.querySelector("#document-checks"); if (checks) checks.replaceChildren();
  }
  _selection() { return { template_id: this._template, litter_id: this._litter, puppy_id: this._puppy, owner_ids: [this._buyer, ...this._others].filter(Boolean), details: { ...this._details } }; }
  _check() {
    const selection = this._selection();
    this._run(async (hass, current) => {
      const usesLogo = templateUsesLogo(this._model.templates.find(t => t.id === selection.template_id)?.template);
      const logo = usesLogo ? await this.loadLogo?.(hass) : null;
      if (!current()) return;
      if (logo) selection.logo_base64 = logo;
      const preview = await hass.callWS({ type: "puppy_tracker/documents/preview", ...selection });
      if (!current()) return;
      this._preview = { ...preview, selection }; this._requestId = createUuid();
      downloadExportFile(preview.download);
    });
  }
  _saveDocument() {
    const preview = this._preview;
    if (!preview || preview.missing.length) return;
    const requestId = this._requestId;
    this._run(async (hass, current) => {
      const result = await hass.callWS({ type: "puppy_tracker/documents/save", ...preview.selection, expected_fingerprint: preview.fingerprint, request_id: requestId });
      if (!current()) return;
      this._model.documents = [result.document, ...this._model.documents.filter(d => d.id !== result.document.id)];
      this._status = this.t("saved"); this._preview = null; this._requestId = null;
      downloadExportFile(result.download);
    });
  }
  _edit(value, id = null, revision = null, view = null) {
    this._editor = { template: structuredClone(value), id: id || createUuid(), revision };
    this._templateEditor = new DocumentTemplateEditor(this._editor.template, {
      fields: this._model.fields, language: () => this.language, text: key => this.t(key),
      changed: () => this._draftChanged(),
      save: () => this._saveTemplate(), preview: () => this._previewTemplate(), download: () => this._downloadDraft(),
      cancel: () => {
        if (!this._dirty || confirm(this.t("discard"))) {
          this._draftStore?.clear();
          this._editor = null; this._templateEditor = null; this._dirty = false; this._render();
        }
      },
    });
    if (view && Array.isArray(view.open)) {
      this._templateEditor.open = new Set(view.open.filter(index => Number.isInteger(index) && index >= 0 && index < this._templateEditor.keys.length).map(index => this._templateEditor.keys[index]));
      this._templateEditor.scroll = Number.isFinite(view.scroll) ? Math.max(0, Math.min(view.scroll, 1e7)) : 0;
      this._templateEditor.optionalOpen = view.optional === true;
    }
    this._dirty = false; this._invalidate(); this._render();
  }
  _saveTemplate() {
    if (!this._templateEditor?.validate()) return;
    const editor = structuredClone(this._editor);
    this._run(async (hass, current) => {
      const result = await hass.callWS({ type: "puppy_tracker/documents/template/save", template: editor.template, template_id: editor.id, ...(editor.revision ? { expected_revision: editor.revision } : {}) });
      if (!current()) return;
      this._model.templates = [...this._model.templates.filter(t => t.id !== result.id), { ...result, builtin: false }];
      this._draftStore?.clear();
      this._template = result.id; this._editor = null; this._templateEditor = null; this._dirty = false; this._status = this.t("templateSaved");
    });
  }
  _previewTemplate() {
    if (!this._templateEditor?.validate()) return;
    const template = structuredClone(this._editor.template);
    this._run(async (hass, current) => {
      const logo = templateUsesLogo(template) ? await this.loadLogo?.(hass) : null;
      if (!current()) return;
      const result = await hass.callWS({ type: "puppy_tracker/documents/template/preview", template, ...(logo ? { logo_base64: logo } : {}) });
      if (!current()) return;
      downloadExportFile(result);
      this._status = this.t("previewTemplateDone");
    });
  }
  _downloadDraft() {
    if (!this._editor || this._busy || this._hass?.user?.is_admin === false) return;
    downloadExportFile({ content: JSON.stringify(this._editor.template, null, 2), mime_type: "application/json", filename: "puppy-tracker-template-draft.json" });
  }
  async _import(file) {
    if (!file) return;
    return this._run(async (_hass, current) => {
      if (file.size > 150000) throw Error("importError");
      let content, value;
      try { content = await file.text(); } catch { throw Error("importReadError"); }
      if (!current()) return;
      try { value = JSON.parse(content); } catch { throw Error("importJsonError"); }
      if (!value || value.format !== "puppy_tracker_document_template" || value.version !== 1 || !Array.isArray(value.blocks) || value.blocks.length > 200 || value.blocks.some(b => !KINDS.includes(b?.type) || (b.text !== undefined && typeof b.text !== "string") || (b.fields && (!Array.isArray(b.fields) || b.fields.some(f => !this._model.fields[f])))) || (value.optional_fields !== undefined && !Array.isArray(value.optional_fields))) throw Error("importError");
      this._edit({ logo: true, watermark: false, initials: true, optional_fields: [], ...value,
        blocks: value.blocks.map(block => ({ text: "", fields: [], bold: false, ...block })) });
      this._draftChanged();
    });
  }
  _deleteTemplate(selected) {
    if (!selected || selected.builtin || !confirm(this.t("deleteTemplateConfirm"))) return;
    this._run(async (hass, current) => {
      await hass.callWS({ type: "puppy_tracker/documents/template/delete", template_id: selected.id, expected_revision: selected.revision });
      if (!current()) return;
      this._model.templates = this._model.templates.filter(t => t.id !== selected.id);
      this._template = this._model.templates[0]?.id || "";
      this._invalidate(); this._status = this.t("templateDeleted");
    });
  }
  _options(rows, selected) { return `<option value="">${esc(this.t("choose"))}</option>${rows.map(([id, name]) => `<option value="${esc(id)}" ${id === selected ? "selected" : ""}>${esc(name)}</option>`).join("")}`; }
  _fieldLabel(key) { return this._model?.fields[key]?.[this.language] || key; }
  _render() { preserveScrollPosition(this, () => this._renderContent()); }
  _renderContent() {
    if (this._hass?.user?.is_admin === false) { this.shadowRoot.innerHTML = `<p>${esc(this.t("admin"))}</p>`; return; }
    const model = this._model;
    this._templateEditor?.capture();
    const selected = model?.templates.find(t => t.id === this._template);
    const puppies = model?.litters.find(l => l.id === this._litter)?.puppies || [];
    const linked = puppies.find(p => p.id === this._puppy)?.owner_ids || [];
    const owners = (model?.owners || []).filter(o => linked.includes(o.id));
    const checks = this._preview ? (this._preview.missing.length ? `<strong>${esc(this.t("missing"))}</strong><ul>${this._preview.missing.map(key => `<li>${esc(this._fieldLabel(key))}</li>`).join("")}</ul>` : esc(this.t("ready"))) : "";
    this.shadowRoot.innerHTML = `<style>
      :host{display:block;color:var(--primary-text-color,#212121)}fieldset{border:0;padding:0;margin:0;min-width:0}label{display:grid;gap:5px;font-size:.85rem}input:not([type=checkbox]),select,textarea{box-sizing:border-box;width:100%;min-width:0;border:1px solid var(--divider-color,#d5d9df);border-radius:6px;padding:9px;background:var(--card-background-color,#fff);color:var(--primary-text-color,#212121);font:inherit}textarea{resize:vertical}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:12px}.actions,.flags{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.flags label,.field-list label,label:has(input[type=checkbox]){display:flex;align-items:center;gap:6px}.actions select{width:auto;max-width:100%}button{min-height:42px;padding:8px 12px;border:1px solid var(--divider-color,#d5d9df);border-radius:7px;background:var(--secondary-background-color,#f5f7fa);color:var(--primary-text-color,#212121);font:inherit;cursor:pointer}.primary{background:var(--primary-color,#03a9f4);color:var(--text-primary-color,#fff)}button:disabled{opacity:.5;cursor:default}p{font-size:.85rem;color:var(--secondary-text-color,#666);line-height:1.5}summary{cursor:pointer;padding:12px 0;font-weight:600;overflow-wrap:anywhere}.blocks,.archive,.field-list{max-height:500px;overflow-y:auto;overflow-anchor:none}.block{border-top:1px solid var(--divider-color,#d5d9df);padding:0 4px 8px}.block label{margin:8px 0}.field-list{display:grid;gap:10px}.archive article{padding:10px 0;border-bottom:1px solid var(--divider-color,#d5d9df);overflow-wrap:anywhere}.archive small{display:block;color:var(--secondary-text-color,#666)}.error{color:var(--error-color,#b00020)}#document-status,#document-error{min-height:1.4em;font-size:.85rem;overflow-wrap:anywhere}h3{font-size:1rem}#draft-status{font-size:.85rem;line-height:1.4;min-height:4.2em;overflow-wrap:anywhere}#draft-status:empty{display:none}.selected-fields{padding-left:22px}.selected-fields li{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:5px 0}.selected-fields li span{overflow-wrap:anywhere;min-width:0}.selected-fields .actions{flex-wrap:nowrap;margin:0;gap:4px}.selected-fields button{min-width:42px}.block-error:empty,#template-errors:empty{display:none}#template-errors{display:grid}#template-errors button{text-align:left}.editor .blocks{margin-top:12px}#template-editor [hidden]{display:none}.watermark-settings small{color:var(--secondary-text-color,#666);font-weight:normal}
      </style><fieldset ${this._busy ? "disabled" : ""}>${!model ? `<p>${esc(this.t("loading"))}</p><button type="button" id="refresh-documents">${esc(this.t("refresh"))}</button>` : this._editor ? '<div id="template-editor"></div>' : `
      <div class="grid"><label>${esc(this.t("template"))}<select id="document-template">${this._options(model.templates.map(t => [t.id, t.template.name]), this._template)}</select></label></div>
      <div class="actions"><button type="button" id="edit-template" ${!selected ? "disabled" : ""}>${esc(this.t(selected?.builtin ? "copy" : "edit"))}</button><button type="button" id="new-template">${esc(this.t("create"))}</button><button type="button" id="export-template" ${!selected ? "disabled" : ""}>${esc(this.t("export"))}</button><button type="button" id="import-template">${esc(this.t("import"))}</button><input id="template-file" type="file" accept=".json,application/json" hidden><button type="button" id="refresh-documents">${esc(this.t("refresh"))}</button></div>
      <div class="grid"><label>${esc(this.t("litter"))}<select id="document-litter">${this._options(model.litters.map(l => [l.id, l.name]), this._litter)}</select></label><label>${esc(this.t("puppy"))}<select id="document-puppy">${this._options(puppies.map(p => [p.id, puppySelectorLabel(p)]), this._puppy)}</select></label><label>${esc(this.t("buyer"))}<select id="document-buyer">${this._options(owners.map(o => [o.id, o.name]), this._buyer)}</select></label><label>${esc(this.t("others"))}<select multiple id="document-others" size="2">${owners.filter(o => o.id !== this._buyer).map(o => `<option value="${esc(o.id)}" ${this._others.includes(o.id) ? "selected" : ""}>${esc(o.name)}</option>`).join("")}</select></label><label>${esc(this.t("date"))}<input type="date" id="document-date" value="${esc(this._details.date)}"></label><label>${esc(this.t("place"))}<input id="document-place" maxlength="200" value="${esc(this._details.place)}"></label></div>
      <p>${esc(this.t(owners.length ? "buyerHint" : "noBuyers"))}</p><div class="actions"><button type="button" id="preview-document" ${!this._buyer || !this._template ? "disabled" : ""}>${esc(this.t("preview"))}</button><button type="button" id="save-document" class="primary" ${!this._preview || this._preview.missing.length ? "disabled" : ""}>${esc(this.t("saveDocument"))}</button></div><div id="document-checks" role="status">${checks}</div>
      <h3>${esc(this.t("archive"))}</h3><div class="archive">${model.documents.map(d => `<article><strong>${esc(d.name)} · ${esc(d.puppy_name)}</strong><small>${esc(new Date(d.created_at).toLocaleString(this.language))}</small><div class="actions"><button type="button" data-download="${esc(d.id)}">${esc(this.t("download"))}</button><button type="button" data-delete="${esc(d.id)}">${esc(this.t("remove"))}</button></div></article>`).join("") || `<p>${esc(this.t("emptyArchive"))}</p>`}</div>`}</fieldset><div id="draft-status" role="status"></div><div id="document-status" role="status">${esc(this._status)}</div><div id="document-error" class="error" role="alert">${esc(this._error)}</div>`;
    const on = (selector, event, fn) => this.shadowRoot.querySelector(selector)?.addEventListener(event, fn);
    on("#refresh-documents", "click", () => this._load());
    on("#document-template", "change", e => { this._template = e.target.value; this._invalidate(); this._render(); });
    for (const [id, key] of [["litter", "_litter"], ["puppy", "_puppy"], ["buyer", "_buyer"]]) on(`#document-${id}`, "change", e => { this[key] = e.target.value; this._syncSelection(); this._invalidate(); this._render(); });
    on("#document-others", "change", e => { this._others = [...e.target.selectedOptions].map(o => o.value); this._invalidate(); });
    for (const key of ["date", "place"]) on(`#document-${key}`, "input", e => { this._details[key] = e.target.value; this._invalidate(); });
    on("#preview-document", "click", () => this._check()); on("#save-document", "click", () => this._saveDocument());
    on("#edit-template", "click", () => this._edit(selected.template, selected.builtin ? null : selected.id, selected.builtin ? null : selected.revision));
    if (model && !this._editor && selected && !selected.builtin) {
      const remove = document.createElement("button");
      remove.type = "button"; remove.id = "delete-template"; remove.textContent = this.t("deleteTemplate");
      remove.addEventListener("click", () => this._deleteTemplate(selected));
      this.shadowRoot.querySelector("#edit-template").parentElement.append(remove);
    }
    on("#new-template", "click", () => this._edit({ format: "puppy_tracker_document_template", version: 1, name: "", language: this.language, logo: true, watermark: false, initials: true, optional_fields: [], blocks: [{ type: "text", text: "", fields: [] }] }));
    on("#export-template", "click", () => downloadExportFile({ content: JSON.stringify(selected.template, null, 2), mime_type: "application/json", filename: "puppy-tracker-document-template.json" }));
    on("#import-template", "click", () => this.shadowRoot.querySelector("#template-file").click());
    on("#template-file", "change", e => this._import(e.target.files[0]));
    this.shadowRoot.querySelectorAll("[data-download]").forEach(b => b.addEventListener("click", () => this._run(async (hass, current) => { const r = await hass.callWS({ type: "puppy_tracker/documents/download", document_id: b.dataset.download }); if (current()) downloadExportFile(r); })));
    this.shadowRoot.querySelectorAll("[data-delete]").forEach(b => b.addEventListener("click", () => { if (confirm(this.t("removeConfirm"))) this._run(async (hass, current) => { await hass.callWS({ type: "puppy_tracker/documents/delete", document_id: b.dataset.delete }); if (current()) { this._model.documents = this._model.documents.filter(d => d.id !== b.dataset.delete); this._status = this.t("deleted"); } }); }));
    if (this._editor) this._templateEditor.mount(this.shadowRoot.querySelector("#template-editor"));
    this._updateDraftStatus();
  }
}

if (!customElements.get("puppy-tracker-documents")) customElements.define("puppy-tracker-documents", PuppyTrackerDocuments);
