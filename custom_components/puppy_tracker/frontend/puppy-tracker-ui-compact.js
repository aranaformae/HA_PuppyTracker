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

function compactDossier(card) {
  const root = card?.shadowRoot;
  if (!root) return;

  const timeline = root.querySelector(".timeline");
  const head = root.querySelector(".timeline-head");
  if (timeline && head) {
    if (typeof card.__timelineItemsVisible !== "boolean") card.__timelineItemsVisible = false;
    timeline.hidden = !card.__timelineItemsVisible;

    let toggle = root.getElementById("toggle-timeline-items");
    if (!toggle) {
      toggle = document.createElement("button");
      toggle.id = "toggle-timeline-items";
      toggle.className = "text-button timeline-visibility-toggle";
      head.append(toggle);
    }
    const count = timeline.querySelectorAll(".record").length;
    toggle.textContent = card.__timelineItemsVisible
      ? buttonLabel(card, "Verberg tijdlijnitems", "Hide timeline items")
      : buttonLabel(card, `Toon tijdlijnitems (${count})`, `Show timeline items (${count})`);
    toggle.setAttribute("aria-expanded", card.__timelineItemsVisible ? "true" : "false");
    toggle.onclick = () => {
      card.__timelineItemsVisible = !card.__timelineItemsVisible;
      compactDossier(card);
    };
  }

  root.querySelectorAll(".record").forEach((record) => {
    const actions = record.querySelector(".record-actions");
    if (!actions) return;

    actions.hidden = !record.classList.contains("manage-open");
    let toggle = record.querySelector(".record-manage-toggle");
    if (!toggle) {
      toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "text-button record-manage-toggle";
      toggle.innerHTML = '<ha-icon icon="mdi:pencil-outline"></ha-icon>';
      const top = record.querySelector(".record-top");
      if (top) top.append(toggle);
      else record.querySelector(".record-body")?.prepend(toggle);
    }

    const open = record.classList.contains("manage-open");
    toggle.title = open
      ? buttonLabel(card, "Bewerken sluiten", "Close editing")
      : buttonLabel(card, "Dossieritem bewerken", "Edit dossier item");
    toggle.setAttribute("aria-label", toggle.title);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.onclick = (event) => {
      event.stopPropagation();
      record.classList.toggle("manage-open");
      compactDossier(card);
    };
  });
}

function compactTimeline(card) {
  const root = card?.shadowRoot;
  if (!root) return;
  const timeline = root.querySelector(".timeline");
  const header = root.querySelector(".card-header");
  if (!timeline || !header) return;

  if (typeof card.__timelineItemsVisible !== "boolean") card.__timelineItemsVisible = false;
  timeline.hidden = !card.__timelineItemsVisible;

  let toggle = root.getElementById("toggle-timeline-items");
  if (!toggle) {
    toggle = document.createElement("button");
    toggle.id = "toggle-timeline-items";
    toggle.type = "button";
    toggle.style.minHeight = "34px";
    toggle.style.padding = "5px 10px";
    toggle.style.border = "1px solid var(--divider-color)";
    toggle.style.borderRadius = "9px";
    toggle.style.background = "transparent";
    toggle.style.color = "var(--primary-text-color)";
    toggle.style.cursor = "pointer";
    const count = header.querySelector(".count");
    if (count) count.after(toggle);
    else header.append(toggle);
  }

  toggle.textContent = card.__timelineItemsVisible
    ? buttonLabel(card, "Verberg items", "Hide items")
    : buttonLabel(card, "Toon items", "Show items");
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
