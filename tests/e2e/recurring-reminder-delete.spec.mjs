import { expect, test } from "@playwright/test";

test("deleting an edited reminder closes the editor without recreating it", async ({ page }) => {
  await page.goto("/tests/e2e/cards.html?production");
  await page.evaluate(async () => {
    await customElements.whenDefined("puppy-tracker-recurring-reminder-card");
    const reminder = {
      id: "reminder-1",
      litter_id: "litter-1",
      owner_scope: "litter",
      owner_id: "litter-1",
      owner_name: "Whole litter",
      title: "Measure temperature",
      record_type: "temperature",
      schedule_mode: "interval",
      interval_minutes: 240,
      enabled: true,
      status: "scheduled",
      minutes_until_due: 120,
    };
    window.__reminderCalls = [];
    const hass = {
      language: "en",
      locale: { language: "en" },
      callWS: async (message) => {
        window.__reminderCalls.push(structuredClone(message));
        if (message.type === "puppy_tracker/litters") {
          return { litters: [{ id: "litter-1", name: "Test litter" }] };
        }
        if (message.type === "puppy_tracker/data") {
          return { litter: { id: "litter-1", name: "Test litter" }, puppies: [] };
        }
        if (message.type === "puppy_tracker/recurring_reminders") {
          return { reminders: reminder.deleted ? [] : [reminder] };
        }
        if (message.type === "puppy_tracker/recurring_reminder/delete") {
          reminder.deleted = true;
          return { ok: true };
        }
        throw new Error(`Unexpected websocket call: ${message.type}`);
      },
      connection: { subscribeMessage: async () => () => undefined },
    };
    const card = document.createElement("puppy-tracker-recurring-reminder-card");
    card.setConfig({ litter_id: "litter-1" });
    card.hass = hass;
    document.getElementById("cards").append(card);
  });

  const card = page.locator("puppy-tracker-recurring-reminder-card");
  await expect(card.locator(".item")).toHaveCount(1);
  await card.locator("button.edit").click();
  await expect(card.locator("#save-reminder")).toBeVisible();
  await card.locator("#delete-reminder").click();

  await expect(card.locator(".item")).toHaveCount(0);
  await expect(card.locator("#save-reminder")).toHaveCount(0);
  await expect(card.locator("#cancel-reminder")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.__reminderCalls.filter(
    (message) => message.type === "puppy_tracker/recurring_reminder/delete",
  ).length)).toBe(1);
  expect(await page.evaluate(() => window.__reminderCalls.some(
    (message) => message.type === "puppy_tracker/recurring_reminder/create"
      || message.type === "puppy_tracker/recurring_reminder/update",
  ))).toBe(false);
});
