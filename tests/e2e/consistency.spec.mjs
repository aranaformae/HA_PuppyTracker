import { expect, test } from "@playwright/test";

async function mount(page, tag, config = {}, overrides = {}) {
  await page.goto("/tests/e2e/cards.html?production=1");
  await page.waitForFunction(() => window.__puppyTrackerReady);
  expect(await page.evaluate(() => window.__puppyTrackerModuleErrors)).toEqual([]);
  await page.evaluate(({ tag, config, overrides }) => {
    const now = new Date().toISOString();
    const temperatures = Array.from({ length: 12 }, (_, i) => ({ id: `t${i}`, type: "temperature", occurred_at: now, data: { temperature_c: 38.4 }, note: `Reading ${i}` }));
    const feeding = { id: "food", type: "feeding", occurred_at: now, data: { feeding_type: "Bottle", amount: 45, unit: "ml" } };
    const data = {
      can_manage_records: true,
      litter: { id: "l1", name: "Nest", mother: "Luna", records: [feeding] },
      puppies: [{ id: "p1", name: "Alice", active: true, records: [...temperatures, feeding], measurements: [] }],
      ...overrides,
    };
    window.calls = [];
    window.updateCallbacks = [];
    const hass = {
      language: "en", locale: { language: "en" }, states: {}, user: { is_admin: true },
      connection: { subscribeMessage: async (callback) => { window.updateCallbacks.push(callback); return async () => {}; } },
      callWS: async (msg) => {
        window.calls.push(msg);
        if (msg.type === "puppy_tracker/litters") return { litters: [{ id: "l1", name: "Nest", active: true }] };
        if (msg.type === "puppy_tracker/data") return structuredClone(data);
        if (msg.type === "puppy_tracker/mother/records") return { owner: { id: "m1", name: "Luna" }, records: [...temperatures, feeding], can_manage_records: true };
        if (msg.type === "puppy_tracker/records") return { records: data.litter.records, can_manage_records: true };
        if (msg.type === "puppy_tracker/recurring_reminders") return { reminders: [] };
        if (msg.type === "puppy_tracker/care_programs") return { programs: [] };
        if (msg.type === "puppy_tracker/care_program_templates") return { templates: [] };
        if (msg.type.endsWith("/record/add")) return { record: { id: "saved" } };
        throw new Error(`Unexpected call ${msg.type}`);
      },
    };
    const card = document.createElement(tag);
    card.setConfig({ show_timeline_items: true, default_range: "all", ...config });
    document.querySelector("#cards").append(card);
    card.hass = hass;
    window.card = card;
  }, { tag, config, overrides });
  return page.locator(tag);
}

test("production timeline keeps no categories selected for mother and all scopes", async ({ page }) => {
  const card = await mount(page, "puppy-tracker-timeline-card", { default_scope: "mother" });
  await expect(card.locator('[data-filter-type="feeding"]')).toBeVisible();
  await expect(card.locator('.timeline-item[data-event-type="feeding"]')).toHaveCount(1);
  await card.locator('[data-filter-type="__all__"]').click();
  await expect(card.locator(".timeline-item")).toHaveCount(0);
  await expect(card.locator('[data-filter-type="temperature"]')).not.toHaveClass(/active/);
  await card.locator("#scope-select").selectOption("__all__");
  await expect(card.locator(".timeline-item")).toHaveCount(0);
  await card.locator('[data-filter-type="feeding"]').click();
  await expect(card.locator('.timeline-item[data-event-type="feeding"]')).toHaveCount(3);
});

test("mother Quick Log saves feeding under the feeding category", async ({ page }) => {
  const card = await mount(page, "puppy-tracker-quick-log-card");
  await expect(card.locator("#owner-select option[value='__mother__']")).toHaveCount(1);
  await card.locator("#owner-select").selectOption("__mother__");
  await card.locator('[data-preset="feeding"]').click();
  await card.locator("#quick-note").fill("Dinner eaten");
  await card.locator("#quick-save").click();
  await expect.poll(() => page.evaluate(() => window.calls.filter(c => c.type.endsWith("/record/add")))).toEqual([
    expect.objectContaining({ type: "puppy_tracker/mother/record/add", record_type: "feeding", note: "Dinner eaten" }),
  ]);
});

test("temperature editor keeps text and focus through a live update", async ({ page }) => {
  const card = await mount(page, "puppy-tracker-temperature-card", { default_scope: "puppy" });
  await expect(card.locator("#add-temperature")).toBeEnabled();
  await card.locator("#add-temperature").click();
  await card.locator("#temperature-value").fill("38.6");
  await card.locator("#temperature-note").fill("Keep this observation");
  await page.evaluate(async () => { for (const cb of window.updateCallbacks) await cb({}); });
  await expect(card.locator("#temperature-note")).toHaveValue("Keep this observation");
  await expect(card.locator("#temperature-note")).toBeFocused();
  await expect(card.locator("#scope-select")).toBeDisabled();
  await card.locator('button[type="submit"]').click();
  await expect.poll(() => page.evaluate(() => window.calls.find(c => c.type.endsWith("/record/add")))).toMatchObject({ puppy_id: "p1", note: "Keep this observation", data: { temperature_c: 38.6 } });
});

test("temperature history can reveal records beyond its initial row limit", async ({ page }) => {
  const card = await mount(page, "puppy-tracker-temperature-card", { default_scope: "puppy", history_limit: 3 });
  await expect(card.locator(".history-row")).toHaveCount(3);
  await card.locator("#temperature-history-more").click();
  await expect(card.locator(".history-row")).toHaveCount(12);
});

test("temperature cannot fall back to the litter when no puppy exists", async ({ page }) => {
  const card = await mount(page, "puppy-tracker-temperature-card", { default_scope: "puppy" }, { puppies: [] });
  await expect(card.locator("#add-temperature")).toBeDisabled();
  await page.evaluate(async () => { window.card._draft = { temperature_c: "38.5", occurred_at: new Date().toISOString() }; await window.card._save(); });
  expect(await page.evaluate(() => window.calls.filter(c => c.type.endsWith("/record/add")))).toEqual([]);
});

test("missing metrics do not become zero and editor types preserve imported categories", async ({ page }) => {
  await page.goto("/tests/e2e/cards.html?production=1");
  await page.waitForFunction(() => window.__puppyTrackerReady);
  const result = await page.evaluate(async () => {
    const common = await import("/custom_components/puppy_tracker/frontend/puppy-tracker-card-common.js");
    const { recordTypeOptions } = await import("/custom_components/puppy_tracker/frontend/puppy-tracker-dossier-schema.js");
    const select = document.createElement("select");
    select.innerHTML = recordTypeOptions({ language: "nl" }, "custom_care");
    return { missing: [null, undefined, "", " "].map(value => common.formatWeight(value)), zero: common.formatWeight(0), selected: select.value, feeding: select.querySelector('[value="feeding"]').textContent };
  });
  expect(result).toEqual({ missing: ["—", "—", "—", "—"], zero: "0 g", selected: "custom_care", feeding: "Voeding" });
});

for (const [tag, selector, titleSelector] of [
  ["puppy-tracker-recurring-reminder-card", "#rem-type", "#rem-title"],
  ["puppy-tracker-care-program-card", "#care-record-type", "#care-title"],
]) {
  test(`${tag} preserves an imported category and typed title during updates`, async ({ page }) => {
    const card = await mount(page, tag);
    await expect.poll(() => page.evaluate(() => window.updateCallbacks.length)).toBe(1);
    await page.evaluate(() => {
      window.card._editing = { id: "existing", record_type: "custom_care", title: "Original" };
      window.card._showEditor = true;
      window.card._render();
    });
    await expect(card.locator(selector)).toHaveValue("custom_care");
    await expect(card.locator(`${selector} option[value="feeding"]`)).toHaveCount(1);
    await card.locator(titleSelector).fill("Keep my edit");
    await page.evaluate(async () => { for (const cb of window.updateCallbacks) await cb({}); });
    await expect(card.locator(titleSelector)).toHaveValue("Keep my edit");
    await expect(card.locator(titleSelector)).toBeFocused();
  });
}

test("owner linking filters puppies by litter and sends the puppy's litter", async ({ page }) => {
  await page.goto("/tests/e2e/cards.html?production=1");
  await page.waitForFunction(() => window.__puppyTrackerReady);
  await page.evaluate(() => {
    window.calls = [];
    const card = document.createElement("puppy-tracker-owner-card");
    card.setConfig({});
    document.querySelector("#cards").append(card);
    card.hass = {
      language: "en",
      callWS: async (msg) => {
        window.calls.push(msg);
        if (msg.type === "puppy_tracker/owners/list") return { owners: [{ id: "o1", name: "Alex" }] };
        if (msg.type === "puppy_tracker/litters") return { litters: [{ id: "l1", name: "First" }, { id: "l2", name: "Second" }] };
        if (msg.type === "puppy_tracker/data") return { puppies: [{ id: `p-${msg.litter_id}`, name: `Puppy ${msg.litter_id}` }] };
        if (msg.type === "puppy_tracker/owners/link") return {};
        throw new Error(msg.type);
      },
    };
  });
  const card = page.locator("puppy-tracker-owner-card");
  await expect(card.locator("#link-puppy")).toHaveValue("p-l1");
  await card.locator("#link-litter").selectOption("l2");
  await expect(card.locator("#link-puppy")).toHaveValue("p-l2");
  await expect(card.locator("#link-puppy option")).toHaveCount(1);
  await card.locator('[name="linked_owner"]').check();
  await card.locator("#link-save").click();
  await expect.poll(() => page.evaluate(() => window.calls.find(c => c.type === "puppy_tracker/owners/link"))).toMatchObject({ litter_id: "l2", puppy_id: "p-l2", owner_ids: ["o1"] });
});
