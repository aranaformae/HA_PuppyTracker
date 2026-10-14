import { expect, test } from "@playwright/test";

async function mountCalculator(page, config = {}) {
  await page.goto("/tests/e2e/cards.html");
  await page.waitForFunction(() => window.__puppyTrackerReady === true);
  await page.evaluate((config) => {
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
    card.setConfig({ active_only: true, stale_after_hours: 24, default_unit: "ml", ...config });
    document.querySelector("#cards").append(card);
    card.hass = hass;
  }, config);

  return page.locator("#calculator");
}

test("per-kg calculator updates every puppy without rebuilding the inputs", { tag: ["@cross-browser", "@tablet"] }, async ({ page }) => {
  const card = await mountCalculator(page);
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

test("feeding shows both daily rations and portions with stable sliders @cross-browser @tablet", async ({ page }) => {
  const card = await mountCalculator(page, { default_mode: "feeding" });
  const first = card.locator('[data-puppy-id="p1"]');
  await expect(first.locator("[data-feeding-kibble-daily]")).toHaveText("28,5 g");
  await expect(first.locator("[data-feeding-meat-daily]")).toHaveText("22,5 g");
  await expect(first.locator("[data-feeding-total-portion]")).toHaveText("12,8 g");
  await expect(card.locator("[data-feeding-sum-total-daily]")).toHaveText("123 g");
  const dimensions = await card.evaluate((element) => {
    const container = element.shadowRoot.querySelector("ha-card");
    return { width: container.clientWidth, scrollWidth: container.scrollWidth };
  });
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width);
  await card.screenshot({ path: test.info().outputPath("feeding.png") });
  await expect(card.locator('[data-puppy-id="p3"] [data-feeding-total-daily]')).toHaveText("—");
  const slider = card.locator("#feeding-meat");
  await slider.focus();
  await slider.press("End");
  await expect(slider).toBeFocused();
  await expect(first.locator("[data-feeding-kibble-daily]")).toHaveText("0 g");
  await expect(card.locator("[data-feeding-sum-total-daily]")).toHaveText("112,5 g");
  await page.evaluate(() => window.__calculatorUpdate?.({ type: "updated" }));
  await expect(slider).toBeFocused();
  await expect(slider).toHaveValue("100");
  await card.locator("#feeding-kivo").focus();
  await card.locator("#feeding-kivo").press("End");
  await expect(card.locator("[data-feeding-sum-meat-daily]")).toHaveText("125 g");
  await card.locator("#feeding-portions").fill("2");
  await expect(first.locator("[data-feeding-total-portion]")).toHaveText("25 g");
  await card.locator("#feeding-portions").fill("2.5");
  await expect(card.locator("#calculator-hint")).toContainText("hele porties");
  await expect(card.locator("[data-feeding-sum-total-daily]")).toHaveText("—");
  await card.locator("#feeding-portions").fill("4");
  await slider.focus();
  await slider.press("Home");
  await expect(first.locator("[data-feeding-meat-daily]")).toHaveText("0 g");
  await expect(first.locator("[data-feeding-kibble-daily]")).toHaveText("57 g");
  await card.locator("#feeding-formula").selectOption("linear");
  await expect(first.locator("[data-feeding-kibble-daily]")).toHaveText("107,8 g");
  // Switching modes retains each mode's working values.
  await card.locator('[data-calculator-mode="per_kg"]').click();
  await card.locator("#calculator-amount").fill("2,5");
  await card.locator('[data-calculator-mode="feeding"]').click();
  await expect(card.locator("#feeding-formula")).toHaveValue("linear");
  await card.locator('[data-calculator-mode="per_kg"]').click();
  await expect(card.locator("#calculator-amount")).toHaveValue("2,5");
});

test("feeding table boundaries and ration shares do not extrapolate or double count", async ({ page }) => {
  await mountCalculator(page);
  const results = await page.evaluate(async () => {
    const { calculateFeedingForWeight: calculate, ydoloDailyAmount } = await import("/custom_components/puppy_tracker/frontend/puppy-tracker-feeding-calculator.js");
    return {
      points: [1, 2, 5, 10, 15, 20].map((kg) => ydoloDailyAmount(kg)),
      halfway: ydoloDailyAmount(3.5),
      mix: calculate(2000, { meatPercent: 50, kivoPerKg: 40, portions: 4 }),
      kibble: calculate(2000, { meatPercent: 0, kivoPerKg: 50, portions: 2 }),
      meat: calculate(500, { meatPercent: 100, kivoPerKg: 50, portions: 2 }),
      outside: [500, 21000].map((weight) => calculate(weight).status),
      invalid: [0, 2.5, 13].map((portions) => calculate(1000, { portions }).status),
      invalidRate: calculate(1000, { kivoPerKg: 51 }).status,
      invalidRatio: calculate(1000, { meatPercent: 101 }).status,
      noWeight: calculate(null).status,
    };
  });
  expect(results.points).toEqual([57, 96, 191, 267, 327, 360]);
  expect(results.halfway).toBe(143.5);
  expect(results.mix).toMatchObject({ status: "ok", kibbleDaily: 48, meatDaily: 40, totalDaily: 88, totalPerPortion: 22 });
  expect(results.kibble).toMatchObject({ status: "ok", kibbleDaily: 96, meatDaily: 0, totalPerPortion: 48 });
  expect(results.meat).toMatchObject({ status: "ok", kibbleDaily: 0, meatDaily: 25, totalPerPortion: 12.5 });
  expect(results.outside).toEqual(["outside_kibble_range", "outside_kibble_range"]);
  expect(results.invalid).toEqual(["invalid_settings", "invalid_settings", "invalid_settings"]);
  expect(results.invalidRate).toBe("invalid_settings");
  expect(results.invalidRatio).toBe("invalid_settings");
  expect(results.noWeight).toBe("missing_weight");
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
