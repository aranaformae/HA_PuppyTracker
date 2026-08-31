import { escapeHtml, languageForHass } from "./puppy-tracker-card-common.js";

const QUICK_TAG = "puppy-tracker-quick-log-card";
const TIMELINE_TAG = "puppy-tracker-timeline-card";
const MOTHER_VALUE = "__mother__";

function isEnglish(card) {
  return languageForHass(card?._hass) === "en";
}

function copy(card, nl, en) {
  return isEnglish(card) ? en : nl;
}

function motherName(card) {
  return card?._litterData?.litter?.mother || null;
}

async function motherCall(card, action, payload = {}) {
  return card._hass.callWS({
    type: `puppy_tracker/mother/${action}`,
    litter_id: card._selectedLitterId,
    ...payload,
  });
}

function patchQuickLog() {
  const Card = customElements.get(QUICK_TAG);
  if (!Card || Card.prototype.__puppyTrackerMotherQuickPatched) return;

  const originalSelectOwner = Card.prototype._selectOwner;
  const originalSave = Card.prototype._saveQuickLog;
  const originalRender = Card.prototype._render;

  Card.prototype._selectOwner = function (value) {
    if (value !== MOTHER_VALUE) {
      this.__motherSelected = false;
      return originalSelectOwner.call(this, value);
    }
    this.__motherSelected = true;
    this._selectedPuppyId = null;
    this._draft = null;
    this._status = "";
    this._error = "";
    this._render();
  };

  Card.prototype._saveQuickLog = async function () {
    if (!this.__motherSelected) return originalSave.call(this);
    if (!this._draft || !this._hass || !this._selectedLitterId || this._saving) return;

    this._captureDraft();
    const occurredAt = new Date(this._draft.occurred_at || "");
    if (!Number.isFinite(occurredAt.getTime())) {
      this._error = copy(this, "Vul een geldige datum en tijd in.", "Enter a valid date and time.");
      this._render();
      return;
    }

    const presetId = String(this._draft.presetId || "note");
    const note = String(this._draft.note || "").trim();
    const typeMap = {
      note: "note",
      feeding: "note",
      elimination: "note",
      medication: "medication",
      milestone: "milestone",
      temperature: "temperature",
    };
    const titleMap = {
      feeding: copy(this, "Voeding", "Feeding"),
      elimination: copy(this, "Ontlasting / urine", "Stool / urine"),
      temperature: copy(this, "Temperatuur", "Temperature"),
    };
    const data = {};

    if (presetId === "temperature") {
      const temperature = Number(String(this._draft.temperature_c || "").replace(",", "."));
      if (!Number.isFinite(temperature) || temperature < 20 || temperature > 45) {
        this._error = copy(
          this,
          "Vul een temperatuur tussen 20,0 en 45,0 °C in.",
          "Enter a temperature between 20.0 and 45.0 °C.",
        );
        this._render();
        return;
      }
      data.temperature_c = temperature;
    } else if (!note) {
      this._error = copy(this, "Vul eerst een korte omschrijving in.", "Add a short description first.");
      this._render();
      return;
    }

    this._saving = true;
    this._error = "";
    this._render();
    try {
      await motherCall(this, "record/add", {
        record_type: typeMap[presetId] || "note",
        occurred_at: occurredAt.toISOString(),
        title: titleMap[presetId] || null,
        note: note || null,
        data,
      });
      this._status = copy(
        this,
        `Gelogd voor ${motherName(this) || "moederhond"}.`,
        `Logged for ${motherName(this) || "mother"}.`,
      );
      await this._finishDraft();
    } catch (error) {
      this._saving = false;
      this._error = error?.message || copy(this, "Log kon niet worden opgeslagen.", "Log could not be saved.");
      this._render();
    }
  };

  Card.prototype._render = function (...args) {
    const result = originalRender.apply(this, args);
    const root = this.shadowRoot;
    const select = root?.getElementById("owner-select");
    const name = motherName(this);
    if (select && name) {
      let option = Array.from(select.options).find((item) => item.value === MOTHER_VALUE);
      if (!option) {
        option = document.createElement("option");
        option.value = MOTHER_VALUE;
        option.textContent = `${copy(this, "Moederhond", "Mother")} · ${name}`;
        select.insertBefore(option, select.options[1] || null);
      }
      if (this.__motherSelected) select.value = MOTHER_VALUE;
    }
    return result;
  };

  Card.prototype.__puppyTrackerMotherQuickPatched = true;
}

function mapMotherRecord(card, record, ownerName) {
  const rawType = String(record?.type || "other");
  const type = rawType === "temperature" ? "temperature" : rawType;
  const data = record?.data && typeof record.data === "object" ? { ...record.data } : {};
  if (rawType === "temperature") {
    const value = Number(data.temperature_c);
    if (Number.isFinite(value)) {
      data.result = `${value.toLocaleString(isEnglish(card) ? "en-US" : "nl-NL", { maximumFractionDigits: 1 })} °C`;
    }
  }
  return {
    id: `mother:${record?.id || "unknown"}`,
    type,
    raw_type: rawType,
    source: "record",
    occurred_at: record?.occurred_at || record?.created_at || null,
    created_at: record?.created_at || record?.occurred_at || null,
    puppy_id: null,
    puppy_name: ownerName,
    scope: "mother",
    title: record?.title || (rawType === "temperature" ? copy(card, "Temperatuur", "Temperature") : null),
    note: record?.note || null,
    status: record?.deleted ? "deleted" : "active",
    data,
  };
}

function patchTimeline() {
  const Card = customElements.get(TIMELINE_TAG);
  if (!Card || Card.prototype.__puppyTrackerMotherTimelinePatched) return;

  const originalLoadData = Card.prototype._loadData;
  const originalSelectScope = Card.prototype._selectScope;
  const originalToggleHistory = Card.prototype._toggleHistory;
  const originalTimelineEvents = Card.prototype._timelineEvents;
  const originalRender = Card.prototype._render;

  Card.prototype._loadData = async function (render = true) {
    if (this._scope !== "mother") return originalLoadData.call(this, render);
    this._historyRecords = {};
    this._historyMeasurements = {};
    if (!this._selectedLitterId || !this._hass) {
      this._litterData = null;
      this.__motherRecordData = null;
      if (render) this._render();
      return;
    }
    this._litterData = await this._hass.callWS({
      type: "puppy_tracker/data",
      litter_id: this._selectedLitterId,
    });
    this._selectedPuppyId = null;
    this.__motherRecordData = await this._hass.callWS({
      type: "puppy_tracker/mother/records",
      litter_id: this._selectedLitterId,
      history_scope: "current",
      include_deleted: Boolean(this._showHistory && this._canManageHistory),
    });
    if (!this._canManageHistory) this._showHistory = false;
    if (render) this._render();
  };

  Card.prototype._selectScope = async function (value) {
    if (value !== MOTHER_VALUE) return originalSelectScope.call(this, value);
    this._scope = "mother";
    this._selectedPuppyId = null;
    this._loading = true;
    this._render();
    try {
      await this._loadData(false);
      this._error = "";
    } catch (error) {
      this._error = error?.message || copy(this, "Moedertijdlijn kon niet worden geladen.", "Mother timeline could not be loaded.");
    } finally {
      this._loading = false;
      this._render();
    }
  };

  Card.prototype._toggleHistory = async function (enabled) {
    if (this._scope !== "mother") return originalToggleHistory.call(this, enabled);
    this._showHistory = Boolean(enabled) && this._canManageHistory;
    this._loading = true;
    this._render();
    try {
      await this._loadData(false);
      this._error = "";
    } catch (error) {
      this._error = error?.message || copy(this, "Moedertijdlijn kon niet worden geladen.", "Mother timeline could not be loaded.");
    } finally {
      this._loading = false;
      this._render();
    }
  };

  Card.prototype._timelineEvents = function (...args) {
    if (this._scope !== "mother") return originalTimelineEvents.apply(this, args);
    this._selectedTypes?.add("temperature");
    const ownerName = this.__motherRecordData?.owner?.name || motherName(this) || copy(this, "Moederhond", "Mother");
    return (this.__motherRecordData?.records || []).map((record) => mapMotherRecord(this, record, ownerName));
  };

  Card.prototype._render = function (...args) {
    const result = originalRender.apply(this, args);
    const root = this.shadowRoot;
    const select = root?.getElementById("scope-select");
    const name = motherName(this);
    if (select && name) {
      let option = Array.from(select.options).find((item) => item.value === MOTHER_VALUE);
      if (!option) {
        option = document.createElement("option");
        option.value = MOTHER_VALUE;
        option.textContent = `${copy(this, "Moederhond", "Mother")} · ${name}`;
        select.insertBefore(option, select.options[1] || null);
      }
      if (this._scope === "mother") select.value = MOTHER_VALUE;
    }
    if (this._scope === "mother") {
      root?.querySelectorAll(".timeline-item .meta").forEach((meta) => {
        if (name && !meta.textContent?.startsWith(name)) return;
      });
    }
    return result;
  };

  Card.prototype.__puppyTrackerMotherTimelinePatched = true;
}

for (const [tag, callback] of [
  [QUICK_TAG, patchQuickLog],
  [TIMELINE_TAG, patchTimeline],
]) {
  if (customElements.get(tag)) callback();
  else customElements.whenDefined(tag).then(callback);
}
