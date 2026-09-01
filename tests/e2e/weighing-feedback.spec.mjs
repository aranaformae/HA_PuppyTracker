import { expect, test } from "@playwright/test";

async function mountWeighingStation(page, previousWeight = "410") {
  await page.goto("/tests/e2e/cards.html");
  await page.waitForFunction(() => window.__puppyTrackerReady === true);

  await page.evaluate((previous) => {
    const now = new Date().toISOString();
    const makeState = (entityId, state, attributes = {}) => ({
      entity_id: entityId,
      state: String(state),
      attributes,
      last_changed: now,
      last_updated: now,
    });

    const devices = [
      {
        id: "device-station",
        name: "Puppy weighing station",
        identifiers: [["puppy_tracker", "weighing_station"]],
      },
      {
        id: "device-litter",
        name: "Luna x Dutch",
        identifiers: [["puppy_tracker", "litter_l1"]],
      },
      {
        id: "device-puppy",
        name: "Alice",
        via_device_id: "device-litter",
        identifiers: [["puppy_tracker", "puppy_p1"]],
      },
    ];

    const entityDefinitions = [
      ["select.pt_litter", "device-station", "puppy_tracker_litter_select"],
      ["select.pt_puppy", "device-station", "puppy_tracker_puppy_select"],
      ["number.pt_weight", "device-station", "puppy_tracker_weight_input"],
      ["button.pt_start", "device-station", "puppy_tracker_start_session"],
      ["button.pt_save", "device-station", "puppy_tracker_save_weight"],
      ["button.pt_reset", "device-station", "puppy_tracker_reset_session"],
      ["sensor.pt_session", "device-station", "puppy_tracker_session_status"],
      ["sensor.pt_progress", "device-station", "puppy_tracker_session_progress"],
      ["sensor.pt_remaining", "device-station", "puppy_tracker_session_remaining"],
      ["sensor.pt_next", "device-station", "puppy_tracker_session_next_puppy"],
      ["sensor.pt_last", "device-station", "puppy_tracker_session_last_puppy"],
      ["sensor.pt_message", "device-station", "puppy_tracker_session_message"],
      ["sensor.p1_weight", "device-puppy", "p1_weight"],
      ["sensor.p1_growth", "device-puppy", "p1_growth_24h_percent"],
      ["sensor.p1_status", "device-puppy", "p1_status"],
      ["sensor.p1_age", "device-puppy", "p1_age"],
      ["sensor.p1_collar", "device-puppy", "p1_collar_color"],
      ["sensor.p1_last", "device-puppy", "p1_last_weighed"],
    ];

    const entities = entityDefinitions.map(([entity_id, device_id, unique_id]) => ({
      entity_id,
      device_id,
      unique_id,
      disabled_by: null,
      name: null,
      original_name: unique_id,
    }));

    const states = {
      "select.pt_litter": makeState("select.pt_litter", "Luna x Dutch", {
        options: ["Luna x Dutch"],
      }),
      "select.pt_puppy": makeState("select.pt_puppy", "Alice (Red)", {
        options: ["Alice (Red)"],
      }),
      "number.pt_weight": makeState("number.pt_weight", "0"),
      "button.pt_start": makeState("button.pt_start", "unknown"),
      "button.pt_save": makeState("button.pt_save", "unknown"),
      "button.pt_reset": makeState("button.pt_reset", "unknown"),
      "sensor.pt_session": makeState("sensor.pt_session", "Niet gestart"),
      "sensor.pt_progress": makeState("sensor.pt_progress", "0 / 1", { percentage: 0 }),
      "sensor.pt_remaining": makeState("sensor.pt_remaining", "Alice"),
      "sensor.pt_next": makeState("sensor.pt_next", "Alice"),
      "sensor.pt_last": makeState("sensor.pt_last", "Geen"),
      "sensor.pt_message": makeState("sensor.pt_message", ""),
      "sensor.p1_weight": makeState("sensor.p1_weight", previous),
      "sensor.p1_growth": makeState("sensor.p1_growth", "4.2"),
      "sensor.p1_status": makeState("sensor.p1_status", "Goed", { status_code: "ok" }),
      "sensor.p1_age": makeState("sensor.p1_age", "2 d 4 u"),
      "sensor.p1_collar": makeState("sensor.p1_collar", "Red"),
      "sensor.p1_last": makeState("sensor.p1_last", now),
    };

    const serviceCalls = [];
    const hass = {
      locale: { language: "en" },
      language: "en",
      states,
      callWS: async (message) => {
        if (message.type === "config/entity_registry/list") return entities;
        if (message.type === "config/device_registry/list") return devices;
        throw new Error(`Unexpected WS call: ${message.type}`);
      },
      callService: async (domain, service, data = {}, target = {}) => {
        serviceCalls.push({ domain, service, data: { ...data }, target: { ...target } });
        if (domain === "number" && service === "set_value") {
          states[target.entity_id].state = String(data.value);
        }
      },
    };

    window.__mockHass = hass;
    window.__serviceCalls = serviceCalls;

    const card = document.createElement("puppy-tracker-card");
    card.setConfig(customElements.get("puppy-tracker-card").getStubConfig());
    document.querySelector("#cards").appendChild(card);
    card.hass = hass;
  }, previousWeight);

  await expect(page.locator("puppy-tracker-card #weight-input")).toBeVisible();
}

test("saving a weight immediately shows gain and growth versus the previous measurement", async ({ page }) => {
  await mountWeighingStation(page, "410");

  await page.locator("puppy-tracker-card #weight-input").fill("428");
  await page.locator("puppy-tracker-card #save-weight").click();

  await expect(page.locator("puppy-tracker-card .message.success")).toHaveText(
    "Alice: 428 g saved · +18 g (+4.4%) vs previous measurement of 410 g."
  );
});

test("the first weight is identified without inventing a growth percentage", async ({ page }) => {
  await mountWeighingStation(page, "unknown");

  await page.locator("puppy-tracker-card #weight-input").fill("428");
  await page.locator("puppy-tracker-card #save-weight").click();

  await expect(page.locator("puppy-tracker-card .message.success")).toHaveText(
    "Alice: 428 g saved · first measurement."
  );
});
