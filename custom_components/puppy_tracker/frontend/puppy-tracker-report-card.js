import {
  puppySelectorLabel,
  downloadExportFile,
  escapeHtml,
  fetchExport,
  fetchReportLogo,
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
import "./puppy-tracker-documents.js";

const REPORT_TEXT = {
  nl: {
    title: "Rapport & export", subtitle: "Maak een PDF-dossier, exporteer gegevens of gebruik een documentsjabloon.", litter: "Nest", selection: "Selectie", period: "Periode", all: "Alles", wholeLitter: "Hele nest", mother: "Moederhond", motherHistory: "Moederhistorie", allLitters: "Alle nesten", currentLitterOnly: "Alleen dit nest", hours24: "24 uur", days3: "3 dagen", days7: "7 dagen", days14: "14 dagen", days30: "30 dagen", puppies: "Pups", measurements: "Metingen", attention: "Gewichtsaandacht", pdf: "PDF downloaden", csv: "CSV", json: "JSON-nestback-up", motherJson: "Moeder JSON-back-up", note: "PDF en CSV volgen de gekozen pup en periode. De periode filtert metingen, grafiek en zorgresultaten; samenvatting, gewichtsaandacht en baasjes tonen de actuele stand. JSON is altijd een volledige importeerbare nestback-up.", motherNote: "Moeder JSON bevat standaard de volledige historie over alle nesten; dit is hierboven te beperken tot het huidige nest.", loadFailed: "Rapportgegevens konden niet worden geladen.", refreshFailed: "Nieuwe Puppy Tracker-data kon niet worden geladen.", dataFailed: "Nestdata kon niet worden geladen.", exportFailed: "Export mislukt.", motherExportFailed: "Moederexport mislukt.", pdfDone: "PDF-rapport gedownload.", csvDone: "CSV gedownload.", jsonDone: "JSON-nestback-up gedownload.", motherDone: "Moederdossier gedownload.", preparingExport: "{format} voorbereiden…", preparingMother: "Moederdossier voorbereiden…", motherJsonOnly: "Voor de moeder is momenteel alleen JSON-dossierexport beschikbaar.", puppy: "Pup", inactive: "inactief", litterName: "Nest", pdfSections: "Onderdelen in PDF", summarySection: "Samenvatting", chartSection: "Grafiek", measurementSection: "Metingen", careSection: "Zorgresultaten", behaviorSection: "Gedragsprofiel", attentionSection: "Gewichtsaandacht", ownersSection: "Baasjes en plaatsing", ownerContactSection: "Contactgegevens", profile: "PDF-profiel", customProfile: "Aangepast", saveProfile: "Profiel opslaan", profileNamePrompt: "Naam voor dit PDF-profiel",
  },
  en: {
    title: "Report & export", subtitle: "Create a PDF report, export data or use a document template.", litter: "Litter", selection: "Selection", period: "Period", all: "All", wholeLitter: "Whole litter", mother: "Mother", motherHistory: "Mother history", allLitters: "All litters", currentLitterOnly: "Current litter only", hours24: "24 hours", days3: "3 days", days7: "7 days", days14: "14 days", days30: "30 days", puppies: "Puppies", measurements: "Measurements", attention: "Weight attention", pdf: "Download PDF", csv: "CSV", json: "Litter JSON backup", motherJson: "Mother JSON backup", note: "PDF and CSV follow the selected puppy and period. The period filters measurements, chart data and care results; summary, weight attention and owners show the current state. JSON is always a complete importable litter backup.", motherNote: "Mother JSON includes the complete history across all litters by default; limit it to the current litter above if needed.", loadFailed: "Report data could not be loaded.", refreshFailed: "New Puppy Tracker data could not be loaded.", dataFailed: "Litter data could not be loaded.", exportFailed: "Export failed.", motherExportFailed: "Mother export failed.", pdfDone: "PDF report downloaded.", csvDone: "CSV downloaded.", jsonDone: "Litter JSON backup downloaded.", motherDone: "Mother dossier downloaded.", preparingExport: "Preparing {format}…", preparingMother: "Preparing mother dossier…", motherJsonOnly: "Only JSON dossier export is currently available for the mother.", puppy: "Puppy", inactive: "inactive", litterName: "Litter", pdfSections: "PDF sections", summarySection: "Summary", chartSection: "Chart", measurementSection: "Measurements", careSection: "Care results", behaviorSection: "Behavior profile", attentionSection: "Weight attention", ownersSection: "Owners and placement", ownerContactSection: "Contact details", profile: "PDF profile", customProfile: "Custom", saveProfile: "Save profile", profileNamePrompt: "Name for this PDF profile",
  },
};

Object.assign(REPORT_TEXT.nl, {
  pdfHeading: "PDF-dossier", dataHeading: "Gegevens exporteren en back-up", csvDescription: "CSV gebruikt de gekozen pup en periode.", backupDescription: "JSON is een volledige importeerbare back-up van het nest.",
  adminOnly: "Rapporten en exports zijn alleen beschikbaar voor beheerders.",
  identitySection: "Identiteit", dossierSection: "Dossieritems", pdfLanguage: "PDF-taal",
  brandLogoSection: "Logo", breederNameSection: "Fokkersnaam", breederContactSection: "Contactgegevens fokker", profileNoteSection: "Profielnotitie pup",
  chartPoints: "Grafiekpunten",
  automaticLanguage: "Automatisch", dutchLanguage: "Nederlands", englishLanguage: "Engels",
  dossierSources: "Dossierbronnen", litterSource: "Hele nest", puppySource: "Pups",
  dossierCategories: "Dossiercategorieën", selectAll: "Alles", selectNone: "Geen",
  preview: "Inhoud van PDF", careCount: "Zorgresultaten", behaviorCount: "Gedragsobservaties", dossierCount: "Dossieritems",
  selectedSections: "Gekozen onderdelen", noSections: "Geen onderdelen gekozen",
  linkedOwners: "Gekoppelde baasjes", selectedPuppy: "Geselecteerde pup",
  note: "PDF en CSV volgen de gekozen pup en periode. De PDF-periode filtert metingen, grafiek, zorgresultaten, gedrag en dossieritems; samenvatting, gewichtsaandacht en baasjes tonen de actuele stand. JSON blijft een volledige importeerbare nestback-up.",
});
Object.assign(REPORT_TEXT.en, {
  pdfHeading: "PDF report", dataHeading: "Data export and backup", csvDescription: "CSV uses the selected puppy and period.", backupDescription: "JSON is a complete importable litter backup.",
  adminOnly: "Reports and exports are only available to administrators.",
  identitySection: "Identity", dossierSection: "Dossier items", pdfLanguage: "PDF language",
  brandLogoSection: "Logo", breederNameSection: "Breeder name", breederContactSection: "Breeder contact details", profileNoteSection: "Puppy profile note",
  chartPoints: "Chart points",
  automaticLanguage: "Automatic", dutchLanguage: "Dutch", englishLanguage: "English",
  dossierSources: "Dossier sources", litterSource: "Whole litter", puppySource: "Puppies",
  dossierCategories: "Dossier categories", selectAll: "All", selectNone: "None",
  preview: "PDF contents", careCount: "Care results", behaviorCount: "Behavior observations", dossierCount: "Dossier items",
  selectedSections: "Selected sections", noSections: "No sections selected",
  linkedOwners: "Linked owners", selectedPuppy: "Selected puppy",
  note: "PDF and CSV follow the selected puppy and period. The PDF period filters measurements, chart data, care results, behavior and dossier items; summary, weight attention and owners show the current state. JSON remains a complete importable litter backup.",
});

const LITTER_VALUE = "__litter__";
const MOTHER_VALUE = "__mother__";
const PDF_SECTION_DEFAULTS = { identity: true, summary: true, chart: true, measurements: true, care: true, behavior: true, dossier: true, attention: true, owners: true, owner_contact: false, brand_logo: true, breeder_name: true, breeder_contact: false, profile_note: false };
const PDF_SECTION_LABELS = { identity: "identitySection", summary: "summarySection", chart: "chartSection", measurements: "measurementSection", care: "careSection", behavior: "behaviorSection", dossier: "dossierSection", attention: "attentionSection", owners: "ownersSection", owner_contact: "ownerContactSection", brand_logo: "brandLogoSection", breeder_name: "breederNameSection", breeder_contact: "breederContactSection", profile_note: "profileNoteSection" };

async function reportLogo(url) {
  if (!url) return null;
  let source;
  try { source = new URL(url, window.location.href); } catch { return null; }
  // Local HA images avoid external tracking, CORS surprises and server-side URL fetching.
  if (source.origin !== window.location.origin || !["http:", "https:"].includes(source.protocol)) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  let bitmap;
  try {
    const response = await fetch(source.href, { signal: controller.signal, redirect: "error" });
    if (!response.ok || Number(response.headers.get("content-length")) > 2_000_000) return null;
    const mime = (response.headers.get("content-type") || "").split(";")[0].trim();
    if (!["image/jpeg", "image/png"].includes(mime) || !response.body) return null;
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 2_000_000) { await reader.cancel(); return null; }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const blob = new Blob(chunks, { type: mime });
    bitmap = await createImageBitmap(blob);
    if (bitmap.width * bitmap.height > 16_000_000) return null;
    const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const encoded = canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
    return encoded.length <= 682_668 ? encoded : null;
  } catch {
    return null;
  } finally {
    controller.abort();
    clearTimeout(timeout);
    bitmap?.close();
  }
}

function normalizeSections(sections = {}) {
  const normalized = Object.fromEntries(
    Object.entries(PDF_SECTION_DEFAULTS).map(([key, fallback]) => [key, Object.hasOwn(sections, key) ? Boolean(sections[key]) : fallback])
  );
  if (!normalized.owners) normalized.owner_contact = false;
  if (!normalized.identity) normalized.profile_note = false;
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
  full: { nl: "Volledig dossier", en: "Full dossier", sections: { identity: true, summary: true, chart: true, measurements: true, care: true, behavior: true, dossier: true, attention: true, owners: true, owner_contact: true } },
  handover: { nl: "Overdracht aan baasje", en: "Owner handover", sections: { identity: true, summary: true, chart: true, measurements: true, care: true, behavior: true, dossier: true, attention: false, owners: true, owner_contact: true } },
  internal: { nl: "Intern fokdossier", en: "Internal breeding record", sections: { identity: true, summary: true, chart: true, measurements: true, care: true, behavior: true, dossier: true, attention: true, owners: true, owner_contact: false } },
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
    this._contextVersion = 0;
    this._dataRequest = 0;
    this._exporting = false;
    this._refreshDeferred = false;
    this._pendingConfig = null;
    this._exportError = "";
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
    if (this._exporting) { this._pendingConfig = { ...config }; return; }
    const changed = config.litter_id && config.litter_id !== this._selectedLitterId;
    this._config = { title: null, default_range: "all", default_profile: "full", ...config };
    if (changed) { this._invalidateLoads(); this._data = null; this._status = ""; this._exportError = ""; }
    this._selectedLitterId = config.litter_id || this._selectedLitterId;
    this._range = Object.hasOwn(config, "default_range") ? (config.default_range || "all") : (this._state.range || this._range);
    if (!this._state.reportProfile && REPORT_PROFILES[this._config.default_profile]) {
      this._reportProfile = this._config.default_profile;
      this._sectionState = normalizeSections(REPORT_PROFILES[this._reportProfile].sections);
    }
    this._render();
    if (changed && this._hass) this._loadInitial();
  }

  set hass(hass) {
    const reconnected = this._hass && this._hass.connection !== hass?.connection;
    if (reconnected) this.disconnectedCallback();
    this._hass = hass;
    if (this._documentPanel) this._documentPanel.hass = hass;
    if (hass?.user?.is_admin === false) {
      this._data = null;
      this._litters = [];
      this.disconnectedCallback();
      this._render();
      return;
    }
    if (reconnected) {
      if (this._exporting) { this._refreshDeferred = true; this._ensureSubscription(); }
      else this._loadInitial();
      return;
    }
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
      this._queueRefresh();
    }
  }

  disconnectedCallback() {
    if (this._exporting) this._status = "";
    this._invalidateLoads();
    if (this._unsubscribe) Promise.resolve(this._unsubscribe()).catch(() => undefined);
    this._unsubscribe = null;
  }

  getCardSize() { return 5; }
  getGridOptions() { return { columns: 12, min_columns: 6 }; }

  _invalidateLoads() {
    this._contextVersion += 1;
    this._dataRequest += 1;
    this._loading = false;
    this._refreshing = false;
    this._refreshAgain = false;
  }

  _isCurrent(context, connection) {
    return context === this._contextVersion && connection === this._hass?.connection && this._hass?.user?.is_admin !== false;
  }

  async _loadInitial() {
    if (!this._hass || this._hass.user?.is_admin === false || this._loading) return;
    const context = this._contextVersion;
    const hass = this._hass;
    this._loading = true;
    try {
      const response = await fetchLitters(hass);
      if (!this._isCurrent(context, hass.connection)) return;
      this._litters = response?.litters || [];
      this._selectedLitterId = selectDefaultLitter(this._litters, this._selectedLitterId || this._config.litter_id);
      if (!await this._loadData(false)) return;
      this._error = "";
      await this._ensureSubscription();
    } catch (err) {
      if (this._isCurrent(context, hass.connection)) this._error = err?.message || reportText(this._hass, "loadFailed");
    } finally {
      if (this._isCurrent(context, hass.connection)) { this._loading = false; this._render(); }
    }
  }

  async _ensureSubscription() {
    if (!this._hass || this._hass.user?.is_admin === false || this._unsubscribe || this._subscriptionPending || !this.isConnected) return;
    this._subscriptionPending = true;
    try {
      this._unsubscribe = await subscribeUpdates(this._hass, () => this._queueRefresh(), this);
      if (this._hass?.user?.is_admin === false) this.disconnectedCallback();
    } catch (err) {
      // Keep showing the last good data. The next hass/connected cycle retries.
      this._unsubscribe = null;
    } finally {
      this._subscriptionPending = false;
    }
  }

  async _queueRefresh() {
    if (!this._hass || this._hass.user?.is_admin === false || this._loading) return;
    if (this._exporting) { this._refreshDeferred = true; return; }
    if (this._refreshing) {
      this._refreshAgain = true;
      return;
    }
    const context = this._contextVersion;
    const hass = this._hass;
    let applied = false;
    this._refreshing = true;
    try {
      do {
        this._refreshAgain = false;
        const response = await fetchLitters(hass);
        if (!this._isCurrent(context, hass.connection)) return;
        if (this._exporting) { this._refreshDeferred = true; return; }
        this._litters = response?.litters || this._litters;
        const litterId = selectDefaultLitter(
          this._litters,
          this._selectedLitterId || this._config.litter_id
        );
        if (litterId !== this._selectedLitterId) {
          await this._changeLitter(litterId);
          return;
        }
        applied = await this._loadData(false);
      } while (applied && this._isCurrent(context, hass.connection) && this._refreshAgain);
      if (applied && this._isCurrent(context, hass.connection)) this._error = "";
    } catch (err) {
      if (this._exporting) { this._refreshDeferred = true; return; }
      if (this._isCurrent(context, hass.connection)) { this._error = err?.message || reportText(this._hass, "refreshFailed"); applied = true; }
    } finally {
      if (this._isCurrent(context, hass.connection)) { this._refreshing = false; if (applied && !this._exporting) this._render(); }
    }
  }

  async _loadData(render = true) {
    if (!this._hass || this._hass.user?.is_admin === false) return false;
    if (!this._selectedLitterId) { this._data = null; return true; }
    const request = ++this._dataRequest;
    const context = this._contextVersion;
    const hass = this._hass;
    const litterId = this._selectedLitterId;
    const current = () => this._isCurrent(context, hass.connection) && request === this._dataRequest && litterId === this._selectedLitterId;
    try {
      const data = await fetchLitterData(hass, litterId);
      if (!current()) return false;
      if (this._exporting) { this._refreshDeferred = true; return false; }
      this._data = data;
      const specialScopes = new Set([LITTER_VALUE, MOTHER_VALUE]);
      if (!specialScopes.has(this._selectedPuppyId) && !(this._data.puppies || []).some((p) => p.id === this._selectedPuppyId)) {
        this._selectedPuppyId = LITTER_VALUE;
      }
      this._error = "";
    } catch (err) {
      if (!current()) return false;
      throw err;
    }
    if (render) this._render();
    return true;
  }

  async _changeLitter(litterId) {
    if (this._exporting) return;
    this._invalidateLoads();
    const context = this._contextVersion;
    const connection = this._hass?.connection;
    this._selectedLitterId = litterId;
    this._selectedPuppyId = LITTER_VALUE;
    this._data = null;
    this._exportError = "";
    this._error = "";
    this._status = "";
    if (!this._litters.length) { await this._loadInitial(); return; }
    this._loading = true;
    this._render();
    try { await this._loadData(false); }
    catch (err) { if (this._isCurrent(context, connection)) this._error = err?.message || reportText(this._hass, "dataFailed"); }
    finally { if (this._isCurrent(context, connection)) { this._loading = false; this._render(); } }
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
      && !record?.data?.care_occurrence_id && record?.type !== "behavior_observation"
      && (this._dossierTypes === null || this._dossierTypes.includes(record.type))
      && (cutoff === null || Date.parse(record.occurred_at) >= cutoff));
  }

  _availableDossierTypes() {
    const records = [
      ...(this._dossierScopes.includes("litter") ? this._data?.litter?.records || [] : []),
      ...(this._dossierScopes.includes("puppy") ? this._selectedPuppies().flatMap((puppy) => puppy.records || []) : []),
    ];
    return [...new Set(records.filter((record) => !record?.deleted && !record?.data?.care_occurrence_id && record?.type !== "behavior_observation").map((record) => record.type).filter(Boolean))].sort();
  }

  _persistState() {
    saveCardState(this, { ...this._state, range: this._range, puppyId: this._selectedPuppyId, reportProfile: this._reportProfile, sectionState: this._sectionState, motherExportScope: this._motherExportScope, pdfLanguage: this._pdfLanguage, dossierTypes: this._dossierTypes, dossierScopes: this._dossierScopes });
  }

  _applyProfile(profileName) {
    if (this._exporting) return;
    const profile = REPORT_PROFILES[profileName] || this._state.reportProfiles?.[profileName];
    if (!profile?.sections) return;
    this._reportProfile = profileName;
    this._sectionState = normalizeSections(profile.sections);
    this._persistState();
    this._render();
  }

  _saveCustomProfile() {
    if (this._exporting) return;
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
    if (this._exporting || !["pdf", "csv", "json"].includes(format) || !this._hass || this._hass.user?.is_admin === false || !this._selectedLitterId || this._loading || !this._data) return;
    const mother = this._selectedPuppyId === MOTHER_VALUE;
    if (mother && format !== "json") {
      this._status = reportText(this._hass, "motherJsonOnly");
      this._render();
      return;
    }
    const snapshot = {
      hass: this._hass,
      context: this._contextVersion,
      litterId: this._selectedLitterId,
      motherScope: this._motherExportScope,
      options: ["csv", "pdf"].includes(format) ? {
        puppy_id: this._selectedPuppyId === LITTER_VALUE ? null : this._selectedPuppyId,
        range_hours: rangeToHours(this._range),
      } : {},
    };
    if (format === "pdf") Object.assign(snapshot.options, {
      sections: normalizeSections(this._sectionState),
      language: this._pdfLanguage === "auto" ? languageForHass(snapshot.hass) : this._pdfLanguage,
      dossier_types: this._dossierTypes === null ? null : [...this._dossierTypes],
      dossier_scopes: [...this._dossierScopes],
      branding: {},
    });
    const current = () => this.isConnected && this._isCurrent(snapshot.context, snapshot.hass.connection);
    this._exporting = true;
    this._refreshDeferred ||= this._refreshing;
    this._dataRequest += 1;
    this._error = "";
    this._exportError = "";
    this._status = reportText(snapshot.hass, mother ? "preparingMother" : "preparingExport", { format: format.toUpperCase() });
    this._render();
    try {
      if (mother) {
        const result = await snapshot.hass.callWS({ type: "puppy_tracker/mother/export_url", litter_id: snapshot.litterId, history_scope: snapshot.motherScope });
        if (!current()) return;
        const anchor = document.createElement("a");
        anchor.href = result.url;
        anchor.download = "puppy-tracker-mother.json";
        anchor.rel = "noopener";
        anchor.style.display = "none";
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
      } else {
        if (snapshot.options.sections?.brand_logo) {
          const configured = await fetchReportLogo(snapshot.hass);
          if (!current()) return;
          const logo = await reportLogo(configured.logo_url) || await reportLogo(configured.fallback_url);
          if (!current()) return;
          if (logo) snapshot.options.branding.logo_base64 = logo;
        }
        const result = await fetchExport(snapshot.hass, snapshot.litterId, format, snapshot.options);
        if (!current()) return;
        downloadExportFile(result);
      }
      this._status = reportText(snapshot.hass, mother ? "motherDone" : `${format}Done`);
    } catch (error) {
      if (current()) { this._status = ""; this._exportError = error?.message || reportText(snapshot.hass, mother ? "motherExportFailed" : "exportFailed"); }
    } finally {
      this._exporting = false;
      if (this._pendingConfig) {
        const config = this._pendingConfig;
        this._pendingConfig = null;
        this.setConfig(config);
      } else this._render();
      if (this._refreshDeferred && this.isConnected) { this._refreshDeferred = false; await this._queueRefresh(); }
    }
  }

  _render() {
    this._documentsOpen = this.shadowRoot.querySelector("#contract-documents")?.open ?? this._documentsOpen ?? false;
    this._pdfOpen = this.shadowRoot.querySelector("#pdf-report")?.open ?? this._pdfOpen ?? true;
    this._dataExportOpen = this.shadowRoot.querySelector("#data-export")?.open ?? this._dataExportOpen ?? false;
    if (this._hass?.user?.is_admin === false) {
      this.shadowRoot.innerHTML = `<ha-card style="display:block;padding:16px"><div role="status">${escapeHtml(reportText(this._hass, "adminOnly"))}</div></ha-card>`;
      return;
    }
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
    const behaviorCount = sections.behavior ? selected.reduce((sum, puppy) => sum + (puppy.records || []).filter((record) => !record.deleted && record.type === "behavior_observation" && (cutoff === null || Date.parse(record.occurred_at) >= cutoff)).length, 0) : 0;
    const dossierCount = sections.dossier ? this._dossierRecords().length : 0;
    const litterOptions = this._litters.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === this._selectedLitterId ? "selected" : ""}>${escapeHtml(item.name || reportText(this._hass, "litterName"))}</option>`).join("");
    const puppyOptions = `<option value="${LITTER_VALUE}" ${this._selectedPuppyId === LITTER_VALUE ? "selected" : ""}>${escapeHtml(reportText(this._hass, "wholeLitter"))}</option>${motherName ? `<option value="${MOTHER_VALUE}" ${motherSelected ? "selected" : ""}>${escapeHtml(reportText(this._hass, "mother"))} · ${escapeHtml(motherName)}</option>` : ""}${puppies.map((p) => `<option value="${escapeHtml(p.id)}" ${p.id === this._selectedPuppyId ? "selected" : ""}>${escapeHtml(puppySelectorLabel(p, reportText(this._hass, "puppy")))}${p.active === false ? ` (${escapeHtml(reportText(this._hass, "inactive"))})` : ""}</option>`).join("")}`;
    const motherScopeField = motherSelected ? `<div class="field"><label>${escapeHtml(reportText(this._hass, "motherHistory"))}</label><select id="mother-export-scope"><option value="all" ${this._motherExportScope === "all" ? "selected" : ""}>${escapeHtml(reportText(this._hass, "allLitters"))}</option><option value="current" ${this._motherExportScope === "current" ? "selected" : ""}>${escapeHtml(reportText(this._hass, "currentLitterOnly"))}</option></select></div>` : "";
    const profiles = { ...REPORT_PROFILES, ...(this._state.reportProfiles || {}) };
    if (this._reportProfile === "custom" && !profiles.custom) profiles.custom = { nl: reportText(this._hass, "customProfile"), en: reportText(this._hass, "customProfile"), sections };
    const profileOptions = Object.entries(profiles).map(([key, profile]) => `<option value="${escapeHtml(key)}" ${key === this._reportProfile ? "selected" : ""}>${escapeHtml(profileLabel(this._hass, profile))}</option>`).join("");
    const sectionControls = Object.entries(PDF_SECTION_LABELS).map(([key, labelKey]) => `<label><input type="checkbox" data-pdf-section="${key}" ${sections[key] ? "checked" : ""} ${(key === "owner_contact" && !sections.owners) || (key === "profile_note" && !sections.identity) ? "disabled" : ""}> ${escapeHtml(reportText(this._hass, labelKey))}</label>`).join("");
    const availableTypes = this._availableDossierTypes();
    const categoryControls = availableTypes.map((type) => `<label><input type="checkbox" data-dossier-type="${escapeHtml(type)}" ${this._dossierTypes === null || this._dossierTypes.includes(type) ? "checked" : ""}> ${escapeHtml(recordTypeLabel(this._hass, type))}</label>`).join("");
    const dossierControls = sections.dossier ? `<details class="dossier-filters" ${this._filtersOpen ? "open" : ""}><summary>${escapeHtml(reportText(this._hass, "dossierSources"))} / ${escapeHtml(reportText(this._hass, "dossierCategories"))}</summary><div class="filter-row"><strong>${escapeHtml(reportText(this._hass, "dossierSources"))}</strong><label><input type="checkbox" data-dossier-scope="litter" ${this._dossierScopes.includes("litter") ? "checked" : ""}> ${escapeHtml(reportText(this._hass, "litterSource"))}</label><label><input type="checkbox" data-dossier-scope="puppy" ${this._dossierScopes.includes("puppy") ? "checked" : ""}> ${escapeHtml(reportText(this._hass, "puppySource"))}</label></div>${availableTypes.length ? `<div class="filter-row"><strong>${escapeHtml(reportText(this._hass, "dossierCategories"))}</strong><button type="button" class="small-button" id="all-dossier-types">${escapeHtml(reportText(this._hass, "selectAll"))}</button><button type="button" class="small-button" id="no-dossier-types">${escapeHtml(reportText(this._hass, "selectNone"))}</button>${categoryControls}</div>` : ""}</details>` : "";
    const selectedSectionNames = Object.entries(PDF_SECTION_LABELS).filter(([key]) => sections[key]).map(([, key]) => reportText(this._hass, key)).join(" · ") || reportText(this._hass, "noSections");
    const selectedScope = this._selectedPuppyId === LITTER_VALUE ? reportText(this._hass, "wholeLitter") : puppySelectorLabel(selected[0], reportText(this._hass, "selectedPuppy"));
    const periodLabel = { "24h": "hours24", "3d": "days3", "7d": "days7", "14d": "days14", "30d": "days30", all: "all" }[this._range] || "all";
    const languageLabel = this._pdfLanguage === "auto" ? reportText(this._hass, "automaticLanguage") : reportText(this._hass, this._pdfLanguage === "en" ? "englishLanguage" : "dutchLanguage");
    const pdfSettings = `<div class="pdf-settings"><div class="field"><label>${escapeHtml(reportText(this._hass, "profile"))}</label><select id="profile">${profileOptions}</select></div><div class="field"><label>${escapeHtml(reportText(this._hass, "pdfLanguage"))}</label><select id="pdf-language"><option value="auto" ${this._pdfLanguage === "auto" ? "selected" : ""}>${escapeHtml(reportText(this._hass, "automaticLanguage"))}</option><option value="nl" ${this._pdfLanguage === "nl" ? "selected" : ""}>${escapeHtml(reportText(this._hass, "dutchLanguage"))}</option><option value="en" ${this._pdfLanguage === "en" ? "selected" : ""}>${escapeHtml(reportText(this._hass, "englishLanguage"))}</option></select></div></div>`;
    const reportMarkup = `
      <ha-card><style>
        ha-card{padding:16px;container-type:inline-size;container-name:report-card}.title{font-size:18px;font-weight:600;margin-bottom:3px}.sub{font-size:12px;color:var(--secondary-text-color);margin-bottom:12px}.controls{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}.field{min-width:0}.field label{display:block;font-size:11px;color:var(--secondary-text-color);margin:0 0 4px 2px}.field select{width:100%;min-width:0;min-height:42px;border:1px solid var(--divider-color);border-radius:8px;background:var(--card-background-color);color:var(--primary-text-color);padding:0 9px;font-size:14px}.pdf-sections,.filter-row{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:12px}.pdf-sections label,.filter-row label{font-size:12px;display:flex;align-items:center;gap:5px}.pdf-sections input,.filter-row input{accent-color:var(--primary-color)}.dossier-filters{margin-top:10px;border-top:1px solid var(--divider-color);padding-top:10px;font-size:12px}.dossier-filters summary{cursor:pointer;font-weight:600}.filter-row strong{font-size:11px;color:var(--secondary-text-color)}.small-button{border:1px solid var(--divider-color);background:var(--secondary-background-color);color:var(--primary-text-color);min-height:32px;border-radius:6px;padding:0 9px;cursor:pointer}.preview{margin-top:12px;border-top:1px solid var(--divider-color);padding-top:10px}.preview-summary{font-size:12px;line-height:1.5}.preview-summary span{display:block;color:var(--secondary-text-color)}.preview-counts{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px;margin-top:8px}.box{min-width:0;border:1px solid var(--divider-color);border-radius:8px;padding:10px}.box span{display:block;font-size:11px;color:var(--secondary-text-color)}.box b{display:block;margin-top:3px;font-size:16px}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.actions button{min-height:42px;border:0;border-radius:8px;padding:0 13px;font-weight:600;cursor:pointer;background:var(--primary-color);color:var(--text-primary-color,#fff)}.actions button.secondary{background:var(--secondary-background-color);color:var(--primary-text-color);border:1px solid var(--divider-color)}.status{font-size:12px;color:var(--secondary-text-color);margin-top:9px}.error{color:var(--error-color)}.note{font-size:11px;color:var(--secondary-text-color);margin-top:10px;line-height:1.4}
        .report-section{margin-top:18px;padding:14px;border:1px solid var(--divider-color);border-radius:12px}.report-section h3{font-size:15px;margin:0 0 6px}.report-section .preview{margin-top:12px}.report-section .actions{margin-top:10px}.section-help{font-size:12px;color:var(--secondary-text-color);line-height:1.4;margin:0 0 4px}
        .pdf-settings{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:12px}
        .report-section>summary{cursor:pointer;font-size:15px;font-weight:600;min-height:32px;display:list-item;list-style-position:inside}.report-section>summary:focus-visible{outline:2px solid var(--primary-color);outline-offset:3px;border-radius:4px}
        @container report-card (max-width:600px){.pdf-settings{grid-template-columns:1fr}.controls{grid-template-columns:1fr}.preview-counts{grid-template-columns:repeat(2,minmax(0,1fr))}.actions button{flex:1 1 auto}}
        @container report-card (max-width:380px){ha-card{padding:13px}.actions{display:grid;grid-template-columns:1fr}.actions button{width:100%}}
      </style>
      <div class="title">${escapeHtml(this._config.title ?? reportText(this._hass, "title"))}</div><div class="sub">${escapeHtml(reportText(this._hass, "subtitle"))}</div>
      ${this._exportError || this._error ? `<div class="error" role="alert">${escapeHtml(this._exportError || this._error)}</div>` : ""}
      <div class="controls"><div class="field"><label>${escapeHtml(reportText(this._hass, "litter"))}</label><select id="litter">${litterOptions}</select></div><div class="field"><label>${escapeHtml(reportText(this._hass, "selection"))}</label><select id="puppy">${puppyOptions}</select></div>${motherSelected ? motherScopeField : `<div class="field"><label>${escapeHtml(reportText(this._hass, "period"))}</label><select id="range"><option value="24h" ${this._range === "24h" ? "selected" : ""}>${escapeHtml(reportText(this._hass, "hours24"))}</option><option value="3d" ${this._range === "3d" ? "selected" : ""}>${escapeHtml(reportText(this._hass, "days3"))}</option><option value="7d" ${this._range === "7d" ? "selected" : ""}>${escapeHtml(reportText(this._hass, "days7"))}</option><option value="14d" ${this._range === "14d" ? "selected" : ""}>${escapeHtml(reportText(this._hass, "days14"))}</option><option value="30d" ${this._range === "30d" ? "selected" : ""}>${escapeHtml(reportText(this._hass, "days30"))}</option><option value="all" ${this._range === "all" ? "selected" : ""}>${escapeHtml(reportText(this._hass, "all"))}</option></select></div>`}</div>
      ${motherSelected ? "" : `<details class="report-section" id="pdf-report" ${this._pdfOpen ? "open" : ""}><summary>${escapeHtml(reportText(this._hass, "pdfHeading"))}</summary>${pdfSettings}<div class="pdf-sections"><strong>${escapeHtml(reportText(this._hass, "pdfSections"))}</strong>${sectionControls}<button class="small-button" id="save-profile" type="button">${escapeHtml(reportText(this._hass, "saveProfile"))}</button></div>${dossierControls}
      <div class="preview"><div class="preview-summary"><strong>${escapeHtml(reportText(this._hass, "preview"))}</strong><span>${escapeHtml(selectedScope)} · ${escapeHtml(reportText(this._hass, periodLabel))} · ${escapeHtml(languageLabel)}</span><span>${escapeHtml(reportText(this._hass, "selectedSections"))}: ${escapeHtml(selectedSectionNames)}</span></div><div class="preview-counts"><div class="box"><span>${escapeHtml(reportText(this._hass, "puppies"))}</span><b>${selected.length}</b></div><div class="box"><span>${escapeHtml(reportText(this._hass, measurementLabel))}</span><b>${measurementCount}</b></div><div class="box"><span>${escapeHtml(reportText(this._hass, "careCount"))}</span><b>${careCount}</b></div><div class="box"><span>${escapeHtml(reportText(this._hass, "behaviorCount"))}</span><b>${behaviorCount}</b></div><div class="box"><span>${escapeHtml(reportText(this._hass, "dossierCount"))}</span><b>${dossierCount}</b></div><div class="box"><span>${escapeHtml(reportText(this._hass, "attention"))}</span><b>${warnings}</b></div></div></div><div class="actions"><button id="pdf">${escapeHtml(reportText(this._hass, "pdf"))}</button></div></details>`}
      <details class="report-section" id="data-export" ${this._dataExportOpen ? "open" : ""}><summary>${escapeHtml(reportText(this._hass, "dataHeading"))}</summary>${motherSelected ? "" : `<p class="section-help">${escapeHtml(reportText(this._hass, "csvDescription"))}</p>`}<p class="section-help">${escapeHtml(reportText(this._hass, motherSelected ? "motherNote" : "backupDescription"))}</p><div class="actions">${motherSelected ? "" : `<button class="secondary" id="csv">${escapeHtml(reportText(this._hass, "csv"))}</button>`}<button class="secondary" id="json">${escapeHtml(reportText(this._hass, motherSelected ? "motherJson" : "json"))}</button></div></details>
      <div class="status" role="status">${escapeHtml(this._status)}</div>
      </ha-card>`;

    // Keep the independent document editor mounted during report refreshes.
    // Moving even the same element through innerHTML would drop mobile focus.
    const markup = document.createElement("template");
    markup.innerHTML = reportMarkup;
    let reportControls = this.shadowRoot.querySelector("#report-controls");
    if (reportControls) {
      reportControls.replaceChildren(...markup.content.querySelector("ha-card").childNodes);
    } else {
      this.shadowRoot.replaceChildren(markup.content);
      const card = this.shadowRoot.querySelector("ha-card");
      reportControls = document.createElement("div");
      reportControls.id = "report-controls";
      reportControls.append(...card.childNodes);
      card.append(reportControls);
    }

    this.shadowRoot.querySelector("ha-card")?.setAttribute("aria-busy", String(this._loading || this._exporting));
    this.shadowRoot.querySelectorAll("#puppy,#pdf,#csv,#json").forEach((control) => { control.disabled = this._loading || !this._data; });
    if (this._exporting) this.shadowRoot.querySelectorAll("input,select,button").forEach((control) => { control.disabled = true; });
    // Guard handlers as well as visible controls, including events from old DOM nodes.
    const listen = (selector, type, handler) => this.shadowRoot.querySelectorAll(selector).forEach((control) => control.addEventListener(type, (event) => {
      if (this._exporting) return;
      handler(event);
    }));
    listen("#litter", "change", (e) => this._changeLitter(e.target.value));
    listen("#puppy", "change", (e) => { this._selectedPuppyId = e.target.value; this._persistState(); this._render(); });
    listen("#mother-export-scope", "change", (e) => { this._motherExportScope = e.target.value; this._persistState(); });
    listen("#range", "change", (e) => { this._range = e.target.value; this._persistState(); this._render(); });
    listen("#profile", "change", (e) => this._applyProfile(e.target.value));
    listen("#pdf-language", "change", (e) => { this._pdfLanguage = e.target.value; this._persistState(); this._render(); });
    listen("[data-pdf-section]", "change", () => { this._sectionState = normalizeSections(Object.fromEntries([...this.shadowRoot.querySelectorAll("[data-pdf-section]")].map((item) => [item.dataset.pdfSection, item.checked]))); this._reportProfile = "custom"; this._persistState(); this._render(); });
    this.shadowRoot.querySelector(".dossier-filters")?.addEventListener("toggle", (event) => { this._filtersOpen = event.target.open; });
    listen("[data-dossier-scope]", "change", () => { this._dossierScopes = [...this.shadowRoot.querySelectorAll("[data-dossier-scope]:checked")].map((item) => item.dataset.dossierScope); this._persistState(); this._render(); });
    listen("[data-dossier-type]", "change", () => { this._dossierTypes = [...this.shadowRoot.querySelectorAll("[data-dossier-type]:checked")].map((item) => item.dataset.dossierType); this._persistState(); this._render(); });
    listen("#all-dossier-types", "click", () => { this._dossierTypes = null; this._persistState(); this._render(); });
    listen("#no-dossier-types", "click", () => { this._dossierTypes = []; this._persistState(); this._render(); });
    listen("#save-profile", "click", () => this._saveCustomProfile());
    listen("#pdf", "click", () => this._export("pdf"));
    listen("#csv", "click", () => this._export("csv"));
    listen("#json", "click", () => this._export("json"));
    this.shadowRoot.querySelector("#pdf-report")?.addEventListener("toggle", (event) => {
      if (event.target.isConnected) this._pdfOpen = event.target.open;
    });
    this.shadowRoot.querySelector("#data-export")?.addEventListener("toggle", (event) => {
      if (event.target.isConnected) this._dataExportOpen = event.target.open;
    });
    let documents = this.shadowRoot.querySelector("#contract-documents");
    if (documents) {
      documents.querySelector("summary").textContent = languageForHass(this._hass) === "nl" ? "Documenten en contracten" : "Documents and contracts";
      return;
    }
    documents = document.createElement("details");
    documents.id = "contract-documents";
    documents.open = this._documentsOpen;
    documents.style.cssText = "margin-top:16px;border-top:1px solid var(--divider-color);padding-top:8px";
    const summary = document.createElement("summary");
    summary.textContent = languageForHass(this._hass) === "nl" ? "Documenten en contracten" : "Documents and contracts";
    summary.style.cssText = "padding:12px 0;cursor:pointer;font-weight:600";
    documents.append(summary);
    const mount = () => {
      if (!this._documentPanel) {
        this._documentPanel = document.createElement("puppy-tracker-documents");
        this._documentPanel.loadLogo = async (hass) => {
          const configured = await fetchReportLogo(hass);
          return await reportLogo(configured.logo_url) || await reportLogo(configured.fallback_url);
        };
      }
      this._documentPanel.hass = this._hass;
      if (this._documentPanel.parentElement !== documents) documents.append(this._documentPanel);
    };
    documents.addEventListener("toggle", () => {
      if (!documents.isConnected) return;
      this._documentsOpen = documents.open;
      if (documents.open) mount();
    });
    this.shadowRoot.querySelector("ha-card").append(documents);
    if (this._documentPanel || this._documentsOpen) mount();
  }
}

if (!customElements.get("puppy-tracker-report-card")) {
  customElements.define("puppy-tracker-report-card", PuppyTrackerReportCard);
}
window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === "puppy-tracker-report-card")) {
  window.customCards.push({ type: "puppy-tracker-report-card", name: "Puppy Tracker Report", description: "Create PDF reports and data exports." });
}
