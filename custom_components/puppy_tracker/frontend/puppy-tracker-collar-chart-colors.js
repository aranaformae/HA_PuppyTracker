// Keep puppy chart series visually tied to the physical collar color.
// collar_color is intentionally free text, so common Dutch/English names are
// normalized here while valid CSS colors (for example #2196f3) are accepted.
const CARD_TAG = "puppy-tracker-overview-card";

  const NAMED_COLORS = [
    [["lichtblauw", "lightblue", "skyblue"], "#42a5f5"],
    [["donkerblauw", "darkblue", "navy"], "#1565c0"],
    [["blauw", "blue"], "#1e88e5"],
    [["lichtroze", "lightpink"], "#f48fb1"],
    [["donkerroze", "darkpink"], "#d81b60"],
    [["roze", "pink"], "#ec407a"],
    [["lichtgroen", "lightgreen", "lime"], "#7cb342"],
    [["donkergroen", "darkgreen"], "#2e7d32"],
    [["groen", "green"], "#43a047"],
    [["rood", "red"], "#e53935"],
    [["geel", "yellow"], "#f9a825"],
    [["paars", "purple", "violet"], "#8e24aa"],
    [["oranje", "orange"], "#fb8c00"],
    [["turquoise", "turkoois", "cyan", "aqua"], "#00acc1"],
    [["bruin", "brown"], "#795548"],
    [["grijs", "gray", "grey", "zilver", "silver"], "#78909c"],
    [["zwart", "black"], "#424242"],
    // Pure white disappears on the default light HA card. Keep it recognisably
    // white while retaining enough contrast to remain readable as a chart line.
    [["wit", "white"], "#b0bec5"],
  ];

  const normalize = (value) => String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9#(),.%\s-]/g, "");

  const compact = (value) => normalize(value).replace(/[\s_-]+/g, "");

  const fallbackColor = (index) => `hsl(${index * 63 + 205} 68% 52%)`;

export function collarColor(value, index) {
    const normalized = normalize(value);
    if (!normalized) return fallbackColor(index);

    const compactValue = compact(normalized);
    for (const [aliases, color] of NAMED_COLORS) {
      if (aliases.some((alias) => compactValue === compact(alias))) return color;
    }

    // Free text is also allowed to contain a recognizable color word, e.g.
    // "neon groen" or "bandje blauw".
    for (const [aliases, color] of NAMED_COLORS) {
      if (aliases.some((alias) => compactValue.includes(compact(alias)))) return color;
    }

    if (globalThis.CSS?.supports?.("color", normalized)) return normalized;
    return fallbackColor(index);
}

(() => {

  const applyPatch = () => {
    const CardClass = customElements.get(CARD_TAG);
    if (!CardClass) return;

    const prototype = CardClass.prototype;
    if (prototype.__puppyTrackerCollarChartColorsPatched) return;
    prototype.__puppyTrackerCollarChartColorsPatched = true;

    prototype._applyCollarChartColors = function () {
      const root = this.shadowRoot;
      if (!root) return;

      const rows = typeof this._puppyRows === "function" ? this._puppyRows() : [];
      if (!rows.length) return;

      if (!root.getElementById("puppy-tracker-collar-chart-colors")) {
        const style = document.createElement("style");
        style.id = "puppy-tracker-collar-chart-colors";
        style.textContent = `
          .chart-line { stroke: var(--series-color) !important; }
          .chart-point { stroke: var(--series-color) !important; }
          .legend-color { background: var(--series-color) !important; }
        `;
        root.appendChild(style);
      }

      root.querySelectorAll(".chart-line, .chart-point, .legend-color").forEach((element) => {
        const index = Number.parseInt(element.style.getPropertyValue("--series-index"), 10);
        if (!Number.isInteger(index) || !rows[index]) return;
        element.style.setProperty("--series-color", collarColor(rows[index].collar, index));
      });
    };

    const originalRender = prototype._render;
    prototype._render = function (...args) {
      const result = originalRender.apply(this, args);
      this._applyCollarChartColors();
      return result;
    };
  };

  if (customElements.get(CARD_TAG)) {
    applyPatch();
  } else {
    customElements.whenDefined(CARD_TAG).then(applyPatch);
  }
})();
