import { expect, test } from "@playwright/test";

async function mount(page, language = "en", config = {}) {
  await page.goto("/tests/e2e/cards.html?production=1");
  await page.waitForFunction(() => window.__puppyTrackerReady === true);
  await page.evaluate(({ language, config }) => {
    window.localStorage.clear();
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    window.careOverview = {
      today, callbacks: new Set(), fail: false, skipped: [],
      context: { program_count: 1, enabled_program_count: 1, active_puppy_count: 2, today },
      occurrences: [{ id: "ens:p1:3", program_id: "ens", puppy_id: "p1", puppy_name: "Nova", title: "ENS", age_days: 3, scheduled_date: today, status: "due_today", result_fields: ["note"] }],
    };
    const state = window.careOverview;
    const hass = {
      language, locale: { language }, user: { id: "admin", is_admin: true }, states: {},
      connection: { subscribeMessage: async (callback) => { state.callbacks.add(callback); return () => state.callbacks.delete(callback); } },
      callWS: async (msg) => {
        if (msg.type === "puppy_tracker/litters") return { litters: [{ id: "l1", name: "Luna", active: true }] };
        if (msg.type === "puppy_tracker/care_occurrences") {
          if (state.fail) throw new Error("Temporary read failure");
          return structuredClone({ occurrences: state.occurrences, skipped: state.skipped, context: state.context });
        }
        if (msg.type === "puppy_tracker/care_programs") return { programs: [] };
        if (msg.type === "puppy_tracker/care_program_templates") return { templates: [] };
        if (msg.type === "puppy_tracker/onboarding") return { visible: false };
        if (msg.type === "puppy_tracker/care_occurrence/record") {
          state.occurrences.find((item) => item.id === msg.occurrence_id).status = msg.status;
          return { record_id: "saved" };
        }
        if (msg.type === "puppy_tracker/data") return { can_manage_records: true, litter: { id: "l1", name: "Luna" }, puppies: [] };
        throw new Error(msg.type);
      },
    };
    window.refreshOverview = async () => { for (const callback of [...state.callbacks]) await callback({}); };
    const card = document.createElement("puppy-tracker-workspace-card");
    card.id = "care-workspace";
    card.setConfig({ preset: "care", default_tab: "care", litter_id: "l1", ...config });
    document.querySelector("#cards").append(card);
    card.hass = hass;
  }, { language, config });
  const card = page.locator("#care-workspace puppy-tracker-care-execution-card");
  await expect(card.locator(".row")).toHaveCount(1);
  return card;
}

for (const language of ["nl", "en"]) {
  test(`Care explains missing, disabled and completed schedules (${language}) @cross-browser @tablet`, async ({ page }) => {
    const card = await mount(page, language);
    await page.evaluate(async () => {
      window.careOverview.occurrences = [];
      window.careOverview.context.program_count = 0;
      window.careOverview.context.enabled_program_count = 0;
      await window.refreshOverview();
    });
    await expect(card.locator(".empty")).toContainText(language === "nl" ? "Nog geen zorgprogramma's" : "No care programs");
    await expect(card.locator('[data-empty-action="programs"]')).toBeVisible();
    await page.evaluate(async () => { window.careOverview.context.program_count = 1; await window.refreshOverview(); });
    await expect(card.locator(".empty")).toContainText(language === "nl" ? "staan uit" : "disabled");
    await page.evaluate(async () => {
      Object.assign(window.careOverview.context, { enabled_program_count: 1, active_puppy_count: 0 });
      await window.refreshOverview();
    });
    await expect(card.locator(".empty")).toContainText(language === "nl" ? "geen actieve pups" : "no active puppies");
    await expect(card.locator('[data-empty-action="settings"]')).toBeVisible();
    await page.evaluate(async () => { window.careOverview.context.active_puppy_count = 2; await window.refreshOverview(); });
    await expect(card.locator(".empty")).toContainText(language === "nl" ? "Geen zorg gepland op deze dag" : "No care scheduled for this day");
    await page.evaluate(async () => {
      window.careOverview.occurrences = [{ id: "done", program_id: "ens", title: "ENS", scheduled_date: window.careOverview.today, status: "completed" }];
      await window.refreshOverview();
    });
    await expect(card.locator(".empty")).toContainText(language === "nl" ? "Alle zorg voor deze dag is uitgevoerd" : "All care for this day is completed");
    await page.evaluate(async () => { window.careOverview.occurrences[0].status = "missed"; await window.refreshOverview(); });
    await expect(card.locator(".empty")).toContainText(language === "nl" ? "1 als gemist" : "1 recorded as missed");
    await expect(card.locator(".empty")).not.toContainText(language === "nl" ? "is uitgevoerd" : "is completed");
    await page.evaluate(async () => { window.careOverview.fail = true; await window.refreshOverview(); });
    await expect(card.locator(".error")).toHaveText("Temporary read failure");
    await expect(card.locator(".empty")).toHaveCount(0);
  });
}

test("Empty Care navigates to available management without adding mobile management tabs @cross-browser @tablet", async ({ page }) => {
  const card = await mount(page);
  await page.evaluate(async () => {
    window.careOverview.occurrences = [];
    Object.assign(window.careOverview.context, { program_count: 0, enabled_program_count: 0 });
    await window.refreshOverview();
  });
  await card.locator('[data-empty-action="programs"]').click();
  await expect(page.locator("#care-workspace puppy-tracker-care-program-card")).toBeVisible();
  await page.locator("#care-workspace").evaluate((el) => el._selectTab("care"));
  await expect(card.locator('[data-empty-action="programs"]')).toBeVisible();
  await page.locator("#care-workspace").evaluate((el) => {
    el.hass = { ...el._hass, user: { ...el._hass.user, is_admin: false } };
  });
  await expect(card.locator('[data-empty-action="programs"]')).toHaveCount(0);
  await page.locator("#care-workspace").evaluate((el) => {
    el.hass = { ...el._hass, user: { ...el._hass.user, is_admin: true } };
    el.setConfig({ preset: "mobile", default_tab: "care", litter_id: "l1" });
  });
  await expect(card.locator(".empty")).toContainText("No care programs");
  await expect(card.locator('[data-empty-action="programs"]')).toHaveCount(0);
  await expect(page.locator("#care-workspace [data-tab='programs']")).toHaveCount(0);
});

test("Care keeps the selected day after completion and can jump to pending care @cross-browser @tablet", async ({ page }) => {
  const card = await mount(page);
  await card.locator('.row [data-action="completed"]').click();
  await card.locator(".care-result-save").click();
  await expect(card.locator(".empty")).toContainText("All care for this day is completed");
  await expect(card.locator(".row")).toHaveCount(0);
  const today = await page.evaluate(() => window.careOverview.today);
  await expect(card.locator("#day-select")).toHaveValue(today);
  await page.evaluate(async () => {
    const tomorrow = new Date(`${window.careOverview.today}T12:00:00Z`);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    window.careOverview.tomorrow = tomorrow.toISOString().slice(0, 10);
    window.careOverview.occurrences = [{ id: "future", program_id: "ens", title: "Future care", scheduled_date: window.careOverview.tomorrow, status: "upcoming", days_until_due: 1 }];
    await window.refreshOverview();
  });
  await card.locator('[data-empty-action="date"]').click();
  await expect(card.locator("#day-select")).toHaveValue(await page.evaluate(() => window.careOverview.tomorrow));
  await expect(card.locator(".row")).toHaveCount(1);
});

test("Care takes its default day from HA and retains explicit dates @cross-browser @tablet", async ({ page }) => {
  const card = await mount(page);
  await page.evaluate(async () => {
    window.careOverview.context.today = "2099-01-01";
    window.careOverview.occurrences = [{ id: "ha-today", program_id: "ens", title: "Care in HA timezone", scheduled_date: "2099-01-01", status: "due_today" }];
    await window.refreshOverview();
  });
  await expect(card.locator("#day-select")).toHaveValue("2099-01-01");
  await expect(card.locator(".row")).toHaveCount(1);
  await card.locator("#day-select").selectOption("2099-01-01");
  await page.evaluate(async () => { window.careOverview.context.today = "2099-01-02"; await window.refreshOverview(); });
  await expect(card.locator("#day-select")).toHaveValue("2099-01-01");
});

for (const language of ["nl", "en"]) {
  test(`Care progress separates completed, pending and missed per program (${language}) @cross-browser @tablet`, async ({ page }) => {
    const card = await mount(page, language);
    await page.evaluate(async () => {
      const state = window.careOverview;
      state.occurrences = [
        ...Array.from({ length: 7 }, (_, index) => ({ id: `ens:${index}`, program_id: "ens", puppy_id: `p${index}`, puppy_name: `Pup ${index}`, title: "ENS", age_days: 3,
          scheduled_date: state.today, status: index < 5 ? "completed" : index === 5 ? "missed" : "due_today", result_fields: ["note"] })),
        { id: "esi:1", program_id: "esi", title: "ESI", scheduled_date: state.today, status: "upcoming", days_until_due: 0 },
        { id: "esi:2", program_id: "esi", title: "ESI", scheduled_date: state.today, status: "completed" },
        { id: "yesterday", program_id: "ens", title: "ENS", scheduled_date: "2000-01-01", status: "overdue" },
      ];
      await window.refreshOverview();
    });
    const ens = card.locator('[data-care-progress="ens"]');
    const esi = card.locator('[data-care-progress="esi"]');
    await expect(ens.locator(".progress-count")).toHaveText(language === "nl" ? "5 van 7 pups uitgevoerd" : "5 of 7 puppies completed");
    await expect(ens.locator("progress")).toHaveAttribute("value", "5");
    await expect(ens.locator("progress")).toHaveAttribute("max", "7");
    await expect(ens.locator(".progress-state")).toHaveText(language === "nl" ? "1 open · 1 gemist" : "1 pending · 1 missed");
    await expect(esi.locator(".progress-count")).toHaveText(language === "nl" ? "1 van 2 pups uitgevoerd" : "1 of 2 puppies completed");
    await card.locator('[data-care-occurrence="ens:6"] [data-action="completed"]').click();
    await card.locator(".care-result-save").click();
    await expect(ens.locator(".progress-count")).toHaveText(language === "nl" ? "6 van 7 pups uitgevoerd" : "6 of 7 puppies completed");
    await expect(ens.locator(".progress-state")).toContainText(language === "nl" ? "1 gemist" : "1 missed");
    await page.evaluate(async () => { window.careOverview.occurrences[0].status = "due_today"; await window.refreshOverview(); });
    await expect(ens.locator("progress")).toHaveAttribute("value", "5");
    await expect(card.locator('[data-care-occurrence="ens:0"]')).toBeVisible();
    await card.screenshot({ path: test.info().outputPath(`care-progress-${language}.png`) });
    expect(await card.locator("ha-card").evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await card.locator(".care-progress summary").click();
    await expect(card.locator(".progress-list")).toBeHidden();
    await page.evaluate(async () => { await window.refreshOverview(); });
    await expect(card.locator(".progress-list")).toBeHidden();
  });
}

test("Mobile care progress is for HA today, not the entire pending list @cross-browser @tablet", async ({ page }) => {
  const card = await mount(page, "en", { preset: "mobile", tab_config: { care: { show_day_selector: false } } });
  await page.evaluate(async () => {
    const state = window.careOverview;
    state.occurrences = [
      { id: "today-done", program_id: "ens", title: "ENS", scheduled_date: state.today, status: "completed" },
      { id: "today-pending", program_id: "ens", title: "ENS", scheduled_date: state.today, status: "due_today" },
      { id: "overdue", program_id: "ens", title: "ENS", scheduled_date: "2000-01-01", status: "overdue" },
    ];
    await window.refreshOverview();
  });
  await expect(card.locator(".row")).toHaveCount(2);
  await expect(card.locator(".progress-count")).toHaveText("1 of 2 puppies completed");
  await expect(card.locator("#day-select")).toHaveCount(0);
  await page.evaluate(async () => { window.careOverview.fail = true; await window.refreshOverview(); });
  await expect(card.locator(".care-progress")).toBeHidden();
});

test("Care progress follows the selected day and retains nodes during unchanged updates @cross-browser @tablet", async ({ page }) => {
  const card = await mount(page);
  await page.evaluate(async () => {
    window.careOverview.occurrences.push({ id: "past-done", program_id: "esi", title: "ESI", scheduled_date: "2000-01-01", status: "completed" });
    await window.refreshOverview();
  });
  await card.locator("#day-select").selectOption("2000-01-01");
  await expect(card.locator(".progress-count")).toHaveText("1 of 1 puppies completed");
  await expect(card.locator(".empty")).toContainText("All care for this day is completed");
  await card.evaluate((el) => { window.progressRow = el.shadowRoot.querySelector(".program-progress"); window.progressBar = window.progressRow.querySelector("progress"); });
  await page.evaluate(async () => { await window.refreshOverview(); });
  expect(await card.evaluate((el) => el.shadowRoot.querySelector(".program-progress") === window.progressRow
    && el.shadowRoot.querySelector("progress") === window.progressBar)).toBe(true);
  await page.evaluate(async () => {
    window.careOverview.skipped = [{ puppy_id: "missing-birth", puppy_name: "Missing", reason_code: "missing_birth_time" }];
    await window.refreshOverview();
  });
  await expect(card.locator(".care-skipped-warning")).toBeVisible();
  await expect(card.locator(".empty")).toHaveCount(0);
});

test("Care applies its future range equally to completed and pending actions @cross-browser @tablet", async ({ page }) => {
  const card = await mount(page);
  await page.evaluate(async () => {
    window.careOverview.occurrences.push(
      { id: "future-completed", program_id: "esi", title: "ESI", scheduled_date: "2099-12-31", status: "completed" },
      { id: "future-pending", program_id: "esi", title: "ESI", scheduled_date: "2099-12-31", status: "upcoming", days_until_due: 9000 },
    );
    await window.refreshOverview();
  });
  expect(await card.locator("#day-select option").evaluateAll((els) => els.map((el) => el.value))).not.toContain("2099-12-31");
  await expect(card.locator('[data-care-progress="esi"]')).toHaveCount(0);
});
