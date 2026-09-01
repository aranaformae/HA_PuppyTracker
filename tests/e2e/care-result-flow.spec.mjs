import { expect, test } from "@playwright/test";

async function openFixture(page) {
  await page.goto("/tests/e2e/cards.html");
  await page.waitForFunction(() => window.__puppyTrackerReady === true);
  expect(await page.evaluate(() => window.__puppyTrackerModuleErrors)).toEqual([]);
}

for (const language of ["nl", "en"]) {
  test(`care result saves and disappears from Today in ${language}`, async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await openFixture(page);

    await page.evaluate((selectedLanguage) => {
      let recorded = false;
      const recordCalls = [];
      const hass = {
        locale: { language: selectedLanguage },
        language: selectedLanguage,
        states: {},
        connection: {
          subscribeMessage: async () => async () => {},
        },
        callWS: async (message) => {
          if (message.type === "puppy_tracker/litters") {
            return { litters: [{ id: "l1", name: "Luna x Dutch", active: true }] };
          }

          if (message.type === "puppy_tracker/data") {
            return {
              litter: {
                id: "l1",
                name: "Luna x Dutch",
                active: true,
                summary: {
                  active_puppies: 1,
                  attention_count: 0,
                  dossier_actions: { actions: [] },
                },
              },
              puppies: [{ id: "p1", name: "Alice", active: true, summary: { needs_attention: false } }],
            };
          }

          if (message.type === "puppy_tracker/care_occurrences") {
            if (recorded) return { occurrences: [], skipped: [] };
            return {
              occurrences: [{
                id: "program-1:p1:3",
                program_id: "program-1",
                program_revision: 1,
                litter_id: "l1",
                puppy_id: "p1",
                puppy_name: "Alice",
                title: "ENS",
                record_type: "test",
                age_days: 3,
                scheduled_at: "2026-09-01T09:00:00+02:00",
                time_of_day: "09:00",
                status: "due_today",
                days_until_due: 0,
                result_fields: ["result", "score", "note"],
              }],
              skipped: [],
            };
          }

          if (message.type === "puppy_tracker/care_occurrence/record") {
            recordCalls.push({ ...message });
            recorded = true;
            return { ok: true, record_id: "record-1" };
          }

          throw new Error(`Unexpected WS call: ${message.type}`);
        },
      };

      window.__careRecordCalls = recordCalls;
      const constructor = customElements.get("puppy-tracker-today-card");
      const card = document.createElement("puppy-tracker-today-card");
      card.setConfig(constructor.getStubConfig());
      document.querySelector("#cards").appendChild(card);
      card.hass = hass;
    }, language);

    const card = page.locator("puppy-tracker-today-card");
    const row = card.locator('[data-care-occurrence="program-1:p1:3"]');
    await expect(row).toBeVisible();
    await expect(row.getByText("ENS", { exact: true })).toBeVisible();

    await row.click();
    await expect(card.locator(".care-result-dialog")).toBeVisible();
    await card.locator(".care-result-value").fill("rustig");
    await card.locator(".care-result-score").fill("8.5");
    await card.locator(".care-result-note").fill("Geen bijzonderheden");
    await card.getByRole("button", { name: language === "en" ? "Save" : "Opslaan" }).click();

    await expect(card.locator('[data-care-occurrence="program-1:p1:3"]')).toHaveCount(0);
    await expect(card.locator(".care-result-dialog")).toHaveCount(0);

    const calls = await page.evaluate(() => window.__careRecordCalls);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      type: "puppy_tracker/care_occurrence/record",
      program_id: "program-1",
      puppy_id: "p1",
      occurrence_id: "program-1:p1:3",
      status: "completed",
      result: "rustig",
      score: 8.5,
      note: "Geen bijzonderheden",
    });
    expect(pageErrors).toEqual([]);
  });
}
