import { escapeHtml, languageForHass } from "./puppy-tracker-card-common.js";

const QUICK_TAG = "puppy-tracker-quick-log-card";
const TIMELINE_TAG = "puppy-tracker-timeline-card";
const ATTENTION_TAG = "puppy-tracker-attention-card";
const REPORT_TAG = "puppy-tracker-report-card";
const MOTHER_VALUE = "__mother__";

function isEnglish(card) {
  return languageForHass(card?._hass) === "en";
}

function copy(card, nl, en) {
  return isEnglish(card) ? en : nl;
}

function motherName(card) {
  return card?._litterData?.litter?.mother || card?._data?.litter?.mother || null;
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
    return result;
  };

  Card.prototype.__puppyTrackerMotherTimelinePatched = true;
}

function actionStatus(card, action) {
  const days = Number(action?.days_until_due ?? action?.days_until);
  if (action?.status === "overdue") {
    const amount = Math.abs(days);
    return isEnglish(card) ? `${amount} day${amount === 1 ? "" : "s"} overdue` : `${amount} dag${amount === 1 ? "" : "en"} te laat`;
  }
  if (action?.status === "due_today") return copy(card, "Vandaag", "Today");
  if (action?.status === "upcoming") {
    if (days === 1) return copy(card, "Morgen", "Tomorrow");
    return copy(card, `Over ${days} dagen`, `In ${days} days`);
  }
  return copy(card, "Gepland", "Planned");
}

function actionTitle(card, action) {
  const type = String(action?.type || action?.record_type || "");
  if (type === "vaccination") return copy(card, "Vaccinatie", "Vaccination");
  if (type === "deworming") return copy(card, "Ontworming", "Deworming");
  return action?.title || action?.label || copy(card, "Dossieritem", "Dossier item");
}

function actionDate(card, value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return String(value || "");
  return isEnglish(card) ? `${match[2]}/${match[3]}/${match[1]}` : `${match[3]}-${match[2]}-${match[1]}`;
}

function patchAttention() {
  const Card = customElements.get(ATTENTION_TAG);
  if (!Card || Card.prototype.__puppyTrackerMotherAttentionPatched) return;
  const originalLoadData = Card.prototype._loadData;
  const originalRender = Card.prototype._render;

  Card.prototype._loadData = async function (render = true) {
    await originalLoadData.call(this, false);
    this.__motherAttention = null;
    if (this._hass && this._selectedLitterId && this._data?.litter?.mother) {
      try {
        this.__motherAttention = await this._hass.callWS({
          type: "puppy_tracker/mother/attention",
          litter_id: this._selectedLitterId,
        });
      } catch (_error) {
        this.__motherAttention = null;
      }
    }
    if (render) this._render();
  };

  Card.prototype._render = function (...args) {
    const result = originalRender.apply(this, args);
    const root = this.shadowRoot;
    const actions = this.__motherAttention?.dossier_actions?.actions || [];
    if (!root || !actions.length) return result;

    let list = root.querySelector(".list");
    if (!list) {
      root.querySelector(".all-ok")?.remove();
      list = document.createElement("div");
      list.className = "list";
      root.querySelector("ha-card")?.append(list);
    }

    for (const action of actions) {
      if (action?.due_soon === false) continue;
      const row = document.createElement("div");
      row.className = `row mother-action ${action.status === "overdue" ? "danger" : action.status === "due_today" ? "warning" : "neutral"}`;
      const reason = `${actionTitle(this, action)} · ${actionDate(this, action.due_date || action.due_at)}`;
      row.innerHTML = `<div class="icon ha"><ha-icon icon="${escapeHtml(action.icon || "mdi:calendar-alert")}"></ha-icon></div><div class="main"><div class="name">${escapeHtml(copy(this, "Moederhond", "Mother"))} · ${escapeHtml(this.__motherAttention?.owner?.name || motherName(this) || "")}</div><div class="reason">${escapeHtml(reason)}</div></div><div class="status">${escapeHtml(actionStatus(this, action))}</div>`;
      list.append(row);
    }
    return result;
  };

  Card.prototype.__puppyTrackerMotherAttentionPatched = true;
}

function patchReport() {
  const Card = customElements.get(REPORT_TAG);
  if (!Card || Card.prototype.__puppyTrackerMotherReportPatched) return;
  const originalExport = Card.prototype._export;
  const originalRender = Card.prototype._render;

  Card.prototype._export = async function (format) {
    if (this._selectedPuppyId !== MOTHER_VALUE) return originalExport.call(this, format);
    if (format !== "json" || !this._hass || !this._selectedLitterId) {
      this._status = copy(this, "Voor de moeder is momenteel alleen JSON-dossierexport beschikbaar.", "Only JSON dossier export is currently available for the mother.");
      this._render();
      return;
    }
    this._status = copy(this, "Moederdossier voorbereiden…", "Preparing mother dossier…");
    this._render();
    try {
      const result = await this._hass.callWS({
        type: "puppy_tracker/mother/export_url",
        litter_id: this._selectedLitterId,
        history_scope: this.__motherExportScope || "all",
      });
      const anchor = document.createElement("a");
      anchor.href = result.url;
      anchor.rel = "noopener";
      anchor.style.display = "none";
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      this._status = copy(this, "Moederdossier gedownload.", "Mother dossier downloaded.");
    } catch (error) {
      this._status = error?.message || copy(this, "Moederexport mislukt.", "Mother export failed.");
    }
    this._render();
  };

  Card.prototype._render = function (...args) {
    const result = originalRender.apply(this, args);
    const root = this.shadowRoot;
    const select = root?.getElementById("puppy");
    const name = motherName(this);
    if (!root || !select || !name) return result;

    let option = Array.from(select.options).find((item) => item.value === MOTHER_VALUE);
    if (!option) {
      option = document.createElement("option");
      option.value = MOTHER_VALUE;
      option.textContent = `${copy(this, "Moederhond", "Mother")} · ${name}`;
      select.insertBefore(option, select.options[1] || null);
    }
    if (this._selectedPuppyId === MOTHER_VALUE) select.value = MOTHER_VALUE;

    if (this._selectedPuppyId === MOTHER_VALUE) {
      const controls = root.querySelector(".controls");
      if (controls && !root.getElementById("mother-export-scope")) {
        const field = document.createElement("div");
        field.className = "field";
        field.innerHTML = `<label>${escapeHtml(copy(this, "Moederhistorie", "Mother history"))}</label><select id="mother-export-scope"><option value="all">${escapeHtml(copy(this, "Alle nesten", "All litters"))}</option><option value="current">${escapeHtml(copy(this, "Alleen dit nest", "Current litter only"))}</option></select>`;
        controls.append(field);
        const scope = field.querySelector("select");
        scope.value = this.__motherExportScope || "all";
        scope.addEventListener("change", (event) => { this.__motherExportScope = event.target.value; });
      }
      const pdf = root.getElementById("pdf");
      const csv = root.getElementById("csv");
      if (pdf) pdf.style.display = "none";
      if (csv) csv.style.display = "none";
      const json = root.getElementById("json");
      if (json) json.textContent = copy(this, "Moeder JSON", "Mother JSON");
      const note = root.querySelector(".note");
      if (note) note.textContent = copy(this, "Moeder JSON bevat standaard de volledige historie over alle nesten; dit is hierboven te beperken tot het huidige nest.", "Mother JSON includes the complete history across all litters by default; limit it to the current litter above if needed.");
    }
    return result;
  };

  Card.prototype.__puppyTrackerMotherReportPatched = true;
}

for (const [tag, callback] of [
  [QUICK_TAG, patchQuickLog],
  [TIMELINE_TAG, patchTimeline],
  [ATTENTION_TAG, patchAttention],
  [REPORT_TAG, patchReport],
]) {
  if (customElements.get(tag)) callback();
  else customElements.whenDefined(tag).then(callback);
}
