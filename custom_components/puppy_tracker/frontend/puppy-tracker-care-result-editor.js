import { escapeHtml, languageForHass } from "./puppy-tracker-card-common.js";

function t(card, nl, en) {
  return languageForHass(card?._hass) === "en" ? en : nl;
}

async function refreshCard(card) {
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

export function openCareResultEditor(card, item, options = {}) {
  const root = card?.shadowRoot;
  if (!root || !item || !card?._hass) return;

  root.querySelector(".care-result-overlay")?.remove();
  const previousFocus = root.activeElement || document.activeElement;
  const fields = new Set(item.result_fields || []);
  const titleId = `care-result-title-${String(item.id || "item").replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  const overlay = document.createElement("div");
  overlay.className = "care-result-overlay";
  overlay.innerHTML = `<style>
    .care-result-overlay{position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.45);display:grid;place-items:center;padding:18px}.care-result-dialog{width:min(460px,100%);max-height:calc(100vh - 36px);overflow:auto;background:var(--card-background-color);color:var(--primary-text-color);border-radius:12px;padding:18px;box-shadow:0 12px 38px rgba(0,0,0,.35)}.care-result-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.care-result-title{font-size:1.15rem;font-weight:700}.care-result-sub{font-size:.82rem;color:var(--secondary-text-color);margin-top:3px}.care-result-dialog label{display:grid;gap:5px;margin-top:12px;font-size:.84rem;font-weight:600}.care-result-dialog input,.care-result-dialog select,.care-result-dialog textarea{box-sizing:border-box;width:100%;border:1px solid var(--divider-color);border-radius:8px;padding:9px 10px;background:var(--card-background-color);color:var(--primary-text-color);font:inherit}.care-result-dialog textarea{min-height:72px;resize:vertical}.care-result-instructions{margin-top:12px;padding:10px 12px;border-left:3px solid var(--primary-color);background:var(--secondary-background-color);border-radius:8px}.care-result-instructions-title{font-size:.8rem;font-weight:700;color:var(--secondary-text-color);margin-bottom:5px}.care-result-instructions-text{white-space:pre-wrap;overflow-wrap:anywhere}.care-result-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}.care-result-actions button,.care-result-close{border:0;border-radius:8px;padding:9px 13px;font:inherit;cursor:pointer}.care-result-close{display:grid;place-items:center;width:36px;height:36px;padding:0;background:transparent;color:var(--secondary-text-color)}.care-result-save{background:var(--primary-color);color:var(--text-primary-color,#fff);font-weight:600}.care-result-error{margin-top:10px;color:var(--error-color);font-size:.85rem}
  </style><div class="care-result-dialog" role="dialog" aria-modal="true" aria-labelledby="${escapeHtml(titleId)}">
    <div class="care-result-head"><div><div class="care-result-title" id="${escapeHtml(titleId)}">${escapeHtml(item.title || t(card, "Zorgactie", "Care action"))}</div><div class="care-result-sub">${escapeHtml(item.puppy_name || t(card, "Pup", "Puppy"))} · ${escapeHtml(t(card, `dag ${item.age_days}`, `day ${item.age_days}`))}</div></div><button type="button" class="care-result-close" aria-label="${escapeHtml(t(card, "Sluiten", "Close"))}"><ha-icon icon="mdi:close"></ha-icon></button></div>
    <label>${escapeHtml(t(card, "Status", "Status"))}<select class="care-result-status"><option value="completed" ${options.initialStatus === "missed" ? "" : "selected"}>${escapeHtml(t(card, "Uitgevoerd", "Completed"))}</option><option value="missed" ${options.initialStatus === "missed" ? "selected" : ""}>${escapeHtml(t(card, "Gemist", "Missed"))}</option></select></label>
    ${fields.has("result") ? `<label>${escapeHtml(t(card, "Resultaat / reactie", "Result / response"))}<input class="care-result-value" placeholder="${escapeHtml(t(card, "Bijv. rustig / neutraal / gevoelig", "E.g. calm / neutral / sensitive"))}"></label>` : ""}
    ${fields.has("score") ? `<label>${escapeHtml(t(card, "Score", "Score"))}<input class="care-result-score" type="number" step="0.1"></label>` : ""}
    ${item.instructions ? `<div class="care-result-instructions" role="note"><div class="care-result-instructions-title">${escapeHtml(t(card, "Instructie voor deze dag", "Instruction for this day"))}</div><div class="care-result-instructions-text">${escapeHtml(item.instructions)}</div></div>` : ""}
    ${fields.has("note") ? `<label>${escapeHtml(t(card, "Observatie / notitie", "Observation / note"))}<textarea class="care-result-note" placeholder="${escapeHtml(t(card, "Noteer wat je ziet of pas de aanpak hier aan", "Record what you observe or note an adjusted approach"))}"></textarea></label>` : ""}
    <div class="care-result-error" role="alert" hidden></div>
    <div class="care-result-actions"><button type="button" class="care-result-cancel">${escapeHtml(t(card, "Annuleren", "Cancel"))}</button><button type="button" class="care-result-save">${escapeHtml(t(card, "Opslaan", "Save"))}</button></div>
  </div>`;
  root.appendChild(overlay);
  card.__careResultEditorOpen = true;

  let closed = false;
  const close = (saved = false) => {
    if (closed) return;
    closed = true;
    card.__careResultEditorOpen = false;
    overlay.remove();
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    options.onClosed?.({ saved });
  };
  overlay.querySelector(".care-result-close")?.addEventListener("click", () => close());
  overlay.querySelector(".care-result-cancel")?.addEventListener("click", () => close());
  overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });
  overlay.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  });
  overlay.querySelector(".care-result-save")?.addEventListener("click", async () => {
    const button = overlay.querySelector(".care-result-save");
    const error = overlay.querySelector(".care-result-error");
    button.disabled = true;
    error.hidden = true;
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
      close(true);
      if (typeof options.onSaved === "function") await options.onSaved(item);
      else await refreshCard(card);
    } catch (err) {
      if (closed) return;
      error.textContent = err?.message || t(card, "Resultaat kon niet worden opgeslagen.", "Result could not be saved.");
      error.hidden = false;
      button.disabled = false;
    }
  });
  queueMicrotask(() => overlay.querySelector("input, textarea, select, .care-result-save")?.focus({ preventScroll: true }));
}
