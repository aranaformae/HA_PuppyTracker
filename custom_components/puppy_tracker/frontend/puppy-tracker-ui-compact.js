// Compact UI enhancements for Puppy Tracker cards.
// Keeps long histories manageable and moves management controls out of the way
// until the user explicitly asks for them.

const DOSSIER_TAG = "puppy-tracker-dossier-card";
const TIMELINE_TAG = "puppy-tracker-timeline-card";
const OVERVIEW_TAG = "puppy-tracker-overview-card";

function buttonLabel(card, nl, en) {
  const language = String(card?._hass?.language || card?._hass?.locale?.language || "nl").toLowerCase();
  return language.startsWith("en") ? en : nl;
}

function ensureStyle(root, id, css) {
  if (!root || root.getElementById(id)) return;
  const style = document.createElement("style");
  style.id = id;
  style.textContent = css;
  root.append(style);
}

function compactDossier(card) {
  const root = card?.shadowRoot;
  if (!root) return;

  ensureStyle(root, "puppy-tracker-dossier-compact-style", `
    .timeline[hidden],.record-actions[hidden]{display:none!important}
    .timeline-card-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end}
    .timeline-card-actions .manage-items-button{min-height:40px;padding:0 14px;border:1px solid var(--primary-color);border-radius:10px;background:var(--primary-color);color:var(--text-primary-color,#fff);font-weight:650;box-shadow:var(--ha-card-box-shadow,none)}
    .timeline-card-actions .manage-items-button.active{background:var(--primary-color);border-color:var(--primary-color);color:var(--text-primary-color,#fff)}
    .dossier-timeline-toggle-footer{padding:8px 0 0}
    .dossier-timeline-toggle-footer button{width:100%;min-height:48px;border:0;border-radius:12px;background:var(--primary-color);color:var(--text-primary-color,#fff);font:inherit;font-weight:650;display:flex;align-items:center;justify-content:center;gap:8px;cursor:pointer}
    .dossier-timeline-toggle-footer button.secondary{background:var(--secondary-background-color);color:var(--primary-text-color);border:1px solid var(--divider-color)}
  `);

  const timeline = root.querySelector(".timeline");
  const head = root.querySelector(".timeline-head");
  const cardElement = root.querySelector("ha-card");
  if (typeof card.__timelineItemsVisible !== "boolean") {
    card.__timelineItemsVisible = card._config?.show_timeline_items === true;
  }
  if (typeof card.__dossierManageMode !== "boolean") card.__dossierManageMode = false;

  // Keep item management reachable even when the active owner/filter has no records.
  const managementHost = root.querySelector(".tools") || head;
  if (managementHost && card._canManage) {
    let manageToggle = root.getElementById("toggle-dossier-manage");
    if (!manageToggle) {
      manageToggle = document.createElement("button");
      manageToggle.id = "toggle-dossier-manage";
      manageToggle.type = "button";
      manageToggle.className = "manage-items-button";
      managementHost.append(manageToggle);
    }
    manageToggle.textContent = card.__dossierManageMode
      ? buttonLabel(card, "Bewerken klaar", "Done editing")
      : buttonLabel(card, "Items aanpassen", "Edit items");
    manageToggle.classList.toggle("active", card.__dossierManageMode);
    manageToggle.setAttribute("aria-pressed", card.__dossierManageMode ? "true" : "false");
    manageToggle.onclick = () => {
      card.__dossierManageMode = !card.__dossierManageMode;
      if (card.__dossierManageMode) card.__timelineItemsVisible = true;
      compactDossier(card);
    };
  }

  if (head && cardElement) {
    if (timeline) timeline.hidden = !card.__timelineItemsVisible;
    root.querySelector(".timeline-card-actions")?.remove();
    let footer = root.querySelector(".dossier-timeline-toggle-footer");
    if (!footer) {
      footer = document.createElement("div");
      footer.className = "dossier-timeline-toggle-footer";
      cardElement.append(footer);
    }
    let toggle = root.getElementById("toggle-timeline-items");
    if (!toggle) {
      toggle = document.createElement("button");
      toggle.id = "toggle-timeline-items";
      toggle.type = "button";
      footer.append(toggle);
    }
    const count = dossierVisibleRecordCount(card, timeline);
    toggle.classList.toggle("secondary", card.__timelineItemsVisible);
    toggle.innerHTML = card.__timelineItemsVisible
      ? `<ha-icon icon="mdi:chevron-up"></ha-icon><span>${buttonLabel(card, "Verberg tijdlijnitems", "Hide timeline items")}</span>`
      : `<ha-icon icon="mdi:chevron-down"></ha-icon><span>${buttonLabel(card, `Toon tijdlijnitems (${count})`, `Show timeline items (${count})`)}</span>`;
    toggle.setAttribute("aria-expanded", card.__timelineItemsVisible ? "true" : "false");
    toggle.onclick = () => {
      card.__timelineItemsVisible = !card.__timelineItemsVisible;
      compactDossier(card);
    };
  }

  root.querySelectorAll(".record").forEach((record) => {
    const actions = record.querySelector(".record-actions");
    if (!actions) return;
    actions.hidden = !card.__dossierManageMode;
    record.querySelector(".record-manage-toggle")?.remove();
  });
}

function dossierVisibleRecordCount(card, timeline) {
  if (timeline) return timeline.querySelectorAll(".record").length;
  const records = card?._recordData?.records || [];
  const types = records.map((record) => record?.type || "other");
  const available = [...new Set(types)];
  const selected = typeof card?._selectedCategoryFilters === "function"
    ? card._selectedCategoryFilters(available)
    : new Set(available);
  return types.filter((type) => selected.has(type)).length;
}

function compactTimeline(card) {
  const root = card?.shadowRoot;
  if (!root) return;
  const timeline = root.querySelector(".timeline");
  const cardElement = root.querySelector("ha-card");
  if (!timeline || !cardElement) return;

  ensureStyle(root, "puppy-tracker-timeline-compact-style", `
    .timeline[hidden]{display:none!important}
    .timeline-scroll{max-height:520px;overflow-y:auto;overscroll-behavior:contain;scrollbar-gutter:stable}
    .timeline-toggle-footer{padding:0 20px 18px}
    .timeline-toggle-footer button{width:100%;min-height:48px;border:0;border-radius:12px;background:var(--primary-color);color:var(--text-primary-color,#fff);font:inherit;font-weight:650;display:flex;align-items:center;justify-content:center;gap:8px;cursor:pointer}
    .timeline-toggle-footer button.secondary{background:var(--secondary-background-color);color:var(--primary-text-color);border:1px solid var(--divider-color)}
  `);

  if (typeof card.__timelineItemsVisible !== "boolean") {
    card.__timelineItemsVisible = card._config?.show_timeline_items === true;
  }
  timeline.hidden = !card.__timelineItemsVisible;
  timeline.classList.toggle("timeline-scroll", card.__timelineItemsVisible);

  let footer = root.querySelector(".timeline-toggle-footer");
  if (!footer) {
    footer = document.createElement("div");
    footer.className = "timeline-toggle-footer";
    cardElement.append(footer);
  }

  let toggle = root.getElementById("toggle-timeline-items");
  if (!toggle) {
    toggle = document.createElement("button");
    toggle.id = "toggle-timeline-items";
    toggle.type = "button";
    footer.append(toggle);
  }

  const count = timeline.querySelectorAll(".timeline-item").length;
  toggle.classList.toggle("secondary", card.__timelineItemsVisible);
  toggle.innerHTML = card.__timelineItemsVisible
    ? `<ha-icon icon="mdi:chevron-up"></ha-icon><span>${buttonLabel(card, "Verberg tijdlijnitems", "Hide timeline items")}</span>`
    : `<ha-icon icon="mdi:chevron-down"></ha-icon><span>${buttonLabel(card, `Toon tijdlijnitems (${count})`, `Show timeline items (${count})`)}</span>`;
  toggle.setAttribute("aria-expanded", card.__timelineItemsVisible ? "true" : "false");
  toggle.onclick = () => {
    card.__timelineItemsVisible = !card.__timelineItemsVisible;
    compactTimeline(card);
  };
}

function moveOverviewChart(card) {
  const root = card?.shadowRoot;
  if (!root) return;
  const summary = root.querySelector(".summary-grid");
  const chart = root.querySelector(".chart-panel");
  if (!chart) return;

  if (summary) {
    summary.after(chart);
    return;
  }

  const ranges = root.querySelector(".range-tabs");
  if (ranges) ranges.after(chart);
}

function patch(tag, enhancer, marker) {
  const Card = customElements.get(tag);
  if (!Card || Card.prototype[marker]) return;
  const originalRender = Card.prototype._render;
  if (typeof originalRender !== "function") return;

  Card.prototype._render = function (...args) {
    const result = originalRender.apply(this, args);
    enhancer(this);
    return result;
  };
  Card.prototype[marker] = true;
}

function patchWhenReady(tag, enhancer, marker) {
  if (customElements.get(tag)) patch(tag, enhancer, marker);
  else customElements.whenDefined(tag).then(() => patch(tag, enhancer, marker));
}

patchWhenReady(DOSSIER_TAG, compactDossier, "__puppyTrackerCompactDossierPatched");
patchWhenReady(TIMELINE_TAG, compactTimeline, "__puppyTrackerCompactTimelinePatched");
patchWhenReady(OVERVIEW_TAG, moveOverviewChart, "__puppyTrackerOverviewLayoutPatched");
