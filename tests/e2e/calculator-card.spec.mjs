import { expect, test } from "@playwright/test";

test("food methods stay aligned in a shared row and stack on narrow cards @cross-browser @tablet", async ({ page }) => {
  const card = await mountCalculator(page, { default_mode: "feeding" });
  await expect(card.locator("#feeding-kibble-method")).toBeVisible();
  const assertLayout = async () => {
    const container = await card.locator("ha-card").boundingBox();
    const kibble = await card.locator("#feeding-kibble-method").boundingBox();
    const meat = await card.locator("#feeding-meat-method").boundingBox();
    if (container.width - 32 > 420) {
      expect(Math.abs(kibble.y - meat.y)).toBeLessThan(1);
      expect(meat.x).toBeGreaterThan(kibble.x);
    } else {
      expect(meat.y).toBeGreaterThan(kibble.y);
      expect(Math.abs(kibble.x - meat.x)).toBeLessThan(1);
    }
  };
  await assertLayout();
  await card.getByText("Brokken: instellingen", { exact: true }).click();
  await assertLayout();
  await card.screenshot({ path: test.info().outputPath("aligned-food-methods.png") });
  await card.locator("#feeding-allocation").selectOption("energy");
  const kibble = await card.locator("#feeding-kibble-kcal_per_100g").boundingBox();
  const meat = await card.locator("#feeding-meat-kcal_per_100g").boundingBox();
  const container = await card.locator("ha-card").boundingBox();
  if (container.width - 32 > 420) expect(Math.abs(kibble.y - meat.y)).toBeLessThan(1);
  else expect(meat.y).toBeGreaterThan(kibble.y);
  expect(await card.locator("ha-card").evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
});

test("age tables select inclusive stages and interpolate only within weight bounds", async ({ page }) => {
  await mountCalculator(page);
  const results = await page.evaluate(async () => {
    const { feedingSettingsFromStored, calculateFeedingForWeight, feedingSettingsForStorage } = await import("/custom_components/puppy_tracker/frontend/puppy-tracker-feeding-calculator.js");
    const settings = feedingSettingsFromStored({ meat_percent: 0 });
    settings.kibble.method = "age_table";
    settings.kibble.age_tables = [{ from_day: 21, table: [[1, 40], [3, 120]] }, { from_day: 35, table: [[1, 80], [3, 200]] }];
    const ages = [null, -1, 20, 21, 34, 35, 200].map((age) => calculateFeedingForWeight(2000, settings, age));
    const bounds = [500, 1000, 3000, 3500].map((weight) => calculateFeedingForWeight(weight, settings, 35));
    settings.meatPercent = 100;
    const unused = calculateFeedingForWeight(2000, settings);
    settings.kibble.age_tables[1].from_day = 21;
    const invalid = feedingSettingsForStorage(settings);
    const { calculatorAgeForPuppy } = await import("/custom_components/puppy_tracker/frontend/puppy-tracker-calculator-card.js");
    const now = Date.parse("2026-10-14T12:00:00Z");
    return { ages, bounds, unused, invalid, birth: [
      calculatorAgeForPuppy({ birth_time: "2026-10-01T12:00:00Z" }, {}, now),
      calculatorAgeForPuppy({}, { birth_date: "2026-10-01" }, now),
      calculatorAgeForPuppy({}, {}, now),
      calculatorAgeForPuppy({ birth_time: "2026-10-15T00:00:00Z" }, {}, now),
    ] };
  });
  expect(results.ages.map((row) => row.status)).toEqual(["missing_age", "missing_age", "before_age_stage", "ok", "ok", "ok", "ok"]);
  expect(results.ages.slice(3).map((row) => row.kibbleDaily)).toEqual([80, 80, 140, 140]);
  expect(results.bounds.map((row) => row.status)).toEqual(["outside_food_range", "ok", "ok", "outside_food_range"]);
  expect(results.bounds[1].kibbleDaily).toBe(80);
  expect(results.bounds[2].kibbleDaily).toBe(200);
  expect(results.unused.status).toBe("ok");
  expect(results.invalid).toBeNull();
  expect(results.birth).toEqual([13, 13, null, null]);
});

test("energy allocation conserves kcal and uses independent food portions", async ({ page }) => {
  await mountCalculator(page);
  const results = await page.evaluate(async () => {
    const { feedingSettingsFromStored, calculateFeedingForWeight, feedingSettingsForStorage } = await import("/custom_components/puppy_tracker/frontend/puppy-tracker-feeding-calculator.js");
    const settings = feedingSettingsFromStored({ allocation_mode: "energy", kcal_per_kg: 100 });
    settings.kibble.kcal_per_100g = 400;
    settings.meat.kcal_per_100g = 200;
    settings.kibble.method = "age_table";
    const shares = [0, 50, 100].map((share) => {
      settings.meatPercent = share;
      return calculateFeedingForWeight(2000, settings);
    });
    settings.meatPercent = 100;
    settings.kibble.kcal_per_100g = 0;
    const excluded = calculateFeedingForWeight(2000, settings);
    settings.meatPercent = 50;
    const missing = calculateFeedingForWeight(2000, settings);
    settings.kibble.kcal_per_100g = 400;
    const invalid = [0, -1, true, Infinity, ""].map((target) => feedingSettingsForStorage({ ...settings, kcalPerKg: target }));
    return { shares, excluded, missing, invalid };
  });
  expect(results.shares.map((row) => [row.kibbleDaily, row.meatDaily])).toEqual([[50, 0], [25, 50], [0, 100]]);
  results.shares.forEach((row) => {
    expect(row.kcalDaily).toBe(200);
    expect(row.kibbleDaily * 4 + row.meatDaily * 2).toBe(200);
  });
  expect(results.shares[1]).toMatchObject({ kibblePerPortion: 25, meatPerPortion: 25, feedingMoments: 3 });
  expect(results.excluded.status).toBe("ok");
  expect(results.missing.status).toBe("invalid_settings");
  expect(results.invalid).toEqual([null, null, null, null, null]);
});

test("age and energy editors persist across modes and devices without moving focus @cross-browser @tablet", async ({ page }) => {
  const card = await mountCalculator(page, { default_mode: "feeding" });
  await card.locator("#feeding-kibble-method").selectOption("age_table");
  await expect(card.locator('[data-food="kibble"][data-stage="0"][data-key="from_day"]')).toHaveValue("0");
  await card.locator('[data-food="kibble"][data-stage="0"][data-key="from_day"]').fill("21");
  await card.locator('[data-add-stage="kibble"]').click();
  await card.locator('[data-food="kibble"][data-stage="1"][data-key="from_day"]').fill("35");
  const ration = card.locator('[data-food="kibble"][data-stage="1"][data-row="0"][data-column="1"]');
  await ration.fill("100");
  await page.evaluate(() => window.__calculatorUpdate?.({ type: "updated" }));
  await expect(ration).toBeFocused();
  await ration.blur();
  await expect(card.locator('[data-puppy-id="p1"] [data-feeding-kibble-daily]')).toHaveText("28,5 g");
  await expect(card.locator('[data-puppy-id="p2"] [data-feeding-kibble-daily]')).toHaveText("49 g");
  await card.locator("#feeding-allocation").selectOption("energy");
  await expect(card.locator("#feeding-kibble-method")).toBeHidden();
  await card.locator("#feeding-kcal").fill("100");
  await card.locator("#feeding-kibble-kcal_per_100g").fill("400");
  await card.locator("#feeding-meat-kcal_per_100g").fill("200");
  await card.locator("#feeding-meat-kcal_per_100g").blur();
  await expect(card.locator("#feeding-save-status")).toHaveText("Voedingsinstellingen opgeslagen");
  await expect(card.locator('[data-puppy-id="p1"] [data-feeding-kibble-daily]')).toHaveText("12,5 g");
  await expect(card.locator('[data-puppy-id="p1"] [data-feeding-meat-daily]')).toHaveText("25 g");
  await expect(card.locator('[data-puppy-id="p1"] [data-feeding-note]')).toContainText("100 kcal");
  await card.screenshot({ path: test.info().outputPath("energy-editor.png") });
  const dimensions = await card.evaluate((element) => {
    const container = element.shadowRoot.querySelector("ha-card");
    return { width: container.clientWidth, scrollWidth: container.scrollWidth };
  });
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width);
  const restored = await mountCalculator(page, { default_mode: "feeding" });
  await expect(restored.locator("#feeding-allocation")).toHaveValue("energy");
  await expect(restored.locator("#feeding-kcal")).toHaveValue("100");
  await restored.locator("#feeding-allocation").selectOption("ration");
  await expect(restored.locator("#feeding-kcal")).toBeHidden();
  await expect(restored.locator("#feeding-kibble-method")).toHaveValue("age_table");
  await restored.getByText("Brokken: instellingen", { exact: true }).click();
  await expect(restored.locator('[data-food="kibble"][data-stage="1"][data-row="0"][data-column="1"]')).toHaveValue("100");
  await restored.locator('[data-add-food="kibble"][data-stage="1"]').click();
  await expect(restored.locator('[data-food="kibble"][data-stage="1"][data-row="6"][data-column="0"]')).toHaveValue("21");
  await restored.locator('[data-remove-food="kibble"][data-stage="1"][data-index="6"]').click();
  await restored.locator('[data-remove-stage="kibble"][data-stage="1"]').click();
  await expect(restored.locator('[data-food="kibble"][data-stage="1"]')).toHaveCount(0);
  await restored.screenshot({ path: test.info().outputPath("age-editor.png") });
});

test("new feeding options translate and missing birth dates never become day zero", async ({ page }) => {
  const card = await mountCalculator(page, { default_mode: "feeding" });
  await card.evaluate((element) => {
    element._data.puppies[0].birth_time = null;
    element.hass = { ...element._hass, language: "en", locale: { language: "en" } };
  });
  await card.locator("#feeding-kibble-method").selectOption("age_table");
  await expect(card.locator('[data-puppy-id="p1"] [data-feeding-note]')).toHaveText("Birth date missing or in the future; this puppy is not included.");
  await expect(card.locator('[data-puppy-id="p1"] [data-feeding-kibble-daily]')).toHaveText("—");
  await expect(card.locator("#calculator-count")).toHaveText("1 puppy calculated");
  await card.locator('[data-food="kibble"][data-stage="0"][data-key="from_day"]').fill("3650");
  await expect(card.locator('[data-add-stage="kibble"]')).toBeDisabled();
  await card.locator('[data-food="kibble"][data-stage="0"][data-key="from_day"]').fill("0");
  await card.locator("#feeding-allocation").selectOption("energy");
  await expect(card.getByText("Daily target (kcal/kg body weight)", { exact: true })).toBeVisible();
  await expect(card.getByText("Kibble · Energy content (kcal/100 g)", { exact: true })).toBeVisible();
  await card.locator("#feeding-kcal").fill("100");
  await card.locator("#feeding-kibble-kcal_per_100g").fill("400");
  await card.locator("#feeding-meat-kcal_per_100g").fill("200");
  await card.locator("#feeding-meat-kcal_per_100g").blur();
  await expect(card.locator('[data-puppy-id="p1"] [data-feeding-note]')).toHaveText("100 kcal/day");
  await expect(card.locator("#calculator-count")).toHaveText("2 puppies calculated");
  const readonly = await mountCalculator(page, { default_mode: "feeding", readonly: true });
  await expect(readonly.locator("#feeding-allocation")).toBeDisabled();
  await expect(readonly.locator("#feeding-kcal")).toBeDisabled();
  await expect(readonly.locator("#feeding-kibble-kcal_per_100g")).toBeDisabled();
});

async function mountCalculator(page, config = {}) {
  await page.goto("/tests/e2e/cards.html");
  await page.waitForFunction(() => window.__puppyTrackerReady === true);
  await page.evaluate((config) => {
    const profiles = JSON.parse(sessionStorage.getItem("fixture-feeding-profiles") || "{}");
    window.__feedingCalls = [];
    const now = Date.now();
    const puppies = [
      {
        id: "p1", name: "Alice", collar_color: "Roze", active: true, birth_time: new Date(now - 28 * 86400000).toISOString(),
        summary: { current_weight: 1000, last_weighed: new Date(now - 3600000).toISOString(), hours_since_weighing: 1 },
      },
      {
        id: "p2", name: "Bob", collar_color: "Blauw", active: true, birth_time: new Date(now - 35 * 86400000).toISOString(),
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
  await expect(card.locator("#feeding-meat-portions")).toHaveValue("2");
  await page.evaluate(() => {
    window.__feedingReadGate = new Promise((resolve) => { window.__releaseFeedingRead = resolve; });
    document.querySelector("#calculator")._queueRefresh();
  });
  await page.waitForFunction(() => window.__feedingReadStarted);
  await card.locator("#feeding-meat-portions").fill("6");
  await card.locator("#feeding-meat-portions").dispatchEvent("change");
  await expect(card.locator("#feeding-save-status")).toHaveText("Voedingsinstellingen opgeslagen");
  await page.evaluate(() => {
    window.__feedingReadGate = null;
    window.__releaseFeedingRead();
    document.querySelector("#calculator").shadowRoot.activeElement?.blur();
  });
  await page.waitForFunction(() => !document.querySelector("#calculator")._refreshing);
  await expect(card.locator("#feeding-meat-portions")).toHaveValue("6");
});

test("per-kg calculator updates every puppy without rebuilding the inputs", { tag: ["@cross-browser", "@tablet"] }, async ({ page }) => {
  const card = await mountCalculator(page);
  await expect(card.getByText("Alice (Roze)", { exact: true })).toBeVisible();
  await expect(card.getByText("Bob (Blauw)", { exact: true })).toBeVisible();
  await expect(card.getByText("Charlie (Groen)", { exact: true })).toBeVisible();
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
  await expect(first.locator("[data-feeding-total-portion]")).toHaveCount(0);
  await expect(first.locator("[data-feeding-kibble-portion]")).toHaveText("28,5 g");
  await expect(first.locator("[data-feeding-meat-portion]")).toHaveText("11,3 g");
  await expect(card.locator("#feeding-moments")).toHaveText("3 voedingsmomenten per dag");
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
  await card.locator("#feeding-meat-portions").fill("2");
  await expect(first.locator("[data-feeding-meat-portion]")).toHaveText("25 g");
  await card.locator("#feeding-meat-portions").fill("2.5");
  await expect(card.locator("#calculator-hint")).toContainText("porties (1–12");
  await expect(card.locator("[data-feeding-sum-total-daily]")).toHaveText("—");
  await card.locator("#feeding-meat-portions").fill("4");
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

test("separate food portions show actual feeding moments and survive reload @cross-browser @tablet", async ({ page }) => {
  let card = await mountCalculator(page, { default_mode: "feeding" });
  await expect(card.locator("#feeding-kibble-portions")).toHaveValue("1");
  await expect(card.locator("#feeding-meat-portions")).toHaveValue("2");
  await expect(card.locator("#feeding-moments")).toHaveText("3 voedingsmomenten per dag");
  await expect(card.locator("#feeding-breakdown")).toHaveText("1 × brokken · 2 × vlees");
  const puppy = card.locator('[data-puppy-id="p2"]');
  await expect(puppy.locator("[data-feeding-kibble-daily]")).toHaveText("38,3 g");
  await expect(puppy.locator("[data-feeding-kibble-portion]")).toHaveText("38,3 g");
  await expect(puppy.locator("[data-feeding-meat-daily]")).toHaveText("33,8 g");
  await expect(puppy.locator("[data-feeding-meat-portion]")).toHaveText("16,9 g");
  await expect(card.locator("[data-feeding-total-portion]")).toHaveCount(0);
  await expect(card.locator("[data-feeding-sum-total-portion]")).toHaveCount(0);
  await card.locator("#feeding-kibble-portions").fill("2");
  await card.locator("#feeding-kibble-portions").blur();
  await card.locator("#feeding-meat-portions").fill("3");
  await card.locator("#feeding-meat-portions").blur();
  await expect(card.locator("#feeding-moments")).toHaveText("5 voedingsmomenten per dag");
  await expect(card.locator("#feeding-save-status")).toHaveText("Voedingsinstellingen opgeslagen");
  card = await mountCalculator(page, { default_mode: "feeding" });
  await expect(card.locator("#feeding-kibble-portions")).toHaveValue("2");
  await expect(card.locator("#feeding-meat-portions")).toHaveValue("3");
  await expect(card.locator("#feeding-breakdown")).toHaveText("2 × brokken · 3 × vlees");
  await card.locator("#feeding-meat").focus();
  await card.locator("#feeding-meat").press("Home");
  await expect(card.locator("#feeding-meat-portions")).toBeDisabled();
  await expect(card.locator("#feeding-meat-portions")).toHaveValue("0");
  await expect(card.locator("#feeding-moments")).toHaveText("2 voedingsmomenten per dag");
  await expect(card.locator("#feeding-breakdown")).toHaveText("2 × brokken · 0 × vlees");
  await expect(card.locator('[data-puppy-id="p2"] [data-feeding-meat-portion]')).toHaveText("—");
  await card.screenshot({ path: test.info().outputPath("separate-portions.png") });
  await card.locator("#feeding-meat").press("ArrowRight");
  await expect(card.locator("#feeding-meat-portions")).toBeEnabled();
  await expect(card.locator("#feeding-meat-portions")).toHaveValue("3");
  await expect(card.locator("#feeding-moments")).toHaveText("5 voedingsmomenten per dag");
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
      mix: calculate(2000, { meatPercent: 50, rate: 40, kibblePortions: 1, meatPortions: 2 }),
      kibble: calculate(2000, { meatPercent: 0, rate: 50, kibblePortions: 2, meatPortions: 2 }),
      meat: calculate(500, { meatPercent: 100, rate: 50, kibblePortions: 2, meatPortions: 2 }),
      outside: [500, 21000].map((weight) => calculate(weight).status),
      invalid: [0, 2.5, 13].map((portions) => calculate(1000, { meatPortions: portions }).status),
      invalidRate: calculate(1000, { rate: -1 }).status,
      invalidRatio: calculate(1000, { meatPercent: 101 }).status,
      noWeight: calculate(null).status,
    };
  });
  expect(results.points).toEqual([57, 96, 191, 267, 327, 360]);
  expect(results.halfway).toBe(143.5);
  expect(results.mix).toMatchObject({ status: "ok", kibbleDaily: 48, meatDaily: 40, totalDaily: 88, kibblePerPortion: 48, meatPerPortion: 20, feedingMoments: 3 });
  expect(results.kibble).toMatchObject({ status: "ok", kibbleDaily: 96, meatDaily: 0, kibblePerPortion: 48, feedingMoments: 2 });
  expect(results.meat).toMatchObject({ status: "ok", kibbleDaily: 0, meatDaily: 25, meatPerPortion: 12.5, feedingMoments: 2 });
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
    expect(value.kibblePerPortion).toBe(value.kibbleDaily);
    expect(value.meatPerPortion).toBe(value.meatDaily / 2);
    expect(value.feedingMoments).toBe(3);
  });
  expect(result.outside.status).toBe("outside_food_range");
  expect(result.unusedOutOfRange).toMatchObject({ status: "ok", kibbleDaily: 25, meatDaily: 0 });
  expect(result.duplicate).toBeNull();
});

test("old shared meal counts migrate consistently and ignore excluded food moments", async ({ page }) => {
  await mountCalculator(page);
  const result = await page.evaluate(async () => {
    const { feedingSettingsFromStored, feedingSchedule, calculateFeedingForWeight } = await import("/custom_components/puppy_tracker/frontend/puppy-tracker-feeding-calculator.js");
    return [[50, 4], [75, 3], [0, 4], [100, 4], [50, 1], [1, 12]].map(([share, count]) => {
      const settings = feedingSettingsFromStored({ meat_percent: share, portions_per_day: count });
      return { schedule: feedingSchedule(settings), calculation: calculateFeedingForWeight(2000, settings) };
    });
  });
  expect(result.map((row) => row.schedule)).toEqual([
    { kibble: 2, meat: 2, total: 4 }, { kibble: 1, meat: 2, total: 3 },
    { kibble: 4, meat: 0, total: 4 }, { kibble: 0, meat: 4, total: 4 },
    { kibble: 1, meat: 1, total: 2 }, { kibble: 11, meat: 1, total: 12 },
  ]);
  result.forEach((row) => {
    expect(row.calculation.status).toBe("ok");
    expect(row.calculation).not.toHaveProperty("totalPerPortion");
  });
  expect(result[2].calculation.meatPerPortion).toBeNull();
  expect(result[3].calculation.kibblePerPortion).toBeNull();
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
  await card.locator("#feeding-meat-portions").fill("3");
  await card.locator("#feeding-meat-portions").blur();
  await expect(card.locator("#feeding-save-status")).toHaveText("Voedingsinstellingen opgeslagen");
  await card.locator("#feeding-meat").focus();
  await card.locator("#feeding-meat").press("End");
  await card.getByText("Vlees: instellingen", { exact: true }).click();
  await card.locator("#feeding-meat-grams_per_kg").fill("50");
  await card.locator("#feeding-meat-grams_per_kg").blur();
  await card.locator("#feeding-kibble-method").selectOption("linear");
  await expect(card.locator("#feeding-save-status")).toHaveText("Voedingsinstellingen opgeslagen");
  card = await mountCalculator(page);
  await expect(card.locator("#feeding-meat-portions")).toHaveValue("3");
  await expect(card.locator("#feeding-meat")).toHaveValue("100");
  await expect(card.locator("#feeding-meat-grams_per_kg")).toHaveValue("50");
  await expect(card.locator("#feeding-kibble-method")).toHaveValue("linear");
  await card.locator("#calculator-litter").selectOption("l2");
  await expect(card.locator("#feeding-meat-portions")).toHaveValue("2");
  await expect(card.locator("#feeding-meat")).toHaveValue("50");
  await expect(card.locator("#feeding-meat-grams_per_kg")).toHaveValue("45");
  await expect(card.locator("#feeding-kibble-method")).toHaveValue("table");
  await card.locator("#feeding-meat-portions").fill("5");
  await card.locator("#feeding-meat-portions").blur();
  await expect(card.locator("#feeding-save-status")).toHaveText("Voedingsinstellingen opgeslagen");
  await card.locator("#calculator-litter").selectOption("l1");
  await expect(card.locator("#feeding-meat-portions")).toHaveValue("3");
  await expect(card.locator("#feeding-meat")).toHaveValue("100");
});

test("failed feeding save keeps the draft through refresh and can be retried @cross-browser @tablet", async ({ page }) => {
  const card = await mountCalculator(page, { default_mode: "feeding" });
  await page.evaluate(() => { window.__feedingSaveError = true; });
  await card.locator("#feeding-meat-portions").fill("6");
  await card.locator("#feeding-meat-portions").blur();
  await expect(card.locator("#feeding-save-status")).toContainText("Opslaan mislukt");
  await page.evaluate(() => window.__calculatorUpdate?.({ type: "updated" }));
  await expect(card.locator("#feeding-meat-portions")).toHaveValue("6");
  await page.evaluate(() => { window.__feedingSaveError = false; });
  await card.locator("#feeding-retry").click();
  await expect(card.locator("#feeding-save-status")).toHaveText("Voedingsinstellingen opgeslagen");
  await card.locator("#feeding-meat-portions").fill("2.5");
  await card.locator("#feeding-meat-portions").blur();
  await expect(card.locator("#calculator-hint")).toContainText("porties (1–12");
  const calls = await page.evaluate(() => window.__feedingCalls);
  expect(calls).toHaveLength(2);
  expect(calls.every((call) => call.settings.meat_portions_per_day === 6)).toBe(true);
});

test("in-flight feeding saves use the latest settings and keep their original litter @cross-browser @tablet", async ({ page }) => {
  const card = await mountCalculator(page, { default_mode: "feeding" });
  await page.evaluate(() => { window.__feedingSaveGate = new Promise((resolve) => { window.__releaseFeedingSave = resolve; }); });
  await card.locator("#feeding-meat").focus();
  await card.locator("#feeding-meat").press("End");
  await expect(card.locator("#feeding-save-status")).toHaveText("Voedingsinstellingen opslaan…");
  await card.locator("#feeding-meat-portions").fill("3");
  await card.locator("#feeding-meat-portions").blur();
  await card.locator("#calculator-litter").selectOption("l2");
  await expect(card.locator("#feeding-meat-portions")).toHaveValue("2");
  await page.evaluate(() => { window.__feedingSaveGate = null; window.__releaseFeedingSave(); });
  await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem("fixture-feeding-profiles") || "{}").l1?.meat_portions_per_day)).toBe(3);
  await expect(card.locator("#feeding-meat-portions")).toHaveValue("2");
  await expect(card.locator("#feeding-meat")).toHaveValue("50");
  const calls = await page.evaluate(() => window.__feedingCalls);
  expect(calls).toHaveLength(2);
  expect(calls.every((call) => call.litter_id === "l1")).toBe(true);
  await card.locator("#calculator-litter").selectOption("l1");
  await expect(card.locator("#feeding-meat-portions")).toHaveValue("3");
  await expect(card.locator("#feeding-meat")).toHaveValue("100");
});
