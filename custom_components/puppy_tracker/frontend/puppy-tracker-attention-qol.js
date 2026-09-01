import { escapeHtml, languageForHass } from "./puppy-tracker-card-common.js";

const TAG = "puppy-tracker-attention-card";

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

function baseAttentionMeta(card) {
  const result = [];
  for (const puppy of (card?._data?.puppies || []).filter((item) => item.active !== false)) {
    const summary = puppy.summary || {};
    if (summary.needs_attention) {
      result.push({
        id: `weight:${puppy.id}:${summary.status_code || "unknown"}:${summary.latest_measurement_id || "none"}`,
        type: "weight",
      });
    }
    for (const action of summary.dossier_actions?.actions || []) {
      if (!action.due_soon) continue;
      result.push({
        id: `dossier:${action.id || `${action.source_record_id || action.record_id || "unknown"}:${action.due_field || "due"}`}`,
        type: String(action.record_type || action.type || action.category || "dossier"),
      });
    }
  }
  for (const action of card?._data?.litter?.summary?.dossier_actions?.actions || []) {
    if (!action.due_soon) continue;
    result.push({
      id: `dossier:${action.id || `${action.source_record_id || action.record_id || "unknown"}:${action.due_field || "due"}`}`,
      type: String(action.record_type || action.type || action.category || "dossier"),
    });
  }
  return result;
}

function decorateRows(card) {
  const root = card?.shadowRoot;
  const list = root?.querySelector(".list");
  if (!list) return [];
  const rows = Array.from(list.querySelectorAll(":scope > .row"));
  const base = baseAttentionMeta(card);
  let baseIndex = 0;

  for (const row of rows) {
    let id = "";
    let type = "";
    const recurringId = row.dataset.recurringReminder;
    const careId = row.dataset.careOccurrence;
    if (recurringId) {
      const item = (card.__recurringReminders || []).find((candidate) => String(candidate?.id) === recurringId);
      id = `recurring:${recurringId}:${item?.next_due_at || item?.due_at || "unknown"}`;
      type = String(item?.record_type || "reminder");
    } else if (careId) {
      const item = (card.__careOccurrences || []).find((candidate) => String(candidate?.id) === careId);
      id = `care:${careId}`;
      type = String(item?.record_type || "care");
    } else {
      const item = base[baseIndex++];
      id = item?.id || `unknown:${baseIndex}`;
      type = item?.type || "other";
    }
    row.dataset.attentionId = id;
    row.dataset.attentionType = type;
  }
  return rows;
}

function selectedTypesFor(card, types) {
  const available = Array.isArray(types) ? types : [];
  const previousAvailable = Array.isArray(card.__attentionAvailableTypes)
    ? card.__attentionAvailableTypes
    : [];
  let selected = card.__attentionTypeFilters instanceof Set
    ? new Set(card.__attentionTypeFilters)
    : null;

  if (!selected) {
    const legacy = String(card.__attentionTypeFilter || "all");
    selected = legacy !== "all" && available.includes(legacy)
      ? new Set([legacy])
      : new Set(available);
  }

  const previouslyAllSelected = previousAvailable.length > 0
    && previousAvailable.every((type) => selected.has(type));
  selected = new Set([...selected].filter((type) => available.includes(type)));

  if (!previousAvailable.length || previouslyAllSelected) {
    for (const type of available) selected.add(type);
  }
  if (!selected.size && available.length) selected = new Set(available);

  card.__attentionTypeFilters = selected;
  card.__attentionAvailableTypes = [...available];
  delete card.__attentionTypeFilter;
  return selected;
}

function toggleType(card, type, types) {
  const selected = selectedTypesFor(card, types);
  if (type === "__all__") {
    card.__attentionTypeFilters = new Set(types);
  } else if (selected.has(type)) {
    if (selected.size > 1) selected.delete(type);
    card.__attentionTypeFilters = selected;
  } else {
    selected.add(type);
    card.__attentionTypeFilters = selected;
  }
  card.__attentionAvailableTypes = [...types];
  card._render();
}

async function loadAcknowledgements(card) {
  if (!card?._hass || !card?._selectedLitterId) {
    card.__attentionAcknowledgements = {};
    return;
  }
  try {
    const response = await card._hass.callWS({
      type: "puppy_tracker/attention_acknowledgements",
      litter_id: card._selectedLitterId,
    });
    card.__attentionAcknowledgements = response?.acknowledgements || {};
    card.__attentionAckError = "";
  } catch (error) {
    card.__attentionAcknowledgements = card.__attentionAcknowledgements || {};
    card.__attentionAckError = error?.message || t(card, "Bevestigingen konden niet worden geladen.", "Acknowledgements could not be loaded.");
  }
}

async function setAcknowledged(card, attentionId, acknowledged) {
  await card._hass.callWS({
    type: "puppy_tracker/attention_acknowledgement/set",
    litter_id: card._selectedLitterId,
    attention_id: attentionId,
    acknowledged: Boolean(acknowledged),
  });
  const next = { ...(card.__attentionAcknowledgements || {}) };
  if (acknowledged) next[attentionId] = { acknowledged_at: new Date().toISOString() };
  else delete next[attentionId];
  card.__attentionAcknowledgements = next;
  card.__attentionAckError = "";
}

function renderQol(card) {
  const root = card?.shadowRoot;
  if (!root) return;
  root.querySelector(".attention-qol-controls")?.remove();
  root.querySelector(".attention-acknowledged")?.remove();
  root.querySelector(".attention-empty-open")?.remove();
  root.querySelector(".attention-ack-error")?.remove();

  const rows = decorateRows(card);
  if (!rows.length) return;
  root.querySelector(".all-ok")?.remove();

  const types = [...new Set(rows.map((row) => row.dataset.attentionType).filter(Boolean))]
    .sort((a, b) => typeLabel(card, a).localeCompare(typeLabel(card, b)));
  const selectedTypes = selectedTypesFor(card, types);
  const allSelected = selectedTypes.size === types.length;

  const controls = document.createElement("div");
  controls.className = "attention-qol-controls";
  controls.innerHTML = `<style>
    .attention-qol-controls{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:0 0 10px}.attention-filter-label{font-size:.78rem;color:var(--secondary-text-color);font-weight:600}.attention-type-filters{display:flex;flex-wrap:wrap;gap:6px}.attention-type-chip{display:inline-flex;align-items:center;border:1px solid var(--divider-color);border-radius:999px;background:transparent;color:var(--primary-text-color);padding:6px 9px;cursor:pointer;font:inherit;font-size:.82rem}.attention-type-chip.active{background:var(--primary-color);color:var(--text-primary-color,#fff);border-color:var(--primary-color)}.attention-filter-hidden{display:none!important}.attention-ack-button{display:grid;place-items:center;width:30px;height:30px;border:0;border-radius:9px;background:var(--secondary-background-color);color:var(--secondary-text-color);cursor:pointer}.attention-ack-button:hover{color:var(--primary-color)}.attention-ack-button ha-icon{--mdc-icon-size:18px}.list>.row{grid-template-columns:34px minmax(0,1fr) auto 32px}.attention-acknowledged{margin-top:10px;border-top:1px solid var(--divider-color);padding-top:8px}.attention-acknowledged summary{cursor:pointer;font-size:.85rem;font-weight:600;color:var(--secondary-text-color);padding:5px 2px}.attention-ack-list{display:grid;gap:8px;margin-top:6px}.attention-ack-list .row{grid-template-columns:34px minmax(0,1fr) auto 32px;opacity:.72}.attention-empty-open{font-size:.82rem;color:var(--secondary-text-color);padding:8px 2px}.attention-ack-error{font-size:.8rem;color:var(--error-color);margin:6px 0}@container attention-card (max-width:520px){.list>.row,.attention-ack-list .row{grid-template-columns:34px minmax(0,1fr) 32px}.list>.row>.status,.attention-ack-list .row>.status{display:none}.attention-qol-controls{align-items:flex-start}}
  </style><span class="attention-filter-label">${escapeHtml(t(card, "Type", "Type"))}</span><div class="attention-type-filters"><button type="button" class="attention-type-chip ${allSelected ? "active" : ""}" data-attention-filter-type="__all__">${escapeHtml(t(card, "Alles", "All"))}</button>${types.map((value) => `<button type="button" class="attention-type-chip ${selectedTypes.has(value) ? "active" : ""}" data-attention-filter-type="${escapeHtml(value)}">${escapeHtml(typeLabel(card, value))}</button>`).join("")}</div>`;
  const top = root.querySelector(".top");
  top?.insertAdjacentElement("afterend", controls);

  const list = root.querySelector(".list");
  const ackDetails = document.createElement("details");
  ackDetails.className = "attention-acknowledged";
  const ackList = document.createElement("div");
  ackList.className = "attention-ack-list";
  ackDetails.append(ackList);

  let openCount = 0;
  let ackCount = 0;
  const acknowledgements = card.__attentionAcknowledgements || {};
  for (const row of rows) {
    const matches = selectedTypes.has(row.dataset.attentionType);
    row.hidden = !matches;
    row.classList.toggle("attention-filter-hidden", !matches);
    if (!matches) continue;
    const attentionId = row.dataset.attentionId;
    const acknowledged = Boolean(acknowledgements[attentionId]);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "attention-ack-button";
    button.title = acknowledged
      ? t(card, "Markeer als niet bevestigd", "Unacknowledge")
      : t(card, "Bevestig melding", "Acknowledge");
    button.setAttribute("aria-label", button.title);
    button.innerHTML = `<ha-icon icon="${acknowledged ? "mdi:undo-variant" : "mdi:check"}"></ha-icon>`;
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      button.disabled = true;
      try {
        await setAcknowledged(card, attentionId, !acknowledged);
        card._render();
      } catch (error) {
        card.__attentionAckError = error?.message || t(card, "Bevestiging kon niet worden opgeslagen.", "Acknowledgement could not be saved.");
        card._render();
      }
    });
    row.querySelector(".attention-ack-button")?.remove();
    row.append(button);
    if (acknowledged) {
      ackCount += 1;
      ackList.append(row);
    } else {
      openCount += 1;
      list?.append(row);
    }
  }

  if (openCount === 0) {
    const empty = document.createElement("div");
    empty.className = "attention-empty-open";
    empty.textContent = ackCount
      ? t(card, "Geen onbevestigde meldingen voor de geselecteerde types.", "No unacknowledged alerts for the selected types.")
      : t(card, "Geen meldingen voor de geselecteerde types.", "No alerts for the selected types.");
    list?.insertAdjacentElement("afterend", empty);
  }
  if (ackCount) {
    const summary = document.createElement("summary");
    summary.textContent = `${t(card, "Bevestigd", "Acknowledged")} (${ackCount})`;
    ackDetails.prepend(summary);
    (list || controls).insertAdjacentElement("afterend", ackDetails);
  }
  if (card.__attentionAckError) {
    const error = document.createElement("div");
    error.className = "attention-ack-error";
    error.textContent = card.__attentionAckError;
    controls.insertAdjacentElement("afterend", error);
  }

  controls.querySelectorAll("[data-attention-filter-type]").forEach((button) => {
    button.addEventListener("click", () => toggleType(card, button.dataset.attentionFilterType, types));
  });
}

function patch() {
  const Card = customElements.get(TAG);
  const proto = Card?.prototype;
  if (!proto || proto.__puppyTrackerAttentionQolPatched) return;
  const originalLoadData = proto._loadData;
  const originalRender = proto._render;

  proto._loadData = async function (render = true) {
    await originalLoadData.call(this, false);
    await loadAcknowledgements(this);
    if (render) this._render();
  };
  proto._render = function (...args) {
    const result = originalRender.apply(this, args);
    renderQol(this);
    return result;
  };
  proto.__puppyTrackerAttentionQolPatched = true;
}

if (customElements.get(TAG)) patch();
else customElements.whenDefined(TAG).then(patch);
