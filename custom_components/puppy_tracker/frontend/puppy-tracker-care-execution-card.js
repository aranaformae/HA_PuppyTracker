import { escapeHtml, fetchLitters, languageForHass, selectDefaultLitter } from "./puppy-tracker-card-common.js";

const TAG = "puppy-tracker-care-execution-card";
function t(card, nl, en) { return languageForHass(card?._hass) === "en" ? en : nl; }

class PuppyTrackerCareExecutionCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass = null;
    this._config = {};
    this._litters = [];
    this._selectedLitterId = null;
    this._occurrences = [];
    this._loading = false;
    this._error = "";
  }

  static getStubConfig() { return { title: "", show_litter_selector: true, max_items: 50, days_ahead: 14 }; }
  static getConfigForm() { return { schema: [
    { name: "title", selector: { text: {} } },
    { name: "show_litter_selector", selector: { boolean: {} } },
    { name: "max_items", selector: { number: { min: 5, max: 200, step: 5, mode: "box" } } },
    { name: "days_ahead", selector: { number: { min: 0, max: 365, step: 1, mode: "box" } } },
  ] }; }

  setConfig(config) {
    this._config = { title: "", show_litter_selector: true, max_items: 50, days_ahead: 14, ...config };
    this._selectedLitterId = config.litter_id || this._selectedLitterId;
    this._render();
  }

  set hass(hass) { this._hass = hass; if (!this._litters.length) this._load(); }
  connectedCallback() { if (this._hass && !this._litters.length) this._load(); }
  getCardSize() { return 6; }
  getGridOptions() { return { columns: 12, min_columns: 6 }; }

  async _load() {
    if (!this._hass || this._loading) return;
    this._loading = true;
    try {
      const response = await fetchLitters(this._hass);
      this._litters = response?.litters || [];
      this._selectedLitterId = selectDefaultLitter(this._litters, this._selectedLitterId || this._config.litter_id);
      await this._loadOccurrences();
    } catch (error) { this._error = error?.message || t(this, "Zorgacties konden niet worden geladen.", "Care actions could not be loaded."); }
    this._loading = false;
    this._render();
  }

  async _loadOccurrences() {
    if (!this._selectedLitterId) return;
    const response = await this._hass.callWS({ type: "puppy_tracker/care_occurrences", litter_id: this._selectedLitterId });
    const maxDays = Number(this._config.days_ahead);
    this._occurrences = (response?.occurrences || [])
      .filter((item) => !["completed", "missed"].includes(item?.status))
      .filter((item) => item?.status !== "upcoming" || maxDays < 0 || Number(item.days_until_due) <= maxDays)
      .slice(0, Number(this._config.max_items) || 50);
  }

  async _selectLitter(id) {
    this._selectedLitterId = id;
    this._loading = true;
    this._render();
    try { await this._loadOccurrences(); this._error = ""; }
    catch (error) { this._error = error?.message || t(this, "Zorgacties konden niet worden geladen.", "Care actions could not be loaded."); }
    this._loading = false;
    this._render();
  }

  async _record(item, status) {
    try {
      await this._hass.callWS({ type: "puppy_tracker/care_occurrence/record", program_id: item.program_id, puppy_id: item.puppy_id, occurrence_id: item.id, status });
      await this._loadOccurrences();
      this._render();
    } catch (error) { this._error = error?.message || t(this, "Zorgactie kon niet worden opgeslagen.", "Care action could not be saved."); this._render(); }
  }

  _render() {
    const title = this._config.title || t(this, "Zorgprogramma uitvoeren", "Execute care program");
    const selector = this._config.show_litter_selector !== false && this._litters.length > 1
      ? `<select id="litter-select" aria-label="${escapeHtml(t(this, "Nest", "Litter"))}">${this._litters.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === this._selectedLitterId ? "selected" : ""}>${escapeHtml(item.name || "Litter")}</option>`).join("")}</select>` : "";
    const rows = this._occurrences.map((item) => `<div class="row ${item.status === "overdue" ? "danger" : item.status === "due_today" ? "warning" : ""}"><div class="main"><strong>${escapeHtml(item.title || t(this, "Zorgactie", "Care action"))}</strong><span>${escapeHtml(item.puppy_name || t(this, "Pup", "Puppy"))} · ${escapeHtml(item.scheduled_date || "")} · ${escapeHtml(item.status === "overdue" ? t(this, "Te laat", "Overdue") : item.status === "due_today" ? t(this, "Vandaag", "Today") : t(this, `Over ${item.days_until_due} dagen`, `In ${item.days_until_due} days`))}</span>${item.instructions ? `<small>${escapeHtml(item.instructions)}</small>` : ""}</div><div class="actions"><button data-action="completed" data-id="${escapeHtml(item.id || "")}">${escapeHtml(t(this, "Uitgevoerd", "Completed"))}</button><button class="secondary" data-action="missed" data-id="${escapeHtml(item.id || "")}">${escapeHtml(t(this, "Gemist", "Missed"))}</button></div></div>`).join("");
    this.shadowRoot.innerHTML = `<ha-card><div class="head"><div><div class="title">${escapeHtml(title)}</div><div class="sub">${escapeHtml(t(this, "Los van Aandacht en Vandaag", "Independent of Attention and Today"))}</div></div>${selector}</div>${this._error ? `<div class="error">${escapeHtml(this._error)}</div>` : ""}${this._loading ? `<div class="state">${escapeHtml(t(this, "Laden…", "Loading…"))}</div>` : rows || `<div class="empty">${escapeHtml(t(this, "Geen openstaande zorgacties.", "No open care actions."))}</div>`}</ha-card><style>:host{display:block}ha-card{padding:18px}.head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.title{font-size:1.25rem;font-weight:700}.sub,span,small{color:var(--secondary-text-color)}select{min-height:38px;max-width:48%;background:var(--card-background-color);color:var(--primary-text-color)}.row{display:flex;justify-content:space-between;gap:12px;margin-top:10px;padding:12px;border:1px solid var(--divider-color);border-radius:10px}.main{min-width:0;display:grid;gap:4px}.main strong{font-size:1rem}.main span{font-size:.85rem}.main small{white-space:pre-wrap;overflow-wrap:anywhere}.danger{border-color:var(--error-color)}.warning{border-color:var(--warning-color,var(--primary-color))}.actions{display:flex;gap:6px;align-items:center}.actions button{border:0;border-radius:8px;padding:8px 10px;background:var(--primary-color);color:var(--text-primary-color,#fff);cursor:pointer}.actions .secondary{background:var(--secondary-background-color);color:var(--primary-text-color)}.empty,.state,.error{margin-top:14px}.error{color:var(--error-color)}@media(max-width:600px){.row{display:grid}.actions{justify-content:flex-start;flex-wrap:wrap}}</style>`;
    this.shadowRoot.querySelector("#litter-select")?.addEventListener("change", (event) => this._selectLitter(event.target.value));
    this.shadowRoot.querySelectorAll("button[data-action]").forEach((button) => button.addEventListener("click", () => {
      const item = this._occurrences.find((candidate) => candidate.id === button.dataset.id);
      if (item) this._record(item, button.dataset.action);
    }));
  }
}

if (!customElements.get(TAG)) customElements.define(TAG, PuppyTrackerCareExecutionCard);
window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === TAG)) window.customCards.push({ type: TAG, name: "Puppy Tracker Care Execution", description: "Open care actions with direct completion controls." });
