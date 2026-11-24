import { fetchLitters, languageForHass } from "./puppy-tracker-card-common.js";

const TYPE = "puppy-tracker";
const EDITOR = "puppy-tracker-section-editor";
const LAYOUTS = ["daily", "growth", "journal", "mobile", "management"];
const LABELS = {
  nl: { daily: "Dagelijks", growth: "Groei", journal: "Logboek", mobile: "Mobiel", management: "Baasjes en documenten", layout: "Indeling", title: "Titel", litter_id: "Nest", show_litter_selector: "Nestselector tonen", automatic: "Kiezen op de kaart", retry: "Nesten opnieuw laden" },
  en: { daily: "Daily", growth: "Growth", journal: "Journal", mobile: "Mobile", management: "Owners and documents", layout: "Layout", title: "Title", litter_id: "Litter", show_litter_selector: "Show litter selector", automatic: "Choose on the card", retry: "Reload litters" },
};
const copy = (hass) => LABELS[languageForHass(hass) === "nl" ? "nl" : "en"];

export class PuppyTrackerSectionStrategy extends HTMLElement {
  static getStubConfig() {
    return { type: `custom:${TYPE}`, layout: "daily", show_litter_selector: true };
  }

  static getConfigElement() { return document.createElement(EDITOR); }

  static async generate(config, hass) {
    const text = copy(hass);
    const layout = config.layout || "daily";
    if (!LAYOUTS.includes(layout)) {
      throw new Error(`Unknown Puppy Tracker section layout: ${layout}`);
    }
    const shared = { show_litter_selector: config.show_litter_selector !== false };
    if (config.litter_id) shared.litter_id = config.litter_id;
    const workspace = (preset, extra = {}) => ({ type: "custom:puppy-tracker-workspace-card", preset, ...shared, ...extra });
    const layouts = {
      daily: [workspace("home"), workspace("care", { tabs: ["care", "calculator"], default_tab: "care" })],
      growth: [workspace("growth")],
      journal: [workspace("journal")],
      mobile: [workspace("mobile")],
      management: [
        { type: "custom:puppy-tracker-owner-card", ...shared },
        { type: "custom:puppy-tracker-report-card", ...shared },
      ],
    };
    return { type: "grid", cards: [
      { type: "heading", heading: config.title?.trim() || `Puppy Tracker · ${text[layout]}`, heading_style: "title" },
      ...layouts[layout],
    ] };
  }
}

class PuppyTrackerSectionEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = PuppyTrackerSectionStrategy.getStubConfig();
    this._litters = [];
    this._generation = 0;
  }
  setConfig(config) { this._config = { ...config }; this._update(); }
  set hass(hass) { this._hass = hass; this._update(); this._loadLitters(); }
  connectedCallback() { this._update(); this._loadLitters(); }
  disconnectedCallback() { this._generation++; this._loadedFor = null; }

  async _loadLitters() {
    const hass = this._hass;
    if (!this.isConnected || !hass?.callWS) return;
    if (this._loadedFor?.connection === hass.connection && this._loadedFor?.user === hass.user?.id && this._loadedFor) return;
    this._loadedFor = { connection: hass.connection, user: hass.user?.id };
    const generation = ++this._generation;
    this._litters = [];
    this._failed = false;
    try {
      const result = await fetchLitters(hass);
      if (generation !== this._generation || !this.isConnected) return;
      this._litters = result.litters || [];
    } catch {
      if (generation !== this._generation || !this.isConnected) return;
      this._failed = true;
    }
    this._update();
  }

  _update() {
    if (!this.shadowRoot.querySelector("ha-form")) {
      this.shadowRoot.innerHTML = `<style>:host{display:block}button{margin-top:12px;padding:10px}</style><ha-form></ha-form><button type="button" hidden></button>`;
      this.shadowRoot.querySelector("ha-form").addEventListener("value-changed", (event) => {
        event.stopPropagation();
        this._config = { ...this._config, ...event.detail.value };
        this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: { ...this._config } }, bubbles: true, composed: true }));
      });
      this.shadowRoot.querySelector("button").addEventListener("click", () => {
        this._loadedFor = null;
        this._loadLitters();
      });
    }
    const text = copy(this._hass);
    const options = [{ value: "", label: text.automatic }, ...this._litters.map((litter) => ({ value: litter.id, label: litter.name }))];
    if (this._config.litter_id && !options.some(({ value }) => value === this._config.litter_id)) {
      options.push({ value: this._config.litter_id, label: this._config.litter_id });
    }
    const form = this.shadowRoot.querySelector("ha-form");
    form.hass = this._hass;
    const schemaKey = JSON.stringify([text, options]);
    if (schemaKey !== this._schemaKey) {
      this._schemaKey = schemaKey;
      form.computeLabel = ({ name }) => text[name] || name;
      form.schema = [
      { name: "layout", required: true, selector: { select: { options: LAYOUTS.map((value) => ({ value, label: text[value] })) } } },
      { name: "title", selector: { text: {} } },
      { name: "litter_id", selector: { select: { options } } },
      { name: "show_litter_selector", selector: { boolean: {} } },
      ];
    }
    const data = { ...PuppyTrackerSectionStrategy.getStubConfig(), ...this._config };
    const dataKey = JSON.stringify(data);
    if (dataKey !== this._dataKey) {
      this._dataKey = dataKey;
      form.data = data;
    }
    const retry = this.shadowRoot.querySelector("button");
    retry.hidden = !this._failed;
    retry.textContent = text.retry;
  }
}

if (!customElements.get(EDITOR)) customElements.define(EDITOR, PuppyTrackerSectionEditor);
if (!customElements.get(`ll-strategy-section-${TYPE}`)) customElements.define(`ll-strategy-section-${TYPE}`, PuppyTrackerSectionStrategy);
window.customStrategies = window.customStrategies || [];
if (!window.customStrategies.some((strategy) => strategy.type === TYPE && strategy.strategyType === "section")) {
  window.customStrategies.push({ type: TYPE, strategyType: "section", name: "Puppy Tracker", description: "Daily care, growth, journal, mobile or owner/document sections." });
}
