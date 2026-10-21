import { expect } from "@playwright/test";

// Controlled responses reproduce overlapping requests without timing sleeps.
export async function mountAsyncCard(page, kind, { language = "en", config = {}, hold = [] } = {}) {
  await page.goto("/tests/e2e/cards.html");
  await page.waitForFunction(() => window.__puppyTrackerReady === true);
  await page.evaluate(({ kind, language, config, hold }) => {
    const clone = (value) => structuredClone(value);
    const litters = ["a", "b"].map((id) => ({ id, name: `Litter ${id.toUpperCase()}`, active: true }));
    const data = Object.fromEntries(litters.map((litter) => [litter.id, {
      can_manage_records: true,
      litter: { ...litter, mother: `Mother ${litter.id}`, records: [] },
      puppies: [1, 2].map((index) => ({ id: `${litter.id}${index}`, name: `${litter.id.toUpperCase()}${index}`, collar_color: "Red", active: true, records: [], measurements: [] })),
    }]));
    window.__async = { hold: new Set(hold), pending: [], calls: [], data, updates: [] };
    const state = window.__async;
    const hass = {
      user: { is_admin: true }, language, locale: { language }, states: {},
      connection: { subscribeMessage: async (callback) => {
        state.updates.push(callback);
        return async () => { state.updates = state.updates.filter((item) => item !== callback); };
      } },
      callWS: async (message) => {
        state.calls.push(clone(message));
        let result;
        if (message.type === "puppy_tracker/litters") result = { litters: clone(litters) };
        else if (message.type === "puppy_tracker/data") result = clone(data[message.litter_id]);
        else if (message.type === "puppy_tracker/mother/records") result = { records: clone(state.motherRecords || []) };
        else if (message.type.endsWith("record/add")) result = { record: { id: `record-${state.calls.length}`, type: message.record_type, occurred_at: message.occurred_at, note: message.note, data: clone(message.data), deleted: false } };
        else if (message.type === "puppy_tracker/report/logo") result = { logo_url: "" };
        else if (message.type === "puppy_tracker/export") result = { content: message.format === "pdf" ? "%PDF-1.4\n%%EOF" : "test", encoding: "utf-8", mime_type: "application/octet-stream", filename: `test.${message.format}` };
        else if (message.type === "puppy_tracker/mother/export_url") result = { url: "data:application/json,%7B%7D" };
        else throw new Error(`Unexpected WS call: ${message.type}`);
        if (state.hold.has(message.type)) result = await new Promise((resolve, reject) => state.pending.push({ message, resolve: (value = result) => resolve(value), reject }));
        if (message.type.endsWith("record/add")) {
          if (message.type.includes("/mother/")) (state.motherRecords ||= []).push(result.record);
          else (message.puppy_id ? data[message.litter_id].puppies.find((p) => p.id === message.puppy_id).records : data[message.litter_id].litter.records).push(result.record);
        }
        return result;
      },
    };
    const card = document.createElement(`puppy-tracker-${kind}-card`);
    card.setConfig({ ...config, litter_id: "a" });
    document.querySelector("#cards").append(card);
    card.hass = hass;
    state.card = card;
    state.hass = hass;
  }, { kind, language, config, hold });
  const card = page.locator(`puppy-tracker-${kind}-card`);
  if (!hold.length) await expect.poll(() => card.evaluate((el) => Boolean(el._data || el._litterData) && !el._loading)).toBe(true);
  return card;
}

export async function pendingCount(page, type) {
  return page.evaluate((type) => window.__async.pending.filter((item) => item.message.type === type).length, type);
}

export async function release(page, type, { index = 0, error = null, result = null } = {}) {
  await expect.poll(() => pendingCount(page, type)).toBeGreaterThan(index);
  await page.evaluate(({ type, index, error, result }) => {
    const state = window.__async;
    const pending = state.pending.filter((item) => item.message.type === type)[index];
    state.pending.splice(state.pending.indexOf(pending), 1);
    if (error) pending.reject(new Error(error));
    else if (result !== null) pending.resolve(result);
    else pending.resolve();
  }, { type, index, error, result });
}
