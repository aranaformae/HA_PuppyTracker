import { CONTACT_PREFERENCE_LABELS, OWNER_EDITOR_SECTIONS, OWNER_ROLE_LABELS, OWNER_SORT_LABELS, PLACEMENT_STATUS_LABELS, contactEmail, contactIdentity, contactPhone, dateOnly, detail, formattedAmount, formattedDate, numericAmount, optionLabel, selectField, text } from "./puppy-tracker-owner-common.js";
import { financialDetails, financialFields, paymentHistory } from "./puppy-tracker-owner-finance.js";
import { detailLitter, getLinkedPuppies, linkedPuppiesLabel, litterLabel, ownerForLitter, ownerLitterIds, placementFilterControl, visibleLitterIds } from "./puppy-tracker-owner-placements.js";
import { puppyPreferenceDetails, puppyPreferenceFields } from "./puppy-tracker-owner-preferences.js";
import { puppySelectorLabel, escapeHtml, languageForHass, preserveScrollPosition, createUuid } from "./puppy-tracker-card-common.js";

/** Owner contacts operations; canonical state and lifecycle belong to the card. */

export function selectVisibleOwners(card) {
    const query = card._ownerSearch.trim().toLocaleLowerCase();
    const owners = card._owners.filter((owner) => visibleLitterIds(card, owner).length && (!query ||
      [owner.name, owner.email, owner.phone, linkedPuppiesLabel(card, owner)].join(" ").toLocaleLowerCase().includes(query)));
    const collator = new Intl.Collator(languageForHass(card._hass) === "en" ? "en-US" : "nl-NL", { numeric: true, sensitivity: "base" });
    return owners.map((owner) => ({ owner, key: ownerSortKey(card, owner) })).sort((left, right) => {
      if (left.key === null && right.key !== null) return 1;
      if (right.key === null && left.key !== null) return -1;
      const difference = card._ownerSort === "balance" ? right.key - left.key : left.key - right.key;
      return difference || collator.compare(left.owner.name, right.owner.name) || String(left.owner.id).localeCompare(String(right.owner.id));
    }).map(({ owner }) => owner);
}

export function ownerSortKey(card, owner) {
    if (card._ownerSort === "name") return 0;
    const dossiers = visibleLitterIds(card, owner).map((id) => ownerForLitter(card, owner, id));
    if (card._ownerSort === "balance") {
      const amounts = dossiers.map((dossier) => numericAmount(dossier.payment_balance)).filter((value) => value !== null);
      return amounts.length ? amounts.reduce((total, amount) => total + amount, 0) : null;
    }
    if (card._ownerSort === "status") return Math.min(...dossiers.map((dossier) => Math.max(0, Object.keys(PLACEMENT_STATUS_LABELS).indexOf(dossier.placement_status || "interested"))));
    const dates = dossiers.map((dossier) => dossier.expected_pickup_date ? new Date(`${dateOnly(dossier.expected_pickup_date)}T12:00:00`).getTime() : NaN).filter(Number.isFinite);
    return dates.length ? Math.min(...dates) : null;
}

export function ownerFilters(card) {
    const disabled = card._busy || card._showOwnerEditor ? "disabled" : "";
    const options = [
      ["__all__", text(card, "allLitters")],
      ...card._litters.map((litter) => [litter.id, litter.name]),
      ["__unassigned__", `${text(card, "unassigned")} (${card._owners.filter((owner) => ownerLitterIds(card, owner).includes("")).length})`],
    ].map(([id, label]) => `<option value="${escapeHtml(id)}" ${id === card._ownerScope ? "selected" : ""}>${escapeHtml(label)}</option>`).join("");
    const sortOptions = Object.keys(OWNER_SORT_LABELS).map((key) => `<option value="${key}" ${key === card._ownerSort ? "selected" : ""}>${escapeHtml(optionLabel(card, key, OWNER_SORT_LABELS))}</option>`).join("");
    return `<div class="owner-filters"><label><span>${escapeHtml(text(card, "ownerScope"))}</span><select id="owner-scope" ${disabled}>${options}</select></label>${placementFilterControl(card)}<label><span>${escapeHtml(text(card, "searchOwners"))}</span><input id="owner-search" type="search" value="${escapeHtml(card._ownerSearch)}" ${disabled}></label><label><span>${escapeHtml(text(card, "ownerSort"))}</span><select id="owner-sort" ${disabled}>${sortOptions}</select></label></div>`;
}

export function filterSummary(card, owners) {
    const count = text(card, "visibleOwners").replace("{visible}", owners.length).replace("{total}", card._owners.length);
    const filtered = card._ownerScope !== "__all__" || card._placementFilter !== "all" || Boolean(card._ownerSearch);
    return `<span id="owner-filter-count" role="status" aria-live="polite" tabindex="-1">${escapeHtml(count)}<small>${escapeHtml(text(card, "allContactsCount"))}</small></span><button type="button" id="clear-owner-filters" class="secondary" ${!filtered || card._busy || card._showOwnerEditor ? "disabled" : ""}>${escapeHtml(text(card, "clearFilters"))}</button>`;
}

export function pickupAgenda(card, owners) {
    const entries = owners.flatMap((owner) => visibleLitterIds(card, owner).flatMap((litterId) => {
      const dossier = ownerForLitter(card, owner, litterId);
      const date = dateOnly(dossier.expected_pickup_date);
      if (!date || dossier.archived || dossier.placement_status === "placed") return [];
      const puppies = getLinkedPuppies(card, owner.id).filter((puppy) => puppy.litter_id === litterId);
      return [{ owner, litterId, date, puppies }];
    })).sort((left, right) => left.date.localeCompare(right.date) || left.owner.name.localeCompare(right.owner.name) || left.litterId.localeCompare(right.litterId));
    // Compare calendar dates in Home Assistant's zone, without parsing date-only
    // values as UTC or adding a timer that rebuilds an open form at midnight.
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: card._hass?.config?.time_zone || undefined, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const dateParts = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    const today = `${dateParts.year}-${dateParts.month}-${dateParts.day}`;
    let previousDate = null;
    const rows = entries.map(({ owner, litterId, date, puppies }) => {
      const heading = date !== previousDate ? `<h4>${escapeHtml(formattedDate(card, date))}${date === today ? ` · ${escapeHtml(text(card, "pickupToday"))}` : ""}</h4>` : "";
      previousDate = date;
      const puppyNames = puppies.map((puppy) => puppySelectorLabel(puppy, text(card, "puppy"))).join(", ") || text(card, "noLinkedPuppies");
      return `${heading}<button type="button" class="pickup-entry" data-pickup-owner="${escapeHtml(owner.id)}" data-pickup-litter="${escapeHtml(litterId)}" ${card._busy || card._showOwnerEditor ? "disabled" : ""}><span><strong>${escapeHtml(owner.name)}</strong><span>${escapeHtml(puppyNames)}</span><small>${escapeHtml(litterLabel(card, litterId))}</small>${date < today ? `<small class="pickup-past">${escapeHtml(text(card, "pickupPast"))}</small>` : ""}</span><ha-icon icon="mdi:pencil-outline" aria-hidden="true"></ha-icon><span class="pickup-edit-label">${escapeHtml(text(card, "editPlacement"))}</span></button>`;
    }).join("");
    return `<summary>${escapeHtml(text(card, "pickupAgenda"))} (${entries.length})</summary><p class="sub">${escapeHtml(text(card, "pickupAgendaHint"))}</p><div class="pickup-list">${rows || `<div class="empty">${escapeHtml(text(card, "noPickups"))}</div>`}</div>`;
}

export function refreshOwnerResults(card) {
    preserveScrollPosition(card, () => {
      const list = card.querySelector(".list");
      if (!list) return;
      const owners = selectVisibleOwners(card);
      list.innerHTML = ownerList(card, owners);
      list.scrollTop = 0;
      card.querySelector(".owner-filter-summary").innerHTML = filterSummary(card, owners);
      card.querySelector(".pickup-agenda").innerHTML = pickupAgenda(card, owners);
      bindOwnerRows(card);
      bindOwnerOverview(card);
    });
}

export function bindOwnerOverview(card) {
    card.querySelector("#clear-owner-filters")?.addEventListener("click", () => {
      if (card._busy || card._showOwnerEditor) return;
      card._ownerScope = "__all__";
      card._placementFilter = "all";
      card._ownerSearch = "";
      card._matrixSelection = null;
      card.querySelector("#owner-scope").value = card._ownerScope;
      card.querySelector("#owner-status-filter").value = card._placementFilter;
      card.querySelector("#owner-search").value = "";
      refreshOwnerResults(card);
      card.querySelector("#owner-filter-count")?.focus({ preventScroll: true });
    });
    card.querySelectorAll("[data-pickup-owner]").forEach((button) => button.addEventListener("click", () => {
      card._openEditor(button.dataset.pickupOwner, { section: "placement", litterId: button.dataset.pickupLitter });
    }));
}

export function contactDetail(card, owner, field) {
    const value = String(owner[field] || "");
    if (!value.trim()) return detail(card, text(card, field), "—");
    const links = [];
    const phone = field === "phone" ? contactPhone(value) : null;
    const email = field === "email" ? contactEmail(value) : null;
    if (phone) links.push([`tel:${phone}`, "callContact", "mdi:phone-outline"]);
    if (phone?.startsWith("+")) links.push([`https://wa.me/${phone.slice(1)}`, "whatsappContact", "mdi:whatsapp"]);
    if (email) links.push([`mailto:${encodeURIComponent(email)}`, "emailContact", "mdi:email-outline"]);
    const actions = links.map(([url, label, icon]) => `<a class="owner-contact-action" href="${escapeHtml(url)}" ${label === "whatsappContact" ? 'target="_blank" rel="noopener noreferrer"' : ""} title="${escapeHtml(text(card, label))}" aria-label="${escapeHtml(`${text(card, label)}: ${value}`)}"><ha-icon icon="${icon}" aria-hidden="true"></ha-icon></a>`).join("");
    return `<div data-contact-kind="${field}"><span>${escapeHtml(text(card, field))}</span><div class="owner-contact-row"><span class="owner-contact-text">${escapeHtml(value)}</span><div class="owner-contact-actions">${actions}<button type="button" class="owner-contact-action" data-copy-owner-contact="${escapeHtml(owner.id)}" data-contact-field="${field}" title="${escapeHtml(`${text(card, "copyContact")}: ${text(card, field)}`)}" aria-label="${escapeHtml(`${text(card, "copyContact")}: ${text(card, field)}`)}"><ha-icon icon="mdi:content-copy" aria-hidden="true"></ha-icon></button></div></div></div>`;
}

export async function copyContact(card, ownerId, field) {
    const context = card._context;
    if (!card._isCurrent(context) || card._busy || !["phone", "email"].includes(field)) return;
    const owner = card._owners.find((item) => item.id === ownerId);
    const value = String(owner?.[field] || "");
    if (!value.trim()) return;
    let message;
    try {
      await navigator.clipboard.writeText(value);
      message = text(card, "contactCopied");
    } catch (_error) {
      message = text(card, "contactCopyFailed");
    }
    if (!card._isCurrent(context)) return;
    const feedback = [...card.querySelectorAll("[data-contact-feedback]")].find((node) => node.dataset.contactFeedback === ownerId);
    if (feedback) feedback.textContent = message;
}

export function ownerDetails(card, owner) {
    const litterId = detailLitter(card, owner);
    const contact = owner;
    owner = ownerForLitter(card, owner, litterId);
    const linked = getLinkedPuppies(card, owner.id).filter((puppy) => puppy.litter_id === litterId).map((puppy) => puppySelectorLabel(puppy, text(card, "puppy"))).join(", ") || text(card, "noLinkedPuppies");
    const litterOptions = visibleLitterIds(card, contact).map((id) => `<option value="${escapeHtml(id)}" ${id === litterId ? "selected" : ""}>${escapeHtml(litterLabel(card, id))}</option>`).join("");
    const assignable = card._litters.filter((litter) => !contact.placements?.[litter.id]);
    const addDossier = assignable.length && (litterId || !contact.unassigned_placement) ? `<button type="button" class="secondary" data-add-dossier="${escapeHtml(owner.id)}" ${card._busy ? "disabled" : ""}><ha-icon icon="mdi:folder-plus-outline"></ha-icon>${escapeHtml(text(card, "addDossier"))}</button>` : "";
    const assign = !litterId && contact.unassigned_placement && assignable.length ? `<div class="assign-dossier"><label><span>${escapeHtml(text(card, "dossierLitter"))}</span><select data-assign-litter="${escapeHtml(owner.id)}"><option value="">${escapeHtml(text(card, "chooseLitter"))}</option>${assignable.map((litter) => `<option value="${escapeHtml(litter.id)}">${escapeHtml(litter.name)}</option>`).join("")}</select></label><button type="button" class="secondary" data-assign-owner="${escapeHtml(owner.id)}" ${card._busy ? "disabled" : ""}><ha-icon icon="mdi:link-variant"></ha-icon>${escapeHtml(text(card, "assignDossier"))}</button></div>` : "";
    const history = (owner.status_history || []).map((entry) => `${optionLabel(card, entry.status, PLACEMENT_STATUS_LABELS, entry.status)} · ${formattedDate(card, entry.changed_at, true)}`).join("\n") || "—";
    const group = (key, title, fields, defaultOpen = false) => {
      const open = card._ownerGroups.get(owner.id)?.[key] ?? defaultOpen;
      const editLabel = OWNER_EDITOR_SECTIONS[key]?.edit;
      const edit = editLabel ? `<button type="button" class="owner-section-edit" data-edit-owner-section="${key}" data-section-owner="${escapeHtml(owner.id)}" data-section-litter="${escapeHtml(litterId)}" title="${escapeHtml(text(card, editLabel))}" aria-label="${escapeHtml(text(card, editLabel))}"><ha-icon icon="mdi:pencil-outline"></ha-icon></button>` : "";
      return `<details class="owner-detail-group" data-owner-group="${key}" data-group-owner="${escapeHtml(owner.id)}" ${open ? "open" : ""}><summary><ha-icon class="owner-section-chevron" icon="mdi:chevron-down" aria-hidden="true"></ha-icon><span class="owner-section-title">${escapeHtml(text(card, title))}</span>${edit}</summary><div class="owner-detail-fields">${fields}</div></details>`;
    };
    return `<div class="owner-detail" id="owner-detail-${escapeHtml(owner.id)}">
      <div class="dossier-controls"><label class="dossier-select"><span>${escapeHtml(text(card, "dossierLitter"))}</span><select data-owner-dossier="${escapeHtml(owner.id)}">${litterOptions}</select></label>${addDossier}</div>${assign}
      ${group("contact", "contactDetails", `
      ${detail(card, text(card, "name"), owner.name)}
      ${detail(card, text(card, "role"), optionLabel(card, owner.role, OWNER_ROLE_LABELS, "owner"))}
      ${contactDetail(card, owner, "email")}
      ${contactDetail(card, owner, "phone")}
      ${detail(card, text(card, "contactPreference"), optionLabel(card, owner.contact_preference, CONTACT_PREFERENCE_LABELS, "none"))}
      <div class="owner-contact-feedback wide" data-contact-feedback="${escapeHtml(owner.id)}" role="status" aria-live="polite"></div>
      `, true)}
      ${group("address", "addressDetails", `
      ${detail(card, text(card, "street"), owner.street || owner.address || "—")}
      ${detail(card, text(card, "postalCode"), owner.postal_code || "—")}
      ${detail(card, text(card, "city"), owner.city || "—")}
      `)}
      ${group("placement", "placementDetails", `
      ${detail(card, text(card, "placementStatus"), optionLabel(card, owner.placement_status, PLACEMENT_STATUS_LABELS, "interested"))}
      ${detail(card, text(card, "placementDate"), formattedDate(card, owner.placement_date))}
      ${detail(card, text(card, "expectedPickupDate"), formattedDate(card, owner.expected_pickup_date))}
      ${detail(card, text(card, "linkedPuppies"), linked, "wide")}
      `, true)}
      ${group("preferences", "puppyPreferences", puppyPreferenceDetails(card, owner))}
      ${group("financial", "financialDetails", financialDetails(card, owner))}
      ${litterId ? group("payments", "paymentHistory", paymentHistory(card, owner, litterId)) : ""}
      ${group("notes", "notesSection", `${detail(card, text(card, "notes"), owner.notes || "—", "wide notes preformatted")}${detail(card, text(card, "placementNotes"), owner.placement_notes || "—", "wide preformatted")}`, true)}
      ${group("history", "statusHistory", detail(card, text(card, "statusHistory"), history, "wide preformatted"))}
    </div>`;
}

export function ownerAttention(card, owner) {
    const visible = visibleLitterIds(card, owner);
    const actions = [];
    for (const litterId of visible) {
      const dossier = ownerForLitter(card, owner, litterId);
      if (dossier.archived || !["reserved", "sold"].includes(dossier.placement_status)) continue;
      const issues = [];
      if (!String(owner.email || "").trim() && !String(owner.phone || "").trim()) issues.push(["contact", "missingContact", "mdi:account-alert-outline"]);
      if (dossier.placement_status === "sold" && !dossier.expected_pickup_date) issues.push(["placement", "missingPickup", "mdi:calendar-alert"]);
      if (dossier.payment_status !== "full" && numericAmount(dossier.payment_balance) > 0) issues.push(["financial", "outstandingPayment", "mdi:cash-clock"]);
      for (const [section, key, icon] of issues) {
        const label = [visible.length > 1 ? litterLabel(card, litterId) : "", text(card, key)].filter(Boolean).join(" · ");
        actions.push(`<button type="button" class="owner-attention-action" data-edit-owner-section="${section}" data-section-owner="${escapeHtml(owner.id)}" data-section-litter="${escapeHtml(litterId)}" title="${escapeHtml(`${owner.name} · ${litterLabel(card, litterId)} · ${text(card, key)}`)}"><ha-icon icon="${icon}" aria-hidden="true"></ha-icon>${escapeHtml(label)}</button>`);
      }
    }
    return actions.length ? `<div class="owner-attention" role="group" aria-label="${escapeHtml(text(card, "ownerAttention"))}">${actions.join("")}</div>` : "";
}

export function ownerList(card, owners = selectVisibleOwners(card)) {
    if (!card._owners.length) return `<div class="empty">${escapeHtml(text(card, card._loading ? "loading" : "empty"))}</div>`;
    if (!owners.length) return `<div class="empty">${escapeHtml(text(card, "noMatchingOwners"))}</div>`;
    return owners.map((owner) => {
      const expanded = owner.id === card._expandedOwnerId;
      const contact = [owner.email, owner.phone].filter(Boolean).join(" · ") || text(card, "noContact");
      const linked = linkedPuppiesLabel(card, owner);
      const dossiers = visibleLitterIds(card, owner).map((id) => {
        const dossier = ownerForLitter(card, owner, id);
        const status = [litterLabel(card, id), optionLabel(card, dossier.placement_status, PLACEMENT_STATUS_LABELS, "interested"), dossier.archived ? text(card, "archivedColumn") : ""].filter(Boolean).join(" · ");
        const balance = formattedAmount(card, dossier.payment_balance);
        return `<small class="owner-dossier-summary" data-summary-litter="${escapeHtml(id)}"><span>${escapeHtml(status)}</span>${dossier.expected_pickup_date ? `<span>${escapeHtml(text(card, "pickupSummary"))}: ${escapeHtml(formattedDate(card, dossier.expected_pickup_date))}</span>` : ""}${balance !== null ? `<span>${escapeHtml(text(card, "balanceSummary"))}: ${escapeHtml(balance)}</span>` : ""}</small>`;
      }).join("");
      return `<article class="owner" data-owner="${escapeHtml(owner.id)}">
        <button type="button" class="owner-toggle" data-toggle-owner="${escapeHtml(owner.id)}" aria-expanded="${expanded}" aria-controls="owner-detail-${escapeHtml(owner.id)}"><span><strong>${escapeHtml(owner.name)}</strong><small>${escapeHtml(contact)}</small>${dossiers}${linked ? `<small class="owner-puppies">${escapeHtml(text(card, "linkedPuppies"))}: ${escapeHtml(linked)}</small>` : ""}</span><ha-icon icon="mdi:chevron-${expanded ? "up" : "down"}"></ha-icon></button>
        <div class="owner-actions"><button type="button" data-edit="${escapeHtml(owner.id)}" title="${escapeHtml(text(card, "edit"))}" aria-label="${escapeHtml(text(card, "edit"))}"><ha-icon icon="mdi:pencil-outline"></ha-icon></button><button type="button" data-delete="${escapeHtml(owner.id)}" title="${escapeHtml(text(card, "remove"))}" aria-label="${escapeHtml(text(card, "remove"))}"><ha-icon icon="mdi:delete-outline"></ha-icon></button></div>
        ${ownerAttention(card, owner)}
        ${expanded ? ownerDetails(card, owner) : ""}
      </article>`;
    }).join("");
}

export function renderOwnerForm(card) {
    if (!card._showOwnerEditor) return `<button type="button" id="add-owner" class="primary add-owner"><ha-icon icon="mdi:plus"></ha-icon>${escapeHtml(text(card, "addOwner"))}</button>`;
    const contact = card._editingContact || {};
    const owner = ownerForLitter(card, contact, card._editingLitter);
    const litterOptions = [["", text(card, "unassigned")], ...card._litters.map((litter) => [litter.id, litter.name])].map(([id, label]) => `<option value="${escapeHtml(id)}" ${id === card._editingLitter ? "selected" : ""}>${escapeHtml(label)}</option>`).join("");
    return `<section class="owner-editor"><h3>${escapeHtml(text(card, card._editing ? "editOwner" : "addOwner"))}${contact.name ? `: ${escapeHtml(contact.name)}` : ""}</h3><form class="form">
      <label class="wide"><span>${escapeHtml(text(card, "dossierLitter"))}</span><select id="owner-litter" data-draft-ignore ${card._busy ? "disabled" : ""}>${litterOptions}</select></label>
      ${editorSection(card, "contact", `
      <label><span>${escapeHtml(text(card, "name"))}</span><input name="name" required autocomplete="name" value="${escapeHtml(owner.name || "")}"></label>
      <label><span>${escapeHtml(text(card, "email"))}</span><input name="email" type="email" autocomplete="email" value="${escapeHtml(owner.email || "")}"></label>
      <label><span>${escapeHtml(text(card, "phone"))}</span><input name="phone" autocomplete="tel" value="${escapeHtml(owner.phone || "")}"></label>
      ${selectField(card, "role", text(card, "role"), OWNER_ROLE_LABELS, owner.role || "owner")}
      ${selectField(card, "contact_preference", text(card, "contactPreference"), CONTACT_PREFERENCE_LABELS, owner.contact_preference || "none")}
      <div class="owner-duplicates wide" role="status" aria-live="polite" hidden></div>
      `)}
      ${editorSection(card, "address", `
      <label><span>${escapeHtml(text(card, "street"))}</span><input name="street" autocomplete="street-address" value="${escapeHtml(owner.street || owner.address || "")}"></label>
      <label><span>${escapeHtml(text(card, "postalCode"))}</span><input name="postal_code" autocomplete="postal-code" value="${escapeHtml(owner.postal_code || "")}"></label>
      <label><span>${escapeHtml(text(card, "city"))}</span><input name="city" autocomplete="address-level2" value="${escapeHtml(owner.city || "")}"></label>
      `)}
      ${editorSection(card, "placement", `
      ${selectField(card, "placement_status", text(card, "placementStatus"), PLACEMENT_STATUS_LABELS, owner.placement_status || "interested")}
      <label><span>${escapeHtml(text(card, "placementDate"))}</span><input name="placement_date" type="date" value="${escapeHtml(owner.placement_date || "")}"></label>
      <label><span>${escapeHtml(text(card, "expectedPickupDate"))}</span><input name="expected_pickup_date" type="date" value="${escapeHtml(owner.expected_pickup_date || "")}"></label>
      <label class="completed-toggle wide"><input name="archived" type="checkbox" ${owner.archived ? "checked" : ""}>${escapeHtml(text(card, "archived"))}</label>
      `)}
      ${editorSection(card, "preferences", puppyPreferenceFields(card, owner))}
      ${editorSection(card, "financial", financialFields(card, owner))}
      ${editorSection(card, "notes", `
      <label class="wide"><span>${escapeHtml(text(card, "notes"))}</span><textarea name="notes" rows="5">${escapeHtml(owner.notes || "")}</textarea></label>
      <label class="wide"><span>${escapeHtml(text(card, "placementNotes"))}</span><textarea name="placement_notes" rows="3">${escapeHtml(owner.placement_notes || "")}</textarea></label>
      `)}
      ${ownerErrorMarkup(card)}
      <div class="owner-editor-actions wide"><div class="owner-draft-status" role="status" aria-live="polite"></div><div class="actions"><button type="button" class="secondary" id="cancel-owner">${escapeHtml(text(card, "cancel"))}</button><button type="submit" class="primary">${escapeHtml(text(card, card._editing ? "update" : "addOwner"))}</button></div></div>
    </form></section>`;
}

export function editorSection(card, key, fields) {
    return `<details class="owner-editor-group wide" data-owner-editor-group="${key}" ${card._editorGroups[key] ? "open" : ""}><summary><ha-icon class="owner-section-chevron" icon="mdi:chevron-down" aria-hidden="true"></ha-icon>${escapeHtml(text(card, OWNER_EDITOR_SECTIONS[key].title))}</summary><div class="owner-editor-fields">${fields}</div></details>`;
}

export function captureEditorGroups(card) {
    if (!card._formState.root || card._formState.root !== card.querySelector(".owner-editor form")) return;
    card.querySelectorAll("[data-owner-editor-group]").forEach((group) => { card._editorGroups[group.dataset.ownerEditorGroup] = group.open; });
}

export function duplicateOwners(card) {
    const form = card._formState.root;
    if (!form) return [];
    const keys = ["email", "phone"].map((field) => [field, contactIdentity(field, form.elements[field].value)]).filter(([, key]) => key);
    if (!keys.length) return [];
    let index = card._duplicateIndexes.get(card._owners);
    if (!index) {
      // Reload/save replaces owner snapshots; weak keys let old indexes expire.
      index = { email: new Map(), phone: new Map(), owners: new Map() };
      for (const owner of card._owners) {
        index.owners.set(owner.id, owner);
        for (const field of ["email", "phone"]) {
          const key = contactIdentity(field, owner[field]);
          if (!key) continue;
          if (!index[field].has(key)) index[field].set(key, []);
          index[field].get(key).push(owner.id);
        }
      }
      card._duplicateIndexes.set(card._owners, index);
    }
    const matches = new Map();
    for (const [field, key] of keys) {
      for (const id of index[field].get(key) || []) {
        if (id === card._editing) continue;
        if (!matches.has(id)) matches.set(id, { owner: index.owners.get(id), fields: [] });
        matches.get(id).fields.push(field);
      }
    }
    return [...matches.values()];
}

export function updateDuplicateWarning(card) {
    const warning = card.querySelector(".owner-duplicates");
    if (!warning || !card._isCurrent(card._context)) return;
    const matches = duplicateOwners(card);
    const signature = JSON.stringify(matches.map(({ owner, fields }) => [owner.id, owner.name, fields]));
    if (warning.dataset.matches === signature) return;
    warning.dataset.matches = signature;
    warning.hidden = !matches.length;
    warning.innerHTML = matches.length ? `<strong>${escapeHtml(text(card, "possibleDuplicate"))}</strong><div class="owner-duplicate-list">${matches.map(({ owner, fields }) => `<div class="owner-duplicate-match"><span><strong>${escapeHtml(owner.name)}</strong><small>${escapeHtml(text(card, "duplicateMatches"))}: ${escapeHtml(fields.map((field) => text(card, field)).join(", "))}</small></span><button type="button" class="secondary" data-open-duplicate-owner="${escapeHtml(owner.id)}" title="${escapeHtml(`${text(card, "openExistingOwner")}: ${owner.name}`)}" aria-label="${escapeHtml(`${text(card, "openExistingOwner")}: ${owner.name}`)}"><ha-icon icon="mdi:account-edit-outline" aria-hidden="true"></ha-icon>${escapeHtml(text(card, "openExistingOwner"))}</button></div>`).join("")}</div>` : "";
    warning.querySelectorAll("[data-open-duplicate-owner]").forEach((button) => button.addEventListener("click", () => {
      if (card._busy || !card._isCurrent(card._context)) return;
      const owner = card._owners.find((item) => item.id === button.dataset.openDuplicateOwner);
      if (!owner) return;
      const litters = ownerLitterIds(card, owner);
      const litterId = litters.includes(card._editingLitter) ? card._editingLitter : litters[0] || "";
      card._openEditor(owner.id, { litterId, section: "contact" });
    }));
    card._updateActionState();
}

export function ownerErrorMarkup(card) {
    return `<div id="owner-error" class="message error wide" role="alert">${escapeHtml(card._error)}</div>${card._conflict ? `<button type="button" class="secondary wide" id="reload-owner-conflict"><ha-icon icon="mdi:refresh"></ha-icon>${escapeHtml(text(card, "reloadLatest"))}</button>` : ""}`;
}

export function bindOwnerRows(card) {
    card.querySelectorAll("[data-add-payment]").forEach(button => button.addEventListener("click", () => {
      const now = new Date();
      card._paymentDraft = { ownerId: button.dataset.addPayment, litterId: button.dataset.paymentLitter,
        requestId: createUuid(), amount: "", date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
        kind: "other", method: "bank_transfer", reference: "", note: "" };
      card._render();
      card.querySelector(".payment-event-form [name=amount]")?.focus({ preventScroll: true });
    }));
    card.querySelectorAll("[data-payment-form]").forEach(form => {
      const capture = () => { if (card._paymentDraft) Object.assign(card._paymentDraft, Object.fromEntries(new FormData(form).entries())); };
      form.addEventListener("input", capture);
      form.addEventListener("change", capture);
      form.addEventListener("submit", event => { event.preventDefault(); card._savePayment(form); });
      form.querySelector("[data-cancel-payment]")?.addEventListener("click", () => { card._paymentDraft = null; card._render(); });
    });
    card.querySelectorAll("[data-void-payment]").forEach(button => button.addEventListener("click", () => card._voidPayment(button)));
    card.querySelectorAll("[data-copy-owner-contact]").forEach((button) => button.addEventListener("click", () => copyContact(card, button.dataset.copyOwnerContact, button.dataset.contactField)));
    card.querySelectorAll("[data-owner-group]").forEach((group) => group.addEventListener("toggle", () => {
      if (!group.isConnected) return;
      const state = card._ownerGroups.get(group.dataset.groupOwner) || {};
      state[group.dataset.ownerGroup] = group.open;
      card._ownerGroups.set(group.dataset.groupOwner, state);
    }));
    card.querySelectorAll("[data-toggle-owner]").forEach((button) => button.addEventListener("click", () => { card._expandedOwnerId = card._expandedOwnerId === button.dataset.toggleOwner ? null : button.dataset.toggleOwner; card._render(); }));
    card.querySelectorAll("[data-delete]").forEach((button) => button.addEventListener("click", () => card._delete(button.dataset.delete)));
    card.querySelectorAll("[data-edit]").forEach((button) => button.addEventListener("click", () => card._openEditor(button.dataset.edit)));
    card.querySelectorAll("[data-edit-owner-section]").forEach((button) => button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      card._openEditor(button.dataset.sectionOwner, { section: button.dataset.editOwnerSection, litterId: button.dataset.sectionLitter });
    }));
    card.querySelectorAll("[data-mark-paid]").forEach((button) => button.addEventListener("click", () => card._openEditor(button.dataset.markPaid, { paidInFull: true })));
    card.querySelectorAll("[data-owner-dossier]").forEach((select) => select.addEventListener("change", () => { card._detailLitters.set(select.dataset.ownerDossier, select.value); card._render(); }));
    card.querySelectorAll("[data-add-dossier]").forEach((button) => button.addEventListener("click", () => {
      const owner = card._owners.find((item) => item.id === button.dataset.addDossier);
      const litter = card._litters.find((item) => !owner.placements?.[item.id]);
      if (litter) card._openEditor(owner.id, { litterId: litter.id, section: "placement" });
    }));
    card.querySelectorAll("[data-assign-owner]").forEach((button) => button.addEventListener("click", () => {
      const select = [...card.querySelectorAll("[data-assign-litter]")].find((item) => item.dataset.assignLitter === button.dataset.assignOwner);
      card._assignDossier(button.dataset.assignOwner, select?.value);
    }));
    card._updateActionState();
}
