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
  test(`owner filter counts and reset preserve sorting and linking drafts (${language}) @cross-browser @tablet`, async ({ page }) => {
    const card = await mount(page, language);
    const count = (visible) => language === "nl" ? `${visible} van 4 baasjes zichtbaar` : `${visible} of 4 owners visible`;
    await expect(card.locator(".owner-filter-summary")).toContainText(count(3));
    await card.locator("#owner-sort").selectOption("pickup");
    const link = card.locator('input[name="linked_owner"][value="blair"]');
    await link.check();
    await card.locator("#owner-search").fill("not found");
    await expect(card.locator(".owner-filter-summary")).toContainText(count(0));
    await expect(card.locator("#owner-search")).toBeFocused();
    await expect(link).toBeChecked();
    await card.locator("#clear-owner-filters").click();
    await expect(card.locator(".owner-filter-summary")).toContainText(count(4));
    await expect(card.locator("#owner-scope")).toHaveValue("__all__");
    await expect(card.locator("#owner-status-filter")).toHaveValue("all");
    await expect(card.locator("#owner-search")).toHaveValue("");
    await expect(card.locator("#owner-sort")).toHaveValue("pickup");
    await expect(card.locator("#clear-owner-filters")).toBeDisabled();
    await expect(card.locator("#owner-filter-count")).toBeFocused();
    await expect(link).toBeChecked();
    await expect(card.locator("#link-litter")).toHaveValue("l1");
    expect(await page.evaluate(() => window.ownerUsability.calls.some((call) => call.type.endsWith("/save") || call.type.endsWith("/link")))).toBe(false);
  });

  test(`pickup schedule groups dates and opens the exact litter dossier (${language}) @cross-browser @tablet`, async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-10-31T00:30:00Z"));
    const card = await mount(page, language);
    await card.evaluate((element) => { element.hass = { ...element._hass, config: { ...element._hass.config, time_zone: "America/New_York" } }; });
    await page.evaluate(() => {
      const owners = window.ownerUsability.owners;
      owners.find((owner) => owner.id === "alex").placements.l1.expected_pickup_date = "2026-10-29";
      owners.find((owner) => owner.id === "dana").placements.l1.expected_pickup_date = "2026-11-01";
      owners.find((owner) => owner.id === "casey").placements.l1.expected_pickup_date = "2026-10-30";
      owners.push({ id: "archive", name: "Archive", placements: { l1: { archived: true, expected_pickup_date: "2026-11-02" } }, unassigned_placement: null });
    });
    await card.evaluate(async (element) => { await element._load(true); });
    await card.locator("#clear-owner-filters").click();
    const agenda = card.locator(".pickup-agenda");
    await agenda.locator("summary").click();
    await expect(agenda.locator(".pickup-entry")).toHaveCount(4);
    await expect(agenda.locator("h4")).toHaveCount(3);
    expect(await agenda.locator(".pickup-list").evaluate((element) => element.clientHeight <= 360 && element.scrollHeight > element.clientHeight)).toBe(true);
    await expect(agenda).toContainText(language === "nl" ? "Vandaag" : "Today");
    await expect(agenda.locator(".pickup-past")).toHaveCount(1);
    await expect(agenda.locator('[data-pickup-owner="alex"][data-pickup-litter="l1"]')).toContainText("Nova (paars)");
    await expect(agenda.locator('[data-pickup-owner="alex"][data-pickup-litter="l2"]')).toContainText(language === "nl" ? "Geen gekoppelde pups" : "No linked puppies");
    expect(await agenda.locator(".pickup-entry").evaluateAll((rows) => rows.map((row) => [row.dataset.pickupOwner, row.dataset.pickupLitter]))).toEqual([["alex", "l1"], ["blair", "l1"], ["casey", "l1"], ["alex", "l2"]]);
    await card.screenshot({ path: test.info().outputPath(`owner-pickup-schedule-${language}.png`) });
    expect(await card.locator("ha-card").evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await agenda.locator('[data-pickup-owner="alex"][data-pickup-litter="l2"]').click();
    await expect(card.locator("#owner-litter")).toHaveValue("l2");
    await expect(card.locator('[data-owner-editor-group="placement"]')).toHaveAttribute("open", "");
    await expect(card.locator('[name="expected_pickup_date"]')).toHaveValue("2026-11-15");
    await card.locator("#cancel-owner").click();
    await expect(agenda).toHaveAttribute("open", "");
    await card.locator("#owner-search").fill("Dana");
    await expect(agenda.locator(".pickup-entry")).toHaveCount(0);
    await expect(agenda).toContainText(language === "nl" ? "Geen ophaaldatums" : "No pickup dates");
    expect(await page.evaluate(() => window.ownerUsability.calls.some((call) => call.type.endsWith("/save")))).toBe(false);
  });

  test(`duplicate hints preserve drafts and can open the existing contact for the right litter (${language}) @cross-browser @tablet`, async ({ page }) => {
    const card = await mount(page, language);
    await card.locator("#add-owner").click();
    await card.locator("#owner-litter").selectOption("l2");
    await expect(card.locator(".owner-duplicates")).toBeHidden();
    await card.locator('[name="name"]').fill("New contact draft");
    await card.locator('[name="phone"]').fill(" (06) 1234-5678 ");
    await expect(card.locator(".owner-duplicate-match")).toHaveCount(1);
    await expect(card.locator(".owner-duplicates")).toContainText("Alex");
    await card.locator('[name="email"]').fill("ALEX@EXAMPLE.COM");
    await expect(card.locator(".owner-duplicate-match")).toHaveCount(1);
    await expect(card.locator(".owner-duplicates")).toContainText(language === "nl" ? "E-mail, Telefoon" : "Email, Phone");
    await card.evaluate((element) => { element.originalEmail = element.querySelector('[name="email"]'); });
    await card.locator('[name="email"]').press("End");
    await card.locator('[name="email"]').press("Backspace");
    await expect(card.locator('[name="email"]')).toBeFocused();
    expect(await card.evaluate((element) => element.originalEmail === element.querySelector('[name="email"]'))).toBe(true);
    await card.locator('[name="email"]').fill("alex@example.com");
    page.once("dialog", (dialog) => dialog.dismiss());
    await card.locator('[data-open-duplicate-owner="alex"]').click();
    await expect(card.locator('[name="name"]')).toHaveValue("New contact draft");
    await card.screenshot({ path: test.info().outputPath(`owner-duplicate-warning-${language}.png`) });
    expect(await card.locator("ha-card").evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    page.once("dialog", (dialog) => dialog.accept());
    await card.locator('[data-open-duplicate-owner="alex"]').click();
    await expect(card.locator('[name="name"]')).toHaveValue("Alex");
    await expect(card.locator("#owner-litter")).toHaveValue("l2");
    await expect(card.locator('[name="payment_balance"]')).toHaveValue("900");
    await expect(card.locator(".owner-duplicates")).toBeHidden();
    expect(await page.evaluate(() => window.ownerUsability.calls.some((call) => call.type.endsWith("/save")))).toBe(false);
  });

  test(`shared contact values warn but never block explicit saving (${language}) @cross-browser @tablet`, async ({ page }) => {
    const card = await mount(page, language);
    await card.locator('[data-edit="alex"]').click();
    await expect(card.locator(".owner-duplicates")).toBeHidden();
    await card.locator("#cancel-owner").click();
    await card.locator("#add-owner").click();
    await card.locator('[name="name"]').fill("Alex partner");
    await card.locator('[name="email"]').fill("alex@example.com");
    await expect(card.locator(".owner-duplicate-match")).toHaveCount(1);
    await expect(card.locator('.owner-editor button[type="submit"]')).toBeEnabled();
    await card.locator('.owner-editor button[type="submit"]').click();
    await expect(card.locator(".owner-editor")).toHaveCount(0);
    const owners = await page.evaluate(() => window.ownerUsability.owners);
    expect(owners.filter((owner) => owner.email === "alex@example.com")).toHaveLength(2);
    expect(owners.find((owner) => owner.id === "alex").name).toBe("Alex");
    expect(owners.find((owner) => owner.id.startsWith("new-")).name).toBe("Alex partner");
  });

  test(`contact actions preserve original values and give stable copy feedback (${language}) @cross-browser @tablet`, async ({ page }) => {
    const card = await mount(page, language);
    await page.evaluate(() => {
      window.ownerUsability.copied = [];
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (value) => {
        if (window.ownerUsability.failCopy) throw new Error("Clipboard unavailable");
        window.ownerUsability.copied.push(value);
      } } });
    });
    await card.locator('[data-toggle-owner="alex"]').click();
    const detail = card.locator("#owner-detail-alex");
    await expect(detail.locator('[data-contact-kind="phone"] a')).toHaveAttribute("href", "tel:0612345678");
    await expect(detail.locator('a[href^="https://wa.me/"]')).toHaveCount(0);
    await expect(detail.locator('[data-contact-kind="email"] a')).toHaveAttribute("href", "mailto:alex%40example.com");
    await detail.evaluate((element) => { element.original = element.querySelector('[data-contact-kind="phone"]'); });
    await detail.locator('[data-contact-field="phone"]').click();
    await expect(detail.locator("[data-contact-feedback]")).toHaveText(language === "nl" ? "Gekopieerd." : "Copied.");
    expect(await detail.evaluate((element) => element.original === element.querySelector('[data-contact-kind="phone"]'))).toBe(true);
    await detail.locator('[data-contact-field="email"]').click();
    expect(await page.evaluate(() => window.ownerUsability.copied)).toEqual(["0612345678", "alex@example.com"]);
    await page.evaluate(() => { window.ownerUsability.failCopy = true; });
    await detail.locator('[data-contact-field="phone"]').click();
    await expect(detail.locator("[data-contact-feedback]")).toContainText(language === "nl" ? "Kopiëren is niet gelukt" : "Copying failed");
    await expect(detail.locator('[data-contact-kind="phone"]')).toContainText("0612345678");
    await card.locator('[data-toggle-owner="blair"]').click();
    await expect(card.locator('#owner-detail-blair a[href^="https://wa.me/"]')).toHaveAttribute("href", "https://wa.me/31687654321");
    await expect(card.locator('#owner-detail-blair a[href^="https://wa.me/"]')).toHaveAttribute("rel", "noopener noreferrer");
    await card.locator('#owner-detail-blair [data-owner-group="contact"]').screenshot({ path: test.info().outputPath(`owner-contact-actions-${language}.png`) });
    expect(await card.locator("ha-card").evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await page.evaluate(() => window.ownerUsability.calls.some((call) => call.type.endsWith("/save")))).toBe(false);
  });

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

test("contact links reject unsafe text and normalize only explicit international numbers @cross-browser @tablet", async ({ page }) => {
  const card = await mount(page);
  await page.evaluate(() => {
    window.ownerUsability.owners[0].phone = "00 31 (6) 1234-5678";
    window.ownerUsability.owners[0].email = "person+puppy@example.com";
  });
  await card.evaluate((element) => element._load(true));
  await card.locator('[data-toggle-owner="alex"]').click();
  await expect(card.locator('#owner-detail-alex a[href^="tel:"]')).toHaveAttribute("href", "tel:+31612345678");
  await expect(card.locator('#owner-detail-alex a[href^="https:"]')).toHaveAttribute("href", "https://wa.me/31612345678");
  await expect(card.locator('#owner-detail-alex a[href^="mailto:"]')).toHaveAttribute("href", "mailto:person%2Bpuppy%40example.com");
  await page.evaluate(() => {
    window.ownerUsability.owners[0].phone = "javascript:alert(1)";
    window.ownerUsability.owners[0].email = '<img src=x onerror="alert(1)">@example.com';
  });
  await card.evaluate((element) => element._load(true));
  await expect(card.locator('#owner-detail-alex [data-contact-kind] a')).toHaveCount(0);
  await expect(card.locator('#owner-detail-alex [data-copy-owner-contact]')).toHaveCount(2);
  await expect(card.locator("#owner-detail-alex img")).toHaveCount(0);
});

test("late clipboard completion cannot restore private feedback after permissions change @cross-browser @tablet", async ({ page }) => {
  const card = await mount(page);
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: () => new Promise((resolve) => { window.finishOwnerCopy = resolve; }) } }));
  await card.locator('[data-toggle-owner="alex"]').click();
  await card.locator('[data-copy-owner-contact="alex"][data-contact-field="phone"]').click();
  await card.evaluate((element) => { element.hass = { ...element._hass, user: { id: "viewer", is_admin: false } }; });
  await page.evaluate(() => window.finishOwnerCopy());
  await expect(card.locator("[data-contact-feedback]")).toHaveCount(0);
  await expect(card).not.toContainText("alex@example.com");
});

test("duplicate detection normalizes explicit country prefixes and clears private indexes @cross-browser @tablet", async ({ page }) => {
  const card = await mount(page);
  await page.evaluate(() => { window.ownerUsability.owners[0].phone = "+31 (6) 1234-5678"; });
  await page.evaluate(() => {
    window.ownerUsability.owners[3].email = "archived@example.com";
    window.ownerUsability.owners[3].placements.l1.archived = true;
  });
  await card.evaluate((element) => element._load(true));
  await card.locator("#add-owner").click();
  await card.locator('[name="phone"]').fill("0612345678");
  await expect(card.locator(".owner-duplicates")).toBeHidden();
  await card.locator('[name="phone"]').fill("00 31 6 1234 5678");
  await expect(card.locator(".owner-duplicates")).toContainText("Alex");
  await card.locator('[name="phone"]').fill("");
  await card.locator('[name="email"]').fill("ARCHIVED@example.com");
  await expect(card.locator(".owner-duplicates")).toContainText("Dana");
  await expect(card.locator('[data-owner="dana"]')).toHaveCount(0);
  expect(await card.evaluate((element) => element._duplicateIndexes.has(element._owners))).toBe(true);
  await card.evaluate((element) => {
    const before = element._owners;
    element.hass = { ...element._hass, user: { id: "viewer", is_admin: false } };
    element.retainedPrivateIndex = element._duplicateIndexes.has(before);
  });
  await expect(card.locator(".owner-duplicates")).toHaveCount(0);
  expect(await card.evaluate((element) => element.retainedPrivateIndex)).toBe(false);
  await expect(card).not.toContainText("Alex");
});
