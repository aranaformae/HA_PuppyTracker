import { escapeHtml, languageForHass } from "./puppy-tracker-card-common.js";

const TODAY_TAG = "puppy-tracker-today-card";
const ATTENTION_TAG = "puppy-tracker-attention-card";

function t(card, nl, en) {
  return languageForHass(card?._hass) === "en" ? en : nl;
}

function openItems(card) {
  return (card.__careOccurrences || []).filter((item) => !["completed", "missed"].includes(item?.status));
}

function statusText(card, item) {
  if (item?.status === "overdue") {
    const days = Math.abs(Number(item.days_until_due || 0));
    return days === 1 ? t(card, "1 dag te laat", "1 day overdue") : t(card, `${days} dagen te laat`, `${days} days overdue`);
  }
  if (item?.status === "due_today") return t(card, "Vandaag", "Today");
  const days = Number(item?.days_until_due || 0);
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
  }
}

function patchLoad(proto) {
  if (!proto || proto.__careLoadPatched) return;
  const original = proto._loadData;
  if (typeof original !== "function") return;
  proto._loadData = async function (...args) {
    const result = await original.apply(this, args);
    await loadCare(this);
    return result;
  };
  proto.__careLoadPatched = true;
}

function careIcon(item) {
  const type = String(item?.record_type || "");
  if (type === "deworming" || type === "medication") return "mdi:pill";
  if (type === "vaccination") return "mdi:needle";
  if (type === "test") return "mdi:flask-outline";
  return "mdi:calendar-heart";
}

function patchToday() {
  const ctor = customElements.get(TODAY_TAG);
  const proto = ctor?.prototype;
  if (!proto || proto.__careSurfacePatched) return;
  patchLoad(proto);
  const originalRender = proto._render;
  proto._render = function (...args) {
    const result = originalRender.apply(this, args);
    const root = this.shadowRoot;
    if (!root) return result;
    const items = openItems(this).filter((item) => ["overdue", "due_today", "upcoming"].includes(item.status));
    const relevant = items.filter((item) => item.status !== "upcoming" || Number(item.days_until_due) <= 7);
    root.querySelector(".care-summary")?.remove();
    if (!relevant.length) return result;
    const section = document.createElement("div");
    section.className = "care-summary";
    section.innerHTML = `<style>
      .care-summary{margin-top:14px;border-top:1px solid var(--divider-color);padding-top:12px}.care-title{font-weight:700;margin-bottom:8px}.care-list{display:grid;gap:7px}.care-row{display:grid;grid-template-columns:24px minmax(0,1fr) auto;gap:8px;align-items:center;padding:8px 9px;border-radius:10px;background:var(--secondary-background-color)}.care-row.danger .care-state{color:var(--error-color)}.care-row.warning .care-state{color:var(--warning-color,var(--primary-color))}.care-main{min-width:0}.care-main strong{display:block}.care-main span{font-size:.78rem;color:var(--secondary-text-color)}.care-state{font-size:.78rem;font-weight:600;white-space:nowrap}
    </style><div class="care-title">${escapeHtml(t(this, "Zorgprogramma", "Care program"))}</div><div class="care-list">${relevant.map((item) => `<div class="care-row ${tone(item)}"><ha-icon icon="${careIcon(item)}"></ha-icon><div class="care-main"><strong>${escapeHtml(item.title || "")}</strong><span>${escapeHtml(item.puppy_name || t(this, "Pup", "Puppy"))} · ${escapeHtml(t(this, `dag ${item.age_days}`, `day ${item.age_days}`))}</span></div><div class="care-state">${escapeHtml(statusText(this, item))}</div></div>`).join("")}</div>`;
    root.querySelector("ha-card")?.appendChild(section);
    return result;
  };
  proto.__careSurfacePatched = true;
}

function patchAttention() {
  const ctor = customElements.get(ATTENTION_TAG);
  const proto = ctor?.prototype;
  if (!proto || proto.__careSurfacePatched) return;
  patchLoad(proto);
  const originalRender = proto._render;
  proto._render = function (...args) {
    const result = originalRender.apply(this, args);
    const root = this.shadowRoot;
    if (!root) return result;
    const items = openItems(this).filter((item) => item.status === "overdue" || item.status === "due_today" || (item.status === "upcoming" && Number(item.days_until_due) <= 3));
    if (!items.length) return result;
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
      row.innerHTML = `<div class="icon ha"><ha-icon icon="${careIcon(item)}"></ha-icon></div><div class="main"><div class="name">${escapeHtml(item.puppy_name || t(this, "Pup", "Puppy"))}</div><div class="reason">${escapeHtml(item.title || "")} · ${escapeHtml(t(this, `dag ${item.age_days}`, `day ${item.age_days}`))}</div></div><div class="status">${escapeHtml(statusText(this, item))}</div>`;
      list.appendChild(row);
    }
    return result;
  };
  proto.__careSurfacePatched = true;
}

patchToday();
patchAttention();
