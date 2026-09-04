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

const REPORT_TEXT = {
  nl: {
    subtitle: "Printvriendelijk pup- of nestrapport met bestaande CSV/JSON-export.", litter: "Nest", selection: "Selectie", period: "Periode", all: "Alles", hours24: "24 uur", days3: "3 dagen", days7: "7 dagen", days14: "14 dagen", days30: "30 dagen", puppies: "Pups", measurements: "Metingen", attention: "Actuele aandacht", pdf: "PDF downloaden", csv: "CSV", json: "JSON-nestback-up", note: "PDF en CSV volgen de gekozen pup en periode. JSON is een importeerbare nestback-up inclusief correctie- en verwijderhistorie.", loadFailed: "Rapportgegevens konden niet worden geladen.", refreshFailed: "Nieuwe Puppy Tracker-data kon niet worden geladen.", dataFailed: "Nestdata kon niet worden geladen.", exportFailed: "Export mislukt.", pdfDone: "PDF-rapport gedownload.", csvDone: "CSV gedownload.", jsonDone: "JSON-nestback-up gedownload.", puppy: "Puppy", litterName: "Nest", pdfSections: "Onderdelen in PDF", summarySection: "Samenvatting", chartSection: "Grafiek", measurementSection: "Metingen", careSection: "Zorgresultaten", attentionSection: "Aandachtspunten", ownersSection: "Baasjes en plaatsing", ownerContactSection: "Contactgegevens", profile: "PDF-profiel", customProfile: "Aangepast", saveProfile: "Profiel opslaan",
  },
  en: {
    subtitle: "Print-friendly puppy or litter report with existing CSV/JSON export.", litter: "Litter", selection: "Selection", period: "Period", all: "All", hours24: "24 hours", days3: "3 days", days7: "7 days", days14: "14 days", days30: "30 days", puppies: "Puppies", measurements: "Measurements", attention: "Current attention", pdf: "Download PDF", csv: "CSV", json: "Litter JSON backup", note: "PDF and CSV follow the selected puppy and period. JSON is an importable litter backup including correction and deletion history.", loadFailed: "Report data could not be loaded.", refreshFailed: "New Puppy Tracker data could not be loaded.", dataFailed: "Litter data could not be loaded.", exportFailed: "Export failed.", pdfDone: "PDF report downloaded.", csvDone: "CSV downloaded.", jsonDone: "Litter JSON backup downloaded.", puppy: "Puppy", litterName: "Litter", pdfSections: "PDF sections", summarySection: "Summary", chartSection: "Chart", measurementSection: "Measurements", careSection: "Care results", attentionSection: "Attention items", ownersSection: "Owners and placement", ownerContactSection: "Contact details", profile: "PDF profile", customProfile: "Custom", saveProfile: "Save profile",
  },
};

function reportText(hass, key) {
  return (REPORT_TEXT[languageForHass(hass)] || REPORT_TEXT.nl)[key] || key;
}

const REPORT_PROFILES = {
  full: { nl: "Volledig dossier", en: "Full dossier", sections: { summary: true, chart: true, measurements: true, care: true, attention: true, owners: true, owner_contact: true } },
  handover: { nl: "Overdracht aan baasje", en: "Owner handover", sections: { summary: true, chart: true, measurements: true, care: true, attention: false, owners: true, owner_contact: true } },
  internal: { nl: "Intern fokdossier", en: "Internal breeding record", sections: { summary: true, chart: true, measurements: true, care: true, attention: true, owners: true, owner_contact: false } },
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
    this._selectedPuppyId = this._state.puppyId || "all";
    this._reportProfile = this._state.reportProfile || "full";
    this._sectionState = this._state.sectionState || { ...REPORT_PROFILES.full.sections };
  }

  static getStubConfig() {
    return { title: "Rapport & export", default_range: "all", default_profile: "full" };
  }

  static getConfigForm() {
    return {
      schema: [
        { name: "title", selector: { text: {} } },
        {
          name: "default_range",
          selector: { select: { mode: "dropdown", options: [
            { value: "24h", label: "24 uur" },
            { value: "3d", label: "3 dagen" },
            { value: "7d", label: "7 dagen" },
            { value: "14d", label: "14 dagen" },
            { value: "30d", label: "30 dagen" },
            { value: "all", label: "Alles" },
          ] } },
        },
        {
          name: "default_profile",
          selector: { select: { mode: "dropdown", options: [
            { value: "full", label: "Volledig dossier" },
            { value: "handover", label: "Overdracht aan baasje" },
            { value: "internal", label: "Intern fokdossier" },
          ] } },
        },
      ],
    };
  }

  setConfig(config) {
    this._config = { title: "Rapport & export", default_range: "all", default_profile: "full", ...config };
    this._selectedLitterId = config.litter_id || this._selectedLitterId;
    this._range = Object.hasOwn(config, "default_range") ? (config.default_range || "all") : (this._state.range || this._range);
    if (!this._state.reportProfile && REPORT_PROFILES[this._config.default_profile]) {
      this._reportProfile = this._config.default_profile;
      this._sectionState = { ...REPORT_PROFILES[this._reportProfile].sections };
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
      if (this._selectedPuppyId !== "all" && !(this._data.puppies || []).some((p) => p.id === this._selectedPuppyId)) {
        this._selectedPuppyId = "all";
      }
      this._error = "";
    } catch (err) {
      this._error = err?.message || reportText(this._hass, "dataFailed");
    }
    if (render) this._render();
  }

  _selectedPuppies() {
    const puppies = (this._data?.puppies || []).filter((p) => p.active !== false);
    if (this._selectedPuppyId === "all") return puppies;
    return puppies.filter((p) => p.id === this._selectedPuppyId);
  }

  _measurementRows(puppy) {
    return filterMeasurements(puppy.measurements || [], rangeToHours(this._range));
  }

  _persistState() {
    saveCardState(this, { ...this._state, range: this._range, puppyId: this._selectedPuppyId, reportProfile: this._reportProfile, sectionState: this._sectionState });
  }

  _applyProfile(profileName) {
    const profile = REPORT_PROFILES[profileName] || this._state.reportProfiles?.[profileName];
    if (!profile?.sections) return;
    this._reportProfile = profileName;
    this._sectionState = { ...profile.sections };
    this._persistState();
    this._render();
  }

  _saveCustomProfile() {
    const name = window.prompt(languageForHass(this._hass) === "en" ? "Name for this PDF profile" : "Naam voor dit PDF-profiel");
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
    this._status = `${format.toUpperCase()} voorbereiden…`;
    this._render();
    try {
      const sections = Object.fromEntries([...this.shadowRoot.querySelectorAll("[data-pdf-section]")].map((input) => [input.dataset.pdfSection, input.checked]));
      const result = await fetchExport(
        this._hass,
        this._selectedLitterId,
        format,
        ["csv", "pdf"].includes(format)
          ? {
              puppy_id: this._selectedPuppyId === "all" ? null : this._selectedPuppyId,
              range_hours: rangeToHours(this._range),
              sections,
            }
          : {}
      );
      downloadExportFile(result);
      this._status = format === "json" ? reportText(this._hass, "jsonDone") : format === "pdf" ? reportText(this._hass, "pdfDone") : reportText(this._hass, "csvDone");
    } catch (err) {
      this._status = err?.message || reportText(this._hass, "exportFailed");
    }
    this._render();
  }

  _render() {
    const litter = this._data?.litter;
    const puppies = (this._data?.puppies || []).filter((p) => p.active !== false);
    const selected = this._selectedPuppies();
    const warnings = selected.filter((p) => p.summary?.needs_attention).length;
    const measurementCount = selected.reduce((sum, p) => sum + this._measurementRows(p).length, 0);
    const litterOptions = this._litters.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === this._selectedLitterId ? "selected" : ""}>${escapeHtml(item.name || reportText(this._hass, "litterName"))}</option>`).join("");
    const puppyOptions = `<option value="all" ${this._selectedPuppyId === "all" ? "selected" : ""}>${escapeHtml(reportText(this._hass, "all"))}</option>${puppies.map((p) => `<option value="${escapeHtml(p.id)}" ${p.id === this._selectedPuppyId ? "selected" : ""}>${escapeHtml(p.name || reportText(this._hass, "puppy"))}${p.collar_color ? ` – ${escapeHtml(p.collar_color)}` : ""}</option>`).join("")}`;
    const sections = this._sectionState;
    const profiles = { ...REPORT_PROFILES, ...(this._state.reportProfiles || {}) };
    if (this._reportProfile === "custom" && !profiles.custom) profiles.custom = { nl: reportText(this._hass, "customProfile"), en: reportText(this._hass, "customProfile"), sections };
    const profileOptions = Object.entries(profiles).map(([key, profile]) => `<option value="${escapeHtml(key)}" ${key === this._reportProfile ? "selected" : ""}>${escapeHtml(profileLabel(this._hass, profile))}</option>`).join("");
    this.shadowRoot.innerHTML = `
      <ha-card><style>
        ha-card{padding:16px;container-type:inline-size;container-name:report-card}.title{font-size:18px;font-weight:600;margin-bottom:3px}.sub{font-size:12px;color:var(--secondary-text-color);margin-bottom:12px}.controls{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.field{min-width:0}.field label{display:block;font-size:11px;color:var(--secondary-text-color);margin:0 0 4px 2px}.field select{width:100%;min-width:0;min-height:42px;border:1px solid var(--divider-color);border-radius:10px;background:var(--card-background-color);color:var(--primary-text-color);padding:0 9px;font-size:14px}.pdf-sections{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}.pdf-sections label{font-size:12px;display:flex;align-items:center;gap:5px}.pdf-sections input{accent-color:var(--primary-color)}.preview{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:12px}.box{min-width:0;border:1px solid var(--divider-color);border-radius:12px;padding:10px}.box span{display:block;font-size:11px;color:var(--secondary-text-color)}.box b{display:block;margin-top:3px;font-size:16px}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.actions button{min-height:42px;border:0;border-radius:10px;padding:0 13px;font-weight:600;cursor:pointer;background:var(--primary-color);color:var(--text-primary-color,#fff)}.actions button.secondary{background:var(--secondary-background-color);color:var(--primary-text-color);border:1px solid var(--divider-color)}.status{font-size:12px;color:var(--secondary-text-color);margin-top:9px}.error{color:var(--error-color)}.note{font-size:11px;color:var(--secondary-text-color);margin-top:10px;line-height:1.4}
        @container report-card (max-width:600px){.controls{grid-template-columns:1fr}.preview{grid-template-columns:repeat(3,minmax(0,1fr))}.actions button{flex:1 1 auto}}
        @container report-card (max-width:380px){ha-card{padding:13px}.preview{grid-template-columns:1fr}.actions{display:grid;grid-template-columns:1fr}.actions button{width:100%}}
      </style>
      <div class="title">${escapeHtml(this._config.title)}</div><div class="sub">${escapeHtml(reportText(this._hass, "subtitle"))}</div>
      ${this._error ? `<div class="error">${escapeHtml(this._error)}</div>` : `
      <div class="controls"><div class="field"><label>${escapeHtml(reportText(this._hass, "litter"))}</label><select id="litter">${litterOptions}</select></div><div class="field"><label>${escapeHtml(reportText(this._hass, "selection"))}</label><select id="puppy">${puppyOptions}</select></div><div class="field"><label>${escapeHtml(reportText(this._hass, "period"))}</label><select id="range"><option value="24h" ${this._range === "24h" ? "selected" : ""}>${escapeHtml(reportText(this._hass, "hours24"))}</option><option value="3d" ${this._range === "3d" ? "selected" : ""}>${escapeHtml(reportText(this._hass, "days3"))}</option><option value="7d" ${this._range === "7d" ? "selected" : ""}>${escapeHtml(reportText(this._hass, "days7"))}</option><option value="14d" ${this._range === "14d" ? "selected" : ""}>${escapeHtml(reportText(this._hass, "days14"))}</option><option value="30d" ${this._range === "30d" ? "selected" : ""}>${escapeHtml(reportText(this._hass, "days30"))}</option><option value="all" ${this._range === "all" ? "selected" : ""}>${escapeHtml(reportText(this._hass, "all"))}</option></select></div><div class="field"><label>${escapeHtml(reportText(this._hass, "profile"))}</label><select id="profile">${profileOptions}</select></div></div>
      <div class="pdf-sections"><strong>${escapeHtml(reportText(this._hass, "pdfSections"))}</strong><label><input type="checkbox" data-pdf-section="summary" ${sections.summary ? "checked" : ""}> ${escapeHtml(reportText(this._hass, "summarySection"))}</label><label><input type="checkbox" data-pdf-section="chart" ${sections.chart ? "checked" : ""}> ${escapeHtml(reportText(this._hass, "chartSection"))}</label><label><input type="checkbox" data-pdf-section="measurements" ${sections.measurements ? "checked" : ""}> ${escapeHtml(reportText(this._hass, "measurementSection"))}</label><label><input type="checkbox" data-pdf-section="care" ${sections.care ? "checked" : ""}> ${escapeHtml(reportText(this._hass, "careSection"))}</label><label><input type="checkbox" data-pdf-section="attention" ${sections.attention ? "checked" : ""}> ${escapeHtml(reportText(this._hass, "attentionSection"))}</label><label><input type="checkbox" data-pdf-section="owners" ${sections.owners ? "checked" : ""}> ${escapeHtml(reportText(this._hass, "ownersSection"))}</label><label><input type="checkbox" data-pdf-section="owner_contact" ${sections.owner_contact ? "checked" : ""}> ${escapeHtml(reportText(this._hass, "ownerContactSection"))}</label><button class="secondary" id="save-profile" type="button">${escapeHtml(reportText(this._hass, "saveProfile"))}</button></div>
      <div class="preview"><div class="box"><span>${escapeHtml(reportText(this._hass, "puppies"))}</span><b>${selected.length}</b></div><div class="box"><span>${escapeHtml(reportText(this._hass, "measurements"))}</span><b>${measurementCount}</b></div><div class="box"><span>${escapeHtml(reportText(this._hass, "attention"))}</span><b>${warnings}</b></div></div>
      <div class="actions"><button id="pdf">${escapeHtml(reportText(this._hass, "pdf"))}</button><button class="secondary" id="csv">${escapeHtml(reportText(this._hass, "csv"))}</button><button class="secondary" id="json">${escapeHtml(reportText(this._hass, "json"))}</button></div>
      <div class="status">${escapeHtml(this._status)}</div><div class="note">${escapeHtml(reportText(this._hass, "note"))}</div>`}
      </ha-card>`;

    this.shadowRoot.getElementById("litter")?.addEventListener("change", async (e) => { this._selectedLitterId = e.target.value; this._selectedPuppyId = "all"; await this._loadData(); });
    this.shadowRoot.getElementById("puppy")?.addEventListener("change", (e) => { this._selectedPuppyId = e.target.value; this._persistState(); this._render(); });
    this.shadowRoot.getElementById("range")?.addEventListener("change", (e) => { this._range = e.target.value; this._persistState(); this._render(); });
    this.shadowRoot.getElementById("profile")?.addEventListener("change", (e) => this._applyProfile(e.target.value));
    this.shadowRoot.querySelectorAll("[data-pdf-section]").forEach((input) => input.addEventListener("change", () => { this._sectionState = Object.fromEntries([...this.shadowRoot.querySelectorAll("[data-pdf-section]")].map((item) => [item.dataset.pdfSection, item.checked])); this._reportProfile = "custom"; this._persistState(); this._render(); }));
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
  window.customCards.push({ type: "puppy-tracker-report-card", name: "Puppy Tracker Report", description: "PDF-rapporten en export voor Puppy Tracker." });
}
