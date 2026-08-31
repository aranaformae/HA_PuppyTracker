import { escapeHtml, fetchLitterData, languageForHass, localize } from "./puppy-tracker-card-common.js";
import { requiredFieldsMessage } from "./puppy-tracker-dossier-schema.js";

const DOSSIER_TAG = "puppy-tracker-dossier-card";
const MOTHER_OWNER = "__mother__";

function copy(card, nl, en) {
  return languageForHass(card?._hass) === "en" ? en : nl;
}

async function fetchMotherRecords(hass, litterId, historyScope = "current", includeDeleted = false) {
  return hass.callWS({
    type: "puppy_tracker/mother/records",
    litter_id: litterId,
    history_scope: historyScope,
    include_deleted: Boolean(includeDeleted),
  });
}

async function motherCall(hass, action, litterId, payload = {}) {
  return hass.callWS({
    type: `puppy_tracker/mother/${action}`,
    litter_id: litterId,
    ...payload,
  });
}

function patchMotherDossier() {
  const Card = customElements.get(DOSSIER_TAG);
  if (!Card || Card.prototype.__puppyTrackerMotherDossierPatched) return;

  const originalLoad = Card.prototype._loadLitterAndRecords;
  const originalSelectOwner = Card.prototype._selectOwner;
  const originalSaveRecord = Card.prototype._saveRecord;
  const originalDeleteRecord = Card.prototype._deleteRecord;
  const originalRestoreRecord = Card.prototype._restoreRecord;
  const originalStartProfileEdit = Card.prototype._startProfileEdit;
  const originalSaveProfileNote = Card.prototype._saveProfileNote;
  const originalRenderProfileNote = Card.prototype._renderProfileNote;
  const originalRender = Card.prototype._render;

  Card.prototype._loadLitterAndRecords = async function (render = true) {
    if (!this.__motherSelected) return originalLoad.call(this, render);
    if (!this._hass || !this._selectedLitterId) {
      this._litterData = null;
      this._recordData = null;
      if (render) this._render();
      return;
    }
    this._litterData = await fetchLitterData(this._hass, this._selectedLitterId);
    this._selectedPuppyId = null;
    this.__motherHistoryScope = this.__motherHistoryScope || "current";
    this._recordData = await fetchMotherRecords(
      this._hass,
      this._selectedLitterId,
      this.__motherHistoryScope,
      this._showDeleted && Boolean(this._litterData?.can_manage_records),
    );
    if (!this._recordData?.can_manage_records) this._showDeleted = false;
    if (render) this._render();
  };

  Card.prototype._selectOwner = async function (value) {
    if (value !== MOTHER_OWNER) {
      this.__motherSelected = false;
      return originalSelectOwner.call(this, value);
    }
    this.__motherSelected = true;
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
      this._error = err?.message || copy(this, "Moederdossier kon niet worden geladen.", "Mother dossier could not be loaded.");
    } finally {
      this._loading = false;
      this._render();
    }
  };

  Card.prototype._saveRecord = async function () {
    if (!this.__motherSelected) return originalSaveRecord.call(this);
    if (!this._editor || !this._canManage || this._saving) return;
    const typeInput = this.shadowRoot?.getElementById("record-type");
    const occurredInput = this.shadowRoot?.getElementById("record-occurred");
    const titleInput = this.shadowRoot?.getElementById("record-title");
    const noteInput = this.shadowRoot?.getElementById("record-note");
    const occurred = occurredInput?.value ? new Date(occurredInput.value) : null;
    if (!occurred || !Number.isFinite(occurred.getTime())) {
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
      occurred_at: occurred.toISOString(),
      title: titleInput?.value?.trim() || null,
      note: noteInput?.value?.trim() || null,
      data: recordData,
    };
    this._saving = true;
    this._error = "";
    this._render();
    try {
      if (this._editor.mode === "edit") {
        await motherCall(this._hass, "record/update", this._selectedLitterId, {
          record_id: this._editor.id,
          ...payload,
        });
        this._status = localize(this._hass, "dossierItemUpdated");
      } else {
        await motherCall(this._hass, "record/add", this._selectedLitterId, payload);
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
  };

  Card.prototype._deleteRecord = async function (record) {
    if (!this.__motherSelected) return originalDeleteRecord.call(this, record);
    if (!this._canManage || this._saving) return;
    const title = record.title || record.type || copy(this, "dossieritem", "dossier item");
    if (!window.confirm(localize(this._hass, "confirmDeleteRecord", { title }))) return;
    this._saving = true;
    this._error = "";
    this._render();
    try {
      await motherCall(this._hass, "record/delete", this._selectedLitterId, { record_id: record.id });
      this._status = localize(this._hass, "dossierItemDeleted");
      await this._loadLitterAndRecords(false);
    } catch (err) {
      this._error = err?.message || localize(this._hass, "dossierItemCouldNotDelete");
    } finally {
      this._saving = false;
      this._render();
    }
  };

  Card.prototype._restoreRecord = async function (record) {
    if (!this.__motherSelected) return originalRestoreRecord.call(this, record);
    if (!this._canManage || this._saving) return;
    this._saving = true;
    this._error = "";
    this._render();
    try {
      await motherCall(this._hass, "record/restore", this._selectedLitterId, { record_id: record.id });
      this._status = localize(this._hass, "dossierItemRestored");
      await this._loadLitterAndRecords(false);
    } catch (err) {
      this._error = err?.message || localize(this._hass, "dossierItemCouldNotRestore");
    } finally {
      this._saving = false;
      this._render();
    }
  };

  Card.prototype._startProfileEdit = function () {
    if (!this.__motherSelected) return originalStartProfileEdit.call(this);
    if (!this._canManage) return;
    this._editor = null;
    this._profileEditing = true;
    this._status = "";
    this._render();
    queueMicrotask(() => this.shadowRoot?.getElementById("profile-note")?.focus());
  };

  Card.prototype._saveProfileNote = async function () {
    if (!this.__motherSelected) return originalSaveProfileNote.call(this);
    if (!this._canManage || this._saving) return;
    const input = this.shadowRoot?.getElementById("profile-note");
    const profileNote = input?.value?.trim() || null;
    this._saving = true;
    this._error = "";
    this._render();
    try {
      await motherCall(this._hass, "profile_note/update", this._selectedLitterId, { profile_note: profileNote });
      this._profileEditing = false;
      this._status = localize(this._hass, "profileNoteSaved");
      this._saving = false;
      await this._loadLitterAndRecords(false);
    } catch (err) {
      this._saving = false;
      this._error = err?.message || localize(this._hass, "profileNoteCouldNotSave");
    }
    this._render();
  };

  Card.prototype._renderProfileNote = function () {
    if (!this.__motherSelected) return originalRenderProfileNote.call(this);
    if (this._config.show_profile_note === false) return "";
    const note = this._recordData?.owner?.profile_note || "";
    const title = copy(this, "Moederprofiel", "Mother profile");
    const hint = copy(this, "Doorlopende notitie voor deze moederhond.", "Persistent note for this mother.");
    if (this._profileEditing) {
      return `<section class="panel profile-panel"><div class="panel-head"><div><div class="panel-title">${escapeHtml(title)}</div><div class="hint">${escapeHtml(hint)}</div></div></div><textarea id="profile-note" rows="4">${escapeHtml(note)}</textarea><div class="form-actions"><button class="secondary" id="profile-cancel" ${this._saving ? "disabled" : ""}>${escapeHtml(localize(this._hass, "cancel"))}</button><button class="primary" id="profile-save" ${this._saving ? "disabled" : ""}>${escapeHtml(localize(this._hass, "save"))}</button></div></section>`;
    }
    return `<section class="panel profile-panel"><div class="panel-head"><div><div class="panel-title">${escapeHtml(title)}</div><div class="hint">${escapeHtml(hint)}</div></div>${this._canManage ? `<button class="icon-button" id="profile-edit" title="${escapeHtml(copy(this, "Moederprofiel aanpassen", "Edit mother profile"))}"><ha-icon icon="mdi:pencil"></ha-icon></button>` : ""}</div>${note ? `<div class="profile-text">${escapeHtml(note)}</div>` : `<div class="empty compact">${escapeHtml(copy(this, "Nog geen profielnotitie.", "No profile note yet."))}</div>`}</section>`;
  };

  Card.prototype._render = function (...args) {
    const result = originalRender.apply(this, args);
    const root = this.shadowRoot;
    if (!root) return result;
    const litter = this._litterData?.litter;
    const ownerSelect = root.getElementById("owner-select");
    if (ownerSelect && litter?.mother) {
      let option = Array.from(ownerSelect.options).find((item) => item.value === MOTHER_OWNER);
      if (!option) {
        option = document.createElement("option");
        option.value = MOTHER_OWNER;
        option.textContent = `${copy(this, "Moederhond", "Mother")} · ${litter.mother}`;
        ownerSelect.insertBefore(option, ownerSelect.options[1] || null);
      }
      if (this.__motherSelected) ownerSelect.value = MOTHER_OWNER;
    }

    if (this.__motherSelected) {
      const owner = root.querySelector(".owner");
      if (owner && !root.getElementById("mother-history-scope")) {
        const filter = document.createElement("select");
        filter.id = "mother-history-scope";
        filter.setAttribute("aria-label", copy(this, "Moederhistorie filter", "Mother history filter"));
        filter.innerHTML = `<option value="current">${escapeHtml(copy(this, "Huidig nest", "Current litter"))}</option><option value="all">${escapeHtml(copy(this, "Alle nesten", "All litters"))}</option>`;
        filter.value = this.__motherHistoryScope || "current";
        filter.addEventListener("change", async (event) => {
          this.__motherHistoryScope = event.target.value;
          this._loading = true;
          this._render();
          try { await this._loadLitterAndRecords(false); this._error = ""; }
          catch (err) { this._error = err?.message || copy(this, "Moederhistorie kon niet worden geladen.", "Mother history could not be loaded."); }
          finally { this._loading = false; this._render(); }
        });
        owner.append(filter);
      }
      const title = root.querySelector(".subtitle");
      if (title && this._recordData?.owner?.name) title.textContent = `${copy(this, "Moederdossier", "Mother dossier")}: ${this._recordData.owner.name}`;
      const editorHint = root.querySelector(".editor-panel .hint");
      if (editorHint && this._recordData?.owner?.name) editorHint.textContent = this._recordData.owner.name;
      if ((this.__motherHistoryScope || "current") === "all") {
        const records = this._recordData?.records || [];
        root.querySelectorAll(".record").forEach((element, index) => {
          const litterName = records[index]?.litter_name;
          const heading = element.querySelector(".record-heading");
          if (!litterName || !heading || heading.querySelector(".mother-litter-badge")) return;
          const badge = document.createElement("span");
          badge.className = "type-badge mother-litter-badge";
          badge.textContent = litterName;
          heading.append(badge);
        });
      }
    }
    return result;
  };

  Card.prototype.__puppyTrackerMotherDossierPatched = true;
}

if (customElements.get(DOSSIER_TAG)) patchMotherDossier();
else customElements.whenDefined(DOSSIER_TAG).then(patchMotherDossier);
