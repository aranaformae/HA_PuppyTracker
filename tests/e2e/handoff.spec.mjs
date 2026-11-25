import { expect, test } from "@playwright/test";

async function mount(page, { language = "en", assigned = false, fail = "" } = {}) {
  await page.goto("/tests/e2e/cards.html");
  await page.waitForFunction(() => window.__puppyTrackerReady === true);
  await page.evaluate(async ({ language, assigned, fail }) => {
    const { openHandoff } = await import("/custom_components/puppy_tracker/frontend/puppy-tracker-handoff.js");
    window.handoffCalls = [];
    window.handoffChecklist = { revision: "default", max_items: 40, items: [
      { id: "chip", label: null, labels: { en: "Microchip number checked", nl: "Chipnummer gecontroleerd" } },
      { id: "registration", label: null, labels: { en: "Registration arranged", nl: "Registratie geregeld" } },
      { id: "vaccination", label: null, labels: { en: "Vaccination checked", nl: "Vaccinatie gecontroleerd" } },
      { id: "food", label: null, labels: { en: "Food and instructions provided", nl: "Voeding en uitleg meegegeven" } },
      { id: "contract", label: null, labels: { en: "Contract arranged", nl: "Contract geregeld" } },
    ] };
    window.handoffOpen = (trigger) => openHandoff({ trigger, hass: { language, user: { is_admin: true }, callWS: async (msg) => {
      window.handoffCalls.push(msg);
      if (fail && window.handoffCalls.length === 1) throw { code: fail };
      return { updated_at: "v2" };
    } }, litterId: "l1", puppy: { id: "p1", name: "Nova", collar_color: "paars", updated_at: "v1",
      handoff: { checklist: window.handoffChecklist, total_count: 5, status: assigned ? "assigned" : "reserved", stage: "reserved", assigned, checks: { chip: true } } } });
    window.handoffOpen();
  }, { language, assigned, fail });
  return page.locator("puppy-tracker-handoff-editor");
}

test("handoff checklist saves the exact puppy, confirms incomplete departure and retains failed drafts @cross-browser", async ({ page }) => {
  const editor = await mount(page, { fail: "write_failed" });
  await expect(editor.getByRole("heading")).toContainText("Nova (paars)");
  await editor.locator("#status").selectOption("departed");
  await editor.locator("#departure-date").fill("2026-10-25");
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  await expect(editor.locator(".error")).toContainText("explicitly confirm");
  expect(await page.evaluate(() => window.handoffCalls)).toHaveLength(0);
  await editor.locator("#confirm").check();
  await editor.locator('[data-check="food"]').check();
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  await expect(editor.locator(".error")).toContainText("input has been kept");
  await expect(editor.locator('[data-check="food"]')).toBeChecked();
  await expect(editor.locator("#departure-date")).toHaveValue("2026-10-25");
  await editor.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(editor).toHaveCount(0);
  const calls = await page.evaluate(() => window.handoffCalls);
  expect(calls).toHaveLength(2);
  expect(calls[1]).toMatchObject({ litter_id: "l1", puppy_id: "p1", expected_updated_at: "v1", expected_checklist_revision: "default", confirm_incomplete: true,
    handoff: { stage: "reserved", departure_date: "2026-10-25", checks: { chip: true, food: true, vaccination: false } } });
});

test("Dutch assigned handoff is responsive, scrollable and returns focus without moving the page @cross-browser @tablet", async ({ page }) => {
  await mount(page, { language: "nl", assigned: true });
  await page.locator("puppy-tracker-handoff-editor #cancel").click();
  await page.evaluate(() => {
    document.body.style.minHeight = "3000px";
    const trigger = document.createElement("button"); trigger.id = "handoff-trigger"; trigger.textContent = "Overdracht openen";
    trigger.style.marginTop = "1000px"; document.querySelector("#cards").append(trigger);
    trigger.onclick = () => window.handoffOpen(trigger); trigger.scrollIntoView(); trigger.focus({ preventScroll: true });
  });
  const before = await page.evaluate(() => window.scrollY);
  await page.locator("#handoff-trigger").click();
  const editor = page.locator("puppy-tracker-handoff-editor");
  await expect(editor.locator("#status")).toHaveValue("assigned");
  await expect(editor.locator("#status option")).toHaveCount(2);
  await expect(editor.getByText("Registratie geregeld", { exact: true })).toBeVisible();
  const dimensions = await editor.locator("dialog").evaluate((node) => ({ width: node.getBoundingClientRect().width, viewport: window.innerWidth, overflow: node.scrollWidth > node.clientWidth }));
  expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport);
  expect(dimensions.overflow).toBe(false);
  await editor.locator("#status").selectOption("departed");
  await expect(editor.getByText("Werkelijke vertrekdatum", { exact: true })).toBeVisible();
  // Switching to a litter definition stays in the same scrollable native dialog.
  page.once("dialog", (dialog) => dialog.accept());
  await editor.getByRole("button", { name: "Checklist aanpassen voor dit nest", exact: true }).click();
  const listDimensions = await editor.locator("dialog").evaluate((node) => ({ width: node.getBoundingClientRect().width, viewport: window.innerWidth, overflow: node.scrollWidth > node.clientWidth }));
  expect(listDimensions.width).toBeLessThanOrEqual(listDimensions.viewport);
  expect(listDimensions.overflow).toBe(false);
  await editor.getByRole("button", { name: "Terug naar pup", exact: true }).click();
  await editor.locator("#cancel").click();
  await expect(page.locator("#handoff-trigger")).toBeFocused();
  expect(Math.abs(await page.evaluate(() => window.scrollY) - before)).toBeLessThan(3);
});

test("stale handoff shows a localized conflict and keeps the checklist @cross-browser", async ({ page }) => {
  const editor = await mount(page, { language: "nl", fail: "stale_handoff" });
  await editor.locator('[data-check="contract"]').check();
  await editor.getByRole("button", { name: "Opslaan", exact: true }).click();
  await expect(editor.locator(".error")).toContainText("intussen gewijzigd");
  await expect(editor.locator('[data-check="contract"]')).toBeChecked();
});

test("litter handoff stays available in the compact view and saves without changing puppy profile fields @cross-browser", async ({ page }) => {
  await page.goto("/tests/e2e/cards.html");
  await page.waitForFunction(() => window.__puppyTrackerReady === true);
  await page.evaluate(() => {
    window.handoffCalls = [];
    const puppy = { id: "p1", name: "Nova", collar_color: "paars", updated_at: "v1", summary: {}, handoff: { checklist: { revision: "default", max_items: 40, items: [{ id: "registration", label: "Registration arranged" }] }, total_count: 1, stage: "available", status: "available", checks: {} } };
    const card = document.createElement("puppy-tracker-litter-card");
    card.id = "handoff-litter"; card.setConfig({ show_details: false });
    card._hass = { language: "en", user: { is_admin: true }, callWS: async (msg) => {
      if (msg.type === "puppy_tracker/handoff/save") { window.handoffCalls.push(msg); return { updated_at: "v2" }; }
      throw new Error("Refresh unavailable");
    } };
    card._litters = [{ id: "l1", name: "Litter", active: true }]; card._selectedLitterId = "l1";
    card._data = { can_manage_measurements: true, litter: { id: "l1", active: true, summary: {} }, puppies: [puppy] };
    document.querySelector("#cards").append(card); card._render();
  });
  const card = page.locator("#handoff-litter");
  await card.getByRole("button", { name: "Handover: Available", exact: false }).click();
  const editor = page.locator("puppy-tracker-handoff-editor");
  await editor.locator('[data-check="registration"]').check();
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(card.locator(".save-feedback")).toContainText("Handover saved");
  expect(await page.evaluate(() => window.handoffCalls[0])).toMatchObject({ puppy_id: "p1", expected_updated_at: "v1", handoff: { checks: { registration: true }, departure_date: null } });
  await card.evaluate((node) => { node._data.can_manage_measurements = false; node._render(); });
  await expect(card.locator("[data-handoff-puppy]")).toHaveCount(0);
});

test("custom nest checklist keeps stable IDs while renaming, removing, adding and reordering, including retry @cross-browser", async ({ page }) => {
  const editor = await mount(page, { fail: "write_failed" });
  await editor.getByRole("button", { name: "Customize checklist for this litter", exact: true }).click();
  await expect(editor.getByRole("heading")).toHaveText("Checklist for all puppies in this litter");
  const registration = editor.locator('[data-item-id="registration"]');
  await registration.locator("input").fill("Registration checked with buyer");
  await editor.locator('[data-item-id="vaccination"] [data-action="remove"]').click();
  await editor.getByRole("button", { name: "Add item", exact: true }).click();
  const newRow = editor.locator(".template-row").last();
  await expect(newRow.locator("input")).toHaveValue("");
  await newRow.locator("input").fill('Puppy bag <packed> "ready"');
  const newId = await newRow.getAttribute("data-item-id");
  await newRow.getByRole("button", { name: "Move up", exact: true }).click();
  const input = editor.locator(`[data-item-id="${newId}"] input`);
  await expect(input).toHaveValue('Puppy bag <packed> "ready"');
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  await expect(editor.locator(".error")).toContainText("input has been kept");
  await expect(input).toHaveValue('Puppy bag <packed> "ready"');
  await expect(registration.locator("input")).toHaveValue("Registration checked with buyer");
  await editor.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(editor).toHaveCount(0);
  const calls = await page.evaluate(() => window.handoffCalls);
  expect(calls).toHaveLength(2);
  expect(calls[1]).toMatchObject({ type: "puppy_tracker/handoff/checklist/save", litter_id: "l1", expected_revision: "default" });
  expect(calls[1].items).toEqual([
    { id: "chip", label: null }, { id: "registration", label: "Registration checked with buyer" },
    { id: "food", label: null }, { id: newId, label: 'Puppy bag <packed> "ready"' }, { id: "contract", label: null },
  ]);
});

test("nest checklist preserves dirty puppy input when switching is cancelled and keeps drafts on conflicts @cross-browser", async ({ page }) => {
  const editor = await mount(page, { language: "nl", fail: "stale_checklist" });
  await editor.locator('[data-check="contract"]').check();
  page.once("dialog", (dialog) => dialog.dismiss());
  await editor.getByRole("button", { name: "Checklist aanpassen voor dit nest", exact: true }).click();
  await expect(editor.locator('[data-check="contract"]')).toBeChecked();
  page.once("dialog", (dialog) => dialog.accept());
  await editor.getByRole("button", { name: "Checklist aanpassen voor dit nest", exact: true }).click();
  await editor.locator('[data-item-id="chip"] input').fill("Chipregistratie");
  await editor.getByRole("button", { name: "Opslaan", exact: true }).click();
  await expect(editor.locator(".error")).toContainText("nestchecklist is intussen gewijzigd");
  await expect(editor.locator('[data-item-id="chip"] input')).toHaveValue("Chipregistratie");
});
