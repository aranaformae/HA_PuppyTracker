import { escapeHtml, languageForHass, puppySelectorLabel } from "./puppy-tracker-card-common.js";

const text = (card, nl, en) => languageForHass(card?._hass) === "en" ? en : nl;
const controls = (root) => [...(root?.querySelectorAll("input,select,textarea") || [])]
  .filter((input) => input.type !== "file" && !input.matches("[data-draft-ignore]"));
const key = (input, index) => input.id || (input.name ? `${input.name}:${input.type === "checkbox" || input.type === "radio" ? input.value : ""}` : `field-${index}`);
const values = (root) => Object.fromEntries(controls(root).map((input, index) => [key(input, index), { value: input.value, checked: input.checked }]));

// Called explicitly by form renderers; it never submits or resets a draft.
export function bindSaveFeedback(card, selector, { busy = card._saving, failed = card._saveFailed && card._error, root = card.shadowRoot || card } = {}) {
  (root.querySelector("ha-card") || root.querySelector("form") || root.querySelector('[role="dialog"]'))?.setAttribute("aria-busy", String(Boolean(busy || card._loading)));
  const button = root.querySelector(selector);
  if (button && button._saveIdleHtml === undefined) button._saveIdleHtml = button.innerHTML;
  if (button && (busy || failed)) {
    button.textContent = busy ? text(card, "Bezig met opslaan…", "Saving…") : text(card, "Opnieuw proberen", "Try again");
    if (busy) button.disabled = true;
  } else if (button && button.innerHTML !== button._saveIdleHtml) button.innerHTML = button._saveIdleHtml;
  if (failed) root.querySelectorAll(".error").forEach((error) => error.setAttribute("role", "alert"));
}

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
    for (let ancestor = input.parentElement; ancestor && this.root.contains(ancestor); ancestor = ancestor.parentElement) {
      if (ancestor.tagName === "DETAILS") ancestor.open = true;
    }
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

// A failed read after a confirmed write must never invite the user to save twice.
export class SavedRecordRefresh {
  constructor(card, load, context) {
    this.card = card;
    this.load = load;
    this.context = context;
    this.reset();
  }

  reset() {
    this.generation = (this.generation || 0) + 1;
    this.failedContext = null;
    this.pending = false;
  }

  refreshed() {
    if (this.failedContext === this.context()) this.failedContext = null;
  }

  async run() {
    if (this.pending) return false;
    const generation = ++this.generation;
    const context = this.context();
    const current = () => generation === this.generation && context === this.context();
    this.pending = true;
    try {
      const applied = await this.load();
      if (current() && applied !== false) this.failedContext = null;
    } catch (_error) {
      if (current()) this.failedContext = context;
    } finally {
      if (generation === this.generation) this.pending = false;
    }
    return current();
  }

  bind(status) {
    if (!status || this.failedContext === null || this.failedContext !== this.context()) return;
    const warning = document.createElement("div");
    warning.className = "saved-refresh-warning";
    warning.setAttribute("role", "status");
    warning.style.cssText = "display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:8px;font-size:12px;color:var(--warning-color,var(--primary-text-color))";
    const message = document.createElement("span");
    message.textContent = text(this.card, "Opgeslagen, maar het overzicht kon niet worden ververst.", "Saved, but the overview could not be refreshed.");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary";
    button.style.cssText = "display:inline-flex;align-items:center;gap:6px;min-height:44px;padding:0 10px;border-radius:8px;font:inherit;cursor:pointer";
    button.dataset.retrySavedRefresh = "";
    button.innerHTML = `<ha-icon icon="mdi:refresh"></ha-icon> ${text(this.card, "Overzicht verversen", "Refresh overview")}`;
    button.disabled = this.pending || this.card._saving || this.card._loading || Boolean(this.card._editing || this.card._showEditor);
    button.addEventListener("click", async () => {
      if (this.pending || this.card._saving || this.card._loading || this.card._editing || this.card._showEditor) return;
      button.disabled = true;
      if (await this.run() && !this.card._editing && !this.card._showEditor) this.card._render();
    });
    warning.append(message, button);
    status.after(warning);
  }
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
