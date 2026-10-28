import { FormState } from "./puppy-tracker-form-state.js";
import {
  puppySelectorLabel,
  escapeHtml,
  fetchLitterData,
  fetchLitters,
  fetchRecords,
  formatDateTime,
  languageForHass,
  loadCardState,
  localize,
  requestLitterChange,
  selectDefaultLitter,
  saveCardState,
  subscribeUpdates,
  updateProfileNote,
} from "./puppy-tracker-card-common.js";
import { searchMarkup, searchText, bindSearch, syncSearchControls, syncTimelineToggle, SEARCH_STYLE } from "./puppy-tracker-dossier-search.js";
import { buildDossierHistory, filterDossierHistory, ownerActions } from "./puppy-tracker-dossier-history.js";
import { closeRecordEditor, canEditRecords, openRecordEditor, openFollowupEditor, recordContext, recordEditButton, recordFollowupButton, RECORD_ACTION_STYLE } from "./puppy-tracker-record-editor.js";
import {
  fieldLabel,
  recordTypeIcon as iconForRecordType,
  recordTypeLabel as labelForRecordType,
  schemaText,
  TYPE_FIELDS,
} from "./puppy-tracker-dossier-schema.js";

const ALL_OWNER = "__all__";
const LITTER_OWNER = "__litter__";
const MOTHER_OWNER = "__mother__";
const DOSSIER_STATE_DEFAULTS = {
  owner: ALL_OWNER,
  showDeleted: false,
  categories: null,
  motherHistoryScope: "current",
  from: "",
  to: "",
};

function dossierText(hass, nl, en) {
  return languageForHass(hass) === "en" ? en : nl;
}

function timestampValue(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function sortNewestFirst(items) {
  return [...(items || [])].sort((left, right) => {
    const occurred = timestampValue(right?.occurred_at) - timestampValue(left?.occurred_at);
    if (occurred) return occurred;
    const created = timestampValue(right?.created_at) - timestampValue(left?.created_at);
    if (created) return created;
    return String(right?.id || "").localeCompare(String(left?.id || ""));
  });
}

function decorateRecord(record, scope, name = null, puppyId = null) {
  return {
    ...(record || {}),
    __aggregate_owner_scope: scope,
    __aggregate_owner_name: name,
    __aggregate_owner_puppy_id: scope === "puppy" ? (puppyId || record?.puppy_id || null) : null,
    __aggregate_record_key: `${scope}:${String(record?.id || "")}`,
  };
}

function humanizeKey(value) {
  const text = String(value || "").replaceAll("_", " ");
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}

const INTERNAL_DATA_KEYS = new Set([
  "care_program_id",
  "care_program_revision",
  "care_occurrence_id",
  "reference_id",
  "reference_type",
  "source_id",
  "source_type",
  "followup_record_id",
  "followup_due_date",
  "recurring_reminder_id",
  "recurring_due_at",
  "recurring_scheduled_at",
  "recurring_completion",
  "scores",
]);

const CARE_DETAIL_KEYS = new Set([
  "care_age_days",
  "care_scheduled_at",
  "care_instruction",
  "care_status",
  "care_result",
  "care_score",
  "care_data",
]);

const DATA_LABEL_KEYS = {
  care_result: "careResult",
  care_score: "careScore",
  temperature: "temperature",
};

function isCareResultRecord(record) {
  return Boolean(record?.data && typeof record.data === "object" && !Array.isArray(record.data)
    && record.data.care_occurrence_id);
}

function hasDisplayValue(value) {
  return value !== null && value !== undefined && value !== "";
}

function careStatusLabel(hass, value) {
  if (value === "completed") return localize(hass, "completed");
  if (value === "missed") return localize(hass, "missed");
  return displayDataValue(value, hass);
}

function displayDataValue(value, hass = null) {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "boolean") return value ? localize(hass, "yes") : localize(hass, "no");
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch (_err) {
      return String(value);
    }
  }
  return String(value);
}

function dataLabel(hass, key) {
  if (DATA_LABEL_KEYS[key]) return localize(hass, DATA_LABEL_KEYS[key]);
  const schemaField = Object.values(TYPE_FIELDS).flat().find((field) => field.key === key);
  return schemaField ? fieldLabel(hass, schemaField) : humanizeKey(key);
}

function formatDateOnly(value, hass = null) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return displayDataValue(value, hass);
  return languageForHass(hass) === "en"
    ? `${match[2]}/${match[3]}/${match[1]}`
    : `${match[3]}-${match[2]}-${match[1]}`;
}

function dossierActionStatus(hass, action) {
  const days = Number(action?.days_until_due ?? action?.days_until);
  if (action?.status === "overdue") {
    const amount = Math.abs(days);
    return amount === 1
      ? localize(hass, "overdueOne")
      : localize(hass, "overdueMany", { days: amount });
  }
  if (action?.status === "due_today") return localize(hass, "today");
  if (action?.status === "upcoming" || Number.isFinite(days)) {
    return days === 1 ? localize(hass, "tomorrow") : localize(hass, "inDays", { days });
  }
  return localize(hass, "planned");
}

function dossierActionTone(action) {
  if (action?.status === "overdue") return "danger";
  if (action?.status === "due_today") return "warning";
  return "neutral";
}

class PuppyTrackerDossierCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass = null;
    this._config = {};
    this._litters = [];
    this._selectedLitterId = null;
    this._selectedPuppyId = null;
    this._litterData = null;
    this._recordData = null;
    this._loading = false;
    this._saving = false;
    this._error = "";
    this._status = "";
    this._showDeleted = false;
    this._unsubscribe = null;
    this._subscriptionPending = false;
    this._refreshing = false;
    this._refreshAgain = false;
    this._refreshDeferred = false;
    this._searchQuery = "";
    this._profileEditing = false;
    this._formState = new FormState(this);
    this._timelineItemsVisible = null;
    this.__allSelected = false;
    this.__motherSelected = false;
    this._stateNamespace = "";
    this._state = loadCardState(this, DOSSIER_STATE_DEFAULTS);
    this._measurements = {};
    this._detailState = new Map();
    this._profileOpen = false;
    this._filtersOpen = false;
    this._showDeleted = Boolean(this._state.showDeleted);
    this.__motherHistoryScope = this._state.motherHistoryScope === "all" ? "all" : "current";
    this.__dossierCategoryFilters = Array.isArray(this._state.categories)
      ? new Set(this._state.categories)
      : null;
  }

  static getStubConfig() {
    return {
      title: "",
      show_litter_selector: true,
      show_profile_note: true,
      show_history: true,
      show_weights: true,
      show_details: false,
      max_items: 250,
      max_height: 520,
      default_selected: "all",
    };
  }

  static getConfigForm() {
    return {
      schema: [
        { name: "title", selector: { text: {} } },
        { name: "show_litter_selector", selector: { boolean: {} } },
        { name: "show_profile_note", selector: { boolean: {} } },
        { name: "show_history", selector: { boolean: {} } },
        { name: "show_weights", selector: { boolean: {} } },
        { name: "show_details", selector: { boolean: {} } },
        { name: "max_items", selector: { number: { min: 25, max: 500, mode: "box" } } },
        { name: "max_height", selector: { number: { min: 240, max: 900, mode: "box" } } },
        {
          name: "default_selected",
          selector: {
            select: {
              options: [
                { value: "all", label: "Alles" },
                { value: "litter", label: "Hele nest" },
                { value: "mother", label: "Moederhond" },
                { value: "puppy", label: "Pup (puppy_id)" },
              ],
              mode: "dropdown",
            },
          },
        },
      ],
    };
  }

  setConfig(config) {
    const previousTimelineDefault = this._config?.show_history;
    this._config = {
      title: "",
      show_litter_selector: true,
      show_profile_note: true,
      show_history: true,
      show_weights: true,
      show_details: false,
      max_items: 250,
      max_height: 520,
      default_selected: "all",
      ...config,
    };
    this._config.max_items = Math.max(25, Math.min(500, Number(config.max_items) || 250));
    this._config.max_height = Math.max(240, Math.min(900, Number(config.max_height) || 520));
    this._restoreConfiguredState();
    if (this._timelineItemsVisible === null || previousTimelineDefault !== this._config.show_history) {
      this._timelineItemsVisible = this._config.show_history !== false;
    }
    this._selectedLitterId = config.litter_id || this._selectedLitterId;
    const configuredScope = config.default_selected;
    const storedScope = this._state.owner === ALL_OWNER
      ? "all"
      : this._state.owner === MOTHER_OWNER
        ? "mother"
        : this._state.owner && this._state.owner !== LITTER_OWNER
          ? "puppy"
          : "litter";
    const scope = ["all", "litter", "mother", "puppy"].includes(configuredScope)
      ? configuredScope
      : storedScope;
    this.__allSelected = !config.puppy_id && scope === "all";
    this.__motherSelected = !config.puppy_id && scope === "mother";
    this._selectedPuppyId = config.puppy_id || (scope === "puppy" ? this._state.owner : null);
    this._render();
  }

  _restoreConfiguredState() {
    const namespace = String(this._config.state_key || "");
    if (namespace === this._stateNamespace) return;
    this._stateNamespace = namespace;
    this._state = loadCardState(this, DOSSIER_STATE_DEFAULTS);
    this._showDeleted = Boolean(this._state.showDeleted);
    this.__motherHistoryScope = this._state.motherHistoryScope === "all" ? "all" : "current";
    this.__dossierCategoryFilters = Array.isArray(this._state.categories)
      ? new Set(this._state.categories)
      : null;
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
    if (!this._litters.length && !this._loading) this._loadInitial();
    else this._subscribe();
  }

  disconnectedCallback() {
    closeRecordEditor(this);
    if (this._unsubscribe) Promise.resolve(this._unsubscribe()).catch(() => undefined);
    this._unsubscribe = null;
  }

  getCardSize() { return 8; }
  getGridOptions() { return { columns: 12, min_columns: 6 }; }

  get _canManage() {
    return canEditRecords(this) && Boolean(this._recordData) && this._recordData.can_manage_records !== false;
  }

  get _canAddRecord() {
    return this._canManage && !this._loading && !this._missingOwner;
  }

  get _selectedPuppy() {
    return (this._litterData?.puppies || []).find((item) => item.id === this._selectedPuppyId) || null;
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
        this._selectedLitterId || this._config.litter_id
      );
      await this._loadLitterAndRecords(false);
      await this._subscribe();
    } catch (err) {
      this._error = err?.message || localize(this._hass, "dossierLoadFailed");
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

  _editingActive() {
    return Boolean(this._profileEditing || this._saving);
  }

  async _queueRefresh(force = false) {
    if (!this._hass) return;
    if (!force && this._editingActive()) {
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
          this._selectedLitterId || this._config.litter_id
        );
        await this._loadLitterAndRecords(false);
      } while (this._refreshAgain);
      this._error = "";
    } catch (err) {
      this._error = err?.message || localize(this._hass, "dossierRefreshFailed");
    } finally {
      this._refreshing = false;
      this._render();
    }
  }

  async _loadLitterAndRecords(render = true) {
    const litterId = this._selectedLitterId;
    const generation = this._loadGeneration = (this._loadGeneration || 0) + 1;
    const puppyId = this._selectedPuppyId;
    const all = this.__allSelected;
    const mother = this.__motherSelected;
    const historyScope = this.__motherHistoryScope;
    if (!this._hass || !litterId) {
      this._litterData = null; this._recordData = null;
      if (render) this._render();
      return;
    }
    try {
      const litterData = await fetchLitterData(this._hass, litterId);
      const puppies = litterData?.puppies || [];
      if (generation !== this._loadGeneration) return;
      if ((puppyId && !puppies.some((puppy) => puppy.id === puppyId)) || (mother && !litterData?.litter?.mother)) {
        this._litterData = litterData; this._recordData = null; this._measurements = {}; this._missingOwner = true;
        throw new Error(dossierText(this._hass, "Deze eigenaar is niet meer beschikbaar. Kies een eigenaar.", "This owner is no longer available. Choose an owner."));
      }
      const includeDeleted = this._showDeleted && this._hass.user?.is_admin !== false && Boolean(litterData?.can_manage_records);
      const fetchMother = (scope) => litterData?.litter?.mother ? this._hass.callWS({
        type: "puppy_tracker/mother/records", litter_id: litterId, history_scope: scope, include_deleted: Boolean(includeDeleted),
      }) : null;
      let recordData;
      if (all) {
        const [litterRecords, motherRecords, ...puppyResponses] = await Promise.all([
          fetchRecords(this._hass, litterId, null, includeDeleted), fetchMother("current"),
          ...puppies.map((puppy) => fetchRecords(this._hass, litterId, puppy.id, includeDeleted)),
        ]);
        recordData = { records: sortNewestFirst([
          ...(litterRecords?.records || []).map((record) => decorateRecord(record, "litter", litterData.litter.name)),
          ...(motherRecords?.records || []).map((record) => decorateRecord(record, "mother", motherRecords?.owner?.name || litterData.litter.mother)),
          ...puppyResponses.flatMap((response, index) => (response?.records || []).map((record) => decorateRecord(record, "puppy", puppySelectorLabel(puppies[index]), puppies[index].id))),
        ]), actions: { actions: [
          ...ownerActions(litterRecords, "litter", null, litterData.litter.name),
          ...ownerActions(motherRecords, "mother", null, motherRecords?.owner?.name || litterData.litter.mother),
          ...puppyResponses.flatMap((response, index) => ownerActions(response, "puppy", puppies[index].id, puppySelectorLabel(puppies[index]))),
        ] }, can_manage_records: Boolean(litterData.can_manage_records && litterRecords?.can_manage_records !== false
          && motherRecords?.can_manage_records !== false && puppyResponses.every((response) => response?.can_manage_records !== false)) };
      } else {
        recordData = mother ? await fetchMother(historyScope) : await fetchRecords(this._hass, litterId, puppyId, includeDeleted);
        if (recordData) recordData = { ...recordData, actions: { actions: ownerActions(recordData, mother ? "mother" : puppyId ? "puppy" : "litter", puppyId) } };
      }
      const measurements = {};
      const weightPuppies = mother || this._config.show_weights === false ? [] : all ? puppies : puppies.filter((puppy) => puppy.id === puppyId);
      if (includeDeleted && litterData.can_manage_measurements) await Promise.all(weightPuppies.map(async (puppy) => {
        const result = await this._hass.callWS({ type: "puppy_tracker/measurements", litter_id: litterId, puppy_id: puppy.id });
        measurements[puppy.id] = result.measurements || [];
      }));
      if (generation !== this._loadGeneration) return;
      this._litterData = litterData;
      this._missingOwner = false;
      this._recordData = recordData;
      this._measurements = measurements;
      if (!recordData?.can_manage_records) this._showDeleted = false;
      if (render) this._render();
    } catch (error) {
      if (generation === this._loadGeneration) throw error;
    }
  }

  async _selectLitter(litterId) {
    this._selectedLitterId = litterId;
    this._selectedPuppyId = null;
    this._missingOwner = false;
    this._recordData = null;
    this._litterData = null;
    this._detailState.clear();
    this._persistState();
    this._profileEditing = false;
    this._status = "";
    this._loading = true;
    this._render();
    try {
      await this._loadLitterAndRecords(false);
      this._error = "";
    } catch (err) {
      this._error = err?.message || localize(this._hass, "litterDossierLoadFailed");
    } finally {
      this._loading = false;
      this._render();
    }
  }

  async _selectOwner(value) {
    if (!this._formState.discard()) {
      this.shadowRoot.getElementById("owner-select").value = this.__allSelected ? ALL_OWNER : this.__motherSelected ? MOTHER_OWNER : this._selectedPuppyId || LITTER_OWNER;
      return;
    }
    this.__allSelected = value === ALL_OWNER;
    this._missingOwner = false;
    this._recordData = null;
    this.__motherSelected = value === MOTHER_OWNER;
    this._selectedPuppyId = [ALL_OWNER, LITTER_OWNER, MOTHER_OWNER].includes(value) ? null : value;
    this._persistState();
    this._profileEditing = false;
    this._status = "";
    this._loading = true;
    this._render();
    try {
      await this._loadLitterAndRecords(false);
      this._error = "";
    } catch (err) {
      this._error = err?.message || localize(this._hass, "dossierLoadFailed");
    } finally {
      this._loading = false;
      this._render();
    }
  }

  _startAdd() {
    if (!this._canAddRecord) return;
    const context = recordContext(this, { scope: this.__motherSelected ? "mother" : this._selectedPuppyId ? "puppy" : "litter" });
    delete context.recordId;
    return openRecordEditor(this, context, { chooseOwner: this.__allSelected, trigger: this.shadowRoot.getElementById("add-record") });
  }

  _startEdit(record, trigger) {
    return openRecordEditor(this, { ...recordContext(this, record), measurementId: record.measurement_id }, { trigger });
  }

  _renderCareResultRows(record) {
    if (!isCareResultRecord(record)) return [];
    const data = record.data;
    const rows = [];
    const addRow = (label, value, className = "") => {
      if (!hasDisplayValue(value)) return;
      rows.push(`<div class="record-data-row ${className}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(displayDataValue(value, this._hass))}</strong></div>`);
    };

    addRow(localize(this._hass, "careAgeDay"), data.care_age_days);
    if (hasDisplayValue(data.care_scheduled_at)) {
      addRow(localize(this._hass, "careScheduledAt"), formatDateTime(data.care_scheduled_at, data.care_scheduled_at, this._hass));
    }
    if (hasDisplayValue(data.care_status)) addRow(localize(this._hass, "careStatus"), careStatusLabel(this._hass, data.care_status));
    addRow(localize(this._hass, "careResult"), data.care_result);
    addRow(localize(this._hass, "careScore"), data.care_score);
    if (hasDisplayValue(data.care_instruction)) {
      addRow(localize(this._hass, "careInstruction"), data.care_instruction, "care-instruction-row");
    }

    if (data.care_data && typeof data.care_data === "object" && !Array.isArray(data.care_data)) {
      for (const [key, value] of Object.entries(data.care_data)) {
        if (hasDisplayValue(value)) addRow(`${localize(this._hass, "careAdditionalData")} · ${dataLabel(this._hass, key)}`, value);
      }
    }
    return rows;
  }

  _renderRecordData(record) {
    if (record.measurement_id) return `<div class="record-data"><div class="record-data-row"><span>${escapeHtml(dossierText(this._hass, "Gewicht", "Weight"))}</span><strong>${escapeHtml(record.data.weight)} g</strong></div>${record.data.correction_reason ? `<div class="record-data-row"><span>${escapeHtml(dossierText(this._hass, "Reden voor correctie", "Correction reason"))}</span><strong>${escapeHtml(record.data.correction_reason)}</strong></div>` : ""}</div>`;
    const data = record?.data;
    if (!data || typeof data !== "object" || Array.isArray(data)) return "";

    const schema = TYPE_FIELDS[record.type] || [];
    const rows = [];
    const renderedKeys = new Set();

    if (record.type === "behavior_observation" && data.scores && typeof data.scores === "object") {
      const scores = Object.values(data.scores).map(Number).filter((value) => Number.isInteger(value) && value >= 1 && value <= 5);
      if (scores.length) {
        const average = scores.reduce((sum, value) => sum + value, 0) / scores.length;
        const locale = languageForHass(this._hass) === "en" ? "en-US" : "nl-NL";
        const label = dossierText(this._hass, "Gemiddelde zichtbaarheid", "Average visibility");
        rows.push(`<div class="record-data-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(average.toLocaleString(locale, { maximumFractionDigits: 2 }))}/5 · ${scores.length} ${escapeHtml(dossierText(this._hass, "criteria", "criteria"))}</strong></div>`);
      }
    }

    for (const field of schema) {
      const raw = data[field.key];
      if (raw === null || raw === undefined || raw === "") continue;
      renderedKeys.add(field.key);
      const value = field.type === "date" ? formatDateOnly(raw, this._hass) : displayDataValue(raw, this._hass);
      rows.push(`<div class="record-data-row"><span>${escapeHtml(fieldLabel(this._hass, field))}</span><strong>${escapeHtml(value)}</strong></div>`);
    }

    rows.push(...this._renderCareResultRows(record));

    for (const [key, raw] of Object.entries(data)) {
      if (
        renderedKeys.has(key)
        || INTERNAL_DATA_KEYS.has(key)
        || CARE_DETAIL_KEYS.has(key)
        || raw === null
        || raw === undefined
        || raw === ""
      ) continue;
      rows.push(`<div class="record-data-row"><span>${escapeHtml(dataLabel(this._hass, key))}</span><strong>${escapeHtml(displayDataValue(raw, this._hass))}</strong></div>`);
    }

    return rows.length ? `<div class="record-data">${rows.join("")}</div>` : "";
  }

  _selectedCategoryFilters(availableTypes) {
    if (!(this.__dossierCategoryFilters instanceof Set)) return new Set(availableTypes);
    return new Set([...this.__dossierCategoryFilters].filter((type) => availableTypes.includes(type)));
  }

  _renderCategoryFilters(availableTypes, selectedTypes) {
    if (!availableTypes.length) return "";
    const allSelected = availableTypes.length > 0 && availableTypes.every((type) => selectedTypes.has(type));
    const allLabel = localize(this._hass, "all") || "Alles";
    const groupLabel = dossierText(this._hass, "Dossiercategorieen", "Dossier categories");
    const chips = [
      `<button type="button" class="category-filter ${allSelected ? "active" : ""}" data-dossier-category="__all__" aria-pressed="${allSelected ? "true" : "false"}">${escapeHtml(allLabel)}</button>`,
      ...availableTypes.map((type) => {
        const active = selectedTypes.has(type);
        return `<button type="button" class="category-filter ${active ? "active" : ""}" data-dossier-category="${escapeHtml(type)}" aria-pressed="${active ? "true" : "false"}"><ha-icon icon="${escapeHtml(iconForRecordType(type))}"></ha-icon>${escapeHtml(labelForRecordType(this._hass, type))}</button>`;
      }),
    ].join("");
    return `<div class="category-filters" role="group" aria-label="${escapeHtml(groupLabel)}">${chips}</div>`;
  }

  _toggleCategoryFilter(type, availableTypes) {
    const current = this._selectedCategoryFilters(availableTypes);
    if (type === "__all__") {
      const allSelected = availableTypes.length > 0 && availableTypes.every((item) => current.has(item));
      this.__dossierCategoryFilters = allSelected ? new Set() : new Set(availableTypes);
    } else {
      if (current.has(type)) current.delete(type);
      else current.add(type);
      this.__dossierCategoryFilters = current;
    }
    this._persistState();
    this._render();
  }

  _clearCategoryFilters() {
    this.__dossierCategoryFilters = null;
    this._persistState();
    this._render();
  }

  _persistState() {
    this._state = {
      ...this._state,
      owner: this.__allSelected
        ? ALL_OWNER
        : this.__motherSelected
          ? MOTHER_OWNER
          : (this._selectedPuppyId || LITTER_OWNER),
      showDeleted: this._showDeleted,
      categories: this.__dossierCategoryFilters ? [...this.__dossierCategoryFilters] : null,
      motherHistoryScope: this.__motherHistoryScope,
    };
    saveCardState(this, this._state);
  }

  _deleteRecord(record, trigger) {
    return openRecordEditor(this, recordContext(this, record), { mode: "delete", trigger });
  }

  _changeOwner(record, trigger) {
    return openRecordEditor(this, recordContext(this, record), { mode: "move", trigger });
  }

  _restoreRecord(record, trigger) {
    return openRecordEditor(this, recordContext(this, record), { mode: "restore", trigger });
  }

  _startProfileEdit() {
    this._profileOpen = true;
    if ((!this._selectedPuppy && !this.__motherSelected) || !this._canManage) return;
    this._profileEditing = true;
    this._status = "";
    this._render();
    queueMicrotask(() => this.shadowRoot?.getElementById("profile-note")?.focus({ preventScroll: true }));
  }

  async _saveProfileNote() {
    if ((!this._selectedPuppy && !this.__motherSelected) || !this._canManage || this._saving) return;
    const input = this.shadowRoot?.getElementById("profile-note");
    const profileNote = input?.value?.trim() || null;
    this._saving = true;
    this._status = localize(this._hass, "profileNoteSave");
    this._error = "";
    this._render();
    try {
      if (this.__motherSelected) {
        await this._hass.callWS({
          type: "puppy_tracker/mother/profile_note/update",
          litter_id: this._selectedLitterId,
          profile_note: profileNote,
        });
      } else {
        await updateProfileNote(
          this._hass,
          this._selectedLitterId,
          this._selectedPuppyId,
          profileNote,
        );
      }
      this._profileEditing = false;
      this._formState.reset();
      this._status = localize(this._hass, "profileNoteSaved");
      this._saving = false;
      await this._loadLitterAndRecords(false);
    } catch (err) {
      this._saving = false;
      this._error = err?.message || localize(this._hass, "profileNoteCouldNotSave");
    }
    this._render();
  }

  _renderProfileNote() {
    if (this._config.show_profile_note === false || this.__allSelected || (!this._selectedPuppy && !this.__motherSelected)) return "";
    const mother = this.__motherSelected;
    const note = mother ? (this._recordData?.owner?.profile_note || "") : (this._selectedPuppy?.profile_note || "");
    const title = mother
      ? dossierText(this._hass, "Moederprofiel", "Mother profile")
      : localize(this._hass, "profileNote");
    const editLabel = mother
      ? dossierText(this._hass, "Moederprofiel bewerken", "Edit mother profile")
      : localize(this._hass, "editProfileNote");
    const emptyText = mother
      ? dossierText(this._hass, "Nog geen profielnotitie.", "No profile note yet.")
      : localize(this._hass, "noProfileNote");
    if (this._profileEditing) {
      return `
        <details class="panel profile-panel" open><summary>${escapeHtml(title)}</summary>
          <textarea id="profile-note" rows="4" placeholder="${escapeHtml(localize(this._hass, "profileNotePlaceholder"))}">${escapeHtml(note)}</textarea>
          <div class="form-actions">
            <button class="secondary" id="profile-cancel" ${this._saving ? "disabled" : ""}>${escapeHtml(localize(this._hass, "cancel"))}</button>
            <button class="primary" id="profile-save" ${this._saving ? "disabled" : ""}>${escapeHtml(localize(this._hass, "save"))}</button>
          </div>
        </details>`;
    }
    return `
      <details class="panel profile-panel" ${this._profileOpen ? "open" : ""}><summary>${escapeHtml(title)}</summary>
        <div class="panel-head">
          ${this._canManage ? `<button class="icon-button" id="profile-edit" title="${escapeHtml(editLabel)}" aria-label="${escapeHtml(editLabel)}"><ha-icon icon="mdi:pencil"></ha-icon></button>` : ""}
        </div>
        ${note ? `<div class="profile-text">${escapeHtml(note)}</div>` : `<div class="empty compact">${escapeHtml(emptyText)}${this._canManage ? escapeHtml(localize(this._hass, "noProfileNoteCanAdd")) : ""}</div>`}
      </details>`;
  }

  _renderUpcomingActions() {
    if (this._loading) return "";
    const actions = this._recordData?.actions?.actions || [];
    if (!actions.length) return "";
    const overdueCount = actions.filter((action) => action?.status === "overdue").length;
    const dueTodayCount = actions.filter((action) => action?.status === "due_today").length;
    const upcomingCount = actions.filter((action) => action?.status === "upcoming").length;

    return `
      <section class="panel followup-panel">
        <div class="panel-head">
          <div class="panel-title">${escapeHtml(dossierText(this._hass, "Nog te doen", "To do"))}</div>
          <span class="followup-count">${actions.length}</span>
        </div>
        <div class="followup-summary">
          <span class="summary-chip danger">${overdueCount} ${escapeHtml(schemaText(this._hass, "overdueSummary"))}</span>
          <span class="summary-chip warning">${dueTodayCount} ${escapeHtml(schemaText(this._hass, "dueTodaySummary"))}</span>
          <span class="summary-chip">${upcomingCount} ${escapeHtml(schemaText(this._hass, "upcomingSummary"))}</span>
        </div>
        <div class="followup-list">
          ${actions.map((action) => {
            const title = labelForRecordType(this._hass, action.type || action.record_type);
            return `
            <div class="followup-row ${dossierActionTone(action)}">
              <div class="followup-icon"><ha-icon icon="${escapeHtml(action.icon || "mdi:calendar-clock")}"></ha-icon></div>
              <div class="followup-main">
                <strong>${escapeHtml(title)}</strong>
                ${this.__allSelected ? `<span class="followup-owner">${escapeHtml(this._ownerLabel(action.scope, action.owner_name))}</span>` : ""}
                ${action.description ? `<span>${escapeHtml(action.description)}</span>` : ""}
              </div>
              <div class="followup-date"><strong>${escapeHtml(formatDateOnly(action.due_date || action.due_at, this._hass))}</strong><span>${escapeHtml(dossierActionStatus(this._hass, action))}</span>${action.source_record_id || action.record_id ? recordFollowupButton(this, action.id, action) : ""}</div>
            </div>`;
          }).join("")}
        </div>
      </section>`;
  }

  _historyPuppies() {
    if (this._config.show_weights === false || this.__motherSelected) return [];
    return this.__allSelected ? this._litterData?.puppies || [] : this._selectedPuppy ? [this._selectedPuppy] : [];
  }

  _historyItems() {
    return buildDossierHistory((this._recordData?.records || []).filter((item) => !item.deleted || this._showDeleted && this._canManage),
      this._historyPuppies(), { includeHistory: this._showDeleted && this._canManage, measurements: this._measurements });
  }

  _filteredHistory(records = this._historyItems()) {
    return filterDossierHistory(records, { types: this._selectedCategoryFilters([...new Set(records.map((item) => item.type || "other"))]),
      query: this._searchQuery, from: this._state.from, to: this._state.to });
  }

  _captureView() {
    this.shadowRoot.querySelectorAll("[data-detail-key]").forEach((node) => this._detailState.set(node.dataset.detailKey, node.open));
    const profile = this.shadowRoot.querySelector(".profile-panel");
    if (profile) this._profileOpen = profile.open;
    const filters = this.shadowRoot.querySelector(".history-filters");
    if (filters) this._filtersOpen = filters.open;
  }

  _renderRecord(record) {
    const deleted = Boolean(record.deleted);
    const measurement = Boolean(record.measurement_id);
    const inactive = deleted || record.status === "superseded";
    const title = record.title || (measurement && record.data.kind === "birth"
      ? dossierText(this._hass, "Geboortegewicht", "Birth weight") : labelForRecordType(this._hass, record.type));
    const recordKey = record.__aggregate_record_key || record.id;
    const detailKey = `${this._selectedLitterId}:${recordKey}`;
    const open = this._detailState.get(detailKey) ?? this._config.show_details === true;
    const ownerBadge = this.__allSelected
      ? `<span class="type-badge aggregate-owner-badge">${escapeHtml(this._ownerLabel(record.__aggregate_owner_scope, record.__aggregate_owner_name))}</span>` : "";
    const litterBadge = this.__motherSelected && this.__motherHistoryScope === "all" && record.litter_name
      ? `<span class="type-badge mother-litter-badge">${escapeHtml(record.litter_name)}</span>` : "";
    const summaryKeys = measurement ? ["weight"] : ["temperature_c", "care_result", "test_result", "result", "product", "vaccine", "medication", "feeding_type", "amount", "dose"];
    const summary = summaryKeys.filter((key) => hasDisplayValue(record.data?.[key])).slice(0, 3)
      .map((key) => `${["weight", "temperature_c"].includes(key) ? "" : `${dataLabel(this._hass, key)}: `}${displayDataValue(record.data[key], this._hass)}${key === "weight" ? " g" : key === "temperature_c" ? " °C" : key === "amount" && record.data.unit ? ` ${record.data.unit}` : ""}`).join(" · ");
    const details = this._renderRecordData(record);
    const actions = measurement
      ? recordEditButton(this, recordKey, { measurement: true, deleted: inactive })
      : !this._canManage ? "" : deleted
        ? `<button class="text-button restore-record" data-id="${escapeHtml(record.id)}" data-record-key="${escapeHtml(recordKey)}"><ha-icon icon="mdi:restore"></ha-icon>${escapeHtml(localize(this._hass, "restore"))}</button>`
        : `${recordEditButton(this, recordKey)}<details class="record-menu"><summary title="${escapeHtml(dossierText(this._hass, "Meer acties", "More actions"))}" aria-label="${escapeHtml(dossierText(this._hass, "Meer acties", "More actions"))}"><ha-icon icon="mdi:dots-vertical"></ha-icon></summary><div><button class="text-button move-record" data-record-key="${escapeHtml(recordKey)}"><ha-icon icon="mdi:account-switch-outline"></ha-icon>${escapeHtml(localize(this._hass, "changeOwner"))}</button><button class="text-button danger delete-record" data-record-key="${escapeHtml(recordKey)}"><ha-icon icon="mdi:delete-outline"></ha-icon>${escapeHtml(localize(this._hass, "delete"))}</button></div></details>`;
    return `<article class="record ${inactive ? "deleted" : ""}" data-record-key="${escapeHtml(recordKey)}" data-event-type="${escapeHtml(record.type)}">
      <div class="record-icon"><ha-icon icon="${escapeHtml(iconForRecordType(record.type))}"></ha-icon></div>
      <div class="record-body"><div class="record-top"><div class="record-heading"><strong>${escapeHtml(title)}</strong>
      <span class="type-badge">${escapeHtml(labelForRecordType(this._hass, record.type))}</span>${ownerBadge}${litterBadge}
      ${inactive ? `<span class="deleted-badge">${escapeHtml(record.status === "superseded" ? dossierText(this._hass, "Gecorrigeerd", "Corrected") : localize(this._hass, "removed"))}</span>` : ""}
      </div><div class="record-actions">${actions}</div></div><time>${escapeHtml(formatDateTime(record.occurred_at, "", this._hass))}</time>
      ${summary ? `<div class="record-summary" ${open ? "hidden" : ""}>${escapeHtml(summary)}</div>` : ""}
      ${details || record.note ? `<details class="record-details" data-detail-key="${escapeHtml(detailKey)}" ${open ? "open" : ""}><summary>${escapeHtml(dossierText(this._hass, "Details", "Details"))}</summary>${details}${record.note ? `<div class="record-note">${escapeHtml(record.note)}</div>` : ""}</details>` : ""}</div></article>`;
  }

  _ownerLabel(scope, name = null) {
    if (scope === "mother") {
      return `${localize(this._hass, "mother")} · ${name || localize(this._hass, "mother")}`;
    }
    if (scope === "puppy") {
      return `${localize(this._hass, "puppy")} · ${name || localize(this._hass, "puppy")}`;
    }
    return dossierText(this._hass, "Hele nest", "Whole litter");
  }

  _searchResultsMarkup(records, visibleRecords, ownerName) {
    if (this._loading) return `<div class="empty">${escapeHtml(localize(this._hass, "loading"))}</div>`;
    if (visibleRecords.length) {
      const limit = this._historyLimit || Number(this._config.max_items) || 250;
      return `<div class="timeline">${visibleRecords.slice(0, limit).map((record) => this._renderRecord(record)).join("")}</div>${visibleRecords.length > limit ? `<button type="button" id="show-more-history">${escapeHtml(dossierText(this._hass, `Meer tonen (${visibleRecords.length - limit})`, `Show more (${visibleRecords.length - limit})`))}</button>` : ""}`;
    }
    if (!records.length) return `<div class="empty">${escapeHtml(localize(this._hass, "noDossierItems", { owner: ownerName }))}${this._canAddRecord ? escapeHtml(localize(this._hass, "noDossierItemsCanAdd")) : ""}</div>`;
    if (this._searchQuery?.trim() || this._state.from || this._state.to) return `<div class="empty">${escapeHtml(searchText(this._hass, "none"))}<button type="button" class="text-button" id="reset-history-filters">${escapeHtml(localize(this._hass, "clearFilters"))}</button></div>`;
    return `<div class="empty"><div>${escapeHtml(localize(this._hass, "noDossierItemsInCategories"))}</div><button type="button" class="text-button" id="clear-category-filters">${escapeHtml(localize(this._hass, "clearFilters"))}</button></div>`;
  }

  _updateSearchResults() {
    this._captureView();
    const records = this._historyItems();
    const types = [...new Set(records.map((item) => item.type || "other"))];
    const selected = this._selectedCategoryFilters(types);
    const visible = this._filteredHistory(records);
    const list = this.shadowRoot.querySelector(".dossier-timeline-scroll");
    const scrollTop = list.scrollTop;
    list.innerHTML = this._searchResultsMarkup(records, visible, this._searchOwnerName);
    list.scrollTop = scrollTop;
    syncSearchControls(this.shadowRoot, this._hass, this._searchQuery, visible.length);
    this.shadowRoot.querySelectorAll("[data-dossier-category]").forEach((button) => {
      const active = button.dataset.dossierCategory === "__all__" ? types.every((type) => selected.has(type)) : selected.has(button.dataset.dossierCategory);
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    syncTimelineToggle(this.shadowRoot, this._timelineItemsVisible, ".timeline-items-content", this._timelineItemsVisible
      ? dossierText(this._hass, "Historie inklappen", "Collapse history")
      : dossierText(this._hass, `Historie tonen (${visible.length})`, `Show history (${visible.length})`));
  }

  _render() {
    if (!this.shadowRoot) return;
    this._captureView();
    const oldScroll = this.shadowRoot.querySelector(".dossier-timeline-scroll")?.scrollTop || 0;
    if (this.shadowRoot.activeElement?.id === "record-search") {
      this._updateSearchResults();
      return;
    }
    const litter = this._litterData?.litter;
    const puppies = this._litterData?.puppies || [];
    const records = this._historyItems();
    const activeRecordCount = records.filter((item) => !item.deleted && (!item.status || item.status === "active")).length;
    const availableCategoryTypes = [...new Set(records.map((record) => record?.type || "other"))].sort((a, b) =>
      labelForRecordType(this._hass, a).localeCompare(labelForRecordType(this._hass, b))
    );
    const selectedCategoryTypes = this._selectedCategoryFilters(availableCategoryTypes);
    const visibleRecords = this._filteredHistory(records);
    const ownerName = this.__allSelected
      ? dossierText(this._hass, "Alles", "All")
      : this.__motherSelected
        ? (this._recordData?.owner?.name || litter?.mother || localize(this._hass, "mother"))
        : (this._selectedPuppy ? puppySelectorLabel(this._selectedPuppy) : litter?.name || localize(this._hass, "litter"));
    const activeRecordLabel = activeRecordCount === 1
      ? localize(this._hass, "activeEntry")
      : localize(this._hass, "activeEntries");
    this._searchOwnerName = ownerName;
    const litterSelector = this._config.show_litter_selector !== false && this._litters.length > 1
      ? `<select id="litter-select" aria-label="${escapeHtml(localize(this._hass, "chooseLitter"))}">${this._litters.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === this._selectedLitterId ? "selected" : ""}>${escapeHtml(item.name || localize(this._hass, "litter"))}</option>`).join("")}</select>`
      : "";
    const ownerOptions = [
      ...(this._missingOwner ? [`<option disabled selected value="${escapeHtml(this.__motherSelected ? MOTHER_OWNER : this._selectedPuppyId)}">${escapeHtml(dossierText(this._hass, "Niet meer beschikbaar", "No longer available"))}</option>`] : []),
      `<option value="${ALL_OWNER}" ${this.__allSelected ? "selected" : ""}>${escapeHtml(dossierText(this._hass, "Alles (nest + moeder + pups)", "All (litter + mother + puppies)"))}</option>`,
      `<option value="${LITTER_OWNER}" ${!this.__allSelected && !this.__motherSelected && !this._selectedPuppyId ? "selected" : ""}>${escapeHtml(localize(this._hass, "litterDossier"))}</option>`,
      ...(litter?.mother ? [`<option value="${MOTHER_OWNER}" ${this.__motherSelected ? "selected" : ""}>${escapeHtml(localize(this._hass, "mother"))} · ${escapeHtml(litter.mother)}</option>`] : []),
      ...puppies.map((puppy) => `<option value="${escapeHtml(puppy.id)}" ${puppy.id === this._selectedPuppyId ? "selected" : ""}>${escapeHtml(puppySelectorLabel(puppy, localize(this._hass, "puppy")))}</option>`),
    ].join("");
    const motherHistorySelector = this.__motherSelected
      ? `<select id="mother-history-scope" aria-label="${escapeHtml(dossierText(this._hass, "Moederhistorie filter", "Mother history filter"))}"><option value="current" ${this.__motherHistoryScope === "current" ? "selected" : ""}>${escapeHtml(dossierText(this._hass, "Huidig nest", "Current litter"))}</option><option value="all" ${this.__motherHistoryScope === "all" ? "selected" : ""}>${escapeHtml(dossierText(this._hass, "Alle nesten", "All litters"))}</option></select>`
      : "";
    const subtitle = this.__motherSelected
      ? `${dossierText(this._hass, "Moederdossier", "Mother dossier")}: ${ownerName}`
      : (litter?.name || (this._loading ? localize(this._hass, "loading") : localize(this._hass, "noLitter")));

    const markup = `
      <ha-card style="--dossier-history-height:${Math.max(240, Math.min(900, Number(this._config.max_height) || 520))}px">
        <style>
          ${SEARCH_STYLE}
          ${RECORD_ACTION_STYLE}
          :host{display:block}*{box-sizing:border-box}ha-card{padding:16px;overflow:hidden;container-type:inline-size;container-name:dossier-card}
          button,input,select,textarea{font:inherit;letter-spacing:0;border:1px solid var(--divider-color);border-radius:8px;background:var(--card-background-color);color:var(--primary-text-color)}
          button{cursor:pointer;min-height:40px;padding:8px 12px;display:inline-flex;align-items:center;justify-content:center;gap:6px}button:disabled{opacity:.5;cursor:default}
          input,select,textarea{width:100%;min-width:0;min-height:44px;padding:9px;font-size:16px}textarea{resize:vertical}label{display:grid;gap:5px;font-size:12px;color:var(--secondary-text-color);min-width:0}
          .primary{background:var(--primary-color);color:var(--text-primary-color,#fff);border-color:transparent}.secondary{background:var(--secondary-background-color)}
          .top,.toolbar,.panel-head,.timeline-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}.title{font-size:18px;font-weight:650}.subtitle,.timeline-sub{font-size:12px;color:var(--secondary-text-color);margin-top:4px}
          .selectors{max-width:220px}.toolbar .owner{flex:1;min-width:0;display:grid;gap:6px}.owner label{margin:0}.tools{align-self:end}.tools button{min-height:44px}
          .panel{border:0;border-bottom:1px solid var(--divider-color);border-radius:0;padding:12px 0;margin:0}.panel-title,.timeline-title{font-size:15px;font-weight:650}
          details>summary{cursor:pointer;min-height:40px;padding:9px 0;font-size:13px}details>summary:focus-visible{outline:2px solid var(--primary-color);outline-offset:2px}.profile-text,.record-note{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.45;font-size:13px}
          .profile-panel .panel-head{margin:8px 0}.profile-panel .icon-button{padding:0;width:40px}.form-actions{display:flex;justify-content:end;gap:8px;margin-top:8px}
          .followup-summary{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px}.summary-chip,.followup-count{font-size:12px;color:var(--secondary-text-color)}.summary-chip.danger,.danger{color:var(--error-color)}.summary-chip.warning{color:var(--warning-color,var(--primary-color))}
          .followup-list{display:grid;gap:8px;max-height:240px;overflow:auto;overscroll-behavior:contain}.followup-row{display:grid;grid-template-columns:30px minmax(0,1fr) auto;gap:8px;align-items:center;padding:8px 0;border-bottom:1px solid var(--divider-color)}.followup-main{min-width:0;display:grid;gap:4px;overflow-wrap:anywhere}.followup-main strong{font-size:13px}.followup-main span,.followup-date{font-size:12px;color:var(--secondary-text-color)}.followup-date{display:flex;align-items:center;flex-wrap:wrap;gap:6px}.followup-date strong{font-weight:500}
          .timeline-head{margin-top:16px;align-items:start}.toggle{display:flex;align-items:center;gap:8px;font-size:12px;margin:8px 0}.toggle input{width:18px;min-height:18px;height:18px;padding:0;margin:0}
          .history-filters{border-bottom:1px solid var(--divider-color);margin-bottom:12px}.dates{display:grid;grid-template-columns:1fr 1fr auto;gap:8px;align-items:end;margin-bottom:12px}.category-filters{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 12px}.category-filter{min-height:34px;font-size:12px;padding:5px 9px}.category-filter ha-icon{--mdc-icon-size:16px}.category-filter.active{background:var(--primary-color);border-color:var(--primary-color);color:var(--text-primary-color,#fff)}
          .dossier-timeline-scroll{max-height:var(--dossier-history-height);overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;overflow-anchor:none;scrollbar-gutter:stable}.record{display:grid;grid-template-columns:28px minmax(0,1fr);gap:10px;padding:12px 0;border-bottom:1px solid var(--divider-color)}.record.deleted{opacity:.65}.record-icon{color:var(--primary-color);padding-top:3px}.record-icon ha-icon{--mdc-icon-size:22px}.record-body{min-width:0}.record-top{display:flex;align-items:start;justify-content:space-between;gap:8px}.record-heading{min-width:0;display:flex;flex-wrap:wrap;align-items:center;gap:5px;overflow-wrap:anywhere}.record-heading strong{flex-basis:100%;font-size:14px}.type-badge,.deleted-badge{font-size:11px;color:var(--secondary-text-color)}.type-badge:not(:last-child)::after{content:" ·";margin-left:4px}.deleted-badge{color:var(--error-color)}
          .record time{display:block;font-size:12px;color:var(--secondary-text-color);margin-top:5px}.record-summary{font-size:13px;margin-top:6px;overflow-wrap:anywhere}.record-actions{display:flex;gap:6px;flex:none}.record-actions .record-edit-button{padding:0}.record-menu summary{list-style:none;width:40px;height:40px;padding:0;display:grid;place-items:center;border:1px solid var(--divider-color);border-radius:8px;background:var(--secondary-background-color)}.record-menu summary::-webkit-details-marker{display:none}.record-menu[open]{position:relative}.record-menu>div{position:absolute;z-index:2;right:0;width:180px;padding:6px;border:1px solid var(--divider-color);border-radius:8px;background:var(--card-background-color);display:grid;box-shadow:0 3px 10px #0002}
          .record-details>summary{color:var(--primary-color);padding:8px 0}.record-data{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 16px;margin:4px 0 10px}.record-data-row{min-width:0;display:grid;gap:3px}.record-data-row span{font-size:11px;color:var(--secondary-text-color)}.record-data-row strong{font-size:13px;font-weight:500;overflow-wrap:anywhere;white-space:pre-wrap}.care-instruction-row{grid-column:1/-1}.text-button{color:var(--primary-color);border:0;font-size:12px}.text-button.danger{color:var(--error-color)}
          .empty{padding:20px 0;color:var(--secondary-text-color);font-size:13px;overflow-wrap:anywhere}.empty button{display:flex;margin-top:8px}.message{margin:8px 0;font-size:13px;overflow-wrap:anywhere}.error{color:var(--error-color)}.status{color:var(--secondary-text-color)}
          .timeline-items-content[hidden]{display:none}.dossier-timeline-toggle-footer{margin-top:12px}.dossier-timeline-toggle-footer button,#show-more-history{width:100%;min-height:44px}.dossier-timeline-toggle-footer button{background:var(--secondary-background-color)}#show-more-history{margin-top:8px;color:var(--primary-color)}
          @container dossier-card (max-width:520px){.top{align-items:start;flex-wrap:wrap}.selectors{width:100%;max-width:none}.toolbar{align-items:stretch;flex-direction:column}.tools button{width:100%}.tools{align-self:stretch}.dates{grid-template-columns:1fr 1fr}.dates button{grid-column:1/-1}.record-data{grid-template-columns:1fr}.record{grid-template-columns:24px minmax(0,1fr);gap:8px}.followup-row{grid-template-columns:24px minmax(0,1fr)}.followup-date{grid-column:2}.timeline-head{flex-direction:column;gap:4px}}
        </style>
        <div class="top">
          <div><div class="title">${escapeHtml(this._config.title || "Dossier")}</div><div class="subtitle">${escapeHtml(subtitle)}</div></div>
          <div class="selectors">${litterSelector}</div>
        </div>
        <div class="toolbar">
          <div class="owner"><label for="owner-select">${escapeHtml(localize(this._hass, "dossierFor"))}</label><select id="owner-select" ${!litter ? "disabled" : ""}>${ownerOptions}</select>${motherHistorySelector}</div>
          <div class="tools">
            ${this._canAddRecord ? `<button class="primary" id="add-record" ${this._saving || !litter ? "disabled" : ""}><ha-icon icon="mdi:plus"></ha-icon> ${escapeHtml(dossierText(this._hass, "Nieuw item", "New entry"))}</button>` : ""}
          </div>
        </div>
        ${this._error ? `<div class="message error">${escapeHtml(this._error)}</div>` : ""}
        ${this._status ? `<div class="message status">${escapeHtml(this._status)}</div>` : ""}
        ${this._renderProfileNote()}
        ${this._renderUpcomingActions()}
        <div class="timeline-head">
          <div><div class="timeline-title">${escapeHtml(dossierText(this._hass, "Historie", "History"))}</div><div class="timeline-sub">${escapeHtml(ownerName)} · ${activeRecordCount} ${escapeHtml(activeRecordLabel)}</div></div>
        </div>
        <div class="timeline-items-content" ${this._timelineItemsVisible ? "" : "hidden"}>
          ${searchMarkup(this._hass, this._searchQuery, visibleRecords.length)}
          <details class="history-filters" ${this._filtersOpen ? "open" : ""}><summary>${escapeHtml(dossierText(this._hass, "Filters", "Filters"))}${this._state.from || this._state.to || this.__dossierCategoryFilters || this._showDeleted ? ` · ${escapeHtml(dossierText(this._hass, "actief", "active"))}` : ""}</summary>
          ${this._renderCategoryFilters(availableCategoryTypes, selectedCategoryTypes)}
          <div class="dates"><label>${escapeHtml(dossierText(this._hass, "Vanaf", "From"))}<input id="from-date" type="date" value="${escapeHtml(this._state.from)}"></label><label>${escapeHtml(dossierText(this._hass, "Tot en met", "Through"))}<input id="to-date" type="date" value="${escapeHtml(this._state.to)}"></label><button type="button" id="reset-history-filters">${escapeHtml(localize(this._hass, "clearFilters"))}</button></div>
          ${this._canManage ? `<label class="toggle"><input id="show-deleted" type="checkbox" ${this._showDeleted ? "checked" : ""}> ${escapeHtml(dossierText(this._hass, "Verwijderde items en eerdere wegingen", "Deleted entries and previous weight versions"))}</label>` : ""}</details>
          <div class="dossier-timeline-scroll">${this._searchResultsMarkup(records, visibleRecords, ownerName)}</div>
        </div>
        <div class="dossier-timeline-toggle-footer"><button id="toggle-timeline-items" type="button" aria-expanded="${this._timelineItemsVisible ? "true" : "false"}"><ha-icon icon="mdi:chevron-${this._timelineItemsVisible ? "up" : "down"}"></ha-icon><span>${escapeHtml(this._timelineItemsVisible ? dossierText(this._hass, "Historie inklappen", "Collapse history") : dossierText(this._hass, `Historie tonen (${visibleRecords.length})`, `Show history (${visibleRecords.length})`))}</span></button></div>
      </ha-card>`;
    if (markup === this._lastMarkup && this.shadowRoot.firstChild) return;
    this._lastMarkup = markup;
    this.shadowRoot.innerHTML = markup;

    this.shadowRoot.getElementById("litter-select")?.addEventListener("change", (event) => {
      if (requestLitterChange(this, event.target.value)) this._selectLitter(event.target.value);
    });
    this.shadowRoot.getElementById("owner-select")?.addEventListener("change", (event) => this._selectOwner(event.target.value));
    this.shadowRoot.getElementById("mother-history-scope")?.addEventListener("change", async (event) => {
      this.__motherHistoryScope = event.target.value === "all" ? "all" : "current";
      this._persistState();
      this._loading = true;
      this._render();
      try {
        await this._loadLitterAndRecords(false);
        this._error = "";
      } catch (err) {
        this._error = err?.message || dossierText(this._hass, "Moederhistorie kon niet worden geladen.", "Mother history could not be loaded.");
      } finally {
        this._loading = false;
        this._render();
      }
    });
    bindSearch(this.shadowRoot, (query) => { this._searchQuery = query; this._updateSearchResults(); });
    this.shadowRoot.addEventListener("toggle", this._detailsHandler ||= (event) => {
      const details = event.target;
      if (!details.isConnected || !details.matches?.(".record-details")) return;
      this._detailState.set(details.dataset.detailKey, details.open);
      const summary = details.parentElement.querySelector(".record-summary");
      if (summary) summary.hidden = details.open;
    }, true);
    this.shadowRoot.querySelector(".profile-panel")?.addEventListener("toggle", (event) => { if (event.target.isConnected) this._profileOpen = event.target.open; });
    this.shadowRoot.querySelector(".history-filters")?.addEventListener("toggle", (event) => { if (event.target.isConnected) this._filtersOpen = event.target.open; });
    this.shadowRoot.querySelectorAll("#from-date,#to-date").forEach((input) => input.addEventListener("change", () => {
      this._state[input.id === "from-date" ? "from" : "to"] = input.value;
      this._historyLimit = null;
      this._persistState(); this._render();
    }));
    this.shadowRoot.addEventListener("click", this._resetFiltersHandler ||= (event) => {
      if (!event.target.closest?.("#reset-history-filters")) return;
      this._state.from = ""; this._state.to = ""; this._searchQuery = ""; this._showDeleted = false;
      this._clearCategoryFilters();
    });
    this.shadowRoot.querySelector(".followup-list")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-edit-item],[data-complete-followup]");
      const action = this._recordData?.actions?.actions?.find((item) => item.id === (button?.dataset.completeFollowup || button?.dataset.editItem));
      if (action) openFollowupEditor(this, action, { trigger: button });
    });
    this.shadowRoot.getElementById("add-record")?.addEventListener("click", () => this._startAdd());
    this.shadowRoot.getElementById("toggle-timeline-items")?.addEventListener("click", () => {
      this._timelineItemsVisible = !this._timelineItemsVisible;
      this._render();
    });
    this.shadowRoot.getElementById("profile-edit")?.addEventListener("click", () => this._startProfileEdit());
    this._formState.bind(this._profileEditing ? this.shadowRoot.querySelector(".profile-panel") : null);
    this.shadowRoot.getElementById("profile-cancel")?.addEventListener("click", async () => {
      if (!this._formState.discard()) return;
      this._profileEditing = false;
      this._render();
      if (this._refreshDeferred) {
        this._refreshDeferred = false;
        await this._queueRefresh(true);
      }
    });
    this.shadowRoot.getElementById("profile-save")?.addEventListener("click", () => this._saveProfileNote());
    this.shadowRoot.getElementById("show-deleted")?.addEventListener("change", async (event) => {
      this._showDeleted = Boolean(event.target.checked);
      this._persistState();
      this._loading = true;
      this._render();
      try {
        await this._loadLitterAndRecords(false);
        this._error = "";
      } catch (err) {
        this._error = err?.message || localize(this._hass, "deletedItemsLoadFailed");
      } finally {
        this._loading = false;
        this._render();
      }
    });

    this.shadowRoot.querySelectorAll("[data-dossier-category]").forEach((button) => {
      button.addEventListener("click", () => this._toggleCategoryFilter(button.dataset.dossierCategory, availableCategoryTypes));
    });

    this.shadowRoot.querySelector(".dossier-timeline-scroll").addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button) return;
      if (button.id === "clear-category-filters") { this._clearCategoryFilters(); return; }
      if (button.id === "show-more-history") { this._historyLimit = (this._historyLimit || Number(this._config.max_items) || 250) + (Number(this._config.max_items) || 250); this._updateSearchResults(); return; }
      const record = this._historyItems().find((item) => (item.__aggregate_record_key || item.id) === (button.dataset.editItem || button.dataset.recordKey || button.dataset.id));
      if (!record) return;
      if (button.dataset.editItem) this._startEdit(record, button);
      else if (button.classList.contains("delete-record")) this._deleteRecord(record, button);
      else if (button.classList.contains("move-record")) this._changeOwner(record, button);
      else if (button.classList.contains("restore-record")) this._restoreRecord(record, button);
    });
    this.shadowRoot.querySelector(".dossier-timeline-scroll").scrollTop = oldScroll;
  }
}

if (!customElements.get("puppy-tracker-dossier-card")) {
  customElements.define("puppy-tracker-dossier-card", PuppyTrackerDossierCard);
}
