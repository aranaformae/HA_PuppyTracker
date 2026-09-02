// Puppy Tracker Overview Card v1.3.2
class PuppyTrackerOverviewCard extends HTMLElement {
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
    this._dataUnsubscribe = null;
    this._dataSubscriptionPending = false;
    this._exportStatus = "";
    this._measurementPanelOpen = false;
    this._measurementData = null;
    this._measurementLoading = false;
    this._measurementError = "";
    this._measurementKey = "";
    this._measurementReloadTimer = null;
    this._editingMeasurementId = null;
    this._deletingMeasurementId = null;
    this._measurementActionStatus = "";
    this._chartSelectedOnly = false;
    this._measurementFilters = { active: true, superseded: false, deleted: false };
    this._expandedMeasurementChains = new Set();
    this._highlightedMeasurementId = null;
    this._interactionActive = false;
    this._interactionReleaseTimer = null;
    this._renderPending = false;
    this._renderScheduled = false;
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
                { value: "all", label: "Alles" },
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

    this._scheduleRender();
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
      this._scheduleRender();
      return;
    }

    // Ignore unrelated Home Assistant state traffic. Rebuilding the complete
    // shadow DOM for every state update is unnecessary and can interrupt
    // native controls on iOS/iPadOS. Explicit card actions still force a
    // render when the local UI state changes.
    if (!this.shadowRoot?.querySelector("ha-card")) this._scheduleRender();
  }

  _interactiveControlFocused() {
    const active = this.shadowRoot?.activeElement;
    return Boolean(active && active.matches?.("input, select, textarea"));
  }

  _beginInteraction() {
    if (this._interactionReleaseTimer) {
      window.clearTimeout(this._interactionReleaseTimer);
      this._interactionReleaseTimer = null;
    }
    this._interactionActive = true;
  }

  _endInteraction(delay = 220) {
    if (this._interactionReleaseTimer) {
      window.clearTimeout(this._interactionReleaseTimer);
    }

    this._interactionReleaseTimer = window.setTimeout(() => {
      this._interactionReleaseTimer = null;
      this._interactionActive = false;
      if (this._renderPending && !this._interactiveControlFocused()) {
        this._renderPending = false;
        this._scheduleRender(true);
      }
    }, delay);
  }

  _scheduleRender(force = false) {
    if (!this.shadowRoot) return;

    if (!force && (this._interactionActive || this._interactiveControlFocused())) {
      this._renderPending = true;
      return;
    }

    if (this._renderScheduled) return;
    this._renderScheduled = true;

    window.requestAnimationFrame(() => {
      this._renderScheduled = false;
      if (!force && (this._interactionActive || this._interactiveControlFocused())) {
        this._renderPending = true;
        return;
      }
      this._renderPending = false;
      this._render();
    });
  }

  disconnectedCallback() {
    if (this._historyReloadTimer) {
      clearTimeout(this._historyReloadTimer);
      this._historyReloadTimer = null;
    }

    if (this._measurementReloadTimer) {
      clearTimeout(this._measurementReloadTimer);
      this._measurementReloadTimer = null;
    }

    if (this._interactionReleaseTimer) {
      clearTimeout(this._interactionReleaseTimer);
      this._interactionReleaseTimer = null;
    }

    if (this._dataUnsubscribe) {
      const unsubscribe = this._dataUnsubscribe;
      this._dataUnsubscribe = null;
      Promise.resolve(unsubscribe()).catch(() => undefined);
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
    const ranges = {
      "24h": 24,
      "3d": 72,
      "7d": 168,
      "14d": 336,
      "30d": 720,
      all: 0,
    };

    return Object.prototype.hasOwnProperty.call(ranges, range)
      ? ranges[range]
      : 168;
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
      await this._subscribeToData();
      await this._loadHistory(true);
    } catch (err) {
      console.error("Puppy Tracker Overview card: discovery failed", err);
      this._historyError =
        err?.message || "Puppy Tracker kon niet automatisch worden gevonden.";
    } finally {
      this._registryLoading = false;
      this._scheduleRender();
    }
  }

  _deviceHasIdentifier(device, identifier) {
    return (device?.identifiers || []).some(
      (item) =>
        Array.isArray(item) &&
        item.length >= 2 &&
        item[0] === "puppy_tracker" &&
        item[1] === identifier
    );
  }

  _deviceIdentifier(device, prefix) {
    const match = (device?.identifiers || []).find(
      (item) =>
        Array.isArray(item) &&
        item.length >= 2 &&
        item[0] === "puppy_tracker" &&
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
        "puppy_tracker_litter_select"
      ),
      puppy: this._entityForDevice(
        device.id,
        "puppy_tracker_puppy_select"
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
        const historyPuppy = (this._history?.puppies || []).find(
          (item) => item?.id === puppyId
        );
        const analysis = historyPuppy?.summary?.growth_analysis || {};

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
          analysis,
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

  _selectedLitterStorageId() {
    const litter = this._selectedLitter();
    const identifier = this._deviceIdentifier(litter, "litter_");
    return identifier ? identifier.slice("litter_".length) : null;
  }

  _historyCacheKey() {
    return this._selectedLitterStorageId() || "";
  }

  async _subscribeToData() {
    if (
      !this._hass?.connection ||
      this._dataUnsubscribe ||
      this._dataSubscriptionPending
    ) {
      return;
    }

    this._dataSubscriptionPending = true;

    try {
      this._dataUnsubscribe = await this._hass.connection.subscribeMessage(
        () => {
          this._scheduleHistoryReload();
          this._scheduleMeasurementReload();
        },
        { type: "puppy_tracker/subscribe" }
      );
    } catch (err) {
      console.warn("Puppy Tracker Overview card: update subscription failed", err);
    } finally {
      this._dataSubscriptionPending = false;
    }
  }

  async _loadHistory(force = false) {
    if (!this._hass || !this._registryLoaded || this._historyLoading) return;

    const litterId = this._selectedLitterStorageId();
    const key = this._historyCacheKey();

    if (!force && key === this._historyKey && this._history?.litter) return;

    if (!litterId) {
      this._history = {};
      this._historyKey = key;
      this._historyError = "";
      this._scheduleRender();
      return;
    }

    this._historyLoading = true;
    this._historyError = "";
    this._scheduleRender();

    try {
      const result = await this._hass.callWS({
        type: "puppy_tracker/data",
        litter_id: litterId,
      });

      this._history = result && typeof result === "object" ? result : {};
      this._historyKey = key;
    } catch (err) {
      console.error("Puppy Tracker Overview card: measurement data failed", err);
      this._historyError =
        err?.message ||
        "De opgeslagen meetgegevens konden niet worden geladen.";
      this._history = {};
      this._historyKey = key;
    } finally {
      this._historyLoading = false;
      this._scheduleRender();
    }
  }

  _scheduleHistoryReload() {
    if (this._historyReloadTimer) clearTimeout(this._historyReloadTimer);

    this._historyReloadTimer = setTimeout(() => {
      this._historyReloadTimer = null;
      this._loadHistory(true);
    }, 250);
  }

  _measurementCacheKey() {
    return `${this._selectedLitterStorageId() || ""}:${this._selectedPuppyId || ""}`;
  }

  async _loadMeasurements(force = false) {
    if (!this._hass || !this._measurementPanelOpen || this._measurementLoading) return;

    const litterId = this._selectedLitterStorageId();
    const puppyId = this._selectedPuppyId;
    const key = this._measurementCacheKey();

    if (!litterId || !puppyId) {
      this._measurementData = null;
      this._measurementKey = key;
      this._measurementError = "";
      this._scheduleRender();
      return;
    }

    if (!force && this._measurementData && this._measurementKey === key) return;

    this._measurementLoading = true;
    this._measurementError = "";
    this._scheduleRender();

    try {
      const result = await this._hass.callWS({
        type: "puppy_tracker/measurements",
        litter_id: litterId,
        puppy_id: puppyId,
      });
      this._measurementData = result && typeof result === "object" ? result : null;
      this._measurementKey = key;
    } catch (err) {
      console.error("Puppy Tracker Overview card: measurement history failed", err);
      this._measurementError =
        err?.message || "De meetgeschiedenis kon niet worden geladen.";
      this._measurementData = null;
      this._measurementKey = key;
    } finally {
      this._measurementLoading = false;
      this._scheduleRender();
    }
  }

  _scheduleMeasurementReload() {
    if (!this._measurementPanelOpen) return;
    if (this._measurementReloadTimer) clearTimeout(this._measurementReloadTimer);

    this._measurementReloadTimer = window.setTimeout(() => {
      this._measurementReloadTimer = null;
      this._loadMeasurements(true);
    }, 260);
  }

  _measurementStatusLabel(status) {
    if (status === "active") return "Actief";
    if (status === "deleted") return "Verwijderd";
    if (status === "superseded") return "Oude versie (bewaard)";
    return "Onbekend";
  }

  _measurementStatusClass(status) {
    if (status === "active") return "active";
    if (status === "deleted") return "deleted";
    if (status === "superseded") return "superseded";
    return "neutral";
  }

  _dateTimeLocalValue(value) {
    const date = new Date(value || "");
    if (!Number.isFinite(date.getTime())) return "";
    const pad = (number) => String(number).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
      date.getHours()
    )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }

  _dateTimeLocalToIso(value) {
    const date = new Date(value || "");
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  }

  async _saveMeasurementEdit(measurementId) {
    const litterId = this._selectedLitterStorageId();
    const puppyId = this._selectedPuppyId;
    const weightInput = this.shadowRoot?.querySelector("#measurement-edit-weight");
    const timeInput = this.shadowRoot?.querySelector("#measurement-edit-time");
    const reasonInput = this.shadowRoot?.querySelector("#measurement-edit-reason");
    const weight = Number(weightInput?.value);
    const editedLocalTimestamp = String(timeInput?.value || "");
    const originalMeasurement = Array.isArray(this._measurementData?.measurements)
      ? this._measurementData.measurements.find((item) => item?.id === measurementId)
      : null;
    const originalLocalTimestamp = this._dateTimeLocalValue(originalMeasurement?.timestamp);
    const editedTimestamp = this._dateTimeLocalToIso(editedLocalTimestamp);
    const originalDisplayedTimestamp = this._dateTimeLocalToIso(originalLocalTimestamp);
    const timestampChanged =
      !originalMeasurement || editedTimestamp !== originalDisplayedTimestamp;
    const timestamp = timestampChanged ? editedTimestamp : null;

    if (!litterId || !puppyId || !measurementId) return;
    if (!Number.isFinite(weight) || weight <= 0) {
      this._measurementActionStatus = "Voer een geldig gewicht in.";
      this._scheduleRender(true);
      return;
    }
    if (timestampChanged && !timestamp) {
      this._measurementActionStatus = "Voer een geldige datum en tijd in.";
      this._scheduleRender(true);
      return;
    }

    this._measurementActionStatus = "Correctie opslaan…";
    this._interactionActive = false;
    this._scheduleRender(true);

    try {
      const request = {
        type: "puppy_tracker/measurement/correct",
        litter_id: litterId,
        puppy_id: puppyId,
        measurement_id: measurementId,
        weight,
        reason: String(reasonInput?.value || "Dashboardcorrectie").trim() || "Dashboardcorrectie",
      };
      // If the user only changes the weight, omit timestamp entirely so the
      // backend can preserve the original instant including seconds/fractions.
      if (timestampChanged) request.timestamp = timestamp;

      const result = await this._hass.callWS(request);
      if (result?.measurement_data) {
        this._measurementData = result.measurement_data;
        this._measurementKey = this._measurementCacheKey();
        this._measurementError = "";
      }
      this._editingMeasurementId = null;
      this._highlightedMeasurementId = result?.measurement_id || null;
      this._measurementActionStatus = `Correctie opgeslagen als actieve versie${
        result?.measurement_id ? ` (${String(result.measurement_id).slice(0, 8)})` : ""
      }.`;
      await this._loadHistory(true);
    } catch (err) {
      console.error("Puppy Tracker Overview card: correction failed", err);
      this._measurementActionStatus = err?.message || "Correctie opslaan mislukt.";
    }

    this._scheduleRender(true);
  }

  async _deleteMeasurement(measurementId) {
    const litterId = this._selectedLitterStorageId();
    const puppyId = this._selectedPuppyId;
    const reasonInput = this.shadowRoot?.querySelector("#measurement-delete-reason");
    if (!litterId || !puppyId || !measurementId) return;

    this._measurementActionStatus = "Meting verwijderen…";
    this._interactionActive = false;
    this._scheduleRender(true);

    try {
      const result = await this._hass.callWS({
        type: "puppy_tracker/measurement/delete",
        litter_id: litterId,
        puppy_id: puppyId,
        measurement_id: measurementId,
        reason: String(reasonInput?.value || "Dashboard verwijderen").trim() || "Dashboard verwijderen",
      });
      if (result?.measurement_data) {
        this._measurementData = result.measurement_data;
        this._measurementKey = this._measurementCacheKey();
        this._measurementError = "";
      }
      this._deletingMeasurementId = null;
      this._editingMeasurementId = null;
      this._highlightedMeasurementId = null;
      this._measurementActionStatus = "Meting verwijderd. Bij een correctie is de direct vorige versie weer actief.";
      await this._loadHistory(true);
    } catch (err) {
      console.error("Puppy Tracker Overview card: delete failed", err);
      this._measurementActionStatus = err?.message || "Meting verwijderen mislukt.";
    }

    this._scheduleRender(true);
  }

  async _restoreMeasurement(measurementId) {
    const litterId = this._selectedLitterStorageId();
    const puppyId = this._selectedPuppyId;
    if (!litterId || !puppyId || !measurementId) return;

    this._measurementActionStatus = "Meting herstellen…";
    this._interactionActive = false;
    this._scheduleRender(true);

    try {
      const result = await this._hass.callWS({
        type: "puppy_tracker/measurement/restore",
        litter_id: litterId,
        puppy_id: puppyId,
        measurement_id: measurementId,
        reason: "Hersteld vanuit dashboard",
      });
      if (result?.measurement_data) {
        this._measurementData = result.measurement_data;
        this._measurementKey = this._measurementCacheKey();
        this._measurementError = "";
      }
      this._highlightedMeasurementId = result?.measurement_id || measurementId;
      this._measurementActionStatus = result?.restored_as_new_version
        ? "Meting hersteld als nieuwe actieve versie, omdat de correctieketen intussen was gewijzigd."
        : "Meting hersteld en weer actief.";
      await this._loadHistory(true);
    } catch (err) {
      console.error("Puppy Tracker Overview card: restore failed", err);
      this._measurementActionStatus = err?.message || "Meting herstellen mislukt.";
    }

    this._scheduleRender(true);
  }

  _measurementTimestamp(measurement) {
    const value = new Date(measurement?.timestamp || "").getTime();
    return Number.isFinite(value) ? value : 0;
  }

  _measurementChains(measurements) {
    const byId = new Map(
      measurements.filter((item) => item?.id).map((item) => [item.id, item])
    );
    const groups = new Map();

    const rootFor = (measurement) => {
      let current = measurement;
      const seen = new Set();
      while (current?.source_measurement_id && byId.has(current.source_measurement_id)) {
        if (seen.has(current.id)) break;
        seen.add(current.id);
        current = byId.get(current.source_measurement_id);
      }
      return current?.id || measurement?.id || "unknown";
    };

    measurements.forEach((measurement) => {
      const rootId = rootFor(measurement);
      if (!groups.has(rootId)) groups.set(rootId, []);
      groups.get(rootId).push(measurement);
    });

    return [...groups.entries()]
      .map(([rootId, items]) => ({
        rootId,
        items: items.sort(
          (a, b) => this._measurementTimestamp(b) - this._measurementTimestamp(a)
        ),
      }))
      .sort((a, b) => {
        const aActive = a.items.find((item) => item.status === "active");
        const bActive = b.items.find((item) => item.status === "active");
        const aTime = aActive
          ? this._measurementTimestamp(aActive)
          : Math.max(...a.items.map((item) => this._measurementTimestamp(item)));
        const bTime = bActive
          ? this._measurementTimestamp(bActive)
          : Math.max(...b.items.map((item) => this._measurementTimestamp(item)));
        return bTime - aTime;
      });
  }

  _measurementFilterEnabled(status) {
    return Boolean(this._measurementFilters?.[status]);
  }

  _scrollToHighlightedMeasurement() {
    if (!this._highlightedMeasurementId) return;
    window.requestAnimationFrame(() => {
      const row = this.shadowRoot?.querySelector(
        `[data-measurement-row="${CSS.escape(this._highlightedMeasurementId)}"]`
      );
      row?.scrollIntoView?.({ behavior: "smooth", block: "center" });
    });
  }

  _measurementPanelHtml(selected) {
    if (!selected || !this._measurementPanelOpen) return "";

    if (this._measurementLoading && !this._measurementData) {
      return `<div class="measurement-panel"><div class="loading compact">Meetgeschiedenis laden…</div></div>`;
    }

    if (this._measurementError) {
      return `<div class="measurement-panel"><div class="message error">${this._escape(
        this._measurementError
      )}</div></div>`;
    }

    const measurements = Array.isArray(this._measurementData?.measurements)
      ? this._measurementData.measurements
      : [];
    const counts = this._measurementData?.counts || {};
    const chains = this._measurementChains(measurements);
    const activeMeasurements = measurements
      .filter((item) => item?.status === "active")
      .sort((a, b) => this._measurementTimestamp(b) - this._measurementTimestamp(a));
    const latestActive = activeMeasurements[0] || null;

    const renderRow = (measurement, options = {}) => {
      const status = measurement.status || "unknown";
      const isEditing = this._editingMeasurementId === measurement.id;
      const isDeleting = this._deletingMeasurementId === measurement.id;
      const isActive = status === "active";
      const isDeleted = status === "deleted";
      const sourceShort = measurement.source_measurement_id
        ? String(measurement.source_measurement_id).slice(0, 8)
        : "";
      const supersededShort = measurement.superseded_by
        ? String(measurement.superseded_by).slice(0, 8)
        : "";
      const highlighted = this._highlightedMeasurementId === measurement.id;

      const lineage = [
        sourceShort ? `correctie van ${sourceShort}` : "",
        supersededShort ? `vervangen door ${supersededShort}` : "",
      ]
        .filter(Boolean)
        .join(" · ");

      const editForm = isEditing
        ? `
          <div class="measurement-edit-form" data-editor-for="${this._escape(measurement.id)}">
            <label><span>Gewicht</span><div class="inline-unit"><input id="measurement-edit-weight" type="number" inputmode="decimal" min="1" max="10000" step="1" value="${this._escape(
              measurement.weight ?? ""
            )}"><b>g</b></div></label>
            <label><span>Datum en tijd</span><input id="measurement-edit-time" type="datetime-local" step="1" value="${this._escape(
              this._dateTimeLocalValue(measurement.timestamp)
            )}"></label>
            <label class="reason-field"><span>Reden</span><input id="measurement-edit-reason" type="text" value="${this._escape(
              measurement.correction_reason || "Dashboardcorrectie"
            )}" maxlength="160"></label>
            <div class="measurement-form-actions">
              <button class="mini-button primary-mini" id="measurement-edit-save" data-measurement-id="${this._escape(
                measurement.id
              )}">Opslaan</button>
              <button class="mini-button" id="measurement-edit-cancel">Annuleren</button>
            </div>
          </div>`
        : "";

      const deleteForm = isDeleting
        ? `
          <div class="measurement-delete-form">
            <div><strong>Deze meting verwijderen?</strong><span>De meting blijft bewaard en kan later worden hersteld.</span></div>
            <label><span>Reden (optioneel)</span><input id="measurement-delete-reason" type="text" maxlength="160" placeholder="Bijv. foutieve invoer"></label>
            <div class="measurement-form-actions">
              <button class="mini-button danger-mini" id="measurement-delete-confirm" data-measurement-id="${this._escape(
                measurement.id
              )}">Verwijderen</button>
              <button class="mini-button" id="measurement-delete-cancel">Annuleren</button>
            </div>
          </div>`
        : "";

      const actions = isEditing || isDeleting
        ? ""
        : `
          <div class="measurement-actions">
            ${
              isActive
                ? `<button class="mini-button" data-edit-measurement="${this._escape(
                    measurement.id
                  )}">Wijzigen</button><button class="mini-button danger-text" data-delete-measurement="${this._escape(
                    measurement.id
                  )}">Verwijderen</button>`
                : ""
            }
            ${
              isDeleted && !measurement.superseded_by
                ? `<button class="mini-button" data-restore-measurement="${this._escape(
                    measurement.id
                  )}">Herstellen</button>`
                : ""
            }
          </div>`;

      return `
        <div class="measurement-row ${this._measurementStatusClass(status)} ${
          options.nested ? "nested" : ""
        } ${highlighted ? "highlighted" : ""}" data-measurement-row="${this._escape(
          measurement.id
        )}">
          <div class="measurement-main">
            <div>
              <strong>${this._formatNumber(Number(measurement.weight), "g")}</strong>
              <span>${this._escape(this._formatDateTime(measurement.timestamp))}</span>
            </div>
            <span class="measurement-status ${this._measurementStatusClass(status)}">${this._escape(
              this._measurementStatusLabel(status)
            )}</span>
          </div>
          <div class="measurement-meta">
            <span>${measurement.kind === "birth" ? "Geboortegewicht" : "Weging"}</span>
            ${measurement.note ? `<span>Notitie: ${this._escape(measurement.note)}</span>` : ""}
            ${
              measurement.correction_reason
                ? `<span>Correctiereden: ${this._escape(measurement.correction_reason)}</span>`
                : ""
            }
            ${lineage ? `<span class="lineage">${this._escape(lineage)}</span>` : ""}
          </div>
          ${actions}
          ${editForm}
          ${deleteForm}
        </div>`;
    };

    const chainRows = chains
      .map((chain) => {
        const matching = chain.items.filter((item) => this._measurementFilterEnabled(item.status));
        if (!matching.length) return "";

        const active = chain.items.find((item) => item.status === "active");
        const lead = active && this._measurementFilterEnabled("active") ? active : matching[0];
        const history = chain.items.filter((item) => item.id !== lead.id);
        const isExpanded = this._expandedMeasurementChains.has(chain.rootId);
        const visibleHistory = isExpanded
          ? history
          : history.filter((item) => this._measurementFilterEnabled(item.status));
        const hiddenCount = history.length - visibleHistory.length;

        return `
          <div class="measurement-chain ${isExpanded ? "expanded" : ""}">
            ${renderRow(lead)}
            ${
              history.length
                ? `<button class="chain-toggle" data-chain-id="${this._escape(chain.rootId)}">
                    ${
                      isExpanded
                        ? "Historie inklappen"
                        : `${history.length} ${history.length === 1 ? "eerdere versie" : "eerdere versies"}`
                    }
                  </button>`
                : ""
            }
            <div class="chain-history ${isExpanded ? "open" : ""}">
              ${visibleHistory.map((item) => renderRow(item, { nested: true })).join("")}
            </div>
            ${!isExpanded && hiddenCount > 0 ? `<span class="chain-hidden-hint">${hiddenCount} historische ${hiddenCount === 1 ? "versie" : "versies"} ingeklapt</span>` : ""}
          </div>`;
      })
      .filter(Boolean)
      .join("");

    const filterButton = (status, label, count) => `
      <button class="measurement-filter ${this._measurementFilterEnabled(status) ? "active" : ""}"
              data-measurement-filter="${status}">
        ${this._escape(label)} <b>${Number(count || 0)}</b>
      </button>`;

    const latestHtml = latestActive
      ? `
        <div class="current-measurement">
          <div>
            <span class="eyebrow">Huidige meting</span>
            <strong>${this._formatNumber(Number(latestActive.weight), "g")}</strong>
          </div>
          <div>
            <span>${this._escape(this._formatDateTime(latestActive.timestamp))}</span>
            <small>${latestActive.kind === "birth" ? "Geboortegewicht" : "Laatste geldige weging"}</small>
          </div>
        </div>`
      : "";

    return `
      <div class="measurement-panel">
        <div class="measurement-panel-header">
          <div>
            <span class="eyebrow">Meetgeschiedenis</span>
            <h3>${this._escape(selected.name)}</h3>
          </div>
          <div class="measurement-counts">
            <span>${Number(counts.active || 0)} actief</span>
            ${Number(counts.superseded || 0) ? `<span>${Number(counts.superseded)} oude versies</span>` : ""}
            ${Number(counts.deleted || 0) ? `<span>${Number(counts.deleted)} verwijderd</span>` : ""}
          </div>
        </div>
        ${latestHtml}
        <div class="measurement-mini-chart">
          <div class="mini-chart-heading">
            <div><span class="eyebrow">Geselecteerde pup</span><strong>${this._escape(
              this._metric === "weight"
                ? "Gewichtsontwikkeling"
                : this._metric === "growth24"
                ? "Groei per 24 uur"
                : "Groei sinds geboorte"
            )}</strong></div>
            <span>${this._rangeHours === 0 ? "Alles" : `${this._rangeHours} uur`}</span>
          </div>
          ${this._chartSvg([selected])}
        </div>
        <div class="measurement-filterbar" role="group" aria-label="Meetgeschiedenis filteren">
          ${filterButton("active", "Actief", counts.active)}
          ${filterButton("superseded", "Oude versies", counts.superseded)}
          ${filterButton("deleted", "Verwijderd", counts.deleted)}
        </div>
        ${
          this._measurementActionStatus
            ? `<div class="measurement-action-status">${this._escape(this._measurementActionStatus)}</div>`
            : ""
        }
        ${chainRows || `<div class="empty small">Geen metingen binnen de gekozen filters.</div>`}
      </div>`;
  }

  _currentStateSignature() {
    if (!this._registryLoaded || !this._hass) return "";

    const entityIds = new Set();
    this._puppyRows().forEach((row) => {
      Object.values(row.entityIds || {}).forEach((entityId) => {
        if (entityId) entityIds.add(entityId);
      });
    });

    const station = this._station();
    Object.values(station || {}).forEach((entityId) => {
      if (typeof entityId === "string") entityIds.add(entityId);
    });

    return [...entityIds]
      .sort()
      .map((entityId) => {
        const state = this._state(entityId);
        return `${entityId}:${state?.state || ""}:${state?.last_updated || ""}`;
      })
      .join("|");
  }

  _dataPuppy(row) {
    const puppies = Array.isArray(this._history?.puppies)
      ? this._history.puppies
      : [];
    return puppies.find((puppy) => puppy?.id === row.puppyId) || null;
  }

  _measurementSeries(row) {
    const puppy = this._dataPuppy(row);
    const measurements = Array.isArray(puppy?.measurements)
      ? puppy.measurements
      : [];

    return measurements
      .map((measurement) => {
        const value = Number(measurement?.weight);
        const time = new Date(measurement?.timestamp || "").getTime();
        if (!Number.isFinite(value) || !Number.isFinite(time)) return null;
        return {
          time,
          value,
          measurementId: measurement.id || "",
          kind: measurement.kind || "weight",
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.time - b.time);
  }

  _growth24Points(series) {
    const result = [];
    const minimumIntervalHours = 6;

    for (let index = 1; index < series.length; index += 1) {
      const current = series[index];
      const targetTime = current.time - 24 * 3600 * 1000;
      let best = null;

      for (let previousIndex = 0; previousIndex < index; previousIndex += 1) {
        const candidate = series[previousIndex];
        const intervalHours = (current.time - candidate.time) / 3600000;
        if (intervalHours < minimumIntervalHours || candidate.value <= 0) continue;

        const distance = Math.abs(candidate.time - targetTime);
        if (!best || distance < best.distance) {
          best = { candidate, intervalHours, distance };
        }
      }

      if (!best) continue;

      const actualPercent =
        ((current.value - best.candidate.value) / best.candidate.value) * 100;
      const normalizedPercent = actualPercent * (24 / best.intervalHours);

      if (Number.isFinite(normalizedPercent)) {
        result.push({
          time: current.time,
          value: Math.round(normalizedPercent * 100) / 100,
          measurementId: current.measurementId,
        });
      }
    }

    return result;
  }

  _metricPoints(row) {
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

    const end = Date.now();
    const start = this._rangeHours > 0
      ? end - this._rangeHours * 3600 * 1000
      : Number.NEGATIVE_INFINITY;

    this._historyWindowStart = Number.isFinite(start) ? start : null;
    this._historyWindowEnd = end;

    return points.filter(
      (point) => point.time >= start && point.time <= end + 60000
    );
  }

  _chartSeries(rows) {
    return rows
      .map((row, index) => {
        const config = this._metricConfig(row);
        const points = this._metricPoints(row);

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

    // Fixed periods always span the complete selected window. "Alles" starts
    // at the first effective measurement and runs through the current time.
    let maxTime = Date.now();
    let minTime = this._rangeHours > 0
      ? maxTime - this._rangeHours * 3600 * 1000
      : Math.min(...allPoints.map((point) => point.time));
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
    if (code === "ok" || code === "on_track") return "ok";
    if (code === "first_24h" || code === "insufficient_data") return "info";
    if (code === "low_growth" || code === "below_threshold" || code === "sustained_low_growth") return "warning";
    if (
      [
        "weight_loss",
        "weigh_due",
        "no_measurement",
        "first_day_excess_weight_loss",
        "loss",
        "stale",
        "possible_input_error",
        "sustained_weight_loss",
      ].includes(code)
    ) {
      return "danger";
    }
    return "neutral";
  }

  _litterComparisonLabel(comparison) {
    if (!comparison) return "Onvoldoende nestdata";
    if (comparison.position_code === "below_median") return "Onder nestmediaan";
    if (comparison.position_code === "above_median") return "Boven nestmediaan";
    if (comparison.position_code === "near_median") return "Rond nestmediaan";
    return "Onbekend";
  }

  _litterGrowthLabel(comparison) {
    if (!comparison) return "Onvoldoende nesttempo-data";
    if (comparison.position_code === "below_median") return "Onder nesttempo";
    if (comparison.position_code === "above_median") return "Boven nesttempo";
    return "Rond nesttempo";
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
    this._measurementData = null;
    this._measurementKey = "";
    this._measurementPanelOpen = false;
    this._editingMeasurementId = null;
    this._deletingMeasurementId = null;
    this._measurementActionStatus = "";
    this._chartSelectedOnly = false;
    this._measurementFilters = { active: true, superseded: false, deleted: false };
    this._expandedMeasurementChains = new Set();
    this._highlightedMeasurementId = null;

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
          console.warn("Puppy Tracker Overview card: station litter sync failed", err);
        }
      }
    }

    this._scheduleRender();
    await this._loadHistory(true);
  }

  async _exportData(format) {
    const litterId = this._selectedLitterStorageId();
    if (!this._hass || !litterId) return;

    this._exportStatus = `${format.toUpperCase()} maken…`;
    this._scheduleRender();

    try {
      const result = await this._hass.callWS({
        type: "puppy_tracker/export",
        litter_id: litterId,
        format,
      });

      const content = format === "csv" ? `\ufeff${result.content || ""}` : result.content || "";
      const blob = new Blob([content], {
        type: result.mime_type || "application/octet-stream",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = result.filename || `puppy-tracker.${format}`;
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30000);

      this._exportStatus = `${format.toUpperCase()} export klaar`;
    } catch (err) {
      console.error(`Puppy Tracker Overview card: ${format} export failed`, err);
      this._exportStatus = err?.message || `${format.toUpperCase()} export mislukt`;
    }

    this._scheduleRender();
    window.setTimeout(() => {
      if (this._exportStatus) {
        this._exportStatus = "";
        this._scheduleRender();
      }
    }, 3500);
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
        `<div class="loading">Puppy Tracker zoeken…</div>`
      );
      return;
    }

    const litters = this._litterDevices();

    if (!litters.length) {
      this.shadowRoot.innerHTML = this._shell(`
        <div class="empty">
          <strong>Geen nesten gevonden</strong>
          <span>Controleer of Puppy Tracker geladen is.</span>
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
    const chartRows = this._chartSelectedOnly && selected ? [selected] : rows;

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
                  <div class="growth-analysis ${this._statusClass(row.analysis?.status_code)}">
                    <span>Analyse</span>
                    <strong>${this._escape(row.analysis?.status || "Onvoldoende data")}</strong>
                    <small>${this._escape(row.analysis?.trend || "Onvoldoende data")}</small>
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
            <div class="detail-actions">
              <button class="mini-button" id="toggle-chart-focus">${
                this._chartSelectedOnly ? "Alle pups in grafiek" : "Alleen deze pup"
              }</button>
              ${
                this._history?.can_manage_measurements
                  ? `<button class="mini-button" id="toggle-measurements">${
                      this._measurementPanelOpen ? "Metingen sluiten" : "Metingen beheren"
                    }</button>`
                  : ""
              }
              <span class="status-pill ${this._statusClass(selected.statusCode)}">${this._escape(
          selected.status
        )}</span>
            </div>
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
          <div class="analysis-panel ${this._statusClass(selected.analysis?.status_code)}">
            <div><span>Groeianalyse</span><strong>${this._escape(selected.analysis?.status || "Onvoldoende data")}</strong></div>
            <div><span>Trend</span><strong>${this._escape(selected.analysis?.trend || "Onvoldoende data")}</strong></div>
            <div><span>Datakwaliteit</span><strong>${this._escape(selected.analysis?.data_quality || "none")}</strong></div>
            <div><span>Nestdrempel</span><strong>${this._formatNumber(selected.analysis?.min_daily_growth_percent, "%", true)}</strong></div>
            <div><span>Gewichtspatroon</span><strong>${this._escape(selected.analysis?.weight_pattern?.sustained_loss ? "Aanhoudende daling" : "Geen aanhoudende daling")}</strong></div>
            <div><span>Groeipatroon</span><strong>${this._escape(selected.analysis?.growth_pattern?.sustained_low_growth ? "Aanhoudend lage groei" : "Geen aanhoudend lage groei")}</strong></div>
            <div><span>Nestpositie</span><strong>${this._escape(this._litterComparisonLabel(selected.analysis?.litter_comparison))}</strong></div>
            <div><span>Afwijking mediaan</span><strong>${this._formatNumber(selected.analysis?.litter_comparison?.delta_percent, "%", true)}</strong></div>
            <div><span>Nesttempo</span><strong>${this._escape(this._litterGrowthLabel(selected.analysis?.litter_growth_comparison))}</strong></div>
            <div><span>Afwijking nesttempo</span><strong>${this._formatNumber(selected.analysis?.litter_growth_comparison?.delta_percentage_points, "%", true)}</strong></div>
            <div><span>Spreiding groeitempo</span><strong>${this._formatNumber(selected.analysis?.growth_variability?.range_percentage_points, "%-punt", true)}</strong></div>
          </div>
        </div>
      `
      : "";

    const integrity = this._history?.integrity || null;
    const integrityWarning = integrity && Number(integrity.unresolved_critical || 0) > 0
      ? `<div class="integrity-warning"><strong>Data-integriteit vraagt aandacht</strong><span>${this._escape(
          String(integrity.unresolved_critical || 0)
        )} kritisch probleem/problemen konden niet automatisch worden gerepareerd. Open Puppy Tracker → Configureren → Data-integriteit controleren en download eventueel diagnostiek.</span></div>`
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
          <div class="eyebrow">Puppy Tracker</div>
          <h2>${this._escape(this._config.title)}</h2>
        </div>
        <div class="header-actions">
          <button class="export-button" id="export-csv" title="Actieve metingen exporteren als CSV">CSV</button>
          <button class="export-button" id="export-json" title="Volledige nestdata exporteren als JSON">JSON</button>
          <button class="icon-button" id="refresh-history" title="Meetgegevens vernieuwen">↻</button>
        </div>
      </div>

      ${integrityWarning}

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
          [0, "Alles"],
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
      ${this._measurementPanelHtml(selected)}

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
          <span>${chartRows.length} ${chartRows.length === 1 ? "pup" : "pups"} · eigen meetdata</span>
        </div>
        ${this._exportStatus ? `<div class="export-status">${this._escape(this._exportStatus)}</div>` : ""}
        ${this._chartSvg(chartRows)}
        <div class="legend">
          ${chartRows
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
    const exportCsv = this.shadowRoot?.querySelector("#export-csv");
    const exportJson = this.shadowRoot?.querySelector("#export-json");
    const toggleMeasurements = this.shadowRoot?.querySelector("#toggle-measurements");
    const toggleChartFocus = this.shadowRoot?.querySelector("#toggle-chart-focus");

    const interactiveControls = this.shadowRoot?.querySelectorAll(
      "input, select, textarea, button"
    );
    interactiveControls?.forEach((control) => {
      control.addEventListener("pointerdown", () => this._beginInteraction());
      control.addEventListener("touchstart", () => this._beginInteraction(), { passive: true });
      control.addEventListener("pointerup", () => this._endInteraction());
      control.addEventListener("pointercancel", () => this._endInteraction());
    });

    this.shadowRoot?.querySelectorAll("input, select, textarea").forEach((control) => {
      control.addEventListener("focus", () => this._beginInteraction());
      control.addEventListener("blur", () => this._endInteraction(160));
    });

    litterSelect?.addEventListener("change", async (event) => {
      const value = event.target.value;
      event.target.blur();
      this._interactionActive = false;
      await this._selectLitter(value);
      this._scheduleRender(true);
    });

    metricSelect?.addEventListener("change", (event) => {
      this._metric = event.target.value;
      this._tooltip = null;
      event.target.blur();
      this._interactionActive = false;
      this._scheduleRender(true);
    });

    refresh?.addEventListener("click", () => this._loadHistory(true));
    exportCsv?.addEventListener("click", () => this._exportData("csv"));
    exportJson?.addEventListener("click", () => this._exportData("json"));

    toggleChartFocus?.addEventListener("click", () => {
      this._chartSelectedOnly = !this._chartSelectedOnly;
      this._tooltip = null;
      this._interactionActive = false;
      this._scheduleRender(true);
    });

    toggleMeasurements?.addEventListener("click", async () => {
      this._measurementPanelOpen = !this._measurementPanelOpen;
      this._editingMeasurementId = null;
      this._deletingMeasurementId = null;
      this._measurementActionStatus = "";
      this._interactionActive = false;
      this._scheduleRender(true);
      if (this._measurementPanelOpen) await this._loadMeasurements(true);
    });

    this.shadowRoot?.querySelectorAll("[data-edit-measurement]").forEach((button) => {
      button.addEventListener("click", () => {
        this._editingMeasurementId = button.dataset.editMeasurement;
        this._deletingMeasurementId = null;
        this._measurementActionStatus = "";
        this._interactionActive = false;
        this._scheduleRender(true);
      });
    });

    this.shadowRoot?.querySelector("#measurement-edit-save")?.addEventListener("click", (event) => {
      const id = event.currentTarget?.dataset?.measurementId;
      this._saveMeasurementEdit(id);
    });
    this.shadowRoot?.querySelector("#measurement-edit-cancel")?.addEventListener("click", () => {
      this._editingMeasurementId = null;
      this._interactionActive = false;
      this._scheduleRender(true);
    });

    this.shadowRoot?.querySelectorAll("[data-delete-measurement]").forEach((button) => {
      button.addEventListener("click", () => {
        this._deletingMeasurementId = button.dataset.deleteMeasurement;
        this._editingMeasurementId = null;
        this._measurementActionStatus = "";
        this._interactionActive = false;
        this._scheduleRender(true);
      });
    });
    this.shadowRoot?.querySelector("#measurement-delete-confirm")?.addEventListener("click", (event) => {
      const id = event.currentTarget?.dataset?.measurementId;
      this._deleteMeasurement(id);
    });
    this.shadowRoot?.querySelector("#measurement-delete-cancel")?.addEventListener("click", () => {
      this._deletingMeasurementId = null;
      this._interactionActive = false;
      this._scheduleRender(true);
    });

    this.shadowRoot?.querySelectorAll("[data-restore-measurement]").forEach((button) => {
      button.addEventListener("click", () => this._restoreMeasurement(button.dataset.restoreMeasurement));
    });

    this.shadowRoot?.querySelectorAll("[data-measurement-filter]").forEach((button) => {
      button.addEventListener("click", () => {
        const status = button.dataset.measurementFilter;
        if (!Object.prototype.hasOwnProperty.call(this._measurementFilters, status)) return;
        this._measurementFilters = {
          ...this._measurementFilters,
          [status]: !this._measurementFilters[status],
        };
        this._interactionActive = false;
        this._scheduleRender(true);
      });
    });

    this.shadowRoot?.querySelectorAll("[data-chain-id]").forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.dataset.chainId;
        if (!id) return;
        const next = new Set(this._expandedMeasurementChains);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        this._expandedMeasurementChains = next;
        this._interactionActive = false;
        this._scheduleRender(true);
      });
    });

    this.shadowRoot?.querySelectorAll("[data-range]").forEach((button) => {
      button.addEventListener("click", () => {
        const value = Number(button.dataset.range);
        this._rangeHours = Number.isFinite(value) ? value : 168;
        this._tooltip = null;
        this._interactionActive = false;
        this._scheduleRender(true);
      });
    });

    this.shadowRoot?.querySelectorAll("[data-puppy-id]:not(.chart-point)").forEach((item) => {
      item.addEventListener("click", () => {
        this._selectedPuppyId = item.dataset.puppyId;
        this._tooltip = null;
        this._editingMeasurementId = null;
        this._deletingMeasurementId = null;
        this._measurementData = null;
        this._measurementKey = "";
        this._highlightedMeasurementId = null;
        this._interactionActive = false;
        this._scheduleRender(true);
        if (this._measurementPanelOpen) this._loadMeasurements(true);
      });
    });

    this.shadowRoot?.querySelectorAll(".chart-point").forEach((point) => {
      const show = async () => {
        const puppyId = point.dataset.puppyId;
        const measurementId = point.dataset.measurementId || null;
        const row = this._puppyRows().find((item) => item.puppyId === puppyId);
        this._selectedPuppyId = puppyId;
        this._highlightedMeasurementId = measurementId;
        this._tooltip = {
          name: point.dataset.name || "Puppy",
          time: Number(point.dataset.time),
          value: point.dataset.value,
          unit: point.dataset.unit || "",
          statusClass: this._statusClass(row?.statusCode || "unknown"),
        };
        this._editingMeasurementId = null;
        this._deletingMeasurementId = null;
        this._measurementData = null;
        this._measurementKey = "";

        if (measurementId && this._history?.can_manage_measurements) {
          this._measurementPanelOpen = true;
          this._measurementFilters = {
            ...this._measurementFilters,
            active: true,
          };
        }

        this._interactionActive = false;
        this._scheduleRender(true);

        if (this._measurementPanelOpen) {
          await this._loadMeasurements(true);
          this._scheduleRender(true);
          this._scrollToHighlightedMeasurement();
        }
      };

      point.addEventListener("click", show);
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

        .header-actions {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }

        .export-button {
          min-height: 38px;
          padding: 6px 10px;
          border: 1px solid var(--divider-color);
          border-radius: 9px;
          background: var(--secondary-background-color);
          color: var(--primary-text-color);
          font: inherit;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        }

        .export-status {
          margin: 8px 0 4px;
          padding: 7px 9px;
          border-radius: 8px;
          background: var(--secondary-background-color);
          color: var(--secondary-text-color);
          font-size: 12px;
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

        .integrity-warning {
          display: flex;
          flex-direction: column;
          gap: 3px;
          margin-bottom: 12px;
          padding: 10px 12px;
          border-radius: 10px;
          background: color-mix(in srgb, var(--warning-color, #ff9800) 14%, transparent);
          border: 1px solid color-mix(in srgb, var(--warning-color, #ff9800) 35%, transparent);
        }
        .integrity-warning span {
          color: var(--secondary-text-color);
          font-size: 12px;
          line-height: 1.4;
        }

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

        .growth-analysis {
          display: grid;
          grid-template-columns: auto 1fr auto;
          gap: 7px;
          align-items: baseline;
          margin-top: 10px;
          padding-top: 8px;
          border-top: 1px solid var(--divider-color);
          font-size: 11px;
        }

        .growth-analysis span,
        .growth-analysis small { color: var(--secondary-text-color); }
        .growth-analysis strong { font-size: 12px; }
        .growth-analysis.ok strong { color: var(--success-color, #4caf50); }
        .growth-analysis.warning strong { color: var(--warning-color, #ff9800); }
        .growth-analysis.danger strong { color: var(--error-color, #db4437); }

        .analysis-panel {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 7px;
          margin-top: 10px;
        }

        .analysis-panel > div {
          min-width: 0;
          padding: 10px;
          border-left: 3px solid var(--divider-color);
          background: var(--secondary-background-color);
        }

        .analysis-panel.ok > div { border-left-color: var(--success-color, #4caf50); }
        .analysis-panel.warning > div { border-left-color: var(--warning-color, #ff9800); }
        .analysis-panel.danger > div { border-left-color: var(--error-color, #db4437); }
        .analysis-panel span { display: block; color: var(--secondary-text-color); font-size: 11px; margin-bottom: 3px; }
        .analysis-panel strong { display: block; font-size: 13px; overflow-wrap: anywhere; }

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

        .detail-actions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 8px;
          flex-wrap: wrap;
        }

        .measurement-panel {
          margin-top: 14px;
          padding: 14px;
          border: 1px solid var(--divider-color);
          border-radius: 12px;
          background: var(--secondary-background-color);
        }

        .measurement-panel-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 10px;
        }

        .measurement-panel-header h3 { margin: 0; }

        .measurement-counts {
          display: flex;
          flex-wrap: wrap;
          justify-content: flex-end;
          gap: 5px;
          color: var(--secondary-text-color);
          font-size: 11px;
        }

        .measurement-counts span {
          padding: 4px 7px;
          border-radius: 999px;
          background: var(--ha-card-background, var(--card-background-color, #fff));
        }

        .current-measurement {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin: 8px 0 12px;
          padding: 12px;
          border-radius: 10px;
          border: 1px solid color-mix(in srgb, var(--success-color, #2e7d32) 30%, var(--divider-color));
          background: color-mix(in srgb, var(--success-color, #2e7d32) 7%, var(--ha-card-background, var(--card-background-color, #fff)));
        }
        .current-measurement > div { min-width: 0; }
        .current-measurement > div:first-child strong {
          display: block;
          font-size: 22px;
          line-height: 1.15;
        }
        .current-measurement > div:last-child {
          text-align: right;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .current-measurement span,
        .current-measurement small { color: var(--secondary-text-color); }

        .measurement-mini-chart {
          margin: 0 0 12px;
          padding: 10px;
          border-radius: 10px;
          background: var(--ha-card-background, var(--card-background-color, #fff));
        }
        .measurement-mini-chart .chart { max-height: 230px; }
        .mini-chart-heading {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 4px;
        }
        .mini-chart-heading > div strong { display: block; font-size: 14px; }
        .mini-chart-heading > span { color: var(--secondary-text-color); font-size: 11px; }

        .measurement-filterbar {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin: 0 0 9px;
        }
        .measurement-filter {
          min-height: 36px;
          padding: 6px 10px;
          border: 1px solid var(--divider-color);
          border-radius: 999px;
          background: var(--ha-card-background, var(--card-background-color, #fff));
          color: var(--secondary-text-color);
        }
        .measurement-filter.active {
          border-color: var(--primary-color);
          color: var(--primary-text-color);
          background: color-mix(in srgb, var(--primary-color) 9%, transparent);
        }
        .measurement-filter b { margin-left: 3px; }

        .measurement-chain {
          border-top: 1px solid var(--divider-color);
          padding-top: 2px;
        }
        .measurement-chain:first-of-type { border-top: 0; }
        .measurement-chain .measurement-row { border-top: 0; }
        .chain-toggle {
          min-height: 34px;
          margin: 0 0 7px;
          padding: 5px 9px;
          border: 1px solid var(--divider-color);
          border-radius: 8px;
          background: transparent;
          color: var(--secondary-text-color);
          font-size: 12px;
        }
        .chain-history {
          margin-left: 12px;
          padding-left: 10px;
          border-left: 2px solid var(--divider-color);
        }
        .chain-history:not(.open):empty { display: none; }
        .chain-hidden-hint {
          display: block;
          margin: -2px 0 8px 2px;
          color: var(--secondary-text-color);
          font-size: 10px;
        }

        .measurement-row {
          padding: 11px 0;
          border-top: 1px solid var(--divider-color);
        }

        .measurement-row:first-of-type { border-top: 0; }
        .measurement-row.deleted { opacity: .72; }
        .measurement-row.superseded { opacity: .68; }
        .measurement-row.nested { padding: 9px 0; }
        .measurement-row.highlighted {
          margin-left: -8px;
          margin-right: -8px;
          padding-left: 8px;
          padding-right: 8px;
          border-radius: 9px;
          background: color-mix(in srgb, var(--primary-color) 10%, transparent);
          outline: 1px solid color-mix(in srgb, var(--primary-color) 35%, transparent);
        }

        .measurement-main {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 10px;
        }

        .measurement-main > div {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .measurement-main > div > strong { font-size: 16px; }
        .measurement-main > div > span {
          color: var(--secondary-text-color);
          font-size: 12px;
        }

        .measurement-status {
          display: inline-flex;
          min-height: 25px;
          align-items: center;
          padding: 3px 8px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 700;
          background: var(--secondary-background-color);
        }
        .measurement-status.active {
          color: var(--success-color, #2e7d32);
          background: color-mix(in srgb, var(--success-color, #2e7d32) 12%, transparent);
        }
        .measurement-status.deleted {
          color: var(--error-color, #db4437);
          background: color-mix(in srgb, var(--error-color, #db4437) 10%, transparent);
        }
        .measurement-status.superseded { color: var(--secondary-text-color); }

        .measurement-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 4px 10px;
          margin-top: 6px;
          color: var(--secondary-text-color);
          font-size: 11px;
        }
        .measurement-meta .lineage { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }

        .measurement-actions,
        .measurement-form-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 7px;
          margin-top: 9px;
        }

        .mini-button {
          min-height: 34px;
          padding: 5px 10px;
          border-radius: 8px;
          border: 1px solid var(--divider-color);
          background: var(--ha-card-background, var(--card-background-color, #fff));
          color: var(--primary-text-color);
          font: inherit;
          cursor: pointer;
        }
        .primary-mini {
          background: var(--primary-color);
          border-color: var(--primary-color);
          color: var(--text-primary-color, #fff);
        }
        .danger-mini {
          background: var(--error-color, #db4437);
          border-color: var(--error-color, #db4437);
          color: #fff;
        }
        .danger-text { color: var(--error-color, #db4437); }

        .measurement-edit-form,
        .measurement-delete-form {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
          margin-top: 10px;
          padding: 11px;
          border-radius: 10px;
          background: var(--ha-card-background, var(--card-background-color, #fff));
        }
        .measurement-delete-form { grid-template-columns: 1fr; }
        .measurement-edit-form label,
        .measurement-delete-form label {
          display: flex;
          flex-direction: column;
          gap: 5px;
          min-width: 0;
        }
        .measurement-edit-form label > span,
        .measurement-delete-form label > span {
          color: var(--secondary-text-color);
          font-size: 11px;
          font-weight: 600;
        }
        .measurement-edit-form input,
        .measurement-delete-form input {
          width: 100%;
          min-width: 0;
          min-height: 42px;
          padding: 8px 10px;
          border: 1px solid var(--divider-color);
          border-radius: 8px;
          background: var(--card-background-color);
          color: var(--primary-text-color);
          font: inherit;
          font-size: 16px;
        }
        .measurement-edit-form .reason-field,
        .measurement-edit-form .measurement-form-actions { grid-column: 1 / -1; }
        .inline-unit { display: flex; align-items: center; gap: 7px; }
        .inline-unit input { flex: 1; }
        .inline-unit b { color: var(--secondary-text-color); }
        .measurement-delete-form > div:first-child {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }
        .measurement-delete-form > div:first-child span {
          color: var(--secondary-text-color);
          font-size: 12px;
        }
        .measurement-action-status {
          margin: 8px 0;
          padding: 8px 10px;
          border-radius: 8px;
          background: var(--ha-card-background, var(--card-background-color, #fff));
          color: var(--secondary-text-color);
          font-size: 12px;
        }
        .loading.compact { padding: 10px 4px; }

        @media (max-width: 650px) {
          .summary-grid { grid-template-columns: repeat(2, 1fr); }
          .summary-grid > div:last-child { grid-column: span 2; }
          .puppy-grid { grid-template-columns: 1fr; }
          .detail-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .analysis-panel { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .measurement-panel-header { flex-direction: column; }
          .measurement-counts { justify-content: flex-start; }
          .measurement-edit-form { grid-template-columns: 1fr; }
          .measurement-edit-form .reason-field,
          .measurement-edit-form .measurement-form-actions { grid-column: auto; }
          .current-measurement { align-items: flex-start; }
          .measurement-mini-chart { padding: 8px; }
          .chain-history { margin-left: 6px; padding-left: 8px; }
        }

        @media (max-width: 430px) {
          .card { padding: 14px; }
          .toolbar { grid-template-columns: 1fr; }
          .puppy-metrics { grid-template-columns: repeat(3, minmax(0, 1fr)); }
          .growth-analysis { grid-template-columns: 1fr; gap: 2px; }
          .status-pill { max-width: 110px; overflow: hidden; text-overflow: ellipsis; }
          .chart-tooltip b { margin-left: 0; }
          .current-measurement { flex-direction: column; gap: 7px; }
          .current-measurement > div:last-child { text-align: left; }
          .measurement-meta { gap: 3px 7px; }
          .measurement-main > div > strong { font-size: 18px; }
          .measurement-filter { flex: 1 1 auto; }
          .measurement-actions .mini-button { min-height: 40px; }
        }
      </style>
      <ha-card>
        <div class="card">${content}</div>
      </ha-card>
    `;
  }
}

if (!customElements.get("puppy-tracker-overview-card")) {
  customElements.define("puppy-tracker-overview-card", PuppyTrackerOverviewCard);
}

window.customCards = window.customCards || [];

if (!window.customCards.some((card) => card.type === "puppy-tracker-overview-card")) {
  window.customCards.push({
    type: "puppy-tracker-overview-card",
    name: "Puppy Tracker Overview",
    description: "Dynamisch overzicht en groeigrafieken voor Puppy Tracker.",
    preview: true,
  });
}

console.info(
  "%c PUPPY-WEIGHT-OVERVIEW-CARD %c v1.3.2 ",
  "color: white; background: #607d8b; font-weight: 700;",
  "color: #607d8b; background: white; font-weight: 700;"
);
