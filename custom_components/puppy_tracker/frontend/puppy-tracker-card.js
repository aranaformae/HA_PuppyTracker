// Puppy Tracker Card v1.3.1
import { collarColor } from "./puppy-tracker-collar-chart-colors.js";
import { announceLitterChange, languageForHass } from "./puppy-tracker-card-common.js";

const WEIGHING_TEXT = {
  nl: {
    actionFailed: "De actie kon niet worden uitgevoerd.",
    completed: "Voltooid",
    differencePrevious: "Verschil met vorige meting",
    elapsedSinceLast: "Tijd sinds laatste meting",
    enterValidWeight: "Voer eerst een geldig gewicht in.",
    firstMeasurement: "{puppy}: {weight} opgeslagen · eerste meting.",
    hours24: "24 uur",
    hoursAgo: "{count} uur geleden",
    inProgress: "Bezig",
    lastWeighed: "Laatst gewogen",
    latestSelected: "Laatste weging geselecteerde pup",
    litter: "Nest",
    loadingHomeAssistant: "Home Assistant laden…",
    metricWeight: "gewicht",
    minutesAgo: "{count} min geleden",
    missingControls: "Niet gevonden in Home Assistant: {controls}. Herlaad de integratie en vernieuw daarna het dashboard.",
    missingEntity: "De entity voor {label} is niet gevonden. Herlaad de Puppy Tracker-integratie en vernieuw daarna het dashboard.",
    missingSelect: "De bijbehorende select-entity is niet gevonden.",
    nextPuppy: "Volgende pup",
    noActivePuppies: "Geen actieve pups gevonden voor dit nest.",
    noMeasurement: "Geen meting",
    none: "Geen",
    notStarted: "Niet gestart",
    nowSelected: "Nu geselecteerd",
    previousSelected: "Vorige meting geselecteerde pup",
    progress: "Voortgang",
    puppy: "Puppy",
    rediscover: "Opnieuw zoeken",
    registryFailed: "De kaart kon de Puppy Tracker-entities niet automatisch vinden.",
    remaining: "Nog te wegen",
    resetSession: "Reset sessie",
    resetSessionAction: "Weegsessie resetten",
    saveWeight: "Gewicht opslaan",
    savedCompared: "{puppy}: {weight} opgeslagen · {gain} ({percent}) t.o.v. vorige meting van {previous}.",
    searchHint: "Controleer of de integratie geladen is en herlaad daarna de kaart.",
    searching: "Puppy Tracker zoeken…",
    startSession: "Start weegsessie",
    startSessionAction: "Weegsessie starten",
    stationNotFound: "Puppy weegstation niet gevonden",
    statusFirst24h: "Eerste 24 uur",
    statusLowGrowth: "Lage groei",
    statusNoMeasurement: "Geen meting",
    statusOk: "Goed",
    statusUnknown: "Onbekend",
    statusWeighDue: "Weging nodig",
    statusWeightLoss: "Gewichtsverlies",
    title: "Puppy weegstation",
    weight: "Gewicht",
    weightInput: "Gewicht invoeren",
    weightPlaceholder: "bijv. 428",
    weighNow: "Nu te wegen",
    dayAgo: "1 dag geleden",
    daysAgo: "{count} dagen geleden",
  },
  en: {
    actionFailed: "The action could not be completed.",
    completed: "Completed",
    differencePrevious: "Difference from previous measurement",
    elapsedSinceLast: "Time since last measurement",
    enterValidWeight: "Enter a valid weight first.",
    firstMeasurement: "{puppy}: {weight} saved · first measurement.",
    hours24: "24 hours",
    hoursAgo: "{count} hours ago",
    inProgress: "In progress",
    lastWeighed: "Last weighed",
    latestSelected: "Latest weighing for selected puppy",
    litter: "Litter",
    loadingHomeAssistant: "Loading Home Assistant…",
    metricWeight: "weight",
    minutesAgo: "{count} min ago",
    missingControls: "Not found in Home Assistant: {controls}. Reload the integration and then refresh the dashboard.",
    missingEntity: "The entity for {label} was not found. Reload the Puppy Tracker integration and then refresh the dashboard.",
    missingSelect: "The associated select entity was not found.",
    nextPuppy: "Next puppy",
    noActivePuppies: "No active puppies found for this litter.",
    noMeasurement: "No measurement",
    none: "None",
    notStarted: "Not started",
    nowSelected: "Selected now",
    previousSelected: "Previous measurement for selected puppy",
    progress: "Progress",
    puppy: "Puppy",
    rediscover: "Search again",
    registryFailed: "The card could not automatically find the Puppy Tracker entities.",
    remaining: "Still to weigh",
    resetSession: "Reset session",
    resetSessionAction: "reset weighing session",
    saveWeight: "Save weight",
    savedCompared: "{puppy}: {weight} saved · {gain} ({percent}) vs previous measurement of {previous}.",
    searchHint: "Check that the integration is loaded, then reload the card.",
    searching: "Searching for Puppy Tracker…",
    startSession: "Start weighing session",
    startSessionAction: "start weighing session",
    stationNotFound: "Puppy weighing station not found",
    statusFirst24h: "First 24 hours",
    statusLowGrowth: "Low growth",
    statusNoMeasurement: "No measurement",
    statusOk: "Good",
    statusUnknown: "Unknown",
    statusWeighDue: "Weighing due",
    statusWeightLoss: "Weight loss",
    title: "Puppy weighing station",
    weight: "Weight",
    weightInput: "weight input",
    weightPlaceholder: "e.g. 428",
    weighNow: "Weigh now",
    dayAgo: "1 day ago",
    daysAgo: "{count} days ago",
  },
};

function weighingText(hass, key, replacements = {}) {
  const language = languageForHass(hass);
  const template = WEIGHING_TEXT[language]?.[key] ?? WEIGHING_TEXT.nl[key] ?? key;
  return Object.entries(replacements).reduce(
    (result, [name, value]) => result.replaceAll(`{${name}}`, String(value ?? "")),
    template,
  );
}

function configHass() {
  return document.querySelector("home-assistant")?.hass || null;
}

const WEIGHING_ERRORS_EN = new Map([
  ["Er is al een actieve weegsessie. Rond deze af of reset hem eerst.", "A weighing session is already active. Complete or reset it first."],
  ["Er zijn geen actieve nesten.", "There are no active litters."],
  ["Selecteer eerst een nest.", "Select a litter first."],
  ["Selecteer eerst een puppy.", "Select a puppy first."],
  ["Voer eerst een gewicht groter dan 0 gram in.", "Enter a weight greater than 0 grams first."],
  ["De geselecteerde puppy bestaat niet meer.", "The selected puppy no longer exists."],
  ["De geselecteerde puppy is gearchiveerd.", "The selected puppy is archived."],
  ["Mogelijke dubbele meting. Druk binnen 30 seconden nogmaals op Gewicht opslaan om te bevestigen.", "Possible duplicate measurement. Press Save weight again within 30 seconds to confirm."],
  ["Tijdens een actieve weegsessie kan het nest niet worden gewijzigd.", "The litter cannot be changed during an active weighing session."],
]);

function localizeWeighingError(hass, value) {
  const original = String(value || "");
  return languageForHass(hass) === "en"
    ? (WEIGHING_ERRORS_EN.get(original) || original)
    : original;
}

class PuppyTrackerCard extends HTMLElement {
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
    this._scrolling = false;
    this._scrollReleaseTimer = null;
    this._optimisticLitterOption = null;
    this._optimisticPuppyOption = null;
    this._lastStateSignature = "";
    this._viewStructureKey = "";
    this._announcedLitterId = "";
  }

  static getStubConfig() {
    return {
      title: weighingText(configHass(), "title"),
      show_litter_selector: true,
      show_puppies: true,
      show_details: true,
    };
  }

  static getConfigForm() {
    return {
      schema: [
        { name: "title", selector: { text: {} } },
        { name: "show_litter_selector", selector: { boolean: {} } },
        { name: "show_puppies", selector: { boolean: {} } },
        { name: "show_details", selector: { boolean: {} } },
      ],
    };
  }

  setConfig(config) {
    this._config = {
      title: null,
      show_litter_selector: true,
      show_puppies: true,
      show_details: true,
      ...config,
    };
    this._viewStructureKey = "";
    this._render();
  }

  connectedCallback() {
    if (this._handleDocumentScroll) return;
    this._handleDocumentScroll = () => {
      this._scrolling = true;
      if (this._scrollReleaseTimer) window.clearTimeout(this._scrollReleaseTimer);
      this._scrollReleaseTimer = window.setTimeout(() => {
        this._scrollReleaseTimer = null;
        this._scrolling = false;
        if (this._renderPending && !this._interactionActive && !this._editingWeight) {
          this._renderPending = false;
          this._scheduleRender();
        }
      }, 300);
    };
    document.addEventListener("scroll", this._handleDocumentScroll, {
      capture: true,
      passive: true,
    });
  }

  disconnectedCallback() {
    if (this._handleDocumentScroll) {
      document.removeEventListener("scroll", this._handleDocumentScroll, true);
      this._handleDocumentScroll = null;
    }
    if (this._scrollReleaseTimer) window.clearTimeout(this._scrollReleaseTimer);
    this._scrollReleaseTimer = null;
  }

  set hass(hass) {
    this._hass = hass;

    if (!this._registryLoaded && !this._registryLoading) {
      this._loadRegistry();
      return;
    }

    const station = this._station();
    this._announceSelectedLitter(station);
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
      (this._scrolling ||
        this._interactionActive ||
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
        (this._scrolling ||
          this._interactionActive ||
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

  _t(key, replacements = {}) {
    return weighingText(this._hass, key, replacements);
  }

  _sessionPresentation(value) {
    const normalized = String(value || "").trim().toLowerCase();
    if (["bezig", "in progress", "active"].includes(normalized)) {
      return { code: "active", label: this._t("inProgress") };
    }
    if (["voltooid", "completed", "complete"].includes(normalized)) {
      return { code: "complete", label: this._t("completed") };
    }
    return { code: "idle", label: this._t("notStarted") };
  }

  _statusLabel(row) {
    const key = {
      first_24h: "statusFirst24h",
      first_day_excess_weight_loss: "statusWeightLoss",
      low_growth: "statusLowGrowth",
      no_measurement: "statusNoMeasurement",
      ok: "statusOk",
      weigh_due: "statusWeighDue",
      weight_loss: "statusWeightLoss",
    }[row?.statusCode];
    return key ? this._t(key) : (row?.status || this._t("statusUnknown"));
  }

  _noneDisplay(value) {
    const normalized = String(value || "").trim().toLowerCase();
    return !normalized || ["geen", "none"].includes(normalized)
      ? this._t("none")
      : value;
  }

  _ageDisplay(value) {
    const original = String(value || "");
    if (languageForHass(this._hass) !== "en") return original;
    return original
      .replace(/\b(\d+)\s+u\b/g, "$1 h")
      .replace(/\b(\d+)\s+dagen\b/g, "$1 days")
      .replace(/\b(\d+)\s+weken\b/g, "$1 weeks")
      .replace(/\b(\d+)\s+maanden\b/g, "$1 months");
  }

  _sessionMessage(value) {
    const original = String(value || "");
    if (languageForHass(this._hass) !== "en") return original;
    if (original === "Nog geen weegsessie gestart") return "No weighing session started yet";
    if (original === "Weegsessie gestart") return "Weighing session started";
    if (original === "Geen melding") return "No message";
    let match = original.match(/^(.+): ([\d.,]+) g opgeslagen$/);
    if (match) return `${match[1]}: ${match[2]} g saved`;
    match = original.match(/^Weegsessie voltooid: (\d+) van (\d+) pups gewogen$/);
    if (match) return `Weighing session completed: ${match[1]} of ${match[2]} puppies weighed`;
    match = original.match(/^(.+) is minder dan 2 minuten geleden gewogen\. Druk nogmaals op Gewicht opslaan om ([\d.,]+) g te bevestigen\.$/);
    if (match) return `${match[1]} was weighed less than 2 minutes ago. Press Save weight again to confirm ${match[2]} g.`;
    return original;
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
      this._announceSelectedLitter(this._station());
    } catch (err) {
      console.error("Puppy Tracker card: registry discovery failed", err);
      this._localMessage = this._t("registryFailed");
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

    if (entry?.entity_id) return entry.entity_id;

    // Fallback for existing entity-registry entries whose generated entity_id
    // predates the current unique-id naming. This also makes the card more
    // tolerant of upgrades and user-renamed entity IDs.
    const fallbacks = {
      puppy_tracker_litter_select: ["select", ["nest"]],
      puppy_tracker_puppy_select: ["select", ["puppy"]],
      puppy_tracker_weight_input: ["number", ["gewicht", "invoer"]],
      puppy_tracker_start_session: ["button", ["weegsessie", "start"]],
      puppy_tracker_save_weight: ["button", ["gewicht", "opslaan"]],
      puppy_tracker_reset_session: ["button", ["weegsessie", "reset"]],
      puppy_tracker_session_status: ["sensor", ["sessie"]],
      puppy_tracker_session_progress: ["sensor", ["voortgang"]],
      puppy_tracker_session_remaining: ["sensor", ["nog", "wegen"]],
      puppy_tracker_session_next_puppy: ["sensor", ["volgende", "pup"]],
      puppy_tracker_session_last_puppy: ["sensor", ["laatst", "gewogen"]],
      puppy_tracker_session_message: ["sensor", ["melding"]],
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
        id.includes("puppy_tracker")
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
        "puppy_tracker_litter_select"
      ),
      puppy: this._entityForDevice(
        device.id,
        "puppy_tracker_puppy_select"
      ),
      weight: this._entityForDevice(
        device.id,
        "puppy_tracker_weight_input"
      ),
      start: this._entityForDevice(
        device.id,
        "puppy_tracker_start_session"
      ),
      save: this._entityForDevice(
        device.id,
        "puppy_tracker_save_weight"
      ),
      reset: this._entityForDevice(
        device.id,
        "puppy_tracker_reset_session"
      ),
      session: this._entityForDevice(
        device.id,
        "puppy_tracker_session_status"
      ),
      progress: this._entityForDevice(
        device.id,
        "puppy_tracker_session_progress"
      ),
      remaining: this._entityForDevice(
        device.id,
        "puppy_tracker_session_remaining"
      ),
      next: this._entityForDevice(
        device.id,
        "puppy_tracker_session_next_puppy"
      ),
      last: this._entityForDevice(
        device.id,
        "puppy_tracker_session_last_puppy"
      ),
      message: this._entityForDevice(
        device.id,
        "puppy_tracker_session_message"
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

  _announceSelectedLitter(station) {
    const device = this._selectedLitterDevice(station);
    const identifier = this._deviceIdentifier(device, "litter_");
    const litterId = identifier?.slice("litter_".length) || "";
    if (!litterId || litterId === this._announcedLitterId) return;
    this._announcedLitterId = litterId;
    announceLitterChange(this, litterId);
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
          previousWeight: this._entityForDevice(
            device.id,
            `${puppyId}_previous_weight`
          ),
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
          previousWeight: this._stateValue(entityIds.previousWeight, "—"),
          growth24: this._stateValue(entityIds.growth24),
          status: this._stateValue(entityIds.status, this._t("statusUnknown")),
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
        const attributes = state?.attributes || {};
        const visibleAttributes = {
          options: Array.isArray(attributes.options) ? attributes.options : undefined,
          percentage: attributes.percentage,
          status_code: attributes.status_code,
        };
        return `${entityId}:${state?.state || ""}:${JSON.stringify(visibleAttributes)}`;
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

  _changeDisplay(row) {
    const current = Number(row.weight);
    const previous = Number(row.previousWeight);
    if (!Number.isFinite(current) || !Number.isFinite(previous)) return "—";
    const change = current - previous;
    return `${change > 0 ? "+" : ""}${change} g`;
  }

  _elapsedDisplay(value) {
    if (!value) return this._t("noMeasurement");
    const timestamp = new Date(value).getTime();
    if (!Number.isFinite(timestamp)) return value;
    const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60000));
    if (minutes < 60) return this._t("minutesAgo", { count: minutes });
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return this._t("hoursAgo", { count: hours });
    const days = Math.floor(hours / 24);
    return days === 1 ? this._t("dayAgo") : this._t("daysAgo", { count: days });
  }

  _focusWeightInput() {
    window.requestAnimationFrame(() => {
      window.queueMicrotask(() => {
        const input = this.shadowRoot?.querySelector("#weight-input");
        if (input && !input.disabled) input.focus({ preventScroll: true });
      });
    });
  }

  _progress(station) {
    const progressState = this._state(station?.ids?.progress);
    const value = Number(progressState?.attributes?.percentage);
    return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
  }

  _rowForLabel(rows, label) {
    const text = String(label || "").trim();
    if (!text) return null;
    return rows.find((row) =>
      row.name === text ||
      row.option === text ||
      row.option.startsWith(`${text} (`)
    ) || null;
  }

  _nextDistinctRow(rows, remainingState, selectedRow, backendNextRow) {
    if (backendNextRow && backendNextRow !== selectedRow) return backendNextRow;

    const remainingLabels = String(remainingState?.state || "")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    const remainingRows = remainingLabels
      .map((label) => this._rowForLabel(rows, label))
      .filter(Boolean);
    const selectedIndex = selectedRow ? remainingRows.indexOf(selectedRow) : -1;

    if (selectedIndex >= 0) {
      return remainingRows.slice(selectedIndex + 1).find((row) => row !== selectedRow) || null;
    }

    return remainingRows.find((row) => row !== selectedRow) || null;
  }

  async _select(entityId, option) {
    if (!this._hass) return false;

    if (!entityId) {
      this._setError(new Error(this._t("missingSelect")));
      return false;
    }

    if (!option) return false;

    try {
      await this._hass.callService(
        "select",
        "select_option",
        { option },
        { entity_id: entityId }
      );
      this._localMessage = "";
      return true;
    } catch (err) {
      if (entityId === this._station()?.ids?.litter) this._optimisticLitterOption = null;
      if (entityId === this._station()?.ids?.puppy) this._optimisticPuppyOption = null;
      this._setError(err);
      this._scheduleRender(true);
      return false;
    }
  }

  async _press(entityId, label = "button") {
    if (!this._hass) return;

    if (!entityId) {
      this._setError(
        new Error(
          this._t("missingEntity", { label })
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
    const puppy = this._puppyRows(station).find((row) => row.selected) || null;
    const previousWeight = Number(puppy?.weight);

    if (!Number.isFinite(value) || value <= 0) {
      this._localMessage = this._t("enterValidWeight");
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
      const locale =
        this._hass?.locale?.language ||
        this._hass?.language ||
        navigator.language ||
        "nl-NL";
      const formatNumber = (number, maximumFractionDigits = 1) =>
        new Intl.NumberFormat(locale, {
          maximumFractionDigits,
          minimumFractionDigits: 0,
        }).format(number);
      const formatSigned = (number, maximumFractionDigits = 1) => {
        if (number === 0) return formatNumber(0, maximumFractionDigits);
        return `${number > 0 ? "+" : "−"}${formatNumber(
          Math.abs(number),
          maximumFractionDigits
        )}`;
      };
      const puppyName = puppy?.name || "Puppy";
      const weightText = `${formatNumber(value, 0)} g`;
      if (!Number.isFinite(previousWeight) || previousWeight <= 0) {
        this._localMessage = this._t("firstMeasurement", { puppy: puppyName, weight: weightText });
      } else {
        const gainGrams = value - previousWeight;
        const growthPercent = (gainGrams / previousWeight) * 100;
        const gainText = `${formatSigned(gainGrams, 0)} g`;
        const percentText = `${formatSigned(growthPercent, 1)}%`;
        const previousText = `${formatNumber(previousWeight, 0)} g`;
        this._localMessage = this._t("savedCompared", {
          puppy: puppyName,
          weight: weightText,
          gain: gainText,
          percent: percentText,
          previous: previousText,
        });
      }
      this._localMessageType = "success";
      this._scheduleRender(true);
    } catch (err) {
      this._setError(err);
    }
  }

  _setError(err) {
    const message =
      err?.message ||
      err?.body?.message ||
      this._t("actionFailed");

    this._localMessage = localizeWeighingError(this._hass, message);
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

  _structureKey(station) {
    return JSON.stringify({
      ids: station?.ids || {},
      showLitterSelector: this._config.show_litter_selector !== false,
      showPuppies: this._config.show_puppies !== false,
      showDetails: this._config.show_details !== false,
      language: languageForHass(this._hass),
    });
  }

  _setText(id, value) {
    const element = this.shadowRoot?.querySelector(`#${id}`);
    if (element) element.textContent = String(value ?? "");
  }

  _setHidden(id, hidden) {
    const element = this.shadowRoot?.querySelector(`#${id}`);
    if (element) element.hidden = Boolean(hidden);
  }

  _setOptions(select, options, selected) {
    if (!select) return;
    const values = [...select.options].map((option) => option.value);
    const nextValues = options.map(String);
    if (values.length !== nextValues.length || values.some((value, index) => value !== nextValues[index])) {
      select.replaceChildren(...nextValues.map((value) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        return option;
      }));
    }
    if (this.shadowRoot?.activeElement !== select && selected && nextValues.includes(String(selected))) {
      select.value = String(selected);
    }
  }

  _updatePuppyRows(rows, station) {
    const list = this.shadowRoot?.querySelector("#puppy-list");
    const empty = this.shadowRoot?.querySelector("#puppy-empty");
    if (!list) return;

    const existing = new Map(
      [...list.querySelectorAll("button[data-puppy-id]")].map((row) => [row.dataset.puppyId, row])
    );
    const seen = new Set();

    rows.forEach((row) => {
      let element = existing.get(row.puppyId);
      if (!element) {
        element = document.createElement("button");
        element.type = "button";
        element.innerHTML = `
          <span class="status-dot"></span>
          <span class="puppy-main"><span class="puppy-name"></span><span class="puppy-meta"></span></span>
          <span class="metric"><strong></strong><span>${this._escape(this._t("metricWeight"))}</span></span>
          <span class="metric growth"><strong></strong><span>${this._escape(this._t("hours24"))}</span></span>
          <span class="row-status"></span>
        `;
        element.addEventListener("pointerdown", () => this._beginInteraction());
        element.addEventListener("touchstart", () => this._beginInteraction(), { passive: true });
        element.addEventListener("pointerup", () => this._endInteraction());
        element.addEventListener("pointercancel", () => this._endInteraction());
        element.addEventListener("click", () => {
          const option = element.dataset.puppyOption;
          this._draftWeight = null;
          this._optimisticPuppyOption = option;
          this._interactionActive = false;
          this._renderPending = false;
          this._updateView(station);
          this._select(station.ids.puppy, option).then(() => {
            this._endInteraction(0);
            this._focusWeightInput();
          });
        });
      }
      seen.add(row.puppyId);
      element.dataset.puppyId = row.puppyId;
      element.dataset.puppyOption = row.option;
      element.className = `puppy-row${row.selected ? " selected" : ""}`;
      const stateClass = this._statusClass(row.statusCode);
      element.querySelector(".status-dot").className = `status-dot ${stateClass}`;
      element.querySelector(".puppy-name").textContent = row.name;
      element.querySelector(".puppy-meta").textContent = this._ageDisplay(row.age);
      element.querySelector(".metric strong").textContent = this._weightDisplay(row);
      const growth = element.querySelector(".growth");
      growth.className = `metric growth ${stateClass}`;
      growth.querySelector("strong").textContent = this._growthDisplay(row);
      const rowStatus = element.querySelector(".row-status");
      rowStatus.className = `row-status ${stateClass}`;
      rowStatus.textContent = this._statusLabel(row);
      list.append(element);
    });

    [...existing.values()].forEach((element) => {
      if (!seen.has(element.dataset.puppyId)) element.remove();
    });
    const showList = this._config.show_puppies !== false;
    list.hidden = !showList;
    if (empty) {
      empty.hidden = !showList || rows.length > 0;
      empty.textContent = this._t("noActivePuppies");
    }
  }

  _updateView(station) {
    const litterState = this._state(station.ids.litter);
    const puppyState = this._state(station.ids.puppy);
    const sessionState = this._state(station.ids.session);
    const progressState = this._state(station.ids.progress);
    const remainingState = this._state(station.ids.remaining);
    const nextState = this._state(station.ids.next);
    const lastState = this._state(station.ids.last);
    const messageState = this._state(station.ids.message);
    const weightState = this._state(station.ids.weight);
    const litterOptions = Array.isArray(litterState?.attributes?.options) ? litterState.attributes.options : [];
    const puppyOptions = Array.isArray(puppyState?.attributes?.options) ? puppyState.attributes.options : [];

    if (this._draftWeight === null) {
      const stateWeight = Number(weightState?.state);
      this._draftWeight = Number.isFinite(stateWeight) ? stateWeight : 0;
    }

    const rows = this._puppyRows(station);
    const selectedRow = rows.find((row) => row.selected) || null;
    const selectedRowIndex = selectedRow ? rows.indexOf(selectedRow) : -1;
    const backendNextRow = this._rowForLabel(rows, String(nextState?.state || "").trim());
    const nextDistinctRow = this._nextDistinctRow(rows, remainingState, selectedRow, backendNextRow);
    const bottomIndicatorRow = nextDistinctRow || selectedRow || backendNextRow;
    const bottomIndicatorMode = nextDistinctRow ? "next" : "current";
    const bottomIndicatorLabel = this._t(bottomIndicatorMode === "next" ? "nextPuppy" : "weighNow");
    const bottomIndicatorAriaLabel = `${bottomIndicatorLabel}: ${bottomIndicatorRow?.name || ""}`;
    const bottomIndicatorIndex = bottomIndicatorRow ? rows.indexOf(bottomIndicatorRow) : -1;
    const session = this._sessionPresentation(sessionState?.state);
    const isActive = session.code === "active";
    const isComplete = session.code === "complete";
    const percentage = this._progress(station);
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
      !station.ids.start ? this._t("startSessionAction") : null,
      !station.ids.save ? this._t("saveWeight") : null,
      !station.ids.reset ? this._t("resetSessionAction") : null,
      !station.ids.weight ? this._t("weightInput") : null,
    ].filter(Boolean);
    const backendWarning = missingControls.length
      ? this._t("missingControls", { controls: missingControls.join(", ") })
      : "";

    this._setText("card-title", this._config.title ?? this._t("title"));
    this._setText("progress-count", progressState?.state || "0 / 0");
    const progressBar = this.shadowRoot?.querySelector("#progress-bar");
    if (progressBar) progressBar.style.width = `${percentage}%`;
    const litterSelect = this.shadowRoot?.querySelector("#litter-select");
    const puppySelect = this.shadowRoot?.querySelector("#puppy-select");
    this._setOptions(litterSelect, litterOptions, this._optimisticLitterOption || litterState?.state);
    this._setOptions(puppySelect, puppyOptions, this._optimisticPuppyOption || puppyState?.state);
    if (litterSelect) litterSelect.disabled = isActive;
    const weightInput = this.shadowRoot?.querySelector("#weight-input");
    if (weightInput && this.shadowRoot?.activeElement !== weightInput && !this._editingWeight) {
      weightInput.value = this._draftWeight || "";
    }

    const sessionBadge = this.shadowRoot?.querySelector("#session-badge");
    if (sessionBadge) {
      sessionBadge.textContent = session.label;
      sessionBadge.className = `session-badge ${isActive ? "active" : isComplete ? "complete" : "idle"}`;
    }
    const currentIndicator = this.shadowRoot?.querySelector("#current-puppy-indicator");
    if (currentIndicator) {
      currentIndicator.hidden = !selectedRow;
      currentIndicator.setAttribute("aria-label", `${this._t("nowSelected")}: ${selectedRow?.name || ""}`);
      this._setText("current-puppy-name", selectedRow?.name || "");
      const currentCollar = this.shadowRoot?.querySelector("#current-puppy-collar");
      if (currentCollar) currentCollar.style.backgroundColor = collarColor(selectedRow?.collar, selectedRowIndex);
    }
    const nextIndicator = this.shadowRoot?.querySelector("#next-puppy-indicator");
    if (nextIndicator) {
      nextIndicator.hidden = !bottomIndicatorRow;
      nextIndicator.setAttribute("aria-label", bottomIndicatorAriaLabel);
      this._setText("next-puppy-label", bottomIndicatorLabel);
      this._setText("next-puppy-name", bottomIndicatorRow?.name || "");
      const nextCollar = this.shadowRoot?.querySelector("#next-puppy-collar");
      if (nextCollar) nextCollar.style.backgroundColor = collarColor(bottomIndicatorRow?.collar, bottomIndicatorIndex);
    }

    this._setText("remaining-value", this._noneDisplay(remainingState?.state));
    this._setText("next-label", bottomIndicatorLabel);
    this._setText("next-value", bottomIndicatorRow?.name || this._noneDisplay(nextState?.state));
    this._setText("last-value", this._noneDisplay(lastState?.state));
    this._setText("selected-last-value", selectedRow?.lastWeighed || this._t("none"));
    this._setText("elapsed-value", this._elapsedDisplay(selectedRow?.lastWeighed));
    this._setText("selected-previous-value", `${selectedRow?.previousWeight || this._t("none")}${selectedRow?.previousWeight && selectedRow.previousWeight !== "—" ? " g" : ""}`);
    this._setText("change-value", selectedRow ? this._changeDisplay(selectedRow) : "—");

    const backendElement = this.shadowRoot?.querySelector("#backend-warning");
    if (backendElement) {
      backendElement.hidden = !backendWarning;
      backendElement.textContent = backendWarning;
    }
    const messageElement = this.shadowRoot?.querySelector("#local-message");
    if (messageElement) {
      messageElement.hidden = !message;
      messageElement.className = `message ${messageType}`;
      messageElement.textContent = this._localMessage ? message : this._sessionMessage(message);
    }
    const save = this.shadowRoot?.querySelector("#save-weight");
    if (save) save.disabled = !station.ids.save;
    const start = this.shadowRoot?.querySelector("#start-session");
    if (start) start.disabled = isActive || !station.ids.start;
    const reset = this.shadowRoot?.querySelector("#reset-session");
    if (reset) reset.disabled = !station.ids.reset;
    this._updatePuppyRows(rows, station);
  }

  _render() {
    const station = this._station();
    if (station && this.shadowRoot?.querySelector(".card") && this._viewStructureKey === this._structureKey(station)) {
      this._updateView(station);
      return;
    }
    this._renderFull();
  }

  _renderFull() {
    if (!this.shadowRoot) return;
    this._renderPending = false;
    this._viewStructureKey = "";

    if (!this._hass) {
      this.shadowRoot.innerHTML = this._shell(
        `<div class="loading">${this._escape(this._t("loadingHomeAssistant"))}</div>`
      );
      return;
    }

    if (this._registryLoading) {
      this.shadowRoot.innerHTML = this._shell(
        `<div class="loading">${this._escape(this._t("searching"))}</div>`
      );
      return;
    }

    const station = this._station();

    if (!station) {
      this.shadowRoot.innerHTML = this._shell(`
        <div class="empty">
          <strong>${this._escape(this._t("stationNotFound"))}</strong>
          <span>${this._escape(this._t("searchHint"))}</span>
          <button class="secondary" id="rediscover">${this._escape(this._t("rediscover"))}</button>
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
    const selectedRow = rows.find((row) => row.selected) || null;
    const selectedRowIndex = selectedRow ? rows.indexOf(selectedRow) : -1;
    const nextPuppyLabel = String(nextState?.state || "").trim();
    const backendNextRow = this._rowForLabel(rows, nextPuppyLabel);
    const nextDistinctRow = this._nextDistinctRow(rows, remainingState, selectedRow, backendNextRow);
    const bottomIndicatorRow = nextDistinctRow || selectedRow || backendNextRow;
    const bottomIndicatorMode = nextDistinctRow ? "next" : "current";
    const bottomIndicatorLabel = this._t(bottomIndicatorMode === "next" ? "nextPuppy" : "weighNow");
    const bottomIndicatorAriaLabel = `${bottomIndicatorLabel}: ${bottomIndicatorRow?.name || ""}`;
    const bottomIndicatorIndex = bottomIndicatorRow ? rows.indexOf(bottomIndicatorRow) : -1;
    const currentPuppyIndicator = `
      <div class="current-puppy" id="current-puppy-indicator" role="status" aria-label="${this._escape(this._t("nowSelected"))}: ${this._escape(selectedRow?.name || "")}" ${selectedRow ? "" : "hidden"}>
        <span class="current-puppy-collar" id="current-puppy-collar" style="background-color:${this._escape(collarColor(selectedRow?.collar, selectedRowIndex))}"></span>
        <span class="current-puppy-label"><small>${this._escape(this._t("nowSelected"))}</small><strong id="current-puppy-name">${this._escape(selectedRow?.name || "")}</strong></span>
      </div>
    `;
    const nextPuppyIndicator = `
      <div class="next-puppy" id="next-puppy-indicator" role="status" aria-label="${this._escape(bottomIndicatorAriaLabel)}" ${bottomIndicatorRow ? "" : "hidden"}>
        <span class="next-puppy-collar" id="next-puppy-collar" style="background-color:${this._escape(collarColor(bottomIndicatorRow?.collar, bottomIndicatorIndex))}"></span>
        <span class="next-puppy-label"><small id="next-puppy-label">${this._escape(bottomIndicatorLabel)}</small><strong id="next-puppy-name">${this._escape(bottomIndicatorRow?.name || "")}</strong></span>
      </div>
    `;
    const percentage = this._progress(station);

    const session = this._sessionPresentation(sessionState?.state);
    const isActive = session.code === "active";
    const isComplete = session.code === "complete";

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
      !station.ids.start ? this._t("startSessionAction") : null,
      !station.ids.save ? this._t("saveWeight") : null,
      !station.ids.reset ? this._t("resetSessionAction") : null,
      !station.ids.weight ? this._t("weightInput") : null,
    ].filter(Boolean);

    const backendWarning = missingControls.length
      ? this._t("missingControls", { controls: missingControls.join(", ") })
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

    const puppyRows = `
        <div class="puppy-list" id="puppy-list" ${this._config.show_puppies === false ? "hidden" : ""}>
          ${rows
            .map(
              (row) => `
                <button type="button" class="puppy-row ${row.selected ? "selected" : ""}" data-puppy-id="${this._escape(row.puppyId)}" data-puppy-option="${this._escape(row.option)}">
                  <span class="status-dot ${this._statusClass(row.statusCode)}"></span>
                  <span class="puppy-main">
                    <span class="puppy-name">${this._escape(row.name)}</span>
                    <span class="puppy-meta">${this._escape(this._ageDisplay(row.age))}</span>
                  </span>
                  <span class="metric">
                    <strong>${this._escape(this._weightDisplay(row))}</strong>
                    <span>${this._escape(this._t("metricWeight"))}</span>
                  </span>
                  <span class="metric growth ${this._statusClass(row.statusCode)}">
                    <strong>${this._escape(this._growthDisplay(row))}</strong>
                    <span>${this._escape(this._t("hours24"))}</span>
                  </span>
                  <span class="row-status ${this._statusClass(row.statusCode)}">${this._escape(
                this._statusLabel(row)
              )}</span>
                </button>
              `
            )
            .join("")}
        </div>
        <div class="empty small" id="puppy-empty" ${this._config.show_puppies === false || rows.length ? "hidden" : ""}>${this._escape(this._t("noActivePuppies"))}</div>
      `;

    const details = this._config.show_details === false
      ? ""
      : `
        <div class="session-grid">
          <div>
            <span class="label">${this._escape(this._t("remaining"))}</span>
            <strong id="remaining-value">${this._escape(this._noneDisplay(remainingState?.state))}</strong>
          </div>
          <div>
            <span class="label" id="next-label">${this._escape(bottomIndicatorLabel)}</span>
            <strong id="next-value">${this._escape(bottomIndicatorRow?.name || this._noneDisplay(nextState?.state))}</strong>
          </div>
          <div>
            <span class="label">${this._escape(this._t("lastWeighed"))}</span>
            <strong id="last-value">${this._escape(this._noneDisplay(lastState?.state))}</strong>
          </div>
          <div>
            <span class="label">${this._escape(this._t("latestSelected"))}</span>
            <strong id="selected-last-value">${this._escape(selectedRow?.lastWeighed || this._t("none"))}</strong>
          </div>
          <div>
            <span class="label">${this._escape(this._t("elapsedSinceLast"))}</span>
            <strong id="elapsed-value">${this._escape(this._elapsedDisplay(selectedRow?.lastWeighed))}</strong>
          </div>
          <div>
            <span class="label">${this._escape(this._t("previousSelected"))}</span>
            <strong id="selected-previous-value">${this._escape(selectedRow?.previousWeight || this._t("none"))}${selectedRow?.previousWeight && selectedRow.previousWeight !== "—" ? " g" : ""}</strong>
          </div>
          <div>
            <span class="label">${this._escape(this._t("differencePrevious"))}</span>
            <strong id="change-value">${this._escape(selectedRow ? this._changeDisplay(selectedRow) : "—")}</strong>
          </div>
        </div>
      `;

    this.shadowRoot.innerHTML = this._shell(`
      <div class="header">
        <div>
          <div class="eyebrow">Puppy Tracker</div>
          <h2 id="card-title">${this._escape(this._config.title ?? this._t("title"))}</h2>
        </div>
        <div class="header-status">
          ${currentPuppyIndicator}
          <span class="session-badge ${isActive ? "active" : isComplete ? "complete" : "idle"}" id="session-badge">
            ${this._escape(session.label)}
          </span>
        </div>
      </div>

      <div class="progress-wrap">
        <div class="progress-top">
          <span>${this._escape(this._t("progress"))}</span>
          <strong id="progress-count">${this._escape(progressState?.state || "0 / 0")}</strong>
        </div>
        <div class="progress-track">
          <div class="progress-bar" id="progress-bar" style="width:${percentage}%"></div>
        </div>
      </div>

      <div class="selectors">
        ${this._config.show_litter_selector !== false ? `<label>
          <span>${this._escape(this._t("litter"))}</span>
          ${litterSelect}
        </label>` : ""}
        <label>
          <span>${this._escape(this._t("puppy"))}</span>
          ${puppySelect}
        </label>
      </div>

      <div class="weight-entry">
        <label class="weight-field">
          <span>${this._escape(this._t("weight"))}</span>
          <div class="weight-input-wrap">
            <input id="weight-input" type="number" min="1" max="10000" step="1" inputmode="numeric" value="${this._escape(
              this._draftWeight || ""
            )}" placeholder="${this._escape(this._t("weightPlaceholder"))}">
            <span>g</span>
          </div>
        </label>
        <button class="primary save" id="save-weight" ${!station.ids.save ? "disabled" : ""}>
          ✓ ${this._escape(this._t("saveWeight"))}
        </button>
      </div>

      <div class="session-actions">
        <button class="secondary" id="start-session" ${isActive || !station.ids.start ? "disabled" : ""}>▶ ${this._escape(this._t("startSession"))}</button>
        <button class="secondary danger-outline" id="reset-session" ${!station.ids.reset ? "disabled" : ""}>↻ ${this._escape(this._t("resetSession"))}</button>
      </div>

      ${details}

      ${
        backendWarning
          ? `<div class="message error" id="backend-warning">${this._escape(backendWarning)}</div>`
          : `<div class="message error" id="backend-warning" hidden></div>`
      }

      ${
        message
          ? `<div class="message ${messageType}" id="local-message">${this._escape(this._localMessage ? message : this._sessionMessage(message))}</div>`
          : `<div class="message info" id="local-message" hidden></div>`
      }

      ${puppyRows}
      ${nextPuppyIndicator}
    `);

    this._viewStructureKey = this._structureKey(station);
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

      this._select(station.ids.litter, option).then((selected) => {
        if (selected) this._announceSelectedLitter(station);
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
        this._focusWeightInput();
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
      this._press(station.ids.start, this._t("startSessionAction")).finally(() =>
        this._endInteraction(350)
      );
    });

    reset?.addEventListener("click", () => {
      this._beginInteraction();
      this._press(station.ids.reset, this._t("resetSessionAction")).finally(() =>
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
        this._select(station.ids.puppy, option).then(() => {
          this._endInteraction(0);
          this._focusWeightInput();
        });
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

        .header-status {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 10px;
          flex: 0 0 auto;
        }

        .current-puppy {
          display: flex;
          align-items: center;
          gap: 8px;
          min-height: 44px;
          padding: 4px 10px 4px 5px;
          border: 1px solid var(--divider-color);
          border-radius: 24px;
          background: var(--secondary-background-color);
        }

        .current-puppy-collar {
          display: block;
          width: 34px;
          height: 34px;
          flex: 0 0 auto;
          border: 2px solid var(--primary-text-color);
          border-radius: 50%;
          box-shadow: 0 0 0 2px var(--card-background-color, #fff);
        }

        .current-puppy-label {
          display: flex;
          flex-direction: column;
          gap: 1px;
          min-width: 0;
        }

        .current-puppy-label small {
          color: var(--secondary-text-color);
          font-size: 10px;
          line-height: 1;
        }

        .current-puppy-label strong {
          max-width: 120px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 13px;
        }

        .next-puppy {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-top: 16px;
          padding: 11px 12px;
          border-top: 1px solid var(--divider-color);
          background: var(--secondary-background-color);
        }

        .next-puppy-collar {
          display: block;
          width: 28px;
          height: 28px;
          flex: 0 0 auto;
          border: 2px solid var(--primary-text-color);
          border-radius: 50%;
        }

        .next-puppy-label {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
        }

        .next-puppy-label small {
          color: var(--secondary-text-color);
          font-size: 11px;
        }

        .next-puppy-label strong {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 14px;
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

          .header-status {
            align-items: flex-end;
            flex-direction: column;
            gap: 6px;
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

if (!customElements.get("puppy-tracker-card")) {
  customElements.define("puppy-tracker-card", PuppyTrackerCard);
}
