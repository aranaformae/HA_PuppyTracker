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
];

async function openFixture(page) {
  await page.goto("/tests/e2e/cards.html");
  await page.waitForFunction(() => window.__puppyTrackerReady === true);
}

test("registers every Puppy Tracker card without module errors", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await openFixture(page);

  const result = await page.evaluate((cardTypes) => ({
    moduleErrors: window.__puppyTrackerModuleErrors || [],
    missingElements: cardTypes.filter((type) => !customElements.get(type)),
    advertisedCards: cardTypes.filter((type) =>
      (window.customCards || []).some((card) => card.type === type)
    ),
  }), CARD_TYPES);

  expect(result.moduleErrors).toEqual([]);
  expect(result.missingElements).toEqual([]);
  expect(result.advertisedCards).toEqual(CARD_TYPES);
  expect(pageErrors).toEqual([]);
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
