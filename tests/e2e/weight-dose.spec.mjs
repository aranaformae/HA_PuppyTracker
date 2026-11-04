import { expect, test } from "@playwright/test";

for (const language of ["nl", "en"]) {
  test(`dose warning updates at expiry without rebuilding a focused form (${language}) @cross-browser @tablet`, async ({ page }) => {
    await page.clock.install({ time: new Date("2026-11-04T12:00:00Z") });
    await page.goto("/tests/e2e/cards.html?production=1");
    await page.waitForFunction(() => window.__puppyTrackerReady);
    await page.evaluate(async language => {
      const { weightDoseMarkup } = await import("/custom_components/puppy_tracker/frontend/puppy-tracker-weight-dose.js");
      const node = document.createElement("section");
      node.innerHTML = `<input id="dose-focus" value="actual amount">` + weightDoseMarkup({ language, config: { time_zone: "UTC" } }, {
        amount: 0.55, unit: "ml", weight_grams: 2750, weight_timestamp: "2026-11-04T11:00:01Z",
        status: "ready", max_weight_age_hours: 1,
      });
      document.querySelector("#cards").append(node);
      document.getElementById("dose-focus").focus();
    }, language);
    const view = page.locator("puppy-tracker-weight-dose");
    await expect(view.locator(".ready")).toBeVisible();
    await expect(view).toContainText(language === "nl" ? "0,55 ml" : "0.55 ml");
    await page.clock.runFor(1100);
    await expect(view.locator(".warning")).toBeVisible();
    await expect(view).toContainText(language === "nl" ? "GEWICHT TE OUD" : "WEIGHT TOO OLD");
    await expect(page.locator("#dose-focus")).toBeFocused();
    await expect(page.locator("#dose-focus")).toHaveValue("actual amount");
    expect(await view.evaluate(node => { node.remove(); return node._timer; })).toBeNull();
  });
}

test("litter dose list keeps each puppy's amount and warning together @cross-browser @tablet", async ({ page }) => {
  await page.goto("/tests/e2e/cards.html?production=1");
  await page.waitForFunction(() => window.__puppyTrackerReady);
  await page.evaluate(async () => {
    const { weightDoseMarkup } = await import("/custom_components/puppy_tracker/frontend/puppy-tracker-weight-dose.js");
    document.querySelector("#cards").innerHTML = weightDoseMarkup({ language: "en" }, { status: "per_puppy", items: [
      { puppy_label: "Nova (Purple)", dose: { amount: 0.6, unit: "ml", status: "stale_weight", weight_grams: 3000,
        weight_timestamp: new Date(Date.now() - 48 * 3600000).toISOString(), max_weight_age_hours: 24 } },
      { puppy_label: "Bob (Blue)", dose: { amount: 0.4, unit: "ml", status: "ready", weight_grams: 2000,
        weight_timestamp: new Date().toISOString(), max_weight_age_hours: 168 } },
    ] });
  });
  const list=page.locator(".weight-dose-batch");
  await expect(list).toContainText("Nova (Purple)");
  await expect(list.locator("puppy-tracker-weight-dose").nth(0)).toContainText("0.6 ml");
  await expect(list.locator("puppy-tracker-weight-dose").nth(0)).toContainText("WEIGHT TOO OLD");
  await expect(list.locator("puppy-tracker-weight-dose").nth(1).locator(".ready")).toBeVisible();
  expect(await list.evaluate(node=>node.scrollWidth<=node.clientWidth+1)).toBe(true);
});
