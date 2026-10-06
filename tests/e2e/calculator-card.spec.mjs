import { expect, test } from "@playwright/test";

test("per-kg calculator updates every puppy without rebuilding the inputs", { tag: ["@cross-browser", "@tablet"] }, async ({ page }) => {
  await page.goto("/tests/e2e/cards.html");
  await page.waitForFunction(() => window.__puppyTrackerReady === true);
  await page.evaluate(() => {
    const now = Date.now();
    const puppies = [
      {
        id: "p1", name: "Alice", collar_color: "Roze", active: true,
        summary: { current_weight: 1000, last_weighed: new Date(now - 3600000).toISOString(), hours_since_weighing: 1 },
      },
      {
        id: "p2", name: "Bob", collar_color: "Blauw", active: true,
        summary: { current_weight: 1500, last_weighed: new Date(now - 30 * 3600000).toISOString(), hours_since_weighing: 30 },
      },
      { id: "p3", name: "Charlie", collar_color: "Groen", active: true, summary: { current_weight: null } },
      {
        id: "p4", name: "Inactive", collar_color: "Geel", active: false,
        summary: { current_weight: 2000, last_weighed: new Date(now).toISOString(), hours_since_weighing: 0 },
      },
    ];
    const hass = {
      locale: { language: "nl" }, language: "nl", states: {},
      connection: {
        subscribeMessage: async (callback) => {
          window.__calculatorUpdate = callback;
          return async () => {};
        },
      },
      callWS: async (message) => {
        if (message.type === "puppy_tracker/litters") return { litters: [{ id: "l1", name: "Luna x Dutch", active: true }] };
        if (message.type === "puppy_tracker/data") return { litter: { id: "l1", name: "Luna x Dutch" }, puppies };
        throw new Error(`Unexpected WS call: ${message.type}`);
      },
    };
    const card = document.createElement("puppy-tracker-calculator-card");
    card.id = "calculator";
    card.setConfig({ active_only: true, stale_after_hours: 24, default_unit: "ml" });
    document.querySelector("#cards").append(card);
    card.hass = hass;
  });

  const card = page.locator("#calculator");
  await expect(card.getByText("Alice", { exact: true })).toBeVisible();
  await expect(card.getByText("Bob", { exact: true })).toBeVisible();
  await expect(card.getByText("Charlie", { exact: true })).toBeVisible();
  await expect(card.getByText("Inactive", { exact: true })).toHaveCount(0);
  await expect(card.getByText("Oud gewicht", { exact: true })).toBeVisible();
  await expect(card.getByText("Geen geldige weging", { exact: true })).toBeVisible();

  const amount = card.locator("#calculator-amount");
  await amount.fill("2,5");
  await expect(amount).toBeFocused();
  await page.evaluate(() => window.__calculatorUpdate?.({ type: "updated" }));
  await page.waitForTimeout(50);
  await expect(amount).toBeFocused();
  await expect(amount).toHaveValue("2,5");
  await expect(card.locator('[data-puppy-id="p1"] [data-calculated-amount]')).toHaveText("2,5 ml");
  await expect(card.locator('[data-puppy-id="p2"] [data-calculated-amount]')).toHaveText("3,75 ml");
  await expect(card.locator('[data-puppy-id="p3"] [data-calculated-amount]')).toHaveText("—");
  await expect(card.locator("#calculator-total")).toHaveText("6,25 ml");
  await expect(card.locator("#calculator-count")).toHaveText("2 pups berekend");
  await expect(card.locator('[data-puppy-id="p1"] .collar')).toHaveCSS("background-color", "rgb(236, 64, 122)");
  const dimensions = await card.evaluate((element) => {
    const container = element.shadowRoot.querySelector("ha-card");
    return { clientWidth: container.clientWidth, scrollWidth: container.scrollWidth };
  });
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);

  const unit = card.locator("#calculator-unit");
  await unit.fill("mg");
  await expect(unit).toBeFocused();
  await expect(card.locator("#calculator-total")).toHaveText("6,25 mg");
});

test("calculator arithmetic rejects missing values and accepts decimal commas", async ({ page }) => {
  await page.goto("/tests/e2e/cards.html");
  await page.waitForFunction(() => window.__puppyTrackerReady === true);

  const result = await page.evaluate(async () => {
    const module = await import("/custom_components/puppy_tracker/frontend/puppy-tracker-calculator-card.js");
    return {
      comma: module.parseAmountPerKg("0,25"),
      calculated: module.calculateAmountForWeight(1200, 0.25),
      empty: module.parseAmountPerKg(""),
      negative: module.calculateAmountForWeight(1200, -1),
      missingWeight: module.calculateAmountForWeight(null, 2),
    };
  });

  expect(result).toEqual({ comma: 0.25, calculated: 0.3, empty: null, negative: null, missingWeight: null });
});
