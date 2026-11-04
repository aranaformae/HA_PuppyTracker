/** Shared configuration and read-only dosage context. No automatic administration. */
import { escapeHtml, formatDateTime, languageForHass } from "./puppy-tracker-card-common.js";

const text = (hass, nl, en) => languageForHass(hass) === "en" ? en : nl;

export function weightDoseFields(hass, prefix, config) {
  return `<fieldset class="weight-dose-settings" style="grid-column:1/-1;min-width:0;box-sizing:border-box;width:100%;margin:0;border:1px solid var(--divider-color);border-radius:8px;padding:12px"><legend>${escapeHtml(text(hass, "Gewichtsafhankelijke hoeveelheid", "Weight-based amount"))}</legend>
    <label style="display:flex;align-items:center;gap:8px;min-height:44px"><input style="width:20px;min-height:20px;flex:none" id="${prefix}-dose-enabled" type="checkbox" ${config ? "checked" : ""}>${escapeHtml(text(hass, "Berekenen met het laatst bekende gewicht", "Calculate from the last known weight"))}</label>
    <div class="weight-dose-inputs" style="display:${config ? "grid" : "none"};grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px">
    <label>${escapeHtml(text(hass, "Hoeveelheid per kg per uitvoering", "Amount per kg per execution"))}<input id="${prefix}-dose-rate" type="number" min="0" step="any" value="${escapeHtml(config?.amount_per_kg ?? "")}"></label>
    <label>${escapeHtml(text(hass, "Eenheid (bijv. ml, mg of g)", "Unit (for example ml, mg or g)"))}<input id="${prefix}-dose-unit" maxlength="32" value="${escapeHtml(config?.unit || "")}"></label>
    <label>${escapeHtml(text(hass, "Gewicht maximaal oud (uren)", "Maximum weight age (hours)"))}<input id="${prefix}-dose-age" type="number" min="0.01" max="8760" step="any" value="${escapeHtml(config?.max_weight_age_hours ?? 24)}"></label>
    </div><small>${escapeHtml(text(hass, "24 uur = 1 dag; 168 uur = 1 week. Vul zelf de voorgeschreven hoeveelheid in. Zonder individueel gewicht wordt niets berekend. Een berekening is geen registratie van toediening.", "24 hours = 1 day; 168 hours = 1 week. Enter the prescribed amount yourself. No calculation is made without an individual weight. A calculation is not an administration record."))}</small></fieldset>`;
}

export function readWeightDose(root, prefix) {
  if (!root.getElementById(`${prefix}-dose-enabled`)?.checked) return null;
  return { amount_per_kg: Number(root.getElementById(`${prefix}-dose-rate`)?.value),
    unit: root.getElementById(`${prefix}-dose-unit`)?.value?.trim() || "",
    max_weight_age_hours: Number(root.getElementById(`${prefix}-dose-age`)?.value) };
}

export function bindWeightDose(root, prefix, busy = false, fixedFields = []) {
  const toggle = root.getElementById(`${prefix}-dose-enabled`);
  const update = () => {
    const inputs = toggle?.closest("fieldset")?.querySelector(".weight-dose-inputs");
    if (inputs) inputs.style.display = toggle?.checked ? "grid" : "none";
    for (const id of fixedFields) {
      const input = root.getElementById(id);
      if (input) input.disabled = busy || Boolean(toggle?.checked);
    }
    for (const suffix of ["rate", "unit", "age"]) {
      const input = root.getElementById(`${prefix}-dose-${suffix}`);
      if (input) input.disabled = busy || !toggle?.checked;
    }
  };
  toggle?.addEventListener("change", update);
  update();
}

export function weightDoseError(hass, config) {
  if (!config) return "";
  if (!Number.isFinite(config.amount_per_kg) || config.amount_per_kg <= 0 || config.amount_per_kg > 1000000 || !config.unit || config.unit.length > 32
      || !Number.isFinite(config.max_weight_age_hours) || config.max_weight_age_hours <= 0 || config.max_weight_age_hours > 8760) {
    return text(hass, "Vul een geldige hoeveelheid per kg, eenheid en maximale gewichtsleeftijd in.", "Enter a valid amount per kg, unit and maximum weight age.");
  }
  return "";
}

function singleDoseMarkup(hass, dose) {
  if (!dose) return "";
  const warning = dose.status !== "ready" || (dose.weight_timestamp && (Date.now() - Date.parse(dose.weight_timestamp)) / 3600000 > dose.max_weight_age_hours);
  const style = `margin-top:8px;padding:9px;border-left:3px solid var(--${warning ? "warning-color,#d97706" : "primary-color,#0891b2"});background:var(--secondary-background-color);overflow-wrap:anywhere`;
  if (dose.amount == null) {
    const message = dose.status === "unverified"
      ? text(hass, "Berekening kon niet worden gecontroleerd. Controleer gewicht en hoeveelheid handmatig.", "Calculation could not be verified. Check weight and amount manually.")
      : text(hass, "Geen hoeveelheid berekend: geen individueel gewicht beschikbaar voor deze hond.", "No amount calculated: no individual weight available for this dog.");
    return `<div class="weight-dose warning" style="${style}" role="status"><strong>${escapeHtml(message)}</strong></div>`;
  }
  const number = value => new Intl.NumberFormat(languageForHass(hass) === "en" ? "en-US" : "nl-NL", { maximumSignificantDigits: 6 }).format(value);
  const age = Math.max(0, (Date.now() - Date.parse(dose.weight_timestamp)) / 3600000);
  return `<div class="weight-dose ${warning ? "warning" : "ready"}" style="${style}" role="status"><strong>${escapeHtml(text(hass, "Berekende hoeveelheid per uitvoering", "Calculated amount per execution"))}: ${escapeHtml(number(dose.amount))} ${escapeHtml(dose.unit)}</strong><div>${escapeHtml(number(dose.weight_grams / 1000))} kg · ${escapeHtml(formatDateTime(dose.weight_timestamp, "", hass))}</div>${warning ? `<strong>${escapeHtml(text(hass, "LET OP: GEWICHT TE OUD", "WARNING: WEIGHT TOO OLD"))}</strong><div>${escapeHtml(number(age))} ${escapeHtml(text(hass, "uur oud; toegestaan", "hours old; allowed"))}: ${escapeHtml(number(dose.max_weight_age_hours))} ${escapeHtml(text(hass, "uur", "hours"))}.</div>` : ""}</div>`;
}

// Each small view schedules only the transition to stale. Its timer is removed
// with the view; no polling, subscriptions, or card/form rebuild is required.
class PuppyWeightDoseView extends HTMLElement {
  static get observedAttributes() { return ["data-dose", "data-language", "data-time-zone"]; }
  constructor() { super(); this.attachShadow({ mode: "open" }); }
  connectedCallback() { this.style.display = "block"; this._update(); }
  disconnectedCallback() { clearTimeout(this._timer); this._timer = null; }
  attributeChangedCallback() { if (this.isConnected) this._update(); }
  _update() {
    clearTimeout(this._timer); this._timer = null;
    let dose;
    try { dose = JSON.parse(this.dataset.dose || "null"); } catch (_error) { dose = { amount: null, status: "unverified" }; }
    const hass = { language: this.dataset.language || "nl", config: { time_zone: this.dataset.timeZone || "UTC" } };
    const markup = singleDoseMarkup(hass, dose);
    if (this._markup !== markup) { this.shadowRoot.innerHTML = markup; this._markup = markup; }
    if (dose?.status === "ready" && dose.weight_timestamp) {
      const remaining = Date.parse(dose.weight_timestamp) + dose.max_weight_age_hours * 3600000 - Date.now();
      if (remaining >= 0) this._timer = setTimeout(() => this._update(), Math.min(2147483647, remaining + 5));
    }
  }
}
if (!customElements.get("puppy-tracker-weight-dose")) customElements.define("puppy-tracker-weight-dose", PuppyWeightDoseView);

export function weightDoseMarkup(hass, dose) {
  if (!dose) return "";
  if (dose.status === "per_puppy") {
    return `<details class="weight-dose-batch" open style="margin-top:8px"><summary>${escapeHtml(text(hass, "Hoeveelheid per pup", "Amount per puppy"))} (${dose.items.length})</summary><div style="max-height:280px;overflow-y:auto;overscroll-behavior:contain">${dose.items.map(item => `<div style="margin-top:8px"><strong>${escapeHtml(item.puppy_label)}</strong>${weightDoseMarkup(hass, item.dose)}</div>`).join("") || escapeHtml(text(hass, "Geen actieve pups beschikbaar.", "No active puppies available."))}</div></details>`;
  }
  // Derive age from the timestamp locally, keeping markup stable between reads.
  const { weight_age_hours, calculated_at, ...snapshot } = dose;
  return `<puppy-tracker-weight-dose data-dose="${escapeHtml(JSON.stringify(snapshot))}" data-language="${escapeHtml(languageForHass(hass))}" data-time-zone="${escapeHtml(hass?.config?.time_zone || "UTC")}"></puppy-tracker-weight-dose>`;
}
