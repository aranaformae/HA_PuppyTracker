import { expect, test } from "@playwright/test";

async function mount(page, mobile = false, scope = "puppy", language = "en") {
  await page.goto("/tests/e2e/cards.html?production", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__puppyTrackerReady);
  await page.evaluate(({ mobile, scope, language }) => {
    // Match HA's block component so card container queries work in this fixture.
    if (!customElements.get("ha-card")) customElements.define("ha-card", class extends HTMLElement {
      connectedCallback() { this.style.display = "block"; }
    });
    for (const [key, value] of Object.entries({
      "--primary-color": "#039be5", "--text-primary-color": "#ffffff", "--primary-text-color": "#212121",
      "--secondary-text-color": "#666666", "--card-background-color": "#ffffff",
      "--secondary-background-color": "#f4f4f4", "--divider-color": "#dddddd", "--error-color": "#b71c1c",
    })) document.documentElement.style.setProperty(key, value);
    const copy = (value) => structuredClone(value);
    const due = new Date(Date.now() - 600000).toISOString();
    const owners = { puppy: "p2", mother: "m1", litter: "l1" };
    const reminders = Object.entries(owners).flatMap(([owner_scope, owner_id]) => ["a", "b"].map((suffix) => ({
      id: `${owner_scope}-${suffix}`, litter_id: "l1", owner_scope, owner_id,
      record_type: "feeding", enabled: true, owner_available: true, updated_at: "v1", next_due_at: due,
      title: suffix === "a" ? "Bottle feeding" : "Extra feeding", match_title: "Actual feeding",
    })));
    const base = reminders[0];
    reminders.push(
      { ...base, id: "other-puppy", owner_id: "p1" },
      { ...base, id: "other-litter", litter_id: "l2" },
      { ...base, id: "other-type", record_type: "medication" },
      { ...base, id: "disabled", enabled: false },
      { ...base, id: "completed", next_due_at: null },
      { ...base, id: "unlinked-owner", owner_available: false },
    );
    const state = window.quickReminderFixture = { calls: [], records: [], reminders, subscriptions: [] };
    const hass = {
      language, locale: { language }, config: { time_zone: "Europe/Amsterdam" }, states: {}, user: { is_admin: true },
      connection: { subscribeMessage: async (callback) => { state.subscriptions.push(callback); return async () => {}; } },
      callWS: async (message) => {
        state.calls.push(copy(message));
        if (message.type === "puppy_tracker/litters") return { litters: [{ id: "l1", name: "Test litter", active: true }, { id: "l2", name: "Other litter", active: true }] };
        if (message.type === "puppy_tracker/data") return { can_manage_records: true,
          litter: { id: message.litter_id, name: "Test litter", mother: "Luna", mother_id: "m1", active: true },
          puppies: [{ id: "p1", name: "Alice", collar_color: "Red", active: true },
            ...(!state.removedPuppy ? [{ id: "p2", name: "Bob", collar_color: "Blue", active: true }] : [])] };
        if (message.type === "puppy_tracker/recurring_reminders") {
          if (state.failLoad) throw new Error("Offline");
          return { reminders: copy(reminders) };
        }
        const addRecord = (ownerScope, puppyId, data) => {
          const saved = { id: `record-${state.records.length + 1}`, litter_id: message.litter_id || "l1", scope: ownerScope,
            puppy_id: puppyId || null, type: message.record_type || "feeding", title: message.title, note: message.note,
            occurred_at: message.occurred_at, updated_at: `record-v${state.records.length + 1}`, data: copy(data) };
          state.records.push(saved);
          return saved;
        };
        if (["puppy_tracker/record/add", "puppy_tracker/mother/record/add"].includes(message.type)) {
          const ownerScope = message.type.includes("/mother/") ? "mother" : message.puppy_id ? "puppy" : "litter";
          const saved = addRecord(ownerScope, message.puppy_id, message.data);
          return { record: copy(saved) };
        }
        if (message.type === "puppy_tracker/recurring_reminder/record") {
          if (state.pause) await new Promise((resolve) => { state.resume = resolve; });
          if (state.failSave) throw new Error("Temporary failure");
          const reminder = reminders.find((item) => item.id === message.reminder_id);
          const context = message.expected_context;
          if (context.litter_id !== reminder.litter_id || context.owner_scope !== reminder.owner_scope
            || context.record_type !== reminder.record_type || context.puppy_id !== (reminder.owner_scope === "puppy" ? reminder.owner_id : null)) {
            throw { code: "invalid_reminder", message: "Owner or category has changed" };
          }
          const existing = state.records.find((r) => !r.deleted && r.data.recurring_reminder_id === reminder.id && r.data.recurring_due_at === message.due_at);
          if (existing) return { record: copy(existing), already_completed: true };
          if (reminder.updated_at !== message.expected_updated_at || reminder.next_due_at !== message.due_at || !reminder.enabled) {
            throw { code: "invalid_reminder", message: "Scheduled moment has changed" };
          }
          const saved = addRecord(reminder.owner_scope, reminder.owner_scope === "puppy" ? reminder.owner_id : null,
            { ...message.data, recurring_reminder_id: reminder.id, recurring_due_at: message.due_at });
          reminder.updated_at = "v2";
          reminder.next_due_at = new Date(Date.now() + 3600000).toISOString();
          if (state.loseResponse) { state.loseResponse = false; throw new Error("Response lost"); }
          return { record: copy(saved), already_completed: false };
        }
        if (message.type === "puppy_tracker/recurring_reminder/undo") {
          const record = state.records.find((r) => r.id === message.record_id);
          record.deleted = true;
          const reminder = reminders.find((r) => r.id === message.reminder_id);
          reminder.next_due_at = record.data.recurring_due_at;
          reminder.updated_at = "v3";
          return { ok: true };
        }
        if (message.type.endsWith("/records")) return { can_manage_records: true, records: copy(state.records.filter((r) => !r.deleted)), owner: { id: "m1", name: "Luna" } };
        if (message.type.endsWith("/record/update")) {
          const saved = state.records.find((r) => r.id === message.record_id);
          Object.assign(saved, { note: message.note, data: copy(message.data), updated_at: "corrected" });
          return { ok: true };
        }
        throw new Error(`Unexpected call ${message.type}`);
      },
    };
    const card = document.createElement(mobile ? "puppy-tracker-workspace-card" : "puppy-tracker-quick-log-card");
    card.setConfig({ litter_id: "l1", preset: "mobile", default_tab: "quickLog", show_summary: false,
      default_selected: scope, puppy_id: scope === "puppy" ? "p2" : undefined });
    document.querySelector("#cards").append(card);
    card.hass = hass;
  }, { mobile, scope, language });
  const card = page.locator(mobile ? "puppy-tracker-workspace-card puppy-tracker-quick-log-card" : "puppy-tracker-quick-log-card");
  await card.locator('[data-preset="feeding"]').click();
  return card;
}

for (const mobile of [false, true]) {
  for (const scope of ["puppy", "mother", "litter"]) {
    test(`${mobile ? "Mobile" : "Quick Log"} explicitly completes only the chosen ${scope} reminder @cross-browser @tablet`, async ({ page }, testInfo) => {
      const card = await mount(page, mobile, scope);
      const choice = card.locator("#quick-reminder");
      await expect(choice).toHaveValue("");
      expect(await choice.locator("option").evaluateAll((options) => options.map((item) => item.value))).toEqual(["", `${scope}-a`, `${scope}-b`]);
      await expect(choice.locator(`option[value="${scope}-a"]`)).toContainText("Overdue");
      await card.locator("#quick-data-amount").fill("30");
      await card.locator("#quick-save").click();
      await expect(card.locator("#quick-save")).toHaveCount(0);
      const plain = await page.evaluate(() => window.quickReminderFixture.records[0]);
      expect(plain).toMatchObject({ scope, data: { amount: "30", recurring_completion: "none" } });
      await card.locator('[data-preset="feeding"]').click();
      await expect(choice).toHaveValue("");
      await choice.selectOption(`${scope}-a`);
      await card.locator("#quick-data-amount").fill("45");
      await card.locator("#quick-note").fill("Checked the intended reminder");
      expect(await card.evaluate((element) => element.shadowRoot.querySelector("ha-card").scrollWidth <= element.shadowRoot.querySelector("ha-card").clientWidth + 1)).toBe(true);
      if (scope === "puppy") await card.screenshot({ path: testInfo.outputPath("quick-reminder-choice.png") });
      await card.locator("#quick-save").click();
      await expect(card.locator("#quick-save")).toHaveCount(0);
      await expect(card.locator(".recurring-save-feedback")).toContainText('Reminder "Bottle feeding" completed');
      await expect(card.locator(".recurring-save-feedback")).toContainText(scope === "puppy" ? "Bob (Blue)" : scope === "mother" ? "Luna" : "Test litter");
      const result = await page.evaluate(() => ({ records: window.quickReminderFixture.records, reminders: window.quickReminderFixture.reminders, calls: window.quickReminderFixture.calls }));
      expect(result.records).toHaveLength(2);
      expect(result.records[1]).toMatchObject({ scope, data: { amount: "45", recurring_reminder_id: `${scope}-a` } });
      expect(result.reminders.find((r) => r.id === `${scope}-b`).updated_at).toBe("v1");
      expect(result.calls.find((call) => call.type.endsWith("recurring_reminder/record")).expected_context).toEqual({
        litter_id: "l1", owner_scope: scope, puppy_id: scope === "puppy" ? "p2" : null, record_type: "feeding",
      });
      await expect(card.getByRole("button", { name: "Undo execution", exact: true })).toBeVisible();
      await card.locator(".recurring-save-feedback").getByRole("button", { name: "Edit", exact: true }).click();
      const editor = page.locator("puppy-tracker-record-editor");
      await expect(editor.locator("#record-note")).toHaveValue("Checked the intended reminder");
      await editor.locator("#record-note").fill("Corrected execution");
      await editor.locator("#record-save").click();
      await expect(editor).toHaveCount(0);
      await expect(card.getByRole("button", { name: "Undo execution", exact: true })).toHaveCount(0);
      expect(await page.evaluate(() => window.quickReminderFixture.records[1].data.recurring_reminder_id)).toBe(`${scope}-a`);
    });
  }
}

test("changing owner or category drops only the reminder choice and background updates preserve the draft @cross-browser @tablet", async ({ page }) => {
  const card = await mount(page);
  await card.locator("#quick-reminder").selectOption("puppy-a");
  await card.locator("#quick-note").fill("Keep this observation");
  await card.locator("#quick-data-amount").fill("30");
  const when = await card.locator("#quick-occurred").inputValue();
  await card.locator("#quick-note").evaluate((input) => { window.originalQuickInput = input; });
  await page.evaluate(() => window.quickReminderFixture.subscriptions[0]({ reason: "updated" }));
  expect(await card.locator("#quick-note").evaluate((input) => input === window.originalQuickInput)).toBe(true);
  await card.locator("#owner-select").selectOption("__mother__");
  await expect(card.locator("#quick-reminder")).toHaveValue("");
  await expect(card.locator("#quick-note")).toHaveValue("Keep this observation");
  await expect(card.locator("#quick-data-amount")).toHaveValue("30");
  await expect(card.locator("#quick-occurred")).toHaveValue(when);
  await card.locator("#quick-reminder").selectOption("mother-a");
  await card.locator('[data-preset="medication"]').click();
  await expect(card.locator("#quick-reminder")).toHaveValue("");
  await card.locator('[data-preset="feeding"]').click();
  await expect(card.locator("#quick-data-amount")).toHaveValue("30");
  await expect(card.locator("#quick-reminder")).toHaveValue("");
  await card.locator("#quick-save").click();
  await expect(card.locator("#quick-save")).toHaveCount(0);
  expect(await page.evaluate(() => window.quickReminderFixture.records[0])).toMatchObject({ scope: "mother", data: { recurring_completion: "none" } });
});

test("failed and busy reminder saves retain input without falling back to an ordinary log @cross-browser @tablet", async ({ page }) => {
  const card = await mount(page, true);
  await card.locator("#quick-reminder").selectOption("puppy-a");
  await card.locator("#quick-note").fill("Keep after failure");
  await page.evaluate(() => { window.quickReminderFixture.pause = true; window.quickReminderFixture.failSave = true; });
  await card.locator("#quick-save").click();
  await expect(card.locator("#quick-reminder")).toBeDisabled();
  await expect(card.locator("#owner-select")).toBeDisabled();
  await expect(card.locator("#quick-reminders-refresh")).toBeDisabled();
  await page.locator("puppy-tracker-workspace-card").evaluate((element) => element._selectTab("today"));
  await expect(card).toBeVisible();
  await page.evaluate(() => window.quickReminderFixture.resume());
  await expect(card.locator(".error")).toContainText("Temporary failure");
  await expect(card.locator("#quick-note")).toHaveValue("Keep after failure");
  await expect(card.locator("#quick-reminder")).toHaveValue("puppy-a");
  expect(await page.evaluate(() => window.quickReminderFixture.records)).toHaveLength(0);
  await page.evaluate(() => { window.quickReminderFixture.pause = false; window.quickReminderFixture.failSave = false; });
  await card.locator("#quick-save").click();
  await expect(card.locator("#quick-save")).toHaveCount(0);
  expect(await page.evaluate(() => window.quickReminderFixture.records)).toHaveLength(1);
});

test("refresh never changes a retry to the next scheduled slot after a lost response @cross-browser @tablet", async ({ page }) => {
  const card = await mount(page);
  await card.locator("#quick-reminder").selectOption("puppy-a");
  await card.locator("#quick-note").fill("One actual execution");
  await page.evaluate(() => { window.quickReminderFixture.loseResponse = true; });
  await card.locator("#quick-save").click();
  await expect(card.locator(".error")).toHaveText("Response lost");
  await card.locator("#quick-reminders-refresh").click();
  await expect(card.locator("#quick-reminder")).toHaveValue("__previous__");
  await card.locator("#quick-save").click();
  await expect(card.locator(".recurring-save-feedback")).toContainText("already saved");
  expect(await page.evaluate(() => window.quickReminderFixture.records)).toHaveLength(1);
  const calls = await page.evaluate(() => window.quickReminderFixture.calls.filter((call) => call.type.endsWith("recurring_reminder/record")));
  expect(calls).toHaveLength(2);
  expect(calls[1].due_at).toBe(calls[0].due_at);
  expect(calls[1].expected_updated_at).toBe(calls[0].expected_updated_at);
  await expect(card.getByRole("button", { name: "Undo execution", exact: true })).toHaveCount(0);
});

test("stale choices show a translated error and never silently reassign a log @cross-browser @tablet", async ({ page }) => {
  const card = await mount(page, false, "puppy", "nl");
  await expect(card.locator("#quick-reminder")).toHaveValue("");
  await expect(card.getByText("Herinnering afhandelen", { exact: true })).toBeVisible();
  await card.locator("#quick-reminder").selectOption("puppy-a");
  await card.locator("#quick-note").fill("Bewaren bij fout");
  await page.evaluate(() => { window.quickReminderFixture.reminders.find((r) => r.id === "puppy-a").owner_id = "p1"; });
  await card.locator("#quick-save").click();
  await expect(card.locator(".error")).toContainText("Je invoer is bewaard");
  expect(await page.evaluate(() => window.quickReminderFixture.records)).toHaveLength(0);
  await card.locator("#quick-reminders-refresh").click();
  await expect(card.locator("#quick-reminder")).toHaveValue("__previous__");
  await card.locator("#quick-reminder").selectOption("");
  await card.locator("#quick-save").click();
  await expect(card.locator("#quick-save")).toHaveCount(0);
  expect(await page.evaluate(() => window.quickReminderFixture.records[0])).toMatchObject({ puppy_id: "p2", data: { recurring_completion: "none" } });
});

test("reminder loading failures do not prevent log-only saving and a lone candidate is never preselected @cross-browser @tablet", async ({ page }) => {
  const card = await mount(page);
  await page.evaluate(() => { window.quickReminderFixture.failLoad = true; });
  await card.locator("#quick-reminders-refresh").click();
  await expect(card.locator(".reminder-load-error")).toBeVisible();
  await card.locator("#quick-note").fill("No automatic completion while offline");
  await card.locator("#quick-save").click();
  await expect(card.locator("#quick-save")).toHaveCount(0);
  await page.evaluate(() => {
    const state = window.quickReminderFixture;
    state.failLoad = false;
    state.reminders.find((r) => r.id === "puppy-b").enabled = false;
  });
  await card.locator('[data-preset="feeding"]').click();
  await card.locator("#quick-reminders-refresh").click();
  await expect(card.locator(".reminder-load-error")).toHaveCount(0);
  await expect(card.locator("#quick-reminder option")).toHaveCount(2);
  await expect(card.locator("#quick-reminder")).toHaveValue("");
  await card.evaluate((element) => { element._hass.user.is_admin = false; element._render(); });
  await expect(card.locator("#quick-reminder")).toBeDisabled();
});

test("undoing a saved execution keeps a newly opened Quick Log draft intact @cross-browser @tablet", async ({ page }) => {
  const card = await mount(page, true);
  await card.locator("#quick-reminder").selectOption("puppy-a");
  await card.locator("#quick-note").fill("First execution");
  await card.locator("#quick-save").click();
  await expect(card.locator("#quick-save")).toHaveCount(0);
  await card.locator('[data-preset="feeding"]').click();
  await card.locator("#quick-note").fill("Next observation must survive");
  page.once("dialog", (dialog) => dialog.accept());
  await card.getByRole("button", { name: "Undo execution", exact: true }).click();
  await expect(card.locator(".recurring-save-feedback")).toContainText("Execution undone");
  await expect(card.locator("#quick-note")).toHaveValue("Next observation must survive");
  await expect(card.locator("#quick-reminder")).toHaveValue("");
  await expect(card.locator("#quick-save")).toBeEnabled();
  expect(await page.evaluate(() => window.quickReminderFixture.records[0].deleted)).toBe(true);
});

test("a draft for a removed puppy never falls back to the litter owner @cross-browser @tablet", async ({ page }) => {
  const card = await mount(page);
  await card.locator("#quick-note").fill("Keep with the intended owner");
  await page.evaluate(() => { window.quickReminderFixture.removedPuppy = true; });
  await card.evaluate(async (element) => element._queueRefresh(true));
  await expect(card.locator("#owner-select")).toHaveValue("p2");
  await card.locator("#quick-save").click();
  await expect(card.locator(".error")).toContainText("owner is no longer available");
  expect(await page.evaluate(() => window.quickReminderFixture.records)).toHaveLength(0);
  await card.locator("#owner-select").selectOption("__mother__");
  await expect(card.locator("#quick-note")).toHaveValue("Keep with the intended owner");
  await card.locator("#quick-save").click();
  await expect(card.locator("#quick-save")).toHaveCount(0);
  expect(await page.evaluate(() => window.quickReminderFixture.records[0].scope)).toBe("mother");
});
