import {
  addDossierRecord,
  deleteDossierRecord,
  escapeHtml,
  fetchLitterData,
  fetchLitters,
  fetchRecords,
  formatDateTime,
  restoreDossierRecord,
  selectDefaultLitter,
  subscribeUpdates,
  updateDossierRecord,
  updateProfileNote,
} from "./puppy-tracker-card-common.js";

const RECORD_TYPES = [
  ["note", "Notitie", "mdi:note-text-outline"],
  ["vaccination", "Vaccinatie", "mdi:needle"],
  ["test", "Test / uitslag", "mdi:test-tube"],
  ["deworming", "Ontworming", "mdi:shield-bug-outline"],
  ["medication", "Medicatie", "mdi:pill"],
  ["vet_visit", "Dierenartsbezoek", "mdi:stethoscope"],
  ["milestone", "Mijlpaal", "mdi:flag-checkered"],
  ["other", "Overig", "mdi:dots-horizontal-circle-outline"],
];

const TYPE_META = Object.fromEntries(
  RECORD_TYPES.map(([value, label, icon]) => [value, { label, icon }])
);

function humanizeType(value) {
  const text = String(value || "other");
  if (TYPE_META[text]) return TYPE_META[text].label;
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
      title: "Puppydossier",
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
      title: "Puppydossier",
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
      this._error = err?.message || "Het Puppy Tracker-dossier kon niet worden geladen.";
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
      this._error = err?.message || "Het dossier kon niet worden vernieuwd.";
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
      this._error = err?.message || "Nestdossier kon niet worden geladen.";
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
      this._error = err?.message || "Dossier kon niet worden geladen.";
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
      data: record.data || {},
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

  async _saveRecord() {
    if (!this._editor || !this._canManage || this._saving) return;
    const typeInput = this.shadowRoot?.getElementById("record-type");
    const occurredInput = this.shadowRoot?.getElementById("record-occurred");
    const titleInput = this.shadowRoot?.getElementById("record-title");
    const noteInput = this.shadowRoot?.getElementById("record-note");
    const occurredAt = toIsoTimestamp(occurredInput?.value);
    if (!occurredAt) {
      this._error = "Vul een geldige datum en tijd in.";
      this._render();
      return;
    }

    const payload = {
      record_type: typeInput?.value || "note",
      occurred_at: occurredAt,
      title: titleInput?.value?.trim() || null,
      note: noteInput?.value?.trim() || null,
      data: this._editor.data || {},
    };

    this._saving = true;
    this._error = "";
    this._status = this._editor.mode === "edit" ? "Dossieritem opslaan…" : "Dossieritem toevoegen…";
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
        this._status = "Dossieritem bijgewerkt.";
      } else {
        await addDossierRecord(
          this._hass,
          this._selectedLitterId,
          this._selectedPuppyId,
          payload
        );
        this._status = "Dossieritem toegevoegd.";
      }
      this._editor = null;
      this._saving = false;
      await this._loadLitterAndRecords(false);
    } catch (err) {
      this._saving = false;
      this._error = err?.message || "Dossieritem kon niet worden opgeslagen.";
    }
    this._render();
  }

  async _deleteRecord(record) {
    if (!this._canManage || this._saving) return;
    const title = record.title || humanizeType(record.type);
    if (!window.confirm(`Dossieritem “${title}” verwijderen? Je kunt het later herstellen.`)) return;
    this._saving = true;
    this._status = "Dossieritem verwijderen…";
    this._error = "";
    this._render();
    try {
      await deleteDossierRecord(this._hass, this._selectedLitterId, this._selectedPuppyId, record.id);
      this._status = "Dossieritem verwijderd.";
      await this._loadLitterAndRecords(false);
    } catch (err) {
      this._error = err?.message || "Dossieritem kon niet worden verwijderd.";
    } finally {
      this._saving = false;
      this._render();
    }
  }

  async _restoreRecord(record) {
    if (!this._canManage || this._saving) return;
    this._saving = true;
    this._status = "Dossieritem herstellen…";
    this._error = "";
    this._render();
    try {
      await restoreDossierRecord(this._hass, this._selectedLitterId, this._selectedPuppyId, record.id);
      this._status = "Dossieritem hersteld.";
      await this._loadLitterAndRecords(false);
    } catch (err) {
      this._error = err?.message || "Dossieritem kon niet worden hersteld.";
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
    this._status = "Profielnotitie opslaan…";
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
      this._status = "Profielnotitie opgeslagen.";
      this._saving = false;
      await this._loadLitterAndRecords(false);
    } catch (err) {
      this._saving = false;
      this._error = err?.message || "Profielnotitie kon niet worden opgeslagen.";
    }
    this._render();
  }

  _recordTypeOptions(selected) {
    const knownValues = new Set(RECORD_TYPES.map(([value]) => value));
    const options = RECORD_TYPES.map(([value, label]) =>
      `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(label)}</option>`
    );
    if (selected && !knownValues.has(selected)) {
      options.unshift(`<option value="${escapeHtml(selected)}" selected>${escapeHtml(humanizeType(selected))}</option>`);
    }
    return options.join("");
  }

  _renderProfileNote() {
    if (this._config.show_profile_note === false || !this._selectedPuppy) return "";
    const note = this._selectedPuppy.profile_note || "";
    if (this._profileEditing) {
      return `
        <section class="panel profile-panel">
          <div class="panel-head"><div><div class="panel-title">Profielnotitie</div><div class="hint">Blijvende samenvatting van deze pup</div></div></div>
          <textarea id="profile-note" rows="4" placeholder="Bijvoorbeeld karakter, herkenningspunten of blijvende bijzonderheden…">${escapeHtml(note)}</textarea>
          <div class="form-actions">
            <button class="secondary" id="profile-cancel" ${this._saving ? "disabled" : ""}>Annuleren</button>
            <button class="primary" id="profile-save" ${this._saving ? "disabled" : ""}>Opslaan</button>
          </div>
        </section>`;
    }
    return `
      <section class="panel profile-panel">
        <div class="panel-head">
          <div><div class="panel-title">Profielnotitie</div><div class="hint">Blijvende samenvatting van deze pup</div></div>
          ${this._canManage ? `<button class="icon-button" id="profile-edit" title="Profielnotitie aanpassen" aria-label="Profielnotitie aanpassen"><ha-icon icon="mdi:pencil"></ha-icon></button>` : ""}
        </div>
        ${note ? `<div class="profile-text">${escapeHtml(note)}</div>` : `<div class="empty compact">Nog geen profielnotitie.${this._canManage ? " Tik op het potlood om er één toe te voegen." : ""}</div>`}
      </section>`;
  }

  _renderEditor() {
    if (!this._editor) return "";
    const editing = this._editor.mode === "edit";
    return `
      <section class="panel editor-panel">
        <div class="panel-head">
          <div><div class="panel-title">${editing ? "Dossieritem aanpassen" : "Nieuw dossieritem"}</div><div class="hint">${escapeHtml(this._selectedPuppy?.name || this._litterData?.litter?.name || "Nest")}</div></div>
        </div>
        <div class="form-grid">
          <label>Type
            <select id="record-type">${this._recordTypeOptions(this._editor.record_type)}</select>
          </label>
          <label>Datum en tijd
            <input id="record-occurred" type="datetime-local" step="1" value="${escapeHtml(this._editor.occurred_at)}">
          </label>
        </div>
        <label>Titel <span class="optional">optioneel</span>
          <input id="record-title" type="text" maxlength="160" value="${escapeHtml(this._editor.title)}" placeholder="Korte omschrijving">
        </label>
        <label>Notitie <span class="optional">optioneel</span>
          <textarea id="record-note" rows="4" placeholder="Details of bijzonderheden…">${escapeHtml(this._editor.note)}</textarea>
        </label>
        <div class="form-actions">
          <button class="secondary" id="record-cancel" ${this._saving ? "disabled" : ""}>Annuleren</button>
          <button class="primary" id="record-save" ${this._saving ? "disabled" : ""}>${editing ? "Wijzigingen opslaan" : "Toevoegen"}</button>
        </div>
      </section>`;
  }

  _renderRecord(record) {
    const deleted = Boolean(record.deleted);
    const title = record.title || humanizeType(record.type);
    const typeLabel = humanizeType(record.type);
    return `
      <article class="record ${deleted ? "deleted" : ""}">
        <div class="record-icon"><ha-icon icon="${escapeHtml(iconForType(record.type))}"></ha-icon></div>
        <div class="record-body">
          <div class="record-top">
            <div class="record-heading"><strong>${escapeHtml(title)}</strong><span class="type-badge">${escapeHtml(typeLabel)}</span>${deleted ? `<span class="deleted-badge">Verwijderd</span>` : ""}</div>
            <time>${escapeHtml(formatDateTime(record.occurred_at))}</time>
          </div>
          ${record.note ? `<div class="record-note">${escapeHtml(record.note)}</div>` : ""}
          ${this._canManage ? `<div class="record-actions">
            ${deleted
              ? `<button class="text-button restore-record" data-id="${escapeHtml(record.id)}"><ha-icon icon="mdi:restore"></ha-icon> Herstellen</button>`
              : `<button class="text-button edit-record" data-id="${escapeHtml(record.id)}"><ha-icon icon="mdi:pencil-outline"></ha-icon> Aanpassen</button><button class="text-button danger delete-record" data-id="${escapeHtml(record.id)}"><ha-icon icon="mdi:delete-outline"></ha-icon> Verwijderen</button>`}
          </div>` : ""}
        </div>
      </article>`;
  }

  _render() {
    if (!this.shadowRoot) return;
    const litter = this._litterData?.litter;
    const puppies = this._litterData?.puppies || [];
    const records = this._recordData?.records || [];
    const ownerName = this._selectedPuppy?.name || litter?.name || "Nest";
    const litterSelector = this._config.show_litter_selector !== false && this._litters.length > 1
      ? `<select id="litter-select" aria-label="Nest kiezen">${this._litters.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === this._selectedLitterId ? "selected" : ""}>${escapeHtml(item.name || "Nest")}</option>`).join("")}</select>`
      : "";
    const ownerOptions = [
      `<option value="__litter__" ${!this._selectedPuppyId ? "selected" : ""}>Nestdossier</option>`,
      ...puppies.map((puppy) => `<option value="${escapeHtml(puppy.id)}" ${puppy.id === this._selectedPuppyId ? "selected" : ""}>${escapeHtml(puppy.name || "Pup")}</option>`),
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
          .form-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}label{display:block;font-size:12px;color:var(--secondary-text-color);margin-bottom:10px}label input,label select,label textarea{margin-top:5px;color:var(--primary-text-color)}.optional{font-weight:400;opacity:.75}.form-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:4px}
          .timeline-head{display:flex;justify-content:space-between;align-items:end;gap:10px;margin:16px 0 8px}.timeline-title{font-size:16px;font-weight:650}.timeline-sub{font-size:11px;color:var(--secondary-text-color);margin-top:2px}.toggle{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--secondary-text-color);cursor:pointer}.toggle input{width:16px;min-height:16px;margin:0;padding:0}
          .timeline{display:flex;flex-direction:column}.record{position:relative;display:grid;grid-template-columns:38px minmax(0,1fr);gap:10px;padding:12px 0}.record:not(:last-child){border-bottom:1px solid var(--divider-color)}.record.deleted{opacity:.62}.record-icon{width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:var(--secondary-background-color);color:var(--primary-color)}.record-icon ha-icon{--mdc-icon-size:20px}.record-body{min-width:0}.record-top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.record-heading{display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0}.record-heading strong{font-size:14px}.record time{font-size:11px;color:var(--secondary-text-color);white-space:nowrap}.type-badge,.deleted-badge{font-size:10px;padding:2px 6px;border-radius:999px;background:var(--secondary-background-color);color:var(--secondary-text-color)}.deleted-badge{color:var(--error-color)}.record-note{margin-top:6px;white-space:pre-wrap;line-height:1.42;font-size:13px}.record-actions{display:flex;gap:2px;margin-top:6px;flex-wrap:wrap}
          .message{font-size:12px;margin:8px 0;padding:8px 10px;border-radius:10px;background:var(--secondary-background-color)}.error{color:var(--error-color);background:color-mix(in srgb,var(--error-color) 10%,transparent)}.status{color:var(--secondary-text-color)}
          @container dossier-card (max-width:620px){.top{flex-direction:column}.selectors{width:100%;justify-content:stretch}.selectors select{max-width:none;flex:1}.toolbar{align-items:flex-end}.owner{flex:1;flex-direction:column;align-items:stretch;gap:3px}.owner select{min-width:0}.tools{flex:0 0 auto}.form-grid{grid-template-columns:1fr}.record-top{flex-direction:column;gap:3px}.record time{white-space:normal}}
          @container dossier-card (max-width:430px){ha-card{padding:13px}.toolbar{flex-direction:column;align-items:stretch}.tools{justify-content:space-between}.tools button.primary{flex:1}.timeline-head{align-items:flex-start;flex-direction:column}.record{grid-template-columns:32px minmax(0,1fr)}.record-icon{width:30px;height:30px}.record-icon ha-icon{--mdc-icon-size:18px}}
        </style>
        <div class="top">
          <div><div class="title">${escapeHtml(this._config.title || "Puppydossier")}</div><div class="subtitle">${escapeHtml(litter?.name || (this._loading ? "Laden…" : "Geen nest"))}</div></div>
          <div class="selectors">${litterSelector}</div>
        </div>
        <div class="toolbar">
          <div class="owner"><label for="owner-select">Dossier van</label><select id="owner-select" ${!litter ? "disabled" : ""}>${ownerOptions}</select></div>
          <div class="tools">
            ${this._canManage ? `<button class="primary" id="add-record" ${this._saving || !litter ? "disabled" : ""}><ha-icon icon="mdi:plus"></ha-icon> Toevoegen</button>` : ""}
          </div>
        </div>
        ${this._error ? `<div class="message error">${escapeHtml(this._error)}</div>` : ""}
        ${this._status ? `<div class="message status">${escapeHtml(this._status)}</div>` : ""}
        ${this._renderProfileNote()}
        ${this._renderEditor()}
        <div class="timeline-head">
          <div><div class="timeline-title">Tijdlijn</div><div class="timeline-sub">${escapeHtml(ownerName)} · ${records.filter((item) => !item.deleted).length} actieve ${records.filter((item) => !item.deleted).length === 1 ? "vermelding" : "vermeldingen"}</div></div>
          ${this._canManage ? `<label class="toggle"><input id="show-deleted" type="checkbox" ${this._showDeleted ? "checked" : ""}> Verwijderde tonen</label>` : ""}
        </div>
        ${this._loading ? `<div class="empty">Dossier laden…</div>` : records.length ? `<div class="timeline">${records.map((record) => this._renderRecord(record)).join("")}</div>` : `<div class="empty">Nog geen dossieritems voor ${escapeHtml(ownerName)}.${this._canManage ? " Voeg de eerste vermelding toe." : ""}</div>`}
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
        this._error = err?.message || "Verwijderde dossieritems konden niet worden geladen.";
      } finally {
        this._loading = false;
        this._render();
      }
    });

    for (const button of this.shadowRoot.querySelectorAll(".edit-record")) {
      button.addEventListener("click", () => {
        const record = records.find((item) => item.id === button.dataset.id);
        if (record) this._startEdit(record);
      });
    }
    for (const button of this.shadowRoot.querySelectorAll(".delete-record")) {
      button.addEventListener("click", () => {
        const record = records.find((item) => item.id === button.dataset.id);
        if (record) this._deleteRecord(record);
      });
    }
    for (const button of this.shadowRoot.querySelectorAll(".restore-record")) {
      button.addEventListener("click", () => {
        const record = records.find((item) => item.id === button.dataset.id);
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
    description: "Profielnotities en chronologische dossieritems voor nesten en pups.",
  });
}
