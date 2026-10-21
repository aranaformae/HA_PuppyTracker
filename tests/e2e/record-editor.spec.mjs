import { expect, test } from "@playwright/test";

async function mount(page, { surface = "dossier", scope = "puppy", language = "nl", admin = true } = {}) {
  await page.goto("/tests/e2e/cards.html?production");
  await page.waitForFunction(() => window.__puppyTrackerReady === true);
  await page.evaluate(({ surface, scope, language, admin }) => {
    const now = new Date().toISOString();
    const clone = (value) => structuredClone(value);
    const records = ["litter", "mother", "puppy"].map((owner) => ({
      id: `${owner}-record`, litter_id: "l1", puppy_id: owner === "puppy" ? "p1" : null,
      scope: owner, type: "temperature", title: `${owner} temperature`, note: "Original note",
      occurred_at: now, created_at: now, deleted: false,
      data: { temperature_c: 38.4, method: "Rectaal", custom_data: "preserve me" },
    }));
    if (surface === "behavior") Object.assign(records[2], { type: "behavior_observation", data: { scores: { curiosity: 3, calm: 4 }, observer: "Fabien", context: "Rustige kamer", custom_data: "preserve me" } });
    const weight = { id: "w1", weight: 540, timestamp: now, status: "active" };
    const action = (owner) => ({ id: `${owner}-record:next_due_date`, record_id: `${owner}-record`, source_record_id: `${owner}-record`, type: "temperature", record_type: "temperature", due_date: now.slice(0, 10), status: "due_today", due_soon: true, days_until_due: 0, scope: owner });
    const data = () => ({
      can_manage_records: admin, can_manage_measurements: admin,
      litter: { id: "l1", name: "Test litter", mother: "Luna", active: true, records: clone(records.filter((record) => record.scope === "litter")), summary: { dossier_actions: { actions: [action("litter")] } } },
      puppies: [{ id: "p1", name: "Alice", active: true, collar_color: "Red", birth_time: "2026-09-01T10:00:00Z", records: clone(records.filter((record) => record.scope === "puppy")), measurements: [clone(weight)], summary: { latest_measurement_id: "w1", needs_attention: false, dossier_actions: { actions: [action("puppy")] } } }],
    });
    window.__editorCalls = [];
    window.__editorRecords = records;
    const hass = {
      user: { is_admin: admin }, locale: { language }, language, config: { time_zone: "UTC" }, states: {},
      connection: { subscribeMessage: async (callback) => { window.__editorUpdate = callback; return async () => {}; } },
      callWS: async (message) => {
        window.__editorCalls.push(clone(message));
        if (message.type === "puppy_tracker/litters") return { litters: [{ id: "l1", name: "Test litter", active: true }] };
        if (message.type === "puppy_tracker/data") return data();
        if (message.type === "puppy_tracker/records" || message.type === "puppy_tracker/mother/records") {
          const owner = message.type.includes("mother/") ? "mother" : message.puppy_id ? "puppy" : "litter";
          return { can_manage_records: admin, records: clone(records.filter((record) => record.scope === owner && (message.include_deleted || !record.deleted))), actions: { actions: [action(owner)] } };
        }
        if (message.type === "puppy_tracker/mother/attention") return { owner: { name: "Luna" }, dossier_actions: { actions: [action("mother")] } };
        if (message.type === "puppy_tracker/care_occurrences") return { occurrences: [], skipped: [] };
        if (message.type === "puppy_tracker/recurring_reminders") return { reminders: [] };
        if (message.type === "puppy_tracker/attention_acknowledgements") return { acknowledgements: {} };
        if (message.type === "puppy_tracker/measurements") return { measurements: [clone(weight)] };
        if (message.type === "puppy_tracker/measurement/correct") return { ok: true, measurement_id: "w2" };
        if (message.type === "puppy_tracker/record/restore") {
          records.find((item) => item.id === message.record_id).deleted = false;
          return { ok: true };
        }
        if (message.type.endsWith("record/update")) {
          if (window.__editorFail) throw new Error("Test save failed");
          const record = records.find((item) => item.id === message.record_id);
          if (!record || (record.scope === "mother") !== message.type.includes("mother/")) throw new Error("Wrong owner route");
          if (record.scope !== "mother" && (record.puppy_id || null) !== (message.puppy_id || null)) throw new Error("Wrong puppy route");
          Object.assign(record, { type: message.record_type, title: message.title, note: message.note, occurred_at: message.occurred_at, data: clone(message.data) });
          return { ok: true, record: clone(record) };
        }
        throw new Error(`Unexpected command: ${message.type}`);
      },
    };
    window.__editorHass = hass;
    const tag = surface === "mobile" ? "puppy-tracker-workspace-card" : `puppy-tracker-${surface}-card`;
    const card = document.createElement(tag);
    card.setConfig({ preset: "mobile", default_tab: "today", show_summary: false, litter_id: "l1", default_selected: scope, puppy_id: scope === "puppy" ? "p1" : undefined, show_history: true, show_details: true, default_range: "all", show_litter_selector: false });
    document.querySelector("#cards").append(card);
    card.hass = hass;
    window.__editorCard = card;
  }, { surface, scope, language, admin });
  const card = page.locator(surface === "mobile" ? "puppy-tracker-workspace-card puppy-tracker-today-card" : `puppy-tracker-${surface}-card`);
  await expect(card.locator(surface === "behavior" ? "[data-edit]" : ".record-edit-button").first()).toBeVisible();
  if (surface === "dossier") await card.locator(".history-filters > summary").click();
  return card;
}

test("behavior history shares the editor and supports partial criterion changes @cross-browser @tablet", async ({ page }) => {
  const card = await mount(page, { surface: "behavior" });
  await card.locator("[data-edit]").click();
  const editor = page.locator("puppy-tracker-record-editor");
  await expect(editor.locator("#record-type")).toBeDisabled();
  await expect(editor.locator('[data-behavior-score="curiosity"]')).toHaveValue("3");
  await editor.locator('[data-behavior-score="curiosity"]').selectOption("5");
  await editor.locator('[data-behavior-score="calm"]').selectOption("");
  await editor.locator("#record-save").click();
  await expect(editor).toHaveCount(0);
  const update = await page.evaluate(() => window.__editorCalls.find((call) => call.type.endsWith("record/update")));
  expect(update).toMatchObject({ record_type: "behavior_observation", data: { observer: "Fabien", context: "Rustige kamer", custom_data: "preserve me", scores: { curiosity: 5 } } });
  expect(update.data.scores).not.toHaveProperty("calm");
});

for (const surface of ["dossier", "today", "attention", "temperature", "behavior", "mobile"]) {
  test(`${surface} removes saved-item write controls for non-admins @cross-browser @tablet`, async ({ page }) => {
    const card = await mount(page, { surface });
    await card.evaluate((element) => { element._hass.user.is_admin = false; element._render(); });
    await expect(card.locator("[data-edit-item],[data-edit]")).toHaveCount(0);
    await expect(page.locator("puppy-tracker-record-editor")).toHaveCount(0);
  });
}

for (const surface of ["dossier", "today", "attention", "temperature", "mobile"]) {
  test(`${surface} opens the common editor with canonical data @cross-browser @tablet`, async ({ page }) => {
    const card = await mount(page, { surface });
    const button = ["today", "mobile"].includes(surface)
      ? card.locator('[data-edit-item="record:puppy:puppy-record"]')
      : surface === "attention" ? card.locator("[data-edit-item]").first() : card.locator('[data-edit-item="puppy-record"]');
    await button.click();
    const editor = page.locator("puppy-tracker-record-editor");
    await expect(editor.locator("dialog")).toBeVisible();
    await expect(editor.locator("#record-data-temperature_c")).toHaveValue("38.4");
    await editor.locator("#record-note").fill("Updated from this card");
    await editor.locator("#record-save").click();
    await expect(editor).toHaveCount(0);
    const update = await page.evaluate(() => window.__editorCalls.find((call) => call.type.endsWith("record/update")));
    expect(update).toMatchObject({ note: "Updated from this card", data: { custom_data: "preserve me", temperature_c: "38.4", method: "Rectaal" } });
    expect(update.record_id).toBe("puppy-record");
    expect(update.puppy_id).toBe("p1");
  });
}

for (const surface of ["dossier", "temperature", "attention"]) {
for (const scope of ["litter", "mother"]) {
  test(`${surface} edits the ${scope} source, not the selected puppy @cross-browser @tablet`, async ({ page }) => {
    const card = await mount(page, { surface, scope });
    const button = surface === "dossier" ? card.locator(`[data-edit-item="${scope === "mother" ? "mother-record" : "litter-record"}"]`)
      : surface === "attention" ? card.locator(scope === "mother" ? ".mother-action [data-edit-item]" : '[data-attention-id="dossier:litter-record:next_due_date"] [data-edit-item]')
        : card.locator(`[data-edit-item="${scope}-record"]`);
    await button.click();
    const editor = page.locator("puppy-tracker-record-editor");
    await editor.locator("#record-note").fill("Correct owner");
    await editor.locator("#record-save").click();
    await expect(editor).toHaveCount(0);
    const update = await page.evaluate(() => window.__editorCalls.find((call) => call.type.endsWith("record/update")));
    expect(update.type).toBe(scope === "mother" ? "puppy_tracker/mother/record/update" : "puppy_tracker/record/update");
    expect(update.record_id).toBe(`${scope}-record`);
    expect(update).not.toHaveProperty("puppy_id");
  });
}
}

test("canonical permission denial is shown without an editable form @cross-browser @tablet", async ({ page }) => {
  const card = await mount(page);
  await page.evaluate(() => {
    const original = window.__editorHass.callWS;
    window.__editorHass.callWS = async (message) => {
      const result = await original(message);
      return message.type === "puppy_tracker/records" ? { ...result, can_manage_records: false } : result;
    };
  });
  await card.locator('[data-edit-item="puppy-record"]').click();
  const editor = page.locator("puppy-tracker-record-editor");
  await expect(editor.getByRole("alert")).toContainText("mag dit item niet");
  await expect(editor.locator("#record-save")).toHaveCount(0);
});

test("submitting twice sends one write and prevents closing during the request @cross-browser @tablet", async ({ page }) => {
  const card = await mount(page);
  await card.locator('[data-edit-item="puppy-record"]').click();
  const editor = page.locator("puppy-tracker-record-editor");
  await editor.locator("#record-note").fill("One submission");
  await page.evaluate(() => {
    const original = window.__editorHass.callWS;
    const gate = new Promise((resolve) => { window.__editorRelease = resolve; });
    window.__editorHass.callWS = async (message) => {
      if (message.type.endsWith("record/update")) { window.__editorWriteCount = (window.__editorWriteCount || 0) + 1; await gate; }
      return original(message);
    };
  });
  await editor.locator("form").evaluate((form) => { form.requestSubmit(); form.requestSubmit(); });
  await expect(editor.locator("#record-save")).toBeDisabled();
  await expect(editor.locator(".close")).toBeDisabled();
  expect(await page.evaluate(() => window.__editorWriteCount)).toBe(1);
  await page.evaluate(() => window.__editorRelease());
  await expect(editor).toHaveCount(0);
});

test("deleted timeline records offer restore before edit @cross-browser @tablet", async ({ page }) => {
  const card = await mount(page);
  await page.evaluate(() => { window.__editorRecords.find((record) => record.id === "puppy-record").deleted = true; });
  await card.locator("#show-deleted").check();
  await expect(card.locator('[data-edit-item="puppy-record"]')).toHaveCount(0);
  await card.locator('.restore-record[data-record-key="puppy-record"]').click();
  const editor = page.locator("puppy-tracker-record-editor");
  await expect(editor.locator("#record-note")).toHaveCount(0);
  await editor.locator("#record-save").click();
  await expect(editor).toHaveCount(0);
  await expect(card.locator('[data-edit-item="puppy-record"]')).toBeVisible();
});

test("draft survives failed saves and card rerenders; closing confirms discard @cross-browser @tablet", async ({ page }) => {
  const card = await mount(page);
  await card.locator('[data-edit-item="puppy-record"]').click();
  const editor = page.locator("puppy-tracker-record-editor");
  await editor.locator("#record-note").fill("Keep my draft");
  await page.evaluate(async () => { window.__editorFail = true; await window.__editorCard._queueRefresh(); });
  await expect(editor.locator("#record-note")).toHaveValue("Keep my draft");
  await editor.locator("#record-save").click();
  await expect(editor.getByRole("alert")).toHaveText("Test save failed");
  await expect(editor.locator("#record-note")).toHaveValue("Keep my draft");
  page.once("dialog", (dialog) => dialog.dismiss());
  await editor.locator("#record-cancel").click();
  await expect(editor.locator("dialog")).toBeVisible();
  await page.evaluate(() => { window.__editorFail = false; });
  await editor.locator("#record-save").click();
  await expect(editor).toHaveCount(0);
});

test("dossier follow-up can edit its source while the timeline is collapsed @cross-browser @tablet", async ({ page }) => {
  const card = await mount(page, { surface: "dossier" });
  await card.locator("#toggle-timeline-items").click();
  await expect(card.locator(".timeline-items-content")).toBeHidden();
  await card.locator('.followup-list [data-edit-item="puppy-record:next_due_date"]').click();
  const editor = page.locator("puppy-tracker-record-editor");
  await expect(editor.locator("#record-title")).toHaveValue("puppy temperature");
  await editor.locator("#record-note").fill("Follow-up corrected");
  await editor.locator("#record-save").click();
  await expect(editor).toHaveCount(0);
  await expect(card.locator(".timeline-items-content")).toBeHidden();
  expect(await page.evaluate(() => window.__editorCalls.find((call) => call.type.endsWith("record/update")))).toMatchObject({ record_id: "puppy-record", puppy_id: "p1" });
});

test("editing a saved care result changes its dossier fact without executing care again @cross-browser @tablet", async ({ page }) => {
  const card = await mount(page);
  await page.evaluate(async () => {
    Object.assign(window.__editorRecords.find((record) => record.id === "puppy-record"), {
      type: "test", title: "ESI", data: { care_program_id: "esi", care_program_revision: 2, care_occurrence_id: "esi:p1:3", care_status: "completed", care_result: "Rustig", care_score: 3, care_instruction: "Geur voor vandaag: gras", care_data: { scent: "gras" } },
    });
    await window.__editorCard._queueRefresh();
  });
  await card.locator('[data-edit-item="puppy-record"]').click();
  const editor = page.locator("puppy-tracker-record-editor");
  await expect(editor.locator("#record-type")).toBeDisabled();
  await expect(editor.getByText("Geur voor vandaag: gras", { exact: true })).toBeVisible();
  await expect(editor.locator("#record-care-result")).toHaveValue("Rustig");
  await editor.locator("#record-care-result").fill("Nieuwsgierig");
  await editor.locator("#record-save").click();
  await expect(editor).toHaveCount(0);
  const calls = await page.evaluate(() => window.__editorCalls);
  expect(calls.find((call) => call.type.endsWith("record/update"))).toMatchObject({ record_id: "puppy-record", data: { care_program_id: "esi", care_program_revision: 2, care_occurrence_id: "esi:p1:3", care_result: "Nieuwsgierig", care_data: { scent: "gras" } } });
  expect(calls.some((call) => call.type === "puppy_tracker/care_occurrence/record")).toBe(false);
  await expect(card.locator(".dossier-timeline-scroll").getByText("Nieuwsgierig", { exact: true })).toBeVisible();
});

test("deleted records are not edited from a stale card @cross-browser @tablet", async ({ page }) => {
  const card = await mount(page);
  await page.evaluate(() => { window.__editorRecords.find((record) => record.id === "puppy-record").deleted = true; });
  await card.locator('[data-edit-item="puppy-record"]').click();
  const editor = page.locator("puppy-tracker-record-editor");
  await expect(editor.getByRole("alert")).toContainText("verwijderd");
  await expect(editor.locator("#record-save")).toHaveCount(0);
});

test("weight entry uses correction API, never dossier updates @cross-browser @tablet", async ({ page }) => {
  const card = await mount(page);
  await card.locator('[data-edit-item="weight:p1:w1"]').click();
  const editor = page.locator("puppy-tracker-record-editor");
  await expect(editor.locator("#measurement-weight")).toHaveValue("540");
  await editor.locator("#measurement-weight").fill("550");
  await editor.locator("#measurement-reason").fill("Typfout");
  await editor.locator("#record-save").click();
  await expect(editor).toHaveCount(0);
  expect(await page.evaluate(() => window.__editorCalls.find((call) => call.type === "puppy_tracker/measurement/correct"))).toMatchObject({ puppy_id: "p1", measurement_id: "w1", weight: 550, reason: "Typfout" });
  expect(await page.evaluate(() => window.__editorCalls.some((call) => call.type.endsWith("record/update")))).toBe(false);
});

test("saving an item preserves the timeline list scroll position @cross-browser @tablet", async ({ page }) => {
  const card = await mount(page);
  await page.evaluate(async () => {
    const source = window.__editorRecords.find((record) => record.id === "puppy-record");
    for (let index = 0; index < 24; index += 1) window.__editorRecords.push({ ...structuredClone(source), id: `extra-${index}`, title: `Extra ${index}` });
    await window.__editorCard._queueRefresh();
  });
  const button = card.locator('[data-edit-item]').nth(15);
  await button.scrollIntoViewIfNeeded();
  const offset = await card.locator(".dossier-timeline-scroll").evaluate((list) => list.scrollTop);
  expect(offset).toBeGreaterThan(0);
  await button.click();
  const editor = page.locator("puppy-tracker-record-editor");
  await editor.locator("#record-note").fill("Updated note");
  await editor.locator("#record-save").click();
  await expect(editor).toHaveCount(0);
  await expect.poll(() => card.locator(".dossier-timeline-scroll").evaluate((list) => list.scrollTop)).toBeCloseTo(offset, 0);
});

test("role loss prevents saving; detaching the source cleans up the dialog @cross-browser @tablet", async ({ page }) => {
  const card = await mount(page);
  await card.locator('[data-edit-item="puppy-record"]').click();
  const editor = page.locator("puppy-tracker-record-editor");
  await editor.locator("#record-note").fill("Unauthorized draft");
  await page.evaluate(() => { window.__editorHass.user.is_admin = false; });
  await editor.locator("#record-save").click();
  await expect(editor.getByRole("alert")).toContainText("mag dit item niet");
  expect(await page.evaluate(() => window.__editorCalls.some((call) => call.type.endsWith("record/update")))).toBe(false);
  await page.evaluate(() => window.__editorCard.remove());
  await expect(editor).toHaveCount(0);
});

for (const surface of ["dossier"]) {
  test(`${surface} updates filters and visibility while search retains focus @cross-browser @tablet`, async ({ page }) => {
    const card = await mount(page, { surface });
    const search = card.locator("#record-search");
    await search.fill("Original");
    const selector = surface === "dossier" ? '[data-dossier-category="temperature"]' : '[data-filter-type="temperature"]';
    // Simulate Safari's pointer behavior: changing a control need not blur search.
    await card.locator(selector).evaluate((button) => button.click());
    await expect(search).toBeFocused();
    await expect(card.locator(selector)).not.toHaveClass(/active/);
    await expect(card.locator(".record-edit-button").filter({ visible: true })).toHaveCount(surface === "dossier" ? 1 : 0);
    await card.locator(selector).evaluate((button) => button.click());
    await expect(card.locator(selector)).toHaveClass(/active/);
    const content = card.locator(".timeline-items-content");
    await card.locator("#toggle-timeline-items").evaluate((button) => button.click());
    await expect(content).toBeHidden();
    await expect(card.locator("#toggle-timeline-items")).toHaveAttribute("aria-expanded", "false");
    await card.locator("#toggle-timeline-items").click();
    await expect(content).toBeVisible();
    await expect(search).toHaveValue("Original");
  });
}

for (const language of ["nl", "en"]) {
  test(`editor ${language} layout and scroll/focus restoration @cross-browser @tablet`, async ({ page }, testInfo) => {
    const card = await mount(page, { language });
    await page.evaluate((language) => {
      const spacer = document.createElement("div"); spacer.style.height = "800px";
      document.querySelector("#cards").before(spacer);
      if (language === "en") {
        for (const [key, value] of Object.entries({ "card-background-color": "#222327", "primary-text-color": "#f0f0f0", "secondary-text-color": "#b3b3b3", "secondary-background-color": "#303136", "primary-color": "#007f99", "divider-color": "#5a5a5a" })) window.__editorCard.style.setProperty(`--${key}`, value);
      }
    }, language);
    const button = card.locator('[data-edit-item="puppy-record"]');
    await button.scrollIntoViewIfNeeded();
    const scroll = await page.evaluate(() => window.scrollY);
    await button.click();
    const editor = page.locator("puppy-tracker-record-editor");
    await expect(editor.locator("#record-title")).toBeVisible();
    await expect(editor.getByRole("heading")).toHaveText(language === "nl" ? "Dossieritem aanpassen" : "Edit dossier item");
    expect(await editor.locator("dialog").evaluate((dialog) => dialog.scrollWidth <= dialog.clientWidth + 1)).toBe(true);
    if (language === "en") expect(await editor.locator("dialog").evaluate((dialog) => getComputedStyle(dialog).backgroundColor)).toBe("rgb(34, 35, 39)");
    await page.screenshot({ path: testInfo.outputPath(`record-editor-${language}.png`) });
    await page.keyboard.press("Tab");
    expect(await editor.evaluate((element) => element.shadowRoot.querySelector("dialog").contains(element.shadowRoot.activeElement))).toBe(true);
    await editor.locator("#record-cancel").click();
    await expect(button).toBeFocused();
    expect(Math.abs(await page.evaluate(() => window.scrollY) - scroll)).toBeLessThanOrEqual(2);
  });
}
