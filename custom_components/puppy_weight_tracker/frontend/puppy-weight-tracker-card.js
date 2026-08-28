// Puppy Weight Tracker Card v1.3.1
class PuppyWeightTrackerCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._hass = null;
    this._registryLoaded = false;
    this._registryLoading = false;
    this._entities = [];
    this._devices = [];
    this._draftWeight = null;
    this._localMessage = "";
    this._localMessageType = "info";
    this._editingWeight = false;
    this._renderPending = false;
    this._interactionActive = false;
    this._interactionReleaseTimer = null;
    this._renderScheduled = false;
    this._optimisticLitterOption = null;
    this._optimisticPuppyOption = null;
    this._lastStateSignature = "";
  }

  static getStubConfig() {
    return {
      title: "Puppy weegstation",
      show_puppies: true,
      show_details: true,
    };
  }

  static getConfigForm() {
    return {
      schema: [
        { name: "title", selector: { text: {} } },
        { name: "show_puppies", selector: { boolean: {} } },
        { name: "show_details", selector: { boolean: {} } },
      ],
    };
  }

  setConfig(config) {
    this._config = {
      title: "Puppy weegstation",
      show_puppies: true,
      show_details: true,
      ...config,
    };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;

    if (!this._registryLoaded && !this._registryLoading) {
      this._loadRegistry();
      return;
    }

    const station = this._station();
    let optimisticChanged = false;
    if (
      this._optimisticLitterOption &&
      this._state(station?.ids?.litter)?.state === this._optimisticLitterOption
    ) {
      this._optimisticLitterOption = null;
      optimisticChanged = true;
    }
    if (
      this._optimisticPuppyOption &&
      this._state(station?.ids?.puppy)?.state === this._optimisticPuppyOption
    ) {
      this._optimisticPuppyOption = null;
      optimisticChanged = true;
    }

    const signature = this._currentStateSignature(station);
    const stateChanged = signature && signature !== this._lastStateSignature;
    if (stateChanged) this._lastStateSignature = signature;

    // Ignore unrelated Home Assistant state traffic. This significantly
    // reduces full shadow-DOM replacements and keeps native iOS controls
    // stable while a user is tapping, selecting or typing.
    if (stateChanged || optimisticChanged || !this.shadowRoot?.querySelector("ha-card")) {
      this._scheduleRender();
    }
  }

  _interactiveControlFocused() {
    const active = this.shadowRoot?.activeElement;
    return Boolean(active && active.matches?.("input, select"));
  }

  _beginInteraction() {
    if (this._interactionReleaseTimer) {
      window.clearTimeout(this._interactionReleaseTimer);
      this._interactionReleaseTimer = null;
    }
    this._interactionActive = true;
  }

  _endInteraction(delay = 280) {
    if (this._interactionReleaseTimer) {
      window.clearTimeout(this._interactionReleaseTimer);
    }

    this._interactionReleaseTimer = window.setTimeout(() => {
      this._interactionReleaseTimer = null;
      this._interactionActive = false;

      if (this._renderPending && !this._editingWeight && !this._interactiveControlFocused()) {
        this._renderPending = false;
        this._scheduleRender(true);
      }
    }, delay);
  }

  _scheduleRender(force = false) {
    if (!this.shadowRoot) return;

    if (
      !force &&
      (this._interactionActive ||
        this._editingWeight ||
        this._interactiveControlFocused())
    ) {
      this._renderPending = true;
      return;
    }

    if (this._renderScheduled) return;

    this._renderScheduled = true;
    window.requestAnimationFrame(() => {
      this._renderScheduled = false;

      if (
        !force &&
        (this._interactionActive ||
          this._editingWeight ||
          this._interactiveControlFocused())
      ) {
        this._renderPending = true;
        return;
      }

      this._renderPending = false;
      this._render();
    });
  }

  getCardSize() {
    return this._config?.show_puppies === false ? 5 : 8;
  }

  getGridOptions() {
    return {
      columns: 12,
      min_columns: 6,
    };
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
      this._localMessage = "";
    } catch (err) {
      console.error("Puppy Weight Tracker card: registry discovery failed", err);
      this._localMessage =
        "De kaart kon de Puppy Weight Tracker-entities niet automatisch vinden.";
      this._localMessageType = "error";
    } finally {
      this._registryLoading = false;
      this._scheduleRender(true);
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

    if (entry?.entity_id) return entry.entity_id;

    // Fallback for existing entity-registry entries whose generated entity_id
    // predates the current unique-id naming. This also makes the card more
    // tolerant of upgrades and user-renamed entity IDs.
    const fallbacks = {
      puppy_weight_tracker_litter_select: ["select", ["nest"]],
      puppy_weight_tracker_puppy_select: ["select", ["puppy"]],
      puppy_weight_tracker_weight_input: ["number", ["gewicht", "invoer"]],
      puppy_weight_tracker_start_session: ["button", ["weegsessie", "start"]],
      puppy_weight_tracker_save_weight: ["button", ["gewicht", "opslaan"]],
      puppy_weight_tracker_reset_session: ["button", ["weegsessie", "reset"]],
      puppy_weight_tracker_session_status: ["sensor", ["sessie"]],
      puppy_weight_tracker_session_progress: ["sensor", ["voortgang"]],
      puppy_weight_tracker_session_remaining: ["sensor", ["nog", "wegen"]],
      puppy_weight_tracker_session_next_puppy: ["sensor", ["volgende", "pup"]],
      puppy_weight_tracker_session_last_puppy: ["sensor", ["laatst", "gewogen"]],
      puppy_weight_tracker_session_message: ["sensor", ["melding"]],
    };

    const fallback = fallbacks[uniqueId];
    if (!fallback) return null;

    const [domain, tokens] = fallback;
    const normalize = (value) =>
      String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();

    const matches = (entityId, registryEntry = null) => {
      const state = this._hass?.states?.[entityId];
      const haystack = normalize(
        [
          entityId,
          registryEntry?.name,
          registryEntry?.original_name,
          state?.attributes?.friendly_name,
        ]
          .filter(Boolean)
          .join(" ")
      );
      return tokens.every((token) => haystack.includes(normalize(token)));
    };

    const deviceCandidate = this._entities.find(
      (entity) =>
        entity.device_id === deviceId &&
        !entity.disabled_by &&
        entity.entity_id?.startsWith(`${domain}.`) &&
        matches(entity.entity_id, entity)
    );

    if (deviceCandidate?.entity_id) return deviceCandidate.entity_id;

    // Last-resort state lookup. Require a weighing-station/puppy context so we
    // do not accidentally bind an unrelated entity with a similar name.
    const stateCandidates = Object.keys(this._hass?.states || {}).filter((entityId) => {
      if (!entityId.startsWith(`${domain}.`)) return false;
      if (!matches(entityId)) return false;
      const friendly = normalize(this._hass.states[entityId]?.attributes?.friendly_name);
      const id = normalize(entityId);
      return (
        friendly.includes("weegstation") ||
        friendly.includes("puppy") ||
        id.includes("puppy_weegstation") ||
        id.includes("puppy_weight_tracker")
      );
    });

    return stateCandidates.length === 1 ? stateCandidates[0] : null;
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

    const ids = {
      litter: this._entityForDevice(
        device.id,
        "puppy_weight_tracker_litter_select"
      ),
      puppy: this._entityForDevice(
        device.id,
        "puppy_weight_tracker_puppy_select"
      ),
      weight: this._entityForDevice(
        device.id,
        "puppy_weight_tracker_weight_input"
      ),
      start: this._entityForDevice(
        device.id,
        "puppy_weight_tracker_start_session"
      ),
      save: this._entityForDevice(
        device.id,
        "puppy_weight_tracker_save_weight"
      ),
      reset: this._entityForDevice(
        device.id,
        "puppy_weight_tracker_reset_session"
      ),
      session: this._entityForDevice(
        device.id,
        "puppy_weight_tracker_session_status"
      ),
      progress: this._entityForDevice(
        device.id,
        "puppy_weight_tracker_session_progress"
      ),
      remaining: this._entityForDevice(
        device.id,
        "puppy_weight_tracker_session_remaining"
      ),
      next: this._entityForDevice(
        device.id,
        "puppy_weight_tracker_session_next_puppy"
      ),
      last: this._entityForDevice(
        device.id,
        "puppy_weight_tracker_session_last_puppy"
      ),
      message: this._entityForDevice(
        device.id,
        "puppy_weight_tracker_session_message"
      ),
    };

    return { device, ids };
  }

  _selectedLitterDevice(station) {
    const litterState = this._state(station?.ids?.litter);
    if (!litterState) return null;

    const selected = String(this._optimisticLitterOption || litterState.state || "");
    const normalizedSelected = selected.replace(/ · \d+$/, "");

    const litterDevices = this._devices.filter((device) =>
      Boolean(this._deviceIdentifier(device, "litter_"))
    );

    return (
      litterDevices.find((device) => this._deviceName(device) === selected) ||
      litterDevices.find(
        (device) => this._deviceName(device) === normalizedSelected
      ) ||
      null
    );
  }

  _puppyRows(station) {
    const litterDevice = this._selectedLitterDevice(station);
    if (!litterDevice) return [];

    const puppySelect = this._state(station?.ids?.puppy);
    const activeOptions = Array.isArray(puppySelect?.attributes?.options)
      ? puppySelect.attributes.options.map(String)
      : [];

    const selectedOption = this._optimisticPuppyOption || puppySelect?.state || "";

    const puppyDevices = this._devices.filter(
      (device) =>
        device.via_device_id === litterDevice.id &&
        Boolean(this._deviceIdentifier(device, "puppy_"))
    );

    return puppyDevices
      .map((device) => {
        const fullIdentifier = this._deviceIdentifier(device, "puppy_");
        const puppyId = fullIdentifier?.slice("puppy_".length);
        if (!puppyId) return null;

        const entityIds = {
          weight: this._entityForDevice(device.id, `${puppyId}_weight`),
          growth24: this._entityForDevice(
            device.id,
            `${puppyId}_growth_24h_percent`
          ),
          status: this._entityForDevice(device.id, `${puppyId}_status`),
          age: this._entityForDevice(device.id, `${puppyId}_age`),
          collar: this._entityForDevice(device.id, `${puppyId}_collar_color`),
          lastWeighed: this._entityForDevice(
            device.id,
            `${puppyId}_last_weighed`
          ),
        };

        const name = this._deviceName(device);
        const collar = this._stateValue(entityIds.collar, "");
        const baseOption =
          collar && collar.toLowerCase() !== name.toLowerCase()
            ? `${name} (${collar})`
            : name;

        const matchingOption = activeOptions.find(
          (option) => option === baseOption || option.startsWith(`${baseOption} · `)
        );

        if (activeOptions.length && !matchingOption) {
          return null;
        }

        const statusState = this._state(entityIds.status);
        const statusCode = statusState?.attributes?.status_code || "unknown";

        return {
          device,
          puppyId,
          name,
          collar,
          option: matchingOption || baseOption,
          selected: (matchingOption || baseOption) === selectedOption,
          entityIds,
          weight: this._stateValue(entityIds.weight),
          growth24: this._stateValue(entityIds.growth24),
          status: this._stateValue(entityIds.status, "Onbekend"),
          statusCode,
          age: this._stateValue(entityIds.age),
          lastWeighed: this._stateValue(entityIds.lastWeighed, ""),
        };
      })
      .filter(Boolean);
  }

  _currentStateSignature(station = this._station()) {
    if (!this._registryLoaded || !this._hass || !station) return "";

    const entityIds = new Set(Object.values(station.ids || {}).filter(Boolean));
    this._puppyRows(station).forEach((row) => {
      Object.values(row.entityIds || {}).forEach((entityId) => {
        if (entityId) entityIds.add(entityId);
      });
    });

    return [...entityIds]
      .sort()
      .map((entityId) => {
        const state = this._state(entityId);
        return `${entityId}:${state?.state || ""}:${state?.last_updated || ""}`;
      })
      .join("|");
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

  _weightDisplay(row) {
    if (row.weight === "—") return "—";
    return `${row.weight} g`;
  }

  _growthDisplay(row) {
    if (row.growth24 === "—") return "—";
    const value = Number(row.growth24);
    if (Number.isNaN(value)) return `${row.growth24}%`;
    return `${value > 0 ? "+" : ""}${value}%`;
  }

  _progress(station) {
    const progressState = this._state(station?.ids?.progress);
    const value = Number(progressState?.attributes?.percentage);
    return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
  }

  async _select(entityId, option) {
    if (!this._hass) return;

    if (!entityId) {
      this._setError(new Error("De bijbehorende select-entity is niet gevonden."));
      return;
    }

    if (!option) return;

    try {
      await this._hass.callService(
        "select",
        "select_option",
        { option },
        { entity_id: entityId }
      );
      this._localMessage = "";
    } catch (err) {
      if (entityId === this._station()?.ids?.litter) this._optimisticLitterOption = null;
      if (entityId === this._station()?.ids?.puppy) this._optimisticPuppyOption = null;
      this._setError(err);
      this._scheduleRender(true);
    }
  }

  async _press(entityId, label = "knop") {
    if (!this._hass) return;

    if (!entityId) {
      this._setError(
        new Error(
          `De entity voor ${label} is niet gevonden. Herlaad de Puppy Weight Tracker-integratie en vernieuw daarna het dashboard.`
        )
      );
      return;
    }

    try {
      await this._hass.callService(
        "button",
        "press",
        {},
        { entity_id: entityId }
      );
      this._localMessage = "";
      this._localMessageType = "info";
    } catch (err) {
      this._setError(err);
    }
  }

  async _saveWeight(station) {
    if (!this._hass || !station?.ids?.save) return;

    const input = this.shadowRoot?.querySelector("#weight-input");
    const value = Number(input?.value ?? this._draftWeight ?? 0);

    if (!Number.isFinite(value) || value <= 0) {
      this._localMessage = "Voer eerst een geldig gewicht in.";
      this._localMessageType = "error";
      this._scheduleRender();
      return;
    }

    try {
      if (station.ids.weight) {
        await this._hass.callService(
          "number",
          "set_value",
          { value },
          { entity_id: station.ids.weight }
        );
      }

      await this._hass.callService(
        "button",
        "press",
        {},
        { entity_id: station.ids.save }
      );

      this._draftWeight = null;
      this._localMessage = "";
    } catch (err) {
      this._setError(err);
    }
  }

  _setError(err) {
    const message =
      err?.message ||
      err?.body?.message ||
      "De actie kon niet worden uitgevoerd.";

    this._localMessage = message;
    this._localMessageType = "error";
    this._scheduleRender();
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
    this._renderPending = false;

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

    const station = this._station();

    if (!station) {
      this.shadowRoot.innerHTML = this._shell(`
        <div class="empty">
          <strong>Puppy weegstation niet gevonden</strong>
          <span>Controleer of de integratie geladen is en herlaad daarna de kaart.</span>
          <button class="secondary" id="rediscover">Opnieuw zoeken</button>
        </div>
      `);
      this._bindRediscover();
      return;
    }

    const litterState = this._state(station.ids.litter);
    const puppyState = this._state(station.ids.puppy);
    const sessionState = this._state(station.ids.session);
    const progressState = this._state(station.ids.progress);
    const remainingState = this._state(station.ids.remaining);
    const nextState = this._state(station.ids.next);
    const lastState = this._state(station.ids.last);
    const messageState = this._state(station.ids.message);
    const weightState = this._state(station.ids.weight);

    const litterOptions = Array.isArray(litterState?.attributes?.options)
      ? litterState.attributes.options
      : [];
    const puppyOptions = Array.isArray(puppyState?.attributes?.options)
      ? puppyState.attributes.options
      : [];

    if (this._draftWeight === null) {
      const stateWeight = Number(weightState?.state);
      this._draftWeight = Number.isFinite(stateWeight) ? stateWeight : 0;
    }

    const rows = this._config.show_puppies === false ? [] : this._puppyRows(station);
    const percentage = this._progress(station);

    const status = sessionState?.state || "Niet gestart";
    const isActive = status === "Bezig";
    const isComplete = status === "Voltooid";

    const sourceMessage = messageState?.state || "";
    const message = this._localMessage || sourceMessage;
    const messageType = this._localMessage
      ? this._localMessageType
      : sourceMessage.includes("bevestigen")
      ? "warning"
      : isComplete
      ? "success"
      : "info";

    const missingControls = [
      !station.ids.start ? "Weegsessie starten" : null,
      !station.ids.save ? "Gewicht opslaan" : null,
      !station.ids.reset ? "Weegsessie resetten" : null,
      !station.ids.weight ? "Gewicht invoeren" : null,
    ].filter(Boolean);

    const backendWarning = missingControls.length
      ? `Niet gevonden in Home Assistant: ${missingControls.join(", ")}. Herlaad de integratie en vernieuw daarna het dashboard.`
      : "";

    const litterSelect = `
      <select id="litter-select" ${isActive ? "disabled" : ""}>
        ${litterOptions
          .map(
            (option) =>
              `<option value="${this._escape(option)}" ${
                option === (this._optimisticLitterOption || litterState?.state) ? "selected" : ""
              }>${this._escape(option)}</option>`
          )
          .join("")}
      </select>
    `;

    const puppySelect = `
      <select id="puppy-select">
        ${puppyOptions
          .map(
            (option) =>
              `<option value="${this._escape(option)}" ${
                option === (this._optimisticPuppyOption || puppyState?.state) ? "selected" : ""
              }>${this._escape(option)}</option>`
          )
          .join("")}
      </select>
    `;

    const puppyRows = rows.length
      ? `
        <div class="puppy-list">
          ${rows
            .map(
              (row) => `
                <button class="puppy-row ${row.selected ? "selected" : ""}" data-puppy-option="${this._escape(
                row.option
              )}">
                  <span class="status-dot ${this._statusClass(row.statusCode)}"></span>
                  <span class="puppy-main">
                    <span class="puppy-name">${this._escape(row.name)}</span>
                    <span class="puppy-meta">${this._escape(row.age)}</span>
                  </span>
                  <span class="metric">
                    <strong>${this._escape(this._weightDisplay(row))}</strong>
                    <span>gewicht</span>
                  </span>
                  <span class="metric growth ${this._statusClass(row.statusCode)}">
                    <strong>${this._escape(this._growthDisplay(row))}</strong>
                    <span>24 uur</span>
                  </span>
                  <span class="row-status ${this._statusClass(row.statusCode)}">${this._escape(
                row.status
              )}</span>
                </button>
              `
            )
            .join("")}
        </div>
      `
      : this._config.show_puppies === false
      ? ""
      : `<div class="empty small">Geen actieve pups gevonden voor dit nest.</div>`;

    const details = this._config.show_details === false
      ? ""
      : `
        <div class="session-grid">
          <div>
            <span class="label">Nog te wegen</span>
            <strong>${this._escape(remainingState?.state || "Geen")}</strong>
          </div>
          <div>
            <span class="label">Volgende pup</span>
            <strong>${this._escape(nextState?.state || "Geen")}</strong>
          </div>
          <div>
            <span class="label">Laatst gewogen</span>
            <strong>${this._escape(lastState?.state || "Geen")}</strong>
          </div>
        </div>
      `;

    this.shadowRoot.innerHTML = this._shell(`
      <div class="header">
        <div>
          <div class="eyebrow">Puppy Weight Tracker</div>
          <h2>${this._escape(this._config.title || "Puppy weegstation")}</h2>
        </div>
        <span class="session-badge ${isActive ? "active" : isComplete ? "complete" : "idle"}">
          ${this._escape(status)}
        </span>
      </div>

      <div class="progress-wrap">
        <div class="progress-top">
          <span>Voortgang</span>
          <strong>${this._escape(progressState?.state || "0 / 0")}</strong>
        </div>
        <div class="progress-track">
          <div class="progress-bar" style="width:${percentage}%"></div>
        </div>
      </div>

      <div class="selectors">
        <label>
          <span>Nest</span>
          ${litterSelect}
        </label>
        <label>
          <span>Puppy</span>
          ${puppySelect}
        </label>
      </div>

      <div class="weight-entry">
        <label class="weight-field">
          <span>Gewicht</span>
          <div class="weight-input-wrap">
            <input id="weight-input" type="number" min="1" max="10000" step="1" inputmode="numeric" value="${this._escape(
              this._draftWeight || ""
            )}" placeholder="bijv. 428">
            <span>g</span>
          </div>
        </label>
        <button class="primary save" id="save-weight" ${!station.ids.save ? "disabled" : ""}>
          ✓ Gewicht opslaan
        </button>
      </div>

      <div class="session-actions">
        <button class="secondary" id="start-session" ${isActive || !station.ids.start ? "disabled" : ""}>▶ Start weegsessie</button>
        <button class="secondary danger-outline" id="reset-session" ${!station.ids.reset ? "disabled" : ""}>↻ Reset sessie</button>
      </div>

      ${details}

      ${
        backendWarning
          ? `<div class="message error">${this._escape(backendWarning)}</div>`
          : ""
      }

      ${
        message
          ? `<div class="message ${messageType}">${this._escape(message)}</div>`
          : ""
      }

      ${puppyRows}
    `);

    this._bindEvents(station);
  }

  _bindRediscover() {
    const button = this.shadowRoot?.querySelector("#rediscover");
    if (!button) return;

    button.addEventListener("click", () => {
      this._registryLoaded = false;
      this._loadRegistry();
    });
  }

  _bindEvents(station) {
    const litterSelect = this.shadowRoot?.querySelector("#litter-select");
    const puppySelect = this.shadowRoot?.querySelector("#puppy-select");
    const weightInput = this.shadowRoot?.querySelector("#weight-input");
    const save = this.shadowRoot?.querySelector("#save-weight");
    const start = this.shadowRoot?.querySelector("#start-session");
    const reset = this.shadowRoot?.querySelector("#reset-session");

    // Guard every interactive control, not just the weight field. Without this,
    // an incoming HA state update can recreate the DOM after pointerdown but
    // before click/change, which makes a tap appear to do nothing on iOS.
    const interactiveControls = this.shadowRoot?.querySelectorAll(
      "input, select, button, [data-puppy-option]"
    );

    interactiveControls?.forEach((control) => {
      control.addEventListener("pointerdown", () => this._beginInteraction());
      control.addEventListener("touchstart", () => this._beginInteraction(), {
        passive: true,
      });
      control.addEventListener("pointerup", () => this._endInteraction());
      control.addEventListener("pointercancel", () => this._endInteraction());
    });

    litterSelect?.addEventListener("focus", () => this._beginInteraction());
    puppySelect?.addEventListener("focus", () => this._beginInteraction());

    litterSelect?.addEventListener("change", (event) => {
      const option = event.target.value;
      this._draftWeight = null;
      this._optimisticLitterOption = option;
      this._optimisticPuppyOption = null;

      // The native iOS select can remain focused after a choice. At this point
      // the change event has completed, so it is safe to commit the visual
      // selection immediately instead of waiting for an extra tap elsewhere.
      event.target.blur();
      this._interactionActive = false;
      this._renderPending = false;
      this._scheduleRender(true);

      this._select(station.ids.litter, option).then(() => {
        this._endInteraction(0);
      });
    });

    puppySelect?.addEventListener("change", (event) => {
      const option = event.target.value;
      this._draftWeight = null;
      this._optimisticPuppyOption = option;

      event.target.blur();
      this._interactionActive = false;
      this._renderPending = false;
      this._scheduleRender(true);

      this._select(station.ids.puppy, option).then(() => {
        this._endInteraction(0);
      });
    });

    litterSelect?.addEventListener("blur", () => this._endInteraction(320));
    puppySelect?.addEventListener("blur", () => this._endInteraction(320));

    weightInput?.addEventListener("focus", () => {
      this._beginInteraction();
      this._editingWeight = true;
    });

    weightInput?.addEventListener("input", (event) => {
      this._editingWeight = true;
      this._draftWeight = event.target.value;
    });

    weightInput?.addEventListener("blur", () => {
      this._editingWeight = false;
      this._endInteraction(320);

      if (this._renderPending) {
        window.setTimeout(() => {
          if (
            !this._editingWeight &&
            !this._interactionActive &&
            !this._interactiveControlFocused()
          ) {
            this._renderPending = false;
            this._scheduleRender(true);
          }
        }, 340);
      }
    });

    weightInput?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        this._editingWeight = false;
        this._beginInteraction();
        this._saveWeight(station).finally(() => this._endInteraction(350));
      }
    });

    save?.addEventListener("click", () => {
      this._editingWeight = false;
      this._beginInteraction();
      this._saveWeight(station).finally(() => this._endInteraction(350));
    });

    start?.addEventListener("click", () => {
      this._beginInteraction();
      this._press(station.ids.start, "Weegsessie starten").finally(() =>
        this._endInteraction(350)
      );
    });

    reset?.addEventListener("click", () => {
      this._beginInteraction();
      this._press(station.ids.reset, "Weegsessie resetten").finally(() =>
        this._endInteraction(350)
      );
    });

    this.shadowRoot?.querySelectorAll("[data-puppy-option]").forEach((row) => {
      row.addEventListener("click", () => {
        const option = row.dataset.puppyOption;
        this._draftWeight = null;
        this._optimisticPuppyOption = option;
        this._interactionActive = false;
        this._renderPending = false;
        this._scheduleRender(true);
        this._select(station.ids.puppy, option).then(() => this._endInteraction(0));
      });
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

        * {
          box-sizing: border-box;
        }

        .card {
          background: var(--ha-card-background, var(--card-background-color, #fff));
          border-radius: var(--ha-card-border-radius, 12px);
          box-shadow: var(--ha-card-box-shadow, var(--card-box-shadow, none));
          border: var(--ha-card-border-width, 0) solid var(--ha-card-border-color, transparent);
          padding: 18px;
          overflow: hidden;
        }

        .header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 16px;
        }

        .eyebrow {
          color: var(--secondary-text-color);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: .08em;
          text-transform: uppercase;
          margin-bottom: 2px;
        }

        h2 {
          font-size: 21px;
          line-height: 1.2;
          margin: 0;
        }

        .session-badge {
          flex: 0 0 auto;
          padding: 6px 10px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 700;
        }

        .session-badge.idle {
          background: var(--secondary-background-color);
          color: var(--secondary-text-color);
        }

        .session-badge.active {
          background: color-mix(in srgb, var(--warning-color, #ff9800) 16%, transparent);
          color: var(--warning-color, #ff9800);
        }

        .session-badge.complete {
          background: color-mix(in srgb, var(--success-color, #4caf50) 16%, transparent);
          color: var(--success-color, #4caf50);
        }

        .progress-wrap {
          margin-bottom: 16px;
        }

        .progress-top {
          display: flex;
          justify-content: space-between;
          font-size: 13px;
          margin-bottom: 6px;
          color: var(--secondary-text-color);
        }

        .progress-top strong {
          color: var(--primary-text-color);
        }

        .progress-track {
          height: 7px;
          border-radius: 999px;
          overflow: hidden;
          background: var(--divider-color);
        }

        .progress-bar {
          height: 100%;
          min-width: 0;
          border-radius: inherit;
          background: var(--primary-color);
          transition: width 220ms ease;
        }

        .selectors {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-bottom: 12px;
        }

        label > span,
        .label {
          display: block;
          color: var(--secondary-text-color);
          font-size: 12px;
          margin: 0 0 5px 2px;
        }

        select,
        input {
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

        select:focus,
        input:focus {
          border-color: var(--primary-color);
          box-shadow: 0 0 0 1px var(--primary-color);
        }

        select:disabled {
          opacity: .6;
        }

        .weight-entry {
          display: grid;
          grid-template-columns: minmax(120px, .8fr) 1.2fr;
          gap: 12px;
          align-items: end;
        }

        .weight-input-wrap {
          position: relative;
        }

        .weight-input-wrap input {
          padding-right: 36px;
          font-size: 20px;
          font-weight: 700;
        }

        .weight-input-wrap > span {
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--secondary-text-color);
          font-weight: 600;
        }

        button {
          min-height: 44px;
          border: 0;
          border-radius: 10px;
          padding: 10px 14px;
          font: inherit;
          font-weight: 700;
          cursor: pointer;
          transition: transform 100ms ease, opacity 100ms ease, background 100ms ease;
        }

        button:active:not(:disabled) {
          transform: scale(.985);
        }

        button:disabled {
          opacity: .45;
          cursor: default;
        }

        .primary {
          background: var(--primary-color);
          color: var(--text-primary-color, #fff);
        }

        .save {
          min-height: 48px;
          font-size: 15px;
        }

        .secondary {
          background: var(--secondary-background-color);
          color: var(--primary-text-color);
          border: 1px solid var(--divider-color);
        }

        .danger-outline {
          color: var(--error-color, #db4437);
        }

        .session-actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin-top: 12px;
        }

        .session-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
          margin-top: 14px;
        }

        .session-grid > div {
          min-width: 0;
          background: var(--secondary-background-color);
          border-radius: 10px;
          padding: 10px;
        }

        .session-grid strong {
          display: block;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 13px;
        }

        .message {
          margin-top: 14px;
          padding: 10px 12px;
          border-radius: 10px;
          font-size: 13px;
          line-height: 1.4;
        }

        .message.info {
          background: color-mix(in srgb, var(--primary-color) 10%, transparent);
        }

        .message.warning {
          background: color-mix(in srgb, var(--warning-color, #ff9800) 14%, transparent);
          color: var(--primary-text-color);
        }

        .message.error {
          background: color-mix(in srgb, var(--error-color, #db4437) 14%, transparent);
          color: var(--primary-text-color);
        }

        .message.success {
          background: color-mix(in srgb, var(--success-color, #4caf50) 14%, transparent);
          color: var(--primary-text-color);
        }

        .puppy-list {
          display: flex;
          flex-direction: column;
          gap: 7px;
          margin-top: 16px;
          border-top: 1px solid var(--divider-color);
          padding-top: 14px;
        }

        .puppy-row {
          display: grid;
          grid-template-columns: 10px minmax(90px, 1fr) minmax(65px, .55fr) minmax(62px, .55fr) minmax(88px, .7fr);
          gap: 9px;
          align-items: center;
          width: 100%;
          min-height: 54px;
          padding: 8px 10px;
          text-align: left;
          background: transparent;
          color: var(--primary-text-color);
          border: 1px solid transparent;
        }

        .puppy-row:hover {
          background: var(--secondary-background-color);
        }

        .puppy-row.selected {
          border-color: color-mix(in srgb, var(--primary-color) 45%, transparent);
          background: color-mix(in srgb, var(--primary-color) 8%, transparent);
        }

        .status-dot {
          width: 9px;
          height: 9px;
          border-radius: 50%;
          background: var(--secondary-text-color);
        }

        .status-dot.ok {
          background: var(--success-color, #4caf50);
        }

        .status-dot.info {
          background: var(--primary-color);
        }

        .status-dot.warning {
          background: var(--warning-color, #ff9800);
        }

        .status-dot.danger {
          background: var(--error-color, #db4437);
        }

        .puppy-main,
        .metric {
          min-width: 0;
        }

        .puppy-name {
          display: block;
          font-size: 14px;
          font-weight: 700;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .puppy-meta,
        .metric span {
          display: block;
          color: var(--secondary-text-color);
          font-size: 11px;
          margin-top: 2px;
        }

        .metric {
          text-align: right;
        }

        .metric strong {
          font-size: 13px;
        }

        .growth.ok strong {
          color: var(--success-color, #4caf50);
        }

        .growth.warning strong {
          color: var(--warning-color, #ff9800);
        }

        .growth.danger strong {
          color: var(--error-color, #db4437);
        }

        .row-status {
          justify-self: end;
          max-width: 100%;
          padding: 4px 7px;
          border-radius: 999px;
          font-size: 10px;
          font-weight: 700;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          background: var(--secondary-background-color);
        }

        .row-status.ok {
          color: var(--success-color, #4caf50);
        }

        .row-status.warning {
          color: var(--warning-color, #ff9800);
        }

        .row-status.danger {
          color: var(--error-color, #db4437);
        }

        .row-status.info {
          color: var(--primary-color);
        }

        .loading,
        .empty {
          min-height: 120px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
          text-align: center;
          color: var(--secondary-text-color);
        }

        .empty strong {
          color: var(--primary-text-color);
        }

        .empty.small {
          min-height: auto;
          margin-top: 14px;
          padding: 12px;
          background: var(--secondary-background-color);
          border-radius: 10px;
          font-size: 13px;
        }

        @media (max-width: 600px) {
          .card {
            padding: 14px;
          }

          .selectors,
          .weight-entry {
            grid-template-columns: 1fr;
          }

          .session-grid {
            grid-template-columns: 1fr 1fr;
          }

          .session-grid > div:first-child {
            grid-column: 1 / -1;
          }

          .puppy-row {
            grid-template-columns: 9px minmax(85px, 1fr) 64px 62px;
          }

          .row-status {
            display: none;
          }
        }

        @media (max-width: 400px) {
          .session-actions {
            grid-template-columns: 1fr;
          }

          .puppy-row {
            grid-template-columns: 9px 1fr 64px;
          }

          .growth {
            display: none;
          }
        }
      </style>
      <div class="card">${content}</div>
    `;
  }
}

if (!customElements.get("puppy-weight-tracker-card")) {
  customElements.define("puppy-weight-tracker-card", PuppyWeightTrackerCard);
}

window.customCards = window.customCards || [];

if (!window.customCards.some((card) => card.type === "puppy-weight-tracker-card")) {
  window.customCards.push({
    type: "puppy-weight-tracker-card",
    name: "Puppy Weight Tracker",
    description: "Weegsessies en groeimonitoring voor puppy's.",
    preview: true,
  });
}
