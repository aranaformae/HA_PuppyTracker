import { expect, test } from "@playwright/test";

async function mountCare(page, language = "en") {
  await page.goto("/tests/e2e/cards.html?production");
  await page.waitForFunction(() => window.__puppyTrackerReady);
  expect(await page.evaluate(() => window.__puppyTrackerModuleErrors)).toEqual([]);
  await page.evaluate((language) => {
    const date = (offset) => {
      const d = new Date();
      d.setDate(d.getDate() + offset);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };
    window.careDates = [date(0), date(1)];
    window.careState = { skipped: [], calls: [], callbacks: new Set(), occurrences: [
      ...Array.from({ length: 70 }, (_, i) => ({ id: `c${i}`, title: `ENS ${i}`, litter_id: "l1", program_id: "ens", puppy_id: "p1", puppy_name: "Nova", collar_color: "paars", age_days: 3,
        scheduled_date: date(0), status: "due_today", days_until_due: 0, result_fields: ["note"] })),
      { id: "tomorrow", title: "ESI tomorrow", litter_id: "l1", program_id: "esi", puppy_id: "p1", puppy_name: "Nova", collar_color: "paars", age_days: 4,
        scheduled_date: date(1), status: "upcoming", days_until_due: 1, result_fields: ["note"] },
    ] };
    const state = window.careState;
    const hass = window.careHass = { language, locale: { language }, user: { is_admin: true }, states: {},
      connection: { subscribeMessage: async (callback) => { state.callbacks.add(callback); return () => state.callbacks.delete(callback); } },
      callWS: async (msg) => {
        state.calls.push(structuredClone(msg));
        if (msg.type === "puppy_tracker/litters") return { litters: [{ id: "l1", name: "Nest", active: true }, { id: "l2", name: "Other litter", active: true }] };
        if (msg.type === "puppy_tracker/care_occurrences") return { occurrences: structuredClone(state.occurrences), skipped: structuredClone(state.skipped) };
        if (msg.type === "puppy_tracker/care_occurrence/record") {
          state.occurrences = state.occurrences.filter((item) => item.id !== msg.occurrence_id);
          return { record_id: "saved" };
        }
        if (msg.type === "puppy_tracker/data") return { can_manage_records: true, litter: { id: "l1", name: "Nest" }, puppies: [{ id: "p1", name: "Nova", collar_color: "paars" }] };
        throw new Error(msg.type);
      },
    };
    window.refreshCare = async () => { for (const callback of state.callbacks) await callback({}); };
    const card = document.createElement("puppy-tracker-care-execution-card");
    card.setConfig({ litter_id: "l1", max_items: 10 });
    document.querySelector("#cards").append(card);
    card.hass = hass;
  }, language);
  const card = page.locator("puppy-tracker-care-execution-card");
  await expect(card.locator(".rows .row")).toHaveCount(10);
  return card;
}

for (const language of ["nl", "en"]) {
  test(`care retains list, focus, scroll and expanded limit during updates (${language}) @cross-browser @tablet`, async ({ page }) => {
    const card = await mountCare(page, language);
    const counter = card.locator(".list-footer > span");
    await expect(counter).toHaveText(language === "en" ? "10 of 70 care actions" : "10 van 70 zorgacties");
    await card.locator("#show-more").click();
    await expect(card.locator(".rows .row")).toHaveCount(20);
    const before = await card.evaluate((node) => {
      document.querySelector("#cards").style.paddingTop = "600px";
      const spacer = document.createElement("div"); spacer.style.height = "1200px"; document.body.append(spacer);
      window.scrollTo(0, 500);
      window.careListNode = node.shadowRoot.querySelector(".rows");
      window.careFirstNode = window.careListNode.firstElementChild;
      window.careFocusNode = node.shadowRoot.querySelector('[data-care-occurrence="c1"] button');
      window.careFocusNode.focus({ preventScroll: true });
      window.careListNode.scrollTop = 250;
      return { top: window.careListNode.scrollTop, calls: window.careState.calls.length };
    });
    expect(before.top).toBeGreaterThan(0);
    await page.evaluate(() => {
      const node = document.querySelector("puppy-tracker-care-execution-card");
      for (let i = 0; i < 5; i++) node.hass = window.careHass;
    });
    expect(await page.evaluate(() => window.careState.calls.length)).toBe(before.calls);
    await page.evaluate(async () => { window.careState.occurrences[0].title = "ENS updated"; await window.refreshCare(); });
    await expect(card.locator('[data-care-occurrence="c0"] .main strong')).toHaveText("ENS updated");
    expect(await card.evaluate((node) => ({ sameList: node.shadowRoot.querySelector(".rows") === window.careListNode,
      sameRow: node.shadowRoot.querySelector(".rows").firstElementChild === window.careFirstNode,
      focused: node.shadowRoot.activeElement === window.careFocusNode,
      top: node.shadowRoot.querySelector(".rows").scrollTop, pageTop: window.scrollY }))).toEqual({ sameList: true, sameRow: true, focused: true, top: before.top, pageTop: 500 });
    await expect(card.locator(".rows .row")).toHaveCount(20);
    await card.locator('[data-care-occurrence="c10"] .main').click();
    await expect(card.locator(".care-result-dialog")).toBeVisible();
    const saveScroll = await card.locator(".rows").evaluate((node) => node.scrollTop);
    expect(saveScroll).toBeGreaterThan(0);
    await card.locator(".care-result-save").click();
    await expect(card.locator('[data-care-occurrence="c10"]')).toHaveCount(0);
    await expect(card.locator(".rows .row")).toHaveCount(20);
    expect(await card.locator(".rows").evaluate((node) => node.scrollTop)).toBe(saveScroll);
    for (let i = 0; i < 5; i++) await card.locator("#show-more").click();
    await expect(card.locator(".rows .row")).toHaveCount(69);
    await expect(card.locator("#show-more")).toBeHidden();
    await expect(counter).toHaveText(language === "en" ? "69 of 69 care actions" : "69 van 69 zorgacties");
    await card.evaluate((node) => { node.style.width = "380px"; node.style.maxWidth = "100%"; });
    expect(await card.locator("ha-card").evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    await card.screenshot({ path: test.info().outputPath(`care-list-${language}.png`) });
  });

  test(`care surfaces missing birth warnings and clears them after recovery (${language}) @cross-browser @tablet`, async ({ page }) => {
    const card = await mountCare(page, language);
    await page.evaluate(async () => {
      window.careState.occurrences = [];
      window.careState.skipped = [{ puppy_id: "p1", puppy_name: "Nova", collar_color: "paars", reason_code: "missing_birth_time" }];
      await window.refreshCare();
    });
    const warning = card.locator(".care-skipped-warning");
    await expect(warning).toContainText("Nova (paars)");
    await expect(warning).toContainText(language === "en" ? "birth time is missing" : "geboortetijd ontbreekt");
    await expect(card.locator(".empty")).toHaveCount(0);
    await page.evaluate(async () => { window.careState.skipped = []; await window.refreshCare(); });
    await expect(warning).toHaveCount(0);
    await expect(card.locator(".empty")).toBeVisible();
  });
}

test("care completion keeps an empty selected day and restores a fresh list per date @cross-browser @tablet", async ({ page }) => {
  const card = await mountCare(page);
  await card.locator("#show-more").click();
  await expect(card.locator(".rows .row")).toHaveCount(20);
  const tomorrow = await page.evaluate(() => window.careDates[1]);
  await card.locator("#day-select").selectOption(tomorrow);
  await expect(card.locator(".rows .row")).toHaveCount(1);
  await card.locator('[data-care-occurrence="tomorrow"] .main').click();
  await card.locator(".care-result-note").fill("Calm reaction");
  await page.evaluate(async () => { await window.refreshCare(); });
  await expect(card.locator(".care-result-note")).toHaveValue("Calm reaction");
  await card.locator(".care-result-save").click();
  await expect(card.locator(".care-result-dialog")).toHaveCount(0);
  await expect(card.locator("#day-select")).toHaveValue(tomorrow);
  await expect(card.locator(".rows .row")).toHaveCount(0);
  await expect(card.locator(".care-save-feedback")).toContainText("Nova (paars)");
  const calls = await page.evaluate(() => window.careState.calls.filter((msg) => msg.type === "puppy_tracker/care_occurrence/record"));
  expect(calls).toEqual([expect.objectContaining({ puppy_id: "p1", occurrence_id: "tomorrow", note: "Calm reaction", status: "completed" })]);
  await card.locator("#previous-day").click();
  await expect(card.locator(".rows .row")).toHaveCount(10);
  expect(await card.locator(".rows").evaluate((node) => node.scrollTop)).toBe(0);
});

test("care config changes reload their context and reject stale responses", async ({ page }) => {
  const card = await mountCare(page);
  const result = await card.evaluate(async (node) => {
    const calls = window.careState.calls.length;
    node.setConfig({ ...node._config, days_ahead: 30 });
    await Promise.resolve();
    const configReloaded = window.careState.calls.length > calls;
    const pending = [];
    node._hass = { ...window.careHass, callWS: (message) => new Promise((resolve) => pending.push({ message, resolve })) };
    node._selectedLitterId = "l1";
    const first = node._loadOccurrences();
    node._selectedLitterId = "l2";
    const second = node._loadOccurrences();
    pending[1].resolve({ occurrences: [{ id: "fresh", title: "New litter", status: "due_today" }], skipped: [] });
    await second;
    pending[0].resolve({ occurrences: [{ id: "stale", title: "Old litter", status: "due_today" }], skipped: [{ puppy_id: "old", reason_code: "missing_birth_time" }] });
    await first;
    return { configReloaded, ids: node._occurrences.map((item) => item.id), skipped: node.__careSkipped };
  });
  expect(result).toEqual({ configReloaded: true, ids: ["fresh"], skipped: [] });
});
