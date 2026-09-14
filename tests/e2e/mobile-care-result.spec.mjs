import { expect, test } from "@playwright/test";

test("mobile care items open the result editor so a note can be saved", async ({ page }) => {
  await page.goto("/tests/e2e/cards.html?production");
  await page.waitForFunction(() => window.__puppyTrackerReady === true);

  await page.evaluate(() => {
    const now = new Date();
    const scheduledDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    let recorded = false;
    const recordCalls = [];
    const hass = {
      locale: { language: "nl" },
      language: "nl",
      states: {},
      connection: { subscribeMessage: async () => async () => {} },
      callWS: async (message) => {
        if (message.type === "puppy_tracker/litters") {
          return { litters: [{ id: "l1", name: "Luna x Dutch", active: true }] };
        }
        if (message.type === "puppy_tracker/care_occurrences") {
          return recorded ? { occurrences: [], skipped: [] } : {
            occurrences: [{
              id: "ens:p1:3",
              program_id: "ens",
              litter_id: "l1",
              puppy_id: "p1",
              puppy_name: "Alice",
              title: "ENS",
              record_type: "test",
              age_days: 3,
              scheduled_date: scheduledDate,
              status: "due_today",
              days_until_due: 0,
              result_fields: ["note"],
              instructions: "Observeer de reactie.",
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

    window.__mobileCareRecordCalls = recordCalls;
    const card = document.createElement("puppy-tracker-mobile-card");
    card.setConfig({
      tab: "care",
      show_weighing: false,
      show_quick_log: false,
      show_today: false,
      show_care_today: true,
    });
    document.querySelector("#cards").appendChild(card);
    card.hass = hass;
  });

  const mobile = page.locator("puppy-tracker-mobile-card");
  const care = mobile.locator("puppy-tracker-care-execution-card");
  const row = care.locator(".row");
  await expect(row).toBeVisible();
  await row.locator(".main").click();
  await expect(care.locator(".care-result-dialog")).toBeVisible();
  await care.locator(".care-result-note").fill("Rustig en goed gereageerd.");
  await care.getByRole("button", { name: "Opslaan" }).click();
  await expect(care.locator(".care-result-dialog")).toHaveCount(0);
  await expect(care.locator(".row")).toHaveCount(0);

  const calls = await page.evaluate(() => window.__mobileCareRecordCalls);
  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({
    type: "puppy_tracker/care_occurrence/record",
    program_id: "ens",
    puppy_id: "p1",
    occurrence_id: "ens:p1:3",
    status: "completed",
    note: "Rustig en goed gereageerd.",
  });
});
