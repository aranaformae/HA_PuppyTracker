import { expect, test } from "@playwright/test";

test.use({ timezoneId: "America/Los_Angeles" });

test("HA calendar days and displayed times stay consistent on a device in another timezone @cross-browser @tablet", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-03-28T23:30:00Z") });
  await page.goto("/tests/e2e/cards.html?production=1");
  await page.waitForFunction(() => window.__puppyTrackerReady === true);
  const result = await page.evaluate(async () => {
    const { calendarDate, formatDateTime, formatShortDateTime } = await import("/custom_components/puppy_tracker/frontend/puppy-tracker-card-common.js");
    const { chartTimeTick } = await import("/custom_components/puppy_tracker/frontend/puppy-tracker-chart-time-navigation.js");
    const { renderTodayCare, renderAttentionCare } = await import("/custom_components/puppy_tracker/frontend/puppy-tracker-care-surfaces.js");
    const hass = { language: "nl", config: { time_zone: "Europe/Amsterdam" }, user: { is_admin: true } };
    const card = document.createElement("div");
    card.attachShadow({ mode: "open" }).innerHTML = "<ha-card></ha-card>";
    card._hass = hass;
    card._config = { show_today_only: true };
    card.__careOccurrences = [
      { id: "today", scheduled_date: "2026-03-29", scheduled_at: "2026-03-29T09:00:00+02:00", status: "upcoming", days_until_due: 0 },
      { id: "yesterday", scheduled_date: "2026-03-28", scheduled_at: "2026-03-28T09:00:00+01:00", status: "due_today", days_until_due: 0 },
      { id: "unknown", status: "upcoming", days_until_due: null },
    ];
    renderTodayCare(card);
    const today = [...card.shadowRoot.querySelectorAll("[data-care-occurrence]")].map((row) => row.dataset.careOccurrence);
    renderAttentionCare(card);
    const attention = [...card.shadowRoot.querySelectorAll("[data-care-occurrence]")].map((row) => row.dataset.careOccurrence);
    const owners = document.createElement("puppy-tracker-owner-card");
    owners._hass = hass;
    owners._config = {};
    owners._visibleOwners = () => [{ id: "owner", name: "Alex" }];
    owners._visibleLitterIds = () => ["l1"];
    owners._ownerForLitter = (contact) => contact;
    owners._linkedPuppies = () => [{ name: "Nova", litter_id: "l1", birth_time: "2026-03-28T23:30:00Z" }];
    return { day: calendarDate(Date.now(), hass), dateOnly: calendarDate("2026-03-29", hass),
      tick: chartTimeTick.call({ _hass: hass, _rangeHours: 24 }, Date.parse("2026-03-29T01:30:00Z")),
      full: formatDateTime("2026-03-29T01:30:00Z", "", hass),
      csv: owners._ownerCsvContent(),
      short: formatShortDateTime("2026-10-25T01:30:00Z", "", hass), today, attention };
  });
  expect(result.day).toBe("2026-03-29");
  expect(result.dateOnly).toBe("2026-03-29");
  expect(result.full).toContain("03:30");
  expect(result.tick).toContain("03:30");
  expect(result.csv).toContain('"2026-03-29"');
  expect(result.short).toContain("02:30");
  expect(result.today).toEqual(["today"]);
  expect(result.attention).toEqual(["today"]);
});
