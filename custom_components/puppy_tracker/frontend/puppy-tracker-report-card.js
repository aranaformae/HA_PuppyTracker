import {
  downloadExportFile,
  escapeHtml,
  fetchExport,
  fetchLitterData,
  fetchLitters,
  filterMeasurements,
  languageForHass,
  loadCardState,
  rangeToHours,
  saveCardState,
  selectDefaultLitter,
  subscribeUpdates,
} from "./puppy-tracker-card-common.js";
import { recordTypeLabel } from "./puppy-tracker-dossier-schema.js";

const REPORT_TEXT = {
  nl: {
    title: "Rapport & export", subtitle: "Printvriendelijk pup- of nestrapport met bestaande CSV/JSON-export.", litter: "Nest", selection: "Selectie", period: "Periode", all: "Alles", wholeLitter: "Hele nest", mother: "Moederhond", motherHistory: "Moederhistorie", allLitters: "Alle nesten", currentLitterOnly: "Alleen dit nest", hours24: "24 uur", days3: "3 dagen", days7: "7 dagen", days14: "14 dagen", days30: "30 dagen", puppies: "Pups", measurements: "Metingen", attention: "Gewichtsaandacht", pdf: "PDF downloaden", csv: "CSV", json: "JSON-nestback-up", motherJson: "Moeder JSON", note: "PDF en CSV volgen de gekozen pup en periode. De periode filtert metingen, grafiek en zorgresultaten; samenvatting, gewichtsaandacht en baasjes tonen de actuele stand. JSON is altijd een volledige importeerbare nestback-up.", motherNote: "Moeder JSON bevat standaard de volledige historie over alle nesten; dit is hierboven te beperken tot het huidige nest.", loadFailed: "Rapportgegevens konden niet worden geladen.", refreshFailed: "Nieuwe Puppy Tracker-data kon niet worden geladen.", dataFailed: "Nestdata kon niet worden geladen.", exportFailed: "Export mislukt.", motherExportFailed: "Moederexport mislukt.", pdfDone: "PDF-rapport gedownload.", csvDone: "CSV gedownload.", jsonDone: "JSON-nestback-up gedownload.", motherDone: "Moederdossier gedownload.", preparingExport: "{format} voorbereiden…", preparingMother: "Moederdossier voorbereiden…", motherJsonOnly: "Voor de moeder is momenteel alleen JSON-dossierexport beschikbaar.", puppy: "Puppy", inactive: "inactief", litterName: "Nest", pdfSections: "Onderdelen in PDF", summarySection: "Samenvatting", chartSection: "Grafiek", measurementSection: "Metingen", careSection: "Zorgresultaten", attentionSection: "Gewichtsaandacht", ownersSection: "Baasjes en plaatsing", ownerContactSection: "Contactgegevens", profile: "PDF-profiel", customProfile: "Aangepast", saveProfile: "Profiel opslaan", profileNamePrompt: "Naam voor dit PDF-profiel",
  },
  en: {
    title: "Report & export", subtitle: "Print-friendly puppy or litter report with existing CSV/JSON export.", litter: "Litter", selection: "Selection", period: "Period", all: "All", wholeLitter: "Whole litter", mother: "Mother", motherHistory: "Mother history", allLitters: "All litters", currentLitterOnly: "Current litter only", hours24: "24 hours", days3: "3 days", days7: "7 days", days14: "14 days", days30: "30 days", puppies: "Puppies", measurements: "Measurements", attention: "Weight attention", pdf: "Download PDF", csv: "CSV", json: "Litter JSON backup", motherJson: "Mother JSON", note: "PDF and CSV follow the selected puppy and period. The period filters measurements, chart data and care results; summary, weight attention and owners show the current state. JSON is always a complete importable litter backup.", motherNote: "Mother JSON includes the complete history across all litters by default; limit it to the current litter above if needed.", loadFailed: "Report data could not be loaded.", refreshFailed: "New Puppy Tracker data could not be loaded.", dataFailed: "Litter data could not be loaded.", exportFailed: "Export failed.", motherExportFailed: "Mother export failed.", pdfDone: "PDF report downloaded.", csvDone: "CSV downloaded.", jsonDone: "Litter JSON backup downloaded.", motherDone: "Mother dossier downloaded.", preparingExport: "Preparing {format}…", preparingMother: "Preparing mother dossier…", motherJsonOnly: "Only JSON dossier export is currently available for the mother.", puppy: "Puppy", inactive: "inactive", litterName: "Litter", pdfSections: "PDF sections", summarySection: "Summary", chartSection: "Chart", measurementSection: "Measurements", careSection: "Care results", attentionSection: "Weight attention", ownersSection: "Owners and placement", ownerContactSection: "Contact details", profile: "PDF profile", customProfile: "Custom", saveProfile: "Save profile", profileNamePrompt: "Name for this PDF profile",
  },
};

Object.assign(REPORT_TEXT.nl, {
  identitySection: "Identiteit", dossierSection: "Dossieritems", pdfLanguage: "PDF-taal",
  chartPoints: "Grafiekpunten",
  automaticLanguage: "Automatisch", dutchLanguage: "Nederlands", englishLanguage: "Engels",
  dossierSources: "Dossierbronnen", litterSource: "Hele nest", puppySource: "Pups",
  dossierCategories: "Dossiercategorieën", selectAll: "Alles", selectNone: "Geen",
  preview: "Inhoud van PDF", careCount: "Zorgresultaten", dossierCount: "Dossieritems",
  selectedSections: "Gekozen onderdelen", noSections: "Geen onderdelen gekozen",
  linkedOwners: "Gekoppelde baasjes", selectedPuppy: "Geselecteerde pup",
  note: "PDF en CSV volgen de gekozen pup en periode. De PDF-periode filtert metingen, grafiek, zorgresultaten en dossieritems; samenvatting, gewichtsaandacht en baasjes tonen de actuele stand. JSON blijft een volledige importeerbare nestback-up.",
});
Object.assign(REPORT_TEXT.en, {
  identitySection: "Identity", dossierSection: "Dossier items", pdfLanguage: "PDF language",
  chartPoints: "Chart points",
  automaticLanguage: "Automatic", dutchLanguage: "Dutch", englishLanguage: "English",
  dossierSources: "Dossier sources", litterSource: "Whole litter", puppySource: "Puppies",
  dossierCategories: "Dossier categories", selectAll: "All", selectNone: "None",
  preview: "PDF contents", careCount: "Care results", dossierCount: "Dossier items",
  selectedSections: "Selected sections", noSections: "No sections selected",
  linkedOwners: "Linked owners", selectedPuppy: "Selected puppy",
  note: "PDF and CSV follow the selected puppy and period. The PDF period filters measurements, chart data, care results and dossier items; summary, weight attention and owners show the current state. JSON remains a complete importable litter backup.",
});

const LITTER_VALUE = "__litter__";
const MOTHER_VALUE = "__mother__";
const PDF_SECTION_DEFAULTS = { identity: true, summary: true, chart: true, measurements: true, care: true, dossier: true, attention: true, owners: true, owner_contact: false };
const PDF_SECTION_LABELS = { identity: "identitySection", summary: "summarySection", chart: "chartSection", measurements: "measurementSection", care: "careSection", dossier: "dossierSection", attention: "attentionSection", owners: "ownersSection", owner_contact: "ownerContactSection" };

function normalizeSections(sections = {}) {
  const normalized = Object.fromEntries(
    Object.entries(PDF_SECTION_DEFAULTS).map(([key, fallback]) => [key, Object.hasOwn(sections, key) ? Boolean(sections[key]) : fallback])
  );
  if (!normalized.owners) normalized.owner_contact = false;
  return normalized;
}

function reportText(hass, key, replacements = {}) {
  const template = (REPORT_TEXT[languageForHass(hass)] || REPORT_TEXT.nl)[key] || key;
  return Object.entries(replacements).reduce(
    (result, [name, value]) => result.replaceAll(`{${name}}`, String(value ?? "")),
    template,
  );
}

function configHass() {
  return document.querySelector("home-assistant")?.hass || null;
}

const REPORT_PROFILES = {
  full: { nl: "Volledig dossier", en: "Full dossier", sections: { identity: true, summary: true, chart: true, measurements: true, care: true, dossier: true, attention: true, owners: true, owner_contact: true } },
  handover: { nl: "Overdracht aan baasje", en: "Owner handover", sections: { identity: true, summary: true, chart: true, measurements: true, care: true, dossier: true, attention: false, owners: true, owner_contact: true } },
  internal: { nl: "Intern fokdossier", en: "Internal breeding record", sections: { identity: true, summary: true, chart: true, measurements: true, care: true, dossier: true, attention: true, owners: true, owner_contact: false } },
};

function profileLabel(hass, profile) {
  const language = languageForHass(hass);
  return profile?.[language] || profile?.nl || profile?.en || "Aangepast";
}

class PuppyTrackerReportCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass = null;
    this._config = {};
    this._litters = [];
    this._selectedLitterId = null;
    this._selectedPuppyId = "all";
    this._range = "all";
    this._data = null;
    this._loading = false;
    this._error = "";
    this._status = "";
    this._unsubscribe = null;
    this._subscriptionPending = false;
    this._refreshing = false;
    this._refreshAgain = false;
    this._state = loadCardState(this, { range: "all", puppyId: "all" });
    this._range = this._state.range || "all";
    this._selectedPuppyId = !this._state.puppyId || this._state.puppyId === "all" ? LITTER_VALUE : this._state.puppyId;
    this._reportProfile = this._state.reportProfile || "full";
    this._sectionState = normalizeSections(this._state.sectionState || REPORT_PROFILES.full.sections);
    this._motherExportScope = this._state.motherExportScope || "all";
    this._pdfLanguage = ["auto", "nl", "en"].includes(this._state.pdfLanguage) ? this._state.pdfLanguage : "auto";
    this._dossierTypes = Array.isArray(this._state.dossierTypes) ? this._state.dossierTypes : null;
    this._dossierScopes = Array.isArray(this._state.dossierScopes) ? this._state.dossierScopes.filter((scope) => ["litter", "puppy"].includes(scope)) : ["litter", "puppy"];
  }

  static getStubConfig() {
    return { title: reportText(configHass(), "title"), default_range: "all", default_profile: "full" };
  }

  static getConfigForm() {
    return {
      schema: [
        { name: "title", selector: { text: {} } },
        {
          name: "default_range",
          selector: { select: { mode: "dropdown", options: [
            { value: "24h", label: reportText(configHass(), "hours24") },
            { value: "3d", label: reportText(configHass(), "days3") },
            { value: "7d", label: reportText(configHass(), "days7") },
            { value: "14d", label: reportText(configHass(), "days14") },
            { value: "30d", label: reportText(configHass(), "days30") },
            { value: "all", label: reportText(configHass(), "all") },
          ] } },
        },
        {
          name: "default_profile",
          selector: { select: { mode: "dropdown", options: [
            { value: "full", label: profileLabel(configHass(), REPORT_PROFILES.full) },
            { value: "handover", label: profileLabel(configHass(), REPORT_PROFILES.handover) },
            { value: "internal", label: profileLabel(configHass(), REPORT_PROFILES.internal) },
          ] } },
        },
      ],
    };
  }

  setConfig(config) {
    this._config = { title: null, default_range: "all", default_profile: "full", ...config };
    this._selectedLitterId = config.litter_id || this._selectedLitterId;
    this._range = Object.hasOwn(config, "default_range") ? (config.default_range || "all") : (this._state.range || this._range);
    if (!this._state.reportProfile && REPORT_PROFILES[this._config.default_profile]) {
      this._reportProfile = this._config.default_profile;
      this._sectionState = normalizeSections(REPORT_PROFILES[this._reportProfile].sections);
    }
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._litters.length && !this._loading) {
      this._loadInitial();
    } else if (this.isConnected) {
      this._ensureSubscription();
    }
  }

  connectedCallback() {
    if (!this._hass) return;
    if (!this._litters.length && !this._loading) {
      this._loadInitial();
    } else {
      this._ensureSubscription();
    }
  }

  disconnectedCallback() {
    if (this._unsubscribe) Promise.resolve(this._unsubscribe()).catch(() => undefined);
    this._unsubscribe = null;
  }

  getCardSize() { return 5; }
  getGridOptions() { return { columns: 12, min_columns: 6 }; }

  async _loadInitial() {
    if (!this._hass || this._loading) return;
    this._loading = true;
    try {
      const response = await fetchLitters(this._hass);
      this._litters = response?.litters || [];
      this._selectedLitterId = selectDefaultLitter(this._litters, this._selectedLitterId || this._config.litter_id);
      await this._loadData(false);
      await this._ensureSubscription();
    } catch (err) {
      this._error = err?.message || reportText(this._hass, "loadFailed");
    } finally {
      this._loading = false;
      this._render();
    }
  }

  async _ensureSubscription() {
    if (!this._hass || this._unsubscribe || this._subscriptionPending || !this.isConnected) return;
    this._subscriptionPending = true;
    try {
      this._unsubscribe = await subscribeUpdates(this._hass, () => this._queueRefresh(), this);
    } catch (err) {
      // Keep showing the last good data. The next hass/connected cycle retries.
      this._unsubscribe = null;
    } finally {
      this._subscriptionPending = false;
    }
  }

  async _queueRefresh() {
    if (!this._hass) return;
    if (this._refreshing) {
      this._refreshAgain = true;
      return;
    }
    this._refreshing = true;
    try {
      do {
        this._refreshAgain = false;
        const response = await fetchLitters(this._hass);
        this._litters = response?.litters || this._litters;
        this._selectedLitterId = selectDefaultLitter(
          this._litters,
          this._selectedLitterId || this._config.litter_id
        );
        await this._loadData(false);
      } while (this._refreshAgain);
      this._error = "";
    } catch (err) {
      this._error = err?.message || reportText(this._hass, "refreshFailed");
    } finally {
      this._refreshing = false;
      this._render();
    }
  }

  async _loadData(render = true) {
    if (!this._hass || !this._selectedLitterId) return;
    try {
      this._data = await fetchLitterData(this._hass, this._selectedLitterId);
      const specialScopes = new Set([LITTER_VALUE, MOTHER_VALUE]);
      if (!specialScopes.has(this._selectedPuppyId) && !(this._data.puppies || []).some((p) => p.id === this._selectedPuppyId)) {
        this._selectedPuppyId = LITTER_VALUE;
      }
      this._error = "";
    } catch (err) {
      this._error = err?.message || reportText(this._hass, "dataFailed");
    }
    if (render) this._render();
  }

  _selectedPuppies() {
    const puppies = this._data?.puppies || [];
    if (this._selectedPuppyId === LITTER_VALUE) return puppies;
    if (this._selectedPuppyId === MOTHER_VALUE) return [];
    return puppies.filter((p) => p.id === this._selectedPuppyId);
  }

  _measurementRows(puppy) {
    return filterMeasurements(puppy.measurements || [], rangeToHours(this._range));
  }

  _dossierRecords({ filterPeriod = true } = {}) {
    const records = [
      ...(this._dossierScopes.includes("litter") ? this._data?.litter?.records || [] : []),
      ...(this._dossierScopes.includes("puppy") ? this._selectedPuppies().flatMap((puppy) => puppy.records || []) : []),
    ];
    const hours = rangeToHours(this._range);
    const cutoff = filterPeriod && hours ? Date.now() - hours * 3600000 : null;
    return records.filter((record) => !record?.deleted
      && !record?.data?.care_occurrence_id
      && (this._dossierTypes === null || this._dossierTypes.includes(record.type))
      && (cutoff === null || Date.parse(record.occurred_at) >= cutoff));
  }

  _availableDossierTypes() {
    const records = [
      ...(this._dossierScopes.includes("litter") ? this._data?.litter?.records || [] : []),
      ...(this._dossierScopes.includes("puppy") ? this._selectedPuppies().flatMap((puppy) => puppy.records || []) : []),
    ];
    return [...new Set(records.filter((record) => !record?.deleted && !record?.data?.care_occurrence_id).map((record) => record.type).filter(Boolean))].sort();
  }

  _persistState() {
    saveCardState(this, { ...this._state, range: this._range, puppyId: this._selectedPuppyId, reportProfile: this._reportProfile, sectionState: this._sectionState, motherExportScope: this._motherExportScope, pdfLanguage: this._pdfLanguage, dossierTypes: this._dossierTypes, dossierScopes: this._dossierScopes });
  }

  _applyProfile(profileName) {
    const profile = REPORT_PROFILES[profileName] || this._state.reportProfiles?.[profileName];
    if (!profile?.sections) return;
    this._reportProfile = profileName;
    this._sectionState = normalizeSections(profile.sections);
    this._persistState();
    this._render();
  }

  _saveCustomProfile() {
    const name = window.prompt(reportText(this._hass, "profileNamePrompt"));
    if (!name?.trim()) return;
    const profiles = { ...(this._state.reportProfiles || {}) };
    const key = `custom_${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || Date.now()}`;
    profiles[key] = { nl: name.trim(), en: name.trim(), sections: { ...this._sectionState } };
    this._state = { ...this._state, reportProfiles: profiles };
    this._reportProfile = key;
    this._persistState();
    this._render();
  }

  async _export(format) {
    if (!this._hass || !this._selectedLitterId) return;
    if (this._selectedPuppyId === MOTHER_VALUE) {
      await this._exportMother(format);
      return;
    }
    this._status = reportText(this._hass, "preparingExport", { format: format.toUpperCase() });
    this._render();
    try {
      const sections = normalizeSections(this._sectionState);
      const options = ["csv", "pdf"].includes(format)
        ? {
            puppy_id: this._selectedPuppyId === LITTER_VALUE ? null : this._selectedPuppyId,
            range_hours: rangeToHours(this._range),
          }
        : {};
      if (format === "pdf") {
        options.sections = sections;
        options.language = this._pdfLanguage === "auto" ? languageForHass(this._hass) : this._pdfLanguage;
        options.dossier_types = this._dossierTypes;
        options.dossier_scopes = this._dossierScopes;
      }
      const result = await fetchExport(
        this._hass,
        this._selectedLitterId,
        format,
        options
      );
      downloadExportFile(result);
      this._status = format === "json" ? reportText(this._hass, "jsonDone") : format === "pdf" ? reportText(this._hass, "pdfDone") : reportText(this._hass, "csvDone");
    } catch (err) {
      this._status = err?.message || reportText(this._hass, "exportFailed");
    }
    this._render();
  }

  async _exportMother(format) {
    if (format !== "json") {
      this._status = reportText(this._hass, "motherJsonOnly");
      this._render();
      return;
    }
    this._status = reportText(this._hass, "preparingMother");
    this._render();
    try {
      const result = await this._hass.callWS({
        type: "puppy_tracker/mother/export_url",
        litter_id: this._selectedLitterId,
        history_scope: this._motherExportScope,
      });
      const anchor = document.createElement("a");
      anchor.href = result.url;
      anchor.download = "puppy-tracker-mother.json";
      anchor.rel = "noopener";
      anchor.style.display = "none";
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      this._status = reportText(this._hass, "motherDone");
    } catch (error) {
      this._status = error?.message || reportText(this._hass, "motherExportFailed");
    }
    this._render();
  }

  _render() {
    const litter = this._data?.litter;
    const motherName = litter?.mother || "";
    const motherSelected = this._selectedPuppyId === MOTHER_VALUE;
    const puppies = this._data?.puppies || [];
    const selected = this._selectedPuppies();
    const sections = normalizeSections(this._sectionState);
    const warnings = sections.attention ? selected.filter((p) => p.summary?.needs_attention).length : 0;
    const measurementCount = sections.measurements || sections.chart ? selected.reduce((sum, p) => sum + this._measurementRows(p).length, 0) : 0;
    const measurementLabel = sections.measurements ? "measurements" : sections.chart ? "chartPoints" : "measurements";
    const cutoff = rangeToHours(this._range) ? Date.now() - rangeToHours(this._range) * 3600000 : null;
    const careCount = sections.care ? selected.reduce((sum, puppy) => sum + (puppy.records || []).filter((record) => !record.deleted && record.data?.care_occurrence_id && (cutoff === null || Date.parse(record.occurred_at) >= cutoff)).length, 0) : 0;
    const dossierCount = sections.dossier ? this._dossierRecords().length : 0;
    const litterOptions = this._litters.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === this._selectedLitterId ? "selected" : ""}>${escapeHtml(item.name || reportText(this._hass, "litterName"))}</option>`).join("");
    const puppyOptions = `<option value="${LITTER_VALUE}" ${this._selectedPuppyId === LITTER_VALUE ? "selected" : ""}>${escapeHtml(reportText(this._hass, "wholeLitter"))}</option>${motherName ? `<option value="${MOTHER_VALUE}" ${motherSelected ? "selected" : ""}>${escapeHtml(reportText(this._hass, "mother"))} · ${escapeHtml(motherName)}</option>` : ""}${puppies.map((p) => `<option value="${escapeHtml(p.id)}" ${p.id === this._selectedPuppyId ? "selected" : ""}>${escapeHtml(p.name || reportText(this._hass, "puppy"))}${p.collar_color ? ` – ${escapeHtml(p.collar_color)}` : ""}${p.active === false ? ` (${escapeHtml(reportText(this._hass, "inactive"))})` : ""}</option>`).join("")}`;
    const motherScopeField = motherSelected ? `<div class="field"><label>${escapeHtml(reportText(this._hass, "motherHistory"))}</label><select id="mother-export-scope"><option value="all" ${this._motherExportScope === "all" ? "selected" : ""}>${escapeHtml(reportText(this._hass, "allLitters"))}</option><option value="current" ${this._motherExportScope === "current" ? "selected" : ""}>${escapeHtml(reportText(this._hass, "currentLitterOnly"))}</option></select></div>` : "";
    const profiles = { ...REPORT_PROFILES, ...(this._state.reportProfiles || {}) };
    if (this._reportProfile === "custom" && !profiles.custom) profiles.custom = { nl: reportText(this._hass, "customProfile"), en: reportText(this._hass, "customProfile"), sections };
    const profileOptions = Object.entries(profiles).map(([key, profile]) => `<option value="${escapeHtml(key)}" ${key === this._reportProfile ? "selected" : ""}>${escapeHtml(profileLabel(this._hass, profile))}</option>`).join("");
    const sectionControls = Object.entries(PDF_SECTION_LABELS).map(([key, labelKey]) => `<label><input type="checkbox" data-pdf-section="${key}" ${sections[key] ? "checked" : ""} ${key === "owner_contact" && !sections.owners ? "disabled" : ""}> ${escapeHtml(reportText(this._hass, labelKey))}</label>`).join("");
    const availableTypes = this._availableDossierTypes();
    const categoryControls = availableTypes.map((type) => `<label><input type="checkbox" data-dossier-type="${escapeHtml(type)}" ${this._dossierTypes === null || this._dossierTypes.includes(type) ? "checked" : ""}> ${escapeHtml(recordTypeLabel(this._hass, type))}</label>`).join("");
    const dossierControls = sections.dossier ? `<details class="dossier-filters" ${this._filtersOpen ? "open" : ""}><summary>${escapeHtml(reportText(this._hass, "dossierSources"))} / ${escapeHtml(reportText(this._hass, "dossierCategories"))}</summary><div class="filter-row"><strong>${escapeHtml(reportText(this._hass, "dossierSources"))}</strong><label><input type="checkbox" data-dossier-scope="litter" ${this._dossierScopes.includes("litter") ? "checked" : ""}> ${escapeHtml(reportText(this._hass, "litterSource"))}</label><label><input type="checkbox" data-dossier-scope="puppy" ${this._dossierScopes.includes("puppy") ? "checked" : ""}> ${escapeHtml(reportText(this._hass, "puppySource"))}</label></div>${availableTypes.length ? `<div class="filter-row"><strong>${escapeHtml(reportText(this._hass, "dossierCategories"))}</strong><button type="button" class="small-button" id="all-dossier-types">${escapeHtml(reportText(this._hass, "selectAll"))}</button><button type="button" class="small-button" id="no-dossier-types">${escapeHtml(reportText(this._hass, "selectNone"))}</button>${categoryControls}</div>` : ""}</details>` : "";
    const selectedSectionNames = Object.entries(PDF_SECTION_LABELS).filter(([key]) => sections[key]).map(([, key]) => reportText(this._hass, key)).join(" · ") || reportText(this._hass, "noSections");
    const selectedScope = this._selectedPuppyId === LITTER_VALUE ? reportText(this._hass, "wholeLitter") : selected[0]?.name || reportText(this._hass, "selectedPuppy");
    const periodLabel = { "24h": "hours24", "3d": "days3", "7d": "days7", "14d": "days14", "30d": "days30", all: "all" }[this._range] || "all";
    const languageLabel = this._pdfLanguage === "auto" ? reportText(this._hass, "automaticLanguage") : reportText(this._hass, this._pdfLanguage === "en" ? "englishLanguage" : "dutchLanguage");
    this.shadowRoot.innerHTML = `
      <ha-card><style>
        ha-card{padding:16px;container-type:inline-size;container-name:report-card}.title{font-size:18px;font-weight:600;margin-bottom:3px}.sub{font-size:12px;color:var(--secondary-text-color);margin-bottom:12px}.controls{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}.field{min-width:0}.field label{display:block;font-size:11px;color:var(--secondary-text-color);margin:0 0 4px 2px}.field select{width:100%;min-width:0;min-height:42px;border:1px solid var(--divider-color);border-radius:8px;background:var(--card-background-color);color:var(--primary-text-color);padding:0 9px;font-size:14px}.pdf-sections,.filter-row{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:12px}.pdf-sections label,.filter-row label{font-size:12px;display:flex;align-items:center;gap:5px}.pdf-sections input,.filter-row input{accent-color:var(--primary-color)}.dossier-filters{margin-top:10px;border-top:1px solid var(--divider-color);padding-top:10px;font-size:12px}.dossier-filters summary{cursor:pointer;font-weight:600}.filter-row strong{font-size:11px;color:var(--secondary-text-color)}.small-button{border:1px solid var(--divider-color);background:var(--secondary-background-color);color:var(--primary-text-color);min-height:32px;border-radius:6px;padding:0 9px;cursor:pointer}.preview{margin-top:12px;border-top:1px solid var(--divider-color);padding-top:10px}.preview-summary{font-size:12px;line-height:1.5}.preview-summary span{display:block;color:var(--secondary-text-color)}.preview-counts{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin-top:8px}.box{min-width:0;border:1px solid var(--divider-color);border-radius:8px;padding:10px}.box span{display:block;font-size:11px;color:var(--secondary-text-color)}.box b{display:block;margin-top:3px;font-size:16px}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.actions button{min-height:42px;border:0;border-radius:8px;padding:0 13px;font-weight:600;cursor:pointer;background:var(--primary-color);color:var(--text-primary-color,#fff)}.actions button.secondary{background:var(--secondary-background-color);color:var(--primary-text-color);border:1px solid var(--divider-color)}.status{font-size:12px;color:var(--secondary-text-color);margin-top:9px}.error{color:var(--error-color)}.note{font-size:11px;color:var(--secondary-text-color);margin-top:10px;line-height:1.4}
        @container report-card (max-width:600px){.controls{grid-template-columns:1fr}.preview-counts{grid-template-columns:repeat(2,minmax(0,1fr))}.actions button{flex:1 1 auto}}
        @container report-card (max-width:380px){ha-card{padding:13px}.actions{display:grid;grid-template-columns:1fr}.actions button{width:100%}}
      </style>
      <div class="title">${escapeHtml(this._config.title ?? reportText(this._hass, "title"))}</div><div class="sub">${escapeHtml(reportText(this._hass, "subtitle"))}</div>
      ${this._error ? `<div class="error">${escapeHtml(this._error)}</div>` : `
      <div class="controls"><div class="field"><label>${escapeHtml(reportText(this._hass, "litter"))}</label><select id="litter">${litterOptions}</select></div><div class="field"><label>${escapeHtml(reportText(this._hass, "selection"))}</label><select id="puppy">${puppyOptions}</select></div>${motherSelected ? motherScopeField : `<div class="field"><label>${escapeHtml(reportText(this._hass, "period"))}</label><select id="range"><option value="24h" ${this._range === "24h" ? "selected" : ""}>${escapeHtml(reportText(this._hass, "hours24"))}</option><option value="3d" ${this._range === "3d" ? "selected" : ""}>${escapeHtml(reportText(this._hass, "days3"))}</option><option value="7d" ${this._range === "7d" ? "selected" : ""}>${escapeHtml(reportText(this._hass, "days7"))}</option><option value="14d" ${this._range === "14d" ? "selected" : ""}>${escapeHtml(reportText(this._hass, "days14"))}</option><option value="30d" ${this._range === "30d" ? "selected" : ""}>${escapeHtml(reportText(this._hass, "days30"))}</option><option value="all" ${this._range === "all" ? "selected" : ""}>${escapeHtml(reportText(this._hass, "all"))}</option></select></div><div class="field"><label>${escapeHtml(reportText(this._hass, "profile"))}</label><select id="profile">${profileOptions}</select></div><div class="field"><label>${escapeHtml(reportText(this._hass, "pdfLanguage"))}</label><select id="pdf-language"><option value="auto" ${this._pdfLanguage === "auto" ? "selected" : ""}>${escapeHtml(reportText(this._hass, "automaticLanguage"))}</option><option value="nl" ${this._pdfLanguage === "nl" ? "selected" : ""}>${escapeHtml(reportText(this._hass, "dutchLanguage"))}</option><option value="en" ${this._pdfLanguage === "en" ? "selected" : ""}>${escapeHtml(reportText(this._hass, "englishLanguage"))}</option></select></div>`}</div>
      ${motherSelected ? "" : `<div class="pdf-sections"><strong>${escapeHtml(reportText(this._hass, "pdfSections"))}</strong>${sectionControls}<button class="small-button" id="save-profile" type="button">${escapeHtml(reportText(this._hass, "saveProfile"))}</button></div>${dossierControls}
      <div class="preview"><div class="preview-summary"><strong>${escapeHtml(reportText(this._hass, "preview"))}</strong><span>${escapeHtml(selectedScope)} · ${escapeHtml(reportText(this._hass, periodLabel))} · ${escapeHtml(languageLabel)}</span><span>${escapeHtml(reportText(this._hass, "selectedSections"))}: ${escapeHtml(selectedSectionNames)}</span></div><div class="preview-counts"><div class="box"><span>${escapeHtml(reportText(this._hass, "puppies"))}</span><b>${selected.length}</b></div><div class="box"><span>${escapeHtml(reportText(this._hass, measurementLabel))}</span><b>${measurementCount}</b></div><div class="box"><span>${escapeHtml(reportText(this._hass, "careCount"))}</span><b>${careCount}</b></div><div class="box"><span>${escapeHtml(reportText(this._hass, "dossierCount"))}</span><b>${dossierCount}</b></div><div class="box"><span>${escapeHtml(reportText(this._hass, "attention"))}</span><b>${warnings}</b></div></div></div>`}
      <div class="actions">${motherSelected ? "" : `<button id="pdf">${escapeHtml(reportText(this._hass, "pdf"))}</button><button class="secondary" id="csv">${escapeHtml(reportText(this._hass, "csv"))}</button>`}<button class="secondary" id="json">${escapeHtml(reportText(this._hass, motherSelected ? "motherJson" : "json"))}</button></div>
      <div class="status">${escapeHtml(this._status)}</div><div class="note">${escapeHtml(reportText(this._hass, motherSelected ? "motherNote" : "note"))}</div>`}
      </ha-card>`;

    this.shadowRoot.getElementById("litter")?.addEventListener("change", async (e) => { this._selectedLitterId = e.target.value; this._selectedPuppyId = LITTER_VALUE; await this._loadData(); });
    this.shadowRoot.getElementById("puppy")?.addEventListener("change", (e) => { this._selectedPuppyId = e.target.value; this._persistState(); this._render(); });
    this.shadowRoot.getElementById("mother-export-scope")?.addEventListener("change", (e) => { this._motherExportScope = e.target.value; this._persistState(); });
    this.shadowRoot.getElementById("range")?.addEventListener("change", (e) => { this._range = e.target.value; this._persistState(); this._render(); });
    this.shadowRoot.getElementById("profile")?.addEventListener("change", (e) => this._applyProfile(e.target.value));
    this.shadowRoot.getElementById("pdf-language")?.addEventListener("change", (e) => { this._pdfLanguage = e.target.value; this._persistState(); this._render(); });
    this.shadowRoot.querySelectorAll("[data-pdf-section]").forEach((input) => input.addEventListener("change", () => { this._sectionState = normalizeSections(Object.fromEntries([...this.shadowRoot.querySelectorAll("[data-pdf-section]")].map((item) => [item.dataset.pdfSection, item.checked]))); this._reportProfile = "custom"; this._persistState(); this._render(); }));
    this.shadowRoot.querySelector(".dossier-filters")?.addEventListener("toggle", (event) => { this._filtersOpen = event.target.open; });
    this.shadowRoot.querySelectorAll("[data-dossier-scope]").forEach((input) => input.addEventListener("change", () => { this._dossierScopes = [...this.shadowRoot.querySelectorAll("[data-dossier-scope]:checked")].map((item) => item.dataset.dossierScope); this._persistState(); this._render(); }));
    this.shadowRoot.querySelectorAll("[data-dossier-type]").forEach((input) => input.addEventListener("change", () => { this._dossierTypes = [...this.shadowRoot.querySelectorAll("[data-dossier-type]:checked")].map((item) => item.dataset.dossierType); this._persistState(); this._render(); }));
    this.shadowRoot.getElementById("all-dossier-types")?.addEventListener("click", () => { this._dossierTypes = null; this._persistState(); this._render(); });
    this.shadowRoot.getElementById("no-dossier-types")?.addEventListener("click", () => { this._dossierTypes = []; this._persistState(); this._render(); });
    this.shadowRoot.getElementById("save-profile")?.addEventListener("click", () => this._saveCustomProfile());
    this.shadowRoot.getElementById("pdf")?.addEventListener("click", () => this._export("pdf"));
    this.shadowRoot.getElementById("csv")?.addEventListener("click", () => this._export("csv"));
    this.shadowRoot.getElementById("json")?.addEventListener("click", () => this._export("json"));
  }
}

if (!customElements.get("puppy-tracker-report-card")) {
  customElements.define("puppy-tracker-report-card", PuppyTrackerReportCard);
}
window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === "puppy-tracker-report-card")) {
  window.customCards.push({ type: "puppy-tracker-report-card", name: "Puppy Tracker Report", description: "Create PDF reports and data exports." });
}
