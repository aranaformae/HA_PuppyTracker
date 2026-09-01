import { expect, test } from "@playwright/test";

async function openFixture(page) {
  await page.goto("/tests/e2e/cards.html");
  await page.waitForFunction(() => window.__puppyTrackerReady === true);
}

test("Attention type chips show exactly the selected alert types", async ({ page }) => {
  await openFixture(page);

  const result = await page.evaluate(() => {
    const card = document.createElement("puppy-tracker-attention-card");
    card._hass = {
      language: "en",
      locale: { language: "en" },
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
          needs_attention: false,
          dossier_actions: {
            actions: [
              {
                id: "record-vax:next_due_date",
                due_soon: true,
                record_type: "vaccination",
                due_date: "2026-09-01",
                status: "due_today",
                days_until_due: 0,
              },
              {
                id: "record-worm:next_due_date",
                due_soon: true,
                record_type: "deworming",
                due_date: "2026-09-01",
                status: "due_today",
                days_until_due: 0,
              },
              {
                id: "record-med:next_due_date",
                due_soon: true,
                record_type: "medication",
                due_date: "2026-09-01",
                status: "due_today",
                days_until_due: 0,
              },
            ],
          },
        },
      }],
    };
    card.__attentionAcknowledgements = {};
    card.setConfig({ title: "Attention", show_litter_selector: false });
    document.querySelector("#cards").appendChild(card);
    card._render();

    const snapshot = () => ({
      visible: Array.from(card.shadowRoot.querySelectorAll(".list > .row:not([hidden])"))
        .map((row) => row.dataset.attentionType)
        .sort(),
      active: Array.from(card.shadowRoot.querySelectorAll("[data-attention-filter-type].active"))
        .map((button) => button.dataset.attentionFilterType)
        .sort(),
    });

    const initial = snapshot();

    card.shadowRoot.querySelector('[data-attention-filter-type="deworming"]')?.click();
    const withoutDeworming = snapshot();

    card.shadowRoot.querySelector('[data-attention-filter-type="vaccination"]')?.click();
    const medicationOnly = snapshot();

    card.shadowRoot.querySelector('[data-attention-filter-type="medication"]')?.click();
    const lastTypeCannotBeDeselected = snapshot();

    card.shadowRoot.querySelector('[data-attention-filter-type="__all__"]')?.click();
    const restoredAll = snapshot();

    return {
      initial,
      withoutDeworming,
      medicationOnly,
      lastTypeCannotBeDeselected,
      restoredAll,
      hasLegacySelect: Boolean(card.shadowRoot.querySelector("#attention-type-filter")),
    };
  });

  expect(result.initial.visible).toEqual(["deworming", "medication", "vaccination"]);
  expect(result.initial.active).toEqual(["__all__", "deworming", "medication", "vaccination"]);

  expect(result.withoutDeworming.visible).toEqual(["medication", "vaccination"]);
  expect(result.withoutDeworming.active).toEqual(["medication", "vaccination"]);

  expect(result.medicationOnly.visible).toEqual(["medication"]);
  expect(result.medicationOnly.active).toEqual(["medication"]);

  expect(result.lastTypeCannotBeDeselected.visible).toEqual(["medication"]);
  expect(result.lastTypeCannotBeDeselected.active).toEqual(["medication"]);

  expect(result.restoredAll.visible).toEqual(["deworming", "medication", "vaccination"]);
  expect(result.restoredAll.active).toEqual(["__all__", "deworming", "medication", "vaccination"]);
  expect(result.hasLegacySelect).toBe(false);
});
