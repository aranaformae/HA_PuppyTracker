import { expect, test } from "@playwright/test";

async function selectTab(workspace, tab) {
  const button = workspace.locator(`[data-tab="${tab}"]`);
  if (await button.isVisible()) await button.click();
  else await workspace.locator("#workspace-tab-select").selectOption(tab);
}

test("fictional demo supports logging, editing, care and reset without a real backend @cross-browser @tablet", async ({ page }) => {
  const outside = [];
  page.on("request", (request) => { if (!request.url().startsWith("http://127.0.0.1:4173/")) outside.push(request.url()); });
  await page.goto("/demo/?lang=en");
  await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
  await expect(page.locator("#privacy")).toContainText("All data is fictional");
  const workspace = page.locator("puppy-tracker-workspace-card");
  const quick = workspace.locator("puppy-tracker-quick-log-card");
  await quick.locator('[data-preset="note"]').click();
  await quick.locator("#quick-note").fill("My practice observation");
  await quick.locator("#quick-save").click();
  await expect(quick.locator("#quick-note")).toHaveCount(0);
  await selectTab(workspace, "dossier");
  await expect(workspace.locator("puppy-tracker-dossier-card")).toContainText("My practice observation");
  const savedRow = workspace.locator("puppy-tracker-dossier-card article").filter({ hasText: "My practice observation" });
  await savedRow.locator("[data-edit-item]").click();
  await page.locator("puppy-tracker-record-editor #record-note").fill("Updated practice observation");
  await page.locator("puppy-tracker-record-editor #record-save").click();
  await expect(workspace.locator("puppy-tracker-dossier-card")).toContainText("Updated practice observation");
  await page.locator('[data-view="care"]').click();
  const care = workspace.locator("puppy-tracker-care-execution-card");
  await expect(care.locator(".rows .row")).toHaveCount(3);
  await care.locator(".rows .row .main").first().click();
  const editor = page.locator("puppy-tracker-record-editor");
  await editor.locator("#record-note").fill("Calm during the practice exercise");
  await editor.locator("#record-save").click();
  await expect(care.locator(".rows .row")).toHaveCount(2);
  await selectTab(workspace, "calculator");
  const calculator = workspace.locator("puppy-tracker-calculator-card");
  await calculator.locator('[data-calculator-mode="feeding"]').click();
  await calculator.locator("#feeding-meat-portions").fill("3");
  await calculator.locator("#feeding-kibble-portions").click();
  await expect(calculator.locator("#feeding-save-status")).toContainText("saved");
  await expect(calculator.locator("#calculator-count")).toContainText("3");

  await page.locator('[data-view="growth"]').click();
  await expect(workspace.locator("puppy-tracker-overview-card")).toContainText("Nova");
  await expect(workspace.locator("puppy-tracker-overview-card svg").first()).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("demo-growth.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.locator("#reset").click();
  await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
  await page.locator('[data-view="care"]').click();
  await expect(page.locator("puppy-tracker-care-execution-card .rows .row")).toHaveCount(3);
  expect(outside).toEqual([]);
});

test("HA preview failure falls back to a usable local demo @cross-browser", async ({ page }) => {
  await page.route("https://demo.home-assistant.io/**", (route) => route.abort());
  await page.goto("/demo/?lang=nl&renderer=ha");
  await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
  await expect(page.locator("#status")).toContainText("eenvoudige weergave");
  await expect(page.locator('puppy-tracker-quick-log-card [data-preset="note"]')).toBeEnabled();
});
