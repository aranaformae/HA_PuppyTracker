import { escapeHtml, languageForHass, registerCardHooks } from "./puppy-tracker-card-common.js";

const ATTENTION_TAG = "puppy-tracker-attention-card";

function isEnglish(card) {
  return languageForHass(card?._hass) === "en";
}

function copy(card, nl, en) {
  return isEnglish(card) ? en : nl;
}

function motherName(card) {
  return card?._litterData?.litter?.mother || card?._data?.litter?.mother || null;
}

function actionStatus(card, action) {
  const days = Number(action?.days_until_due ?? action?.days_until);
  if (action?.status === "overdue") {
    const amount = Math.abs(days);
    return isEnglish(card) ? `${amount} day${amount === 1 ? "" : "s"} overdue` : `${amount} dag${amount === 1 ? "" : "en"} te laat`;
  }
  if (action?.status === "due_today") return copy(card, "Vandaag", "Today");
  if (action?.status === "upcoming") {
    if (days === 1) return copy(card, "Morgen", "Tomorrow");
    return copy(card, `Over ${days} dagen`, `In ${days} days`);
  }
  return copy(card, "Gepland", "Planned");
}

function actionTitle(card, action) {
  const type = String(action?.type || action?.record_type || "");
  if (type === "vaccination") return copy(card, "Vaccinatie", "Vaccination");
  if (type === "deworming") return copy(card, "Ontworming", "Deworming");
  return action?.title || action?.label || copy(card, "Dossieritem", "Dossier item");
}

function actionDate(card, value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return String(value || "");
  return isEnglish(card) ? `${match[2]}/${match[3]}/${match[1]}` : `${match[3]}-${match[2]}-${match[1]}`;
}

async function loadMotherAttention(card) {
  card.__motherAttention = null;
  if (card._hass && card._selectedLitterId && card._data?.litter?.mother) {
    try {
      card.__motherAttention = await card._hass.callWS({
        type: "puppy_tracker/mother/attention",
        litter_id: card._selectedLitterId,
      });
    } catch (_error) {
      card.__motherAttention = null;
    }
  }
}

function renderMotherAttention(card) {
  const root = card.shadowRoot;
  const actions = card.__motherAttention?.dossier_actions?.actions || [];
  if (!root || !actions.length) return;

  let list = root.querySelector(".list");
  if (!list) {
    root.querySelector(".all-ok")?.remove();
    list = document.createElement("div");
    list.className = "list";
    root.querySelector("ha-card")?.append(list);
  }

  for (const action of actions) {
    if (action?.due_soon === false) continue;
    const row = document.createElement("div");
    row.className = `row mother-action ${action.status === "overdue" ? "danger" : action.status === "due_today" ? "warning" : "neutral"}`;
    const sourceId = action.id || `${action.source_record_id || action.record_id || "unknown"}:${action.due_field || "due"}`;
    row.dataset.attentionId = `mother:${sourceId}`;
    row.dataset.attentionType = String(action.record_type || action.type || action.category || "dossier");
    const reason = `${actionTitle(card, action)} · ${actionDate(card, action.due_date || action.due_at)}`;
    row.innerHTML = `<div class="icon ha"><ha-icon icon="${escapeHtml(action.icon || "mdi:calendar-alert")}"></ha-icon></div><div class="main"><div class="name">${escapeHtml(copy(card, "Moederhond", "Mother"))} · ${escapeHtml(card.__motherAttention?.owner?.name || motherName(card) || "")}</div><div class="reason">${escapeHtml(reason)}</div></div><div class="status">${escapeHtml(actionStatus(card, action))}</div>`;
    list.append(row);
  }
}

registerCardHooks(ATTENTION_TAG, {
  priority: 350,
  afterLoad: loadMotherAttention,
  afterRender: renderMotherAttention,
});
