import {
  describeStatus,
  escapeHtml,
  fetchLitterData,
  fetchLitters,
  fireNavigate,
  selectDefaultLitter,
  statusIcon,
  statusTone,
  subscribeUpdates,
} from "./puppy-weight-card-common.js";

class PuppyWeightAttentionCard extends HTMLElement {
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
    return { title: "Aandacht", show_litter_selector: true, navigate_path: "" };
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
    this._config = { title: "Aandacht", show_litter_selector: true, navigate_path: "", ...config };
    this._selectedLitterId = config.litter_id || this._selectedLitterId;
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._litters.length && !this._loading) this._loadInitial();
  }

  disconnectedCallback() {
    if (this._unsubscribe) Promise.resolve(this._unsubscribe()).catch(() => undefined);
    this._unsubscribe = null;
  }

  getCardSize() { return 3; }
  getGridOptions() { return { columns: 12, min_columns: 6 }; }

  async _loadInitial() {
    if (!this._hass || this._loading) return;
    this._loading = true;
    try {
      const response = await fetchLitters(this._hass);
      this._litters = response?.litters || [];
      this._selectedLitterId = selectDefaultLitter(this._litters, this._selectedLitterId || this._config.litter_id);
      await this._loadData(false);
      this._unsubscribe = await subscribeUpdates(this._hass, () => this._loadData(true));
    } catch (err) {
      this._error = err?.message || "Aandachtsgegevens konden niet worden geladen.";
    } finally {
      this._loading = false;
      this._render();
    }
  }

  async _loadData(render = true) {
    if (!this._hass || !this._selectedLitterId) return;
    try {
      this._data = await fetchLitterData(this._hass, this._selectedLitterId);
      this._error = "";
    } catch (err) {
      this._error = err?.message || "Nestdata kon niet worden geladen.";
    }
    if (render) this._render();
  }

  _render() {
    const litter = this._data?.litter;
    const puppies = (this._data?.puppies || []).filter((puppy) => puppy.active !== false && puppy.summary?.needs_attention);
    const selector = this._config.show_litter_selector !== false && this._litters.length > 1
      ? `<select id="litter-select">${this._litters.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === this._selectedLitterId ? "selected" : ""}>${escapeHtml(item.name || "Nest")}</option>`).join("")}</select>`
      : "";

    const body = this._error
      ? `<div class="error">${escapeHtml(this._error)}</div>`
      : puppies.length
        ? `<div class="list">${puppies.map((puppy) => {
            const summary = puppy.summary || {};
            const tone = statusTone(summary.status_code);
            return `<div class="row ${tone}" data-puppy="${escapeHtml(puppy.id)}">
              <div class="icon">${statusIcon(summary.status_code)}</div>
              <div class="main"><div class="name">${escapeHtml(puppy.name || "Puppy")}${puppy.collar_color ? `<span class="collar">${escapeHtml(puppy.collar_color)}</span>` : ""}</div><div class="reason">${escapeHtml(describeStatus(summary))}</div></div>
              <div class="status">${escapeHtml(summary.status || "Aandacht")}</div>
            </div>`;
          }).join("")}</div>`
        : `<div class="all-ok"><span>✓</span><div><strong>Alle pups OK</strong><div>Geen actieve gewichtswaarschuwingen.</div></div></div>`;

    this.shadowRoot.innerHTML = `
      <ha-card>
        <style>
          ha-card{padding:16px}.top{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:10px}.title{font-size:18px;font-weight:600}.sub{font-size:12px;color:var(--secondary-text-color);margin-top:2px}
          select{min-height:38px;max-width:48%;border:1px solid var(--divider-color);border-radius:10px;background:var(--card-background-color);color:var(--primary-text-color);padding:0 10px;font-size:14px}
          .list{display:grid;gap:8px}.row{display:grid;grid-template-columns:34px minmax(0,1fr) auto;align-items:center;gap:10px;padding:10px 11px;border:1px solid var(--divider-color);border-radius:12px}.icon{display:grid;place-items:center;width:30px;height:30px;border-radius:50%;background:var(--secondary-background-color);font-weight:700}.name{font-weight:600}.collar{font-weight:400;color:var(--secondary-text-color);margin-left:7px}.reason{font-size:12px;color:var(--secondary-text-color);margin-top:2px}.status{font-size:12px;font-weight:600;white-space:nowrap}.danger .status,.danger .icon{color:var(--error-color)}.warning .status{color:var(--warning-color,var(--primary-color))}.all-ok{display:flex;align-items:center;gap:12px;padding:13px;border:1px solid var(--divider-color);border-radius:12px}.all-ok>span{font-size:24px}.all-ok div div{font-size:12px;color:var(--secondary-text-color);margin-top:2px}.error{color:var(--error-color)}
          .row.clickable{cursor:pointer}@media(max-width:520px){.status{display:none}.row{grid-template-columns:34px minmax(0,1fr)}}
        </style>
        <div class="top"><div class="title">${escapeHtml(this._config.title)}<div class="sub">${escapeHtml(litter?.name || (this._loading ? "Laden…" : "Geen nest"))}</div></div>${selector}</div>
        ${body}
      </ha-card>`;

    this.shadowRoot.getElementById("litter-select")?.addEventListener("change", async (event) => {
      this._selectedLitterId = event.target.value;
      await this._loadData();
    });
    if (this._config.navigate_path) {
      this.shadowRoot.querySelectorAll(".row").forEach((row) => {
        row.classList.add("clickable");
        row.addEventListener("click", () => fireNavigate(this, this._config.navigate_path));
      });
    }
  }
}

if (!customElements.get("puppy-weight-attention-card")) {
  customElements.define("puppy-weight-attention-card", PuppyWeightAttentionCard);
}
window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === "puppy-weight-attention-card")) {
  window.customCards.push({ type: "puppy-weight-attention-card", name: "Puppy Weight Attention", description: "Toont alleen pups die aandacht vragen." });
}
