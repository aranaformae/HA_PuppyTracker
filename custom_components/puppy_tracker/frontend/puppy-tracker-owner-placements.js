import { PLACEMENT_FILTER_LABELS, optionLabel, text } from "./puppy-tracker-owner-common.js";
import { puppySelectorLabel, escapeHtml } from "./puppy-tracker-card-common.js";

/** Owner placements operations; canonical state and lifecycle belong to the card. */

export function getLinkedPuppies(card, ownerId) {
    return card._puppies.filter((puppy) => (puppy.owner_ids || []).includes(ownerId));
}

export function linkedPuppiesLabel(card, owner) {
    const visibleLitters = new Set(visibleLitterIds(card, owner));
    return getLinkedPuppies(card, owner.id).filter((puppy) => visibleLitters.has(puppy.litter_id)).map((puppy) => {
      const label = puppySelectorLabel(puppy, text(card, "puppy"));
      return puppy.litter_name ? `${label} (${puppy.litter_name})` : label;
    }).join(", ");
}

export function ownerForLitter(card, owner, litterId) {
    return { ...owner, ...(litterId ? owner.placements?.[litterId] : owner.unassigned_placement) };
}

export function litterLabel(card, litterId) {
    return litterId ? card._litters.find((litter) => litter.id === litterId)?.name || text(card, "unavailableLitter") : text(card, "unassigned");
}

export function ownerLitterIds(card, owner) {
    const ids = new Set(Object.keys(owner.placements || {}));
    getLinkedPuppies(card, owner.id).forEach((puppy) => ids.add(puppy.litter_id));
    if (owner.unassigned_placement || !ids.size) ids.add("");
    return [...ids];
}

export function visibleLitterIds(card, owner) {
    return ownerLitterIds(card, owner).filter((id) => {
      if (card._ownerScope !== "__all__" && id !== (card._ownerScope === "__unassigned__" ? "" : card._ownerScope)) return false;
      return matchesPlacementFilter(card, ownerForLitter(card, owner, id));
    });
}

export function matchesPlacementFilter(card, dossier) {
    if (card._placementFilter === "all") return true;
    if (card._placementFilter === "archived") return Boolean(dossier.archived);
    const status = dossier.placement_status || "interested";
    if (card._placementFilter === "active") return !dossier.archived && status !== "placed";
    return status === card._placementFilter;
}

export function placementFilterControl(card) {
    const disabled = card._busy || card._showOwnerEditor ? "disabled" : "";
    const options = Object.keys(PLACEMENT_FILTER_LABELS).map((key) => `<option value="${key}" ${key === card._placementFilter ? "selected" : ""}>${escapeHtml(optionLabel(card, key, PLACEMENT_FILTER_LABELS))}</option>`).join("");
    return `<label><span>${escapeHtml(text(card, "placementFilter"))}</span><select id="owner-status-filter" ${disabled}>${options}</select></label>`;
}

export function detailLitter(card, owner) {
    const visible = visibleLitterIds(card, owner);
    const selected = card._detailLitters.get(owner.id);
    return visible.includes(selected) ? selected : visible[0] || "";
}

export function linkSection(card, litterPuppies, puppy, linked, litterOptions, puppyOptions) {
    const owners = card._owners.filter((owner) => linked.has(owner.id) || ((owner.placements?.[card._selectedLitter] || ownerLitterIds(card, owner).includes("")) && !ownerForLitter(card, owner, card._selectedLitter).archived));
    return `<section class="link"><h3>${escapeHtml(text(card, "linkTitle"))}</h3><div class="link-form"><label><span>${escapeHtml(text(card, "litter"))}</span><select id="link-litter">${litterOptions}</select></label><label><span>${escapeHtml(text(card, "puppy"))}</span><select id="link-puppy" ${litterPuppies.length ? "" : "disabled"}>${puppyOptions}</select></label><fieldset class="checks"><legend>${escapeHtml(text(card, "owners"))}</legend>${owners.map((owner) => `<label><input type="checkbox" name="linked_owner" value="${escapeHtml(owner.id)}" ${linked.has(owner.id) ? "checked" : ""}>${escapeHtml(owner.name)}</label>`).join("") || `<span class="empty">${escapeHtml(text(card, "noMatchingOwners"))}</span>`}</fieldset></div><div class="actions"><button type="button" id="link-save" class="primary" ${!puppy || card._busy ? "disabled" : ""}>${escapeHtml(text(card, "linkSave"))}</button></div></section>`;
}
