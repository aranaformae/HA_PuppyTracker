import { downloadExportFile, escapeHtml, languageForHass, preserveScrollPosition, subscribeUpdates } from "./puppy-tracker-card-common.js";

const TEXT = {
  nl: {
    title: "Aan de slag", hide: "Checklist verbergen", close: "Sluiten", retry: "Opnieuw laden",
    litter: "Nest aanmaken", mother: "Moederhond koppelen", puppies: "Pups toevoegen",
    weighing: "Eerste weging uitvoeren", backup: "Back-up exporteren", completed: "Voltooid",
    loading: "Checklist laden…", failed: "De checklist kon niet worden bijgewerkt.",
    exportFailed: "De back-up kon niet worden geëxporteerd.", preparing: "Back-up voorbereiden…",
    exported: "Back-up aangemaakt en aangeboden als download.",
  },
  en: {
    title: "Getting started", hide: "Hide checklist", close: "Close", retry: "Reload",
    litter: "Create a litter", mother: "Link the mother", puppies: "Add puppies",
    weighing: "Record the first weight", backup: "Export a backup", completed: "Completed",
    loading: "Loading checklist…", failed: "The checklist could not be updated.",
    exportFailed: "The backup could not be exported.", preparing: "Preparing backup…",
    exported: "Backup created and offered as a download.",
  },
};
const STEPS = ["litter", "mother", "puppies", "weighing", "backup"];
const STYLE = `
  .setup-toggle{display:flex;justify-content:flex-end}.setup button,.setup a{font:inherit;cursor:pointer;min-height:44px;border-radius:8px;border:1px solid var(--divider-color);background:var(--secondary-background-color);color:var(--primary-text-color);padding:0 12px;display:inline-flex;align-items:center;justify-content:center;gap:6px;text-decoration:none}.setup ha-icon{--mdc-icon-size:20px;flex:none}.setup button:disabled{opacity:.55;cursor:default}.setup .icon{width:44px;padding:0;background:transparent}.setup-panel{padding:12px 0;border-bottom:1px solid var(--divider-color)}.setup-head{display:flex;align-items:center;gap:10px}.setup-head h3{margin:0;font-size:16px;line-height:1.4;flex:1}.setup-head small,.setup-context{font-size:12px;color:var(--secondary-text-color)}.setup-context{margin:4px 0 8px;overflow-wrap:anywhere}.setup ol{list-style:none;margin:8px 0 12px;padding:0;display:grid;gap:6px}.setup li{display:flex;align-items:center;gap:9px;min-height:30px;font-size:13px;overflow-wrap:anywhere}.setup li[data-complete=true]{color:var(--secondary-text-color)}.setup li[data-complete=true] ha-icon{color:var(--success-color,var(--primary-color))}.setup .primary{background:var(--primary-color);color:var(--text-primary-color,#fff);border-color:var(--primary-color)}.setup-message{font-size:12px;margin:8px 0;overflow-wrap:anywhere}.setup-error{color:var(--error-color)}.setup-dialog{box-sizing:border-box;width:min(720px,calc(100% - 24px));max-height:90dvh;padding:12px;border:1px solid var(--divider-color);border-radius:8px;background:var(--card-background-color);color:var(--primary-text-color);overflow:auto;overscroll-behavior:contain}.setup-dialog::backdrop{background:rgba(0,0,0,.45)}.setup-dialog header{display:flex;align-items:center;justify-content:space-between;gap:12px}.setup-dialog h3{font-size:16px;margin:0}.setup-dialog button{min-width:44px;min-height:44px;border:1px solid var(--divider-color);border-radius:8px;background:var(--secondary-background-color);color:inherit;cursor:pointer}.setup-dialog>puppy-tracker-card{display:block;margin-top:8px}
`;

export class WorkspaceSetup {
  constructor(card) {
    this.card = card;
    this._epoch = 0;
    this._signature = null;
    this._data = null;
    this._error = "";
    this._status = "";
    this._opened = false;
    this._busy = false;
    this._refreshing = false;
    this._again = false;
    this._unsubscribe = null;
    this._subscribing = null;
  }

  get _hass() { return this.card._hass; }
  get isConnected() { return this.card.isConnected && ["home", "mobile"].includes(this.card._preset) && this._hass?.user?.is_admin === true; }
  get busy() { return this._busy || this._weighing?._weightSaveBusy || this._weighing?._correctionBusy; }
  get litterId() { return this.card._litterId || this.card._children.get(this.card._tab)?._selectedLitterId || ""; }
  _text(key) { return (TEXT[languageForHass(this._hass)] || TEXT.nl)[key] || key; }
  _current(epoch) { return this.isConnected && epoch === this._epoch; }

  attach(host) {
    this._host = host;
    this._opener = this.card.shadowRoot.getElementById("workspace-setup-open");
    if (this._opener) this._opener.onclick = () => this._visible(true);
    host.onclick = (event) => {
      const action = event.target.closest?.("[data-setup-action]")?.dataset.setupAction;
      if (action === "show") this._visible(true);
      if (action === "hide") this._visible(false);
      if (action === "retry") this.refresh();
      if (action === "next" && !event.target.closest("a")) this._next();
    };
    this.update();
  }

  update() {
    if (!this.isConnected) { this.disconnect(); this._render(); return; }
    const signature = `${this._hass.user.id || ""}:${this.card._litterId || "auto"}`;
    if (signature !== this._signature && this._data?.litter_id === this.litterId && this._connection === this._hass.connection && this._userId === this._hass.user.id) this._signature = signature;
    if (signature !== this._signature || this._connection !== this._hass.connection) {
      this.disconnect();
      this._signature = signature;
      this._connection = this._hass.connection;
      this._userId = this._hass.user.id;
      this._data = null;
      this._error = "";
      this._opened = false;
      this.refresh();
    }
    if (this._dialog?.open && this._weighing) this._weighing.hass = this._hass;
    if (this._data?.visible) this._subscribe();
    this._render();
  }

  disconnect() {
    this._epoch += 1;
    this._signature = null;
    this._refreshing = false;
    this._busy = false;
    this._again = false;
    this._status = "";
    this._subscribing = null;
    this._stopSubscription();
    this._dialog?.remove();
    this._dialog = null;
    this._weighing = null;
  }

  _stopSubscription() {
    if (this._unsubscribe) Promise.resolve(this._unsubscribe()).catch(() => undefined);
    this._unsubscribe = null;
  }

  async _subscribe() {
    if (!this.isConnected || !this._data?.visible || this._unsubscribe || this._subscribing) return;
    const epoch = this._epoch;
    const token = {};
    this._subscribing = token;
    try {
      const unsubscribe = await subscribeUpdates(this._hass, () => this.refresh(), this);
      if (!this._current(epoch) || !this._data?.visible) { if (unsubscribe) Promise.resolve(unsubscribe()).catch(() => undefined); }
      else this._unsubscribe = unsubscribe;
    } catch (_error) { /* Returning to the Workspace retries the subscription. */ }
    finally { if (this._subscribing === token) this._subscribing = null; }
  }

  _request(extra = {}) {
    const litterId = this.litterId;
    return { type: "puppy_tracker/onboarding", ...(litterId ? { litter_id: litterId } : {}), ...extra };
  }

  async refresh() {
    if (!this.isConnected) return;
    if (this._busy || this._refreshing) { this._again = true; return; }
    const epoch = this._epoch;
    const hass = this._hass;
    this._refreshing = true;
    try {
      do {
        this._again = false;
        const data = await hass.callWS(this._request());
        if (!this._current(epoch)) return;
        this._data = data;
        this._error = "";
      } while (this._again);
      if (!this._data.visible) this._stopSubscription();
      else await this._subscribe();
    } catch (_error) {
      if (this._current(epoch)) this._error = this._text("failed");
    } finally {
      if (this._current(epoch)) { this._refreshing = false; this._render(); }
    }
  }

  async _visible(visible) {
    if (!this.isConnected || this.busy) return;
    const epoch = ++this._epoch;
    this._refreshing = false;
    this._opened = visible;
    this._busy = true;
    this._error = "";
    this._status = "";
    this._render();
    try {
      const data = await this._hass.callWS(this._request({ visible }));
      if (!this._current(epoch)) return;
      this._data = data;
      if (!visible) this._stopSubscription();
      else await this._subscribe();
    } catch (_error) {
      if (this._current(epoch)) this._error = this._text("failed");
    } finally {
      if (this._current(epoch)) {
        this._busy = false;
        this._render();
        if (!this._error) (visible ? this._host.querySelector('[data-setup-action="next"],[data-setup-action="hide"]') : this._opener)?.focus({ preventScroll: true });
        if (this._again) this.refresh();
      }
    }
  }

  _next() {
    if (this.busy || this._error) return;
    const next = STEPS.find((key) => !this._data?.steps?.[key]);
    if (next === "backup") this._backup();
    else if (next === "weighing") this._openWeighing();
  }

  async _backup() {
    if (!this.isConnected || this.busy) return;
    const epoch = ++this._epoch;
    this._refreshing = false;
    this._busy = true;
    this._status = this._text("preparing");
    this._error = "";
    this._render();
    try {
      const result = await this._hass.callWS({ type: "puppy_tracker/onboarding/backup" });
      if (!this._current(epoch)) return;
      downloadExportFile(result);
      this._status = this._text("exported");
    } catch (_error) {
      if (this._current(epoch)) { this._status = ""; this._error = this._text("exportFailed"); }
    } finally {
      if (this._current(epoch)) {
        this._busy = false;
        this._render();
        if (!this._error) await this.refresh();
      }
    }
  }

  _openWeighing() {
    if (!this.isConnected || this.busy || !this._data?.litter_id) return;
    if (this.card._tabs.includes("weighing")) { this.card._selectTab("weighing"); return; }
    if (this._dialog?.open) return;
    const dialog = document.createElement("dialog");
    dialog.className = "setup-dialog";
    dialog.setAttribute("aria-label", this._text("weighing"));
    dialog.innerHTML = `<header><h3>${escapeHtml(this._text("weighing"))}</h3><button type="button" title="${escapeHtml(this._text("close"))}" aria-label="${escapeHtml(this._text("close"))}"><ha-icon icon="mdi:close"></ha-icon></button></header>`;
    if (!this._weighing) {
      this._weighing = document.createElement("puppy-tracker-card");
      this._weighing.setConfig({ ...this.card._surfaceConfig("weighing"), litter_id: this._data.litter_id, show_litter_selector: false });
    }
    dialog.append(this._weighing);
    this.card.shadowRoot.append(dialog);
    this._dialog = dialog;
    dialog.querySelector("button").onclick = () => { if (!this.busy) dialog.close(); };
    dialog.oncancel = (event) => { if (this.busy) event.preventDefault(); };
    dialog.onclose = () => {
      if (this._dialog !== dialog) return;
      this._weighing?.remove();
      dialog.remove();
      this._dialog = null;
      this.refresh();
    };
    this._weighing.hass = this._hass;
    dialog.showModal();
  }

  _render() {
    if (!this._host) return;
    const visible = this._data?.visible || (this._opened && !this._data);
    const updateVisibility = () => {
      if (this._opener) {
        this._opener.hidden = !this.isConnected || visible;
        this._opener.disabled = this._busy;
        this._opener.title = this._text("title");
        this._opener.setAttribute("aria-label", this._text("title"));
        this._opener.dataset.setupAction = "show";
        this._opener.closest(".workspace-nav")?.classList.toggle("has-setup-action", !this._opener.hidden);
      }
      this._host.hidden = !this.isConnected || !(visible || (this._error && this._opened));
    };
    if (!this.isConnected) { updateVisibility(); this._host.replaceChildren(); return; }
    const steps = this._data?.steps;
    const next = steps ? STEPS.find((key) => !steps[key]) : null;
    const disabled = this._busy || (this._refreshing && !this._data);
    const label = this._text("title");
    const error = this._error && (visible || this._opened) ? `<div class="setup-message setup-error" role="alert">${escapeHtml(this._error)}</div><button type="button" data-setup-action="retry" ${disabled ? "disabled" : ""}><ha-icon icon="mdi:refresh"></ha-icon>${escapeHtml(this._text("retry"))}</button>` : "";
    const rows = steps ? `<ol>${STEPS.map((key) => `<li data-setup-step="${key}" data-complete="${steps[key] === true}"><ha-icon icon="mdi:${steps[key] ? "check-circle-outline" : "circle-outline"}" aria-label="${steps[key] ? escapeHtml(this._text("completed")) : ""}"></ha-icon><span>${escapeHtml(this._text(key))}</span></li>`).join("")}</ol>` : `<div class="setup-message">${escapeHtml(this._text("loading"))}</div>`;
    const settingsStep = next && !["weighing", "backup"].includes(next);
    const nextAction = next && !this._error ? settingsStep && !disabled
      ? `<a class="primary" data-setup-action="next" href="/config/integrations/integration/puppy_tracker"><ha-icon icon="mdi:cog-outline"></ha-icon>${escapeHtml(this._text(next))}</a>`
      : `<button type="button" class="primary" data-setup-action="next" ${disabled ? "disabled" : ""}><ha-icon icon="mdi:${next === "weighing" ? "scale" : next === "backup" ? "download" : "cog-outline"}"></ha-icon>${escapeHtml(this._text(next))}</button>` : "";
    const panel = visible ? `<div class="setup-panel">
      <header class="setup-head"><h3>${escapeHtml(label)}</h3><small>${steps ? STEPS.filter((key) => steps[key]).length : 0} / ${STEPS.length}</small><button type="button" class="icon" data-setup-action="hide" title="${escapeHtml(this._text("hide"))}" aria-label="${escapeHtml(this._text("hide"))}" ${this._busy ? "disabled" : ""}><ha-icon icon="mdi:close"></ha-icon></button></header>
      ${this._data?.litter_name ? `<div class="setup-context">${escapeHtml(this._data.litter_name)}</div>` : ""}${rows}${error}${nextAction}
      ${this._status ? `<div class="setup-message" role="status">${escapeHtml(this._status)}</div>` : ""}</div>` : error;
    const markup = `<style>${STYLE}</style><section class="setup" aria-label="${escapeHtml(label)}" aria-busy="${this._busy}">${panel}</section>`;
    if (this._markup === markup && this._host.firstChild) { updateVisibility(); return; }
    this._markup = markup;
    preserveScrollPosition(this.card, () => { updateVisibility(); this._host.innerHTML = markup; });
  }
}
