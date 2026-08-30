import {
  downloadExportFile,
  escapeHtml,
  fetchExport,
  fetchLitterData,
  fetchLitters,
  filterMeasurements,
  rangeToHours,
  selectDefaultLitter,
  subscribeUpdates,
} from "./puppy-tracker-card-common.js";

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
  }

  static getStubConfig() {
    return { title: "Rapport & export", default_range: "all" };
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
      ],
    };
  }

  setConfig(config) {
    this._config = { title: "Rapport & export", default_range: "all", ...config };
    this._selectedLitterId = config.litter_id || this._selectedLitterId;
    this._range = config.default_range || this._range;
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
      this._error = err?.message || "Rapportgegevens konden niet worden geladen.";
    } finally {
      this._loading = false;
      this._render();
    }
  }

  async _ensureSubscription() {
    if (!this._hass || this._unsubscribe || this._subscriptionPending || !this.isConnected) return;
    this._subscriptionPending = true;
    try {
      this._unsubscribe = await subscribeUpdates(this._hass, () => this._queueRefresh());
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
      this._error = err?.message || "Nieuwe Puppy Tracker-data kon niet worden geladen.";
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
      this._error = err?.message || "Nestdata kon niet worden geladen.";
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

  async _export(format) {
    if (!this._hass || !this._selectedLitterId) return;
    this._status = `${format.toUpperCase()} voorbereiden…`;
    this._render();
    try {
      const result = await fetchExport(
        this._hass,
        this._selectedLitterId,
        format,
        ["csv", "pdf"].includes(format)
          ? {
              puppy_id: this._selectedPuppyId === "all" ? null : this._selectedPuppyId,
              range_hours: rangeToHours(this._range),
            }
          : {}
      );
      downloadExportFile(result);
      this._status = format === "json" ? "Volledige JSON-backup gedownload." : format === "pdf" ? "PDF-rapport gedownload." : "CSV gedownload.";
    } catch (err) {
      this._status = err?.message || "Export mislukt.";
    }
    this._render();
  }

  _render() {
    const litter = this._data?.litter;
    const puppies = (this._data?.puppies || []).filter((p) => p.active !== false);
    const selected = this._selectedPuppies();
    const warnings = selected.filter((p) => p.summary?.needs_attention).length;
    const measurementCount = selected.reduce((sum, p) => sum + this._measurementRows(p).length, 0);
    const litterOptions = this._litters.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === this._selectedLitterId ? "selected" : ""}>${escapeHtml(item.name || "Nest")}</option>`).join("");
    const puppyOptions = `<option value="all" ${this._selectedPuppyId === "all" ? "selected" : ""}>Compleet nest</option>${puppies.map((p) => `<option value="${escapeHtml(p.id)}" ${p.id === this._selectedPuppyId ? "selected" : ""}>${escapeHtml(p.name || "Puppy")}${p.collar_color ? ` – ${escapeHtml(p.collar_color)}` : ""}</option>`).join("")}`;

    this.shadowRoot.innerHTML = `
      <ha-card><style>
        ha-card{padding:16px;container-type:inline-size;container-name:report-card}.title{font-size:18px;font-weight:600;margin-bottom:3px}.sub{font-size:12px;color:var(--secondary-text-color);margin-bottom:12px}.controls{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.field{min-width:0}.field label{display:block;font-size:11px;color:var(--secondary-text-color);margin:0 0 4px 2px}.field select{width:100%;min-width:0;min-height:42px;border:1px solid var(--divider-color);border-radius:10px;background:var(--card-background-color);color:var(--primary-text-color);padding:0 9px;font-size:14px}.preview{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:12px}.box{min-width:0;border:1px solid var(--divider-color);border-radius:12px;padding:10px}.box span{display:block;font-size:11px;color:var(--secondary-text-color)}.box b{display:block;margin-top:3px;font-size:16px}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.actions button{min-height:42px;border:0;border-radius:10px;padding:0 13px;font-weight:600;cursor:pointer;background:var(--primary-color);color:var(--text-primary-color,#fff)}.actions button.secondary{background:var(--secondary-background-color);color:var(--primary-text-color);border:1px solid var(--divider-color)}.status{font-size:12px;color:var(--secondary-text-color);margin-top:9px}.error{color:var(--error-color)}.note{font-size:11px;color:var(--secondary-text-color);margin-top:10px;line-height:1.4}
        @container report-card (max-width:600px){.controls{grid-template-columns:1fr}.preview{grid-template-columns:repeat(3,minmax(0,1fr))}.actions button{flex:1 1 auto}}
        @container report-card (max-width:380px){ha-card{padding:13px}.preview{grid-template-columns:1fr}.actions{display:grid;grid-template-columns:1fr}.actions button{width:100%}}
      </style>
      <div class="title">${escapeHtml(this._config.title)}</div><div class="sub">Printvriendelijk pup- of nestrapport met bestaande CSV/JSON-export.</div>
      ${this._error ? `<div class="error">${escapeHtml(this._error)}</div>` : `
      <div class="controls"><div class="field"><label>Nest</label><select id="litter">${litterOptions}</select></div><div class="field"><label>Rapport</label><select id="puppy">${puppyOptions}</select></div><div class="field"><label>Periode</label><select id="range"><option value="24h" ${this._range === "24h" ? "selected" : ""}>24 uur</option><option value="3d" ${this._range === "3d" ? "selected" : ""}>3 dagen</option><option value="7d" ${this._range === "7d" ? "selected" : ""}>7 dagen</option><option value="14d" ${this._range === "14d" ? "selected" : ""}>14 dagen</option><option value="30d" ${this._range === "30d" ? "selected" : ""}>30 dagen</option><option value="all" ${this._range === "all" ? "selected" : ""}>Alles</option></select></div></div>
      <div class="preview"><div class="box"><span>Pups</span><b>${selected.length}</b></div><div class="box"><span>Metingen</span><b>${measurementCount}</b></div><div class="box"><span>Actuele aandacht</span><b>${warnings}</b></div></div>
      <div class="actions"><button id="pdf">PDF downloaden</button><button class="secondary" id="csv">CSV</button><button class="secondary" id="json">JSON-backup</button></div>
      <div class="status">${escapeHtml(this._status)}</div><div class="note">PDF en CSV volgen de gekozen pup en periode. JSON blijft bewust een volledige nestbackup inclusief correctie- en verwijderhistorie.</div>`}
      </ha-card>`;

    this.shadowRoot.getElementById("litter")?.addEventListener("change", async (e) => { this._selectedLitterId = e.target.value; this._selectedPuppyId = "all"; await this._loadData(); });
    this.shadowRoot.getElementById("puppy")?.addEventListener("change", (e) => { this._selectedPuppyId = e.target.value; this._render(); });
    this.shadowRoot.getElementById("range")?.addEventListener("change", (e) => { this._range = e.target.value; this._render(); });
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
