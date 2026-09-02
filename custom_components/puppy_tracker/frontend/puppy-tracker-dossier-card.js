import {
  addDossierRecord,
  deleteDossierRecord,
  escapeHtml,
  fetchLitterData,
  fetchLitters,
  fetchRecords,
  formatDateTime,
  languageForHass,
  localize,
  restoreDossierRecord,
  selectDefaultLitter,
  subscribeUpdates,
  updateDossierRecord,
  updateProfileNote,
} from "./puppy-tracker-card-common.js";
import {
  fieldLabel,
  fieldPlaceholder,
  inputAttributes,
  KNOWN_DATA_KEYS,
  RECORD_TYPES,
  requiredFieldsMessage,
  schemaText,
  TYPE_FIELDS,
  TYPE_META,
} from "./puppy-tracker-dossier-schema.js";

function humanizeKey(value) {
  const text = String(value || "").replaceAll("_", " ");
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}

const INTERNAL_DATA_KEYS = new Set([
  "care_program_id",
  "care_program_revision",
  "care_occurrence_id",
  "care_age_days",
  "care_scheduled_at",
  "care_status",
  "care_data",
  "reference_id",
  "reference_type",
  "source_id",
  "source_type",
]);

const DATA_LABEL_KEYS = {
  care_result: "careResult",
  care_score: "careScore",
};

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
  return DATA_LABEL_KEYS[key] ? localize(hass, DATA_LABEL_KEYS[key]) : humanizeKey(key);
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

function humanizeType(value, hass = null) {
  const text = String(value || "other");
  if (TYPE_META[text]) return localize(hass, TYPE_META[text].labelKey);
  const label = text.replaceAll("_", " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function iconForType(value) {
  return TYPE_META[String(value || "")]?.icon || "mdi:file-document-outline";
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
    this._editor = null;
    this._profileEditing = false;
  }

  static getStubConfig() {
    return {
      title: "",
      show_litter_selector: true,
      show_profile_note: true,
    };
  }

  static getConfigForm() {
    return {
      schema: [
        { name: "title", selector: { text: {} } },
        { name: "show_litter_selector", selector: { boolean: {} } },
        { name: "show_profile_note", selector: { boolean: {} } },
      ],
    };
  }

  setConfig(config) {
    this._config = {
      title: "",
      show_litter_selector: true,
      show_profile_note: true,
      ...config,
    };
    this._selectedLitterId = config.litter_id || this._selectedLitterId;
    this._selectedPuppyId = config.puppy_id || this._selectedPuppyId;
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
    if (!this._litters.length && !this._loading) this._loadInitial();
    else this._subscribe();
  }

  disconnectedCallback() {
    if (this._unsubscribe) Promise.resolve(this._unsubscribe()).catch(() => undefined);
    this._unsubscribe = null;
  }

  getCardSize() { return 8; }
  getGridOptions() { return { columns: 12, min_columns: 6 }; }

  get _canManage() {
    return Boolean(this._recordData?.can_manage_records ?? this._litterData?.can_manage_records);
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
      this._unsubscribe = await subscribeUpdates(this._hass, () => this._queueRefresh());
    } catch (_err) {
      this._unsubscribe = null;
    } finally {
      this._subscriptionPending = false;
    }
  }

  _editingActive() {
    return Boolean(this._editor || this._profileEditing || this._saving);
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

    this._recordData = await fetchRecords(
      this._hass,
      this._selectedLitterId,
      this._selectedPuppyId,
      this._showDeleted && Boolean(this._litterData?.can_manage_records)
    );
    if (!this._recordData?.can_manage_records) this._showDeleted = false;
    if (render) this._render();
  }

  async _selectLitter(litterId) {
    this._selectedLitterId = litterId;
    this._selectedPuppyId = null;
    this._editor = null;
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
    this._selectedPuppyId = value === "__litter__" ? null : value;
    this._editor = null;
    this._profileEditing = false;
    this._status = "";
    this._loading = true;
    this._render();
    try {
      this._recordData = await fetchRecords(
        this._hass,
        this._selectedLitterId,
        this._selectedPuppyId,
        this._showDeleted && this._canManage
      );
      this._error = "";
    } catch (err) {
      this._error = err?.message || localize(this._hass, "dossierLoadFailed");
    } finally {
      this._loading = false;
      this._render();
    }
  }

  _startAdd() {
    this._profileEditing = false;
    this._editor = {
      mode: "add",
      id: null,
      record_type: "note",
      occurred_at: toLocalDateTimeInput(),
      title: "",
      note: "",
      data: {},
    };
    this._status = "";
    this._render();
    queueMicrotask(() => this.shadowRoot?.getElementById("record-title")?.focus());
  }

  _startEdit(record) {
    this._profileEditing = false;
    this._editor = {
      mode: "edit",
      id: record.id,
      record_type: record.type || "note",
      occurred_at: toLocalDateTimeInput(record.occurred_at),
      title: record.title || "",
      note: record.note || "",
      data: { ...(record.data || {}) },
    };
    this._status = "";
    this._render();
    queueMicrotask(() => this.shadowRoot?.getElementById("record-title")?.focus());
  }

  async _finishEditor() {
    this._editor = null;
    this._saving = false;
    this._render();
    if (this._refreshDeferred) {
      this._refreshDeferred = false;
      await this._queueRefresh(true);
    }
  }

  _captureEditorState(recordTypeOverride = null) {
    if (!this._editor) return;
    const typeInput = this.shadowRoot?.getElementById("record-type");
    const occurredInput = this.shadowRoot?.getElementById("record-occurred");
    const titleInput = this.shadowRoot?.getElementById("record-title");
    const noteInput = this.shadowRoot?.getElementById("record-note");
    const currentType = recordTypeOverride || typeInput?.value || this._editor.record_type || "note";

    this._editor.record_type = currentType;
    this._editor.occurred_at = occurredInput?.value ?? this._editor.occurred_at;
    this._editor.title = titleInput?.value ?? this._editor.title;
    this._editor.note = noteInput?.value ?? this._editor.note;

    const data = { ...(this._editor.data || {}) };
    for (const field of TYPE_FIELDS[currentType] || []) {
      const input = this.shadowRoot?.getElementById(`record-data-${field.key}`);
      if (input) data[field.key] = input.value;
    }
    this._editor.data = data;
  }

  _collectEditorData(recordType) {
    const data = { ...(this._editor?.data || {}) };

    for (const key of KNOWN_DATA_KEYS) delete data[key];

    for (const field of TYPE_FIELDS[recordType] || []) {
      const input = this.shadowRoot?.getElementById(`record-data-${field.key}`);
      const value = input?.value?.trim() || "";
      if (value) data[field.key] = value;
    }
    return data;
  }

  _renderTypeFields(recordType, data = {}) {
    const fields = TYPE_FIELDS[recordType] || [];
    if (!fields.length) return "";

    const controls = fields.map((field) => {
      const value = data?.[field.key] ?? "";
      const id = `record-data-${field.key}`;
      const classes = field.wide ? "typed-field wide" : "typed-field";
      const placeholderValue = fieldPlaceholder(this._hass, field);
      const placeholder = placeholderValue ? ` placeholder="${escapeHtml(placeholderValue)}"` : "";
      const attributes = inputAttributes(field);
      const control = field.type === "textarea"
        ? `<textarea id="${id}" rows="3"${placeholder}>${escapeHtml(value)}</textarea>`
        : `<input id="${id}" type="${field.type || "text"}" value="${escapeHtml(value)}"${placeholder}${attributes ? ` ${attributes}` : ""}>`;
      const requirement = field.required
        ? `<span class="required">${escapeHtml(schemaText(this._hass, "required"))}</span>`
        : `<span class="optional">${escapeHtml(localize(this._hass, "optional"))}</span>`;
      return `<label class="${classes}">${escapeHtml(fieldLabel(this._hass, field))} ${requirement}${control}</label>`;
    }).join("");

    return `
      <div class="typed-section">
        <div class="typed-title">${escapeHtml(localize(this._hass, "additionalData"))} · ${escapeHtml(humanizeType(recordType, this._hass))}</div>
        <div class="typed-grid">${controls}</div>
      </div>`;
  }

  _renderRecordData(record) {
    const data = record?.data;
    if (!data || typeof data !== "object" || Array.isArray(data)) return "";

    const schema = TYPE_FIELDS[record.type] || [];
    const rows = [];
    const renderedKeys = new Set();

    for (const field of schema) {
      const raw = data[field.key];
      if (raw === null || raw === undefined || raw === "") continue;
      renderedKeys.add(field.key);
      const value = field.type === "date" ? formatDateOnly(raw, this._hass) : displayDataValue(raw, this._hass);
      rows.push(`<div class="record-data-row"><span>${escapeHtml(fieldLabel(this._hass, field))}</span><strong>${escapeHtml(value)}</strong></div>`);
    }

    for (const [key, raw] of Object.entries(data)) {
      if (
        renderedKeys.has(key)
        || INTERNAL_DATA_KEYS.has(key)
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
        return `<button type="button" class="category-filter ${active ? "active" : ""}" data-dossier-category="${escapeHtml(type)}" aria-pressed="${active ? "true" : "false"}"><ha-icon icon="${escapeHtml(iconForType(type))}"></ha-icon>${escapeHtml(humanizeType(type, this._hass))}</button>`;
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
    this._render();
  }

  async _saveRecord() {
    if (!this._editor || !this._canManage || this._saving) return;
    const typeInput = this.shadowRoot?.getElementById("record-type");
    const occurredInput = this.shadowRoot?.getElementById("record-occurred");
    const titleInput = this.shadowRoot?.getElementById("record-title");
    const noteInput = this.shadowRoot?.getElementById("record-note");
    const occurredAt = toIsoTimestamp(occurredInput?.value);
    if (!occurredAt) {
      this._error = localize(this._hass, "invalidDateTime");
      this._render();
      return;
    }

    const recordType = typeInput?.value || "note";
    const recordData = this._collectEditorData(recordType);
    const validationError = requiredFieldsMessage(this._hass, recordType, recordData);
    if (validationError) {
      this._error = validationError;
      this._render();
      return;
    }

    const payload = {
      record_type: recordType,
      occurred_at: occurredAt,
      title: titleInput?.value?.trim() || null,
      note: noteInput?.value?.trim() || null,
      data: recordData,
    };

    this._saving = true;
    this._error = "";
    this._status = this._editor.mode === "edit" ? localize(this._hass, "dossierItemSave") : localize(this._hass, "dossierItemAdd");
    this._render();
    try {
      if (this._editor.mode === "edit") {
        await updateDossierRecord(
          this._hass,
          this._selectedLitterId,
          this._selectedPuppyId,
          this._editor.id,
          payload
        );
        this._status = localize(this._hass, "dossierItemUpdated");
      } else {
        await addDossierRecord(
          this._hass,
          this._selectedLitterId,
          this._selectedPuppyId,
          payload
        );
        this._status = localize(this._hass, "dossierItemAdded");
      }
      this._editor = null;
      this._saving = false;
      await this._loadLitterAndRecords(false);
    } catch (err) {
      this._saving = false;
      this._error = err?.message || localize(this._hass, "dossierItemCouldNotSave");
    }
    this._render();
  }

  async _deleteRecord(record) {
    if (!this._canManage || this._saving) return;
    const title = record.title || humanizeType(record.type, this._hass);
    if (!window.confirm(localize(this._hass, "confirmDeleteRecord", { title }))) return;
    this._saving = true;
    this._status = localize(this._hass, "dossierItemDelete");
    this._error = "";
    this._render();
    try {
      await deleteDossierRecord(this._hass, this._selectedLitterId, this._selectedPuppyId, record.id);
      this._status = localize(this._hass, "dossierItemDeleted");
      await this._loadLitterAndRecords(false);
    } catch (err) {
      this._error = err?.message || localize(this._hass, "dossierItemCouldNotDelete");
    } finally {
      this._saving = false;
      this._render();
    }
  }

  async _restoreRecord(record) {
    if (!this._canManage || this._saving) return;
    this._saving = true;
    this._status = localize(this._hass, "dossierItemRestore");
    this._error = "";
    this._render();
    try {
      await restoreDossierRecord(this._hass, this._selectedLitterId, this._selectedPuppyId, record.id);
      this._status = localize(this._hass, "dossierItemRestored");
      await this._loadLitterAndRecords(false);
    } catch (err) {
      this._error = err?.message || localize(this._hass, "dossierItemCouldNotRestore");
    } finally {
      this._saving = false;
      this._render();
    }
  }

  _startProfileEdit() {
    if (!this._selectedPuppy || !this._canManage) return;
    this._editor = null;
    this._profileEditing = true;
    this._status = "";
    this._render();
    queueMicrotask(() => this.shadowRoot?.getElementById("profile-note")?.focus());
  }

  async _saveProfileNote() {
    if (!this._selectedPuppy || !this._canManage || this._saving) return;
    const input = this.shadowRoot?.getElementById("profile-note");
    const profileNote = input?.value?.trim() || null;
    this._saving = true;
    this._status = localize(this._hass, "profileNoteSave");
    this._error = "";
    this._render();
    try {
      await updateProfileNote(
        this._hass,
        this._selectedLitterId,
        this._selectedPuppyId,
        profileNote
      );
      this._profileEditing = false;
      this._status = localize(this._hass, "profileNoteSaved");
      this._saving = false;
      await this._loadLitterAndRecords(false);
    } catch (err) {
      this._saving = false;
      this._error = err?.message || localize(this._hass, "profileNoteCouldNotSave");
    }
    this._render();
  }

  _recordTypeOptions(selected) {
    const knownValues = new Set(RECORD_TYPES.map(([value]) => value));
    const options = RECORD_TYPES.map(([value, labelKey]) =>
      `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(localize(this._hass, labelKey))}</option>`
    );
    if (selected && !knownValues.has(selected)) {
      options.unshift(`<option value="${escapeHtml(selected)}" selected>${escapeHtml(humanizeType(selected, this._hass))}</option>`);
    }
    return options.join("");
  }

  _renderProfileNote() {
    if (this._config.show_profile_note === false || !this._selectedPuppy) return "";
    const note = this._selectedPuppy.profile_note || "";
    if (this._profileEditing) {
      return `
        <section class="panel profile-panel">
          <div class="panel-head"><div><div class="panel-title">${escapeHtml(localize(this._hass, "profileNote"))}</div><div class="hint">${escapeHtml(localize(this._hass, "profileNoteHint"))}</div></div></div>
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
          <div><div class="panel-title">${escapeHtml(localize(this._hass, "profileNote"))}</div><div class="hint">${escapeHtml(localize(this._hass, "profileNoteHint"))}</div></div>
          ${this._canManage ? `<button class="icon-button" id="profile-edit" title="${escapeHtml(localize(this._hass, "editProfileNote"))}" aria-label="${escapeHtml(localize(this._hass, "editProfileNote"))}"><ha-icon icon="mdi:pencil"></ha-icon></button>` : ""}
        </div>
        ${note ? `<div class="profile-text">${escapeHtml(note)}</div>` : `<div class="empty compact">${escapeHtml(localize(this._hass, "noProfileNote"))}${this._canManage ? escapeHtml(localize(this._hass, "noProfileNoteCanAdd")) : ""}</div>`}
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
            const title = humanizeType(action.type || action.record_type, this._hass);
            return `
            <div class="followup-row ${dossierActionTone(action)}">
              <div class="followup-icon"><ha-icon icon="${escapeHtml(action.icon || "mdi:calendar-clock")}"></ha-icon></div>
              <div class="followup-main">
                <strong>${escapeHtml(title)}${!this._selectedPuppyId && action.puppy_name ? ` - ${escapeHtml(action.puppy_name)}` : ""}</strong>
                ${action.description ? `<span>${escapeHtml(action.description)}</span>` : ""}
              </div>
              <div class="followup-date"><strong>${escapeHtml(formatDateOnly(action.due_date || action.due_at, this._hass))}</strong><span>${escapeHtml(dossierActionStatus(this._hass, action))}</span></div>
            </div>`;
          }).join("")}
        </div>
      </section>`;
  }

  _renderEditor() {
    if (!this._editor) return "";
    const editing = this._editor.mode === "edit";
    return `
      <section class="panel editor-panel">
        <div class="panel-head">
          <div><div class="panel-title">${escapeHtml(editing ? localize(this._hass, "editDossierItem") : localize(this._hass, "newDossierItem"))}</div><div class="hint">${escapeHtml(this._selectedPuppy?.name || this._litterData?.litter?.name || localize(this._hass, "litter"))}</div></div>
        </div>
        <div class="form-grid">
          <label>${escapeHtml(localize(this._hass, "type"))}
            <select id="record-type">${this._recordTypeOptions(this._editor.record_type)}</select>
          </label>
          <label>${escapeHtml(localize(this._hass, "dateAndTime"))}
            <input id="record-occurred" type="datetime-local" step="1" value="${escapeHtml(this._editor.occurred_at)}">
          </label>
        </div>
        <label>${escapeHtml(localize(this._hass, "title"))} <span class="optional">${escapeHtml(localize(this._hass, "optional"))}</span>
          <input id="record-title" type="text" maxlength="160" value="${escapeHtml(this._editor.title)}" placeholder="${escapeHtml(localize(this._hass, "recordTitlePlaceholder"))}">
        </label>
        <label>${escapeHtml(localize(this._hass, "note"))} <span class="optional">${escapeHtml(localize(this._hass, "optional"))}</span>
          <textarea id="record-note" rows="4" placeholder="${escapeHtml(localize(this._hass, "detailsPlaceholder"))}">${escapeHtml(this._editor.note)}</textarea>
        </label>
        ${this._renderTypeFields(this._editor.record_type, this._editor.data)}
        <div class="form-actions">
          <button class="secondary" id="record-cancel" ${this._saving ? "disabled" : ""}>${escapeHtml(localize(this._hass, "cancel"))}</button>
          <button class="primary" id="record-save" ${this._saving ? "disabled" : ""}>${escapeHtml(editing ? localize(this._hass, "saveChanges") : localize(this._hass, "add"))}</button>
        </div>
      </section>`;
  }

  _renderRecord(record) {
    const deleted = Boolean(record.deleted);
    const title = record.title || humanizeType(record.type, this._hass);
    const typeLabel = humanizeType(record.type, this._hass);
    return `
      <article class="record ${deleted ? "deleted" : ""}">
        <div class="record-icon"><ha-icon icon="${escapeHtml(iconForType(record.type))}"></ha-icon></div>
        <div class="record-body">
          <div class="record-top">
            <div class="record-heading"><strong>${escapeHtml(title)}</strong><span class="type-badge">${escapeHtml(typeLabel)}</span>${deleted ? `<span class="deleted-badge">${escapeHtml(localize(this._hass, "removed"))}</span>` : ""}</div>
            <time>${escapeHtml(formatDateTime(record.occurred_at, "—", this._hass))}</time>
          </div>
          ${this._renderRecordData(record)}
          ${record.note ? `<div class="record-note">${escapeHtml(record.note)}</div>` : ""}
          ${this._canManage ? `<div class="record-actions">
            ${deleted
              ? `<button class="text-button restore-record" data-id="${escapeHtml(record.id)}"><ha-icon icon="mdi:restore"></ha-icon> ${escapeHtml(localize(this._hass, "restore"))}</button>`
              : `<button class="text-button edit-record" data-id="${escapeHtml(record.id)}"><ha-icon icon="mdi:pencil-outline"></ha-icon> ${escapeHtml(localize(this._hass, "editDossierItem"))}</button><button class="text-button danger delete-record" data-id="${escapeHtml(record.id)}"><ha-icon icon="mdi:delete-outline"></ha-icon> ${escapeHtml(localize(this._hass, "delete"))}</button>`}
          </div>` : ""}
        </div>
      </article>`;
  }

  _render() {
    if (!this.shadowRoot) return;
    const litter = this._litterData?.litter;
    const puppies = this._litterData?.puppies || [];
    const records = this._recordData?.records || [];
    const activeRecordCount = records.filter((item) => !item.deleted).length;
    const availableCategoryTypes = [...new Set(records.map((record) => record?.type || "other"))].sort((a, b) =>
      humanizeType(a, this._hass).localeCompare(humanizeType(b, this._hass))
    );
    const selectedCategoryTypes = this._selectedCategoryFilters(availableCategoryTypes);
    const visibleRecords = records.filter((record) => selectedCategoryTypes.has(record?.type || "other"));
    const ownerName = this._selectedPuppy?.name || litter?.name || localize(this._hass, "litter");
    const activeRecordLabel = activeRecordCount === 1
      ? localize(this._hass, "activeEntry")
      : localize(this._hass, "activeEntries");
    const litterSelector = this._config.show_litter_selector !== false && this._litters.length > 1
      ? `<select id="litter-select" aria-label="${escapeHtml(localize(this._hass, "chooseLitter"))}">${this._litters.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === this._selectedLitterId ? "selected" : ""}>${escapeHtml(item.name || localize(this._hass, "litter"))}</option>`).join("")}</select>`
      : "";
    const ownerOptions = [
      `<option value="__litter__" ${!this._selectedPuppyId ? "selected" : ""}>${escapeHtml(localize(this._hass, "litterDossier"))}</option>`,
      ...puppies.map((puppy) => `<option value="${escapeHtml(puppy.id)}" ${puppy.id === this._selectedPuppyId ? "selected" : ""}>${escapeHtml(puppy.name || localize(this._hass, "puppy"))}</option>`),
    ].join("");

    this.shadowRoot.innerHTML = `
      <ha-card>
        <style>
          :host{display:block}ha-card{padding:16px;overflow:hidden;container-type:inline-size;container-name:dossier-card}
          *{box-sizing:border-box}.top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px}.title{font-size:18px;font-weight:650}.subtitle{font-size:12px;color:var(--secondary-text-color);margin-top:3px}
          .selectors{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}select,input,textarea{width:100%;border:1px solid var(--divider-color);border-radius:10px;background:var(--card-background-color);color:var(--primary-text-color);font:inherit}select,input{min-height:40px;padding:0 10px}textarea{padding:10px 12px;resize:vertical;line-height:1.45}.selectors select{width:auto;max-width:220px}
          .toolbar{display:flex;justify-content:space-between;align-items:center;gap:10px;margin:12px 0}.owner{display:flex;align-items:center;gap:8px;min-width:0}.owner label{font-size:12px;color:var(--secondary-text-color);white-space:nowrap}.owner select{min-width:170px}.tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end}
          button{font:inherit;cursor:pointer;border-radius:10px;min-height:38px;padding:0 12px;border:1px solid var(--divider-color);background:transparent;color:var(--primary-text-color);display:inline-flex;align-items:center;justify-content:center;gap:6px}button:disabled{opacity:.55;cursor:default}.primary{background:var(--primary-color);border-color:var(--primary-color);color:var(--text-primary-color,#fff);font-weight:600}.secondary{background:var(--secondary-background-color)}.icon-button{width:38px;padding:0;border-radius:50%}.text-button{min-height:30px;padding:3px 7px;border:0;font-size:12px;color:var(--primary-color)}.text-button.danger{color:var(--error-color)}
          .panel{border:1px solid var(--divider-color);border-radius:14px;padding:13px;margin:12px 0;background:color-mix(in srgb,var(--card-background-color) 96%,var(--primary-color) 4%)}.panel-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:9px}.panel-title{font-weight:650;font-size:15px}.hint{font-size:11px;color:var(--secondary-text-color);margin-top:2px}.profile-text{white-space:pre-wrap;line-height:1.45;font-size:14px}.empty{padding:24px 12px;text-align:center;color:var(--secondary-text-color);font-size:13px}.empty.compact{padding:4px 0;text-align:left}
          .followup-count{min-width:28px;height:28px;padding:0 8px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;background:var(--secondary-background-color);font-size:12px;font-weight:650}.followup-summary{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 9px}.summary-chip{font-size:10px;padding:3px 7px;border-radius:999px;background:var(--secondary-background-color);color:var(--secondary-text-color)}.summary-chip.danger{color:var(--error-color);background:color-mix(in srgb,var(--error-color) 9%,transparent)}.summary-chip.warning{color:var(--warning-color,var(--primary-color));background:color-mix(in srgb,var(--warning-color,var(--primary-color)) 9%,transparent)}.followup-list{display:grid;gap:7px}.followup-row{display:grid;grid-template-columns:34px minmax(0,1fr) auto;gap:9px;align-items:center;padding:8px 9px;border:1px solid var(--divider-color);border-radius:11px}.followup-icon{display:grid;place-items:center;width:30px;height:30px;border-radius:50%;background:var(--secondary-background-color);color:var(--primary-color)}.followup-icon ha-icon{--mdc-icon-size:18px}.followup-main{display:flex;flex-direction:column;gap:2px;min-width:0}.followup-main strong{font-size:13px;overflow-wrap:anywhere}.followup-main span{font-size:11px;color:var(--secondary-text-color);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.followup-date{display:flex;flex-direction:column;align-items:flex-end;gap:1px;white-space:nowrap}.followup-date strong{font-size:12px}.followup-date span{font-size:10px;color:var(--secondary-text-color)}.followup-row.danger{border-color:color-mix(in srgb,var(--error-color) 38%,var(--divider-color));background:color-mix(in srgb,var(--error-color) 7%,transparent)}.followup-row.danger .followup-date span{color:var(--error-color);font-weight:650}.followup-row.warning{border-color:color-mix(in srgb,var(--warning-color,var(--primary-color)) 32%,var(--divider-color))}.followup-row.warning .followup-date span{color:var(--warning-color,var(--primary-color));font-weight:650}
          .form-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}label{display:block;font-size:12px;color:var(--secondary-text-color);margin-bottom:10px}label input,label select,label textarea{margin-top:5px;color:var(--primary-text-color)}.optional{font-weight:400;opacity:.75}.required{font-weight:600;color:var(--error-color);font-size:10px}.form-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:4px}.typed-section{margin:2px 0 12px;padding-top:10px;border-top:1px solid var(--divider-color)}.typed-title{font-size:12px;font-weight:650;color:var(--secondary-text-color);margin-bottom:8px}.typed-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 10px}.typed-field.wide{grid-column:1/-1}
          .timeline-head{display:flex;justify-content:space-between;align-items:end;gap:10px;margin:16px 0 8px}.timeline-title{font-size:16px;font-weight:650}.timeline-sub{font-size:11px;color:var(--secondary-text-color);margin-top:2px}.toggle{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--secondary-text-color);cursor:pointer}.toggle input{width:16px;min-height:16px;margin:0;padding:0}.category-filters{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 8px}.category-filter{min-height:32px;padding:0 9px;border-radius:999px;font-size:12px;background:var(--secondary-background-color)}.category-filter ha-icon{--mdc-icon-size:16px}.category-filter.active{background:var(--primary-color);border-color:var(--primary-color);color:var(--text-primary-color,#fff)}
          .timeline{display:flex;flex-direction:column}.record{position:relative;display:grid;grid-template-columns:38px minmax(0,1fr);gap:10px;padding:12px 0}.record:not(:last-child){border-bottom:1px solid var(--divider-color)}.record.deleted{opacity:.62}.record-icon{width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:var(--secondary-background-color);color:var(--primary-color)}.record-icon ha-icon{--mdc-icon-size:20px}.record-body{min-width:0}.record-top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.record-heading{display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0}.record-heading strong{font-size:14px}.record time{font-size:11px;color:var(--secondary-text-color);white-space:nowrap}.type-badge,.deleted-badge{font-size:10px;padding:2px 6px;border-radius:999px;background:var(--secondary-background-color);color:var(--secondary-text-color)}.deleted-badge{color:var(--error-color)}.record-data{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px 14px;margin-top:7px;padding:8px 10px;border-radius:10px;background:var(--secondary-background-color)}.record-data-row{min-width:0;display:flex;flex-direction:column;gap:1px}.record-data-row span{font-size:10px;color:var(--secondary-text-color)}.record-data-row strong{font-size:12px;font-weight:550;overflow-wrap:anywhere}.record-note{margin-top:6px;white-space:pre-wrap;line-height:1.42;font-size:13px}.record-actions{display:flex;gap:2px;margin-top:6px;flex-wrap:wrap}
          .message{font-size:12px;margin:8px 0;padding:8px 10px;border-radius:10px;background:var(--secondary-background-color)}.error{color:var(--error-color);background:color-mix(in srgb,var(--error-color) 10%,transparent)}.status{color:var(--secondary-text-color)}
          @container dossier-card (max-width:620px){.top{flex-direction:column}.selectors{width:100%;justify-content:stretch}.selectors select{max-width:none;flex:1}.toolbar{align-items:flex-end}.owner{flex:1;flex-direction:column;align-items:stretch;gap:3px}.owner select{min-width:0}.tools{flex:0 0 auto}.form-grid,.typed-grid{grid-template-columns:1fr}.typed-field.wide{grid-column:auto}.record-data{grid-template-columns:1fr}.record-top{flex-direction:column;gap:3px}.record time{white-space:normal}.followup-row{grid-template-columns:32px minmax(0,1fr)}.followup-date{grid-column:2;align-items:flex-start;flex-direction:row;gap:6px}}
          @container dossier-card (max-width:430px){ha-card{padding:13px}.toolbar{flex-direction:column;align-items:stretch}.tools{justify-content:space-between}.tools button.primary{flex:1}.timeline-head{align-items:flex-start;flex-direction:column}.record{grid-template-columns:32px minmax(0,1fr)}.record-icon{width:30px;height:30px}.record-icon ha-icon{--mdc-icon-size:18px}}
        </style>
        <div class="top">
          <div><div class="title">${escapeHtml(this._config.title || localize(this._hass, "puppyTrackerDossier"))}</div><div class="subtitle">${escapeHtml(litter?.name || (this._loading ? localize(this._hass, "loading") : localize(this._hass, "noLitter")))}</div></div>
          <div class="selectors">${litterSelector}</div>
        </div>
        <div class="toolbar">
          <div class="owner"><label for="owner-select">${escapeHtml(localize(this._hass, "dossierFor"))}</label><select id="owner-select" ${!litter ? "disabled" : ""}>${ownerOptions}</select></div>
          <div class="tools">
            ${this._canManage ? `<button class="primary" id="add-record" ${this._saving || !litter ? "disabled" : ""}><ha-icon icon="mdi:plus"></ha-icon> ${escapeHtml(localize(this._hass, "add"))}</button>` : ""}
          </div>
        </div>
        ${this._error ? `<div class="message error">${escapeHtml(this._error)}</div>` : ""}
        ${this._status ? `<div class="message status">${escapeHtml(this._status)}</div>` : ""}
        ${this._renderProfileNote()}
        ${this._renderUpcomingActions()}
        ${this._renderEditor()}
        <div class="timeline-head">
          <div><div class="timeline-title">${escapeHtml(localize(this._hass, "timeline"))}</div><div class="timeline-sub">${escapeHtml(ownerName)} · ${activeRecordCount} ${escapeHtml(activeRecordLabel)}</div></div>
          ${this._canManage ? `<label class="toggle"><input id="show-deleted" type="checkbox" ${this._showDeleted ? "checked" : ""}> ${escapeHtml(localize(this._hass, "showDeleted"))}</label>` : ""}
        </div>
        ${this._renderCategoryFilters(availableCategoryTypes, selectedCategoryTypes)}
        ${this._loading ? `<div class="empty">${escapeHtml(localize(this._hass, "loading"))}</div>` : records.length ? (visibleRecords.length ? `<div class="timeline">${visibleRecords.map((record) => this._renderRecord(record)).join("")}</div>` : `<div class="empty">${escapeHtml(localize(this._hass, "noDossierItemsInCategories"))}</div>`) : `<div class="empty">${escapeHtml(localize(this._hass, "noDossierItems", { owner: ownerName }))}${this._canManage ? escapeHtml(localize(this._hass, "noDossierItemsCanAdd")) : ""}</div>`}
      </ha-card>`;

    this.shadowRoot.getElementById("litter-select")?.addEventListener("change", (event) => this._selectLitter(event.target.value));
    this.shadowRoot.getElementById("owner-select")?.addEventListener("change", (event) => this._selectOwner(event.target.value));
    this.shadowRoot.getElementById("add-record")?.addEventListener("click", () => this._startAdd());
    this.shadowRoot.getElementById("record-cancel")?.addEventListener("click", async () => {
      this._editor = null;
      this._render();
      if (this._refreshDeferred) {
        this._refreshDeferred = false;
        await this._queueRefresh(true);
      }
    });
    this.shadowRoot.getElementById("record-type")?.addEventListener("change", (event) => {
      this._captureEditorState(this._editor?.record_type || "note");
      if (this._editor) this._editor.record_type = event.target.value || "note";
      this._render();
    });
    this.shadowRoot.getElementById("record-save")?.addEventListener("click", () => this._saveRecord());
    this.shadowRoot.getElementById("profile-edit")?.addEventListener("click", () => this._startProfileEdit());
    this.shadowRoot.getElementById("profile-cancel")?.addEventListener("click", async () => {
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
      this._loading = true;
      this._render();
      try {
        this._recordData = await fetchRecords(
          this._hass,
          this._selectedLitterId,
          this._selectedPuppyId,
          this._showDeleted
        );
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

    for (const button of this.shadowRoot.querySelectorAll(".edit-record")) {
      button.addEventListener("click", () => {
        const record = visibleRecords.find((item) => item.id === button.dataset.id);
        if (record) this._startEdit(record);
      });
    }
    for (const button of this.shadowRoot.querySelectorAll(".delete-record")) {
      button.addEventListener("click", () => {
        const record = visibleRecords.find((item) => item.id === button.dataset.id);
        if (record) this._deleteRecord(record);
      });
    }
    for (const button of this.shadowRoot.querySelectorAll(".restore-record")) {
      button.addEventListener("click", () => {
        const record = visibleRecords.find((item) => item.id === button.dataset.id);
        if (record) this._restoreRecord(record);
      });
    }
  }
}

if (!customElements.get("puppy-tracker-dossier-card")) {
  customElements.define("puppy-tracker-dossier-card", PuppyTrackerDossierCard);
}
window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === "puppy-tracker-dossier-card")) {
  window.customCards.push({
    type: "puppy-tracker-dossier-card",
    name: "Puppy Tracker Dossier",
    description: localize(null, "dossierCardDescription"),
  });
}
