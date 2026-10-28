import { expect, test } from "@playwright/test";

async function mount(page, surface = "attention", scope = "puppy", type = "medication", language = "en") {
  await page.goto("/tests/e2e/cards.html?production", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__puppyTrackerReady);
  await page.evaluate(({ surface, scope, type, language }) => {
    if (!customElements.get("ha-card")) customElements.define("ha-card", class extends HTMLElement {
      connectedCallback() { this.style.display = "block"; }
    });
    for (const [key, value] of Object.entries({
      "--primary-color": "#039be5", "--text-primary-color": "#ffffff", "--primary-text-color": "#212121",
      "--secondary-text-color": "#666666", "--card-background-color": "#ffffff",
      "--secondary-background-color": "#f4f4f4", "--divider-color": "#dddddd", "--error-color": "#b71c1c",
    })) document.documentElement.style.setProperty(key, value);
    const copy = (value) => structuredClone(value);
    const original = { id: "old-record", scope, type, litter_id: "l1", puppy_id: scope === "puppy" ? "p2" : null,
      occurred_at: "2026-09-01T12:00:00Z", updated_at: "old-v1", note: "Previous execution must not change", title: "Previous execution", data: { medication: "Old product", dose: "Old dose", recurring_reminder_id: "r1", recurring_due_at: "2026-09-01T11:50:00Z" } };
    const records = [original];
    const due = new Date(Date.now() - 600000).toISOString();
    const reminder = { id: "r1", litter_id: "l1", owner_scope: scope, owner_id: scope === "puppy" ? "p2" : scope === "mother" ? "m1" : "l1",
      owner_name: scope === "puppy" ? "Bob" : scope === "mother" ? "Luna" : "Test litter", title: "Scheduled care", match_title: "Exact log title",
      record_type: type, schedule_mode: "interval", interval_minutes: 60, enabled: true, updated_at: "v1", next_due_at: due, status: "overdue", minutes_until_due: -10, last_execution: copy(original) };
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
        if (message.type.endsWith("/records")) return { can_manage_records: true, owner: { id: "m1", name: "Luna" }, records: copy(records.filter((r) => !r.deleted)), actions: { actions: [] } };
        if (message.type === "puppy_tracker/mother/attention") return { dossier_actions: { actions: [] } };
        if (message.type === "puppy_tracker/care_occurrences") return { occurrences: [], skipped: [] };
        if (message.type === "puppy_tracker/attention_acknowledgements") return { acknowledgements: state.ack ? { [`recurring:r1:${due}`]: {} } : {} };
        if (message.type === "puppy_tracker/attention_acknowledgement/set") { state.ack = true; return { ok: true }; }
        if (message.type === "puppy_tracker/recurring_reminder/postpone") {
          if (state.pausePostpone) await new Promise((resolve) => { state.resumePostpone = resolve; });
          if (state.failPostpone) throw new Error("Temporary failure");
          if (message.expected_updated_at !== reminder.updated_at || message.due_at !== reminder.next_due_at) throw { code: "invalid_postponement", message: "Changed" };
          reminder.scheduled_due_at ||= reminder.next_due_at;
          reminder.next_due_at = message.until || reminder.scheduled_due_at;
          reminder.postponed = Boolean(message.until);
          reminder.status = message.until ? "postponed" : "overdue";
          reminder.updated_at += "-changed";
          return { ok: true };
        }
        if (message.type === "puppy_tracker/recurring_reminder/record") {
          if (state.pause) await new Promise((resolve) => { state.resume = resolve; });
          if (state.fail) throw new Error("Temporary failure");
          if (message.expected_updated_at !== reminder.updated_at) throw new Error("This reminder has changed");
          const saved = { id: "new-record", litter_id: "l1", scope, puppy_id: scope === "puppy" ? "p2" : null, type,
            title: message.title, occurred_at: message.occurred_at, updated_at: "record-v1", note: message.note,
            data: { ...copy(message.data), recurring_reminder_id: reminder.id, recurring_due_at: reminder.next_due_at } };
          records.push(saved);
          reminder.updated_at = "v2";
          reminder.next_due_at = new Date(Date.now() + 3600000).toISOString();
          reminder.status = "upcoming";
          reminder.last_execution = copy(saved);
          return { record: copy(saved), record_id: saved.id, already_completed: Boolean(state.alreadyCompleted) };
        }
        if (message.type === "puppy_tracker/recurring_reminder/undo") {
          if (state.pauseUndo) await new Promise((resolve) => { state.resumeUndo = resolve; });
          if (state.failUndo) throw new Error("Undo failed");
          const saved = records.find((r) => r.id === message.record_id);
          if (state.staleUndo || saved.updated_at !== message.expected_record_updated_at) throw { code: "stale_execution", message: "Stale" };
          saved.deleted = true;
          reminder.last_execution = copy(original);
          reminder.next_due_at = due;
          reminder.status = "overdue";
          return { ok: true };
        }
        if (message.type.endsWith("/record/update")) {
          const saved = records.find((r) => r.id === message.record_id);
          Object.assign(saved, { title: message.title, note: message.note, occurred_at: message.occurred_at,
            data: copy(message.data), type: message.record_type, updated_at: "record-v2" });
          reminder.last_execution = copy(saved);
          return { ok: true };
        }
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
      await card.locator(".recurring-save-feedback").getByRole("button", { name: "Edit", exact: true }).click();
      await expect(editor.locator("#record-note")).toHaveValue("New observation");
    });
  }
}

test("seen does not execute, while cancelled, invalid, busy and failed executions preserve the draft @cross-browser @tablet", async ({ page }) => {
  const card = await mount(page, "attention", "mother", "temperature");
  await card.getByRole("button", { name: "Mark as seen", exact: true }).click();
  expect(await page.evaluate(() => window.recurringFixture.records)).toHaveLength(1);
  await card.locator(".attention-acknowledged > summary").click();
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

for (const surface of ["attention", "today", "reminders", "mobile"]) {
  test(`${surface} last execution expands without navigating and edits only that record @cross-browser @tablet`, async ({ page }, testInfo) => {
    const card = await mount(page, surface);
    const details = card.locator('[data-last-execution="r1"]');
    await expect(details).not.toHaveAttribute("open", "");
    await details.locator("summary").click();
    await expect(details).toHaveAttribute("open", "");
    await expect(details).toContainText("Previous execution must not change");
    await expect(details).toContainText("Old product");
    await expect(details).toContainText("Scheduled");
    await expect(details).not.toContainText("recurring_reminder_id");
    await card.evaluate((element) => element._render());
    await expect(details).toHaveAttribute("open", "");
    expect(await details.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    if (surface === "reminders") await card.locator(".list").screenshot({ path: testInfo.outputPath("last-execution.png") });
    await details.getByRole("button", { name: "Edit log entry", exact: true }).click();
    const editor = page.locator("puppy-tracker-record-editor");
    await expect(editor.locator("#record-note")).toHaveValue("Previous execution must not change");
    await editor.locator("#record-note").fill("Corrected previous entry");
    await editor.locator("#record-save").click();
    await expect(editor).toHaveCount(0);
    const calls = await page.evaluate(() => window.recurringFixture.calls);
    expect(calls.filter((call) => call.type === "puppy_tracker/recurring_reminder/record")).toHaveLength(0);
    expect(calls.find((call) => call.type.endsWith("/record/update"))).toMatchObject({ record_id: "old-record", note: "Corrected previous entry" });
    await card.evaluate((element) => { element._hass.user.is_admin = false; element._render(); });
    await expect(details).toHaveAttribute("open", "");
    await expect(details.getByRole("button")).toHaveCount(0);
  });

  test(`${surface} confirmed undo removes only the just-saved execution @cross-browser @tablet`, async ({ page }) => {
    const card = await mount(page, surface);
    await card.locator('[data-complete-reminder="r1"]').click();
    await page.locator("puppy-tracker-record-editor #record-note").fill("Undo this execution");
    await page.locator("puppy-tracker-record-editor #record-save").click();
    const undo = card.getByRole("button", { name: "Undo execution", exact: true });
    await expect(undo).toBeVisible();
    page.once("dialog", (dialog) => dialog.dismiss());
    await undo.click();
    expect(await page.evaluate(() => window.recurringFixture.calls.filter((call) => call.type.endsWith("/undo")))).toHaveLength(0);
    await page.evaluate(() => { window.recurringFixture.pauseUndo = true; });
    page.once("dialog", (dialog) => dialog.accept());
    await undo.click();
    await expect(undo).toBeDisabled();
    await card.evaluate((element) => element._render());
    await expect(undo).toBeDisabled();
    await page.evaluate(() => window.recurringFixture.resumeUndo());
    await expect(card.locator(".recurring-save-feedback")).toContainText("Execution undone");
    await expect(undo).toHaveCount(0);
    await expect(card.locator('[data-complete-reminder="r1"]')).toBeVisible();
    const records = await page.evaluate(() => window.recurringFixture.records);
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({ note: "Previous execution must not change" });
    expect(records[0].deleted).toBeUndefined();
    expect(records[1]).toMatchObject({ id: "new-record", deleted: true });
  });
}

test("undo failures are retryable, stale execution is translated and duplicate saves never offer undo @cross-browser @tablet", async ({ page }) => {
  const card = await mount(page, "reminders", "puppy", "medication", "nl");
  await card.locator('[data-complete-reminder="r1"]').click();
  await page.locator("puppy-tracker-record-editor #record-save").click();
  const undo = card.getByRole("button", { name: "Uitvoering ongedaan maken", exact: true });
  await expect(undo).toBeVisible();
  await page.evaluate(() => { window.recurringFixture.failUndo = true; });
  page.once("dialog", (dialog) => dialog.accept());
  await undo.click();
  await expect(card.locator(".recurring-undo-error")).toHaveText("Undo failed");
  await expect(undo).toBeEnabled();
  await page.evaluate(() => { window.recurringFixture.failUndo = false; window.recurringFixture.staleUndo = true; });
  page.once("dialog", (dialog) => dialog.accept());
  await undo.click();
  await expect(card.locator(".recurring-undo-error")).toContainText("inmiddels gewijzigd of opgevolgd");
  expect(await page.evaluate(() => window.recurringFixture.records.filter((r) => r.deleted))).toHaveLength(0);
  await page.evaluate(() => { window.recurringFixture.alreadyCompleted = true; });
  await card.locator('[data-complete-reminder="r1"]').click();
  await page.locator("puppy-tracker-record-editor #record-save").click();
  await expect(card.locator(".recurring-save-feedback")).toContainText("was al opgeslagen");
  await expect(undo).toHaveCount(0);
});

test("full notes remain readable and correcting a just-saved execution retires its undo shortcut @cross-browser @tablet", async ({ page }) => {
  const card = await mount(page, "reminders");
  const note = Array.from({ length: 25 }, (_, index) => `Observation ${index + 1}: <b>plain text</b>`).join("\n");
  await card.locator('[data-complete-reminder="r1"]').click();
  const editor = page.locator("puppy-tracker-record-editor");
  await editor.locator("#record-note").fill(note);
  await editor.locator("#record-save").click();
  const undo = card.getByRole("button", { name: "Undo execution", exact: true });
  await expect(undo).toBeVisible();
  const details = card.locator('[data-last-execution="r1"]');
  await details.locator("summary").click();
  const rendered = details.locator(".recurring-execution-note");
  await expect(rendered).toHaveText(note);
  await expect(rendered.locator("b")).toHaveCount(0);
  expect(await rendered.evaluate((node) => node.scrollHeight <= node.clientHeight + 1)).toBe(true);
  await details.getByRole("button", { name: "Edit log entry", exact: true }).click();
  await editor.locator("#record-cancel").click();
  await expect(undo).toBeVisible();
  await details.getByRole("button", { name: "Edit log entry", exact: true }).click();
  await editor.locator("#record-note").fill("Corrected execution");
  await editor.locator("#record-save").click();
  await expect(editor).toHaveCount(0);
  await expect(undo).toHaveCount(0);
  await expect(details.locator(".recurring-execution-note")).toHaveText("Corrected execution");
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
  await expect(card.locator("[data-postpone-reminder]")).toHaveCount(0);
});

test("Dutch reminder execution uses translated actions and retains a stale-definition draft @cross-browser @tablet", async ({ page }) => {
  const card = await mount(page, "reminders", "puppy", "medication", "nl");
  await card.getByRole("button", { name: "Uitvoering registreren", exact: true }).click();
  const editor = page.locator("puppy-tracker-record-editor");
  await expect(editor.getByRole("heading")).toHaveText("Uitvoering registreren");
  await editor.locator("#record-note").fill("Bewaren bij een fout");
  await page.evaluate(() => { window.recurringFixture.reminder.updated_at = "changed"; });
  await editor.getByRole("button", { name: "Uitvoering opslaan", exact: true }).click();
  await expect(editor.locator(".error")).toContainText("This reminder has changed");
  await expect(editor.locator("#record-note")).toHaveValue("Bewaren bij een fout");
  expect(await page.evaluate(() => window.recurringFixture.records)).toHaveLength(1);
});

for (const surface of ["attention", "today", "reminders", "mobile"]) {
  test(`${surface} postpones one moment without logging or changing recurrence @cross-browser @tablet`, async ({ page }, testInfo) => {
    const card = await mount(page, surface);
    const before = await page.evaluate(() => structuredClone(window.recurringFixture.reminder));
    await card.getByRole("button", { name: "Postpone once", exact: true }).click();
    const editor = page.locator("puppy-tracker-record-editor");
    await expect(editor.getByRole("heading")).toHaveText("Postpone once");
    await expect(editor.locator(".owner")).toHaveText("Bob (Blue)");
    await editor.getByRole("button", { name: "+30 min", exact: true }).click();
    const value = await editor.locator("#reminder-until").inputValue();
    await card.evaluate((element) => element._render());
    await expect(editor.locator("#reminder-until")).toHaveValue(value);
    expect(await editor.locator("dialog").evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    if (surface === "mobile") await editor.locator("dialog").screenshot({ path: testInfo.outputPath("postponement-dialog.png") });
    await editor.getByRole("button", { name: "Postpone once", exact: true }).click();
    await expect(editor).toHaveCount(0);
    await expect(card.locator(".recurring-postpone-feedback")).toContainText("postponed until");
    const after = await page.evaluate(() => ({ reminder: window.recurringFixture.reminder, records: window.recurringFixture.records, calls: window.recurringFixture.calls }));
    expect(after.records).toHaveLength(1);
    expect(after.reminder).toMatchObject({ interval_minutes: before.interval_minutes, owner_id: before.owner_id, schedule_mode: before.schedule_mode, postponed: true });
    expect(after.calls.filter((call) => call.type.endsWith("/postpone"))).toHaveLength(1);
    expect(after.calls.filter((call) => call.type.endsWith("/record"))).toHaveLength(0);
    if (surface === "attention") {
      await expect(card.locator("[data-recurring-reminder]")).toHaveCount(0);
    } else {
      await expect(card.locator(surface === "reminders" ? ".item" : ".today-reminder-row")).toContainText("Postponed");
      await card.getByRole("button", { name: "Postpone once", exact: true }).click();
      await expect(editor.locator(".context")).toContainText("Originally");
      await editor.getByRole("button", { name: "Cancel postponement", exact: true }).click();
      await expect(editor).toHaveCount(0);
      await expect(card.locator(".recurring-postpone-feedback")).toContainText("cancelled");
      expect(await page.evaluate(() => window.recurringFixture.reminder.next_due_at)).toBe(before.next_due_at);
    }
  });
}

test("postpone validation, busy saves, cancellation and stale errors keep the chosen time @cross-browser @tablet", async ({ page }) => {
  const card = await mount(page, "reminders", "mother", "temperature", "nl");
  await card.evaluate((element) => {
    element._items[0].postpone_before = new Date(Date.now() + 45 * 60000).toISOString();
    element._render();
  });
  await card.getByRole("button", { name: "Eenmalig uitstellen", exact: true }).click();
  const editor = page.locator("puppy-tracker-record-editor");
  await expect(editor.getByRole("button", { name: "+60 min", exact: true })).toBeDisabled();
  await editor.locator("#reminder-until").fill("2026-01-01T00:00");
  await editor.getByRole("button", { name: "Eenmalig uitstellen", exact: true }).click();
  await expect(editor.locator(".error")).toContainText("na nu");
  await editor.getByRole("button", { name: "+15 min", exact: true }).click();
  const value = await editor.locator("#reminder-until").inputValue();
  page.once("dialog", (dialog) => dialog.dismiss());
  await editor.locator("#record-cancel").click();
  await expect(editor.locator("dialog")).toBeVisible();
  await page.evaluate(() => { window.recurringFixture.failPostpone = true; });
  await editor.getByRole("button", { name: "Eenmalig uitstellen", exact: true }).click();
  await expect(editor.locator(".error")).toHaveText("Temporary failure");
  await expect(editor.locator("#reminder-until")).toHaveValue(value);
  await expect(editor.getByRole("button", { name: "+60 min", exact: true })).toBeDisabled();
  await page.evaluate(() => { window.recurringFixture.failPostpone = false; window.recurringFixture.pausePostpone = true; });
  await editor.getByRole("button", { name: "Eenmalig uitstellen", exact: true }).click();
  await expect(editor.locator("#reminder-until")).toBeDisabled();
  await expect(editor.locator(".close")).toBeDisabled();
  await page.evaluate(() => { window.recurringFixture.reminder.updated_at = "stale"; window.recurringFixture.resumePostpone(); });
  await expect(editor.locator(".error")).toContainText("Dit moment is gewijzigd");
  await expect(editor.locator("#reminder-until")).toHaveValue(value);
  expect(await page.evaluate(() => window.recurringFixture.records)).toHaveLength(1);
});
