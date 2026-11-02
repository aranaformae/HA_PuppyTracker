import { PLACEMENT_STATUS_LABELS, detail, optionLabel, text } from "./puppy-tracker-owner-common.js";
import { matchesPlacementFilter, ownerForLitter, placementFilterControl } from "./puppy-tracker-owner-placements.js";
import { puppySelectorLabel, escapeHtml } from "./puppy-tracker-card-common.js";
import { collarColor } from "./puppy-tracker-collar-chart-colors.js";

/** Owner preferences operations; canonical state and lifecycle belong to the card. */

export function puppyPreferenceLabel(card, puppyId, includeCollar = true) {
    const puppy = card._puppies.find((item) => item.id === puppyId);
    if (!puppy) return text(card, "unavailablePuppy");
    return [puppy.litter_name, includeCollar ? puppySelectorLabel(puppy, text(card, "puppy")) : puppy.name || text(card, "puppy")].filter(Boolean).join(" · ");
}

export function puppyPreferenceOptions(card, selectedId) {
    const puppies = card._puppies.filter((puppy) => !card._editingLitter || puppy.litter_id === card._editingLitter).sort((left, right) =>
      `${left.litter_name || ""}\u0000${left.name || ""}`.localeCompare(`${right.litter_name || ""}\u0000${right.name || ""}`),
    );
    const options = puppies.map((puppy) => `<option value="${escapeHtml(puppy.id)}" ${puppy.id === selectedId ? "selected" : ""}>${escapeHtml([puppy.litter_name, puppySelectorLabel(puppy, text(card, "puppy"))].filter(Boolean).join(" · "))}</option>`);
    if (selectedId && !puppies.some((puppy) => puppy.id === selectedId)) {
      options.unshift(`<option value="${escapeHtml(selectedId)}" selected>${escapeHtml(text(card, "unavailablePuppy"))}</option>`);
    }
    options.unshift(`<option value="">${escapeHtml(text(card, "noPuppyPreference"))}</option>`);
    return options.join("");
}

export function puppyPreferenceFields(card, owner) {
    const preferences = Array.isArray(owner.puppy_preferences) ? owner.puppy_preferences.slice(0, 3) : [];
    return `<div class="preferences wide">${[0, 1, 2].map((index) => {
      const preference = preferences[index] || {};
      const rank = index + 1;
      return `<fieldset class="preference-row"><legend>${escapeHtml(text(card, `preference${rank}`))}</legend><label><span>${escapeHtml(text(card, "puppy"))}</span><select name="preference_puppy_${rank}">${puppyPreferenceOptions(card, preference.puppy_id || "")}</select></label><label><span>${escapeHtml(text(card, "preferenceNote"))}</span><input name="preference_note_${rank}" maxlength="240" value="${escapeHtml(preference.note || "")}"></label></fieldset>`;
    }).join("")}</div>`;
}

export function puppyPreferenceDetails(card, owner) {
    const preferences = Array.isArray(owner.puppy_preferences) ? owner.puppy_preferences.slice(0, 3) : [];
    if (!preferences.length) {
      return detail(card, text(card, "puppyPreferences"), text(card, "noPuppyPreferences"), "wide");
    }
    return preferences.map((preference, index) => {
      const note = preference.note ? `\n${text(card, "preferenceNote")}: ${preference.note}` : "";
      return detail(card, text(card, `preference${index + 1}`), `${puppyPreferenceLabel(card, preference.puppy_id)}${note}`, "wide preformatted");
    }).join("");
}

export function rankLabel(card, rank, compact = false) {
    if (![1, 2, 3].includes(rank)) return "—";
    return text(card, compact ? ["firstShort", "secondShort", "thirdShort"][rank - 1] : `preference${rank}`);
}

export function matrixModel(card) {
    const allPuppies = card._puppies.filter((puppy) => puppy.litter_id === card._selectedLitter);
    const puppyIds = new Set(allPuppies.map((puppy) => puppy.id));
    const preferencesByOwner = new Map();
    const linksByOwner = new Map();

    const owners = card._owners.map((owner) => ownerForLitter(card, owner, card._selectedLitter)).filter((owner) => {
      const allPreferences = Array.isArray(owner.puppy_preferences) ? owner.puppy_preferences : [];
      const preferences = new Map();
      allPreferences.slice(0, 3).forEach((preference, index) => {
        if (puppyIds.has(preference?.puppy_id)) {
          preferences.set(preference.puppy_id, { rank: index + 1, note: preference.note || "" });
        }
      });
      const linkedPuppyIds = new Set(
        allPuppies
          .filter((puppy) => (puppy.owner_ids || []).includes(owner.id))
          .map((puppy) => puppy.id),
      );
      const belongsInLitter = Boolean(owner.placements?.[card._selectedLitter]) || linkedPuppyIds.size > 0;
      if (!belongsInLitter) return false;
      if (!matchesPlacementFilter(card, owner)) return false;
      preferencesByOwner.set(owner.id, preferences);
      linksByOwner.set(owner.id, linkedPuppyIds);
      return true;
    }).sort((left, right) => String(left.name || "").localeCompare(String(right.name || "")));

    const rankCounts = new Map(allPuppies.map((puppy) => [puppy.id, [0, 0, 0]]));
    for (const owner of owners) {
      for (const [puppyId, preference] of preferencesByOwner.get(owner.id) || []) {
        rankCounts.get(puppyId)[preference.rank - 1] += 1;
      }
    }
    const conflictPuppyIds = new Set(
      allPuppies
        .filter((puppy) => (rankCounts.get(puppy.id)?.[0] || 0) > 1)
        .map((puppy) => puppy.id),
    );
    const puppiesWithoutPreferences = allPuppies.filter((puppy) =>
      (rankCounts.get(puppy.id) || []).every((count) => count === 0),
    ).length;
    const ownersWithoutPreferences = owners.filter((owner) =>
      (preferencesByOwner.get(owner.id)?.size || 0) === 0,
    ).length;
    const linkedMatches = owners.reduce(
      (total, owner) => total + (linksByOwner.get(owner.id)?.size || 0),
      0,
    );

    const puppies = card._matrixOnlyConflicts
      ? allPuppies.filter((puppy) => conflictPuppyIds.has(puppy.id))
      : allPuppies;
    const visiblePuppyIds = new Set(puppies.map((puppy) => puppy.id));
    const visibleOwners = card._matrixOnlyConflicts
      ? owners.filter((owner) => {
        const preferences = preferencesByOwner.get(owner.id) || new Map();
        const links = linksByOwner.get(owner.id) || new Set();
        return [...visiblePuppyIds].some((puppyId) => preferences.has(puppyId) || links.has(puppyId));
      })
      : owners;

    if (!puppies.some((puppy) => puppy.id === card._matrixSelectedPuppy)) {
      card._matrixSelectedPuppy = puppies[0]?.id || "";
    }
    if (!visibleOwners.some((owner) => owner.id === card._matrixSelectedOwner)) {
      card._matrixSelectedOwner = visibleOwners[0]?.id || "";
    }
    if (card._matrixSelection) {
      const selectionVisible = visibleOwners.some((owner) => owner.id === card._matrixSelection.ownerId)
        && puppies.some((puppy) => puppy.id === card._matrixSelection.puppyId);
      if (!selectionVisible) card._matrixSelection = null;
    }

    return {
      allPuppies,
      puppies,
      owners: visibleOwners,
      preferencesByOwner,
      linksByOwner,
      rankCounts,
      conflictPuppyIds,
      stats: {
        conflicts: conflictPuppyIds.size,
        puppiesWithoutPreferences,
        ownersWithoutPreferences,
        linkedMatches,
      },
    };
}

export function matrixPuppyHeader(card, puppy, index) {
    const colorName = puppy.collar_color || text(card, "noCollarColor");
    const color = collarColor(puppy.collar_color, index);
    return `<div class="matrix-puppy"><span class="collar-swatch" style="--collar-color:${escapeHtml(color)}" title="${escapeHtml(`${text(card, "puppyCollarColor")}: ${colorName}`)}" aria-hidden="true"></span><span><strong>${escapeHtml(puppySelectorLabel(puppy, text(card, "puppy")))}</strong></span></div>`;
}

export function matrixCell(card, owner, puppy, model) {
    const preference = model.preferencesByOwner.get(owner.id)?.get(puppy.id);
    const linked = model.linksByOwner.get(owner.id)?.has(puppy.id) || false;
    if (!preference && !linked) return `<td class="matrix-empty" aria-label="${escapeHtml(text(card, "noPuppyPreference"))}">—</td>`;
    const conflict = preference?.rank === 1 && model.conflictPuppyIds.has(puppy.id);
    const selected = card._matrixSelection?.ownerId === owner.id && card._matrixSelection?.puppyId === puppy.id;
    const description = [
      preference ? rankLabel(card, preference.rank) : null,
      linked ? text(card, "linkedStatus") : null,
      conflict ? text(card, "firstChoiceConflicts") : null,
      preference?.note || null,
    ].filter(Boolean).join(" · ");
    return `<td><button type="button" class="matrix-cell${conflict ? " conflict" : ""}${selected ? " selected" : ""}" data-matrix-owner="${escapeHtml(owner.id)}" data-matrix-puppy="${escapeHtml(puppy.id)}" aria-pressed="${selected}" aria-label="${escapeHtml(`${owner.name} · ${puppySelectorLabel(puppy, text(card, "puppy"))} · ${description}`)}" title="${escapeHtml(description)}">${preference ? `<span class="rank rank-${preference.rank}">${escapeHtml(rankLabel(card, preference.rank, true))}</span>` : ""}${preference?.note ? `<ha-icon class="cell-icon" icon="mdi:note-text-outline" aria-hidden="true"></ha-icon>` : ""}${linked ? `<ha-icon class="cell-icon linked-icon" icon="mdi:link-variant" aria-hidden="true"></ha-icon>` : ""}${conflict ? `<ha-icon class="cell-icon conflict-icon" icon="mdi:alert-circle-outline" aria-hidden="true"></ha-icon>` : ""}</button></td>`;
}

export function matrixSummary(card, model) {
    const items = [
      [model.stats.conflicts, "firstChoiceConflicts"],
      [model.stats.puppiesWithoutPreferences, "puppiesWithoutPreferences"],
      [model.stats.ownersWithoutPreferences, "ownersWithoutPreferences"],
      [model.stats.linkedMatches, "linkedMatches"],
    ];
    return `<div class="matrix-summary">${items.map(([value, label]) => `<div><strong>${value}</strong><span>${escapeHtml(text(card, label))}</span></div>`).join("")}</div>`;
}

export function matrixDesktop(card, model) {
    if (!model.puppies.length) {
      return `<div class="matrix-desktop empty matrix-empty-state">${escapeHtml(text(card, card._matrixOnlyConflicts ? "matrixNoConflicts" : "matrixNoPuppies"))}</div>`;
    }
    if (!model.owners.length) {
      return `<div class="matrix-desktop empty matrix-empty-state">${escapeHtml(text(card, "matrixEmpty"))}</div>`;
    }
    return `<div class="matrix-desktop"><div class="matrix-scroll"><table class="preference-matrix"><thead><tr><th scope="col" class="owner-column">${escapeHtml(text(card, "matrixOwner"))}</th>${model.puppies.map((puppy, index) => `<th scope="col">${matrixPuppyHeader(card, puppy, index)}</th>`).join("")}</tr></thead><tbody>${model.owners.map((owner) => `<tr><th scope="row" class="owner-column"><strong>${escapeHtml(owner.name)}</strong><small>${escapeHtml(optionLabel(card, owner.placement_status, PLACEMENT_STATUS_LABELS, "interested"))}</small></th>${model.puppies.map((puppy) => matrixCell(card, owner, puppy, model)).join("")}</tr>`).join("")}</tbody><tfoot><tr><th scope="row" class="owner-column">${escapeHtml(text(card, "matrixTotals"))}</th>${model.puppies.map((puppy) => { const counts = model.rankCounts.get(puppy.id) || [0, 0, 0]; return `<td><span class="rank-totals"><b>${escapeHtml(text(card, "firstShort"))}</b> ${counts[0]} · <b>${escapeHtml(text(card, "secondShort"))}</b> ${counts[1]} · <b>${escapeHtml(text(card, "thirdShort"))}</b> ${counts[2]}</span></td>`; }).join("")}</tr></tfoot></table></div></div>`;
}

export function matrixMobile(card, model) {
    if (!model.puppies.length) {
      return `<div class="matrix-mobile empty matrix-empty-state">${escapeHtml(text(card, card._matrixOnlyConflicts ? "matrixNoConflicts" : "matrixNoPuppies"))}</div>`;
    }
    const perspective = `<div class="matrix-perspective" role="group" aria-label="${escapeHtml(text(card, "matrixView"))}">${["puppy", "owner"].map((mode) => `<button type="button" data-matrix-perspective="${mode}" aria-pressed="${card._matrixPerspective === mode}">${escapeHtml(text(card, mode === "puppy" ? "perPuppy" : "perOwner"))}</button>`).join("")}</div>`;
    if (card._matrixPerspective === "owner") {
      const owner = model.owners.find((item) => item.id === card._matrixSelectedOwner);
      if (!owner) return `<div class="matrix-mobile">${perspective}<div class="empty">${escapeHtml(text(card, "matrixEmpty"))}</div></div>`;
      const matches = model.puppies.map((puppy) => ({
        owner, puppy,
        preference: model.preferencesByOwner.get(owner.id)?.get(puppy.id),
        linked: model.linksByOwner.get(owner.id)?.has(puppy.id) || false,
      })).filter((item) => item.preference || item.linked).sort((left, right) =>
        (left.preference?.rank || 99) - (right.preference?.rank || 99)
        || String(left.puppy.name || "").localeCompare(String(right.puppy.name || "")),
      );
      const options = model.owners.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === owner.id ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("");
      return `<div class="matrix-mobile">${perspective}<label class="mobile-puppy-select"><span>${escapeHtml(text(card, "matrixOwner"))}</span><select id="matrix-owner">${options}</select></label><div class="mobile-matches">${matches.length ? matches.map((match) => matrixMobileMatch(card, match, model)).join("") : `<div class="empty">${escapeHtml(text(card, "noPuppyPreferences"))}</div>`}</div></div>`;
    }
    const puppy = model.puppies.find((item) => item.id === card._matrixSelectedPuppy) || model.puppies[0];
    const puppyIndex = model.allPuppies.findIndex((item) => item.id === puppy.id);
    const matches = model.owners.map((owner) => ({
      owner,
      puppy,
      preference: model.preferencesByOwner.get(owner.id)?.get(puppy.id),
      linked: model.linksByOwner.get(owner.id)?.has(puppy.id) || false,
    })).filter((item) => item.preference || item.linked).sort((left, right) =>
      (left.preference?.rank || 99) - (right.preference?.rank || 99)
      || String(left.owner.name || "").localeCompare(String(right.owner.name || "")),
    );
    const counts = model.rankCounts.get(puppy.id) || [0, 0, 0];
    const options = model.puppies.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === puppy.id ? "selected" : ""}>${escapeHtml(puppySelectorLabel(item, text(card, "puppy")))}</option>`).join("");
    return `<div class="matrix-mobile">${perspective}<label class="mobile-puppy-select"><span>${escapeHtml(text(card, "puppy"))}</span><select id="matrix-puppy">${options}</select></label><div class="mobile-puppy-head">${matrixPuppyHeader(card, puppy, puppyIndex)}<span>${escapeHtml(text(card, "firstShort"))} ${counts[0]} · ${escapeHtml(text(card, "secondShort"))} ${counts[1]} · ${escapeHtml(text(card, "thirdShort"))} ${counts[2]}</span></div><div class="mobile-matches">${matches.length ? matches.map((match) => matrixMobileMatch(card, match, model)).join("") : `<div class="empty">${escapeHtml(text(card, "noPreferenceForPuppy"))}</div>`}</div></div>`;
}

export function matrixMobileMatch(card, { owner, puppy, preference, linked }, model) {
    const selected = card._matrixSelection?.ownerId === owner.id && card._matrixSelection?.puppyId === puppy.id;
    const conflict = preference?.rank === 1 && model.conflictPuppyIds.has(puppy.id);
    const heading = card._matrixPerspective === "owner"
      ? matrixPuppyHeader(card, puppy, model.allPuppies.findIndex((item) => item.id === puppy.id))
      : `<strong>${escapeHtml(owner.name)}</strong>`;
    const indicators = [
      preference?.note ? ["mdi:note-text-outline", "preferenceNote"] : null,
      linked ? ["mdi:link-variant", "linkedStatus"] : null,
      conflict ? ["mdi:alert-circle-outline", "firstChoiceConflicts"] : null,
    ].filter(Boolean).map(([icon, label]) => `<ha-icon icon="${icon}" title="${escapeHtml(text(card, label))}" aria-label="${escapeHtml(text(card, label))}"></ha-icon>`).join("");
    return `<div class="mobile-match-row"><button type="button" class="mobile-match${selected ? " selected" : ""}${conflict ? " conflict" : ""}" data-matrix-owner="${escapeHtml(owner.id)}" data-matrix-puppy="${escapeHtml(puppy.id)}" aria-expanded="${selected}" aria-pressed="${selected}"><span class="mobile-match-rank">${preference ? `<span class="rank rank-${preference.rank}">${preference.rank}</span>` : "—"}</span><span class="mobile-match-main">${heading}<small>${escapeHtml(optionLabel(card, owner.placement_status, PLACEMENT_STATUS_LABELS, "interested"))}</small></span><span class="mobile-match-icons">${indicators}<ha-icon icon="mdi:chevron-down" aria-hidden="true"></ha-icon></span></button><section class="matrix-detail mobile-match-detail" data-detail-owner="${escapeHtml(owner.id)}" data-detail-puppy="${escapeHtml(puppy.id)}" ${selected ? "" : "hidden"}>${selected ? matrixDetailsMarkup(card) : ""}</section></div>`;
}

export function matrixDetailsMarkup(card) {
    if (!card._matrixSelection) return "";
    const contact = card._owners.find((item) => item.id === card._matrixSelection.ownerId);
    const owner = contact ? ownerForLitter(card, contact, card._selectedLitter) : null;
    const puppy = card._puppies.find((item) => item.id === card._matrixSelection.puppyId);
    if (!owner || !puppy) return "";
    const preferences = Array.isArray(owner.puppy_preferences) ? owner.puppy_preferences : [];
    const index = preferences.findIndex((preference) => preference.puppy_id === puppy.id);
    const preference = index >= 0 ? preferences[index] : null;
    const linked = (puppy.owner_ids || []).includes(owner.id);
    const fields = [
      ["preferenceRank", preference ? rankLabel(card, index + 1) : "—"],
      ["placementStatus", optionLabel(card, owner.placement_status, PLACEMENT_STATUS_LABELS, "interested")],
      ["linkedPuppies", text(card, linked ? "linkedStatus" : "notLinkedStatus")],
      ["email", owner.email],
      ["phone", owner.phone],
    ];
    return `<div class="matrix-detail-content"><div><span>${escapeHtml(text(card, "preferenceDetails"))}</span><strong>${escapeHtml(owner.name)} · ${escapeHtml(puppySelectorLabel(puppy, text(card, "puppy")))}</strong></div><dl>${fields.map(([label, value]) => `<div><dt>${escapeHtml(text(card, label))}</dt><dd>${escapeHtml(value || "—")}</dd></div>`).join("")}<div class="detail-note"><dt>${escapeHtml(text(card, "preferenceNote"))}</dt><dd>${escapeHtml(preference?.note || "—")}</dd></div></dl><button type="button" class="secondary" data-matrix-edit-owner="${escapeHtml(owner.id)}"><ha-icon icon="mdi:pencil-outline"></ha-icon>${escapeHtml(text(card, "editFromMatrix"))}</button></div>`;
}

export function renderPreferenceMatrix(card) {
    if (!card._litters.length) return `<section class="matrix-view"><div class="empty matrix-empty-state">${escapeHtml(text(card, card._loading ? "matrixLoading" : "matrixNoLitters"))}</div></section>`;
    const model = matrixModel(card);
    const litterOptions = card._litters.map((litter) => `<option value="${escapeHtml(litter.id)}" ${litter.id === card._selectedLitter ? "selected" : ""}>${escapeHtml(litter.name || text(card, "litter"))}</option>`).join("");
    const details = matrixDetailsMarkup(card);
    return `<section class="matrix-view"><div class="matrix-controls"><label><span>${escapeHtml(text(card, "matrixLitter"))}</span><select id="matrix-litter">${litterOptions}</select></label>${placementFilterControl(card)}<label class="matrix-toggle"><input id="matrix-only-conflicts" type="checkbox" ${card._matrixOnlyConflicts ? "checked" : ""}><span>${escapeHtml(text(card, "onlyConflicts"))}</span></label></div>${model.allPuppies.length ? matrixSummary(card, model) : ""}<div class="matrix-layout">${matrixDesktop(card, model)}${matrixMobile(card, model)}<div class="matrix-detail-region"><section id="matrix-detail" class="matrix-detail" ${details ? "" : "hidden"}>${details}</section></div></div></section>`;
}

export function selectMatrixCell(card, ownerId, puppyId) {
    const selected = card._matrixSelection?.ownerId === ownerId && card._matrixSelection?.puppyId === puppyId;
    card._matrixSelection = selected ? null : { ownerId, puppyId };
    card.querySelectorAll("[data-matrix-owner]").forEach((button) => {
      const active = !selected && button.dataset.matrixOwner === ownerId && button.dataset.matrixPuppy === puppyId;
      button.classList.toggle("selected", active);
      button.setAttribute("aria-pressed", String(active));
    });
    card.querySelectorAll(".mobile-match[data-matrix-owner]").forEach((button) => {
      button.setAttribute("aria-expanded", button.getAttribute("aria-pressed"));
    });
    card.querySelectorAll("#matrix-detail, .mobile-match-detail").forEach((details) => {
      const active = card._matrixSelection && (details.id === "matrix-detail"
        || (details.dataset.detailOwner === ownerId && details.dataset.detailPuppy === puppyId));
      details.innerHTML = active ? matrixDetailsMarkup(card) : "";
      details.hidden = !active;
      details.querySelector("[data-matrix-edit-owner]")?.addEventListener("click", (event) => card._openEditor(event.currentTarget.dataset.matrixEditOwner, { section: "preferences" }));
    });
    card._updateActionState();
}
