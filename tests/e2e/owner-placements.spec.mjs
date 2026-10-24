import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { openOwnerSection } from "./helpers/owners.mjs";

async function mount(page, language = "nl") {
  await page.goto("/tests/e2e/cards.html?production");
  await page.waitForFunction(() => window.__puppyTrackerReady);
  await page.evaluate(async (language) => {
    for (const [name, value] of Object.entries({
      "primary-color": "#008c9e", "primary-text-color": "#202124", "secondary-text-color": "#60656b",
      "text-primary-color": "#fff", "card-background-color": "#fff", "secondary-background-color": "#f1f3f4",
      "divider-color": "#d9dde0", "error-color": "#b3261e", "warning-color": "#765800",
    })) document.documentElement.style.setProperty(`--${name}`, value);
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
    await card.locator("#owner-status-filter").selectOption("all");
    await expect(card.locator(".owner")).toHaveCount(4);
    await card.locator('[data-toggle-owner="o1"]').click();
    await card.locator('[data-owner-dossier="o1"]').selectOption("l2");
    await expect(card.locator('[data-owner-group="contact"]')).toContainText(language === "nl" ? "Eigenaar" : "Owner");
    await expect(card.locator('[data-owner-group="contact"]')).toContainText(language === "nl" ? "Geen voorkeur" : "No preference");
    await expect(card.locator('[data-owner-group="notes"]')).toContainText("Second dossier note");
    await expect(card.locator('[data-owner-group="notes"]')).not.toContainText("First dossier note");
    expect(await card.locator("ha-card").evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await card.screenshot({ path: test.info().outputPath(`owner-placement-details-${language}.png`) });
  });
}

async function addStatusDossiers(page, card) {
  await page.evaluate(() => {
    const { owners } = window.ownerPlacementFixture;
    for (const status of ["interested", "option", "reserved", "sold", "placed"]) owners.push({
      id: `status-${status}`, name: `Status ${status}`, placements: { l1: {
        placement_status: status, puppy_preferences: [{ puppy_id: "p1", note: status }], placement_notes: `Only ${status}`,
      } }, unassigned_placement: null,
    });
    owners.push({ id: "archived", name: "Archived candidate", placements: {
      l1: { placement_status: "reserved", archived: true, puppy_preferences: [{ puppy_id: "p1", note: "Archived" }] },
    }, unassigned_placement: null });
  });
  await card.evaluate((element) => element._load(true));
}

for (const language of ["nl", "en"]) {
  test(`placement status filters include sold dossiers and stay shared between views (${language}) @cross-browser @tablet`, async ({ page }) => {
    const card = await mount(page, language);
    await addStatusDossiers(page, card);
    const filter = card.getByRole("combobox", { name: language === "nl" ? "Statusfilter" : "Status filter", exact: true });
    await expect(filter).toHaveValue("active");
    await expect(filter.locator("option:checked")).toHaveText(language === "nl" ? "Actief (inclusief verkocht)" : "Active (including sold)");
    await expect(card.locator(".owner")).toHaveCount(5);
    await expect(card.locator('[data-owner="status-sold"]')).toBeVisible();
    await expect(card.locator('[data-owner="status-placed"], [data-owner="archived"]')).toHaveCount(0);
    const cases = [
      ["interested", ["status-interested"]], ["option", ["status-option"]],
      ["reserved", ["o1", "status-reserved", "archived"]], ["sold", ["status-sold"]],
      ["placed", ["status-placed"]], ["archived", ["archived"]],
    ];
    for (const [status, ids] of cases) {
      await filter.selectOption(status);
      expect(await card.locator(".owner").evaluateAll((rows) => rows.map((row) => row.dataset.owner))).toEqual(ids);
      await expect(filter).toBeFocused();
      await card.locator("#matrix-view").click();
      await expect(filter).toHaveValue(status);
      await expect(card.locator(".preference-matrix tbody tr")).toHaveCount(ids.length);
      await card.locator("#owners-view").click();
      await expect(filter).toHaveValue(status);
    }
    await filter.selectOption("all");
    await expect(card.locator(".owner")).toHaveCount(7);
    await card.locator("#owner-scope").selectOption("__all__");
    await filter.selectOption("reserved");
    await expect(card.locator('[data-owner="o1"] .owner-puppies')).toContainText("Nova (paars)");
    await expect(card.locator('[data-owner="o1"] .owner-puppies')).not.toContainText("Boris");
    await card.locator("#owner-search").fill("boris");
    await expect(card.locator(".owner")).toHaveCount(0);
    await expect(card.locator(".list")).toContainText(language === "nl" ? "Geen baasjes binnen deze selectie." : "No owners match this selection.");
    await card.locator("#owner-search").fill("");
    await filter.selectOption("sold");
    await card.screenshot({ path: test.info().outputPath(`owner-status-filter-${language}.png`) });
    expect(await card.locator("ha-card").evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await page.evaluate(() => window.ownerPlacementFixture.calls.some((call) => call.type.endsWith("/save")))).toBe(false);
  });

  test(`CSV follows the open view's status and litter selection (${language}) @cross-browser @tablet`, async ({ page }) => {
    const card = await mount(page, language);
    await addStatusDossiers(page, card);
    await card.locator("#owner-scope").selectOption("__all__");
    await card.locator("#owner-status-filter").selectOption("reserved");
    await card.locator("#owner-search").fill("Alex");
    async function downloadCsv() {
      const download = page.waitForEvent("download");
      await card.locator("#export-owners-csv").click();
      return readFile(await (await download).path(), "utf8");
    }
    const managementCsv = await downloadCsv();
    expect(managementCsv).toContain("First dossier note");
    expect(managementCsv).not.toContain("Second dossier note");
    expect(managementCsv).not.toContain('"Status reserved"');
    await card.locator("#owner-scope").selectOption("l2");
    await card.locator("#owner-status-filter").selectOption("sold");
    await expect(card.locator(".owner")).toHaveCount(0);
    await card.locator("#matrix-view").click();
    await card.locator("#matrix-litter").selectOption("l1");
    const matrixCsv = await downloadCsv();
    expect(matrixCsv).toContain('"Status sold"');
    expect(matrixCsv).toContain("Only sold");
    expect(matrixCsv).not.toContain('"Alex"');
    expect(matrixCsv).not.toContain("Second dossier note");
    await card.locator("#matrix-only-conflicts").check();
    expect((await downloadCsv()).trim().split("\r\n")).toHaveLength(1);
    await card.locator("#matrix-only-conflicts").uncheck();
    await card.locator("#owner-status-filter").selectOption("active");
    await card.screenshot({ path: test.info().outputPath(`matrix-status-filter-${language}.png`) });
    expect(await card.locator("ha-card").evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  });

  test(`saving placement changes keeps the dossier visible without changing payments (${language}) @cross-browser @tablet`, async ({ page }) => {
    const card = await mount(page, language);
    const before = await page.evaluate(() => structuredClone(window.ownerPlacementFixture.owners[0].placements));
    for (const [status, archived, filter] of [["sold", false, "active"], ["placed", false, "placed"], ["placed", true, "placed"], ["sold", true, "archived"], ["option", false, "option"]]) {
      await card.locator('[data-edit="o1"]').click();
      await openOwnerSection(card, "placement");
      await expect(card.locator("#owner-status-filter")).toBeDisabled();
      await card.locator('[name="placement_status"]').selectOption(status);
      await card.locator('[name="archived"]').setChecked(archived);
      await card.locator('.owner-editor button[type="submit"]').click();
      await expect(card.locator(".owner-editor")).toHaveCount(0);
      await expect(card.locator("#owner-status-filter")).toHaveValue(filter);
      await expect(card.locator('[data-owner="o1"]')).toBeVisible();
      const after = await page.evaluate(() => window.ownerPlacementFixture.owners[0].placements);
      expect(after.l1.placement_status).toBe(status);
      expect(after.l1.archived).toBe(archived);
      expect(after.l1.payment_amount).toBe(before.l1.payment_amount);
      expect(after.l1.payment_balance).toBe(before.l1.payment_balance);
      expect(after.l2).toEqual(before.l2);
    }
  });
}

test("editing another litter protects drafts and never changes the first payment @cross-browser @tablet", async ({ page }) => {
  const card = await mount(page);
  const before = await page.evaluate(() => structuredClone(window.ownerPlacementFixture.owners[0].placements.l1));
  await card.locator('[data-edit="o1"]').click();
  await expect(card.locator('[name="payment_amount"]')).toHaveValue("2500");
  await openOwnerSection(card, "financial");
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
  await openOwnerSection(card, "notes");
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
  await openOwnerSection(card, "notes");
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

for (const language of ["nl", "en"]) {
  test(`compact owner creation shows only contact fields and does not autosave (${language}) @cross-browser @tablet`, async ({ page }) => {
    const card = await mount(page, language);
    await page.evaluate(() => window.ownerPlacementFixture.owners.splice(0));
    await card.evaluate((element) => element._load(true));
    await card.locator("#add-owner").click();
    await expect(card.locator("[data-owner-editor-group][open]")).toHaveCount(1);
    await expect(card.locator('[data-owner-editor-group="contact"]')).toHaveJSProperty("open", true);
    await expect(card.locator('[name="payment_amount"]')).not.toBeVisible();
    await expect(card.locator("#owner-litter")).toBeVisible();
    await expect(card.locator(".owner-draft-status")).toBeEmpty();
    await card.evaluate((element) => { element.originalForm = element.querySelector(".owner-editor form"); });
    const statusHeight = await card.locator(".owner-draft-status").evaluate((element) => element.getBoundingClientRect().height);
    await card.locator('[name="name"]').pressSequentially("Jordan");
    await expect(card.locator(".owner-draft-status")).toHaveText(language === "nl" ? "Niet-opgeslagen wijzigingen" : "Unsaved changes");
    expect(await card.evaluate((element) => element.originalForm === element.querySelector(".owner-editor form"))).toBe(true);
    expect(await card.locator(".owner-draft-status").evaluate((element) => element.getBoundingClientRect().height)).toBe(statusHeight);
    await card.locator('[name="name"]').fill("");
    await expect(card.locator(".owner-draft-status")).toBeEmpty();
    await card.locator('[name="name"]').fill("Jordan");
    expect(await page.evaluate(() => window.ownerPlacementFixture.calls.filter((call) => call.type.endsWith("owners/save")))).toHaveLength(0);
    await card.locator(".owner-editor").screenshot({ path: test.info().outputPath(`compact-owner-editor-${language}.png`) });
    expect(await card.locator("ha-card").evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await card.locator('button[type="submit"]').click();
    await expect(card.locator(".owner-editor")).toHaveCount(0);
    const saved = await page.evaluate(() => window.ownerPlacementFixture.owners[0]);
    expect(saved.name).toBe("Jordan");
    expect(saved.placements.l1.payment_amount).toBe("");
    expect(saved.placements.l1.puppy_preferences).toEqual([]);
  });
}

for (const [section, field] of [["contact", "name"], ["address", "street"], ["placement", "placement_status"], ["preferences", "preference_puppy_1"], ["financial", "payment_status"], ["notes", "notes"]]) {
  test(`direct ${section} editing opens the selected litter and only the intended section @cross-browser @tablet`, async ({ page }) => {
    const card = await mount(page);
    await card.locator("#owner-scope").selectOption("__all__");
    await card.locator('[data-toggle-owner="o1"]').click();
    await card.locator('[data-owner-dossier="o1"]').selectOption("l2");
    await expect(card.locator('[data-owner-group="history"] [data-edit-owner-section]')).toHaveCount(0);
    await card.locator(`.owner-detail [data-section-owner="o1"][data-edit-owner-section="${section}"]`).click();
    await expect(card.locator("#owner-litter")).toHaveValue("l2");
    await expect(card.locator("[data-owner-editor-group][open]")).toHaveCount(1);
    await expect(card.locator(`[data-owner-editor-group="${section}"]`)).toHaveJSProperty("open", true);
    await expect(card.locator(`[name="${field}"]`)).toBeVisible();
    await expect(card.locator(`[name="${field}"]`)).toBeFocused();
    await expect(card.locator('[name="payment_amount"]')).toHaveValue("3000");
    await expect(card.locator(".owner-draft-status")).toBeEmpty();
    if (section === "financial") await card.locator(".owner-editor").screenshot({ path: test.info().outputPath("owner-financial-editor.png") });
    await card.locator("#cancel-owner").click();
    await expect(card.locator(".owner-editor")).toHaveCount(0);
    expect(await page.evaluate(() => window.ownerPlacementFixture.calls.filter((call) => call.type.endsWith("owners/save")))).toHaveLength(0);
  });
}

test("collapsing edited sections preserves every value through failed save and retry @cross-browser @tablet", async ({ page }) => {
  const card = await mount(page);
  await card.locator('[data-edit="o1"]').click();
  await openOwnerSection(card, "address");
  await card.locator('[name="street"]').fill("Nieuwe straat 4");
  await openOwnerSection(card, "financial");
  await card.locator('[name="payment_balance"]').fill("850");
  await openOwnerSection(card, "notes");
  await card.locator('[name="notes"]').fill("A long contact note\nwith another line");
  await card.locator('[name="placement_notes"]').fill("Notes for this litter only");
  const openSections = await card.locator("[data-owner-editor-group][open]").evaluateAll((groups) => groups.map((group) => group.dataset.ownerEditorGroup));
  for (const key of openSections) await card.locator(`[data-owner-editor-group="${key}"] summary`).click();
  await card.evaluate((element) => element._render());
  await expect(card.locator("[data-owner-editor-group][open]")).toHaveCount(0);
  await page.evaluate(() => { window.ownerPlacementFixture.failNext = true; });
  await card.locator('button[type="submit"]').click();
  await expect(card.locator("#owner-error")).toContainText("Temporary save failure");
  await expect(card.locator("[data-owner-editor-group][open]")).toHaveCount(0);
  await expect(card.locator('[name="street"]')).toHaveValue("Nieuwe straat 4");
  await expect(card.locator('[name="payment_balance"]')).toHaveValue("850");
  await expect(card.locator(".owner-draft-status")).not.toBeEmpty();
  await card.locator('button[type="submit"]').click();
  await expect(card.locator(".owner-editor")).toHaveCount(0);
  const owner = await page.evaluate(() => window.ownerPlacementFixture.owners[0]);
  expect(owner.street).toBe("Nieuwe straat 4");
  expect(owner.notes).toBe("A long contact note\nwith another line");
  expect(owner.placements.l1.payment_balance).toBe("850");
  expect(owner.placements.l1.placement_notes).toBe("Notes for this litter only");
  expect(owner.placements.l2.payment_balance).toBe("3000");
});

for (const [section, field] of [["contact", "email"], ["financial", "deposit_amount"], ["preferences", "preference_puppy_1"]]) {
  test(`validation reveals the collapsed ${section} section without jumping the page @cross-browser @tablet`, async ({ page }) => {
    const card = await mount(page);
    await card.locator('[data-edit="o1"]').click();
    const group = await openOwnerSection(card, section);
    if (section === "contact") await card.locator('[name="email"]').fill("invalid-email");
    if (section === "financial") await card.locator('[name="deposit_amount"]').fill("3000");
    if (section === "preferences") await card.locator('[name="preference_puppy_1"]').selectOption("");
    await group.locator("summary").click();
    const before = await page.evaluate(() => window.scrollY);
    await card.locator(".owner-editor form").evaluate((form) => form.requestSubmit());
    await expect(group).toHaveJSProperty("open", true);
    await expect(card.locator(`[name="${field}"]`)).toHaveAttribute("aria-invalid", "true");
    await expect(card.locator(`[name="${field}"]`)).toBeFocused();
    expect(await page.evaluate(() => window.scrollY)).toBe(before);
    await card.evaluate((element) => element._render());
    await expect(group).toHaveJSProperty("open", true);
    expect(await page.evaluate(() => window.ownerPlacementFixture.calls.filter((call) => call.type.endsWith("owners/save")))).toHaveLength(0);
  });
}
