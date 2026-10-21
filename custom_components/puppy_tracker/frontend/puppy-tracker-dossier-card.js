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
import { matchesDossierSearch, searchMarkup, searchText, bindSearch, syncSearchControls, syncTimelineToggle, SEARCH_STYLE } from "./puppy-tracker-dossier-search.js";
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
  owner: LITTER_OWNER,
  showDeleted: false,
  categories: null,
  motherHistoryScope: "current",
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
      show_timeline_items: false,
      default_selected: "litter",
    };
  }

  static getConfigForm() {
    return {
      schema: [
        { name: "title", selector: { text: {} } },
        { name: "show_litter_selector", selector: { boolean: {} } },
        { name: "show_profile_note", selector: { boolean: {} } },
        { name: "show_timeline_items", selector: { boolean: {} } },
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
    const previousTimelineDefault = this._config?.show_timeline_items;
    this._config = {
      title: "",
      show_litter_selector: true,
      show_profile_note: true,
      show_timeline_items: false,
      default_selected: "litter",
      ...config,
    };
    this._restoreConfiguredState();
    if (this._timelineItemsVisible === null || previousTimelineDefault !== this._config.show_timeline_items) {
      this._timelineItemsVisible = this._config.show_timeline_items === true;
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
    return canEditRecords(this) && this._recordData?.can_manage_records !== false;
  }

  get _canAddRecord() {
    // An aggregate view has no unambiguous owner for a new item. Existing
    // items retain their source context and can still be edited there.
    return this._canManage && !this.__allSelected;
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
    if (!this._hass || !this._selectedLitterId) {
      this._litterData = null;
      this._recordData = null;
      if (render) this._render();
      return;
    }

    this._litterData = await fetchLitterData(this._hass, this._selectedLitterId);
    const puppies = this._litterData?.puppies || [];
    if (this._selectedPuppyId && !puppies.some((item) => item.id === this._selectedPuppyId)) {
      this._selectedPuppyId = null;
    }
    if (!this._selectedPuppyId && this._config.puppy_id && puppies.some((item) => item.id === this._config.puppy_id)) {
      this._selectedPuppyId = this._config.puppy_id;
    }

    const includeDeleted = this._showDeleted && Boolean(this._litterData?.can_manage_records);
    if (this.__allSelected) {
      this._selectedPuppyId = null;
      const [litterRecords, motherRecords, ...puppyResponses] = await Promise.all([
        fetchRecords(this._hass, this._selectedLitterId, null, includeDeleted),
        this._fetchMotherRecords("current", includeDeleted),
        ...puppies.map((puppy) => fetchRecords(this._hass, this._selectedLitterId, puppy.id, includeDeleted)),
      ]);
      const records = [
        ...(litterRecords?.records || []).map((record) => decorateRecord(record, "litter", this._litterData?.litter?.name || null)),
        ...(motherRecords?.records || []).map((record) => decorateRecord(record, "mother", motherRecords?.owner?.name || this._litterData?.litter?.mother || null)),
        ...puppyResponses.flatMap((response, index) => {
          const puppy = puppies[index];
          return (response?.records || []).map((record) => decorateRecord(record, "puppy", puppy?.name || null, puppy?.id || null));
        }),
      ];
      const canManageRecords = Boolean(
        this._litterData?.can_manage_records
        && litterRecords?.can_manage_records !== false
        && motherRecords?.can_manage_records !== false
        && puppyResponses.every((response) => response?.can_manage_records !== false),
      );
      this._recordData = {
        records: sortNewestFirst(records),
        actions: { actions: [] },
        can_manage_records: canManageRecords,
      };
    } else if (this.__motherSelected) {
      this._selectedPuppyId = null;
      this._recordData = await this._fetchMotherRecords(this.__motherHistoryScope, includeDeleted);
    } else {
      this._recordData = await fetchRecords(
        this._hass,
        this._selectedLitterId,
        this._selectedPuppyId,
        includeDeleted,
      );
    }
    if (!this._recordData?.can_manage_records) this._showDeleted = false;
    if (render) this._render();
  }

  async _fetchMotherRecords(historyScope = "current", includeDeleted = false) {
    if (!this._litterData?.litter?.mother) return null;
    return this._hass.callWS({
      type: "puppy_tracker/mother/records",
      litter_id: this._selectedLitterId,
      history_scope: historyScope,
      include_deleted: Boolean(includeDeleted),
    });
  }

  async _selectLitter(litterId) {
    this._selectedLitterId = litterId;
    this._selectedPuppyId = null;
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
    return openRecordEditor(this, context, { trigger: this.shadowRoot.getElementById("add-record") });
  }

  _startEdit(record, trigger) {
    return openRecordEditor(this, recordContext(this, record), { trigger });
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
    const groupLabel = languageForHass(this._hass) === "en" ? "Timeline categories" : "Tijdlijncategorieen";
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
    const hint = mother
      ? dossierText(this._hass, "Doorlopende notitie voor deze moederhond.", "Persistent note for this mother.")
      : localize(this._hass, "profileNoteHint");
    const editLabel = mother
      ? dossierText(this._hass, "Moederprofiel aanpassen", "Edit mother profile")
      : localize(this._hass, "editProfileNote");
    const emptyText = mother
      ? dossierText(this._hass, "Nog geen profielnotitie.", "No profile note yet.")
      : localize(this._hass, "noProfileNote");
    if (this._profileEditing) {
      return `
        <section class="panel profile-panel">
          <div class="panel-head"><div><div class="panel-title">${escapeHtml(title)}</div><div class="hint">${escapeHtml(hint)}</div></div></div>
          <textarea id="profile-note" rows="4" placeholder="${escapeHtml(localize(this._hass, "profileNotePlaceholder"))}">${escapeHtml(note)}</textarea>
          <div class="form-actions">
            <button class="secondary" id="profile-cancel" ${this._saving ? "disabled" : ""}>${escapeHtml(localize(this._hass, "cancel"))}</button>
            <button class="primary" id="profile-save" ${this._saving ? "disabled" : ""}>${escapeHtml(localize(this._hass, "save"))}</button>
          </div>
        </section>`;
    }
    return `
      <section class="panel profile-panel">
        <div class="panel-head">
          <div><div class="panel-title">${escapeHtml(title)}</div><div class="hint">${escapeHtml(hint)}</div></div>
          ${this._canManage ? `<button class="icon-button" id="profile-edit" title="${escapeHtml(editLabel)}" aria-label="${escapeHtml(editLabel)}"><ha-icon icon="mdi:pencil"></ha-icon></button>` : ""}
        </div>
        ${note ? `<div class="profile-text">${escapeHtml(note)}</div>` : `<div class="empty compact">${escapeHtml(emptyText)}${this._canManage ? escapeHtml(localize(this._hass, "noProfileNoteCanAdd")) : ""}</div>`}
      </section>`;
  }

  _renderUpcomingActions() {
    const actions = this._recordData?.actions?.actions || [];
    if (!actions.length) return "";
    const overdueCount = actions.filter((action) => action?.status === "overdue").length;
    const dueTodayCount = actions.filter((action) => action?.status === "due_today").length;
    const upcomingCount = actions.filter((action) => action?.status === "upcoming").length;

    return `
      <section class="panel followup-panel">
        <div class="panel-head">
          <div><div class="panel-title">${escapeHtml(localize(this._hass, "upcoming"))}</div><div class="hint">${escapeHtml(localize(this._hass, "upcomingHint"))}</div></div>
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
                <strong>${escapeHtml(title)}${!this._selectedPuppyId && action.puppy_name ? ` - ${escapeHtml(action.puppy_name)}` : ""}</strong>
                ${action.description ? `<span>${escapeHtml(action.description)}</span>` : ""}
              </div>
              <div class="followup-date"><strong>${escapeHtml(formatDateOnly(action.due_date || action.due_at, this._hass))}</strong><span>${escapeHtml(dossierActionStatus(this._hass, action))}</span>${action.source_record_id || action.record_id ? recordFollowupButton(this, action.id, action) : ""}</div>
            </div>`;
          }).join("")}
        </div>
      </section>`;
  }

  _renderRecord(record) {
    const deleted = Boolean(record.deleted);
    const title = record.title || labelForRecordType(this._hass, record.type);
    const typeLabel = labelForRecordType(this._hass, record.type);
    const recordKey = record.__aggregate_record_key || record.id;
    const ownerBadge = this.__allSelected
      ? `<span class="type-badge aggregate-owner-badge">${escapeHtml(this._ownerLabel(record.__aggregate_owner_scope, record.__aggregate_owner_name))}</span>`
      : "";
    const litterBadge = this.__motherSelected && this.__motherHistoryScope === "all" && record.litter_name
      ? `<span class="type-badge mother-litter-badge">${escapeHtml(record.litter_name)}</span>`
      : "";
    return `
      <article class="record ${deleted ? "deleted" : ""}" data-record-key="${escapeHtml(recordKey)}">
        <div class="record-icon"><ha-icon icon="${escapeHtml(iconForRecordType(record.type))}"></ha-icon></div>
        <div class="record-body">
          <div class="record-top">
            <div class="record-heading"><strong>${escapeHtml(title)}</strong><span class="type-badge">${escapeHtml(typeLabel)}</span>${ownerBadge}${litterBadge}${deleted ? `<span class="deleted-badge">${escapeHtml(localize(this._hass, "removed"))}</span>` : ""}</div>
            <time>${escapeHtml(formatDateTime(record.occurred_at, "—", this._hass))}</time>
          </div>
          ${this._canManage ? `<div class="record-actions">
            ${deleted
              ? `<button class="text-button restore-record" data-id="${escapeHtml(record.id)}" data-record-key="${escapeHtml(recordKey)}"><ha-icon icon="mdi:restore"></ha-icon> ${escapeHtml(localize(this._hass, "restore"))}</button>`
              : `${recordEditButton(this, recordKey)}<details class="record-menu"><summary title="${escapeHtml(dossierText(this._hass, "Meer acties", "More actions"))}" aria-label="${escapeHtml(dossierText(this._hass, "Meer acties", "More actions"))}"><ha-icon icon="mdi:dots-vertical"></ha-icon></summary><div><button class="text-button move-record" data-record-key="${escapeHtml(recordKey)}"><ha-icon icon="mdi:account-switch-outline"></ha-icon> ${escapeHtml(localize(this._hass, "changeOwner"))}</button><button class="text-button danger delete-record" data-record-key="${escapeHtml(recordKey)}"><ha-icon icon="mdi:delete-outline"></ha-icon> ${escapeHtml(localize(this._hass, "delete"))}</button></div></details>`}
          </div>` : ""}
          ${this._renderRecordData(record)}
          ${record.note ? `<div class="record-note">${escapeHtml(record.note)}</div>` : ""}
        </div>
      </article>`;
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
    if (visibleRecords.length) return `<div class="timeline">${visibleRecords.map((record) => this._renderRecord(record)).join("")}</div>`;
    if (!records.length) return `<div class="empty">${escapeHtml(localize(this._hass, "noDossierItems", { owner: ownerName }))}${this._canAddRecord ? escapeHtml(localize(this._hass, "noDossierItemsCanAdd")) : ""}</div>`;
    if (this._searchQuery?.trim()) return `<div class="empty">${escapeHtml(searchText(this._hass, "none"))}</div>`;
    return `<div class="empty"><div>${escapeHtml(localize(this._hass, "noDossierItemsInCategories"))}</div><button type="button" class="text-button" id="clear-category-filters">${escapeHtml(localize(this._hass, "clearFilters"))}</button></div>`;
  }

  _updateSearchResults() {
    const records = this._recordData?.records || [];
    const types = [...new Set(records.map((record) => record?.type || "other"))];
    const selected = this._selectedCategoryFilters(types);
    const visible = records.filter((record) => selected.has(record?.type || "other") && matchesDossierSearch(record, this._searchQuery));
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
      ? dossierText(this._hass, "Verberg tijdlijnitems", "Hide timeline items")
      : dossierText(this._hass, `Toon tijdlijnitems (${visible.length})`, `Show timeline items (${visible.length})`));
  }

  _render() {
    if (!this.shadowRoot) return;
    if (this.shadowRoot.activeElement?.id === "record-search") {
      this._updateSearchResults();
      return;
    }
    const litter = this._litterData?.litter;
    const puppies = this._litterData?.puppies || [];
    const records = this._recordData?.records || [];
    const activeRecordCount = records.filter((item) => !item.deleted).length;
    const availableCategoryTypes = [...new Set(records.map((record) => record?.type || "other"))].sort((a, b) =>
      labelForRecordType(this._hass, a).localeCompare(labelForRecordType(this._hass, b))
    );
    const selectedCategoryTypes = this._selectedCategoryFilters(availableCategoryTypes);
    const visibleRecords = records.filter((record) => selectedCategoryTypes.has(record?.type || "other") && matchesDossierSearch(record, this._searchQuery));
    const ownerName = this.__allSelected
      ? dossierText(this._hass, "Alles", "All")
      : this.__motherSelected
        ? (this._recordData?.owner?.name || litter?.mother || localize(this._hass, "mother"))
        : (this._selectedPuppy?.name || litter?.name || localize(this._hass, "litter"));
    const activeRecordLabel = activeRecordCount === 1
      ? localize(this._hass, "activeEntry")
      : localize(this._hass, "activeEntries");
    this._searchOwnerName = ownerName;
    const litterSelector = this._config.show_litter_selector !== false && this._litters.length > 1
      ? `<select id="litter-select" aria-label="${escapeHtml(localize(this._hass, "chooseLitter"))}">${this._litters.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === this._selectedLitterId ? "selected" : ""}>${escapeHtml(item.name || localize(this._hass, "litter"))}</option>`).join("")}</select>`
      : "";
    const ownerOptions = [
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

    this.shadowRoot.innerHTML = `
      <ha-card>
        <style>
          ${SEARCH_STYLE}
          ${RECORD_ACTION_STYLE}
          .record-menu summary{list-style:none;width:40px;height:40px;display:grid;place-items:center;border:1px solid var(--divider-color);border-radius:8px;cursor:pointer}.record-menu summary::-webkit-details-marker{display:none}.record-menu>div{display:grid;gap:4px;padding-top:4px}
          :host{display:block}ha-card{padding:16px;overflow:hidden;container-type:inline-size;container-name:dossier-card}
          *{box-sizing:border-box}.top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px}.title{font-size:18px;font-weight:650}.subtitle{font-size:12px;color:var(--secondary-text-color);margin-top:3px}
          .selectors{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}select,input,textarea{width:100%;border:1px solid var(--divider-color);border-radius:10px;background:var(--card-background-color);color:var(--primary-text-color);font:inherit}select,input{min-height:40px;padding:0 10px}textarea{padding:10px 12px;resize:vertical;line-height:1.45}.selectors select{width:auto;max-width:220px}
          .toolbar{display:flex;justify-content:space-between;align-items:center;gap:10px;margin:12px 0}.owner{display:flex;align-items:center;gap:8px;min-width:0}.owner label{font-size:12px;color:var(--secondary-text-color);white-space:nowrap}.owner select{min-width:170px}.tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end}
          button{font:inherit;cursor:pointer;border-radius:10px;min-height:38px;padding:0 12px;border:1px solid var(--divider-color);background:transparent;color:var(--primary-text-color);display:inline-flex;align-items:center;justify-content:center;gap:6px}button:disabled{opacity:.55;cursor:default}.primary{background:var(--primary-color);border-color:var(--primary-color);color:var(--text-primary-color,#fff);font-weight:600}.secondary{background:var(--secondary-background-color)}.icon-button{width:38px;padding:0;border-radius:50%}.text-button{min-height:30px;padding:3px 7px;border:0;font-size:12px;color:var(--primary-color)}.text-button.danger{color:var(--error-color)}
          .panel{border:1px solid var(--divider-color);border-radius:14px;padding:13px;margin:12px 0;background:color-mix(in srgb,var(--card-background-color) 96%,var(--primary-color) 4%)}.panel-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:9px}.panel-title{font-weight:650;font-size:15px}.hint{font-size:11px;color:var(--secondary-text-color);margin-top:2px}.profile-text{white-space:pre-wrap;line-height:1.45;font-size:14px}.empty{padding:24px 12px;text-align:center;color:var(--secondary-text-color);font-size:13px}.empty.compact{padding:4px 0;text-align:left}
          .followup-count{min-width:28px;height:28px;padding:0 8px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;background:var(--secondary-background-color);font-size:12px;font-weight:650}.followup-summary{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 9px}.summary-chip{font-size:10px;padding:3px 7px;border-radius:999px;background:var(--secondary-background-color);color:var(--secondary-text-color)}.summary-chip.danger{color:var(--error-color);background:color-mix(in srgb,var(--error-color) 9%,transparent)}.summary-chip.warning{color:var(--warning-color,var(--primary-color));background:color-mix(in srgb,var(--warning-color,var(--primary-color)) 9%,transparent)}.followup-list{display:grid;gap:7px}.followup-row{display:grid;grid-template-columns:34px minmax(0,1fr) auto;gap:9px;align-items:center;padding:8px 9px;border:1px solid var(--divider-color);border-radius:11px}.followup-icon{display:grid;place-items:center;width:30px;height:30px;border-radius:50%;background:var(--secondary-background-color);color:var(--primary-color)}.followup-icon ha-icon{--mdc-icon-size:18px}.followup-main{display:flex;flex-direction:column;gap:2px;min-width:0}.followup-main strong{font-size:13px;overflow-wrap:anywhere}.followup-main span{font-size:11px;color:var(--secondary-text-color);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.followup-date{display:flex;flex-direction:column;align-items:flex-end;gap:1px;white-space:nowrap}.followup-date strong{font-size:12px}.followup-date span{font-size:10px;color:var(--secondary-text-color)}.followup-row.danger{border-color:color-mix(in srgb,var(--error-color) 38%,var(--divider-color));background:color-mix(in srgb,var(--error-color) 7%,transparent)}.followup-row.danger .followup-date span{color:var(--error-color);font-weight:650}.followup-row.warning{border-color:color-mix(in srgb,var(--warning-color,var(--primary-color)) 32%,var(--divider-color))}.followup-row.warning .followup-date span{color:var(--warning-color,var(--primary-color));font-weight:650}
          label{display:block;font-size:12px;color:var(--secondary-text-color);margin-bottom:10px}label input,label select,label textarea{margin-top:5px;color:var(--primary-text-color)}.optional{font-weight:400;opacity:.75}.form-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:4px}
          .timeline-head{display:flex;justify-content:space-between;align-items:end;gap:10px;margin:16px 0 8px}.timeline-title{font-size:16px;font-weight:650}.timeline-sub{font-size:11px;color:var(--secondary-text-color);margin-top:2px}.toggle{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--secondary-text-color);cursor:pointer}.toggle input{width:16px;min-height:16px;margin:0;padding:0}.category-filters{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 8px}.category-filter{min-height:32px;padding:0 9px;border-radius:999px;font-size:12px;background:var(--secondary-background-color)}.category-filter ha-icon{--mdc-icon-size:16px}.category-filter.active{background:var(--primary-color);border-color:var(--primary-color);color:var(--text-primary-color,#fff)}
          .dossier-timeline-scroll{max-height:520px;overflow-y:auto;overflow-x:hidden;padding-right:4px;overscroll-behavior:contain}.timeline{display:flex;flex-direction:column}.record{position:relative;display:grid;grid-template-columns:38px minmax(0,1fr);gap:10px;padding:12px 0}.record:not(:last-child){border-bottom:1px solid var(--divider-color)}.record.deleted{opacity:.62}.record-icon{width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:var(--secondary-background-color);color:var(--primary-color)}.record-icon ha-icon{--mdc-icon-size:20px}.record-body{min-width:0}.record-top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.record-heading{display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0}.record-heading strong{font-size:14px}.record time{font-size:11px;color:var(--secondary-text-color);white-space:nowrap}.type-badge,.deleted-badge{font-size:10px;padding:2px 6px;border-radius:999px;background:var(--secondary-background-color);color:var(--secondary-text-color)}.deleted-badge{color:var(--error-color)}.record-data{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px 14px;margin-top:7px;padding:8px 10px;border-radius:10px;background:var(--secondary-background-color)}.record-data-row{min-width:0;display:flex;flex-direction:column;gap:1px}.record-data-row span{font-size:10px;color:var(--secondary-text-color)}.record-data-row strong{font-size:12px;font-weight:550;overflow-wrap:anywhere}.care-instruction-row{grid-column:1/-1}.care-instruction-row strong{white-space:pre-wrap}.record-note{margin-top:6px;white-space:pre-wrap;line-height:1.42;font-size:13px}.record-actions{display:flex;gap:6px;align-items:flex-start;margin-top:6px;flex-wrap:wrap}
          .timeline-items-content[hidden]{display:none}.dossier-timeline-toggle-footer{padding:8px 0 0}.dossier-timeline-toggle-footer button{width:100%;min-height:48px;border:0;border-radius:12px;background:var(--primary-color);color:var(--text-primary-color,#fff);font-weight:650}.dossier-timeline-toggle-footer button.secondary{background:var(--secondary-background-color);color:var(--primary-text-color);border:1px solid var(--divider-color)}
          .message{font-size:12px;margin:8px 0;padding:8px 10px;border-radius:10px;background:var(--secondary-background-color)}.error{color:var(--error-color);background:color-mix(in srgb,var(--error-color) 10%,transparent)}.status{color:var(--secondary-text-color)}
          @container dossier-card (max-width:620px){.top{flex-direction:column}.selectors{width:100%;justify-content:stretch}.selectors select{max-width:none;flex:1}.toolbar{align-items:flex-end}.owner{flex:1;flex-direction:column;align-items:stretch;gap:3px}.owner select{min-width:0}.tools{flex:0 0 auto}.record-data{grid-template-columns:1fr}.care-instruction-row{grid-column:auto}.record-top{flex-direction:column;gap:3px}.record time{white-space:normal}.followup-row{grid-template-columns:32px minmax(0,1fr)}.followup-date{grid-column:2;align-items:flex-start;flex-direction:row;gap:6px}}
          @container dossier-card (max-width:430px){ha-card{padding:13px}.toolbar{flex-direction:column;align-items:stretch}.tools{justify-content:space-between}.tools button.primary{flex:1}.timeline-head{align-items:flex-start;flex-direction:column}.record{grid-template-columns:32px minmax(0,1fr)}.record-icon{width:30px;height:30px}.record-icon ha-icon{--mdc-icon-size:18px}}
        </style>
        <div class="top">
          <div><div class="title">${escapeHtml(this._config.title || localize(this._hass, "puppyTrackerDossier"))}</div><div class="subtitle">${escapeHtml(subtitle)}</div></div>
          <div class="selectors">${litterSelector}</div>
        </div>
        <div class="toolbar">
          <div class="owner"><label for="owner-select">${escapeHtml(localize(this._hass, "dossierFor"))}</label><select id="owner-select" ${!litter ? "disabled" : ""}>${ownerOptions}</select>${motherHistorySelector}</div>
          <div class="tools">
            ${this._canAddRecord ? `<button class="primary" id="add-record" ${this._saving || !litter ? "disabled" : ""}><ha-icon icon="mdi:plus"></ha-icon> ${escapeHtml(localize(this._hass, "add"))}</button>` : ""}
          </div>
        </div>
        ${this._error ? `<div class="message error">${escapeHtml(this._error)}</div>` : ""}
        ${this._status ? `<div class="message status">${escapeHtml(this._status)}</div>` : ""}
        ${this._renderProfileNote()}
        ${this._renderUpcomingActions()}
        <div class="timeline-head">
          <div><div class="timeline-title">${escapeHtml(localize(this._hass, "timeline"))}</div><div class="timeline-sub">${escapeHtml(ownerName)} · ${activeRecordCount} ${escapeHtml(activeRecordLabel)}</div></div>
          ${this._canManage ? `<label class="toggle"><input id="show-deleted" type="checkbox" ${this._showDeleted ? "checked" : ""}> ${escapeHtml(localize(this._hass, "showDeleted"))}</label>` : ""}
        </div>
        <div class="timeline-items-content" ${this._timelineItemsVisible ? "" : "hidden"}>
          ${searchMarkup(this._hass, this._searchQuery, visibleRecords.length)}
          ${this._renderCategoryFilters(availableCategoryTypes, selectedCategoryTypes)}
          <div class="dossier-timeline-scroll">${this._searchResultsMarkup(records, visibleRecords, ownerName)}</div>
        </div>
        <div class="dossier-timeline-toggle-footer"><button id="toggle-timeline-items" type="button" class="${this._timelineItemsVisible ? "secondary" : ""}" aria-expanded="${this._timelineItemsVisible ? "true" : "false"}"><ha-icon icon="mdi:chevron-${this._timelineItemsVisible ? "up" : "down"}"></ha-icon><span>${escapeHtml(this._timelineItemsVisible ? dossierText(this._hass, "Verberg tijdlijnitems", "Hide timeline items") : dossierText(this._hass, `Toon tijdlijnitems (${visibleRecords.length})`, `Show timeline items (${visibleRecords.length})`))}</span></button></div>
      </ha-card>`;

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
        if (this.__allSelected || this.__motherSelected) {
          await this._loadLitterAndRecords(false);
        } else {
          this._recordData = await fetchRecords(
            this._hass,
            this._selectedLitterId,
            this._selectedPuppyId,
            this._showDeleted,
          );
        }
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
      const record = (this._recordData?.records || []).find((item) => (item.__aggregate_record_key || item.id) === (button.dataset.editItem || button.dataset.recordKey || button.dataset.id));
      if (!record) return;
      if (button.dataset.editItem) this._startEdit(record, button);
      else if (button.classList.contains("delete-record")) this._deleteRecord(record, button);
      else if (button.classList.contains("move-record")) this._changeOwner(record, button);
      else if (button.classList.contains("restore-record")) this._restoreRecord(record, button);
    });
  }
}

if (!customElements.get("puppy-tracker-dossier-card")) {
  customElements.define("puppy-tracker-dossier-card", PuppyTrackerDossierCard);
}
