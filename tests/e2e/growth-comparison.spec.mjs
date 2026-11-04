import { expect, test } from "@playwright/test";

async function install(page, language = "nl") {
  await page.goto("/tests/e2e/cards.html?production=1");
  await page.waitForFunction(() => window.__puppyTrackerReady === true);
  await page.evaluate(async language => {
    await import("/custom_components/puppy_tracker/frontend/puppy-tracker-growth-comparison.js");
    const puppies = ["Nova", "Ozzy"].map((name, index) => {
      const age_points = Array.from({ length: 22 }, (_, day) => ({ day, birth_factor: 1 + day * .1, interpolated: day % 7 !== 0 }));
      const points = age_points.map(p => ({ ...p, relative_weight_percent: 95 + p.day * .2 + index * 8,
        position_change_points: p.day >= 7 ? 1.4 : null, relative_growth_percent: 95, peer_count: 1, peer_median_grams: 1500, peer_mean_grams: 1500 }));
      return { id: `p${index}`, name, collar_color: index ? "blauw" : "paars", points, age_points, summary: points.at(-1),
        weeks: Array.from({ length: 8 }, (_, week) => ({ week: week + 1, day: (week + 1) * 7,
          comparison: points.find(p => p.day === (week + 1) * 7), age_point: age_points.find(p => p.day === (week + 1) * 7) })) };
    });
    window.__comparisonData = { litter_id: "l1", puppies, history: null };
    const history = { filter: "all", minimum_band_litters: 5,
      sources: ["Nest A", "Nest B"].map((name, index) => ({ id: name, name, points: puppies[0].age_points.map(p => ({ ...p, birth_factor: p.birth_factor + index * .15, puppy_count: 4 })) })),
      reference: puppies[0].age_points.map(p => ({ ...p, litter_count: 2, puppy_count: 8, lower_factor: null, upper_factor: null })) };
    window.__comparisonCalls = [];
    window.__delayComparison = false;
    const hass = { language, states: {}, connection: {}, callWS: message => {
      window.__comparisonCalls.push(message);
      const data = { ...window.__comparisonData, litter_id: message.litter_id,
        history: message.include_history ? { ...history, filter: message.reference_filter } : null };
      if (window.__delayComparison) return new Promise(resolve => { window.__resolveComparison = () => resolve(data); });
      return Promise.resolve(data);
    } };
    window.__comparisonHass = hass;
    const comparison = document.createElement("puppy-tracker-growth-comparison");
    comparison.id = "comparison-test";
    document.querySelector("#cards").append(comparison);
    comparison.setContext({ hass, litterId: "l1", puppyId: "p0", revision: "v1" });
  }, language);
}

for (const language of ["nl", "en"]) {
  test(`comparison starts quietly and loads historical references only when selected ${language} @cross-browser @tablet`, async ({ page }) => {
    await install(page, language);
    const card = page.locator("#comparison-test");
    await expect(card.locator(".brief")).toContainText(language === "nl" ? "99,2%" : "99.2%");
    await expect(card.locator("details")).not.toHaveAttribute("open");
    await expect(card.locator("svg")).toHaveCount(0);
    expect(await page.evaluate(() => window.__comparisonCalls)).toHaveLength(1);
    await card.locator("summary").click();
    await expect(card.locator("svg")).toBeVisible();
    await expect(card.locator("[data-panel='weeks']")).not.toHaveAttribute("open");
    await card.locator("[data-panel='weeks'] > summary").click();
    await expect(card.locator("table")).toBeVisible();
    await expect(card.locator("tbody tr")).toHaveCount(8);
    await expect(card.locator("tbody tr").last()).toContainText("—");
    const color = await card.locator("svg path").first().evaluate(p => p.style.stroke);
    expect(color).toBe("rgb(142, 36, 170)");
    await expect(card.locator(".legend")).toContainText("Nova (paars)");
    await card.locator("#mode").selectOption("history");
    await expect(card.locator(".body")).toContainText(language === "nl" ? "2 eerdere nesten" : "2 earlier litters");
    await expect(card.locator("tbody tr")).toHaveCount(8);
    expect((await page.evaluate(() => window.__comparisonCalls)).at(-1)).toMatchObject({ include_history: true, reference_filter: "all" });
    await card.locator("#mode").selectOption("peers");
    await card.locator("#mode").selectOption("history");
    expect(await page.evaluate(() => window.__comparisonCalls)).toHaveLength(2);
    const size = await card.evaluate(el => ({ client: el.clientWidth, scroll: el.scrollWidth }));
    expect(size.scroll).toBeLessThanOrEqual(size.client + 1);
    await card.screenshot({ path: test.info().outputPath(`comparison-${language}.png`) });
  });
}

test("late comparison responses preserve selection, filter focus and reject an older litter @cross-browser @tablet", async ({ page }) => {
  await install(page, "en");
  const card = page.locator("#comparison-test");
  await expect(card.locator(".brief")).toContainText("99.2%");
  await card.locator("summary").click();
  await card.locator("#mode").selectOption("history");
  await expect(card.locator(".body")).toContainText("2 earlier litters");
  const bodyHeight = (await card.locator(".body").boundingBox()).height;
  await page.evaluate(() => { window.__delayComparison = true; });
  await card.locator("#reference-filter").selectOption("same_mother");
  expect((await card.locator(".body").boundingBox()).height).toBeGreaterThanOrEqual(bodyHeight - 1);
  await card.locator("#reference-filter").focus();
  await card.evaluate(el => { window.__filterNode = el.shadowRoot.querySelector("#reference-filter"); });
  await page.evaluate(() => window.__resolveComparison());
  await expect(card.locator("#reference-filter")).toBeFocused();
  expect(await card.evaluate(el => el.shadowRoot.querySelector("#reference-filter") === window.__filterNode)).toBe(true);
  await card.locator("#reference-filter").selectOption("same_size");
  await page.evaluate(() => { window.__oldComparison = window.__resolveComparison; });
  await card.evaluate(el => el.setContext({ hass: window.__comparisonHass, litterId: "l2", puppyId: "p1", revision: "v2" }));
  await page.evaluate(() => window.__resolveComparison());
  await expect(card.locator(".brief")).toContainText("107.2%");
  await page.evaluate(() => window.__oldComparison());
  expect(await card.evaluate(el => el._data.litter_id)).toBe("l2");
  await expect(card.locator(".brief")).toContainText("107.2%");
});

test("overview retains comparison disclosure and avoids requests when hidden or unchanged @cross-browser @tablet", async ({ page }) => {
  await install(page, "en");
  await page.evaluate(() => {
    document.querySelector("#comparison-test").remove();
    window.__comparisonCalls = [];
    const device = { id: "device-l1", identifiers: [["puppy_tracker", "litter_l1"]], name: "Litter" };
    const card = document.createElement("puppy-tracker-overview-card");
    card.id = "overview-comparison";
    card._config = { show_summary: false, show_growth_milestones: false, show_advanced_analysis: false };
    card._hass = window.__comparisonHass;
    card._devices = [device]; card._registryLoaded = true;
    card._selectedLitterId = device.id; card._selectedPuppyId = "p0";
    card._history = { litter: { id: "l1" }, puppies: [] };
    card._puppyRows = () => window.__comparisonData.puppies.map(p => ({ puppyId: p.id, name: p.name, displayName: p.name,
      collar: p.collar_color, statusCode: "ok", age: "3 weeks", entityIds: {}, analysis: {} }));
    card._chartSvg = () => "";
    document.querySelector("#cards").append(card);
    card._render();
  });
  const overview = page.locator("#overview-comparison");
  const comparison = overview.locator("puppy-tracker-growth-comparison");
  await expect(comparison.locator(".brief")).toContainText("99.2%");
  await comparison.locator("summary").click();
  await overview.evaluate(el => el._render());
  await expect(comparison.locator("details").first()).toHaveAttribute("open");
  expect(await page.evaluate(() => window.__comparisonCalls)).toHaveLength(1);
  await overview.evaluate(el => { el._selectedPuppyId = "p1"; el._render(); });
  await expect(comparison.locator(".brief")).toContainText("107.2%");
  expect(await page.evaluate(() => window.__comparisonCalls)).toHaveLength(1);
  await overview.evaluate(el => { el._config.show_litter_comparison = false; el._render(); });
  await expect(comparison).toHaveCount(0);
});

test("failed comparison offers retry without automatic request loops @cross-browser @tablet", async ({ page }) => {
  await install(page, "en");
  const card = page.locator("#comparison-test");
  await expect(card.locator(".brief")).toContainText("99.2%");
  await card.evaluate(el => {
    window.__savedComparisonWS = window.__comparisonHass.callWS;
    window.__comparisonHass.callWS = async () => { window.__failedComparisonCalls = (window.__failedComparisonCalls || 0) + 1; throw new Error("offline"); };
    el.setContext({ hass: window.__comparisonHass, litterId: "l1", puppyId: "p0", revision: "offline" });
  });
  await expect(card.locator(".brief")).toContainText("Comparison unavailable");
  await card.locator("summary").click();
  await expect(card.locator("[role='alert']")).toContainText("Could not load comparison");
  await card.evaluate(el => el.setContext({ hass: window.__comparisonHass, litterId: "l1", puppyId: "p0", revision: "offline" }));
  expect(await page.evaluate(() => window.__failedComparisonCalls)).toBe(1);
  await page.evaluate(() => { window.__comparisonHass.callWS = window.__savedComparisonWS; });
  await card.locator("#retry").click();
  await expect(card.locator(".brief")).toContainText("99.2%");
});
