import { expect, test } from "@playwright/test";

async function mount(page, surface = "attention", scope = "puppy", type = "medication", language = "en") {
  await page.goto("/tests/e2e/cards.html?production");
  await page.waitForFunction(() => window.__puppyTrackerReady);
  await page.evaluate(({ surface, scope, type, language }) => {
    const copy = (value) => structuredClone(value);
    const original = { id: "old-record", scope, type, litter_id: "l1", puppy_id: scope === "puppy" ? "p2" : null,
      occurred_at: "2026-09-01T12:00:00Z", note: "Previous execution must not change", title: "Previous execution", data: { medication: "Old product", dose: "Old dose" } };
    const records = [original];
    const due = new Date(Date.now() - 600000).toISOString();
    const reminder = { id: "r1", litter_id: "l1", owner_scope: scope, owner_id: scope === "puppy" ? "p2" : scope === "mother" ? "m1" : "l1",
      owner_name: scope === "puppy" ? "Bob" : scope === "mother" ? "Luna" : "Test litter", title: "Scheduled care", match_title: "Exact log title",
      record_type: type, schedule_mode: "interval", interval_minutes: 60, enabled: true, updated_at: "v1", next_due_at: due, status: "overdue", minutes_until_due: -10 };
    const state = window.recurringFixture = { records, reminder, calls: [], fail: false, pause: false, subscriptions: [] };
    const hass = {
      language, locale: { language }, user: { is_admin: true }, states: {}, config: { time_zone: "UTC" },
      connection: { subscribeMessage: async (callback) => { state.subscriptions.push(callback); return async () => {}; } },
      callWS: async (message) => {
        state.calls.push(copy(message));
        if (message.type === "puppy_tracker/litters") return { litters: [{ id: "l1", name: "Test litter", active: true }] };
        if (message.type === "puppy_tracker/data") return { can_manage_records: true,
          litter: { id: "l1", name: "Test litter", mother: "Luna", mother_id: "m1", active: true, records: copy(records.filter((r) => r.scope === "litter")), summary: { dossier_actions: { actions: [] } } },
          puppies: [{ id: "p1", name: "Alice", collar_color: "Red", active: true, records: [], summary: { dossier_actions: { actions: [] } } },
            { id: "p2", name: "Bob", collar_color: "Blue", active: true, records: copy(records.filter((r) => r.scope === "puppy")), summary: { dossier_actions: { actions: [] } } }] };
        if (message.type === "puppy_tracker/recurring_reminders") return { reminders: [copy(reminder)] };
        if (message.type.endsWith("/records")) return { can_manage_records: true, owner: { id: "m1", name: "Luna" }, records: copy(records), actions: { actions: [] } };
        if (message.type === "puppy_tracker/mother/attention") return { dossier_actions: { actions: [] } };
        if (message.type === "puppy_tracker/care_occurrences") return { occurrences: [], skipped: [] };
        if (message.type === "puppy_tracker/attention_acknowledgements") return { acknowledgements: state.ack ? { [`recurring:r1:${due}`]: {} } : {} };
        if (message.type === "puppy_tracker/attention_acknowledgement/set") { state.ack = true; return { ok: true }; }
        if (message.type === "puppy_tracker/recurring_reminder/record") {
          if (state.pause) await new Promise((resolve) => { state.resume = resolve; });
          if (state.fail) throw new Error("Temporary failure");
          if (message.expected_updated_at !== reminder.updated_at) throw new Error("This reminder has changed");
          const saved = { id: "new-record", litter_id: "l1", scope, puppy_id: scope === "puppy" ? "p2" : null, type,
            title: message.title, occurred_at: message.occurred_at, note: message.note,
            data: { ...copy(message.data), recurring_reminder_id: reminder.id, recurring_due_at: reminder.next_due_at } };
          records.push(saved);
          reminder.updated_at = "v2";
          reminder.next_due_at = new Date(Date.now() + 3600000).toISOString();
          reminder.status = "upcoming";
          return { record: copy(saved), record_id: saved.id };
        }
        if (message.type.endsWith("/record/update")) return { ok: true };
        throw new Error(`Unexpected call ${message.type}`);
      },
    };
    const card = document.createElement(surface === "mobile" ? "puppy-tracker-workspace-card" : `puppy-tracker-${surface === "reminders" ? "recurring-reminder" : surface}-card`);
    card.setConfig({ litter_id: "l1", preset: "mobile", default_tab: "today", show_summary: false });
    document.querySelector("#cards").append(card);
    card.hass = hass;
  }, { surface, scope, type, language });
  const card = page.locator(surface === "mobile" ? "puppy-tracker-workspace-card puppy-tracker-today-card" : `puppy-tracker-${surface === "reminders" ? "recurring-reminder" : surface}-card`);
  await expect(card.locator('[data-complete-reminder="r1"]')).toBeVisible();
  return card;
}

for (const surface of ["attention", "today", "reminders", "mobile"]) {
  for (const scope of ["puppy", "mother", "litter"]) {
    test(`${surface} executes ${scope} reminder without changing history @cross-browser @tablet`, async ({ page }, testInfo) => {
      const type = scope === "mother" ? "temperature" : scope === "litter" ? "feeding" : "medication";
      const card = await mount(page, surface, scope, type);
      if (surface === "reminders" && scope === "puppy") {
        expect(await card.locator(".item").evaluate((row) => row.querySelector(".item-actions").getBoundingClientRect().right <= row.getBoundingClientRect().right + 1)).toBe(true);
        await card.locator(".list").screenshot({ path: testInfo.outputPath("recurring-actions.png") });
      }
      await card.locator('[data-complete-reminder="r1"]').click();
      const editor = page.locator("puppy-tracker-record-editor");
      await expect(editor.getByRole("heading")).toHaveText("Record completion");
      await expect(editor.locator(".owner")).toContainText(scope === "puppy" ? "Bob (Blue)" : scope === "mother" ? "Luna" : "Test litter");
      await expect(editor.locator("#record-type")).toBeDisabled();
      await expect(editor.locator("#record-type")).toHaveValue(type);
      await expect(editor.locator("#record-title")).toHaveValue("Exact log title");
      await expect(editor.locator("#record-note")).toHaveValue("");
      if (type === "temperature") await editor.locator("#record-data-temperature_c").fill("38.4");
      if (type === "medication") {
        await expect(editor.locator("#record-data-dose")).toHaveValue("");
        await editor.locator("#record-data-medication").fill("Actual product");
        await editor.locator("#record-data-dose").fill("1 ml");
      }
      if (type === "feeding") await editor.locator("#record-data-feeding_type").fill("Bottle");
      await editor.locator("#record-note").fill("New observation");
      if (surface === "reminders" && scope === "puppy") {
        expect(await editor.locator("dialog").evaluate((dialog) => dialog.scrollWidth <= dialog.clientWidth + 1)).toBe(true);
        await editor.locator("dialog").screenshot({ path: testInfo.outputPath("recurring-execution.png") });
      }
      await editor.locator("#record-save").click();
      await expect(editor).toHaveCount(0);
      await expect(card.locator(".recurring-save-feedback")).toContainText("saved for");
      const result = await page.evaluate(() => ({ records: window.recurringFixture.records, writes: window.recurringFixture.calls.filter((call) => call.type === "puppy_tracker/recurring_reminder/record") }));
      expect(result.records).toHaveLength(2);
      expect(result.records[0]).toMatchObject({ id: "old-record", note: "Previous execution must not change", data: { dose: "Old dose" } });
      expect(result.records[1]).toMatchObject({ scope, type, note: "New observation" });
      expect(result.writes).toHaveLength(1);
      expect(result.writes[0]).toMatchObject({ reminder_id: "r1", expected_updated_at: "v1" });
      expect(result.writes[0]).not.toHaveProperty("owner_id");
      await card.locator(".recurring-save-feedback button").click();
      await expect(editor.locator("#record-note")).toHaveValue("New observation");
    });
  }
}

test("seen does not execute, while cancelled, invalid, busy and failed executions preserve the draft @cross-browser @tablet", async ({ page }) => {
  const card = await mount(page, "attention", "mother", "temperature");
  await card.getByRole("button", { name: "Mark as seen", exact: true }).click();
  expect(await page.evaluate(() => window.recurringFixture.records)).toHaveLength(1);
  await card.locator(".attention-acknowledged summary").click();
  await card.locator('[data-complete-reminder="r1"]').click();
  const editor = page.locator("puppy-tracker-record-editor");
  await editor.locator("#record-cancel").click();
  await expect(editor).toHaveCount(0);
  await card.locator('[data-complete-reminder="r1"]').click();
  await editor.locator("#record-save").click();
  await expect(editor.locator("#record-data-temperature_c")).toHaveAttribute("aria-invalid", "true");
  await editor.locator("#record-data-temperature_c").fill("38.5");
  await page.evaluate(() => { window.recurringFixture.fail = true; });
  await editor.locator("#record-save").click();
  await expect(editor.locator(".error")).toContainText("Temporary failure");
  await expect(editor.locator("#record-data-temperature_c")).toHaveValue("38.5");
  page.once("dialog", (dialog) => dialog.dismiss());
  await editor.locator("#record-cancel").click();
  await expect(editor.locator("dialog")).toBeVisible();
  await page.evaluate(() => { window.recurringFixture.fail = false; window.recurringFixture.pause = true; });
  await editor.locator("#record-save").click();
  await expect(editor.locator("#record-save")).toBeDisabled();
  await expect(editor.locator("#record-data-temperature_c")).toBeDisabled();
  await page.evaluate(() => window.recurringFixture.resume());
  await expect(editor).toHaveCount(0);
  expect(await page.evaluate(() => window.recurringFixture.records)).toHaveLength(2);
});

test("Today reminder categories, today-only filtering and write permissions are respected @cross-browser @tablet", async ({ page }) => {
  const card = await mount(page, "today");
  await card.locator('[data-today-filter-type="__all__"]').click();
  await expect(card.locator(".today-reminder-row")).toBeHidden();
  await card.locator('[data-today-filter-type="medication"]').click();
  await expect(card.locator(".today-reminder-row")).toBeVisible();
  await card.evaluate((element) => {
    element._config.show_today_only = true;
    element._recurringReminders[0].next_due_at = new Date(Date.now() + 86400000).toISOString();
    element._render();
  });
  await expect(card.locator(".today-reminder-row")).toHaveCount(0);
  await card.evaluate((element) => { element._config.show_today_only = false; element._hass.user.is_admin = false; element._render(); });
  await expect(card.locator(".today-reminder-row")).toBeVisible();
  await expect(card.locator("[data-complete-reminder]")).toHaveCount(0);
});

test("Dutch reminder execution uses translated actions and retains a stale-definition draft @cross-browser @tablet", async ({ page }) => {
  const card = await mount(page, "reminders", "puppy", "medication", "nl");
  await card.getByRole("button", { name: "Uitgevoerd registreren", exact: true }).click();
  const editor = page.locator("puppy-tracker-record-editor");
  await expect(editor.getByRole("heading")).toHaveText("Uitgevoerd registreren");
  await editor.locator("#record-note").fill("Bewaren bij een fout");
  await page.evaluate(() => { window.recurringFixture.reminder.updated_at = "changed"; });
  await editor.getByRole("button", { name: "Uitvoering opslaan", exact: true }).click();
  await expect(editor.locator(".error")).toContainText("This reminder has changed");
  await expect(editor.locator("#record-note")).toHaveValue("Bewaren bij een fout");
  expect(await page.evaluate(() => window.recurringFixture.records)).toHaveLength(1);
});
