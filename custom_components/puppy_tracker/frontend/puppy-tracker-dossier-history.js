import { matchesDossierSearch } from "./puppy-tracker-dossier-search.js";

export function historyTime(value) {
  const time = Date.parse(String(value || ""));
  return Number.isFinite(time) ? time : 0;
}

export function ownerActions(response, scope, puppyId = null, ownerName = response?.owner?.name) {
  // The litter records endpoint also returns puppy follow-ups; retain only
  // actions whose source is in this exact owner's returned record collection.
  const ids = new Set((response?.records || []).map((record) => record.id));
  return (response?.actions?.actions || []).filter((action) => ids.has(action.source_record_id || action.record_id))
    .map((action) => ({ ...action, scope, puppy_id: scope === "puppy" ? puppyId : null, owner_name: ownerName || action.puppy_name }));
}

export function buildDossierHistory(records, puppies, { includeHistory = false, measurements = {} } = {}) {
  const items = [...records];
  for (const puppy of puppies) {
    for (const measurement of measurements[puppy.id] || puppy.measurements || []) {
      const status = measurement.deleted ? "deleted" : measurement.superseded_by ? "superseded" : measurement.status || "active";
      if (!includeHistory && status !== "active") continue;
      items.push({ id: `weight:${puppy.id}:${measurement.id}`, measurement_id: measurement.id,
        type: "weight", scope: "puppy", puppy_id: puppy.id,
        occurred_at: measurement.timestamp || measurement.created_at, created_at: measurement.created_at,
        title: null, note: measurement.note || "", deleted: status === "deleted", status,
        data: { weight: measurement.weight, kind: measurement.kind, correction_reason: measurement.correction_reason },
        __aggregate_owner_scope: "puppy", __aggregate_owner_puppy_id: puppy.id,
        __aggregate_owner_name: puppy.name, __aggregate_record_key: `weight:${puppy.id}:${measurement.id}` });
    }
  }
  return items.sort((left, right) => historyTime(right.occurred_at) - historyTime(left.occurred_at)
    || historyTime(right.created_at) - historyTime(left.created_at) || String(right.id).localeCompare(String(left.id)));
}

export function filterDossierHistory(items, { types, query = "", from = "", to = "" } = {}) {
  const start = from ? Date.parse(`${from}T00:00:00`) : null;
  const end = to ? Date.parse(`${to}T23:59:59.999`) : null;
  return items.filter((item) => (!types || types.has(item.type || "other")) && matchesDossierSearch(item, query)
    && (start === null || historyTime(item.occurred_at) >= start)
    && (end === null || historyTime(item.occurred_at) <= end));
}
