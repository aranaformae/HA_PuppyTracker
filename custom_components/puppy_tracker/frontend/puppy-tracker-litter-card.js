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
} from "./puppy-tracker-card-common.js";

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
    return { title: "Nestoverzicht", active_only: true, show_details: true, default_sort: "name" };
  }

  static getConfigForm() {
    return {
      schema: [
        { name: "title", selector: { text: {} } },
        { name: "active_only", selector: { boolean: {} } },
        { name: "show_details", selector: { boolean: {} } },
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
    this._config = { title: "Nestoverzicht", active_only: true, show_details: true, default_sort: "name", ...config };
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
      this._error = err?.message || "Nestoverzicht kon niet worden geladen.";
    } finally {
      this._loading = false;
      this._render();
    }
  }

  async _ensureSubscription() {
    if (!this._hass || this._unsubscribe || this._subscriptionPending || !this.isConnected) return;
    this._subscriptionPending = true;
    try {
      this._unsubscribe = await subscribeUpdates(this._hass, () => this._queueRefresh());
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
      this._error = err?.message || "Nieuwe Puppy Tracker-data kon niet worden geladen.";
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
    const detailsEnabled = this._config.show_details !== false;

    const tableRows = rows.map((puppy) => {
      const s = puppy.summary || {};
      const tone = statusTone(s.status_code);
      const expanded = puppy.id === this._expandedPuppyId;
      return `
        <div class="puppy-row ${tone}" data-puppy="${escapeHtml(puppy.id)}">
          <div class="identity"><span class="dot"></span><div><strong>${escapeHtml(puppy.name || "Puppy")}</strong><small>${escapeHtml(puppy.collar_color || sexLabel(puppy.sex))}</small></div></div>
          <div class="cell weight"><b>${formatWeight(s.current_weight)}</b><small>${formatSignedWeight(s.change_grams)}</small></div>
          <div class="cell growth24"><b>${formatPercent(s.growth_24h_percent)}</b><small>24 uur</small></div>
          ${detailsEnabled ? `<div class="cell total-growth"><b>${formatPercent(s.growth_birth_percent)}</b><small>sinds geboorte</small></div>` : ""}
          ${detailsEnabled ? `<div class="cell last-weighed"><b>${formatHoursSince(s.hours_since_weighing)}</b><small>laatste weging</small></div>` : ""}
          <div class="state"><span>${statusIcon(s.status_code)}</span><div><b>${escapeHtml(s.status || "Onbekend")}</b><small>${escapeHtml(describeStatus(s))}</small></div></div>
        </div>
        ${this._config.show_details !== false && expanded ? `<div class="detail">
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
          ha-card{padding:16px;container-type:inline-size;container-name:litter-card}.top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}.title{font-size:18px;font-weight:600}.sub{font-size:12px;color:var(--secondary-text-color);margin-top:2px}
          .controls{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end}select,button{min-height:38px;border:1px solid var(--divider-color);border-radius:10px;background:var(--card-background-color);color:var(--primary-text-color);padding:0 9px;font-size:13px;min-width:0}button{cursor:pointer}.stats{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}.badge{padding:5px 9px;background:var(--secondary-background-color);border-radius:999px;font-size:12px}.badge.danger{color:var(--error-color);font-weight:600}
          .header,.puppy-row{display:grid;grid-template-columns:minmax(150px,1.4fr) .8fr .8fr .9fr .9fr minmax(150px,1.2fr);gap:8px;align-items:center}.basic .header,.basic .puppy-row{grid-template-columns:minmax(150px,1.4fr) .8fr .8fr minmax(150px,1.2fr)}.header{padding:6px 10px;color:var(--secondary-text-color);font-size:11px}.puppy-row{padding:10px;border-top:1px solid var(--divider-color);cursor:pointer;min-width:0}.puppy-row:hover{background:var(--secondary-background-color)}
          .identity,.state{display:flex;align-items:center;gap:8px;min-width:0}.identity .dot{width:10px;height:10px;border-radius:50%;background:var(--primary-color);flex:0 0 auto}.identity div,.state div,.cell{min-width:0}.identity strong,.state b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.identity small,.cell small,.state small{display:block;color:var(--secondary-text-color);font-size:11px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.cell b{font-size:14px}.state>span{display:grid;place-items:center;width:26px;height:26px;border-radius:50%;background:var(--secondary-background-color);font-weight:700;flex:0 0 auto}.danger .state b,.danger .state>span{color:var(--error-color)}.warning .state b{color:var(--warning-color,var(--primary-color))}
          .detail{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px;padding:10px 12px;background:var(--secondary-background-color);border-radius:0 0 12px 12px}.detail div{min-width:0}.detail span{display:block;color:var(--secondary-text-color);font-size:10px}.detail b{display:block;margin-top:2px;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.empty,.error{padding:16px 4px;color:var(--secondary-text-color)}.error{color:var(--error-color)}
          @container litter-card (max-width:720px){.header{display:none}.top{display:block}.controls{justify-content:flex-start;margin-top:10px}.controls select{flex:1 1 140px}.puppy-row{margin-top:8px;border:1px solid var(--divider-color);border-radius:12px;grid-template-columns:repeat(2,minmax(0,1fr));grid-template-areas:"identity identity" "weight growth" "total last" "state state";gap:9px 12px;padding:12px}.basic .puppy-row{grid-template-areas:"identity identity" "weight growth" "state state"}.identity{grid-area:identity}.weight{grid-area:weight}.growth24{grid-area:growth}.total-growth{grid-area:total}.last-weighed{grid-area:last}.state{grid-area:state;border-top:1px solid var(--divider-color);padding-top:9px}.cell small,.state small{white-space:normal}.detail{grid-template-columns:repeat(3,minmax(0,1fr));border-radius:12px;margin-top:5px}}
          @container litter-card (max-width:430px){ha-card{padding:13px}.stats{gap:6px}.badge{font-size:11px}.controls{display:grid;grid-template-columns:minmax(0,1fr) auto}.controls select{width:100%}.controls #litter-select{grid-column:1/-1}.puppy-row{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.identity strong{font-size:15px}.cell b{font-size:15px}.state small{white-space:normal;overflow:visible}.detail{grid-template-columns:repeat(2,minmax(0,1fr))}}
        </style>
        <div class="${this._config.show_details === false ? "basic" : "advanced"}"><div class="top"><div class="title">${escapeHtml(this._config.title)}<div class="sub">${escapeHtml(litter?.name || (this._loading ? "Laden…" : "Geen nest"))}</div></div>
          <div class="controls">${selector}<select id="sort-select"><option value="name" ${this._sortBy === "name" ? "selected" : ""}>Naam</option><option value="weight" ${this._sortBy === "weight" ? "selected" : ""}>Gewicht</option><option value="growth24" ${this._sortBy === "growth24" ? "selected" : ""}>Groei 24u</option><option value="last" ${this._sortBy === "last" ? "selected" : ""}>Laatste weging</option><option value="attention" ${this._sortBy === "attention" ? "selected" : ""}>Aandacht</option></select><button id="dir-button" title="Sorteerrichting">${this._sortDirection === "asc" ? "↑" : "↓"}</button></div>
        </div>
        ${this._error ? `<div class="error">${escapeHtml(this._error)}</div>` : `
          <div class="stats"><span class="badge">${summary.active_puppies ?? 0} pups</span><span class="badge ${summary.attention_count ? "danger" : ""}">${summary.attention_count ?? 0} aandacht</span><span class="badge">${summary.weigh_due_count ?? 0} te wegen</span><span class="badge">gem. ${formatWeight(summary.average_weight)}</span></div>
          <div class="header"><div>Pup</div><div>Gewicht</div><div>Groei 24u</div>${detailsEnabled ? "<div>Totale groei</div><div>Laatste</div>" : ""}<div>Status</div></div>
          ${rows.length ? tableRows : `<div class="empty">Geen pups om te tonen.</div>`}
        `}</div>
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

if (!customElements.get("puppy-tracker-litter-card")) {
  customElements.define("puppy-tracker-litter-card", PuppyTrackerLitterCard);
}
window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === "puppy-tracker-litter-card")) {
  window.customCards.push({ type: "puppy-tracker-litter-card", name: "Puppy Tracker Litter", description: "Sorteerbaar nestoverzicht met actuele groei en status." });
}
