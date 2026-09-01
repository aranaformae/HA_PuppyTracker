import { expect, test } from "@playwright/test";

async function openFixture(page) {
  await page.goto("/tests/e2e/cards.html");
  await page.waitForFunction(() => window.__puppyTrackerReady === true);
  expect(await page.evaluate(() => window.__puppyTrackerModuleErrors)).toEqual([]);
}

test("Attention chips hide deselected alert types without losing acknowledgement actions", async ({ page }) => {
  await openFixture(page);

  await page.evaluate(() => {
    const card = document.createElement("puppy-tracker-attention-card");
    card._hass = {
      language: "nl",
      locale: { language: "nl" },
      callWS: async () => ({}),
    };
    card._selectedLitterId = "litter-1";
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
        summary: {
          needs_attention: true,
          status_code: "growth_low",
          status: "Aandacht",
          latest_measurement_id: "m-1",
          dossier_actions: {
            actions: [{
              id: "record-vax:next_due_date",
              due_soon: true,
              record_type: "vaccination",
              due_date: "2026-09-01",
              status: "due_today",
              days_until_due: 0,
            }],
          },
        },
      }],
    };
    card.__careOccurrences = [{
      id: "ens:pup-1:3",
      program_id: "ens",
      litter_id: "litter-1",
      puppy_id: "pup-1",
      puppy_name: "Blue",
      title: "ENS",
      record_type: "test",
      age_days: 3,
      status: "due_today",
      days_until_due: 0,
      result_fields: [],
    }];
    card.__attentionAcknowledgements = {};
    card.setConfig({ title: "Aandacht", show_litter_selector: false });
    document.querySelector("#cards").appendChild(card);
    card._render();
  });

  const card = page.locator("puppy-tracker-attention-card");
  const all = card.locator('[data-attention-filter-type="__all__"]');
  const weight = card.locator('[data-attention-filter-type="weight"]');
  const vaccination = card.locator('[data-attention-filter-type="vaccination"]');
  const testType = card.locator('[data-attention-filter-type="test"]');
  const weightRow = card.locator('[data-attention-type="weight"]');
  const vaccinationRow = card.locator('[data-attention-type="vaccination"]');
  const testRow = card.locator('[data-attention-type="test"]');

  await expect(all).toHaveClass(/active/);
  await expect(weight).toHaveClass(/active/);
  await expect(vaccination).toHaveClass(/active/);
  await expect(testType).toHaveClass(/active/);
  await expect(weightRow).toBeVisible();
  await expect(vaccinationRow).toBeVisible();
  await expect(testRow).toBeVisible();
  await expect(weightRow.locator(":scope > .attention-ack-button")).toBeVisible();
  await expect(vaccinationRow.locator(":scope > .attention-ack-button")).toBeVisible();
  await expect(testRow.locator(":scope > .attention-ack-button")).toBeVisible();

  await weight.click();
  await expect(weight).not.toHaveClass(/active/);
  await expect(weightRow).toBeHidden();
  await expect(vaccinationRow).toBeVisible();
  await expect(testRow).toBeVisible();

  await testType.click();
  await expect(testType).not.toHaveClass(/active/);
  await expect(weightRow).toBeHidden();
  await expect(testRow).toBeHidden();
  await expect(vaccinationRow).toBeVisible();
  await expect(vaccinationRow.locator(":scope > .attention-ack-button")).toBeVisible();

  // The last selected type cannot be disabled, matching Timeline behavior.
  await vaccination.click();
  await expect(vaccination).toHaveClass(/active/);
  await expect(vaccinationRow).toBeVisible();
  await expect(vaccinationRow.locator(":scope > .attention-ack-button")).toBeVisible();

  await all.click();
  await expect(all).toHaveClass(/active/);
  await expect(weight).toHaveClass(/active/);
  await expect(vaccination).toHaveClass(/active/);
  await expect(testType).toHaveClass(/active/);
  await expect(weightRow).toBeVisible();
  await expect(vaccinationRow).toBeVisible();
  await expect(testRow).toBeVisible();
  await expect(testRow.locator(":scope > .attention-ack-button")).toBeVisible();

  await testType.click();
  await expect(testRow).toBeHidden();
  await expect(vaccinationRow.locator(":scope > .attention-ack-button")).toBeVisible();
  await expect(card.locator("#attention-type-filter")).toHaveCount(0);
});
