import { expect, test } from "@playwright/test";

test("behavior surface saves observations and builds a neutral profile", async ({ page }) => {
  await page.goto("/tests/e2e/cards.html");
  await page.waitForFunction(() => window.__puppyTrackerReady === true);
  await page.evaluate(() => {
    const puppies = [{
      id: "p1", name: "Alice", collar_color: "Roze", active: true,
      birth_time: "2026-09-01T10:00:00+00:00", records: [],
    }];
    const clone = (value) => JSON.parse(JSON.stringify(value));
    const calls = [];
    const hass = {
      locale: { language: "nl" }, language: "nl", states: {},
      connection: { subscribeMessage: async () => async () => {} },
      callWS: async (message) => {
        calls.push(clone(message));
        if (message.type === "puppy_tracker/litters") return { litters: [{ id: "l1", name: "Luna x Dutch", active: true }] };
        if (message.type === "puppy_tracker/data") return { can_manage_records: true, litter: { id: "l1", name: "Luna x Dutch" }, puppies: clone(puppies) };
        if (message.type === "puppy_tracker/record/add") {
          puppies[0].records.push({ id: "behavior-1", type: message.record_type, occurred_at: message.occurred_at, note: message.note, data: clone(message.data), deleted: false });
          return { ok: true };
        }
        throw new Error(`Unexpected WS call: ${message.type}`);
      },
    };
    window.__behaviorCalls = calls;
    const card = document.createElement("puppy-tracker-behavior-card");
    card.setConfig({ show_litter_selector: true });
    document.querySelector("#cards").append(card);
    card.hass = hass;
  });

  const card = page.locator("puppy-tracker-behavior-card");
  await expect(card.getByText("Nog geen gedragsobservaties voor deze pup.", { exact: true }).first()).toBeVisible();
  await card.locator("#behavior-add").click();
  await card.locator("#behavior-observer").fill("Fabien");
  await card.locator('[data-score-key="curiosity"][value="4"] + span').click();
  await card.locator('[data-score-key="confidence"][value="5"] + span').click();
  await card.locator('[data-score-clear="confidence"]').click();
  await card.locator('[data-score-key="calm"][value="2"] + span').click();
  await card.locator("#behavior-note").fill("Rustige observatie");
  await card.locator("#behavior-save").click();

  await expect(card.getByText("Gedragsobservatie opgeslagen.", { exact: true })).toBeVisible();
  await expect(card.locator(".stat").first()).toContainText("3");
  await expect(card.getByText("Rustige observatie", { exact: true })).toBeVisible();

  const call = await page.evaluate(() => window.__behaviorCalls.find((item) => item.type === "puppy_tracker/record/add"));
  expect(call).toMatchObject({
    litter_id: "l1",
    puppy_id: "p1",
    record_type: "behavior_observation",
    data: { scores: { curiosity: 4, calm: 2 }, observer: "Fabien" },
  });
});
