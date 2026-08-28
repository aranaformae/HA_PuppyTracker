import {
  downloadTextFile,
  escapeHtml,
  fetchExport,
  fetchLitterData,
  fetchLitters,
  filterMeasurements,
  formatAge,
  formatDateTime,
  formatPercent,
  formatSignedWeight,
  formatWeight,
  rangeToHours,
  selectDefaultLitter,
  sexLabel,
  subscribeUpdates,
} from "./puppy-weight-card-common.js";

class PuppyWeightReportCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass = null;
    this._config = {};
    this._litters = [];
    this._selectedLitterId = null;
    this._selectedPuppyId = "all";
    this._range = "all";
    this._data = null;
    this._loading = false;
    this._error = "";
    this._status = "";
    this._unsubscribe = null;
    this._subscriptionPending = false;
    this._refreshing = false;
    this._refreshAgain = false;
  }

  static getStubConfig() {
    return { title: "Rapport & export", default_range: "all" };
  }

  static getConfigForm() {
    return {
      schema: [
        { name: "title", selector: { text: {} } },
        {
          name: "default_range",
          selector: { select: { mode: "dropdown", options: [
            { value: "24h", label: "24 uur" },
            { value: "3d", label: "3 dagen" },
            { value: "7d", label: "7 dagen" },
            { value: "14d", label: "14 dagen" },
            { value: "30d", label: "30 dagen" },
            { value: "all", label: "Alles" },
          ] } },
        },
      ],
    };
  }

  setConfig(config) {
    this._config = { title: "Rapport & export", default_range: "all", ...config };
    this._selectedLitterId = config.litter_id || this._selectedLitterId;
    this._range = config.default_range || this._range;
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

  getCardSize() { return 5; }
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
      this._error = err?.message || "Rapportgegevens konden niet worden geladen.";
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
      this._error = err?.message || "Nieuwe Puppy Weight Tracker-data kon niet worden geladen.";
    } finally {
      this._refreshing = false;
      this._render();
    }
  }

  async _loadData(render = true) {
    if (!this._hass || !this._selectedLitterId) return;
    try {
      this._data = await fetchLitterData(this._hass, this._selectedLitterId);
      if (this._selectedPuppyId !== "all" && !(this._data.puppies || []).some((p) => p.id === this._selectedPuppyId)) {
        this._selectedPuppyId = "all";
      }
      this._error = "";
    } catch (err) {
      this._error = err?.message || "Nestdata kon niet worden geladen.";
    }
    if (render) this._render();
  }

  _selectedPuppies() {
    const puppies = (this._data?.puppies || []).filter((p) => p.active !== false);
    if (this._selectedPuppyId === "all") return puppies;
    return puppies.filter((p) => p.id === this._selectedPuppyId);
  }

  _rangeLabel() {
    return { "24h": "Laatste 24 uur", "3d": "Laatste 3 dagen", "7d": "Laatste 7 dagen", "14d": "Laatste 14 dagen", "30d": "Laatste 30 dagen", all: "Volledige historie" }[this._range] || "Volledige historie";
  }

  _measurementRows(puppy) {
    return filterMeasurements(puppy.measurements || [], rangeToHours(this._range));
  }

  _chartSvg(puppies) {
    const all = [];
    puppies.forEach((puppy, index) => {
      const rows = this._measurementRows(puppy)
        .map((m) => ({ t: new Date(m.timestamp).getTime(), w: Number(m.weight), name: puppy.name, index }))
        .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.w));
      all.push(...rows);
    });
    if (all.length < 2) return "";
    const minT = Math.min(...all.map((p) => p.t));
    const maxT = Math.max(...all.map((p) => p.t));
    const minW0 = Math.min(...all.map((p) => p.w));
    const maxW0 = Math.max(...all.map((p) => p.w));
    const padW = Math.max(10, (maxW0 - minW0) * 0.1);
    const minW = Math.max(0, minW0 - padW);
    const maxW = maxW0 + padW;
    const width = 760, height = 250, left = 48, right = 18, top = 20, bottom = 32;
    const x = (t) => left + ((t - minT) / Math.max(1, maxT - minT)) * (width - left - right);
    const y = (w) => top + (1 - (w - minW) / Math.max(1, maxW - minW)) * (height - top - bottom);
    const palette = ["#3465a4", "#4e9a06", "#cc0000", "#75507b", "#c17d11", "#06989a", "#555753"];
    const lines = puppies.map((puppy, index) => {
      const pts = this._measurementRows(puppy)
        .map((m) => ({ t: new Date(m.timestamp).getTime(), w: Number(m.weight) }))
        .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.w))
        .sort((a, b) => a.t - b.t);
      if (!pts.length) return "";
      const points = pts.map((p) => `${x(p.t).toFixed(1)},${y(p.w).toFixed(1)}`).join(" ");
      return `<polyline points="${points}" fill="none" stroke="${palette[index % palette.length]}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
    }).join("");
    const legend = puppies.map((p, i) => `<span style="margin-right:14px"><span style="display:inline-block;width:10px;height:3px;background:${palette[i % palette.length]};vertical-align:middle;margin-right:5px"></span>${escapeHtml(p.name || "Puppy")}</span>`).join("");
    return `<div class="chart"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Gewichtsgrafiek"><line x1="${left}" y1="${height-bottom}" x2="${width-right}" y2="${height-bottom}" stroke="#aaa"/><line x1="${left}" y1="${top}" x2="${left}" y2="${height-bottom}" stroke="#aaa"/><text x="8" y="${top+8}" font-size="11">${Math.round(maxW)} g</text><text x="8" y="${height-bottom}" font-size="11">${Math.round(minW)} g</text>${lines}</svg><div class="legend">${legend}</div></div>`;
  }

  _buildReportHtml() {
    const litter = this._data?.litter || {};
    const puppies = this._selectedPuppies();
    const generated = new Intl.DateTimeFormat("nl-NL", { dateStyle: "long", timeStyle: "short" }).format(new Date());
    const currentWarnings = puppies.filter((p) => p.summary?.needs_attention);
    const title = this._selectedPuppyId === "all"
      ? `Puppy Weight Tracker – ${litter.name || "Nest"}`
      : `Puppy Weight Tracker – ${puppies[0]?.name || "Puppy"}`;

    const summaryRows = puppies.map((p) => {
      const s = p.summary || {};
      return `<tr><td>${escapeHtml(p.name || "Puppy")}</td><td>${escapeHtml(p.collar_color || "")}</td><td>${escapeHtml(sexLabel(p.sex))}</td><td>${formatAge(p.birth_time)}</td><td>${formatWeight(p.birth_weight)}</td><td>${formatWeight(s.current_weight)}</td><td>${formatPercent(s.growth_24h_percent)}</td><td>${formatPercent(s.growth_birth_percent)}</td><td>${escapeHtml(s.status || "")}</td></tr>`;
    }).join("");

    const measurementSections = puppies.map((p) => {
      const rows = this._measurementRows(p).slice().sort((a,b) => new Date(a.timestamp)-new Date(b.timestamp));
      let previous = null;
      const body = rows.map((m) => {
        const weight = Number(m.weight);
        const diff = Number.isFinite(previous) && Number.isFinite(weight) ? weight - previous : null;
        previous = Number.isFinite(weight) ? weight : previous;
        return `<tr><td>${escapeHtml(formatDateTime(m.timestamp))}</td><td>${formatWeight(weight)}</td><td>${formatSignedWeight(diff)}</td><td>${escapeHtml(m.kind || "")}</td><td>${escapeHtml(m.note || "")}</td></tr>`;
      }).join("");
      return `<section><h2>${escapeHtml(p.name || "Puppy")}${p.collar_color ? ` – ${escapeHtml(p.collar_color)}` : ""}</h2><table><thead><tr><th>Datum/tijd</th><th>Gewicht</th><th>Verschil</th><th>Type</th><th>Notitie</th></tr></thead><tbody>${body || `<tr><td colspan="5">Geen metingen in deze periode.</td></tr>`}</tbody></table></section>`;
    }).join("");

    return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
      @page{size:A4;margin:14mm}*{box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;color:#222;font-size:11px;line-height:1.35;margin:0}h1{font-size:22px;margin:0 0 4px}h2{font-size:15px;margin:20px 0 7px}.meta{color:#666;margin-bottom:14px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:12px 0}.box{border:1px solid #ddd;border-radius:8px;padding:8px}.box span{display:block;color:#666;font-size:9px}.box b{display:block;margin-top:2px;font-size:12px}.warning{border-left:4px solid #c00;background:#faf5f5;padding:8px 10px;margin:8px 0}.ok{border-left:4px solid #398439;background:#f5faf5;padding:8px 10px;margin:8px 0}table{width:100%;border-collapse:collapse;margin:6px 0 14px}th,td{text-align:left;padding:5px 6px;border-bottom:1px solid #ddd;vertical-align:top}th{font-size:9px;color:#555;background:#f5f5f5}.chart{margin:12px 0 18px;page-break-inside:avoid}.chart svg{width:100%;height:auto;display:block}.legend{font-size:9px;margin-top:4px}section{page-break-inside:auto}tr{page-break-inside:avoid}.footer{margin-top:20px;padding-top:8px;border-top:1px solid #ddd;color:#777;font-size:9px}@media print{button{display:none}}
    </style></head><body><h1>${escapeHtml(title)}</h1><div class="meta">${escapeHtml(this._rangeLabel())} · gegenereerd ${escapeHtml(generated)}</div>
      <div class="grid"><div class="box"><span>Nest</span><b>${escapeHtml(litter.name || "—")}</b></div><div class="box"><span>Moeder</span><b>${escapeHtml(litter.mother || "—")}</b></div><div class="box"><span>Vader</span><b>${escapeHtml(litter.father || "—")}</b></div><div class="box"><span>Pups in rapport</span><b>${puppies.length}</b></div></div>
      ${currentWarnings.length ? `<div class="warning"><b>Actuele aandachtspunten</b><br>${currentWarnings.map((p) => `${escapeHtml(p.name || "Puppy")}: ${escapeHtml(p.summary?.status || "Aandacht")}`).join(" · ")}</div>` : `<div class="ok"><b>Actuele status:</b> geen actieve waarschuwingen voor de pups in dit rapport.</div>`}
      <h2>Samenvatting</h2><table><thead><tr><th>Pup</th><th>Band</th><th>Geslacht</th><th>Leeftijd</th><th>Geboorte</th><th>Huidig</th><th>Groei 24u</th><th>Totale groei</th><th>Status</th></tr></thead><tbody>${summaryRows}</tbody></table>
      ${this._chartSvg(puppies)}${measurementSections}
      <div class="footer">Gegenereerd door Puppy Weight Tracker. Monitoringwaarden zijn bedoeld als hulpmiddel bij het volgen van groei en vervangen geen veterinaire beoordeling.</div>
    </body></html>`;
  }

  _printReport() {
    if (!this._data) return;

    // Print from a same-origin iframe instead of window.open(). This avoids
    // popup blockers in Safari, iPadOS and the Home Assistant companion app.
    const existing = document.getElementById("puppy-weight-tracker-print-frame");
    existing?.remove();

    const frame = document.createElement("iframe");
    frame.id = "puppy-weight-tracker-print-frame";
    frame.setAttribute("title", "Puppy Weight Tracker afdrukrapport");
    frame.style.position = "fixed";
    frame.style.right = "0";
    frame.style.bottom = "0";
    frame.style.width = "1px";
    frame.style.height = "1px";
    frame.style.opacity = "0";
    frame.style.pointerEvents = "none";
    frame.style.border = "0";

    const cleanup = () => {
      window.setTimeout(() => frame.remove(), 250);
    };

    frame.addEventListener("load", () => {
      try {
        const printWindow = frame.contentWindow;
        if (!printWindow) throw new Error("Geen afdrukvenster beschikbaar");
        printWindow.addEventListener?.("afterprint", cleanup, { once: true });
        printWindow.focus();
        window.setTimeout(() => {
          try {
            printWindow.print();
            this._status = "Afdrukdialoog geopend. Kies op iPad/iPhone 'Bewaar in Bestanden' of deel als PDF.";
            this._render();
          } catch (err) {
            cleanup();
            this._status = err?.message || "Afdrukken kon niet worden gestart.";
            this._render();
          }
        }, 80);
      } catch (err) {
        cleanup();
        this._status = err?.message || "Afdrukken kon niet worden gestart.";
        this._render();
      }
    }, { once: true });

    frame.srcdoc = this._buildReportHtml();
    document.body.appendChild(frame);
    window.setTimeout(() => { if (frame.isConnected) frame.remove(); }, 60000);
  }

  async _export(format) {
    if (!this._hass || !this._selectedLitterId) return;
    this._status = `${format.toUpperCase()} voorbereiden…`;
    this._render();
    try {
      const result = await fetchExport(
        this._hass,
        this._selectedLitterId,
        format,
        format === "csv"
          ? {
              puppy_id: this._selectedPuppyId === "all" ? null : this._selectedPuppyId,
              range_hours: rangeToHours(this._range),
            }
          : {}
      );
      downloadTextFile(result);
      this._status = format === "json" ? "Volledige JSON-backup gedownload." : "CSV gedownload.";
    } catch (err) {
      this._status = err?.message || "Export mislukt.";
    }
    this._render();
  }

  _render() {
    const litter = this._data?.litter;
    const puppies = (this._data?.puppies || []).filter((p) => p.active !== false);
    const selected = this._selectedPuppies();
    const warnings = selected.filter((p) => p.summary?.needs_attention).length;
    const measurementCount = selected.reduce((sum, p) => sum + this._measurementRows(p).length, 0);
    const litterOptions = this._litters.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === this._selectedLitterId ? "selected" : ""}>${escapeHtml(item.name || "Nest")}</option>`).join("");
    const puppyOptions = `<option value="all" ${this._selectedPuppyId === "all" ? "selected" : ""}>Compleet nest</option>${puppies.map((p) => `<option value="${escapeHtml(p.id)}" ${p.id === this._selectedPuppyId ? "selected" : ""}>${escapeHtml(p.name || "Puppy")}${p.collar_color ? ` – ${escapeHtml(p.collar_color)}` : ""}</option>`).join("")}`;

    this.shadowRoot.innerHTML = `
      <ha-card><style>
        ha-card{padding:16px;container-type:inline-size;container-name:report-card}.title{font-size:18px;font-weight:600;margin-bottom:3px}.sub{font-size:12px;color:var(--secondary-text-color);margin-bottom:12px}.controls{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.field{min-width:0}.field label{display:block;font-size:11px;color:var(--secondary-text-color);margin:0 0 4px 2px}.field select{width:100%;min-width:0;min-height:42px;border:1px solid var(--divider-color);border-radius:10px;background:var(--card-background-color);color:var(--primary-text-color);padding:0 9px;font-size:14px}.preview{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:12px}.box{min-width:0;border:1px solid var(--divider-color);border-radius:12px;padding:10px}.box span{display:block;font-size:11px;color:var(--secondary-text-color)}.box b{display:block;margin-top:3px;font-size:16px}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.actions button{min-height:42px;border:0;border-radius:10px;padding:0 13px;font-weight:600;cursor:pointer;background:var(--primary-color);color:var(--text-primary-color,#fff)}.actions button.secondary{background:var(--secondary-background-color);color:var(--primary-text-color);border:1px solid var(--divider-color)}.status{font-size:12px;color:var(--secondary-text-color);margin-top:9px}.error{color:var(--error-color)}.note{font-size:11px;color:var(--secondary-text-color);margin-top:10px;line-height:1.4}
        @container report-card (max-width:600px){.controls{grid-template-columns:1fr}.preview{grid-template-columns:repeat(3,minmax(0,1fr))}.actions button{flex:1 1 auto}}
        @container report-card (max-width:380px){ha-card{padding:13px}.preview{grid-template-columns:1fr}.actions{display:grid;grid-template-columns:1fr}.actions button{width:100%}}
      </style>
      <div class="title">${escapeHtml(this._config.title)}</div><div class="sub">Printvriendelijk pup- of nestrapport met bestaande CSV/JSON-export.</div>
      ${this._error ? `<div class="error">${escapeHtml(this._error)}</div>` : `
      <div class="controls"><div class="field"><label>Nest</label><select id="litter">${litterOptions}</select></div><div class="field"><label>Rapport</label><select id="puppy">${puppyOptions}</select></div><div class="field"><label>Periode</label><select id="range"><option value="24h" ${this._range === "24h" ? "selected" : ""}>24 uur</option><option value="3d" ${this._range === "3d" ? "selected" : ""}>3 dagen</option><option value="7d" ${this._range === "7d" ? "selected" : ""}>7 dagen</option><option value="14d" ${this._range === "14d" ? "selected" : ""}>14 dagen</option><option value="30d" ${this._range === "30d" ? "selected" : ""}>30 dagen</option><option value="all" ${this._range === "all" ? "selected" : ""}>Alles</option></select></div></div>
      <div class="preview"><div class="box"><span>Pups</span><b>${selected.length}</b></div><div class="box"><span>Metingen</span><b>${measurementCount}</b></div><div class="box"><span>Actuele aandacht</span><b>${warnings}</b></div></div>
      <div class="actions"><button id="print">Afdrukken / PDF</button><button class="secondary" id="csv">CSV</button><button class="secondary" id="json">JSON-backup</button></div>
      <div class="status">${escapeHtml(this._status)}</div><div class="note">Het PDF-rapport en CSV-bestand volgen de gekozen pup en periode. JSON blijft bewust een volledige nestbackup inclusief correctie- en verwijderhistorie.</div>`}
      </ha-card>`;

    this.shadowRoot.getElementById("litter")?.addEventListener("change", async (e) => { this._selectedLitterId = e.target.value; this._selectedPuppyId = "all"; await this._loadData(); });
    this.shadowRoot.getElementById("puppy")?.addEventListener("change", (e) => { this._selectedPuppyId = e.target.value; this._render(); });
    this.shadowRoot.getElementById("range")?.addEventListener("change", (e) => { this._range = e.target.value; this._render(); });
    this.shadowRoot.getElementById("print")?.addEventListener("click", () => this._printReport());
    this.shadowRoot.getElementById("csv")?.addEventListener("click", () => this._export("csv"));
    this.shadowRoot.getElementById("json")?.addEventListener("click", () => this._export("json"));
  }
}

if (!customElements.get("puppy-weight-report-card")) {
  customElements.define("puppy-weight-report-card", PuppyWeightReportCard);
}
window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === "puppy-weight-report-card")) {
  window.customCards.push({ type: "puppy-weight-report-card", name: "Puppy Weight Report", description: "Print/PDF-rapporten en export voor Puppy Weight Tracker." });
}
