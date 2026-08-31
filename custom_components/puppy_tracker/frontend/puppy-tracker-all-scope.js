import {
  escapeHtml,
  fetchLitterData,
  fetchRecords,
  languageForHass,
} from "./puppy-tracker-card-common.js";

const TIMELINE_TAG = "puppy-tracker-timeline-card";
const DOSSIER_TAG = "puppy-tracker-dossier-card";
const ALL_VALUE = "__all__";

function copy(card, nl, en) {
  return languageForHass(card?._hass) === "en" ? en : nl;
}

function timestampValue(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function sortNewestFirst(items) {
  return [...(items || [])].sort((left, right) => {
    const occurred = timestampValue(right?.occurred_at) - timestampValue(left?.occurred_at);
    if (occurred) return occurred;
    const created = timestampValue(right?.created_at) - timestampValue(left?.created_at);
    if (created) return created;
    return String(right?.id || "").localeCompare(String(left?.id || ""));
  });
}

async function fetchMotherRecords(card, includeDeleted = false) {
  if (!card?._hass || !card?._selectedLitterId || !card?._litterData?.litter?.mother) return null;
  return card._hass.callWS({
    type: "puppy_tracker/mother/records",
    litter_id: card._selectedLitterId,
    history_scope: "current",
    include_deleted: Boolean(includeDeleted),
  });
}

function motherTimelineEvent(card, record, ownerName) {
  const rawType = String(record?.type || "other");
  const data = record?.data && typeof record.data === "object" ? { ...record.data } : {};
  if (rawType === "temperature") {
    const value = Number(data.temperature_c);
    if (Number.isFinite(value)) {
      data.result = `${value.toLocaleString(languageForHass(card?._hass) === "en" ? "en-US" : "nl-NL", { maximumFractionDigits: 1 })} °C`;
    }
  }
  return {
    id: `mother:${record?.id || "unknown"}`,
    type: rawType,
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

function patchTimelineAllScope() {
  const Card = customElements.get(TIMELINE_TAG);
  if (!Card || Card.prototype.__puppyTrackerAllTimelinePatched) return;

  const originalLoadData = Card.prototype._loadData;
  const originalSelectScope = Card.prototype._selectScope;
  const originalToggleHistory = Card.prototype._toggleHistory;
  const originalTimelineEvents = Card.prototype._timelineEvents;
  const originalRender = Card.prototype._render;

  Card.prototype._loadData = async function (render = true) {
    if (this._scope !== "all") return originalLoadData.call(this, render);

    const intendedScope = this._scope;
    this._scope = "litter";
    try {
      await originalLoadData.call(this, false);
    } finally {
      this._scope = intendedScope;
    }

    this._selectedPuppyId = null;
    this.__allMotherRecordData = await fetchMotherRecords(
      this,
      Boolean(this._showHistory && this._canManageHistory),
    );
    if (render) this._render();
  };

  Card.prototype._selectScope = async function (value) {
    if (value !== ALL_VALUE) return originalSelectScope.call(this, value);
    this._scope = "all";
    this._selectedPuppyId = null;
    this._loading = true;
    this._render();
    try {
      await this._loadData(false);
      this._error = "";
    } catch (error) {
      this._error = error?.message || copy(this, "Volledige tijdlijn kon niet worden geladen.", "Combined timeline could not be loaded.");
    } finally {
      this._loading = false;
      this._render();
    }
  };

  Card.prototype._toggleHistory = async function (enabled) {
    if (this._scope !== "all") return originalToggleHistory.call(this, enabled);
    this._showHistory = Boolean(enabled) && this._canManageHistory;
    this._loading = true;
    this._render();
    try {
      await this._loadData(false);
      this._error = "";
    } catch (error) {
      this._error = error?.message || copy(this, "Volledige tijdlijn kon niet worden geladen.", "Combined timeline could not be loaded.");
    } finally {
      this._loading = false;
      this._render();
    }
  };

  Card.prototype._timelineEvents = function (...args) {
    if (this._scope !== "all") return originalTimelineEvents.apply(this, args);

    const intendedScope = this._scope;
    this._scope = "litter";
    let events;
    try {
      events = originalTimelineEvents.apply(this, args);
    } finally {
      this._scope = intendedScope;
    }

    const ownerName = this.__allMotherRecordData?.owner?.name
      || this._litterData?.litter?.mother
      || copy(this, "Moederhond", "Mother");
    const motherEvents = (this.__allMotherRecordData?.records || [])
      .map((record) => motherTimelineEvent(this, record, ownerName));
    this._selectedTypes?.add("temperature");
    return sortNewestFirst([...(events || []), ...motherEvents]);
  };

  Card.prototype._render = function (...args) {
    const result = originalRender.apply(this, args);
    const select = this.shadowRoot?.getElementById("scope-select");
    if (!select) return result;

    let option = Array.from(select.options).find((item) => item.value === ALL_VALUE);
    if (!option) {
      option = document.createElement("option");
      option.value = ALL_VALUE;
      option.textContent = copy(this, "Alles (incl. moeder)", "All (incl. mother)");
      select.insertBefore(option, select.options[0] || null);
    }
    if (this._scope === "all") select.value = ALL_VALUE;
    return result;
  };

  Card.prototype.__puppyTrackerAllTimelinePatched = true;
}

function ownerLabel(card, scope, name = null) {
  if (scope === "mother") return `${copy(card, "Moederhond", "Mother")} · ${name || copy(card, "Moederhond", "Mother")}`;
  if (scope === "puppy") return `${copy(card, "Pup", "Puppy")} · ${name || copy(card, "Pup", "Puppy")}`;
  return copy(card, "Hele nest", "Whole litter");
}

function decorateRecord(record, scope, name = null) {
  return {
    ...(record || {}),
    __aggregate_owner_scope: scope,
    __aggregate_owner_name: name,
  };
}

function patchDossierAllScope() {
  const Card = customElements.get(DOSSIER_TAG);
  if (!Card || Card.prototype.__puppyTrackerAllDossierPatched) return;

  const originalLoad = Card.prototype._loadLitterAndRecords;
  const originalSelectOwner = Card.prototype._selectOwner;
  const originalRenderProfileNote = Card.prototype._renderProfileNote;
  const originalRender = Card.prototype._render;

  Card.prototype._loadLitterAndRecords = async function (render = true) {
    if (!this.__allSelected) return originalLoad.call(this, render);
    if (!this._hass || !this._selectedLitterId) {
      this._litterData = null;
      this._recordData = null;
      if (render) this._render();
      return;
    }

    this._litterData = await fetchLitterData(this._hass, this._selectedLitterId);
    this._selectedPuppyId = null;
    this.__motherSelected = false;
    this._showDeleted = false;

    const puppies = this._litterData?.puppies || [];
    const [litterRecords, motherRecords, ...puppyResponses] = await Promise.all([
      fetchRecords(this._hass, this._selectedLitterId, null, false),
      fetchMotherRecords(this, false),
      ...puppies.map((puppy) => fetchRecords(this._hass, this._selectedLitterId, puppy.id, false)),
    ]);

    const records = [];
    for (const record of litterRecords?.records || []) {
      records.push(decorateRecord(record, "litter", this._litterData?.litter?.name || null));
    }
    for (const record of motherRecords?.records || []) {
      records.push(decorateRecord(record, "mother", motherRecords?.owner?.name || this._litterData?.litter?.mother || null));
    }
    puppyResponses.forEach((response, index) => {
      const puppy = puppies[index];
      for (const record of response?.records || []) {
        records.push(decorateRecord(record, "puppy", puppy?.name || null));
      }
    });

    this._recordData = {
      records: sortNewestFirst(records),
      actions: { actions: [] },
      can_manage_records: false,
    };
    if (render) this._render();
  };

  Card.prototype._selectOwner = async function (value) {
    if (value !== ALL_VALUE) {
      this.__allSelected = false;
      return originalSelectOwner.call(this, value);
    }

    this.__allSelected = true;
    this.__motherSelected = false;
    this._selectedPuppyId = null;
    this._editor = null;
    this._profileEditing = false;
    this._status = "";
    this._loading = true;
    this._render();
    try {
      await this._loadLitterAndRecords(false);
      this._error = "";
    } catch (error) {
      this._error = error?.message || copy(this, "Volledig dossier kon niet worden geladen.", "Combined dossier could not be loaded.");
    } finally {
      this._loading = false;
      this._render();
    }
  };

  Card.prototype._renderProfileNote = function (...args) {
    if (this.__allSelected) return "";
    return originalRenderProfileNote.apply(this, args);
  };

  Card.prototype._render = function (...args) {
    const result = originalRender.apply(this, args);
    const root = this.shadowRoot;
    const select = root?.getElementById("owner-select");
    if (!root || !select) return result;

    let option = Array.from(select.options).find((item) => item.value === ALL_VALUE);
    if (!option) {
      option = document.createElement("option");
      option.value = ALL_VALUE;
      option.textContent = copy(this, "Alles (nest + moeder + pups)", "All (litter + mother + puppies)");
      select.insertBefore(option, select.options[0] || null);
    }

    if (this.__allSelected) {
      select.value = ALL_VALUE;
      const records = this._recordData?.records || [];
      root.querySelectorAll(".record").forEach((element, index) => {
        const record = records[index];
        const heading = element.querySelector(".record-heading");
        if (!record || !heading || heading.querySelector(".aggregate-owner-badge")) return;
        const badge = document.createElement("span");
        badge.className = "type-badge aggregate-owner-badge";
        badge.textContent = ownerLabel(
          this,
          record.__aggregate_owner_scope,
          record.__aggregate_owner_name,
        );
        heading.append(badge);
      });

      const subtitle = root.querySelector(".subtitle");
      if (subtitle) subtitle.textContent = copy(this, "Alle dossieritems van dit nest", "All dossier items for this litter");
      const timelineSub = root.querySelector(".timeline-sub");
      if (timelineSub) {
        const parts = timelineSub.textContent.split(" · ");
        timelineSub.textContent = `${copy(this, "Alles", "All")} · ${parts.slice(1).join(" · ") || records.length}`;
      }
    }
    return result;
  };

  Card.prototype.__puppyTrackerAllDossierPatched = true;
}

for (const [tag, callback] of [
  [TIMELINE_TAG, patchTimelineAllScope],
  [DOSSIER_TAG, patchDossierAllScope],
]) {
  if (customElements.get(tag)) callback();
  else customElements.whenDefined(tag).then(callback);
}
