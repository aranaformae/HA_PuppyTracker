import {
  escapeHtml,
  fetchLitterData,
  fetchLitters,
  fireNavigate,
  formatShortDateTime,
  formatWeight,
  selectDefaultLitter,
  subscribeUpdates,
} from "./puppy-tracker-card-common.js";

class PuppyTrackerSummaryCard extends HTMLElement {
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
    this._subscriptionPending = false;
    this._refreshing = false;
    this._refreshAgain = false;
  }

  static getStubConfig() {
    return { title: "Puppy Tracker", show_litter_selector: true, navigate_path: "" };
  }

  static getConfigForm() {
    return {
      schema: [
        { name: "title", selector: { text: {} } },
        { name: "show_litter_selector", selector: { boolean: {} } },
        { name: "navigate_path", selector: { text: {} } },
      ],
    };
  }

  setConfig(config) {
    this._config = {
      title: "Puppy Tracker",
      show_litter_selector: true,
      navigate_path: "",
      ...config,
    };
    this._selectedLitterId = config.litter_id || this._selectedLitterId;
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._litters.length && !this._loading) {
      this._loadInitial();
    } else if (this.isConnected) {
      this._subscribe();
    }
  }

  connectedCallback() {
    if (!this._hass) return;
    if (!this._litters.length && !this._loading) {
      this._loadInitial();
    } else {
      this._subscribe();
    }
  }

  disconnectedCallback() {
    if (this._unsubscribe) Promise.resolve(this._unsubscribe()).catch(() => undefined);
    this._unsubscribe = null;
  }

  getCardSize() { return 2; }
  getGridOptions() { return { columns: 12, min_columns: 6 }; }

  async _loadInitial() {
    if (!this._hass || this._loading) return;
    this._loading = true;
    this._error = "";
    try {
      const response = await fetchLitters(this._hass);
      this._litters = response?.litters || [];
      this._selectedLitterId = selectDefaultLitter(
        this._litters,
        this._selectedLitterId || this._config.litter_id
      );
      await this._loadData();
      await this._subscribe();
    } catch (err) {
      this._error = err?.message || "Puppy Tracker-data kon niet worden geladen.";
    } finally {
      this._loading = false;
      this._render();
    }
  }

  async _subscribe() {
    if (!this._hass || this._unsubscribe || this._subscriptionPending || !this.isConnected) return;
    this._subscriptionPending = true;
    try {
      this._unsubscribe = await subscribeUpdates(this._hass, () => this._queueRefresh(), this);
    } catch (_err) {
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
    if (!this._hass || !this._selectedLitterId) {
      this._data = null;
      if (render) this._render();
      return;
    }
    try {
      this._data = await fetchLitterData(this._hass, this._selectedLitterId);
      this._error = "";
    } catch (err) {
      this._error = err?.message || "Nestdata kon niet worden geladen.";
    }
    if (render) this._render();
  }

  _render() {
    if (!this.shadowRoot) return;
    const litter = this._data?.litter;
    const summary = litter?.summary || {};
    const navigate = Boolean(this._config.navigate_path);
    const selector = this._config.show_litter_selector !== false && this._litters.length > 1
      ? `<select id="litter-select" aria-label="Nest kiezen">${this._litters.map((item) =>
          `<option value="${escapeHtml(item.id)}" ${item.id === this._selectedLitterId ? "selected" : ""}>${escapeHtml(item.name || "Nest")}</option>`
        ).join("")}</select>`
      : "";

    const session = summary.session;
    const sessionText = session?.status === "active"
      ? `${session.weighed}/${session.total} gewogen`
      : summary.last_completed_session?.completed_at
        ? `Laatste sessie ${formatShortDateTime(summary.last_completed_session.completed_at)}`
        : "Nog geen volledige sessie";

    this.shadowRoot.innerHTML = `
      <ha-card class="${navigate ? "navigable" : ""}">
        <style>
          ha-card{padding:16px;overflow:hidden;container-type:inline-size;container-name:summary-card}.navigable{cursor:pointer}
          .top{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}
          .title{font-size:18px;font-weight:600;min-width:0}.sub{font-size:12px;color:var(--secondary-text-color);margin-top:2px}
          select{max-width:45%;min-height:38px;border:1px solid var(--divider-color);border-radius:10px;background:var(--card-background-color);color:var(--primary-text-color);padding:0 10px;font-size:14px}
          .stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.stat{min-width:0;padding:8px 10px;border:1px solid var(--divider-color);border-radius:12px}
          .value{font-size:18px;font-weight:700;white-space:nowrap}.label{font-size:11px;color:var(--secondary-text-color);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
          .danger .value{color:var(--error-color)}.footer{margin-top:10px;font-size:12px;color:var(--secondary-text-color);display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}
          .error{color:var(--error-color);font-size:13px}
          @container summary-card (max-width:520px){.stats{grid-template-columns:repeat(2,minmax(0,1fr))}.top{align-items:flex-start}.title{font-size:17px}select{max-width:52%}}
        </style>
        <div class="top">
          <div class="title">${escapeHtml(this._config.title || "Puppy Tracker")}<div class="sub">${escapeHtml(litter?.name || (this._loading ? "Laden…" : "Geen nest"))}</div></div>
          ${selector}
        </div>
        ${this._error ? `<div class="error">${escapeHtml(this._error)}</div>` : `
          <div class="stats">
            <div class="stat"><div class="value">${summary.active_puppies ?? "—"}</div><div class="label">Pups</div></div>
            <div class="stat ${summary.attention_count ? "danger" : ""}"><div class="value">${summary.attention_count ?? "—"}</div><div class="label">Aandacht</div></div>
            <div class="stat"><div class="value">${summary.weigh_due_count ?? "—"}</div><div class="label">Te wegen</div></div>
            <div class="stat"><div class="value">${formatWeight(summary.average_weight)}</div><div class="label">Gemiddeld</div></div>
          </div>
          <div class="footer"><span>${escapeHtml(sessionText)}</span>${navigate ? "<span>Open dashboard ›</span>" : ""}</div>
        `}
      </ha-card>`;

    this.shadowRoot.getElementById("litter-select")?.addEventListener("change", async (event) => {
      event.stopPropagation();
      this._selectedLitterId = event.target.value;
      await this._loadData();
    });
    if (navigate) {
      this.shadowRoot.querySelector("ha-card")?.addEventListener("click", (event) => {
        if (event.target?.closest?.("select")) return;
        fireNavigate(this, this._config.navigate_path);
      });
    }
  }
}

if (!customElements.get("puppy-tracker-summary-card")) {
  customElements.define("puppy-tracker-summary-card", PuppyTrackerSummaryCard);
}
window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === "puppy-tracker-summary-card")) {
  window.customCards.push({
    type: "puppy-tracker-summary-card",
    name: "Puppy Tracker Summary",
    description: "Compact nestoverzicht voor Puppy Tracker.",
  });
}
