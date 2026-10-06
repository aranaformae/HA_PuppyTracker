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
    };
  }

  setConfig(config) {
    this._config = { ...PuppyTrackerCalculatorCard.getStubConfig(), ...config };
    this._selectedLitterId = config.litter_id || this._selectedLitterId;
    if (!this._configuredOnce) {
      this._unit = String(this._config.default_unit || "ml");
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
    return ["calculator-amount", "calculator-unit"].includes(this.shadowRoot?.activeElement?.id);
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

  _render() {
    if (!this.shadowRoot) return;
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
      return `<article class="puppy-row ${weight ? "" : "missing"}" data-puppy-id="${escapeHtml(puppy.id)}" data-weight-grams="${weight?.weightGrams || ""}">
        <div class="identity"><span class="collar" style="background-color:${escapeHtml(collarColor(puppy.collar_color, index))}"></span><div><strong>${escapeHtml(puppy.name || text(this, "puppies"))}</strong><small>${escapeHtml(puppy.collar_color || "")}</small></div></div>
        <div class="weight"><span>${escapeHtml(text(this, "latestWeight"))}</span><strong>${escapeHtml(meta.label)}</strong><small>${escapeHtml(meta.detail)}</small></div>
        <div class="amount"><span>${escapeHtml(text(this, "required"))}</span><strong data-calculated-amount>—</strong><small data-calculation-formula></small></div>
        ${badges ? `<div class="badges">${badges}</div>` : ""}
      </article>`;
    }).join("");

    this.shadowRoot.innerHTML = `<ha-card style="--calculator-list-height:${maxHeight}px"><style>
      ha-card{padding:16px;container-type:inline-size;container-name:calculator-card;overflow-anchor:none}.top{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.title{font-size:18px;font-weight:650}.subtitle{font-size:12px;color:var(--secondary-text-color);line-height:1.4;margin-top:2px}.top label,.inputs label{display:grid;gap:4px;font-size:11px;color:var(--secondary-text-color)}select,input{box-sizing:border-box;width:100%;min-height:42px;border:1px solid var(--divider-color);border-radius:8px;background:var(--card-background-color);color:var(--primary-text-color);padding:8px 10px;font:inherit}.top select{min-width:160px}.inputs{display:grid;grid-template-columns:minmax(0,1fr) minmax(140px,.55fr);gap:10px;margin-top:14px}.hint{min-height:18px;margin-top:7px;font-size:12px;color:var(--secondary-text-color)}.hint.invalid{color:var(--error-color)}.result-head{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:end;gap:12px;margin:12px 0 7px;padding-top:12px;border-top:1px solid var(--divider-color)}.result-head h3{margin:0;font-size:15px}.total{text-align:right}.total span{display:block;font-size:11px;color:var(--secondary-text-color)}.total strong{display:block;font-size:20px;margin-top:2px}.puppy-list{display:grid;gap:7px;max-height:var(--calculator-list-height);overflow-y:auto;overscroll-behavior:contain;scrollbar-gutter:stable}.puppy-row{position:relative;display:grid;grid-template-columns:minmax(150px,1.2fr) minmax(145px,.9fr) minmax(145px,.8fr);gap:12px;align-items:center;padding:11px;border:1px solid var(--divider-color);border-radius:8px}.puppy-row.missing .amount strong{color:var(--secondary-text-color)}.identity{display:flex;align-items:center;gap:9px;min-width:0}.identity .collar{width:18px;height:18px;border-radius:50%;border:2px solid color-mix(in srgb,var(--primary-text-color) 18%,transparent);flex:0 0 auto}.identity div,.weight,.amount{min-width:0}.identity strong,.identity small,.weight span,.weight strong,.weight small,.amount span,.amount strong,.amount small{display:block}.identity strong{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.identity small,.weight span,.weight small,.amount span,.amount small{font-size:11px;color:var(--secondary-text-color);margin-top:2px}.weight strong{font-size:14px;margin-top:2px}.amount{text-align:right}.amount strong{font-size:18px;margin-top:2px}.badges{position:absolute;right:8px;top:6px;display:flex;gap:4px}.badge{font-size:10px;padding:2px 5px;border-radius:5px;background:var(--secondary-background-color);color:var(--secondary-text-color)}.badge.warning{color:var(--warning-color,var(--primary-color));font-weight:650}.empty,.error{padding:18px 4px;color:var(--secondary-text-color);font-size:12px}.error{color:var(--error-color)}
      @container calculator-card (max-width:620px){.top{display:grid}.top label{width:100%}.top select{min-width:0}.puppy-row{grid-template-columns:minmax(0,1fr) auto;grid-template-areas:"identity amount" "weight weight"}.identity{grid-area:identity}.weight{grid-area:weight;padding-top:7px;border-top:1px solid var(--divider-color)}.amount{grid-area:amount}.badges{position:static;grid-column:1/-1}.weight small{white-space:normal}}
      @container calculator-card (max-width:390px){ha-card{padding:13px}.inputs{grid-template-columns:1fr}.result-head{align-items:start}.total strong{font-size:17px}.puppy-row{padding:10px}.amount strong{font-size:17px}}
    </style><div class="top"><div><div class="title">${escapeHtml(this._config.title || text(this, "title"))}</div><div class="subtitle">${escapeHtml(text(this, "subtitle"))}</div></div>${selector}</div>
      <div class="inputs"><label>${escapeHtml(text(this, "amountPerKg"))}<input id="calculator-amount" type="text" inputmode="decimal" autocomplete="off" value="${escapeHtml(this._amountPerKg)}" placeholder="0,0"></label><label>${escapeHtml(text(this, "unit"))}<input id="calculator-unit" type="text" maxlength="24" autocomplete="off" value="${escapeHtml(this._unit)}" placeholder="${escapeHtml(text(this, "unitPlaceholder"))}" list="calculator-units"><datalist id="calculator-units"><option value="ml"></option><option value="mg"></option><option value="g"></option><option value="tablet"></option><option value="dosis"></option></datalist></label></div>
      <div class="hint" id="calculator-hint">${escapeHtml(text(this, "enterAmount"))}</div>
      ${this._error ? `<div class="error">${escapeHtml(this._error)}</div>` : `<div class="result-head"><h3>${escapeHtml(text(this, "puppies"))}</h3><div class="total"><span id="calculator-count">${escapeHtml(text(this, "calculatedPuppies", { count: 0 }))}</span><strong id="calculator-total">—</strong></div></div><div class="puppy-list">${this._loading ? `<div class="empty">${escapeHtml(text(this, "loading"))}</div>` : rows.length ? rowHtml : `<div class="empty">${escapeHtml(text(this, "noPuppies"))}</div>`}</div>`}
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
    for (const input of [amountInput, unitInput]) {
      input?.addEventListener("focusout", () => window.setTimeout(() => {
        if (!this._inputFocused() && this._refreshDeferred) {
          this._refreshDeferred = false;
          this._queueRefresh();
        }
      }, 0));
    }
    this._updateCalculations();
  }

  _updateCalculations() {
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
}

if (!customElements.get("puppy-tracker-calculator-card")) {
  customElements.define("puppy-tracker-calculator-card", PuppyTrackerCalculatorCard);
}
