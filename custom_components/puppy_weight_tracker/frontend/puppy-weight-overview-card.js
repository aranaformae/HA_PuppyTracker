class PuppyWeightOverviewCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._hass = null;
    this._entities = [];
    this._devices = [];
    this._registryLoaded = false;
    this._registryLoading = false;
    this._selectedLitterId = null;
    this._selectedPuppyId = null;
    this._rangeHours = 168;
    this._metric = "weight";
    this._history = {};
    this._historyLoading = false;
    this._historyError = "";
    this._historyKey = "";
    this._historyWindowStart = null;
    this._historyWindowEnd = null;
    this._lastStateSignature = "";
    this._historyReloadTimer = null;
    this._tooltip = null;
  }

  static getStubConfig() {
    return {
      title: "Puppy groeioverzicht",
      default_range: "7d",
      default_metric: "weight",
      show_summary: true,
      show_puppy_cards: true,
    };
  }

  static getConfigForm() {
    return {
      schema: [
        { name: "title", selector: { text: {} } },
        {
          name: "default_range",
          selector: {
            select: {
              mode: "dropdown",
              options: [
                { value: "24h", label: "24 uur" },
                { value: "3d", label: "3 dagen" },
                { value: "7d", label: "7 dagen" },
                { value: "14d", label: "14 dagen" },
                { value: "30d", label: "30 dagen" },
              ],
            },
          },
        },
        {
          name: "default_metric",
          selector: {
            select: {
              mode: "dropdown",
              options: [
                { value: "weight", label: "Gewicht" },
                { value: "growth24", label: "Groei per 24 uur" },
                { value: "growthBirth", label: "Groei sinds geboorte" },
              ],
            },
          },
        },
        { name: "show_summary", selector: { boolean: {} } },
        { name: "show_puppy_cards", selector: { boolean: {} } },
      ],
    };
  }

  setConfig(config) {
    this._config = {
      title: "Puppy groeioverzicht",
      default_range: "7d",
      default_metric: "weight",
      show_summary: true,
      show_puppy_cards: true,
      ...config,
    };

    this._rangeHours = this._rangeToHours(this._config.default_range);
    this._metric = ["weight", "growth24", "growthBirth"].includes(
      this._config.default_metric
    )
      ? this._config.default_metric
      : "weight";

    this._render();
  }

  set hass(hass) {
    this._hass = hass;

    if (!this._registryLoaded && !this._registryLoading) {
      this._loadRegistry();
      return;
    }

    const signature = this._currentStateSignature();
    if (signature && signature !== this._lastStateSignature) {
      const hadSignature = Boolean(this._lastStateSignature);
      this._lastStateSignature = signature;
      if (hadSignature) this._scheduleHistoryReload();
    }

    this._render();
  }

  disconnectedCallback() {
    if (this._historyReloadTimer) {
      clearTimeout(this._historyReloadTimer);
      this._historyReloadTimer = null;
    }
  }

  getCardSize() {
    return this._config?.show_puppy_cards === false ? 7 : 11;
  }

  getGridOptions() {
    return {
      columns: 12,
      min_columns: 6,
    };
  }

  _rangeToHours(range) {
    return {
      "24h": 24,
      "3d": 72,
      "7d": 168,
      "14d": 336,
      "30d": 720,
    }[range] || 168;
  }

  async _loadRegistry() {
    if (!this._hass || this._registryLoading) return;

    this._registryLoading = true;

    try {
      const [entities, devices] = await Promise.all([
        this._hass.callWS({ type: "config/entity_registry/list" }),
        this._hass.callWS({ type: "config/device_registry/list" }),
      ]);

      this._entities = Array.isArray(entities) ? entities : [];
      this._devices = Array.isArray(devices) ? devices : [];
      this._registryLoaded = true;

      this._initializeSelection();
      this._lastStateSignature = this._currentStateSignature();
      await this._loadHistory(true);
    } catch (err) {
      console.error("Puppy Weight Overview card: discovery failed", err);
      this._historyError =
        err?.message || "Puppy Weight Tracker kon niet automatisch worden gevonden.";
    } finally {
      this._registryLoading = false;
      this._render();
    }
  }

  _deviceHasIdentifier(device, identifier) {
    return (device?.identifiers || []).some(
      (item) =>
        Array.isArray(item) &&
        item.length >= 2 &&
        item[0] === "puppy_weight_tracker" &&
        item[1] === identifier
    );
  }

  _deviceIdentifier(device, prefix) {
    const match = (device?.identifiers || []).find(
      (item) =>
        Array.isArray(item) &&
        item.length >= 2 &&
        item[0] === "puppy_weight_tracker" &&
        String(item[1]).startsWith(prefix)
    );

    return match ? String(match[1]) : null;
  }

  _deviceName(device) {
    return device?.name_by_user || device?.name || "Puppy";
  }

  _entityForDevice(deviceId, uniqueId) {
    const entry = this._entities.find(
      (entity) =>
        entity.device_id === deviceId &&
        entity.unique_id === uniqueId &&
        !entity.disabled_by
    );

    return entry?.entity_id || null;
  }

  _state(entityId) {
    if (!entityId || !this._hass) return null;
    return this._hass.states[entityId] || null;
  }

  _stateValue(entityId, fallback = "—") {
    const state = this._state(entityId);
    if (!state || ["unknown", "unavailable", "none", ""].includes(state.state)) {
      return fallback;
    }
    return state.state;
  }

  _station() {
    const device = this._devices.find((item) =>
      this._deviceHasIdentifier(item, "weighing_station")
    );

    if (!device) return null;

    return {
      device,
      litter: this._entityForDevice(
        device.id,
        "puppy_weight_tracker_litter_select"
      ),
      puppy: this._entityForDevice(
        device.id,
        "puppy_weight_tracker_puppy_select"
      ),
    };
  }

  _litterDevices() {
    return this._devices.filter((device) =>
      Boolean(this._deviceIdentifier(device, "litter_"))
    );
  }

  _initializeSelection() {
    const litters = this._litterDevices();
    if (!litters.length) return;

    if (
      this._selectedLitterId &&
      litters.some((device) => device.id === this._selectedLitterId)
    ) {
      return;
    }

    const station = this._station();
    const stationState = this._state(station?.litter);
    const selectedName = String(stationState?.state || "").replace(/ · \d+$/, "");

    const matching = litters.find(
      (device) => this._deviceName(device) === selectedName
    );

    this._selectedLitterId = matching?.id || litters[0].id;
  }

  _selectedLitter() {
    this._initializeSelection();
    return (
      this._devices.find((device) => device.id === this._selectedLitterId) || null
    );
  }

  _activePuppyOptionsForSelectedLitter() {
    const station = this._station();
    const stationLitterState = this._state(station?.litter);
    const puppyState = this._state(station?.puppy);
    const litter = this._selectedLitter();

    if (!stationLitterState || !puppyState || !litter) return null;

    const stationLitterName = String(stationLitterState.state || "").replace(
      / · \d+$/,
      ""
    );

    if (stationLitterName !== this._deviceName(litter)) return null;

    return Array.isArray(puppyState.attributes?.options)
      ? puppyState.attributes.options.map(String)
      : null;
  }

  _puppyRows() {
    const litter = this._selectedLitter();
    if (!litter) return [];

    const activeOptions = this._activePuppyOptionsForSelectedLitter();

    const devices = this._devices.filter(
      (device) =>
        device.via_device_id === litter.id &&
        Boolean(this._deviceIdentifier(device, "puppy_"))
    );

    const rows = devices
      .map((device) => {
        const identifier = this._deviceIdentifier(device, "puppy_");
        const puppyId = identifier?.slice("puppy_".length);
        if (!puppyId) return null;

        const entityIds = {
          weight: this._entityForDevice(device.id, `${puppyId}_weight`),
          birthWeight: this._entityForDevice(
            device.id,
            `${puppyId}_birth_weight`
          ),
          previousWeight: this._entityForDevice(
            device.id,
            `${puppyId}_previous_weight`
          ),
          weightChange: this._entityForDevice(
            device.id,
            `${puppyId}_weight_change`
          ),
          growthBirth: this._entityForDevice(
            device.id,
            `${puppyId}_growth_percentage`
          ),
          growth24: this._entityForDevice(
            device.id,
            `${puppyId}_growth_24h_percent`
          ),
          lastWeighed: this._entityForDevice(
            device.id,
            `${puppyId}_last_weighed`
          ),
          status: this._entityForDevice(device.id, `${puppyId}_status`),
          age: this._entityForDevice(device.id, `${puppyId}_age`),
          collar: this._entityForDevice(device.id, `${puppyId}_collar_color`),
          sex: this._entityForDevice(device.id, `${puppyId}_sex`),
          birthTime: this._entityForDevice(device.id, `${puppyId}_birth_time`),
        };

        const name = this._deviceName(device);
        const collar = this._stateValue(entityIds.collar, "");
        const optionLabel =
          collar && collar.toLowerCase() !== name.toLowerCase()
            ? `${name} (${collar})`
            : name;

        if (
          activeOptions &&
          activeOptions.length &&
          !activeOptions.some(
            (option) =>
              option === optionLabel || option.startsWith(`${optionLabel} · `)
          )
        ) {
          return null;
        }

        const statusState = this._state(entityIds.status);
        const statusCode = statusState?.attributes?.status_code || "unknown";

        return {
          device,
          puppyId,
          name,
          collar,
          entityIds,
          status: this._stateValue(entityIds.status, "Onbekend"),
          statusCode,
          age: this._stateValue(entityIds.age),
          sex: this._stateValue(entityIds.sex),
          birthTime: this._stateValue(entityIds.birthTime),
          weight: this._numericState(entityIds.weight),
          birthWeight: this._numericState(entityIds.birthWeight),
          previousWeight: this._numericState(entityIds.previousWeight),
          weightChange: this._numericState(entityIds.weightChange),
          growthBirth: this._numericState(entityIds.growthBirth),
          growth24: this._numericState(entityIds.growth24),
          lastWeighed: this._stateValue(entityIds.lastWeighed, ""),
        };
      })
      .filter(Boolean);

    if (
      !this._selectedPuppyId ||
      !rows.some((row) => row.puppyId === this._selectedPuppyId)
    ) {
      this._selectedPuppyId = rows[0]?.puppyId || null;
    }

    return rows;
  }

  _numericState(entityId) {
    const state = this._state(entityId);
    if (!state) return null;
    const value = Number(state.state);
    return Number.isFinite(value) ? value : null;
  }

  _metricConfig(row) {
    if (this._metric === "growth24") {
      return {
        entityId: row.entityIds.growth24,
        label: "Groei per 24 uur",
        unit: "%",
      };
    }

    if (this._metric === "growthBirth") {
      return {
        entityId: row.entityIds.growthBirth,
        label: "Groei sinds geboorte",
        unit: "%",
      };
    }

    return {
      entityId: row.entityIds.weight,
      label: "Gewicht",
      unit: "g",
    };
  }

  _historyEntityIds(rows) {
    return rows
      .map((row) => this._metricConfig(row).entityId)
      .filter(Boolean);
  }

  _historyCacheKey(rows) {
    const ids = this._historyEntityIds(rows).sort().join(",");
    return `${this._selectedLitterId}|${this._rangeHours}|${this._metric}|${ids}`;
  }

  async _loadHistory(force = false) {
    if (!this._hass || !this._registryLoaded || this._historyLoading) return;

    const rows = this._puppyRows();
    const entityIds = this._historyEntityIds(rows);
    const key = this._historyCacheKey(rows);

    if (!force && key === this._historyKey && Object.keys(this._history).length) {
      return;
    }

    if (!entityIds.length) {
      this._history = {};
      this._historyKey = key;
      this._historyError = "";
      this._render();
      return;
    }

    this._historyLoading = true;
    this._historyError = "";
    this._render();

    try {
      const end = new Date();
      const start = new Date(end.getTime() - this._rangeHours * 3600 * 1000);

      // Keep the requested time window separate from the returned points.
      // The graph must always represent the complete selected period, even
      // when there are only a few measurements inside that period.
      this._historyWindowStart = start.getTime();
      this._historyWindowEnd = end.getTime();

      const history = await this._hass.callWS({
        type: "history/history_during_period",
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        entity_ids: entityIds,
        include_start_time_state: true,
        significant_changes_only: false,
        minimal_response: true,
        no_attributes: true,
      });

      this._history = history && typeof history === "object" ? history : {};
      this._historyKey = key;
    } catch (err) {
      console.error("Puppy Weight Overview card: history failed", err);
      this._historyError =
        err?.message ||
        "De historie kon niet worden geladen. Controleer of Recorder/History actief is.";
      this._history = {};
      this._historyKey = key;
    } finally {
      this._historyLoading = false;
      this._render();
    }
  }

  _scheduleHistoryReload() {
    if (this._historyReloadTimer) clearTimeout(this._historyReloadTimer);

    this._historyReloadTimer = setTimeout(() => {
      this._historyReloadTimer = null;
      this._loadHistory(true);
    }, 900);
  }

  _currentStateSignature() {
    if (!this._registryLoaded || !this._hass) return "";

    return this._puppyRows()
      .flatMap((row) => [
        row.entityIds.weight,
        row.entityIds.growth24,
        row.entityIds.growthBirth,
      ])
      .filter(Boolean)
      .map((entityId) => {
        const state = this._state(entityId);
        return `${entityId}:${state?.state || ""}:${state?.last_updated || ""}`;
      })
      .join("|");
  }

  _historyPoints(entityId) {
    if (!entityId) return [];
    const raw = this._history?.[entityId];
    if (!Array.isArray(raw)) return [];

    const start = Number.isFinite(this._historyWindowStart)
      ? this._historyWindowStart
      : Date.now() - this._rangeHours * 3600 * 1000;
    const end = Number.isFinite(this._historyWindowEnd)
      ? this._historyWindowEnd
      : Date.now();

    const points = raw
      .map((item) => {
        const value = Number(item?.s ?? item?.state);
        let time = null;

        if (Number.isFinite(Number(item?.lu))) {
          time = Number(item.lu) * 1000;
        } else if (item?.last_updated) {
          time = new Date(item.last_updated).getTime();
        } else if (item?.last_changed) {
          time = new Date(item.last_changed).getTime();
        }

        if (!Number.isFinite(value) || !Number.isFinite(time)) return null;
        if (time < start || time > end + 60000) return null;
        return { time: Math.min(time, end), value };
      })
      .filter(Boolean)
      .sort((a, b) => a.time - b.time);

    // Home Assistant history represents state changes. If a sensor did not
    // change after its last recorded point, there may be no point at "now".
    // Extend the current state to the right edge so the complete selected
    // period remains visible instead of appearing to stop at the first part.
    const current = this._state(entityId);
    const currentValue = Number(current?.state);
    if (Number.isFinite(currentValue)) {
      const last = points[points.length - 1];
      if (!last || end - last.time > 1000) {
        points.push({ time: end, value: currentValue });
      }
    }

    return points;
  }

  _chartSeries(rows) {
    return rows
      .map((row, index) => {
        const config = this._metricConfig(row);
        const points = this._historyPoints(config.entityId);

        return {
          puppyId: row.puppyId,
          name: row.name,
          unit: config.unit,
          index,
          points,
          selected: row.puppyId === this._selectedPuppyId,
        };
      })
      .filter((series) => series.points.length);
  }

  _chartSvg(rows) {
    const series = this._chartSeries(rows);

    if (this._historyLoading) {
      return `<div class="chart-empty">Grafiek laden…</div>`;
    }

    if (this._historyError) {
      return `<div class="chart-empty error">${this._escape(this._historyError)}</div>`;
    }

    if (!series.length) {
      return `<div class="chart-empty">Nog geen historische meetpunten in deze periode.</div>`;
    }

    const allPoints = series.flatMap((item) => item.points);

    // The x-axis always covers the selected range. Previously it was based on
    // the first and last returned state change, which could make only a small
    // part of 7/14/30 days appear to be displayed.
    let minTime = Number.isFinite(this._historyWindowStart)
      ? this._historyWindowStart
      : Date.now() - this._rangeHours * 3600 * 1000;
    let maxTime = Number.isFinite(this._historyWindowEnd)
      ? this._historyWindowEnd
      : Date.now();
    let minValue = Math.min(...allPoints.map((point) => point.value));
    let maxValue = Math.max(...allPoints.map((point) => point.value));

    if (maxTime <= minTime) maxTime = minTime + 3600000;

    if (maxValue <= minValue) {
      const pad = Math.max(1, Math.abs(maxValue) * 0.05);
      minValue -= pad;
      maxValue += pad;
    } else {
      const pad = (maxValue - minValue) * 0.12;
      minValue -= pad;
      maxValue += pad;
    }

    const width = 760;
    const height = 300;
    const left = 54;
    const right = 16;
    const top = 18;
    const bottom = 38;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;

    const x = (time) => left + ((time - minTime) / (maxTime - minTime)) * plotWidth;
    const y = (value) => top + ((maxValue - value) / (maxValue - minValue)) * plotHeight;

    const yTicks = Array.from({ length: 5 }, (_, index) => {
      const ratio = index / 4;
      const value = maxValue - (maxValue - minValue) * ratio;
      return { value, y: top + plotHeight * ratio };
    });

    const xTicks = Array.from({ length: 5 }, (_, index) => {
      const ratio = index / 4;
      const time = minTime + (maxTime - minTime) * ratio;
      return { time, x: left + plotWidth * ratio };
    });

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

    return `
      <div class="chart-scroll">
        <svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Puppy groeigrafiek">
          ${yTicks
            .map(
              (tick) => `
                <line class="grid-line" x1="${left}" x2="${width - right}" y1="${tick.y}" y2="${tick.y}"></line>
                <text class="axis-label y-label" x="${left - 9}" y="${tick.y + 4}" text-anchor="end">${this._formatAxisValue(
                  tick.value
                )}</text>`
            )
            .join("")}
          ${xTicks
            .map(
              (tick) => `
                <line class="grid-line vertical" x1="${tick.x}" x2="${tick.x}" y1="${top}" y2="${height - bottom}"></line>
                <text class="axis-label" x="${tick.x}" y="${height - 11}" text-anchor="middle">${this._formatTimeTick(
                  tick.time
                )}</text>`
            )
            .join("")}
          <text class="unit-label" x="${left}" y="12">${this._escape(unit)}</text>
          ${lines}
        </svg>
      </div>
    `;
  }

  _formatAxisValue(value) {
    if (Math.abs(value) >= 100) return Math.round(value).toString();
    if (Math.abs(value) >= 10) return value.toFixed(1).replace(".0", "");
    return value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  }

  _formatTimeTick(time) {
    const date = new Date(time);
    if (this._rangeHours <= 24) {
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    if (this._rangeHours <= 168) {
      return date.toLocaleDateString([], { weekday: "short", day: "numeric" });
    }
    return date.toLocaleDateString([], { day: "numeric", month: "short" });
  }

  _formatDateTime(value) {
    if (!value || value === "—") return "—";
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return value;
    return date.toLocaleString([], {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  _formatNumber(value, unit = "", signed = false) {
    if (!Number.isFinite(value)) return "—";
    const sign = signed && value > 0 ? "+" : "";
    const decimals = Number.isInteger(value) ? 0 : 1;
    return `${sign}${value.toFixed(decimals)}${unit ? ` ${unit}` : ""}`;
  }

  _statusClass(code) {
    if (code === "ok") return "ok";
    if (code === "first_24h") return "info";
    if (code === "low_growth") return "warning";
    if (
      [
        "weight_loss",
        "weigh_due",
        "no_measurement",
        "first_day_excess_weight_loss",
      ].includes(code)
    ) {
      return "danger";
    }
    return "neutral";
  }

  _summary(rows) {
    const weights = rows.map((row) => row.weight).filter(Number.isFinite);
    const attention = rows.filter((row) => row.statusCode !== "ok" && row.statusCode !== "first_24h");

    const average = weights.length
      ? weights.reduce((sum, value) => sum + value, 0) / weights.length
      : null;
    const lightest = weights.length ? Math.min(...weights) : null;
    const heaviest = weights.length ? Math.max(...weights) : null;

    return {
      count: rows.length,
      average,
      lightest,
      heaviest,
      attention: attention.length,
    };
  }

  async _selectLitter(deviceId) {
    this._selectedLitterId = deviceId;
    this._selectedPuppyId = null;
    this._tooltip = null;
    this._history = {};
    this._historyKey = "";

    const litter = this._selectedLitter();
    const station = this._station();
    const stationState = this._state(station?.litter);
    const options = Array.isArray(stationState?.attributes?.options)
      ? stationState.attributes.options.map(String)
      : [];

    if (litter && station?.litter && options.length) {
      const name = this._deviceName(litter);
      const option = options.find(
        (item) => item === name || item.replace(/ · \d+$/, "") === name
      );

      if (option) {
        try {
          await this._hass.callService("select", "select_option", {
            entity_id: station.litter,
            option,
          });
        } catch (err) {
          console.warn("Puppy Weight Overview card: station litter sync failed", err);
        }
      }
    }

    this._render();
    await this._loadHistory(true);
  }

  _escape(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  _render() {
    if (!this.shadowRoot) return;

    if (!this._hass) {
      this.shadowRoot.innerHTML = this._shell(
        `<div class="loading">Home Assistant laden…</div>`
      );
      return;
    }

    if (this._registryLoading) {
      this.shadowRoot.innerHTML = this._shell(
        `<div class="loading">Puppy Weight Tracker zoeken…</div>`
      );
      return;
    }

    const litters = this._litterDevices();

    if (!litters.length) {
      this.shadowRoot.innerHTML = this._shell(`
        <div class="empty">
          <strong>Geen nesten gevonden</strong>
          <span>Controleer of Puppy Weight Tracker geladen is.</span>
          <button id="rediscover" class="secondary">Opnieuw zoeken</button>
        </div>
      `);
      this._bindRediscover();
      return;
    }

    this._initializeSelection();
    const rows = this._puppyRows();
    const selected = rows.find((row) => row.puppyId === this._selectedPuppyId) || rows[0] || null;
    const summary = this._summary(rows);

    const litterOptions = litters
      .map(
        (device) => `
          <option value="${this._escape(device.id)}" ${
          device.id === this._selectedLitterId ? "selected" : ""
        }>${this._escape(this._deviceName(device))}</option>`
      )
      .join("");

    const summaryHtml = this._config.show_summary === false
      ? ""
      : `
        <div class="summary-grid">
          <div><span>Pups</span><strong>${summary.count}</strong></div>
          <div><span>Gemiddeld</span><strong>${this._formatNumber(summary.average, "g")}</strong></div>
          <div><span>Lichtste</span><strong>${this._formatNumber(summary.lightest, "g")}</strong></div>
          <div><span>Zwaarste</span><strong>${this._formatNumber(summary.heaviest, "g")}</strong></div>
          <div class="${summary.attention ? "attention" : ""}"><span>Aandacht</span><strong>${summary.attention}</strong></div>
        </div>
      `;

    const puppyCards = this._config.show_puppy_cards === false
      ? ""
      : rows.length
      ? `
        <div class="puppy-grid">
          ${rows
            .map(
              (row) => `
                <button class="puppy-card ${
                  row.puppyId === this._selectedPuppyId ? "selected" : ""
                }" data-puppy-id="${this._escape(row.puppyId)}">
                  <div class="puppy-head">
                    <span class="status-dot ${this._statusClass(row.statusCode)}"></span>
                    <div>
                      <strong>${this._escape(row.name)}</strong>
                      <span>${this._escape(row.age)}</span>
                    </div>
                    <span class="status-pill ${this._statusClass(row.statusCode)}">${this._escape(
                row.status
              )}</span>
                  </div>
                  <div class="puppy-metrics">
                    <div><span>Gewicht</span><strong>${this._formatNumber(row.weight, "g")}</strong></div>
                    <div><span>24 uur</span><strong>${this._formatNumber(row.growth24, "%", true)}</strong></div>
                    <div><span>Sinds geboorte</span><strong>${this._formatNumber(row.growthBirth, "%", true)}</strong></div>
                  </div>
                </button>
              `
            )
            .join("")}
        </div>
      `
      : `<div class="empty small">Geen actieve pups gevonden in dit nest.</div>`;

    const selectedDetails = selected
      ? `
        <div class="detail-panel">
          <div class="detail-title">
            <div>
              <span class="eyebrow">Geselecteerde pup</span>
              <h3>${this._escape(selected.name)}</h3>
            </div>
            <span class="status-pill ${this._statusClass(selected.statusCode)}">${this._escape(
          selected.status
        )}</span>
          </div>
          <div class="detail-grid">
            <div><span>Leeftijd</span><strong>${this._escape(selected.age)}</strong></div>
            <div><span>Geslacht</span><strong>${this._escape(selected.sex)}</strong></div>
            <div><span>Bandje</span><strong>${this._escape(selected.collar || "—")}</strong></div>
            <div><span>Geboortegewicht</span><strong>${this._formatNumber(selected.birthWeight, "g")}</strong></div>
            <div><span>Huidig gewicht</span><strong>${this._formatNumber(selected.weight, "g")}</strong></div>
            <div><span>Vorige meting</span><strong>${this._formatNumber(selected.previousWeight, "g")}</strong></div>
            <div><span>Verschil</span><strong>${this._formatNumber(selected.weightChange, "g", true)}</strong></div>
            <div><span>Groei 24 uur</span><strong>${this._formatNumber(selected.growth24, "%", true)}</strong></div>
            <div><span>Totale groei</span><strong>${this._formatNumber(selected.growthBirth, "%", true)}</strong></div>
            <div><span>Laatste weging</span><strong>${this._escape(this._formatDateTime(selected.lastWeighed))}</strong></div>
          </div>
        </div>
      `
      : "";

    const tooltipHtml = this._tooltip
      ? `
        <div class="chart-tooltip ${this._tooltip.statusClass || ""}">
          <strong>${this._escape(this._tooltip.name)}</strong>
          <span>${this._escape(this._formatDateTime(new Date(this._tooltip.time).toISOString()))}</span>
          <b>${this._escape(this._tooltip.value)} ${this._escape(this._tooltip.unit)}</b>
        </div>
      `
      : `<div class="chart-hint">Tik op een meetpunt voor details.</div>`;

    this.shadowRoot.innerHTML = this._shell(`
      <div class="header">
        <div>
          <div class="eyebrow">Puppy Weight Tracker</div>
          <h2>${this._escape(this._config.title)}</h2>
        </div>
        <button class="icon-button" id="refresh-history" title="Grafiek vernieuwen">↻</button>
      </div>

      <div class="toolbar">
        <label>
          <span>Nest</span>
          <select id="litter-select">${litterOptions}</select>
        </label>
        <label>
          <span>Grafiek</span>
          <select id="metric-select">
            <option value="weight" ${this._metric === "weight" ? "selected" : ""}>Gewicht</option>
            <option value="growth24" ${this._metric === "growth24" ? "selected" : ""}>Groei / 24 uur</option>
            <option value="growthBirth" ${this._metric === "growthBirth" ? "selected" : ""}>Groei sinds geboorte</option>
          </select>
        </label>
      </div>

      <div class="range-tabs" role="group" aria-label="Grafiekperiode">
        ${[
          [24, "24u"],
          [72, "3d"],
          [168, "7d"],
          [336, "14d"],
          [720, "30d"],
        ]
          .map(
            ([hours, label]) => `
              <button class="range-button ${this._rangeHours === hours ? "active" : ""}" data-range="${hours}">${label}</button>`
          )
          .join("")}
      </div>

      ${summaryHtml}
      ${puppyCards}
      ${selectedDetails}

      <div class="chart-panel">
        <div class="chart-header">
          <div>
            <span class="eyebrow">Historie</span>
            <h3>${this._escape(
              this._metric === "weight"
                ? "Gewichtsontwikkeling"
                : this._metric === "growth24"
                ? "Groei per 24 uur"
                : "Groei sinds geboorte"
            )}</h3>
          </div>
          <span>${rows.length} ${rows.length === 1 ? "pup" : "pups"}</span>
        </div>
        ${this._chartSvg(rows)}
        <div class="legend">
          ${rows
            .map(
              (row, index) => `
                <button class="legend-item ${row.puppyId === this._selectedPuppyId ? "selected" : ""}" data-puppy-id="${this._escape(
                row.puppyId
              )}">
                  <span class="legend-color" style="--series-index:${index}"></span>
                  ${this._escape(row.name)}
                </button>`
            )
            .join("")}
        </div>
        ${tooltipHtml}
      </div>
    `);

    this._bindEvents();
  }

  _bindRediscover() {
    const button = this.shadowRoot?.querySelector("#rediscover");
    if (!button) return;

    button.addEventListener("click", () => {
      this._registryLoaded = false;
      this._loadRegistry();
    });
  }

  _bindEvents() {
    const litterSelect = this.shadowRoot?.querySelector("#litter-select");
    const metricSelect = this.shadowRoot?.querySelector("#metric-select");
    const refresh = this.shadowRoot?.querySelector("#refresh-history");

    litterSelect?.addEventListener("change", async (event) => {
      await this._selectLitter(event.target.value);
    });

    metricSelect?.addEventListener("change", async (event) => {
      this._metric = event.target.value;
      this._tooltip = null;
      this._history = {};
      this._historyKey = "";
      this._render();
      await this._loadHistory(true);
    });

    refresh?.addEventListener("click", () => this._loadHistory(true));

    this.shadowRoot?.querySelectorAll("[data-range]").forEach((button) => {
      button.addEventListener("click", async () => {
        this._rangeHours = Number(button.dataset.range) || 168;
        this._tooltip = null;
        this._history = {};
        this._historyKey = "";
        this._render();
        await this._loadHistory(true);
      });
    });

    this.shadowRoot?.querySelectorAll("[data-puppy-id]").forEach((item) => {
      item.addEventListener("click", () => {
        this._selectedPuppyId = item.dataset.puppyId;
        this._tooltip = null;
        this._render();
      });
    });

    this.shadowRoot?.querySelectorAll(".chart-point").forEach((point) => {
      const show = () => {
        const puppyId = point.dataset.puppyId;
        const row = this._puppyRows().find((item) => item.puppyId === puppyId);
        this._selectedPuppyId = puppyId;
        this._tooltip = {
          name: point.dataset.name || "Puppy",
          time: Number(point.dataset.time),
          value: point.dataset.value,
          unit: point.dataset.unit || "",
          statusClass: this._statusClass(row?.statusCode || "unknown"),
        };
        this._render();
      };

      point.addEventListener("click", show);
      point.addEventListener("mouseenter", show);
    });
  }

  _shell(content) {
    return `
      <style>
        :host {
          display: block;
          color: var(--primary-text-color);
          font-family: var(--paper-font-body1_-_font-family, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
        }

        * { box-sizing: border-box; }

        .card {
          background: var(--ha-card-background, var(--card-background-color, #fff));
          border-radius: var(--ha-card-border-radius, 12px);
          box-shadow: var(--ha-card-box-shadow, var(--card-box-shadow, none));
          border: var(--ha-card-border-width, 0) solid var(--ha-card-border-color, transparent);
          padding: 18px;
          overflow: hidden;
        }

        .header,
        .detail-title,
        .chart-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }

        .header { margin-bottom: 14px; }

        .eyebrow {
          color: var(--secondary-text-color);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: .08em;
          text-transform: uppercase;
          margin-bottom: 2px;
        }

        h2, h3 { margin: 0; line-height: 1.2; }
        h2 { font-size: 21px; }
        h3 { font-size: 17px; }

        .toolbar {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }

        label > span {
          display: block;
          color: var(--secondary-text-color);
          font-size: 12px;
          margin: 0 0 5px 2px;
        }

        select {
          width: 100%;
          min-height: 44px;
          border: 1px solid var(--divider-color);
          border-radius: 10px;
          background: var(--secondary-background-color);
          color: var(--primary-text-color);
          font: inherit;
          font-size: 15px;
          padding: 9px 11px;
          outline: none;
        }

        select:focus {
          border-color: var(--primary-color);
          box-shadow: 0 0 0 1px var(--primary-color);
        }

        button {
          font: inherit;
          color: inherit;
          cursor: pointer;
        }

        .icon-button {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          border: 1px solid var(--divider-color);
          background: var(--secondary-background-color);
          font-size: 20px;
        }

        .range-tabs {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 12px;
        }

        .range-button,
        .legend-item {
          border: 1px solid var(--divider-color);
          background: transparent;
          border-radius: 999px;
          min-height: 36px;
          padding: 6px 12px;
        }

        .range-button.active,
        .legend-item.selected {
          border-color: var(--primary-color);
          background: color-mix(in srgb, var(--primary-color) 10%, transparent);
        }

        .summary-grid {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 8px;
          margin-top: 14px;
        }

        .summary-grid > div,
        .detail-grid > div {
          min-width: 0;
          padding: 10px;
          border-radius: 10px;
          background: var(--secondary-background-color);
        }

        .summary-grid span,
        .detail-grid span,
        .puppy-metrics span {
          display: block;
          color: var(--secondary-text-color);
          font-size: 11px;
          margin-bottom: 3px;
        }

        .summary-grid strong,
        .detail-grid strong {
          display: block;
          font-size: 14px;
          overflow-wrap: anywhere;
        }

        .summary-grid .attention strong {
          color: var(--warning-color, #ff9800);
        }

        .puppy-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
          margin-top: 14px;
        }

        .puppy-card {
          width: 100%;
          min-width: 0;
          border: 1px solid var(--divider-color);
          background: transparent;
          border-radius: 12px;
          padding: 11px;
          text-align: left;
        }

        .puppy-card.selected {
          border-color: var(--primary-color);
          background: color-mix(in srgb, var(--primary-color) 7%, transparent);
        }

        .puppy-head {
          display: grid;
          grid-template-columns: 10px minmax(0, 1fr) auto;
          gap: 8px;
          align-items: center;
        }

        .puppy-head > div { min-width: 0; }
        .puppy-head strong { display: block; }
        .puppy-head > div > span {
          color: var(--secondary-text-color);
          font-size: 12px;
        }

        .status-dot {
          width: 9px;
          height: 9px;
          border-radius: 50%;
          background: var(--secondary-text-color);
        }

        .status-dot.ok { background: var(--success-color, #4caf50); }
        .status-dot.info { background: var(--primary-color); }
        .status-dot.warning { background: var(--warning-color, #ff9800); }
        .status-dot.danger { background: var(--error-color, #db4437); }

        .status-pill {
          font-size: 11px;
          font-weight: 700;
          border-radius: 999px;
          padding: 4px 7px;
          background: var(--secondary-background-color);
          white-space: nowrap;
        }

        .status-pill.ok { color: var(--success-color, #4caf50); }
        .status-pill.info { color: var(--primary-color); }
        .status-pill.warning { color: var(--warning-color, #ff9800); }
        .status-pill.danger { color: var(--error-color, #db4437); }

        .puppy-metrics {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
          margin-top: 10px;
        }

        .puppy-metrics strong {
          font-size: 13px;
          overflow-wrap: anywhere;
        }

        .detail-panel,
        .chart-panel {
          margin-top: 15px;
          padding-top: 15px;
          border-top: 1px solid var(--divider-color);
        }

        .detail-grid {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 7px;
          margin-top: 10px;
        }

        .chart-header {
          align-items: end;
          margin-bottom: 6px;
        }

        .chart-header > span {
          color: var(--secondary-text-color);
          font-size: 12px;
        }

        .chart-scroll {
          width: 100%;
          min-width: 0;
          overflow: hidden;
        }

        .chart {
          display: block;
          width: 100%;
          min-width: 0;
          max-width: 100%;
          height: auto;
          overflow: visible;
        }

        .grid-line {
          stroke: var(--divider-color);
          stroke-width: 1;
          opacity: .7;
        }

        .grid-line.vertical { opacity: .35; }

        .axis-label,
        .unit-label {
          fill: var(--secondary-text-color);
          font-size: 11px;
        }

        .chart-line {
          fill: none;
          stroke: hsl(calc(var(--series-index) * 63 + 205) 68% 52%);
          stroke-width: 2.4;
          stroke-linecap: round;
          stroke-linejoin: round;
          opacity: .72;
          vector-effect: non-scaling-stroke;
        }

        .chart-line.selected {
          stroke-width: 4;
          opacity: 1;
        }

        .chart-point {
          fill: var(--ha-card-background, var(--card-background-color, #fff));
          stroke: hsl(calc(var(--series-index) * 63 + 205) 68% 52%);
          stroke-width: 2.4;
          cursor: pointer;
          vector-effect: non-scaling-stroke;
        }

        .legend {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
          margin-top: 6px;
        }

        .legend-item {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          min-height: 34px;
          padding: 5px 10px;
          font-size: 12px;
        }

        .legend-color {
          width: 9px;
          height: 9px;
          border-radius: 50%;
          background: hsl(calc(var(--series-index) * 63 + 205) 68% 52%);
        }

        .chart-tooltip,
        .chart-hint {
          margin-top: 8px;
          min-height: 40px;
          padding: 8px 10px;
          border-radius: 9px;
          background: var(--secondary-background-color);
          font-size: 12px;
        }

        .chart-tooltip {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }

        .chart-tooltip span { color: var(--secondary-text-color); }
        .chart-tooltip b { margin-left: auto; font-size: 14px; }

        .chart-empty,
        .empty,
        .loading {
          padding: 22px 12px;
          text-align: center;
          color: var(--secondary-text-color);
        }

        .empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
        }

        .empty strong { color: var(--primary-text-color); }
        .empty.small { padding: 14px 8px; }
        .chart-empty.error { color: var(--error-color, #db4437); }

        .secondary {
          min-height: 42px;
          padding: 8px 13px;
          border-radius: 9px;
          border: 1px solid var(--divider-color);
          background: var(--secondary-background-color);
        }

        @media (max-width: 650px) {
          .summary-grid { grid-template-columns: repeat(2, 1fr); }
          .summary-grid > div:last-child { grid-column: span 2; }
          .puppy-grid { grid-template-columns: 1fr; }
          .detail-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }

        @media (max-width: 430px) {
          .card { padding: 14px; }
          .toolbar { grid-template-columns: 1fr; }
          .puppy-metrics { grid-template-columns: repeat(3, minmax(0, 1fr)); }
          .status-pill { max-width: 110px; overflow: hidden; text-overflow: ellipsis; }
          .chart-tooltip b { margin-left: 0; }
        }
      </style>
      <ha-card>
        <div class="card">${content}</div>
      </ha-card>
    `;
  }
}

if (!customElements.get("puppy-weight-overview-card")) {
  customElements.define("puppy-weight-overview-card", PuppyWeightOverviewCard);
}

window.customCards = window.customCards || [];

if (!window.customCards.some((card) => card.type === "puppy-weight-overview-card")) {
  window.customCards.push({
    type: "puppy-weight-overview-card",
    name: "Puppy Weight Overview",
    description: "Dynamisch overzicht en groeigrafieken voor Puppy Weight Tracker.",
    preview: true,
  });
}

console.info(
  "%c PUPPY-WEIGHT-OVERVIEW-CARD %c v1.0.0 ",
  "color: white; background: #607d8b; font-weight: 700;",
  "color: #607d8b; background: white; font-weight: 700;"
);
