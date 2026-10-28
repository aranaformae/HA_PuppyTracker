import { expect, test } from "@playwright/test";
import { mountAsyncCard, pendingCount, release } from "./helpers/async-card.mjs";

const EXPORT = "puppy_tracker/export";
const LOGO = "puppy_tracker/report/logo";
const MOTHER = "puppy_tracker/mother/export_url";

for (const [variant, language] of [["pdf", "nl"], ["csv", "en"], ["json", "nl"], ["mother", "en"]]) {
  test(`${variant}: one export at a time, locked controls, clear failure and retry @cross-browser @tablet`, async ({ page }) => {
    const card = await mountAsyncCard(page, "report", { language });
    if (variant === "mother") {
      await card.locator("#puppy").selectOption("__mother__");
      await card.locator("#mother-export-scope").selectOption("current");
    } else await card.locator("#puppy").selectOption("a2");
    const format = variant === "mother" ? "json" : variant;
    if (format !== "pdf") await card.locator("#data-export > summary").click();
    const type = variant === "mother" ? MOTHER : EXPORT;
    await page.evaluate((type) => window.__async.hold.add(type), type);
    await card.locator(`#${format}`).click();
    await expect.poll(() => pendingCount(page, type)).toBe(1);
    await expect(card.locator("ha-card")).toHaveAttribute("aria-busy", "true");
    expect(await card.locator("input,select,button").evaluateAll((controls) => controls.every((el) => el.disabled))).toBe(true);
    await card.evaluate((el) => { el._export("pdf"); el._export("csv"); el._export("json"); el._changeLitter("b"); el._applyProfile("handover"); el._queueRefresh(); });
    expect(await page.evaluate((type) => window.__async.calls.filter((call) => call.type === type).length, type)).toBe(1);
    await release(page, type, { error: "Export unavailable" });
    await expect(card.locator(".error")).toContainText("Export unavailable");
    await expect(card.locator(`#${format}`)).toBeEnabled();
    await expect(card.locator("ha-card")).toHaveAttribute("aria-busy", "false");
    const download = page.waitForEvent("download");
    await card.locator(`#${format}`).click();
    await expect.poll(() => pendingCount(page, type)).toBe(1);
    await release(page, type);
    await download;
    await expect(card.locator(".error")).toHaveCount(0);
    await expect(card.locator(".status")).toContainText(language === "en" ? "downloaded" : "gedownload");
    const messages = await page.evaluate((type) => window.__async.calls.filter((call) => call.type === type), type);
    expect(messages).toHaveLength(2);
    expect(messages[1]).toMatchObject(variant === "mother" ? { litter_id: "a", history_scope: "current" } : variant === "json" ? { litter_id: "a", format: "json" } : { litter_id: "a", puppy_id: "a2", format });
    if (format === "json") expect(messages[1]).not.toHaveProperty("puppy_id");
  });
}

test("PDF snapshots every option before a delayed logo and defers reconfiguration @cross-browser @tablet", async ({ page }) => {
  const card = await mountAsyncCard(page, "report");
  await card.evaluate((el) => {
    el._selectedPuppyId = "a2";
    el._range = "14d";
    el._pdfLanguage = "nl";
    el._sectionState.summary = false;
    el._sectionState.breeder_contact = true;
    el._dossierTypes = ["note"];
    el._dossierScopes = ["puppy"];
    el._render();
  });
  await page.evaluate(() => { window.__async.hold.add("puppy_tracker/report/logo"); window.__async.hold.add("puppy_tracker/export"); });
  await card.locator("#pdf").click();
  await expect.poll(() => pendingCount(page, LOGO)).toBe(1);
  await card.evaluate((el) => {
    const select = el.shadowRoot.getElementById("litter");
    select.value = "b";
    select.dispatchEvent(new Event("change"));
    el._changeLitter("b");
    el._applyProfile("handover");
    el.setConfig({ litter_id: "b" });
    // The export also owns copies of arrays and sections, not just the UI lock.
    el._dossierTypes.push("temperature");
    el._dossierScopes.push("litter");
    el._sectionState.summary = true;
    el._queueRefresh();
  });
  expect(await card.evaluate((el) => el._selectedLitterId)).toBe("a");
  await release(page, LOGO);
  await expect.poll(() => pendingCount(page, EXPORT)).toBe(1);
  const message = await page.evaluate(() => window.__async.calls.find((call) => call.type === "puppy_tracker/export"));
  expect(message).toMatchObject({ litter_id: "a", puppy_id: "a2", range_hours: 336, language: "nl", dossier_types: ["note"], dossier_scopes: ["puppy"], sections: { summary: false, breeder_contact: true }, branding: {} });
  const download = page.waitForEvent("download");
  await release(page, EXPORT);
  await download;
  await expect(card.locator("#litter")).toHaveValue("b");
  await expect(card.locator("#puppy option[value='b1']")).toHaveCount(1);
  expect(await page.evaluate(() => window.__async.calls.filter((call) => call.type === "puppy_tracker/export").length)).toBe(1);
});

for (const change of ["revoke", "detach"]) {
  test(`report cancels download after ${change} during export @cross-browser`, async ({ page }) => {
    const card = await mountAsyncCard(page, "report");
    const downloads = [];
    page.on("download", (download) => downloads.push(download));
    await page.evaluate(() => window.__async.hold.add("puppy_tracker/export"));
    await card.locator("#data-export > summary").click();
    await card.locator("#csv").click();
    await expect.poll(() => pendingCount(page, EXPORT)).toBe(1);
    await card.evaluate((el, change) => {
      if (change === "revoke") el.hass = { ...el._hass, user: { is_admin: false } };
      else el.remove();
    }, change);
    await release(page, EXPORT);
    await expect.poll(() => page.evaluate(() => window.__async.card._exporting)).toBe(false);
    expect(downloads).toHaveLength(0);
    if (change === "revoke") await expect(card.locator("#csv")).toHaveCount(0);
  });
}
