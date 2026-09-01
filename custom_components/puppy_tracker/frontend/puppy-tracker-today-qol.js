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

function selectedTypesFor(card, types) {
  const available = Array.isArray(types) ? types : [];
  const previousAvailable = Array.isArray(card.__todayCareAvailableTypes)
    ? card.__todayCareAvailableTypes
    : [];
  let selected = card.__todayCareTypeFilters instanceof Set
    ? new Set(card.__todayCareTypeFilters)
    : new Set(available);

  const previouslyAllSelected = previousAvailable.length > 0
    && previousAvailable.every((type) => selected.has(type));
  selected = new Set([...selected].filter((type) => available.includes(type)));

  if (!previousAvailable.length || previouslyAllSelected) {
    for (const type of available) selected.add(type);
  }
  if (!selected.size && available.length) selected = new Set(available);

  card.__todayCareTypeFilters = selected;
  card.__todayCareAvailableTypes = [...available];
  return selected;
}

function toggleType(card, type, types) {
  const selected = selectedTypesFor(card, types);
  if (type === "__all__") {
    card.__todayCareTypeFilters = new Set(types);
  } else if (selected.has(type)) {
    if (selected.size > 1) selected.delete(type);
    card.__todayCareTypeFilters = selected;
  } else {
    selected.add(type);
    card.__todayCareTypeFilters = selected;
  }
  card.__todayCareAvailableTypes = [...types];
  card._render();
}

function decorateRows(card) {
  const root = card?.shadowRoot;
  const rows = Array.from(root?.querySelectorAll(".care-summary .care-row[data-care-occurrence]") || []);
  for (const row of rows) {
    const item = (card.__careOccurrences || []).find(
      (candidate) => String(candidate?.id || "") === String(row.dataset.careOccurrence || ""),
    );
    row.dataset.todayCareType = String(item?.record_type || "care");
  }
  return rows;
}

function renderQol(card) {
  const root = card?.shadowRoot;
  if (!root) return;
  const summary = root.querySelector(".care-summary");
  if (!summary) return;

  summary.querySelector(".today-care-qol-controls")?.remove();
  summary.querySelector(".today-care-empty")?.remove();

  const rows = decorateRows(card);
  if (!rows.length) return;

  const types = [...new Set(rows.map((row) => row.dataset.todayCareType).filter(Boolean))]
    .sort((a, b) => typeLabel(card, a).localeCompare(typeLabel(card, b)));
  const selectedTypes = selectedTypesFor(card, types);
  const allSelected = selectedTypes.size === types.length;

  const controls = document.createElement("div");
  controls.className = "today-care-qol-controls";
  controls.innerHTML = `<style>
    .today-care-qol-controls{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:0 0 9px}.today-care-filter-label{font-size:.78rem;color:var(--secondary-text-color);font-weight:600}.today-care-type-filters{display:flex;flex-wrap:wrap;gap:6px}.today-care-type-chip{display:inline-flex;align-items:center;border:1px solid var(--divider-color);border-radius:999px;background:transparent;color:var(--primary-text-color);padding:6px 9px;cursor:pointer;font:inherit;font-size:.82rem}.today-care-type-chip.active{background:var(--primary-color);color:var(--text-primary-color,#fff);border-color:var(--primary-color)}.care-list>.care-row[hidden]{display:none!important}.today-care-empty{font-size:.82rem;color:var(--secondary-text-color);padding:8px 2px}
  </style><span class="today-care-filter-label">${escapeHtml(t(card, "Type", "Type"))}</span><div class="today-care-type-filters"><button type="button" class="today-care-type-chip ${allSelected ? "active" : ""}" data-today-care-filter-type="__all__">${escapeHtml(t(card, "Alles", "All"))}</button>${types.map((value) => `<button type="button" class="today-care-type-chip ${selectedTypes.has(value) ? "active" : ""}" data-today-care-filter-type="${escapeHtml(value)}">${escapeHtml(typeLabel(card, value))}</button>`).join("")}</div>`;

  const title = summary.querySelector(".care-title");
  if (title) title.insertAdjacentElement("afterend", controls);
  else summary.prepend(controls);

  let visibleCount = 0;
  for (const row of rows) {
    const visible = selectedTypes.has(row.dataset.todayCareType);
    row.hidden = !visible;
    if (visible) visibleCount += 1;
  }

  if (!visibleCount) {
    const empty = document.createElement("div");
    empty.className = "today-care-empty";
    empty.textContent = t(card, "Geen zorgacties voor de geselecteerde types.", "No care actions for the selected types.");
    summary.querySelector(".care-list")?.insertAdjacentElement("beforebegin", empty);
  }

  controls.querySelectorAll("[data-today-care-filter-type]").forEach((button) => {
    button.addEventListener("click", () => toggleType(card, button.dataset.todayCareFilterType, types));
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
