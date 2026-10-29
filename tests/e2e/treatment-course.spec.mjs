import { expect, test } from "@playwright/test";

test("treatment planning stays separate from ordinary age-based programs", async ({ page }) => {
  await page.goto("/tests/e2e/cards.html?production=1");
  await page.waitForFunction(() => window.__puppyTrackerReady === true);
  await page.evaluate(() => {
    window.courseCalls = [];
    const hass = {
      language: "nl", locale: { language: "nl" }, user: { is_admin: true },
      connection: { subscribeMessage: async () => async () => {} },
      callWS: async (message) => {
        if (message.type === "puppy_tracker/litters") return { litters: [{ id: "l1", name: "Nest" }] };
        if (message.type === "puppy_tracker/care_programs") return { programs: [] };
        if (message.type === "puppy_tracker/data") return { puppies: [{ id: "p1", name: "Nova", collar_color: "paars", active: true }] };
        if (message.type === "puppy_tracker/care_program_templates") return { templates: [] };
        if (message.type === "puppy_tracker/care_program/conflicts") return { conflicts: [] };
        if (message.type === "puppy_tracker/care_program/create") { window.courseCalls.push(message); return { program_id: "new-course" }; }
        throw new Error(message.type);
      },
    };
    const card = document.createElement("puppy-tracker-care-program-card");
    card.setConfig({});
    document.querySelector("#cards").append(card);
    card.hass = hass;
  });
  const card = page.locator("puppy-tracker-care-program-card");
  await card.locator("#add-program").click();
  await expect(card.locator("#care-schedule-type")).toHaveValue("range");
  await expect(card.locator("#care-start")).toBeVisible();
  await expect(card.locator("#care-course-product")).toBeHidden();
  await card.locator("#care-schedule-type").selectOption("course");
  await expect(card.locator("#care-start")).toBeHidden();
  await expect(card.locator("#care-course-product")).toBeVisible();
  await card.locator("#care-title").fill("Ontwormingskuur");
  await card.locator("#care-course-type").selectOption("deworming");
  await card.locator("#care-course-product").fill("Middel A");
  await card.locator("#care-course-start").fill("2026-10-28");
  await card.locator("#care-course-end").fill("2026-10-29");
  await card.locator("#care-course-times").fill("08:00, 18:00");
  await card.locator(".course-puppy").check();
  await card.locator("#save-program").click();
  await expect.poll(() => page.evaluate(() => window.courseCalls.length)).toBe(1);
  const call = await page.evaluate(() => window.courseCalls[0]);
  expect(call).toMatchObject({
    schedule_type: "course", record_type: "deworming", target_puppy_ids: ["p1"],
    start_date: "2026-10-28", end_date: "2026-10-29",
    times_of_day: ["08:00", "18:00"], treatment_product: "Middel A",
    result_fields: ["note"],
  });
  expect(call).not.toHaveProperty("start_age_days");
});

test("course result records the actual product independently of the plan @cross-browser @tablet", async ({ page }) => {
  await page.goto("/tests/e2e/cards.html");
  await page.waitForFunction(() => window.__puppyTrackerReady === true);
  await page.evaluate(() => {
    window.courseRecords = [];
    const occurrence = {
      id: "course-1:course:r1:p1:2026-10-28:08:00", program_id: "course-1",
      litter_id: "l1", puppy_id: "p1", puppy_name: "Nova", collar_color: "paars",
      title: "Medicatie", record_type: "medication", schedule_type: "course",
      scheduled_date: "2026-10-28", time_of_day: "08:00", status: "due_today",
      days_until_due: 0, result_fields: ["note"], treatment_product: "Middel A",
      planned_dose: "1", planned_unit: "ml",
    };
    const hass = {
      language: "nl", locale: { language: "nl" }, user: { is_admin: true }, states: {},
      connection: { subscribeMessage: async () => async () => {} },
      callWS: async (message) => {
        if (message.type === "puppy_tracker/litters") return { litters: [{ id: "l1", name: "Nest" }] };
        if (message.type === "puppy_tracker/care_occurrences") return { occurrences: [occurrence], skipped: [], context: { today: "2026-10-28", program_count: 1, enabled_program_count: 1, active_puppy_count: 1 } };
        if (message.type === "puppy_tracker/care_occurrence/record") { window.courseRecords.push(message); occurrence.status = message.status; return { record_id: String(window.courseRecords.length) }; }
        if (message.type === "puppy_tracker/data") return { puppies: [{ id: "p1", name: "Nova", active: true }] };
        throw new Error(message.type);
      },
    };
    const card = document.createElement("puppy-tracker-care-execution-card");
    card.setConfig({ litter_id: "l1" });
    document.querySelector("#cards").append(card);
    card.hass = hass;
  });
  const card = page.locator("puppy-tracker-care-execution-card");
  await expect(card.locator(".row")).toHaveCount(1);
  await expect(card.locator(".row")).not.toContainText("null");
  await card.locator('.row [data-action="completed"]').click();
  const editor = page.locator("puppy-tracker-record-editor");
  await expect(editor.locator("#record-data-medication")).toHaveValue("Middel A");
  await editor.locator("#record-data-medication").fill("Middel B");
  await editor.locator("#record-data-dose").fill("0.5");
  await editor.locator("#record-save").click();
  await expect.poll(() => page.evaluate(() => window.courseRecords.length)).toBe(1);
  expect((await page.evaluate(() => window.courseRecords[0])).data).toMatchObject({ medication: "Middel B", dose: "0.5", unit: "ml" });
});

test("missed course moment never submits the planned product as administered @cross-browser @tablet", async ({ page }) => {
  await page.goto("/tests/e2e/cards.html");
  await page.waitForFunction(() => window.__puppyTrackerReady === true);
  await page.evaluate(() => {
    window.missedCourseCall = null;
    const occurrence = {
      id: "course-1:course:r1:p1:2026-10-28:08:00", program_id: "course-1",
      litter_id: "l1", puppy_id: "p1", puppy_name: "Nova", title: "Ontworming",
      record_type: "deworming", schedule_type: "course", scheduled_at: "2026-10-28T08:00:00+01:00",
      scheduled_date: "2026-10-28", time_of_day: "08:00", status: "due_today",
      days_until_due: 0, result_fields: ["note"], treatment_product: "Gepland middel",
    };
    const hass = {
      language: "nl", locale: { language: "nl" }, user: { is_admin: true }, states: {},
      connection: { subscribeMessage: async () => async () => {} },
      callWS: async (message) => {
        if (message.type === "puppy_tracker/litters") return { litters: [{ id: "l1", name: "Nest" }] };
        if (message.type === "puppy_tracker/care_occurrences") return { occurrences: [occurrence], skipped: [], context: { today: "2026-10-28", program_count: 1, enabled_program_count: 1, active_puppy_count: 1 } };
        if (message.type === "puppy_tracker/care_occurrence/record") { window.missedCourseCall = message; return { record_id: "missed-1" }; }
        throw new Error(message.type);
      },
    };
    const card = document.createElement("puppy-tracker-care-execution-card");
    card.setConfig({ litter_id: "l1" });
    document.querySelector("#cards").append(card);
    card.hass = hass;
  });
  const card = page.locator("puppy-tracker-care-execution-card");
  await card.locator('.row [data-action="missed"]').click();
  const editor = page.locator("puppy-tracker-record-editor");
  await expect(editor.locator("#record-care-status")).toHaveValue("missed");
  await expect(editor.locator(".record-type-fields")).toBeHidden();
  await editor.locator("#record-save").click();
  await expect.poll(() => page.evaluate(() => window.missedCourseCall?.status)).toBe("missed");
  expect((await page.evaluate(() => window.missedCourseCall)).data).toEqual({});
});

test("course template stays reusable and stopping preserves visible progress", async ({ page }) => {
  await page.goto("/tests/e2e/cards.html?production=1");
  await page.waitForFunction(() => window.__puppyTrackerReady === true);
  await page.evaluate(() => {
    window.courseProgram = {
      id: "course-1", litter_id: "l1", title: "Medicatiekuur",
      record_type: "medication", schedule_type: "course", enabled: true,
      target_puppy_ids: ["p1"], start_date: "2026-10-28", end_date: "2026-10-29",
      times_of_day: ["08:00"], treatment_product: "Middel A", result_fields: ["note"],
      progress: [{ puppy_id: "p1", puppy_name: "Nova", total: 2, completed: 1, missed: 0, pending: 1 }],
    };
    window.courseStopped = null;
    const hass = {
      language: "nl", locale: { language: "nl" }, user: { is_admin: true },
      connection: { subscribeMessage: async () => async () => {} },
      callWS: async (message) => {
        if (message.type === "puppy_tracker/litters") return { litters: [{ id: "l1", name: "Nest" }] };
        if (message.type === "puppy_tracker/data") return { puppies: [{ id: "p1", name: "Nova", active: true }] };
        if (message.type === "puppy_tracker/care_programs") return { programs: [window.courseProgram] };
        if (message.type === "puppy_tracker/care_program_templates") return { templates: [{ id: "template-course", name: "Een dag", title: "Behandeling", record_type: "medication", schedule_type: "course", course_days: 1, times_of_day: ["09:00"], result_fields: ["note"] }] };
        if (message.type === "puppy_tracker/care_program/stop") {
          window.courseStopped = message;
          Object.assign(window.courseProgram, { enabled: false, stopped_at: new Date().toISOString(), stop_reason: message.reason });
          return { ok: true };
        }
        throw new Error(message.type);
      },
    };
    const card = document.createElement("puppy-tracker-care-program-card");
    card.setConfig({});
    document.querySelector("#cards").append(card);
    card.hass = hass;
  });
  const card = page.locator("puppy-tracker-care-program-card");
  await expect(card.locator(".course-progress")).toContainText("1/2 uitgevoerd");
  await card.locator(".edit").click();
  await card.locator(".age-instructions").last().locator("summary").click();
  await card.locator("#care-stop-reason").fill("Dierenartsadvies");
  page.once("dialog", (dialog) => dialog.accept());
  await card.locator("#stop-treatment").click();
  await expect.poll(() => page.evaluate(() => window.courseStopped?.reason)).toBe("Dierenartsadvies");
  await expect(card.locator(".item .meta")).toContainText("Gestopt: Dierenartsadvies");
  await expect(card.locator(".course-progress")).toContainText("1/2 uitgevoerd");
  await card.locator("#add-program").click();
  await card.locator("#care-template").selectOption("template-course");
  await expect(card.locator("#care-schedule-type")).toHaveValue("course");
  await expect(card.locator("#care-course-product")).toBeEmpty();
  await expect(card.locator(".course-puppy")).not.toBeChecked();
});
