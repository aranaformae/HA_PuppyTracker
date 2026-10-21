import { escapeHtml, formatDateTime, languageForHass } from "./puppy-tracker-card-common.js";
import { appendEditAction } from "./puppy-tracker-form-state.js";
import { canEditRecords, openRecordEditor, openReminderEditor, reminderCompleteButton, RECORD_ACTION_STYLE } from "./puppy-tracker-record-editor.js";
import { recordTypeIcon } from "./puppy-tracker-dossier-schema.js";

const text = (card, nl, en) => languageForHass(card._hass) === "en" ? en : nl;

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
  root?.querySelector(".recurring-save-feedback")?.remove();
  if (!card._reminderSaveMessage) return;
  const status = document.createElement("div");
  status.className = "recurring-save-feedback";
  status.setAttribute("role", "status");
  status.style.cssText = "margin-top:12px;overflow-wrap:anywhere";
  status.textContent = card._reminderSaveMessage;
  if (card._reminderSavedRecord && canEditRecords(card)) appendEditAction(card, status,
    (event) => openRecordEditor(card, card._reminderSavedRecord, { trigger: event.currentTarget }));
  root?.querySelector("ha-card")?.append(status);
}
