import { addDossierRecord, languageForHass } from "./puppy-tracker-card-common.js";
import { BULK_RECORD_TYPES } from "./puppy-tracker-dossier-schema.js";

const QUICK_TAG = "puppy-tracker-quick-log-card";
const BULK_TAG = "puppy-tracker-bulk-dossier-card";
const DOSSIER_TAG = "puppy-tracker-dossier-card";
const TIMELINE_TAG = "puppy-tracker-timeline-card";

function isEnglish(card) {
  return languageForHass(card?._hass) === "en";
}

function temperatureLabel(card) {
  return isEnglish(card) ? "Temperature" : "Temperatuur";
}

function temperaturePlaceholder(card) {
  return isEnglish(card) ? "For example 38.4" : "Bijvoorbeeld 38,4";
}

function temperatureInvalid(card) {
  return isEnglish(card)
    ? "Enter a temperature between 20.0 and 45.0 °C."
    : "Vul een temperatuur tussen 20,0 en 45,0 °C in.";
}

function ensureBulkTemperatureType() {
  if (!BULK_RECORD_TYPES.some(([type]) => type === "temperature")) {
    BULK_RECORD_TYPES.unshift(["temperature", "temperature"]);
  }
}

function localizeTemperatureOptions(card) {
  const root = card?.shadowRoot;
  if (!root) return;
  root.querySelectorAll('option[value="temperature"]').forEach((option) => {
    option.textContent = temperatureLabel(card);
  });
}

function patchSimpleRender(tag, marker) {
  const Card = customElements.get(tag);
  if (!Card || Card.prototype[marker]) return;
  const originalRender = Card.prototype._render;
  if (typeof originalRender !== "function") return;
  Card.prototype._render = function (...args) {
    const result = originalRender.apply(this, args);
    localizeTemperatureOptions(this);
    return result;
  };
  Card.prototype[marker] = true;
}

function patchQuickLog() {
  const Card = customElements.get(QUICK_TAG);
  if (!Card || Card.prototype.__puppyTrackerTemperatureQuickPatched) return;

  const originalRender = Card.prototype._render;
  const originalStartPreset = Card.prototype._startPreset;
  const originalCaptureDraft = Card.prototype._captureDraft;
  const originalSaveQuickLog = Card.prototype._saveQuickLog;

  Card.prototype._startPreset = function (presetId) {
    if (presetId !== "temperature") return originalStartPreset.call(this, presetId);
    this._draft = {
      presetId: "temperature",
      occurred_at: this._draft?.occurred_at || (() => {
        const date = new Date();
        const pad = (number) => String(number).padStart(2, "0");
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
      })(),
      note: this._draft?.note || "",
      temperature_c: this._draft?.temperature_c || "",
    };
    this._error = "";
    this._status = "";
    this._render();
    queueMicrotask(() => this.shadowRoot?.getElementById("quick-temperature")?.focus());
  };

  Card.prototype._captureDraft = function () {
    originalCaptureDraft.call(this);
    if (this._draft?.presetId !== "temperature") return;
    const input = this.shadowRoot?.getElementById("quick-temperature");
    if (input) this._draft.temperature_c = input.value;
  };

  Card.prototype._saveQuickLog = async function () {
    if (this._draft?.presetId !== "temperature") return originalSaveQuickLog.call(this);
    if (!this._hass || !this._selectedLitterId || this._saving) return;

    this._captureDraft();
    const occurredAt = new Date(this._draft.occurred_at || "");
    const temperature = Number(String(this._draft.temperature_c || "").replace(",", "."));
    if (!Number.isFinite(occurredAt.getTime())) {
      this._error = isEnglish(this) ? "Enter a valid date and time." : "Vul een geldige datum en tijd in.";
      this._render();
      return;
    }
    if (!Number.isFinite(temperature) || temperature < 20 || temperature > 45) {
      this._error = temperatureInvalid(this);
      this._render();
      return;
    }

    this._saving = true;
    this._error = "";
    this._render();
    try {
      await addDossierRecord(this._hass, this._selectedLitterId, this._selectedPuppyId, {
        record_type: "temperature",
        occurred_at: occurredAt.toISOString(),
        title: temperatureLabel(this),
        note: String(this._draft.note || "").trim() || null,
        data: { temperature_c: temperature },
      });
      this._status = isEnglish(this)
        ? `Logged for ${this._ownerName}.`
        : `Gelogd voor ${this._ownerName}.`;
      await this._finishDraft();
    } catch (error) {
      this._saving = false;
      this._error = error?.message || (isEnglish(this) ? "Temperature could not be saved." : "Temperatuur kon niet worden opgeslagen.");
      this._render();
    }
  };

  Card.prototype._render = function (...args) {
    const result = originalRender.apply(this, args);
    const root = this.shadowRoot;
    const presets = root?.querySelector(".presets");
    if (presets && !root.querySelector('[data-preset="temperature"]')) {
      const button = document.createElement("button");
      button.className = `preset ${this._draft?.presetId === "temperature" ? "selected" : ""}`;
      button.dataset.preset = "temperature";
      button.disabled = !this._litterData?.litter || this._loading || this._saving;
      button.innerHTML = `<ha-icon icon="mdi:thermometer"></ha-icon><span>${temperatureLabel(this)}</span>`;
      button.addEventListener("click", () => {
        this._captureDraft();
        this._startPreset("temperature");
      });
      presets.append(button);
    }

    if (this._draft?.presetId === "temperature") {
      const details = root?.querySelector("label.field.details");
      if (details && !root.getElementById("quick-temperature")) {
        const field = document.createElement("label");
        field.className = "field";
        field.innerHTML = `<span>${temperatureLabel(this)} (°C)</span><input id="quick-temperature" type="number" min="20" max="45" step="0.1" inputmode="decimal" placeholder="${temperaturePlaceholder(this)}" value="${String(this._draft.temperature_c || "")}">`;
        details.before(field);
        root.getElementById("quick-temperature")?.addEventListener("input", (event) => {
          if (this._draft) this._draft.temperature_c = event.target.value;
        });
        const note = root.getElementById("quick-note");
        if (note) {
          note.placeholder = isEnglish(this) ? "Optional observation" : "Optionele observatie";
          note.required = false;
        }
      }
    }
    return result;
  };

  Card.prototype.__puppyTrackerTemperatureQuickPatched = true;
}

function patchTimeline() {
  const Card = customElements.get(TIMELINE_TAG);
  if (!Card || Card.prototype.__puppyTrackerTemperatureTimelinePatched) return;
  const originalTimelineEvents = Card.prototype._timelineEvents;
  const originalRender = Card.prototype._render;

  Card.prototype._timelineEvents = function (...args) {
    this._selectedTypes?.add("temperature");
    const events = originalTimelineEvents.apply(this, args) || [];
    return events.map((event) => {
      if (event?.raw_type !== "temperature") return event;
      const value = Number(event.data?.temperature_c);
      const formatted = Number.isFinite(value)
        ? value.toLocaleString(isEnglish(this) ? "en-US" : "nl-NL", { maximumFractionDigits: 1 })
        : null;
      return {
        ...event,
        type: "temperature",
        title: event.title || temperatureLabel(this),
        data: {
          ...(event.data || {}),
          result: formatted ? `${formatted} °C` : event.data?.result,
        },
      };
    });
  };

  Card.prototype._render = function (...args) {
    this._selectedTypes?.add("temperature");
    const result = originalRender.apply(this, args);
    const root = this.shadowRoot;
    const filters = root?.querySelector(".filters");
    if (filters && !root.querySelector('[data-filter-type="temperature"]')) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `chip ${this._selectedTypes?.has("temperature") ? "active" : ""}`;
      button.dataset.filterType = "temperature";
      button.innerHTML = `<ha-icon icon="mdi:thermometer"></ha-icon>${temperatureLabel(this)}`;
      button.addEventListener("click", () => {
        if (this._selectedTypes?.has("temperature")) this._selectedTypes.delete("temperature");
        else this._selectedTypes?.add("temperature");
        this._render();
      });
      filters.append(button);
    }
    root?.querySelectorAll('.timeline-item[data-event-type="temperature"] .rail ha-icon').forEach((icon) => {
      icon.setAttribute("icon", "mdi:thermometer");
    });
    return result;
  };

  Card.prototype.__puppyTrackerTemperatureTimelinePatched = true;
}

ensureBulkTemperatureType();

for (const [tag, callback] of [
  [QUICK_TAG, patchQuickLog],
  [TIMELINE_TAG, patchTimeline],
  [BULK_TAG, () => patchSimpleRender(BULK_TAG, "__puppyTrackerTemperatureBulkPatched")],
  [DOSSIER_TAG, () => patchSimpleRender(DOSSIER_TAG, "__puppyTrackerTemperatureDossierPatched")],
]) {
  if (customElements.get(tag)) callback();
  else customElements.whenDefined(tag).then(callback);
}
