import {
  DOMAIN,
  escapeHtml,
  fetchLitterData,
  fetchLitters,
  fetchRecords,
  formatDateTime,
  languageForHass,
  selectDefaultLitter,
  subscribeUpdates,
} from "./puppy-tracker-card-common.js";

const TIMELINE_TYPES = [
  "weight",
  "note",
  "temperature",
  "vaccination",
  "deworming",
  "medication",
  "test",
  "vet_visit",
  "milestone",
  "other",
];

const TYPE_META = {
  weight: { icon: "mdi:scale", en: "Weight", nl: "Gewicht" },
  note: { icon: "mdi:note-text-outline", en: "Note", nl: "Notitie" },
  temperature: { icon: "mdi:thermometer", en: "Temperature", nl: "Temperatuur" },
  vaccination: { icon: "mdi:needle", en: "Vaccination", nl: "Vaccinatie" },
  deworming: { icon: "mdi:pill", en: "Deworming", nl: "Ontworming" },
  medication: { icon: "mdi:medical-bag", en: "Medication", nl: "Medicatie" },
  test: { icon: "mdi:test-tube", en: "Test / result", nl: "Test / uitslag" },
  vet_visit: { icon: "mdi:doctor", en: "Veterinary visit", nl: "Dierenartsbezoek" },
  milestone: { icon: "mdi:flag-checkered", en: "Milestone", nl: "Mijlpaal" },
  other: { icon: "mdi:file-document-outline", en: "Other", nl: "Overig" },
};

const TEXT = {
  en: {
    title: "Timeline",
    description: "Combined weight and dossier history for a puppy or litter.",
    litter: "Litter",
    scope: "View",
    allLitter: "Whole litter",
    puppy: "Puppy",
    all: "All",
    from: "From",
    to: "To",
    history: "Show deleted / corrected history",
    noItems: "No timeline items match these filters.",
    loading: "Loading timeline...",
    loadFailed: "Timeline could not be loaded.",
    items: "items",
    showing: "Showing {shown} of {total} items",
    deleted: "Deleted",
    superseded: "Corrected",
    birthWeight: "Birth weight",
    weight: "Weight",
    litterEvent: "Litter event",
    clearDates: "Clear dates",
  },
  nl: {
    title: "Tijdlijn",
    description: "Gecombineerde gewichts- en dossierhistorie van een pup of nest.",
    litter: "Nest",
    scope: "Weergave",
    allLitter: "Hele nest",
    puppy: "Pup",
    all: "Alles",
    from: "Vanaf",
    to: "Tot en met",
    history: "Verwijderde / gecorrigeerde historie tonen",
    noItems: "Geen tijdlijnitems binnen deze filters.",
    loading: "Tijdlijn laden...",
    loadFailed: "Tijdlijn kon niet worden geladen.",
    items: "items",
    showing: "{shown} van {total} items getoond",
    deleted: "Verwijderd",
    superseded: "Gecorrigeerd",
    birthWeight: "Geboortegewicht",
    weight: "Gewicht",
    litterEvent: "Nestgebeurtenis",
    clearDates: "Datums wissen",
  },
};

function text(hass, key, replacements = {}) {
  const language = languageForHass(hass);
  const template = TEXT[language]?.[key] ?? TEXT.nl[key] ?? key;
  return Object.entries(replacements).reduce(
    (result, [name, value]) => result.replaceAll(`{${name}}`, String(value ?? "")),
    template,
  );
}

function typeLabel(hass, type) {
  const language = languageForHass(hass);
  const meta = TYPE_META[type];
  if (meta) return meta[language] || meta.nl;
  const label = String(type || "other").replaceAll("_", " ");
  return label ? label.charAt(0).toUpperCase() + label.slice(1) : TYPE_META.other[language];
}

function typeIcon(type) {
  return TYPE_META[type]?.icon || TYPE_META.other.icon;
}

function timestampValue(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizedRecordType(type) {
  const value = String(type || "other");
  return TIMELINE_TYPES.includes(value) ? value : "other";
}

function measurementEvent(measurement, puppy, statusOverride = null) {
  const status = statusOverride || measurement?.status || (
    measurement?.deleted ? "deleted" : measurement?.superseded_by ? "superseded" : "active"
  );
  return {
    id: `weight:${puppy?.id || "unknown"}:${measurement?.id || "unknown"}`,
    type: "weight",
    source: "measurement",
    occurred_at: measurement?.timestamp || measurement?.created_at || null,
    created_at: measurement?.created_at || measurement?.timestamp || null,
    puppy_id: puppy?.id || null,
    puppy_name: puppy?.name || null,
    scope: "puppy",
    title: measurement?.kind === "birth" ? "birth_weight" : "weight",
    note: measurement?.note || null,
    status,
    data: {
      weight: measurement?.weight ?? null,
      kind: measurement?.kind || null,
      correction_reason: measurement?.correction_reason || null,
      source_measurement_id: measurement?.source_measurement_id || null,
    },
  };
}

function recordEvent(record, puppy = null) {
  const type = normalizedRecordType(record?.type);
  return {
    id: `record:${record?.scope || (puppy ? "puppy" : "litter")}:${record?.id || "unknown"}`,
    type,
    source: "record",
    occurred_at: record?.occurred_at || record?.created_at || null,
    created_at: record?.created_at || record?.occurred_at || null,
    puppy_id: record?.puppy_id || puppy?.id || null,
    puppy_name: record?.puppy_name || puppy?.name || null,
    scope: record?.scope || (puppy ? "puppy" : "litter"),
    title: record?.title || null,
    note: record?.note || null,
    status: record?.deleted ? "deleted" : "active",
    data: record?.data && typeof record.data === "object" ? { ...record.data } : {},
    raw_type: record?.type || "other",
  };
}

export function buildTimelineEvents(litterData, options = {}) {
  const includeHistory = Boolean(options.includeHistory);
  const historyRecords = options.historyRecords || {};
  const historyMeasurements = options.historyMeasurements || {};
  const scope = options.scope || "litter";
  const puppyId = options.puppyId || null;
  const events = [];
  const puppies = Array.isArray(litterData?.puppies) ? litterData.puppies : [];

  const selectedPuppies = scope === "puppy"
    ? puppies.filter((puppy) => puppy.id === puppyId)
    : puppies;

  if (scope === "litter") {
    const litterRecords = includeHistory
      ? (historyRecords.__litter__ || [])
      : (litterData?.litter?.records || []);
    for (const record of litterRecords) events.push(recordEvent(record));
  }

  for (const puppy of selectedPuppies) {
    const measurements = includeHistory
      ? (historyMeasurements[puppy.id] || [])
      : (puppy.measurements || []);
    for (const measurement of measurements) {
      if (!includeHistory && (measurement?.deleted || measurement?.superseded_by)) continue;
      events.push(measurementEvent(measurement, puppy));
    }

    const records = includeHistory
      ? (historyRecords[puppy.id] || [])
      : (puppy.records || []);
    for (const record of records) events.push(recordEvent(record, puppy));
  }

  events.sort((left, right) => {
    const occurred = timestampValue(right.occurred_at) - timestampValue(left.occurred_at);
    if (occurred) return occurred;
    const created = timestampValue(right.created_at) - timestampValue(left.created_at);
    if (created) return created;
    return String(right.id).localeCompare(String(left.id));
  });

  return events;
}

export function filterTimelineEvents(events, options = {}) {
  const selectedTypes = new Set(options.types || TIMELINE_TYPES);
  const fromValue = options.from ? Date.parse(`${options.from}T00:00:00`) : null;
  const toValue = options.to ? Date.parse(`${options.to}T23:59:59.999`) : null;

  return (events || []).filter((event) => {
    if (!selectedTypes.has(event.type)) return false;
    const value = timestampValue(event.occurred_at);
    if (fromValue !== null && value < fromValue) return false;
    if (toValue !== null && value > toValue) return false;
    return true;
  });
}

function summarizeData(data) {
  if (!data || typeof data !== "object") return "";
  const preferredKeys = [
    "vaccine",
    "product",
    "active_ingredient",
    "dose",
    "amount",
    "unit",
    "result",
    "test_result",
    "clinic",
    "veterinarian",
    "diagnosis",
    "treatment",
    "category",
  ];
  const parts = [];
  for (const key of preferredKeys) {
    const value = data[key];
    if (value === null || value === undefined || value === "") continue;
    parts.push(String(value));
    if (parts.length >= 3) break;
  }
  return parts.join(" · ");
}

class PuppyTrackerTimelineCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass = null;
    this._config = {};
    this._litters = [];
    this._selectedLitterId = null;
    this._scope = "litter";
    this._selectedPuppyId = null;
    this._litterData = null;
    this._historyRecords = {};
    this._historyMeasurements = {};
    this._selectedTypes = new Set(TIMELINE_TYPES);
    this._from = "";
    this._to = "";
    this._showHistory = false;
    this._loading = false;
    this._error = "";
    this._unsubscribe = null;
    this._subscriptionPending = false;
    this._refreshing = false;
    this._refreshAgain = false;
  }

  static getStubConfig() {
    return {
      title: "",
      show_litter_selector: true,
      default_scope: "litter",
      max_items: 250,
      show_history_toggle: true,
    };
  }

  static getConfigForm() {
    return {
      schema: [
        { name: "title", selector: { text: {} } },
        { name: "show_litter_selector", selector: { boolean: {} } },
        {
          name: "default_scope",
          selector: {
            select: {
              options: [
                { value: "litter", label: "Litter" },
                { value: "puppy", label: "Puppy" },
              ],
              mode: "dropdown",
            },
          },
        },
        { name: "max_items", selector: { number: { min: 25, max: 500, step: 25, mode: "box" } } },
        { name: "show_history_toggle", selector: { boolean: {} } },
      ],
    };
  }

  setConfig(config) {
    this._config = {
      title: "",
      show_litter_selector: true,
      default_scope: "litter",
      max_items: 250,
      show_history_toggle: true,
      ...config,
    };
    this._selectedLitterId = config.litter_id || this._selectedLitterId;
    this._scope = config.puppy_id ? "puppy" : (config.default_scope === "puppy" ? "puppy" : "litter");
    this._selectedPuppyId = config.puppy_id || this._selectedPuppyId;
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._litters.length && !this._loading) this._loadInitial();
    else if (this.isConnected) this._subscribe();
  }

  connectedCallback() {
    if (!this._hass) return;
    if (!this._litters.length && !this._loading) this._loadInitial();
    else this._subscribe();
  }

  disconnectedCallback() {
    if (this._unsubscribe) Promise.resolve(this._unsubscribe()).catch(() => undefined);
    this._unsubscribe = null;
  }

  getCardSize() { return 8; }
  getGridOptions() { return { columns: 12, min_columns: 6 }; }

  get _canManageHistory() {
    return Boolean(this._litterData?.can_manage_measurements || this._litterData?.can_manage_records);
  }

  get _puppies() {
    return Array.isArray(this._litterData?.puppies) ? this._litterData.puppies : [];
  }

  async _loadInitial() {
    if (!this._hass || this._loading) return;
    this._loading = true;
    this._error = "";
    this._render();
    try {
      const response = await fetchLitters(this._hass);
      this._litters = response?.litters || [];
      this._selectedLitterId = selectDefaultLitter(
        this._litters,
        this._selectedLitterId || this._config.litter_id,
      );
      await this._loadData(false);
      await this._subscribe();
    } catch (error) {
      this._error = error?.message || text(this._hass, "loadFailed");
    } finally {
      this._loading = false;
      this._render();
    }
  }

  async _subscribe() {
    if (!this._hass || this._unsubscribe || this._subscriptionPending || !this.isConnected) return;
    this._subscriptionPending = true;
    try {
      this._unsubscribe = await subscribeUpdates(this._hass, () => this._queueRefresh());
    } catch (_error) {
      this._unsubscribe = null;
    } finally {
      this._subscriptionPending = false;
    }
  }

  async _queueRefresh() {
    if (!this._hass) return;
    if (this._refreshing) {
      this._refreshAgain = true;
      return;
    }
    this._refreshing = true;
    try {
      do {
        this._refreshAgain = false;
        await this._loadData(false);
      } while (this._refreshAgain);
      this._error = "";
    } catch (error) {
      this._error = error?.message || text(this._hass, "loadFailed");
    } finally {
      this._refreshing = false;
      this._render();
    }
  }

  async _loadData(render = true) {
    this._historyRecords = {};
    this._historyMeasurements = {};
    if (!this._selectedLitterId || !this._hass) {
      this._litterData = null;
      if (render) this._render();
      return;
    }

    this._litterData = await fetchLitterData(this._hass, this._selectedLitterId);
    const puppies = this._puppies;
    if (this._selectedPuppyId && !puppies.some((puppy) => puppy.id === this._selectedPuppyId)) {
      this._selectedPuppyId = null;
    }
    if (this._scope === "puppy" && !this._selectedPuppyId) {
      this._selectedPuppyId = this._config.puppy_id || puppies[0]?.id || null;
    }

    if (!this._canManageHistory) this._showHistory = false;
    if (this._showHistory) await this._loadHistory();
    if (render) this._render();
  }

  async _loadHistory() {
    const puppyIds = this._scope === "puppy"
      ? [this._selectedPuppyId].filter(Boolean)
      : this._puppies.map((puppy) => puppy.id);

    if (this._scope === "litter") {
      const litterRecords = await fetchRecords(this._hass, this._selectedLitterId, null, true);
      this._historyRecords.__litter__ = litterRecords?.records || [];
    }

    await Promise.all(puppyIds.map(async (puppyId) => {
      const [records, measurements] = await Promise.all([
        fetchRecords(this._hass, this._selectedLitterId, puppyId, true),
        this._hass.callWS({
          type: `${DOMAIN}/measurements`,
          litter_id: this._selectedLitterId,
          puppy_id: puppyId,
        }),
      ]);
      this._historyRecords[puppyId] = records?.records || [];
      this._historyMeasurements[puppyId] = measurements?.measurements || [];
    }));
  }

  async _selectLitter(value) {
    this._selectedLitterId = value;
    this._selectedPuppyId = null;
    this._loading = true;
    this._render();
    try {
      await this._loadData(false);
      this._error = "";
    } catch (error) {
      this._error = error?.message || text(this._hass, "loadFailed");
    } finally {
      this._loading = false;
      this._render();
    }
  }

  async _selectScope(value) {
    if (value === "__litter__") {
      this._scope = "litter";
      this._selectedPuppyId = null;
    } else {
      this._scope = "puppy";
      this._selectedPuppyId = value;
    }
    this._loading = true;
    this._render();
    try {
      await this._loadData(false);
      this._error = "";
    } catch (error) {
      this._error = error?.message || text(this._hass, "loadFailed");
    } finally {
      this._loading = false;
      this._render();
    }
  }

  async _toggleHistory(enabled) {
    this._showHistory = Boolean(enabled) && this._canManageHistory;
    this._loading = true;
    this._render();
    try {
      await this._loadData(false);
      this._error = "";
    } catch (error) {
      this._error = error?.message || text(this._hass, "loadFailed");
    } finally {
      this._loading = false;
      this._render();
    }
  }

  _toggleType(type) {
    if (type === "__all__") {
      const allSelected = TIMELINE_TYPES.every((item) => this._selectedTypes.has(item));
      this._selectedTypes = allSelected ? new Set() : new Set(TIMELINE_TYPES);
    } else if (this._selectedTypes.has(type)) {
      this._selectedTypes.delete(type);
    } else {
      this._selectedTypes.add(type);
    }
    this._render();
  }

  _timelineEvents() {
    return buildTimelineEvents(this._litterData, {
      scope: this._scope,
      puppyId: this._selectedPuppyId,
      includeHistory: this._showHistory,
      historyRecords: this._historyRecords,
      historyMeasurements: this._historyMeasurements,
    });
  }

  _filteredEvents() {
    return filterTimelineEvents(this._timelineEvents(), {
      types: [...this._selectedTypes],
      from: this._from,
      to: this._to,
    });
  }

  _renderEvent(event) {
    const label = typeLabel(this._hass, event.type);
    const isWeight = event.type === "weight";
    const title = isWeight
      ? (event.title === "birth_weight" ? text(this._hass, "birthWeight") : text(this._hass, "weight"))
      : (event.title || label);
    const weight = isWeight && event.data?.weight !== null && event.data?.weight !== undefined
      ? `${Number(event.data.weight).toLocaleString(languageForHass(this._hass) === "en" ? "en-US" : "nl-NL")} g`
      : "";
    const details = isWeight ? weight : summarizeData(event.data);
    const owner = event.scope === "litter"
      ? text(this._hass, "litterEvent")
      : (event.puppy_name || text(this._hass, "puppy"));
    const status = event.status === "deleted"
      ? `<span class="status deleted">${escapeHtml(text(this._hass, "deleted"))}</span>`
      : event.status === "superseded"
        ? `<span class="status superseded">${escapeHtml(text(this._hass, "superseded"))}</span>`
        : "";
    const note = event.note ? `<div class="note">${escapeHtml(event.note)}</div>` : "";
    const detailLine = details ? `<div class="details">${escapeHtml(details)}</div>` : "";

    return `
      <article class="timeline-item ${escapeHtml(event.status || "active")}" data-event-type="${escapeHtml(event.type)}">
        <div class="rail">
          <ha-icon icon="${escapeHtml(typeIcon(event.type))}"></ha-icon>
        </div>
        <div class="event-body">
          <div class="event-head">
            <div>
              <div class="event-title">${escapeHtml(title)}</div>
              <div class="meta">${escapeHtml(owner)} · ${escapeHtml(formatDateTime(event.occurred_at, "—", this._hass))}</div>
            </div>
            <div class="badges"><span class="type-badge">${escapeHtml(label)}</span>${status}</div>
          </div>
          ${detailLine}
          ${note}
        </div>
      </article>
    `;
  }

  _bindEvents() {
    this.shadowRoot?.getElementById("litter-select")?.addEventListener("change", (event) => {
      this._selectLitter(event.target.value);
    });
    this.shadowRoot?.getElementById("scope-select")?.addEventListener("change", (event) => {
      this._selectScope(event.target.value);
    });
    this.shadowRoot?.getElementById("history-toggle")?.addEventListener("change", (event) => {
      this._toggleHistory(event.target.checked);
    });
    this.shadowRoot?.getElementById("from-date")?.addEventListener("change", (event) => {
      this._from = event.target.value || "";
      this._render();
    });
    this.shadowRoot?.getElementById("to-date")?.addEventListener("change", (event) => {
      this._to = event.target.value || "";
      this._render();
    });
    this.shadowRoot?.getElementById("clear-dates")?.addEventListener("click", () => {
      this._from = "";
      this._to = "";
      this._render();
    });
    this.shadowRoot?.querySelectorAll("[data-filter-type]").forEach((button) => {
      button.addEventListener("click", () => this._toggleType(button.dataset.filterType));
    });
  }

  _render() {
    if (!this.shadowRoot) return;
    const title = this._config.title || text(this._hass, "title");
    const scopeValue = this._scope === "litter" ? "__litter__" : (this._selectedPuppyId || "__litter__");
    const allSelected = this._selectedTypes.size === TIMELINE_TYPES.length;
    const events = this._filteredEvents();
    const maxItems = Math.max(25, Math.min(500, Number(this._config.max_items) || 250));
    const visible = events.slice(0, maxItems);

    const litterSelector = this._config.show_litter_selector !== false
      ? `<label class="field"><span>${escapeHtml(text(this._hass, "litter"))}</span><select id="litter-select">
          ${(this._litters || []).map((litter) => `<option value="${escapeHtml(litter.id)}" ${litter.id === this._selectedLitterId ? "selected" : ""}>${escapeHtml(litter.name || litter.id)}</option>`).join("")}
        </select></label>`
      : "";

    const scopeSelector = `<label class="field"><span>${escapeHtml(text(this._hass, "scope"))}</span><select id="scope-select">
      <option value="__litter__" ${scopeValue === "__litter__" ? "selected" : ""}>${escapeHtml(text(this._hass, "allLitter"))}</option>
      ${this._puppies.map((puppy) => `<option value="${escapeHtml(puppy.id)}" ${scopeValue === puppy.id ? "selected" : ""}>${escapeHtml(puppy.name || puppy.id)}</option>`).join("")}
    </select></label>`;

    const historyToggle = this._config.show_history_toggle !== false && this._canManageHistory
      ? `<label class="history"><input id="history-toggle" type="checkbox" ${this._showHistory ? "checked" : ""}> ${escapeHtml(text(this._hass, "history"))}</label>`
      : "";

    const filters = [
      `<button type="button" class="chip ${allSelected ? "active" : ""}" data-filter-type="__all__">${escapeHtml(text(this._hass, "all"))}</button>`,
      ...TIMELINE_TYPES.map((type) => `<button type="button" class="chip ${this._selectedTypes.has(type) ? "active" : ""}" data-filter-type="${type}"><ha-icon icon="${escapeHtml(typeIcon(type))}"></ha-icon>${escapeHtml(typeLabel(this._hass, type))}</button>`),
    ].join("");

    let content = "";
    if (this._loading && !this._litterData) {
      content = `<div class="state">${escapeHtml(text(this._hass, "loading"))}</div>`;
    } else if (this._error) {
      content = `<div class="state error">${escapeHtml(this._error)}</div>`;
    } else if (!visible.length) {
      content = `<div class="state">${escapeHtml(text(this._hass, "noItems"))}</div>`;
    } else {
      content = visible.map((event) => this._renderEvent(event)).join("");
    }

    const countText = events.length > visible.length
      ? text(this._hass, "showing", { shown: visible.length, total: events.length })
      : `${events.length} ${text(this._hass, "items")}`;

    this.shadowRoot.innerHTML = `
      <ha-card>
        <div class="card-header">
          <div><div class="title">${escapeHtml(title)}</div><div class="subtitle">${escapeHtml(text(this._hass, "description"))}</div></div>
          <span class="count">${escapeHtml(countText)}</span>
        </div>
        <div class="controls">
          <div class="selectors">${litterSelector}${scopeSelector}</div>
          <div class="filter-row">${filters}</div>
          <div class="dates">
            <label class="field"><span>${escapeHtml(text(this._hass, "from"))}</span><input id="from-date" type="date" value="${escapeHtml(this._from)}"></label>
            <label class="field"><span>${escapeHtml(text(this._hass, "to"))}</span><input id="to-date" type="date" value="${escapeHtml(this._to)}"></label>
            <button id="clear-dates" type="button" class="text-button">${escapeHtml(text(this._hass, "clearDates"))}</button>
          </div>
          ${historyToggle}
        </div>
        ${this._loading && this._litterData ? `<div class="refreshing">${escapeHtml(text(this._hass, "loading"))}</div>` : ""}
        <div class="timeline">${content}</div>
      </ha-card>
      <style>
        :host { display: block; }
        ha-card { overflow: hidden; }
        .card-header { display:flex; justify-content:space-between; gap:16px; align-items:flex-start; padding:20px 20px 12px; }
        .title { font-size:1.25rem; font-weight:600; }
        .subtitle { margin-top:3px; color:var(--secondary-text-color); font-size:.9rem; }
        .count { white-space:nowrap; color:var(--secondary-text-color); font-size:.85rem; padding-top:4px; }
        .controls { padding:0 20px 14px; border-bottom:1px solid var(--divider-color); display:grid; gap:12px; }
        .selectors, .dates { display:flex; gap:12px; align-items:end; flex-wrap:wrap; }
        .field { display:grid; gap:4px; min-width:150px; color:var(--secondary-text-color); font-size:.82rem; }
        select, input[type="date"] { box-sizing:border-box; min-height:40px; border:1px solid var(--divider-color); border-radius:8px; padding:8px 10px; background:var(--card-background-color); color:var(--primary-text-color); font:inherit; }
        .filter-row { display:flex; flex-wrap:wrap; gap:6px; }
        .chip { display:inline-flex; align-items:center; gap:5px; border:1px solid var(--divider-color); border-radius:999px; background:transparent; color:var(--primary-text-color); padding:6px 9px; cursor:pointer; }
        .chip.active { background:var(--primary-color); color:var(--text-primary-color, #fff); border-color:var(--primary-color); }
        .chip ha-icon { --mdc-icon-size:16px; }
        .history { color:var(--secondary-text-color); font-size:.88rem; display:flex; align-items:center; gap:7px; }
        .text-button { border:0; background:transparent; color:var(--primary-color); cursor:pointer; padding:9px 4px; }
        .refreshing { padding:7px 20px; color:var(--secondary-text-color); font-size:.82rem; }
        .timeline { padding:6px 20px 18px; }
        .timeline-item { display:grid; grid-template-columns:34px minmax(0,1fr); gap:10px; position:relative; padding:10px 0; }
        .timeline-item:not(:last-child)::before { content:""; position:absolute; left:16px; top:38px; bottom:-10px; width:1px; background:var(--divider-color); }
        .rail { width:32px; height:32px; border-radius:50%; display:grid; place-items:center; background:var(--secondary-background-color); z-index:1; }
        .rail ha-icon { --mdc-icon-size:18px; color:var(--primary-color); }
        .event-body { min-width:0; padding-top:1px; }
        .event-head { display:flex; justify-content:space-between; gap:12px; }
        .event-title { font-weight:600; overflow-wrap:anywhere; }
        .meta, .details, .note { margin-top:3px; color:var(--secondary-text-color); font-size:.86rem; overflow-wrap:anywhere; }
        .details { color:var(--primary-text-color); }
        .badges { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:5px; align-items:flex-start; }
        .type-badge, .status { border-radius:999px; padding:3px 7px; font-size:.72rem; white-space:nowrap; background:var(--secondary-background-color); }
        .status.deleted { color:var(--error-color); }
        .status.superseded { color:var(--warning-color, #e6a700); }
        .timeline-item.deleted, .timeline-item.superseded { opacity:.72; }
        .state { padding:28px 4px; text-align:center; color:var(--secondary-text-color); }
        .state.error { color:var(--error-color); }
        @media (max-width: 600px) {
          .card-header { padding:16px 14px 10px; display:block; }
          .count { display:block; margin-top:6px; }
          .controls { padding:0 14px 12px; }
          .selectors, .dates { display:grid; grid-template-columns:1fr; }
          .field { min-width:0; width:100%; }
          .timeline { padding:4px 14px 14px; }
          .event-head { display:block; }
          .badges { justify-content:flex-start; margin-top:6px; }
        }
      </style>
    `;
    this._bindEvents();
  }
}

if (!customElements.get("puppy-tracker-timeline-card")) {
  customElements.define("puppy-tracker-timeline-card", PuppyTrackerTimelineCard);
}
window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === "puppy-tracker-timeline-card")) {
  window.customCards.push({
    type: "puppy-tracker-timeline-card",
    name: "Puppy Tracker Timeline",
    description: "Combined weight and dossier timeline with filters.",
  });
}
