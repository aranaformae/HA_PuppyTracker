import { escapeHtml, languageForHass, registerCardHooks } from "./puppy-tracker-card-common.js";
import { findCareOccurrence, openCareResultEditor } from "./puppy-tracker-care-result-editor.js";

const TODAY_TAG = "puppy-tracker-today-card";
const ATTENTION_TAG = "puppy-tracker-attention-card";
const CARE_EXECUTION_TAG = "puppy-tracker-care-execution-card";

function t(card, nl, en) {
  return languageForHass(card?._hass) === "en" ? en : nl;
}

function openItems(card) {
  return (card.__careOccurrences || []).filter((item) => !["completed", "missed"].includes(item?.status));
}

function attentionItems(card) {
  return openItems(card).filter((item) => item?.counts_for_attention !== false);
}

function isTodayItem(item) {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return String(item?.scheduled_date || "") === today
    || item?.status === "due_today"
    || Number(item?.days_until_due) === 0;
}

function statusText(card, item) {
  if (item?.status === "overdue") {
    const days = Math.abs(Number(item.days_until_due || 0));
    return days === 1 ? t(card, "1 dag te laat", "1 day overdue") : t(card, `${days} dagen te laat`, `${days} days overdue`);
  }
  if (item?.status === "due_today") return t(card, "Vandaag", "Today");
  const days = Number(item?.days_until_due || 0);
  if (days === 0) {
    const clock = String(item?.time_of_day || "").trim();
    return clock ? t(card, `Vandaag om ${clock}`, `Today at ${clock}`) : t(card, "Vandaag", "Today");
  }
  if (days === 1) return t(card, "Morgen", "Tomorrow");
  return t(card, `Over ${days} dagen`, `In ${days} days`);
}

function tone(item) {
  if (item?.status === "overdue") return "danger";
  if (item?.status === "due_today") return "warning";
  return "neutral";
}

async function loadCare(card) {
  if (!card?._hass || !card?._selectedLitterId) {
    card.__careOccurrences = [];
    card.__careSkipped = [];
    return;
  }
  try {
    const response = await card._hass.callWS({
      type: "puppy_tracker/care_occurrences",
      litter_id: card._selectedLitterId,
    });
    card.__careOccurrences = response?.occurrences || [];
    card.__careSkipped = response?.skipped || [];
  } catch (_error) {
    card.__careOccurrences = [];
    card.__careSkipped = [];
  }
}

function careIcon(item) {
  const type = String(item?.record_type || "");
  if (type === "deworming" || type === "medication") return "mdi:pill";
  if (type === "vaccination") return "mdi:needle";
  if (type === "test") return "mdi:flask-outline";
  return "mdi:calendar-heart";
}

function uniqueSkipped(items) {
  const byPuppy = new Map();
  for (const item of items || []) {
    const puppyId = String(item?.puppy_id || "");
    if (!puppyId || byPuppy.has(puppyId)) continue;
    byPuppy.set(puppyId, item);
  }
  return [...byPuppy.values()];
}

function skippedWarningText(card, skipped) {
  const missingBirth = skipped.filter((item) => item?.reason_code === "missing_birth_time");
  const other = skipped.filter((item) => item?.reason_code !== "missing_birth_time");
  const parts = [];
  if (missingBirth.length) {
    const names = missingBirth.map((item) => item?.puppy_name || t(card, "Pup", "Puppy")).join(", ");
    parts.push(t(
      card,
      `Geen zorgplanning voor ${names}: geboortetijd ontbreekt.`,
      `No care schedule for ${names}: birth time is missing.`,
    ));
  }
  if (other.length) {
    const names = other.map((item) => item?.puppy_name || t(card, "Pup", "Puppy")).join(", ");
    parts.push(t(
      card,
      `Zorgplanning kon niet worden berekend voor ${names}. Controleer het programma.`,
      `Care schedule could not be calculated for ${names}. Check the program.`,
    ));
  }
  return parts.join(" ");
}

function renderSkippedWarning(card) {
  const root = card?.shadowRoot;
  if (!root) return;
  root.querySelector(".care-skipped-warning")?.remove();
  const skipped = uniqueSkipped(card.__careSkipped || []);
  if (!skipped.length) return;

  root.querySelector(".all-ok")?.remove();
  const warning = document.createElement("div");
  warning.className = "care-skipped-warning";
  warning.innerHTML = `<style>
    .care-skipped-warning{margin-top:12px;display:flex;gap:9px;align-items:flex-start;padding:10px 12px;border:1px solid var(--warning-color,var(--primary-color));border-radius:10px;background:var(--secondary-background-color);font-size:.84rem;line-height:1.35}.care-skipped-warning ha-icon{flex:0 0 auto;color:var(--warning-color,var(--primary-color))}
  </style><ha-icon icon="mdi:alert-circle-outline"></ha-icon><div>${escapeHtml(skippedWarningText(card, skipped))}</div>`;
  root.querySelector("ha-card")?.appendChild(warning);
}

function ensureDirectActionStyle(card) {
  const root = card?.shadowRoot;
  if (!root || root.querySelector("#puppy-tracker-care-direct-action-style")) return;
  const style = document.createElement("style");
  style.id = "puppy-tracker-care-direct-action-style";
  style.textContent = `
    .care-direct-action{display:inline-flex;align-items:center;justify-content:center;gap:5px;min-height:30px;border:0;border-radius:8px;padding:0 9px;background:var(--primary-color);color:var(--text-primary-color,#fff);font:inherit;font-size:.76rem;font-weight:700;cursor:pointer;white-space:nowrap}
    .care-direct-action:hover{filter:brightness(1.05)}
    .care-direct-action ha-icon{--mdc-icon-size:16px}
    .care-row[data-care-occurrence]{grid-template-columns:24px minmax(0,1fr) auto auto!important}
    .list>.row[data-care-occurrence],.attention-ack-list>.row[data-care-occurrence]{grid-template-columns:34px minmax(0,1fr) auto auto 32px!important}
    @container attention-card (max-width:520px){
      .list>.row[data-care-occurrence],.attention-ack-list>.row[data-care-occurrence]{grid-template-columns:34px minmax(0,1fr) auto 32px!important}
      .list>.row[data-care-occurrence]>.status,.attention-ack-list>.row[data-care-occurrence]>.status{display:none}
      .care-direct-action{padding:0 8px}
    }
  `;
  root.append(style);
}

function addDirectActionButtons(card) {
  const root = card?.shadowRoot;
  if (!root) return;
  ensureDirectActionStyle(card);
  root.querySelectorAll("[data-care-occurrence]").forEach((row) => {
    if (row.querySelector(":scope > .care-direct-action")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "care-direct-action";
    button.title = t(card, "Zorgactie uitvoeren", "Complete care action");
    button.setAttribute("aria-label", button.title);
    button.innerHTML = `<ha-icon icon="mdi:check-circle-outline"></ha-icon><span>${escapeHtml(t(card, "Uitvoeren", "Complete"))}</span>`;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const item = findCareOccurrence(card, row.dataset.careOccurrence);
      if (item) openCareResultEditor(card, item);
    });
    const acknowledge = row.querySelector(":scope > .attention-ack-button");
    if (acknowledge) row.insertBefore(button, acknowledge);
    else row.append(button);
  });
}

function wireCareRows(card) {
  const root = card?.shadowRoot;
  if (!root) return;
  root.querySelectorAll("[data-care-occurrence]").forEach((row) => {
    row.classList.add("care-clickable");
    row.addEventListener("click", (event) => {
      if (event.target?.closest?.("button, a, select, input, textarea")) return;
      const item = findCareOccurrence(card, row.dataset.careOccurrence);
      if (item) openCareResultEditor(card, item);
    });
  });
}

function renderCareExecution(card) {
    const root = card.shadowRoot;
    if (!root) return;
    root.querySelectorAll(".row").forEach((row) => {
      const action = row.querySelector("button[data-action][data-id]");
      if (action?.dataset.id) row.dataset.careOccurrence = action.dataset.id;
    });
    wireCareRows(card);
}

function renderToday(card) {
    const root = card.shadowRoot;
    if (!root) return;
    const items = openItems(card).filter((item) => ["overdue", "due_today", "upcoming"].includes(item.status));
    const relevant = items
      .filter((item) => item.status !== "upcoming" || Number(item.days_until_due) <= 7)
      .filter((item) => card._config?.show_today_only !== true || isTodayItem(item));
    root.querySelector(".care-summary")?.remove();
    if (!relevant.length) return;
    const section = document.createElement("div");
    section.className = "care-summary";
    section.innerHTML = `<style>
    .care-summary{margin-top:14px;border-top:1px solid var(--divider-color);padding-top:12px;max-height:520px;overflow-y:auto;overscroll-behavior:contain}.care-title{font-weight:700;margin-bottom:8px}.care-list{display:grid;gap:7px}.care-row{display:grid;grid-template-columns:24px minmax(0,1fr) auto;gap:8px;align-items:center;padding:8px 9px;border-radius:10px;background:var(--secondary-background-color)}.care-row.danger .care-state{color:var(--error-color)}.care-row.warning .care-state{color:var(--warning-color,var(--primary-color))}.care-main{min-width:0}.care-main strong{display:block}.care-main span{font-size:.78rem;color:var(--secondary-text-color)}.care-instructions{display:block;margin-top:4px;color:var(--primary-text-color);white-space:pre-wrap;overflow-wrap:anywhere}.care-state{font-size:.78rem;font-weight:600;white-space:nowrap}.care-clickable{cursor:pointer}
    </style><div class="care-title">${escapeHtml(t(card, "Zorgprogramma", "Care program"))}</div><div class="care-list">${relevant.map((item) => `<div class="care-row ${tone(item)}" data-care-occurrence="${escapeHtml(item.id || "")}"><ha-icon icon="${careIcon(item)}"></ha-icon><div class="care-main"><strong>${escapeHtml(item.title || "")}</strong><span>${escapeHtml(item.puppy_name || t(card, "Pup", "Puppy"))} · ${escapeHtml(t(card, `dag ${item.age_days}`, `day ${item.age_days}`))}</span>${item.instructions ? `<small class="care-instructions">${escapeHtml(item.instructions)}</small>` : ""}</div><div class="care-state">${escapeHtml(statusText(card, item))}</div></div>`).join("")}</div>`;
    root.querySelector("ha-card")?.appendChild(section);
    wireCareRows(card);
}

function renderAttention(card) {
    const root = card.shadowRoot;
    if (!root) return;
    root.querySelectorAll("[data-care-occurrence]").forEach((row) => row.remove());
    const items = attentionItems(card)
      .filter((item) => item.status === "overdue" || item.status === "due_today" || (item.status === "upcoming" && Number(item.days_until_due) <= 3))
      .filter((item) => card._config?.show_today_only !== true || isTodayItem(item));
    if (!items.length) return;
    let list = root.querySelector(".list");
    const allOk = root.querySelector(".all-ok");
    if (!list) {
      allOk?.remove();
      list = document.createElement("div");
      list.className = "list";
      root.querySelector("ha-card")?.appendChild(list);
    }
    for (const item of items) {
      const row = document.createElement("div");
      row.className = `row ${tone(item)}`;
      row.dataset.careOccurrence = item.id || "";
      row.innerHTML = `<div class="icon ha"><ha-icon icon="${careIcon(item)}"></ha-icon></div><div class="main"><div class="name">${escapeHtml(item.puppy_name || t(card, "Pup", "Puppy"))}</div><div class="reason">${escapeHtml(item.title || "")} · ${escapeHtml(t(card, `dag ${item.age_days}`, `day ${item.age_days}`))}</div></div><div class="status">${escapeHtml(statusText(card, item))}</div>`;
      list.appendChild(row);
    }
    wireCareRows(card);
}

registerCardHooks(TODAY_TAG, { priority: 100, afterLoad: loadCare, afterRender: renderToday });
registerCardHooks(ATTENTION_TAG, { priority: 100, afterLoad: loadCare, afterRender: renderAttention });
registerCardHooks(CARE_EXECUTION_TAG, { priority: 100, afterRender: renderCareExecution });
registerCardHooks(TODAY_TAG, { priority: 300, afterRender: renderSkippedWarning });
registerCardHooks(ATTENTION_TAG, { priority: 300, afterRender: renderSkippedWarning });
registerCardHooks(TODAY_TAG, { priority: 500, afterRender: addDirectActionButtons });
registerCardHooks(ATTENTION_TAG, { priority: 500, afterRender: addDirectActionButtons });
