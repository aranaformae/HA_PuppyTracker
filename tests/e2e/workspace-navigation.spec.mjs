import { expect, test } from "@playwright/test";

async function mount(page, { language = "nl", admin = true, ...config } = {}) {
  await page.goto("/tests/e2e/cards.html?production=1");
  await page.waitForFunction(() => window.__puppyTrackerReady === true);
  await page.evaluate(({ language, admin, config }) => {
    window.localStorage.clear();
    document.documentElement.style.cssText = "--divider-color:#ddd;--card-background-color:#fff;--secondary-background-color:#f7f7f7;--primary-color:#087eaf;--primary-text-color:#222;--secondary-text-color:#666";
    const hass = {
      language, locale: { language }, user: { id: "u1", is_admin: admin }, states: {},
      connection: { subscribeMessage: async () => async () => {} },
      callWS: async (message) => {
        if (message.type === "puppy_tracker/litters") return { litters: [{ id: "l1", name: "Luna", active: true }] };
        if (message.type === "puppy_tracker/data") return { litter: { id: "l1", name: "Luna", records: [], summary: {} }, puppies: [], summary: {} };
        if (message.type === "puppy_tracker/care_occurrences") return { occurrences: [], skipped: [] };
        if (message.type === "puppy_tracker/care_programs") return { programs: [] };
        if (message.type === "puppy_tracker/care_program_templates") return { templates: [] };
        if (message.type === "puppy_tracker/recurring_reminders") return { reminders: [] };
        throw new Error(`Unexpected WS call: ${message.type}`);
      },
    };
    const card = document.createElement("puppy-tracker-workspace-card");
    card.id = "navigation-workspace";
    card.setConfig({ preset: "care", litter_id: "l1", ...config });
    document.querySelector("#cards").append(card);
    card.hass = hass;
    window.__navigation = [];
    card.addEventListener("hass-navigate", (event) => window.__navigation.push(event.detail.navigation_path));
  }, { language, admin, config });
  return page.locator("#navigation-workspace");
}

async function selectTab(card, key) {
  const button = card.locator(`[data-tab='${key}']`);
  if (await button.isVisible()) await button.click();
  else await card.locator("#workspace-tab-select").selectOption(key);
}

for (const [language, labels, groups] of [
  ["nl", ["Zorg uitvoeren", "Rekentool", "Zorgprogramma's", "Herinneringen"], ["Dagelijks", "Beheer"]],
  ["en", ["Carry out care", "Calculator", "Care programs", "Reminders"], ["Daily", "Management"]],
]) {
  test(`Care separates daily work and management in ${language} @cross-browser @tablet`, async ({ page }) => {
    const card = await mount(page, { language });
    await expect(card.locator("[data-tab] span")).toHaveText(labels);
    await expect(card.locator(".tab-group-label")).toHaveText(groups);
    const select = card.locator("#workspace-tab-select");
    expect(await select.locator("optgroup").evaluateAll((els) => els.map((el) => ({ label: el.label, tabs: [...el.children].map((option) => option.value) }))))
      .toEqual([{ label: groups[0], tabs: ["care", "calculator"] }, { label: groups[1], tabs: ["programs", "reminders"] }]);
    await expect(card.locator("puppy-tracker-care-execution-card .title")).toHaveText(labels[0]);
    const bounds = await card.locator(".workspace-nav").evaluate((el) => ({ width: el.clientWidth, scrollWidth: el.scrollWidth }));
    expect(bounds.scrollWidth).toBeLessThanOrEqual(bounds.width + 1);
    await card.screenshot({ path: test.info().outputPath(`care-navigation-${language}.png`) });
    await selectTab(card, "programs");
    await expect(card.locator("puppy-tracker-care-program-card")).toBeVisible();
    await expect(card.locator("puppy-tracker-care-execution-card")).toHaveCount(0);
    await selectTab(card, "care");
    await expect(card.locator("puppy-tracker-care-execution-card")).toBeVisible();
  });
}

test("Care groups custom tabs consistently and omits empty groups @cross-browser @tablet", async ({ page }) => {
  const card = await mount(page, { tabs: ["reminders", "calculator", "care", "programs"], default_tab: "programs" });
  expect(await card.locator("[data-tab]").evaluateAll((els) => els.map((el) => el.dataset.tab)))
    .toEqual(["calculator", "care", "reminders", "programs"]);
  await expect(card.locator("[data-tab='programs']")).toHaveAttribute("aria-selected", "true");
  if (await card.locator(".tabs").isVisible()) {
    await card.locator("[data-tab='programs']").focus();
    await page.keyboard.press("Home");
    await expect(card.locator("[data-tab='calculator']")).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(card.locator("[data-tab='care']")).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(card.locator("[data-tab='reminders']")).toBeFocused();
    await expect(card.locator("[data-tab='reminders']")).toHaveAttribute("aria-describedby", "workspace-group-management");
  }
  for (const [tabs, label] of [[["programs", "reminders"], "Beheer"], [["care"], "Dagelijks"]]) {
    await card.evaluate((el, tabs) => el.setConfig({ preset: "care", tabs, litter_id: "l1" }), tabs);
    await expect(card.locator(".tab-group-label")).toHaveText([label]);
    await expect(card.locator("optgroup")).toHaveCount(1);
    await expect(card.locator("optgroup")).toHaveAttribute("label", label);
  }
});

test("Care relabels navigation in place and preserves an open draft @cross-browser @tablet", async ({ page }) => {
  const card = await mount(page, { default_tab: "programs" });
  const programs = card.locator("puppy-tracker-care-program-card");
  await expect.poll(() => programs.evaluate((el) => !el._loading && el._litters.length)).toBe(1);
  await programs.locator("#add-program").click();
  await programs.locator("#care-title").fill("Nieuwe ENS instructies");
  await programs.locator("#care-title").focus();
  await card.evaluate((el) => {
    window.__programSurface = el._children.get("programs");
    window.__titleInput = window.__programSurface.shadowRoot.getElementById("care-title");
    window.__navButton = el.shadowRoot.querySelector("[data-tab='programs']");
    el.hass = { ...el._hass, language: "en", locale: { language: "en" } };
  });
  await expect(card.locator(".tab-group-label")).toHaveText(["Daily", "Management"]);
  await expect(card.locator("optgroup").last()).toHaveAttribute("label", "Management");
  await expect(programs.locator("#care-title")).toBeFocused();
  await expect(programs.locator("#care-title")).toHaveValue("Nieuwe ENS instructies");
  expect(await card.evaluate((el) => el._children.get("programs") === window.__programSurface
    && window.__programSurface.shadowRoot.getElementById("care-title") === window.__titleInput
    && el.shadowRoot.querySelector("[data-tab='programs']") === window.__navButton)).toBe(true);
  await selectTab(card, "care");
  await selectTab(card, "programs");
  await expect(programs.locator("#care-title")).toHaveValue("Nieuwe ENS instructies");
});

test("Litter settings shortcut respects drafts, pending saves and current permissions @cross-browser @tablet", async ({ page }) => {
  const card = await mount(page, { default_tab: "programs" });
  const settings = card.getByRole("link", { name: "Nestgegevens beheren" });
  await expect(settings).toHaveAttribute("title", "Nestgegevens beheren");
  await expect(settings).toHaveAttribute("href", "/config/integrations/integration/puppy_tracker");
  const programs = card.locator("puppy-tracker-care-program-card");
  await programs.locator("#add-program").click();
  await programs.locator("#care-title").fill("Niet opgeslagen");
  page.once("dialog", (dialog) => dialog.dismiss());
  await settings.click();
  await expect(programs.locator("#care-title")).toHaveValue("Niet opgeslagen");
  await expect(page).not.toHaveURL(/\/config\/integrations\/integration\/puppy_tracker/);
  await card.evaluate((el) => { el._children.get("programs")._saving = true; });
  await settings.click();
  await expect(page).not.toHaveURL(/\/config\/integrations\/integration\/puppy_tracker/);
  await card.evaluate((el) => { el._children.get("programs")._saving = false; });
  await card.evaluate((el) => {
    el.hass = { ...el._hass, user: { ...el._hass.user, is_admin: false } };
    el.shadowRoot.getElementById("workspace-litter-settings").click();
  });
  await expect(card.locator("#workspace-litter-settings")).toBeHidden();
  await expect(page).not.toHaveURL(/\/config\/integrations\/integration\/puppy_tracker/);
  await card.evaluate((el) => { el.hass = { ...el._hass, user: { ...el._hass.user, is_admin: true } }; });
  page.once("dialog", (dialog) => dialog.accept());
  await settings.click();
  await expect(page).toHaveURL(/\/config\/integrations\/integration\/puppy_tracker$/);
});

test("Mobile keeps daily tasks without management tabs and uses the same care label @cross-browser @tablet", async ({ page }) => {
  const card = await mount(page, { preset: "mobile", default_tab: "care", language: "en", admin: false });
  await expect(card.locator("[data-tab='care'] span")).toHaveText("Carry out care");
  await expect(card.locator("puppy-tracker-care-execution-card .title")).toHaveText("Carry out care");
  await expect(card.locator("optgroup")).toHaveCount(0);
  await expect(card.locator("[data-tab='programs'],[data-tab='reminders'],#workspace-litter-settings")).toHaveCount(0);
  const options = await card.locator("#workspace-tab-select option").evaluateAll((els) => els.map((el) => el.value));
  expect(options).toEqual(["weighing", "calculator", "quickLog", "today", "care", "behavior"]);
});
