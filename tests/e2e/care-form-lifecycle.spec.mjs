import { expect, test } from "@playwright/test";

async function mount(page, { course = false, fields = ["result", "score", "note"], weightDose = false } = {}) {
  await page.goto("/tests/e2e/cards.html?production");
  await page.waitForFunction(() => window.__puppyTrackerReady);
  await page.evaluate(({ course, fields, weightDose }) => {
    localStorage.clear();
    const today = new Date().toISOString().slice(0, 10);
    const puppy = { id: "p1", name: "Nova", collar_color: "paars", active: true };
    const occurrence = { id: "o1", litter_id: "l1", program_id: "program", puppy_id: "p1", puppy_name: "Nova", collar_color: "paars",
      title: course ? "Medication" : "ESI", record_type: course ? "medication" : "test", schedule_type: course ? "course" : "range",
      age_days: 3, scheduled_date: today, scheduled_at: `${today}T09:00:00Z`, status: "due_today", days_until_due: 0,
      instructions: "Day 3: a mild scent. Observe and record the response.", result_fields: fields,
      treatment_product: "Planned product", planned_dose: "0.5", planned_unit: "ml", ...(weightDose ? { weight_dose: { amount_per_kg: 0.2, unit: "ml", max_weight_age_hours: 24 } } : {}) };
    const state = window.careForm = { occurrence, calls: [], callbacks: [], fail: false, pause: false, failRefresh: false, writes: 0 };
    const hass = { language: "en", locale: { language: "en" }, config: { time_zone: "UTC" }, user: { is_admin: true }, states: {},
      connection: { subscribeMessage: async (cb) => { state.callbacks.push(cb); return () => {}; } },
      callWS: async (msg) => {
        if (msg.type === "puppy_tracker/weight_dose") return { dose: { amount: 0.6, unit: "ml", status: "stale_weight", weight_grams: 3000, weight_timestamp: new Date(Date.now()-48*3600000).toISOString(), max_weight_age_hours: 24 } };
        state.calls.push(structuredClone(msg));
        if (msg.type === "puppy_tracker/litters") return { litters: [{ id: "l1", name: "Nest", active: true }, { id: "l2", name: "Other litter", active: true }] };
        if (msg.type === "puppy_tracker/onboarding") return { visible: false };
        if (msg.type === "puppy_tracker/care_occurrences") {
          if (state.failRefresh) throw new Error("Overview unavailable");
          return { occurrences: [structuredClone(occurrence)], skipped: [], context: { today }, execution: {
            can_manage_records: true, litter: { id: "l1", name: "Nest" }, puppies: [puppy], reminders: [], followups: [],
          } };
        }
        if (msg.type === "puppy_tracker/care_occurrence/record") {
          if (state.fail) { state.fail = false; throw new Error("Temporary write failure"); }
          if (state.pause) await new Promise((resolve) => { state.resume = resolve; });
          state.writes++;
          occurrence.status = msg.status;
          return { record_id: "result-1" };
        }
        throw new Error(msg.type);
      },
    };
    const workspace = document.createElement("puppy-tracker-workspace-card");
    workspace.setConfig({ preset: "mobile", default_tab: "care", litter_id: "l1" });
    document.querySelector("#cards").append(workspace);
    workspace.hass = hass;
  }, { course, fields, weightDose });
  const card = page.locator("puppy-tracker-care-execution-card");
  await card.locator('[data-action="completed"]').click();
  return { card, editor: page.locator("puppy-tracker-record-editor") };
}

for (const course of [false, true]) {
  test(`shared care lifecycle protects ${course ? "course" : "ESI"} drafts, busy saves and focus @cross-browser @tablet`, async ({ page }, testInfo) => {
    const { card, editor } = await mount(page, { course });
    await expect(editor.locator(".owner")).toHaveText("Nova (paars)");
    await editor.locator("dialog").screenshot({ path: testInfo.outputPath("care-execution-form.png") });
    await expect(editor.locator(".context")).toContainText("Day 3: a mild scent");
    if (course) await editor.locator("#record-data-medication").fill("Actual product");
    else {
      await expect(editor.locator("#record-type")).toHaveCount(0);
      await expect(editor.locator("#record-occurred")).toHaveCount(0);
      await editor.locator("#record-care-result").fill("Curious");
      await editor.locator("#record-care-score").fill("1.25");
      await editor.locator("#record-save").click();
      expect(await page.evaluate(() => window.careForm.calls.filter((m) => m.type.endsWith("/record")).length)).toBe(0);
      await editor.locator("#record-care-score").fill("1.5");
    }
    await editor.locator("#record-note").fill("Keep this observation");
    await page.evaluate(async () => { for (const cb of window.careForm.callbacks) await cb({}); });
    await expect(editor.locator("#record-note")).toHaveValue("Keep this observation");
    page.once("dialog", (dialog) => dialog.dismiss());
    await editor.locator("#record-cancel").click();
    await expect(editor.locator("#record-note")).toHaveValue("Keep this observation");
    await page.evaluate(() => { window.careForm.fail = true; });
    await editor.locator("#record-save").click();
    await expect(editor.locator(".error")).toContainText("Temporary write failure");
    await expect(editor.locator("#record-save")).toHaveText("Try again");
    if (course) await expect(editor.locator("#record-type")).toBeDisabled();
    await page.evaluate(() => { window.careForm.pause = true; });
    await editor.locator("#record-save").click();
    await expect(editor.locator("#record-save")).toBeDisabled();
    await editor.locator("dialog").press("Escape");
    await expect(editor.locator("dialog")).toBeVisible();
    await page.evaluate(() => {
      document.querySelector("puppy-tracker-workspace-card")._selectTab("calculator");
      document.querySelector("puppy-tracker-record-editor").shadowRoot.querySelector("form").requestSubmit();
    });
    await expect(page.locator("#workspace-navigation-feedback")).toContainText("Saving");
    await page.evaluate(() => window.careForm.resume());
    await expect(editor).toHaveCount(0);
    await expect(card.locator(".rows .row")).toHaveCount(0);
    expect(await page.evaluate(() => window.careForm.writes)).toBe(1);
    await expect(card.locator(".care-save-feedback")).toContainText("Nova (paars)");
    const call = await page.evaluate(() => window.careForm.calls.filter((m) => m.type.endsWith("/record")).at(-1));
    expect(call).toMatchObject({ note: "Keep this observation", puppy_id: "p1", occurrence_id: "o1" });
    expect(call.occurred_at).toBeTruthy();
    if (course) expect(call.data).toMatchObject({ medication: "Actual product", dose: "0.5", unit: "ml" });
    else expect(call).toMatchObject({ result: "Curious", score: 1.5 });
    expect(await card.locator(".rows").evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  });
}

for (const course of [false, true]) {
  test(`${course ? "course" : "age-based care"} respects disabled result fields @cross-browser @tablet`, async ({ page }) => {
    const { editor } = await mount(page, { course, fields: [] });
    await expect(editor.locator("#record-care-status")).toBeVisible();
    for (const id of ["record-note", "record-care-result", "record-care-score", "record-data-test_name"]) await expect(editor.locator(`#${id}`)).toHaveCount(0);
    if (!course) await expect(editor.locator("#record-type")).toHaveCount(0);
    await editor.locator("#record-save").click();
    await expect(editor).toHaveCount(0);
    expect(await page.evaluate(() => window.careForm.writes)).toBe(1);
  });
}

test("successful care write followed by a failed refresh never invites a second write @cross-browser @tablet", async ({ page }) => {
  const { card, editor } = await mount(page);
  await page.evaluate(() => { window.careForm.failRefresh = true; });
  await editor.locator("#record-note").fill("Confirmed result");
  await editor.locator("#record-save").click();
  await expect(editor).toHaveCount(0);
  await expect(card.locator(".care-save-feedback")).toContainText("saved for Nova (paars)");
  await expect(card.locator(".error")).toContainText("Overview unavailable");
  expect(await page.evaluate(() => window.careForm.writes)).toBe(1);
  await page.evaluate(async () => { window.careForm.failRefresh = false; for (const cb of window.careForm.callbacks) await cb({}); });
  await expect(card.locator(".rows .row")).toHaveCount(0);
  expect(await page.evaluate(() => window.careForm.writes)).toBe(1);
});

test("care draft keeps its litter during announcements and cancelable changes ask once @cross-browser @tablet", async ({ page }) => {
  const { editor } = await mount(page);
  await editor.locator("#record-note").fill("Belongs to the first litter");
  await page.evaluate(() => document.querySelector("puppy-tracker-workspace-card")._handleLitterChange(new CustomEvent("change", { detail: { litterId: "l2" } })));
  await expect(editor.locator("#record-note")).toHaveValue("Belongs to the first litter");
  expect(await editor.evaluate((node) => node._context.litterId)).toBe("l1");
  // Request a change back to the original litter, then a new explicit change.
  await page.evaluate(() => document.querySelector("puppy-tracker-workspace-card")._handleLitterChange(new CustomEvent("change", { detail: { litterId: "l1" } })));
  let confirmations = 0;
  page.once("dialog", async (dialog) => { confirmations++; await dialog.dismiss(); });
  await page.evaluate(() => document.querySelector("puppy-tracker-workspace-card")._handleLitterChange(new CustomEvent("change", { cancelable: true, detail: { litterId: "l2" } })));
  await expect(editor.locator("#record-note")).toHaveValue("Belongs to the first litter");
  expect(confirmations).toBe(1);
  page.once("dialog", async (dialog) => { confirmations++; await dialog.accept(); });
  await page.evaluate(() => document.querySelector("puppy-tracker-workspace-card")._handleLitterChange(new CustomEvent("change", { cancelable: true, detail: { litterId: "l2" } })));
  await expect(editor).toHaveCount(0);
  expect(confirmations).toBe(2);
  expect(await page.evaluate(() => window.careForm.writes)).toBe(0);
});

test("weight-based treatment shows a warning and saves only the reviewed actual amount @cross-browser @tablet", async ({ page }) => {
  const {editor}=await mount(page,{course:true,weightDose:true});
  await expect(editor.locator("puppy-tracker-weight-dose")).toContainText("0.6 ml");
  await expect(editor.locator("puppy-tracker-weight-dose")).toContainText("WEIGHT TOO OLD");
  await expect(editor.locator("#record-data-dose")).toHaveValue("");
  await editor.locator("#record-data-dose").fill("0.55");
  await editor.locator("#record-save").click();
  const saved=await page.evaluate(()=>window.careForm.calls.find(item=>item.type==="puppy_tracker/care_occurrence/record"));
  expect(saved.data.dose).toBe("0.55");
});
