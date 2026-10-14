import {
  escapeHtml,
  fetchLitterData,
  fetchLitters,
  formatDateTime,
  formatHoursSince,
  formatWeight,
  languageForHass,
  requestLitterChange,
  selectDefaultLitter,
  subscribeUpdates,
} from "./puppy-tracker-card-common.js";
import { collarColor } from "./puppy-tracker-collar-chart-colors.js";
import { calculateFeedingForWeight, KIVO_PUPPY_RANGE } from "./puppy-tracker-feeding-calculator.js";

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
    feedingSubtitle: "Ydolo Puppy en Kivo puppyvlees", kibbleFormula: "Ydolo-berekening",
    tableFormula: "Voedingstabel (1–20 kg)", linearFormula: "PDF-formule (1–20 kg)",
    meatShare: "Aandeel vlees", ratio: "{meat}% vlees / {kibble}% brokken",
    kivoAmount: "Kivo puppyvlees", kivoRate: "{amount} g/kg per dag",
    portions: "Porties per dag", perDay: "Per dag", perPortion: "Per portie",
    kibble: "Brokken", meat: "Vlees", combined: "Totaal",
    feedingInvalid: "Kies 1–12 hele porties, 0–100% vlees en 40–50 g/kg Kivo.",
    outsideRange: "Ydolo-bereik: 1–20 kg. Deze pup is niet meegerekend.",
    feedingTotal: "Nesttotaal per dag", feedingPortionTotal: "Nesttotaal per portie",
    feedingBasis: "Verhouding van volledige dagrantsoenen", tableBasis: "Ydolo-tabel", linearBasis: "Ydolo: 13,32 × kg + 94,46",
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
    feedingSubtitle: "Ydolo Puppy and Kivo puppy meat", kibbleFormula: "Ydolo calculation",
    tableFormula: "Feeding table (1–20 kg)", linearFormula: "PDF formula (1–20 kg)",
    meatShare: "Meat share", ratio: "{meat}% meat / {kibble}% kibble",
    kivoAmount: "Kivo puppy meat", kivoRate: "{amount} g/kg per day",
    portions: "Portions per day", perDay: "Per day", perPortion: "Per portion",
    kibble: "Kibble", meat: "Meat", combined: "Total",
    feedingInvalid: "Choose 1–12 whole portions, 0–100% meat and 40–50 g/kg Kivo.",
    outsideRange: "Ydolo range: 1–20 kg. This puppy is not included.",
    feedingTotal: "Litter total per day", feedingPortionTotal: "Litter total per portion",
    feedingBasis: "Share of complete daily rations", tableBasis: "Ydolo table", linearBasis: "Ydolo: 13.32 × kg + 94.46",
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
    this._feeding = { meatPercent: 50, kivoPerKg: KIVO_PUPPY_RANGE.default, portions: 4, kibbleFormula: "table" };
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
      this._mode = this._config.default_mode === "feeding" ? "feeding" : "per_kg";
      this._configuredOnce = true;
    }
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._litters.length && !this._loading) this._loadInitial();
    else if (this.isConnected) this._ensureSubscription();
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
    if (!this._selectedLitterId) {
      this._data = null;
    } else {
      this._data = await fetchLitterData(this._hass, this._selectedLitterId);
    }
    if (render) this._render();
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

  _feedingControls() {
    const settings = this._feeding;
    return `<div class="inputs feeding-inputs">
      <label>${escapeHtml(text(this, "kibbleFormula"))}<select id="feeding-formula"><option value="table" ${settings.kibbleFormula === "table" ? "selected" : ""}>${escapeHtml(text(this, "tableFormula"))}</option><option value="linear" ${settings.kibbleFormula === "linear" ? "selected" : ""}>${escapeHtml(text(this, "linearFormula"))}</option></select></label>
      <label>${escapeHtml(text(this, "portions"))}<input id="feeding-portions" type="number" min="1" max="12" step="1" inputmode="numeric" value="${escapeHtml(settings.portions)}"></label>
      <label>${escapeHtml(text(this, "meatShare"))}<output id="feeding-ratio" for="feeding-meat"></output><input id="feeding-meat" type="range" min="0" max="100" step="1" value="${settings.meatPercent}" aria-label="${escapeHtml(text(this, "meatShare"))}"></label>
      <label>${escapeHtml(text(this, "kivoAmount"))}<output id="feeding-rate" for="feeding-kivo"></output><input id="feeding-kivo" type="range" min="40" max="50" step="0.5" value="${settings.kivoPerKg}" aria-label="${escapeHtml(text(this, "kivoAmount"))}"></label>
    </div>`;
  }

  _feedingResult() {
    return `<div class="feeding-result"><span></span><span>${escapeHtml(text(this, "perDay"))}</span><span>${escapeHtml(text(this, "perPortion"))}</span>
      ${["kibble", "meat", "total"].map((kind) => `<span>${escapeHtml(text(this, kind === "total" ? "combined" : kind))}</span><strong data-feeding-${kind}-daily>—</strong><strong data-feeding-${kind}-portion>—</strong>`).join("")}
      <small class="feeding-row-note" data-feeding-note></small></div>`;
  }

  _feedingTotals() {
    return `<div class="feeding-summary"><span>${escapeHtml(text(this, "feedingBasis"))}</span><span id="feeding-basis"></span></div>
      <div class="feeding-totals"><h3>${escapeHtml(text(this, "total"))}</h3><div class="feeding-result"><span></span><span>${escapeHtml(text(this, "perDay"))}</span><span>${escapeHtml(text(this, "perPortion"))}</span>${["kibble", "meat", "total"].map((kind) => `<span>${escapeHtml(text(this, kind === "total" ? "combined" : kind))}</span><strong data-feeding-sum-${kind}-daily>—</strong><strong data-feeding-sum-${kind}-portion>—</strong>`).join("")}</div></div>`;
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
        <div class="identity"><span class="collar" style="background-color:${escapeHtml(collarColor(puppy.collar_color, index))}"></span><div><strong>${escapeHtml(puppy.name || text(this, "puppies"))}</strong><small>${escapeHtml(puppy.collar_color || "")}</small></div></div>
        <div class="weight"><span>${escapeHtml(text(this, "latestWeight"))}</span><strong>${escapeHtml(meta.label)}</strong><small>${escapeHtml(meta.detail)}</small></div>
        ${feeding ? this._feedingResult() : `<div class="amount"><span>${escapeHtml(text(this, "required"))}</span><strong data-calculated-amount>—</strong><small data-calculation-formula></small></div>`}
        ${badges ? `<div class="badges">${badges}</div>` : ""}
      </article>`;
    }).join("");

    const shellKey = JSON.stringify([this._config, this._mode, languageForHass(this._hass), this._litters, this._selectedLitterId, this._loading, this._error]);
    // Weight refreshes leave the controls mounted, including a pending Safari click.
    if (shellKey === this._shellKey) {
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
    </style><div class="top"><div><div class="title">${escapeHtml(this._config.title || text(this, feeding ? "feedingTitle" : "title"))}</div><div class="subtitle">${escapeHtml(text(this, feeding ? "feedingSubtitle" : "subtitle"))}</div></div>${selector}</div>
      <div class="modes" role="tablist" aria-label="${escapeHtml(text(this, "title"))}">${[["per_kg", "perKg"], ["feeding", "feeding"]].map(([mode, key]) => `<button type="button" role="tab" data-calculator-mode="${mode}" aria-selected="${this._mode === mode}">${escapeHtml(text(this, key))}</button>`).join("")}</div>
      ${feeding ? this._feedingControls() : `<div class="inputs"><label>${escapeHtml(text(this, "amountPerKg"))}<input id="calculator-amount" type="text" inputmode="decimal" autocomplete="off" value="${escapeHtml(this._amountPerKg)}" placeholder="0,0"></label><label>${escapeHtml(text(this, "unit"))}<input id="calculator-unit" type="text" maxlength="24" autocomplete="off" value="${escapeHtml(this._unit)}" placeholder="${escapeHtml(text(this, "unitPlaceholder"))}" list="calculator-units"><datalist id="calculator-units"><option value="ml"></option><option value="mg"></option><option value="g"></option><option value="tablet"></option><option value="dosis"></option></datalist></label></div>`}
      ${feeding ? this._feedingTotals() : ""}
      <div class="hint" id="calculator-hint">${escapeHtml(text(this, "enterAmount"))}</div>
      ${this._error ? `<div class="error">${escapeHtml(this._error)}</div>` : `<div class="result-head ${feeding ? "mode-result-head" : ""}"><h3>${escapeHtml(text(this, "puppies"))}</h3><div class="total"><span id="calculator-count">${escapeHtml(text(this, "calculatedPuppies", { count: 0 }))}</span>${feeding ? "" : `<strong id="calculator-total">—</strong>`}</div></div><div class="puppy-list">${this._loading ? `<div class="empty">${escapeHtml(text(this, "loading"))}</div>` : rows.length ? rowHtml : `<div class="empty">${escapeHtml(text(this, "noPuppies"))}</div>`}</div>`}
    </ha-card>`;

    this.shadowRoot.getElementById("calculator-litter")?.addEventListener("change", async (event) => {
      if (!requestLitterChange(this, event.target.value)) return;
      this._selectedLitterId = event.target.value;
      await this._loadData();
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
      this._render();
      this.shadowRoot.querySelector(`[data-calculator-mode="${this._mode}"]`)?.focus({ preventScroll: true });
    }));
    for (const [id, key] of [["feeding-meat", "meatPercent"], ["feeding-kivo", "kivoPerKg"], ["feeding-portions", "portions"], ["feeding-formula", "kibbleFormula"]]) {
      this.shadowRoot.getElementById(id)?.addEventListener(id === "feeding-formula" ? "change" : "input", (event) => {
        this._feeding[key] = event.target.value;
        this._updateCalculations();
      });
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
    const grams = (value) => `${formatNumber(value, this._hass, 1)} g`;
    put("#feeding-ratio", text(this, "ratio", { meat: settings.meatPercent, kibble: 100 - Number(settings.meatPercent) }));
    put("#feeding-rate", text(this, "kivoRate", { amount: formatNumber(Number(settings.kivoPerKg), this._hass, 1) }));
    put("#feeding-basis", `${text(this, settings.kibbleFormula === "linear" ? "linearBasis" : "tableBasis")} · Kivo ${text(this, "kivoRate", { amount: formatNumber(Number(settings.kivoPerKg), this._hass, 1) })}`);
    const totals = { kibbleDaily: 0, meatDaily: 0, totalDaily: 0, kibblePerPortion: 0, meatPerPortion: 0, totalPerPortion: 0 };
    let count = 0;
    let invalid = false;
    this.shadowRoot.querySelectorAll("[data-puppy-id]").forEach((row) => {
      const result = calculateFeedingForWeight(row.dataset.weightGrams, settings);
      if (result.status === "invalid_settings") invalid = true;
      for (const [kind, key] of [["kibble", "kibble"], ["meat", "meat"], ["total", "total"]]) {
        put(`[data-feeding-${kind}-daily]`, result.status === "ok" ? grams(result[`${key}Daily`]) : "—", row);
        put(`[data-feeding-${kind}-portion]`, result.status === "ok" ? grams(result[`${key}PerPortion`]) : "—", row);
      }
      put("[data-feeding-note]", result.status === "outside_kibble_range" ? text(this, "outsideRange") : "", row);
      if (result.status === "ok") {
        count += 1;
        for (const key of Object.keys(totals)) totals[key] += result[key];
      }
    });
    // Validate even when the litter has no usable weights.
    invalid ||= calculateFeedingForWeight(1000, settings).status === "invalid_settings";
    put("#calculator-hint", invalid ? text(this, "feedingInvalid") : "");
    this.shadowRoot.getElementById("calculator-hint")?.classList.toggle("invalid", invalid);
    for (const kind of ["kibble", "meat", "total"]) {
      put(`[data-feeding-sum-${kind}-daily]`, count ? grams(totals[`${kind}Daily`]) : "—");
      put(`[data-feeding-sum-${kind}-portion]`, count ? grams(totals[`${kind}PerPortion`]) : "—");
    }
    put("#calculator-count", count === 1 ? text(this, "calculatedPuppy") : text(this, "calculatedPuppies", { count }));
  }
}

if (!customElements.get("puppy-tracker-calculator-card")) {
  customElements.define("puppy-tracker-calculator-card", PuppyTrackerCalculatorCard);
}
