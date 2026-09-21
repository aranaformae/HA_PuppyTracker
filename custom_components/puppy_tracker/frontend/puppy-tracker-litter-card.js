import {
  describeStatus,
  escapeHtml,
  fetchLitterData,
  fetchLitters,
  formatAge,
  formatHoursSince,
  formatPercent,
  formatSignedWeight,
  formatWeight,
  languageForHass,
  requestLitterChange,
  selectDefaultLitter,
  sexLabel,
  statusIcon,
  statusTone,
  subscribeUpdates,
} from "./puppy-tracker-card-common.js";
import { enhanceLitterCard } from "./puppy-tracker-litter-profile-note.js";

const TEXT = {
  en: {
    activePuppies: "{count} active",
    age: "Age",
    attention: "Attention",
    attentionCount: "{count} attention",
    average: "avg. {weight}",
    birthWeight: "Birth weight",
    female: "Female",
    growth24: "Growth 24h",
    last: "Latest",
    lastMeasurement: "Previous measurement",
    lastWeighing: "Latest weighing",
    litter: "Litter",
    loadFailed: "Litter overview could not be loaded.",
    litterLoadFailed: "Litter data could not be loaded.",
    loading: "Loading...",
    male: "Male",
    measurements: "Measurements",
    name: "Name",
    noLitter: "No litter",
    noPuppies: "No puppies to show.",
    puppy: "Puppy",
    puppies: "Puppies",
    refreshFailed: "New Puppy Tracker data could not be loaded.",
    sinceBirth: "since birth",
    sortDirection: "Sort direction",
    status: "Status",
    statusFirst24h: "First 24 hours",
    statusLowGrowth: "Low growth",
    statusNoMeasurement: "No measurement",
    statusOk: "On track",
    statusWeightLoss: "Weight loss",
    statusWeighDue: "Weighing due",
    toWeigh: "{count} to weigh",
    totalGrowth: "Total growth",
    unknown: "Unknown",
    weight: "Weight",
  },
  nl: {
    activePuppies: "{count} actief",
    age: "Leeftijd",
    attention: "Aandacht",
    attentionCount: "{count} aandacht",
    average: "gem. {weight}",
    birthWeight: "Geboortegewicht",
    female: "Teef",
    growth24: "Groei 24u",
    last: "Laatste",
    lastMeasurement: "Vorige meting",
    lastWeighing: "Laatste weging",
    litter: "Nest",
    loadFailed: "Nestoverzicht kon niet worden geladen.",
    litterLoadFailed: "Nestdata kon niet worden geladen.",
    loading: "Laden...",
    male: "Reu",
    measurements: "Metingen",
    name: "Naam",
    noLitter: "Geen nest",
    noPuppies: "Geen pups om te tonen.",
    puppy: "Pup",
    puppies: "Pups",
    refreshFailed: "Nieuwe Puppy Tracker-data kon niet worden geladen.",
    sinceBirth: "sinds geboorte",
    sortDirection: "Sorteerrichting",
    status: "Status",
    statusFirst24h: "Eerste 24 uur",
    statusLowGrowth: "Lage groei",
    statusNoMeasurement: "Geen meting",
    statusOk: "Op schema",
    statusWeightLoss: "Gewichtsverlies",
    statusWeighDue: "Weging nodig",
    toWeigh: "{count} te wegen",
    totalGrowth: "Totale groei",
    unknown: "Onbekend",
    weight: "Gewicht",
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

function configHass() {
  return document.querySelector("home-assistant")?.hass || null;
}

function statusLabel(hass, summary) {
  const key = {
    first_24h: "statusFirst24h",
    first_day_excess_weight_loss: "statusWeightLoss",
    low_growth: "statusLowGrowth",
    no_measurement: "statusNoMeasurement",
    ok: "statusOk",
    weigh_due: "statusWeighDue",
    weight_loss: "statusWeightLoss",
  }[summary?.status_code];
  return key ? text(hass, key) : (summary?.status || text(hass, "unknown"));
}

class PuppyTrackerLitterCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass = null;
    this._config = {};
    this._litters = [];
    this._selectedLitterId = null;
    this._data = null;
    this._sortBy = "name";
    this._sortDirection = "asc";
    this._expandedPuppyId = null;
    this._loading = false;
    this._error = "";
    this._unsubscribe = null;
    this._subscriptionPending = false;
    this._refreshing = false;
    this._refreshAgain = false;
  }

  static getStubConfig() {
    const hass = configHass();
    return { title: languageForHass(hass) === "en" ? "Litter overview" : "Nestoverzicht", show_litter_selector: true, active_only: true, show_details: true, default_sort: "name" };
  }

  static getConfigForm() {
    return {
      schema: [
        { name: "title", selector: { text: {} } },
        { name: "show_litter_selector", selector: { boolean: {} } },
        { name: "active_only", selector: { boolean: {} } },
        { name: "show_details", selector: { boolean: {} } },
        {
          name: "default_sort",
          selector: { select: { mode: "dropdown", options: [
            { value: "name", label: text(configHass(), "name") },
            { value: "weight", label: text(configHass(), "weight") },
            { value: "growth24", label: text(configHass(), "growth24") },
            { value: "last", label: text(configHass(), "lastWeighing") },
            { value: "attention", label: text(configHass(), "attention") },
          ] } },
        },
      ],
    };
  }

  setConfig(config) {
    this._config = { title: "", show_litter_selector: true, active_only: true, show_details: true, default_sort: "name", ...config };
    this._selectedLitterId = config.litter_id || this._selectedLitterId;
    this._sortBy = config.default_sort || this._sortBy;
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._litters.length && !this._loading) {
      this._loadInitial();
    } else if (this.isConnected) {
      this._ensureSubscription();
    }
  }

  connectedCallback() {
    if (!this._hass) return;
    if (!this._litters.length && !this._loading) {
      this._loadInitial();
    } else {
      this._ensureSubscription();
    }
  }

  disconnectedCallback() {
    if (this._unsubscribe) Promise.resolve(this._unsubscribe()).catch(() => undefined);
    this._unsubscribe = null;
  }

  getCardSize() { return 6; }
  getGridOptions() { return { columns: 12, min_columns: 6 }; }

  async _loadInitial() {
    if (!this._hass || this._loading) return;
    this._loading = true;
    try {
      const response = await fetchLitters(this._hass);
      this._litters = response?.litters || [];
      this._selectedLitterId = selectDefaultLitter(this._litters, this._selectedLitterId || this._config.litter_id);
      await this._loadData(false);
      await this._ensureSubscription();
    } catch (err) {
      this._error = err?.message || text(this._hass, "loadFailed");
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
    } catch (err) {
      // Keep showing the last good data. The next hass/connected cycle retries.
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
        const response = await fetchLitters(this._hass);
        this._litters = response?.litters || this._litters;
        this._selectedLitterId = selectDefaultLitter(
          this._litters,
          this._selectedLitterId || this._config.litter_id
        );
        await this._loadData(false);
      } while (this._refreshAgain);
      this._error = "";
    } catch (err) {
      this._error = err?.message || text(this._hass, "refreshFailed");
    } finally {
      this._refreshing = false;
      this._render();
    }
  }

  async _loadData(render = true) {
    if (!this._hass || !this._selectedLitterId) return;
    try {
      this._data = await fetchLitterData(this._hass, this._selectedLitterId);
      this._error = "";
    } catch (err) {
      this._error = err?.message || text(this._hass, "litterLoadFailed");
    }
    if (render) this._render();
  }

  _rows() {
    let rows = [...(this._data?.puppies || [])];
    if (this._config.active_only !== false) rows = rows.filter((item) => item.active !== false);
    const dir = this._sortDirection === "desc" ? -1 : 1;
    const numeric = (v, fallback = Number.NEGATIVE_INFINITY) => Number.isFinite(Number(v)) ? Number(v) : fallback;
    rows.sort((a, b) => {
      const sa = a.summary || {};
      const sb = b.summary || {};
      if (this._sortBy === "weight") return (numeric(sa.current_weight) - numeric(sb.current_weight)) * dir;
      if (this._sortBy === "growth24") return (numeric(sa.growth_24h_percent) - numeric(sb.growth_24h_percent)) * dir;
      if (this._sortBy === "last") {
        const ta = sa.last_weighed ? new Date(sa.last_weighed).getTime() : 0;
        const tb = sb.last_weighed ? new Date(sb.last_weighed).getTime() : 0;
        return (ta - tb) * dir;
      }
      if (this._sortBy === "attention") {
        const aa = sa.needs_attention ? 1 : 0;
        const ab = sb.needs_attention ? 1 : 0;
        if (aa !== ab) return (aa - ab) * -dir;
      }
      return String(a.name || "").localeCompare(String(b.name || ""), "nl", { sensitivity: "base" }) * dir;
    });
    return rows;
  }

  _render() {
    const litter = this._data?.litter;
    const summary = litter?.summary || {};
    const rows = this._rows();
    const selector = this._config.show_litter_selector !== false && this._litters.length > 1
      ? `<select id="litter-select">${this._litters.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === this._selectedLitterId ? "selected" : ""}>${escapeHtml(item.name || text(this._hass, "litter"))}</option>`).join("")}</select>`
      : "";
    const detailsEnabled = this._config.show_details !== false;

    const tableRows = rows.map((puppy) => {
      const s = puppy.summary || {};
      const tone = statusTone(s.status_code);
      const expanded = puppy.id === this._expandedPuppyId;
      return `
        <div class="puppy-row ${tone}" data-puppy="${escapeHtml(puppy.id)}">
          <div class="identity"><span class="dot"></span><div><strong>${escapeHtml(puppy.name || text(this._hass, "puppy"))}</strong><small>${escapeHtml(puppy.collar_color || sexLabel(puppy.sex, this._hass))}</small></div></div>
          <div class="cell weight"><b>${formatWeight(s.current_weight, "—", this._hass)}</b><small>${formatSignedWeight(s.change_grams, "—", this._hass)}</small></div>
          <div class="cell growth24"><b>${formatPercent(s.growth_24h_percent, "—", this._hass)}</b><small>24 ${languageForHass(this._hass) === "en" ? "hours" : "uur"}</small></div>
          ${detailsEnabled ? `<div class="cell total-growth"><b>${formatPercent(s.growth_birth_percent, "—", this._hass)}</b><small>${escapeHtml(text(this._hass, "sinceBirth"))}</small></div>` : ""}
          ${detailsEnabled ? `<div class="cell last-weighed"><b>${formatHoursSince(s.hours_since_weighing, "—", this._hass)}</b><small>${escapeHtml(text(this._hass, "lastWeighing").toLowerCase())}</small></div>` : ""}
          <div class="state"><span>${statusIcon(s.status_code)}</span><div><b>${escapeHtml(statusLabel(this._hass, s))}</b><small>${escapeHtml(describeStatus(s, this._hass))}</small></div></div>
        </div>
        ${this._config.show_details !== false && expanded ? `<div class="detail">
          <div><span>${escapeHtml(text(this._hass, "age"))}</span><b>${formatAge(puppy.birth_time, new Date(), this._hass)}</b></div>
          <div><span>${escapeHtml(languageForHass(this._hass) === "en" ? "Sex" : "Geslacht")}</span><b>${escapeHtml(sexLabel(puppy.sex, this._hass))}</b></div>
          <div><span>${escapeHtml(text(this._hass, "birthWeight"))}</span><b>${formatWeight(puppy.birth_weight, "—", this._hass)}</b></div>
          <div><span>${escapeHtml(text(this._hass, "lastMeasurement"))}</span><b>${formatWeight(s.previous_weight, "—", this._hass)}</b></div>
          <div><span>${escapeHtml(text(this._hass, "measurements"))}</span><b>${s.measurement_count ?? 0}</b></div>
          <div><span>${escapeHtml(text(this._hass, "status"))}</span><b>${escapeHtml(statusLabel(this._hass, s))}</b></div>
        </div>` : ""}`;
    }).join("");

    this.shadowRoot.innerHTML = `
      <ha-card>
        <style>
          ha-card{padding:16px;container-type:inline-size;container-name:litter-card}.top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}.title{font-size:18px;font-weight:600}.sub{font-size:12px;color:var(--secondary-text-color);margin-top:2px}
          .controls{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end}select,button{min-height:38px;border:1px solid var(--divider-color);border-radius:10px;background:var(--card-background-color);color:var(--primary-text-color);padding:0 9px;font-size:13px;min-width:0}button{cursor:pointer}.stats{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}.badge{padding:5px 9px;background:var(--secondary-background-color);border-radius:999px;font-size:12px}.badge.danger{color:var(--error-color);font-weight:600}
          .header,.puppy-row{display:grid;grid-template-columns:minmax(150px,1.4fr) .8fr .8fr .9fr .9fr minmax(150px,1.2fr);gap:8px;align-items:center}.basic .header,.basic .puppy-row{grid-template-columns:minmax(150px,1.4fr) .8fr .8fr minmax(150px,1.2fr)}.header{padding:6px 10px;color:var(--secondary-text-color);font-size:11px}.puppy-row{padding:10px;border-top:1px solid var(--divider-color);cursor:pointer;min-width:0}.puppy-row:hover{background:var(--secondary-background-color)}
          .identity,.state{display:flex;align-items:center;gap:8px;min-width:0}.identity .dot{width:10px;height:10px;border-radius:50%;background:var(--primary-color);flex:0 0 auto}.identity div,.state div,.cell{min-width:0}.identity strong,.state b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.identity small,.cell small,.state small{display:block;color:var(--secondary-text-color);font-size:11px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.cell b{font-size:14px}.state>span{display:grid;place-items:center;width:26px;height:26px;border-radius:50%;background:var(--secondary-background-color);font-weight:700;flex:0 0 auto}.danger .state b,.danger .state>span{color:var(--error-color)}.warning .state b{color:var(--warning-color,var(--primary-color))}
          .detail{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px;padding:10px 12px;background:var(--secondary-background-color);border-radius:0 0 12px 12px}.detail div{min-width:0}.detail span{display:block;color:var(--secondary-text-color);font-size:10px}.detail b{display:block;margin-top:2px;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.empty,.error{padding:16px 4px;color:var(--secondary-text-color)}.error{color:var(--error-color)}
          @container litter-card (max-width:720px){.header{display:none}.top{display:block}.controls{justify-content:flex-start;margin-top:10px}.controls select{flex:1 1 140px}.puppy-row{margin-top:8px;border:1px solid var(--divider-color);border-radius:12px;grid-template-columns:repeat(2,minmax(0,1fr));grid-template-areas:"identity identity" "weight growth" "total last" "state state";gap:9px 12px;padding:12px}.basic .puppy-row{grid-template-columns:minmax(0,1.5fr) .8fr .8fr minmax(90px,1fr);grid-template-areas:"identity weight growth state";gap:8px;padding:8px}.identity{grid-area:identity}.weight{grid-area:weight}.growth24{grid-area:growth}.total-growth{grid-area:total}.last-weighed{grid-area:last}.state{grid-area:state;border-top:1px solid var(--divider-color);padding-top:9px}.basic .state{border-top:0;padding-top:0}.cell small,.state small{white-space:normal}.basic .identity small,.basic .cell small,.basic .state small{display:none}.detail{grid-template-columns:repeat(3,minmax(0,1fr));border-radius:12px;margin-top:5px}}
          @container litter-card (max-width:430px){ha-card{padding:13px}.stats{gap:6px}.badge{font-size:11px}.controls{display:grid;grid-template-columns:minmax(0,1fr) auto}.controls select{width:100%}.controls #litter-select{grid-column:1/-1}.puppy-row{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.basic .puppy-row{grid-template-columns:minmax(0,1.35fr) .75fr .75fr minmax(82px,1fr);gap:6px;padding:7px}.identity strong{font-size:15px}.cell b{font-size:15px}.state small{white-space:normal;overflow:visible}.detail{grid-template-columns:repeat(2,minmax(0,1fr))}}
        </style>
        <div class="${this._config.show_details === false ? "basic" : "advanced"}"><div class="top"><div class="title">${escapeHtml(this._config.title || (languageForHass(this._hass) === "en" ? "Litter overview" : "Nestoverzicht"))}<div class="sub">${escapeHtml(litter?.name || (this._loading ? text(this._hass, "loading") : text(this._hass, "noLitter")))}</div></div>
          <div class="controls">${selector}<select id="sort-select"><option value="name" ${this._sortBy === "name" ? "selected" : ""}>${escapeHtml(text(this._hass, "name"))}</option><option value="weight" ${this._sortBy === "weight" ? "selected" : ""}>${escapeHtml(text(this._hass, "weight"))}</option><option value="growth24" ${this._sortBy === "growth24" ? "selected" : ""}>${escapeHtml(text(this._hass, "growth24"))}</option><option value="last" ${this._sortBy === "last" ? "selected" : ""}>${escapeHtml(text(this._hass, "lastWeighing"))}</option><option value="attention" ${this._sortBy === "attention" ? "selected" : ""}>${escapeHtml(text(this._hass, "attention"))}</option></select><button id="dir-button" title="${escapeHtml(text(this._hass, "sortDirection"))}">${this._sortDirection === "asc" ? "↑" : "↓"}</button></div>
        </div>
        ${this._error ? `<div class="error">${escapeHtml(this._error)}</div>` : `
          <div class="stats"><span class="badge">${escapeHtml(text(this._hass, "activePuppies", { count: summary.active_puppies ?? 0 }))}</span><span class="badge ${summary.attention_count ? "danger" : ""}">${escapeHtml(text(this._hass, "attentionCount", { count: summary.attention_count ?? 0 }))}</span><span class="badge">${escapeHtml(text(this._hass, "toWeigh", { count: summary.weigh_due_count ?? 0 }))}</span><span class="badge">${escapeHtml(text(this._hass, "average", { weight: formatWeight(summary.average_weight, "—", this._hass) }))}</span></div>
          <div class="header"><div>${escapeHtml(text(this._hass, "puppy"))}</div><div>${escapeHtml(text(this._hass, "weight"))}</div><div>${escapeHtml(text(this._hass, "growth24"))}</div>${detailsEnabled ? `<div>${escapeHtml(text(this._hass, "totalGrowth"))}</div><div>${escapeHtml(text(this._hass, "last"))}</div>` : ""}<div>${escapeHtml(text(this._hass, "status"))}</div></div>
          ${rows.length ? tableRows : `<div class="empty">${escapeHtml(text(this._hass, "noPuppies"))}</div>`}
        `}</div>
      </ha-card>`;

    this.shadowRoot.getElementById("litter-select")?.addEventListener("change", async (event) => {
      if (!requestLitterChange(this, event.target.value)) return;
      this._selectedLitterId = event.target.value;
      this._expandedPuppyId = null;
      await this._loadData();
    });
    this.shadowRoot.getElementById("sort-select")?.addEventListener("change", (event) => {
      this._sortBy = event.target.value;
      this._render();
    });
    this.shadowRoot.getElementById("dir-button")?.addEventListener("click", () => {
      this._sortDirection = this._sortDirection === "asc" ? "desc" : "asc";
      this._render();
    });
    this.shadowRoot.querySelectorAll(".puppy-row").forEach((row) => row.addEventListener("click", () => {
      const id = row.dataset.puppy;
      this._expandedPuppyId = this._expandedPuppyId === id ? null : id;
      this._render();
    }));
    enhanceLitterCard(this);
  }
}

if (!customElements.get("puppy-tracker-litter-card")) {
  customElements.define("puppy-tracker-litter-card", PuppyTrackerLitterCard);
}
