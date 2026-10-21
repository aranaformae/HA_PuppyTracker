import { expect, test } from "@playwright/test";

for (const language of ["nl", "en"]) {
  test(`puppy selectors consistently identify collar colours (${language}) @cross-browser @tablet`, async ({ page }) => {
    await page.goto("/tests/e2e/cards.html?production");
    await page.waitForFunction(() => window.__puppyTrackerReady === true);
    expect(await page.evaluate(() => window.__puppyTrackerModuleErrors)).toEqual([]);
    await page.evaluate((language) => {
      const puppies = [
        { id: "p1", name: "Alice", collar_color: "Red" },
        { id: "p2", name: "Alice", collar_color: "Blue" },
        { id: "p3", name: "Bob", collar_color: "" },
        { id: "p4", name: "Red", collar_color: "red" },
        { id: "p5", name: "", collar_color: "Green" },
      ].map((puppy) => ({ ...puppy, active: true, records: [], measurements: [], summary: {} }));
      const data = { can_manage_records: true, can_manage_measurements: true, litter: { id: "l1", name: "Luna litter", mother: "Luna", mother_id: "m1", records: [], summary: { dossier_actions: { actions: [] } } }, puppies };
      const hass = {
        user: { is_admin: true }, locale: { language }, language, states: {},
        connection: { subscribeMessage: async () => async () => {} },
        callWS: async (message) => {
          if (message.type === "puppy_tracker/litters") return { litters: [{ id: "l1", name: "Luna litter", active: true }] };
          if (message.type === "puppy_tracker/data") return structuredClone(data);
          if (message.type === "puppy_tracker/owners/list") return { owners: [] };
          if (message.type === "puppy_tracker/recurring_reminders") return { reminders: [] };
          if (message.type === "puppy_tracker/mother/records") return { owner: { id: "m1", name: "Luna" }, records: [], can_manage_records: true };
          if (message.type === "puppy_tracker/records") return { records: [], can_manage_records: true };
          throw new Error(`Unexpected command: ${message.type}`);
        },
      };
      for (const surface of ["dossier", "quick-log", "temperature", "behavior", "report", "bulk-dossier", "owner", "recurring-reminder"]) {
        const card = document.createElement(`puppy-tracker-${surface}-card`);
        card.setConfig({ litter_id: "l1", default_selected: "puppy", puppy_id: "p1", show_history: true });
        document.querySelector("#cards").append(card);
        card.hass = hass;
      }
    }, language);

    const labels = ["Alice (Red)", "Alice (Blue)", "Bob", "Red", `${language === "nl" ? "Pup" : "Puppy"} (Green)`];
    for (const [surface, selector] of [
      ["dossier", "#owner-select"], ["quick-log", "#owner-select"],
      ["temperature", "#puppy-select"], ["behavior", "#behavior-puppy"], ["report", "#puppy"],
      ["owner", "#link-puppy"],
    ]) {
      const select = page.locator(`puppy-tracker-${surface}-card ${selector}`);
      for (let index = 0; index < labels.length; index += 1) await expect(select.locator(`option[value="p${index + 1}"]`)).toHaveText(labels[index]);
      await expect(select).toHaveValue(surface === "report" ? "__litter__" : "p1");
      await select.selectOption("p2");
      await expect(select).toHaveValue("p2");
    }
    await expect(page.locator("puppy-tracker-bulk-dossier-card .puppy-option span")).toHaveText(labels);
    const reminders = page.locator("puppy-tracker-recurring-reminder-card");
    await reminders.locator("#add-reminder").click();
    for (let index = 0; index < labels.length; index += 1) await expect(reminders.locator(`#rem-owner option[value="puppy:p${index + 1}"]`)).toHaveText(`${language === "nl" ? "Pup" : "Puppy"} · ${labels[index]}`);

    const owners = page.locator("puppy-tracker-owner-card");
    await owners.locator("#add-owner").click();
    const preferences = owners.locator('select[name="preference_puppy_1"]');
    await expect(preferences.locator('option[value="p1"]')).toHaveText("Luna litter · Alice (Red)");
    await expect(preferences.locator('option[value="p2"]')).toHaveText("Luna litter · Alice (Blue)");
  });
}

test("selector label edge cases do not invent colours or mutate the puppy", async ({ page }) => {
  await page.goto("/tests/e2e/cards.html");
  const labels = await page.evaluate(async () => {
    const { puppySelectorLabel } = await import("/custom_components/puppy_tracker/frontend/puppy-tracker-card-common.js");
    const puppy = { id: "p1", name: " Alice ", collar_color: " Red " };
    const before = JSON.stringify(puppy);
    return { values: [puppySelectorLabel(puppy), puppySelectorLabel({ name: "Bob" }), puppySelectorLabel({ name: "Red", collar_color: "red" }), puppySelectorLabel({ collar_color: "Blue" }, "Pup"), puppySelectorLabel({ name: "<Alice>", collar_color: "A&B" }), puppySelectorLabel({ name: "Nova", collar_color: "paars" }), puppySelectorLabel({ name: " Paars ", collar_color: "paars" }), puppySelectorLabel({ name: "Nova (paars)", collar_color: "paars" })], unchanged: before === JSON.stringify(puppy) };
  });
  expect(labels.values).toEqual(["Alice (Red)", "Bob", "Red", "Pup (Blue)", "<Alice> (A&B)", "Nova (paars)", "Paars", "Nova (paars)"]);
  expect(labels.unchanged).toBe(true);
});
