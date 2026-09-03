import { escapeHtml, languageForHass } from "./puppy-tracker-card-common.js";

const TODAY_TAG = "puppy-tracker-today-card";
const ATTENTION_TAG = "puppy-tracker-attention-card";

function t(card, nl, en) {
  return languageForHass(card?._hass) === "en" ? en : nl;
}

function openItems(card) {
  return (card.__careOccurrences || []).filter((item) => !["completed", "missed"].includes(item?.status));
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
    const shouldRender = args[0] !== false;
    const result = await original.apply(this, args);
    await loadCare(this);
    if (shouldRender) this._render();
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

function closeResultEditor(card) {
  card.shadowRoot?.querySelector(".care-result-overlay")?.remove();
}

function openResultEditor(card, item) {
  const root = card?.shadowRoot;
  if (!root || !item) return;
  closeResultEditor(card);
  const fields = new Set(item.result_fields || []);
  const overlay = document.createElement("div");
  overlay.className = "care-result-overlay";
  overlay.innerHTML = `<style>
    .care-result-overlay{position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.45);display:grid;place-items:center;padding:18px}.care-result-dialog{width:min(460px,100%);max-height:calc(100vh - 36px);overflow:auto;background:var(--card-background-color);color:var(--primary-text-color);border-radius:16px;padding:18px;box-shadow:0 12px 38px rgba(0,0,0,.35)}.care-result-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.care-result-title{font-size:1.15rem;font-weight:700}.care-result-sub{font-size:.82rem;color:var(--secondary-text-color);margin-top:3px}.care-result-dialog label{display:grid;gap:5px;margin-top:12px;font-size:.84rem;font-weight:600}.care-result-dialog input,.care-result-dialog select,.care-result-dialog textarea{box-sizing:border-box;width:100%;border:1px solid var(--divider-color);border-radius:10px;padding:9px 10px;background:var(--card-background-color);color:var(--primary-text-color);font:inherit}.care-result-dialog textarea{min-height:72px;resize:vertical}.care-result-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}.care-result-actions button,.care-result-close{border:0;border-radius:10px;padding:9px 13px;font:inherit;cursor:pointer}.care-result-close{padding:6px;background:transparent;color:var(--secondary-text-color)}.care-result-save{background:var(--primary-color);color:var(--text-primary-color,#fff);font-weight:600}.care-result-error{margin-top:10px;color:var(--error-color);font-size:.85rem}
  </style><div class="care-result-dialog">
    <div class="care-result-head"><div><div class="care-result-title">${escapeHtml(item.title || t(card, "Zorgactie", "Care action"))}</div><div class="care-result-sub">${escapeHtml(item.puppy_name || t(card, "Pup", "Puppy"))} · ${escapeHtml(t(card, `dag ${item.age_days}`, `day ${item.age_days}`))}</div></div><button class="care-result-close" aria-label="${escapeHtml(t(card,"Sluiten","Close"))}">✕</button></div>
    <label>${escapeHtml(t(card,"Status","Status"))}<select class="care-result-status"><option value="completed">${escapeHtml(t(card,"Uitgevoerd","Completed"))}</option><option value="missed">${escapeHtml(t(card,"Gemist","Missed"))}</option></select></label>
    ${fields.has("result") ? `<label>${escapeHtml(t(card,"Resultaat / reactie","Result / response"))}<input class="care-result-value" placeholder="${escapeHtml(t(card,"Bijv. rustig / neutraal / gevoelig","E.g. calm / neutral / sensitive"))}"></label>` : ""}
    ${fields.has("score") ? `<label>${escapeHtml(t(card,"Score","Score"))}<input class="care-result-score" type="number" step="0.1"></label>` : ""}
    ${fields.has("note") ? `<label>${escapeHtml(t(card,"Notitie","Note"))}<textarea class="care-result-note"></textarea></label>` : ""}
    <div class="care-result-error" hidden></div>
    <div class="care-result-actions"><button class="care-result-cancel">${escapeHtml(t(card,"Annuleren","Cancel"))}</button><button class="care-result-save">${escapeHtml(t(card,"Opslaan","Save"))}</button></div>
  </div>`;
  root.appendChild(overlay);

  const close = () => closeResultEditor(card);
  overlay.querySelector(".care-result-close")?.addEventListener("click", close);
  overlay.querySelector(".care-result-cancel")?.addEventListener("click", close);
  overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });
  overlay.querySelector(".care-result-save")?.addEventListener("click", async () => {
    const button = overlay.querySelector(".care-result-save");
    const error = overlay.querySelector(".care-result-error");
    if (button) button.disabled = true;
    if (error) error.hidden = true;
    try {
      const scoreRaw = overlay.querySelector(".care-result-score")?.value;
      await card._hass.callWS({
        type: "puppy_tracker/care_occurrence/record",
        program_id: item.program_id,
        puppy_id: item.puppy_id,
        occurrence_id: item.id,
        status: overlay.querySelector(".care-result-status")?.value || "completed",
        result: overlay.querySelector(".care-result-value")?.value?.trim() || undefined,
        score: scoreRaw === undefined || scoreRaw === "" ? undefined : Number(scoreRaw),
        note: overlay.querySelector(".care-result-note")?.value?.trim() || undefined,
      });
      close();
      await card._loadData();
    } catch (err) {
      if (error) {
        error.textContent = err?.message || t(card, "Resultaat kon niet worden opgeslagen.", "Result could not be saved.");
        error.hidden = false;
      }
    } finally {
      if (button) button.disabled = false;
    }
  });
}

function wireCareRows(card) {
  const root = card?.shadowRoot;
  if (!root) return;
  root.querySelectorAll("[data-care-occurrence]").forEach((row) => {
    row.classList.add("care-clickable");
    row.addEventListener("click", () => {
      const id = row.dataset.careOccurrence;
      const item = (card.__careOccurrences || []).find((candidate) => candidate.id === id);
      if (item) openResultEditor(card, item);
    });
  });
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
    const relevant = items
      .filter((item) => item.status !== "upcoming" || Number(item.days_until_due) <= 7)
      .filter((item) => this._config?.show_today_only !== true || isTodayItem(item));
    root.querySelector(".care-summary")?.remove();
    if (!relevant.length) return result;
    const section = document.createElement("div");
    section.className = "care-summary";
    section.innerHTML = `<style>
      .care-summary{margin-top:14px;border-top:1px solid var(--divider-color);padding-top:12px}.care-title{font-weight:700;margin-bottom:8px}.care-list{display:grid;gap:7px}.care-row{display:grid;grid-template-columns:24px minmax(0,1fr) auto;gap:8px;align-items:center;padding:8px 9px;border-radius:10px;background:var(--secondary-background-color)}.care-row.danger .care-state{color:var(--error-color)}.care-row.warning .care-state{color:var(--warning-color,var(--primary-color))}.care-main{min-width:0}.care-main strong{display:block}.care-main span{font-size:.78rem;color:var(--secondary-text-color)}.care-state{font-size:.78rem;font-weight:600;white-space:nowrap}.care-clickable{cursor:pointer}
    </style><div class="care-title">${escapeHtml(t(this, "Zorgprogramma", "Care program"))}</div><div class="care-list">${relevant.map((item) => `<div class="care-row ${tone(item)}" data-care-occurrence="${escapeHtml(item.id || "")}"><ha-icon icon="${careIcon(item)}"></ha-icon><div class="care-main"><strong>${escapeHtml(item.title || "")}</strong><span>${escapeHtml(item.puppy_name || t(this, "Pup", "Puppy"))} · ${escapeHtml(t(this, `dag ${item.age_days}`, `day ${item.age_days}`))}</span></div><div class="care-state">${escapeHtml(statusText(this, item))}</div></div>`).join("")}</div>`;
    root.querySelector("ha-card")?.appendChild(section);
    wireCareRows(this);
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
    const items = openItems(this)
      .filter((item) => item.status === "overdue" || item.status === "due_today" || (item.status === "upcoming" && Number(item.days_until_due) <= 3))
      .filter((item) => this._config?.show_today_only !== true || isTodayItem(item));
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
    wireCareRows(this);
    this.__applyAttentionFilters?.();
    return result;
  };
  proto.__careSurfacePatched = true;
}

patchToday();
patchAttention();
