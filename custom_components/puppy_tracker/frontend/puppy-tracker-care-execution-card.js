import { escapeHtml, fetchLitters, languageForHass, puppyDisplayLabel, requestLitterChange, selectDefaultLitter, subscribeUpdates } from "./puppy-tracker-card-common.js";
import { openCareResultEditor, renderCareSaveFeedback } from "./puppy-tracker-care-result-editor.js";
import { renderCareSkippedWarning } from "./puppy-tracker-care-surfaces.js";

const TAG = "puppy-tracker-care-execution-card";
function t(card, nl, en) { return languageForHass(card?._hass) === "en" ? en : nl; }

class PuppyTrackerCareExecutionCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass = null;
    this._config = {};
    this._litters = [];
    this._selectedLitterId = null;
    this._scheduledOccurrences = [];
    this._careContext = null;
    this.__careSkipped = [];
    this._loading = false;
    this._error = "";
    this._selectedDate = null;
    this._selectedDayExplicit = false;
    this._unsubscribe = null;
    this._subscriptionPending = false;
    this._refreshing = false;
    this._refreshAgain = false;
    this._refreshDeferred = false;
    this._occurrenceRequest = 0;
  }

  static getStubConfig() { return { title: "", show_litter_selector: true, show_day_selector: true, max_items: 50, days_ahead: 14 }; }
  static getConfigForm() { return { schema: [
    { name: "title", selector: { text: {} } },
    { name: "show_litter_selector", selector: { boolean: {} } },
    { name: "show_day_selector", selector: { boolean: {} } },
    { name: "max_items", selector: { number: { min: 5, max: 200, step: 5, mode: "box" } } },
    { name: "days_ahead", selector: { number: { min: 0, max: 365, step: 1, mode: "box" } } },
  ] }; }

  setConfig(config) {
    const previousDays = this._config.days_ahead;
    const litterId = config.litter_id || this._selectedLitterId;
    this._config = { ...PuppyTrackerCareExecutionCard.getStubConfig(), ...config };
    if (this._hass && litterId !== this._selectedLitterId) {
      this._selectLitter(litterId);
      return;
    }
    this._selectedLitterId = litterId;
    if (this._hass && Number(previousDays) !== Number(this._config.days_ahead)) this._queueRefresh();
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._litters.length) this._load();
    else {
      this._ensureSubscription();
      if (this._renderLanguage !== languageForHass(hass) || this._renderAdmin !== (hass?.user?.is_admin !== false)) this._render();
    }
  }

  connectedCallback() {
    if (!this._hass) return;
    if (!this._litters.length) this._load();
    else {
      this._ensureSubscription();
      this._queueRefresh();
    }
  }

  disconnectedCallback() {
    const unsubscribe = this._unsubscribe;
    this._unsubscribe = null;
    if (unsubscribe) Promise.resolve(unsubscribe()).catch(() => undefined);
  }

  getCardSize() { return 6; }
  getGridOptions() { return { columns: 12, min_columns: 6 }; }

  async _load() {
    if (!this._hass || this._loading) return;
    this._loading = true;
    try {
      const response = await fetchLitters(this._hass);
      this._litters = response?.litters || [];
      this._selectedLitterId = selectDefaultLitter(this._litters, this._selectedLitterId || this._config.litter_id);
      await this._loadOccurrences();
      await this._ensureSubscription();
      this._error = "";
    } catch (error) { this._error = error?.message || t(this, "Zorgacties konden niet worden geladen.", "Care actions could not be loaded."); }
    this._loading = false;
    this._render();
  }

  async _loadOccurrences() {
    const request = ++this._occurrenceRequest;
    const litterId = this._selectedLitterId;
    if (!litterId) { this._scheduledOccurrences = []; this._careContext = null; this.__careSkipped = []; return; }
    const response = await this._hass.callWS({ type: "puppy_tracker/care_occurrences", litter_id: litterId });
    if (request !== this._occurrenceRequest || litterId !== this._selectedLitterId) return;
    const maxDays = Number(this._config.days_ahead);
    this._scheduledOccurrences = (response?.occurrences || [])
      .filter((item) => item?.status !== "upcoming" || maxDays < 0 || Number(item.days_until_due) <= maxDays);
    this._careContext = response?.context || null;
    this.__careSkipped = response?.skipped || [];
    this._ensureSelectedDate();
  }

  async _selectLitter(id) {
    this._selectedLitterId = id;
    this._selectedDate = null;
    this._selectedDayExplicit = false;
    this._scheduledOccurrences = [];
    this._careContext = null;
    this.__careSkipped = [];
    this._careSaveMessage = "";
    this._savedRecord = null;
    this._litterData = null;
    this._loading = true;
    this._render();
    try { await this._loadOccurrences(); this._error = ""; }
    catch (error) { this._error = error?.message || t(this, "Zorgacties konden niet worden geladen.", "Care actions could not be loaded."); }
    this._loading = false;
    this._render();
  }

  async _ensureSubscription() {
    if (!this._hass || !this.isConnected || this._unsubscribe || this._subscriptionPending) return;
    this._subscriptionPending = true;
    try {
      this._unsubscribe = await subscribeUpdates(this._hass, () => this._queueRefresh(), this);
    } catch (_error) {
      this._unsubscribe = null;
    } finally {
      this._subscriptionPending = false;
    }
  }

  async _queueRefresh() {
    if (!this._hass || !this._selectedLitterId || !this.isConnected) return;
    if (this.__careResultEditorOpen) { this._refreshDeferred = true; return; }
    if (this._refreshing) { this._refreshAgain = true; return; }
    this._refreshing = true;
    try {
      do {
        this._refreshAgain = false;
        await this._loadOccurrences();
      } while (this._refreshAgain);
      this._error = "";
    } catch (error) {
      this._error = error?.message || t(this, "Zorgacties konden niet worden vernieuwd.", "Care actions could not be refreshed.");
    } finally {
      this._refreshing = false;
      this._render();
    }
  }

  _openResult(item, initialStatus = "completed") {
    openCareResultEditor(this, item, {
      initialStatus,
      onSaved: async () => {
        this._refreshDeferred = false;
        try { await this._loadOccurrences(); this._error = ""; }
        catch (error) { this._error = error?.message || t(this, "Zorgacties konden niet worden vernieuwd.", "Care actions could not be refreshed."); }
        this._render();
      },
      onClosed: ({ saved }) => {
        if (!saved && this._refreshDeferred) {
          this._refreshDeferred = false;
          this._queueRefresh();
        }
      },
    });
  }

  _today() {
    if (this._careContext?.today) return this._careContext.today;
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }

  _dateOptions() {
    const dates = new Set(this._scheduledOccurrences.map((item) => String(item?.scheduled_date || "").slice(0, 10)).filter(Boolean));
    dates.add(this._today());
    if (this._selectedDate) dates.add(this._selectedDate);
    return [...dates].sort();
  }

  _ensureSelectedDate() {
    if (!this._selectedDate || !this._selectedDayExplicit) this._selectedDate = this._today();
  }

  get _occurrences() {
    return this._scheduledOccurrences.filter((item) => !["completed", "missed"].includes(item?.status));
  }

  _emptyState() {
    if (this._loading || this._error || this.__careSkipped.length) return null;
    const action = (key, nl, en) => this._hass?.user?.is_admin === true && this.workspaceActions?.[key]
      ? { action: key, label: t(this, nl, en) } : {};
    if (!this._selectedLitterId) return { message: t(this, "Nog geen nest beschikbaar.", "No litter available yet."), ...action("settings", "Nest aanmaken", "Create a litter") };
    if (this._careContext?.program_count === 0) return { message: t(this, "Nog geen zorgprogramma's voor dit nest.", "No care programs for this litter yet."), ...action("programs", "Zorgprogramma toevoegen", "Add care program") };
    if (this._careContext?.enabled_program_count === 0) return { message: t(this, "Alle zorgprogramma's voor dit nest staan uit.", "All care programs for this litter are disabled."), ...action("programs", "Zorgprogramma's beheren", "Manage care programs") };
    if (this._careContext?.active_puppy_count === 0) return { message: t(this, "Er zijn geen actieve pups in dit nest.", "There are no active puppies in this litter."), ...action("settings", "Pups beheren", "Manage puppies") };
    const byDay = this._config.show_day_selector !== false;
    const scheduled = byDay ? this._scheduledOccurrences.filter((item) => item.scheduled_date === this._selectedDate) : this._scheduledOccurrences;
    if (scheduled.length && scheduled.every((item) => ["completed", "missed"].includes(item.status))) {
      const missed = scheduled.filter((item) => item.status === "missed").length;
      return { message: missed
        ? t(this, `Geen openstaande zorgacties; ${missed} als gemist geregistreerd.`, `No open care actions; ${missed} recorded as missed.`)
        : byDay ? t(this, "Alle zorg voor deze dag is uitgevoerd.", "All care for this day is completed.") : t(this, "Alle zorg in dit overzicht is uitgevoerd.", "All care in this overview is completed.") };
    }
    const pendingDates = [...new Set(this._occurrences.map((item) => item.scheduled_date))].filter(Boolean).sort();
    const nextDate = pendingDates.find((date) => date > this._selectedDate) || pendingDates[0];
    return { message: this._careContext
      ? byDay ? t(this, "Geen zorg gepland op deze dag.", "No care scheduled for this day.") : t(this, "Geen zorg gepland in dit overzicht.", "No care scheduled in this overview.")
      : t(this, "Geen openstaande zorgacties.", "No open care actions."),
    ...(byDay && nextDate ? { action: "date", date: nextDate, label: t(this, "Toon dag met openstaande zorg", "Show day with pending care") } : {}) };
  }

  _matchingOccurrences() {
    if (this._config.show_day_selector === false) return this._occurrences;
    return this._occurrences.filter((item) => String(item?.scheduled_date || "").slice(0, 10) === this._selectedDate);
  }

  _pageSize() { return Math.max(5, Math.min(200, Number(this._config.max_items) || 50)); }

  _visibleOccurrences() {
    return this._matchingOccurrences().slice(0, this._visibleLimit || this._pageSize());
  }

  _formatDate(date) {
    const value = new Date(`${date}T12:00:00`);
    return Number.isFinite(value.getTime())
      ? value.toLocaleDateString(languageForHass(this._hass) === "en" ? "en-GB" : "nl-NL", { weekday: "short", day: "numeric", month: "short" }) : date;
  }

  _ensureView() {
    if (this.shadowRoot.querySelector("ha-card")) return;
    this.shadowRoot.innerHTML = `<ha-card>
      <div class="head"><div><div class="title"></div><div class="sub"></div></div><div class="selectors"></div></div>
      <div class="error" role="alert" hidden></div><div class="state" role="status" hidden></div>
      <div class="rows" tabindex="-1"></div>
      <div class="list-footer" hidden><span role="status"></span><button id="show-more" type="button"><ha-icon icon="mdi:chevron-down"></ha-icon><span></span></button></div>
    </ha-card><style>:host{display:block}ha-card{display:block;padding:18px;container-type:inline-size;container-name:care-execution}.head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.title{font-size:1.25rem;font-weight:700}.sub,span,small{color:var(--secondary-text-color)}.selectors,.day-controls{display:flex;gap:6px;align-items:center}.selectors{justify-content:flex-end;flex-wrap:wrap}select{min-height:38px;max-width:48%;background:var(--card-background-color);color:var(--primary-text-color)}.day-controls select{max-width:145px}.day-controls button{min-width:38px;min-height:38px;border:1px solid var(--divider-color);border-radius:8px;background:var(--secondary-background-color);color:var(--primary-text-color);font-size:20px;cursor:pointer}.day-controls button:disabled{opacity:.4;cursor:default}.rows{max-height:60vh;overflow-y:auto;overscroll-behavior:contain;overflow-anchor:none;scrollbar-gutter:stable;padding-right:3px}.row{display:flex;justify-content:space-between;gap:12px;margin-top:10px;padding:12px;border:1px solid var(--divider-color);border-radius:10px}.main{min-width:0;display:grid;gap:4px}.main strong{font-size:1rem}.main span{font-size:.85rem}.main small{white-space:pre-wrap;overflow-wrap:anywhere}.danger{border-color:var(--error-color)}.warning{border-color:var(--warning-color,var(--primary-color))}.actions{display:flex;gap:6px;align-items:center}.actions button{border:0;border-radius:8px;padding:8px 10px;background:var(--primary-color);color:var(--text-primary-color,#fff);cursor:pointer}.actions .secondary{background:var(--secondary-background-color);color:var(--primary-text-color)}.empty,.state,.error{margin-top:14px}.error{color:var(--error-color)}@container care-execution (max-width:600px){.head{display:grid}.selectors{justify-content:flex-start}.selectors>select{max-width:none;width:100%}.day-controls{width:100%}.day-controls select{max-width:none;flex:1}.row{display:grid}.actions{justify-content:flex-start;flex-wrap:wrap}}.list-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:12px;font-size:.85rem;color:var(--secondary-text-color)}.list-footer button{display:inline-flex;align-items:center;gap:6px;min-height:40px;padding:8px 12px;border:1px solid var(--divider-color);border-radius:8px;background:var(--secondary-background-color);color:var(--primary-text-color);font:inherit;cursor:pointer}[hidden]{display:none!important}.empty p{margin:0 0 10px}.empty button{min-height:44px;padding:8px 12px;border:1px solid var(--divider-color);border-radius:8px;background:var(--secondary-background-color);color:var(--primary-text-color);font:inherit;cursor:pointer}</style>`;
    this.shadowRoot.addEventListener("change", (event) => {
      if (event.target.id === "litter-select") {
        if (requestLitterChange(this, event.target.value)) this._selectLitter(event.target.value);
        else event.target.value = this._selectedLitterId;
      } else if (event.target.id === "day-select") {
        this._selectedDate = event.target.value;
        this._selectedDayExplicit = true;
        this._render();
      }
    });
    this.shadowRoot.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (button?.dataset.emptyAction) {
        const state = this._emptyState();
        if (state?.action === "date") { this._selectedDate = state.date; this._selectedDayExplicit = true; this._render(); }
        else if (state?.action && this._hass?.user?.is_admin === true) this.workspaceActions?.[state.action]?.();
        return;
      }
      if (button?.id === "show-more") {
        this._visibleLimit += this._pageSize();
        this._render();
        if (button.hidden) this.shadowRoot.querySelector(".rows").focus({ preventScroll: true });
        return;
      }
      if (["previous-day", "next-day"].includes(button?.id)) {
        const dates = this._dateOptions();
        const index = dates.indexOf(this._selectedDate) + (button.id === "next-day" ? 1 : -1);
        if (dates[index]) { this._selectedDate = dates[index]; this._selectedDayExplicit = true; this._render(); }
        return;
      }
      const row = event.target.closest(".row[data-care-occurrence]");
      if (!row || this._hass?.user?.is_admin === false || event.target.closest(".care-result-overlay")) return;
      const item = this._occurrences.find((candidate) => candidate.id === row.dataset.careOccurrence);
      if (item) this._openResult(item, button?.dataset.action || "completed");
    });
  }

  _render() {
    if (this.__careResultEditorOpen) { this._refreshDeferred = true; return; }
    this._ensureSelectedDate();
    this._ensureView();
    this._renderLanguage = languageForHass(this._hass);
    this._renderAdmin = this._hass?.user?.is_admin !== false;
    const root = this.shadowRoot;
    root.querySelector(".title").textContent = this._config.title || t(this, "Zorg uitvoeren", "Carry out care");
    root.querySelector(".sub").textContent = t(this, "Los van Aandacht en Vandaag", "Independent of Attention and Today");
    const dates = this._dateOptions();
    const selectedIndex = dates.indexOf(this._selectedDate);
    const showLitter = this._config.show_litter_selector !== false && this._litters.length > 1;
    const showDay = this._config.show_day_selector !== false;
    const selectorsKey = JSON.stringify([this._renderLanguage, showLitter, this._litters, showDay, dates]);
    if (selectorsKey !== this._selectorsKey) {
      const activeId = root.activeElement?.id;
      root.querySelector(".selectors").innerHTML = `${showLitter ? `<select id="litter-select" aria-label="${escapeHtml(t(this, "Nest", "Litter"))}">${this._litters.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name || t(this, "Nest", "Litter"))}</option>`).join("")}</select>` : ""}${showDay ? `<div class="day-controls"><button id="previous-day" type="button" title="${escapeHtml(t(this, "Vorige dag", "Previous day"))}">‹</button><select id="day-select" aria-label="${escapeHtml(t(this, "Dag", "Day"))}">${dates.map((date) => `<option value="${escapeHtml(date)}">${escapeHtml(this._formatDate(date))}</option>`).join("")}</select><button id="next-day" type="button" title="${escapeHtml(t(this, "Volgende dag", "Next day"))}">›</button></div>` : ""}`;
      this._selectorsKey = selectorsKey;
      if (activeId) root.getElementById(activeId)?.focus({ preventScroll: true });
    }
    for (const [id, value] of [["litter-select", this._selectedLitterId], ["day-select", this._selectedDate]]) {
      const select = root.getElementById(id);
      if (select) { select.value = value || ""; select.disabled = this._loading; }
    }
    const previous = root.getElementById("previous-day");
    const next = root.getElementById("next-day");
    if (previous) previous.disabled = this._loading || selectedIndex <= 0;
    if (next) next.disabled = this._loading || selectedIndex >= dates.length - 1;
    const error = root.querySelector(".error");
    error.textContent = this._error;
    error.hidden = !this._error;
    const loading = root.querySelector(".state");
    loading.textContent = t(this, "Laden…", "Loading…");
    loading.hidden = !this._loading;

    const context = JSON.stringify([this._selectedLitterId, showDay, this._selectedDate, this._pageSize()]);
    const list = root.querySelector(".rows");
    const scrollTop = context === this._viewContext ? list.scrollTop : 0;
    if (context !== this._viewContext) this._visibleLimit = this._pageSize();
    this._viewContext = context;
    const matching = this._matchingOccurrences();
    const visible = this._visibleOccurrences();
    const existing = new Map([...list.querySelectorAll(".row")].map((row) => [row.dataset.careOccurrence, row]));
    const focused = root.activeElement;
    const focusedIndex = [...list.children].findIndex((row) => row.contains(focused));
    const seen = new Set();
    visible.forEach((item, index) => {
      const row = existing.get(item.id) || document.createElement("div");
      row.className = `row ${item.status === "overdue" ? "danger" : item.status === "due_today" ? "warning" : ""}`;
      row.dataset.careOccurrence = item.id;
      const markup = `<div class="main"><strong>${escapeHtml(item.title || t(this, "Zorgactie", "Care action"))}</strong><span>${escapeHtml(puppyDisplayLabel(this, item.puppy_id, item.puppy_name || t(this, "Pup", "Puppy"), item.collar_color))} · ${escapeHtml(item.scheduled_date || "")} · ${escapeHtml(item.status === "overdue" ? t(this, "Te laat", "Overdue") : item.status === "due_today" ? t(this, "Vandaag", "Today") : t(this, `Over ${item.days_until_due} dagen`, `In ${item.days_until_due} days`))}</span>${item.instructions ? `<small>${escapeHtml(item.instructions)}</small>` : ""}</div><div class="actions"><button data-action="completed" data-id="${escapeHtml(item.id)}" ${this._renderAdmin ? "" : "disabled"}>${escapeHtml(t(this, "Uitgevoerd", "Completed"))}</button><button class="secondary" data-action="missed" data-id="${escapeHtml(item.id)}" ${this._renderAdmin ? "" : "disabled"}>${escapeHtml(t(this, "Gemist", "Missed"))}</button></div>`;
      if (row._markup !== markup) { row.innerHTML = markup; row._markup = markup; }
      if (list.children[index] !== row) list.insertBefore(row, list.children[index] || null);
      seen.add(item.id);
    });
    for (const [id, row] of existing) if (!seen.has(id)) row.remove();
    let empty = list.querySelector(".empty");
    const emptyState = !visible.length ? this._emptyState() : null;
    if (emptyState) {
      if (!empty) { empty = document.createElement("div"); empty.className = "empty"; list.append(empty); }
      const markup = `<p role="status">${escapeHtml(emptyState.message)}</p>${emptyState.action ? `<button type="button" data-empty-action="${emptyState.action}">${escapeHtml(emptyState.label)}</button>` : ""}`;
      if (empty._markup !== markup) { empty.innerHTML = markup; empty._markup = markup; }
    } else empty?.remove();
    list.scrollTop = scrollTop;
    if (focusedIndex >= 0 && focused && !focused.isConnected) {
      (list.children[Math.min(focusedIndex, list.children.length - 1)]?.querySelector("button") || list).focus({ preventScroll: true });
    }
    const footer = root.querySelector(".list-footer");
    footer.hidden = !matching.length;
    footer.querySelector("span").textContent = t(this, `${visible.length} van ${matching.length} zorgacties`, `${visible.length} of ${matching.length} care actions`);
    const more = root.getElementById("show-more");
    more.hidden = visible.length >= matching.length;
    more.querySelector("span").textContent = t(this, "Meer tonen", "Show more");
    const skippedKey = JSON.stringify([this._renderLanguage, this.__careSkipped]);
    if (skippedKey !== this._skippedKey) { renderCareSkippedWarning(this); this._skippedKey = skippedKey; }
    const feedbackKey = JSON.stringify([this._careSaveMessage, this._savedRecord, this._renderAdmin, this._litterData?.can_manage_records]);
    if (feedbackKey !== this._feedbackKey) { renderCareSaveFeedback(this); this._feedbackKey = feedbackKey; }
  }
}

if (!customElements.get(TAG)) customElements.define(TAG, PuppyTrackerCareExecutionCard);
