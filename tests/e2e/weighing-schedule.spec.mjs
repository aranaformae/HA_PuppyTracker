import { expect, test } from "@playwright/test";

test("age-based weighing details explain the current interval without hiding real concerns @cross-browser @tablet", async ({ page }) => {
  await page.goto("/tests/e2e/cards.html?production=1");
  await page.waitForFunction(() => window.__puppyTrackerReady === true);
  const result = await page.evaluate(async () => {
    const { describeStatus } = await import("/custom_components/puppy_tracker/frontend/puppy-tracker-card-common.js");
    return Object.fromEntries(["nl", "en"].map(language => {
      const hass = { language };
      const summary = { status_code: "ok", weighing_schedule_mode: "age_based", max_hours_between_weighings: 48 };
      return [language, {
        current: describeStatus(summary, hass),
        finished: describeStatus({ ...summary, weighing_schedule_finished: true, max_hours_between_weighings: null }, hass),
        concern: describeStatus({ ...summary, status_code: "weight_loss", weighing_schedule_finished: true, change_grams: -20 }, hass),
      }];
    }));
  });
  expect(result.nl.current).toBe("Geplande weging iedere 48 uur");
  expect(result.en.current).toBe("Planned weighing every 48 hours");
  expect(result.nl.finished).toBe("Geen geplande wegingen meer op deze leeftijd");
  expect(result.en.finished).toBe("No further planned weighings for this age");
  expect(result.nl.concern).toContain("−20");
  expect(result.en.concern).toContain("−20");
});
