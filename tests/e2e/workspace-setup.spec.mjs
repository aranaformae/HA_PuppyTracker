import { expect, test } from "@playwright/test";

async function mount(page, { preset = "home", language = "nl", admin = true, visible = true, automatic = true, steps = {} } = {}) {
  await page.goto("/tests/e2e/cards.html?production=1");
  await page.waitForFunction(() => window.__puppyTrackerReady === true);
  await page.evaluate(({ preset, language, admin, visible, automatic, steps }) => {
    const state = window.__setup = {
      visible, automatic, steps: { litter: true, mother: true, puppies: true, weighing: false, backup: false, ...steps },
      callbacks: new Set(), calls: [], hold: false, pending: [],
    };
    const result = (message) => {
      if (Object.hasOwn(message, "visible")) { state.visible = message.visible; state.automatic = false; }
      if (state.automatic && Object.values(state.steps).every(Boolean)) state.visible = false;
      return { visible: state.visible, litter_id: message.litter_id || "a", litter_name: `Nest ${message.litter_id || "a"}`, steps: { ...state.steps }, complete: Object.values(state.steps).every(Boolean) };
    };
    const hass = {
      user: { id: "admin", is_admin: admin }, language, locale: { language }, states: {},
      connection: { subscribeMessage: async (callback) => {
        state.callbacks.add(callback);
        return async () => state.callbacks.delete(callback);
      } },
      callWS: async (message) => {
        state.calls.push(structuredClone(message));
        if (message.type === "puppy_tracker/onboarding") {
          const value = result(message);
          if (state.hold) return new Promise((resolve, reject) => state.pending.push({ message, resolve: () => resolve(value), reject }));
          return value;
        }
        if (message.type === "puppy_tracker/onboarding/backup") {
          if (state.failBackup) throw new Error("Export failed");
          state.steps.backup = true;
          const exported = { content: "{}", mime_type: "application/json", filename: "full-backup.json", encoding: "text" };
          if (state.holdBackup) return new Promise((resolve) => { state.finishBackup = () => resolve(exported); });
          return exported;
        }
        if (message.type === "puppy_tracker/litters") return { litters: ["a", "b"].map((id) => ({ id, name: `Nest ${id}`, active: true })) };
        if (message.type === "puppy_tracker/data") return { can_manage_records: true, litter: { id: message.litter_id, name: `Nest ${message.litter_id}`, mother: "Luna", records: [] }, puppies: [{ id: `${message.litter_id}1`, name: "Nova", collar_color: "paars", active: true, records: [], measurements: [] }], summary: {}, session: null };
        if (message.type === "puppy_tracker/recurring_reminders") return { reminders: [] };
        throw new Error(`Unexpected request: ${message.type}`);
      },
    };
    const card = document.createElement("puppy-tracker-workspace-card");
    card.setConfig({ preset, show_summary: false, default_tab: preset === "mobile" ? "quickLog" : "today" });
    document.querySelector("#cards").append(card);
    card.hass = hass;
    state.card = card;
    state.hass = hass;
  }, { preset, language, admin, visible, automatic, steps });
  const card = page.locator("puppy-tracker-workspace-card");
  if (admin && ["home", "mobile"].includes(preset)) await expect.poll(() => card.evaluate((el) => Boolean(el._setup._data))).toBe(true);
  return card;
}

test("existing litters have an opt-in checklist, with no hidden background subscription @cross-browser @tablet", async ({ page }) => {
  const card = await mount(page, { visible: false });
  await expect(card.locator(".setup-panel")).toHaveCount(0);
  expect(await card.evaluate((el) => el._setup._unsubscribe)).toBe(null);
  await card.getByRole("button", { name: "Aan de slag", exact: true }).click();
  await expect(card.locator(".setup-panel")).toBeVisible();
  await expect(card.locator('[data-setup-step="mother"]')).toHaveAttribute("data-complete", "true");
  await card.getByRole("button", { name: "Checklist verbergen" }).click();
  await expect(card.locator(".setup-panel")).toHaveCount(0);
  await expect.poll(() => card.evaluate((el) => el._setup._unsubscribe)).toBe(null);
});

for (const language of ["nl", "en"]) {
  test(`checklist derives progress and automatically finishes after a real backup (${language}) @cross-browser @tablet`, async ({ page }) => {
    const card = await mount(page, { language, steps: { weighing: true } });
    const download = page.waitForEvent("download");
    await card.locator('[data-setup-action="next"]').click();
    expect((await download).suggestedFilename()).toBe("full-backup.json");
    await expect(card.locator(".setup-panel")).toHaveCount(0);
    await card.locator('[data-setup-action="show"]').click();
    await expect(card.locator(".setup-head small")).toHaveText("5 / 5");
    await expect(card.locator('[data-setup-action="next"]')).toHaveCount(0);
    expect(await page.evaluate(() => window.__setup.calls.filter((call) => call.type.endsWith("onboarding/backup")).length)).toBe(1);
  });
}

test("setup actions navigate to HA integration settings without assuming a dashboard address @cross-browser", async ({ page }) => {
  const card = await mount(page, { steps: { mother: false } });
  await card.evaluate((el) => el.addEventListener("hass-navigate", (event) => { window.__navigation = event.detail.navigation_path; }));
  await card.locator('[data-setup-action="next"]').click();
  expect(await page.evaluate(() => window.__navigation)).toBe("/config/integrations/integration/puppy_tracker");
});

test("home opens the existing weighing surface in a bounded dialog and retains it on initial litter announcement @cross-browser @tablet", async ({ page }) => {
  const card = await mount(page);
  const today = await card.locator("puppy-tracker-today-card").elementHandle();
  await card.locator('[data-setup-action="next"]').click();
  await expect(card.locator("dialog[open]")).toBeVisible();
  const config = await card.locator("dialog puppy-tracker-card").evaluate((el) => el._config);
  expect(config).toMatchObject({ litter_id: "a", show_litter_selector: false });
  await card.locator("dialog puppy-tracker-card").evaluate((el) => el.dispatchEvent(new CustomEvent("puppy-tracker-litter-change", { bubbles: true, composed: true, detail: { litterId: "a" } })));
  await expect(card.locator("dialog[open]")).toBeVisible();
  expect(await card.evaluate((el) => el._tabs)).toEqual(["today", "attention", "puppies"]);
  await card.locator("dialog").getByRole("button", { name: "Sluiten", exact: true }).click();
  await expect(card.locator("dialog")).toHaveCount(0);
  expect(await today.evaluate((el) => el.isConnected)).toBe(false);
});

test("mobile reuses its own Weigh tab without changing the preset @cross-browser @tablet", async ({ page }) => {
  const card = await mount(page, { preset: "mobile" });
  await card.locator('[data-setup-action="next"]').click();
  expect(await card.evaluate((el) => ({ preset: el._preset, tab: el._tab }))).toEqual({ preset: "mobile", tab: "weighing" });
  await expect(card.locator("dialog")).toHaveCount(0);
});

test("background checklist updates preserve the Quick Log draft, focus, DOM and page position @cross-browser @tablet", async ({ page }) => {
  const card = await mount(page, { preset: "mobile" });
  const quick = card.locator("puppy-tracker-quick-log-card");
  await quick.locator("[data-preset]").first().click();
  await quick.locator("#quick-note").fill("Keep this draft");
  const input = await quick.locator("#quick-note").elementHandle();
  await page.evaluate(() => { document.querySelector("#cards").style.paddingTop = "500px"; window.scrollTo(0, 400); });
  const scroll = await page.evaluate(() => window.scrollY);
  await page.evaluate(() => { window.__setup.steps.weighing = true; for (const callback of window.__setup.callbacks) callback({}); });
  await expect(card.locator('[data-setup-step="weighing"]')).toHaveAttribute("data-complete", "true");
  await expect(quick.locator("#quick-note")).toHaveValue("Keep this draft");
  await expect(quick.locator("#quick-note")).toBeFocused();
  expect(await input.evaluate((el) => el.isConnected)).toBe(true);
  expect(Math.abs(await page.evaluate(() => window.scrollY) - scroll)).toBeLessThanOrEqual(2);
});

test("late checklist responses and errors cannot replace a new litter context @cross-browser", async ({ page }) => {
  const card = await mount(page);
  await page.evaluate(() => { window.__setup.hold = true; window.__setup.card._setup.refresh(); });
  await expect.poll(() => page.evaluate(() => window.__setup.pending.length)).toBe(1);
  await card.locator("puppy-tracker-today-card #litter-select").selectOption("b");
  await expect.poll(() => page.evaluate(() => window.__setup.pending.length)).toBe(2);
  await page.evaluate(() => { window.__setup.pending.pop().resolve(); });
  await expect(card.locator(".setup-context")).toHaveText("Nest b");
  await page.evaluate(() => window.__setup.pending.shift().reject(new Error("Old request failed")));
  await expect(card.locator(".setup-error")).toHaveCount(0);
  await expect(card.locator(".setup-context")).toHaveText("Nest b");
});

test("failed backup stays incomplete, unlocks retry and cannot be duplicated @cross-browser", async ({ page }) => {
  const card = await mount(page, { steps: { weighing: true } });
  await page.evaluate(() => { window.__setup.failBackup = true; });
  await card.locator('[data-setup-action="next"]').click();
  await expect(card.locator(".setup-error")).toBeVisible();
  await expect(card.locator('[data-setup-step="backup"]')).toHaveAttribute("data-complete", "false");
  await card.locator('[data-setup-action="retry"]').click();
  await page.evaluate(() => { window.__setup.failBackup = false; });
  const download = page.waitForEvent("download");
  await card.evaluate((el) => { el._setup._backup(); el._setup._backup(); });
  await download;
  await expect(card.locator(".setup-error")).toHaveCount(0);
  expect(await page.evaluate(() => window.__setup.calls.filter((call) => call.type.endsWith("onboarding/backup")).length)).toBe(2);
});

test("pending backup ignores an older refresh failure and cancels after revoked access @cross-browser", async ({ page }) => {
  const card = await mount(page, { steps: { weighing: true } });
  const downloads = [];
  page.on("download", (download) => downloads.push(download));
  await page.evaluate(() => { window.__setup.hold = true; window.__setup.holdBackup = true; window.__setup.card._setup.refresh(); });
  await expect.poll(() => page.evaluate(() => window.__setup.pending.length)).toBe(1);
  await card.locator('[data-setup-action="next"]').click();
  await expect(card.locator(".setup")).toHaveAttribute("aria-busy", "true");
  await card.evaluate((el) => { el._setup._backup(); });
  await page.evaluate(() => window.__setup.pending.shift().reject(new Error("Old read failed")));
  await expect(card.locator(".setup-error")).toHaveCount(0);
  await card.evaluate((el) => { el.hass = { ...el._hass, user: { id: "admin", is_admin: false } }; });
  await page.evaluate(() => window.__setup.finishBackup());
  await expect(card.locator(".setup")).toHaveCount(0);
  expect(downloads).toHaveLength(0);
  expect(await page.evaluate(() => window.__setup.calls.filter((call) => call.type.endsWith("onboarding/backup")).length)).toBe(1);
});

test("unchanged progress keeps checklist nodes and reconnect releases subscriptions @cross-browser", async ({ page }) => {
  const card = await mount(page);
  const action = await card.locator('[data-setup-action="next"]').elementHandle();
  await card.evaluate((el) => el._setup.refresh());
  expect(await action.evaluate((el) => el.isConnected)).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__setup.callbacks.size)).toBe(2);
  await card.evaluate((el) => el.remove());
  await expect.poll(() => page.evaluate(() => window.__setup.callbacks.size)).toBe(0);
  await page.evaluate(() => document.querySelector("#cards").append(window.__setup.card));
  await expect.poll(() => page.evaluate(() => window.__setup.callbacks.size)).toBe(2);
});

test("automatic checklist completion preserves the page position @cross-browser @tablet", async ({ page }) => {
  const card = await mount(page, { steps: { weighing: true } });
  await page.evaluate(() => {
    const spacer = document.createElement("div");
    spacer.style.height = "2000px";
    document.body.append(spacer);
    window.scrollTo(0, 300);
  });
  const scroll = await page.evaluate(() => window.scrollY);
  await card.evaluate((el) => { window.__setup.steps.backup = true; return el._setup.refresh(); });
  await expect(card.locator(".setup-panel")).toHaveCount(0);
  expect(Math.abs(await page.evaluate(() => window.scrollY) - scroll)).toBeLessThanOrEqual(2);
});

test("checklist stays within the card on desktop, phone and tablet @cross-browser @tablet", async ({ page }, testInfo) => {
  const card = await mount(page, { language: "nl", steps: { litter: false, mother: false, puppies: false } });
  await page.addStyleTag({ content: ":root{--card-background-color:#fff;--primary-text-color:#202124;--secondary-text-color:#666;--divider-color:#ddd;--secondary-background-color:#f5f6f7;--primary-color:#00897b;--text-primary-color:#fff}" });
  await expect(card.locator(".setup-head small")).toHaveText("0 / 5");
  const bounds = await card.boundingBox();
  const button = await card.locator('[data-setup-action="next"]').boundingBox();
  expect(button.x + button.width).toBeLessThanOrEqual(bounds.x + bounds.width);
  expect(await card.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await card.screenshot({ path: testInfo.outputPath("checklist.png") });
});

for (const [preset, admin] of [["home", false], ["mobile", false], ["journal", true], ["growth", true], ["care", true]]) {
  test(`setup is absent for ${preset} admin=${admin}`, async ({ page }) => {
    const card = await mount(page, { preset, admin });
    await expect(card.locator(".setup")).toHaveCount(0);
    expect(await page.evaluate(() => window.__setup.calls.some((call) => call.type.startsWith("puppy_tracker/onboarding")))).toBe(false);
  });
}
