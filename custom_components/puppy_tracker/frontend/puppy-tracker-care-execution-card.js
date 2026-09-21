import { escapeHtml, fetchLitters, languageForHass, requestLitterChange, selectDefaultLitter, subscribeUpdates } from "./puppy-tracker-card-common.js";
import { openCareResultEditor } from "./puppy-tracker-care-result-editor.js";
import { renderCareExecutionRows } from "./puppy-tracker-care-surfaces.js";

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
    this._status = "";
    this._selectedDate = null;
    this._unsubscribe = null;
    this._subscriptionPending = false;
    this._refreshing = false;
    this._refreshAgain = false;
    this._refreshDeferred = false;
  }

  static getStubConfig() { return { title: "", show_litter_selector: true, show_day_selector: true, max_items: 50, days_ahead: 14 }; }
  static getConfigForm() { return { schema: [
    { name: "title", selector: { text: {} } },
    { name: "show_litter_selector", selector: { boolean: {} } },
    { name: "show_day_selector", selector: { boolean: {} } },
    { name: "max_items", selector: { number: { min: 5, max: 200, step: 5, mode: "box" } } },
    { name: "days_ahead", selector: { number: { min: 0, max: 365, step: 1, mode: "box" } } },
  ] }; }

  setConfig(config) {
    this._config = { title: "", show_litter_selector: true, show_day_selector: true, max_items: 50, days_ahead: 14, ...config };
    this._selectedLitterId = config.litter_id || this._selectedLitterId;
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._litters.length) this._load();
    else {
      this._ensureSubscription();
      this._queueRefresh();
    }
  }
  connectedCallback() {
    if (!this._hass) return;
    if (!this._litters.length) this._load();
    else {
      this._ensureSubscription();
      this._queueRefresh();
    }
  }
  disconnectedCallback() {
    const unsubscribe = this._unsubscribe;
    this._unsubscribe = null;
    if (unsubscribe) Promise.resolve(unsubscribe()).catch(() => undefined);
  }
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
      await this._ensureSubscription();
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
      .filter((item) => item?.status !== "upcoming" || maxDays < 0 || Number(item.days_until_due) <= maxDays);
    this._ensureSelectedDate();
  }

  async _selectLitter(id) {
    this._selectedLitterId = id;
    this._loading = true;
    try { await this._loadOccurrences(); this._error = ""; }
    catch (error) { this._error = error?.message || t(this, "Zorgacties konden niet worden geladen.", "Care actions could not be loaded."); }
    this._loading = false;
    this._render();
  }

  async _ensureSubscription() {
    if (!this._hass || !this.isConnected || this._unsubscribe || this._subscriptionPending) return;
    this._subscriptionPending = true;
    try {
      this._unsubscribe = await subscribeUpdates(this._hass, () => this._queueRefresh(), this);
    } catch (_error) {
      this._unsubscribe = null;
    } finally {
      this._subscriptionPending = false;
    }
  }

  async _queueRefresh() {
    if (!this._hass || !this._selectedLitterId || !this.isConnected) return;
    if (this.__careResultEditorOpen) {
      this._refreshDeferred = true;
      return;
    }
    if (this._refreshing) {
      this._refreshAgain = true;
      return;
    }
    this._refreshing = true;
    try {
      do {
        this._refreshAgain = false;
        await this._loadOccurrences();
      } while (this._refreshAgain);
      this._error = "";
      this._render();
    } catch (error) {
      this._error = error?.message || t(this, "Zorgacties konden niet worden vernieuwd.", "Care actions could not be refreshed.");
      this._render();
    } finally {
      this._refreshing = false;
    }
  }

  _openResult(item, initialStatus = "completed") {
    openCareResultEditor(this, item, {
      initialStatus,
      onSaved: async () => {
        this._refreshDeferred = false;
        this._status = t(this, `${item.title || "Zorgactie"} opgeslagen voor ${item.puppy_name || "de pup"}.`, `${item.title || "Care action"} saved for ${item.puppy_name || "the puppy"}.`);
        await this._loadOccurrences();
        this._render();
      },
      onClosed: ({ saved }) => {
        if (!saved && this._refreshDeferred) {
          this._refreshDeferred = false;
          this._queueRefresh();
        }
      },
    });
  }

  _today() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }

  _dateOptions() {
    const dates = new Set(this._occurrences.map((item) => String(item?.scheduled_date || "").slice(0, 10)).filter(Boolean));
    dates.add(this._today());
    return [...dates].sort();
  }

  _ensureSelectedDate() {
    const dates = this._dateOptions();
    if (!dates.length) return;
    if (!this._selectedDate || !dates.includes(this._selectedDate)) {
      this._selectedDate = dates.includes(this._today()) ? this._today() : dates[0];
    }
  }

  _visibleOccurrences() {
    if (this._config.show_day_selector === false) {
      return this._occurrences.slice(0, Number(this._config.max_items) || 50);
    }
    const selectedDate = this._selectedDate;
    const rows = selectedDate
      ? this._occurrences.filter((item) => String(item?.scheduled_date || "").slice(0, 10) === selectedDate)
      : this._occurrences;
    return rows.slice(0, Number(this._config.max_items) || 50);
  }

  _formatDate(date) {
    const value = new Date(`${date}T12:00:00`);
    if (!Number.isFinite(value.getTime())) return date;
    return value.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
  }

  _render() {
    const title = this._config.title || t(this, "Zorgprogramma uitvoeren", "Execute care program");
    const selector = this._config.show_litter_selector !== false && this._litters.length > 1
      ? `<select id="litter-select" aria-label="${escapeHtml(t(this, "Nest", "Litter"))}">${this._litters.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === this._selectedLitterId ? "selected" : ""}>${escapeHtml(item.name || "Litter")}</option>`).join("")}</select>` : "";
    this._ensureSelectedDate();
    const dateOptions = this._dateOptions().map((date) => `<option value="${escapeHtml(date)}" ${date === this._selectedDate ? "selected" : ""}>${escapeHtml(this._formatDate(date))}</option>`).join("");
    const selectedIndex = this._dateOptions().indexOf(this._selectedDate);
    const rows = this._visibleOccurrences().map((item) => `<div class="row ${item.status === "overdue" ? "danger" : item.status === "due_today" ? "warning" : ""}"><div class="main"><strong>${escapeHtml(item.title || t(this, "Zorgactie", "Care action"))}</strong><span>${escapeHtml(item.puppy_name || t(this, "Pup", "Puppy"))} · ${escapeHtml(item.scheduled_date || "")} · ${escapeHtml(item.status === "overdue" ? t(this, "Te laat", "Overdue") : item.status === "due_today" ? t(this, "Vandaag", "Today") : t(this, `Over ${item.days_until_due} dagen`, `In ${item.days_until_due} days`))}</span>${item.instructions ? `<small>${escapeHtml(item.instructions)}</small>` : ""}</div><div class="actions"><button data-action="completed" data-id="${escapeHtml(item.id || "")}">${escapeHtml(t(this, "Uitgevoerd", "Completed"))}</button><button class="secondary" data-action="missed" data-id="${escapeHtml(item.id || "")}">${escapeHtml(t(this, "Gemist", "Missed"))}</button></div></div>`).join("");
    const daySelector = this._config.show_day_selector !== false ? `<div class="day-controls"><button id="previous-day" title="${escapeHtml(t(this, "Vorige dag", "Previous day"))}" ${selectedIndex <= 0 ? "disabled" : ""}>‹</button><select id="day-select" aria-label="${escapeHtml(t(this, "Dag", "Day"))}">${dateOptions}</select><button id="next-day" title="${escapeHtml(t(this, "Volgende dag", "Next day"))}" ${selectedIndex < 0 || selectedIndex >= this._dateOptions().length - 1 ? "disabled" : ""}>›</button></div>` : "";
    this.shadowRoot.innerHTML = `<ha-card><div class="head"><div><div class="title">${escapeHtml(title)}</div><div class="sub">${escapeHtml(t(this, "Los van Aandacht en Vandaag", "Independent of Attention and Today"))}</div></div><div class="selectors">${selector}${daySelector}</div></div>${this._error ? `<div class="error">${escapeHtml(this._error)}</div>` : ""}${this._loading ? `<div class="state">${escapeHtml(t(this, "Laden…", "Loading…"))}</div>` : `<div class="rows">${rows || `<div class="empty">${escapeHtml(t(this, "Geen openstaande zorgacties op deze dag.", "No open care actions on this day."))}</div>`}</div>`}</ha-card><style>:host{display:block}ha-card{padding:18px}.head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.title{font-size:1.25rem;font-weight:700}.sub,span,small{color:var(--secondary-text-color)}.selectors,.day-controls{display:flex;gap:6px;align-items:center}.selectors{justify-content:flex-end;flex-wrap:wrap}select{min-height:38px;max-width:48%;background:var(--card-background-color);color:var(--primary-text-color)}.day-controls select{max-width:145px}.day-controls button{min-width:38px;min-height:38px;border:1px solid var(--divider-color);border-radius:8px;background:var(--secondary-background-color);color:var(--primary-text-color);font-size:20px;cursor:pointer}.day-controls button:disabled{opacity:.4;cursor:default}.rows{max-height:60vh;overflow-y:auto;overscroll-behavior:contain;padding-right:3px}.row{display:flex;justify-content:space-between;gap:12px;margin-top:10px;padding:12px;border:1px solid var(--divider-color);border-radius:10px}.main{min-width:0;display:grid;gap:4px}.main strong{font-size:1rem}.main span{font-size:.85rem}.main small{white-space:pre-wrap;overflow-wrap:anywhere}.danger{border-color:var(--error-color)}.warning{border-color:var(--warning-color,var(--primary-color))}.actions{display:flex;gap:6px;align-items:center}.actions button{border:0;border-radius:8px;padding:8px 10px;background:var(--primary-color);color:var(--text-primary-color,#fff);cursor:pointer}.actions .secondary{background:var(--secondary-background-color);color:var(--primary-text-color)}.empty,.state,.error{margin-top:14px}.error{color:var(--error-color)}@media(max-width:600px){.head{display:grid}.selectors{justify-content:flex-start}.selectors>select{max-width:none;width:100%}.day-controls{width:100%}.day-controls select{max-width:none;flex:1}.row{display:grid}.actions{justify-content:flex-start;flex-wrap:wrap}}</style>`;
    if (this._status) {
      const status = document.createElement("div");
      status.className = "status-message";
      status.setAttribute("role", "status");
      status.textContent = this._status;
      status.style.cssText = "margin-top:12px;padding:9px 10px;border-radius:9px;background:var(--secondary-background-color);color:var(--primary-text-color)";
      this.shadowRoot.querySelector("ha-card")?.prepend(status);
    }
    this.shadowRoot.querySelector("#litter-select")?.addEventListener("change", (event) => {
      if (requestLitterChange(this, event.target.value)) this._selectLitter(event.target.value);
    });
    this.shadowRoot.querySelector("#day-select")?.addEventListener("change", (event) => { this._selectedDate = event.target.value; this._render(); });
    this.shadowRoot.querySelector("#previous-day")?.addEventListener("click", () => { const dates = this._dateOptions(); const index = dates.indexOf(this._selectedDate); if (index > 0) { this._selectedDate = dates[index - 1]; this._render(); } });
    this.shadowRoot.querySelector("#next-day")?.addEventListener("click", () => { const dates = this._dateOptions(); const index = dates.indexOf(this._selectedDate); if (index >= 0 && index < dates.length - 1) { this._selectedDate = dates[index + 1]; this._render(); } });
    this.shadowRoot.querySelectorAll("button[data-action]").forEach((button) => button.addEventListener("click", () => {
      const item = this._occurrences.find((candidate) => candidate.id === button.dataset.id);
      if (item) this._openResult(item, button.dataset.action);
    }));
    renderCareExecutionRows(this);
  }
}

if (!customElements.get(TAG)) customElements.define(TAG, PuppyTrackerCareExecutionCard);
