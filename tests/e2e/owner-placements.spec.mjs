import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function mount(page, language = "nl") {
  await page.goto("/tests/e2e/cards.html?production");
  await page.waitForFunction(() => window.__puppyTrackerReady);
  await page.evaluate(async (language) => {
    const { saveOwner } = await import("/tests/e2e/helpers/owners.mjs");
    const owners = [
      { id: "o1", name: "Alex", email: "alex@example.com", phone: "0612345678", notes: "Contact note",
        placements: {
          l1: { placement_status: "reserved", payment_amount: "2500", payment_balance: "1000", puppy_preferences: [{ puppy_id: "p1", note: "First choice" }], placement_notes: "First dossier note" },
          l2: { placement_status: "interested", payment_amount: "3000", payment_balance: "3000", puppy_preferences: [{ puppy_id: "p2", note: "Second nest choice" }], placement_notes: "Second dossier note" },
        }, unassigned_placement: null },
      { id: "o2", name: "Second candidate", placements: { l2: { placement_status: "interested", puppy_preferences: [] } }, unassigned_placement: null },
      { id: "o3", name: "Unassigned contact", placements: {}, unassigned_placement: { payment_amount: "777", placement_notes: "Preserve this history", puppy_preferences: [] } },
      { id: "o4", name: "Old placement", placements: { l3: { placement_status: "placed", payment_status: "full", payment_balance: "0", archived: true } }, unassigned_placement: null },
    ];
    const litters = [{ id: "l1", name: "First", active: true }, { id: "l2", name: "Second", active: true }, { id: "l3", name: "Old", active: false }];
    const puppies = {
      l1: [{ id: "p1", name: "Nova", collar_color: "paars", owner_ids: ["o1"] }],
      l2: [{ id: "p2", name: "Boris", collar_color: "blauw", owner_ids: ["o1"] }],
      l3: [{ id: "p3", name: "Groen", collar_color: "groen", owner_ids: ["o4"] }],
    };
    const state = window.ownerPlacementFixture = { owners, calls: [], failNext: false };
    const card = document.createElement("puppy-tracker-owner-card");
    card.setConfig({});
    document.querySelector("#cards").append(card);
    card.hass = { language, locale: { language }, user: { is_admin: true }, callWS: async (message) => {
      state.calls.push(structuredClone(message));
      if (message.type === "puppy_tracker/owners/list") return { owners: structuredClone(owners) };
      if (message.type === "puppy_tracker/litters") return { litters: structuredClone(litters) };
      if (message.type === "puppy_tracker/data") return { puppies: structuredClone(puppies[message.litter_id]) };
      if (message.type === "puppy_tracker/owners/save") {
        if (state.failNext) { state.failNext = false; throw new Error("Temporary save failure"); }
        return saveOwner(owners, message);
      }
      throw new Error(message.type);
    } };
  }, language);
  const card = page.locator("puppy-tracker-owner-card");
  await expect(card.locator("#owner-scope")).toHaveValue("l1");
  return card;
}

for (const language of ["nl", "en"]) {
  test(`owners filter litters, search without losing focus and reveal completed dossiers (${language}) @cross-browser @tablet`, async ({ page }) => {
    const card = await mount(page, language);
    await expect(card.locator(".owner")).toHaveCount(1);
    await expect(card.locator(".owner-puppies")).toContainText("Nova (paars)");
    await expect(card.locator(".list")).not.toContainText("Boris");
    await card.locator("#owner-scope").selectOption("l2");
    await expect(card.locator(".owner")).toHaveCount(2);
    await card.locator("#owner-search").pressSequentially("boris");
    await expect(card.locator("#owner-search")).toBeFocused();
    await expect(card.locator(".owner")).toHaveCount(1);
    await expect(card.locator(".owner-puppies")).toContainText("Boris (blauw)");
    await card.locator("#owner-search").fill("");
    await card.locator("#owner-scope").selectOption("__all__");
    await expect(card.locator(".owner")).toHaveCount(3);
    await card.locator("#owner-show-completed").check();
    await expect(card.locator(".owner")).toHaveCount(4);
    await card.locator('[data-toggle-owner="o1"]').click();
    await card.locator('[data-owner-dossier="o1"]').selectOption("l2");
    await expect(card.locator('[data-owner-group="contact"]')).toContainText(language === "nl" ? "Eigenaar" : "Owner");
    await expect(card.locator('[data-owner-group="contact"]')).toContainText(language === "nl" ? "Geen voorkeur" : "No preference");
    await expect(card.locator('[data-owner-group="placement"]')).toContainText("Second dossier note");
    await expect(card.locator('[data-owner-group="placement"]')).not.toContainText("First dossier note");
    expect(await card.locator("ha-card").evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await card.screenshot({ path: test.info().outputPath(`owner-placement-details-${language}.png`) });
  });
}

test("editing another litter protects drafts and never changes the first payment @cross-browser @tablet", async ({ page }) => {
  const card = await mount(page);
  const before = await page.evaluate(() => structuredClone(window.ownerPlacementFixture.owners[0].placements.l1));
  await card.locator('[data-edit="o1"]').click();
  await expect(card.locator('[name="payment_amount"]')).toHaveValue("2500");
  await card.locator('[name="payment_balance"]').fill("950");
  page.once("dialog", (dialog) => dialog.dismiss());
  await card.locator("#owner-litter").selectOption("l2");
  await expect(card.locator("#owner-litter")).toHaveValue("l1");
  await expect(card.locator('[name="payment_balance"]')).toHaveValue("950");
  page.once("dialog", (dialog) => dialog.accept());
  await card.locator("#owner-litter").selectOption("l2");
  await expect(card.locator('[name="payment_amount"]')).toHaveValue("3000");
  await expect(card.locator('[name="payment_balance"]')).toHaveValue("3000");
  await expect(card.locator('[name="preference_puppy_1"] option[value="p1"]')).toHaveCount(0);
  await card.locator('[name="payment_status"]').selectOption("full");
  await card.locator('[name="placement_notes"]').fill("Second litter paid");
  await page.evaluate(() => { window.ownerPlacementFixture.failNext = true; });
  await card.locator('.owner-editor button[type="submit"]').click();
  await expect(card.locator("#owner-error")).toContainText("Temporary save failure");
  await expect(card.locator("#owner-litter")).toHaveValue("l2");
  await expect(card.locator('[name="placement_notes"]')).toHaveValue("Second litter paid");
  await card.locator('.owner-editor button[type="submit"]').click();
  await expect(card.locator(".owner-editor")).toHaveCount(0);
  await expect(card.locator("#owner-scope")).toHaveValue("l2");
  const contact = await page.evaluate(() => window.ownerPlacementFixture.owners[0]);
  expect(contact.placements.l1).toEqual(before);
  expect(contact.placements.l2.payment_balance).toBe("0");
  expect(contact.placements.l2.placement_notes).toBe("Second litter paid");
  expect(contact.notes).toBe("Contact note");
});

test("an existing contact can get a new nest dossier before choosing a puppy @cross-browser @tablet", async ({ page }) => {
  const card = await mount(page);
  await card.locator("#owner-scope").selectOption("l2");
  await card.locator('[data-toggle-owner="o2"]').click();
  await card.locator('[data-add-dossier="o2"]').click();
  await expect(card.locator("#owner-litter")).toHaveValue("l1");
  await expect(card.locator('[name="payment_amount"]')).toHaveValue("");
  await expect(card.locator('[name="preference_puppy_1"]')).toHaveValue("");
  await card.locator('[name="placement_notes"]').fill("Interested in this litter too");
  await card.locator('.owner-editor button[type="submit"]').click();
  await expect(card.locator("#owner-scope")).toHaveValue("l1");
  const contact = await page.evaluate(() => window.ownerPlacementFixture.owners.find((owner) => owner.id === "o2"));
  expect(Object.keys(contact.placements)).toEqual(["l2", "l1"]);
  expect(contact.placements.l2.puppy_preferences).toEqual([]);
  expect(contact.placements.l1.placement_notes).toBe("Interested in this litter too");
  await card.locator("#matrix-view").click();
  await expect(card.locator(".preference-matrix tbody")).toContainText("Second candidate");
});

test("unassigned migration history moves explicitly and matrix membership stays litter-specific @cross-browser @tablet", async ({ page }) => {
  const card = await mount(page);
  await card.locator("#matrix-view").click();
  await expect(card.locator(".preference-matrix tbody")).not.toContainText("Second candidate");
  await card.locator("#matrix-litter").selectOption("l2");
  await expect(card.locator(".preference-matrix tbody")).toContainText("Second candidate");
  await expect(card.locator(".preference-matrix tbody")).not.toContainText("Unassigned contact");
  await card.locator("#owners-view").click();
  await card.locator("#owner-scope").selectOption("__unassigned__");
  await expect(card.locator(".owner")).toHaveCount(1);
  await card.locator('[data-toggle-owner="o3"]').click();
  await card.locator('[data-assign-litter="o3"]').selectOption("l1");
  await card.locator('[data-assign-owner="o3"]').click();
  await expect(card.locator("#owner-scope")).toHaveValue("l1");
  const owner = await page.evaluate(() => window.ownerPlacementFixture.owners.find((item) => item.id === "o3"));
  expect(owner.unassigned_placement).toBeNull();
  expect(owner.placements.l1.payment_amount).toBe("777");
  expect(owner.placements.l1.placement_notes).toBe("Preserve this history");
});

test("CSV exports only visible litter dossiers and uses their own payments @cross-browser @tablet", async ({ page }) => {
  const card = await mount(page, "en");
  for (const [litter, included, excluded] of [["l1", '"2500"', '"3000"'], ["l2", '"3000"', '"2500"']]) {
    await card.locator("#owner-scope").selectOption(litter);
    const downloadPromise = page.waitForEvent("download");
    await card.locator("#export-owners-csv").click();
    const content = await readFile(await (await downloadPromise).path(), "utf8");
    expect(content).toContain(included);
    expect(content).not.toContain(excluded);
    expect(content).not.toContain('"777"');
    expect(content).toContain(litter === "l1" ? "First dossier note" : "Second dossier note");
    expect(content).not.toContain(litter === "l1" ? "Second dossier note" : "First dossier note");
    if (litter === "l2") expect(content).toContain('"Second candidate"');
  }
});

test("long owner lists scroll internally and expanding a row keeps its position @cross-browser @tablet", async ({ page }) => {
  const card = await mount(page);
  await page.evaluate(() => {
    for (let index = 0; index < 35; index++) window.ownerPlacementFixture.owners.push({
      id: `extra-${index}`, name: `Contact ${index} with a longer name`, placements: { l1: {} }, unassigned_placement: null,
    });
  });
  await card.evaluate(async (element) => element._load(true));
  const list = card.locator(".list");
  expect(await list.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await card.locator('[data-toggle-owner="extra-20"]').scrollIntoViewIfNeeded();
  const before = await list.evaluate((element) => element.scrollTop);
  await card.locator('[data-toggle-owner="extra-20"]').click();
  expect(Math.abs((await list.evaluate((element) => element.scrollTop)) - before)).toBeLessThan(2);
  expect(await card.locator("ha-card").evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
});
