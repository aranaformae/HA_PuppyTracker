import { expect, test } from "@playwright/test";

async function mountCalculator(page, config = {}) {
  await page.goto("/tests/e2e/cards.html");
  await page.waitForFunction(() => window.__puppyTrackerReady === true);
  await page.evaluate((config) => {
    const profiles = JSON.parse(sessionStorage.getItem("fixture-feeding-profiles") || "{}");
    window.__feedingCalls = [];
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
        if (message.type === "puppy_tracker/litters") return { litters: [{ id: "l1", name: "Luna x Dutch", active: true }, { id: "l2", name: "Second litter", active: true }] };
        if (message.type === "puppy_tracker/data") {
          const response = structuredClone({ can_manage_records: !config.readonly, litter: { id: message.litter_id, name: "Luna x Dutch", feeding_settings: profiles[message.litter_id] }, puppies });
          if (window.__feedingReadGate) {
            window.__feedingReadStarted = true;
            await window.__feedingReadGate;
          }
          return response;
        }
        if (message.type === "puppy_tracker/feeding_settings/update") {
          window.__feedingCalls.push(message);
          if (window.__feedingSaveError) throw new Error("Save failed");
          if (window.__feedingSaveGate) await window.__feedingSaveGate;
          profiles[message.litter_id] = structuredClone(message.settings);
          sessionStorage.setItem("fixture-feeding-profiles", JSON.stringify(profiles));
          return { settings: profiles[message.litter_id] };
        }
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

test("late feeding refresh cannot overwrite a newer saved preference @cross-browser @tablet", async ({ page }) => {
  const card = await mountCalculator(page, { default_mode: "feeding" });
  await expect(card.locator("#feeding-portions")).toHaveValue("4");
  await page.evaluate(() => {
    window.__feedingReadGate = new Promise((resolve) => { window.__releaseFeedingRead = resolve; });
    document.querySelector("#calculator")._queueRefresh();
  });
  await page.waitForFunction(() => window.__feedingReadStarted);
  await card.locator("#feeding-portions").fill("6");
  await card.locator("#feeding-portions").dispatchEvent("change");
  await expect(card.locator("#feeding-save-status")).toHaveText("Voedingsinstellingen opgeslagen");
  await page.evaluate(() => {
    window.__feedingReadGate = null;
    window.__releaseFeedingRead();
    document.querySelector("#calculator").shadowRoot.activeElement?.blur();
  });
  await page.waitForFunction(() => !document.querySelector("#calculator")._refreshing);
  await expect(card.locator("#feeding-portions")).toHaveValue("6");
});

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
  await card.getByText("Vlees: instellingen", { exact: true }).click();
  await card.locator("#feeding-meat-grams_per_kg").fill("50");
  await card.locator("#feeding-meat-grams_per_kg").blur();
  await expect(card.locator("[data-feeding-sum-meat-daily]")).toHaveText("125 g");
  await card.locator("#feeding-portions").fill("2");
  await expect(first.locator("[data-feeding-total-portion]")).toHaveText("25 g");
  await card.locator("#feeding-portions").fill("2.5");
  await expect(card.locator("#calculator-hint")).toContainText("porties (1–12)");
  await expect(card.locator("[data-feeding-sum-total-daily]")).toHaveText("—");
  await card.locator("#feeding-portions").fill("4");
  await slider.focus();
  await slider.press("Home");
  await expect(first.locator("[data-feeding-meat-daily]")).toHaveText("0 g");
  await expect(first.locator("[data-feeding-kibble-daily]")).toHaveText("57 g");
  await card.locator("#feeding-kibble-method").selectOption("linear");
  await expect(first.locator("[data-feeding-kibble-daily]")).toHaveText("107,8 g");
  // Switching modes retains each mode's working values.
  await card.locator('[data-calculator-mode="per_kg"]').click();
  await card.locator("#calculator-amount").fill("2,5");
  await card.locator('[data-calculator-mode="feeding"]').click();
  await expect(card.locator("#feeding-kibble-method")).toHaveValue("linear");
  await card.locator('[data-calculator-mode="per_kg"]').click();
  await expect(card.locator("#calculator-amount")).toHaveValue("2,5");
});

test("feeding table boundaries and ration shares do not extrapolate or double count", async ({ page }) => {
  await mountCalculator(page);
  const results = await page.evaluate(async () => {
    const { calculateFeedingForWeight: calculateRaw, foodDailyAmount, feedingSettingsFromStored } = await import("/custom_components/puppy_tracker/frontend/puppy-tracker-feeding-calculator.js");
    const calculate = (weight, values = {}) => calculateRaw(weight, {
      ...feedingSettingsFromStored(), ...values,
      meat: { ...feedingSettingsFromStored().meat, grams_per_kg: values.rate ?? 45 },
    });
    const daily = (kg) => foodDailyAmount(kg, feedingSettingsFromStored().kibble);
    return {
      points: [1, 2, 5, 10, 15, 20].map((kg) => daily(kg)),
      halfway: daily(3.5),
      mix: calculate(2000, { meatPercent: 50, rate: 40, portions: 4 }),
      kibble: calculate(2000, { meatPercent: 0, rate: 50, portions: 2 }),
      meat: calculate(500, { meatPercent: 100, rate: 50, portions: 2 }),
      outside: [500, 21000].map((weight) => calculate(weight).status),
      invalid: [0, 2.5, 13].map((portions) => calculate(1000, { portions }).status),
      invalidRate: calculate(1000, { rate: -1 }).status,
      invalidRatio: calculate(1000, { meatPercent: 101 }).status,
      noWeight: calculate(null).status,
    };
  });
  expect(results.points).toEqual([57, 96, 191, 267, 327, 360]);
  expect(results.halfway).toBe(143.5);
  expect(results.mix).toMatchObject({ status: "ok", kibbleDaily: 48, meatDaily: 40, totalDaily: 88, totalPerPortion: 22 });
  expect(results.kibble).toMatchObject({ status: "ok", kibbleDaily: 96, meatDaily: 0, totalPerPortion: 48 });
  expect(results.meat).toMatchObject({ status: "ok", kibbleDaily: 0, meatDaily: 25, totalPerPortion: 12.5 });
  expect(results.outside).toEqual(["outside_food_range", "outside_food_range"]);
  expect(results.invalid).toEqual(["invalid_settings", "invalid_settings", "invalid_settings"]);
  expect(results.invalidRate).toBe("invalid_settings");
  expect(results.invalidRatio).toBe("invalid_settings");
  expect(results.noWeight).toBe("missing_weight");
});

test("both foods support configurable formulas, interpolated tables and fixed rates", async ({ page }) => {
  await mountCalculator(page);
  const result = await page.evaluate(async () => {
    const { calculateFeedingForWeight, feedingSettingsFromStored, feedingSettingsForStorage } = await import("/custom_components/puppy_tracker/frontend/puppy-tracker-feeding-calculator.js");
    const settings = feedingSettingsFromStored();
    const results = [];
    for (const kibble of ["linear", "table", "per_kg"]) {
      for (const meat of ["linear", "table", "per_kg"]) {
        settings.kibble = { method: kibble, grams_per_kg: 50, coefficient: 10, offset: 20, min_kg: 1, max_kg: 4, table: [[1, 40], [3, 100]] };
        settings.meat = { method: meat, grams_per_kg: 80, coefficient: 30, offset: 10, min_kg: 1, max_kg: 4, table: [[1, 60], [3, 180]] };
        results.push(calculateFeedingForWeight(2000, settings));
      }
    }
    settings.kibble.method = "table";
    settings.meat.method = "table";
    const outside = calculateFeedingForWeight(500, settings);
    settings.meatPercent = 0;
    settings.kibble.method = "per_kg";
    const unusedOutOfRange = calculateFeedingForWeight(500, settings);
    settings.kibble.table = [[1, 40], [1, 80]];
    const duplicate = feedingSettingsForStorage(settings);
    return { results, outside, unusedOutOfRange, duplicate };
  });
  const kibble = [20, 35, 50], meat = [35, 60, 80];
  result.results.forEach((value, index) => {
    expect(value).toMatchObject({ status: "ok", kibbleDaily: kibble[Math.floor(index / 3)], meatDaily: meat[index % 3] });
    expect(value.totalPerPortion).toBe((value.kibbleDaily + value.meatDaily) / 4);
  });
  expect(result.outside.status).toBe("outside_food_range");
  expect(result.unusedOutOfRange).toMatchObject({ status: "ok", kibbleDaily: 25, meatDaily: 0 });
  expect(result.duplicate).toBeNull();
});

test("food editors expose configurable values without brands and retain focus @cross-browser @tablet", async ({ page }) => {
  const card = await mountCalculator(page, { default_mode: "feeding" });
  await expect(card.locator("ha-card")).not.toContainText(/Ydolo|Kivo/i);
  await card.getByText("Brokken: instellingen", { exact: true }).click();
  await expect(card.locator('[data-food="kibble"][data-row="1"][data-column="1"]')).toHaveValue("96");
  await card.locator('[data-food="kibble"][data-row="1"][data-column="1"]').fill("100");
  await page.evaluate(() => window.__calculatorUpdate?.({ type: "updated" }));
  await expect(card.locator('[data-food="kibble"][data-row="1"][data-column="1"]')).toBeFocused();
  await card.locator('[data-food="kibble"][data-row="1"][data-column="1"]').blur();
  await expect(card.locator("#feeding-save-status")).toHaveText("Voedingsinstellingen opgeslagen");
  await card.locator('[data-add-food="kibble"]').click();
  await expect(card.locator('[data-food="kibble"][data-row="6"][data-column="0"]')).toHaveValue("21");
  await card.locator('[data-remove-food="kibble"][data-index="6"]').click();
  await expect(card.locator('[data-food="kibble"][data-row="6"]')).toHaveCount(0);
  await card.locator("#feeding-kibble-method").selectOption("per_kg");
  await card.locator("#feeding-kibble-grams_per_kg").fill("80");
  await card.locator("#feeding-kibble-grams_per_kg").blur();
  await card.locator("#feeding-meat-method").selectOption("linear");
  await card.locator("#feeding-meat-coefficient").fill("60");
  await card.locator("#feeding-meat-offset").fill("10");
  await card.locator("#feeding-meat-offset").blur();
  await expect(card.locator('[data-puppy-id="p1"] [data-feeding-kibble-daily]')).toHaveText("40 g");
  await expect(card.locator('[data-puppy-id="p1"] [data-feeding-meat-daily]')).toHaveText("35 g");
  await expect(card.locator("#feeding-save-status")).toHaveText("Voedingsinstellingen opgeslagen");
  const dimensions = await card.evaluate((element) => {
    const container = element.shadowRoot.querySelector("ha-card");
    return { width: container.clientWidth, scrollWidth: container.scrollWidth };
  });
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width);
  await card.screenshot({ path: test.info().outputPath("food-editors.png") });
  const restored = await mountCalculator(page, { default_mode: "feeding" });
  await expect(restored.locator("#feeding-kibble-method")).toHaveValue("per_kg");
  await expect(restored.locator("#feeding-meat-method")).toHaveValue("linear");
  await expect(restored.locator("#feeding-kibble-grams_per_kg")).toHaveValue("80");
  await expect(restored.locator("#feeding-meat-offset")).toHaveValue("10");
});

test("feeding preferences are read-only for non-admin users", async ({ page }) => {
  const card = await mountCalculator(page, { default_mode: "feeding", readonly: true });
  await expect(card.locator("#feeding-save-status")).toHaveText("Voedingsinstellingen: alleen lezen");
  await expect(card.locator("#feeding-kibble-method")).toBeDisabled();
  await card.getByText("Brokken: instellingen", { exact: true }).click();
  await expect(card.locator('[data-add-food="kibble"]')).toBeDisabled();
  expect(await page.evaluate(() => window.__feedingCalls.length)).toBe(0);
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

test("feeding preferences survive reload and remain separate per litter @cross-browser @tablet", async ({ page }) => {
  let card = await mountCalculator(page);
  await card.locator('[data-calculator-mode="feeding"]').click();
  await card.locator("#feeding-portions").fill("3");
  await card.locator("#feeding-portions").blur();
  await expect(card.locator("#feeding-save-status")).toHaveText("Voedingsinstellingen opgeslagen");
  await card.locator("#feeding-meat").focus();
  await card.locator("#feeding-meat").press("End");
  await card.getByText("Vlees: instellingen", { exact: true }).click();
  await card.locator("#feeding-meat-grams_per_kg").fill("50");
  await card.locator("#feeding-meat-grams_per_kg").blur();
  await card.locator("#feeding-kibble-method").selectOption("linear");
  await expect(card.locator("#feeding-save-status")).toHaveText("Voedingsinstellingen opgeslagen");
  card = await mountCalculator(page);
  await expect(card.locator("#feeding-portions")).toHaveValue("3");
  await expect(card.locator("#feeding-meat")).toHaveValue("100");
  await expect(card.locator("#feeding-meat-grams_per_kg")).toHaveValue("50");
  await expect(card.locator("#feeding-kibble-method")).toHaveValue("linear");
  await card.locator("#calculator-litter").selectOption("l2");
  await expect(card.locator("#feeding-portions")).toHaveValue("4");
  await expect(card.locator("#feeding-meat")).toHaveValue("50");
  await expect(card.locator("#feeding-meat-grams_per_kg")).toHaveValue("45");
  await expect(card.locator("#feeding-kibble-method")).toHaveValue("table");
  await card.locator("#feeding-portions").fill("5");
  await card.locator("#feeding-portions").blur();
  await expect(card.locator("#feeding-save-status")).toHaveText("Voedingsinstellingen opgeslagen");
  await card.locator("#calculator-litter").selectOption("l1");
  await expect(card.locator("#feeding-portions")).toHaveValue("3");
  await expect(card.locator("#feeding-meat")).toHaveValue("100");
});

test("failed feeding save keeps the draft through refresh and can be retried @cross-browser @tablet", async ({ page }) => {
  const card = await mountCalculator(page, { default_mode: "feeding" });
  await page.evaluate(() => { window.__feedingSaveError = true; });
  await card.locator("#feeding-portions").fill("6");
  await card.locator("#feeding-portions").blur();
  await expect(card.locator("#feeding-save-status")).toContainText("Opslaan mislukt");
  await page.evaluate(() => window.__calculatorUpdate?.({ type: "updated" }));
  await expect(card.locator("#feeding-portions")).toHaveValue("6");
  await page.evaluate(() => { window.__feedingSaveError = false; });
  await card.locator("#feeding-retry").click();
  await expect(card.locator("#feeding-save-status")).toHaveText("Voedingsinstellingen opgeslagen");
  await card.locator("#feeding-portions").fill("2.5");
  await card.locator("#feeding-portions").blur();
  await expect(card.locator("#calculator-hint")).toContainText("porties (1–12)");
  const calls = await page.evaluate(() => window.__feedingCalls);
  expect(calls).toHaveLength(2);
  expect(calls.every((call) => call.settings.portions_per_day === 6)).toBe(true);
});

test("in-flight feeding saves use the latest settings and keep their original litter @cross-browser @tablet", async ({ page }) => {
  const card = await mountCalculator(page, { default_mode: "feeding" });
  await page.evaluate(() => { window.__feedingSaveGate = new Promise((resolve) => { window.__releaseFeedingSave = resolve; }); });
  await card.locator("#feeding-meat").focus();
  await card.locator("#feeding-meat").press("End");
  await expect(card.locator("#feeding-save-status")).toHaveText("Voedingsinstellingen opslaan…");
  await card.locator("#feeding-portions").fill("2");
  await card.locator("#feeding-portions").blur();
  await card.locator("#calculator-litter").selectOption("l2");
  await expect(card.locator("#feeding-portions")).toHaveValue("4");
  await page.evaluate(() => { window.__feedingSaveGate = null; window.__releaseFeedingSave(); });
  await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem("fixture-feeding-profiles") || "{}").l1?.portions_per_day)).toBe(2);
  await expect(card.locator("#feeding-portions")).toHaveValue("4");
  await expect(card.locator("#feeding-meat")).toHaveValue("50");
  const calls = await page.evaluate(() => window.__feedingCalls);
  expect(calls).toHaveLength(2);
  expect(calls.every((call) => call.litter_id === "l1")).toBe(true);
  await card.locator("#calculator-litter").selectOption("l1");
  await expect(card.locator("#feeding-portions")).toHaveValue("2");
  await expect(card.locator("#feeding-meat")).toHaveValue("100");
});
