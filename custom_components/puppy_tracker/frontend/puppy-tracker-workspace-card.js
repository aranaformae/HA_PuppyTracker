import {
  escapeHtml,
  languageForHass,
  LITTER_CHANGE_EVENT,
  preserveScrollPosition,
} from "./puppy-tracker-card-common.js";
const TAG = "puppy-tracker-workspace-card";

const SURFACES = {
  summary: { tag: "puppy-tracker-summary-card", icon: "mdi:view-dashboard-outline" },
  today: { tag: "puppy-tracker-today-card", icon: "mdi:calendar-today-outline" },
  attention: { tag: "puppy-tracker-attention-card", icon: "mdi:alert-circle-outline" },
  puppies: { tag: "puppy-tracker-litter-card", icon: "mdi:format-list-bulleted" },
  weighing: { tag: "puppy-tracker-card", icon: "mdi:scale" },
  analysis: { tag: "puppy-tracker-overview-card", icon: "mdi:chart-line" },
  quickLog: { tag: "puppy-tracker-quick-log-card", icon: "mdi:lightning-bolt-outline" },
  dossier: { tag: "puppy-tracker-dossier-card", icon: "mdi:folder-text-outline" },
  timeline: { tag: "puppy-tracker-timeline-card", icon: "mdi:timeline-clock-outline" },
  temperature: { tag: "puppy-tracker-temperature-card", icon: "mdi:thermometer" },
  bulk: { tag: "puppy-tracker-bulk-dossier-card", icon: "mdi:account-multiple-plus-outline" },
  care: { tag: "puppy-tracker-care-execution-card", icon: "mdi:clipboard-check-outline" },
  programs: { tag: "puppy-tracker-care-program-card", icon: "mdi:calendar-heart" },
  reminders: { tag: "puppy-tracker-recurring-reminder-card", icon: "mdi:bell-outline" },
};

const PRESETS = {
  home: { tabs: ["today", "attention", "puppies"] },
  growth: { tabs: ["weighing", "analysis"] },
  journal: { tabs: ["quickLog", "dossier", "timeline", "temperature"] },
  care: { tabs: ["care", "programs", "reminders"] },
  mobile: { tabs: ["weighing", "quickLog", "today", "care"] },
};

const TEXT = {
  nl: {
    home: "Home",
    growth: "Groei",
    journal: "Logboek",
    carePreset: "Zorg",
    mobile: "Mobiel",
    today: "Vandaag",
    attention: "Aandacht",
    puppies: "Pups",
    weighing: "Wegen",
    analysis: "Analyse",
    quickLog: "Snel loggen",
    dossier: "Dossier",
    timeline: "Tijdlijn",
    temperature: "Temperatuur",
    care: "Uitvoeren",
    programs: "Programma's",
    reminders: "Herinneringen",
    bulk: "Meerdere pups",
    closeBulk: "Terug naar logboek",
    chooseView: "Weergave kiezen",
  },
  en: {
    home: "Home",
    growth: "Growth",
    journal: "Journal",
    carePreset: "Care",
    mobile: "Mobile",
    today: "Today",
    attention: "Attention",
    puppies: "Puppies",
    weighing: "Weigh",
    analysis: "Analysis",
    quickLog: "Quick log",
    dossier: "Dossier",
    timeline: "Timeline",
    temperature: "Temperature",
    care: "Execute",
    programs: "Programs",
    reminders: "Reminders",
    bulk: "Multiple puppies",
    closeBulk: "Back to journal",
    chooseView: "Choose view",
  },
};

function configHass() {
  return document.querySelector("home-assistant")?.hass || null;
}

function languageText(hass, key) {
  return (TEXT[languageForHass(hass)] || TEXT.nl)[key] || key;
}

function text(card, key) {
  return languageText(card?._hass, key);
}

function presetTitle(card, preset) {
  if (preset === "growth") return text(card, "growth");
  if (preset === "journal") return text(card, "journal");
  if (preset === "care") return text(card, "carePreset");
  if (preset === "mobile") return text(card, "mobile");
  return text(card, "home");
}

class PuppyTrackerWorkspaceCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._hass = null;
    this._preset = "home";
    this._tabs = [...PRESETS.home.tabs];
    this._tab = "today";
    this._previousTab = "today";
    this._children = new Map();
    this._language = null;
    this._litterId = "";
    this._storageIdentity = "home";
    this.addEventListener(LITTER_CHANGE_EVENT, (event) => this._handleLitterChange(event));
  }

  static getStubConfig() {
    return {
      preset: "home",
      default_tab: "today",
      show_summary: true,
      show_litter_selector: true,
      show_today_only: false,
      show_bulk_action: true,
      default_selected: "litter",
      puppy_id: "",
    };
  }

  static getConfigForm() {
    const hass = configHass();
    return { schema: [
      { name: "title", selector: { text: {} } },
      { name: "preset", selector: { select: { mode: "dropdown", options: [
        { value: "home", label: languageText(hass, "home") },
        { value: "growth", label: languageText(hass, "growth") },
        { value: "journal", label: languageText(hass, "journal") },
        { value: "care", label: languageText(hass, "carePreset") },
        { value: "mobile", label: languageText(hass, "mobile") },
      ] } } },
      { name: "litter_id", selector: { text: {} } },
      { name: "show_litter_selector", selector: { boolean: {} } },
    ] };
  }

  setConfig(config) {
    const requestedPreset = Object.hasOwn(PRESETS, config.preset) ? config.preset : "home";
    const defaults = { ...PuppyTrackerWorkspaceCard.getStubConfig(), ...PRESETS[requestedPreset] };
    this._config = { ...defaults, ...config, preset: requestedPreset };
    this._preset = requestedPreset;
    this._litterId = config.litter_id || "";
    const allowedTabs = PRESETS[requestedPreset].tabs;
    const requestedTabs = Array.isArray(config.tabs) ? config.tabs : allowedTabs;
    this._tabs = requestedTabs.filter((tab, index) => allowedTabs.includes(tab) && requestedTabs.indexOf(tab) === index);
    if (!this._tabs.length) this._tabs = [...allowedTabs];
    this._storageIdentity = config.state_key || `${requestedPreset}.${this._tabs.join("-")}.${config.litter_id || "auto"}`;

    const storedTab = this._loadTab();
    const initialTab = storedTab || config.default_tab || this._tabs[0];
    this._tab = this._tabs.includes(initialTab) ? initialTab : this._tabs[0];
    this._previousTab = this._tab;
    this._render();
  }

  set hass(hass) {
    const previousLanguage = this._language;
    this._hass = hass;
    this._language = languageForHass(hass);
    const activeKeys = new Set([this._tab]);
    if (this._children.has("summary")) activeKeys.add("summary");
    for (const key of activeKeys) {
      const child = this._children.get(key);
      if (child) child.hass = hass;
    }
    if (previousLanguage !== this._language) this._updateLabels();
  }

  connectedCallback() {
    if (!this.shadowRoot?.firstChild) {
      this._render();
    }
  }

  getCardSize() {
    return this._preset === "home" && this._config.show_summary !== false ? 9 : 7;
  }

  getGridOptions() {
    return { columns: 12, min_columns: 6 };
  }

  _storageKey() {
    return `puppy_tracker.workspace.${encodeURIComponent(this._storageIdentity)}.tab`;
  }

  _loadTab() {
    try { return window.localStorage?.getItem(this._storageKey()) || ""; }
    catch (_error) { return ""; }
  }

  _saveTab(tab) {
    try { window.localStorage?.setItem(this._storageKey(), tab); }
    catch (_error) { /* Storage availability must not affect navigation. */ }
  }

  _surfaceConfig(key) {
    const common = {};
    if (this._litterId) common.litter_id = this._litterId;
    if (["quickLog", "dossier", "timeline"].includes(key)) {
      common.state_key = `${this._storageIdentity}.${key}`;
    }
    const showLitter = this._config.show_litter_selector !== false;
    const selected = this._config.default_selected || "litter";
    const selectedPuppyId = selected === "puppy" ? (this._config.puppy_id || "") : "";
    const tabConfig = this._config.tab_config?.[key] || {};
    const configs = {
      summary: { show_litter_selector: false },
      today: { show_litter_selector: showLitter, show_today_only: this._config.show_today_only === true },
      attention: { show_litter_selector: showLitter, show_today_only: this._config.show_today_only === true },
      puppies: {},
      weighing: { show_puppies: true, show_details: true },
      analysis: {},
      quickLog: { show_litter_selector: showLitter, default_selected: selected === "all" ? "litter" : selected, puppy_id: selectedPuppyId },
      dossier: { show_litter_selector: showLitter, default_selected: selected, puppy_id: selectedPuppyId },
      timeline: { show_litter_selector: showLitter, default_selected: selected, puppy_id: selectedPuppyId },
      temperature: { default_selected: selected === "all" ? "litter" : selected, puppy_id: selectedPuppyId },
      bulk: { show_litter_selector: showLitter, active_only: true },
      care: { show_litter_selector: showLitter, show_day_selector: this._preset !== "mobile", days_ahead: this._preset === "mobile" ? 0 : 14 },
      programs: { show_litter_selector: showLitter },
      reminders: { show_litter_selector: showLitter },
    };
    return { ...common, ...(configs[key] || {}), ...tabConfig };
  }

  _allSurfaceKeys() {
    const keys = [...this._tabs];
    if (this._preset === "home" && this._config.show_summary !== false) keys.unshift("summary");
    if (this._preset === "journal" && this._config.show_bulk_action !== false) keys.push("bulk");
    return [...new Set(keys)];
  }

  _mountSurfaces() {
    this._children.clear();
    for (const key of this._allSurfaceKeys()) {
      const slot = this.shadowRoot?.querySelector(`[data-surface="${key}"]`);
      const definition = SURFACES[key];
      if (!slot || !definition) continue;
      const child = document.createElement(definition.tag);
      child.setConfig?.(this._surfaceConfig(key));
      this._children.set(key, child);
    }
    this._updateVisibility();
  }

  _replaceSurface(key) {
    const slot = this.shadowRoot?.querySelector(`[data-surface="${key}"]`);
    const definition = SURFACES[key];
    if (!slot || !definition) return;
    this._children.get(key)?.remove();
    const child = document.createElement(definition.tag);
    child.setConfig?.(this._surfaceConfig(key));
    this._children.set(key, child);
    const active = key === "summary" || key === this._tab;
    if (active) {
      slot.appendChild(child);
      if (this._hass) child.hass = this._hass;
    }
  }

  _selectTab(tab) {
    if (!this._tabs.includes(tab) && tab !== "bulk") return;
    preserveScrollPosition(this, () => {
      if (tab !== "bulk") this._previousTab = tab;
      this._tab = tab;
      if (tab !== "bulk") this._saveTab(tab);
      const child = this._children.get(tab);
      if (child && this._hass) child.hass = this._hass;
      this._updateVisibility();
    });
  }

  _updateVisibility() {
    this.shadowRoot?.querySelectorAll("[data-surface]").forEach((surface) => {
      const alwaysVisible = surface.dataset.surface === "summary";
      const active = alwaysVisible || surface.dataset.surface === this._tab;
      const child = this._children.get(surface.dataset.surface);
      surface.hidden = !active;
      if (active && child && child.parentNode !== surface) {
        surface.appendChild(child);
        if (this._hass) child.hass = this._hass;
      } else if (!active && child?.parentNode === surface) {
        child.remove();
      }
    });
    this.shadowRoot?.querySelectorAll("[data-tab]").forEach((button) => {
      const active = button.dataset.tab === this._tab;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
      button.tabIndex = active ? 0 : -1;
    });
    const select = this.shadowRoot?.getElementById("workspace-tab-select");
    if (select && this._tabs.includes(this._tab)) select.value = this._tab;
    const bulkButton = this.shadowRoot?.getElementById("bulk-action");
    if (bulkButton) {
      const active = this._tab === "bulk";
      bulkButton.innerHTML = `<ha-icon icon="${active ? "mdi:arrow-left" : SURFACES.bulk.icon}"></ha-icon>${escapeHtml(text(this, active ? "closeBulk" : "bulk"))}`;
    }
  }

  _updateLabels() {
    const title = this.shadowRoot?.querySelector(".workspace-title");
    if (title && !this._config.title) title.textContent = presetTitle(this, this._preset);
    for (const button of this.shadowRoot?.querySelectorAll("[data-tab]") || []) {
      const key = button.dataset.tab;
      const label = button.querySelector("span");
      if (label) label.textContent = text(this, key);
    }
    const select = this.shadowRoot?.getElementById("workspace-tab-select");
    for (const option of select?.options || []) {
      option.textContent = text(this, option.value);
    }
  }

  _handleLitterChange(event) {
    const litterId = String(event?.detail?.litterId || "").trim();
    if (!litterId) return;
    if (event.cancelable) event.preventDefault();
    if (litterId === this._litterId) return;
    const path = event.composedPath?.() || [];
    const sourceKey = [...this._children.entries()].find(([, child]) => path.includes(child))?.[0] || null;
    this._litterId = litterId;
    preserveScrollPosition(this, () => {
      for (const key of this._allSurfaceKeys()) {
        if (sourceKey === "weighing" && key === sourceKey) continue;
        this._replaceSurface(key);
      }
    });
  }

  _handleTabKeydown(event) {
    const button = event.target.closest?.("[data-tab]");
    if (!button || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const index = this._tabs.indexOf(button.dataset.tab);
    const next = event.key === "Home" ? 0
      : event.key === "End" ? this._tabs.length - 1
        : (index + (event.key === "ArrowRight" ? 1 : -1) + this._tabs.length) % this._tabs.length;
    this._selectTab(this._tabs[next]);
    this.shadowRoot?.querySelector(`[data-tab="${this._tabs[next]}"]`)?.focus();
  }

  _render() {
    if (!this.shadowRoot || !this._config.preset) return;
    const tabButtons = this._tabs.map((key) => `<button type="button" role="tab" class="workspace-tab ${key === this._tab ? "active" : ""}" data-tab="${key}" id="workspace-tab-${key}" aria-controls="workspace-surface-${key}" aria-selected="${key === this._tab ? "true" : "false"}"><ha-icon icon="${SURFACES[key].icon}"></ha-icon><span>${escapeHtml(text(this, key))}</span></button>`).join("");
    const tabOptions = this._tabs.map((key) => `<option value="${key}" ${key === this._tab ? "selected" : ""}>${escapeHtml(text(this, key))}</option>`).join("");
    const summary = this._preset === "home" && this._config.show_summary !== false ? `<div class="summary-surface" data-surface="summary"></div>` : "";
    const bulk = this._preset === "journal" && this._config.show_bulk_action !== false ? `<button type="button" class="utility" id="bulk-action"><ha-icon icon="${SURFACES.bulk.icon}"></ha-icon>${escapeHtml(text(this, "bulk"))}</button>` : "";
    const surfaces = [...this._tabs, ...(bulk ? ["bulk"] : [])].map((key) => `<div class="workspace-surface" data-surface="${key}" id="workspace-surface-${key}" role="tabpanel" ${this._tabs.includes(key) ? `aria-labelledby="workspace-tab-${key}"` : ""} ${key === this._tab ? "" : "hidden"}></div>`).join("");
    const heading = this._config.title ? `<h2 class="workspace-title">${escapeHtml(this._config.title)}</h2>` : "";

    this.shadowRoot.innerHTML = `<style>
      :host{display:block;overflow-anchor:none}.workspace{display:grid;gap:10px}.workspace-title{margin:0;padding:0 4px;font-size:1.25rem;line-height:1.3;letter-spacing:0}.workspace-nav{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px;border:1px solid var(--divider-color);border-radius:8px;background:var(--card-background-color)}.tabs{display:flex;gap:6px;min-width:0;overflow-x:auto;scrollbar-width:thin}.workspace-tab,.utility{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:42px;border:1px solid var(--divider-color);border-radius:8px;padding:0 12px;background:var(--secondary-background-color);color:var(--primary-text-color);font:inherit;font-weight:600;white-space:nowrap;cursor:pointer;touch-action:manipulation}.workspace-tab ha-icon,.utility ha-icon{--mdc-icon-size:19px}.workspace-tab.active{background:var(--primary-color);border-color:var(--primary-color);color:var(--text-primary-color,#fff)}.utility{flex:0 0 auto;background:transparent}.mobile-select{display:none;min-height:44px;width:100%;border:1px solid var(--divider-color);border-radius:8px;background:var(--card-background-color);color:var(--primary-text-color);padding:0 10px;font:inherit}.workspace-surface[hidden],.summary-surface[hidden]{display:none}.workspace-surface>*,.summary-surface>*{display:block}@media(max-width:600px){.workspace-nav{display:grid}.tabs{display:none}.mobile-select{display:block}.utility{width:100%}}
    </style><div class="workspace">${heading}${summary}<div class="workspace-nav"><div class="tabs" role="tablist">${tabButtons}</div><select id="workspace-tab-select" class="mobile-select" aria-label="${escapeHtml(text(this, "chooseView"))}">${tabOptions}</select>${bulk}</div>${surfaces}</div>`;
    this._mountSurfaces();
    this.shadowRoot.querySelectorAll("[data-tab]").forEach((button) => {
      button.addEventListener("click", () => this._selectTab(button.dataset.tab));
      button.addEventListener("keydown", (event) => this._handleTabKeydown(event));
    });
    this.shadowRoot.getElementById("workspace-tab-select")?.addEventListener("change", (event) => this._selectTab(event.target.value));
    this.shadowRoot.getElementById("bulk-action")?.addEventListener("click", () => this._selectTab(this._tab === "bulk" ? this._previousTab : "bulk"));
  }
}

if (!customElements.get(TAG)) customElements.define(TAG, PuppyTrackerWorkspaceCard);

const PUBLIC_CARD_TYPES = new Set([
  TAG,
  "puppy-tracker-owner-card",
  "puppy-tracker-report-card",
]);
window.customCards = (window.customCards || []).filter((card) =>
  !String(card.type || "").startsWith("puppy-tracker-") || PUBLIC_CARD_TYPES.has(card.type),
);
if (!window.customCards.some((card) => card.type === TAG)) {
  window.customCards.push({
    type: TAG,
    name: "Puppy Tracker Workspace",
    description: "Task-focused Puppy Tracker views for home, growth, journal, care and mobile use.",
  });
}
