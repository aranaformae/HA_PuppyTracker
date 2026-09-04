import {
  addDossierRecord,
  escapeHtml,
  fetchLitterData,
  fetchLitters,
  formatDateTime,
  languageForHass,
  selectDefaultLitter,
  subscribeUpdates,
} from "./puppy-tracker-card-common.js";

const RANGE_HOURS = { "24h": 24, "3d": 72, "7d": 168, "14d": 336, all: null };

const TEXT = {
  nl: {
    title: "Temperatuur", description: "Temperatuurmetingen en notities voor nest, moederhond of pup.", litter: "Nest", wholeLitter: "Hele nest", mother: "Moederhond", puppy: "Pup", scope: "Eigenaar", choosePuppy: "Pup kiezen", period: "Periode", hours24: "24 uur", days3: "3 dagen", days7: "7 dagen", days14: "14 dagen", all: "Alles", latest: "Laatste meting", noMeasurement: "Nog geen temperatuurmetingen.", history: "Historie", chart: "Verloop", add: "Temperatuur toevoegen", value: "Temperatuur (°C)", method: "Meetmethode / locatie", methodPlaceholder: "Bijvoorbeeld rectaal", note: "Observatie / notitie", notePlaceholder: "Bijvoorbeeld rustig, slapend of na voeding", date: "Datum en tijd", save: "Opslaan", cancel: "Annuleren", saved: "Temperatuur opgeslagen.", loading: "Temperatuur laden…", failed: "Temperatuurgegevens konden niet worden geladen.", invalid: "Vul een temperatuur tussen 20,0 en 45,0 °C in.", noLitter: "Geen actief nest beschikbaar", items: "metingen", ago: "geleden", current: "Huidige eigenaar", selectOwner: "Selecteer eerst een eigenaar", showMore: "Meer tonen", showLess: "Minder tonen",
  },
  en: {
    title: "Temperature", description: "Temperature readings and notes for the litter, mother or puppy.", litter: "Litter", wholeLitter: "Whole litter", mother: "Mother", puppy: "Puppy", scope: "Owner", choosePuppy: "Choose puppy", period: "Period", hours24: "24 hours", days3: "3 days", days7: "7 days", days14: "14 days", all: "All", latest: "Latest reading", noMeasurement: "No temperature readings yet.", history: "History", chart: "Trend", add: "Add temperature", value: "Temperature (°C)", method: "Measurement method / location", methodPlaceholder: "For example rectal", note: "Observation / note", notePlaceholder: "For example calm, sleeping or after feeding", date: "Date and time", save: "Save", cancel: "Cancel", saved: "Temperature saved.", loading: "Loading temperature…", failed: "Temperature data could not be loaded.", invalid: "Enter a temperature between 20.0 and 45.0 °C.", noLitter: "No active litter available", items: "readings", ago: "ago", current: "Current owner", selectOwner: "Select an owner first", showMore: "Show more", showLess: "Show less",
  },
};

function text(card, key) {
  const language = languageForHass(card?._hass);
  return TEXT[language]?.[key] || TEXT.nl[key] || key;
}

function nowInputValue() {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function dateValue(value) {
  const date = new Date(value || "");
  return Number.isFinite(date.getTime()) ? date : null;
}

function temperatureRecords(records) {
  return (records || [])
    .filter((record) => record?.type === "temperature" && !record.deleted)
    .map((record) => ({
      ...record,
      value: Number(record.data?.temperature_c),
      method: record.data?.method || "",
      observation: record.data?.observation || record.note || "",
    }))
    .filter((record) => Number.isFinite(record.value))
    .sort((left, right) => (dateValue(right.occurred_at)?.getTime() || 0) - (dateValue(left.occurred_at)?.getTime() || 0));
}

function ownerLabel(card, scope, name = "") {
  if (scope === "mother") return `${text(card, "mother")} · ${name || text(card, "mother")}`;
  if (scope === "puppy") return `${text(card, "puppy")} · ${name || text(card, "puppy")}`;
  return text(card, "wholeLitter");
}

class PuppyTrackerTemperatureCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass = null;
    this._config = {};
    this._litters = [];
    this._litterData = null;
    this._selectedLitterId = null;
    this._scope = "litter";
    this._selectedPuppyId = null;
    this._range = "3d";
    this._records = [];
    this._showEditor = false;
    this._draft = null;
    this._loading = false;
    this._saving = false;
    this._error = "";
    this._status = "";
    this._unsubscribe = null;
  }

  static getStubConfig() {
    return { title: "", default_scope: "litter", default_range: "3d", history_limit: 10, max_height: 520 };
  }

  static getConfigForm() {
    return { schema: [
      { name: "title", selector: { text: {} } },
      { name: "litter_id", selector: { text: {} } },
      { name: "default_scope", selector: { select: { mode: "dropdown", options: [
        { value: "litter", label: "Whole litter" }, { value: "mother", label: "Mother" }, { value: "puppy", label: "Puppy" },
      ] } } },
      { name: "default_range", selector: { select: { mode: "dropdown", options: [
        { value: "24h", label: "24 hours" }, { value: "3d", label: "3 days" }, { value: "7d", label: "7 days" }, { value: "14d", label: "14 days" }, { value: "all", label: "All" },
      ] } } },
      { name: "history_limit", selector: { number: { min: 3, max: 50, step: 1, mode: "box" } } },
      { name: "max_height", selector: { number: { min: 240, max: 900, step: 20, mode: "box" } } },
    ] };
  }

  setConfig(config) {
    this._config = { ...PuppyTrackerTemperatureCard.getStubConfig(), ...config };
    this._selectedLitterId = config.litter_id || this._selectedLitterId;
    this._scope = ["litter", "mother", "puppy"].includes(config.default_scope) ? config.default_scope : "litter";
    this._range = RANGE_HOURS[config.default_range] !== undefined ? config.default_range : "3d";
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._litters.length && !this._loading) this._loadInitial();
    else if (this.isConnected && !this._unsubscribe) this._subscribe();
  }

  connectedCallback() {
    if (!this._hass) return;
    if (!this._litters.length && !this._loading) this._loadInitial();
    else this._subscribe();
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
    this._render();
    try {
      const response = await fetchLitters(this._hass);
      this._litters = response?.litters || [];
      this._selectedLitterId = selectDefaultLitter(this._litters, this._selectedLitterId || this._config.litter_id);
      await this._loadData(false);
      await this._subscribe();
      this._error = "";
    } catch (error) {
      this._error = error?.message || text(this, "failed");
    } finally {
      this._loading = false;
      this._render();
    }
  }

  async _loadData(render = true) {
    if (!this._selectedLitterId) {
      this._litterData = null;
      this._records = [];
      if (render) this._render();
      return;
    }
    this._litterData = await fetchLitterData(this._hass, this._selectedLitterId);
    const puppies = (this._litterData?.puppies || []).filter((puppy) => puppy.active !== false);
    if (!this._selectedPuppyId || !puppies.some((puppy) => puppy.id === this._selectedPuppyId)) this._selectedPuppyId = puppies[0]?.id || null;
    if (this._scope === "mother") {
      const response = await this._hass.callWS({ type: "puppy_tracker/mother/records", litter_id: this._selectedLitterId, history_scope: "current" });
      this._records = temperatureRecords(response?.records);
    } else if (this._scope === "puppy") {
      const puppy = puppies.find((item) => item.id === this._selectedPuppyId);
      this._records = temperatureRecords(puppy?.records);
    } else {
      this._records = temperatureRecords(this._litterData?.litter?.records);
    }
    if (render) this._render();
  }

  async _subscribe() {
    if (!this._hass || this._unsubscribe || !this.isConnected) return;
    try {
      this._unsubscribe = await subscribeUpdates(this._hass, async () => {
        try { await this._loadData(); } catch (_error) { /* next update retries */ }
      }, this);
    } catch (_error) { this._unsubscribe = null; }
  }

  async _selectLitter(id) {
    this._selectedLitterId = id;
    this._loading = true;
    this._render();
    try { await this._loadData(false); this._error = ""; }
    catch (error) { this._error = error?.message || text(this, "failed"); }
    finally { this._loading = false; this._render(); }
  }

  async _selectScope(value) {
    this._scope = value;
    this._loading = true;
    this._render();
    try { await this._loadData(false); this._error = ""; }
    catch (error) { this._error = error?.message || text(this, "failed"); }
    finally { this._loading = false; this._render(); }
  }

  async _selectPuppy(id) {
    this._selectedPuppyId = id;
    await this._loadData();
  }

  _filteredRecords() {
    const hours = RANGE_HOURS[this._range];
    if (!hours) return this._records;
    const cutoff = Date.now() - hours * 60 * 60 * 1000;
    return this._records.filter((record) => (dateValue(record.occurred_at)?.getTime() || 0) >= cutoff);
  }

  _openEditor() {
    this._draft = { temperature_c: "", method: "", note: "", occurred_at: nowInputValue() };
    this._showEditor = true;
    this._status = "";
    this._error = "";
    this._render();
    queueMicrotask(() => this.shadowRoot?.getElementById("temperature-value")?.focus());
  }

  _closeEditor() {
    this._showEditor = false;
    this._draft = null;
    this._render();
  }

  async _save() {
    if (!this._draft || this._saving || !this._selectedLitterId) return;
    const value = Number(String(this._draft.temperature_c || "").replace(",", "."));
    if (!Number.isFinite(value) || value < 20 || value > 45) {
      this._error = text(this, "invalid");
      this._render();
      return;
    }
    const occurredAt = new Date(this._draft.occurred_at || "");
    if (!Number.isFinite(occurredAt.getTime())) {
      this._error = this._hass?.locale?.language === "en" ? "Enter a valid date and time." : "Vul een geldige datum en tijd in.";
      this._render();
      return;
    }
    this._saving = true;
    this._error = "";
    this._render();
    try {
      const data = { temperature_c: value };
      if (String(this._draft.method || "").trim()) data.method = String(this._draft.method).trim();
      if (String(this._draft.note || "").trim()) data.observation = String(this._draft.note).trim();
      if (this._scope === "mother") {
        await this._hass.callWS({ type: "puppy_tracker/mother/record/add", litter_id: this._selectedLitterId, record_type: "temperature", occurred_at: occurredAt.toISOString(), title: text(this, "title"), note: String(this._draft.note || "").trim() || null, data });
      } else {
        await addDossierRecord(this._hass, this._selectedLitterId, this._scope === "puppy" ? this._selectedPuppyId : null, { record_type: "temperature", occurred_at: occurredAt.toISOString(), title: text(this, "title"), note: String(this._draft.note || "").trim() || null, data });
      }
      this._status = text(this, "saved");
      this._showEditor = false;
      this._draft = null;
      await this._loadData(false);
    } catch (error) {
      this._error = error?.message || text(this, "failed");
    } finally {
      this._saving = false;
      this._render();
    }
  }

  _chart(records) {
    if (records.length < 1) return `<div class="empty">${escapeHtml(text(this, "noMeasurement"))}</div>`;
    const points = [...records].sort((left, right) => (dateValue(left.occurred_at)?.getTime() || 0) - (dateValue(right.occurred_at)?.getTime() || 0));
    const min = Math.min(...points.map((item) => item.value));
    const max = Math.max(...points.map((item) => item.value));
    const span = Math.max(0.4, max - min);
    const width = 520;
    const height = 170;
    const pad = 22;
    const minTime = dateValue(points[0].occurred_at)?.getTime() || 0;
    const maxTime = dateValue(points[points.length - 1].occurred_at)?.getTime() || minTime + 1;
    const path = points.map((item, index) => {
      const time = dateValue(item.occurred_at)?.getTime() || minTime;
      const x = pad + ((time - minTime) / Math.max(1, maxTime - minTime)) * (width - pad * 2);
      const y = pad + (1 - (item.value - min) / span) * (height - pad * 2);
      return `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(" ");
    const dots = points.map((item) => {
      const time = dateValue(item.occurred_at)?.getTime() || minTime;
      const x = pad + ((time - minTime) / Math.max(1, maxTime - minTime)) * (width - pad * 2);
      const y = pad + (1 - (item.value - min) / span) * (height - pad * 2);
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" tabindex="0"><title>${escapeHtml(item.value.toLocaleString(languageForHass(this._hass) === "en" ? "en-US" : "nl-NL", { maximumFractionDigits: 1 }))} °C · ${escapeHtml(formatDateTime(item.occurred_at, "—", this._hass))}</title></circle>`;
    }).join("");
    return `<div class="chart-wrap"><div class="chart-scale"><span>${max.toLocaleString("nl-NL", { maximumFractionDigits: 1 })} °C</span><span>${min.toLocaleString("nl-NL", { maximumFractionDigits: 1 })} °C</span></div><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(text(this, "chart"))}"><line x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - pad}"/><line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}"/><path d="${path}"/><g>${dots}</g></svg></div>`;
  }

  _render() {
    if (!this.shadowRoot) return;
    const litter = this._litterData?.litter;
    const puppies = (this._litterData?.puppies || []).filter((puppy) => puppy.active !== false);
    const filtered = this._filteredRecords();
    const latest = filtered[0] || this._records[0] || null;
    const limit = Math.max(3, Math.min(50, Number(this._config.history_limit) || 10));
    const ownerName = this._scope === "puppy" ? puppies.find((puppy) => puppy.id === this._selectedPuppyId)?.name : litter?.mother;
    const litterOptions = this._litters.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === this._selectedLitterId ? "selected" : ""}>${escapeHtml(item.name || text(this, "litter"))}</option>`).join("");
    const puppyOptions = puppies.map((puppy) => `<option value="${escapeHtml(puppy.id)}" ${puppy.id === this._selectedPuppyId ? "selected" : ""}>${escapeHtml(puppy.name || text(this, "puppy"))}</option>`).join("");
    const history = filtered.slice(0, limit).map((record) => `<div class="history-row"><strong>${escapeHtml(record.value.toLocaleString(languageForHass(this._hass) === "en" ? "en-US" : "nl-NL", { maximumFractionDigits: 1 }))} °C</strong><div><span>${escapeHtml(formatDateTime(record.occurred_at, "—", this._hass))}</span>${record.method ? `<small>${escapeHtml(record.method)}</small>` : ""}${record.observation ? `<p>${escapeHtml(record.observation)}</p>` : ""}</div></div>`).join("");
    const editor = this._showEditor ? `<form class="editor"><strong>${escapeHtml(text(this, "add"))}</strong><label>${escapeHtml(text(this, "value"))}<input id="temperature-value" type="number" min="20" max="45" step="0.1" inputmode="decimal" value="${escapeHtml(this._draft?.temperature_c || "")}" required></label><label>${escapeHtml(text(this, "date"))}<input id="temperature-date" type="datetime-local" value="${escapeHtml(this._draft?.occurred_at || nowInputValue())}" required></label><label>${escapeHtml(text(this, "method"))}<input id="temperature-method" placeholder="${escapeHtml(text(this, "methodPlaceholder"))}" value="${escapeHtml(this._draft?.method || "")}"></label><label class="wide">${escapeHtml(text(this, "note"))}<textarea id="temperature-note" rows="3" placeholder="${escapeHtml(text(this, "notePlaceholder"))}">${escapeHtml(this._draft?.note || "")}</textarea></label><div class="actions"><button type="button" class="secondary" id="cancel-temperature">${escapeHtml(text(this, "cancel"))}</button><button type="submit" class="primary">${escapeHtml(text(this, "save"))}</button></div></form>` : "";
    this.shadowRoot.innerHTML = `<ha-card><div class="head"><div><div class="title">${escapeHtml(this._config.title || text(this, "title"))}</div><div class="sub">${escapeHtml(text(this, "description"))}</div></div><button id="add-temperature" class="primary">${escapeHtml(text(this, "add"))}</button></div><div class="selectors"><label>${escapeHtml(text(this, "litter"))}<select id="litter-select">${litterOptions}</select></label><label>${escapeHtml(text(this, "scope"))}<select id="scope-select"><option value="litter" ${this._scope === "litter" ? "selected" : ""}>${escapeHtml(text(this, "wholeLitter"))}</option><option value="mother" ${this._scope === "mother" ? "selected" : ""}>${escapeHtml(ownerLabel(this, "mother", litter?.mother))}</option><option value="puppy" ${this._scope === "puppy" ? "selected" : ""}>${escapeHtml(text(this, "puppy"))}</option></select></label>${this._scope === "puppy" ? `<label>${escapeHtml(text(this, "choosePuppy"))}<select id="puppy-select">${puppyOptions}</select></label>` : ""}<label>${escapeHtml(text(this, "period"))}<select id="range-select"><option value="24h" ${this._range === "24h" ? "selected" : ""}>${escapeHtml(text(this, "hours24"))}</option><option value="3d" ${this._range === "3d" ? "selected" : ""}>${escapeHtml(text(this, "days3"))}</option><option value="7d" ${this._range === "7d" ? "selected" : ""}>${escapeHtml(text(this, "days7"))}</option><option value="14d" ${this._range === "14d" ? "selected" : ""}>${escapeHtml(text(this, "days14"))}</option><option value="all" ${this._range === "all" ? "selected" : ""}>${escapeHtml(text(this, "all"))}</option></select></label></div>${this._error ? `<div class="message error">${escapeHtml(this._error)}</div>` : ""}${this._status ? `<div class="message success">${escapeHtml(this._status)}</div>` : ""}${this._loading && !this._litterData ? `<div class="state">${escapeHtml(text(this, "loading"))}</div>` : `<section class="latest"><div><span class="section-label">${escapeHtml(text(this, "latest"))}</span><strong>${latest ? `${escapeHtml(latest.value.toLocaleString(languageForHass(this._hass) === "en" ? "en-US" : "nl-NL", { maximumFractionDigits: 1 }))} °C` : "—"}</strong><small>${latest ? escapeHtml(formatDateTime(latest.occurred_at, "—", this._hass)) : escapeHtml(text(this, "noMeasurement"))}</small></div><span class="owner-label">${escapeHtml(ownerLabel(this, this._scope, ownerName))}</span></section><section><h3>${escapeHtml(text(this, "chart"))}</h3>${this._chart(filtered)}</section><section class="history"><h3>${escapeHtml(text(this, "history"))} <small>(${filtered.length} ${escapeHtml(text(this, "items"))})</small></h3>${history || `<div class="empty">${escapeHtml(text(this, "noMeasurement"))}</div>`}</section>`}${editor}</ha-card><style>:host{display:block}ha-card{padding:16px;overflow:hidden}.head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.title{font-size:1.3rem;font-weight:700}.sub{margin-top:3px;color:var(--secondary-text-color);font-size:.9rem}.selectors{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:14px}.selectors label,.editor label{display:grid;gap:4px;color:var(--secondary-text-color);font-size:12px}.selectors select,.editor input,.editor textarea{box-sizing:border-box;width:100%;min-height:40px;border:1px solid var(--divider-color);border-radius:9px;background:var(--card-background-color);color:var(--primary-text-color);padding:8px;font:inherit}.primary,.secondary{min-height:40px;border-radius:9px;border:1px solid var(--primary-color);padding:0 13px;font:inherit;cursor:pointer}.primary{background:var(--primary-color);color:var(--text-primary-color,#fff)}.secondary{background:var(--secondary-background-color);border-color:var(--divider-color);color:var(--primary-text-color)}.latest{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:16px;padding:13px;border-radius:10px;background:var(--secondary-background-color)}.latest strong{display:block;font-size:2rem;line-height:1.1}.latest small{display:block;color:var(--secondary-text-color);margin-top:5px}.section-label{display:block;color:var(--secondary-text-color);font-size:12px}.owner-label{color:var(--secondary-text-color);text-align:right}.chart-wrap{display:grid;grid-template-columns:52px minmax(0,1fr);gap:4px;align-items:stretch}.chart-scale{display:flex;flex-direction:column;justify-content:space-between;color:var(--secondary-text-color);font-size:10px;padding:18px 0 20px;text-align:right}.chart-wrap svg{width:100%;height:170px;overflow:visible}.chart-wrap line{stroke:var(--divider-color);stroke-width:1}.chart-wrap path{fill:none;stroke:var(--primary-color);stroke-width:3;stroke-linecap:round;stroke-linejoin:round}.chart-wrap circle{fill:var(--primary-color);stroke:var(--card-background-color);stroke-width:2}.history{max-height:${Math.max(240, Math.min(900, Number(this._config.max_height) || 520))}px;overflow:auto}.history h3 small{font-size:11px;color:var(--secondary-text-color);font-weight:400}.history-row{display:grid;grid-template-columns:88px minmax(0,1fr);gap:10px;padding:9px 0;border-top:1px solid var(--divider-color)}.history-row strong{font-size:1.05rem}.history-row span,.history-row small{display:block;color:var(--secondary-text-color);font-size:11px}.history-row p{margin:4px 0 0;white-space:pre-wrap;overflow-wrap:anywhere}.editor{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:16px;padding-top:14px;border-top:1px solid var(--divider-color)}.editor>strong,.editor .wide,.editor .actions{grid-column:1/-1}.actions{display:flex;justify-content:flex-end;gap:8px}.message,.state{margin-top:12px;padding:9px;border-radius:8px}.error{color:var(--error-color);background:color-mix(in srgb,var(--error-color) 8%,transparent)}.success{color:var(--success-color,var(--primary-color));background:color-mix(in srgb,var(--success-color,var(--primary-color)) 8%,transparent)}.empty{padding:12px 0;color:var(--secondary-text-color)}@media(max-width:720px){.selectors{grid-template-columns:1fr 1fr}}@media(max-width:460px){ha-card{padding:13px}.head{flex-direction:column}.head button{width:100%}.selectors{grid-template-columns:1fr}.latest{align-items:flex-start;flex-direction:column}.owner-label{text-align:left}.editor{grid-template-columns:1fr}.editor>strong,.editor .wide,.editor .actions{grid-column:auto}}</style>`;
    this.shadowRoot.getElementById("litter-select")?.addEventListener("change", (event) => this._selectLitter(event.target.value));
    this.shadowRoot.getElementById("scope-select")?.addEventListener("change", (event) => this._selectScope(event.target.value));
    this.shadowRoot.getElementById("puppy-select")?.addEventListener("change", (event) => this._selectPuppy(event.target.value));
    this.shadowRoot.getElementById("range-select")?.addEventListener("change", (event) => { this._range = event.target.value; this._render(); });
    this.shadowRoot.getElementById("add-temperature")?.addEventListener("click", () => this._openEditor());
    this.shadowRoot.getElementById("cancel-temperature")?.addEventListener("click", () => this._closeEditor());
    this.shadowRoot.querySelector(".editor")?.addEventListener("submit", (event) => {
      event.preventDefault();
      this._draft = {
        temperature_c: this.shadowRoot.getElementById("temperature-value")?.value,
        occurred_at: this.shadowRoot.getElementById("temperature-date")?.value,
        method: this.shadowRoot.getElementById("temperature-method")?.value,
        note: this.shadowRoot.getElementById("temperature-note")?.value,
      };
      this._save();
    });
  }
}

if (!customElements.get("puppy-tracker-temperature-card")) customElements.define("puppy-tracker-temperature-card", PuppyTrackerTemperatureCard);
window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === "puppy-tracker-temperature-card")) {
  window.customCards.push({ type: "puppy-tracker-temperature-card", name: "Puppy Tracker Temperature", description: "Temperatuurmetingen en notities per nest, moederhond of pup." });
}
