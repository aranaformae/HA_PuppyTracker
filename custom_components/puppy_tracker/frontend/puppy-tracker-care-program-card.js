import {
  escapeHtml,
  fetchLitters,
  languageForHass,
  selectDefaultLitter,
  subscribeUpdates,
} from "./puppy-tracker-card-common.js";

const TAG = "puppy-tracker-care-program-card";

function en(card) { return languageForHass(card?._hass) === "en"; }
function t(card, nl, english) { return en(card) ? english : nl; }
function checked(value) { return value ? "checked" : ""; }

function scheduleText(card, item) {
  const start = Number(item?.start_age_days ?? 0);
  if (item?.schedule_type === "once") {
    return t(card, `Op dag ${start}`, `At day ${start}`);
  }
  const end = Number(item?.end_age_days ?? start);
  const interval = Number(item?.interval_days ?? 1);
  const cadence = interval === 1
    ? t(card, "dagelijks", "daily")
    : t(card, `elke ${interval} dagen`, `every ${interval} days`);
  return t(card, `Dag ${start} t/m ${end} · ${cadence}`, `Day ${start} through ${end} · ${cadence}`);
}

function recordTypeLabel(card, value) {
  const labels = {
    note: t(card, "Notitie / oefening", "Note / exercise"),
    deworming: t(card, "Ontworming", "Deworming"),
    vaccination: t(card, "Vaccinatie", "Vaccination"),
    medication: t(card, "Medicatie", "Medication"),
    milestone: t(card, "Mijlpaal", "Milestone"),
    test: t(card, "Test", "Test"),
    other: t(card, "Overig", "Other"),
  };
  return labels[value] || value || "note";
}

function schedulesOverlap(left, right) {
  if (left.time_of_day !== right.time_of_day) return false;
  const leftStart = Number(left.start_age_days ?? 0);
  const leftEnd = left.schedule_type === "once" ? leftStart : Number(left.end_age_days ?? leftStart);
  const rightStart = Number(right.start_age_days ?? 0);
  const rightEnd = right.schedule_type === "once" ? rightStart : Number(right.end_age_days ?? rightStart);
  return leftStart <= rightEnd && rightStart <= leftEnd;
}

class PuppyTrackerCareProgramCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass = null;
    this._config = {};
    this._litters = [];
    this._selectedLitterId = null;
    this._programs = [];
    this._showEditor = false;
    this._editing = null;
    this._saving = false;
    this._error = "";
    this._unsubscribe = null;
    this._query = "";
  }

  static getStubConfig() { return { title: "", show_litter_selector: true, show_disabled: true, max_items: 50, compact: false, sort_order: "schedule" }; }
  static getConfigForm() {
    return { schema: [
      { name: "title", selector: { text: {} } },
      { name: "show_litter_selector", selector: { boolean: {} } },
      { name: "show_disabled", selector: { boolean: {} } },
      { name: "max_items", selector: { number: { min: 5, max: 200, step: 5, mode: "box" } } },
      { name: "compact", selector: { boolean: {} } },
      { name: "sort_order", selector: { select: { mode: "dropdown", options: [
        { value: "schedule", label: "Schedule" },
        { value: "title", label: "Title" },
      ] } } },
    ] };
  }

  setConfig(config) {
    this._config = { title: "", show_litter_selector: true, show_disabled: true, max_items: 50, compact: false, sort_order: "schedule", ...config };
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
      const response = await fetchLitters(this._hass);
      this._litters = response?.litters || [];
      this._selectedLitterId = selectDefaultLitter(
        this._litters,
        this._selectedLitterId || this._config.litter_id,
      );
      await this._loadCurrent();
      if (!this._unsubscribe && this.isConnected) {
        this._unsubscribe = await subscribeUpdates(this._hass, () => this._loadCurrent(), this);
      }
    } catch (error) {
      this._error = error?.message || t(this, "Zorgprogramma's konden niet worden geladen.", "Care programs could not be loaded.");
    }
    this._render();
  }

  async _loadCurrent() {
    if (!this._hass || !this._selectedLitterId) return;
    try {
      const response = await this._hass.callWS({
        type: "puppy_tracker/care_programs",
        litter_id: this._selectedLitterId,
      });
      this._programs = response?.programs || [];
      this._error = "";
    } catch (error) {
      this._error = error?.message || t(this, "Zorgprogramma's konden niet worden geladen.", "Care programs could not be loaded.");
    }
    this._render();
  }

  _draft() {
    const item = this._editing || {};
    return {
      title: item.title || "",
      description: item.description || "",
      record_type: item.record_type || "note",
      schedule_type: item.schedule_type || "range",
      start_age_days: item.start_age_days ?? 3,
      end_age_days: item.end_age_days ?? 17,
      interval_days: item.interval_days ?? 1,
      time_of_day: item.time_of_day || "09:00",
      enabled: item.enabled !== false,
      counts_for_attention: item.counts_for_attention !== false,
      notifications_enabled: item.notifications_enabled !== false,
      notification_lead_minutes: item.notification_lead_minutes ?? "",
      result_fields: item.result_fields || ["result", "note"],
    };
  }

  _captureEditor() {
    const root = this.shadowRoot;
    if (!root) return null;
    const fields = ["result", "score", "note"].filter((name) => root.getElementById(`care-result-${name}`)?.checked);
    return {
      litter_id: this._selectedLitterId,
      title: root.getElementById("care-title")?.value?.trim() || "",
      description: root.getElementById("care-description")?.value?.trim() || null,
      record_type: root.getElementById("care-record-type")?.value || "note",
      schedule_type: root.getElementById("care-schedule-type")?.value || "range",
      start_age_days: Number(root.getElementById("care-start")?.value || 0),
      end_age_days: Number(root.getElementById("care-end")?.value || 0),
      interval_days: Number(root.getElementById("care-interval")?.value || 1),
      time_of_day: root.getElementById("care-time")?.value || null,
      enabled: Boolean(root.getElementById("care-enabled")?.checked),
      counts_for_attention: Boolean(root.getElementById("care-attention")?.checked),
      notifications_enabled: Boolean(root.getElementById("care-notifications")?.checked),
      notification_lead_minutes: root.getElementById("care-lead-minutes")?.value === ""
        ? null
        : Number(root.getElementById("care-lead-minutes")?.value || 0),
      result_fields: fields,
    };
  }

  async _save() {
    const data = this._captureEditor();
    if (!data?.title) {
      this._error = t(this, "Geef het zorgprogramma een naam.", "Give the care program a name.");
      this._render();
      return;
    }
    if (!Number.isInteger(data.start_age_days) || data.start_age_days < 0 || data.start_age_days > 3650) {
      this._error = t(this, "De startleeftijd moet tussen 0 en 3650 dagen liggen.", "Start age must be between 0 and 3650 days.");
      this._render();
      return;
    }
    if (data.schedule_type === "range" && data.end_age_days < data.start_age_days) {
      this._error = t(this, "De eindleeftijd moet gelijk aan of later zijn dan de startleeftijd.", "End age must be equal to or later than start age.");
      this._render();
      return;
    }
    if (data.schedule_type === "range" && (!Number.isInteger(data.end_age_days) || data.end_age_days > 3650 || data.interval_days < 1)) {
      this._error = t(this, "Controleer eindleeftijd en herhalingsinterval.", "Check the end age and repeat interval.");
      this._render();
      return;
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(data.time_of_day || ""))) {
      this._error = t(this, "Vul een geldig tijdstip in.", "Enter a valid time.");
      this._render();
      return;
    }
    if (data.notification_lead_minutes != null && (!Number.isInteger(data.notification_lead_minutes) || data.notification_lead_minutes < 0 || data.notification_lead_minutes > 10080)) {
      this._error = t(this, "De meldingstijd moet tussen 0 en 10080 minuten liggen.", "Notification lead time must be between 0 and 10080 minutes.");
      this._render();
      return;
    }

    this._saving = true;
    this._render();
    try {
      if (this._editing?.id) {
        await this._hass.callWS({
          type: "puppy_tracker/care_program/update",
          program_id: this._editing.id,
          ...data,
        });
      } else {
        await this._hass.callWS({ type: "puppy_tracker/care_program/create", ...data });
      }
      this._showEditor = false;
      this._editing = null;
      await this._loadCurrent();
    } catch (error) {
      this._error = error?.message || t(this, "Zorgprogramma kon niet worden opgeslagen.", "Care program could not be saved.");
    } finally {
      this._saving = false;
      this._render();
    }
  }

  async _delete(id) {
    if (!id) return;
    try {
      await this._hass.callWS({ type: "puppy_tracker/care_program/delete", program_id: id });
      this._showEditor = false;
      this._editing = null;
      await this._loadCurrent();
    } catch (error) {
      this._error = error?.message || t(this, "Zorgprogramma kon niet worden verwijderd.", "Care program could not be deleted.");
      this._render();
    }
  }

  _render() {
    if (!this.shadowRoot) return;
    const draft = this._draft();
    const isAdmin = Boolean(this._hass?.user?.is_admin);
    const selector = this._config.show_litter_selector !== false && this._litters.length > 1
      ? `<select id="litter-select">${this._litters.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === this._selectedLitterId ? "selected" : ""}>${escapeHtml(item.name || "Nest")}</option>`).join("")}</select>`
      : "";

    const query = this._query.trim().toLocaleLowerCase();
    const programs = [...this._programs]
      .filter((item) => this._config.show_disabled !== false || item.enabled !== false)
      .filter((item) => !query || `${item.title || ""} ${item.description || ""} ${recordTypeLabel(this, item.record_type)}`.toLocaleLowerCase().includes(query))
      .sort((left, right) => this._config.sort_order === "title"
        ? String(left.title || "").localeCompare(String(right.title || ""), undefined, { sensitivity: "base" })
        : Number(left.start_age_days || 0) - Number(right.start_age_days || 0));
    const overlaps = programs.some((item, index) => programs.slice(index + 1).some((other) => schedulesOverlap(item, other)));
    const maxItems = Math.max(5, Math.min(200, Number(this._config.max_items) || 50));
    const visiblePrograms = programs.slice(0, maxItems);
    const list = visiblePrograms.length
      ? `<div class="list ${this._config.compact === true ? "compact" : ""}">${visiblePrograms.map((item) => `
          <div class="item ${item.enabled === false ? "disabled" : ""}">
            <div class="ico"><ha-icon icon="${item.record_type === "deworming" ? "mdi:medical-bag" : "mdi:calendar-heart"}"></ha-icon></div>
            <div class="main">
              <strong>${escapeHtml(item.title || "")}</strong>
              <div>${escapeHtml(scheduleText(this, item))}${item.time_of_day ? ` · ${escapeHtml(item.time_of_day)}` : ""}</div>
              <div class="meta">${escapeHtml(recordTypeLabel(this, item.record_type))}${item.notifications_enabled === false ? ` · ${escapeHtml(t(this, "meldingen uit", "notifications off"))}` : ""}${item.notification_lead_minutes != null ? ` · ${escapeHtml(t(this, `${item.notification_lead_minutes} min vooraf`, `${item.notification_lead_minutes} min before`))}` : ""}</div>
            </div>
            ${isAdmin ? `<button class="icon-button edit" data-id="${escapeHtml(item.id)}" title="${escapeHtml(t(this, "Aanpassen", "Edit"))}" aria-label="${escapeHtml(t(this, "Aanpassen", "Edit"))}"><ha-icon icon="mdi:pencil-outline"></ha-icon></button>` : ""}
          </div>`).join("")}</div>`
      : `<div class="empty">${escapeHtml(t(this, "Nog geen leeftijdsgebonden zorgprogramma's voor dit nest.", "No age-based care programs for this litter yet."))}</div>`;

    const editor = this._showEditor && isAdmin ? `
      <div class="editor">
        <div class="editor-title">${escapeHtml(this._editing ? t(this, "Zorgprogramma aanpassen", "Edit care program") : t(this, "Zorgprogramma toevoegen", "Add care program"))}</div>
        <label>${escapeHtml(t(this, "Naam", "Name"))}<input id="care-title" value="${escapeHtml(draft.title)}" placeholder="ENS / ESI / Ontworming"></label>
        <label>${escapeHtml(t(this, "Omschrijving", "Description"))}<textarea id="care-description" rows="2">${escapeHtml(draft.description)}</textarea></label>
        <div class="grid">
          <label>${escapeHtml(t(this, "Type dossieritem", "Dossier type"))}<select id="care-record-type">${["note","deworming","vaccination","medication","milestone","test","other"].map((value) => `<option value="${value}" ${draft.record_type === value ? "selected" : ""}>${escapeHtml(recordTypeLabel(this, value))}</option>`).join("")}</select></label>
          <label>${escapeHtml(t(this, "Schema", "Schedule"))}<select id="care-schedule-type"><option value="once" ${draft.schedule_type === "once" ? "selected" : ""}>${escapeHtml(t(this, "Eenmalig op leeftijd", "Once at age"))}</option><option value="range" ${draft.schedule_type === "range" ? "selected" : ""}>${escapeHtml(t(this, "Leeftijdsperiode", "Age range"))}</option></select></label>
        </div>
        <div class="grid ages">
          <label>${escapeHtml(t(this, "Start (dagen)", "Start (days)"))}<input id="care-start" type="number" min="0" max="3650" value="${escapeHtml(String(draft.start_age_days))}"></label>
          <label class="range-field">${escapeHtml(t(this, "Einde (dagen)", "End (days)"))}<input id="care-end" type="number" min="0" max="3650" value="${escapeHtml(String(draft.end_age_days))}"></label>
          <label class="range-field">${escapeHtml(t(this, "Elke ... dagen", "Every ... days"))}<input id="care-interval" type="number" min="1" max="3650" value="${escapeHtml(String(draft.interval_days))}"></label>
          <label>${escapeHtml(t(this, "Tijdstip", "Time"))}<input id="care-time" type="time" value="${escapeHtml(draft.time_of_day)}"></label>
          <label>${escapeHtml(t(this, "Melding vooraf (min)", "Notify before (min)"))}<input id="care-lead-minutes" type="number" min="0" max="10080" step="5" value="${escapeHtml(String(draft.notification_lead_minutes))}" placeholder="${escapeHtml(t(this, "Integratie standaard", "Integration default"))}"></label>
        </div>
        <div class="result-title">${escapeHtml(t(this, "Resultaatvelden", "Result fields"))}</div>
        <div class="checks">
          <label><input id="care-result-result" type="checkbox" ${checked(draft.result_fields.includes("result"))}> ${escapeHtml(t(this, "Resultaat / beoordeling", "Result / assessment"))}</label>
          <label><input id="care-result-score" type="checkbox" ${checked(draft.result_fields.includes("score"))}> ${escapeHtml(t(this, "Score", "Score"))}</label>
          <label><input id="care-result-note" type="checkbox" ${checked(draft.result_fields.includes("note"))}> ${escapeHtml(t(this, "Notitie", "Note"))}</label>
        </div>
        <div class="checks">
          <label><input id="care-enabled" type="checkbox" ${checked(draft.enabled)}> ${escapeHtml(t(this, "Programma actief", "Program enabled"))}</label>
          <label><input id="care-attention" type="checkbox" ${checked(draft.counts_for_attention)}> ${escapeHtml(t(this, "Meetellen voor aandacht pup", "Include in puppy attention"))}</label>
          <label><input id="care-notifications" type="checkbox" ${checked(draft.notifications_enabled)}> ${escapeHtml(t(this, "Meldingen inschakelen", "Enable notifications"))}</label>
        </div>
        <div class="editor-actions">
          ${this._editing ? `<button class="danger" id="delete-program">${escapeHtml(t(this, "Verwijderen", "Delete"))}</button>` : ""}
          <span></span><button id="cancel-program">${escapeHtml(t(this, "Annuleren", "Cancel"))}</button>
          <button class="primary" id="save-program" ${this._saving ? "disabled" : ""}>${escapeHtml(t(this, "Opslaan", "Save"))}</button>
        </div>
      </div>` : "";

    this.shadowRoot.innerHTML = `
      <ha-card><style>
          ha-card{padding:16px}.top{display:flex;gap:12px;align-items:center;justify-content:space-between}.title{font-size:18px;font-weight:600}.tools{display:flex;gap:8px;align-items:center}select,input,textarea,button{font:inherit}select,input,textarea{box-sizing:border-box;width:100%;padding:9px;border:1px solid var(--divider-color);border-radius:8px;background:var(--card-background-color);color:var(--primary-text-color)}button{padding:8px 12px;border:1px solid var(--divider-color);border-radius:8px;background:transparent;color:var(--primary-text-color);cursor:pointer}.primary{background:var(--primary-color);color:var(--text-primary-color);border-color:var(--primary-color)}.danger{color:var(--error-color)}.search{margin-top:12px}.list{margin-top:12px;display:grid;gap:8px;max-height:60vh;overflow:auto}.list.compact{gap:4px}.item{display:grid;grid-template-columns:36px 1fr auto;gap:10px;align-items:center;padding:10px;border:1px solid var(--divider-color);border-radius:10px}.compact .item{padding:6px}.item.disabled{opacity:.55}.ico{display:flex;align-items:center;justify-content:center}.main div{font-size:12px;color:var(--secondary-text-color);margin-top:2px}.main .meta{opacity:.85}.icon-button{border:0;padding:7px}.empty{padding:18px 4px;color:var(--secondary-text-color)}.editor{margin-top:14px;padding-top:14px;border-top:1px solid var(--divider-color);display:grid;gap:10px}.editor-title,.result-title{font-weight:600}.editor label{display:grid;gap:5px;font-size:12px;color:var(--secondary-text-color)}.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.ages{grid-template-columns:repeat(4,1fr)}.checks{display:flex;flex-wrap:wrap;gap:14px}.checks label{display:flex;align-items:center;gap:6px}.checks input{width:auto}.editor-actions{display:grid;grid-template-columns:auto 1fr auto auto;gap:8px;align-items:center}.error{margin-top:10px;color:var(--error-color);font-size:13px}.warning{margin-top:10px;padding:8px 10px;border-radius:8px;background:color-mix(in srgb,var(--warning-color,var(--primary-color)) 12%,transparent);color:var(--primary-text-color)}@media(max-width:700px){.grid,.ages{grid-template-columns:1fr 1fr}.top{align-items:flex-start;flex-direction:column}.tools{width:100%}.tools select{flex:1}}
      </style>
      <div class="top"><div class="title">${escapeHtml(this._config.title || t(this, "Zorgprogramma's", "Care programs"))}</div><div class="tools">${selector}${isAdmin ? `<button id="add-program"><ha-icon icon="mdi:plus"></ha-icon> ${escapeHtml(t(this, "Toevoegen", "Add"))}</button>` : ""}</div></div>
      <input class="search" id="program-search" type="search" value="${escapeHtml(this._query)}" placeholder="${escapeHtml(t(this, "Zoek zorgprogramma's", "Search care programs"))}" aria-label="${escapeHtml(t(this, "Zoek zorgprogramma's", "Search care programs"))}">
      ${overlaps ? `<div class="warning" role="status">${escapeHtml(t(this, "Let op: sommige zorgprogramma's overlappen op hetzelfde tijdstip.", "Some care programs overlap at the same time."))}</div>` : ""}
      ${list}${editor}${this._error ? `<div class="error">${escapeHtml(this._error)}</div>` : ""}
      </ha-card>`;

    this.shadowRoot.getElementById("litter-select")?.addEventListener("change", async (event) => {
      this._selectedLitterId = event.target.value;
      this._showEditor = false;
      this._editing = null;
      await this._loadCurrent();
    });
    this.shadowRoot.getElementById("add-program")?.addEventListener("click", () => {
      this._editing = null;
      this._showEditor = true;
      this._render();
    });
    this.shadowRoot.getElementById("program-search")?.addEventListener("input", (event) => {
      this._query = event.target.value || "";
      this._render();
    });
    this.shadowRoot.querySelectorAll(".edit").forEach((button) => button.addEventListener("click", () => {
      this._editing = this._programs.find((item) => item.id === button.dataset.id) || null;
      this._showEditor = true;
      this._render();
    }));
    this.shadowRoot.getElementById("cancel-program")?.addEventListener("click", () => {
      this._showEditor = false;
      this._editing = null;
      this._error = "";
      this._render();
    });
    this.shadowRoot.getElementById("save-program")?.addEventListener("click", () => this._save());
    this.shadowRoot.getElementById("delete-program")?.addEventListener("click", () => this._delete(this._editing?.id));
    const syncSchedule = () => {
      const range = this.shadowRoot.getElementById("care-schedule-type")?.value === "range";
      this.shadowRoot.querySelectorAll(".range-field").forEach((node) => { node.style.display = range ? "grid" : "none"; });
    };
    this.shadowRoot.getElementById("care-schedule-type")?.addEventListener("change", syncSchedule);
    syncSchedule();
  }
}

if (!customElements.get(TAG)) customElements.define(TAG, PuppyTrackerCareProgramCard);
window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === TAG)) {
  window.customCards.push({
    type: TAG,
    name: "Puppy Tracker Care Programs",
    description: "Manage litter-specific age-based puppy care programs.",
  });
}
