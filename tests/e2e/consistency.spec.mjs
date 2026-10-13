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

async function mountOwnerMatrix(page, { width = "" } = {}) {
  await page.goto("/tests/e2e/cards.html?production=1");
  await page.waitForFunction(() => window.__puppyTrackerReady);
  await page.evaluate(({ width }) => {
    const owners = [
      {
        id: "o1", name: "Family Jansen", role: "owner", placement_status: "interested",
        puppy_preferences: [
          { puppy_id: "p1", note: "Calm match for the children" },
          { puppy_id: "p2", note: "Strong second choice" },
        ],
      },
      {
        id: "o2", name: "Family De Boer", role: "owner", placement_status: "option",
        puppy_preferences: [
          { puppy_id: "p1", note: "Best connection during the visit" },
          { puppy_id: "p3", note: null },
        ],
      },
      { id: "o3", name: "Family Smit", role: "co_owner", placement_status: "reserved", puppy_preferences: [] },
      {
        id: "o4", name: "Family Placed", role: "owner", placement_status: "sold",
        puppy_preferences: [{ puppy_id: "p2", note: "Placement completed" }],
      },
    ];
    const card = document.createElement("puppy-tracker-owner-card");
    if (width) card.style.width = width;
    card.setConfig({ default_view: "matrix" });
    document.querySelector("#cards").append(card);
    card.hass = {
      language: "en", locale: { language: "en" },
      callWS: async (message) => {
        if (message.type === "puppy_tracker/owners/list") return { owners };
        if (message.type === "puppy_tracker/litters") return { litters: [{ id: "l1", name: "Milky Way" }] };
        if (message.type === "puppy_tracker/data") return { litter: { id: "l1", name: "Milky Way" }, puppies: [
          { id: "p1", name: "Nova", collar_color: "Roze", owner_ids: [] },
          { id: "p2", name: "Boris", collar_color: "Blauw", owner_ids: ["o1"] },
          { id: "p3", name: "Pip", collar_color: "Groen", owner_ids: [] },
        ] };
        throw new Error(message.type);
      },
    };
  }, { width });
  return page.locator("puppy-tracker-owner-card");
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
      street: "Main Street 1", postal_code: "1234 AB", city: "Amsterdam",
      placement_date: "2026-09-01", expected_pickup_date: "2026-10-01",
      payment_status: "deposit", payment_amount: "2500", registration_fee_amount: "250",
      deposit_amount: "500", deposit_date: "2026-09-02", payment_balance: "1400",
      payment_method: "bank_transfer", payment_date: "2026-09-20",
      puppy_preferences: [
        { puppy_id: "p1", note: "Best temperament match" },
        { puppy_id: "p2", note: "Second choice" },
      ],
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
        if (message.type === "puppy_tracker/litters") return { litters: [{ id: "l1", name: "Milky Way" }] };
        if (message.type === "puppy_tracker/data") return { puppies: [
          { id: "p1", name: "Red", owner_ids: [] },
          { id: "p2", name: "Blue", owner_ids: [] },
          { id: "p3", name: "Green", owner_ids: [] },
        ] };
        if (message.type === "puppy_tracker/owners/save") return { owner };
        throw new Error(message.type);
      },
    };
  });
  const card = page.locator("puppy-tracker-owner-card");
  await card.locator("[data-toggle-owner='o1']").click();
  await expect(card.locator(".owner-detail")).toContainText("Reserved");
  await expect(card.locator(".owner-detail")).toContainText("Registration fee");
  await expect(card.locator(".owner-detail")).toContainText("Main Street 1");
  await expect(card.locator(".owner-detail")).toContainText("1234 AB");
  await expect(card.locator(".owner-detail")).toContainText("1st preference");
  await expect(card.locator(".owner-detail")).toContainText("Milky Way · Red");
  await expect(card.locator(".owner-detail")).toContainText("Best temperament match");
  await expect(card.locator(".owner-detail .notes")).toContainText("A long note that must remain completely visible.");
  await card.locator("[data-edit='o1']").click();
  await expect(card.locator('label:has-text("Placement date") input[name="placement_date"]')).toHaveValue("2026-09-01");
  await expect(card.locator('label:has-text("Expected pickup date") input[name="expected_pickup_date"]')).toHaveValue("2026-10-01");
  await expect(card.locator('input[name="deposit_date"]')).toHaveValue("2026-09-02");
  await expect(card.locator('input[name="payment_date"]')).toHaveValue("2026-09-20");
  await expect(card.locator('input[name="street"]')).toHaveValue("Main Street 1");
  await expect(card.locator('input[name="postal_code"]')).toHaveValue("1234 AB");
  await expect(card.locator('input[name="city"]')).toHaveValue("Amsterdam");
  await expect(card.locator('select[name="preference_puppy_1"]')).toHaveValue("p1");
  await expect(card.locator('input[name="preference_note_1"]')).toHaveValue("Best temperament match");
  await expect(card.locator('select[name="preference_puppy_2"]')).toHaveValue("p2");
  await expect(card.locator("#final-payment-amount")).toHaveText("1750");
  await card.locator('input[name="deposit_amount"]').fill("600");
  await card.locator('input[name="preference_note_1"]').fill("Best match after second visit");
  await expect(card.locator("#final-payment-amount")).toHaveText("1650");
  await card.locator(".owner-editor form button[type='submit']").click();
  await expect.poll(() => page.evaluate(() => window.calls.find((message) => message.type === "puppy_tracker/owners/save"))).toMatchObject({
    owner_id: "o1",
    street: "Main Street 1",
    postal_code: "1234 AB",
    city: "Amsterdam",
    expected_pickup_date: "2026-10-01",
    payment_amount: "2500",
    registration_fee_amount: "250",
    deposit_amount: "600",
    deposit_date: "2026-09-02",
    payment_balance: "1400",
    puppy_preferences: [
      { puppy_id: "p1", note: "Best match after second visit" },
      { puppy_id: "p2", note: "Second choice" },
    ],
  });
  expect(await page.evaluate(() => {
    const saved = window.calls.find((message) => message.type === "puppy_tracker/owners/save");
    return Object.keys(saved).filter((key) => key.startsWith("preference_"));
  })).toEqual([]);
});

test("owner preference matrix compares ranks, conflicts, notes and existing links", async ({ page }) => {
  const card = await mountOwnerMatrix(page);

  await expect(card.locator("#matrix-view")).toHaveAttribute("aria-selected", "true");
  await expect(card.locator(".matrix-desktop .preference-matrix tbody tr")).toHaveCount(3);
  await expect(card.locator(".matrix-desktop .preference-matrix thead th")).toHaveCount(4);
  await expect(card.locator(".matrix-desktop .matrix-cell.conflict")).toHaveCount(2);
  await expect(card.locator(".matrix-summary > div").nth(0)).toContainText("1");
  await expect(card.locator(".matrix-summary > div").nth(2)).toContainText("1");
  await expect(card.locator(".matrix-summary > div").nth(3)).toContainText("1");
  await expect(card.locator(".matrix-desktop .collar-swatch").first()).toHaveCSS("background-color", "rgb(236, 64, 122)");

  await card.locator('.matrix-desktop [data-matrix-owner="o1"][data-matrix-puppy="p1"]').click();
  await expect(card.locator("#matrix-detail")).toContainText("Calm match for the children");
  await expect(card.locator("#matrix-detail")).toContainText("Not linked");

  await card.locator('.matrix-desktop [data-matrix-owner="o1"][data-matrix-puppy="p2"]').click();
  await expect(card.locator("#matrix-detail")).toContainText("Strong second choice");
  await expect(card.locator("#matrix-detail")).toContainText("Linked");

  await card.locator("#matrix-only-conflicts").check();
  await expect(card.locator(".matrix-desktop .preference-matrix thead th")).toHaveCount(2);
  await expect(card.locator(".matrix-desktop .preference-matrix tbody tr")).toHaveCount(2);
  await card.locator("#matrix-only-conflicts").uncheck();
  await card.locator("#matrix-show-resolved").check();
  await expect(card.locator(".matrix-desktop .preference-matrix tbody tr")).toHaveCount(4);

  await card.locator('.matrix-desktop [data-matrix-owner="o1"][data-matrix-puppy="p1"]').click();
  await card.locator("#matrix-detail [data-matrix-edit-owner='o1']").click();
  await expect(card.locator("#owners-view")).toHaveAttribute("aria-selected", "true");
  await expect(card.locator('input[name="name"]')).toHaveValue("Family Jansen");
});

test("@mobile @tablet owner preference matrix becomes a pup-focused list in a narrow card", async ({ page }) => {
  const card = await mountOwnerMatrix(page, { width: "min(390px, 100%)" });

  await expect(card.locator(".matrix-mobile")).toBeVisible();
  await expect(card.locator(".matrix-desktop")).toBeHidden();
  await expect(card.locator("#matrix-puppy")).toHaveValue("p1");
  await expect(card.locator(".mobile-match")).toHaveCount(2);
  await expect(card.locator(".mobile-match.conflict")).toHaveCount(2);

  await card.locator("#matrix-puppy").selectOption("p2");
  await expect(card.locator(".mobile-match")).toHaveCount(1);
  await expect(card.locator(".mobile-match")).not.toContainText("Strong second choice");
  await card.locator(".mobile-match").click();
  await expect(card.locator(".mobile-match-detail:not([hidden])")).toContainText("Strong second choice");
  await expect(card.locator(".mobile-match-detail:not([hidden])")).toContainText("Linked");
  await card.locator(".mobile-match").click();
  await expect(card.locator(".mobile-match-detail")).toBeHidden();

  await card.locator('[data-matrix-perspective="owner"]').click();
  await card.locator("#matrix-owner").selectOption("o1");
  await expect(card.locator(".mobile-match")).toHaveCount(2);
  await expect(card.locator(".mobile-match").first()).toContainText("Nova");
  await expect(card.locator(".mobile-match").last()).toContainText("Boris");
  await expect(card.locator('.mobile-match .rank').first()).toHaveText("1");
  const row = card.locator('.mobile-match[data-matrix-puppy="p2"]');
  await expect(row.locator('[icon="mdi:link-variant"]')).toBeVisible();
  await card.evaluate((element) => { element.querySelector(".mobile-match").dataset.stableNode = "yes"; });
  await row.click();
  await expect(card.locator('.mobile-match[data-stable-node="yes"]')).toHaveCount(1);
  await expect(card.locator(".mobile-match-detail:not([hidden])")).toContainText("Strong second choice");
  await card.screenshot({ path: `/tmp/puppy-matrix-${test.info().project.name}.png` });
  await card.locator("#matrix-owner").selectOption("o3");
  await expect(card.locator(".mobile-match")).toHaveCount(0);
  await expect(card.locator(".mobile-matches")).toContainText("No puppy preferences recorded");
  await card.locator("#matrix-only-conflicts").check();
  await expect(card.locator('#matrix-owner option')).toHaveCount(2);

  const widths = await card.evaluate((element) => {
    const surface = element.querySelector("ha-card");
    return { client: surface.clientWidth, scroll: surface.scrollWidth };
  });
  expect(widths.scroll).toBeLessThanOrEqual(widths.client + 1);
});

test("wide owner matrix keeps table geometry stable beside the details", async ({ page }) => {
  const card = await mountOwnerMatrix(page, { width: "1100px" });
  await expect(card.locator(".matrix-desktop tbody tr")).toHaveCount(3);
  const table = card.locator(".matrix-scroll");
  const before = await table.boundingBox();
  await card.locator('.matrix-desktop [data-matrix-owner="o1"][data-matrix-puppy="p1"]').click();
  const after = await table.boundingBox();
  expect(after).toEqual(before);
  const detail = await card.locator("#matrix-detail").boundingBox();
  expect(detail.x).toBeGreaterThanOrEqual(after.x + after.width);
  await card.screenshot({ path: "/tmp/puppy-matrix-desktop.png" });
});

test("owner contract CSV refreshes parent chips before download and stops on refresh failure", async ({ page }) => {
  await page.goto("/tests/e2e/cards.html?production=1");
  await page.waitForFunction(() => window.__puppyTrackerReady);
  await page.evaluate(() => {
    window.contractChips = { mother: "", father: "", fail: false };
    const card = document.createElement("puppy-tracker-owner-card");
    card.setConfig({});
    document.querySelector("#cards").append(card);
    card.hass = {
      language: "nl", locale: { language: "nl" },
      callWS: async (message) => {
        if (window.contractChips.fail) throw new Error("Contractgegevens niet beschikbaar");
        if (message.type === "puppy_tracker/owners/list") return { owners: [{ id: "owner1", name: "Alex" }] };
        if (message.type === "puppy_tracker/litters") return { litters: [{ id: "l1", name: "Nest" }] };
        if (message.type === "puppy_tracker/data") return {
          litter: {
            id: "l1", name: "Nest", mother: "Luna", father: "Max",
            mother_details: { chip_number: window.contractChips.mother },
            father_details: { chip_number: window.contractChips.father },
          },
          puppies: [{ id: "p1", name: "Rood", owner_ids: ["owner1"] }],
        };
        throw new Error(message.type);
      },
    };
  });
  const card = page.locator("puppy-tracker-owner-card");
  await expect(card.locator("#export-owners-csv")).toBeEnabled();
  await page.evaluate(() => Object.assign(window.contractChips, {
    father: "000987654321098", mother: "000123456789012",
  }));
  const downloadPromise = page.waitForEvent("download");
  await card.locator("#export-owners-csv").click();
  const content = await readFile(await (await downloadPromise).path(), "utf8");
  const [header, row] = content.trim().split("\r\n").map((line) => line.split(","));
  expect(row[header.indexOf('"Chipnummer vader"')]).toBe('"000987654321098"');
  expect(row[header.indexOf('"Chipnummer moeder"')]).toBe('"000123456789012"');
  await page.evaluate(() => { window.contractChips.fail = true; });
  const downloads = [];
  page.on("download", (download) => downloads.push(download));
  await card.locator("#export-owners-csv").click();
  await expect(card.locator("#owner-error")).toHaveText("Contractgegevens niet beschikbaar");
  expect(downloads).toHaveLength(0);
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
        street: "Main street 1",
        postal_code: "1234 AB",
        city: "Amsterdam",
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
        puppy_preferences: [{ puppy_id: "p2", note: "Preferred coat and temperament" }],
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
          { id: "l1", name: "First", birth_date: "2026-06-01", mother: "Luna", mother_details: { registered_name: "Mother Registered", birth_date: "2022-01-02", breed: "Multi-generation Australian Labradoodle", wala_number: "WALA-M", chip_number: "000123456789012" }, father: "Max", father_details: { registered_name: "Father Registered", birth_date: "2021-01-02", breed: "Multi-generation Australian Labradoodle", wala_number: "WALA-F", chip_number: "000987654321098" } },
          { id: "l2", name: "Second", birth_date: "2026-07-02", mother: "Nova", mother_details: { registered_name: "Second Mother", breed: "Multi-generation Australian Labradoodle" }, father: "Cooper", father_details: { registered_name: "Second Father", breed: "Multi-generation Australian Labradoodle" } },
        ] };
        if (message.type === "puppy_tracker/data" && message.litter_id === "l1") {
          return { puppies: [{ id: "p1", name: "Red", registered_name: "Milky Way Red", birth_time: "2026-06-01T03:15:00+02:00", sex: "male", coat_color: "Caramel", collar_color: "red", breed: "Multi-generation Australian Labradoodle", chip_number: "0001", owner_ids: ["owner-alex"] }] };
        }
        if (message.type === "puppy_tracker/data" && message.litter_id === "l2") {
          return { puppies: [{ id: "p2", name: "Blue", registered_name: "Milky Way Blue", coat_color: "Chocolate", collar_color: "blue", breed: "Multi-generation Australian Labradoodle", chip_number: "0002", owner_ids: ["owner-alex"] }] };
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
  expect(header).toContain('"Name","Email","Phone","Street and house number","Postal code","City","Role"');
  expect(header).toContain('"Expected pickup date"');
  expect(header).toContain('"1st preference puppy","1st preference note","2nd preference puppy","2nd preference note","3rd preference puppy","3rd preference note"');
  expect(header).toContain('"Final payment (calculated)","Actual outstanding amount"');
  expect(header).toContain('"Puppy registered name","Puppy call name","Puppy birth date","Puppy sex","Puppy coat color","Puppy collar color"');
  expect(header).toContain('"Father registered name","Father call name","Father birth date","Father breed / type","Father WALA","Father chip number"');
  expect(header).toContain('"Mother registered name","Mother call name","Mother birth date","Mother breed / type","Mother WALA","Mother chip number"');
  expect(header).not.toContain('";"');
  expect(content).toContain('"Main street 1","1234 AB","Amsterdam"');
  expect(content).toContain('"Second · Blue","Preferred coat and temperament"');
  expect(content).toContain('"Contract ""signed""; ready, paid"');
  expect(content).toContain('"First","Milky Way Red","Red","2026-06-01","Male","Caramel","red","0001","Multi-generation Australian Labradoodle","Father Registered","Max"');
  expect(content).toContain('"WALA-F","000987654321098","Mother Registered","Luna","2022-01-02","Multi-generation Australian Labradoodle","WALA-M","000123456789012"');
  expect(content).toContain('"Second","Milky Way Blue","Blue","2026-07-02"');
  expect(content).toContain('"2500","250","500","2026-09-02","1750","1400"');
  expect(content.match(/"Alex",/g)).toHaveLength(2);
  expect(content.match(/"Blair",/g)).toHaveLength(1);
  const blairRow = content.split("\r\n").find((row) => row.startsWith('"Blair",'));
  expect(blairRow).toMatch(/(?:,""){19}$/);
  expect(content).not.toContain("owner-alex");
  expect(content).not.toContain("owner-blair");
  await expect(card.locator("#owner-status")).toHaveText("Owner CSV downloaded.");

  await card.evaluate((element) => element.setConfig({ csv_delimiter: "semicolon" }));
  const semicolonDownloadPromise = page.waitForEvent("download");
  await card.locator("#export-owners-csv").click();
  const semicolonDownload = await semicolonDownloadPromise;
  const semicolonContent = await readFile(await semicolonDownload.path(), "utf8");
  const semicolonHeader = semicolonContent.slice(1).split("\r\n")[0];
  expect(semicolonHeader).toContain('"Name";"Email";"Phone";"Street and house number";"Postal code";"City";"Role"');
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
