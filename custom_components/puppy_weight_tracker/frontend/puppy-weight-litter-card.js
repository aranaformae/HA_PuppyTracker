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
  selectDefaultLitter,
  sexLabel,
  statusIcon,
  statusTone,
  subscribeUpdates,
} from "./puppy-weight-card-common.js";

class PuppyWeightLitterCard extends HTMLElement {
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
  }

  static getStubConfig() {
    return { title: "Nestoverzicht", active_only: true, default_sort: "name" };
  }

  static getConfigForm() {
    return {
      schema: [
        { name: "title", selector: { text: {} } },
        { name: "active_only", selector: { boolean: {} } },
        {
          name: "default_sort",
          selector: { select: { mode: "dropdown", options: [
            { value: "name", label: "Naam" },
            { value: "weight", label: "Gewicht" },
            { value: "growth24", label: "Groei 24 uur" },
            { value: "last", label: "Laatste weging" },
            { value: "attention", label: "Aandacht" },
          ] } },
        },
      ],
    };
  }

  setConfig(config) {
    this._config = { title: "Nestoverzicht", active_only: true, default_sort: "name", ...config };
    this._selectedLitterId = config.litter_id || this._selectedLitterId;
    this._sortBy = config.default_sort || this._sortBy;
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._litters.length && !this._loading) this._loadInitial();
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
      this._unsubscribe = await subscribeUpdates(this._hass, () => this._loadData(true));
    } catch (err) {
      this._error = err?.message || "Nestoverzicht kon niet worden geladen.";
    } finally {
      this._loading = false;
      this._render();
    }
  }

  async _loadData(render = true) {
    if (!this._hass || !this._selectedLitterId) return;
    try {
      this._data = await fetchLitterData(this._hass, this._selectedLitterId);
      this._error = "";
    } catch (err) {
      this._error = err?.message || "Nestdata kon niet worden geladen.";
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
    const selector = this._litters.length > 1
      ? `<select id="litter-select">${this._litters.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === this._selectedLitterId ? "selected" : ""}>${escapeHtml(item.name || "Nest")}</option>`).join("")}</select>`
      : "";

    const tableRows = rows.map((puppy) => {
      const s = puppy.summary || {};
      const tone = statusTone(s.status_code);
      const expanded = puppy.id === this._expandedPuppyId;
      return `
        <div class="puppy-row ${tone}" data-puppy="${escapeHtml(puppy.id)}">
          <div class="identity"><span class="dot"></span><div><strong>${escapeHtml(puppy.name || "Puppy")}</strong><small>${escapeHtml(puppy.collar_color || sexLabel(puppy.sex))}</small></div></div>
          <div class="cell"><b>${formatWeight(s.current_weight)}</b><small>${formatSignedWeight(s.change_grams)}</small></div>
          <div class="cell"><b>${formatPercent(s.growth_24h_percent)}</b><small>24 uur</small></div>
          <div class="cell optional"><b>${formatPercent(s.growth_birth_percent)}</b><small>sinds geboorte</small></div>
          <div class="cell optional"><b>${formatHoursSince(s.hours_since_weighing)}</b><small>laatste weging</small></div>
          <div class="state"><span>${statusIcon(s.status_code)}</span><div><b>${escapeHtml(s.status || "Onbekend")}</b><small>${escapeHtml(describeStatus(s))}</small></div></div>
        </div>
        ${expanded ? `<div class="detail">
          <div><span>Leeftijd</span><b>${formatAge(puppy.birth_time)}</b></div>
          <div><span>Geslacht</span><b>${escapeHtml(sexLabel(puppy.sex))}</b></div>
          <div><span>Geboortegewicht</span><b>${formatWeight(puppy.birth_weight)}</b></div>
          <div><span>Vorige meting</span><b>${formatWeight(s.previous_weight)}</b></div>
          <div><span>Metingen</span><b>${s.measurement_count ?? 0}</b></div>
          <div><span>Status</span><b>${escapeHtml(s.status || "Onbekend")}</b></div>
        </div>` : ""}`;
    }).join("");

    this.shadowRoot.innerHTML = `
      <ha-card>
        <style>
          ha-card{padding:16px}.top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}.title{font-size:18px;font-weight:600}.sub{font-size:12px;color:var(--secondary-text-color);margin-top:2px}
          .controls{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end}select,button{min-height:38px;border:1px solid var(--divider-color);border-radius:10px;background:var(--card-background-color);color:var(--primary-text-color);padding:0 9px;font-size:13px}button{cursor:pointer}.stats{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}.badge{padding:5px 9px;background:var(--secondary-background-color);border-radius:999px;font-size:12px}.badge.danger{color:var(--error-color);font-weight:600}
          .header,.puppy-row{display:grid;grid-template-columns:minmax(150px,1.4fr) .8fr .8fr .9fr .9fr minmax(150px,1.2fr);gap:8px;align-items:center}.header{padding:6px 10px;color:var(--secondary-text-color);font-size:11px}.puppy-row{padding:10px;border-top:1px solid var(--divider-color);cursor:pointer}.puppy-row:hover{background:var(--secondary-background-color)}
          .identity,.state{display:flex;align-items:center;gap:8px;min-width:0}.identity .dot{width:10px;height:10px;border-radius:50%;background:var(--primary-color);flex:0 0 auto}.identity div,.state div{min-width:0}.identity strong,.state b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.identity small,.cell small,.state small{display:block;color:var(--secondary-text-color);font-size:11px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.cell b{font-size:14px}.state>span{display:grid;place-items:center;width:26px;height:26px;border-radius:50%;background:var(--secondary-background-color);font-weight:700}.danger .state b,.danger .state>span{color:var(--error-color)}.warning .state b{color:var(--warning-color,var(--primary-color))}
          .detail{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px;padding:10px 12px;background:var(--secondary-background-color);border-radius:0 0 12px 12px}.detail div{min-width:0}.detail span{display:block;color:var(--secondary-text-color);font-size:10px}.detail b{display:block;margin-top:2px;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.empty,.error{padding:16px 4px;color:var(--secondary-text-color)}.error{color:var(--error-color)}
          @media(max-width:800px){.header{display:none}.puppy-row{grid-template-columns:minmax(130px,1.4fr) .8fr .8fr minmax(110px,1fr)}.optional{display:none}.detail{grid-template-columns:repeat(3,minmax(0,1fr))}}
          @media(max-width:520px){ha-card{padding:13px}.top{display:block}.controls{justify-content:flex-start;margin-top:10px}.puppy-row{grid-template-columns:minmax(115px,1.4fr) .8fr minmax(92px,1fr);gap:6px}.puppy-row>.cell:nth-of-type(3){display:none}.state small{display:none}.detail{grid-template-columns:repeat(2,minmax(0,1fr))}}
        </style>
        <div class="top"><div class="title">${escapeHtml(this._config.title)}<div class="sub">${escapeHtml(litter?.name || (this._loading ? "Laden…" : "Geen nest"))}</div></div>
          <div class="controls">${selector}<select id="sort-select"><option value="name" ${this._sortBy === "name" ? "selected" : ""}>Naam</option><option value="weight" ${this._sortBy === "weight" ? "selected" : ""}>Gewicht</option><option value="growth24" ${this._sortBy === "growth24" ? "selected" : ""}>Groei 24u</option><option value="last" ${this._sortBy === "last" ? "selected" : ""}>Laatste weging</option><option value="attention" ${this._sortBy === "attention" ? "selected" : ""}>Aandacht</option></select><button id="dir-button" title="Sorteerrichting">${this._sortDirection === "asc" ? "↑" : "↓"}</button></div>
        </div>
        ${this._error ? `<div class="error">${escapeHtml(this._error)}</div>` : `
          <div class="stats"><span class="badge">${summary.active_puppies ?? 0} pups</span><span class="badge ${summary.attention_count ? "danger" : ""}">${summary.attention_count ?? 0} aandacht</span><span class="badge">${summary.weigh_due_count ?? 0} te wegen</span><span class="badge">gem. ${formatWeight(summary.average_weight)}</span></div>
          <div class="header"><div>Pup</div><div>Gewicht</div><div>Groei 24u</div><div>Totale groei</div><div>Laatste</div><div>Status</div></div>
          ${rows.length ? tableRows : `<div class="empty">Geen pups om te tonen.</div>`}
        `}
      </ha-card>`;

    this.shadowRoot.getElementById("litter-select")?.addEventListener("change", async (event) => {
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
  }
}

if (!customElements.get("puppy-weight-litter-card")) {
  customElements.define("puppy-weight-litter-card", PuppyWeightLitterCard);
}
window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === "puppy-weight-litter-card")) {
  window.customCards.push({ type: "puppy-weight-litter-card", name: "Puppy Weight Litter", description: "Sorteerbaar nestoverzicht met actuele groei en status." });
}
