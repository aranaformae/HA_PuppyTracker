import { escapeHtml, languageForHass, puppySelectorLabel, formatWeight, formatDateTime } from "./puppy-tracker-card-common.js";
import { bindSaveFeedback } from "./puppy-tracker-form-state.js";

const LABELS = {
  nl: {
    title: "Overdracht", available: "Beschikbaar", option: "In optie", reserved: "Gereserveerd", assigned: "Toegewezen", departed: "Vertrokken",
    status: "Status van de pup", date: "Werkelijke vertrekdatum", ready: "Checklist compleet", incomplete: "Nog te controleren",
    hint: "Vink af wat je zelf hebt gecontroleerd. Een dossiernotitie is geen automatische bevestiging. Baasjes, betalingen en gewichtsaandacht blijven apart.",
    assignment: "Toegewezen volgt automatisch uit de gekoppelde baasjes. Wijzig de koppeling op de baasjeskaart.",
    chip: "Chipnummer gecontroleerd", registration: "Registratie geregeld", vaccination: "Vaccinatie gecontroleerd", deworming: "Ontworming gecontroleerd",
    puppy_test: "Puppytest gecontroleerd", vet_check: "Dierenartscontrole gecontroleerd", contract: "Contract geregeld", food: "Voeding en uitleg meegegeven",
    passport: "Paspoort klaar", report: "Dossier / rapport meegegeven", departure_weight: "Vertrekgewicht gecontroleerd",
    confirm: "Ik wil het vertrek vastleggen terwijl de checklist nog niet compleet is.",
    cancel: "Annuleren", save: "Opslaan", saved: "Overdracht opgeslagen.", failed: "Opslaan mislukt. Je invoer is behouden.",
    stale: "Deze pup is intussen gewijzigd. Sluit dit formulier en open de overdracht opnieuw.",
    dateError: "Vul de werkelijke vertrekdatum in.", confirmError: "Controleer de open punten of bevestig bewust het onvolledige vertrek.",
  },
  en: {
    title: "Handover", available: "Available", option: "On hold", reserved: "Reserved", assigned: "Assigned", departed: "Departed",
    status: "Puppy status", date: "Actual departure date", ready: "Checklist complete", incomplete: "Still to check",
    hint: "Tick what you have checked yourself. A dossier record is not automatic confirmation. Owners, payments and weight attention remain separate.",
    assignment: "Assigned follows the linked owners automatically. Change the links on the owner card.",
    chip: "Microchip number checked", registration: "Registration arranged", vaccination: "Vaccination checked", deworming: "Deworming checked",
    puppy_test: "Puppy test checked", vet_check: "Vet check confirmed", contract: "Contract arranged", food: "Food and instructions provided",
    passport: "Passport ready", report: "Dossier / report provided", departure_weight: "Departure weight checked",
    confirm: "I want to record departure while the checklist is incomplete.",
    cancel: "Cancel", save: "Save", saved: "Handover saved.", failed: "Save failed. Your input has been kept.",
    stale: "This puppy changed while editing. Close and reopen the handover form.",
    dateError: "Enter the actual departure date.", confirmError: "Check the remaining items or explicitly confirm incomplete departure.",
  },
};
const CHECKS = ["chip", "registration", "vaccination", "deworming", "puppy_test", "vet_check", "contract", "food", "passport", "report", "departure_weight"];
export const handoffText = (hass, key) => (LABELS[languageForHass(hass)] || LABELS.nl)[key] || key;
export function handoffLabel(hass, puppy) {
  const state = puppy?.handoff || {};
  return `${handoffText(hass, state.status || "available")} · ${state.completed_count || 0}/${CHECKS.length}`;
}

export function openHandoff({ hass, litterId, puppy, onSaved, trigger }) {
  if (!hass?.user?.is_admin || !puppy || !litterId) return;
  const editor = document.createElement("puppy-tracker-handoff-editor");
  editor.open({ hass, litterId, puppy, onSaved, trigger });
}

class HandoffEditor extends HTMLElement {
  constructor() { super(); this.attachShadow({ mode: "open" }); this._busy = false; }
  open({ hass, litterId, puppy, onSaved, trigger }) {
    this._hass = hass; this._litterId = litterId; this._puppy = puppy; this._onSaved = onSaved;
    let focus = document.activeElement;
    while (focus?.shadowRoot?.activeElement) focus = focus.shadowRoot.activeElement;
    this._previousFocus = trigger || focus;
    const t = (key) => handoffText(hass, key);
    const state = puppy.handoff || {};
    const detail = (key) => key === "chip" ? (puppy.chip_number || "—") : key === "departure_weight"
      ? `${formatWeight(puppy.summary?.current_weight, "—", hass)} · ${formatDateTime(puppy.summary?.last_weighed, "—", hass)}` : "";
    const stages = state.assigned ? ["assigned", "departed"] : ["available", "option", "reserved", "departed"];
    this.shadowRoot.innerHTML = `<style>
      dialog{position:fixed;box-sizing:border-box;width:min(620px,calc(100% - 24px));max-height:calc(100dvh - 24px);overflow:auto;overscroll-behavior:contain;border:1px solid var(--divider-color);border-radius:16px;padding:20px;background:var(--card-background-color,#fff);color:var(--primary-text-color,#222)}
      dialog::backdrop{background:#0009}h2{font-size:20px;margin:0 0 12px}p{font-size:13px;line-height:1.5;color:var(--secondary-text-color)}
      .grid,.checks{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.field{display:grid;gap:5px;font-size:13px}input:not([type=checkbox]),select{box-sizing:border-box;width:100%;min-width:0;min-height:44px;padding:8px;border:1px solid var(--divider-color);border-radius:8px;font:inherit;font-size:16px;color:inherit;background:var(--card-background-color,#fff)}
      .check small{display:block;color:var(--secondary-text-color);font-size:12px;margin-top:3px}.check{display:flex;align-items:center;gap:8px;min-height:44px;font-size:14px;overflow-wrap:anywhere}input[type=checkbox]{width:20px;height:20px;flex:0 0 auto}fieldset{margin:12px 0;border:1px solid var(--divider-color);border-radius:8px;padding:10px}legend{font-size:14px;font-weight:600}.actions{display:flex;justify-content:flex-end;gap:10px;margin-top:14px}button{min-height:44px;padding:8px 16px;border:1px solid var(--divider-color);border-radius:8px;font:inherit;cursor:pointer;background:var(--secondary-background-color);color:inherit}button[type=submit]{background:var(--primary-color);color:var(--text-primary-color,#fff)}button:disabled{opacity:.6}.error{color:var(--error-color);font-size:14px}.progress{font-weight:600;margin:12px 0}[hidden]{display:none!important}
      @media(max-width:520px){dialog{padding:16px}.grid,.checks{grid-template-columns:1fr}}
    </style><dialog aria-labelledby="handoff-title"><form>
      <h2 id="handoff-title">${escapeHtml(t("title"))} · ${escapeHtml(puppySelectorLabel(puppy))}</h2>
      <p>${escapeHtml(t("hint"))}</p>${state.assigned ? `<p>${escapeHtml(t("assignment"))}</p>` : ""}
      <div class="grid"><label class="field">${escapeHtml(t("status"))}<select id="status">${stages.map((key) => `<option value="${key}" ${key === (state.status || "available") ? "selected" : ""}>${escapeHtml(t(key))}</option>`).join("")}</select></label>
      <label class="field" id="date-field">${escapeHtml(t("date"))}<input id="departure-date" type="date" value="${escapeHtml(state.departure_date || "")}"></label></div>
      <div class="progress" role="status"></div><div class="checks">${CHECKS.map((key) => `<label class="check"><input type="checkbox" data-check="${key}" ${state.checks?.[key] ? "checked" : ""}><span>${escapeHtml(t(key))}${detail(key) ? `<small>${escapeHtml(detail(key))}</small>` : ""}</span></label>`).join("")}</div>
      <fieldset id="incomplete"><legend>${escapeHtml(t("incomplete"))}</legend><label class="check"><input id="confirm" type="checkbox">${escapeHtml(t("confirm"))}</label></fieldset>
      <p class="error" role="alert" hidden></p><div class="actions"><button type="button" id="cancel">${escapeHtml(t("cancel"))}</button><button type="submit">${escapeHtml(t("save"))}</button></div>
    </form></dialog>`;
    document.body.append(this);
    const dialog = this.shadowRoot.querySelector("dialog");
    dialog.addEventListener("cancel", (event) => { event.preventDefault(); this.close(); });
    this.shadowRoot.querySelector("#cancel").addEventListener("click", () => this.close());
    this.shadowRoot.querySelector("form").addEventListener("change", () => this._update());
    this.shadowRoot.querySelector("form").addEventListener("submit", (event) => { event.preventDefault(); void this._save(); });
    this._update(); dialog.showModal();
  }
  close() {
    if (this._busy) return;
    this.shadowRoot.querySelector("dialog").close(); this.remove();
    this._previousFocus?.focus?.({ preventScroll: true });
  }
  _update() {
    const root = this.shadowRoot;
    const missing = [...root.querySelectorAll("[data-check]")].filter((node) => !node.checked);
    const departed = root.querySelector("#status").value === "departed";
    root.querySelector("#date-field").hidden = !departed;
    root.querySelector("#departure-date").required = departed;
    root.querySelector("#incomplete").hidden = !departed || !missing.length;
    root.querySelector(".progress").textContent = `${CHECKS.length - missing.length}/${CHECKS.length} · ${handoffText(this._hass, missing.length ? "incomplete" : "ready")}`;
  }
  async _save() {
    if (this._busy) return;
    const root = this.shadowRoot;
    const status = root.querySelector("#status").value;
    const checks = Object.fromEntries([...root.querySelectorAll("[data-check]")].map((node) => [node.dataset.check, node.checked]));
    const departure = status === "departed" ? root.querySelector("#departure-date").value : null;
    const confirm = root.querySelector("#confirm").checked;
    const error = root.querySelector(".error");
    const localError = status === "departed" && (!departure ? "dateError" : Object.values(checks).includes(false) && !confirm ? "confirmError" : null);
    if (localError) { error.textContent = handoffText(this._hass, localError); error.hidden = false; return; }
    this._busy = true; error.hidden = true;
    bindSaveFeedback(this, "button[type=submit]", { busy: true });
    root.querySelectorAll("input,select,button").forEach((node) => { node.disabled = true; });
    try {
      const result = await this._hass.callWS({ type: "puppy_tracker/handoff/save", litter_id: this._litterId, puppy_id: this._puppy.id,
        expected_updated_at: this._puppy.updated_at, confirm_incomplete: confirm,
        handoff: { stage: ["available", "option", "reserved"].includes(status) ? status : this._puppy.handoff?.stage || "available", departure_date: departure, checks } });
      this._busy = false; this.close(); this._onSaved?.(result);
    } catch (err) {
      this._busy = false;
      root.querySelectorAll("input,select,button").forEach((node) => { node.disabled = false; });
      bindSaveFeedback(this, "button[type=submit]", { busy: false, failed: true });
      error.textContent = handoffText(this._hass, err?.code === "stale_handoff" ? "stale" : "failed"); error.hidden = false;
    }
  }
}
if (!customElements.get("puppy-tracker-handoff-editor")) customElements.define("puppy-tracker-handoff-editor", HandoffEditor);
