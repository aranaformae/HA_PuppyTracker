// Treat the overview chart period as a viewport/zoom instead of a hard data filter.
// All historical points remain on one horizontally scrollable timeline while the
// selected range controls how much time fits in one screen width.
(() => {
  const CARD_TAG = "puppy-tracker-overview-card";
  const HOUR_MS = 60 * 60 * 1000;
  const FUTURE_TOLERANCE_MS = 60 * 1000;
  const BASE_PLOT_WIDTH = 690;
  const AXIS_WIDTH = 54;
  const CHART_HEIGHT = 300;
  const TOP = 18;
  const BOTTOM = 38;

  const isDutch = (card) => {
    const language = String(
      card?._hass?.language || document.documentElement.lang || navigator.language || "nl"
    ).toLowerCase();
    return language.startsWith("nl");
  };

  const visiblePeriodLabel = (card) => {
    if (!card?._rangeHours) return isDutch(card) ? "Volledige historie" : "Full history";
    if (card._rangeHours === 24) return isDutch(card) ? "24 uur" : "24 hours";
    if (card._rangeHours % 24 === 0) {
      const days = card._rangeHours / 24;
      return isDutch(card) ? `${days} dagen` : `${days} days`;
    }
    return isDutch(card) ? `${card._rangeHours} uur` : `${card._rangeHours} hours`;
  };

  const tickStepFor = (visibleMs, totalMs) => {
    if (visibleMs <= 24 * HOUR_MS) return 6 * HOUR_MS;
    if (visibleMs <= 3 * 24 * HOUR_MS) return 12 * HOUR_MS;
    if (visibleMs <= 7 * 24 * HOUR_MS) return 24 * HOUR_MS;
    if (visibleMs <= 14 * 24 * HOUR_MS) return 2 * 24 * HOUR_MS;
    if (visibleMs <= 30 * 24 * HOUR_MS) return 5 * 24 * HOUR_MS;

    const target = Math.max(HOUR_MS, totalMs / 5);
    const candidates = [
      HOUR_MS,
      3 * HOUR_MS,
      6 * HOUR_MS,
      12 * HOUR_MS,
      24 * HOUR_MS,
      2 * 24 * HOUR_MS,
      5 * 24 * HOUR_MS,
      7 * 24 * HOUR_MS,
      14 * 24 * HOUR_MS,
      30 * 24 * HOUR_MS,
    ];
    return candidates.find((value) => value >= target) || 30 * 24 * HOUR_MS;
  };

  const applyPatch = () => {
    const CardClass = customElements.get(CARD_TAG);
    if (!CardClass) return;

    const prototype = CardClass.prototype;
    if (prototype.__puppyTrackerChartTimeNavigationPatched) return;
    prototype.__puppyTrackerChartTimeNavigationPatched = true;

    // Keep the complete effective measurement series. The selected range is a
    // viewport below, not a destructive filter on the available chart data.
    prototype._metricPoints = function (row) {
      const puppy = this._dataPuppy(row);
      const series = this._measurementSeries(row);
      let points = [];

      if (this._metric === "growth24") {
        points = this._growth24Points(series);
      } else if (this._metric === "growthBirth") {
        let birthWeight = Number(puppy?.birth_weight);
        if (!Number.isFinite(birthWeight) || birthWeight <= 0) {
          const birthMeasurement = series.find((point) => point.kind === "birth");
          birthWeight = birthMeasurement?.value;
        }

        if (Number.isFinite(birthWeight) && birthWeight > 0) {
          points = series.map((point) => ({
            time: point.time,
            value: Math.round(((point.value - birthWeight) / birthWeight) * 10000) / 100,
            measurementId: point.measurementId,
          }));
        }
      } else {
        points = series;
      }

      const now = Date.now();
      this._historyWindowStart = null;
      this._historyWindowEnd = now;
      return points.filter((point) => point.time <= now + FUTURE_TOLERANCE_MS);
    };

    prototype._chartTimeTick = function (time) {
      const date = new Date(time);
      if (this._rangeHours <= 24) {
        return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      }
      if (this._rangeHours <= 72) {
        const day = date.toLocaleDateString([], { weekday: "short", day: "numeric" });
        const clock = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        return `${day} · ${clock}`;
      }
      if (this._rangeHours <= 168) {
        return date.toLocaleDateString([], { weekday: "short", day: "numeric" });
      }
      return date.toLocaleDateString([], { day: "numeric", month: "short" });
    };

    prototype._chartSvg = function (rows) {
      const series = this._chartSeries(rows);

      if (this._historyLoading) {
        return `<div class="chart-empty">${isDutch(this) ? "Grafiek laden…" : "Loading chart…"}</div>`;
      }

      if (this._historyError) {
        return `<div class="chart-empty error">${this._escape(this._historyError)}</div>`;
      }

      if (!series.length) {
        return `<div class="chart-empty">${
          isDutch(this)
            ? "Nog geen historische meetpunten."
            : "No historical measurements yet."
        }</div>`;
      }

      const allPoints = series.flatMap((item) => item.points);
      const now = Date.now();
      const earliestPoint = Math.min(...allPoints.map((point) => point.time));
      const selectedVisibleMs = this._rangeHours > 0
        ? this._rangeHours * HOUR_MS
        : Math.max(HOUR_MS, now - earliestPoint);
      const currentWindowStart = now - selectedVisibleMs;
      const contentStart = this._rangeHours > 0
        ? Math.min(earliestPoint, currentWindowStart)
        : earliestPoint;
      const contentEnd = now;
      const contentSpan = Math.max(HOUR_MS, contentEnd - contentStart);
      const pageCount = this._rangeHours > 0
        ? Math.max(1, contentSpan / selectedVisibleMs)
        : 1;
      const contentWidth = Math.max(BASE_PLOT_WIDTH, BASE_PLOT_WIDTH * pageCount);

      let minValue = Math.min(...allPoints.map((point) => point.value));
      let maxValue = Math.max(...allPoints.map((point) => point.value));
      if (maxValue <= minValue) {
        const pad = Math.max(1, Math.abs(maxValue) * 0.05);
        minValue -= pad;
        maxValue += pad;
      } else {
        const pad = (maxValue - minValue) * 0.12;
        minValue -= pad;
        maxValue += pad;
      }

      const plotHeight = CHART_HEIGHT - TOP - BOTTOM;
      const x = (time) => ((time - contentStart) / contentSpan) * contentWidth;
      const y = (value) => TOP + ((maxValue - value) / (maxValue - minValue)) * plotHeight;

      const yTicks = Array.from({ length: 5 }, (_, index) => {
        const ratio = index / 4;
        const value = maxValue - (maxValue - minValue) * ratio;
        return { value, y: TOP + plotHeight * ratio };
      });

      const tickStep = tickStepFor(selectedVisibleMs, contentSpan);
      const firstTick = Math.ceil(contentStart / tickStep) * tickStep;
      const xTicks = [];
      for (let time = firstTick; time <= contentEnd && xTicks.length < 100; time += tickStep) {
        xTicks.push({ time, x: x(time) });
      }

      const unit = series[0]?.unit || "";
      const lines = series
        .map((item) => {
          const pointsString = item.points
            .map((point) => `${x(point.time).toFixed(1)},${y(point.value).toFixed(1)}`)
            .join(" ");

          const circles = item.points
            .map(
              (point) => `
                <circle
                  class="chart-point"
                  cx="${x(point.time).toFixed(1)}"
                  cy="${y(point.value).toFixed(1)}"
                  r="4.2"
                  data-puppy-id="${this._escape(item.puppyId)}"
                  data-name="${this._escape(item.name)}"
                  data-time="${point.time}"
                  data-value="${point.value}"
                  data-unit="${this._escape(item.unit)}"
                  data-measurement-id="${this._escape(point.measurementId || "")}"
                  style="--series-index:${item.index}"
                ></circle>`
            )
            .join("");

          return `
            <polyline
              class="chart-line ${item.selected ? "selected" : ""}"
              points="${pointsString}"
              style="--series-index:${item.index}"
            ></polyline>
            ${circles}
          `;
        })
        .join("");

      const nowX = Math.max(0, contentWidth - 1);
      const navigation = this._rangeHours > 0
        ? `
          <div class="chart-navigation">
            <span>${this._escape(
              isDutch(this)
                ? `Zoom: ${visiblePeriodLabel(this)} · veeg horizontaal om terug te kijken`
                : `Zoom: ${visiblePeriodLabel(this)} · swipe horizontally to look back`
            )}</span>
            <button type="button" class="chart-back-now">${
              isDutch(this) ? "Terug naar nu" : "Back to now"
            }</button>
          </div>`
        : `
          <div class="chart-navigation all-history">
            <span>${isDutch(this) ? "Volledige historie in beeld" : "Full history in view"}</span>
          </div>`;

      return `
        ${navigation}
        <div class="chart-stage">
          <svg class="chart-y-axis" viewBox="0 0 ${AXIS_WIDTH} ${CHART_HEIGHT}" aria-hidden="true">
            ${yTicks
              .map(
                (tick) => `
                  <line class="axis-tick" x1="${AXIS_WIDTH - 5}" x2="${AXIS_WIDTH}" y1="${tick.y}" y2="${tick.y}"></line>
                  <text class="axis-label y-label" x="${AXIS_WIDTH - 8}" y="${tick.y + 4}" text-anchor="end">${this._formatAxisValue(
                    tick.value
                  )}</text>`
              )
              .join("")}
            <text class="unit-label fixed-unit" x="2" y="12">${this._escape(unit)}</text>
          </svg>
          <div
            class="chart-scroll"
            data-content-start="${contentStart}"
            data-content-end="${contentEnd}"
            data-visible-ms="${selectedVisibleMs}"
            data-range-hours="${this._rangeHours}"
          >
            <svg
              class="chart"
              viewBox="0 0 ${contentWidth} ${CHART_HEIGHT}"
              role="img"
              aria-label="${isDutch(this) ? "Puppy groeigrafiek" : "Puppy growth chart"}"
              style="--chart-width:${(pageCount * 100).toFixed(4)}%"
            >
              ${yTicks
                .map(
                  (tick) => `<line class="grid-line" x1="0" x2="${contentWidth}" y1="${tick.y}" y2="${tick.y}"></line>`
                )
                .join("")}
              ${xTicks
                .map(
                  (tick) => `
                    <line class="grid-line vertical" x1="${tick.x}" x2="${tick.x}" y1="${TOP}" y2="${CHART_HEIGHT - BOTTOM}"></line>
                    <text class="axis-label" x="${tick.x}" y="${CHART_HEIGHT - 11}" text-anchor="middle">${this._escape(
                      this._chartTimeTick(tick.time)
                    )}</text>`
                )
                .join("")}
              ${lines}
              <line class="chart-now-line" x1="${nowX}" x2="${nowX}" y1="${TOP}" y2="${CHART_HEIGHT - BOTTOM}"></line>
              <text class="chart-now-label" x="${Math.max(0, nowX - 6)}" y="${TOP + 13}" text-anchor="end">${
                isDutch(this) ? "NU" : "NOW"
              }</text>
            </svg>
          </div>
        </div>
      `;
    };

    prototype._ensureChartTimeNavigationStyles = function () {
      const root = this.shadowRoot;
      if (!root || root.getElementById("puppy-tracker-chart-time-navigation")) return;

      const style = document.createElement("style");
      style.id = "puppy-tracker-chart-time-navigation";
      style.textContent = `
        .chart-navigation {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin: 6px 0 7px;
          color: var(--secondary-text-color);
          font-size: 11px;
        }
        .chart-navigation > span { min-width: 0; }
        .chart-back-now {
          flex: 0 0 auto;
          min-height: 30px;
          padding: 4px 9px;
          border: 1px solid var(--divider-color);
          border-radius: 8px;
          background: var(--secondary-background-color);
          color: var(--primary-text-color);
          font: inherit;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
        }
        .chart-back-now:disabled {
          opacity: .45;
          cursor: default;
        }
        .chart-stage {
          display: grid;
          grid-template-columns: ${AXIS_WIDTH}px minmax(0, 1fr);
          align-items: stretch;
          width: 100%;
          min-width: 0;
        }
        .chart-y-axis,
        .chart-scroll .chart {
          height: clamp(190px, 38vw, ${CHART_HEIGHT}px) !important;
        }
        .chart-y-axis {
          display: block;
          width: ${AXIS_WIDTH}px;
          overflow: visible;
        }
        .chart-scroll {
          width: 100%;
          min-width: 0;
          overflow-x: auto !important;
          overflow-y: hidden !important;
          overscroll-behavior-x: contain;
          -webkit-overflow-scrolling: touch;
          touch-action: pan-x pan-y;
          scrollbar-width: thin;
        }
        .chart-scroll .chart {
          display: block;
          width: var(--chart-width, 100%) !important;
          min-width: var(--chart-width, 100%) !important;
          max-width: none !important;
        }
        .chart-y-axis .axis-label,
        .chart-y-axis .unit-label {
          fill: var(--secondary-text-color);
        }
        .chart-y-axis .axis-tick {
          stroke: var(--divider-color);
          stroke-width: 1;
        }
        .chart-now-line {
          stroke: var(--primary-color, #03a9f4);
          stroke-width: 2;
          stroke-dasharray: 6 5;
          vector-effect: non-scaling-stroke;
        }
        .chart-now-label {
          fill: var(--primary-color, #03a9f4);
          font-size: 11px;
          font-weight: 800;
          letter-spacing: .06em;
        }
        @media (max-width: 520px) {
          .chart-navigation {
            align-items: flex-start;
            flex-direction: column;
          }
          .chart-back-now { align-self: flex-end; }
          .chart-stage { grid-template-columns: 46px minmax(0, 1fr); }
          .chart-y-axis { width: 46px; }
        }
      `;
      root.appendChild(style);
    };

    prototype._captureChartViewport = function () {
      if (this._chartScrollToNowPending) return;
      const scroll = this.shadowRoot?.querySelector(".chart-scroll");
      if (!scroll || this._rangeHours <= 0 || scroll.scrollWidth <= scroll.clientWidth + 1) return;

      const maxScroll = Math.max(0, scroll.scrollWidth - scroll.clientWidth);
      if (maxScroll - scroll.scrollLeft <= 6) {
        this._chartScrollToNowPending = true;
        this._chartViewportAnchorTime = null;
        return;
      }

      const start = Number(scroll.dataset.contentStart);
      const end = Number(scroll.dataset.contentEnd);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return;

      const rightFraction = Math.min(
        1,
        Math.max(0, (scroll.scrollLeft + scroll.clientWidth) / scroll.scrollWidth)
      );
      this._chartViewportAnchorTime = start + (end - start) * rightFraction;
    };

    prototype._updateChartNowButton = function (scroll) {
      const navigation = scroll?.previousElementSibling?.classList?.contains("chart-y-axis")
        ? scroll.closest(".chart-stage")?.previousElementSibling
        : scroll?.closest(".chart-stage")?.previousElementSibling;
      const button = navigation?.querySelector?.(".chart-back-now");
      if (!button || !scroll) return;
      const maxScroll = Math.max(0, scroll.scrollWidth - scroll.clientWidth);
      button.disabled = maxScroll - scroll.scrollLeft <= 6;
    };

    prototype._rememberChartScroll = function (scroll) {
      if (!scroll || this._rangeHours <= 0) return;
      const start = Number(scroll.dataset.contentStart);
      const end = Number(scroll.dataset.contentEnd);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return;

      const rightFraction = Math.min(
        1,
        Math.max(0, (scroll.scrollLeft + scroll.clientWidth) / scroll.scrollWidth)
      );
      this._chartViewportAnchorTime = start + (end - start) * rightFraction;
      this._chartScrollToNowPending = false;
      this._updateChartNowButton(scroll);
    };

    prototype._restoreChartViewport = function () {
      const scrolls = this.shadowRoot?.querySelectorAll(".chart-scroll") || [];
      scrolls.forEach((scroll) => {
        if (this._rangeHours <= 0 || scroll.scrollWidth <= scroll.clientWidth + 1) {
          scroll.scrollLeft = 0;
          this._updateChartNowButton(scroll);
          return;
        }

        const maxScroll = Math.max(0, scroll.scrollWidth - scroll.clientWidth);
        const start = Number(scroll.dataset.contentStart);
        const end = Number(scroll.dataset.contentEnd);
        const anchor = Number(this._chartViewportAnchorTime);
        const shouldGoNow = this._chartScrollToNowPending !== false || !Number.isFinite(anchor);

        if (shouldGoNow || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
          scroll.scrollLeft = maxScroll;
        } else {
          const fraction = Math.min(1, Math.max(0, (anchor - start) / (end - start)));
          const desired = fraction * scroll.scrollWidth - scroll.clientWidth;
          scroll.scrollLeft = Math.min(maxScroll, Math.max(0, desired));
        }
        this._updateChartNowButton(scroll);
      });

      this._chartScrollToNowPending = false;
      if (!Number.isFinite(Number(this._chartViewportAnchorTime)) && this._rangeHours > 0) {
        this._chartViewportAnchorTime = Date.now();
      }
    };

    prototype._bindChartTimeNavigation = function () {
      const root = this.shadowRoot;
      if (!root) return;

      root.querySelectorAll(".chart-scroll").forEach((scroll) => {
        scroll.addEventListener("scroll", () => this._rememberChartScroll(scroll), { passive: true });
      });

      root.querySelectorAll(".chart-back-now").forEach((button) => {
        button.addEventListener("click", () => {
          this._chartViewportAnchorTime = null;
          this._chartScrollToNowPending = true;
          root.querySelectorAll(".chart-scroll").forEach((scroll) => {
            const maxScroll = Math.max(0, scroll.scrollWidth - scroll.clientWidth);
            const reducedMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
            scroll.scrollTo?.({ left: maxScroll, behavior: reducedMotion ? "auto" : "smooth" });
            if (!scroll.scrollTo) scroll.scrollLeft = maxScroll;
            this._updateChartNowButton(scroll);
          });
        });
      });

      root.querySelectorAll("[data-range]").forEach((button) => {
        button.addEventListener("click", () => {
          this._chartViewportAnchorTime = null;
          this._chartScrollToNowPending = true;
        });
      });
    };

    const originalSelectLitter = prototype._selectLitter;
    prototype._selectLitter = async function (...args) {
      this._chartViewportAnchorTime = null;
      this._chartScrollToNowPending = true;
      return originalSelectLitter.apply(this, args);
    };

    const originalRender = prototype._render;
    prototype._render = function (...args) {
      this._captureChartViewport();
      const result = originalRender.apply(this, args);
      this._ensureChartTimeNavigationStyles();
      this._bindChartTimeNavigation();
      window.requestAnimationFrame(() => this._restoreChartViewport());
      return result;
    };
  };

  if (customElements.get(CARD_TAG)) {
    applyPatch();
  } else {
    customElements.whenDefined(CARD_TAG).then(applyPatch);
  }
})();
