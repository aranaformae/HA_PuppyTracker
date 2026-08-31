import { expect, test } from "@playwright/test";

function litterData() {
  return {
    api_version: 9,
    can_manage_measurements: true,
    can_manage_records: true,
    litter: {
      id: "litter-1",
      name: "Luna 2026",
      records: [
        {
          id: "litter-note",
          type: "note",
          scope: "litter",
          litter_id: "litter-1",
          puppy_id: null,
          occurred_at: "2026-08-31T00:30:00Z",
          created_at: "2026-08-31T00:30:00Z",
          deleted: false,
          title: "Nestcontrole",
          note: "Alles rustig",
          data: {},
        },
      ],
    },
    puppies: [
      {
        id: "puppy-1",
        name: "Groen",
        measurements: [
          {
            id: "weight-new",
            weight: 520,
            timestamp: "2026-08-31T04:00:00Z",
            created_at: "2026-08-31T04:00:00Z",
            deleted: false,
            superseded_by: null,
            kind: "weight",
            note: "Na voeding",
          },
        ],
        records: [
          {
            id: "note-new",
            type: "note",
            scope: "puppy",
            litter_id: "litter-1",
            puppy_id: "puppy-1",
            occurred_at: "2026-08-31T03:00:00Z",
            created_at: "2026-08-31T03:00:00Z",
            deleted: false,
            title: "Rustig geslapen",
            note: "Geen bijzonderheden",
            data: {},
          },
          {
            id: "vaccination-1",
            type: "vaccination",
            scope: "puppy",
            litter_id: "litter-1",
            puppy_id: "puppy-1",
            occurred_at: "2026-08-30T10:00:00Z",
            created_at: "2026-08-30T10:00:00Z",
            deleted: false,
            title: "Puppyvaccinatie",
            note: "Goed verdragen",
            data: { vaccine: "Nobivac Puppy DP" },
          },
        ],
      },
      {
        id: "puppy-2",
        name: "Blauw",
        measurements: [
          {
            id: "blue-weight",
            weight: 505,
            timestamp: "2026-08-31T01:00:00Z",
            created_at: "2026-08-31T01:00:00Z",
            deleted: false,
            superseded_by: null,
            kind: "weight",
            note: null,
          },
        ],
        records: [
          {
            id: "milestone-1",
            type: "milestone",
            scope: "puppy",
            litter_id: "litter-1",
            puppy_id: "puppy-2",
            occurred_at: "2026-08-29T12:00:00Z",
            created_at: "2026-08-29T12:00:00Z",
            deleted: false,
            title: "Ogen open",
            note: null,
            data: { category: "ontwikkeling" },
          },
        ],
      },
    ],
  };
}

function historyRecords(puppyId) {
  if (!puppyId) {
    return {
      records: [
        ...litterData().litter.records,
        {
          id: "deleted-litter",
          type: "note",
          scope: "litter",
          litter_id: "litter-1",
          puppy_id: null,
          occurred_at: "2026-08-28T08:00:00Z",
          created_at: "2026-08-28T08:00:00Z",
          deleted: true,
          title: "Oude nestnotitie",
          note: null,
          data: {},
        },
      ],
      can_manage_records: true,
    };
  }
  const puppy = litterData().puppies.find((item) => item.id === puppyId);
  return {
    records: [
      ...(puppy?.records || []),
      ...(puppyId === "puppy-1"
        ? [{
            id: "deleted-deworming",
            type: "deworming",
            scope: "puppy",
            litter_id: "litter-1",
            puppy_id: "puppy-1",
            occurred_at: "2026-08-28T09:00:00Z",
            created_at: "2026-08-28T09:00:00Z",
            deleted: true,
            title: "Oude ontworming",
            note: null,
            data: { product: "Testmiddel" },
          }]
        : []),
    ],
    can_manage_records: true,
  };
}

function historyMeasurements(puppyId) {
  const puppy = litterData().puppies.find((item) => item.id === puppyId);
  const active = puppy?.measurements || [];
  if (puppyId !== "puppy-1") return { measurements: active };
  return {
    measurements: [
      ...active,
      {
        id: "weight-old",
        weight: 500,
        timestamp: "2026-08-30T04:00:00Z",
        created_at: "2026-08-30T04:00:00Z",
        deleted: false,
        superseded_by: "weight-correction",
        status: "superseded",
        kind: "weight",
        note: null,
      },
      {
        id: "weight-deleted",
        weight: 490,
        timestamp: "2026-08-29T04:00:00Z",
        created_at: "2026-08-29T04:00:00Z",
        deleted: true,
        superseded_by: null,
        status: "deleted",
        kind: "weight",
        note: null,
      },
    ],
  };
}

async function mountTimeline(page, config = {}) {
  await page.goto("/tests/e2e/cards.html");
  await page.waitForFunction(() => window.__puppyTrackerReady === true);

  await page.evaluate((cardConfig) => {
    const data = window.__timelineFixtureData = {
      litter: {
        api_version: 9,
        can_manage_measurements: true,
        can_manage_records: true,
        litter: {
          id: "litter-1",
          name: "Luna 2026",
          records: [{
            id: "litter-note",
            type: "note",
            scope: "litter",
            litter_id: "litter-1",
            puppy_id: null,
            occurred_at: "2026-08-31T00:30:00Z",
            created_at: "2026-08-31T00:30:00Z",
            deleted: false,
            title: "Nestcontrole",
            note: "Alles rustig",
            data: {},
          }],
        },
        puppies: [
          {
            id: "puppy-1",
            name: "Groen",
            measurements: [{
              id: "weight-new",
              weight: 520,
              timestamp: "2026-08-31T04:00:00Z",
              created_at: "2026-08-31T04:00:00Z",
              deleted: false,
              superseded_by: null,
              kind: "weight",
              note: "Na voeding",
            }],
            records: [
              {
                id: "note-new",
                type: "note",
                scope: "puppy",
                litter_id: "litter-1",
                puppy_id: "puppy-1",
                occurred_at: "2026-08-31T03:00:00Z",
                created_at: "2026-08-31T03:00:00Z",
                deleted: false,
                title: "Rustig geslapen",
                note: "Geen bijzonderheden",
                data: {},
              },
              {
                id: "vaccination-1",
                type: "vaccination",
                scope: "puppy",
                litter_id: "litter-1",
                puppy_id: "puppy-1",
                occurred_at: "2026-08-30T10:00:00Z",
                created_at: "2026-08-30T10:00:00Z",
                deleted: false,
                title: "Puppyvaccinatie",
                note: "Goed verdragen",
                data: { vaccine: "Nobivac Puppy DP" },
              },
            ],
          },
          {
            id: "puppy-2",
            name: "Blauw",
            measurements: [{
              id: "blue-weight",
              weight: 505,
              timestamp: "2026-08-31T01:00:00Z",
              created_at: "2026-08-31T01:00:00Z",
              deleted: false,
              superseded_by: null,
              kind: "weight",
              note: null,
            }],
            records: [{
              id: "milestone-1",
              type: "milestone",
              scope: "puppy",
              litter_id: "litter-1",
              puppy_id: "puppy-2",
              occurred_at: "2026-08-29T12:00:00Z",
              created_at: "2026-08-29T12:00:00Z",
              deleted: false,
              title: "Ogen open",
              note: null,
              data: { category: "ontwikkeling" },
            }],
          },
        ],
      },
    };

    const hass = {
      locale: { language: "nl" },
      language: "nl",
      callWS: async (message) => {
        if (message.type === "puppy_tracker/litters") {
          return { litters: [{ id: "litter-1", name: "Luna 2026", active: true }] };
        }
        if (message.type === "puppy_tracker/data") return data.litter;
        if (message.type === "puppy_tracker/records") {
          const puppyId = message.puppy_id || null;
          const baseRecords = puppyId
            ? data.litter.puppies.find((item) => item.id === puppyId)?.records || []
            : data.litter.litter.records;
          const extra = message.include_deleted
            ? puppyId === "puppy-1"
              ? [{
                  id: "deleted-deworming",
                  type: "deworming",
                  scope: "puppy",
                  litter_id: "litter-1",
                  puppy_id: "puppy-1",
                  occurred_at: "2026-08-28T09:00:00Z",
                  created_at: "2026-08-28T09:00:00Z",
                  deleted: true,
                  title: "Oude ontworming",
                  note: null,
                  data: { product: "Testmiddel" },
                }]
              : !puppyId
                ? [{
                    id: "deleted-litter",
                    type: "note",
                    scope: "litter",
                    litter_id: "litter-1",
                    puppy_id: null,
                    occurred_at: "2026-08-28T08:00:00Z",
                    created_at: "2026-08-28T08:00:00Z",
                    deleted: true,
                    title: "Oude nestnotitie",
                    note: null,
                    data: {},
                  }]
                : []
            : [];
          return { records: [...baseRecords, ...extra], can_manage_records: true };
        }
        if (message.type === "puppy_tracker/measurements") {
          const puppy = data.litter.puppies.find((item) => item.id === message.puppy_id);
          const extra = message.puppy_id === "puppy-1"
            ? [
                {
                  id: "weight-old",
                  weight: 500,
                  timestamp: "2026-08-30T04:00:00Z",
                  created_at: "2026-08-30T04:00:00Z",
                  deleted: false,
                  superseded_by: "weight-correction",
                  status: "superseded",
                  kind: "weight",
                  note: null,
                },
                {
                  id: "weight-deleted",
                  weight: 490,
                  timestamp: "2026-08-29T04:00:00Z",
                  created_at: "2026-08-29T04:00:00Z",
                  deleted: true,
                  superseded_by: null,
                  status: "deleted",
                  kind: "weight",
                  note: null,
                },
              ]
            : [];
          return { measurements: [...(puppy?.measurements || []), ...extra] };
        }
        throw new Error(`Unexpected WS call: ${message.type}`);
      },
      connection: {
        subscribeMessage: async () => async () => {},
      },
    };

    const card = document.createElement("puppy-tracker-timeline-card");
    card.setConfig({
      title: "Testtijdlijn",
      show_litter_selector: true,
      default_scope: "litter",
      max_items: 250,
      show_history_toggle: true,
      ...cardConfig,
    });
    document.querySelector("#cards").appendChild(card);
    card.hass = hass;
    window.__timelineCard = card;
  }, config);

  const card = page.locator("puppy-tracker-timeline-card");
  await expect(card.locator(".timeline-item").first()).toBeVisible();
  return card;
}

test("combines litter, puppy and weight history in newest-first order", async ({ page }) => {
  const card = await mountTimeline(page);
  const titles = await card.locator(".event-title").allTextContents();

  expect(titles.slice(0, 4)).toEqual([
    "Gewicht",
    "Rustig geslapen",
    "Gewicht",
    "Nestcontrole",
  ]);
  await expect(card.locator(".event-title", { hasText: "Puppyvaccinatie" })).toBeVisible();
  await expect(card.locator(".event-title", { hasText: "Ogen open" })).toBeVisible();
});

test("switches between litter and puppy scope without losing filters", async ({ page }) => {
  const card = await mountTimeline(page);
  await card.locator('[data-filter-type="milestone"]').click();
  await card.locator("#scope-select").selectOption("puppy-1");

  await expect(card.locator(".meta", { hasText: "Groen" }).first()).toBeVisible();
  await expect(card.locator(".meta", { hasText: "Blauw" })).toHaveCount(0);
  await expect(card.locator(".event-title", { hasText: "Nestcontrole" })).toHaveCount(0);
  expect(await card.locator('[data-filter-type="milestone"]').getAttribute("class")).not.toContain("active");
});

test("filters event types and date range", async ({ page }) => {
  const card = await mountTimeline(page, { default_scope: "puppy", puppy_id: "puppy-1" });

  for (const type of ["note", "vaccination", "deworming", "medication", "test", "vet_visit", "milestone", "other"]) {
    if ((await card.locator(`[data-filter-type="${type}"]`).getAttribute("class"))?.includes("active")) {
      await card.locator(`[data-filter-type="${type}"]`).click();
    }
  }
  await expect(card.locator(".timeline-item")).toHaveCount(1);
  await expect(card.locator(".timeline-item").first()).toHaveAttribute("data-event-type", "weight");

  await card.locator('[data-filter-type="note"]').click();
  await card.locator("#from-date").fill("2026-08-31");
  await card.locator("#to-date").fill("2026-08-31");
  await expect(card.locator(".event-title", { hasText: "Rustig geslapen" })).toBeVisible();
  await expect(card.locator(".event-title", { hasText: "Puppyvaccinatie" })).toHaveCount(0);
});

test("admin history reveals deleted and superseded entries", async ({ page }) => {
  const card = await mountTimeline(page, { default_scope: "puppy", puppy_id: "puppy-1" });

  await card.locator("#history-toggle").check();
  await expect(card.locator(".status.deleted").first()).toBeVisible();
  await expect(card.locator(".status.superseded").first()).toBeVisible();
  await expect(card.locator(".event-title", { hasText: "Oude ontworming" })).toBeVisible();
});
