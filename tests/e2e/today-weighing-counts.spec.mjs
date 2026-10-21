import { expect, test } from "@playwright/test";

for (const language of ["nl", "en"]) {
  test(`Today keeps daily weights after completion, reset and reload (${language}) @cross-browser @tablet`, async ({ page }) => {
    await page.clock.install({ time: new Date("2026-10-21T22:30:00Z") });
    await page.goto("/tests/e2e/cards.html?production");
    await page.waitForFunction(() => window.__puppyTrackerReady);
    await page.evaluate((language) => {
      const data = window.dailyData = {
        litter: { id: "l1", name: "Nest", summary: { attention_count: 0, session: { status: "active", total: 2, weighed: 1 } } },
        puppies: [
          { id: "p1", name: "Nova", collar_color: "paars", measurements: [
            { id: "m1", weight: 400, timestamp: "2026-10-21T22:10:00Z" },
            { id: "m2", weight: 410, timestamp: "2026-10-21T22:20:00Z" },
          ] },
          { id: "p2", name: "Benen", collar_color: "blauw", measurements: [
            { id: "old", weight: 400, timestamp: "2026-10-21T08:00:00Z" },
            { id: "deleted", weight: 400, timestamp: "2026-10-21T22:20:00Z", status: "deleted" },
            { id: "superseded", weight: 400, timestamp: "2026-10-21T22:20:00Z", superseded_by: "replacement" },
          ] },
          { id: "inactive", name: "Inactive", active: false, measurements: [{ weight: 500, timestamp: "2026-10-21T22:10:00Z" }] },
        ],
      };
      const callbacks = new Set();
      const hass = window.dailyHass = { language, locale: { language }, config: { time_zone: "Europe/Amsterdam" }, states: {},
        connection: { subscribeMessage: async (callback) => { callbacks.add(callback); return () => callbacks.delete(callback); } },
        callWS: async (msg) => {
          if (msg.type === "puppy_tracker/litters") return { litters: [{ id: "l1", name: "Nest", active: true }] };
          if (msg.type === "puppy_tracker/data") return structuredClone(data);
          if (msg.type === "puppy_tracker/care_occurrences") return { occurrences: [], skipped: [] };
          if (msg.type === "puppy_tracker/recurring_reminders") return { reminders: [] };
          throw new Error(msg.type);
        },
      };
      window.refreshDaily = async () => { for (const callback of callbacks) await callback({}); };
      for (const mobile of [false, true]) {
        const card = document.createElement(mobile ? "puppy-tracker-workspace-card" : "puppy-tracker-today-card");
        card.setConfig(mobile ? { preset: "mobile", default_tab: "today", litter_id: "l1" } : { litter_id: "l1" });
        document.querySelector("#cards").append(card);
        card.hass = hass;
      }
    }, language);
    const cards = page.locator("puppy-tracker-today-card");
    await expect(cards).toHaveCount(2);
    const counts = async (expected) => {
      for (const card of await cards.all()) await expect(card.locator(".stat strong")).toHaveText(expected);
    };
    await counts(["2", "1", "1", "0"]);
    await page.evaluate(async () => {
      window.dailyData.puppies[1].measurements.push({ id: "replacement", weight: 420, timestamp: "2026-10-21T22:25:00Z" });
      window.dailyData.litter.summary.session = { status: "completed", total: 2, weighed: 2, completed_at: "2026-10-21T22:25:00Z" };
      await window.refreshDaily();
    });
    await counts(["2", "2", "0", "0"]);
    for (const card of await cards.all()) await expect(card.locator(".status")).toContainText(language === "en" ? "All puppies have been weighed today" : "Alle pups zijn vandaag gewogen");
    await page.evaluate(async () => { window.dailyData.litter.summary.session = null; await window.refreshDaily(); });
    await counts(["2", "2", "0", "0"]);
    await page.evaluate(() => {
      const card = document.querySelector("#cards > puppy-tracker-today-card");
      card.remove();
      const replacement = document.createElement("puppy-tracker-today-card");
      replacement.setConfig({ litter_id: "l1" });
      document.querySelector("#cards").append(replacement);
      replacement.hass = window.dailyHass;
    });
    await counts(["2", "2", "0", "0"]);
    await page.evaluate(async () => { window.dailyData.litter.summary.attention_count = 1; await window.refreshDaily(); });
    await counts(["2", "2", "0", "1"]);
    for (const card of await cards.all()) await expect(card.locator(".status")).toContainText(language === "en" ? "need attention" : "vragen aandacht");
    await page.clock.setSystemTime(new Date("2026-10-22T22:30:00Z"));
    await page.evaluate(async () => {
      window.dailyData.litter.summary.session = { status: "completed", total: 2, weighed: 2, completed_at: "2026-10-21T22:25:00Z" };
      window.dailyData.litter.summary.attention_count = 0;
      await window.refreshDaily();
    });
    await counts(["2", "0", "2", "0"]);
  });
}
