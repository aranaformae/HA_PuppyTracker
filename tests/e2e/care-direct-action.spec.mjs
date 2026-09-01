import { expect, test } from "@playwright/test";

async function openFixture(page) {
  await page.goto("/tests/e2e/cards.html");
  await page.waitForFunction(() => window.__puppyTrackerReady === true);
  expect(await page.evaluate(() => window.__puppyTrackerModuleErrors)).toEqual([]);
}

test("Attention shows care Complete action beside Acknowledge", async ({ page }) => {
  await openFixture(page);

  await page.evaluate(() => {
    const card = document.createElement("puppy-tracker-attention-card");
    card._hass = {
      language: "en",
      locale: { language: "en" },
      callWS: async () => ({}),
    };
    card._selectedLitterId = "litter-1";
    card._litters = [{ id: "litter-1", name: "Litter", active: true }];
    card._data = {
      litter: {
        id: "litter-1",
        name: "Litter",
        summary: { dossier_actions: { actions: [] } },
      },
      puppies: [{
        id: "pup-1",
        name: "Blue",
        active: true,
        summary: { needs_attention: false, dossier_actions: { actions: [] } },
      }],
    };
    card.__careOccurrences = [{
      id: "program-1:pup-1:3",
      program_id: "program-1",
      litter_id: "litter-1",
      puppy_id: "pup-1",
      puppy_name: "Blue",
      title: "ENS",
      record_type: "test",
      age_days: 3,
      status: "due_today",
      days_until_due: 0,
      result_fields: ["result", "note"],
    }];
    card.__attentionAcknowledgements = {};
    card.setConfig({ title: "Attention", show_litter_selector: false });
    document.querySelector("#cards").appendChild(card);
    card._render();
  });

  const card = page.locator("puppy-tracker-attention-card");
  const row = card.locator('[data-care-occurrence="program-1:pup-1:3"]');
  await expect(row).toBeVisible();
  await expect(row.getByRole("button", { name: "Complete care action" })).toBeVisible();
  await expect(row.getByRole("button", { name: "Acknowledge" })).toBeVisible();

  await row.getByRole("button", { name: "Complete care action" }).click();
  await expect(card.locator(".care-result-dialog")).toBeVisible();
});
