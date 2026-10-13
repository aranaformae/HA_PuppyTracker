import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

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
  const card = await mount(page, "puppy-tracker-timeline-card", { default_selected: "mother" });
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
  const card = await mount(page, "puppy-tracker-temperature-card", { default_selected: "puppy" });
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
  const card = await mount(page, "puppy-tracker-temperature-card", { default_selected: "puppy", history_limit: 3 });
  await expect(card.locator(".history-row")).toHaveCount(3);
  await card.locator("#temperature-history-more").click();
  await expect(card.locator(".history-row")).toHaveCount(12);
});

test("temperature cannot fall back to the litter when no puppy exists", async ({ page }) => {
  const card = await mount(page, "puppy-tracker-temperature-card", { default_selected: "puppy" }, { puppies: [] });
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

test("owner dates and stored values are labeled and localized", async ({ page }) => {
  await page.goto("/tests/e2e/cards.html?production=1");
  await page.waitForFunction(() => window.__puppyTrackerReady);
  await page.evaluate(() => {
    window.calls = [];
    const owner = {
      id: "o1", name: "Alex", role: "owner", placement_status: "reserved",
      placement_date: "2026-09-01", expected_pickup_date: "2026-10-01",
      payment_status: "deposit", payment_amount: "2500", registration_fee_amount: "250",
      deposit_amount: "500", deposit_date: "2026-09-02", payment_balance: "1400",
      payment_method: "bank_transfer", payment_date: "2026-09-20",
      notes: "A long note that must remain completely visible.",
    };
    const card = document.createElement("puppy-tracker-owner-card");
    card.setConfig({});
    document.querySelector("#cards").append(card);
    card.hass = {
      language: "en", locale: { language: "en" },
      callWS: async (message) => {
        window.calls.push(message);
        if (message.type === "puppy_tracker/owners/list") return { owners: [owner] };
        if (message.type === "puppy_tracker/litters") return { litters: [] };
        if (message.type === "puppy_tracker/owners/save") return { owner };
        throw new Error(message.type);
      },
    };
  });
  const card = page.locator("puppy-tracker-owner-card");
  await card.locator("[data-toggle-owner='o1']").click();
  await expect(card.locator(".owner-detail")).toContainText("Reserved");
  await expect(card.locator(".owner-detail")).toContainText("Registration fee");
  await expect(card.locator(".owner-detail .notes")).toContainText("A long note that must remain completely visible.");
  await card.locator("[data-edit='o1']").click();
  await expect(card.locator('label:has-text("Placement date") input[name="placement_date"]')).toHaveValue("2026-09-01");
  await expect(card.locator('label:has-text("Expected pickup date") input[name="expected_pickup_date"]')).toHaveValue("2026-10-01");
  await expect(card.locator('input[name="deposit_date"]')).toHaveValue("2026-09-02");
  await expect(card.locator('input[name="payment_date"]')).toHaveValue("2026-09-20");
  await expect(card.locator("#final-payment-amount")).toHaveText("1750");
  await card.locator('input[name="deposit_amount"]').fill("600");
  await expect(card.locator("#final-payment-amount")).toHaveText("1650");
  await card.locator(".owner-editor form button[type='submit']").click();
  await expect.poll(() => page.evaluate(() => window.calls.find((message) => message.type === "puppy_tracker/owners/save"))).toMatchObject({
    owner_id: "o1",
    expected_pickup_date: "2026-10-01",
    payment_amount: "2500",
    registration_fee_amount: "250",
    deposit_amount: "600",
    deposit_date: "2026-09-02",
    payment_balance: "1400",
  });
});

test("owner CSV is comma-separated, keeps unlinked owners and exports one row per puppy link", async ({ page }) => {
  await page.goto("/tests/e2e/cards.html?production=1");
  await page.waitForFunction(() => window.__puppyTrackerReady);
  await page.evaluate(() => {
    const owners = [
      {
        id: "owner-alex",
        name: "Alex",
        email: "alex@example.com",
        phone: "+31612345678",
        address: "Main street 1, Amsterdam",
        role: "owner",
        contact_preference: "email",
        placement_status: "reserved",
        placement_date: "2026-09-01",
        expected_pickup_date: "2026-10-01",
        payment_status: "registration_fee",
        payment_date: "2026-09-20",
        payment_amount: "2500",
        registration_fee_amount: "250",
        deposit_amount: "500",
        deposit_date: "2026-09-02",
        payment_balance: "1400",
        payment_method: "bank_transfer",
        notes: 'Contract "signed"; ready, paid',
        status_history: [{ status: "interested", changed_at: "2026-08-01T10:00:00Z" }],
      },
      {
        id: "owner-blair",
        name: "Blair",
        email: "blair@example.com",
        role: "co_owner",
        placement_status: "interested",
        payment_status: "none",
        payment_method: "none",
        contact_preference: "none",
      },
    ];
    const card = document.createElement("puppy-tracker-owner-card");
    card.setConfig({});
    document.querySelector("#cards").append(card);
    card.hass = {
      language: "en", locale: { language: "en" },
      callWS: async (message) => {
        if (message.type === "puppy_tracker/owners/list") return { owners };
        if (message.type === "puppy_tracker/litters") return { litters: [
          { id: "l1", name: "First", birth_date: "2026-06-01", mother: "Luna", father: "Max" },
          { id: "l2", name: "Second", birth_date: "2026-07-02", mother: "Nova", father: "Cooper" },
        ] };
        if (message.type === "puppy_tracker/data" && message.litter_id === "l1") {
          return { puppies: [{ id: "p1", name: "Red", birth_time: "2026-06-01T03:15:00+02:00", collar_color: "red", chip_number: "0001", owner_ids: ["owner-alex"] }] };
        }
        if (message.type === "puppy_tracker/data" && message.litter_id === "l2") {
          return { puppies: [{ id: "p2", name: "Blue", collar_color: "blue", chip_number: "0002", owner_ids: ["owner-alex"] }] };
        }
        throw new Error(message.type);
      },
    };
  });

  const card = page.locator("puppy-tracker-owner-card");
  await expect(card.locator("#export-owners-csv")).toBeEnabled();
  const downloadPromise = page.waitForEvent("download");
  await card.locator("#export-owners-csv").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^puppy-tracker-owners-\d{8}T\d{6}Z\.csv$/);
  const content = await readFile(await download.path(), "utf8");

  expect(content.charCodeAt(0)).toBe(0xfeff);
  const header = content.slice(1).split("\r\n")[0];
  expect(header).toContain('"Name","Email","Phone","Address","Role"');
  expect(header).toContain('"Expected pickup date"');
  expect(header).toContain('"Final payment (calculated)","Actual outstanding amount"');
  expect(header).toContain('"Puppy name","Puppy birth date","Puppy collar color"');
  expect(header).toContain('"Puppy father","Puppy mother"');
  expect(header).not.toContain('";"');
  expect(content).toContain('"Main street 1, Amsterdam"');
  expect(content).toContain('"Contract ""signed""; ready, paid"');
  expect(content).toContain('"First","Red","2026-06-01","red","0001","Max","Luna"');
  expect(content).toContain('"Second","Blue","2026-07-02","blue","0002","Cooper","Nova"');
  expect(content).toContain('"2500","250","500","2026-09-02","1750","1400"');
  expect(content.match(/"Alex",/g)).toHaveLength(2);
  expect(content.match(/"Blair",/g)).toHaveLength(1);
  const blairRow = content.split("\r\n").find((row) => row.startsWith('"Blair",'));
  expect(blairRow).toMatch(/(?:,""){7}$/);
  expect(content).not.toContain("owner-alex");
  expect(content).not.toContain("owner-blair");
  await expect(card.locator("#owner-status")).toHaveText("Owner CSV downloaded.");

  await card.evaluate((element) => element.setConfig({ csv_delimiter: "semicolon" }));
  const semicolonDownloadPromise = page.waitForEvent("download");
  await card.locator("#export-owners-csv").click();
  const semicolonDownload = await semicolonDownloadPromise;
  const semicolonContent = await readFile(await semicolonDownload.path(), "utf8");
  const semicolonHeader = semicolonContent.slice(1).split("\r\n")[0];
  expect(semicolonHeader).toContain('"Name";"Email";"Phone";"Address";"Role"');
  expect(semicolonHeader).not.toContain('","');
});

test("@mobile @tablet owner actions stay within the card", async ({ page }) => {
  await page.goto("/tests/e2e/cards.html?production=1");
  await page.waitForFunction(() => window.__puppyTrackerReady);
  await page.evaluate(() => {
    const card = document.createElement("puppy-tracker-owner-card");
    card.setConfig({});
    document.querySelector("#cards").append(card);
    card.hass = {
      language: "nl", locale: { language: "nl" },
      callWS: async (message) => {
        if (message.type === "puppy_tracker/owners/list") return { owners: [{ id: "o1", name: "Alex" }] };
        if (message.type === "puppy_tracker/litters") return { litters: [] };
        throw new Error(message.type);
      },
    };
  });

  const card = page.locator("puppy-tracker-owner-card");
  await expect(card.locator("#export-owners-csv")).toBeEnabled();
  await expect(card.locator("#add-owner")).toBeVisible();
  const widths = await card.evaluate((element) => {
    const surface = element.querySelector("ha-card");
    return { client: surface.clientWidth, scroll: surface.scrollWidth };
  });
  expect(widths.scroll).toBeLessThanOrEqual(widths.client + 1);
});
