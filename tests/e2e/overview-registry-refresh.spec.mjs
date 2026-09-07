import { expect, test } from "@playwright/test";

test("overview refreshes registries before reloading dashboard data", async ({ page }) => {
  await page.goto("/tests/e2e/cards.html");
  await page.waitForFunction(() => window.__puppyTrackerReady === true);

  const calls = await page.evaluate(async () => {
    const events = [];
    let updateCallback;
    const hass = {
      states: {},
      callWS: async ({ type }) => {
        events.push(type);
        return [];
      },
      connection: {
        subscribeMessage: async (callback) => {
          updateCallback = callback;
          return async () => {};
        },
      },
    };
    const card = document.createElement("puppy-tracker-overview-card");
    document.querySelector("#cards").appendChild(card);
    card._hass = hass;
    card._initializeSelection = () => events.push("selection");
    card._currentStateSignature = () => "refreshed";
    card._scheduleHistoryReload = () => events.push("history");
    card._scheduleMeasurementReload = () => events.push("measurements");
    card._scheduleRender = () => events.push("render");

    await card._subscribeToData();
    await updateCallback();
    return events;
  });

  expect(calls).toEqual([
    "config/entity_registry/list",
    "config/device_registry/list",
    "selection",
    "history",
    "measurements",
    "render",
  ]);
});
