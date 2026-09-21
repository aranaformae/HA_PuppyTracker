import { expect, test } from "@playwright/test";

const CARD_TYPES = [
  "puppy-tracker-card",
  "puppy-tracker-overview-card",
  "puppy-tracker-summary-card",
  "puppy-tracker-attention-card",
  "puppy-tracker-litter-card",
  "puppy-tracker-report-card",
  "puppy-tracker-dossier-card",
  "puppy-tracker-quick-log-card",
  "puppy-tracker-bulk-dossier-card",
  "puppy-tracker-timeline-card",
  "puppy-tracker-workspace-card",
];

const PUBLIC_CARD_TYPES = [
  "puppy-tracker-workspace-card",
  "puppy-tracker-owner-card",
  "puppy-tracker-report-card",
];

async function openFixture(page, production = false) {
  await page.goto(`/tests/e2e/cards.html${production ? "?production" : ""}`);
  await page.waitForFunction(() => window.__puppyTrackerReady === true);
}

test("registers every Puppy Tracker card without module errors", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await openFixture(page, true);

  const result = await page.evaluate(({ cardTypes, publicCardTypes }) => ({
    moduleErrors: window.__puppyTrackerModuleErrors || [],
    missingElements: cardTypes.filter((type) => !customElements.get(type)),
    advertisedCards: (window.customCards || []).map((card) => card.type).filter((type) => type.startsWith("puppy-tracker-")),
    expectedPublicCards: publicCardTypes,
  }), { cardTypes: CARD_TYPES, publicCardTypes: PUBLIC_CARD_TYPES });

  expect(result.moduleErrors).toEqual([]);
  expect(result.missingElements).toEqual([]);
  expect(result.advertisedCards.sort()).toEqual(result.expectedPublicCards.sort());
  expect(pageErrors).toEqual([]);
});

test("keeps third-party cards registered while hiding internal Puppy Tracker surfaces", async ({ page }) => {
  await page.addInitScript(() => {
    window.customCards = [{ type: "example-third-party-card", name: "Example" }];
  });
  await openFixture(page, true);

  const advertisedCards = await page.evaluate(() =>
    (window.customCards || []).map((card) => card.type),
  );
  expect(advertisedCards).toContain("example-third-party-card");
  expect(advertisedCards.filter((type) => type.startsWith("puppy-tracker-")).sort())
    .toEqual([...PUBLIC_CARD_TYPES].sort());
});

test("workspace tabs retain card instances while surfaces are detached", async ({ page }) => {
  await openFixture(page, true);
  await page.evaluate(() => {
    const card = document.createElement("puppy-tracker-workspace-card");
    card.id = "stable-workspace";
    card.setConfig({ preset: "growth", default_tab: "weighing" });
    document.querySelector("#cards").append(card);
    window.__weighingSurface = card._children.get("weighing");
  });

  const card = page.locator("#stable-workspace");
  if (page.viewportSize().width <= 600) {
    await card.locator("#workspace-tab-select").selectOption("analysis");
    await card.locator("#workspace-tab-select").selectOption("weighing");
  } else {
    await card.locator("[data-tab='analysis']").click();
    await card.locator("[data-tab='weighing']").click();
  }

  const state = await page.evaluate(() => {
    const workspace = document.querySelector("#stable-workspace");
    return {
      sameInstance: workspace._children.get("weighing") === window.__weighingSurface,
      childCount: workspace._children.size,
      activeTab: workspace._tab,
    };
  });
  expect(state).toEqual({ sameInstance: true, childCount: 2, activeTab: "weighing" });
});

test("workspace localizes internal surfaces inside its shadow root", async ({ page }) => {
  await openFixture(page, true);
  await page.evaluate(() => {
    document.documentElement.lang = "en";
    const card = document.createElement("puppy-tracker-workspace-card");
    card.id = "localized-workspace";
    card.setConfig({ preset: "home", show_summary: true });
    document.querySelector("#cards").append(card);
  });

  const summary = page.locator("#localized-workspace puppy-tracker-summary-card");
  await expect(summary.getByText("No litter", { exact: true })).toBeVisible();
  await expect(summary.getByText("Geen nest", { exact: true })).toHaveCount(0);

  await page.evaluate(() => {
    const card = document.querySelector("#localized-workspace");
    card.remove();
    document.querySelector("#cards").append(card);
    card.shadowRoot.querySelector("puppy-tracker-summary-card").setConfig({
      title: "Puppy Tracker",
      show_litter_selector: false,
    });
  });
  await expect(summary.getByText("No litter", { exact: true })).toBeVisible();
});

test("workspace localizes safe editor options and navigation without remounting retained surfaces", async ({ page }) => {
  await openFixture(page, true);

  const result = await page.evaluate(() => {
    const homeAssistant = document.createElement("home-assistant");
    homeAssistant.hass = { language: "en", locale: { language: "en" } };
    document.body.prepend(homeAssistant);

    const constructor = customElements.get("puppy-tracker-workspace-card");
    const schema = constructor?.getConfigForm?.()?.schema || [];
    const presetLabels = schema.find((item) => item.name === "preset")
      ?.selector?.select?.options?.map((item) => item.label) || [];
    const editorNames = schema.map((item) => item.name);
    homeAssistant.remove();

    const card = document.createElement("puppy-tracker-workspace-card");
    card._hass = { language: "nl", locale: { language: "nl" } };
    card.setConfig({ preset: "growth" });
    document.querySelector("#cards").append(card);
    const weighing = card._children.get("weighing");
    const analysis = card._children.get("analysis");
    const originalChildren = [...card._children.values()];

    // Avoid starting child data loads; this assertion targets the workspace's
    // own language-change path and mounted-node identity.
    card._children.clear();
    card.hass = { language: "en", locale: { language: "en" } };

    return {
      presetLabels,
      editorNames,
      childTitles: [weighing?._config?.title, analysis?._config?.title],
      desktopLabels: Array.from(card.shadowRoot.querySelectorAll("[data-tab] span"), (item) => item.textContent),
      mobileLabels: Array.from(card.shadowRoot.querySelectorAll("#workspace-tab-select option"), (item) => item.textContent),
      nodesRetained: originalChildren.every((child, index) => child === [weighing, analysis][index]),
      activeConnected: weighing?.isConnected,
      hiddenDisconnected: !analysis?.isConnected,
    };
  });

  expect(result.presetLabels).toEqual(["Home", "Growth", "Journal", "Care", "Mobile"]);
  expect(result.editorNames).toEqual(["title", "preset", "litter_id", "show_litter_selector"]);
  expect(result.childTitles).toEqual([null, null]);
  expect(result.desktopLabels).toEqual(["Weigh", "Analysis"]);
  expect(result.mobileLabels).toEqual(["Weigh", "Analysis"]);
  expect(result.nodesRetained).toBe(true);
  expect(result.activeConnected).toBe(true);
  expect(result.hiddenDisconnected).toBe(true);
});

test("constructs and renders every card with its stub config", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await openFixture(page);

  const outcomes = await page.evaluate(async (cardTypes) => {
    const host = document.querySelector("#cards");
    const results = [];

    for (const type of cardTypes) {
      const constructor = customElements.get(type);
      const element = document.createElement(type);

      try {
        const config = constructor?.getStubConfig?.() || {};
        element.setConfig?.(config);
        host.appendChild(element);

        await new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve))
        );

        const html = element.shadowRoot?.innerHTML || "";
        results.push({
          type,
          error: null,
          hasShadowRoot: Boolean(element.shadowRoot),
          rendered: html.trim().length > 0,
          configurationError:
            html.includes("Custom element doesn't exist") ||
            html.includes("Configuratiefout") ||
            html.includes("Configuration error"),
        });
      } catch (error) {
        results.push({
          type,
          error: error?.stack || error?.message || String(error),
          hasShadowRoot: Boolean(element.shadowRoot),
          rendered: false,
          configurationError: false,
        });
      }
    }

    return results;
  }, CARD_TYPES);

  for (const outcome of outcomes) {
    expect(outcome.error, `${outcome.type} threw during render`).toBeNull();
    expect(outcome.hasShadowRoot, `${outcome.type} has no shadow root`).toBe(true);
    expect(outcome.rendered, `${outcome.type} rendered no content`).toBe(true);
    expect(outcome.configurationError, `${outcome.type} showed a configuration error`).toBe(false);
  }

  expect(pageErrors).toEqual([]);
});

test("fixture remains usable at the configured viewport", async ({ page }) => {
  await openFixture(page);

  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  expect(viewport.width).toBeGreaterThanOrEqual(320);
  expect(viewport.height).toBeGreaterThanOrEqual(600);

  const ready = await page.evaluate(() => window.__puppyTrackerReady === true);
  expect(ready).toBe(true);
});

test("subscription helper closes a subscription that resolves after card removal", async ({ page }) => {
  await openFixture(page);

  const result = await page.evaluate(async () => {
    const { subscribeUpdates } = await import("/custom_components/puppy_tracker/frontend/puppy-tracker-card-common.js");
    let resolveSubscription;
    let unsubscribeCalls = 0;
    const hass = {
      connection: {
        subscribeMessage: () => new Promise((resolve) => { resolveSubscription = resolve; }),
      },
    };
    const owner = { isConnected: true, _hass: hass };
    const pending = subscribeUpdates(hass, () => {}, owner);
    owner.isConnected = false;
    resolveSubscription(() => { unsubscribeCalls += 1; });

    return { subscription: await pending, unsubscribeCalls };
  });

  expect(result.subscription).toBeNull();
  expect(result.unsubscribeCalls).toBe(1);
});
