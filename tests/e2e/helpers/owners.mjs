const contactFields = ["name", "email", "phone", "street", "postal_code", "city", "notes", "role", "contact_preference"];
const placementFields = ["placement_status", "placement_date", "expected_pickup_date", "payment_status", "payment_date", "payment_amount", "registration_fee_amount", "deposit_amount", "deposit_date", "payment_method", "payment_balance", "puppy_preferences", "status_history", "placement_notes", "archived"];
const pick = (value, fields) => Object.fromEntries(fields.filter((key) => key in value).map((key) => [key, structuredClone(value[key])]));

export async function openOwnerSection(card, key) {
  const section = card.locator(`[data-owner-editor-group="${key}"]`);
  if (await section.getAttribute("open") === null) await section.locator("summary").click();
  return section;
}

export function ownerContact(values, litterIds = [], unassigned = false) {
  const placement = pick(values, placementFields);
  return { id: values.id, ...pick(values, contactFields),
    placements: Object.fromEntries(litterIds.map((id) => [id, structuredClone(placement)])),
    unassigned_placement: unassigned ? placement : null };
}

export function saveOwner(owners, message) {
  const id = message.owner_id || "o2";
  const index = owners.findIndex((owner) => owner.id === id);
  const owner = structuredClone(owners[index] || ownerContact({ id }));
  Object.assign(owner, pick(message, contactFields));
  const existing = message.litter_id ? owner.placements[message.litter_id] : owner.unassigned_placement;
  const placement = { ...(message.move_unassigned ? owner.unassigned_placement : existing), ...pick(message, placementFields) };
  if (message.litter_id) owner.placements[message.litter_id] = placement;
  else owner.unassigned_placement = placement;
  if (message.move_unassigned) owner.unassigned_placement = null;
  if (index >= 0) owners[index] = owner;
  else owners.push(owner);
  return { owner: structuredClone(owner) };
}
