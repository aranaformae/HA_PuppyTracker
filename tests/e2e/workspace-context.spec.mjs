import { expect, test } from "@playwright/test";

test("workspace shares litter context and disconnects inactive surfaces", async ({ page }) => {
  await page.goto("/tests/e2e/cards.html?production=1");
  await page.waitForFunction(() => window.__puppyTrackerReady === true);
  await page.evaluate(() => {
    window.__workspaceActiveSubscriptions = 0;
    const data = (id) => ({
      litter: { id, name: id === "l1" ? "First" : "Second", records: [], summary: {} },
      puppies: [],
      summary: {},
      session: null,
    });
    const hass = {
      language: "en",
      locale: { language: "en" },
      connection: {
        subscribeMessage: async () => {
          window.__workspaceActiveSubscriptions += 1;
          return async () => { window.__workspaceActiveSubscriptions -= 1; };
        },
      },
      callWS: async (message) => {
        if (message.type === "puppy_tracker/litters") return { litters: [{ id: "l1", name: "First" }, { id: "l2", name: "Second" }] };
        if (message.type === "puppy_tracker/data") return data(message.litter_id);
        if (message.type === "puppy_tracker/care_occurrences") return { occurrences: [], skipped: [] };
        if (message.type === "puppy_tracker/recurring_reminders") return { reminders: [] };
        if (message.type === "puppy_tracker/attention_acknowledgements") return { acknowledgements: {} };
        throw new Error(`Unexpected WS call: ${message.type}`);
      },
    };
    const card = document.createElement("puppy-tracker-workspace-card");
    card.id = "context-workspace";
    card.setConfig({ preset: "home", show_summary: false, default_tab: "today" });
    document.querySelector("#cards").append(card);
    card.hass = hass;
  });

  const workspace = page.locator("#context-workspace");
  const today = workspace.locator("puppy-tracker-today-card");
  await expect(today.locator("#litter-select")).toHaveValue("l1");
  await today.locator("#litter-select").selectOption("l2");
  await expect(workspace.locator("puppy-tracker-today-card #litter-select")).toHaveValue("l2");

  const attentionTab = workspace.locator("[data-tab='attention']");
  if (await attentionTab.isVisible()) {
    await attentionTab.click();
  } else {
    await workspace.locator("#workspace-tab-select").selectOption("attention");
  }
  const context = await page.evaluate(() => {
    const card = document.querySelector("#context-workspace");
    return {
      litterId: card._litterId,
      attentionConfig: card._children.get("attention")._config.litter_id,
      todayConnected: card._children.get("today").isConnected,
      attentionConnected: card._children.get("attention").isConnected,
    };
  });
  expect(context).toEqual({ litterId: "l2", attentionConfig: "l2", todayConnected: false, attentionConnected: true });
  await expect.poll(() => page.evaluate(() => window.__workspaceActiveSubscriptions)).toBe(1);
});

test("workspace title stays at workspace level", async ({ page }) => {
  await page.goto("/tests/e2e/cards.html?production=1");
  await page.waitForFunction(() => window.__puppyTrackerReady === true);
  const result = await page.evaluate(() => {
    const card = document.createElement("puppy-tracker-workspace-card");
    card.setConfig({ preset: "journal", title: "Daily journal" });
    document.querySelector("#cards").append(card);
    return {
      heading: card.shadowRoot.querySelector(".workspace-title")?.textContent,
      childTitle: card._children.get("quickLog")?._config?.title,
    };
  });
  expect(result).toEqual({ heading: "Daily journal", childTitle: "" });
});

test("weighing can update the shared litter without rebuilding its active surface", async ({ page }) => {
  await page.goto("/tests/e2e/cards.html?production=1");
  await page.waitForFunction(() => window.__puppyTrackerReady === true);
  const result = await page.evaluate(() => {
    const card = document.createElement("puppy-tracker-workspace-card");
    card.setConfig({ preset: "mobile", default_tab: "weighing" });
    document.querySelector("#cards").append(card);
    const weighing = card._children.get("weighing");
    weighing.dispatchEvent(new CustomEvent("puppy-tracker-litter-change", {
      bubbles: true,
      composed: true,
      detail: { litterId: "l2" },
    }));
    return {
      litterId: card._litterId,
      weighingWasRetained: card._children.get("weighing") === weighing,
      quickLogLitterId: card._children.get("quickLog")._config.litter_id,
      todayLitterId: card._children.get("today")._config.litter_id,
      careLitterId: card._children.get("care")._config.litter_id,
    };
  });

  expect(result).toEqual({
    litterId: "l2",
    weighingWasRetained: true,
    quickLogLitterId: "l2",
    todayLitterId: "l2",
    careLitterId: "l2",
  });
});

test("workspace card state is isolated by workspace and surface", async ({ page }) => {
  await page.goto("/tests/e2e/cards.html?production=1");
  await page.waitForFunction(() => window.__puppyTrackerReady === true);
  const result = await page.evaluate(async () => {
    window.localStorage.clear();
    const common = await import("/custom_components/puppy_tracker/frontend/puppy-tracker-card-common.js");
    const first = document.createElement("puppy-tracker-workspace-card");
    const second = document.createElement("puppy-tracker-workspace-card");
    first.setConfig({ preset: "journal", state_key: "first" });
    second.setConfig({ preset: "journal", state_key: "second" });
    document.querySelector("#cards").append(first, second);

    const firstQuickLog = first._children.get("quickLog");
    const secondQuickLog = second._children.get("quickLog");
    common.saveCardState(firstQuickLog, { recentOwners: { temperature: "__mother__" } });
    return {
      firstKey: firstQuickLog._config.state_key,
      secondKey: secondQuickLog._config.state_key,
      firstState: common.loadCardState(firstQuickLog, { recentOwners: {} }),
      secondState: common.loadCardState(secondQuickLog, { recentOwners: {} }),
    };
  });

  expect(result.firstKey).toBe("first.quickLog");
  expect(result.secondKey).toBe("second.quickLog");
  expect(result.firstState.recentOwners.temperature).toBe("__mother__");
  expect(result.secondState.recentOwners).toEqual({});
});

test("workspace only applies puppy_id to the puppy initial scope", async ({ page }) => {
  await page.goto("/tests/e2e/cards.html?production=1");
  await page.waitForFunction(() => window.__puppyTrackerReady === true);
  const result = await page.evaluate(() => {
    const mother = document.createElement("puppy-tracker-workspace-card");
    const puppy = document.createElement("puppy-tracker-workspace-card");
    mother.setConfig({ preset: "journal", default_selected: "mother", puppy_id: "p1" });
    puppy.setConfig({ preset: "journal", default_selected: "puppy", puppy_id: "p1" });
    return {
      motherPuppyId: mother._children.get("dossier")._config.puppy_id,
      motherScope: mother._children.get("dossier")._config.default_selected,
      puppyPuppyId: puppy._children.get("dossier")._config.puppy_id,
      puppyScope: puppy._children.get("dossier")._config.default_selected,
    };
  });

  expect(result).toEqual({
    motherPuppyId: "",
    motherScope: "mother",
    puppyPuppyId: "p1",
    puppyScope: "puppy",
  });
});
