import { escapeHtml, formatDateTime, languageForHass } from "./puppy-tracker-card-common.js";
import { appendEditAction } from "./puppy-tracker-form-state.js";
import { canEditRecords, openRecordEditor, openReminderEditor, recordContext, refreshRecordSource, reminderCompleteButton, RECORD_ACTION_STYLE } from "./puppy-tracker-record-editor.js";
import { TYPE_FIELDS, fieldLabel, recordTypeIcon } from "./puppy-tracker-dossier-schema.js";

const text = (card, nl, en) => languageForHass(card._hass) === "en" ? en : nl;

function executionTime(card, value) {
  const date = new Date(value);
  if (!value || !Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat(languageForHass(card._hass) === "en" ? "en-GB" : "nl-NL", {
    dateStyle: "short", timeStyle: "short", timeZone: card._hass?.config?.time_zone || undefined,
  }).format(date);
}

export function lastExecutionDetails(card, item) {
  const record = item.last_execution;
  const label = text(card, "Laatste uitvoering", "Last execution");
  if (!record) return `<div class="recurring-last-empty">${escapeHtml(item.last_completed_at
    ? `${label}: ${executionTime(card, item.last_completed_at)}` : text(card, "Nog geen uitvoering geregistreerd", "No execution recorded yet"))}</div>`;
  const fields = (TYPE_FIELDS[record.type] || []).filter((field) => record.data?.[field.key] != null && record.data[field.key] !== "");
  const values = fields.map((field) => `<div><dt>${escapeHtml(fieldLabel(card._hass, field))}</dt><dd>${escapeHtml(record.data[field.key])}</dd></div>`).join("");
  const edit = text(card, "Registratie aanpassen", "Edit log entry");
  return `<details class="recurring-last-execution" data-last-execution="${escapeHtml(item.id)}" ${card._expandedReminderExecutions?.has(item.id) ? "open" : ""}>
    <summary>${escapeHtml(label)}: ${escapeHtml(executionTime(card, record.occurred_at))}</summary>
    <dl>${record.data?.recurring_due_at ? `<div><dt>${escapeHtml(text(card, "Gepland", "Scheduled"))}</dt><dd>${escapeHtml(executionTime(card, record.data.recurring_due_at))}</dd></div>` : ""}
    <div><dt>${escapeHtml(text(card, "Uitgevoerd", "Completed"))}</dt><dd>${escapeHtml(executionTime(card, record.occurred_at))}</dd></div>${values}</dl>
    ${record.note ? `<p class="recurring-execution-note">${escapeHtml(record.note)}</p>` : ""}
    ${canEditRecords(card) ? `<button type="button" class="record-edit-button" data-edit-execution="${escapeHtml(item.id)}" title="${escapeHtml(edit)}" aria-label="${escapeHtml(edit)}"><ha-icon icon="mdi:pencil-outline"></ha-icon></button>` : ""}</details>`;
}

export function captureLastExecutions(card) {
  card._expandedReminderExecutions ||= new Set();
  card.shadowRoot?.querySelectorAll("[data-last-execution]").forEach((details) => {
    if (details.open) card._expandedReminderExecutions.add(details.dataset.lastExecution);
    else card._expandedReminderExecutions.delete(details.dataset.lastExecution);
  });
}

export function bindLastExecutions(card, root, items) {
  if (!card.shadowRoot.getElementById("recurring-history-style")) {
    const style = document.createElement("style");
    style.id = "recurring-history-style";
    style.textContent = `${RECORD_ACTION_STYLE}.recurring-last-execution,.recurring-last-empty{font-size:12px;color:var(--secondary-text-color);margin-top:5px;min-width:0;overflow-wrap:anywhere}.recurring-last-execution summary{cursor:pointer;padding:5px 0}.recurring-last-execution dl{display:grid;gap:6px;margin:8px 0}.recurring-last-execution dt{color:var(--secondary-text-color)}.recurring-last-execution dd{margin:0;color:var(--primary-text-color);white-space:pre-wrap;overflow-wrap:anywhere}.recurring-execution-note{white-space:pre-wrap;overflow-wrap:anywhere;color:var(--primary-text-color);margin:8px 0}.recurring-save-feedback{display:flex;align-items:center;flex-wrap:wrap;gap:8px}.recurring-feedback-message{flex:1 1 180px}.recurring-undo-error{flex-basis:100%;color:var(--error-color)}`;
    card.shadowRoot.append(style);
  }
  root?.querySelectorAll("[data-last-execution]").forEach((details) => {
    if (details.dataset.bound) return;
    details.dataset.bound = "true";
    details.addEventListener("click", (event) => event.stopPropagation());
    details.addEventListener("toggle", () => {
      if (!details.isConnected) return;
      card._expandedReminderExecutions ||= new Set();
      if (details.open) card._expandedReminderExecutions.add(details.dataset.lastExecution);
      else card._expandedReminderExecutions.delete(details.dataset.lastExecution);
    });
    details.querySelector("[data-edit-execution]")?.addEventListener("click", (event) => {
      const item = items.find((candidate) => candidate.id === details.dataset.lastExecution);
      if (item?.last_execution) openRecordEditor(card, recordContext(card, item.last_execution), { trigger: event.currentTarget });
    });
  });
}

export async function loadRecurringReminders(card) {
  const litterId = card._selectedLitterId;
  if (!card._hass || !litterId) { card._recurringReminders = []; return; }
  try {
    const result = await card._hass.callWS({ type: "puppy_tracker/recurring_reminders", litter_id: litterId });
    if (litterId === card._selectedLitterId) card._recurringReminders = result?.reminders || [];
  } catch (_error) {
    if (litterId === card._selectedLitterId) card._recurringReminders = [];
  }
}

function calendarDay(card, value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const options = { year: "numeric", month: "2-digit", day: "2-digit" };
  if (card._hass?.config?.time_zone) options.timeZone = card._hass.config.time_zone;
  return new Intl.DateTimeFormat("en-CA", options).format(date);
}

export function renderTodayReminders(card) {
  const root = card.shadowRoot;
  root?.querySelector(".today-reminder-section")?.remove();
  const today = calendarDay(card, Date.now());
  const items = (card._recurringReminders || []).filter((item) => item.enabled !== false && item.next_due_at
    && (!card._config.show_today_only || calendarDay(card, item.next_due_at) === today));
  if (!items.length) return;
  const section = document.createElement("section");
  section.className = "today-reminder-section";
  section.innerHTML = `<style>${RECORD_ACTION_STYLE}.today-reminder-section{margin-top:12px}.today-reminder-list{display:grid;gap:7px}.today-reminder-row{display:grid;grid-template-columns:24px minmax(0,1fr) 40px;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--divider-color)}.today-reminder-main{min-width:0;overflow-wrap:anywhere}.today-reminder-main strong,.today-reminder-main span{display:block}.today-reminder-main span{font-size:12px;color:var(--secondary-text-color)}.today-reminder-row.overdue strong{color:var(--error-color)}</style>
    <div class="today-group-title">${escapeHtml(text(card, "Herinneringen", "Reminders"))}</div><div class="today-reminder-list">${items.map((item) => `<div class="today-reminder-row ${item.status === "overdue" ? "overdue" : ""}" data-today-type="${escapeHtml(item.record_type)}" data-recurring-reminder="${escapeHtml(item.id)}"><ha-icon icon="${escapeHtml(recordTypeIcon(item.record_type))}"></ha-icon><div class="today-reminder-main"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.owner_name || "")} · ${escapeHtml(formatDateTime(item.next_due_at, "", card._hass))}</span></div>${reminderCompleteButton(card, item)}</div>`).join("")}</div>`;
  bindReminderButtons(card, section, items);
  section.querySelectorAll("[data-recurring-reminder]").forEach((row) => {
    const item = items.find((candidate) => candidate.id === row.dataset.recurringReminder);
    row.querySelector(".today-reminder-main").insertAdjacentHTML("beforeend", lastExecutionDetails(card, item));
  });
  bindLastExecutions(card, section, items);
  root.querySelector("ha-card")?.append(section);
}

export function bindReminderButtons(card, root, items) {
  root?.querySelectorAll("[data-complete-reminder]").forEach((button) => button.addEventListener("click", (event) => {
    event.preventDefault(); event.stopPropagation();
    const item = items.find((candidate) => candidate.id === button.dataset.completeReminder);
    if (item) openReminderEditor(card, item, { trigger: button });
  }));
}

export function renderRecurringSaveFeedback(card) {
  const root = card.shadowRoot;
  bindLastExecutions(card, root, []);
  root?.querySelector(".recurring-save-feedback")?.remove();
  if (!card._reminderSaveMessage || (card._reminderFeedbackLitterId && card._reminderFeedbackLitterId !== card._selectedLitterId)) return;
  const status = document.createElement("div");
  status.className = "recurring-save-feedback";
  status.setAttribute("role", "status");
  status.style.cssText = "margin-top:12px;overflow-wrap:anywhere";
  const message = document.createElement("span");
  message.className = "recurring-feedback-message";
  message.textContent = card._reminderSaveMessage;
  status.append(message);
  if (card._reminderSavedRecord && canEditRecords(card)) appendEditAction(card, status,
    (event) => openRecordEditor(card, card._reminderSavedRecord, { trigger: event.currentTarget }));
  const undo = card._reminderUndo;
  if (undo?.litterId === card._selectedLitterId && canEditRecords(card)) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "record-edit-button";
    button.title = text(card, "Uitvoering ongedaan maken", "Undo execution");
    button.setAttribute("aria-label", button.title);
    button.disabled = Boolean(card._saving || card._busy);
    button.innerHTML = '<ha-icon icon="mdi:undo-variant"></ha-icon>';
    button.addEventListener("click", () => undoExecution(card, undo));
    status.append(button);
  }
  if (card._reminderUndoError) {
    const error = document.createElement("div");
    error.className = "recurring-undo-error";
    error.setAttribute("role", "alert");
    error.textContent = card._reminderUndoError;
    status.append(error);
  }
  root?.querySelector("ha-card")?.append(status);
  if (card._reminderUndoBusy) root?.querySelectorAll("button,input,select,textarea").forEach((control) => { control.disabled = true; });
}

async function undoExecution(card, undo) {
  if (card._reminderUndoBusy || card._busy || card._saving || !canEditRecords(card)) return;
  const execution = `${undo.ownerName || ""} (${executionTime(card, undo.occurredAt)})`;
  if (!window.confirm(text(card, `Uitvoering voor ${execution} ongedaan maken? Alleen deze registratie wordt verwijderd; de herinnering wordt opnieuw berekend.`,
    `Undo the execution for ${execution}? Only this log entry will be deleted; the reminder will be recalculated.`))) return;
  card._reminderUndoBusy = true;
  card._busy = true;
  card._reminderUndoError = "";
  renderRecurringSaveFeedback(card);
  try {
    await card._hass.callWS({ type: "puppy_tracker/recurring_reminder/undo", reminder_id: undo.reminderId,
      record_id: undo.recordId, expected_record_updated_at: undo.updatedAt });
    card._reminderUndo = null;
    card._reminderSavedRecord = null;
    if (card._savedRecord?.recordId === undo.recordId) card._savedRecord = null;
    card._reminderSaveMessage = text(card, "Uitvoering ongedaan gemaakt. De planning wordt opnieuw bepaald.", "Execution undone. The schedule will be recalculated.");
  } catch (error) {
    if (error?.code === "stale_execution") card._reminderUndo = null;
    card._reminderUndoError = error?.code === "stale_execution"
      ? text(card, "Deze registratie is inmiddels gewijzigd of opgevolgd. Vernieuw de kaart en controleer het logboek.", "This entry has changed or a newer execution exists. Refresh the card and check the log.")
      : error?.message || text(card, "Ongedaan maken mislukt. Probeer het opnieuw.", "Could not undo the execution. Try again.");
  } finally {
    card._reminderUndoBusy = false;
    card._busy = false;
    try { await refreshRecordSource(card); }
    catch (_error) {
      card._reminderUndoError ||= text(card, "Vernieuwen mislukt. Herlaad de kaart om de actuele planning te zien.", "Refresh failed. Reload the card to see the current schedule.");
      card._render?.();
    }
  }
}
