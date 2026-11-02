import { OWNER_EDITOR_SECTIONS, TAG, numericAmount, text } from "./puppy-tracker-owner-common.js";
import { bindOwnerOverview, bindOwnerRows, captureEditorGroups, filterSummary, ownerErrorMarkup, ownerFilters, ownerList, pickupAgenda, refreshOwnerResults, renderOwnerForm, selectVisibleOwners, updateDuplicateWarning } from "./puppy-tracker-owner-contacts.js";
import { downloadOwnersCsv } from "./puppy-tracker-owner-csv.js";
import { syncPaymentStatus, updateFinalPaymentPreview } from "./puppy-tracker-owner-finance.js";
import { detailLitter, linkSection, matchesPlacementFilter, ownerForLitter } from "./puppy-tracker-owner-placements.js";
import { renderPreferenceMatrix, selectMatrixCell } from "./puppy-tracker-owner-preferences.js";
import { puppySelectorLabel, escapeHtml, languageForHass, preserveScrollPosition, subscribeUpdates } from "./puppy-tracker-card-common.js";
import { FormState, SavedRecordRefresh, bindSaveFeedback, appendEditAction } from "./puppy-tracker-form-state.js";

class PuppyTrackerOwnerCard extends HTMLElement {
  constructor() {
    super();
    this._config = {};
    this._hass = null;
    this._owners = [];
    this._litters = [];
    this._puppies = [];
    this._selectedPuppy = "";
    this._selectedLitter = "";
    this._activeView = null;
    this._matrixOnlyConflicts = false;
    this._matrixSelectedPuppy = "";
    this._matrixSelectedOwner = "";
    this._matrixPerspective = "puppy";
    this._matrixSelection = null;
    this._editing = null;
    this._expandedOwnerId = null;
    this._ownerGroups = new Map();
    this._duplicateIndexes = new WeakMap();
    this._editorGroups = { contact: true };
    this._showOwnerEditor = false;
    this._status = "";
    this._error = "";
    this._loaded = false;
    this._loading = false;
    this._busy = false;
    this._formState = new FormState(this);
    this._linkFormState = new FormState(this);
    this._ownerScope = null;
    this._ownerSearch = "";
    this._placementFilter = "active";
    this._ownerSort = "name";
    this._pickupAgendaOpen = false;
    this._detailLitters = new Map();
    this._editingLitter = "";
    this._editingContact = null;
    this._paymentDraft = null;
    this._linkBaseline = null;
    this._conflict = false;
    this._context = null;
    this._principal = null;
    this._loadSequence = 0;
    this._refreshDeferred = false;
    this._refreshTimer = null;
    this._unsubscribe = null;
    this._subscriptionPending = null;
    this._connectionListeners = null;
    this._focusOut = () => this._scheduleRefresh();
    this._savedRefresh = new SavedRecordRefresh(this,
      () => this._load(true, { background: true, propagate: true }), () => this._context);
  }

  static getStubConfig() { return { title: "", default_view: "owners", csv_delimiter: "comma" }; }
  static getConfigForm() {
    const configCard = { _hass: document.querySelector("home-assistant")?.hass || null };
    return { schema: [
      { name: "title", selector: { text: {} } },
      { name: "default_view", selector: { select: { mode: "dropdown", options: [
        { value: "owners", label: text(configCard, "ownersView") },
        { value: "matrix", label: text(configCard, "matrixView") },
      ] } } },
      { name: "csv_delimiter", selector: { select: { mode: "dropdown", options: [
        { value: "comma", label: text(configCard, "csvComma") },
        { value: "semicolon", label: text(configCard, "csvSemicolon") },
      ] } } },
    ] };
  }

  setConfig(config) {
    const previousDefaultView = this._config?.default_view;
    const nextConfig = { ...PuppyTrackerOwnerCard.getStubConfig(), ...config };
    if (!["owners", "matrix"].includes(nextConfig.default_view)) nextConfig.default_view = "owners";
    this._config = nextConfig;
    if (!this._activeView || previousDefaultView !== nextConfig.default_view) {
      this._activeView = nextConfig.default_view;
    }
    this._render();
    if (this._hass && this.isConnected && !this._loaded) this._queueRefresh();
  }

  set hass(value) {
    const previous = this._context;
    const wasBusy = this._busy;
    const privateChanged = this._principal && (this._principal.user !== value?.user?.id || this._principal.admin !== value?.user?.is_admin);
    this._principal = { user: value?.user?.id, admin: value?.user?.is_admin };
    const changed = !previous || previous.connection !== value?.connection
      || previous.user !== value?.user?.id || previous.admin !== value?.user?.is_admin;
    this._hass = value;
    if (changed) {
      this._stopConnection();
      this._invalidateLoads();
      this._context = { connection: value?.connection, user: value?.user?.id, admin: value?.user?.is_admin };
      if (privateChanged) this._clearPrivateState();
      if (privateChanged || wasBusy || value?.user?.is_admin === false) this._render();
    }
    if (!value || value.user?.is_admin === false) return;
    if (!this.isConnected) return;
    if (changed) this._updateActionState();
    this._watchConnection();
    this._subscribe();
    if (changed || !this._loaded) this._queueRefresh();
  }

  connectedCallback() {
    this.addEventListener("focusout", this._focusOut);
    if (!this._hass || this._hass.user?.is_admin === false) return;
    this._context ||= { connection: this._hass.connection, user: this._hass.user?.id, admin: this._hass.user?.is_admin };
    this._updateActionState();
    this._watchConnection();
    this._subscribe();
    this._queueRefresh();
  }

  disconnectedCallback() {
    const wasBusy = this._busy;
    this.removeEventListener("focusout", this._focusOut);
    this._stopConnection();
    this._invalidateLoads();
    if (wasBusy) this._render();
    else this._updateActionState();
  }

  _isCurrent(context) {
    return Boolean(context) && this.isConnected && context === this._context && this._hass
      && context.connection === this._hass.connection && context.user === this._hass.user?.id
      && context.admin === this._hass.user?.is_admin && context.admin !== false && context.connection?.connected !== false;
  }

  _invalidateLoads() {
    this._context = null;
    this._loadSequence += 1;
    this._loading = false;
    this._loaded = false;
    this._busy = false;
    this._savedRefresh.reset();
    clearTimeout(this._refreshTimer);
    this._refreshTimer = null;
    this._refreshDeferred = false;
  }

  _clearPrivateState() {
    this._formState.reset();
    this._linkFormState.reset();
    this._owners = [];
    this._puppies = [];
    this._litters = [];
    this._ownerGroups.clear();
    this._duplicateIndexes = new WeakMap();
    this._editorGroups = { contact: true };
    this._detailLitters.clear();
    this._editing = null;
    this._editingContact = null;
    this._editingLitter = "";
    this._paymentDraft = null;
    this._linkBaseline = null;
    this._showOwnerEditor = false;
    this._expandedOwnerId = null;
    this._matrixSelection = null;
    this._ownerScope = null;
    this._ownerSearch = "";
    this._placementFilter = "active";
    this._ownerSort = "name";
    this._lastSavedOwnerId = null;
    this._pickupAgendaOpen = false;
    this._lastSavedLitter = "";
    this._selectedLitter = "";
    this._selectedPuppy = "";
    this._matrixSelectedOwner = "";
    this._matrixSelectedPuppy = "";
    this._status = "";
    this._error = "";
    this._conflict = false;
    this._paymentBeforeFull = null;
  }

  _stopSubscription() {
    const unsubscribe = this._unsubscribe;
    this._unsubscribe = null;
    this._subscriptionPending = null;
    if (unsubscribe) Promise.resolve().then(unsubscribe).catch(() => undefined);
  }

  _stopConnection() {
    this._stopSubscription();
    const listeners = this._connectionListeners;
    if (!listeners) return;
    listeners.connection.removeEventListener?.("ready", listeners.ready);
    listeners.connection.removeEventListener?.("disconnected", listeners.disconnected);
    this._connectionListeners = null;
  }

  _watchConnection() {
    const connection = this._hass?.connection;
    if (!connection || this._connectionListeners) return;
    const ready = () => {
      if (this._hass?.connection !== connection || !this.isConnected || this._hass.user?.is_admin === false) return;
      this._context ||= { connection, user: this._hass.user?.id, admin: this._hass.user?.is_admin };
      this._updateActionState();
      this._subscribe();
      this._queueRefresh();
    };
    const disconnected = () => {
      const wasBusy = this._busy;
      this._stopSubscription();
      this._invalidateLoads();
      if (wasBusy) this._render();
      else this._updateActionState();
    };
    connection.addEventListener?.("ready", ready);
    connection.addEventListener?.("disconnected", disconnected);
    this._connectionListeners = { connection, ready, disconnected };
  }

  async _subscribe() {
    const context = this._context;
    if (!this._isCurrent(context) || !context.connection?.subscribeMessage || this._unsubscribe || this._subscriptionPending) return;
    const pending = {};
    this._subscriptionPending = pending;
    try {
      const unsubscribe = await subscribeUpdates(this._hass, () => {
        if (this._isCurrent(context)) this._queueRefresh();
      });
      if (this._isCurrent(context) && this._subscriptionPending === pending) this._unsubscribe = unsubscribe;
      else await unsubscribe?.();
    } catch (_error) {
      // A later hass update or connection-ready signal retries the subscription.
    } finally {
      if (this._subscriptionPending === pending) this._subscriptionPending = null;
    }
  }

  get _showEditor() { return this._showOwnerEditor || this._linkFormState.dirty; }

  _interactionActive() {
    const active = this.getRootNode().activeElement;
    return this._showEditor || this.contains(active) && active?.matches("input,select,textarea");
  }

  _queueRefresh() {
    this._refreshDeferred = true;
    this._scheduleRefresh();
  }

  _scheduleRefresh() {
    if (this._refreshTimer !== null || !this._refreshDeferred || !this._isCurrent(this._context)) return;
    this._refreshTimer = setTimeout(() => {
      this._refreshTimer = null;
      if (!this._refreshDeferred || this._busy || this._loading || this._interactionActive()) return;
      this._refreshDeferred = false;
      this._load(true, { background: true });
    }, 0);
  }

  getCardSize() { return 7; }
  getGridOptions() { return { columns: 12, min_columns: 6 }; }

  async _load(force = false, { background = false, propagate = false, render = true, allowEditing = false } = {}) {
    const context = this._context;
    if (!this._isCurrent(context) || (this._loading && !force) || (this._loaded && !force)) return false;
    const hass = this._hass;
    const sequence = ++this._loadSequence;
    const current = () => this._isCurrent(context) && sequence === this._loadSequence;
    let changed = false;
    this._loading = true;
    try {
      const [ownerResult, litterResult] = await Promise.all([
        hass.callWS({ type: "puppy_tracker/owners/list" }),
        hass.callWS({ type: "puppy_tracker/litters" }),
      ]);
      if (!current()) return false;
      const owners = ownerResult?.owners || [];
      const litters = (litterResult?.litters || []).map(({ summary, growth_analysis, ...litter }) => litter);
      const data = await Promise.all(litters.map(async (litter) => {
        const result = await hass.callWS({ type: "puppy_tracker/data", litter_id: litter.id });
        const litterDetails = result?.litter || litter;
        return (result?.puppies || []).map((puppy) => ({
          ...Object.fromEntries(["id", "name", "registered_name", "collar_color", "coat_color", "breed", "sex", "birth_time", "chip_number", "owner_ids"]
            .map((field) => [field, puppy[field]])),
          litter_id: litter.id,
          litter_name: litterDetails.name || text(this, "litter"),
          litter_birth_date: litterDetails.birth_date,
          mother: litterDetails.mother,
          mother_details: litterDetails.mother_details || {},
          father: litterDetails.father,
          father_details: litterDetails.father_details || {},
        }));
      }));
      if (!current()) return false;
      if (!allowEditing && this._interactionActive()) {
        this._refreshDeferred = true;
        return false;
      }
      changed = !this._loaded || Boolean(this._error) || this._savedRefresh.failedContext === context
        || JSON.stringify([owners, litters, data.flat()]) !== JSON.stringify([this._owners, this._litters, this._puppies]);
      this._owners = owners;
      this._litters = litters;
      this._puppies = data.flat();
      if (!this._litters.some((litter) => litter.id === this._selectedLitter)) {
        this._selectedLitter = this._litters.find((litter) => litter.active !== false)?.id || this._litters[0]?.id || "";
      }
      if (this._ownerScope === null) this._ownerScope = this._litters.find((litter) => litter.active !== false)?.id || "__unassigned__";
      if (!["__all__", "__unassigned__"].includes(this._ownerScope) && !this._litters.some((litter) => litter.id === this._ownerScope)) this._ownerScope = "__all__";
      const selectedLitterPuppies = this._puppies.filter((puppy) => puppy.litter_id === this._selectedLitter);
      if (!selectedLitterPuppies.some((puppy) => puppy.id === this._matrixSelectedPuppy)) {
        this._matrixSelectedPuppy = selectedLitterPuppies[0]?.id || "";
      }
      this._loaded = true;
      if (!this._conflict) this._error = "";
      this._savedRefresh.refreshed();
      if (this._expandedOwnerId && !this._owners.some((owner) => owner.id === this._expandedOwnerId)) this._expandedOwnerId = null;
      return true;
    } catch (error) {
      if (!current()) return false;
      if (propagate) throw error;
      this._error = error?.message || String(error);
      const message = this.querySelector("#owner-error");
      if (message) message.textContent = this._error;
      return false;
    } finally {
      if (current()) {
        this._loading = false;
        if (render && !this._busy && (!background || changed) && !this._interactionActive()) this._render();
        this._scheduleRefresh();
      }
    }
  }

  async _runMutation(message, saved) {
    const context = this._context;
    if (this._busy || !this._isCurrent(context) || this._conflict) return;
    this._loadSequence += 1;
    this._loading = false;
    this._busy = true;
    this._error = "";
    this._status = "";
    this._saveFailed = false;
    this._savedRefresh.reset();
    this._render();
    try {
      const result = await this._hass.callWS(message);
      if (!this._isCurrent(context)) return;
      saved(result);
      this._refreshDeferred = false;
      // Keep the confirmed write separate from its fallible follow-up read.
      await this._savedRefresh.run();
    } catch (error) {
      if (!this._isCurrent(context)) return;
      this._conflict = error?.code === "owner_conflict";
      this._saveFailed = !this._conflict;
      this._error = this._conflict ? text(this, "changedElsewhere")
        : error?.code === "owner_linked" ? text(this, "unlinkBeforeDelete") : error?.message || String(error);
    } finally {
      if (this._isCurrent(context)) {
        this._busy = false;
        this._render();
        this._scheduleRefresh();
      }
    }
  }

  _updateActionState() {
    const blocked = this._busy || this._conflict || !this._isCurrent(this._context);
    bindSaveFeedback(this, '.owner-editor button[type="submit"]', { busy: this._busy, failed: this._saveFailed && this._error && !this._conflict });
    this.querySelectorAll('button[type="submit"], #add-owner, [data-edit], [data-edit-owner-section], [data-mark-paid], [data-add-dossier], [data-matrix-edit-owner], [data-add-payment], [data-void-payment], [data-cancel-payment]')
      .forEach((button) => { button.disabled = blocked; });
    this.querySelectorAll("[data-delete], [data-assign-owner]").forEach((button) => { button.disabled = blocked || this._showEditor; });
    this.querySelectorAll("[data-copy-owner-contact]").forEach((button) => { button.disabled = blocked; });
    this.querySelectorAll("[data-open-duplicate-owner]").forEach((button) => { button.disabled = blocked; });
    this.querySelectorAll("[data-pickup-owner]").forEach((button) => { button.disabled = blocked || this._showOwnerEditor; });
    const link = this.querySelector("#link-save");
    if (link) link.disabled = blocked || this._showOwnerEditor || !this._selectedPuppy;
    const reload = this.querySelector("#reload-owner-conflict");
    if (reload) reload.disabled = this._busy || !this._isCurrent(this._context);
    const csv = this.querySelector("#export-owners-csv");
    if (csv) csv.disabled = blocked || this._showEditor || !this._owners.length;
    this.querySelectorAll("#owners-view, #matrix-view").forEach((button) => { button.disabled = this._busy || this._showOwnerEditor; });
  }

  async _reloadConflict() {
    if (this._busy || !this._formState.confirmDiscard() || !this._linkFormState.confirmDiscard()) return;
    const context = this._context;
    this._busy = true;
    this._render();
    try {
      if (!await this._load(true, { render: false, allowEditing: true }) || !this._isCurrent(context)) return;
      this._formState.reset();
      this._linkFormState.reset();
      this._linkBaseline = null;
      this._editingContact = this._owners.find((owner) => owner.id === this._editing) || null;
      if (this._editing && !this._editingContact) { this._editing = null; this._showOwnerEditor = false; }
      this._paymentBeforeFull = null;
      this._conflict = false;
      this._error = "";
      this._refreshDeferred = false;
    } finally {
      if (this._isCurrent(context)) { this._busy = false; this._render(); }
    }
  }

  async _save(form) {
    if (this._busy || !this._showOwnerEditor) return;
    this._formState.clearErrors();
    const data = Object.fromEntries(new FormData(form).entries());
    for (const field of ["payment_amount", "registration_fee_amount", "deposit_amount", "payment_balance"]) {
      if (!String(data[field] || "").trim()) continue;
      const amount = numericAmount(data[field]);
      if (amount === null || amount < 0) {
        this._formState.error(`[name="${field}"]`, languageForHass(this._hass) === "en" ? "Enter a valid non-negative amount." : "Vul een geldig bedrag van nul of hoger in.");
        return;
      }
    }
    const total = numericAmount(data.payment_amount);
    const paidCents = Math.round(((numericAmount(data.registration_fee_amount) || 0) + (numericAmount(data.deposit_amount) || 0) + Number.EPSILON) * 100);
    if (total !== null && paidCents > Math.round((total + Number.EPSILON) * 100)) {
      this._formState.error('[name="deposit_amount"]', languageForHass(this._hass) === "en" ? "Registration fee and deposit cannot exceed the total amount." : "Inschrijfgeld en aanbetaling mogen samen niet hoger zijn dan het totaalbedrag.");
      return;
    }
    const puppyPreferences = [];
    const selectedPuppies = new Set();
    let hasEmptyEarlierPreference = false;
    for (let rank = 1; rank <= 3; rank += 1) {
      const puppyField = `preference_puppy_${rank}`;
      const noteField = `preference_note_${rank}`;
      const puppyId = String(data[puppyField] || "").trim();
      const note = String(data[noteField] || "").trim();
      delete data[puppyField];
      delete data[noteField];
      if (!puppyId) {
        hasEmptyEarlierPreference = true;
        if (note) {
          this._formState.error(`[name="${puppyField}"]`, text(this, "selectPuppyForNote"));
          return;
        }
        continue;
      }
      if (hasEmptyEarlierPreference) {
        this._formState.error(`[name="${puppyField}"]`, text(this, "fillEarlierPreference"));
        return;
      }
      if (selectedPuppies.has(puppyId)) {
        this._formState.error(`[name="${puppyField}"]`, text(this, "duplicatePuppyPreference"));
        return;
      }
      puppyPreferences.push({ puppy_id: puppyId, note: note || null });
      selectedPuppies.add(puppyId);
    }
    data.puppy_preferences = puppyPreferences;
    data.litter_id = this._editingLitter || null;
    data.archived = form.elements.archived.checked;
    if (this._editing) {
      data.owner_id = this._editing;
      data.expected_revision = this._editingContact?.revision || "";
    }
    await this._runMutation({ type: "puppy_tracker/owners/save", ...data }, (result) => {
      this._owners = this._owners.filter((owner) => owner.id !== result.owner.id).concat(result.owner);
      this._lastSavedOwnerId = result?.owner?.id || this._editing;
      this._lastSavedLitter = this._editingLitter;
      this._ownerScope = this._editingLitter || "__unassigned__";
      const dossier = ownerForLitter(this, result.owner, this._editingLitter);
      if (!matchesPlacementFilter(this, dossier)) this._placementFilter = dossier.archived ? "archived" : dossier.placement_status || "interested";
      this._formState.reset();
      this._editing = null;
      this._editingContact = null;
      this._showOwnerEditor = false;
      this._status = `${text(this, "saved")} ${data.name || ""}`;
    });
  }

  async _delete(id) {
    if (this._busy || this._showEditor || !window.confirm(text(this, "confirmDelete"))) return;
    const owner = this._owners.find((item) => item.id === id);
    await this._runMutation({ type: "puppy_tracker/owners/delete", owner_id: id, expected_revision: owner?.revision || "" }, () => {
      this._owners = this._owners.filter((item) => item.id !== id);
      this._expandedOwnerId = null;
      this._lastSavedOwnerId = null;
      this._status = text(this, "deleted");
    });
  }

  async _link() {
    if (this._busy || this._showOwnerEditor) return;
    const puppy = this._puppies.find((item) => item.id === this._selectedPuppy);
    if (!puppy) return;
    const ownerIds = [...this.querySelectorAll("input[name=linked_owner]:checked")].map((input) => input.value);
    await this._runMutation({ type: "puppy_tracker/owners/link", litter_id: puppy.litter_id, puppy_id: puppy.id,
      owner_ids: ownerIds, expected_owner_ids: this._linkBaseline?.ownerIds || puppy.owner_ids || [] }, () => {
      puppy.owner_ids = ownerIds;
      this._linkFormState.reset();
      this._linkBaseline = null;
      this._lastSavedOwnerId = null;
      this._status = text(this, "linked");
    });
  }

  async _assignDossier(ownerId, litterId) {
    if (!litterId || this._busy || this._showEditor) return;
    const owner = this._owners.find((item) => item.id === ownerId);
    await this._runMutation({ type: "puppy_tracker/owners/save", owner_id: ownerId, name: owner.name,
      expected_revision: owner.revision || "", litter_id: litterId, move_unassigned: true }, (result) => {
      this._owners = this._owners.map((item) => item.id === ownerId ? result.owner : item);
      this._lastSavedOwnerId = ownerId;
      this._lastSavedLitter = litterId;
      this._ownerScope = litterId;
      this._detailLitters.set(ownerId, litterId);
      this._status = text(this, "linked");
    });
  }

  _switchView(view) {
    if (!["owners", "matrix"].includes(view) || view === this._activeView || this._showOwnerEditor || this._busy) return;
    this._activeView = view;
    this._matrixSelection = null;
    this._status = "";
    if (!this._conflict) this._error = "";
    this._render();
  }

  _changeLitter(litterId, scope = null) {
    if (litterId !== this._selectedLitter && !this._linkFormState.discard()) return false;
    if (litterId !== this._selectedLitter) {
      this._selectedLitter = litterId;
      this._selectedPuppy = "";
      this._matrixSelectedPuppy = "";
      this._matrixSelection = null;
    }
    this._ownerScope = scope ?? (["__all__", "__unassigned__"].includes(this._ownerScope) ? this._ownerScope : litterId);
    this._render();
    this._scheduleRefresh();
    return true;
  }

  _openEditor(ownerId = null, { paidInFull = false, litterId, section = "contact" } = {}) {
    if (this._conflict || !this._formState.discard()) return;
    const contact = this._owners.find((item) => item.id === ownerId);
    this._savedRefresh.reset();
    this._editingContact = contact ? structuredClone(contact) : null;
    const target = paidInFull ? "financial" : Object.hasOwn(OWNER_EDITOR_SECTIONS, section) ? section : "contact";
    this._editorGroups = { [target]: true };
    const scopeLitter = this._litters.some((litter) => litter.id === this._ownerScope) ? this._ownerScope : "";
    const defaultLitter = this._activeView === "matrix" ? this._selectedLitter : contact ? detailLitter(this, contact) : scopeLitter;
    this._editingLitter = litterId ?? defaultLitter;
    this._paymentBeforeFull = null;
    this._lastSavedOwnerId = null;
    this._activeView = "owners";
    this._editing = ownerId;
    this._showOwnerEditor = true;
    this._status = "";
    this._error = "";
    this._render();
    if (paidInFull) {
      this.querySelector('[name="payment_status"]').value = "full";
      syncPaymentStatus(this, true);
    }
    const context = this._context;
    queueMicrotask(() => {
      if (this._isCurrent(context) && this._showOwnerEditor) this.querySelector(`[name="${paidInFull ? "payment_date" : OWNER_EDITOR_SECTIONS[target].field}"]`)?.focus({ preventScroll: true });
    });
  }

  async _savePayment(form) {
    const draft = this._paymentDraft;
    if (!draft || this._busy) return;
    const data = Object.fromEntries(new FormData(form).entries());
    Object.assign(draft, data);
    const amount = Number(data.amount.replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0 || !/^\d+(?:[.,]\d{1,2})?$/.test(data.amount) || !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
      this._error = text(this, "paymentInvalid");
      this._render();
      return;
    }
    const owner = this._owners.find(item => item.id === draft.ownerId);
    await this._runMutation({ type: "puppy_tracker/owners/payment/add", owner_id: draft.ownerId,
      litter_id: draft.litterId, expected_revision: owner?.revision || "", request_id: draft.requestId,
      amount: data.amount, date: data.date, kind: data.kind, method: data.method,
      reference: data.reference, note: data.note }, result => {
      this._owners = this._owners.filter(item => item.id !== result.owner.id).concat(result.owner);
      this._paymentDraft = null;
      this._status = text(this, "paymentSaved");
    });
  }

  async _voidPayment(button) {
    if (this._busy) return;
    const reason = window.prompt(text(this, "voidPaymentPrompt"));
    if (!reason?.trim()) return;
    const owner = this._owners.find(item => item.id === button.dataset.paymentOwner);
    await this._runMutation({ type: "puppy_tracker/owners/payment/void", owner_id: owner?.id,
      litter_id: button.dataset.paymentLitter, payment_id: button.dataset.voidPayment,
      expected_revision: owner?.revision || "", reason: reason.trim() }, result => {
      this._owners = this._owners.filter(item => item.id !== result.owner.id).concat(result.owner);
      this._status = text(this, "paymentVoided");
    });
  }

  _updateOwnerDraftStatus() {
    const status = this.querySelector(".owner-draft-status");
    if (!status) return;
    const message = this._formState.dirty ? text(this, "unsavedChanges") : "";
    if (status.textContent !== message) status.textContent = message;
  }

  _render() {
    preserveScrollPosition(this, () => this._renderContent());
  }

  _renderContent() {
    if (!this._config) return;
    captureEditorGroups(this);
    const listScroll = this.querySelector(".list")?.scrollTop || 0;
    const pickupScroll = this.querySelector(".pickup-list")?.scrollTop || 0;
    this._formState.capture();
    this._linkFormState.capture();
    if (this._hass?.user?.is_admin === false) {
      this.innerHTML = `<ha-card style="display:block;padding:16px"><div role="status">${escapeHtml(text(this, "adminOnly"))}</div></ha-card>`;
      return;
    }
    this.querySelectorAll("[data-owner-group]").forEach((group) => {
      const state = this._ownerGroups.get(group.dataset.groupOwner) || {};
      state[group.dataset.ownerGroup] = group.open;
      this._ownerGroups.set(group.dataset.groupOwner, state);
    });
    const ownerIds = new Set(this._owners.map((owner) => owner.id));
    for (const id of this._ownerGroups.keys()) if (!ownerIds.has(id)) this._ownerGroups.delete(id);
    const litterPuppies = this._puppies.filter((item) => item.litter_id === this._selectedLitter);
    const puppy = litterPuppies.find((item) => item.id === this._selectedPuppy) || litterPuppies[0] || null;
    this._selectedPuppy = puppy?.id || "";
    const linked = new Set(puppy?.owner_ids || []);
    if (!this._linkFormState.dirty) this._linkBaseline = { ownerIds: [...linked] };
    const litterOptions = this._litters.map((litter) => `<option value="${escapeHtml(litter.id)}" ${litter.id === this._selectedLitter ? "selected" : ""}>${escapeHtml(litter.name || text(this, "litter"))}</option>`).join("");
    const puppyOptions = litterPuppies.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === this._selectedPuppy ? "selected" : ""}>${escapeHtml(puppySelectorLabel(item, text(this, "puppy")))}</option>`).join("");

    const ownersView = this._activeView !== "matrix";
    const headerActions = `<div class="head-actions"><button type="button" id="export-owners-csv" class="secondary" ${!this._owners.length || this._loading ? "disabled" : ""}><ha-icon icon="mdi:file-delimited-outline"></ha-icon>${escapeHtml(text(this, "exportCsv"))}</button>${ownersView && !this._showOwnerEditor ? renderOwnerForm(this) : ""}</div>`;
    const viewTabs = `<div class="view-tabs" role="tablist" aria-label="${escapeHtml(text(this, "title"))}"><button type="button" id="owners-view" role="tab" aria-selected="${ownersView}" class="${ownersView ? "active" : ""}"><ha-icon icon="mdi:account-multiple-outline"></ha-icon>${escapeHtml(text(this, "ownersView"))}</button><button type="button" id="matrix-view" role="tab" aria-selected="${!ownersView}" class="${ownersView ? "" : "active"}" ${this._showOwnerEditor ? "disabled" : ""}><ha-icon icon="mdi:table-large"></ha-icon>${escapeHtml(text(this, "matrixView"))}</button></div>`;
    const visibleOwners = ownersView ? selectVisibleOwners(this) : [];
    const ownersContent = ownersView ? `${this._showOwnerEditor ? renderOwnerForm(this) : ""}${ownerFilters(this)}<div class="owner-filter-summary">${filterSummary(this, visibleOwners)}</div><details class="pickup-agenda" ${this._pickupAgendaOpen ? "open" : ""}>${pickupAgenda(this, visibleOwners)}</details><section class="list" aria-live="polite">${ownerList(this, visibleOwners)}</section>${linkSection(this, litterPuppies, puppy, linked, litterOptions, puppyOptions)}` : "";
    const content = ownersView ? ownersContent : renderPreferenceMatrix(this);
    const subtitle = text(this, ownersView ? "subtitle" : "matrixSubtitle");
    this.innerHTML = `<ha-card><div class="head"><div><div class="title">${escapeHtml(this._config.title || text(this, "title"))}</div><div class="sub">${escapeHtml(subtitle)}</div></div>${headerActions}</div>${viewTabs}${content}${this._showOwnerEditor ? "" : ownerErrorMarkup(this)}<div id="owner-status" class="message" role="status" aria-live="polite">${escapeHtml(this._status)}</div></ha-card><style>
      :host{display:block}
      ha-card{padding:16px;container-type:inline-size;container-name:owner-card}
      .head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
      .head-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end}
      .title{font-size:1.25rem;font-weight:700}
      .sub{font-size:.85rem;color:var(--secondary-text-color);margin-top:3px}
      .primary,.secondary,.owner-actions button{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:40px;border:1px solid var(--primary-color);border-radius:8px;padding:0 12px;background:var(--primary-color);color:var(--text-primary-color,#fff);font:inherit;font-weight:600;cursor:pointer}
      .secondary,.owner-actions button{background:var(--secondary-background-color);border-color:var(--divider-color);color:var(--primary-text-color)}
      button:disabled{opacity:.55;cursor:default}
      .view-tabs{display:inline-grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:3px;margin-top:14px;padding:3px;border-radius:8px;background:var(--secondary-background-color)}
      .view-tabs button{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:38px;padding:0 12px;border:0;border-radius:6px;background:transparent;color:var(--secondary-text-color);font:inherit;font-weight:600;cursor:pointer}
      .view-tabs button.active{background:var(--card-background-color);color:var(--primary-text-color);box-shadow:0 1px 3px rgba(0,0,0,.16)}
      .view-tabs ha-icon{--mdc-icon-size:19px}
      .owner-editor,.link{margin-top:16px;padding-top:14px;border-top:1px solid var(--divider-color)}
      h3{margin:0 0 10px;font-size:1rem;letter-spacing:0}
      .form,.link-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
      .owner-editor-group{min-width:0;border-top:1px solid var(--divider-color)}
      .owner-editor-group summary,.owner-detail-group summary{display:flex;align-items:center;gap:8px;min-height:48px;box-sizing:border-box;list-style:none;cursor:pointer}
      .owner-editor-group summary{padding:4px 0;font-weight:600}
      .owner-editor-group summary::-webkit-details-marker,.owner-detail-group summary::-webkit-details-marker{display:none}
      .owner-section-chevron{flex:0 0 20px;--mdc-icon-size:20px;transform:rotate(-90deg)}
      details[open]>summary>.owner-section-chevron{transform:none}
      .owner-section-title{flex:1;min-width:0;overflow-wrap:anywhere}
      .owner-detail-group summary>.owner-section-title{color:var(--primary-text-color);font-size:inherit;margin:0}
      .owner-section-edit{display:inline-grid;place-items:center;flex:0 0 44px;width:44px;height:44px;padding:0;border:0;border-radius:8px;background:transparent;color:var(--primary-color);cursor:pointer}
      .owner-section-edit ha-icon{--mdc-icon-size:20px}
      .owner-editor-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;min-width:0;padding:4px 0 14px}
      .owner-editor-group summary:focus-visible,.owner-section-edit:focus-visible{outline:2px solid var(--primary-color);outline-offset:2px}
      .owner-draft-status{min-height:20px;line-height:20px;font-size:.8rem;color:var(--warning-color,var(--secondary-text-color))}
      .owner-duplicates{min-width:0;padding:10px;border-left:3px solid var(--warning-color,var(--primary-color));background:var(--secondary-background-color);border-radius:6px;font-size:.8rem}
      .owner-duplicates[hidden]{display:none}
      .owner-duplicate-list{max-height:200px;overflow-y:auto;margin-top:5px}
      .owner-duplicate-match{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:6px 10px;padding:6px 0;min-width:0}
      .owner-duplicate-match>span{min-width:0;overflow-wrap:anywhere}
      .owner-duplicate-match strong,.owner-duplicate-match small{display:block}
      .owner-duplicate-match small{margin-top:3px;color:var(--secondary-text-color)}
      .owner-duplicate-match button{min-height:44px;max-width:100%;white-space:normal;overflow-wrap:anywhere;font-size:inherit}
      .owner-editor-actions{border-top:1px solid var(--divider-color);padding-top:10px}
      .owner-editor-actions button{min-height:44px;min-width:0;white-space:normal;overflow-wrap:anywhere}
      .form label,.link-form label{display:grid;gap:4px;color:var(--secondary-text-color);font-size:.78rem}
      .form input,.form select,.form textarea,.form output,.link-form select{box-sizing:border-box;width:100%;min-height:42px;border:1px solid var(--divider-color);border-radius:8px;background:var(--card-background-color);color:var(--primary-text-color);padding:9px;font:inherit}
      .form output{display:flex;align-items:center;background:var(--secondary-background-color)}
      .form input[readonly]{background:var(--secondary-background-color)}
      .form textarea{min-height:112px;resize:vertical}
      .wide,.checks{grid-column:1/-1}
      .preferences{display:grid;gap:8px}
      .preference-row{min-width:0;margin:0;padding:8px 10px 10px;border:1px solid var(--divider-color);border-radius:8px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
      .preference-row legend{padding:0 5px;color:var(--primary-text-color);font-size:.8rem;font-weight:600}
      .actions{display:flex;gap:8px;justify-content:flex-end;margin-top:10px}
      .list{display:grid;gap:8px;margin-top:16px}
      .list{max-height:600px;overflow-y:auto;scrollbar-gutter:stable}
      .owner-filters{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));align-items:end;gap:10px;margin-top:16px}
      .owner-filter-summary{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin:12px 0;font-size:.85rem}
      .owner-filter-summary small{display:block;color:var(--secondary-text-color);margin-top:3px}
      .pickup-agenda{border-block:1px solid var(--divider-color);margin:12px 0}
      .pickup-agenda summary{padding:14px 0;cursor:pointer;font-weight:600;min-height:44px;box-sizing:border-box}
      .pickup-agenda .sub{margin:0 0 10px}
      .pickup-list{max-height:360px;overflow-y:auto;overflow-anchor:none}
      .pickup-list h4{margin:12px 0 6px;font-size:.9rem}
      .pickup-entry{display:flex;align-items:center;gap:12px;width:100%;text-align:start;padding:12px;margin-bottom:6px;border:1px solid var(--divider-color);border-radius:8px;background:var(--card-background-color);color:var(--primary-text-color);font:inherit;cursor:pointer;overflow-wrap:anywhere}
      .pickup-entry>span:first-child{flex:1;min-width:0;display:grid;gap:4px}
      .pickup-entry small{color:var(--secondary-text-color)}
      .pickup-entry .pickup-past{color:var(--warning-color,#765800)}
      .pickup-edit-label{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
      .owner-filters label,.dossier-select,.assign-dossier label{display:grid;gap:4px;min-width:0;color:var(--secondary-text-color);font-size:.78rem}
      .owner-filters select,.owner-filters input[type=search],.dossier-select select,.assign-dossier select{box-sizing:border-box;width:100%;min-height:42px;padding:8px;border:1px solid var(--divider-color);border-radius:8px;background:var(--card-background-color);color:var(--primary-text-color);font:inherit}
      .form .completed-toggle{display:flex;align-items:center;gap:8px;grid-column:1/-1}
      .completed-toggle input{width:18px;height:18px;min-height:18px;accent-color:var(--primary-color)}
      .dossier-select{margin-bottom:12px}
      .dossier-controls{display:flex;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px}
      .dossier-controls .dossier-select{flex:1 1 160px;margin:0}
      .assign-dossier{display:flex;align-items:end;gap:10px;flex-wrap:wrap;margin-bottom:12px}
      .assign-dossier label{flex:1 1 160px}
      .owner{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;border-top:1px solid var(--divider-color);padding-top:9px}
      .owner-toggle{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0;border:0;background:transparent;color:var(--primary-text-color);padding:5px 2px;text-align:left;font:inherit;cursor:pointer}
      .owner-toggle span{min-width:0}
      .owner-toggle strong,.owner-toggle small{display:block;overflow-wrap:anywhere}
      .owner-toggle small{color:var(--secondary-text-color);margin-top:2px;font-size:.78rem}
      .owner-toggle .owner-dossier-summary{display:flex;flex-wrap:wrap;gap:2px 12px;margin-top:5px;line-height:1.5}
      .owner-dossier-summary>span{overflow-wrap:anywhere}
      .owner-toggle .owner-puppies{color:var(--primary-text-color);margin-top:5px;font-weight:600}
      .owner-actions{display:flex;gap:5px}
      .owner-actions button{width:38px;padding:0}
      .owner-actions ha-icon{--mdc-icon-size:19px}
      .owner-attention{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:6px;min-width:0}
      .owner-attention-action{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:44px;max-width:100%;padding:6px 10px;border:1px solid var(--divider-color);border-radius:6px;background:var(--secondary-background-color);color:var(--warning-color,var(--primary-text-color));font:inherit;font-size:.78rem;text-align:left;overflow-wrap:anywhere;cursor:pointer}
      .owner-attention-action ha-icon{flex:0 0 18px;--mdc-icon-size:18px}
      .owner-attention-action:focus-visible{outline:2px solid var(--primary-color);outline-offset:2px}
      .owner-detail{grid-column:1/-1;min-width:0;font-size:.85rem}
      .owner-detail-group{border-top:1px solid var(--divider-color)}
      .owner-detail-group summary{padding:4px 2px;color:var(--primary-text-color);font-weight:600;overflow-wrap:anywhere}
      .owner-detail-group summary:focus-visible{outline:2px solid var(--primary-color);outline-offset:2px}
      .owner-detail-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;padding:2px 2px 14px}
      .payment-history{display:grid;gap:10px}.payment-history p{margin:0;color:var(--secondary-text-color);font-size:.85rem}.payment-history ul{list-style:none;margin:0;padding:0}.payment-history li{display:flex;justify-content:space-between;align-items:center;gap:10px;border-top:1px solid var(--divider-color);padding:8px 0}.payment-history li>div{min-width:0;overflow-wrap:anywhere}.payment-history li small{display:block;color:var(--secondary-text-color)}.payment-history li.voided{opacity:.65}.payment-event-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.payment-event-form label{display:grid;gap:4px}.payment-event-form .actions{grid-column:1/-1}
      .owner-detail-fields>div{min-width:0;overflow-wrap:anywhere}
      .owner-detail span{display:block;color:var(--secondary-text-color);font-size:.72rem;margin-bottom:3px}
      .owner-detail .wide{grid-column:1/-1}
      .owner-detail .preformatted>div{white-space:pre-wrap;word-break:break-word}
      .owner-detail .notes>div{max-height:none;overflow:visible}
      .owner-contact-row{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;min-width:0}
      .owner-contact-row>.owner-contact-text{min-width:0;margin:0;color:var(--primary-text-color);font-size:inherit;overflow-wrap:anywhere;user-select:text}
      .owner-contact-actions{display:flex;flex-wrap:wrap;gap:2px}
      .owner-contact-action{display:inline-grid;place-items:center;width:44px;height:44px;box-sizing:border-box;padding:0;border:1px solid var(--divider-color);border-radius:6px;background:var(--secondary-background-color);color:var(--primary-color);text-decoration:none;cursor:pointer}
      .owner-contact-action ha-icon{--mdc-icon-size:20px}
      .owner-contact-action:focus-visible{outline:2px solid var(--primary-color);outline-offset:2px}
      .owner-contact-feedback{min-height:20px;color:var(--secondary-text-color);font-size:.78rem}
      .checks{min-width:0;margin:2px 0 0;padding:10px;border:1px solid var(--divider-color);border-radius:8px;display:grid;gap:7px;max-height:260px;overflow-y:auto}
      .checks legend{padding:0 4px;color:var(--secondary-text-color);font-size:.78rem}
      .checks label{display:flex;align-items:center;gap:7px;color:var(--primary-text-color)}
      .empty,.message{color:var(--secondary-text-color);padding:10px 2px}
      .message:empty{display:none}
      .error{color:var(--error-color)}
      .matrix-view{margin-top:14px}
      .matrix-controls{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end}
      .matrix-controls>label:not(.matrix-toggle),.mobile-puppy-select{display:grid;gap:4px;min-width:0;color:var(--secondary-text-color);font-size:.78rem}
      .matrix-controls>label:not(.matrix-toggle){flex:1 1 220px}
      .matrix-controls select,.mobile-puppy-select select{box-sizing:border-box;width:100%;min-height:42px;border:1px solid var(--divider-color);border-radius:8px;background:var(--card-background-color);color:var(--primary-text-color);padding:0 9px;font:inherit}
      .matrix-toggle{display:flex;align-items:center;gap:7px;min-height:42px;color:var(--primary-text-color);font-size:.8rem}
      .matrix-toggle input{width:18px;height:18px;accent-color:var(--primary-color)}
      .matrix-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));margin:14px 0;border-top:1px solid var(--divider-color);border-bottom:1px solid var(--divider-color)}
      .matrix-summary>div{min-width:0;padding:10px;border-right:1px solid var(--divider-color)}
      .matrix-summary>div:last-child{border-right:0}
      .matrix-summary strong,.matrix-summary span{display:block}
      .matrix-summary strong{font-size:1.2rem}
      .matrix-summary span{margin-top:2px;color:var(--secondary-text-color);font-size:.72rem;overflow-wrap:anywhere}
      .matrix-empty-state{margin-top:14px;text-align:center}
      .matrix-scroll{max-height:min(620px,65vh);overflow:auto;overscroll-behavior:contain;scrollbar-gutter:stable;border:1px solid var(--divider-color);border-radius:8px}
      .preference-matrix{border-collapse:separate;border-spacing:0;min-width:100%;width:max-content;background:var(--card-background-color);font-size:.8rem}
      .preference-matrix th,.preference-matrix td{box-sizing:border-box;min-width:104px;height:58px;padding:6px 8px;border-right:1px solid var(--divider-color);border-bottom:1px solid var(--divider-color);text-align:center;vertical-align:middle}
      .preference-matrix tr>*:last-child{border-right:0}
      .preference-matrix tfoot tr>*{border-bottom:0}
      .preference-matrix thead th{position:sticky;top:0;z-index:3;background:var(--card-background-color)}
      .preference-matrix .owner-column{position:sticky;left:0;z-index:2;min-width:160px;max-width:210px;text-align:left;background:var(--card-background-color)}
      .preference-matrix thead .owner-column{z-index:4}
      .preference-matrix tbody .owner-column strong,.preference-matrix tbody .owner-column small{display:block;overflow-wrap:anywhere}
      .preference-matrix tbody .owner-column small{margin-top:2px;color:var(--secondary-text-color);font-weight:400}
      .matrix-puppy{display:flex;align-items:center;justify-content:center;gap:7px;min-width:0}
      .matrix-puppy>span:last-child{min-width:0}
      .matrix-puppy strong,.matrix-puppy small{display:block;overflow-wrap:anywhere}
      .matrix-puppy small{margin-top:2px;color:var(--secondary-text-color);font-weight:400}
      .collar-swatch{display:block;flex:0 0 auto;width:18px;height:18px;border:2px solid var(--card-background-color);border-radius:50%;background:var(--collar-color);box-shadow:0 0 0 1px var(--divider-color)}
      .matrix-cell{position:relative;display:inline-flex;align-items:center;justify-content:center;gap:4px;width:82px;min-height:42px;padding:4px;border:1px solid transparent;border-radius:8px;background:transparent;color:var(--primary-text-color);cursor:pointer}
      .matrix-cell:hover,.matrix-cell.selected,.mobile-match.selected{border-color:var(--primary-color,#039be5);background:color-mix(in srgb,var(--primary-color,#039be5) 10%,transparent)}
      .matrix-cell.conflict,.mobile-match.conflict{border-color:var(--error-color,#db4437)}
      .rank{display:inline-flex;align-items:center;justify-content:center;width:29px;height:29px;border-radius:50%;font-weight:700}
      .rank-1{background:var(--primary-color,#039be5);color:var(--text-primary-color,#fff)}
      .rank-2{border:2px solid var(--primary-color,#039be5);color:var(--primary-color,#039be5)}
      .rank-3{background:var(--secondary-background-color,#f2f2f2);color:var(--primary-text-color,#212121)}
      .cell-icon{--mdc-icon-size:17px;color:var(--secondary-text-color)}
      .linked-icon{color:var(--primary-color,#039be5)}
      .conflict-icon{color:var(--error-color,#db4437)}
      .matrix-cell .conflict-icon{position:absolute;top:1px;right:1px;--mdc-icon-size:14px}
      .matrix-empty{color:var(--disabled-text-color,var(--secondary-text-color))}
      .rank-totals{white-space:nowrap;color:var(--secondary-text-color);font-size:.72rem}
      .rank-totals b{color:var(--primary-text-color)}
      .matrix-mobile{display:none}
      .matrix-layout,.matrix-desktop,.matrix-detail-region{min-width:0}
      .matrix-perspective{display:flex;gap:0;margin-bottom:12px}
      .matrix-perspective button{flex:1;min-height:44px;border:1px solid var(--divider-color);border-radius:0;background:transparent;color:var(--primary-text-color);font:inherit;cursor:pointer}
      .matrix-perspective button:first-child{border-radius:8px 0 0 8px}
      .matrix-perspective button:last-child{border-radius:0 8px 8px 0}
      .matrix-perspective button[aria-pressed="true"]{background:var(--primary-color,#039be5);color:var(--text-primary-color,#fff)}
      .matrix-detail{margin-top:14px;padding-top:14px;border-top:1px solid var(--divider-color)}
      .matrix-detail[hidden]{display:none}
      .matrix-detail-content{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:start}
      .matrix-detail-content>div:first-child>span{display:block;color:var(--secondary-text-color);font-size:.72rem}
      .matrix-detail-content>div:first-child>strong{display:block;margin-top:3px}
      .matrix-detail dl{grid-column:1/-1;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:0}
      .matrix-detail dl>div{min-width:0}
      .matrix-detail dt{color:var(--secondary-text-color);font-size:.72rem}
      .matrix-detail dd{margin:3px 0 0;overflow-wrap:anywhere}
      .matrix-detail .detail-note{grid-column:1/-1}
      .matrix-detail .detail-note dd{white-space:pre-wrap}
      @container owner-card (min-width:1000px){
        .matrix-layout{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:18px;align-items:start}
        .matrix-detail-region{min-height:180px}
        .matrix-detail{margin-top:0;padding:0 0 0 16px;border-top:0;border-left:1px solid var(--divider-color)}
        .matrix-detail-content{grid-template-columns:1fr}
        .matrix-detail dl{grid-template-columns:repeat(2,minmax(0,1fr))}
        .matrix-detail-content .secondary{justify-self:start}
      }
      @container owner-card (max-width:620px){
        .matrix-controls{display:grid;grid-template-columns:1fr;align-items:stretch}
        .matrix-toggle{min-height:32px}
        .matrix-summary{grid-template-columns:repeat(2,minmax(0,1fr))}
        .matrix-summary>div:nth-child(2){border-right:0}
        .matrix-summary>div:nth-child(-n+2){border-bottom:1px solid var(--divider-color)}
        .matrix-desktop{display:none}
        .matrix-mobile{display:block}
        .matrix-detail-region{display:none}
        .mobile-puppy-select{margin-bottom:10px}
        .mobile-puppy-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid var(--divider-color)}
        .mobile-puppy-head>span{color:var(--secondary-text-color);font-size:.75rem;white-space:nowrap}
        .mobile-matches{display:grid}
        .mobile-match{display:grid;grid-template-columns:42px minmax(0,1fr) auto;gap:9px;align-items:center;box-sizing:border-box;width:100%;min-width:0;min-height:54px;padding:10px 4px;border:1px solid transparent;border-bottom-color:var(--divider-color);background:transparent;color:var(--primary-text-color);text-align:left;font:inherit;cursor:pointer}
        .mobile-match-rank{display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:50%;background:var(--secondary-background-color);font-weight:700}
        .mobile-match-rank ha-icon{--mdc-icon-size:19px;color:var(--primary-color)}
        .mobile-match-main{min-width:0}
        .mobile-match-main strong,.mobile-match-main small,.mobile-match-main>span{display:block;overflow-wrap:anywhere}
        .mobile-match-main small{margin-top:2px;color:var(--secondary-text-color);font-size:.72rem}
        .mobile-match-main>span{margin-top:5px;font-size:.8rem;line-height:1.35}
        .mobile-match-main .matrix-puppy{justify-content:flex-start}
        .mobile-match-icons{display:flex;gap:3px;align-items:center;flex-wrap:wrap;max-width:84px}
        .mobile-match-icons ha-icon{display:inline-flex;width:18px;height:18px;--mdc-icon-size:18px}
        .mobile-match[aria-expanded="true"] .mobile-match-icons ha-icon:last-child{transform:rotate(180deg)}
        .mobile-match-detail{margin:0;padding:12px 4px;border-top:0;border-bottom:1px solid var(--divider-color)}
        .matrix-detail-content{grid-template-columns:1fr}
        .matrix-detail-content .secondary{justify-self:start}
        .matrix-detail dl{grid-template-columns:1fr 1fr}
      }
      @container owner-card (max-width:520px){
        .head{display:grid}
        .head-actions{display:grid;justify-content:stretch}
        .head-actions button{width:100%}
        .view-tabs{display:grid}
        .form,.link-form,.owner-detail-fields,.owner-editor-fields,.preference-row,.owner-filters,.payment-event-form{grid-template-columns:1fr}
        .wide,.checks,.owner-detail .wide{grid-column:auto}
        .owner{grid-template-columns:minmax(0,1fr) auto}
        .owner-actions{flex-direction:column}
        .actions{flex-wrap:wrap}
        .actions button{flex:1 1 auto}
      }
    </style>`;

    if (this.querySelector(".list")) this.querySelector(".list").scrollTop = listScroll;
    if (this.querySelector(".pickup-list")) this.querySelector(".pickup-list").scrollTop = pickupScroll;
    this._formState.bind(this.querySelector(".owner-editor form"));
    syncPaymentStatus(this);
    const ownerForm = this._formState.root;
    if (ownerForm) {
      updateDuplicateWarning(this);
      for (const event of ["input", "change"]) ownerForm.addEventListener(event, () => { this._updateOwnerDraftStatus(); updateDuplicateWarning(this); });
      ownerForm.querySelectorAll("[data-owner-editor-group]").forEach((group) => group.addEventListener("toggle", () => {
        if (group.isConnected && group.closest("form") === this._formState.root) this._editorGroups[group.dataset.ownerEditorGroup] = group.open;
      }));
    }
    this._linkFormState.bind(this.querySelector(".link-form .checks"));
    updateFinalPaymentPreview(this);
    const savedStatus = this.querySelector("#owner-status");
    if (this._status && this._lastSavedOwnerId && savedStatus) {
      appendEditAction(this, savedStatus, () => this._openEditor(this._lastSavedOwnerId, { litterId: this._lastSavedLitter }), text(this, "editOwner"));
    }
    this._savedRefresh.bind(savedStatus);
    this.querySelector("#reload-owner-conflict")?.addEventListener("click", () => this._reloadConflict());
    this.querySelectorAll('.checks input').forEach((input) => input.addEventListener("change", () => this._updateActionState()));
    this.querySelector(".owner-editor form")?.addEventListener("submit", (event) => { event.preventDefault(); this._save(event.currentTarget); });
    this.querySelector("#export-owners-csv")?.addEventListener("click", () => downloadOwnersCsv(this));
    this.querySelector("#owners-view")?.addEventListener("click", () => this._switchView("owners"));
    this.querySelector("#matrix-view")?.addEventListener("click", () => this._switchView("matrix"));
    this.querySelector("#add-owner")?.addEventListener("click", () => this._openEditor());
    bindOwnerOverview(this);
    this.querySelector(".pickup-agenda")?.addEventListener("toggle", (event) => {
      if (event.currentTarget.isConnected) this._pickupAgendaOpen = event.currentTarget.open;
    });
    this.querySelector("#owner-scope")?.addEventListener("change", (event) => {
      const scope = event.target.value;
      const litterId = ["__all__", "__unassigned__"].includes(scope) ? this._selectedLitter : scope;
      if (!this._changeLitter(litterId, scope)) event.target.value = this._ownerScope;
    });
    this.querySelector("#owner-status-filter")?.addEventListener("change", (event) => {
      this._placementFilter = event.target.value;
      this._matrixSelection = null;
      this._render();
      this.querySelector("#owner-status-filter")?.focus({ preventScroll: true });
      this._scheduleRefresh();
    });
    this.querySelector("#owner-search")?.addEventListener("input", (event) => {
      this._ownerSearch = event.target.value;
      refreshOwnerResults(this);
    });
    this.querySelector("#owner-sort")?.addEventListener("change", (event) => {
      this._ownerSort = event.target.value;
      const list = this.querySelector(".list");
      list.innerHTML = ownerList(this);
      list.scrollTop = 0;
      bindOwnerRows(this);
    });
    this.querySelector("#owner-litter")?.addEventListener("change", (event) => {
      captureEditorGroups(this);
      if (!this._formState.discard()) { event.target.value = this._editingLitter; return; }
      this._editingLitter = event.target.value;
      this._paymentBeforeFull = null;
      this._render();
      this.querySelector("#owner-litter")?.focus({ preventScroll: true });
    });
    this.querySelector("#cancel-owner")?.addEventListener("click", () => {
      if (!this._formState.discard()) return;
      this._editing = null;
      this._editingContact = null;
      this._showOwnerEditor = false;
      this._error = "";
      this._conflict = false;
      this._render();
      this._queueRefresh();
    });
    bindOwnerRows(this);
    this.querySelector('[name="payment_status"]')?.addEventListener("change", () => syncPaymentStatus(this, true));
    this.querySelectorAll('input[name="payment_amount"], input[name="registration_fee_amount"], input[name="deposit_amount"]').forEach((input) => input.addEventListener("input", () => updateFinalPaymentPreview(this)));
    this.querySelector("#link-litter")?.addEventListener("change", (event) => { if (!this._changeLitter(event.target.value)) event.target.value = this._selectedLitter; });
    this.querySelector("#link-puppy")?.addEventListener("change", (event) => { if (!this._linkFormState.discard()) { event.target.value = this._selectedPuppy; return; } this._selectedPuppy = event.target.value; this._render(); this._scheduleRefresh(); });
    this.querySelector("#link-save")?.addEventListener("click", () => this._link());
    this.querySelector("#matrix-litter")?.addEventListener("change", (event) => { if (!this._changeLitter(event.target.value)) event.target.value = this._selectedLitter; });
    this.querySelector("#matrix-only-conflicts")?.addEventListener("change", (event) => { this._matrixOnlyConflicts = event.target.checked; this._matrixSelection = null; this._render(); });
    this.querySelector("#matrix-puppy")?.addEventListener("change", (event) => { this._matrixSelectedPuppy = event.target.value; this._matrixSelection = null; this._render(); });
    this.querySelector("#matrix-owner")?.addEventListener("change", (event) => { this._matrixSelectedOwner = event.target.value; this._matrixSelection = null; this._render(); });
    this.querySelectorAll("[data-matrix-perspective]").forEach((button) => button.addEventListener("click", () => {
      if (this._matrixPerspective === button.dataset.matrixPerspective) return;
      this._matrixPerspective = button.dataset.matrixPerspective;
      this._matrixSelection = null;
      this._render();
    }));
    this.querySelectorAll("[data-matrix-owner]").forEach((button) => button.addEventListener("click", () => selectMatrixCell(this, button.dataset.matrixOwner, button.dataset.matrixPuppy)));
    this.querySelectorAll("[data-matrix-edit-owner]").forEach((button) => button.addEventListener("click", (event) => this._openEditor(event.currentTarget.dataset.matrixEditOwner, { section: "preferences" })));
  }
}

if (!customElements.get(TAG)) customElements.define(TAG, PuppyTrackerOwnerCard);
window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === TAG)) window.customCards.push({ type: TAG, name: "Puppy Tracker Owners", description: "Manage owner contacts and puppy links." });
