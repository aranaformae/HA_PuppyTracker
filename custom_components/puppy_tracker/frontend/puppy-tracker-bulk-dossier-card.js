import {
  addDossierRecord,
  escapeHtml,
  fetchLitterData,
  fetchLitters,
  localize,
  selectDefaultLitter,
  subscribeUpdates,
} from "./puppy-tracker-card-common.js";
import {
  BULK_RECORD_TYPES as RECORD_TYPES,
  fieldLabel,
  fieldPlaceholder,
  inputAttributes,
  requiredFieldsMessage,
  schemaText,
  TYPE_FIELDS,
} from "./puppy-tracker-dossier-schema.js";

const COPY = {
  en: {
    title: "Bulk dossier",
    description: "Add one shared care event to multiple puppies while keeping an individual dossier record per puppy.",
    selectPuppies: "Select puppies",
    selectWholeLitter: "Select whole litter",
    clearSelection: "Clear",
    selected: "{count} selected",
    sharedEntry: "Shared dossier entry",
    review: "Review",
    reviewTitle: "Review bulk entry",
    reviewHint: "Check the puppies and shared details before saving.",
    back: "Back",
    confirmSave: "Save for {count} puppies",
    confirmSaveOne: "Save for 1 puppy",
    noPuppies: "No puppies available in this litter.",
    selectAtLeastOne: "Select at least one puppy.",
    loadFailed: "Bulk dossier data could not be loaded.",
    refreshFailed: "Bulk dossier data could not be refreshed.",
    saveFailed: "The bulk dossier entry could not be saved.",
    saving: "Saving shared dossier entry...",
    allSaved: "Saved for all {count} puppies.",
    allSavedOne: "Saved for 1 puppy.",
    partiallySaved: "Saved for {success} of {total} puppies. Failed puppies remain selected for retry.",
    failedPuppies: "Failed puppies",
    recordType: "Event type",
    puppies: "Puppies",
    sharedDetails: "Shared details",
    bulkCardDescription: "Create the same dossier event for multiple puppies with a review step and partial-failure handling.",
  },
  nl: {
    title: "Bulk dossier",
    description: "Voeg één gedeeld zorgmoment toe aan meerdere pups, met een apart dossierrecord per pup.",
    selectPuppies: "Pups selecteren",
    selectWholeLitter: "Hele nest selecteren",
    clearSelection: "Wissen",
    selected: "{count} geselecteerd",
    sharedEntry: "Gedeeld dossieritem",
    review: "Controleren",
    reviewTitle: "Bulkregistratie controleren",
    reviewHint: "Controleer de pups en gedeelde gegevens voordat je opslaat.",
    back: "Terug",
    confirmSave: "Opslaan voor {count} pups",
    confirmSaveOne: "Opslaan voor 1 pup",
    noPuppies: "Geen pups beschikbaar in dit nest.",
    selectAtLeastOne: "Selecteer minimaal één pup.",
    loadFailed: "Bulkdossiergegevens konden niet worden geladen.",
    refreshFailed: "Bulkdossiergegevens konden niet worden vernieuwd.",
    saveFailed: "De bulkregistratie kon niet worden opgeslagen.",
    saving: "Gedeeld dossieritem opslaan...",
    allSaved: "Opgeslagen voor alle {count} pups.",
    allSavedOne: "Opgeslagen voor 1 pup.",
    partiallySaved: "Opgeslagen voor {success} van {total} pups. Alleen mislukte pups blijven geselecteerd voor een nieuwe poging.",
    failedPuppies: "Mislukte pups",
    recordType: "Type gebeurtenis",
    puppies: "Pups",
    sharedDetails: "Gedeelde gegevens",
    bulkCardDescription: "Maak hetzelfde dossieritem voor meerdere pups met controle vooraf en veilige afhandeling van gedeeltelijke fouten.",
  },
};

function language(hass) {
  const value = hass?.locale?.language || hass?.language || navigator.language || "nl";
  return String(value).toLowerCase().startsWith("en") ? "en" : "nl";
}

function text(hass, key, replacements = {}) {
  const template = COPY[language(hass)]?.[key] || COPY.nl[key] || key;
  return Object.entries(replacements).reduce(
    (value, [name, replacement]) => value.replaceAll(`{${name}}`, String(replacement ?? "")),
    template,
  );
}

function nowLocalInput() {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toIsoTimestamp(value) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function recordTypeLabel(hass, value) {
  const entry = RECORD_TYPES.find(([recordType]) => recordType === value);
  return entry ? localize(hass, entry[1]) : String(value || "");
}

function bulkCountText(hass, key, count) {
  if (count === 1) return text(hass, `${key}One`, { count });
  return text(hass, key, { count });
}

class PuppyTrackerBulkDossierCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass = null;
    this._config = {};
    this._litters = [];
    this._selectedLitterId = null;
    this._litterData = null;
    this._puppies = [];
    this._selectedPuppyIds = new Set();
    this._loading = false;
    this._saving = false;
    this._review = false;
    this._dirty = false;
    this._error = "";
    this._status = "";
    this._result = null;
    this._unsubscribe = null;
    this._subscriptionPending = false;
    this._refreshDeferred = false;
    this._form = this._emptyForm();
  }

  static getStubConfig() {
    return {
      title: "",
      show_litter_selector: true,
      active_only: true,
    };
  }

  static getConfigForm() {
    return {
      schema: [
        { name: "title", selector: { text: {} } },
        { name: "show_litter_selector", selector: { boolean: {} } },
        { name: "active_only", selector: { boolean: {} } },
      ],
    };
  }

  setConfig(config) {
    this._config = {
      title: "",
      show_litter_selector: true,
      active_only: true,
      ...config,
    };
    this._selectedLitterId = config.litter_id || this._selectedLitterId;
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

  getCardSize() { return 8; }
  getGridOptions() { return { columns: 12, min_columns: 6 }; }

  _emptyForm(recordType = "deworming") {
    return {
      record_type: recordType,
      occurred_at: nowLocalInput(),
      title: "",
      note: "",
      data: {},
    };
  }

  async _loadInitial() {
    if (!this._hass || this._loading) return;
    this._loading = true;
    this._error = "";
    this._render();
    try {
      const response = await fetchLitters(this._hass);
      this._litters = response?.litters || [];
      this._selectedLitterId = selectDefaultLitter(
        this._litters,
        this._selectedLitterId || this._config.litter_id,
      );
      await this._loadLitter(false);
      await this._subscribe();
    } catch (err) {
      this._error = err?.message || text(this._hass, "loadFailed");
    } finally {
      this._loading = false;
      this._render();
    }
  }

  async _subscribe() {
    if (!this._hass || this._unsubscribe || this._subscriptionPending || !this.isConnected) return;
    this._subscriptionPending = true;
    try {
      this._unsubscribe = await subscribeUpdates(this._hass, () => this._refreshFromUpdate());
    } catch (_err) {
      this._unsubscribe = null;
    } finally {
      this._subscriptionPending = false;
    }
  }

  async _refreshFromUpdate() {
    if (this._dirty || this._review || this._saving) {
      this._refreshDeferred = true;
      return;
    }
    try {
      const response = await fetchLitters(this._hass);
      this._litters = response?.litters || this._litters;
      this._selectedLitterId = selectDefaultLitter(this._litters, this._selectedLitterId);
      await this._loadLitter(false);
      this._error = "";
    } catch (err) {
      this._error = err?.message || text(this._hass, "refreshFailed");
    }
    this._render();
  }

  async _loadLitter(render = true) {
    if (!this._hass || !this._selectedLitterId) {
      this._litterData = null;
      this._puppies = [];
      if (render) this._render();
      return;
    }
    this._litterData = await fetchLitterData(this._hass, this._selectedLitterId);
    const puppies = this._litterData?.puppies || [];
    this._puppies = this._config.active_only
      ? puppies.filter((puppy) => puppy.active !== false)
      : puppies;
    const availableIds = new Set(this._puppies.map((puppy) => puppy.id));
    this._selectedPuppyIds = new Set(
      [...this._selectedPuppyIds].filter((puppyId) => availableIds.has(puppyId)),
    );
    if (!this._selectedPuppyIds.size && Array.isArray(this._config.puppy_ids)) {
      this._selectedPuppyIds = new Set(
        this._config.puppy_ids.filter((puppyId) => availableIds.has(puppyId)),
      );
    }
    if (render) this._render();
  }

  async _selectLitter(litterId) {
    this._captureForm();
    this._selectedLitterId = litterId;
    this._selectedPuppyIds.clear();
    this._review = false;
    this._dirty = false;
    this._status = "";
    this._result = null;
    this._loading = true;
    this._render();
    try {
      await this._loadLitter(false);
      this._error = "";
    } catch (err) {
      this._error = err?.message || text(this._hass, "loadFailed");
    } finally {
      this._loading = false;
      this._render();
    }
  }

  _captureForm() {
    if (!this.shadowRoot) return;
    this._form.record_type = this.shadowRoot.getElementById("bulk-type")?.value || this._form.record_type;
    this._form.occurred_at = this.shadowRoot.getElementById("bulk-occurred")?.value ?? this._form.occurred_at;
    this._form.title = this.shadowRoot.getElementById("bulk-title")?.value ?? this._form.title;
    this._form.note = this.shadowRoot.getElementById("bulk-note")?.value ?? this._form.note;
    const data = { ...(this._form.data || {}) };
    for (const field of TYPE_FIELDS[this._form.record_type] || []) {
      const input = this.shadowRoot.getElementById(`bulk-data-${field.key}`);
      if (input) data[field.key] = input.value;
    }
    this._form.data = data;
  }

  _currentData() {
    const result = {};
    for (const field of TYPE_FIELDS[this._form.record_type] || []) {
      const value = String(this._form.data?.[field.key] || "").trim();
      if (value) result[field.key] = value;
    }
    return result;
  }

  _setSelection(ids) {
    this._captureForm();
    this._selectedPuppyIds = new Set(ids);
    this._dirty = true;
    this._result = null;
    this._status = "";
    this._render();
  }

  _togglePuppy(puppyId, checked) {
    this._captureForm();
    if (checked) this._selectedPuppyIds.add(puppyId);
    else this._selectedPuppyIds.delete(puppyId);
    this._dirty = true;
    this._result = null;
    this._status = "";
    this._render();
  }

  _changeType(value) {
    this._captureForm();
    this._form.record_type = value;
    this._dirty = true;
    this._result = null;
    this._render();
  }

  _startReview() {
    this._captureForm();
    if (!this._selectedPuppyIds.size) {
      this._error = text(this._hass, "selectAtLeastOne");
      this._render();
      return;
    }
    if (!toIsoTimestamp(this._form.occurred_at)) {
      this._error = localize(this._hass, "invalidDateTime");
      this._render();
      return;
    }
    const validationError = requiredFieldsMessage(
      this._hass,
      this._form.record_type,
      this._currentData(),
    );
    if (validationError) {
      this._error = validationError;
      this._render();
      return;
    }
    this._error = "";
    this._review = true;
    this._render();
  }

  async _saveBulk() {
    if (this._saving || !this._review || !this._selectedPuppyIds.size) return;
    const selected = this._puppies.filter((puppy) => this._selectedPuppyIds.has(puppy.id));
    const occurredAt = toIsoTimestamp(this._form.occurred_at);
    if (!occurredAt) {
      this._error = localize(this._hass, "invalidDateTime");
      this._review = false;
      this._render();
      return;
    }

    const payload = {
      record_type: this._form.record_type,
      occurred_at: occurredAt,
      title: this._form.title.trim() || null,
      note: this._form.note.trim() || null,
      data: this._currentData(),
    };

    this._saving = true;
    this._error = "";
    this._status = text(this._hass, "saving");
    this._result = null;
    this._render();

    const successes = [];
    const failures = [];
    for (const puppy of selected) {
      try {
        const result = await addDossierRecord(
          this._hass,
          this._selectedLitterId,
          puppy.id,
          payload,
        );
        successes.push({
          puppy_id: puppy.id,
          puppy_name: puppy.name || puppy.id,
          record_id: result?.record_id || result?.record?.id || null,
        });
      } catch (err) {
        failures.push({
          puppy_id: puppy.id,
          puppy_name: puppy.name || puppy.id,
          error: err?.message || text(this._hass, "saveFailed"),
        });
      }
    }

    this._result = { successes, failures, total: selected.length };
    this._saving = false;
    this._review = false;

    if (failures.length) {
      this._selectedPuppyIds = new Set(failures.map((failure) => failure.puppy_id));
      this._dirty = true;
      this._status = text(this._hass, "partiallySaved", {
        success: successes.length,
        total: selected.length,
      });
    } else {
      this._status = bulkCountText(this._hass, "allSaved", successes.length);
      const recordType = this._form.record_type;
      this._form = this._emptyForm(recordType);
      this._dirty = false;
    }

    if (this._refreshDeferred && !this._dirty) {
      this._refreshDeferred = false;
      try {
        await this._refreshFromUpdate();
      } catch (_err) {
        // The saved result is more important than a best-effort refresh.
      }
    }
    this._render();
  }

  _renderTypeFields() {
    const fields = TYPE_FIELDS[this._form.record_type] || [];
    if (!fields.length) return "";
    return `<div class="typed-grid">${fields.map((field) => {
      const id = `bulk-data-${field.key}`;
      const value = this._form.data?.[field.key] || "";
      const placeholderValue = fieldPlaceholder(this._hass, field);
      const placeholder = placeholderValue ? ` placeholder="${escapeHtml(placeholderValue)}"` : "";
      const attributes = inputAttributes(field);
      const control = field.type === "textarea"
        ? `<textarea id="${id}" rows="3"${placeholder}>${escapeHtml(value)}</textarea>`
        : `<input id="${id}" type="${field.type || "text"}" value="${escapeHtml(value)}"${placeholder}${attributes ? ` ${attributes}` : ""}>`;
      const requirement = field.required
        ? `<span class="required">${escapeHtml(schemaText(this._hass, "required"))}</span>`
        : `<span class="optional">${escapeHtml(localize(this._hass, "optional"))}</span>`;
      return `<label class="field ${field.wide ? "wide" : ""}">${escapeHtml(fieldLabel(this._hass, field))}${requirement}${control}</label>`;
    }).join("")}</div>`;
  }

  _renderReview() {
    const selected = this._puppies.filter((puppy) => this._selectedPuppyIds.has(puppy.id));
    const data = this._currentData();
    const fields = new Map((TYPE_FIELDS[this._form.record_type] || []).map((field) => [field.key, field]));
    return `
      <section class="review">
        <div class="section-title">${escapeHtml(text(this._hass, "reviewTitle"))}</div>
        <div class="muted">${escapeHtml(text(this._hass, "reviewHint"))}</div>
        <div class="review-row"><span>${escapeHtml(text(this._hass, "puppies"))}</span><strong>${escapeHtml(selected.map((puppy) => puppy.name || puppy.id).join(", "))}</strong></div>
        <div class="review-row"><span>${escapeHtml(text(this._hass, "recordType"))}</span><strong>${escapeHtml(recordTypeLabel(this._hass, this._form.record_type))}</strong></div>
        <div class="review-row"><span>${escapeHtml(localize(this._hass, "dateAndTime"))}</span><strong>${escapeHtml(this._form.occurred_at.replace("T", " "))}</strong></div>
        ${this._form.title ? `<div class="review-row"><span>${escapeHtml(localize(this._hass, "title"))}</span><strong>${escapeHtml(this._form.title)}</strong></div>` : ""}
        ${this._form.note ? `<div class="review-row"><span>${escapeHtml(localize(this._hass, "note"))}</span><strong>${escapeHtml(this._form.note)}</strong></div>` : ""}
        ${Object.keys(data).length ? `<div class="review-data"><strong>${escapeHtml(text(this._hass, "sharedDetails"))}</strong>${Object.entries(data).map(([key, value]) => `<div>${escapeHtml(fields.has(key) ? fieldLabel(this._hass, fields.get(key)) : key.replaceAll("_", " "))}: ${escapeHtml(value)}</div>`).join("")}</div>` : ""}
        <div class="actions">
          <button id="bulk-back" class="secondary" type="button">${escapeHtml(text(this._hass, "back"))}</button>
          <button id="bulk-confirm" class="primary" type="button" ${this._saving ? "disabled" : ""}>${escapeHtml(bulkCountText(this._hass, "confirmSave", selected.length))}</button>
        </div>
      </section>`;
  }

  _render() {
    if (!this.shadowRoot) return;
    const title = this._config.title || text(this._hass, "title");
    const canManage = Boolean(this._litterData?.can_manage_records);
    const selectedCount = this._selectedPuppyIds.size;
    const litterOptions = this._litters.map((litter) => `<option value="${escapeHtml(litter.id)}" ${litter.id === this._selectedLitterId ? "selected" : ""}>${escapeHtml(litter.name || litter.id)}</option>`).join("");
    const puppyOptions = this._puppies.map((puppy) => `
      <label class="puppy-option">
        <input class="puppy-check" type="checkbox" data-puppy-id="${escapeHtml(puppy.id)}" ${this._selectedPuppyIds.has(puppy.id) ? "checked" : ""}>
        <span>${escapeHtml(puppy.name || puppy.id)}</span>
      </label>`).join("");
    const typeOptions = RECORD_TYPES.map(([value, labelKey]) => `<option value="${value}" ${value === this._form.record_type ? "selected" : ""}>${escapeHtml(localize(this._hass, labelKey))}</option>`).join("");

    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        ha-card { padding: 16px; }
        .head { display:flex; justify-content:space-between; gap:12px; align-items:flex-start; margin-bottom:16px; }
        .title { font-size:20px; font-weight:600; }
        .muted { color:var(--secondary-text-color); font-size:13px; line-height:1.45; }
        .selectors { display:grid; gap:10px; margin-bottom:16px; }
        select,input,textarea { box-sizing:border-box; width:100%; font:inherit; color:var(--primary-text-color); background:var(--card-background-color); border:1px solid var(--divider-color); border-radius:8px; padding:9px 10px; }
        textarea { resize:vertical; }
        .section { border-top:1px solid var(--divider-color); padding-top:16px; margin-top:16px; }
        .section-title { font-weight:600; margin-bottom:8px; }
        .selection-head { display:flex; flex-wrap:wrap; justify-content:space-between; gap:8px; align-items:center; }
        .selection-actions,.actions { display:flex; flex-wrap:wrap; gap:8px; }
        button { font:inherit; border:0; border-radius:8px; padding:9px 12px; cursor:pointer; }
        button:disabled { opacity:.55; cursor:default; }
        .primary { background:var(--primary-color); color:var(--text-primary-color,#fff); }
        .secondary { background:var(--secondary-background-color); color:var(--primary-text-color); }
        .puppy-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(130px,1fr)); gap:8px; margin-top:10px; }
        .puppy-option { display:flex; align-items:center; gap:8px; border:1px solid var(--divider-color); border-radius:8px; padding:9px 10px; }
        .puppy-option input { width:auto; margin:0; }
        .form-grid,.typed-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; margin-top:10px; }
        .field { display:flex; flex-direction:column; gap:5px; font-size:13px; }
        .field.wide,.note-field { grid-column:1/-1; }
        .optional { color:var(--secondary-text-color); font-size:11px; margin-left:4px; }
        .required { color:var(--error-color); font-size:11px; margin-left:4px; font-weight:600; }
        .message { margin-top:12px; padding:10px 12px; border-radius:8px; background:var(--secondary-background-color); }
        .error { color:var(--error-color); }
        .review { border:1px solid var(--divider-color); border-radius:10px; padding:14px; margin-top:16px; }
        .review-row { display:grid; grid-template-columns:minmax(100px,.35fr) 1fr; gap:12px; padding:8px 0; border-bottom:1px solid var(--divider-color); }
        .review-row span { color:var(--secondary-text-color); }
        .review-data { padding:10px 0; line-height:1.5; }
        .result-list { margin:8px 0 0; padding-left:20px; }
        @media (max-width:600px) {
          ha-card { padding:12px; }
          .head { display:block; }
          .form-grid,.typed-grid { grid-template-columns:1fr; }
          .field.wide,.note-field { grid-column:auto; }
          .review-row { grid-template-columns:1fr; gap:3px; }
          .actions button,.selection-actions button { flex:1 1 auto; }
        }
      </style>
      <ha-card>
        <div class="head"><div><div class="title">${escapeHtml(title)}</div><div class="muted">${escapeHtml(text(this._hass, "description"))}</div></div></div>
        ${this._config.show_litter_selector ? `<div class="selectors"><label class="field">${escapeHtml(localize(this._hass, "litter"))}<select id="bulk-litter">${litterOptions}</select></label></div>` : ""}
        ${this._error ? `<div class="message error">${escapeHtml(this._error)}</div>` : ""}
        ${this._status ? `<div class="message">${escapeHtml(this._status)}</div>` : ""}
        ${this._result?.failures?.length ? `<div class="message error"><strong>${escapeHtml(text(this._hass, "failedPuppies"))}</strong><ul class="result-list">${this._result.failures.map((failure) => `<li>${escapeHtml(failure.puppy_name)}: ${escapeHtml(failure.error)}</li>`).join("")}</ul></div>` : ""}
        <section class="section">
          <div class="selection-head">
            <div><div class="section-title">${escapeHtml(text(this._hass, "selectPuppies"))}</div><div class="muted">${escapeHtml(text(this._hass, "selected", { count: selectedCount }))}</div></div>
            <div class="selection-actions">
              <button id="select-all" class="secondary" type="button">${escapeHtml(text(this._hass, "selectWholeLitter"))}</button>
              <button id="clear-all" class="secondary" type="button">${escapeHtml(text(this._hass, "clearSelection"))}</button>
            </div>
          </div>
          ${this._puppies.length ? `<div class="puppy-grid">${puppyOptions}</div>` : `<div class="muted">${escapeHtml(text(this._hass, "noPuppies"))}</div>`}
        </section>
        ${canManage ? `
          <section class="section">
            <div class="section-title">${escapeHtml(text(this._hass, "sharedEntry"))}</div>
            <div class="form-grid">
              <label class="field">${escapeHtml(text(this._hass, "recordType"))}<select id="bulk-type">${typeOptions}</select></label>
              <label class="field">${escapeHtml(localize(this._hass, "dateAndTime"))}<input id="bulk-occurred" type="datetime-local" value="${escapeHtml(this._form.occurred_at)}"></label>
              <label class="field">${escapeHtml(localize(this._hass, "title"))}<span class="optional">${escapeHtml(localize(this._hass, "optional"))}</span><input id="bulk-title" type="text" value="${escapeHtml(this._form.title)}" placeholder="${escapeHtml(localize(this._hass, "recordTitlePlaceholder"))}"></label>
              <label class="field note-field">${escapeHtml(localize(this._hass, "note"))}<span class="optional">${escapeHtml(localize(this._hass, "optional"))}</span><textarea id="bulk-note" rows="3" placeholder="${escapeHtml(localize(this._hass, "detailsPlaceholder"))}">${escapeHtml(this._form.note)}</textarea></label>
            </div>
            ${this._renderTypeFields()}
            <div class="actions" style="margin-top:12px"><button id="bulk-review" class="primary" type="button" ${this._saving ? "disabled" : ""}>${escapeHtml(text(this._hass, "review"))}</button></div>
          </section>
          ${this._review ? this._renderReview() : ""}
        ` : ""}
        ${this._loading ? `<div class="message">${escapeHtml(localize(this._hass, "loading"))}</div>` : ""}
      </ha-card>`;

    this.shadowRoot.getElementById("bulk-litter")?.addEventListener("change", (event) => this._selectLitter(event.target.value));
    this.shadowRoot.getElementById("select-all")?.addEventListener("click", () => this._setSelection(this._puppies.map((puppy) => puppy.id)));
    this.shadowRoot.getElementById("clear-all")?.addEventListener("click", () => this._setSelection([]));
    for (const checkbox of this.shadowRoot.querySelectorAll(".puppy-check")) {
      checkbox.addEventListener("change", (event) => this._togglePuppy(event.target.dataset.puppyId, event.target.checked));
    }
    this.shadowRoot.getElementById("bulk-type")?.addEventListener("change", (event) => this._changeType(event.target.value));
    for (const selector of ["#bulk-occurred", "#bulk-title", "#bulk-note", ...Object.keys(this._form.data || {}).map((key) => `#bulk-data-${key}`)]) {
      this.shadowRoot.querySelector(selector)?.addEventListener("input", () => { this._dirty = true; });
    }
    for (const field of TYPE_FIELDS[this._form.record_type] || []) {
      this.shadowRoot.getElementById(`bulk-data-${field.key}`)?.addEventListener("input", () => { this._dirty = true; });
    }
    this.shadowRoot.getElementById("bulk-review")?.addEventListener("click", () => this._startReview());
    this.shadowRoot.getElementById("bulk-back")?.addEventListener("click", () => { this._review = false; this._render(); });
    this.shadowRoot.getElementById("bulk-confirm")?.addEventListener("click", () => this._saveBulk());
  }
}

if (!customElements.get("puppy-tracker-bulk-dossier-card")) {
  customElements.define("puppy-tracker-bulk-dossier-card", PuppyTrackerBulkDossierCard);
}
window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === "puppy-tracker-bulk-dossier-card")) {
  window.customCards.push({
    type: "puppy-tracker-bulk-dossier-card",
    name: "Puppy Tracker Bulk Dossier",
    description: text(null, "bulkCardDescription"),
  });
}
