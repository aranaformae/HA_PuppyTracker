import {
  escapeHtml,
  fetchLitterData,
  fetchLitters,
  languageForHass,
  selectDefaultLitter,
  subscribeUpdates,
} from "./puppy-tracker-card-common.js";

const TAG = "puppy-tracker-recurring-reminder-card";

function en(card) { return languageForHass(card?._hass) === "en"; }
function t(card, nl, english) { return en(card) ? english : nl; }
function dtLocal(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}
function statusText(card, item) {
  const minutes = Number(item?.minutes_until_due);
  if (item?.status === "overdue") {
    const amount = Math.abs(minutes);
    if (amount < 60) return t(card, `${amount} min te laat`, `${amount} min overdue`);
    const hours = Math.floor(amount / 60);
    return t(card, `${hours} u te laat`, `${hours} h overdue`);
  }
  if (item?.status === "due_soon") {
    return minutes <= 0 ? t(card, "Nu", "Now") : t(card, `over ${minutes} min`, `in ${minutes} min`);
  }
  if (item?.status === "completed") return t(card, "Voltooid", "Completed");
  if (item?.status === "disabled") return t(card, "Uitgeschakeld", "Disabled");
  if (Number.isFinite(minutes)) {
    const hours = Math.max(0, Math.floor(minutes / 60));
    return hours < 24 ? t(card, `over ${hours} u`, `in ${hours} h`) : t(card, `over ${Math.floor(hours / 24)} d`, `in ${Math.floor(hours / 24)} d`);
  }
  return "—";
}
function scheduleText(card, item) {
  if (item?.schedule_mode === "interval") {
    const mins = Number(item.interval_minutes || 0);
    if (mins % 1440 === 0) return t(card, `Elke ${mins / 1440} dag(en)`, `Every ${mins / 1440} day(s)`);
    if (mins % 60 === 0) return t(card, `Elke ${mins / 60} uur`, `Every ${mins / 60} hours`);
    return t(card, `Elke ${mins} minuten`, `Every ${mins} minutes`);
  }
  if (item?.schedule_mode === "fixed_times") return (item.fixed_times || []).join(" · ");
  return t(card, "Eenmalig", "Once");
}

class PuppyTrackerRecurringReminderCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass = null;
    this._config = {};
    this._litters = [];
    this._selectedLitterId = null;
    this._litterData = null;
    this._items = [];
    this._editing = null;
    this._showEditor = false;
    this._error = "";
    this._saving = false;
    this._unsubscribe = null;
  }

  static getStubConfig() { return { title: "", show_litter_selector: true }; }
  static getConfigForm() {
    return { schema: [
      { name: "title", selector: { text: {} } },
      { name: "show_litter_selector", selector: { boolean: {} } },
    ] };
  }
  setConfig(config) {
    this._config = { title: "", show_litter_selector: true, ...config };
    this._selectedLitterId = config.litter_id || this._selectedLitterId;
    this._render();
  }
  set hass(hass) {
    this._hass = hass;
    if (!this._litters.length) this._load();
  }
  connectedCallback() {
    if (this._hass && !this._litters.length) this._load();
  }
  disconnectedCallback() {
    if (this._unsubscribe) Promise.resolve(this._unsubscribe()).catch(() => undefined);
    this._unsubscribe = null;
  }
  getCardSize() { return 5; }
  getGridOptions() { return { columns: 12, min_columns: 6 }; }

  async _load() {
    if (!this._hass) return;
    try {
      const litters = await fetchLitters(this._hass);
      this._litters = litters?.litters || [];
      this._selectedLitterId = selectDefaultLitter(this._litters, this._selectedLitterId || this._config.litter_id);
      await this._loadCurrent();
      if (!this._unsubscribe && this.isConnected) {
        this._unsubscribe = await subscribeUpdates(this._hass, () => this._loadCurrent());
      }
    } catch (error) {
      this._error = error?.message || t(this, "Herinneringen konden niet worden geladen.", "Reminders could not be loaded.");
    }
    this._render();
  }

  async _loadCurrent() {
    if (!this._hass || !this._selectedLitterId) return;
    try {
      const [data, reminders] = await Promise.all([
        fetchLitterData(this._hass, this._selectedLitterId),
        this._hass.callWS({ type: "puppy_tracker/recurring_reminders", litter_id: this._selectedLitterId }),
      ]);
      this._litterData = data;
      this._items = reminders?.reminders || [];
      this._error = "";
    } catch (error) {
      this._error = error?.message || t(this, "Herinneringen konden niet worden geladen.", "Reminders could not be loaded.");
    }
    this._render();
  }

  _owners() {
    const litter = this._litterData?.litter;
    const result = [{ value: `litter:${this._selectedLitterId}`, scope: "litter", id: this._selectedLitterId, label: t(this, "Hele nest", "Whole litter") }];
    if (litter?.mother_id) {
      result.push({ value: `mother:${litter.mother_id}`, scope: "mother", id: litter.mother_id, label: `${t(this, "Moederhond", "Mother")} · ${litter.mother || t(this, "Moederhond", "Mother")}` });
    }
    for (const puppy of (this._litterData?.puppies || []).filter((item) => item.active !== false)) {
      result.push({ value: `puppy:${puppy.id}`, scope: "puppy", id: puppy.id, label: `${t(this, "Pup", "Puppy")} · ${puppy.name || t(this, "Pup", "Puppy")}` });
    }
    return result;
  }

  _draft() {
    const item = this._editing || {};
    const owner = item.owner_scope && item.owner_id ? `${item.owner_scope}:${item.owner_id}` : `litter:${this._selectedLitterId}`;
    return {
      owner,
      title: item.title || t(this, "Temperatuur meten", "Measure temperature"),
      record_type: item.record_type || "temperature",
      match_title: item.match_title || "",
      schedule_mode: item.schedule_mode || "interval",
      interval_minutes: item.interval_minutes || 240,
      fixed_times: (item.fixed_times || ["08:00", "14:00", "20:00"]).join(", "),
      due_at: dtLocal(item.due_at),
      enabled: item.enabled !== false,
    };
  }

  _captureEditor() {
    const root = this.shadowRoot;
    if (!root) return null;
    const ownerValue = root.getElementById("rem-owner")?.value || `litter:${this._selectedLitterId}`;
    const [owner_scope, ...ownerParts] = ownerValue.split(":");
    return {
      litter_id: this._selectedLitterId,
      owner_scope,
      owner_id: ownerParts.join(":"),
      title: root.getElementById("rem-title")?.value?.trim() || "",
      record_type: root.getElementById("rem-type")?.value || "note",
      match_title: root.getElementById("rem-match-title")?.value?.trim() || null,
      schedule_mode: root.getElementById("rem-mode")?.value || "interval",
      interval_minutes: Number(root.getElementById("rem-interval")?.value || 0),
      fixed_times: String(root.getElementById("rem-times")?.value || "").split(",").map((v) => v.trim()).filter(Boolean),
      due_at: root.getElementById("rem-due")?.value ? new Date(root.getElementById("rem-due").value).toISOString() : undefined,
      enabled: Boolean(root.getElementById("rem-enabled")?.checked),
    };
  }

  async _save() {
    const data = this._captureEditor();
    if (!data || !data.title) {
      this._error = t(this, "Geef de herinnering een naam.", "Give the reminder a name.");
      this._render();
      return;
    }
    this._saving = true;
    this._render();
    try {
      if (this._editing?.id) {
        await this._hass.callWS({ type: "puppy_tracker/recurring_reminder/update", reminder_id: this._editing.id, ...data });
      } else {
        await this._hass.callWS({ type: "puppy_tracker/recurring_reminder/create", ...data });
      }
      this._showEditor = false;
      this._editing = null;
      await this._loadCurrent();
    } catch (error) {
      this._error = error?.message || t(this, "Herinnering kon niet worden opgeslagen.", "Reminder could not be saved.");
    } finally {
      this._saving = false;
      this._render();
    }
  }

  async _delete(id) {
    if (!id) return;
    try {
      await this._hass.callWS({ type: "puppy_tracker/recurring_reminder/delete", reminder_id: id });
      await this._loadCurrent();
    } catch (error) {
      this._error = error?.message || t(this, "Herinnering kon niet worden verwijderd.", "Reminder could not be deleted.");
      this._render();
    }
  }

  _render() {
    if (!this.shadowRoot) return;
    const draft = this._draft();
    const owners = this._owners();
    const selector = this._config.show_litter_selector !== false && this._litters.length > 1
      ? `<select id="litter-select">${this._litters.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === this._selectedLitterId ? "selected" : ""}>${escapeHtml(item.name || "Nest")}</option>`).join("")}</select>` : "";

    const list = this._items.length ? `<div class="list">${this._items.map((item) => `
      <div class="item ${escapeHtml(item.status || "")}">
        <div class="ico"><ha-icon icon="${item.record_type === "temperature" ? "mdi:thermometer" : "mdi:bell-ring-outline"}"></ha-icon></div>
        <div class="main"><strong>${escapeHtml(item.title)}</strong><div>${escapeHtml(item.owner_name || "")} · ${escapeHtml(scheduleText(this, item))}</div></div>
        <div class="due">${escapeHtml(statusText(this, item))}</div>
        <button class="icon-button edit" data-id="${escapeHtml(item.id)}" title="${escapeHtml(t(this, "Aanpassen", "Edit"))}"><ha-icon icon="mdi:pencil-outline"></ha-icon></button>
      </div>`).join("")}</div>` : `<div class="empty">${escapeHtml(t(this, "Nog geen terugkerende herinneringen.", "No recurring reminders yet."))}</div>`;

    const editor = this._showEditor ? `
      <div class="editor">
        <div class="editor-title">${escapeHtml(this._editing ? t(this, "Herinnering aanpassen", "Edit reminder") : t(this, "Herinnering toevoegen", "Add reminder"))}</div>
        <label>${escapeHtml(t(this, "Eigenaar", "Owner"))}<select id="rem-owner">${owners.map((o) => `<option value="${escapeHtml(o.value)}" ${o.value === draft.owner ? "selected" : ""}>${escapeHtml(o.label)}</option>`).join("")}</select></label>
        <label>${escapeHtml(t(this, "Actie", "Action"))}<input id="rem-title" value="${escapeHtml(draft.title)}"></label>
        <label>${escapeHtml(t(this, "Dossieritem dat de actie afvinkt", "Dossier item that completes it"))}<select id="rem-type">
          ${[["temperature",t(this,"Temperatuur","Temperature")],["medication",t(this,"Medicatie","Medication")],["note",t(this,"Notitie / andere actie","Note / other action")],["deworming",t(this,"Ontworming","Deworming")],["vaccination",t(this,"Vaccinatie","Vaccination")],["milestone",t(this,"Mijlpaal","Milestone")]].map(([v,l]) => `<option value="${v}" ${draft.record_type === v ? "selected" : ""}>${escapeHtml(l)}</option>`).join("")}
        </select></label>
        <label>${escapeHtml(t(this, "Optioneel: exacte titel om te matchen", "Optional: exact title to match"))}<input id="rem-match-title" value="${escapeHtml(draft.match_title)}" placeholder="${escapeHtml(t(this,"Bijv. Voeding","E.g. Feeding"))}"></label>
        <label>${escapeHtml(t(this, "Herhaling", "Schedule"))}<select id="rem-mode">
          <option value="interval" ${draft.schedule_mode === "interval" ? "selected" : ""}>${escapeHtml(t(this,"Vanaf laatste uitvoering","From last completion"))}</option>
          <option value="fixed_times" ${draft.schedule_mode === "fixed_times" ? "selected" : ""}>${escapeHtml(t(this,"Vaste tijden per dag","Fixed times each day"))}</option>
          <option value="once" ${draft.schedule_mode === "once" ? "selected" : ""}>${escapeHtml(t(this,"Eenmalig","Once"))}</option>
        </select></label>
        <label class="mode interval">${escapeHtml(t(this, "Interval (minuten)", "Interval (minutes)"))}<input id="rem-interval" type="number" min="1" value="${escapeHtml(String(draft.interval_minutes))}"></label>
        <label class="mode fixed_times">${escapeHtml(t(this, "Tijden (komma gescheiden)", "Times (comma separated)"))}<input id="rem-times" value="${escapeHtml(draft.fixed_times)}"></label>
        <label class="mode once">${escapeHtml(t(this, "Datum en tijd", "Date and time"))}<input id="rem-due" type="datetime-local" value="${escapeHtml(draft.due_at)}"></label>
        <label class="check"><input id="rem-enabled" type="checkbox" ${draft.enabled ? "checked" : ""}> ${escapeHtml(t(this, "Actief", "Enabled"))}</label>
        <div class="editor-actions">
          ${this._editing ? `<button class="danger" id="delete-reminder">${escapeHtml(t(this,"Verwijderen","Delete"))}</button>` : ""}
          <span></span><button id="cancel-reminder">${escapeHtml(t(this,"Annuleren","Cancel"))}</button>
          <button class="primary" id="save-reminder" ${this._saving ? "disabled" : ""}>${escapeHtml(t(this,"Opslaan","Save"))}</button>
        </div>
      </div>` : "";

    this.shadowRoot.innerHTML = `
      <ha-card><style>
        ha-card{padding:16px}.top{display:flex;align-items:center;justify-content:space-between;gap:10px}.title{font-size:18px;font-weight:600}.controls{display:flex;gap:8px;align-items:center}select,input{box-sizing:border-box;min-height:40px;border:1px solid var(--divider-color);border-radius:10px;background:var(--card-background-color);color:var(--primary-text-color);padding:0 10px}button{min-height:38px;border-radius:10px;border:1px solid var(--divider-color);background:var(--secondary-background-color);color:var(--primary-text-color);padding:0 12px;cursor:pointer}.primary{background:var(--primary-color);color:var(--text-primary-color);border-color:var(--primary-color)}.danger{color:var(--error-color)}.list{display:grid;gap:8px;margin-top:12px}.item{display:grid;grid-template-columns:34px minmax(0,1fr) auto 38px;align-items:center;gap:10px;padding:10px;border:1px solid var(--divider-color);border-radius:12px}.ico{display:grid;place-items:center}.main div{font-size:12px;color:var(--secondary-text-color);margin-top:2px}.due{font-size:12px;font-weight:600}.overdue .due{color:var(--error-color)}.due_soon .due{color:var(--warning-color,var(--primary-color))}.icon-button{padding:0;width:38px}.empty{margin-top:12px;padding:14px;border:1px dashed var(--divider-color);border-radius:12px;color:var(--secondary-text-color)}.error{color:var(--error-color);margin-top:10px}.editor{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px;padding-top:14px;border-top:1px solid var(--divider-color)}.editor-title{grid-column:1/-1;font-weight:600}.editor label{display:grid;gap:5px;font-size:12px;color:var(--secondary-text-color)}.editor label input,.editor label select{width:100%;color:var(--primary-text-color)}.editor .check{display:flex;align-items:center;grid-column:1/-1}.check input{width:auto;min-height:auto}.editor-actions{grid-column:1/-1;display:grid;grid-template-columns:auto 1fr auto auto;gap:8px}.mode{display:none}.editor:has(#rem-mode option[value="interval"]:checked) .mode.interval{display:grid}.editor:has(#rem-mode option[value="fixed_times"]:checked) .mode.fixed_times{display:grid}.editor:has(#rem-mode option[value="once"]:checked) .mode.once{display:grid}@media(max-width:600px){.editor{grid-template-columns:1fr}.editor>*{grid-column:1}.item{grid-template-columns:34px minmax(0,1fr) 38px}.due{grid-column:2}.top{align-items:flex-start}.controls{flex-wrap:wrap;justify-content:flex-end}}
      </style>
      <div class="top"><div class="title">${escapeHtml(this._config.title || t(this,"Herinneringen","Reminders"))}</div><div class="controls">${selector}<button class="primary" id="add-reminder">+ ${escapeHtml(t(this,"Toevoegen","Add"))}</button></div></div>
      ${this._error ? `<div class="error">${escapeHtml(this._error)}</div>` : ""}${list}${editor}</ha-card>`;

    this.shadowRoot.getElementById("litter-select")?.addEventListener("change", async (event) => {
      this._selectedLitterId = event.target.value; this._editing = null; this._showEditor = false; await this._loadCurrent();
    });
    this.shadowRoot.getElementById("add-reminder")?.addEventListener("click", () => { this._editing = null; this._showEditor = true; this._render(); });
    this.shadowRoot.querySelectorAll("button.edit").forEach((button) => button.addEventListener("click", () => {
      this._editing = this._items.find((item) => item.id === button.dataset.id) || null; this._showEditor = true; this._render();
    }));
    this.shadowRoot.getElementById("cancel-reminder")?.addEventListener("click", () => { this._editing = null; this._showEditor = false; this._render(); });
    this.shadowRoot.getElementById("save-reminder")?.addEventListener("click", () => this._save());
    this.shadowRoot.getElementById("delete-reminder")?.addEventListener("click", () => this._delete(this._editing?.id).then(() => { this._editing = null; this._showEditor = false; }));
    this.shadowRoot.getElementById("rem-mode")?.addEventListener("change", () => {
      const value = this.shadowRoot.getElementById("rem-mode")?.value;
      this.shadowRoot.querySelectorAll(".mode").forEach((el) => { el.style.display = el.classList.contains(value) ? "grid" : "none"; });
    });
    const mode = this.shadowRoot.getElementById("rem-mode")?.value;
    this.shadowRoot.querySelectorAll(".mode").forEach((el) => { el.style.display = el.classList.contains(mode) ? "grid" : "none"; });
  }
}

if (!customElements.get(TAG)) customElements.define(TAG, PuppyTrackerRecurringReminderCard);
window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === TAG)) {
  window.customCards.push({ type: TAG, name: "Puppy Tracker Recurring Reminders", description: "Recurring actions for litter, mother or puppy" });
}
