import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function mount(page, language = "nl") {
  await page.goto("/tests/e2e/cards.html?production");
  await page.waitForFunction(() => window.__puppyTrackerReady);
  await page.evaluate(async (language) => {
    const { saveOwner } = await import("/tests/e2e/helpers/owners.mjs");
    for (const [key, value] of Object.entries({ "primary-color": "#008c9e", "primary-text-color": "#202124", "secondary-text-color": "#60656b", "card-background-color": "#fff", "secondary-background-color": "#f1f3f4", "divider-color": "#d9dde0", "text-primary-color": "#fff", "warning-color": "#765800" })) document.documentElement.style.setProperty(`--${key}`, value);
    const state = window.ownerUsability = { calls: [], nextId: 0, owners: [
      { id: "alex", name: "Alex", email: "alex@example.com", phone: "0612345678", placements: {
        l1: { placement_status: "sold", expected_pickup_date: "2026-11-01", payment_balance: "450", puppy_preferences: [] },
        l2: { placement_status: "reserved", expected_pickup_date: "2026-11-15", payment_balance: "900", puppy_preferences: [] },
      }, unassigned_placement: null },
      { id: "casey", name: "Casey", placements: { l1: { placement_status: "interested" } }, unassigned_placement: null },
      { id: "blair", name: "Blair", phone: "+31687654321", placements: { l1: { placement_status: "reserved", expected_pickup_date: "2026-10-30", payment_balance: "0" } }, unassigned_placement: null },
      { id: "dana", name: "Dana", placements: { l1: { placement_status: "placed", payment_balance: "700" } }, unassigned_placement: null },
    ] };
    const card = document.createElement("puppy-tracker-owner-card");
    card.setConfig({});
    document.querySelector("#cards").append(card);
    card.hass = { language, locale: { language }, config: { currency: "EUR" }, user: { id: "admin", is_admin: true }, callWS: async (message) => {
      state.calls.push(structuredClone(message));
      if (message.type === "puppy_tracker/owners/list") return { owners: structuredClone(state.owners) };
      if (message.type === "puppy_tracker/litters") return { litters: [{ id: "l1", name: "First", active: true }, { id: "l2", name: "Second", active: true }] };
      if (message.type === "puppy_tracker/data") return { puppies: message.litter_id === "l1" ? [{ id: "p1", name: "Nova", collar_color: "paars", owner_ids: ["alex"] }] : [] };
      if (message.type === "puppy_tracker/owners/save") return saveOwner(state.owners, message.owner_id ? message : { ...message, owner_id: `new-${++state.nextId}` });
      throw new Error(message.type);
    } };
  }, language);
  const card = page.locator("puppy-tracker-owner-card");
  await expect(card.locator('[data-owner="alex"]')).toBeVisible();
  return card;
}

for (const language of ["nl", "en"]) {
  test(`owner sorting handles missing values, visible litters and CSV order (${language}) @cross-browser @tablet`, async ({ page }) => {
    const card = await mount(page, language);
    const ids = () => card.locator(".owner").evaluateAll((rows) => rows.map((row) => row.dataset.owner));
    expect(await ids()).toEqual(["alex", "blair", "casey"]);
    await card.locator("#owner-sort").focus();
    await card.locator("#owner-sort").selectOption("pickup");
    expect(await ids()).toEqual(["blair", "alex", "casey"]);
    await expect(card.locator("#owner-sort")).toBeFocused();
    await card.locator("#owner-sort").selectOption("status");
    expect(await ids()).toEqual(["casey", "blair", "alex"]);
    await page.evaluate(() => window.ownerUsability.owners.push({ id: "evan", name: "Evan", placements: { l1: { placement_status: "sold", payment_balance: "1000" } }, unassigned_placement: null }));
    await card.evaluate(async (element) => { element.getRootNode().activeElement?.blur(); await element._load(true); });
    await card.locator("#owner-sort").selectOption("balance");
    expect(await ids()).toEqual(["evan", "alex", "blair", "casey"]);
    await card.locator("#owner-scope").selectOption("__all__");
    await expect(card.locator("#owner-sort")).toHaveValue("balance");
    expect(await ids()).toEqual(["alex", "evan", "blair", "casey"]);
    await card.locator("#owner-status-filter").selectOption("sold");
    expect(await ids()).toEqual(["evan", "alex"]);
    const download = page.waitForEvent("download");
    await card.locator("#export-owners-csv").click();
    const csv = await readFile(await (await download).path(), "utf8");
    expect(csv.indexOf('"Evan"')).toBeLessThan(csv.indexOf('"Alex"'));
    await card.locator('[data-edit="alex"]').click();
    await expect(card.locator("#owner-sort")).toBeDisabled();
    await card.locator("#cancel-owner").click();
    await expect(card.locator("#owner-sort")).toHaveValue("balance");
    await card.screenshot({ path: test.info().outputPath(`owner-sort-${language}.png`) });
    expect(await card.locator("ha-card").evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await page.evaluate(() => window.ownerUsability.calls.some((call) => call.type.endsWith("/save")))).toBe(false);
  });

  test(`collapsed owner rows show only each visible dossier's pickup and balance (${language}) @cross-browser @tablet`, async ({ page }) => {
    const card = await mount(page, language);
    const row = card.locator('[data-owner="alex"]');
    await expect(row.locator(".owner-detail")).toHaveCount(0);
    const first = row.locator('[data-summary-litter="l1"]');
    await expect(first).toContainText(language === "nl" ? "Ophalen: 1 nov 2026" : "Pickup: Nov 1, 2026");
    await expect(first).toContainText(language === "nl" ? "Openstaand: € 450,00" : "Outstanding: €450.00");
    await expect(row).not.toContainText("900");
    await expect(card.locator('[data-owner="casey"] .owner-dossier-summary')).not.toContainText(language === "nl" ? "Openstaand" : "Outstanding");
    await expect(card.locator('[data-owner="blair"] .owner-dossier-summary')).toContainText(language === "nl" ? "€ 0,00" : "€0.00");
    await card.locator("#owner-scope").selectOption("__all__");
    await expect(row.locator(".owner-dossier-summary")).toHaveCount(2);
    await expect(row.locator('[data-summary-litter="l2"]')).toContainText(language === "nl" ? "€ 900,00" : "€900.00");
    await card.locator("#owner-status-filter").selectOption("sold");
    await expect(row.locator(".owner-dossier-summary")).toHaveCount(1);
    await expect(row).not.toContainText("900");
    await card.screenshot({ path: test.info().outputPath(`owner-summary-${language}.png`) });
    expect(await card.locator("ha-card").evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await page.evaluate(() => window.ownerUsability.calls.some((call) => call.type.endsWith("/save")))).toBe(false);
  });

  test(`owner attention follows the phase and opens only the correct litter fields (${language}) @cross-browser @tablet`, async ({ page }) => {
    const card = await mount(page, language);
    await expect(card.locator('[data-owner="alex"] .owner-attention-action')).toHaveCount(1);
    await expect(card.locator('[data-owner="alex"] .owner-attention')).toContainText(language === "nl" ? "Betaling open" : "Payment outstanding");
    await expect(card.locator('[data-owner="casey"] .owner-attention')).toHaveCount(0);
    await expect(card.locator('[data-owner="blair"] .owner-attention')).toHaveCount(0);
    await page.evaluate(() => {
      const alex = window.ownerUsability.owners[0];
      alex.email = null; alex.phone = null; alex.placements.l1.expected_pickup_date = null;
    });
    await card.evaluate((element) => element._load(true));
    await expect(card.locator('[data-owner="alex"] .owner-attention-action')).toHaveCount(3);
    await card.locator("#owner-scope").selectOption("__all__");
    await expect(card.locator('[data-owner="alex"] .owner-attention-action')).toHaveCount(5);
    await card.screenshot({ path: test.info().outputPath(`owner-attention-${language}.png`) });
    expect(await card.locator("ha-card").evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await card.locator('[data-section-owner="alex"][data-section-litter="l2"][data-edit-owner-section="financial"]').click();
    await expect(card.locator("#owner-litter")).toHaveValue("l2");
    await expect(card.locator('[name="payment_balance"]')).toHaveValue("900");
    await expect(card.locator('[data-owner-editor-group="financial"]')).toHaveJSProperty("open", true);
    await expect(card.locator('[name="payment_status"]')).toBeFocused();
    await card.locator("#cancel-owner").click();
    await card.locator('[data-section-owner="alex"][data-section-litter="l1"][data-edit-owner-section="placement"]').click();
    await expect(card.locator("#owner-litter")).toHaveValue("l1");
    await expect(card.locator('[data-owner-editor-group="placement"]')).toHaveJSProperty("open", true);
    await card.locator("#cancel-owner").click();
    await card.locator("#owner-status-filter").selectOption("all");
    await expect(card.locator('[data-owner="dana"] .owner-attention')).toHaveCount(0);
    await page.evaluate(() => {
      const alex = window.ownerUsability.owners[0];
      alex.placements.l1.archived = true; alex.placements.l2.placement_status = "option";
    });
    await card.evaluate(async (element) => { element.getRootNode().activeElement?.blur(); await element._load(true); });
    await expect(card.locator('[data-owner="alex"] .owner-attention')).toHaveCount(0);
    expect(await page.evaluate(() => window.ownerUsability.calls.some((call) => call.type.endsWith("/save")))).toBe(false);
  });
}
