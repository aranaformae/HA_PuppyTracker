import {
  addDossierRecord,
  escapeHtml,
  fetchLitterData,
  fetchLitters,
  languageForHass,
  loadCardState,
  localize,
  requestLitterChange,
  saveCardState,
  selectDefaultLitter,
  subscribeUpdates,
} from "./puppy-tracker-card-common.js";
import {
  fieldLabel,
  fieldPlaceholder,
  inputAttributes,
  RECORD_TYPES,
  recordTypeLabel,
  requiredFieldsMessage,
  schemaText,
  TYPE_FIELDS,
} from "./puppy-tracker-dossier-schema.js";

const QUICK_LOG_TRANSLATIONS = {
  en: {
    title: "Quick Log",
    subtitle: "Log a common puppy or litter event in a few taps.",
    litter: "Litter",
    logFor: "Log for",
    litterScope: "Whole litter",
    mother: "Mother",
    puppy: "Puppy",
    note: "Note",
    feeding: "Feeding",
    elimination: "Stool / urine",
    medication: "Medication",
    milestone: "Milestone",
    temperature: "Temperature",
    when: "When",
    details: "Details",
    notePlaceholder: "What happened?",
    feedingPlaceholder: "For example bottle, amount or feeding observation",
    eliminationPlaceholder: "For example stool, urine or hygiene observation",
    medicationPlaceholder: "Medication, dose or administration note",
    milestonePlaceholder: "What milestone was reached?",
    temperaturePlaceholder: "For example 38.4",
    temperatureObservationPlaceholder: "Optional observation",
    detailsPlaceholder: "Optional additional details",
    temperatureInvalid: "Enter a temperature between 20.0 and 45.0 °C.",
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
    mother: "Moederhond",
    puppy: "Pup",
    note: "Notitie",
    feeding: "Voeding",
    elimination: "Ontlasting / urine",
    medication: "Medicatie",
    milestone: "Mijlpaal",
    temperature: "Temperatuur",
    when: "Wanneer",
    details: "Details",
    notePlaceholder: "Wat is er gebeurd?",
    feedingPlaceholder: "Bijvoorbeeld fles, hoeveelheid of voedingsobservatie",
    eliminationPlaceholder: "Bijvoorbeeld ontlasting, urine of hygiëne-observatie",
    medicationPlaceholder: "Medicatie, dosering of toedieningsnotitie",
    milestonePlaceholder: "Welke mijlpaal is bereikt?",
    temperaturePlaceholder: "Bijvoorbeeld 38,4",
    temperatureObservationPlaceholder: "Optionele observatie",
    detailsPlaceholder: "Optionele aanvullende details",
    temperatureInvalid: "Vul een temperatuur tussen 20,0 en 45,0 °C in.",
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

const QUICK_PLACEHOLDERS = {
  note: "notePlaceholder",
  feeding: "feedingPlaceholder",
  medication: "medicationPlaceholder",
  milestone: "milestonePlaceholder",
  temperature: "temperatureObservationPlaceholder",
};

const ELIMINATION_PRESET = {
  id: "elimination",
  recordType: "note",
  icon: "mdi:toilet",
  customLabelKey: "elimination",
  customTitleKey: "elimination",
  placeholderKey: "eliminationPlaceholder",
};

const PRESETS = RECORD_TYPES.flatMap(([id, labelKey, icon]) => {
  const preset = {
    id,
    recordType: id,
    icon,
    labelKey,
    titleKey: ["note", "other"].includes(id) ? null : labelKey,
    placeholderKey: QUICK_PLACEHOLDERS[id] || "detailsPlaceholder",
  };
  return id === "feeding" ? [preset, ELIMINATION_PRESET] : [preset];
});

const LITTER_OWNER = "__litter__";
const MOTHER_OWNER = "__mother__";

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

function presetLabel(hass, preset) {
  return preset.customLabelKey
    ? text(hass, preset.customLabelKey)
    : recordTypeLabel(hass, preset.recordType);
}

function presetTitle(hass, preset) {
  if (preset.customTitleKey) return text(hass, preset.customTitleKey);
  return preset.titleKey ? localize(hass, preset.titleKey) : null;
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
    this.__motherSelected = false;
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
    this._stateNamespace = "";
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
    const stateNamespace = String(this._config.state_key || "");
    if (stateNamespace !== this._stateNamespace) {
      this._stateNamespace = stateNamespace;
      this._state = loadCardState(this, { recentOwners: {} });
    }
    this._selectedLitterId = this._config.litter_id || this._selectedLitterId;
    this.__motherSelected = this._config.default_selected === "mother";
    this._selectedPuppyId = this.__motherSelected ? null : (this._config.puppy_id || this._selectedPuppyId);
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
    if (this.__motherSelected) {
      return this._litterData?.litter?.mother || text(this._hass, "mother");
    }
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
    if (this.__motherSelected && !this._litterData?.litter?.mother) {
      this.__motherSelected = false;
    }
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
    this.__motherSelected = value === MOTHER_OWNER;
    this._selectedPuppyId = value === LITTER_OWNER || value === MOTHER_OWNER ? null : value;
    this._draft = null;
    this._status = "";
    this._render();
  }

  _startPreset(presetId) {
    const preset = PRESETS.find((item) => item.id === presetId) || PRESETS[0];
    const remembered = this._state.recentOwners?.[preset.id];
    const ownerAvailable = remembered === LITTER_OWNER
      || (remembered === MOTHER_OWNER && Boolean(this._litterData?.litter?.mother))
      || this._puppies.some((puppy) => puppy.id === remembered);
    if (!this._draft && remembered && ownerAvailable) {
      this.__motherSelected = remembered === MOTHER_OWNER;
      this._selectedPuppyId = remembered === LITTER_OWNER || remembered === MOTHER_OWNER ? null : remembered;
    }
    const previousDraft = this._draft;
    this._draft = {
      presetId: preset.id,
      occurred_at: previousDraft?.occurred_at || toLocalDateTimeInput(),
      note: previousDraft?.note || "",
      dataByPreset: { ...(previousDraft?.dataByPreset || {}) },
    };
    if (!this._draft.dataByPreset[preset.id]) this._draft.dataByPreset[preset.id] = {};
    this._error = "";
    this._status = "";
    this._render();
    const firstField = (TYPE_FIELDS[preset.recordType] || [])[0];
    const focusId = firstField ? this._fieldInputId(firstField) : "quick-note";
    queueMicrotask(() => this.shadowRoot?.getElementById(focusId)?.focus({ preventScroll: true }));
  }

  _rememberOwner(presetId, ownerValue) {
    if (!presetId) return;
    this._state.recentOwners = { ...(this._state.recentOwners || {}), [presetId]: ownerValue || LITTER_OWNER };
    saveCardState(this, this._state);
  }

  _captureDraft() {
    if (!this._draft) return;
    const preset = PRESETS.find((item) => item.id === this._draft.presetId) || PRESETS[0];
    const occurred = this.shadowRoot?.getElementById("quick-occurred");
    const note = this.shadowRoot?.getElementById("quick-note");
    this._draft.occurred_at = occurred?.value ?? this._draft.occurred_at;
    this._draft.note = note?.value ?? this._draft.note;
    const data = { ...(this._draft.dataByPreset?.[preset.id] || {}) };
    for (const field of TYPE_FIELDS[preset.recordType] || []) {
      const input = this.shadowRoot?.getElementById(this._fieldInputId(field));
      if (input) data[field.key] = input.value;
    }
    this._draft.dataByPreset = { ...(this._draft.dataByPreset || {}), [preset.id]: data };
  }

  _fieldInputId(field) {
    return field.key === "temperature_c" ? "quick-temperature" : `quick-data-${field.key}`;
  }

  _currentData(preset) {
    const source = this._draft?.dataByPreset?.[preset.id] || {};
    const data = {};
    for (const field of TYPE_FIELDS[preset.recordType] || []) {
      const value = String(source[field.key] ?? "").trim();
      if (value) data[field.key] = value;
    }
    return data;
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
    const ownerValue = this.__motherSelected ? MOTHER_OWNER : (this._selectedPuppyId || LITTER_OWNER);
    this._rememberOwner(preset.id, ownerValue);
    const occurredAt = toIsoTimestamp(this._draft.occurred_at);
    const note = String(this._draft.note || "").trim();
    const data = this._currentData(preset);
    const temperature = Number(String(data.temperature_c || "").replace(",", "."));

    if (!occurredAt) {
      this._error = text(this._hass, "invalidDateTime");
      this._render();
      return;
    }
    if (preset.recordType === "temperature" && (!Number.isFinite(temperature) || temperature < 20 || temperature > 45)) {
      this._error = text(this._hass, "temperatureInvalid");
      this._render();
      return;
    }
    const validationError = requiredFieldsMessage(this._hass, preset.recordType, data);
    if (validationError) {
      this._error = validationError;
      this._render();
      return;
    }
    if (!note && !Object.keys(data).length) {
      this._error = text(this._hass, "detailsRequired");
      this._render();
      return;
    }

    const normalizedData = { ...data };
    if (preset.recordType === "temperature") normalizedData.temperature_c = temperature;

    this._saving = true;
    this._error = "";
    this._render();
    try {
      const payload = {
        record_type: preset.recordType,
        occurred_at: occurredAt,
        title: presetTitle(this._hass, preset),
        note: note || null,
        data: normalizedData,
      };
      if (this.__motherSelected) {
        await this._hass.callWS({
          type: "puppy_tracker/mother/record/add",
          litter_id: this._selectedLitterId,
          ...payload,
        });
      } else {
        await addDossierRecord(
          this._hass,
          this._selectedLitterId,
          this._selectedPuppyId,
          payload,
        );
      }
      this._status = text(this._hass, "saved", { owner: this._ownerName });
      await this._finishDraft();
    } catch (error) {
      this._saving = false;
      this._error = error?.message || text(this._hass, "saveFailed");
      this._render();
    }
  }

  _renderTypeFields(preset) {
    const fields = TYPE_FIELDS[preset.recordType] || [];
    if (!fields.length) return "";
    const data = this._draft?.dataByPreset?.[preset.id] || {};
    return `<div class="typed-grid">${fields.map((field) => {
      const id = this._fieldInputId(field);
      const value = data[field.key] ?? "";
      const placeholderValue = fieldPlaceholder(this._hass, field);
      const placeholder = placeholderValue ? ` placeholder="${escapeHtml(placeholderValue)}"` : "";
      const attributes = inputAttributes(field);
      const control = field.type === "textarea"
        ? `<textarea id="${id}" rows="3"${placeholder}>${escapeHtml(value)}</textarea>`
        : `<input id="${id}" type="${field.type || "text"}" value="${escapeHtml(value)}"${placeholder}${attributes ? ` ${attributes}` : ""}>`;
      const requirement = field.required
        ? `<span class="required">${escapeHtml(schemaText(this._hass, "required"))}</span>`
        : `<span class="optional">${escapeHtml(localize(this._hass, "optional"))}</span>`;
      return `<label class="field typed-field ${field.wide ? "wide" : ""}"><span>${escapeHtml(fieldLabel(this._hass, field))} ${requirement}</span>${control}</label>`;
    }).join("")}</div>`;
  }

  _render() {
    if (!this.shadowRoot) return;
    const litter = this._litterData?.litter;
    const puppies = this._puppies;
    const litterSelector = this._config.show_litter_selector !== false && this._litters.length > 1
      ? `<label class="field compact"><span>${escapeHtml(text(this._hass, "litter"))}</span><select id="litter-select">${this._litters.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === this._selectedLitterId ? "selected" : ""}>${escapeHtml(item.name || text(this._hass, "litter"))}</option>`).join("")}</select></label>`
      : "";
    const ownerOptions = [
      `<option value="${LITTER_OWNER}" ${!this.__motherSelected && !this._selectedPuppyId ? "selected" : ""}>${escapeHtml(text(this._hass, "litterScope"))}</option>`,
      ...(litter?.mother ? [`<option value="${MOTHER_OWNER}" ${this.__motherSelected ? "selected" : ""}>${escapeHtml(text(this._hass, "mother"))} · ${escapeHtml(litter.mother)}</option>`] : []),
      ...puppies.map((puppy) => `<option value="${escapeHtml(puppy.id)}" ${puppy.id === this._selectedPuppyId ? "selected" : ""}>${escapeHtml(puppy.name || text(this._hass, "puppy"))}</option>`),
    ].join("");

    const presetButtons = PRESETS.map((preset) => `
      <button class="preset ${this._draft?.presetId === preset.id ? "selected" : ""}" data-preset="${preset.id}" ${!litter || this._loading || this._saving ? "disabled" : ""}>
        <ha-icon icon="${preset.icon}"></ha-icon><span>${escapeHtml(presetLabel(this._hass, preset))}</span>
      </button>`).join("");

    const draft = this._draft;
    const activePreset = draft ? (PRESETS.find((item) => item.id === draft.presetId) || PRESETS[0]) : null;
    const placeholder = activePreset ? text(this._hass, activePreset.placeholderKey) : "";
    const editor = draft ? `
      <div class="editor">
        <label class="field"><span>${escapeHtml(text(this._hass, "when"))}</span><input id="quick-occurred" type="datetime-local" step="1" value="${escapeHtml(draft.occurred_at)}"></label>
        ${this._renderTypeFields(activePreset)}
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
          .presets{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:7px;margin-top:13px}.preset{min-width:0;min-height:56px;padding:7px 5px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;border:1px solid var(--divider-color);border-radius:11px;background:var(--secondary-background-color);color:var(--primary-text-color);font:inherit;cursor:pointer}.preset ha-icon{--mdc-icon-size:20px;color:var(--primary-color)}.preset span{font-size:11px;line-height:1.15;text-align:center;overflow-wrap:anywhere}.preset.selected{border-color:var(--primary-color);background:color-mix(in srgb,var(--primary-color) 10%,var(--secondary-background-color))}.preset:disabled{opacity:.5;cursor:default}
          .editor{display:grid;grid-template-columns:minmax(170px,.45fr) minmax(220px,1fr) auto;align-items:end;gap:8px;margin-top:10px;padding-top:10px;border-top:1px solid var(--divider-color)}.typed-grid{grid-column:1/-1;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.typed-field.wide{grid-column:1/-1}.optional,.required{display:inline!important;margin-left:4px;font-size:10px}.optional{color:var(--secondary-text-color)}.required{color:var(--error-color);font-weight:650}.details textarea{min-height:64px}.actions{display:flex;gap:7px;align-items:center}.actions button{height:40px;padding:0 11px;border-radius:10px;border:1px solid var(--divider-color);font:inherit;cursor:pointer;display:inline-flex;align-items:center;gap:5px;white-space:nowrap}.primary{background:var(--primary-color);border-color:var(--primary-color)!important;color:var(--text-primary-color,#fff);font-weight:600}.secondary{background:var(--secondary-background-color);color:var(--primary-text-color)}button:disabled{opacity:.55;cursor:default}
          .message{margin-top:9px;padding:8px 10px;border-radius:9px;font-size:12px}.status{background:var(--secondary-background-color);color:var(--secondary-text-color)}.error{background:color-mix(in srgb,var(--error-color) 10%,transparent);color:var(--error-color)}.empty{padding:12px 0 2px;color:var(--secondary-text-color);font-size:12px;text-align:center}
          @container quick-log-card (max-width:720px){.head{flex-direction:column}.context{width:100%;justify-content:stretch}.context .field{flex:1}.context .field select{min-width:0;width:100%}.presets{grid-template-columns:repeat(5,minmax(66px,1fr));overflow-x:auto;padding-bottom:2px}.editor{grid-template-columns:1fr 1fr}.details{grid-column:1/-1}.actions{grid-column:1/-1;justify-content:flex-end}}
          @container quick-log-card (max-width:430px){ha-card{padding:13px}.context{display:grid;grid-template-columns:1fr}.presets{grid-template-columns:repeat(3,1fr);overflow:visible}.preset{min-height:54px}.editor,.typed-grid{grid-template-columns:1fr}.typed-field.wide,.details,.actions{grid-column:auto}.actions{display:grid;grid-template-columns:1fr 1fr}.actions button{justify-content:center}}
        </style>
        <div class="head">
          <div><div class="title">${escapeHtml(this._config.title || text(this._hass, "title"))}</div><div class="subtitle">${escapeHtml(text(this._hass, "subtitle"))}</div></div>
          <div class="context">${litterSelector}<label class="field compact"><span>${escapeHtml(text(this._hass, "logFor"))}</span><select id="owner-select" ${!litter ? "disabled" : ""}>${ownerOptions}</select></label></div>
        </div>
        ${this._loading ? `<div class="empty">${escapeHtml(text(this._hass, "loading"))}</div>` : !litter ? `<div class="empty">${escapeHtml(text(this._hass, "noLitter"))}</div>` : `<div class="presets">${presetButtons}</div>${editor}`}
        ${this._error ? `<div class="message error">${escapeHtml(this._error)}</div>` : ""}
        ${this._status ? `<div class="message status">${escapeHtml(this._status)}</div>` : ""}
      </ha-card>`;

    this.shadowRoot.getElementById("litter-select")?.addEventListener("change", (event) => {
      if (requestLitterChange(this, event.target.value)) this._selectLitter(event.target.value);
    });
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
    if (activePreset) {
      for (const field of TYPE_FIELDS[activePreset.recordType] || []) {
        this.shadowRoot.getElementById(this._fieldInputId(field))?.addEventListener("input", (event) => {
          if (!this._draft) return;
          const data = { ...(this._draft.dataByPreset?.[activePreset.id] || {}), [field.key]: event.target.value };
          this._draft.dataByPreset = { ...(this._draft.dataByPreset || {}), [activePreset.id]: data };
        });
      }
    }
    this.shadowRoot.getElementById("quick-cancel")?.addEventListener("click", () => this._finishDraft());
    this.shadowRoot.getElementById("quick-save")?.addEventListener("click", () => this._saveQuickLog());
  }
}

if (!customElements.get("puppy-tracker-quick-log-card")) {
  customElements.define("puppy-tracker-quick-log-card", PuppyTrackerQuickLogCard);
}
