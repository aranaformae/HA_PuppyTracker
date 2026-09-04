import { expect, test } from "@playwright/test";

async function openFixture(page) {
  await page.goto("/tests/e2e/cards.html");
  await page.waitForFunction(() => window.__puppyTrackerReady === true);
}

test("temperature card shows selected puppy readings and saves a note", async ({ page }) => {
  await openFixture(page);
  await page.evaluate(() => {
    const now = new Date().toISOString();
    const records = {
      p1: [{ id: "temp-1", type: "temperature", occurred_at: now, created_at: now, deleted: false, note: "Rustig", data: { temperature_c: 38.4, method: "Rectaal" } }],
      p2: [],
    };
    const puppies = [
      { id: "p1", name: "Alice", active: true, records: records.p1 },
      { id: "p2", name: "Bob", active: true, records: records.p2 },
    ];
    const clone = (value) => JSON.parse(JSON.stringify(value));
    const hass = {
      locale: { language: "nl" },
      language: "nl",
      states: {},
      connection: { subscribeMessage: async () => async () => {} },
      callWS: async (message) => {
        if (message.type === "puppy_tracker/litters") return { litters: [{ id: "l1", name: "Luna x Dutch", active: true }] };
        if (message.type === "puppy_tracker/data") return { litter: { id: "l1", name: "Luna x Dutch", mother: "Luna", records: [] }, puppies: clone(puppies) };
        if (message.type === "puppy_tracker/mother/records") return { records: [] };
        if (message.type === "puppy_tracker/record/add") {
          const record = { id: "temp-2", type: message.record_type, occurred_at: message.occurred_at, created_at: now, deleted: false, note: message.note, data: clone(message.data) };
          records[message.puppy_id].push(record);
          return { record };
        }
        throw new Error(`Unexpected WS call: ${message.type}`);
      },
    };
    const Card = customElements.get("puppy-tracker-temperature-card");
    const card = document.createElement("puppy-tracker-temperature-card");
    card.setConfig({ default_scope: "puppy", default_range: "all" });
    document.querySelector("#cards").append(card);
    card.hass = hass;
  });

  const card = page.locator("puppy-tracker-temperature-card");
  await expect(card.locator("#scope-select")).toHaveValue("puppy");
  await expect(card.locator("section.latest strong")).toHaveText("38,4 °C");
  await expect(card.getByText("Rustig", { exact: true })).toBeVisible();
  await card.locator("#add-temperature").click();
  await card.locator("#temperature-value").fill("38.6");
  await card.locator("#temperature-note").fill("Na voeding");
  await card.locator("form.editor").evaluate((form) => form.requestSubmit());
  await expect(card.getByText("Temperatuur opgeslagen.", { exact: true })).toBeVisible();
});
