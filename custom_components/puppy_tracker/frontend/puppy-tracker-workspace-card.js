import {
  escapeHtml,
  languageForHass,
  LITTER_CHANGE_EVENT,
  preserveScrollPosition,
} from "./puppy-tracker-card-common.js";
const TAG = "puppy-tracker-workspace-card";
const EDITOR_TAG = "puppy-tracker-workspace-card-editor";

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

const EDITOR_FIELDS = {
  home: [
    { name: "show_summary", default: true, selector: { boolean: {} } },
    { name: "show_today_only", default: false, selector: { boolean: {} } },
    { name: "attention_max_items", surface: "attention", key: "max_items", default: 25, selector: { number: { min: 5, max: 100, step: 5, mode: "box" } } },
    { name: "attention_compact", surface: "attention", key: "compact", default: false, selector: { boolean: {} } },
    { name: "puppies_active_only", surface: "puppies", key: "active_only", default: true, selector: { boolean: {} } },
    { name: "puppies_show_details", surface: "puppies", key: "show_details", default: true, selector: { boolean: {} } },
    { name: "puppies_default_sort", surface: "puppies", key: "default_sort", default: "name", selector: { select: { mode: "dropdown", options: ["name", "weight", "growth24", "last", "attention"] } } },
  ],
  growth: [
    { name: "weighing_show_puppies", surface: "weighing", key: "show_puppies", default: true, selector: { boolean: {} } },
    { name: "weighing_show_details", surface: "weighing", key: "show_details", default: true, selector: { boolean: {} } },
    { name: "analysis_default_range", surface: "analysis", key: "default_range", default: "7d", selector: { select: { mode: "dropdown", options: ["24h", "3d", "7d", "14d", "30d", "all"] } } },
    { name: "analysis_default_metric", surface: "analysis", key: "default_metric", default: "weight", selector: { select: { mode: "dropdown", options: ["weight", "growth24", "growthBirth"] } } },
    { name: "analysis_show_summary", surface: "analysis", key: "show_summary", default: true, selector: { boolean: {} } },
    { name: "analysis_show_puppy_cards", surface: "analysis", key: "show_puppy_cards", default: true, selector: { boolean: {} } },
    { name: "analysis_show_advanced_analysis", surface: "analysis", key: "show_advanced_analysis", default: false, selector: { boolean: {} } },
    { name: "analysis_show_growth_milestones", surface: "analysis", key: "show_growth_milestones", default: true, selector: { boolean: {} } },
    { name: "analysis_show_milestone_chart_annotations", surface: "analysis", key: "show_milestone_chart_annotations", default: true, selector: { boolean: {} } },
  ],
  journal: [
    { name: "default_selected", default: "litter", selector: { select: { mode: "dropdown", options: ["all", "litter", "mother", "puppy"] } } },
    { name: "puppy_id", default: "", selector: { text: {} } },
    { name: "show_bulk_action", default: true, selector: { boolean: {} } },
    { name: "dossier_show_profile_note", surface: "dossier", key: "show_profile_note", default: true, selector: { boolean: {} } },
    { name: "dossier_show_timeline_items", surface: "dossier", key: "show_timeline_items", default: false, selector: { boolean: {} } },
    { name: "timeline_max_items", surface: "timeline", key: "max_items", default: 250, selector: { number: { min: 25, max: 500, step: 25, mode: "box" } } },
    { name: "timeline_show_history_toggle", surface: "timeline", key: "show_history_toggle", default: true, selector: { boolean: {} } },
    { name: "timeline_show_timeline_items", surface: "timeline", key: "show_timeline_items", default: false, selector: { boolean: {} } },
    { name: "temperature_default_range", surface: "temperature", key: "default_range", default: "3d", selector: { select: { mode: "dropdown", options: ["24h", "3d", "7d", "14d", "all"] } } },
    { name: "temperature_history_limit", surface: "temperature", key: "history_limit", default: 10, selector: { number: { min: 3, max: 50, step: 1, mode: "box" } } },
    { name: "temperature_max_height", surface: "temperature", key: "max_height", default: 520, selector: { number: { min: 240, max: 900, step: 20, mode: "box" } } },
    { name: "temperature_chart_height", surface: "temperature", key: "chart_height", default: 170, selector: { number: { min: 100, max: 500, step: 10, mode: "box" } } },
    { name: "temperature_history_sort", surface: "temperature", key: "history_sort", default: "newest", selector: { select: { mode: "dropdown", options: ["newest", "oldest"] } } },
    { name: "temperature_show_selectors", surface: "temperature", key: "show_selectors", default: true, selector: { boolean: {} } },
    { name: "temperature_show_thresholds", surface: "temperature", key: "show_thresholds", default: false, selector: { boolean: {} } },
    { name: "temperature_show_latest", surface: "temperature", key: "show_latest", default: true, selector: { boolean: {} } },
    { name: "temperature_show_chart", surface: "temperature", key: "show_chart", default: true, selector: { boolean: {} } },
    { name: "temperature_show_history", surface: "temperature", key: "show_history", default: true, selector: { boolean: {} } },
    { name: "temperature_show_editor", surface: "temperature", key: "show_editor", default: true, selector: { boolean: {} } },
  ],
  care: [
    { name: "care_show_day_selector", surface: "care", key: "show_day_selector", default: true, selector: { boolean: {} } },
    { name: "care_days_ahead", surface: "care", key: "days_ahead", default: 14, selector: { number: { min: 0, max: 365, step: 1, mode: "box" } } },
    { name: "care_max_items", surface: "care", key: "max_items", default: 50, selector: { number: { min: 5, max: 200, step: 5, mode: "box" } } },
    { name: "programs_show_disabled", surface: "programs", key: "show_disabled", default: true, selector: { boolean: {} } },
    { name: "programs_max_items", surface: "programs", key: "max_items", default: 50, selector: { number: { min: 5, max: 200, step: 5, mode: "box" } } },
    { name: "programs_compact", surface: "programs", key: "compact", default: false, selector: { boolean: {} } },
    { name: "programs_sort_order", surface: "programs", key: "sort_order", default: "schedule", selector: { select: { mode: "dropdown", options: ["schedule", "title"] } } },
  ],
  mobile: [
    { name: "default_selected", default: "litter", selector: { select: { mode: "dropdown", options: ["litter", "mother", "puppy"] } } },
    { name: "puppy_id", default: "", selector: { text: {} } },
    { name: "show_today_only", default: false, selector: { boolean: {} } },
    { name: "weighing_show_details", surface: "weighing", key: "show_details", default: true, selector: { boolean: {} } },
    { name: "care_show_day_selector", surface: "care", key: "show_day_selector", default: false, selector: { boolean: {} } },
    { name: "care_days_ahead", surface: "care", key: "days_ahead", default: 0, selector: { number: { min: 0, max: 365, step: 1, mode: "box" } } },
    { name: "care_max_items", surface: "care", key: "max_items", default: 50, selector: { number: { min: 5, max: 200, step: 5, mode: "box" } } },
  ],
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

const EDITOR_LABELS = {
  nl: {
    title: "Titel", preset: "Preset", litter_id: "Vast nest-ID", show_litter_selector: "Nestselector tonen",
    navigation: "Navigatie", tabs: "Zichtbare tabbladen", default_tab: "Standaard tabblad", state_key: "Unieke status-sleutel",
    presetOptions: "Opties voor deze preset", show_summary: "Samenvatting tonen", show_today_only: "Alleen vandaag tonen",
    attention_max_items: "Aandacht: maximaal aantal items", attention_compact: "Aandacht compact tonen",
    puppies_active_only: "Alleen actieve pups", puppies_show_details: "Pupdetails tonen", puppies_default_sort: "Pups standaard sorteren op",
    weighing_show_puppies: "Puppenlijst bij wegen tonen", weighing_show_details: "Weegdetails tonen",
    analysis_default_range: "Analyseperiode", analysis_default_metric: "Standaard groeimetriek", analysis_show_summary: "Analysesamenvatting tonen",
    analysis_show_puppy_cards: "Pupkaarten tonen", analysis_show_advanced_analysis: "Geavanceerde analyse tonen",
    analysis_show_growth_milestones: "Groeimijlpalen tonen", analysis_show_milestone_chart_annotations: "Mijlpalen in grafieken tonen",
    default_selected: "Standaard eigenaar/scope", puppy_id: "Standaard pup-ID", show_bulk_action: "Actie voor meerdere pups tonen",
    dossier_show_profile_note: "Dossierprofielnotitie tonen", dossier_show_timeline_items: "Dossiertijdlijn standaard uitklappen",
    timeline_max_items: "Tijdlijn: maximaal aantal items", timeline_show_history_toggle: "Tijdlijnknop tonen", timeline_show_timeline_items: "Tijdlijnitems standaard tonen",
    temperature_default_range: "Temperatuurperiode", temperature_history_limit: "Aantal temperatuurmetingen", temperature_max_height: "Maximale lijsthoogte",
    temperature_chart_height: "Grafiekhoogte", temperature_history_sort: "Volgorde metingen", temperature_show_selectors: "Temperatuurselectors tonen",
    temperature_show_thresholds: "Temperatuurgrenzen tonen", temperature_show_latest: "Laatste temperatuur tonen", temperature_show_chart: "Temperatuurgrafiek tonen",
    temperature_show_history: "Temperatuurlogboek tonen", temperature_show_editor: "Temperatuurinvoer tonen",
    care_show_day_selector: "Dagselector tonen", care_days_ahead: "Aantal dagen vooruit", care_max_items: "Uitvoeren: maximaal aantal items",
    programs_show_disabled: "Uitgeschakelde programma's tonen", programs_max_items: "Programma's: maximaal aantal items",
    programs_compact: "Programma's compact tonen", programs_sort_order: "Programma's sorteren op",
  },
  en: {
    title: "Title", preset: "Preset", litter_id: "Fixed litter ID", show_litter_selector: "Show litter selector",
    navigation: "Navigation", tabs: "Visible tabs", default_tab: "Default tab", state_key: "Unique state key",
    presetOptions: "Options for this preset", show_summary: "Show summary", show_today_only: "Show today only",
    attention_max_items: "Attention: maximum items", attention_compact: "Show compact attention items",
    puppies_active_only: "Active puppies only", puppies_show_details: "Show puppy details", puppies_default_sort: "Default puppy sorting",
    weighing_show_puppies: "Show puppy list while weighing", weighing_show_details: "Show weighing details",
    analysis_default_range: "Analysis range", analysis_default_metric: "Default growth metric", analysis_show_summary: "Show analysis summary",
    analysis_show_puppy_cards: "Show puppy cards", analysis_show_advanced_analysis: "Show advanced analysis",
    analysis_show_growth_milestones: "Show growth milestones", analysis_show_milestone_chart_annotations: "Show milestones in charts",
    default_selected: "Default owner/scope", puppy_id: "Default puppy ID", show_bulk_action: "Show multi-puppy action",
    dossier_show_profile_note: "Show dossier profile note", dossier_show_timeline_items: "Expand dossier timeline by default",
    timeline_max_items: "Timeline: maximum items", timeline_show_history_toggle: "Show timeline toggle", timeline_show_timeline_items: "Show timeline items by default",
    temperature_default_range: "Temperature range", temperature_history_limit: "Number of temperature readings", temperature_max_height: "Maximum list height",
    temperature_chart_height: "Chart height", temperature_history_sort: "Reading order", temperature_show_selectors: "Show temperature selectors",
    temperature_show_thresholds: "Show temperature thresholds", temperature_show_latest: "Show latest temperature", temperature_show_chart: "Show temperature chart",
    temperature_show_history: "Show temperature history", temperature_show_editor: "Show temperature input",
    care_show_day_selector: "Show day selector", care_days_ahead: "Days ahead", care_max_items: "Execution: maximum items",
    programs_show_disabled: "Show disabled programs", programs_max_items: "Programs: maximum items",
    programs_compact: "Show programs compactly", programs_sort_order: "Sort programs by",
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

  static getConfigElement() {
    return document.createElement(EDITOR_TAG);
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

function editorLanguage(hass) {
  return languageForHass(hass) === "en" ? "en" : "nl";
}

function editorOptionLabel(hass, fieldName, value) {
  const language = editorLanguage(hass);
  const common = {
    all: { nl: "Alles", en: "All" }, litter: { nl: "Hele nest", en: "Whole litter" },
    mother: { nl: "Moederhond", en: "Mother" }, puppy: { nl: "Pup", en: "Puppy" },
    newest: { nl: "Nieuwste eerst", en: "Newest first" }, oldest: { nl: "Oudste eerst", en: "Oldest first" },
    schedule: { nl: "Planning", en: "Schedule" }, title: { nl: "Titel", en: "Title" },
    name: { nl: "Naam", en: "Name" }, weight: { nl: "Gewicht", en: "Weight" },
    growth24: { nl: "Groei per 24 uur", en: "Growth per 24 hours" }, growthBirth: { nl: "Groei sinds geboorte", en: "Growth since birth" },
    last: { nl: "Laatste weging", en: "Last weighing" }, attention: { nl: "Aandacht", en: "Attention" },
  };
  if (fieldName === "preset" && PRESETS[value]) return presetTitle({ _hass: hass }, value);
  if (SURFACES[value]) return languageText(hass, value);
  if (common[value]) return common[value][language];
  if (/^(24h|3d|7d|14d|30d)$/.test(value)) {
    const amount = value.slice(0, -1);
    const unit = value.endsWith("h") ? (language === "en" ? "hours" : "uur") : (language === "en" ? "days" : "dagen");
    return `${amount} ${unit}`;
  }
  if (value === "all") return common.all[language];
  return String(value);
}

function localizedSelector(hass, field) {
  const selector = structuredClone(field.selector);
  const select = selector.select;
  if (select && Array.isArray(select.options)) {
    select.options = select.options.map((option) => {
      const value = typeof option === "string" ? option : option.value;
      return { value, label: editorOptionLabel(hass, field.name, value) };
    });
  }
  return selector;
}

class PuppyTrackerWorkspaceCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._hass = null;
    this._language = "nl";
    this._schemaKey = "";
  }

  setConfig(config) {
    this._config = { ...config, tab_config: { ...(config.tab_config || {}) } };
    this._ensureForm();
    this._updateForm();
  }

  set hass(hass) {
    const language = editorLanguage(hass);
    this._hass = hass;
    if (language !== this._language) this._language = language;
    this._updateForm();
  }

  set lovelace(lovelace) {
    this._lovelace = lovelace;
  }

  connectedCallback() {
    this._ensureForm();
    this._updateForm();
  }

  _preset() {
    return Object.hasOwn(PRESETS, this._config.preset) ? this._config.preset : "home";
  }

  _label(name) {
    return (EDITOR_LABELS[this._language] || EDITOR_LABELS.nl)[name] || name;
  }

  _ensureForm() {
    if (!this.shadowRoot || this.shadowRoot.querySelector("ha-form")) return;
    this.shadowRoot.innerHTML = `<style>:host{display:block}ha-form{display:block}</style><ha-form></ha-form>`;
    this._schemaKey = "";
    this.shadowRoot.querySelector("ha-form")?.addEventListener("value-changed", (event) => this._valueChanged(event));
  }

  _formData() {
    const preset = this._preset();
    const tabs = Array.isArray(this._config.tabs)
      ? this._config.tabs.filter((tab) => PRESETS[preset].tabs.includes(tab))
      : [...PRESETS[preset].tabs];
    const data = {
      title: this._config.title || "",
      preset,
      litter_id: this._config.litter_id || "",
      show_litter_selector: this._config.show_litter_selector !== false,
      tabs: tabs.length ? tabs : [...PRESETS[preset].tabs],
      default_tab: PRESETS[preset].tabs.includes(this._config.default_tab) ? this._config.default_tab : (tabs[0] || PRESETS[preset].tabs[0]),
      state_key: this._config.state_key || "",
    };
    for (const field of EDITOR_FIELDS[preset]) {
      const configured = field.surface
        ? this._config.tab_config?.[field.surface]?.[field.key]
        : this._config[field.name];
      data[field.name] = configured ?? field.default;
    }
    return data;
  }

  _formDefinition() {
    const preset = this._preset();
    const tabOptions = PRESETS[preset].tabs.map((value) => ({ value, label: editorOptionLabel(this._hass, "tabs", value) }));
    const schema = [
      { name: "title", selector: { text: {} } },
      { name: "preset", selector: { select: { mode: "dropdown", options: Object.keys(PRESETS).map((value) => ({ value, label: editorOptionLabel(this._hass, "preset", value) })) } } },
      { name: "litter_id", selector: { text: {} } },
      { name: "show_litter_selector", selector: { boolean: {} } },
      {
        type: "expandable", name: "navigation", title: this._label("navigation"), flatten: true,
        schema: [
          { name: "tabs", selector: { select: { mode: "dropdown", multiple: true, options: tabOptions } } },
          { name: "default_tab", selector: { select: { mode: "dropdown", options: tabOptions } } },
          { name: "state_key", selector: { text: {} } },
        ],
      },
    ];

    const groups = new Map();
    for (const field of EDITOR_FIELDS[preset]) {
      const group = field.surface || "presetOptions";
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push({ name: field.name, selector: localizedSelector(this._hass, field) });
    }
    for (const [group, fields] of groups) {
      schema.push({
        type: "expandable",
        name: `options_${group}`,
        title: group === "presetOptions" ? this._label("presetOptions") : editorOptionLabel(this._hass, "tabs", group),
        flatten: true,
        schema: fields,
      });
    }
    return {
      schema,
      computeLabel: (entry) => this._label(entry.name),
      computeHelper: (entry) => entry.name === "puppy_id"
        ? (this._language === "en" ? "Only used when the default scope is Puppy." : "Alleen gebruikt wanneer de standaard scope Pup is.")
        : undefined,
    };
  }

  _updateForm() {
    const form = this.shadowRoot?.querySelector("ha-form");
    if (!form) return;
    form.hass = this._hass;
    const schemaKey = `${this._preset()}:${this._language}`;
    if (schemaKey !== this._schemaKey) {
      const definition = this._formDefinition();
      form.schema = definition.schema;
      form.computeLabel = definition.computeLabel;
      form.computeHelper = definition.computeHelper;
      this._schemaKey = schemaKey;
    }
    form.data = this._formData();
  }

  _assignOptional(config, key, value) {
    if (typeof value === "string" && !value.trim()) delete config[key];
    else if (value !== undefined) config[key] = value;
  }

  _valueChanged(event) {
    const data = event.detail?.value;
    if (!data) return;
    const previousPreset = this._preset();
    const preset = Object.hasOwn(PRESETS, data.preset) ? data.preset : previousPreset;
    const next = { ...this._config, preset, tab_config: { ...(this._config.tab_config || {}) } };
    this._assignOptional(next, "title", data.title);
    this._assignOptional(next, "litter_id", data.litter_id);
    next.show_litter_selector = data.show_litter_selector !== false;

    if (preset !== previousPreset) {
      delete next.tabs;
      delete next.default_tab;
      this._commit(next, true);
      return;
    }

    const allowedTabs = PRESETS[preset].tabs;
    const tabs = Array.isArray(data.tabs) ? data.tabs.filter((tab) => allowedTabs.includes(tab)) : [...allowedTabs];
    next.tabs = tabs.length ? tabs : [...allowedTabs];
    next.default_tab = next.tabs.includes(data.default_tab) ? data.default_tab : next.tabs[0];
    this._assignOptional(next, "state_key", data.state_key);

    for (const field of EDITOR_FIELDS[preset]) {
      const value = data[field.name];
      if (field.surface) {
        const surface = { ...(next.tab_config[field.surface] || {}) };
        this._assignOptional(surface, field.key, value);
        next.tab_config[field.surface] = surface;
      } else {
        this._assignOptional(next, field.name, value);
      }
    }
    this._commit(next, false);
  }

  _commit(config, rebuild) {
    this._config = config;
    this.dispatchEvent(new CustomEvent("config-changed", {
      bubbles: true,
      composed: true,
      detail: { config },
    }));
    if (rebuild) this._updateForm();
  }
}

if (!customElements.get(EDITOR_TAG)) customElements.define(EDITOR_TAG, PuppyTrackerWorkspaceCardEditor);
if (!customElements.get(TAG)) customElements.define(TAG, PuppyTrackerWorkspaceCard);

// Keep the registry object stable. Home Assistant can retain this array while
// the card picker is open, so replacing it would hide registrations added by
// modules loaded during the same frontend startup.
window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === TAG)) {
  window.customCards.push({
    type: TAG,
    name: "Puppy Tracker Workspace",
    description: "Task-focused Puppy Tracker views for home, growth, journal, care and mobile use.",
  });
}
