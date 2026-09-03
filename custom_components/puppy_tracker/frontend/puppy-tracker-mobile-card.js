import {
  escapeHtml,
  languageForHass,
  loadCardState,
  saveCardState,
} from "./puppy-tracker-card-common.js";

const TAG = "puppy-tracker-mobile-card";

const TEXT = {
  nl: {
    title: "Mobiele bediening",
    subtitle: "Snel wegen, loggen en zorgacties uitvoeren.",
    weighing: "Wegen",
    quickLog: "Quick Log",
    today: "Vandaag",
    ready: "Klaar voor de volgende actie",
    weighingHint: "Gebruik de grote invoer en ga daarna door naar de volgende pup.",
    quickLogHint: "Kies een logtype en controleer altijd de eigenaar vóór opslaan.",
    todayHint: "Openstaande zorgacties voor vandaag staan bovenaan.",
  },
  en: {
    title: "Mobile controls",
    subtitle: "Quickly weigh, log and complete care actions.",
    weighing: "Weigh",
    quickLog: "Quick Log",
    today: "Today",
    ready: "Ready for the next action",
    weighingHint: "Use the large input, then continue to the next puppy.",
    quickLogHint: "Choose a log type and always check the owner before saving.",
    todayHint: "Open care actions for today are shown first.",
  },
};

function text(card, key) {
  return (TEXT[languageForHass(card?._hass)] || TEXT.nl)[key] || key;
}

class PuppyTrackerMobileCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass = null;
    this._config = {};
    this._state = loadCardState(this, { tab: "weighing" });
    this._tab = this._state.tab || "weighing";
  }

  static getStubConfig() {
    return { title: "", tab: "weighing", show_weighing: true, show_quick_log: true, show_today: true };
  }

  static getConfigForm() {
    return { schema: [
      { name: "title", selector: { text: {} } },
      { name: "show_weighing", selector: { boolean: {} } },
      { name: "show_quick_log", selector: { boolean: {} } },
      { name: "show_today", selector: { boolean: {} } },
    ] };
  }

  setConfig(config) {
    this._config = { ...PuppyTrackerMobileCard.getStubConfig(), ...config };
    if (["weighing", "quickLog", "today"].includes(config.tab)) this._tab = config.tab;
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this.shadowRoot?.querySelectorAll("puppy-tracker-card, puppy-tracker-quick-log-card, puppy-tracker-today-card")
      .forEach((child) => { child.hass = hass; });
  }

  connectedCallback() { this._render(); }
  getCardSize() { return 8; }
  getGridOptions() { return { columns: 12, min_columns: 6 }; }

  _availableTabs() {
    return [
      this._config.show_weighing !== false && "weighing",
      this._config.show_quick_log !== false && "quickLog",
      this._config.show_today !== false && "today",
    ].filter(Boolean);
  }

  _selectTab(tab) {
    if (!this._availableTabs().includes(tab)) return;
    this._tab = tab;
    this._state = { ...this._state, tab };
    saveCardState(this, this._state);
    this._render();
  }

  _childForTab() {
    if (this._tab === "quickLog") return "puppy-tracker-quick-log-card";
    if (this._tab === "today") return "puppy-tracker-today-card";
    return "puppy-tracker-card";
  }

  _childConfig(tag) {
    if (tag === "puppy-tracker-card") return { title: text(this, "weighing"), show_puppies: true, show_details: false };
    if (tag === "puppy-tracker-quick-log-card") return { title: text(this, "quickLog"), show_litter_selector: true };
    return { title: text(this, "today"), show_litter_selector: true };
  }

  _render() {
    if (!this.shadowRoot) return;
    const available = this._availableTabs();
    if (!available.includes(this._tab)) this._tab = available[0] || "weighing";
    const childTag = this._childForTab();
    const hintKey = this._tab === "quickLog" ? "quickLogHint" : this._tab === "today" ? "todayHint" : "weighingHint";
    const tabs = available.map((tab) => `<button type="button" class="tab ${tab === this._tab ? "active" : ""}" data-tab="${tab}" aria-pressed="${tab === this._tab ? "true" : "false"}">${escapeHtml(text(this, tab))}</button>`).join("");
    this.shadowRoot.innerHTML = `<ha-card><style>
      :host{display:block}ha-card{padding:14px;container-type:inline-size;container-name:mobile-card}.header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.title{font-size:20px;font-weight:700;line-height:1.2}.subtitle{margin-top:4px;color:var(--secondary-text-color);font-size:13px;line-height:1.35}.ready{display:flex;align-items:center;gap:6px;color:var(--success-color,var(--primary-color));font-size:12px;font-weight:600;text-align:right}.ready::before{content:"";width:9px;height:9px;border-radius:50%;background:currentColor}.tabs{display:grid;grid-template-columns:repeat(${Math.max(1, available.length)},minmax(0,1fr));gap:8px;margin:15px 0 10px}.tab{min-height:52px;border:1px solid var(--divider-color);border-radius:12px;background:var(--secondary-background-color);color:var(--primary-text-color);font:inherit;font-weight:650;cursor:pointer;touch-action:manipulation}.tab.active{background:var(--primary-color);border-color:var(--primary-color);color:var(--text-primary-color,#fff)}.hint{margin:0 2px 10px;color:var(--secondary-text-color);font-size:12px;line-height:1.35}.surface{border-top:1px solid var(--divider-color);padding-top:10px}.surface>puppy-tracker-card,.surface>puppy-tracker-quick-log-card,.surface>puppy-tracker-today-card{display:block}.surface>puppy-tracker-card ha-card,.surface>puppy-tracker-quick-log-card ha-card,.surface>puppy-tracker-today-card ha-card{box-shadow:none;border:0;padding:0;background:transparent}@container mobile-card (max-width:430px){ha-card{padding:12px}.header{display:block}.ready{text-align:left;margin-top:8px}.tabs{gap:6px}.tab{min-height:56px;font-size:14px}}
    </style><div class="header"><div><div class="title">${escapeHtml(this._config.title || text(this, "title"))}</div><div class="subtitle">${escapeHtml(text(this, "subtitle"))}</div></div><div class="ready" role="status">${escapeHtml(text(this, "ready"))}</div></div><div class="tabs" role="tablist" aria-label="${escapeHtml(text(this, "title"))}">${tabs}</div><div class="hint">${escapeHtml(text(this, hintKey))}</div><div class="surface"><${childTag}></${childTag}></div></ha-card>`;
    const child = this.shadowRoot.querySelector(childTag);
    child?.setConfig(this._childConfig(childTag));
    if (this._hass) child.hass = this._hass;
    this.shadowRoot.querySelectorAll("[data-tab]").forEach((button) => button.addEventListener("click", () => this._selectTab(button.dataset.tab)));
  }
}

if (!customElements.get(TAG)) customElements.define(TAG, PuppyTrackerMobileCard);
window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === TAG)) window.customCards.push({ type: TAG, name: "Puppy Tracker Mobile Controls", description: "Large touch-friendly controls for Puppy Tracker." });
