import { expect, test } from "@playwright/test";

async function openFixture(page) {
  await page.goto("/tests/e2e/cards.html");
  await page.waitForFunction(() => window.__puppyTrackerReady === true);
  expect(await page.evaluate(() => window.__puppyTrackerModuleErrors)).toEqual([]);
}

test("Today combines today's timeline and care items behind one inclusive scrollable filter", async ({ page }) => {
  await openFixture(page);

  await page.evaluate(() => {
    const now = new Date();
    const at = (dayOffset, hour) => new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + dayOffset,
      hour,
      0,
      0,
      0,
    )).toISOString();

    const hass = {
      locale: { language: "nl" },
      language: "nl",
      config: { time_zone: "UTC" },
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
              records: [
                {
                  id: "litter-note-today",
                  scope: "litter",
                  type: "note",
                  title: "Nestcontrole",
                  occurred_at: at(0, 9),
                  created_at: at(0, 9),
                  data: {},
                },
                {
                  id: "litter-old",
                  scope: "litter",
                  type: "milestone",
                  title: "Gisteren",
                  occurred_at: at(-1, 12),
                  created_at: at(-1, 12),
                  data: {},
                },
              ],
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
              measurements: [{
                id: "weight-today",
                weight: 428,
                timestamp: at(0, 10),
                created_at: at(0, 10),
                status: "active",
              }],
              records: [{
                id: "test-today",
                scope: "puppy",
                puppy_id: "p1",
                puppy_name: "Alice",
                type: "test",
                title: "ENS observatie",
                occurred_at: at(0, 11),
                created_at: at(0, 11),
                data: { result: "rustig" },
              }],
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
  const all = card.locator('[data-today-filter-type="__all__"]');
  const weight = card.locator('[data-today-filter-type="weight"]');
  const note = card.locator('[data-today-filter-type="note"]');
  const vaccination = card.locator('[data-today-filter-type="vaccination"]');
  const deworming = card.locator('[data-today-filter-type="deworming"]');
  const testType = card.locator('[data-today-filter-type="test"]');
  const weightTimeline = card.locator('[data-today-event^="weight:p1:"]');
  const noteTimeline = card.locator('[data-today-event="record:litter:litter-note-today"]');
  const testTimeline = card.locator('[data-today-event="record:puppy:test-today"]');
  const oldTimeline = card.locator('[data-today-event="record:litter:litter-old"]');
  const ensCare = card.locator('[data-care-occurrence="ens:p1:3"]');
  const vaccinationCare = card.locator('[data-care-occurrence="vaccination:p1:42"]');
  const dewormingCare = card.locator('[data-care-occurrence="deworming:p1:14"]');
  const scroll = card.locator(".today-items-scroll");

  await expect(card.locator(".today-timeline-section")).toBeVisible();
  await expect(card.locator(".today-group-title")).toContainText("Tijdlijn vandaag");
  await expect(all).toHaveClass(/active/);
  await expect(weight).toHaveClass(/active/);
  await expect(note).toHaveClass(/active/);
  await expect(vaccination).toHaveClass(/active/);
  await expect(deworming).toHaveClass(/active/);
  await expect(testType).toHaveClass(/active/);
  await expect(weightTimeline).toBeVisible();
  await expect(noteTimeline).toBeVisible();
  await expect(testTimeline).toBeVisible();
  await expect(oldTimeline).toHaveCount(0);
  await expect(ensCare).toBeVisible();
  await expect(vaccinationCare).toBeVisible();
  await expect(dewormingCare).toBeVisible();

  const scrollState = await scroll.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      maxHeight: style.maxHeight,
      overflowY: style.overflowY,
      clientHeight: element.clientHeight,
    };
  });
  expect(scrollState.maxHeight).toBe("520px");
  expect(scrollState.overflowY).toBe("auto");
  expect(scrollState.clientHeight).toBeLessThanOrEqual(520);

  // The care list must grow to its full content height so the outer Today list is
  // the only potential scroll container. WebKit may compute overflow-y as "auto"
  // even when an unbounded element is not scrollable, so assert actual behavior.
  const nestedCareScroll = await card.locator(".care-list").evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      maxHeight: style.maxHeight,
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    };
  });
  expect(nestedCareScroll.maxHeight).toBe("none");
  expect(nestedCareScroll.scrollHeight).toBeLessThanOrEqual(nestedCareScroll.clientHeight + 1);

  await weight.click();
  await expect(weight).not.toHaveClass(/active/);
  await expect(weightTimeline).toBeHidden();
  await expect(noteTimeline).toBeVisible();
  await expect(testTimeline).toBeVisible();
  await expect(ensCare).toBeVisible();

  // Test controls both today's test records and care-program test occurrences.
  await testType.click();
  await expect(testType).not.toHaveClass(/active/);
  await expect(weightTimeline).toBeHidden();
  await expect(testTimeline).toBeHidden();
  await expect(ensCare).toBeHidden();
  await expect(noteTimeline).toBeVisible();
  await expect(vaccinationCare).toBeVisible();
  await expect(dewormingCare).toBeVisible();

  await all.click();
  await expect(all).toHaveClass(/active/);
  await expect(weight).toHaveClass(/active/);
  await expect(testType).toHaveClass(/active/);
  await expect(weightTimeline).toBeVisible();
  await expect(testTimeline).toBeVisible();
  await expect(ensCare).toBeVisible();
});
