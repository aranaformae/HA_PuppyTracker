import { escapeHtml, languageForHass, puppySelectorLabel } from "./puppy-tracker-card-common.js";

const text = (card, nl, en) => languageForHass(card?._hass) === "en" ? en : nl;
const controls = (root) => [...(root?.querySelectorAll("input,select,textarea") || [])]
  .filter((input) => input.type !== "file" && !input.matches("[data-draft-ignore]"));
const key = (input, index) => input.id || (input.name ? `${input.name}:${input.type === "checkbox" || input.type === "radio" ? input.value : ""}` : `field-${index}`);
const values = (root) => Object.fromEntries(controls(root).map((input, index) => [key(input, index), { value: input.value, checked: input.checked }]));

// A short-lived form snapshot, never serialized to browser or integration storage.
export class FormState {
  constructor(card, { repeat = null, preserve = true, busy = () => card._saving || card._busy } = {}) {
    this.card = card;
    this.repeat = repeat;
    this.preserve = preserve;
    this.busy = busy;
    this.reset();
  }

  reset() {
    this._listeners?.abort();
    this._listeners = null;
    this.root = null;
    this.snapshot = null;
    this.fields = [];
    this.baseline = null;
    this.rows = null;
    this.errors = new Map();
  }

  capture() {
    if (!this.root) return;
    const current = values(this.root);
    this.snapshot = { ...this.snapshot, ...current };
    this.fields = Object.keys(current);
    if (this.repeat) this.rows = this.root.querySelector(this.repeat)?.cloneNode(true) || null;
  }

  get dirty() {
    this.capture();
    return this.baseline !== null && JSON.stringify([this.snapshot, this.fields]) !== this.baseline;
  }

  confirmDiscard() {
    return !this.busy() && (!this.dirty || window.confirm(text(this.card,
      "Niet-opgeslagen wijzigingen weggooien?", "Discard unsaved changes?")));
  }

  discard() {
    if (!this.confirmDiscard()) return false;
    this.reset();
    return true;
  }

  bind(root) {
    const retain = this.dirty;
    this._listeners?.abort();
    this.root = root;
    if (!root) return;
    if (!retain) { this.snapshot = null; this.baseline = null; this.rows = null; }
    if (this.rows && this.repeat) root.querySelector(this.repeat)?.replaceWith(this.rows.cloneNode(true));
    if (this.preserve && this.snapshot) controls(root).forEach((input, index) => {
      const saved = this.snapshot[key(input, index)];
      if (!saved) return;
      input.value = saved.value;
      if (input.type === "checkbox" || input.type === "radio") input.checked = saved.checked;
    });
    this.capture();
    if (this.baseline === null) this.baseline = JSON.stringify([this.snapshot, this.fields]);
    this._listeners = new AbortController();
    for (const type of ["input", "change"]) root.addEventListener(type, (event) => {
      this.capture();
      const input = event.target;
      if (input.matches?.("input,select,textarea")) this.clearError(input);
    }, { signal: this._listeners.signal });
    root.addEventListener("invalid", (event) => {
      event.preventDefault();
      const input = event.target;
      this.error(input.id ? `#${input.id}` : `[name="${input.name}"]`, input.validationMessage);
    }, { capture: true, signal: this._listeners.signal });
    for (const [selector, message] of this.errors) this._showError(selector, message);
    if (this.busy()) root.querySelectorAll("input,select,textarea,button").forEach((input) => { input.disabled = true; });
  }

  clearError(input) {
    const selector = input.id ? `#${input.id}` : input.name ? `[name="${input.name}"]` : null;
    if (selector) this.errors.delete(selector);
    for (const key of this.errors.keys()) {
      if (!input.matches(key)) continue;
      const first = this.root?.querySelector(key);
      first?.removeAttribute("aria-invalid");
      first?.removeAttribute("aria-errormessage");
      first?.parentElement?.querySelector("[data-field-error]")?.remove();
      this.errors.delete(key);
    }
    input.setCustomValidity?.("");
    input.removeAttribute("aria-invalid");
    input.removeAttribute("aria-errormessage");
    input.parentElement?.querySelector("[data-field-error]")?.remove();
  }

  clearErrors() {
    this.errors.clear();
    controls(this.root).forEach((input) => this.clearError(input));
  }

  error(selector, message) {
    this.errors.set(selector, message);
    this._showError(selector, message);
    this.root?.querySelector(selector)?.focus({ preventScroll: true });
  }

  _showError(selector, message) {
    const input = this.root?.querySelector(selector);
    if (!input) return;
    input.setAttribute("aria-invalid", "true");
    const id = `${input.id || input.name}-error`;
    input.setAttribute("aria-errormessage", id);
    let error = input.parentElement.querySelector("[data-field-error]");
    if (!error) {
      error = document.createElement("span");
      error.dataset.fieldError = "";
      error.id = id;
      error.setAttribute("role", "alert");
      error.style.cssText = "display:block;color:var(--error-color,#b00020);font-size:12px;white-space:normal;overflow-wrap:anywhere";
      input.insertAdjacentElement("afterend", error);
    }
    error.textContent = message;
  }
}

export function confirmDiscardForms(cards, hass) {
  const forms = cards.flatMap((card) => [card?._formState, card?._careFormState, card?._linkFormState]).filter(Boolean);
  if (forms.some((form) => form.busy())) return false;
  return !forms.some((form) => form.dirty) || window.confirm(text({ _hass: hass },
    "Niet-opgeslagen wijzigingen weggooien?", "Discard unsaved changes?"));
}

export function savedOwnerLabel(card, scope, puppyId) {
  const data = card._litterData || card._data;
  if (scope === "puppy") return puppySelectorLabel(data?.puppies?.find((puppy) => puppy.id === puppyId), text(card, "Pup", "Puppy"));
  return scope === "mother" ? data?.litter?.mother || text(card, "Moederhond", "Mother") : data?.litter?.name || text(card, "Hele nest", "Whole litter");
}

export function savedRecordFeedback(card, record, context, category) {
  const id = record?.record?.id || record?.record_id || record?.id;
  card._savedRecord = id ? { ...context, recordId: id } : null;
  const owner = context.ownerName || savedOwnerLabel(card, context.scope, context.puppyId);
  return text(card, `${category} opgeslagen voor ${owner}.`, `${category} saved for ${owner}.`);
}

export function savedEditButton(card) {
  return card._savedRecord && card._hass?.user?.is_admin !== false && (card._litterData || card._data)?.can_manage_records ? `<button type="button" data-edit-saved class="record-edit-button" title="${escapeHtml(text(card, "Bewerken", "Edit"))}" aria-label="${escapeHtml(text(card, "Bewerken", "Edit"))}"><ha-icon icon="mdi:pencil-outline"></ha-icon></button>` : "";
}

export function appendEditAction(card, container, onEdit, label = text(card, "Bewerken", "Edit")) {
  if (!container || card._hass?.user?.is_admin === false) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "secondary record-edit-button";
  button.title = label;
  button.setAttribute("aria-label", label);
  button.style.cssText = "display:inline-grid;place-items:center;width:44px;height:44px;padding:0;margin-left:8px;vertical-align:middle";
  button.innerHTML = '<ha-icon icon="mdi:pencil-outline"></ha-icon>';
  button.addEventListener("click", onEdit);
  container.append(button);
}
