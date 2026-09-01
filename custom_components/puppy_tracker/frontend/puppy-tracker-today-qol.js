import { escapeHtml, languageForHass } from "./puppy-tracker-card-common.js";

const TAG = "puppy-tracker-today-card";

function t(card, nl, en) {
  return languageForHass(card?._hass) === "en" ? en : nl;
}

function typeLabel(card, value) {
  const labels = {
    weight: ["Gewicht", "Weight"],
    vaccination: ["Vaccinatie", "Vaccination"],
    deworming: ["Ontworming", "Deworming"],
    medication: ["Medicatie", "Medication"],
    test: ["Test", "Test"],
    temperature: ["Temperatuur", "Temperature"],
    vet_visit: ["Dierenarts", "Vet visit"],
    milestone: ["Mijlpaal", "Milestone"],
    note: ["Notitie", "Note"],
    feeding: ["Voeding", "Feeding"],
    other: ["Overig", "Other"],
    care: ["Zorgprogramma", "Care program"],
    reminder: ["Herinnering", "Reminder"],
    dossier: ["Dossier", "Dossier"],
  };
  const pair = labels[value];
  return pair ? t(card, pair[0], pair[1]) : String(value || t(card, "Overig", "Other"));
}

function typeIcon(value) {
  return {
    weight: "mdi:scale",
    vaccination: "mdi:needle",
    deworming: "mdi:pill",
    medication: "mdi:medical-bag",
    test: "mdi:test-tube",
    temperature: "mdi:thermometer",
    vet_visit: "mdi:doctor",
    milestone: "mdi:flag-checkered",
    note: "mdi:note-text-outline",
    feeding: "mdi:food-drumstick-outline",
    reminder: "mdi:bell-outline",
    dossier: "mdi:file-document-outline",
    other: "mdi:file-document-outline",
  }[value] || "mdi:file-document-outline";
}

function dateKey(value, timeZone = "") {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  if (timeZone) {
    try {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(date);
      const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
      if (values.year && values.month && values.day) return `${values.year}-${values.month}-${values.day}`;
    } catch (_error) {
      // Fall back to the browser's local calendar below.
    }
  }
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTime(card, value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const options = { hour: "2-digit", minute: "2-digit" };
  const timeZone = String(card?._hass?.config?.time_zone || "");
  if (timeZone) options.timeZone = timeZone;
  try {
    return new Intl.DateTimeFormat(languageForHass(card?._hass) === "en" ? "en-GB" : "nl-NL", options).format(date);
  } catch (_error) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
}

function formatWeight(card, value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  return `${number.toLocaleString(languageForHass(card?._hass) === "en" ? "en-US" : "nl-NL", { maximumFractionDigits: 1 })} g`;
}

function primitiveText(value) {
  if (value === null || value === undefined || value === "") return "";
  return ["string", "number", "boolean"].includes(typeof value) ? String(value) : "";
}

function recordSummary(record) {
  const values = [];
  for (const value of [record?.title, record?.note]) {
    const text = primitiveText(value).trim();
    if (text && !values.includes(text)) values.push(text);
  }
  const data = record?.data && typeof record.data === "object" ? record.data : {};
  for (const key of ["result", "test_result", "product", "vaccine", "dose", "amount", "unit", "clinic", "diagnosis"]) {
    const text = primitiveText(data[key]).trim();
    if (text && !values.includes(text)) values.push(text);
    if (values.length >= 3) break;
  }
  return values.slice(0, 3).join(" · ");
}

function todayTimelineEvents(card) {
  const data = card?._data;
  if (!data) return [];
  const timeZone = String(card?._hass?.config?.time_zone || "");
  const today = dateKey(Date.now(), timeZone);
  const events = [];

  const addRecord = (record, puppy = null) => {
    if (!record || record.deleted) return;
    const occurredAt = record.occurred_at || record.created_at;
    if (!occurredAt || dateKey(occurredAt, timeZone) !== today) return;
    events.push({
      id: `record:${record.scope || (puppy ? "puppy" : "litter")}:${record.id || occurredAt}`,
      type: String(record.type || "other"),
      occurredAt,
      owner: record.puppy_name || puppy?.name || t(card, "Nest", "Litter"),
      detail: recordSummary(record),
    });
  };

  for (const record of data?.litter?.records || []) addRecord(record);
  for (const puppy of data?.puppies || []) {
    if (puppy?.active === false) continue;
    for (const measurement of puppy?.measurements || []) {
      if (measurement?.deleted || measurement?.superseded_by || ["deleted", "superseded"].includes(measurement?.status)) continue;
      const occurredAt = measurement?.timestamp || measurement?.created_at;
      if (!occurredAt || dateKey(occurredAt, timeZone) !== today) continue;
      events.push({
        id: `weight:${puppy.id || "unknown"}:${measurement.id || occurredAt}`,
        type: "weight",
        occurredAt,
        owner: puppy.name || t(card, "Pup", "Puppy"),
        detail: formatWeight(card, measurement.weight),
      });
    }
    for (const record of puppy?.records || []) addRecord(record, puppy);
  }

  events.sort((left, right) => {
    const timeDiff = Date.parse(String(right.occurredAt || "")) - Date.parse(String(left.occurredAt || ""));
    if (Number.isFinite(timeDiff) && timeDiff) return timeDiff;
    return String(right.id).localeCompare(String(left.id));
  });
  return events;
}

function selectedTypesFor(card, types) {
  const available = Array.isArray(types) ? types : [];
  const previousAvailable = Array.isArray(card.__todayAvailableTypes)
    ? card.__todayAvailableTypes
    : Array.isArray(card.__todayCareAvailableTypes) ? card.__todayCareAvailableTypes : [];
  let selected = card.__todayTypeFilters instanceof Set
    ? new Set(card.__todayTypeFilters)
    : card.__todayCareTypeFilters instanceof Set
      ? new Set(card.__todayCareTypeFilters)
      : new Set(available);

  const previouslyAllSelected = previousAvailable.length > 0
    && previousAvailable.every((type) => selected.has(type));
  selected = new Set([...selected].filter((type) => available.includes(type)));

  if (!previousAvailable.length || previouslyAllSelected) {
    for (const type of available) selected.add(type);
  }
  if (!selected.size && available.length) selected = new Set(available);

  card.__todayTypeFilters = selected;
  card.__todayAvailableTypes = [...available];
  delete card.__todayCareTypeFilters;
  delete card.__todayCareAvailableTypes;
  return selected;
}

function toggleType(card, type, types) {
  const selected = selectedTypesFor(card, types);
  if (type === "__all__") {
    card.__todayTypeFilters = new Set(types);
  } else if (selected.has(type)) {
    if (selected.size > 1) selected.delete(type);
    card.__todayTypeFilters = selected;
  } else {
    selected.add(type);
    card.__todayTypeFilters = selected;
  }
  card.__todayAvailableTypes = [...types];
  card._render();
}

function decorateCareRows(card, summary) {
  const rows = Array.from(summary?.querySelectorAll(".care-row[data-care-occurrence]") || []);
  for (const row of rows) {
    const item = (card.__careOccurrences || []).find(
      (candidate) => String(candidate?.id || "") === String(row.dataset.careOccurrence || ""),
    );
    row.dataset.todayType = String(item?.record_type || "care");
  }
  return rows;
}

function createTimelineSection(card, events) {
  if (!events.length) return null;
  const section = document.createElement("div");
  section.className = "today-timeline-section";
  section.innerHTML = `<div class="today-group-title">${escapeHtml(t(card, "Tijdlijn vandaag", "Today's timeline"))}</div><div class="today-timeline-list">${events.map((event) => `<div class="today-timeline-row" data-today-type="${escapeHtml(event.type)}" data-today-event="${escapeHtml(event.id)}"><ha-icon icon="${escapeHtml(typeIcon(event.type))}"></ha-icon><div class="today-main"><strong>${escapeHtml(event.owner)}</strong><span>${escapeHtml(typeLabel(card, event.type))}${event.detail ? ` · ${escapeHtml(event.detail)}` : ""}</span></div><div class="today-time">${escapeHtml(formatTime(card, event.occurredAt))}</div></div>`).join("")}</div>`;
  return section;
}

function forceSingleScrollContainer(careSummary) {
  const careList = careSummary?.querySelector(".care-list");
  if (!careList) return;
  careList.style.setProperty("max-height", "none", "important");
  careList.style.setProperty("overflow-y", "visible", "important");
  careList.style.setProperty("overscroll-behavior", "auto", "important");
  careList.style.setProperty("scrollbar-gutter", "auto", "important");
  careList.style.setProperty("padding-right", "0px", "important");
}

function renderQol(card) {
  const root = card?.shadowRoot;
  const haCard = root?.querySelector("ha-card");
  if (!root || !haCard) return;

  root.querySelector(".today-activity")?.remove();
  const careSummary = root.querySelector(".care-summary");
  const careRows = decorateCareRows(card, careSummary);
  const events = todayTimelineEvents(card);
  if (!events.length && !careRows.length) return;

  const timelineSection = createTimelineSection(card, events);
  const timelineRows = Array.from(timelineSection?.querySelectorAll(".today-timeline-row") || []);
  const allRows = [...timelineRows, ...careRows];
  const types = [...new Set(allRows.map((row) => row.dataset.todayType).filter(Boolean))]
    .sort((a, b) => typeLabel(card, a).localeCompare(typeLabel(card, b)));
  const selectedTypes = selectedTypesFor(card, types);
  const allSelected = selectedTypes.size === types.length;

  const activity = document.createElement("div");
  activity.className = "today-activity";
  activity.innerHTML = `<style>
    .today-activity{margin-top:14px;border-top:1px solid var(--divider-color);padding-top:12px}.today-qol-controls{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:0 0 10px}.today-filter-label{font-size:.78rem;color:var(--secondary-text-color);font-weight:600}.today-type-filters{display:flex;flex-wrap:wrap;gap:6px}.today-type-chip{display:inline-flex;align-items:center;border:1px solid var(--divider-color);border-radius:999px;background:transparent;color:var(--primary-text-color);padding:6px 9px;cursor:pointer;font:inherit;font-size:.82rem}.today-type-chip.active{background:var(--primary-color);color:var(--text-primary-color,#fff);border-color:var(--primary-color)}.today-items-scroll{max-height:520px;overflow-y:auto;overscroll-behavior:contain;scrollbar-gutter:stable;padding-right:2px;display:grid;gap:12px}.today-group-title{font-weight:700;margin-bottom:8px}.today-timeline-list{display:grid;gap:7px}.today-timeline-row{display:grid;grid-template-columns:24px minmax(0,1fr) auto;gap:8px;align-items:center;padding:8px 9px;border-radius:10px;background:var(--secondary-background-color)}.today-timeline-row>ha-icon{--mdc-icon-size:19px;color:var(--secondary-text-color)}.today-main{min-width:0}.today-main strong{display:block}.today-main span{display:block;font-size:.78rem;color:var(--secondary-text-color);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.today-time{font-size:.78rem;font-weight:600;white-space:nowrap;color:var(--secondary-text-color)}.today-filter-hidden,.today-group-hidden{display:none!important}.today-empty{font-size:.82rem;color:var(--secondary-text-color);padding:8px 2px}.today-empty[hidden]{display:none!important}.today-items-scroll>.care-summary{margin-top:0}.today-items-scroll .care-list{max-height:none!important;overflow:visible!important;overscroll-behavior:auto!important;scrollbar-gutter:auto!important;padding-right:0!important}@media(max-width:520px){.today-timeline-row{grid-template-columns:24px minmax(0,1fr)}.today-time{display:none}.today-qol-controls{align-items:flex-start}}
  </style><div class="today-qol-controls"><span class="today-filter-label">${escapeHtml(t(card, "Type", "Type"))}</span><div class="today-type-filters"><button type="button" class="today-type-chip ${allSelected ? "active" : ""}" data-today-filter-type="__all__">${escapeHtml(t(card, "Alles", "All"))}</button>${types.map((value) => `<button type="button" class="today-type-chip ${selectedTypes.has(value) ? "active" : ""}" data-today-filter-type="${escapeHtml(value)}">${escapeHtml(typeLabel(card, value))}</button>`).join("")}</div></div><div class="today-items-scroll"></div><div class="today-empty" hidden>${escapeHtml(t(card, "Geen items voor de geselecteerde types.", "No items for the selected types."))}</div>`;

  const scroll = activity.querySelector(".today-items-scroll");
  if (timelineSection) scroll?.append(timelineSection);
  if (careSummary) {
    scroll?.append(careSummary);
    forceSingleScrollContainer(careSummary);
  }
  haCard.append(activity);

  let visibleTimeline = 0;
  let visibleCare = 0;
  for (const row of timelineRows) {
    const visible = selectedTypes.has(row.dataset.todayType);
    row.hidden = !visible;
    row.classList.toggle("today-filter-hidden", !visible);
    if (visible) visibleTimeline += 1;
  }
  for (const row of careRows) {
    const visible = selectedTypes.has(row.dataset.todayType);
    row.hidden = !visible;
    row.classList.toggle("today-filter-hidden", !visible);
    if (visible) visibleCare += 1;
  }
  timelineSection?.classList.toggle("today-group-hidden", visibleTimeline === 0);
  careSummary?.classList.toggle("today-group-hidden", visibleCare === 0);
  const empty = activity.querySelector(".today-empty");
  if (empty) empty.hidden = (visibleTimeline + visibleCare) > 0;

  activity.querySelectorAll("[data-today-filter-type]").forEach((button) => {
    button.addEventListener("click", () => toggleType(card, button.dataset.todayFilterType, types));
  });
}

function patch() {
  const Card = customElements.get(TAG);
  const proto = Card?.prototype;
  if (!proto || proto.__puppyTrackerTodayQolPatched) return;
  const originalRender = proto._render;
  if (typeof originalRender !== "function") return;

  proto._render = function (...args) {
    const result = originalRender.apply(this, args);
    renderQol(this);
    return result;
  };
  proto.__puppyTrackerTodayQolPatched = true;
}

if (customElements.get(TAG)) patch();
else customElements.whenDefined(TAG).then(patch);
