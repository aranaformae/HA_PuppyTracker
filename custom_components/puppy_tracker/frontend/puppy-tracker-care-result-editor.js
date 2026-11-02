import { languageForHass } from "./puppy-tracker-card-common.js";
import { appendEditAction } from "./puppy-tracker-form-state.js";
import { canEditRecords, openCareExecutionEditor, openRecordEditor } from "./puppy-tracker-record-editor.js";

function t(card, nl, en) {
  return languageForHass(card?._hass) === "en" ? en : nl;
}

async function refreshCard(card) {
  if (!card?.isConnected) return;
  if (typeof card?._loadData === "function") {
    await card._loadData();
    return;
  }
  if (typeof card?._loadOccurrences === "function") {
    await card._loadOccurrences();
    card._render?.();
  }
}

export function findCareOccurrence(card, occurrenceId) {
  const items = card?.__careOccurrences || card?._occurrences || [];
  return items.find((item) => item?.id === occurrenceId) || null;
}

export function renderCareSaveFeedback(card) {
  const root = card.shadowRoot;
  root?.querySelector(".care-save-feedback")?.remove();
  if (!card._careSaveMessage) return;
  const status = document.createElement("div");
  status.className = "care-save-feedback";
  status.setAttribute("role", "status");
  status.style.cssText = "margin-top:12px;padding:10px;background:var(--secondary-background-color);overflow-wrap:anywhere";
  status.textContent = card._careSaveMessage;
  if (card._savedRecord && canEditRecords(card)) appendEditAction(card, status, (event) => openRecordEditor(card, card._savedRecord, { trigger: event.currentTarget }));
  root?.querySelector("ha-card")?.append(status);
}

export function openCareResultEditor(card, item, options = {}) {
  const root = card?.shadowRoot;
  if (!root || !item || !card?._hass || card._hass.user?.is_admin === false) return;
  return openCareExecutionEditor(card, item, {
    ...options,
    onSaved: async (savedItem) => {
      try {
        if (typeof options.onSaved === "function") await options.onSaved(savedItem);
        else await refreshCard(card);
      } finally { renderCareSaveFeedback(card); }
    },
  });
}
