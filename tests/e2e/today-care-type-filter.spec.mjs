import { expect, test } from "@playwright/test";

async function openFixture(page) {
  await page.goto("/tests/e2e/cards.html");
  await page.waitForFunction(() => window.__puppyTrackerReady === true);
  expect(await page.evaluate(() => window.__puppyTrackerModuleErrors)).toEqual([]);
}

test("Today care type chips inclusively control a bounded scrollable care list", async ({ page }) => {
  await openFixture(page);

  await page.evaluate(() => {
    const hass = {
      locale: { language: "nl" },
      language: "nl",
      states: {},
      connection: {
        subscribeMessage: async () => async () => {},
      },
      callWS: async (message) => {
        if (message.type === "puppy_tracker/litters") {
          return { litters: [{ id: "l1", name: "Luna x Dutch", active: true }] };
        }
        if (message.type === "puppy_tracker/data") {
          return {
            litter: {
              id: "l1",
              name: "Luna x Dutch",
              active: true,
              summary: {
                active_puppies: 1,
                attention_count: 0,
                dossier_actions: { actions: [] },
              },
            },
            puppies: [{
              id: "p1",
              name: "Alice",
              active: true,
              summary: { needs_attention: false },
            }],
          };
        }
        if (message.type === "puppy_tracker/care_occurrences") {
          return {
            occurrences: [
              {
                id: "ens:p1:3",
                program_id: "ens",
                litter_id: "l1",
                puppy_id: "p1",
                puppy_name: "Alice",
                title: "ENS",
                record_type: "test",
                age_days: 3,
                status: "due_today",
                days_until_due: 0,
                result_fields: [],
              },
              {
                id: "vaccination:p1:42",
                program_id: "vaccination",
                litter_id: "l1",
                puppy_id: "p1",
                puppy_name: "Alice",
                title: "Puppyvaccinatie",
                record_type: "vaccination",
                age_days: 42,
                status: "upcoming",
                days_until_due: 1,
                result_fields: [],
              },
              {
                id: "deworming:p1:14",
                program_id: "deworming",
                litter_id: "l1",
                puppy_id: "p1",
                puppy_name: "Alice",
                title: "Ontworming",
                record_type: "deworming",
                age_days: 14,
                status: "overdue",
                days_until_due: -1,
                result_fields: [],
              },
              ...Array.from({ length: 16 }, (_, index) => ({
                id: `test-extra:p1:${index}`,
                program_id: "test-extra",
                litter_id: "l1",
                puppy_id: "p1",
                puppy_name: "Alice",
                title: `Extra test ${index + 1}`,
                record_type: "test",
                age_days: 4 + index,
                status: "upcoming",
                days_until_due: Math.min(7, index + 1),
                result_fields: [],
              })),
            ],
            skipped: [],
          };
        }
        throw new Error(`Unexpected WS call: ${message.type}`);
      },
    };

    const card = document.createElement("puppy-tracker-today-card");
    card.setConfig({ title: "Vandaag", show_litter_selector: false });
    document.querySelector("#cards").appendChild(card);
    card.hass = hass;
  });

  const card = page.locator("puppy-tracker-today-card");
  const all = card.locator('[data-today-care-filter-type="__all__"]');
  const vaccination = card.locator('[data-today-care-filter-type="vaccination"]');
  const deworming = card.locator('[data-today-care-filter-type="deworming"]');
  const testType = card.locator('[data-today-care-filter-type="test"]');
  const ensRow = card.locator('[data-care-occurrence="ens:p1:3"]');
  const vaccinationRow = card.locator('[data-care-occurrence="vaccination:p1:42"]');
  const dewormingRow = card.locator('[data-care-occurrence="deworming:p1:14"]');
  const careList = card.locator(".care-list");

  await expect(card.locator(".care-summary")).toBeVisible();
  await expect(all).toContainText("Alles");
  await expect(vaccination).toContainText("Vaccinatie");
  await expect(deworming).toContainText("Ontworming");
  await expect(testType).toContainText("Test");
  await expect(all).toHaveClass(/active/);
  await expect(vaccination).toHaveClass(/active/);
  await expect(deworming).toHaveClass(/active/);
  await expect(testType).toHaveClass(/active/);
  await expect(ensRow).toBeVisible();
  await expect(vaccinationRow).toBeVisible();
  await expect(dewormingRow).toBeVisible();

  const scrollState = await careList.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      maxHeight: style.maxHeight,
      overflowY: style.overflowY,
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    };
  });
  expect(scrollState.maxHeight).toBe("520px");
  expect(scrollState.overflowY).toBe("auto");
  expect(scrollState.clientHeight).toBeLessThanOrEqual(520);
  expect(scrollState.scrollHeight).toBeGreaterThan(scrollState.clientHeight);

  await vaccination.click();
  await expect(vaccination).not.toHaveClass(/active/);
  await expect(all).not.toHaveClass(/active/);
  await expect(vaccinationRow).toBeHidden();
  await expect(ensRow).toBeVisible();
  await expect(dewormingRow).toBeVisible();

  await testType.click();
  await expect(testType).not.toHaveClass(/active/);
  await expect(ensRow).toBeHidden();
  await expect(dewormingRow).toBeVisible();

  // The last active type cannot be deselected, matching Timeline/Attention.
  await deworming.click();
  await expect(deworming).toHaveClass(/active/);
  await expect(dewormingRow).toBeVisible();

  await all.click();
  await expect(all).toHaveClass(/active/);
  await expect(vaccination).toHaveClass(/active/);
  await expect(deworming).toHaveClass(/active/);
  await expect(testType).toHaveClass(/active/);
  await expect(ensRow).toBeVisible();
  await expect(vaccinationRow).toBeVisible();
  await expect(dewormingRow).toBeVisible();
});
