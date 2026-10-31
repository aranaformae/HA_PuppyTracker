import { FormState, bindSaveFeedback, savedOwnerLabel, savedRecordFeedback } from "./puppy-tracker-form-state.js";
import {
  puppySelectorLabel,
  addDossierRecord, changeDossierRecordOwner, deleteDossierRecord, deleteMotherDossierRecord,
  escapeHtml, fetchRecords, formatDateTime, languageForHass, localize,
  restoreDossierRecord, restoreMotherDossierRecord, updateDossierRecord, updateMotherDossierRecord,
} from "./puppy-tracker-card-common.js";
import {
  TYPE_FIELDS, KNOWN_DATA_KEYS, clinicalValidationField, clinicalValidationMessage, fieldLabel, renderFieldControl,
  recordTypeLabel, recordTypeOptions, requiredFieldsMessage,
} from "./puppy-tracker-dossier-schema.js";
import { BEHAVIOR_GROUPS, behaviorAgeDays, behaviorText } from "./puppy-tracker-behavior-schema.js";

const copy = (hass, nl, en) => languageForHass(hass) === "en" ? en : nl;
const escape = escapeHtml;
let activeEditor = null;

export function closeRecordEditor(card) {
  if (activeEditor?._card === card) activeEditor._close(false);
}

export function requestCloseRecordEditor(card) {
  return !activeEditor || activeEditor._card !== card || activeEditor.requestClose();
}

export function canEditRecords(card) {
  if (!card?._hass || card._hass.user?.is_admin === false) return false;
  const data = card._litterData || card._data;
  return Boolean(data?.can_manage_records);
}

export function canCorrectMeasurements(card) {
  return Boolean(card?._hass) && card._hass.user?.is_admin !== false && Boolean((card._litterData || card._data)?.can_manage_measurements);
}

export function recordEditButton(card, key, { measurement = false, deleted = false } = {}) {
  if (!(measurement ? canCorrectMeasurements(card) : canEditRecords(card)) || deleted) return "";
  const label = measurement
    ? copy(card._hass, "Meting corrigeren", "Correct measurement")
    : localize(card._hass, "editDossierItem");
  return `<button type="button" class="record-edit-button" data-edit-item="${escape(key)}" title="${escape(label)}" aria-label="${escape(label)}"><ha-icon icon="mdi:pencil-outline"></ha-icon></button>`;
}

export function canCompleteFollowup(action) {
  return ["deworming", "vaccination", "test", "vet_visit"].includes(action?.record_type || action?.type)
    && Boolean(action?.source_record_id || action?.record_id) && Boolean(action?.due_date || action?.due_at);
}

export function recordFollowupButton(card, key, action) {
  if (!canCompleteFollowup(action)) return recordEditButton(card, key);
  if (!canEditRecords(card)) return "";
  const label = copy(card._hass, "Uitvoering registreren", "Record completion");
  return `<button type="button" class="record-edit-button" data-complete-followup="${escape(key)}" title="${escape(label)}" aria-label="${escape(label)}"><ha-icon icon="mdi:check-bold"></ha-icon></button>`;
}

export function openFollowupEditor(card, action, options = {}) {
  const context = recordContext(card, { ...action, record_id: action.source_record_id || action.record_id });
  return openRecordEditor(card, context, canCompleteFollowup(action)
    ? { ...options, mode: "followup", dueDate: action.due_date || action.due_at } : options);
}

export function reminderCompleteButton(card, reminder) {
  if (!canEditRecords(card) || reminder?.enabled === false || !reminder?.next_due_at || !reminder?.updated_at) return "";
  const label = copy(card._hass, "Uitvoering registreren", "Record completion");
  return `<button type="button" class="record-edit-button" data-complete-reminder="${escape(reminder.id)}" title="${escape(label)}" aria-label="${escape(label)}"><ha-icon icon="mdi:clipboard-check-outline"></ha-icon></button>`;
}

export function reminderPostponeButton(card, reminder) {
  if (!reminderCompleteButton(card, reminder) || reminder.owner_available === false) return "";
  const label = copy(card._hass, "Eenmalig uitstellen", "Postpone once");
  return `<button type="button" class="record-edit-button" data-postpone-reminder="${escape(reminder.id)}" title="${escape(label)}" aria-label="${escape(label)}"><ha-icon icon="mdi:clock-edit-outline"></ha-icon></button>`;
}

export function reminderActionButtons(card, reminder) {
  const complete = reminderCompleteButton(card, reminder);
  return complete ? `<div class="recurring-actions">${complete}${reminderPostponeButton(card, reminder)}</div>` : "";
}

export function openReminderEditor(card, reminder, options = {}) {
  if (!reminder || !reminderCompleteButton(card, reminder)) return;
  const scope = reminder.owner_scope;
  const puppy = (card._litterData || card._data)?.puppies?.find((item) => item.id === reminder.owner_id);
  return openRecordEditor(card, { litterId: reminder.litter_id || card._selectedLitterId, scope,
    puppyId: scope === "puppy" ? reminder.owner_id : null,
    ownerName: puppy ? puppySelectorLabel(puppy) : reminder.owner_name },
  { ...options, mode: options.mode || "reminder", reminder: structuredClone(reminder) });
}

export function recordReminderExecution(hass, reminder, context, payload) {
  return hass.callWS({ type: "puppy_tracker/recurring_reminder/record", reminder_id: reminder.id,
    due_at: reminder.next_due_at, expected_updated_at: reminder.updated_at,
    expected_context: { litter_id: context.litterId, owner_scope: context.scope,
      puppy_id: context.puppyId || null, record_type: payload.record_type },
    occurred_at: payload.occurred_at, title: payload.title, note: payload.note, data: payload.data });
}

export function rememberReminderExecution(card, result, context, category, reminder) {
  const owner = context.ownerName || savedOwnerLabel(card, context.scope, context.puppyId);
  const saved = savedRecordFeedback(card, result, context, category);
  card._reminderSaveMessage = result.already_completed
    ? copy(card._hass, `Deze uitvoering was al opgeslagen voor ${owner}.`, `This execution was already saved for ${owner}.`)
    : `${saved} ${copy(card._hass, `Herinnering "${reminder.title}" afgehandeld.`, `Reminder "${reminder.title}" completed.`)}`;
  card._reminderSavedRecord = card._savedRecord;
  card._reminderUndoError = "";
  card._reminderFeedbackLitterId = context.litterId;
  card._reminderUndo = !result.already_completed && result.record?.updated_at
    ? { reminderId: reminder.id, recordId: result.record.id, updatedAt: result.record.updated_at,
      litterId: context.litterId, ownerName: owner, occurredAt: result.record.occurred_at } : null;
}

export const RECORD_ACTION_STYLE = `.recurring-actions{display:flex;gap:6px}.record-edit-button{display:inline-grid;place-items:center;flex:0 0 auto;width:40px;height:40px;min-width:40px;padding:0;border:1px solid var(--divider-color);border-radius:8px;background:var(--secondary-background-color);color:var(--primary-text-color);cursor:pointer;vertical-align:middle}.record-edit-button ha-icon{--mdc-icon-size:19px}.record-edit-button:focus-visible{outline:2px solid var(--primary-color);outline-offset:2px}`;

export function recordRestoreButton(card, key) {
  if (!canEditRecords(card)) return "";
  const label = localize(card._hass, "restore");
  return `<button type="button" class="record-edit-button" data-restore-item="${escape(key)}" title="${escape(label)}" aria-label="${escape(label)}"><ha-icon icon="mdi:restore"></ha-icon></button>`;
}

export function recordContext(card, record = {}) {
  const scope = record.owner_scope || record.__aggregate_owner_scope || record.scope
    || (card.__motherSelected ? "mother" : card._selectedPuppyId ? "puppy" : "litter");
  const data = card._litterData || card._data;
  const puppyId = scope === "puppy"
    ? record.owner_puppy_id || record.__aggregate_owner_puppy_id || record.puppy_id || card._selectedPuppyId
    : null;
  return {
    litterId: record.litter_id || card._selectedLitterId,
    scope,
    puppyId,
    recordId: record.record_id || record.id,
    ownerName: scope === "puppy"
      ? puppySelectorLabel(data?.puppies?.find((puppy) => puppy.id === puppyId), record.__aggregate_owner_name || record.puppy_name || localize(card._hass, "puppy"))
      : record.__aggregate_owner_name || record.puppy_name
      || (scope === "mother" ? data?.litter?.mother : data?.litter?.name),
  };
}

function localDate(value) {
  const date = value ? new Date(value) : new Date();
  if (!Number.isFinite(date.getTime())) return "";
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export async function refreshRecordSource(card) {
  if (!card.isConnected) return;
  const selectors = [".timeline-scroll", ".dossier-timeline-scroll", ".today-items-scroll", ".list", ".attention-ack-list", ".history", ".history-list"];
  const positions = selectors.map((selector) => [selector, Array.from(card.shadowRoot?.querySelectorAll(selector) || [], (node) => node.scrollTop)]);
  if (card._queueRefresh) await card._queueRefresh(true);
  else if (card._loadLitterAndRecords) { await card._loadLitterAndRecords(false); card._render(); }
  else if (card._loadData) await card._loadData();
  else if (card._loadCurrent) await card._loadCurrent();
  for (const [selector, offsets] of positions) card.shadowRoot?.querySelectorAll(selector).forEach((node, index) => { node.scrollTop = offsets[index] || 0; });
}

// Keep one editor outside card rendering: subscription updates cannot destroy a draft.
export async function openRecordEditor(card, context, options = {}) {
  if (!(options.mode === "care" ? card?._hass?.user?.is_admin !== false
    : context.measurementId ? canCorrectMeasurements(card) : canEditRecords(card))) return;
  if (activeEditor && !activeEditor.requestClose()) return;
  const editor = document.createElement("puppy-tracker-record-editor");
  editor.configure(card, { ...context }, {
    ...options,
    onClosed: (result) => {
      if (activeEditor === editor) activeEditor = null;
      options.onClosed?.(result);
    },
  });
  document.body.append(editor);
  activeEditor = editor;
  await editor.open();
  return editor;
}

export function openCareAdministrationEditor(card, item, options = {}) {
  const puppy = (card._litterData || card._data)?.puppies?.find((entry) => entry.id === item.puppy_id);
  const ownerName = puppySelectorLabel(puppy, item.puppy_name || localize(card._hass, "puppy"));
  return openRecordEditor(card, {
    litterId: item.litter_id || card._selectedLitterId,
    scope: "puppy", puppyId: item.puppy_id, ownerName,
  }, { ...options, mode: "care", occurrence: item });
}

class PuppyTrackerRecordEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._dirty = false;
    this._busy = false;
    this._closed = false;
    this._record = null;
    this._formState = new FormState(this, { preserve: false, busy: () => this._busy });
  }

  configure(card, context, options) {
    this._card = card;
    this._hass = card._hass;
    this._context = context;
    this._options = options;
    this._previousFocus = options.trigger || card.shadowRoot?.activeElement || document.activeElement;
    this._mode = context.measurementId ? "measurement" : options.mode || (context.recordId ? "edit" : "add");
    const computed = getComputedStyle(card);
    for (let index = 0; index < computed.length; index += 1) {
      const name = computed[index];
      if (name.startsWith("--")) this.style.setProperty(name, computed.getPropertyValue(name));
    }
  }

  async open() {
    const title = { add: "newDossierItem", move: "changeOwner", delete: "delete", restore: "restore" }[this._mode] || "editDossierItem";
    this.shadowRoot.innerHTML = `<style>
      :host{font-family:var(--paper-font-body1_-_font-family,Arial,sans-serif);color:var(--primary-text-color,#222)}
      dialog{box-sizing:border-box;width:min(680px,calc(100% - 24px));max-height:calc(100dvh - 32px);padding:0;border:1px solid var(--divider-color,#ccc);border-radius:8px;background:var(--card-background-color,#fff);color:inherit;overflow:auto;overscroll-behavior:contain}dialog::backdrop{background:rgba(0,0,0,.45)}
      .head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:16px;border-bottom:1px solid var(--divider-color,#ccc)}h2{font-size:18px;margin:0;letter-spacing:0}.owner{margin-top:5px;font-size:13px;color:var(--secondary-text-color,#666);overflow-wrap:anywhere}.body{padding:16px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.wide{grid-column:1/-1}label{display:grid;gap:5px;font-size:13px;min-width:0;margin-bottom:12px}input,select,textarea{box-sizing:border-box;width:100%;min-width:0;min-height:44px;padding:9px;border:1px solid var(--divider-color,#ccc);border-radius:8px;background:var(--card-background-color,#fff);color:inherit;font:inherit;font-size:16px}textarea{resize:vertical;min-height:96px}.actions{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;margin-top:16px}button{min-height:44px;padding:8px 14px;border:1px solid var(--divider-color,#ccc);border-radius:8px;background:var(--secondary-background-color,#eee);color:inherit;font:inherit;cursor:pointer}button:disabled{opacity:.5;cursor:default}.primary{background:var(--primary-color,#007fa3);color:var(--text-primary-color,#fff);border-color:transparent}.close{width:40px;min-height:40px;padding:0;display:grid;place-items:center}.error{color:var(--error-color,#b00020);white-space:pre-wrap;overflow-wrap:anywhere}.context{padding:10px;border-left:3px solid var(--primary-color,#007fa3);background:var(--secondary-background-color,#eee);margin-bottom:12px;font-size:13px;white-space:pre-wrap;overflow-wrap:anywhere}.context strong{display:block}.scores{border:0;padding:0;margin:12px 0}.scores legend{font-weight:600;margin-bottom:10px}.score-row{display:grid;grid-template-columns:minmax(0,1fr) 110px;gap:10px;align-items:center}.score-row select{font-size:16px}.state{padding:12px 0}.required{color:var(--error-color,#b00020)}@media(max-width:520px){.grid{grid-template-columns:1fr}.wide{grid-column:auto}.body,.head{padding:12px}}
    </style><dialog aria-labelledby="record-dialog-title"><div class="head"><div><h2 id="record-dialog-title">${escape(localize(this._hass, title))}</h2><div class="owner">${escape(this._context.ownerName || "")}</div></div><button class="close" type="button" aria-label="${escape(copy(this._hass, "Sluiten", "Close"))}"><ha-icon icon="mdi:close"></ha-icon></button></div><div class="body"><div class="state" role="status">${escape(localize(this._hass, "loading"))}</div></div></dialog>`;
    this._updateNewOwnerLabel();
    this._dialog = this.shadowRoot.querySelector("dialog");
    this.shadowRoot.querySelector(".close").addEventListener("click", () => this.requestClose());
    this._dialog.addEventListener("cancel", (event) => { event.preventDefault(); this.requestClose(); });
    this._dialog.showModal();
    try {
      const { litterId, scope, puppyId, recordId } = this._context;
      if (!litterId || !["litter", "mother", "puppy"].includes(scope) || (scope === "puppy" && !puppyId)) throw new Error(copy(this._hass, "Kies eerst een eigenaar.", "Select an owner first."));
      if (this._mode === "postpone") {
        this._renderPostponement();
        return;
      }
      if (this._mode === "measurement") {
        const response = await this._hass.callWS({ type: "puppy_tracker/measurements", litter_id: litterId, puppy_id: puppyId });
        if (this._closed) return;
        const measurement = response.measurements?.find((item) => item.id === this._context.measurementId);
        if (!measurement || measurement.deleted || measurement.superseded_by || (measurement.status && measurement.status !== "active")) throw new Error(copy(this._hass, "Deze meting kan niet meer gecorrigeerd worden.", "This measurement can no longer be corrected."));
        this._draft = { weight: measurement.weight, occurred_at: localDate(measurement.timestamp), reason: "" };
        this.shadowRoot.getElementById("record-dialog-title").textContent = copy(this._hass, "Meting corrigeren", "Correct measurement");
        this._renderMeasurement();
        return;
      }
      if (recordId) {
        const response = scope === "mother"
          ? await this._hass.callWS({ type: "puppy_tracker/mother/records", litter_id: litterId, history_scope: "all", include_deleted: true })
          : await fetchRecords(this._hass, litterId, puppyId || null, true);
        if (this._closed) return;
        if (!response?.can_manage_records || this._card._hass?.user?.is_admin === false) throw new Error(copy(this._hass, "Je mag dit item niet aanpassen.", "You cannot edit this item."));
        this._record = response.records?.find((item) => item.id === recordId);
        if (!this._record) throw new Error(copy(this._hass, "Dit item bestaat niet meer.", "This item no longer exists."));
        if (Boolean(this._record.deleted) !== (this._mode === "restore")) throw new Error(copy(this._hass, "Dit item is gewijzigd of verwijderd. Vernieuw de kaart.", "This item was changed or deleted. Refresh the card."));
      }
      this._draft = {
        record_type: this._record?.type || "note", occurred_at: localDate(this._record?.occurred_at),
        title: this._record?.title || "", note: this._record?.note || "", data: structuredClone(this._record?.data || {}),
      };
      if (this._mode === "followup") {
        if (!canCompleteFollowup({ ...this._record, record_id: recordId, due_date: this._options.dueDate })
          || this._record.data?.next_due_date !== this._options.dueDate) throw new Error(copy(this._hass, "Deze vervolgmelding is gewijzigd. Vernieuw de kaart.", "This follow-up has changed. Refresh the card."));
        // Carry forward product details, never an old dose, weight, batch or result.
        const reusable = {
          deworming: ["product", "active_ingredient", "unit", "route"],
          vaccination: ["vaccine", "vaccine_type", "veterinarian", "clinic"],
          test: ["test_name", "laboratory"],
          vet_visit: ["veterinarian", "clinic"],
        }[this._record.type] || [];
        this._draft = { record_type: this._record.type, occurred_at: localDate(), title: "", note: "",
          data: Object.fromEntries(reusable.filter((key) => this._record.data?.[key] != null).map((key) => [key, this._record.data[key]])) };
        this.shadowRoot.getElementById("record-dialog-title").textContent = copy(this._hass, "Uitvoering registreren", "Record completion");
      }
      if (this._mode === "reminder") {
        const reminder = this._options.reminder;
        this._draft = { record_type: reminder.record_type, occurred_at: localDate(),
          title: reminder.match_title || reminder.title || "", note: "", data: {} };
        this.shadowRoot.getElementById("record-dialog-title").textContent = copy(this._hass, "Uitvoering registreren", "Record completion");
      }
      if (this._mode === "care") {
        const item = this._options.occurrence;
        const productKey = item.record_type === "deworming" ? "product" : "medication";
        this._draft = {
          record_type: item.record_type, occurred_at: localDate(), title: item.title || "", note: "",
          data: {
            care_schedule_type: "course", care_occurrence_id: item.id,
            care_scheduled_at: item.scheduled_at, care_instruction: item.instructions,
            care_status: this._options.initialStatus === "missed" ? "missed" : "completed",
            [productKey]: item.treatment_product || "",
            dose: item.planned_dose || "", unit: item.planned_unit || "", route: item.planned_route || "",
          },
        };
        this.shadowRoot.getElementById("record-dialog-title").textContent = copy(this._hass, "Uitvoering registreren", "Record completion");
      }
      this._renderForm();
    } catch (error) {
      if (!this._closed) this.shadowRoot.querySelector(".body").innerHTML = `<div class="error" role="alert">${escape(error.message)}</div>`;
    }
  }

  _renderPostponement() {
    const reminder = this._options.reminder;
    const text = (nl, en) => copy(this._hass, nl, en);
    this.shadowRoot.getElementById("record-dialog-title").textContent = text("Eenmalig uitstellen", "Postpone once");
    const boundary = reminder.postpone_before ? new Date(reminder.postpone_before) : null;
    const base = Math.max(Date.now(), new Date(reminder.next_due_at).getTime());
    const defaultTime = boundary ? Math.min(base + 30 * 60000, boundary.getTime() - 60000) : base + 30 * 60000;
    const time = (value) => formatDateTime(value, "", this._hass);
    const body = this.shadowRoot.querySelector(".body");
    body.innerHTML = `<form novalidate><div class="context"><strong>${escape(reminder.title)}</strong>${escape(text("Gepland", "Scheduled"))}: ${escape(time(reminder.next_due_at))}${reminder.postponed ? `<br>${escape(text("Oorspronkelijk", "Originally"))}: ${escape(time(reminder.scheduled_due_at))}` : ""}${boundary ? `<br>${escape(text("Volgend vast moment", "Next fixed moment"))}: ${escape(time(reminder.postpone_before))}` : ""}</div>
      <label>${escape(text("Uitstellen tot", "Postpone until"))}<input id="reminder-until" type="datetime-local" step="1" required value="${escape(defaultTime > base ? localDate(defaultTime) : "")}"></label>
      <div class="actions">${[15, 30, 60].map((minutes) => `<button type="button" data-postpone-minutes="${minutes}" ${boundary && base + minutes * 60000 >= boundary.getTime() ? "disabled" : ""}>+${minutes} min</button>`).join("")}</div>
      <div class="error" role="alert" hidden></div><div class="actions">${reminder.postponed ? `<button type="button" id="reminder-reset">${escape(text("Uitstel opheffen", "Cancel postponement"))}</button>` : ""}<button type="button" id="record-cancel">${escape(localize(this._hass, "cancel"))}</button><button type="submit" class="primary">${escape(text("Eenmalig uitstellen", "Postpone once"))}</button></div></form>`;
    body.querySelector("input").addEventListener("input", () => { this._dirty = true; });
    body.querySelectorAll("[data-postpone-minutes]").forEach((button) => button.addEventListener("click", () => {
      body.querySelector("input").value = localDate(Math.max(Date.now(), new Date(reminder.next_due_at).getTime()) + Number(button.dataset.postponeMinutes) * 60000);
      this._dirty = true;
    }));
    body.querySelector("#record-cancel").addEventListener("click", () => this.requestClose());
    body.querySelector("#reminder-reset")?.addEventListener("click", () => this._savePostponement(true));
    body.querySelector("form").addEventListener("submit", (event) => { event.preventDefault(); this._savePostponement(false); });
    body.querySelector("input").focus({ preventScroll: true });
  }

  async _savePostponement(reset) {
    if (this._busy || this._closed) return;
    const text = (nl, en) => copy(this._hass, nl, en);
    const error = this.shadowRoot.querySelector(".error");
    const controls = Array.from(this.shadowRoot.querySelectorAll("button,input"), (input) => [input, input.disabled]);
    try {
      if (!canEditRecords(this._card)) throw new Error(text("Je mag deze herinnering niet uitstellen.", "You cannot postpone this reminder."));
      const reminder = this._options.reminder;
      const until = new Date(this.shadowRoot.getElementById("reminder-until").value);
      if (!reset) {
        if (!Number.isFinite(until.getTime()) || until.getTime() <= Math.max(Date.now(), new Date(reminder.next_due_at).getTime())) throw new Error(text("Kies een tijdstip na nu en het huidige geplande moment.", "Choose a time after now and the current scheduled moment."));
        if (reminder.postpone_before && until >= new Date(reminder.postpone_before)) throw new Error(text("Kies een tijdstip vóór het volgende vaste moment.", "Choose a time before the next fixed moment."));
      }
      this._busy = true;
      controls.forEach(([input]) => { input.disabled = true; });
      error.hidden = true;
      await this._hass.callWS({ type: "puppy_tracker/recurring_reminder/postpone", reminder_id: reminder.id,
        due_at: reminder.next_due_at, expected_updated_at: reminder.updated_at, until: reset ? null : until.toISOString() });
      this._card._reminderPostponeMessage = reset
        ? text(`Uitstel voor "${reminder.title}" opgeheven.`, `Postponement for "${reminder.title}" cancelled.`)
        : text(`"${reminder.title}" uitgesteld tot ${formatDateTime(until.toISOString(), "", this._hass)}.`, `"${reminder.title}" postponed until ${formatDateTime(until.toISOString(), "", this._hass)}.`);
      this._card._reminderPostponeLitterId = this._context.litterId;
      this._close(true);
      try { await refreshRecordSource(this._card); }
      catch (_error) { this._card._error = text("Opgeslagen, maar vernieuwen mislukt. Herlaad de kaart.", "Saved, but refresh failed. Reload the card."); this._card._render?.(); }
    } catch (err) {
      error.textContent = err?.code === "invalid_postponement"
        ? text("Dit moment is gewijzigd of het gekozen tijdstip past niet meer. Vernieuw de kaart en controleer de planning.", "This moment has changed or the chosen time is no longer valid. Refresh the card and check the schedule.")
        : err?.message || text("Uitstellen mislukt. Probeer het opnieuw.", "Could not postpone. Try again.");
      error.hidden = false;
    } finally {
      this._busy = false;
      if (!this._closed) controls.forEach(([input, disabled]) => { input.disabled = disabled; });
    }
  }

  requestClose() {
    if (this._closed) return true;
    if (this._busy) return false;
    if (this._dirty && !window.confirm(copy(this._hass, "Niet-opgeslagen wijzigingen weggooien?", "Discard unsaved changes?"))) return false;
    this._close(false);
    return true;
  }

  _close(saved) {
    if (this._closed) return;
    this._closed = true;
    this._formState.reset();
    this._dialog.close();
    this.remove();
    if (this._previousFocus?.isConnected) this._previousFocus.focus({ preventScroll: true });
    this._options.onClosed?.({ saved });
  }

  _capture() {
    if (!this._draft) return;
    const owner = this.shadowRoot.getElementById("record-new-owner");
    if (owner) this._draft.newOwner = owner.value;
    for (const [key, id] of Object.entries({ title: "record-title", note: "record-note", occurred_at: "record-occurred" })) {
      const input = this.shadowRoot.getElementById(id);
      if (input) this._draft[key] = input.value;
    }
    for (const field of TYPE_FIELDS[this._draft.record_type] || []) {
      const input = this.shadowRoot.getElementById(`record-data-${field.key}`);
      if (input) this._draft.data[field.key] = input.value;
    }
    for (const key of ["status", "result", "score"]) {
      const input = this.shadowRoot.getElementById(`record-care-${key}`);
      if (input) this._draft.data[`care_${key}`] = input.value;
    }
    if (this._draft.record_type === "behavior_observation") {
      for (const key of ["observer", "context"]) this._draft.data[key] = this.shadowRoot.getElementById(`record-behavior-${key}`)?.value || null;
      const scores = { ...(this._draft.data.scores || {}) };
      this.shadowRoot.querySelectorAll("[data-behavior-score]").forEach((input) => {
        if (input.value) scores[input.dataset.behaviorScore] = Number(input.value);
        else delete scores[input.dataset.behaviorScore];
      });
      this._draft.data.scores = scores;
    }
  }

  _renderMeasurement() {
    const body = this.shadowRoot.querySelector(".body");
    body.innerHTML = `<form><label>${escape(copy(this._hass, "Gewicht (g)", "Weight (g)"))}<input id="measurement-weight" type="number" min="1" max="10000" step="any" required value="${escape(this._draft.weight)}"></label><label>${escape(localize(this._hass, "dateAndTime"))}<input id="measurement-time" type="datetime-local" step="1" required value="${escape(this._draft.occurred_at)}"></label><label>${escape(copy(this._hass, "Reden voor correctie", "Reason for correction"))}<input id="measurement-reason"></label><div class="error" role="alert" hidden></div><div class="actions"><button type="button" id="record-cancel">${escape(localize(this._hass, "cancel"))}</button><button type="submit" class="primary" id="record-save">${escape(copy(this._hass, "Correctie opslaan", "Save correction"))}</button></div></form>`;
    body.querySelector("form").addEventListener("input", () => { this._dirty = true; });
    this._formState.bind(body.querySelector("form"));
    body.querySelector("#record-cancel").addEventListener("click", () => this.requestClose());
    body.querySelector("form").addEventListener("submit", (event) => { event.preventDefault(); this._save(); });
    body.querySelector("input").focus({ preventScroll: true });
  }

  _fields() {
    return (TYPE_FIELDS[this._draft.record_type] || [])
      .filter((field) => !(this._draft.data.care_schedule_type === "course" && field.key === "next_due_date"))
      .map((field) => {
        const id = `record-data-${field.key}`;
        return `<label class="${field.wide ? "wide" : ""}"><span>${escape(fieldLabel(this._hass, field))}${field.required ? ' <span class="required">*</span>' : ""}</span>${renderFieldControl(this._hass, field, id, this._draft.data[field.key])}</label>`;
      }).join("");
  }

  _careFields() {
    const data = this._draft.data;
    if (!data.care_occurrence_id) return "";
    if (data.care_schedule_type === "course") {
      return `<div class="context">${data.care_scheduled_at ? `${escape(formatDateTime(data.care_scheduled_at, "", this._hass))}\n` : ""}${escape(data.care_instruction || "")}</div><label>${escape(localize(this._hass, "careStatus"))}<select id="record-care-status"><option value="completed" ${data.care_status !== "missed" ? "selected" : ""}>${escape(localize(this._hass, "completed"))}</option><option value="missed" ${data.care_status === "missed" ? "selected" : ""}>${escape(localize(this._hass, "missed"))}</option></select></label>`;
    }
    return `<div class="context">${data.care_age_days !== undefined ? `<strong>${escape(localize(this._hass, "careAgeDay"))}: ${escape(data.care_age_days)}</strong>` : ""}${data.care_scheduled_at ? `${escape(formatDateTime(data.care_scheduled_at, "", this._hass))}\n` : ""}${escape(data.care_instruction || "")}</div><div class="grid"><label>${escape(localize(this._hass, "careStatus"))}<select id="record-care-status"><option value="completed" ${data.care_status !== "missed" ? "selected" : ""}>${escape(localize(this._hass, "completed"))}</option><option value="missed" ${data.care_status === "missed" ? "selected" : ""}>${escape(localize(this._hass, "missed"))}</option></select></label><label>${escape(localize(this._hass, "careResult"))}<input id="record-care-result" value="${escape(data.care_result ?? "")}"></label><label>${escape(localize(this._hass, "careScore"))}<input type="number" step="0.1" id="record-care-score" value="${escape(data.care_score ?? "")}"></label></div>`;
  }

  _behaviorFields() {
    if (this._draft.record_type !== "behavior_observation") return "";
    const t = (key) => escape(behaviorText({ _hass: this._hass }, key));
    return `<div class="grid">${["observer", "context"].map((key) => `<label>${t(key)}<input id="record-behavior-${key}" value="${escape(this._draft.data[key] || "")}" maxlength="500"></label>`).join("")}</div>${BEHAVIOR_GROUPS.map(([group, keys]) => `<fieldset class="scores"><legend>${t(group)}</legend>${keys.map((key) => `<label class="score-row">${t(key)}<select data-behavior-score="${key}" aria-label="${t(key)}"><option value="">${t("clearScore")}</option>${[1, 2, 3, 4, 5].map((score) => `<option value="${score}" ${Number(this._draft.data.scores?.[key]) === score ? "selected" : ""}>${score}</option>`).join("")}</select></label>`).join("")}</fieldset>`).join("")}`;
  }

  _owners() {
    const data = this._card._litterData || this._card._data;
    return [
      { scope: "litter", puppyId: null, name: copy(this._hass, "Hele nest", "Whole litter") },
      ...(data?.litter?.mother ? [{ scope: "mother", puppyId: null, name: `${localize(this._hass, "mother")} · ${data.litter.mother}` }] : []),
      ...(data?.puppies || []).map((puppy) => ({ scope: "puppy", puppyId: puppy.id, name: `${localize(this._hass, "puppy")} · ${puppySelectorLabel(puppy, localize(this._hass, "puppy"))}` })),
    ].filter((owner) => (this._record?.type !== "behavior_observation" || owner.scope === "puppy")
      && (this._options.chooseOwner || owner.scope !== this._context.scope || owner.puppyId !== (this._context.puppyId || null)));
  }

  _updateNewOwnerLabel() {
    if (this._mode !== "add" || !this._options.chooseOwner) return;
    const select = this.shadowRoot.getElementById("record-new-owner");
    this.shadowRoot.querySelector(".head .owner").textContent = select?.value
      ? select.selectedOptions[0].textContent
      : copy(this._hass, "Kies een eigenaar", "Choose an owner");
  }

  _renderForm() {
    const body = this.shadowRoot.querySelector(".body");
    const isEdit = ["edit", "add", "followup", "reminder", "care"].includes(this._mode);
    const execution = ["followup", "reminder", "care"].includes(this._mode);
    const lockedType = execution || this._draft.record_type === "behavior_observation" || this._draft.data.care_occurrence_id;
    const label = execution ? copy(this._hass, "Uitvoering opslaan", "Save completion") : this._mode === "move" ? localize(this._hass, "changeOwner") : this._mode === "restore" ? localize(this._hass, "restore") : this._mode === "delete" ? localize(this._hass, "delete") : this._mode === "add" ? localize(this._hass, "add") : localize(this._hass, "saveChanges");
    const scheduled = this._mode === "reminder" ? formatDateTime(this._options.reminder.next_due_at, "", this._hass)
      : this._mode === "care" ? formatDateTime(this._options.occurrence.scheduled_at, "", this._hass) : this._options.dueDate;
    const followupContext = execution ? `<div class="context">${this._mode === "reminder" ? `<strong>${escape(this._options.reminder.title)}</strong>` : ""}${escape(copy(this._hass, "Geplande datum", "Scheduled date"))}: ${escape(scheduled)}</div>` : "";
    const chooseOwner = this._mode === "add" && this._options.chooseOwner
      ? `<label>${escape(copy(this._hass, "Voor wie?", "For whom?"))}<select id="record-new-owner" required><option value="">${escape(copy(this._hass, "Kies een eigenaar", "Choose an owner"))}</option>${this._owners().map((owner) => { const key = `${owner.scope}:${owner.puppyId || ""}`; return `<option value="${escape(key)}" ${key === this._draft.newOwner ? "selected" : ""}>${escape(owner.name)}</option>`; }).join("")}</select></label>` : "";
    body.innerHTML = `<form novalidate>${chooseOwner}${followupContext}${isEdit ? `<div class="grid"><label>${escape(localize(this._hass, "type"))}<select id="record-type" ${lockedType ? "disabled" : ""}>${recordTypeOptions(this._hass, this._draft.record_type)}</select></label><label>${escape(localize(this._hass, "dateAndTime"))}<input type="datetime-local" step="1" id="record-occurred" value="${escape(this._draft.occurred_at)}" required></label></div>${this._mode === "care" ? "" : `<label>${escape(localize(this._hass, "title"))}<input id="record-title" maxlength="160" value="${escape(this._draft.title)}"></label>`}<label>${escape(localize(this._hass, "note"))}<textarea id="record-note" rows="4">${escape(this._draft.note)}</textarea></label><div class="grid record-type-fields">${this._fields()}</div>${this._careFields()}${this._behaviorFields()}`
      : this._mode === "move" ? `<label>${escape(localize(this._hass, "changeOwner"))}<select id="record-owner">${this._owners().map((owner, index) => `<option value="${index}">${escape(owner.name)}</option>`).join("")}</select></label>`
        : `<div class="context">${escape(this._record.title || recordTypeLabel(this._hass, this._record.type))}</div><p>${escape(this._mode === "restore" ? copy(this._hass, "Dit verwijderde item herstellen?", "Restore this deleted item?") : localize(this._hass, "confirmDeleteRecord", { title: this._record.title || recordTypeLabel(this._hass, this._record.type) }))}</p>`}
      <div class="error" role="alert" hidden></div><div class="actions"><button type="button" id="record-cancel">${escape(localize(this._hass, "cancel"))}</button><button type="submit" class="primary" id="record-save">${escape(label)}</button></div></form>`;
    body.querySelector("form").addEventListener("input", () => { this._dirty = true; });
    body.querySelector("form").addEventListener("change", () => { this._dirty = true; });
    this._formState.bind(body.querySelector("form"));
    body.querySelector("#record-new-owner")?.addEventListener("change", () => this._updateNewOwnerLabel());
    this._updateNewOwnerLabel();
    body.querySelector("#record-type")?.addEventListener("change", (event) => { this._capture(); this._draft.record_type = event.target.value; this._renderForm(); });
    if (this._draft.data.care_schedule_type === "course") {
      const syncStatus = () => {
        const missed = body.querySelector("#record-care-status")?.value === "missed";
        const group = body.querySelector(".record-type-fields");
        if (group) group.style.display = missed ? "none" : "";
        group?.querySelectorAll("input,select,textarea").forEach((input) => { input.disabled = missed; });
      };
      body.querySelector("#record-care-status")?.addEventListener("change", syncStatus);
      syncStatus();
    }
    body.querySelector("#record-cancel").addEventListener("click", () => this.requestClose());
    body.querySelector("form").addEventListener("submit", (event) => { event.preventDefault(); this._save(); });
    body.querySelector("input,textarea,select,#record-cancel")?.focus({ preventScroll: true });
  }

  async _save() {
    if (this._busy || this._closed) return;
    this._formState.clearErrors();
    const error = this.shadowRoot.querySelector(".error");
    if (this._mode !== "measurement") this._capture();
    try {
      if (!(this._mode === "care" ? this._hass.user?.is_admin !== false
        : this._mode === "measurement" ? canCorrectMeasurements(this._card) : canEditRecords(this._card))) throw new Error(copy(this._hass, "Je mag dit item niet aanpassen.", "You cannot edit this item."));
      if (this._mode === "add" && this._options.chooseOwner) {
        if (this._card._selectedLitterId !== this._context.litterId) throw new Error(copy(this._hass, "Het nest is gewijzigd. Open Nieuw item opnieuw.", "The litter has changed. Open New entry again."));
        const target = this._owners().find((owner) => `${owner.scope}:${owner.puppyId || ""}` === this._draft.newOwner);
        if (!target) { this._formState.error("#record-new-owner", localize(this._hass, "invalidOwner")); throw new Error(localize(this._hass, "invalidOwner")); }
        Object.assign(this._context, { scope: target.scope, puppyId: target.puppyId, ownerName: target.name });
      }
      const { litterId, scope, puppyId, recordId } = this._context;
      const data = structuredClone(this._draft.data || {});
      const occurred = new Date(this._draft.occurred_at);
      if (["add", "edit", "followup", "reminder", "care"].includes(this._mode)) {
        if (!Number.isFinite(occurred.getTime())) { this._formState.error("#record-occurred", localize(this._hass, "invalidDateTime")); throw new Error(localize(this._hass, "invalidDateTime")); }
        for (const key of KNOWN_DATA_KEYS) delete data[key];
        for (const field of TYPE_FIELDS[this._draft.record_type] || []) {
          if (data.care_schedule_type === "course" && field.key === "next_due_date") continue;
          const value = String(this._draft.data[field.key] ?? "").trim();
          if (value) data[field.key] = value;
        }
        if (data.care_occurrence_id) {
          data.care_score = data.care_score === "" || data.care_score == null ? null : Number(data.care_score);
          data.care_result = String(data.care_result || "").trim() || null;
        }
        const course = data.care_schedule_type === "course";
        if (course) {
          const fields = (TYPE_FIELDS[this._draft.record_type] || []).filter((field) => field.key !== "next_due_date");
          if (data.care_status === "missed") {
            for (const field of fields) delete data[field.key];
            data.care_data = {};
            data.care_result = null;
            data.care_score = null;
          } else {
            const productKey = this._draft.record_type === "deworming" ? "product" : "medication";
            if (!data[productKey]) {
              this._formState.error(`#record-data-${productKey}`, copy(this._hass, "Vul het werkelijk toegediende middel in.", "Enter the product actually administered."));
              throw new Error(copy(this._hass, "Vul het werkelijk toegediende middel in.", "Enter the product actually administered."));
            }
            data.care_data = Object.fromEntries(fields.filter((field) => data[field.key]).map((field) => [field.key, data[field.key]]));
          }
          delete data.next_due_date;
        }
        const validation = course && data.care_status === "missed" ? "" : requiredFieldsMessage(this._hass, this._draft.record_type, data);
        if (validation) {
          const field = (TYPE_FIELDS[this._draft.record_type] || []).find((item) => item.required && !data[item.key]);
          if (field) this._formState.error(`#record-data-${field.key}`, validation);
          throw new Error(validation);
        }
        const clinicalValidation = clinicalValidationMessage(this._hass, this._draft.record_type, data);
        if (clinicalValidation) { this._formState.error(`#record-data-${clinicalValidationField(this._draft.record_type, data)}`, clinicalValidation); throw new Error(clinicalValidation); }
        if (this._mode === "followup" && this._draft.record_type === "test" && !String(data.test_name || "").trim()) {
          const message = copy(this._hass, "Vul de testnaam in voor deze opvolging.", "Enter the test name for this follow-up.");
          this._formState.error("#record-data-test_name", message);
          throw new Error(message);
        }
        if (this._mode === "followup" && this._draft.record_type === "vet_visit" && !["reason", "findings", "diagnosis", "treatment"].some((key) => String(data[key] || "").trim())) {
          const message = copy(this._hass, "Vul een reden of bevinding in voor deze opvolging.", "Enter a visit reason or finding for this follow-up.");
          this._formState.error("#record-data-reason", message);
          throw new Error(message);
        }
        if (this._draft.record_type === "behavior_observation" && !Object.keys(data.scores || {}).length) throw new Error(behaviorText({ _hass: this._hass }, "noScores"));
        if (this._draft.record_type === "behavior_observation") {
          const source = this._card._litterData || this._card._data;
          const puppy = source?.puppies?.find((item) => item.id === puppyId);
          const ageDays = behaviorAgeDays(puppy?.birth_time || source?.litter?.birth_date, occurred);
          if (ageDays !== null) data.age_days = ageDays;
        }
        const form = this.shadowRoot.querySelector("form");
        if (!form.reportValidity()) return;
      }
      this._busy = true;
      this.shadowRoot.querySelectorAll("button,input,select,textarea").forEach((input) => { input.disabled = true; });
      bindSaveFeedback(this, "#record-save", { busy: true });
      error.hidden = true;
      if (this._mode === "measurement") {
        const form = this.shadowRoot.querySelector("form");
        const weight = Number(this.shadowRoot.getElementById("measurement-weight").value);
        const timestamp = new Date(this.shadowRoot.getElementById("measurement-time").value);
        if (!Number.isFinite(weight) || weight < 1 || weight > 10000 || !Number.isFinite(timestamp.getTime())) throw new Error(copy(this._hass, "Vul een geldig gewicht en tijdstip in.", "Enter a valid weight and time."));
        await this._hass.callWS({ type: "puppy_tracker/measurement/correct", litter_id: litterId, puppy_id: puppyId, measurement_id: this._context.measurementId, weight, timestamp: timestamp.toISOString(), reason: form.querySelector("#measurement-reason").value.trim() || null });
      } else if (this._mode === "move") {
        const target = this._owners()[Number(this.shadowRoot.getElementById("record-owner").value)];
        if (!target) throw new Error(localize(this._hass, "invalidOwner"));
        await changeDossierRecordOwner(this._hass, litterId, puppyId || null, recordId, target.puppyId, { sourceScope: scope, targetScope: target.scope });
      } else if (this._mode === "delete" || this._mode === "restore") {
        const method = scope === "mother"
          ? this._mode === "delete" ? deleteMotherDossierRecord : restoreMotherDossierRecord
          : this._mode === "delete" ? deleteDossierRecord : restoreDossierRecord;
        if (scope === "mother") await method(this._hass, litterId, recordId);
        else await method(this._hass, litterId, puppyId || null, recordId);
      } else {
        const payload = { record_type: this._draft.record_type, occurred_at: occurred.toISOString(), title: this._draft.title.trim() || null, note: this._draft.note.trim() || null, data };
        if (this._mode === "followup") {
          payload.followup_record_id = recordId;
          payload.followup_due_date = this._options.dueDate;
        }
        if (this._mode === "reminder") {
          const reminder = this._options.reminder;
          const result = await recordReminderExecution(this._hass, reminder, this._context, payload);
          rememberReminderExecution(this._card, result, this._context, recordTypeLabel(this._hass, this._draft.record_type), reminder);
        } else if (this._mode === "care") {
          const item = this._options.occurrence;
          const result = await this._hass.callWS({
            type: "puppy_tracker/care_occurrence/record", program_id: item.program_id,
            puppy_id: item.puppy_id, occurrence_id: item.id,
            status: data.care_status, occurred_at: payload.occurred_at,
            note: payload.note, data: data.care_data,
          });
          this._card._careSaveMessage = savedRecordFeedback(this._card, result, this._context, item.title || copy(this._hass, "Zorgactie", "Care action"));
        } else if (["add", "followup"].includes(this._mode)) {
          if (scope === "mother") await this._hass.callWS({ type: "puppy_tracker/mother/record/add", litter_id: litterId, ...payload });
          else await addDossierRecord(this._hass, litterId, puppyId || null, payload);
        } else if (scope === "mother") await updateMotherDossierRecord(this._hass, litterId, recordId, payload);
        else await updateDossierRecord(this._hass, litterId, puppyId || null, recordId, payload);
      }
      if (recordId && this._card._reminderUndo?.recordId === recordId) this._card._reminderUndo = null;
      this._card._status = this._mode === "delete" ? localize(this._hass, "dossierItemDeleted")
        : this._mode === "move" ? localize(this._hass, "recordOwnerChanged")
          : this._mode === "restore" ? localize(this._hass, "dossierItemRestored")
            : this._mode === "measurement" ? copy(this._hass, "Meting gecorrigeerd.", "Measurement corrected.")
          : ["followup", "reminder", "care"].includes(this._mode) ? copy(this._hass, "Uitvoering als nieuw logboekitem opgeslagen.", "Completion saved as a new log entry.")
          : this._mode === "add" ? localize(this._hass, "dossierItemAdded")
            : localize(this._hass, "dossierItemUpdated");
      this._close(true);
      try {
        if (this._mode === "care" && typeof this._options.onSaved === "function") await this._options.onSaved(this._options.occurrence);
        else await refreshRecordSource(this._card);
      }
      catch (refreshError) { this._card._error = refreshError.message; this._card._render?.(); }
    } catch (err) {
      error.textContent = err?.message || localize(this._hass, "dossierItemCouldNotSave");
      error.hidden = false;
      bindSaveFeedback(this, "#record-save", { busy: false, failed: true });
    } finally {
      this._busy = false;
      if (!this._closed) {
        this.shadowRoot.querySelectorAll("button,input,select,textarea").forEach((input) => { input.disabled = false; });
        if (["followup", "reminder"].includes(this._mode) || this._draft.record_type === "behavior_observation" || this._draft.data?.care_occurrence_id) this.shadowRoot.getElementById("record-type")?.setAttribute("disabled", "");
      }
    }
  }
}

if (!customElements.get("puppy-tracker-record-editor")) {
  customElements.define("puppy-tracker-record-editor", PuppyTrackerRecordEditor);
}
