import { escapeHtml, languageForHass, puppySelectorLabel, formatWeight, formatDateTime, createUuid } from "./puppy-tracker-card-common.js";
import { bindSaveFeedback } from "./puppy-tracker-form-state.js";

const LABELS = {
  nl: {
    title: "Overdracht", available: "Beschikbaar", option: "In optie", reserved: "Gereserveerd", assigned: "Toegewezen", departed: "Vertrokken",
    status: "Status van de pup", date: "Werkelijke vertrekdatum", ready: "Checklist compleet", incomplete: "Nog te controleren",
    hint: "Vink af wat je zelf hebt gecontroleerd. Een dossiernotitie is geen automatische bevestiging. Baasjes, betalingen en gewichtsaandacht blijven apart.",
    assignment: "Toegewezen volgt automatisch uit de gekoppelde baasjes. Wijzig de koppeling op de baasjeskaart.",
    confirm: "Ik wil het vertrek vastleggen terwijl de checklist nog niet compleet is.",
    cancel: "Annuleren", save: "Opslaan", saved: "Overdracht opgeslagen.", failed: "Opslaan mislukt. Je invoer is behouden.",
    stale: "Deze pup is intussen gewijzigd. Sluit dit formulier en open de overdracht opnieuw.",
    customize: "Checklist aanpassen voor dit nest", templateTitle: "Checklist voor alle pups in dit nest",
    templateHint: "Voeg punten toe of pas tekst en volgorde aan. Verplaatsen behoudt vinkjes. Nieuwe of hernoemde punten staan weer open bij alle pups. Verwijderen wist de vinkjes van dat punt. Andere nesten blijven hetzelfde.",
    add: "Punt toevoegen", item: "Controlepunt", up: "Omhoog", down: "Omlaag", remove: "Verwijderen", back: "Terug naar pup",
    discard: "Je hebt nog niet opgeslagen pupwijzigingen. De nestchecklist openen? Deze pupwijzigingen vervallen als je de nestchecklist opslaat.",
    templateSaved: "Nestchecklist opgeslagen.", templateStale: "De nestchecklist is intussen gewijzigd. Sluit en open de overdracht opnieuw.",
    dateError: "Vul de werkelijke vertrekdatum in.", confirmError: "Controleer de open punten of bevestig bewust het onvolledige vertrek.",
  },
  en: {
    title: "Handover", available: "Available", option: "On hold", reserved: "Reserved", assigned: "Assigned", departed: "Departed",
    status: "Puppy status", date: "Actual departure date", ready: "Checklist complete", incomplete: "Still to check",
    hint: "Tick what you have checked yourself. A dossier record is not automatic confirmation. Owners, payments and weight attention remain separate.",
    assignment: "Assigned follows the linked owners automatically. Change the links on the owner card.",
    confirm: "I want to record departure while the checklist is incomplete.",
    cancel: "Cancel", save: "Save", saved: "Handover saved.", failed: "Save failed. Your input has been kept.",
    stale: "This puppy changed while editing. Close and reopen the handover form.",
    customize: "Customize checklist for this litter", templateTitle: "Checklist for all puppies in this litter",
    templateHint: "Add items or change text and order. Moving keeps confirmations. New or renamed items become unchecked for every puppy. Removing an item removes its confirmations. Other litters stay the same.",
    add: "Add item", item: "Checklist item", up: "Move up", down: "Move down", remove: "Remove", back: "Back to puppy",
    discard: "You have unsaved puppy changes. Open the litter checklist? These puppy changes will be discarded if you save the litter checklist.",
    templateSaved: "Litter checklist saved.", templateStale: "The litter checklist changed while editing. Close and reopen handover.",
    dateError: "Enter the actual departure date.", confirmError: "Check the remaining items or explicitly confirm incomplete departure.",
  },
};
const itemLabel = (hass, item) => item.labels?.[languageForHass(hass)] ?? item.label ?? item.id;
export const handoffText = (hass, key) => (LABELS[languageForHass(hass)] || LABELS.nl)[key] || key;
export function handoffLabel(hass, puppy) {
  const state = puppy?.handoff || {};
  return `${handoffText(hass, state.status || "available")} · ${state.completed_count || 0}/${state.total_count || 0}`;
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
    this._checklist = state.checklist;
    const items = this._checklist?.items || [];
    const detail = (key) => key === "chip" ? (puppy.chip_number || "—") : key === "departure_weight"
      ? `${formatWeight(puppy.summary?.current_weight, "—", hass)} · ${formatDateTime(puppy.summary?.last_weighed, "—", hass)}` : "";
    const stages = state.assigned ? ["assigned", "departed"] : ["available", "option", "reserved", "departed"];
    this.shadowRoot.innerHTML = `<style>
      dialog{position:fixed;box-sizing:border-box;width:min(620px,calc(100% - 24px));max-height:calc(100dvh - 24px);overflow:auto;overscroll-behavior:contain;border:1px solid var(--divider-color);border-radius:16px;padding:20px;background:var(--card-background-color,#fff);color:var(--primary-text-color,#222)}
      dialog::backdrop{background:#0009}h2{font-size:20px;margin:0 0 12px}p{font-size:13px;line-height:1.5;color:var(--secondary-text-color)}
      .grid,.checks{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.field{display:grid;gap:5px;font-size:13px}input:not([type=checkbox]),select{box-sizing:border-box;width:100%;min-width:0;min-height:44px;padding:8px;border:1px solid var(--divider-color);border-radius:8px;font:inherit;font-size:16px;color:inherit;background:var(--card-background-color,#fff)}
      .check small{display:block;color:var(--secondary-text-color);font-size:12px;margin-top:3px}.check{display:flex;align-items:center;gap:8px;min-height:44px;font-size:14px;overflow-wrap:anywhere}input[type=checkbox]{width:20px;height:20px;flex:0 0 auto}fieldset{margin:12px 0;border:1px solid var(--divider-color);border-radius:8px;padding:10px}legend{font-size:14px;font-weight:600}.actions{display:flex;justify-content:flex-end;gap:10px;margin-top:14px}button{min-height:44px;padding:8px 16px;border:1px solid var(--divider-color);border-radius:8px;font:inherit;cursor:pointer;background:var(--secondary-background-color);color:inherit}button[type=submit]{background:var(--primary-color);color:var(--text-primary-color,#fff)}button:disabled{opacity:.6}.error{color:var(--error-color);font-size:14px}.template-items{display:grid;gap:12px}.template-row{border:1px solid var(--divider-color);border-radius:8px;padding:10px;min-width:0}.item-actions{display:flex;gap:6px;margin-top:6px;flex-wrap:wrap}.item-actions button{padding:6px 10px;min-height:44px}.progress{font-weight:600;margin:12px 0}[hidden]{display:none!important}
      @media(max-width:520px){dialog{padding:16px}.grid,.checks{grid-template-columns:1fr}}
    </style><dialog aria-labelledby="handoff-title"><form>
      <h2 id="handoff-title">${escapeHtml(t("title"))} · ${escapeHtml(puppySelectorLabel(puppy))}</h2>
      <p>${escapeHtml(t("hint"))}</p>${state.assigned ? `<p>${escapeHtml(t("assignment"))}</p>` : ""}
      <div class="grid"><label class="field">${escapeHtml(t("status"))}<select id="status">${stages.map((key) => `<option value="${key}" ${key === (state.status || "available") ? "selected" : ""}>${escapeHtml(t(key))}</option>`).join("")}</select></label>
      <label class="field" id="date-field">${escapeHtml(t("date"))}<input id="departure-date" type="date" value="${escapeHtml(state.departure_date || "")}"></label></div>
      <div class="progress" role="status"></div><div class="checks">${items.map((item) => `<label class="check"><input type="checkbox" data-check="${escapeHtml(item.id)}" ${state.checks?.[item.id] ? "checked" : ""}><span>${escapeHtml(itemLabel(hass, item))}${item.label === null && detail(item.id) ? `<small>${escapeHtml(detail(item.id))}</small>` : ""}</span></label>`).join("")}</div>
      <fieldset id="incomplete"><legend>${escapeHtml(t("incomplete"))}</legend><label class="check"><input id="confirm" type="checkbox">${escapeHtml(t("confirm"))}</label></fieldset>
      <button type="button" id="customize" ${this._checklist ? "" : "disabled"}>${escapeHtml(t("customize"))}</button>
      <p class="error" role="alert" hidden></p><div class="actions"><button type="button" id="cancel">${escapeHtml(t("cancel"))}</button><button type="submit">${escapeHtml(t("save"))}</button></div>
    </form></dialog>`;
    document.body.append(this);
    const dialog = this.shadowRoot.querySelector("dialog");
    dialog.addEventListener("cancel", (event) => { event.preventDefault(); this.close(); });
    this.shadowRoot.querySelector("#cancel").addEventListener("click", () => this.close());
    this.shadowRoot.querySelector("form").addEventListener("change", () => this._update());
    this.shadowRoot.querySelector("form").addEventListener("submit", (event) => { event.preventDefault(); void (this._templateMode ? this._saveTemplate() : this._save()); });
    this.shadowRoot.querySelector("#customize").addEventListener("click", () => this._openTemplate());
    this._update();
    this._initialDraft = this._draft();
    dialog.showModal();
  }
  close() {
    if (this._busy) return;
    this.shadowRoot.querySelector("dialog").close(); this.remove();
    this._previousFocus?.focus?.({ preventScroll: true });
  }
  _update() {
    if (this._templateMode) return;
    const root = this.shadowRoot;
    const missing = [...root.querySelectorAll("[data-check]")].filter((node) => !node.checked);
    const departed = root.querySelector("#status").value === "departed";
    root.querySelector("#date-field").hidden = !departed;
    root.querySelector("#departure-date").required = departed;
    root.querySelector("#incomplete").hidden = !departed || !missing.length;
    root.querySelector(".progress").textContent = `${(this._checklist?.items.length || 0) - missing.length}/${this._checklist?.items.length || 0} · ${handoffText(this._hass, missing.length ? "incomplete" : "ready")}`;
  }
  _draft() {
    return JSON.stringify([...this.shadowRoot.querySelectorAll("input,select")].map((node) => [node.value, node.checked]));
  }
  _openTemplate() {
    if (this._busy || (this._draft() !== this._initialDraft && !window.confirm(handoffText(this._hass, "discard")))) return;
    const t = (key) => handoffText(this._hass, key);
    this._templateMode = true;
    this._items = this._checklist.items.map((item) => ({ ...item }));
    const form = this.shadowRoot.querySelector("form");
    this._puppyForm = [...form.childNodes];
    this._puppyForm.forEach((node) => node.remove());
    form.innerHTML = `<h2 id="handoff-title">${escapeHtml(t("templateTitle"))}</h2><p>${escapeHtml(t("templateHint"))}</p>
      <div class="template-items"></div><button type="button" id="add-item">${escapeHtml(t("add"))}</button>
      <p class="error" role="alert" hidden></p><div class="actions"><button type="button" id="back">${escapeHtml(t("back"))}</button><button type="submit">${escapeHtml(t("save"))}</button></div>`;
    const list = form.querySelector(".template-items");
    this._items.forEach((item) => list.insertAdjacentHTML("beforeend", this._itemRow(item)));
    list.addEventListener("input", (event) => {
      const id = event.target.closest(".template-row")?.dataset.itemId;
      const item = this._items.find((item) => item.id === id);
      if (item && event.target.matches("input")) {
        const original = this._checklist.items.find((entry) => entry.id === id);
        item.label = original && event.target.value.trim() === itemLabel(this._hass, original) ? original.label : event.target.value;
      }
    });
    list.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-action]");
      if (!button || this._busy) return;
      const row = button.closest(".template-row"), index = this._items.findIndex((item) => item.id === row.dataset.itemId);
      if (button.dataset.action === "remove" && this._items.length > 1) {
        const next = row.nextElementSibling || row.previousElementSibling;
        this._items.splice(index, 1); row.remove(); next?.querySelector("input")?.focus({ preventScroll: true });
      } else {
        const target = index + (button.dataset.action === "up" ? -1 : 1);
        if (target < 0 || target >= this._items.length) return;
        [this._items[index], this._items[target]] = [this._items[target], this._items[index]];
        if (target < index) list.insertBefore(row, row.previousElementSibling);
        else list.insertBefore(row.nextElementSibling, row);
        button.focus({ preventScroll: true });
      }
      this._updateTemplateButtons();
      if (button.isConnected && button.disabled) row.querySelector("button:not(:disabled)")?.focus({ preventScroll: true });
    });
    form.querySelector("#add-item").addEventListener("click", () => {
      if (this._busy || this._items.length >= this._checklist.max_items) return;
      const item = { id: createUuid(), label: "" }; this._items.push(item);
      list.insertAdjacentHTML("beforeend", this._itemRow(item));
      this._updateTemplateButtons(); list.lastElementChild.querySelector("input").focus();
    });
    form.querySelector("#back").addEventListener("click", () => {
      if (this._busy) return;
      form.replaceChildren(...this._puppyForm); this._puppyForm = null; this._templateMode = false;
      this.shadowRoot.querySelector("#customize").focus({ preventScroll: true });
    });
    this._updateTemplateButtons();
    form.querySelector("input")?.focus({ preventScroll: true });
    this.shadowRoot.querySelector("dialog").scrollTop = 0;
  }
  _itemRow(item) {
    const t = (key) => handoffText(this._hass, key);
    return `<div class="template-row" data-item-id="${escapeHtml(item.id)}"><label class="field">${escapeHtml(t("item"))}<input value="${escapeHtml(itemLabel(this._hass, item))}" maxlength="160" required></label><div class="item-actions">
      ${["up", "down", "remove"].map((action) => `<button type="button" data-action="${action}" aria-label="${escapeHtml(t(action))}">${escapeHtml(t(action))}</button>`).join("")}</div></div>`;
  }
  _updateTemplateButtons() {
    const rows = [...this.shadowRoot.querySelectorAll(".template-row")];
    rows.forEach((row, index) => {
      row.querySelector('[data-action="up"]').disabled = this._busy || index === 0;
      row.querySelector('[data-action="down"]').disabled = this._busy || index === rows.length - 1;
      row.querySelector('[data-action="remove"]').disabled = this._busy || rows.length === 1;
    });
    this.shadowRoot.querySelector("#add-item").disabled = this._busy || rows.length >= this._checklist.max_items;
  }
  async _saveTemplate() {
    if (this._busy) return;
    const root = this.shadowRoot, error = root.querySelector(".error");
    this._busy = true; error.hidden = true;
    bindSaveFeedback(this, "button[type=submit]", { busy: true });
    root.querySelectorAll("input,button").forEach((node) => { node.disabled = true; });
    try {
      const result = await this._hass.callWS({ type: "puppy_tracker/handoff/checklist/save", litter_id: this._litterId,
        expected_revision: this._checklist.revision, items: this._items.map(({ id, label }) => ({ id, label })) });
      this._busy = false; this.close(); this._onSaved?.({ ...result, templateSaved: true });
    } catch (err) {
      this._busy = false;
      root.querySelectorAll("input,button").forEach((node) => { node.disabled = false; });
      this._updateTemplateButtons();
      bindSaveFeedback(this, "button[type=submit]", { busy: false, failed: true });
      error.textContent = handoffText(this._hass, err?.code === "stale_checklist" ? "templateStale" : "failed"); error.hidden = false;
    }
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
        expected_updated_at: this._puppy.updated_at, expected_checklist_revision: this._checklist.revision, confirm_incomplete: confirm,
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
