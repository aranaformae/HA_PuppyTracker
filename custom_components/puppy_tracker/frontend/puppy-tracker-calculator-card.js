import {
  escapeHtml,
  puppySelectorLabel,
  fetchLitterData,
  fetchLitters,
  formatDateTime,
  formatHoursSince,
  formatWeight,
  languageForHass,
  loadCardState,
  requestLitterChange,
  selectDefaultLitter,
  saveCardState,
  subscribeUpdates,
} from "./puppy-tracker-card-common.js";
import { collarColor } from "./puppy-tracker-collar-chart-colors.js";
import { calculateFeedingForWeight, feedingSchedule, feedingSettingsFromStored, feedingSettingsForStorage } from "./puppy-tracker-feeding-calculator.js";

const TEXT = {
  nl: {
    title: "Rekentool per kg",
    subtitle: "Rekent met het laatste pupgewicht; de ingevoerde hoeveelheid blijft jouw keuze.",
    litter: "Nest",
    amountPerKg: "Hoeveelheid per kg",
    unit: "Eenheid",
    unitPlaceholder: "Bijvoorbeeld ml, mg of g",
    puppies: "Pups",
    latestWeight: "Gebruikt gewicht",
    required: "Benodigd",
    total: "Totaal voor berekende pups",
    enterAmount: "Vul een hoeveelheid groter dan nul in.",
    noWeight: "Geen geldige weging",
    staleWeight: "Oud gewicht",
    inactive: "Inactief",
    noPuppies: "Geen pups om te berekenen.",
    loading: "Laden...",
    loadFailed: "Rekentoolgegevens konden niet worden geladen.",
    refreshFailed: "Nieuwe gewichtsgegevens konden niet worden geladen.",
    calculatedPuppy: "1 pup berekend",
    calculatedPuppies: "{count} pups berekend",
    perKg: "Per kg", feeding: "Voeding", feedingTitle: "Voeding per pup",
    feedingSubtitle: "Brokken en vlees", method: "Rekenmethode",
    tableFormula: "Tabel", linearFormula: "Berekening", fixedFormula: "Vaste g/kg-waarde",
    coefficient: "Gram per kg (factor)", offset: "Vaste hoeveelheid (g/dag)", minWeight: "Minimumgewicht (kg)", maxWeight: "Maximumgewicht (kg)",
    tableWeight: "Gewicht (kg)", tableGrams: "Volledig dagrantsoen (g)", addRow: "Rij toevoegen", removeRow: "Rij verwijderen", foodSettings: "{food}: instellingen", fixedRate: "Gram per kg per dag",
    meatShare: "Aandeel vlees", ratio: "{meat}% vlees / {kibble}% brokken",

    kibblePortions: "Porties brokken per dag", meatPortions: "Porties vlees per dag",
    feedingMoments: "{count} voedingsmomenten per dag", feedingMoment: "1 voedingsmoment per dag",
    feedingBreakdown: "{kibble} × brokken · {meat} × vlees", perDay: "Per dag", perPortion: "Per portie",
    kibble: "Brokken", meat: "Vlees", combined: "Totaal",
    feedingInvalid: "Controleer porties (1–12 per gebruikte voeding), verhouding, positieve hoeveelheden, gewichtsbereik en oplopende tabelgewichten.",
    outsideRange: "{food}: buiten het ingestelde gewichtsbereik. Deze pup is niet meegerekend.",
    feedingTotal: "Nesttotaal per dag",
    feedingBasis: "Verhouding van volledige dagrantsoenen",
    allocation: "Verdeling berekenen met", rationMode: "Volledige dagrantsoenen", energyMode: "Kcal per dag",
    kcalTarget: "Dagdoel (kcal/kg lichaamsgewicht)", energyDensity: "Energie-inhoud (kcal/100 g)",
    energyBasis: "Verhouding van dagelijkse kcal", ageFormula: "Tabel per leeftijd en gewicht",
    energyRatio: "{meat}% kcal uit vlees / {kibble}% kcal uit brokken",
    kcalDay: "{kcal} kcal/dag",
    fromDay: "Vanaf leeftijd (dagen)", addStage: "Leeftijdsfase toevoegen", removeStage: "Leeftijdsfase verwijderen",
    ageLabel: "{days} dagen oud", missingAge: "Geboortedatum ontbreekt of ligt in de toekomst; deze pup is niet meegerekend.",
    beforeStage: "{food}: leeftijd valt vóór de eerste ingestelde fase. Deze pup is niet meegerekend.",
    energyInvalid: "Vul een positief dagdoel en kcal/100 g voor elke gebruikte voeding in.",
    ageInvalid: "Controleer de leeftijdsfasen: oplopende hele startdagen en per fase een geldige gewichtstabel.",
    feedingSaving: "Voedingsinstellingen opslaan…", feedingSaved: "Voedingsinstellingen opgeslagen",
    feedingUnsaved: "Voedingsinstellingen nog niet opgeslagen", feedingSaveFailed: "Opslaan mislukt; wijziging is nog niet opgeslagen.",
    retrySave: "Opnieuw opslaan", feedingReadonly: "Voedingsinstellingen: alleen lezen",
  },
  en: {
    title: "Per-kg calculator",
    subtitle: "Calculates from the latest puppy weight; the entered amount remains your decision.",
    litter: "Litter",
    amountPerKg: "Amount per kg",
    unit: "Unit",
    unitPlaceholder: "For example ml, mg or g",
    puppies: "Puppies",
    latestWeight: "Weight used",
    required: "Required",
    total: "Total for calculated puppies",
    enterAmount: "Enter an amount greater than zero.",
    noWeight: "No valid weighing",
    staleWeight: "Old weight",
    inactive: "Inactive",
    noPuppies: "No puppies to calculate.",
    loading: "Loading...",
    loadFailed: "Calculator data could not be loaded.",
    refreshFailed: "New weight data could not be loaded.",
    calculatedPuppy: "1 puppy calculated",
    calculatedPuppies: "{count} puppies calculated",
    perKg: "Per kg", feeding: "Feeding", feedingTitle: "Feeding per puppy",
    feedingSubtitle: "Kibble and meat", method: "Calculation method",
    tableFormula: "Table", linearFormula: "Formula", fixedFormula: "Fixed g/kg rate",
    coefficient: "Grams per kg (factor)", offset: "Fixed amount (g/day)", minWeight: "Minimum weight (kg)", maxWeight: "Maximum weight (kg)",
    tableWeight: "Weight (kg)", tableGrams: "Full daily ration (g)", addRow: "Add row", removeRow: "Remove row", foodSettings: "{food}: settings", fixedRate: "Grams per kg per day",
    meatShare: "Meat share", ratio: "{meat}% meat / {kibble}% kibble",

    kibblePortions: "Kibble portions per day", meatPortions: "Meat portions per day",
    feedingMoments: "{count} feeding moments per day", feedingMoment: "1 feeding moment per day",
    feedingBreakdown: "{kibble} × kibble · {meat} × meat", perDay: "Per day", perPortion: "Per portion",
    kibble: "Kibble", meat: "Meat", combined: "Total",
    feedingInvalid: "Check portions (1–12 per included food), ratio, positive amounts, weight range and increasing table weights.",
    outsideRange: "{food}: outside the configured weight range. This puppy is not included.",
    feedingTotal: "Litter total per day",
    feedingBasis: "Share of complete daily rations",
    allocation: "Calculate allocation using", rationMode: "Complete daily rations", energyMode: "Daily kcal",
    kcalTarget: "Daily target (kcal/kg body weight)", energyDensity: "Energy content (kcal/100 g)",
    energyBasis: "Share of daily kcal", ageFormula: "Table by age and weight",
    energyRatio: "{meat}% kcal from meat / {kibble}% kcal from kibble",
    kcalDay: "{kcal} kcal/day",
    fromDay: "From age (days)", addStage: "Add age stage", removeStage: "Remove age stage",
    ageLabel: "{days} days old", missingAge: "Birth date missing or in the future; this puppy is not included.",
    beforeStage: "{food}: age is before the first configured stage. This puppy is not included.",
    energyInvalid: "Enter a positive daily target and kcal/100 g for each included food.",
    ageInvalid: "Check age stages: increasing whole start days and a valid weight table in each stage.",
    feedingSaving: "Saving feeding settings…", feedingSaved: "Feeding settings saved",
    feedingUnsaved: "Feeding settings not saved yet", feedingSaveFailed: "Save failed; this change has not been saved.",
    retrySave: "Retry save", feedingReadonly: "Feeding settings: read only",
  },
};

function text(card, key, replacements = {}) {
  const language = languageForHass(card?._hass);
  const template = TEXT[language]?.[key] ?? TEXT.nl[key] ?? key;
  return Object.entries(replacements).reduce(
    (result, [name, value]) => result.replaceAll(`{${name}}`, String(value ?? "")),
    template,
  );
}

function numberLocale(hass) {
  return languageForHass(hass) === "en" ? "en-US" : "nl-NL";
}

function formatNumber(value, hass, maximumFractionDigits = 4) {
  return new Intl.NumberFormat(numberLocale(hass), {
    maximumFractionDigits,
  }).format(value);
}

export function parseAmountPerKg(value) {
  const normalized = String(value ?? "").trim().replace(",", ".");
  if (!normalized) return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

export function calculateAmountForWeight(weightGrams, amountPerKg) {
  const weight = Number(weightGrams);
  const amount = Number(amountPerKg);
  if (!Number.isFinite(weight) || weight <= 0 || !Number.isFinite(amount) || amount <= 0) return null;
  return (weight / 1000) * amount;
}

export function calculatorWeightForPuppy(puppy, now = Date.now()) {
  const weight = Number(puppy?.summary?.current_weight);
  if (!Number.isFinite(weight) || weight <= 0) return null;

  const timestamp = puppy?.summary?.last_weighed || null;
  let hoursSince = Number(puppy?.summary?.hours_since_weighing);
  if (!Number.isFinite(hoursSince)) {
    const measuredAt = Date.parse(String(timestamp || ""));
    hoursSince = Number.isFinite(measuredAt) ? Math.max(0, (now - measuredAt) / 3600000) : null;
  }
  return {
    weightGrams: weight,
    timestamp,
    hoursSince: Number.isFinite(hoursSince) ? hoursSince : null,
  };
}

export function calculatorAgeForPuppy(puppy, litter, now = Date.now()) {
  const birth = Date.parse(puppy?.birth_time || litter?.birth_date || "");
  return Number.isFinite(birth) && birth <= now ? Math.floor((now - birth) / 86400000) : null;
}

class PuppyTrackerCalculatorCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass = null;
    this._config = {};
    this._litters = [];
    this._selectedLitterId = null;
    this._data = null;
    this._amountPerKg = "";
    this._unit = "ml";
    this._mode = "per_kg";
    this._feeding = feedingSettingsFromStored();
    this._feedingByLitter = new Map();
    this._configuredOnce = false;
    this._loading = false;
    this._error = "";
    this._unsubscribe = null;
    this._subscriptionPending = false;
    this._refreshing = false;
    this._refreshAgain = false;
    this._refreshDeferred = false;
  }

  static getStubConfig() {
    return {
      show_litter_selector: true,
      active_only: true,
      stale_after_hours: 24,
      max_height: 520,
      default_unit: "ml",
      default_mode: "per_kg",
    };
  }

  setConfig(config) {
    this._config = { ...PuppyTrackerCalculatorCard.getStubConfig(), ...config };
    this._selectedLitterId = config.litter_id || this._selectedLitterId;
    if (!this._configuredOnce) {
      this._unit = String(this._config.default_unit || "ml");
      const remembered = loadCardState(this, { mode: this._config.default_mode });
      this._mode = remembered.mode === "feeding" ? "feeding" : "per_kg";
      this._configuredOnce = true;
    }
    this._render();
  }

  set hass(hass) {
    const language = languageForHass(hass);
    const languageChanged = this._language !== language;
    this._language = language;
    this._hass = hass;
    if (!this._litters.length && !this._loading) this._loadInitial();
    else if (this.isConnected) this._ensureSubscription();
    if (languageChanged && this._litters.length) this._render();
  }

  connectedCallback() {
    if (!this._hass) return;
    if (!this._litters.length && !this._loading) this._loadInitial();
    else this._ensureSubscription();
  }

  disconnectedCallback() {
    if (this._unsubscribe) Promise.resolve(this._unsubscribe()).catch(() => undefined);
    this._unsubscribe = null;
  }

  getCardSize() { return 6; }
  getGridOptions() { return { columns: 12, min_columns: 6 }; }

  _inputFocused() {
    return Boolean(this.shadowRoot?.activeElement?.matches("input, select"));
  }

  async _loadInitial() {
    if (!this._hass || this._loading) return;
    this._loading = true;
    try {
      const response = await fetchLitters(this._hass);
      this._litters = response?.litters || [];
      this._selectedLitterId = selectDefaultLitter(
        this._litters,
        this._selectedLitterId || this._config.litter_id,
      );
      await this._loadData(false);
      await this._ensureSubscription();
      this._error = "";
    } catch (error) {
      this._error = error?.message || text(this, "loadFailed");
    } finally {
      this._loading = false;
      this._render();
    }
  }

  async _ensureSubscription() {
    if (!this._hass || this._unsubscribe || this._subscriptionPending || !this.isConnected) return;
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
    if (!this._hass) return;
    if (this._inputFocused()) {
      this._refreshDeferred = true;
      return;
    }
    if (this._refreshing) {
      this._refreshAgain = true;
      return;
    }
    this._refreshing = true;
    try {
      do {
        this._refreshAgain = false;
        const response = await fetchLitters(this._hass);
        this._litters = response?.litters || this._litters;
        this._selectedLitterId = selectDefaultLitter(
          this._litters,
          this._selectedLitterId || this._config.litter_id,
        );
        await this._loadData(false);
      } while (this._refreshAgain);
      this._error = "";
    } catch (error) {
      this._error = error?.message || text(this, "refreshFailed");
    } finally {
      this._refreshing = false;
      this._render();
    }
  }

  async _loadData(render = true) {
    const litterId = this._selectedLitterId;
    const previous = this._feedingByLitter.get(litterId);
    const revision = previous?.revision;
    if (!this._selectedLitterId) {
      this._data = null;
    } else {
      const response = await fetchLitterData(this._hass, litterId);
      if (litterId !== this._selectedLitterId) return;
      this._data = response;
      const saved = feedingSettingsFromStored(response.litter?.feeding_settings);
      let state = this._feedingByLitter.get(litterId);
      if (!state) {
        state = { value: saved, persisted: JSON.stringify(feedingSettingsForStorage(saved)), saving: false, queued: null, error: false, revision: 0 };
        this._feedingByLitter.set(litterId, state);
      } else if (state.revision === revision && !state.saving && JSON.stringify(feedingSettingsForStorage(state.value)) === state.persisted) {
        state.value = saved;
        state.persisted = JSON.stringify(feedingSettingsForStorage(saved));
      }
      this._feeding = state.value;
    }
    if (render) this._render();
  }

  async _saveFeeding() {
    const litterId = this._selectedLitterId;
    const state = this._feedingByLitter.get(litterId);
    const settings = feedingSettingsForStorage(this._feeding);
    if (!state || !settings || this._data?.litter?.id !== litterId || this._data?.can_manage_records === false) return;
    if (!state.saving && JSON.stringify(settings) === state.persisted) return;
    state.queued = settings;
    state.error = false;
    if (state.saving) return;
    state.saving = true;
    this._updateFeedingStatus();
    try {
      while (state.queued) {
        const snapshot = state.queued;
        state.queued = null;
        if (JSON.stringify(snapshot) === state.persisted) continue;
        await this._hass.callWS({ type: "puppy_tracker/feeding_settings/update", litter_id: litterId, settings: snapshot });
        state.persisted = JSON.stringify(snapshot);
        state.revision += 1;
      }
    } catch (_error) {
      state.error = true;
      state.queued = null;
    } finally {
      state.saving = false;
      if (litterId === this._selectedLitterId) this._updateFeedingStatus();
    }
  }

  _updateFeedingStatus() {
    const state = this._feedingByLitter.get(this._selectedLitterId);
    const status = this.shadowRoot.getElementById("feeding-save-status");
    if (!status) return;
    if (!state) { status.textContent = ""; return; }
    const key = this._data?.can_manage_records === false ? "feedingReadonly"
      : state?.saving ? "feedingSaving" : state?.error ? "feedingSaveFailed"
        : state && JSON.stringify(feedingSettingsForStorage(state.value)) !== state.persisted ? "feedingUnsaved" : "feedingSaved";
    status.textContent = text(this, key);
    status.style.color = state.error ? "var(--error-color)" : "var(--secondary-text-color)";
    const retry = this.shadowRoot.getElementById("feeding-retry");
    if (retry) retry.hidden = !state?.error || state.saving;
  }

  _rows() {
    const puppies = [...(this._data?.puppies || [])];
    return this._config.active_only === false
      ? puppies
      : puppies.filter((puppy) => puppy.active !== false);
  }

  _weightMeta(puppy) {
    const weight = calculatorWeightForPuppy(puppy);
    if (!weight) return { label: text(this, "noWeight"), detail: "", stale: false };
    const staleAfter = Number(this._config.stale_after_hours);
    const stale = Number.isFinite(staleAfter) && staleAfter > 0
      && Number.isFinite(weight.hoursSince) && weight.hoursSince > staleAfter;
    const detail = weight.timestamp
      ? `${formatDateTime(weight.timestamp, "", this._hass)}${Number.isFinite(weight.hoursSince) ? ` · ${formatHoursSince(weight.hoursSince, "", this._hass)}` : ""}`
      : "";
    return {
      label: formatWeight(weight.weightGrams, "—", this._hass),
      detail,
      stale,
    };
  }

  _foodSummary(kind) {
    const food = this._feeding[kind];
    const n = (value) => String(value).trim() !== "" && Number.isFinite(Number(value)) ? formatNumber(Number(value), this._hass, 3) : "—";
    const basis = this._feeding.allocationMode === "energy" ? `${n(food.kcal_per_100g)} kcal/100 g`
      : food.method === "age_table" ? text(this, "ageFormula")
      : food.method === "per_kg" ? `${n(food.grams_per_kg)} g/kg`
      : food.method === "linear" ? `${n(food.coefficient)} × kg + ${n(food.offset)} g · ${n(food.min_kg)}–${n(food.max_kg)} kg`
        : `${text(this, "tableFormula")} · ${n(food.table[0]?.[0])}–${n(food.table.at(-1)?.[0])} kg`;
    return `${text(this, kind)}: ${basis}`;
  }

  _foodTable(kind, stage = null) {
    const rows = stage === null ? this._feeding[kind].table : this._feeding[kind].age_tables[stage].table;
    const attribute = stage === null ? "" : ` data-stage="${stage}"`;
    return `<div class="food-table-head"><span>${escapeHtml(text(this, "tableWeight"))}</span><span>${escapeHtml(text(this, "tableGrams"))}</span><span></span></div>
      ${rows.map((row, index) => `<div class="food-table-row">${row.map((value, column) => `<input type="number" min="0.001" step="any" inputmode="decimal" data-food="${kind}"${attribute} data-row="${index}" data-column="${column}" value="${escapeHtml(value)}" aria-label="${escapeHtml(text(this, column ? "tableGrams" : "tableWeight"))} ${index + 1}">`).join("")}
      <button type="button" data-remove-food="${kind}"${attribute} data-index="${index}" title="${escapeHtml(text(this, "removeRow"))}" aria-label="${escapeHtml(text(this, "removeRow"))}" ${rows.length <= 2 ? "disabled" : ""}><ha-icon icon="mdi:minus"></ha-icon></button></div>`).join("")}
      <button type="button" data-add-food="${kind}"${attribute} ${rows.length >= 100 ? "disabled" : ""}><ha-icon icon="mdi:plus"></ha-icon>${escapeHtml(text(this, "addRow"))}</button>`;
  }

  _ageTables(kind) {
    const stages = this._feeding[kind].age_tables;
    return stages.map((stage, index) => `<div class="age-stage">
      <label>${escapeHtml(text(this, "fromDay"))}<input type="number" min="0" max="3650" step="1" inputmode="numeric" data-food="${kind}" data-stage="${index}" data-key="from_day" value="${escapeHtml(stage.from_day)}"></label>
      <button type="button" data-remove-stage="${kind}" data-stage="${index}" title="${escapeHtml(text(this, "removeStage"))}" aria-label="${escapeHtml(text(this, "removeStage"))}" ${stages.length <= 1 ? "disabled" : ""}><ha-icon icon="mdi:delete-outline"></ha-icon></button>
      <div class="age-stage-table" data-stage-table="${kind}-${index}">${this._foodTable(kind, index)}</div></div>`).join("")
      + `<button type="button" data-add-stage="${kind}" ${stages.length >= 24 || Number(stages.at(-1)?.from_day) >= 3650 ? "disabled" : ""}><ha-icon icon="mdi:plus"></ha-icon>${escapeHtml(text(this, "addStage"))}</button>`;
  }

  _feedingControls() {
    const settings = this._feeding;
    const field = (kind, key, label) => `<label>${escapeHtml(label === "energyDensity" ? `${text(this, kind)} · ${text(this, label)}` : text(this, label))}<input id="feeding-${kind}-${key}" type="number" min="0" step="any" inputmode="decimal" data-food="${kind}" data-key="${key}" value="${escapeHtml(settings[kind][key])}"></label>`;
    return `<div class="inputs feeding-inputs">
      <label>${escapeHtml(text(this, "allocation"))}<select id="feeding-allocation">${[["ration", "rationMode"], ["energy", "energyMode"]].map(([mode, label]) => `<option value="${mode}" ${settings.allocationMode === mode ? "selected" : ""}>${escapeHtml(text(this, label))}</option>`).join("")}</select></label>
      <label data-energy-control>${escapeHtml(text(this, "kcalTarget"))}<input id="feeding-kcal" type="number" min="0" step="any" inputmode="decimal" value="${escapeHtml(settings.kcalPerKg)}"></label>
      <label>${escapeHtml(text(this, "meatShare"))}<output id="feeding-ratio" for="feeding-meat"></output><input id="feeding-meat" type="range" min="0" max="100" step="1" value="${settings.meatPercent}" aria-label="${escapeHtml(text(this, "meatShare"))}"></label>
      <div class="feeding-meals">${["kibble", "meat"].map((kind) => `<label>${escapeHtml(text(this, kind + "Portions"))}<input id="feeding-${kind}-portions" type="number" min="1" max="12" step="1" inputmode="numeric" value="${escapeHtml(settings[kind + "Portions"])}"></label>`).join("")}
        <div class="feeding-meal-count" role="status" aria-live="polite"><strong id="feeding-moments"></strong><small id="feeding-breakdown"></small></div></div>
      <div class="feeding-foods">${["kibble", "meat"].map((kind) => `<section class="food-settings"><div data-energy-control>${field(kind, "kcal_per_100g", "energyDensity")}</div><div data-ration-control><label>${escapeHtml(text(this, kind))} · ${escapeHtml(text(this, "method"))}<select id="feeding-${kind}-method" data-food="${kind}" data-key="method">
        ${[["linear", "linearFormula"], ["table", "tableFormula"], ["per_kg", "fixedFormula"], ["age_table", "ageFormula"]].map(([method, label]) => `<option value="${method}" ${settings[kind].method === method ? "selected" : ""}>${escapeHtml(text(this, label))}</option>`).join("")}</select></label>
        <details><summary>${escapeHtml(text(this, "foodSettings", { food: text(this, kind) }))}</summary>
          <div data-food-section="${kind}-per_kg">${field(kind, "grams_per_kg", "fixedRate")}</div>
          <div class="food-formula" data-food-section="${kind}-linear">${[["coefficient", "coefficient"], ["offset", "offset"], ["min_kg", "minWeight"], ["max_kg", "maxWeight"]].map(([key, label]) => field(kind, key, label)).join("")}</div>
          <div data-food-section="${kind}-table" data-food-table="${kind}">${this._foodTable(kind)}</div>
          <div data-food-section="${kind}-age_table" data-age-tables="${kind}">${this._ageTables(kind)}</div>
        </details></div>
      </section>`).join("")}</div>
    </div>`;
  }

  _syncFoodControls() {
    const energy = this._feeding.allocationMode === "energy";
    this.shadowRoot.querySelectorAll("[data-energy-control]").forEach((element) => { element.hidden = !energy; });
    this.shadowRoot.querySelectorAll("[data-ration-control]").forEach((element) => { element.hidden = energy; });
    for (const [id, key] of [["feeding-allocation", "allocationMode"], ["feeding-kcal", "kcalPerKg"]]) {
      const input = this.shadowRoot.getElementById(id);
      if (input && input !== this.shadowRoot.activeElement) input.value = String(this._feeding[key]);
    }
    for (const kind of ["kibble", "meat"]) {
      const food = this._feeding[kind];
      for (const method of ["linear", "table", "per_kg", "age_table"]) {
        const section = this.shadowRoot.querySelector(`[data-food-section="${kind}-${method}"]`);
        if (section) section.hidden = food.method !== method;
      }
      const table = this.shadowRoot.querySelector(`[data-food-table="${kind}"]`);
      if (table && table.querySelectorAll(".food-table-row").length !== food.table.length) table.innerHTML = this._foodTable(kind);
      const ageTables = this.shadowRoot.querySelector(`[data-age-tables="${kind}"]`);
      if (ageTables && (ageTables.querySelectorAll(".age-stage").length !== food.age_tables.length
          || food.age_tables.some((stage, index) => ageTables.querySelector(`[data-stage-table="${kind}-${index}"]`)?.querySelectorAll(".food-table-row").length !== stage.table.length))) ageTables.innerHTML = this._ageTables(kind);
    }
    this.shadowRoot.querySelectorAll("[data-food]:is(input,select)").forEach((input) => {
      const food = this._feeding[input.dataset.food];
      const profile = input.dataset.stage == null ? food : food.age_tables[Number(input.dataset.stage)];
      input.value = input.dataset.key ? profile[input.dataset.key] : profile.table[Number(input.dataset.row)][Number(input.dataset.column)];
    });
    const readonly = this._data?.can_manage_records === false || this._data?.litter?.id !== this._selectedLitterId;
    this.shadowRoot.querySelectorAll(".feeding-inputs input,.feeding-inputs select,.feeding-inputs button").forEach((input) => {
      const kind = input.dataset.removeFood || input.dataset.addFood;
      const table = kind ? (input.dataset.stage == null ? this._feeding[kind].table : this._feeding[kind].age_tables[Number(input.dataset.stage)].table) : null;
      input.disabled = readonly || Boolean(input.dataset.removeFood && table.length <= 2)
        || Boolean(input.dataset.addFood && table.length >= 100)
        || Boolean(input.dataset.removeStage && this._feeding[input.dataset.removeStage].age_tables.length <= 1)
        || Boolean(input.dataset.addStage && (this._feeding[input.dataset.addStage].age_tables.length >= 24
          || Number(this._feeding[input.dataset.addStage].age_tables.at(-1)?.from_day) >= 3650));
    });
  }

  _feedingResult() {
    return `<div class="feeding-result"><span></span><span>${escapeHtml(text(this, "perDay"))}</span><span>${escapeHtml(text(this, "perPortion"))}</span>
      ${["kibble", "meat", "total"].map((kind) => `<span>${escapeHtml(text(this, kind === "total" ? "combined" : kind))}</span><strong data-feeding-${kind}-daily>—</strong>${kind === "total" ? '<span></span>' : `<strong data-feeding-${kind}-portion>—</strong>`}`).join("")}
      <small class="feeding-row-note" data-feeding-note></small></div>`;
  }

  _feedingTotals() {
    return `<div class="feeding-summary"><span id="feeding-allocation-basis"></span><span id="feeding-basis"></span></div>
      <div class="feeding-totals"><h3>${escapeHtml(text(this, "total"))}</h3><div class="feeding-result"><span></span><span>${escapeHtml(text(this, "perDay"))}</span><span>${escapeHtml(text(this, "perPortion"))}</span>${["kibble", "meat", "total"].map((kind) => `<span>${escapeHtml(text(this, kind === "total" ? "combined" : kind))}</span><strong data-feeding-sum-${kind}-daily>—</strong>${kind === "total" ? '<span></span>' : `<strong data-feeding-sum-${kind}-portion>—</strong>`}`).join("")}</div></div>`;
  }

  _render() {
    if (!this.shadowRoot) return;
    if (this._inputFocused()) { this._refreshDeferred = true; return; }
    const scrollTop = this.shadowRoot.querySelector(".puppy-list")?.scrollTop || 0;
    const feeding = this._mode === "feeding";
    const rows = this._rows();
    const litter = this._data?.litter;
    const selector = this._config.show_litter_selector !== false && this._litters.length > 1
      ? `<label>${escapeHtml(text(this, "litter"))}<select id="calculator-litter">${this._litters.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === this._selectedLitterId ? "selected" : ""}>${escapeHtml(item.name || text(this, "litter"))}</option>`).join("")}</select></label>`
      : "";
    const maxHeight = Math.min(900, Math.max(240, Number(this._config.max_height) || 520));
    const rowHtml = rows.map((puppy, index) => {
      const weight = calculatorWeightForPuppy(puppy);
      const meta = this._weightMeta(puppy);
      const badges = [
        puppy.active === false ? `<span class="badge">${escapeHtml(text(this, "inactive"))}</span>` : "",
        meta.stale ? `<span class="badge warning">${escapeHtml(text(this, "staleWeight"))}</span>` : "",
      ].join("");
      return `<article class="puppy-row ${feeding ? "feeding-row" : ""} ${weight ? "" : "missing"}" data-puppy-id="${escapeHtml(puppy.id)}" data-weight-grams="${weight?.weightGrams || ""}">
        <div class="identity"><span class="collar" style="background-color:${escapeHtml(collarColor(puppy.collar_color, index))}"></span><div><strong>${escapeHtml(puppySelectorLabel(puppy, text(this, "puppies")))}</strong></div></div>
        <div class="weight"><span>${escapeHtml(text(this, "latestWeight"))}</span><strong>${escapeHtml(meta.label)}</strong><small>${escapeHtml(meta.detail)}</small></div>
        ${feeding ? this._feedingResult() : `<div class="amount"><span>${escapeHtml(text(this, "required"))}</span><strong data-calculated-amount>—</strong><small data-calculation-formula></small></div>`}
        ${badges ? `<div class="badges">${badges}</div>` : ""}
      </article>`;
    }).join("");

    const shellKey = JSON.stringify([this._config, this._mode, languageForHass(this._hass), this._litters, this._selectedLitterId, this._loading, this._error, this._data?.can_manage_records]);
    // Weight refreshes leave the controls mounted, including a pending Safari click.
    if (shellKey === this._shellKey) {
      for (const [id, key] of [["feeding-meat", "meatPercent"], ["feeding-kibble-portions", "kibblePortions"], ["feeding-meat-portions", "meatPortions"]]) {
        const input = this.shadowRoot.getElementById(id);
        if (input) input.value = String(this._feeding[key]);
      }
      this._syncFoodControls();
      const list = this.shadowRoot.querySelector(".puppy-list");
      if (list && this._rowsMarkup !== rowHtml) {
        list.innerHTML = rows.length ? rowHtml : `<div class="empty">${escapeHtml(text(this, "noPuppies"))}</div>`;
        list.scrollTop = scrollTop;
      }
      this._rowsMarkup = rowHtml;
      this._updateCalculations();
      return;
    }
    this._shellKey = shellKey;
    this._rowsMarkup = rowHtml;

    this.shadowRoot.innerHTML = `<ha-card style="--calculator-list-height:${maxHeight}px"><style>
      ha-card{padding:16px;container-type:inline-size;container-name:calculator-card;overflow-anchor:none}.top{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.title{font-size:18px;font-weight:650}.subtitle{font-size:12px;color:var(--secondary-text-color);line-height:1.4;margin-top:2px}.top label,.inputs label{display:grid;gap:4px;font-size:11px;color:var(--secondary-text-color)}select,input{box-sizing:border-box;width:100%;min-height:42px;border:1px solid var(--divider-color);border-radius:8px;background:var(--card-background-color);color:var(--primary-text-color);padding:8px 10px;font:inherit}.top select{min-width:160px}.inputs{display:grid;grid-template-columns:minmax(0,1fr) minmax(140px,.55fr);gap:10px;margin-top:14px}.hint{min-height:18px;margin-top:7px;font-size:12px;color:var(--secondary-text-color)}.hint.invalid{color:var(--error-color)}.result-head{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:end;gap:12px;margin:12px 0 7px;padding-top:12px;border-top:1px solid var(--divider-color)}.result-head h3{margin:0;font-size:15px}.total{text-align:right}.total span{display:block;font-size:11px;color:var(--secondary-text-color)}.total strong{display:block;font-size:20px;margin-top:2px}.puppy-list{display:grid;gap:7px;max-height:var(--calculator-list-height);overflow-y:auto;overscroll-behavior:contain;scrollbar-gutter:stable}.puppy-row{position:relative;display:grid;grid-template-columns:minmax(150px,1.2fr) minmax(145px,.9fr) minmax(145px,.8fr);gap:12px;align-items:center;padding:11px;border:1px solid var(--divider-color);border-radius:8px}.puppy-row.missing .amount strong{color:var(--secondary-text-color)}.identity{display:flex;align-items:center;gap:9px;min-width:0}.identity .collar{width:18px;height:18px;border-radius:50%;border:2px solid color-mix(in srgb,var(--primary-text-color) 18%,transparent);flex:0 0 auto}.identity div,.weight,.amount{min-width:0}.identity strong,.identity small,.weight span,.weight strong,.weight small,.amount span,.amount strong,.amount small{display:block}.identity strong{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.identity small,.weight span,.weight small,.amount span,.amount small{font-size:11px;color:var(--secondary-text-color);margin-top:2px}.weight strong{font-size:14px;margin-top:2px}.amount{text-align:right}.amount strong{font-size:18px;margin-top:2px}.badges{position:absolute;right:8px;top:6px;display:flex;gap:4px}.badge{font-size:10px;padding:2px 5px;border-radius:5px;background:var(--secondary-background-color);color:var(--secondary-text-color)}.badge.warning{color:var(--warning-color,var(--primary-color));font-weight:650}.empty,.error{padding:18px 4px;color:var(--secondary-text-color);font-size:12px}.error{color:var(--error-color)}
      :host{display:block;min-width:0}ha-card{display:block;min-width:0}.feeding-row .badges{position:static;grid-column:1/-1}.feeding-totals h3{font-size:14px;margin:0 0 8px}.feeding-row .weight small{overflow-wrap:anywhere}
      @container calculator-card (max-width:620px){.top{display:grid}.top label{width:100%}.top select{min-width:0}.puppy-row{grid-template-columns:minmax(0,1fr) auto;grid-template-areas:"identity amount" "weight weight"}.identity{grid-area:identity}.weight{grid-area:weight;padding-top:7px;border-top:1px solid var(--divider-color)}.amount{grid-area:amount}.badges{position:static;grid-column:1/-1}.weight small{white-space:normal}}
      @container calculator-card (max-width:390px){ha-card{padding:13px}.inputs{grid-template-columns:1fr}.result-head{align-items:start}.total strong{font-size:17px}.puppy-row{padding:10px}.amount strong{font-size:17px}}
      .modes{display:flex;margin-top:12px;border-bottom:1px solid var(--divider-color);gap:8px}.modes button{flex:1;min-height:44px;border:0;border-bottom:3px solid transparent;background:transparent;color:var(--secondary-text-color);font:inherit;cursor:pointer}.modes button[aria-selected="true"]{border-color:var(--primary-color);color:var(--primary-color);font-weight:650}.feeding-inputs{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.feeding-inputs output{font-size:13px;color:var(--primary-text-color)}input[type="range"]{padding:0;border:0;accent-color:var(--primary-color);background:transparent;min-height:44px;touch-action:pan-y}.feeding-row{grid-template-columns:minmax(130px,1fr) minmax(100px,.8fr) minmax(215px,1.3fr)}.feeding-result{display:grid;grid-template-columns:minmax(50px,.8fr) minmax(60px,1fr) minmax(60px,1fr);gap:5px 8px;align-items:center;font-size:13px}.feeding-result>span{font-size:11px;color:var(--secondary-text-color)}.feeding-result>strong{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}.feeding-result>span:nth-child(2),.feeding-result>span:nth-child(3){text-align:right}.feeding-row-note{grid-column:1/-1;color:var(--warning-color,var(--secondary-text-color));font-size:11px}.feeding-totals{margin:8px 0 12px;padding-bottom:10px;border-bottom:1px solid var(--divider-color)}.feeding-summary{margin:8px 0;font-size:12px;color:var(--secondary-text-color);line-height:1.5}.feeding-summary span{display:block}.feeding-count{font-size:11px;color:var(--secondary-text-color);margin-top:5px}.mode-result-head .total strong{font-size:18px}.mode-result-head{grid-template-columns:1fr}
      @container calculator-card (max-width:620px){.feeding-row{grid-template-columns:minmax(0,1fr) minmax(0,1fr);grid-template-areas:"identity weight" "feeding feeding"}.feeding-row .weight{border-top:0;padding-top:0;text-align:right}.feeding-result{grid-area:feeding;border-top:1px solid var(--divider-color);padding-top:9px}.feeding-inputs{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}}
      .feeding-meals{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px;min-width:0}.feeding-meal-count{grid-column:1/-1;min-height:36px;font-size:12px;overflow-wrap:anywhere}.feeding-meal-count strong,.feeding-meal-count small{display:block}.feeding-meal-count small{margin-top:3px;color:var(--secondary-text-color)}.feeding-meals label{min-width:0;overflow-wrap:anywhere}
      [hidden]{display:none!important}
      .feeding-foods{display:grid;grid-column:1/-1;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px;align-items:start}.food-settings{min-width:0}.food-settings label{min-width:0;overflow-wrap:anywhere}.food-settings input{min-width:0}
      .food-settings details{margin-top:8px}.food-settings details>div{margin-top:8px}
      .food-settings summary{font-size:13px;min-height:44px;cursor:pointer;color:var(--primary-color);overflow-wrap:anywhere}
      .food-formula{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px}
      .food-table-head,.food-table-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) 44px;gap:6px;align-items:center;margin-bottom:6px}
      .food-table-head{font-size:11px;color:var(--secondary-text-color)}
      .food-settings button{min-height:44px;border:0;background:transparent;color:var(--primary-color);display:inline-flex;align-items:center;gap:4px;cursor:pointer}
      .food-settings button:disabled{opacity:.4}.feeding-summary{overflow-wrap:anywhere}
      .age-stage{display:grid;grid-template-columns:minmax(0,1fr) 44px;gap:8px;border-top:1px solid var(--divider-color);padding-top:10px;margin-top:10px}.age-stage-table{grid-column:1/-1}
      @container calculator-card (max-width:620px){.food-formula{grid-template-columns:1fr}}
      @container calculator-card (max-width:420px){.feeding-inputs,.feeding-foods{grid-template-columns:1fr}.food-formula{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}}
    </style><div class="top"><div><div class="title">${escapeHtml(this._config.title || text(this, feeding ? "feedingTitle" : "title"))}</div><div class="subtitle">${escapeHtml(text(this, feeding ? "feedingSubtitle" : "subtitle"))}</div></div>${selector}</div>
      <div class="modes" role="tablist" aria-label="${escapeHtml(text(this, "title"))}">${[["per_kg", "perKg"], ["feeding", "feeding"]].map(([mode, key]) => `<button type="button" role="tab" data-calculator-mode="${mode}" aria-selected="${this._mode === mode}">${escapeHtml(text(this, key))}</button>`).join("")}</div>
      ${feeding ? this._feedingControls() : `<div class="inputs"><label>${escapeHtml(text(this, "amountPerKg"))}<input id="calculator-amount" type="text" inputmode="decimal" autocomplete="off" value="${escapeHtml(this._amountPerKg)}" placeholder="0,0"></label><label>${escapeHtml(text(this, "unit"))}<input id="calculator-unit" type="text" maxlength="24" autocomplete="off" value="${escapeHtml(this._unit)}" placeholder="${escapeHtml(text(this, "unitPlaceholder"))}" list="calculator-units"><datalist id="calculator-units"><option value="ml"></option><option value="mg"></option><option value="g"></option><option value="tablet"></option><option value="dosis"></option></datalist></label></div>`}
      ${feeding ? this._feedingTotals() : ""}
      ${feeding ? `<div class="feeding-save-feedback" style="min-height:32px;display:flex;align-items:center;gap:8px"><span id="feeding-save-status" role="status" aria-live="polite" style="font-size:12px"></span><button type="button" id="feeding-retry" hidden title="${escapeHtml(text(this, "retrySave"))}"><ha-icon icon="mdi:content-save-outline"></ha-icon>${escapeHtml(text(this, "retrySave"))}</button></div>` : ""}
      <div class="hint" id="calculator-hint">${escapeHtml(text(this, "enterAmount"))}</div>
      ${this._error ? `<div class="error">${escapeHtml(this._error)}</div>` : `<div class="result-head ${feeding ? "mode-result-head" : ""}"><h3>${escapeHtml(text(this, "puppies"))}</h3><div class="total"><span id="calculator-count">${escapeHtml(text(this, "calculatedPuppies", { count: 0 }))}</span>${feeding ? "" : `<strong id="calculator-total">—</strong>`}</div></div><div class="puppy-list">${this._loading ? `<div class="empty">${escapeHtml(text(this, "loading"))}</div>` : rows.length ? rowHtml : `<div class="empty">${escapeHtml(text(this, "noPuppies"))}</div>`}</div>`}
    </ha-card>`;

    this.shadowRoot.getElementById("calculator-litter")?.addEventListener("change", async (event) => {
      event.target.blur();
      if (!requestLitterChange(this, event.target.value)) return;
      this._selectedLitterId = event.target.value;
      this.shadowRoot.querySelectorAll(".feeding-inputs input,.feeding-inputs select,.feeding-inputs button").forEach((input) => { input.disabled = true; });
      try { await this._loadData(); } catch (error) {
        this._error = error?.message || text(this, "loadFailed");
        this._render();
      }
    });
    const amountInput = this.shadowRoot.getElementById("calculator-amount");
    const unitInput = this.shadowRoot.getElementById("calculator-unit");
    amountInput?.addEventListener("input", (event) => {
      this._amountPerKg = event.target.value;
      this._updateCalculations();
    });
    unitInput?.addEventListener("input", (event) => {
      this._unit = event.target.value;
      this._updateCalculations();
    });
    this.shadowRoot.querySelectorAll("[data-calculator-mode]").forEach((button) => button.addEventListener("click", () => {
      if (button.dataset.calculatorMode === this._mode) return;
      this.shadowRoot.activeElement?.blur();
      this._mode = button.dataset.calculatorMode;
      saveCardState(this, { mode: this._mode });
      this._render();
      this.shadowRoot.querySelector(`[data-calculator-mode="${this._mode}"]`)?.focus({ preventScroll: true });
    }));
    for (const [id, key] of [["feeding-meat", "meatPercent"], ["feeding-kibble-portions", "kibblePortions"], ["feeding-meat-portions", "meatPortions"], ["feeding-allocation", "allocationMode"], ["feeding-kcal", "kcalPerKg"]]) {
      this.shadowRoot.getElementById(id)?.addEventListener("input", (event) => {
        this._feeding[key] = event.target.value;
        const state = this._feedingByLitter.get(this._selectedLitterId);
        if (state) { state.error = false; state.revision += 1; }
        if (key === "allocationMode") this._syncFoodControls();
        this._updateCalculations();
      });
      this.shadowRoot.getElementById(id)?.addEventListener("change", () => this._saveFeeding());
    }
    const controls = this.shadowRoot.querySelector(".feeding-inputs");
    const editFood = (event) => {
      const input = event.target.closest("[data-food]");
      if (!input) return;
      const food = this._feeding[input.dataset.food];
      const profile = input.dataset.stage == null ? food : food.age_tables[Number(input.dataset.stage)];
      if (input.dataset.key) profile[input.dataset.key] = input.value;
      else profile.table[Number(input.dataset.row)][Number(input.dataset.column)] = input.value;
      const state = this._feedingByLitter.get(this._selectedLitterId);
      if (state) { state.error = false; state.revision += 1; }
      if (input.dataset.key === "method") {
        if (food.method === "age_table" && !food.age_tables.length) {
          food.age_tables.push({ from_day: 0, table: structuredClone(food.table) });
        }
        this._syncFoodControls();
        input.closest(".food-settings").querySelector("details").open = true;
      }
      this._updateCalculations();
    };
    controls?.addEventListener("input", editFood);
    controls?.addEventListener("change", (event) => {
      if (!event.target.closest("[data-food]")) return;
      editFood(event);
      this._saveFeeding();
    });
    controls?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-add-food],[data-remove-food],[data-add-stage],[data-remove-stage]");
      if (!button || button.disabled) return;
      const kind = button.dataset.addFood || button.dataset.removeFood || button.dataset.addStage || button.dataset.removeStage;
      const food = this._feeding[kind];
      let targetSelector;
      if (button.dataset.addStage || button.dataset.removeStage) {
        if (button.dataset.addStage) {
          const last = food.age_tables.at(-1);
          food.age_tables.push({ from_day: Math.min(3650, Number(last?.from_day ?? -7) + 7), table: structuredClone(last?.table ?? food.table) });
        } else food.age_tables.splice(Number(button.dataset.stage), 1);
        this.shadowRoot.querySelector(`[data-age-tables="${kind}"]`).innerHTML = this._ageTables(kind);
        targetSelector = button.dataset.addStage ? `[data-food="${kind}"][data-stage="${food.age_tables.length - 1}"][data-key="from_day"]` : `[data-add-stage="${kind}"]`;
      } else {
        const rows = button.dataset.stage == null ? food.table : food.age_tables[Number(button.dataset.stage)].table;
        if (button.dataset.addFood) {
          const last = rows.at(-1);
          rows.push([Number(last[0]) + 1, Number(last[1])]);
        } else rows.splice(Number(button.dataset.index), 1);
        const container = button.dataset.stage == null ? `[data-food-table="${kind}"]` : `[data-stage-table="${kind}-${button.dataset.stage}"]`;
        this.shadowRoot.querySelector(container).innerHTML = this._foodTable(kind, button.dataset.stage == null ? null : Number(button.dataset.stage));
        const stageSelector = button.dataset.stage == null ? ":not([data-stage])" : `[data-stage="${button.dataset.stage}"]`;
        targetSelector = button.dataset.addFood ? `[data-food="${kind}"]${stageSelector}[data-row="${rows.length - 1}"][data-column="0"]` : `[data-add-food="${kind}"]${stageSelector}`;
      }
      const state = this._feedingByLitter.get(this._selectedLitterId);
      if (state) { state.error = false; state.revision += 1; }
      this._syncFoodControls();
      this._updateCalculations();
      const target = this.shadowRoot.querySelector(targetSelector);
      target?.focus({ preventScroll: true });
      this._saveFeeding();
    });
    this._syncFoodControls();
    this.shadowRoot.getElementById("feeding-retry")?.addEventListener("click", () => this._saveFeeding());
    if (this._data?.can_manage_records === false || this._data?.litter?.id !== this._selectedLitterId) {
      this.shadowRoot.querySelectorAll('[id^="feeding-"]:is(input,select)').forEach((input) => { input.disabled = true; });
    }
    for (const input of this.shadowRoot.querySelectorAll("input, select")) {
      input?.addEventListener("focusout", () => window.setTimeout(() => {
        if (!this._inputFocused() && this._refreshDeferred) {
          this._refreshDeferred = false;
          this._queueRefresh();
        }
      }, 0));
    }
    this._updateCalculations();
    const list = this.shadowRoot.querySelector(".puppy-list");
    if (list) list.scrollTop = scrollTop;
  }

  _updateCalculations() {
    if (this._mode === "feeding") { this._updateFeeding(); return; }
    const amount = parseAmountPerKg(this._amountPerKg);
    const unit = String(this._unit || "").trim();
    const hint = this.shadowRoot?.getElementById("calculator-hint");
    if (hint) {
      hint.textContent = amount === null ? text(this, "enterAmount") : "";
      hint.classList.toggle("invalid", this._amountPerKg.trim() !== "" && amount === null);
    }

    let total = 0;
    let count = 0;
    this.shadowRoot?.querySelectorAll("[data-puppy-id]").forEach((row) => {
      const weightGrams = Number(row.dataset.weightGrams);
      const calculated = amount === null ? null : calculateAmountForWeight(weightGrams, amount);
      const result = row.querySelector("[data-calculated-amount]");
      const formula = row.querySelector("[data-calculation-formula]");
      if (result) result.textContent = calculated === null ? "—" : `${formatNumber(calculated, this._hass)}${unit ? ` ${unit}` : ""}`;
      if (formula) formula.textContent = calculated === null || !Number.isFinite(weightGrams)
        ? ""
        : `${formatNumber(amount, this._hass)}${unit ? ` ${unit}` : ""}/kg × ${formatNumber(weightGrams / 1000, this._hass, 3)} kg`;
      if (calculated !== null) {
        total += calculated;
        count += 1;
      }
    });
    const totalElement = this.shadowRoot?.getElementById("calculator-total");
    const countElement = this.shadowRoot?.getElementById("calculator-count");
    if (totalElement) totalElement.textContent = count ? `${formatNumber(total, this._hass)}${unit ? ` ${unit}` : ""}` : "—";
    if (countElement) countElement.textContent = count === 1
      ? text(this, "calculatedPuppy")
      : text(this, "calculatedPuppies", { count });
  }

  _updateFeeding() {
    const settings = this._feeding;
    const put = (selector, value, root = this.shadowRoot) => { const element = root.querySelector(selector); if (element) element.textContent = value; };
    const grams = (value) => value == null ? "—" : `${formatNumber(value, this._hass, 1)} g`;
    put("#feeding-ratio", text(this, settings.allocationMode === "energy" ? "energyRatio" : "ratio", { meat: settings.meatPercent, kibble: 100 - Number(settings.meatPercent) }));
    put("#feeding-allocation-basis", text(this, settings.allocationMode === "energy" ? "energyBasis" : "feedingBasis"));
    put("#feeding-basis", `${this._foodSummary("kibble")} · ${this._foodSummary("meat")}`);
    const schedule = feedingSchedule(settings);
    put("#feeding-moments", schedule ? text(this, schedule.total === 1 ? "feedingMoment" : "feedingMoments", { count: schedule.total }) : "—");
    put("#feeding-breakdown", schedule ? text(this, "feedingBreakdown", schedule) : "");
    for (const kind of ["kibble", "meat"]) {
      const addStage = this.shadowRoot.querySelector(`[data-add-stage="${kind}"]`);
      if (addStage) addStage.disabled = this._data?.can_manage_records === false || this._data?.litter?.id !== this._selectedLitterId
        || settings[kind].age_tables.length >= 24 || Number(settings[kind].age_tables.at(-1)?.from_day) >= 3650;
      const input = this.shadowRoot.getElementById(`feeding-${kind}-portions`);
      const inactive = kind === "kibble" ? Number(settings.meatPercent) === 100 : Number(settings.meatPercent) === 0;
      if (input) {
        if (inactive) input.value = "0";
        else if (input.dataset.inactive === "true") input.value = String(settings[kind + "Portions"]);
        input.dataset.inactive = String(inactive);
        input.min = inactive ? "0" : "1";
        input.disabled = inactive || this._data?.can_manage_records === false || this._data?.litter?.id !== this._selectedLitterId;
      }
    }
    const totals = { kibbleDaily: 0, meatDaily: 0, totalDaily: 0, kibblePerPortion: 0, meatPerPortion: 0 };
    const ages = new Map(this._rows().map((puppy) => [puppy.id, calculatorAgeForPuppy(puppy, this._data?.litter)]));
    let count = 0;
    let invalid = false;
    this.shadowRoot.querySelectorAll("[data-puppy-id]").forEach((row) => {
      const age = ages.get(row.dataset.puppyId);
      const result = calculateFeedingForWeight(row.dataset.weightGrams, settings, age);
      if (result.status === "invalid_settings") invalid = true;
      for (const [kind, key] of [["kibble", "kibble"], ["meat", "meat"], ["total", "total"]]) {
        put(`[data-feeding-${kind}-daily]`, result.status === "ok" ? grams(result[`${key}Daily`]) : "—", row);
        put(`[data-feeding-${kind}-portion]`, result.status === "ok" ? grams(result[`${key}PerPortion`]) : "—", row);
      }
      const note = result.status === "missing_age" ? text(this, "missingAge")
        : result.status === "before_age_stage" ? text(this, "beforeStage", { food: text(this, result.food) })
          : result.status === "outside_food_range" ? text(this, "outsideRange", { food: text(this, result.food) })
            : result.status === "ok" && settings.allocationMode === "energy" ? text(this, "kcalDay", { kcal: formatNumber(result.kcalDaily, this._hass, 1) })
              : result.status === "ok" && ((Number(settings.meatPercent) < 100 && settings.kibble.method === "age_table")
                || (Number(settings.meatPercent) > 0 && settings.meat.method === "age_table")) && age != null ? text(this, "ageLabel", { days: age }) : "";
      put("[data-feeding-note]", note, row);
      if (result.status === "ok") {
        count += 1;
        for (const key of Object.keys(totals)) totals[key] += result[key];
      }
    });
    // Validate even when the litter has no usable weights.
    invalid ||= calculateFeedingForWeight(1000, settings).status === "invalid_settings";
    const hints = [text(this, "feedingInvalid")];
    if (settings.allocationMode === "energy") hints.push(text(this, "energyInvalid"));
    else if ([settings.kibble.method, settings.meat.method].includes("age_table")) hints.push(text(this, "ageInvalid"));
    put("#calculator-hint", invalid ? hints.join(" ") : "");
    this.shadowRoot.getElementById("calculator-hint")?.classList.toggle("invalid", invalid);
    for (const kind of ["kibble", "meat", "total"]) {
      put(`[data-feeding-sum-${kind}-daily]`, count ? grams(totals[`${kind}Daily`]) : "—");
      put(`[data-feeding-sum-${kind}-portion]`, count && schedule?.[kind] ? grams(totals[`${kind}PerPortion`]) : "—");
    }
    put("#calculator-count", count === 1 ? text(this, "calculatedPuppy") : text(this, "calculatedPuppies", { count }));
    this._updateFeedingStatus();
  }
}

if (!customElements.get("puppy-tracker-calculator-card")) {
  customElements.define("puppy-tracker-calculator-card", PuppyTrackerCalculatorCard);
}
