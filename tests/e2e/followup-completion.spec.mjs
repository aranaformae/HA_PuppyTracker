import { expect, test } from "@playwright/test";

async function mount(page, surface, scope, recordType = "deworming") {
  await page.goto("/tests/e2e/cards.html?production");
  await page.waitForFunction(() => window.__puppyTrackerReady);
  await page.evaluate(({ surface, scope, recordType }) => {
    const clone = (value) => structuredClone(value);
    const dueDate = new Date().toISOString().slice(0, 10);
    const next = new Date();
    next.setDate(next.getDate() + 14);
    const nextDate = next.toISOString().slice(0, 10);
    const records = ["puppy", "mother", "litter"].map((owner) => ({
      id: `${owner}-source`, scope: owner, type: recordType, litter_id: "l1",
      puppy_id: owner === "puppy" ? "p1" : null, mother_id: owner === "mother" ? "m1" : null,
      occurred_at: "2026-09-01T10:00:00Z", note: "Original administration", title: "Original title",
      deleted: false, data: { product: "Old product", vaccine: "Old vaccine", amount: "1.5", dose: "Old dose", weight_grams: "420", batch_number: "OLD", next_due_date: dueDate },
    }));
    const state = window.followupFixture = { records, nextDate, calls: [], fail: false };
    const actions = (owner) => records.filter((record) => record.scope === owner && record.data.next_due_date
      && !records.some((item) => !item.deleted && item.scope === owner && item.data.followup_record_id === record.id && item.data.followup_due_date === record.data.next_due_date))
      .map((record) => ({ id: `${record.id}:next_due_date`, source_record_id: record.id, record_id: record.id,
        litter_id: "l1", scope: owner, puppy_id: owner === "puppy" ? "p1" : null,
        type: record.type, record_type: record.type, due_date: record.data.next_due_date, due_soon: true,
        days_until_due: 0, status: "due_today", title: record.type, source_title: record.title }));
    const hass = {
      user: { is_admin: true }, language: "nl", locale: { language: "nl" }, states: {}, config: { time_zone: "UTC" },
      connection: { subscribeMessage: async () => async () => {} },
      callWS: async (message) => {
        state.calls.push(clone(message));
        if (message.type === "puppy_tracker/litters") return { litters: [{ id: "l1", name: "Test litter", active: true }] };
        if (message.type === "puppy_tracker/data") return { can_manage_records: true,
          litter: { id: "l1", name: "Test litter", mother: "Luna", mother_id: "m1", active: true, records: clone(records.filter((r) => r.scope === "litter")), summary: { dossier_actions: { actions: actions("litter") } } },
          puppies: [{ id: "p1", name: "Alice", collar_color: "Red", active: true, records: clone(records.filter((r) => r.scope === "puppy")), summary: { needs_attention: false, dossier_actions: { actions: actions("puppy") } } }] };
        if (message.type.endsWith("/records")) {
          const owner = message.type.includes("mother/") ? "mother" : message.puppy_id ? "puppy" : "litter";
          return { can_manage_records: true, owner: { name: owner === "mother" ? "Luna" : "Alice" }, records: clone(records.filter((r) => r.scope === owner)), actions: { actions: actions(owner) } };
        }
        if (message.type === "puppy_tracker/mother/attention") return { owner: { name: "Luna" }, dossier_actions: { actions: actions("mother") } };
        if (message.type === "puppy_tracker/attention_acknowledgements") return { acknowledgements: {} };
        if (message.type === "puppy_tracker/care_occurrences") return { occurrences: [], skipped: [] };
        if (message.type === "puppy_tracker/recurring_reminders") return { reminders: [] };
        if (message.type.endsWith("/record/add")) {
          if (state.fail) throw new Error("Temporary failure");
          const owner = message.type.includes("mother/") ? "mother" : message.puppy_id ? "puppy" : "litter";
          const record = { id: "new-record", litter_id: "l1", scope: owner, puppy_id: message.puppy_id || null,
            type: message.record_type, occurred_at: message.occurred_at, title: message.title, note: message.note,
            data: { ...clone(message.data), followup_record_id: message.followup_record_id, followup_due_date: message.followup_due_date } };
          records.push(record);
          return { record: clone(record), record_id: record.id };
        }
        throw new Error(`Unexpected command ${message.type}`);
      },
    };
    const card = document.createElement(`puppy-tracker-${surface}-card`);
    card.setConfig({ litter_id: "l1", default_selected: scope, puppy_id: scope === "puppy" ? "p1" : undefined, show_timeline_items: true, show_litter_selector: false });
    document.querySelector("#cards").append(card);
    card.hass = hass;
  }, { surface, scope, recordType });
  const card = page.locator(`puppy-tracker-${surface}-card`);
  const key = `${scope}-source:next_due_date`;
  const selector = surface === "dossier" ? `[data-complete-followup="${key}"]` : `[data-complete-followup="${scope === "mother" ? "mother" : "dossier"}:${key}"]`;
  const button = card.locator(selector);
  await expect(button).toBeVisible();
  return { card, button };
}

for (const surface of ["dossier", "attention"]) {
  for (const scope of ["puppy", "mother", "litter"]) {
    test(`${surface} completes ${scope} follow-up as a new editable fact @cross-browser @tablet`, async ({ page }, testInfo) => {
      const { card, button } = await mount(page, surface, scope);
      const original = await page.evaluate((scope) => structuredClone(window.followupFixture.records.find((r) => r.id === `${scope}-source`)), scope);
      await button.click();
      const editor = page.locator("puppy-tracker-record-editor");
      await expect(editor.locator("h2")).toHaveText("Uitgevoerd registreren");
      await expect(editor.locator("#record-type")).toBeDisabled();
      await expect(editor.locator("#record-data-product")).toHaveValue("Old product");
      await expect(editor.locator("#record-data-next_due_date")).toHaveValue("");
      for (const id of ["amount", "dose", "weight_grams", "batch_number"]) await expect(editor.locator(`#record-data-${id}`)).toHaveValue("");
      await expect(editor.locator("#record-note")).toHaveValue("");
      await expect(editor.locator("#record-occurred")).not.toHaveValue(/^2026-09-01/);
      if (surface === "dossier" && scope === "puppy") await editor.locator("dialog").screenshot({ path: testInfo.outputPath("followup-completion.png") });
      await editor.locator("#record-data-product").fill("Different product");
      await editor.locator("#record-data-amount").fill("2");
      await editor.locator("#record-data-next_due_date").fill(await page.evaluate(() => window.followupFixture.nextDate));
      await editor.locator("#record-note").fill("Execution checked");
      await editor.locator("#record-save").click();
      await expect(editor).toHaveCount(0);
      await expect(button).toHaveCount(0);
      const calls = await page.evaluate(() => window.followupFixture.calls.filter((msg) => msg.type.endsWith("/record/add") || msg.type.endsWith("/record/update")));
      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({ type: scope === "mother" ? "puppy_tracker/mother/record/add" : "puppy_tracker/record/add", litter_id: "l1", record_type: "deworming", followup_record_id: `${scope}-source`, data: { product: "Different product", amount: "2" } });
      if (scope === "puppy") expect(calls[0].puppy_id).toBe("p1");
      else expect(calls[0]).not.toHaveProperty("puppy_id");
      expect(await page.evaluate((scope) => window.followupFixture.records.find((r) => r.id === `${scope}-source`), scope)).toEqual(original);
      if (surface === "dossier") {
        await expect(card.locator('[data-edit-item="new-record"]')).toBeVisible();
        await expect(card.locator(`[data-edit-item="${scope}-source"]`)).toBeVisible();
        await expect(card.locator(".timeline")).not.toContainText("Followup record id");
      }
    });
  }
}

test("completion can be cancelled, retried after failure and saved without a next due date @cross-browser @tablet", async ({ page }) => {
  const { button } = await mount(page, "dossier", "puppy");
  await button.click();
  const editor = page.locator("puppy-tracker-record-editor");
  await editor.locator("#record-cancel").click();
  await expect(editor).toHaveCount(0);
  await expect(button).toBeVisible();
  expect(await page.evaluate(() => window.followupFixture.records)).toHaveLength(3);
  await button.click();
  await editor.locator("#record-data-product").fill("");
  await editor.locator("#record-save").click();
  await expect(editor.locator("#record-data-product")).toHaveAttribute("aria-invalid", "true");
  await editor.locator("#record-data-product").fill("New product");
  await page.evaluate(() => { window.followupFixture.fail = true; });
  await editor.locator("#record-save").click();
  await expect(editor.locator(".error")).toContainText("Temporary failure");
  await expect(editor.locator("#record-data-product")).toHaveValue("New product");
  await expect(editor.locator("#record-type")).toBeDisabled();
  await expect(button).toBeVisible();
  await page.evaluate(() => { window.followupFixture.fail = false; });
  await editor.locator("#record-save").click();
  await expect(editor).toHaveCount(0);
  await expect(button).toHaveCount(0);
  expect(await page.evaluate(() => window.followupFixture.records)).toHaveLength(4);
});

test("vaccination follow-up uses the same new-entry workflow and respects write permissions @cross-browser @tablet", async ({ page }) => {
  const { card, button } = await mount(page, "dossier", "puppy", "vaccination");
  await button.click();
  const editor = page.locator("puppy-tracker-record-editor");
  await expect(editor.locator("#record-data-vaccine")).toHaveValue("Old vaccine");
  await expect(editor.locator("#record-data-batch_number")).toHaveValue("");
  await editor.locator("#record-data-vaccine").fill("Different vaccine");
  await editor.locator("#record-save").click();
  await expect(editor).toHaveCount(0);
  expect(await page.evaluate(() => window.followupFixture.records.find((r) => r.id === "new-record"))).toMatchObject({ type: "vaccination", data: { vaccine: "Different vaccine" } });
  await card.evaluate((element) => { element._hass.user.is_admin = false; element._render(); });
  await expect(card.locator("[data-complete-followup],[data-edit-item]")).toHaveCount(0);
});
