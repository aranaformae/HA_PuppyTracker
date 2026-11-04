// A quiet, on-demand comparison. Local disclosure/filter state survives its
// parent's renders; no subscription, polling, observers or global listeners.
import { languageForHass, puppySelectorLabel } from "./puppy-tracker-card-common.js";
import { collarColor } from "./puppy-tracker-collar-chart-colors.js";

const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

class PuppyTrackerGrowthComparison extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._open = false;
    this._mode = "peers";
    this._filter = "all";
    this._request = null;
    this._data = null;
    this._error = false;
    this._weeksOpen = false;
    this._methodOpen = false;
    this.shadowRoot.addEventListener("toggle", event => {
      const panel = event.target.dataset?.panel;
      if (panel === "weeks") this._weeksOpen = event.target.open;
      if (panel === "method") this._methodOpen = event.target.open;
    }, true);
  }

  setContext({ hass, litterId, puppyId, revision }) {
    const language = languageForHass(hass);
    const changed = this._litterId !== litterId || this._revision !== revision || this._connection !== hass?.connection;
    const repaint = changed || this._puppyId !== puppyId || this._language !== language;
    this._hass = hass;
    this._connection = hass?.connection;
    this._language = language;
    this._puppyId = puppyId;
    if (changed) {
      this._litterId = litterId;
      this._revision = revision;
      this._request = null;
      this._data = null;
      this._error = false;
    }
    if (repaint) this._render();
    if (changed && litterId && !this._request) void this._load();
  }

  _t(nl, en) { return this._language === "en" ? en : nl; }
  _number(value, suffix = "", signed = false) {
    if (!Number.isFinite(value)) return "—";
    return `${signed && value > 0 ? "+" : ""}${new Intl.NumberFormat(this._language, { maximumFractionDigits: 1 }).format(value)}${suffix}`;
  }

  async _load() {
    const token = Symbol();
    this._request = token;
    this._error = false;
    this._render();
    try {
      const data = await this._hass.callWS({ type: "puppy_tracker/growth_comparison", litter_id: this._litterId,
        include_history: this._mode === "history", reference_filter: this._filter });
      if (this._request !== token) return;
      this._data = data;
    } catch {
      if (this._request !== token) return;
      this._error = true;
    } finally {
      if (this._request === token) {
        this._request = null;
        this._render();
      }
    }
  }

  _segments(points, key) {
    const segments = [];
    let previous = -2;
    for (const point of points || []) {
      if (!Number.isFinite(point[key])) { previous = -2; continue; }
      if (point.day !== previous + 1) segments.push([]);
      segments.at(-1).push({ day: point.day, value: point[key], source: point });
      previous = point.day;
    }
    return segments;
  }

  _chart(puppy) {
    const history = this._mode === "history";
    const curves = this._data?.puppies || [];
    const sources = this._data?.history?.sources || [];
    const reference = this._data?.history?.reference || [];
    const series = history ? [
      ...(sources.length < 5 ? sources.map(source => ({ ...source, color: "var(--secondary-text-color,#666)", faded: true })) : []),
      { name: this._t("Eigen referentie", "Personal reference"), points: reference, color: "var(--primary-text-color,#222)", reference: true },
      { ...puppy, points: puppy?.age_points, color: collarColor(puppy?.collar_color, 0), selected: true },
    ] : curves.map((curve, index) => ({ ...curve, color: collarColor(curve.collar_color, index), selected: curve.id === this._puppyId }));
    const key = history ? "birth_factor" : "relative_weight_percent";
    const values = series.flatMap(s => (s.points || []).flatMap(p => [p[key], ...(history ? [p.lower_factor, p.upper_factor] : [])])).filter(Number.isFinite);
    if (!values.length) return `<p>${this._t("Nog geen vergelijkbare metingen.", "No comparable measurements yet.")}</p>`;
    const baseline = history ? 1 : 100;
    const low = Math.min(baseline, ...values), high = Math.max(baseline, ...values);
    const padding = Math.max((high - low) * .12, history ? .2 : 5);
    const min = Math.max(0, low - padding), max = high + padding;
    const x = day => 48 + day / 56 * 500;
    const y = value => 188 - (value - min) / (max - min) * 170;
    const path = points => points.map((p, index) => `${index ? "L" : "M"}${x(p.day).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
    const band = history ? this._segments(reference, "lower_factor").map(segment => {
      const upper = segment.map(p => ({ day: p.day, value: p.source.upper_factor }));
      return `<path class="band" d="${path(segment)} ${path(upper.reverse()).replace(/^M/, "L")} Z"/>`;
    }).join("") : "";
    return `<svg viewBox="0 0 566 222" role="img" aria-label="${this._t("Vergelijking van geboorte tot acht weken", "Comparison from birth to eight weeks")}">
      ${[0, 1, 2, 3, 4].map(step => { const value = min + (max - min) * step / 4; return `<line x1="48" x2="548" y1="${y(value)}" y2="${y(value)}"/><text x="42" y="${y(value) + 4}" text-anchor="end">${this._number(value, history ? "×" : "%")}</text>`; }).join("")}
      ${Array.from({ length: 9 }, (_, week) => `<text x="${x(week * 7)}" y="209" text-anchor="middle">${week}</text>`).join("")}
      ${band}${!history ? `<line class="baseline" x1="48" x2="548" y1="${y(100)}" y2="${y(100)}"/>` : ""}
      ${series.map(s => this._segments(s.points, key).map(segment => `<path d="${path(segment)}" style="stroke:${escape(s.color)};opacity:${s.faded ? .25 : s.selected || s.reference ? 1 : .45};stroke-width:${s.selected ? 3 : 1.5}"/>${segment.length === 1 ? `<circle cx="${x(segment[0].day)}" cy="${y(segment[0].value)}" r="3" style="fill:${escape(s.color)}"/>` : ""}`).join("")).join("")}
      </svg><small>${this._t("Leeftijd in weken", "Age in weeks")} · ${history ? this._t("Veelvoud geboortegewicht", "Multiple of birth weight") : this._t("100% = mediaan van de andere pups", "100% = median of the other puppies")}</small>
      <div class="legend">${series.map(s => `<span><i style="background:${escape(s.color)}"></i>${escape(s.id && curves.some(c => c.id === s.id) ? puppySelectorLabel(s) : s.name)}</span>`).join("")}</div>`;
  }

  _historyWeeks(puppy, reference) {
    const rows = Array.from({ length: 8 }, (_, index) => {
      const day = (index + 1) * 7;
      const own = puppy?.age_points?.find(p => p.day === day);
      const ref = reference.find(p => p.day === day);
      return `<tr><th>${index + 1}</th><td>${this._number(own?.birth_factor, "×")}${own?.interpolated ? "*" : ""}</td><td>${this._number(ref?.birth_factor, "×")}${ref?.interpolated ? "*" : ""}</td><td>${this._number(own?.birth_factor && ref?.birth_factor ? own.birth_factor / ref.birth_factor * 100 : null, "%")}</td><td>${ref ? `${ref.litter_count} / ${ref.puppy_count}` : "—"}</td></tr>`;
    }).join("");
    return `<div class="table-scroll" tabindex="0" aria-label="${this._t("Historisch weekoverzicht", "Historical weekly overview")}"><table><thead><tr><th>${this._t("Week", "Week")}</th><th>${this._t("Geboortegewicht ×", "Birth weight ×")}</th><th>${this._t("Eigen referentie", "Personal reference")}</th><th>${this._t("T.o.v. referentie", "Compared with reference")}</th><th>${this._t("Nesten / pups", "Litters / puppies")}</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  _body(puppy) {
    if (this._error) return `<p role="alert">${this._t("Vergelijking laden mislukt.", "Could not load comparison.")} <button id="retry">${this._t("Opnieuw proberen", "Try again")}</button></p>`;
    if (this._request || !this._data) return `<p role="status">${this._t("Vergelijking laden…", "Loading comparison…")}</p>`;
    const historical = this._mode === "history";
    const reference = this._data.history?.reference || [];
    const latest = [...(puppy?.age_points || [])].reverse().find(p => p.birth_factor && reference.some(r => r.day === p.day));
    const comparable = reference.find(r => r.day === latest?.day);
    const sources = this._data.history?.sources || [];
    return `${historical ? `<p>${sources.length} ${this._t("eerdere nesten beschikbaar", "earlier litters available")}. ${this._t("Elk nest telt even zwaar. Alleen eigen gegevens; geen gezondheidsnorm.", "Each litter has equal weight. Your own data only; not a health standard.")}</p>
      ${comparable ? `<p><strong>${this._number(latest.birth_factor / comparable.birth_factor * 100, "%")}</strong> ${this._t("van de eigen referentie op dag", "of the personal reference on day")} ${latest.day} · ${comparable.litter_count} ${this._t("nesten", "litters")} / ${comparable.puppy_count} ${this._t("pups", "puppies")}</p>` : `<p>${this._t("Nog geen historische vergelijking op dezelfde leeftijd beschikbaar.", "No historical comparison at the same age available yet.")}</p>`}` : ""}
      ${this._chart(puppy)}
      <details data-panel="weeks" ${this._weeksOpen ? "open" : ""}><summary>${this._t("Weekcijfers bekijken", "View weekly figures")}</summary>
      ${historical ? this._historyWeeks(puppy, reference) : ""}
      ${historical ? "" : `
      <div class="table-scroll" tabindex="0" aria-label="${this._t("Weekoverzicht", "Weekly overview")}"><table><thead><tr><th>${this._t("Week", "Week")}</th><th>${this._t("T.o.v. nestgenoten", "Compared with littermates")}</th><th>${this._t("Verschil vorige week", "Change from last week")}</th><th>${this._t("Groeitempo¹", "Growth rate¹")}</th><th>${this._t("Geboortegewicht ×", "Birth weight ×")}</th><th>${this._t("Mediaan / gemiddeld²", "Median / mean²")}</th><th>${this._t("Andere pups", "Other puppies")}</th></tr></thead><tbody>${(puppy?.weeks || []).map(row => `<tr><th>${row.week}</th><td>${this._number(row.comparison?.relative_weight_percent, "%")}${row.comparison?.interpolated ? "*" : ""}</td><td>${this._number(row.comparison?.position_change_points, this._t(" pp", " pp"), true)}</td><td>${this._number(row.comparison?.relative_growth_percent, "%")}</td><td>${this._number(row.age_point?.birth_factor, "×")}</td><td>${this._number(row.comparison?.peer_median_grams, " g")} / ${this._number(row.comparison?.peer_mean_grams, " g")}</td><td>${row.comparison?.peer_count ?? "—"}</td></tr>`).join("")}</tbody></table></div>
      <small>${this._t("¹ Gramgroei over zeven dagen t.o.v. de andere pups (100% = hun mediaan); alleen bij positief nesttempo. ² Gewicht van de andere pups op die leeftijd. pp = procentpunten.", "¹ Seven-day growth in grams compared with other puppies (100% = their median); only with positive litter growth. ² Weight of the other puppies at that age. pp = percentage points.")}</small>`}
      </details><details data-panel="method" ${this._methodOpen ? "open" : ""}><summary>${this._t("Berekening en datakwaliteit", "Calculation and data quality")}</summary>
      <p>${historical ? this._t("Bij minder dan vijf nesten zie je losse nestcurves. Vanaf vijf nesten op dezelfde leeftijd verschijnt de middelste 50% als spreidingsband; geen voorspellingsinterval.", "With fewer than five litters, individual litter curves are shown. From five litters at the same age, the middle 50% forms a spread band; not a prediction interval.") : this._t("De geselecteerde pup telt niet mee in zijn eigen referentie. Een lager percentage betekent kleiner, niet automatisch minder gezond. De verandering sinds vorige week blijft leeg als de groep vergelijkbare nestgenoten is veranderd.", "The selected puppy is excluded from its own reference. A lower percentage means smaller, not automatically less healthy. Change since last week stays empty if the comparable littermate group changed.")}</p>
      <p class="method">${this._t("Dag 0–56, op dezelfde leeftijd per pup. * Tussenliggende gewichten worden alleen geschat tussen metingen met maximaal 72 uur ertussen. Geen extrapolatie; ontbrekende gegevens blijven leeg. Laatste metingen kunnen daarom recenter zijn dan de vergelijking.", "Days 0–56, at the same age per puppy. * Intermediate weights are estimated only between measurements at most 72 hours apart. No extrapolation; missing data stays empty. Latest measurements may therefore be more recent than the comparison.")}</p></details>`;
  }

  _render() {
    const puppy = this._data?.puppies?.find(p => p.id === this._puppyId);
    const summary = puppy?.summary;
    const disclosure = this.shadowRoot.querySelector("details");
    if (disclosure) this._open = disclosure.open;
    const loading = (this._request || !this._data) && !this._error && this._open;
    if (loading && !this._pendingBodyHeight) {
      this._pendingBodyHeight = this.shadowRoot.querySelector(".body")?.getBoundingClientRect().height || 0;
    }
    const structure = this._language;
    const markup = `<style>
      :host{display:block;min-width:0;margin-top:14px}section{border-top:1px solid var(--divider-color,#ddd);padding-top:12px}h4,p{margin:0 0 8px}p,small{color:var(--secondary-text-color,#666);line-height:1.5}strong{color:var(--primary-text-color,#222)}.brief{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap}summary{cursor:pointer;min-height:44px;align-content:center;color:var(--primary-color,#03a9f4);font-weight:600}select,button{font:inherit;color:var(--primary-text-color,#222);background:var(--card-background-color,#fff);border:1px solid var(--divider-color,#ddd);border-radius:8px;min-height:44px;padding:8px;max-width:100%}.controls{display:flex;gap:10px;flex-wrap:wrap;margin:8px 0}.controls label[hidden]{display:none}.controls label{display:grid;gap:5px;min-width:0}svg{display:block;width:100%;height:auto;max-height:300px}svg text{fill:var(--secondary-text-color,#666);font-size:11px}svg line{stroke:var(--divider-color,#ddd)}svg path{fill:none;stroke-linejoin:round;stroke-linecap:round}svg .baseline{stroke:var(--primary-text-color,#222);stroke-dasharray:4 4}svg .band{fill:var(--primary-color,#03a9f4);opacity:.12;stroke:none}.legend{display:flex;flex-wrap:wrap;gap:6px 14px;max-height:100px;overflow:auto;margin:10px 0}.legend span{font-size:12px}.legend i{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:5px}.table-scroll{max-height:340px;overflow:auto;margin:12px 0}table{border-collapse:collapse;font-size:12px;width:100%}th,td{padding:9px;text-align:left;border-bottom:1px solid var(--divider-color,#ddd);white-space:nowrap}thead{background:var(--card-background-color,#fff);position:sticky;top:0}.method{font-size:12px;margin-top:12px}.body{min-height:70px}
      </style><section><h4>${this._t("Vergelijking met nestgenoten", "Littermate comparison")}</h4>
      <p class="brief">${this._error ? this._t("Vergelijking niet beschikbaar", "Comparison unavailable") : summary ? `<strong>${this._number(summary.relative_weight_percent, "%")}</strong><span>${this._t("van de nestmediaan op dag", "of the littermate median on day")} ${summary.day} · ${summary.peer_count} ${summary.peer_count === 1 ? this._t("andere pup", "other puppy") : this._t("andere pups", "other puppies")}${summary.interpolated ? " *" : ""}</span>` : this._request ? this._t("Vergelijking laden…", "Loading comparison…") : this._t("Nog onvoldoende metingen op dezelfde leeftijd.", "Not enough measurements at the same age yet.")}</p>
      <p class="position" ${summary?.position_change_points == null ? "hidden" : ""}>${this._number(summary?.position_change_points, this._t(" procentpunt sinds een week eerder", " percentage points since a week earlier"), true)}</p>
      <details ${this._open ? "open" : ""}><summary>${this._t("Nestperiode en eerdere nesten vergelijken", "Compare nest period and earlier litters")}</summary>
      <div class="controls"><label>${this._t("Vergelijk met", "Compare with")}<select id="mode"><option value="peers" ${this._mode === "peers" ? "selected" : ""}>${this._t("Nestgenoten", "Littermates")}</option><option value="history" ${this._mode === "history" ? "selected" : ""}>${this._t("Eerdere eigen nesten", "Earlier own litters")}</option></select></label>
      <label class="reference-control" ${this._mode === "history" ? "" : "hidden"}>${this._t("Referentienesten", "Reference litters")}<select id="reference-filter">${[["all", "Alle eerdere nesten", "All earlier litters"], ["same_mother", "Dezelfde moeder", "Same mother"], ["same_size", "Dezelfde grootteklasse", "Same size class"]].map(([value, nl, en]) => `<option value="${value}" ${this._filter === value ? "selected" : ""}>${this._t(nl, en)}</option>`).join("")}</select></label></div>
      <div class="body">${this._open ? this._body(puppy) : ""}</div></details></section>`;
    if (this._structure !== structure) {
      this.shadowRoot.innerHTML = markup;
      this._structure = structure;
    } else {
      // Replace only changing read-only regions. Native selectors and disclosure
      // controls keep their identity/focus while a request resolves.
      const template = document.createElement("template");
      template.innerHTML = markup;
      for (const selector of [".brief", ".position", ".body"]) {
        const existing = this.shadowRoot.querySelector(selector);
        const next = template.content.querySelector(selector);
        if (existing.innerHTML !== next.innerHTML) {
          const scroller = existing.querySelector(".table-scroll");
          const position = scroller ? [scroller.scrollTop, scroller.scrollLeft] : null;
          existing.innerHTML = next.innerHTML;
          const replacement = existing.querySelector(".table-scroll");
          if (position && replacement) [replacement.scrollTop, replacement.scrollLeft] = position;
        }
        existing.hidden = next.hidden;
      }
    }
    this.shadowRoot.querySelector("details").ontoggle = event => {
      if (this._open === event.target.open) return;
      this._open = event.target.open;
      if (this._open) this.shadowRoot.querySelector(".body").innerHTML = this._body(puppy);
      this._bindRetry();
    };
    this.shadowRoot.querySelector("#mode").onchange = event => {
      this._mode = event.target.value;
      if (this._mode === "history" && this._data?.history?.filter !== this._filter) void this._load();
      else this._render();
    };
    const filter = this.shadowRoot.querySelector("#reference-filter");
    if (filter) filter.onchange = event => {
      this._filter = event.target.value;
      void this._load();
    };
    this.shadowRoot.querySelector(".reference-control").hidden = this._mode !== "history";
    // An expanded graph must not collapse to one loading line during refresh:
    // browsers can otherwise clamp the surrounding page's scroll position.
    this.shadowRoot.querySelector(".body").style.minHeight = loading && this._pendingBodyHeight ? `${this._pendingBodyHeight}px` : "";
    if (!loading) this._pendingBodyHeight = null;
    this._bindRetry();
  }

  _bindRetry() {
    const button = this.shadowRoot.querySelector("#retry");
    if (button) button.onclick = () => void this._load();
  }
}

customElements.define("puppy-tracker-growth-comparison", PuppyTrackerGrowthComparison);
