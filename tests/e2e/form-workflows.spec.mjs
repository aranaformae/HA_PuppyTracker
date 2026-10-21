import { expect, test } from "@playwright/test";

async function mount(page, tag, config = {}) {
  await page.goto("/tests/e2e/cards.html?production");
  await page.waitForFunction(() => window.__puppyTrackerReady);
  await page.evaluate(({ tag, config }) => {
    const copy = (value) => structuredClone(value);
    const records = [];
    const owners = [{ id: "o1", name: "Alex", role: "owner", puppy_preferences: [] }];
    const programs = [{ id: "program-1", litter_id: "l1", title: "Daily care", start_age_days: 3, end_age_days: 16, interval_days: 1, time_of_day: "09:00", instructions_by_age: { 3: "Original instruction" } }];
    const reminders = [{ id: "reminder-1", litter_id: "l1", title: "Daily reminder", schedule_mode: "interval", interval_minutes: 240, owner_scope: "puppy", owner_id: "p1" }];
    const puppies = [{ id: "p1", name: "Alice", collar_color: "Red", active: true }, { id: "p2", name: "Bob", collar_color: "Blue", active: true }];
    const state = window.formFixture = { calls: [], failNext: false, pauseNext: false, subscriptions: [] };
    const hass = {
      language: "en", locale: { language: "en" }, user: { is_admin: true }, states: {},
      connection: { subscribeMessage: async (callback) => { state.subscriptions.push(callback); return async () => {}; } },
      callWS: async (msg) => {
        state.calls.push(copy(msg));
        const mutation = /\/(add|save|create|update|link|record)$/.test(msg.type);
        if (mutation && state.pauseNext) { state.pauseNext = false; await new Promise((resolve) => { state.resume = resolve; }); }
        if (mutation && state.failNext) { state.failNext = false; throw new Error("Temporary save failure"); }
        if (msg.type === "puppy_tracker/litters") return { litters: [{ id: "l1", name: "First litter", active: true }, { id: "l2", name: "Second litter", active: true }] };
        if (msg.type === "puppy_tracker/data") return { can_manage_records: true, can_manage_measurements: true, litter: { id: msg.litter_id, name: msg.litter_id === "l1" ? "First litter" : "Second litter", mother: "Luna", mother_id: "m1", birth_date: "2026-09-01", records: copy(records.filter((r) => !r.puppy_id)), summary: { dossier_actions: { actions: [] } } }, puppies: puppies.map((p) => ({ ...p, records: copy(records.filter((r) => r.puppy_id === p.id)) })) };
        if (msg.type === "puppy_tracker/records" || msg.type === "puppy_tracker/mother/records") return { can_manage_records: true, owner: { id: "m1", name: "Luna" }, records: copy(records.filter((r) => (r.puppy_id || null) === (msg.puppy_id || null))) };
        if (msg.type.endsWith("/record/add")) { const record = { ...copy(msg), id: `r${records.length + 1}`, type: msg.record_type, deleted: false }; records.push(record); return { record: copy(record), record_id: record.id }; }
        if (msg.type.endsWith("/record/update")) { const record = records.find((r) => r.id === msg.record_id); Object.assign(record, copy(msg), { type: msg.record_type }); return { ok: true }; }
        if (msg.type === "puppy_tracker/owners/list") return { owners: copy(owners) };
        if (msg.type === "puppy_tracker/owners/save") { const owner = { ...copy(msg), id: msg.owner_id || "o2" }; const index = owners.findIndex((o) => o.id === owner.id); if (index >= 0) owners[index] = owner; else owners.push(owner); return { owner: copy(owner) }; }
        if (msg.type === "puppy_tracker/owners/link") return { ok: true };
        if (msg.type === "puppy_tracker/care_programs") return { programs: copy(programs.filter((p) => p.litter_id === msg.litter_id)) };
        if (msg.type === "puppy_tracker/care_program_templates") return { templates: [] };
        if (msg.type === "puppy_tracker/recurring_reminders") return { reminders: copy(reminders.filter((r) => r.litter_id === msg.litter_id)) };
        if (msg.type === "puppy_tracker/care_occurrences") return { occurrences: [], skipped: [] };
        if (msg.type === "puppy_tracker/care_occurrence/record") {
          const record = { id: `r${records.length + 1}`, puppy_id: msg.puppy_id, type: "note", occurred_at: new Date().toISOString(), note: msg.note, data: { care_occurrence_id: msg.occurrence_id, care_status: msg.status, care_result: msg.result, care_score: msg.score } };
          records.push(record);
          return { record_id: record.id };
        }
        if (msg.type.startsWith("puppy_tracker/care_program/")) { const program = { ...copy(msg), id: msg.program_id || "program-2" }; const index = programs.findIndex((p) => p.id === program.id); if (index >= 0) programs[index] = program; else programs.push(program); return { program_id: program.id }; }
        if (msg.type.startsWith("puppy_tracker/recurring_reminder/")) { const reminder = { ...copy(msg), id: msg.reminder_id || "reminder-2" }; const index = reminders.findIndex((r) => r.id === reminder.id); if (index >= 0) reminders[index] = reminder; else reminders.push(reminder); return { reminder_id: reminder.id }; }
        if (msg.type.endsWith("/profile_note/update")) return { ok: true };
        throw new Error(`Unexpected call: ${msg.type}`);
      },
    };
    const card = document.createElement(tag);
    card.setConfig({ litter_id: "l1", ...config });
    document.querySelector("#cards").append(card);
    card.hass = hass;
  }, { tag, config });
  return page.locator(tag).first();
}

test("Quick Log protects changed drafts and offers exact-owner editing after retry", { tag: ["@cross-browser", "@tablet"] }, async ({ page }) => {
  const card = await mount(page, "puppy-tracker-quick-log-card");
  await card.locator("#owner-select").selectOption("p2");
  await card.locator('[data-preset="note"]').click();
  await card.locator("#quick-cancel").click();
  await expect(card.locator("#quick-note")).toHaveCount(0);
  await card.locator('[data-preset="note"]').click();
  await card.locator("#quick-note").fill("Keep Bob's observation");
  await card.locator("#owner-select").selectOption("p1");
  await expect(card.locator("#owner-select")).toHaveValue("p1");
  await expect(card.locator("#quick-note")).toHaveValue("Keep Bob's observation");
  await card.locator("#owner-select").selectOption("p2");
  await expect(card.locator("#owner-select")).toHaveValue("p2");
  await expect(card.locator("#quick-note")).toHaveValue("Keep Bob's observation");
  page.once("dialog", (dialog) => dialog.dismiss());
  await card.locator("#litter-select").selectOption("l2");
  await expect(card.locator("#litter-select")).toHaveValue("l1");
  await page.evaluate(() => { window.formFixture.failNext = true; });
  await card.locator("#quick-save").click();
  await expect(card.locator(".error")).toContainText("Temporary save failure");
  await expect(card.locator("#quick-note")).toHaveValue("Keep Bob's observation");
  await card.locator("#quick-save").click();
  await expect(card.getByRole("status")).toContainText("Note saved for Bob (Blue)");
  await card.locator("[data-edit-saved]").click();
  const editor = page.locator("puppy-tracker-record-editor");
  await expect(editor.locator("#record-note")).toHaveValue("Keep Bob's observation");
  await editor.locator("#record-note").fill("Corrected for Bob");
  await editor.locator("#record-save").click();
  await expect.poll(() => page.evaluate(() => window.formFixture.calls.find((c) => c.type === "puppy_tracker/record/update"))).toMatchObject({ puppy_id: "p2", record_id: "r1", note: "Corrected for Bob" });
});

test("Owners retain raw form values through rendering, failed saving and cancelled discard", { tag: ["@cross-browser", "@tablet"] }, async ({ page }) => {
  const card = await mount(page, "puppy-tracker-owner-card");
  await card.locator("#add-owner").click();
  await card.locator('[name="name"]').fill("Jordan");
  await card.locator('[name="email"]').fill("jordan@example.com");
  await card.locator('[name="phone"]').fill("0612345678");
  await card.locator('[name="notes"]').fill("Long private note that must not disappear.");
  await card.locator('[data-toggle-owner="o1"]').click();
  await expect(card.locator('[name="notes"]')).toHaveValue("Long private note that must not disappear.");
  await card.locator('[name="payment_amount"]').fill("100");
  await card.locator('[name="deposit_amount"]').fill("120");
  await card.locator('.owner-editor button[type="submit"]').click();
  await expect(card.locator('[name="deposit_amount"]')).toHaveAttribute("aria-invalid", "true");
  expect(await page.evaluate(() => window.formFixture.calls.filter((call) => call.type === "puppy_tracker/owners/save"))).toHaveLength(0);
  await card.locator('[name="deposit_amount"]').fill("40");
  await page.evaluate(() => { window.formFixture.failNext = true; });
  await card.locator('.owner-editor button[type="submit"]').click();
  await expect(card.locator("#owner-error")).toContainText("Temporary save failure");
  await expect(card.locator('[name="phone"]')).toHaveValue("0612345678");
  page.once("dialog", (dialog) => dialog.dismiss());
  await card.locator("#cancel-owner").click();
  await expect(card.locator('[name="name"]')).toHaveValue("Jordan");
  page.once("dialog", (dialog) => dialog.dismiss());
  await card.locator('[data-edit="o1"]').click();
  await expect(card.locator('[name="name"]')).toHaveValue("Jordan");
  await card.locator('.owner-editor button[type="submit"]').click();
  await expect(card.locator("#owner-status")).toContainText("Jordan");
  await card.locator("#owner-status button").click();
  await expect(card.locator('[name="name"]')).toHaveValue("Jordan");
  await expect(card.locator('[name="notes"]')).toHaveValue("Long private note that must not disappear.");
});

for (const [surface, tag, title, lead, save, cancel] of [
  ["programs", "puppy-tracker-care-program-card", "#care-title", "#care-lead-minutes", "#save-program", "#cancel-program"],
  ["reminders", "puppy-tracker-recurring-reminder-card", "#rem-title", "#rem-lead-minutes", "#save-reminder", "#cancel-reminder"],
]) {
  test(`${surface} keeps invalid and failed drafts and blocks navigation while saving`, { tag: ["@cross-browser", "@tablet"] }, async ({ page }) => {
    const workspace = await mount(page, "puppy-tracker-workspace-card", { preset: "care", default_tab: surface, show_summary: false });
    const card = workspace.locator(tag);
    await card.locator("button.edit").first().click();
    await card.locator(title).fill("Edited care title");
    if (surface === "programs") await card.locator(".age-instruction-text").fill("Keep this day-specific instruction.");
    await card.locator(lead).fill("10.5");
    await card.locator(save).click();
    await expect(card.locator(lead)).toHaveAttribute("aria-invalid", "true");
    await expect(card.locator(title)).toHaveValue("Edited care title");
    if (surface === "programs") await expect(card.locator(".age-instruction-text")).toHaveValue("Keep this day-specific instruction.");
    await card.locator(lead).fill("10");
    await expect(card.locator(lead)).not.toHaveAttribute("aria-invalid", "true");
    await page.evaluate(() => { window.formFixture.failNext = true; });
    await card.locator(save).click();
    await expect(card.locator(".error").last()).toContainText("Temporary save failure");
    await expect(card.locator(title)).toHaveValue("Edited care title");
    page.once("dialog", (dialog) => dialog.dismiss());
    await card.locator(cancel).click();
    await expect(card.locator(title)).toHaveValue("Edited care title");
    await page.evaluate(() => { window.formFixture.pauseNext = true; });
    await card.locator(save).click();
    await expect(card.locator(title)).toBeDisabled();
    await workspace.evaluate((element) => element._selectTab("calculator"));
    await expect(card).toBeVisible();
    await page.evaluate(() => window.formFixture.resume());
    await expect(card.getByRole("status")).toContainText("Edited care title");
    await card.getByRole("status").getByRole("button", { name: "Edit", exact: true }).click();
    await expect(card.locator(title)).toHaveValue("Edited care title");
  });
}

test("Workspace retains hidden drafts and asks once before a litter change discards them", { tag: ["@cross-browser", "@tablet"] }, async ({ page }) => {
  const workspace = await mount(page, "puppy-tracker-workspace-card", { preset: "journal", default_tab: "quickLog", show_summary: false });
  const quick = workspace.locator("puppy-tracker-quick-log-card");
  await quick.locator('[data-preset="note"]').click();
  await quick.locator("#quick-note").fill("Hidden unsaved note");
  await workspace.evaluate((element) => element._selectTab("temperature"));
  const temperature = workspace.locator("puppy-tracker-temperature-card");
  await expect(temperature.locator("#litter-select")).toHaveValue("l1");
  page.once("dialog", (dialog) => dialog.dismiss());
  await temperature.locator("#litter-select").selectOption("l2");
  await expect(temperature.locator("#litter-select")).toHaveValue("l1");
  await workspace.evaluate((element) => element._selectTab("quickLog"));
  await expect(quick.locator("#quick-note")).toHaveValue("Hidden unsaved note");
  page.once("dialog", (dialog) => dialog.accept());
  await quick.locator("#litter-select").selectOption("l2");
  await expect(quick.locator("#litter-select")).toHaveValue("l2");
  await expect(quick.locator("#quick-note")).toHaveCount(0);
});

test("removing an instruction row alone remains a protected draft after save failure", { tag: ["@cross-browser", "@tablet"] }, async ({ page }) => {
  const card = await mount(page, "puppy-tracker-care-program-card");
  await card.locator("button.edit").click();
  await expect(card.locator(".age-instruction-row")).toHaveCount(1);
  await card.locator(".remove-age-instruction").click();
  page.once("dialog", (dialog) => dialog.dismiss());
  await card.locator("#cancel-program").click();
  await expect(card.locator("#care-title")).toHaveValue("Daily care");
  await expect(card.locator(".age-instruction-row")).toHaveCount(0);
  await page.evaluate(() => { window.formFixture.failNext = true; });
  await card.locator("#save-program").click();
  await expect(card.locator(".error").last()).toContainText("Temporary save failure");
  await expect(card.locator(".age-instruction-row")).toHaveCount(0);
});

test("external weighing context changes do not discard or reassign a hidden draft", async ({ page }) => {
  const workspace = await mount(page, "puppy-tracker-workspace-card", { preset: "journal", default_tab: "quickLog" });
  const quick = workspace.locator("puppy-tracker-quick-log-card");
  await quick.locator("#owner-select").selectOption("p2");
  await quick.locator('[data-preset="note"]').click();
  await quick.locator("#quick-note").fill("Still belongs to the original litter");
  await workspace.evaluate((element) => {
    element._selectTab("temperature");
    element.dispatchEvent(new CustomEvent("puppy-tracker-litter-change", { detail: { litterId: "l2" } }));
    element._selectTab("quickLog");
  });
  await expect(quick.locator("#litter-select")).toHaveValue("l1");
  await expect(quick.locator("#owner-select")).toHaveValue("p2");
  await quick.locator("#quick-save").click();
  await expect.poll(() => page.evaluate(() => window.formFixture.calls.find((c) => c.type === "puppy_tracker/record/add"))).toMatchObject({ litter_id: "l1", puppy_id: "p2", note: "Still belongs to the original litter" });
  await expect(quick.locator("#quick-save")).toHaveCount(0);
  await workspace.evaluate((element) => { element._selectTab("temperature"); element._selectTab("quickLog"); });
  await expect(quick.locator("#litter-select")).toHaveValue("l2");
});

for (const [tag, config, open, note, save, cancel] of [
  ["puppy-tracker-temperature-card", { default_selected: "puppy", puppy_id: "p2" }, "#add-temperature", "#temperature-note", '.editor button[type="submit"]', "#cancel-temperature"],
  ["puppy-tracker-behavior-card", { puppy_id: "p2" }, "#behavior-add", "#behavior-note", "#behavior-save", "#behavior-cancel"],
  ["puppy-tracker-dossier-card", { default_selected: "puppy", puppy_id: "p2" }, "#profile-edit", "#profile-note", "#profile-save", "#profile-cancel"],
]) {
  test(`${tag} retains new or profile-note drafts after a failed save and cancelled discard`, { tag: ["@cross-browser", "@tablet"] }, async ({ page }) => {
    const card = await mount(page, tag, config);
    if (tag === "puppy-tracker-dossier-card") await card.locator(".profile-panel > summary").click();
    await card.locator(open).click();
    await card.locator(note).fill("Do not lose this observation");
    if (tag.includes("temperature")) await card.locator("#temperature-value").fill("38.4");
    if (tag.includes("behavior")) await card.locator('[data-score-key="curiosity"][value="4"]').check({ force: true });
    await page.evaluate(() => { window.formFixture.failNext = true; });
    await card.locator(save).click();
    await expect(card.locator(".error").first()).toContainText("Temporary save failure");
    await expect(card.locator(note)).toHaveValue("Do not lose this observation");
    page.once("dialog", (dialog) => dialog.dismiss());
    await card.locator(cancel).click();
    await expect(card.locator(note)).toHaveValue("Do not lose this observation");
    page.once("dialog", (dialog) => dialog.accept());
    await card.locator(cancel).click();
    await expect(card.locator(note)).toHaveCount(0);
  });
}

test("a care-result draft survives cancelled closing and a failed save", { tag: ["@cross-browser", "@tablet"] }, async ({ page }) => {
  const card = await mount(page, "puppy-tracker-care-execution-card");
  await expect.poll(() => card.evaluate((element) => element._litters.length)).toBe(2);
  await card.evaluate(async (element) => {
    const { openCareResultEditor } = await import("/custom_components/puppy_tracker/frontend/puppy-tracker-care-result-editor.js");
    openCareResultEditor(element, { id: "occurrence-1", program_id: "program-1", puppy_id: "p2", puppy_name: "Bob", age_days: 3, title: "Daily care", result_fields: ["result", "score", "note"] }, { onSaved: () => {} });
  });
  await card.locator(".care-result-note").fill("Keep this care observation");
  page.once("dialog", (dialog) => dialog.dismiss());
  await card.locator(".care-result-cancel").click();
  await expect(card.locator(".care-result-note")).toHaveValue("Keep this care observation");
  await page.evaluate(() => { window.formFixture.failNext = true; });
  await card.locator(".care-result-save").click();
  await expect(card.locator(".care-result-error")).toContainText("Temporary save failure");
  await expect(card.locator(".care-result-note")).toHaveValue("Keep this care observation");
  await card.locator(".care-result-save").click();
  await expect(card.locator(".care-result-overlay")).toHaveCount(0);
  await expect(card.locator(".care-save-feedback")).toContainText("Daily care saved for Bob (Blue)");
  await card.locator(".care-save-feedback button").click();
  await expect(page.locator("puppy-tracker-record-editor #record-note")).toHaveValue("Keep this care observation");
});
