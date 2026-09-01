import {
  escapeHtml,
  fetchLitterData,
  fetchLitters,
  languageForHass,
  selectDefaultLitter,
  subscribeUpdates,
} from "./puppy-tracker-card-common.js";

const TEXT = {
  nl: {
    title: "Vandaag",
    litter: "Nest",
    puppies: "Pups",
    weighed: "Gewogen",
    remaining: "Nog te wegen",
    attention: "Aandacht",
    allDone: "Alle pups zijn vandaag gewogen",
    allGood: "Alles ziet er goed uit",
    needsAttention: "{count} pup(s) vragen aandacht",
    noLitter: "Geen actief nest beschikbaar",
    loading: "Vandaag laden…",
    failed: "De dagstatus kon niet worden geladen.",
    remainingNames: "Nog: {names}",
  },
  en: {
    title: "Today",
    litter: "Litter",
    puppies: "Puppies",
    weighed: "Weighed",
    remaining: "Still to weigh",
    attention: "Attention",
    allDone: "All puppies have been weighed today",
    allGood: "Everything looks good",
    needsAttention: "{count} puppy/puppies need attention",
    noLitter: "No active litter available",
    loading: "Loading today…",
    failed: "Today's status could not be loaded.",
    remainingNames: "Still: {names}",
  },
};

function text(hass, key, replacements = {}) {
  const language = languageForHass(hass);
  const template = TEXT[language]?.[key] ?? TEXT.nl[key] ?? key;
  return Object.entries(replacements).reduce(
    (value, [name, replacement]) => value.replaceAll(`{${name}}`, String(replacement ?? "")),
    template,
  );
}

function sessionInfo(data) {
  const summary = data?.litter?.summary || {};
  const session = summary.session || null;
  const puppies = (data?.puppies || []).filter((puppy) => puppy.active !== false);
  const total = Number(session?.total ?? summary.active_puppies ?? puppies.length) || 0;
  const active = session?.status === "active";
  const weighed = active ? Number(session?.weighed || 0) : 0;
  const remaining = active ? Math.max(0, total - weighed) : total;
  return { summary, session, puppies, total, active, weighed, remaining };
}

class PuppyTrackerTodayCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass = null;
    this._config = {};
    this._litters = [];
    this._selectedLitterId = null;
    this._data = null;
    this._loading = false;
    this._error = "";
    this._unsubscribe = null;
  }

  static getStubConfig() {
    return { title: "", show_litter_selector: true };
  }

  static getConfigForm() {
    return { schema: [
      { name: "title", selector: { text: {} } },
      { name: "litter_id", selector: { text: {} } },
      { name: "show_litter_selector", selector: { boolean: {} } },
    ] };
  }

  setConfig(config) {
    this._config = { title: "", show_litter_selector: true, ...config };
    this._selectedLitterId = config.litter_id || this._selectedLitterId;
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

  getCardSize() { return 4; }
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
      this._error = error?.message || text(this._hass, "failed");
    } finally {
      this._loading = false;
      this._render();
    }
  }

  async _loadData(render = true) {
    this._data = this._selectedLitterId ? await fetchLitterData(this._hass, this._selectedLitterId) : null;
    if (render) this._render();
  }

  async _subscribe() {
    if (!this._hass || this._unsubscribe || !this.isConnected) return;
    try {
      this._unsubscribe = await subscribeUpdates(this._hass, async () => {
        try { await this._loadData(); } catch (_error) { /* next update retries */ }
      });
    } catch (_error) { this._unsubscribe = null; }
  }

  async _selectLitter(id) {
    this._selectedLitterId = id;
    this._loading = true;
    this._render();
    try { await this._loadData(false); this._error = ""; }
    catch (error) { this._error = error?.message || text(this._hass, "failed"); }
    finally { this._loading = false; this._render(); }
  }

  _render() {
    if (!this.shadowRoot) return;
    const litter = this._data?.litter;
    const info = sessionInfo(this._data);
    const attention = Number(info.summary.attention_count || 0);
    const complete = info.active && info.total > 0 && info.remaining === 0;
    const selector = this._config.show_litter_selector !== false && this._litters.length > 1
      ? `<select id="litter-select" aria-label="${escapeHtml(text(this._hass, "litter"))}">${this._litters.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === this._selectedLitterId ? "selected" : ""}>${escapeHtml(item.name || text(this._hass, "litter"))}</option>`).join("")}</select>`
      : "";
    const remainingNames = info.active && Array.isArray(info.session?.remaining_puppies)
      ? info.session.remaining_puppies.map((item) => typeof item === "string" ? item : item?.name).filter(Boolean)
      : [];
    const statusText = attention
      ? text(this._hass, "needsAttention", { count: attention })
      : complete ? text(this._hass, "allDone") : text(this._hass, "allGood");

    this.shadowRoot.innerHTML = `
      <ha-card>
        <div class="head"><div><div class="title">${escapeHtml(this._config.title || text(this._hass, "title"))}</div><div class="sub">${escapeHtml(litter?.name || text(this._hass, "noLitter"))}</div></div>${selector}</div>
        ${this._error ? `<div class="message error">${escapeHtml(this._error)}</div>` : ""}
        ${this._loading && !this._data ? `<div class="state">${escapeHtml(text(this._hass, "loading"))}</div>` : `
          <div class="stats">
            <div class="stat"><strong>${info.total || "—"}</strong><span>${escapeHtml(text(this._hass, "puppies"))}</span></div>
            <div class="stat"><strong>${info.weighed}</strong><span>${escapeHtml(text(this._hass, "weighed"))}</span></div>
            <div class="stat"><strong>${info.remaining}</strong><span>${escapeHtml(text(this._hass, "remaining"))}</span></div>
            <div class="stat ${attention ? "danger" : ""}"><strong>${attention}</strong><span>${escapeHtml(text(this._hass, "attention"))}</span></div>
          </div>
          <div class="status ${attention ? "danger" : "ok"}"><ha-icon icon="${attention ? "mdi:alert-circle-outline" : "mdi:check-circle-outline"}"></ha-icon><span>${escapeHtml(statusText)}</span></div>
          ${remainingNames.length ? `<div class="remaining">${escapeHtml(text(this._hass, "remainingNames", { names: remainingNames.join(", ") }))}</div>` : ""}
        `}
      </ha-card>
      <style>
        :host{display:block}ha-card{padding:18px;overflow:hidden}.head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.title{font-size:1.3rem;font-weight:700}.sub{margin-top:3px;color:var(--secondary-text-color);font-size:.9rem}select{min-height:40px;max-width:48%;border:1px solid var(--divider-color);border-radius:10px;padding:0 10px;background:var(--card-background-color);color:var(--primary-text-color)}.stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:16px}.stat{padding:10px;border:1px solid var(--divider-color);border-radius:12px;display:grid;gap:2px}.stat strong{font-size:1.35rem}.stat span{font-size:.75rem;color:var(--secondary-text-color)}.stat.danger strong{color:var(--error-color)}.status{display:flex;align-items:center;gap:8px;margin-top:14px;padding:10px 12px;border-radius:12px;background:var(--secondary-background-color)}.status.ok ha-icon{color:var(--success-color,var(--primary-color))}.status.danger ha-icon{color:var(--error-color)}.remaining{margin:9px 2px 0;color:var(--secondary-text-color);font-size:.85rem}.message,.state{margin-top:14px}.error{color:var(--error-color)}@media(max-width:520px){.stats{grid-template-columns:repeat(2,minmax(0,1fr))}.head{align-items:flex-start}}
      </style>`;

    this.shadowRoot.getElementById("litter-select")?.addEventListener("change", (event) => this._selectLitter(event.target.value));
  }
}

if (!customElements.get("puppy-tracker-today-card")) customElements.define("puppy-tracker-today-card", PuppyTrackerTodayCard);
window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === "puppy-tracker-today-card")) {
  window.customCards.push({ type: "puppy-tracker-today-card", name: "Puppy Tracker Today", description: "Dagelijkse neststatus in één compacte kaart." });
}
