import {
  addDossierRecord,
  escapeHtml,
  fetchLitterData,
  fetchLitters,
  languageForHass,
  loadCardState,
  saveCardState,
  selectDefaultLitter,
  subscribeUpdates,
} from "./puppy-tracker-card-common.js";

const QUICK_LOG_TRANSLATIONS = {
  en: {
    title: "Quick Log",
    subtitle: "Log a common puppy or litter event in a few taps.",
    litter: "Litter",
    logFor: "Log for",
    litterScope: "Whole litter",
    puppy: "Puppy",
    note: "Note",
    feeding: "Feeding",
    elimination: "Stool / urine",
    medication: "Medication",
    milestone: "Milestone",
    when: "When",
    details: "Details",
    notePlaceholder: "What happened?",
    feedingPlaceholder: "For example bottle, amount or feeding observation",
    eliminationPlaceholder: "For example stool, urine or hygiene observation",
    medicationPlaceholder: "Medication, dose or administration note",
    milestonePlaceholder: "What milestone was reached?",
    save: "Save log",
    cancel: "Cancel",
    loading: "Loading...",
    noLitter: "No litter available",
    invalidDateTime: "Enter a valid date and time.",
    detailsRequired: "Add a short description first.",
    saved: "Logged for {owner}.",
    saveFailed: "Quick Log could not be saved.",
    refreshFailed: "Quick Log data could not be refreshed.",
    cardDescription: "Fast litter and puppy dossier logging.",
  },
  nl: {
    title: "Snel loggen",
    subtitle: "Leg een veelvoorkomende pup- of nestgebeurtenis in een paar tikken vast.",
    litter: "Nest",
    logFor: "Log voor",
    litterScope: "Hele nest",
    puppy: "Pup",
    note: "Notitie",
    feeding: "Voeding",
    elimination: "Ontlasting / urine",
    medication: "Medicatie",
    milestone: "Mijlpaal",
    when: "Wanneer",
    details: "Details",
    notePlaceholder: "Wat is er gebeurd?",
    feedingPlaceholder: "Bijvoorbeeld fles, hoeveelheid of voedingsobservatie",
    eliminationPlaceholder: "Bijvoorbeeld ontlasting, urine of hygiëne-observatie",
    medicationPlaceholder: "Medicatie, dosering of toedieningsnotitie",
    milestonePlaceholder: "Welke mijlpaal is bereikt?",
    save: "Log opslaan",
    cancel: "Annuleren",
    loading: "Laden...",
    noLitter: "Geen nest beschikbaar",
    invalidDateTime: "Vul een geldige datum en tijd in.",
    detailsRequired: "Vul eerst een korte omschrijving in.",
    saved: "Gelogd voor {owner}.",
    saveFailed: "Quick Log kon niet worden opgeslagen.",
    refreshFailed: "Quick Log-data kon niet worden vernieuwd.",
    cardDescription: "Snel dossiernotities voor nesten en pups vastleggen.",
  },
};

const PRESETS = [
  { id: "note", recordType: "note", icon: "mdi:note-text-outline", titleKey: null },
  { id: "feeding", recordType: "feeding", icon: "mdi:baby-bottle-outline", titleKey: "feeding" },
  { id: "elimination", recordType: "note", icon: "mdi:toilet", titleKey: "elimination" },
  { id: "medication", recordType: "medication", icon: "mdi:pill", titleKey: null },
  { id: "milestone", recordType: "milestone", icon: "mdi:flag-checkered", titleKey: null },
];

function text(hass, key, replacements = {}) {
  const language = languageForHass(hass);
  const template = QUICK_LOG_TRANSLATIONS[language]?.[key]
    ?? QUICK_LOG_TRANSLATIONS.nl[key]
    ?? key;
  return Object.entries(replacements).reduce(
    (value, [name, replacement]) => value.replaceAll(`{${name}}`, String(replacement ?? "")),
    template,
  );
}

function toLocalDateTimeInput(value = null) {
  const date = value ? new Date(value) : new Date();
  if (!Number.isFinite(date.getTime())) return "";
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function toIsoTimestamp(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

class PuppyTrackerQuickLogCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass = null;
    this._config = {};
    this._litters = [];
    this._selectedLitterId = null;
    this._selectedPuppyId = null;
    this._litterData = null;
    this._draft = null;
    this._loading = false;
    this._saving = false;
    this._error = "";
    this._status = "";
    this._unsubscribe = null;
    this._subscriptionPending = false;
    this._refreshing = false;
    this._refreshAgain = false;
    this._refreshDeferred = false;
    this._state = loadCardState(this, { recentOwners: {} });
  }

  static getStubConfig() {
    return {
      title: "",
      show_litter_selector: true,
      default_selected: "litter",
    };
  }

  static getConfigForm() {
    return {
      schema: [
        { name: "title", selector: { text: {} } },
        { name: "litter_id", selector: { text: {} } },
        { name: "puppy_id", selector: { text: {} } },
        {
          name: "default_selected",
          selector: {
            select: {
              options: [
                { value: "litter", label: "Hele nest" },
                { value: "mother", label: "Moederhond" },
                { value: "puppy", label: "Pup (puppy_id)" },
              ],
              mode: "dropdown",
            },
          },
        },
        { name: "show_litter_selector", selector: { boolean: {} } },
      ],
    };
  }

  setConfig(config) {
    this._config = {
      title: "",
      show_litter_selector: true,
      default_selected: "litter",
      ...config,
    };
    this._selectedLitterId = config.litter_id || this._selectedLitterId;
    this.__motherSelected = this._config.default_selected === "mother";
    this._selectedPuppyId = this.__motherSelected ? null : (config.puppy_id || this._selectedPuppyId);
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._litters.length && !this._loading) this._loadInitial();
    else if (this.isConnected) this._subscribe();
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

  getCardSize() { return this._draft ? 5 : 3; }
  getGridOptions() { return { columns: 12, min_columns: 6 }; }

  get _puppies() {
    return (this._litterData?.puppies || []).filter((puppy) => puppy.active !== false);
  }

  get _selectedPuppy() {
    return this._puppies.find((puppy) => puppy.id === this._selectedPuppyId) || null;
  }

  get _ownerName() {
    return this._selectedPuppy?.name
      || this._litterData?.litter?.name
      || text(this._hass, "litterScope");
  }

  async _loadInitial() {
    if (!this._hass || this._loading) return;
    this._loading = true;
    this._error = "";
    try {
      const response = await fetchLitters(this._hass);
      this._litters = response?.litters || [];
      this._selectedLitterId = selectDefaultLitter(
        this._litters,
        this._selectedLitterId || this._config.litter_id,
      );
      await this._loadLitter(false);
      await this._subscribe();
    } catch (error) {
      this._error = error?.message || text(this._hass, "refreshFailed");
    } finally {
      this._loading = false;
      this._render();
    }
  }

  async _loadLitter(render = true) {
    if (!this._hass || !this._selectedLitterId) {
      this._litterData = null;
      this._selectedPuppyId = null;
      if (render) this._render();
      return;
    }

    this._litterData = await fetchLitterData(this._hass, this._selectedLitterId);
    const puppyIds = new Set(this._puppies.map((puppy) => puppy.id));
    if (this._selectedPuppyId && !puppyIds.has(this._selectedPuppyId)) {
      this._selectedPuppyId = null;
    }
    if (!this._selectedPuppyId && this._config.puppy_id && puppyIds.has(this._config.puppy_id)) {
      this._selectedPuppyId = this._config.puppy_id;
    }
    if (render) this._render();
  }

  async _subscribe() {
    if (!this._hass || this._unsubscribe || this._subscriptionPending || !this.isConnected) return;
    this._subscriptionPending = true;
    try {
      this._unsubscribe = await subscribeUpdates(this._hass, () => this._queueRefresh(), this);
    } catch (_error) {
      this._unsubscribe = null;
    } finally {
      this._subscriptionPending = false;
    }
  }

  async _queueRefresh(force = false) {
    if (!this._hass) return;
    if (!force && (this._draft || this._saving)) {
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
        const response = await fetchLitters(this._hass);
        this._litters = response?.litters || this._litters;
        this._selectedLitterId = selectDefaultLitter(
          this._litters,
          this._selectedLitterId || this._config.litter_id,
        );
        await this._loadLitter(false);
      } while (this._refreshAgain);
      this._error = "";
    } catch (error) {
      this._error = error?.message || text(this._hass, "refreshFailed");
    } finally {
      this._refreshing = false;
      this._render();
    }
  }

  async _selectLitter(litterId) {
    this._selectedLitterId = litterId;
    this._selectedPuppyId = null;
    this._draft = null;
    this._status = "";
    this._loading = true;
    this._render();
    try {
      await this._loadLitter(false);
      this._error = "";
    } catch (error) {
      this._error = error?.message || text(this._hass, "refreshFailed");
    } finally {
      this._loading = false;
      this._render();
    }
  }

  _selectOwner(value) {
    if (this._draft?.presetId) this._rememberOwner(this._draft.presetId, value);
    this._selectedPuppyId = value === "__litter__" ? null : value;
    this._draft = null;
    this._status = "";
    this._render();
  }

  _startPreset(presetId) {
    const preset = PRESETS.find((item) => item.id === presetId) || PRESETS[0];
    const remembered = this._state.recentOwners?.[preset.id];
    if (!this._draft && remembered && (remembered === "__litter__" || this._puppies.some((puppy) => puppy.id === remembered))) {
      this._selectedPuppyId = remembered === "__litter__" ? null : remembered;
    }
    this._draft = {
      presetId: preset.id,
      occurred_at: this._draft?.occurred_at || toLocalDateTimeInput(),
      note: this._draft?.note || "",
    };
    this._error = "";
    this._status = "";
    this._render();
    queueMicrotask(() => this.shadowRoot?.getElementById("quick-note")?.focus());
  }

  _rememberOwner(presetId, ownerValue) {
    if (!presetId) return;
    this._state.recentOwners = { ...(this._state.recentOwners || {}), [presetId]: ownerValue || "__litter__" };
    saveCardState(this, this._state);
  }

  _captureDraft() {
    if (!this._draft) return;
    const occurred = this.shadowRoot?.getElementById("quick-occurred");
    const note = this.shadowRoot?.getElementById("quick-note");
    this._draft.occurred_at = occurred?.value ?? this._draft.occurred_at;
    this._draft.note = note?.value ?? this._draft.note;
  }

  async _finishDraft() {
    this._draft = null;
    this._saving = false;
    this._render();
    if (this._refreshDeferred) {
      this._refreshDeferred = false;
      await this._queueRefresh(true);
    }
  }

  async _saveQuickLog() {
    if (!this._draft || !this._hass || !this._selectedLitterId || this._saving) return;
    this._captureDraft();
    const preset = PRESETS.find((item) => item.id === this._draft.presetId) || PRESETS[0];
    this._rememberOwner(preset.id, this._selectedPuppyId || "__litter__");
    const occurredAt = toIsoTimestamp(this._draft.occurred_at);
    const note = String(this._draft.note || "").trim();

    if (!occurredAt) {
      this._error = text(this._hass, "invalidDateTime");
      this._render();
      return;
    }
    if (!note) {
      this._error = text(this._hass, "detailsRequired");
      this._render();
      return;
    }

    this._saving = true;
    this._error = "";
    this._render();
    try {
      await addDossierRecord(
        this._hass,
        this._selectedLitterId,
        this._selectedPuppyId,
        {
          record_type: preset.recordType,
          occurred_at: occurredAt,
          title: preset.titleKey ? text(this._hass, preset.titleKey) : null,
          note,
          data: {},
        },
      );
      this._status = text(this._hass, "saved", { owner: this._ownerName });
      await this._finishDraft();
    } catch (error) {
      this._saving = false;
      this._error = error?.message || text(this._hass, "saveFailed");
      this._render();
    }
  }

  _render() {
    if (!this.shadowRoot) return;
    const litter = this._litterData?.litter;
    const puppies = this._puppies;
    const litterSelector = this._config.show_litter_selector !== false && this._litters.length > 1
      ? `<label class="field compact"><span>${escapeHtml(text(this._hass, "litter"))}</span><select id="litter-select">${this._litters.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === this._selectedLitterId ? "selected" : ""}>${escapeHtml(item.name || text(this._hass, "litter"))}</option>`).join("")}</select></label>`
      : "";
    const ownerOptions = [
      `<option value="__litter__" ${!this._selectedPuppyId ? "selected" : ""}>${escapeHtml(text(this._hass, "litterScope"))}</option>`,
      ...puppies.map((puppy) => `<option value="${escapeHtml(puppy.id)}" ${puppy.id === this._selectedPuppyId ? "selected" : ""}>${escapeHtml(puppy.name || text(this._hass, "puppy"))}</option>`),
    ].join("");

    const presetButtons = PRESETS.map((preset) => `
      <button class="preset ${this._draft?.presetId === preset.id ? "selected" : ""}" data-preset="${preset.id}" ${!litter || this._loading || this._saving ? "disabled" : ""}>
        <ha-icon icon="${preset.icon}"></ha-icon><span>${escapeHtml(text(this._hass, preset.id))}</span>
      </button>`).join("");

    const draft = this._draft;
    const placeholder = draft ? text(this._hass, `${draft.presetId}Placeholder`) : "";
    const editor = draft ? `
      <div class="editor">
        <label class="field"><span>${escapeHtml(text(this._hass, "when"))}</span><input id="quick-occurred" type="datetime-local" step="1" value="${escapeHtml(draft.occurred_at)}"></label>
        <label class="field details"><span>${escapeHtml(text(this._hass, "details"))}</span><textarea id="quick-note" rows="2" placeholder="${escapeHtml(placeholder)}">${escapeHtml(draft.note)}</textarea></label>
        <div class="actions">
          <button class="secondary" id="quick-cancel" ${this._saving ? "disabled" : ""}>${escapeHtml(text(this._hass, "cancel"))}</button>
          <button class="primary" id="quick-save" ${this._saving ? "disabled" : ""}><ha-icon icon="mdi:content-save-outline"></ha-icon>${escapeHtml(text(this._hass, "save"))}</button>
        </div>
      </div>` : "";

    this.shadowRoot.innerHTML = `
      <ha-card>
        <style>
          :host{display:block}*{box-sizing:border-box}ha-card{padding:15px;container-type:inline-size;container-name:quick-log-card}
          .head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.title{font-size:18px;font-weight:650}.subtitle{margin-top:3px;font-size:11px;color:var(--secondary-text-color);line-height:1.35}.context{display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;justify-content:flex-end}
          .field{display:block;margin:0;color:var(--secondary-text-color);font-size:11px}.field>span{display:block;margin:0 0 4px 2px}.field.compact select{min-width:140px}.context .field:last-child select{min-width:150px}
          select,input,textarea{width:100%;border:1px solid var(--divider-color);border-radius:10px;background:var(--card-background-color);color:var(--primary-text-color);font:inherit}select,input{height:40px;padding:0 9px}textarea{padding:9px 10px;resize:vertical;line-height:1.4}
          .presets{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:7px;margin-top:13px}.preset{min-width:0;min-height:56px;padding:7px 5px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;border:1px solid var(--divider-color);border-radius:11px;background:var(--secondary-background-color);color:var(--primary-text-color);font:inherit;cursor:pointer}.preset ha-icon{--mdc-icon-size:20px;color:var(--primary-color)}.preset span{font-size:11px;line-height:1.15;text-align:center;overflow-wrap:anywhere}.preset.selected{border-color:var(--primary-color);background:color-mix(in srgb,var(--primary-color) 10%,var(--secondary-background-color))}.preset:disabled{opacity:.5;cursor:default}
          .editor{display:grid;grid-template-columns:minmax(170px,.45fr) minmax(220px,1fr) auto;align-items:end;gap:8px;margin-top:10px;padding-top:10px;border-top:1px solid var(--divider-color)}.details textarea{min-height:64px}.actions{display:flex;gap:7px;align-items:center}.actions button{height:40px;padding:0 11px;border-radius:10px;border:1px solid var(--divider-color);font:inherit;cursor:pointer;display:inline-flex;align-items:center;gap:5px;white-space:nowrap}.primary{background:var(--primary-color);border-color:var(--primary-color)!important;color:var(--text-primary-color,#fff);font-weight:600}.secondary{background:var(--secondary-background-color);color:var(--primary-text-color)}button:disabled{opacity:.55;cursor:default}
          .message{margin-top:9px;padding:8px 10px;border-radius:9px;font-size:12px}.status{background:var(--secondary-background-color);color:var(--secondary-text-color)}.error{background:color-mix(in srgb,var(--error-color) 10%,transparent);color:var(--error-color)}.empty{padding:12px 0 2px;color:var(--secondary-text-color);font-size:12px;text-align:center}
          @container quick-log-card (max-width:720px){.head{flex-direction:column}.context{width:100%;justify-content:stretch}.context .field{flex:1}.context .field select{min-width:0;width:100%}.presets{grid-template-columns:repeat(5,minmax(66px,1fr));overflow-x:auto;padding-bottom:2px}.editor{grid-template-columns:1fr 1fr}.details{grid-column:1/-1}.actions{grid-column:1/-1;justify-content:flex-end}}
          @container quick-log-card (max-width:430px){ha-card{padding:13px}.context{display:grid;grid-template-columns:1fr}.presets{grid-template-columns:repeat(3,1fr);overflow:visible}.preset{min-height:54px}.editor{grid-template-columns:1fr}.details,.actions{grid-column:auto}.actions{display:grid;grid-template-columns:1fr 1fr}.actions button{justify-content:center}}
        </style>
        <div class="head">
          <div><div class="title">${escapeHtml(this._config.title || text(this._hass, "title"))}</div><div class="subtitle">${escapeHtml(text(this._hass, "subtitle"))}</div></div>
          <div class="context">${litterSelector}<label class="field compact"><span>${escapeHtml(text(this._hass, "logFor"))}</span><select id="owner-select" ${!litter ? "disabled" : ""}>${ownerOptions}</select></label></div>
        </div>
        ${this._loading ? `<div class="empty">${escapeHtml(text(this._hass, "loading"))}</div>` : !litter ? `<div class="empty">${escapeHtml(text(this._hass, "noLitter"))}</div>` : `<div class="presets">${presetButtons}</div>${editor}`}
        ${this._error ? `<div class="message error">${escapeHtml(this._error)}</div>` : ""}
        ${this._status ? `<div class="message status">${escapeHtml(this._status)}</div>` : ""}
      </ha-card>`;

    this.shadowRoot.getElementById("litter-select")?.addEventListener("change", (event) => this._selectLitter(event.target.value));
    this.shadowRoot.getElementById("owner-select")?.addEventListener("change", (event) => this._selectOwner(event.target.value));
    this.shadowRoot.querySelectorAll("[data-preset]").forEach((button) => button.addEventListener("click", () => {
      this._captureDraft();
      this._startPreset(button.dataset.preset);
    }));
    this.shadowRoot.getElementById("quick-occurred")?.addEventListener("input", (event) => {
      if (this._draft) this._draft.occurred_at = event.target.value;
    });
    this.shadowRoot.getElementById("quick-note")?.addEventListener("input", (event) => {
      if (this._draft) this._draft.note = event.target.value;
    });
    this.shadowRoot.getElementById("quick-cancel")?.addEventListener("click", () => this._finishDraft());
    this.shadowRoot.getElementById("quick-save")?.addEventListener("click", () => this._saveQuickLog());
  }
}

if (!customElements.get("puppy-tracker-quick-log-card")) {
  customElements.define("puppy-tracker-quick-log-card", PuppyTrackerQuickLogCard);
}

window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === "puppy-tracker-quick-log-card")) {
  const language = String(navigator.language || "nl").toLowerCase().startsWith("en") ? "en" : "nl";
  window.customCards.push({
    type: "puppy-tracker-quick-log-card",
    name: "Puppy Tracker Quick Log",
    description: QUICK_LOG_TRANSLATIONS[language].cardDescription,
    preview: true,
  });
}
