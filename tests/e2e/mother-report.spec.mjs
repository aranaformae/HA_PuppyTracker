import { expect, test } from "@playwright/test";
import { mountAsyncCard, pendingCount, release } from "./helpers/async-card.mjs";

const PDF = "puppy_tracker/mother/pdf";

for (const language of ["nl", "en"]) {
  test(`mother PDF exposes relevant sections and preserves puppy report choices (${language}) @cross-browser @tablet`, async ({ page }, testInfo) => {
    const card = await mountAsyncCard(page, "report", { language });
    await card.locator("#puppy").selectOption("__mother__");
    await expect(card.locator('[data-pdf-section="chart"]').locator("..")).toContainText(language === "en" ? "Temperature chart" : "Temperatuurgrafiek");
    await expect(card.locator('[data-pdf-section="measurements"]').locator("..")).toContainText(language === "en" ? "Temperature measurements" : "Temperatuurmetingen");
    for (const section of ["owners", "owner_contact", "behavior", "attention"]) await expect(card.locator(`[data-pdf-section="${section}"]`)).toHaveCount(0);
    await expect(card.locator("#csv")).toHaveCount(0);
    await expect(card.locator("#range")).toBeVisible();
    await expect(card.locator(".preview-counts")).toHaveCount(0);
    await card.locator('[data-pdf-section="chart"]').uncheck();
    await card.locator('[data-pdf-section="litter_context"]').check();
    await card.locator("#mother-export-scope").selectOption("current");
    await card.locator("#range").selectOption("7d");
    await card.locator(".dossier-filters summary").click();
    await expect(card.locator("[data-dossier-scope]")).toHaveCount(0);
    await card.locator("#no-dossier-types").click();
    await card.locator("#pdf-report").screenshot({ path: testInfo.outputPath("mother-pdf-options.png") });
    const download = page.waitForEvent("download");
    await card.locator("#pdf").click();
    expect((await download).suggestedFilename()).toBe("puppy-tracker-mother.pdf");
    const call = await page.evaluate(type => window.__async.calls.find(call => call.type === type), PDF);
    expect(call).toMatchObject({ litter_id: "a", history_scope: "current", range_hours: 168, language, dossier_types: [], sections: { chart: false, litter_context: true, care: true, measurements: true } });
    expect(call).not.toHaveProperty("puppy_id");
    expect(call.sections).not.toHaveProperty("owners");
    await card.locator("#puppy").selectOption("a1");
    await expect(card.locator('[data-pdf-section="chart"]')).toBeChecked();
    await expect(card.locator('[data-pdf-section="owners"]')).toHaveCount(1);
    await card.locator("#puppy").selectOption("__mother__");
    await expect(card.locator('[data-pdf-section="chart"]')).not.toBeChecked();
    await expect(card.locator('[data-pdf-section="litter_context"]')).toBeChecked();
    await expect(card.locator('[data-dossier-type]:checked')).toHaveCount(0);
    await card.locator('[data-pdf-section="profile_note"]').check();
    await card.locator('[data-pdf-section="identity"]').uncheck();
    await expect(card.locator('[data-pdf-section="profile_note"]')).not.toBeChecked();
    await expect(card.locator('[data-pdf-section="profile_note"]')).toBeDisabled();
  });
}

test("mother PDF keeps its options through a delayed logo and deferred reconfiguration @cross-browser @tablet", async ({ page }) => {
  const card = await mountAsyncCard(page, "report");
  await card.locator("#puppy").selectOption("__mother__");
  await card.locator("#mother-export-scope").selectOption("current");
  await card.locator("#range").selectOption("14d");
  await card.locator('[data-pdf-section="chart"]').uncheck();
  await page.evaluate(type => { window.__async.hold.add(type); window.__async.hold.add("puppy_tracker/report/logo"); }, PDF);
  await card.locator("#pdf").click();
  await expect.poll(() => pendingCount(page, "puppy_tracker/report/logo")).toBe(1);
  await card.evaluate(el => { el._motherSections.chart = true; el._motherExportScope = "all"; el.setConfig({ litter_id: "b" }); el._export("pdf"); el._queueRefresh(); });
  await release(page, "puppy_tracker/report/logo");
  await expect.poll(() => pendingCount(page, PDF)).toBe(1);
  const call = await page.evaluate(type => window.__async.calls.find(call => call.type === type), PDF);
  expect(call).toMatchObject({ litter_id: "a", history_scope: "current", range_hours: 336, sections: { chart: false } });
  const download = page.waitForEvent("download");
  await release(page, PDF); await download;
  await expect(card.locator("#litter")).toHaveValue("b");
  expect(await page.evaluate(type => window.__async.calls.filter(call => call.type === type).length, PDF)).toBe(1);
});

for (const change of ["revoke", "detach"]) {
  test(`mother PDF rejects a pending download after ${change} @cross-browser @tablet`, async ({ page }) => {
    const card = await mountAsyncCard(page, "report");
    await card.locator("#puppy").selectOption("__mother__");
    await page.evaluate(type => window.__async.hold.add(type), PDF);
    const downloads = [];
    page.on("download", item => downloads.push(item));
    await card.locator("#pdf").click();
    await expect.poll(() => pendingCount(page, PDF)).toBe(1);
    await card.evaluate((el, change) => { if (change === "revoke") el.hass = { ...el._hass, user: { is_admin: false } }; else el.remove(); }, change);
    await release(page, PDF);
    await expect.poll(() => page.evaluate(() => window.__async.card._exporting)).toBe(false);
    expect(downloads).toHaveLength(0);
  });
}
