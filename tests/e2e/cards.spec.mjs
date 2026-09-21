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
    window.__initialCustomCards = window.customCards;
  });
  await openFixture(page, true);

  const registry = await page.evaluate(() => ({
    advertisedCards: (window.customCards || []).map((card) => card.type),
    retainedIdentity: window.customCards === window.__initialCustomCards,
  }));
  expect(registry.retainedIdentity).toBe(true);
  expect(registry.advertisedCards).toContain("example-third-party-card");
  expect(registry.advertisedCards.filter((type) => type.startsWith("puppy-tracker-")).sort())
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

test("workspace hides the litter selector on every composed surface", async ({ page }) => {
  await openFixture(page, true);

  const result = await page.evaluate(() => {
    const surfaceConfigs = {};
    for (const preset of ["home", "growth", "journal", "care", "mobile"]) {
      const card = document.createElement("puppy-tracker-workspace-card");
      card.setConfig({ preset, show_litter_selector: false });
      surfaceConfigs[preset] = Object.fromEntries(
        [...card._children].map(([key, child]) => [key, child._config?.show_litter_selector]),
      );
    }

    const litter = document.createElement("puppy-tracker-litter-card");
    litter.setConfig({ show_litter_selector: false });
    litter._litters = [{ id: "one", name: "One" }, { id: "two", name: "Two" }];
    litter._data = { litter: { summary: {} }, puppies: [] };
    litter._render();

    const temperature = document.createElement("puppy-tracker-temperature-card");
    temperature.setConfig({ show_litter_selector: false });
    temperature._litters = [{ id: "one", name: "One" }, { id: "two", name: "Two" }];
    temperature._litterData = { litter: { mother: "Luna" }, puppies: [] };
    temperature._render();

    return {
      surfaceConfigs,
      litterSelector: Boolean(litter.shadowRoot.querySelector("#litter-select")),
      temperatureLitterSelector: Boolean(temperature.shadowRoot.querySelector("#litter-select")),
      temperatureScopeSelector: Boolean(temperature.shadowRoot.querySelector("#scope-select")),
      temperatureRangeSelector: Boolean(temperature.shadowRoot.querySelector("#range-select")),
    };
  });

  for (const configs of Object.values(result.surfaceConfigs)) {
    expect(Object.values(configs).every((value) => value === false)).toBe(true);
  }
  expect(result.litterSelector).toBe(false);
  expect(result.temperatureLitterSelector).toBe(false);
  expect(result.temperatureScopeSelector).toBe(true);
  expect(result.temperatureRangeSelector).toBe(true);
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

test("workspace editor switches preset options and writes existing tab config", async ({ page }) => {
  await openFixture(page, true);

  const result = await page.evaluate(() => {
    const homeAssistant = document.createElement("home-assistant");
    homeAssistant.hass = { language: "en", locale: { language: "en" } };
    document.body.prepend(homeAssistant);

    const constructor = customElements.get("puppy-tracker-workspace-card");
    const editor = constructor.getConfigElement();
    editor.setConfig({ preset: "home" });
    editor.hass = homeAssistant.hass;
    document.body.append(editor);
    const form = editor.shadowRoot.querySelector("ha-form");
    const presetLabels = form.schema.find((item) => item.name === "preset")
      ?.selector?.select?.options?.map((item) => item.label) || [];
    const homeGroups = form.schema.map((item) => item.name);
    let changedConfig = null;
    editor.addEventListener("config-changed", (event) => { changedConfig = event.detail.config; });
    form.dispatchEvent(new CustomEvent("value-changed", {
      bubbles: true,
      detail: { value: { ...form.data, preset: "growth" } },
    }));
    const growthGroups = form.schema.map((item) => item.name);
    const growthSchema = form.schema;
    form.dispatchEvent(new CustomEvent("value-changed", {
      bubbles: true,
      detail: { value: { ...form.data, analysis_default_metric: "growth24" } },
    }));
    const editorConfig = changedConfig;
    editor.setConfig(editorConfig);
    const schemaRetained = form.schema === growthSchema;
    const groupsByPreset = Object.fromEntries(["home", "growth", "journal", "care", "mobile"].map((preset) => {
      editor.setConfig({ preset });
      return [preset, form.schema.map((item) => item.name)];
    }));
    const valuesByPreset = {
      home: { show_summary: false, attention_max_items: 40 },
      growth: { weighing_show_details: false, analysis_default_range: "14d" },
      journal: { default_selected: "mother", temperature_show_chart: false },
      care: { care_days_ahead: 21, programs_compact: true },
      mobile: { show_today_only: true, care_max_items: 30 },
    };
    const savedByPreset = {};
    for (const [preset, values] of Object.entries(valuesByPreset)) {
      editor.setConfig({ preset });
      form.dispatchEvent(new CustomEvent("value-changed", {
        bubbles: true,
        detail: { value: { ...form.data, ...values } },
      }));
      savedByPreset[preset] = changedConfig;
    }
    editor.remove();
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
      homeGroups,
      growthGroups,
      editorConfig,
      schemaRetained,
      groupsByPreset,
      savedByPreset,
      childTitles: [weighing?._config?.title, analysis?._config?.title],
      desktopLabels: Array.from(card.shadowRoot.querySelectorAll("[data-tab] span"), (item) => item.textContent),
      mobileLabels: Array.from(card.shadowRoot.querySelectorAll("#workspace-tab-select option"), (item) => item.textContent),
      nodesRetained: originalChildren.every((child, index) => child === [weighing, analysis][index]),
      activeConnected: weighing?.isConnected,
      hiddenDisconnected: !analysis?.isConnected,
    };
  });

  expect(result.presetLabels).toEqual(["Home", "Growth", "Journal", "Care", "Mobile"]);
  expect(result.homeGroups).toEqual(["title", "preset", "litter_id", "show_litter_selector", "navigation", "options_presetOptions", "options_attention", "options_puppies"]);
  expect(result.growthGroups).toEqual(["title", "preset", "litter_id", "show_litter_selector", "navigation", "options_weighing", "options_analysis"]);
  expect(result.editorConfig.preset).toBe("growth");
  expect(result.editorConfig.tabs).toEqual(["weighing", "analysis"]);
  expect(result.editorConfig.default_tab).toBe("weighing");
  expect(result.editorConfig.tab_config.analysis.default_metric).toBe("growth24");
  expect(result.schemaRetained).toBe(true);
  expect(result.groupsByPreset.journal).toEqual(["title", "preset", "litter_id", "show_litter_selector", "navigation", "options_presetOptions", "options_dossier", "options_timeline", "options_temperature"]);
  expect(result.groupsByPreset.care).toEqual(["title", "preset", "litter_id", "show_litter_selector", "navigation", "options_care", "options_programs"]);
  expect(result.groupsByPreset.mobile).toEqual(["title", "preset", "litter_id", "show_litter_selector", "navigation", "options_presetOptions", "options_weighing", "options_care"]);
  expect(result.savedByPreset.home.show_summary).toBe(false);
  expect(result.savedByPreset.home.tab_config.attention.max_items).toBe(40);
  expect(result.savedByPreset.growth.tab_config.weighing.show_details).toBe(false);
  expect(result.savedByPreset.growth.tab_config.analysis.default_range).toBe("14d");
  expect(result.savedByPreset.journal.default_selected).toBe("mother");
  expect(result.savedByPreset.journal.tab_config.temperature.show_chart).toBe(false);
  expect(result.savedByPreset.care.tab_config.care.days_ahead).toBe(21);
  expect(result.savedByPreset.care.tab_config.programs.compact).toBe(true);
  expect(result.savedByPreset.mobile.show_today_only).toBe(true);
  expect(result.savedByPreset.mobile.tab_config.care.max_items).toBe(30);
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
