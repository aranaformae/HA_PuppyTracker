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

  await vaccination.click();
  await expect(vaccination).not.toHaveClass(/active/);
  await expect(all).not.toHaveClass(/active/);
  await expect(weightRow).toBeHidden();
  await expect(vaccinationRow).toBeHidden();
  await expect(testRow).toBeHidden();

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

test("Attention filters care-program-only rows and supports empty selections", async ({ page }) => {
  await openFixture(page);

  await page.evaluate(() => {
    const card = document.createElement("puppy-tracker-attention-card");
    card._hass = {
      language: "nl",
      locale: { language: "nl" },
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
        summary: {
          needs_attention: false,
          dossier_actions: { actions: [] },
        },
      }],
    };
    card.__careOccurrences = [
      {
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
      },
      {
        id: "temperature:pup-1:4",
        program_id: "temperature",
        litter_id: "litter-1",
        puppy_id: "pup-1",
        puppy_name: "Blue",
        title: "Temperatuur",
        record_type: "temperature",
        age_days: 4,
        status: "due_today",
        days_until_due: 0,
        result_fields: [],
      },
    ];
    card.__attentionAcknowledgements = {};
    card.setConfig({ title: "Aandacht", show_litter_selector: false });
    document.querySelector("#cards").appendChild(card);
    card._render();
  });

  const card = page.locator("puppy-tracker-attention-card");
  const all = card.locator('[data-attention-filter-type="__all__"]');
  const testType = card.locator('[data-attention-filter-type="test"]');
  const temperature = card.locator('[data-attention-filter-type="temperature"]');
  const testRow = card.locator('[data-attention-type="test"]');
  const temperatureRow = card.locator('[data-attention-type="temperature"]');

  await expect(testType).toBeVisible();
  await expect(temperature).toBeVisible();
  await expect(testRow).toBeVisible();
  await expect(temperatureRow).toBeVisible();

  await all.click();
  await expect(all).not.toHaveClass(/active/);
  await expect(testType).not.toHaveClass(/active/);
  await expect(temperature).not.toHaveClass(/active/);
  await expect(testRow).toBeHidden();
  await expect(temperatureRow).toBeHidden();
  await expect(card.getByText("Geen meldingen voor de geselecteerde types.", { exact: true })).toBeVisible();
});

test("Attention can limit care program rows to today", async ({ page }) => {
  await openFixture(page);

  await page.evaluate(() => {
    const card = document.createElement("puppy-tracker-attention-card");
    card._hass = {
      language: "nl",
      locale: { language: "nl" },
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
        summary: {
          needs_attention: false,
          dossier_actions: { actions: [] },
        },
      }],
    };
    card.__careOccurrences = [
      {
        id: "today:pup-1:3",
        program_id: "today",
        litter_id: "litter-1",
        puppy_id: "pup-1",
        puppy_name: "Blue",
        title: "Vandaag prik",
        record_type: "vaccination",
        age_days: 3,
        status: "due_today",
        days_until_due: 0,
        result_fields: [],
      },
      {
        id: "future:pup-1:5",
        program_id: "future",
        litter_id: "litter-1",
        puppy_id: "pup-1",
        puppy_name: "Blue",
        title: "Toekomst prik",
        record_type: "vaccination",
        age_days: 5,
        status: "upcoming",
        days_until_due: 2,
        result_fields: [],
      },
    ];
    card.__attentionAcknowledgements = {};
    card.setConfig({ title: "Aandacht", show_litter_selector: false, show_today_only: true });
    document.querySelector("#cards").appendChild(card);
    card._render();
  });

  const card = page.locator("puppy-tracker-attention-card");
  await expect(card.getByText("Vandaag prik")).toBeVisible();
  await expect(card.getByText("Toekomst prik")).toHaveCount(0);
});

test("Attention can exclude one care program without hiding weight attention", async ({ page }) => {
  await openFixture(page);

  await page.evaluate(() => {
    const card = document.createElement("puppy-tracker-attention-card");
    card._hass = {
      language: "nl",
      locale: { language: "nl" },
      callWS: async () => ({}),
    };
    card._selectedLitterId = "litter-1";
    card._litters = [{ id: "litter-1", name: "Litter", active: true }];
    card._data = {
      litter: { id: "litter-1", name: "Litter", summary: { dossier_actions: { actions: [] } } },
      puppies: [{
        id: "pup-1",
        name: "Blue",
        active: true,
        summary: {
          needs_attention: true,
          status_code: "growth_low",
          status: "Aandacht",
          dossier_actions: { actions: [] },
        },
      }],
    };
    card.__careOccurrences = [
      {
        id: "included:pup-1:3",
        program_id: "included",
        puppy_id: "pup-1",
        puppy_name: "Blue",
        title: "Wel zichtbaar",
        record_type: "test",
        age_days: 3,
        status: "due_today",
        days_until_due: 0,
        counts_for_attention: true,
        result_fields: [],
      },
      {
        id: "excluded:pup-1:3",
        program_id: "excluded",
        puppy_id: "pup-1",
        puppy_name: "Blue",
        title: "Niet voor aandacht",
        record_type: "note",
        age_days: 3,
        status: "due_today",
        days_until_due: 0,
        counts_for_attention: false,
        result_fields: [],
      },
    ];
    card.__attentionAcknowledgements = {};
    card.setConfig({ title: "Aandacht", show_litter_selector: false });
    document.querySelector("#cards").appendChild(card);
    card._render();
  });

  const card = page.locator("puppy-tracker-attention-card");
  await expect(card.locator('[data-attention-type="weight"]')).toBeVisible();
  await expect(card.getByText("Wel zichtbaar")).toBeVisible();
  await expect(card.getByText("Niet voor aandacht")).toHaveCount(0);
});
