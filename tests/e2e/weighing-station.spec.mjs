import { expect, test } from "@playwright/test";

async function openFixture(page) {
  await page.goto("/tests/e2e/cards.html");
  await page.waitForFunction(() => window.__puppyTrackerReady === true);
}

async function mountWeighingStation(page) {
  await openFixture(page);

  await page.evaluate(async () => {
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
        id: "device-litter-1",
        name: "Luna x Dutch",
        identifiers: [["puppy_tracker", "litter_l1"]],
      },
      {
        id: "device-litter-2",
        name: "Test litter",
        identifiers: [["puppy_tracker", "litter_l2"]],
      },
      {
        id: "device-puppy-1",
        name: "Alice",
        via_device_id: "device-litter-1",
        identifiers: [["puppy_tracker", "puppy_p1"]],
      },
      {
        id: "device-puppy-2",
        name: "Bob",
        via_device_id: "device-litter-1",
        identifiers: [["puppy_tracker", "puppy_p2"]],
      },
      {
        id: "device-puppy-3",
        name: "Charlie",
        via_device_id: "device-litter-2",
        identifiers: [["puppy_tracker", "puppy_p3"]],
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
      ["sensor.p1_weight", "device-puppy-1", "p1_weight"],
      ["sensor.p1_growth", "device-puppy-1", "p1_growth_24h_percent"],
      ["sensor.p1_status", "device-puppy-1", "p1_status"],
      ["sensor.p1_age", "device-puppy-1", "p1_age"],
      ["sensor.p1_collar", "device-puppy-1", "p1_collar_color"],
      ["sensor.p1_last", "device-puppy-1", "p1_last_weighed"],
      ["sensor.p2_weight", "device-puppy-2", "p2_weight"],
      ["sensor.p2_growth", "device-puppy-2", "p2_growth_24h_percent"],
      ["sensor.p2_status", "device-puppy-2", "p2_status"],
      ["sensor.p2_age", "device-puppy-2", "p2_age"],
      ["sensor.p2_collar", "device-puppy-2", "p2_collar_color"],
      ["sensor.p2_last", "device-puppy-2", "p2_last_weighed"],
      ["sensor.p3_weight", "device-puppy-3", "p3_weight"],
      ["sensor.p3_growth", "device-puppy-3", "p3_growth_24h_percent"],
      ["sensor.p3_status", "device-puppy-3", "p3_status"],
      ["sensor.p3_age", "device-puppy-3", "p3_age"],
      ["sensor.p3_collar", "device-puppy-3", "p3_collar_color"],
      ["sensor.p3_last", "device-puppy-3", "p3_last_weighed"],
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
        options: ["Luna x Dutch", "Test litter"],
      }),
      "select.pt_puppy": makeState("select.pt_puppy", "Alice (Red)", {
        options: ["Alice (Red)", "Bob (Blue)"],
      }),
      "number.pt_weight": makeState("number.pt_weight", "0"),
      "button.pt_start": makeState("button.pt_start", "unknown"),
      "button.pt_save": makeState("button.pt_save", "unknown"),
      "button.pt_reset": makeState("button.pt_reset", "unknown"),
      "sensor.pt_session": makeState("sensor.pt_session", "Niet gestart"),
      "sensor.pt_progress": makeState("sensor.pt_progress", "0 / 2", { percentage: 0 }),
      "sensor.pt_remaining": makeState("sensor.pt_remaining", "Alice, Bob"),
      "sensor.pt_next": makeState("sensor.pt_next", "Alice"),
      "sensor.pt_last": makeState("sensor.pt_last", "Geen"),
      "sensor.pt_message": makeState("sensor.pt_message", ""),
      "sensor.p1_weight": makeState("sensor.p1_weight", "410"),
      "sensor.p1_growth": makeState("sensor.p1_growth", "4.2"),
      "sensor.p1_status": makeState("sensor.p1_status", "Goed", { status_code: "ok" }),
      "sensor.p1_age": makeState("sensor.p1_age", "2 d 4 u"),
      "sensor.p1_collar": makeState("sensor.p1_collar", "Red"),
      "sensor.p1_last": makeState("sensor.p1_last", now),
      "sensor.p2_weight": makeState("sensor.p2_weight", "395"),
      "sensor.p2_growth": makeState("sensor.p2_growth", "3.8"),
      "sensor.p2_status": makeState("sensor.p2_status", "Goed", { status_code: "ok" }),
      "sensor.p2_age": makeState("sensor.p2_age", "2 d 4 u"),
      "sensor.p2_collar": makeState("sensor.p2_collar", "Blue"),
      "sensor.p2_last": makeState("sensor.p2_last", now),
      "sensor.p3_weight": makeState("sensor.p3_weight", "430"),
      "sensor.p3_growth": makeState("sensor.p3_growth", "4.5"),
      "sensor.p3_status": makeState("sensor.p3_status", "Goed", { status_code: "ok" }),
      "sensor.p3_age": makeState("sensor.p3_age", "2 d 4 u"),
      "sensor.p3_collar": makeState("sensor.p3_collar", "Green"),
      "sensor.p3_last": makeState("sensor.p3_last", now),
    };

    const serviceCalls = [];
    const touchState = (entityId) => {
      const state = states[entityId];
      if (state) state.last_updated = new Date(Date.now() + serviceCalls.length + 1).toISOString();
    };

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
        const entityId = target.entity_id || data.entity_id || null;
        serviceCalls.push({ domain, service, data: { ...data }, target: { ...target }, entityId });

        if (domain === "select" && service === "select_option") {
          states[entityId].state = String(data.option);
          touchState(entityId);

          if (entityId === "select.pt_litter") {
            const testLitter = data.option === "Test litter";
            states["select.pt_puppy"].attributes.options = testLitter
              ? ["Charlie (Green)"]
              : ["Alice (Red)", "Bob (Blue)"];
            states["select.pt_puppy"].state = testLitter ? "Charlie (Green)" : "Alice (Red)";
            touchState("select.pt_puppy");
          }
        }

        if (domain === "number" && service === "set_value") {
          states[entityId].state = String(data.value);
          touchState(entityId);
        }

        if (domain === "button" && service === "press") {
          if (entityId === "button.pt_start") {
            states["sensor.pt_session"].state = "Bezig";
            touchState("sensor.pt_session");
          }
          if (entityId === "button.pt_reset") {
            states["sensor.pt_session"].state = "Niet gestart";
            touchState("sensor.pt_session");
          }
        }
      },
    };

    window.__mockHass = hass;
    window.__serviceCalls = serviceCalls;

    const constructor = customElements.get("puppy-tracker-card");
    const card = document.createElement("puppy-tracker-card");
    card.setConfig(constructor.getStubConfig());
    document.querySelector("#cards").appendChild(card);
    card.hass = hass;
  });

  await expect(page.locator("puppy-tracker-card #litter-select")).toBeVisible();
  await expect(page.locator("puppy-tracker-card #puppy-select")).toBeVisible();
}

async function notifyHassUpdate(page, mutate = null) {
  await page.evaluate((mutation) => {
    const hass = window.__mockHass;
    if (mutation?.entityId && hass.states[mutation.entityId]) {
      if (mutation.state !== undefined) hass.states[mutation.entityId].state = String(mutation.state);
      if (mutation.attributes) {
        hass.states[mutation.entityId].attributes = {
          ...hass.states[mutation.entityId].attributes,
          ...mutation.attributes,
        };
      }
      hass.states[mutation.entityId].last_updated = new Date().toISOString();
    }
    document.querySelector("puppy-tracker-card").hass = hass;
  }, mutate);
}

test("shows the selected puppy collar color prominently", async ({ page }) => {
  await mountWeighingStation(page);

  const indicator = page.locator("puppy-tracker-card #current-puppy-indicator");
  const collar = page.locator("puppy-tracker-card #current-puppy-collar");
  const nextIndicator = page.locator("puppy-tracker-card #next-puppy-indicator");
  const nextCollar = page.locator("puppy-tracker-card #next-puppy-collar");

  await expect(indicator).toContainText("Alice");
  await expect(collar).toBeVisible();
  await expect(collar).toHaveCSS("background-color", "rgb(229, 57, 53)");
  await expect(nextIndicator).toContainText("Alice");
  await expect(nextCollar).toHaveCSS("background-color", "rgb(229, 57, 53)");

  await page.locator("puppy-tracker-card #puppy-select").selectOption("Bob (Blue)");
  await notifyHassUpdate(page);

  await expect(indicator).toContainText("Bob");
  await expect(collar).toHaveCSS("background-color", "rgb(30, 136, 229)");
  await expect(page.locator("puppy-tracker-card #weight-input")).toBeFocused();

  await page.locator("puppy-tracker-card #weight-input").blur();
  await notifyHassUpdate(page, { entityId: "sensor.pt_next", state: "Bob" });
  await expect(nextIndicator).toContainText("Bob");
  await expect(nextCollar).toHaveCSS("background-color", "rgb(30, 136, 229)");
});

test("litter and puppy selectors keep the chosen values", async ({ page }) => {
  await mountWeighingStation(page);

  const litter = page.locator("puppy-tracker-card #litter-select");
  const puppy = page.locator("puppy-tracker-card #puppy-select");

  await litter.selectOption("Test litter");
  await expect(litter).toHaveValue("Test litter");
  await notifyHassUpdate(page);

  await expect(puppy).toHaveValue("Charlie (Green)");

  await litter.selectOption("Luna x Dutch");
  await notifyHassUpdate(page);
  await puppy.selectOption("Bob (Blue)");
  await expect(puppy).toHaveValue("Bob (Blue)");
  await notifyHassUpdate(page);
  await expect(puppy).toHaveValue("Bob (Blue)");

  const selectCalls = await page.evaluate(() =>
    window.__serviceCalls.filter((call) => call.domain === "select")
  );
  expect(selectCalls.map((call) => call.data.option)).toContain("Test litter");
  expect(selectCalls.map((call) => call.data.option)).toContain("Bob (Blue)");
});

test("weight entry and session actions call the expected HA services", async ({ page }) => {
  await mountWeighingStation(page);

  await page.locator("puppy-tracker-card #start-session").click();
  await notifyHassUpdate(page);

  const weight = page.locator("puppy-tracker-card #weight-input");
  await weight.fill("428");
  await page.locator("puppy-tracker-card #save-weight").click();

  await page.locator("puppy-tracker-card #reset-session").click();
  await notifyHassUpdate(page);

  const calls = await page.evaluate(() => window.__serviceCalls);

  expect(calls).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ domain: "button", service: "press", entityId: "button.pt_start" }),
      expect.objectContaining({
        domain: "number",
        service: "set_value",
        entityId: "number.pt_weight",
        data: expect.objectContaining({ value: 428 }),
      }),
      expect.objectContaining({ domain: "button", service: "press", entityId: "button.pt_save" }),
      expect.objectContaining({ domain: "button", service: "press", entityId: "button.pt_reset" }),
    ])
  );
});

test("weight input focus and draft survive a tracked HA rerender request", async ({ page }) => {
  await mountWeighingStation(page);

  const weight = page.locator("puppy-tracker-card #weight-input");
  await weight.fill("512");
  await weight.focus();

  await notifyHassUpdate(page, {
    entityId: "sensor.pt_progress",
    state: "1 / 2",
    attributes: { percentage: 50 },
  });

  await page.waitForTimeout(100);

  const focusState = await page.evaluate(() => {
    const card = document.querySelector("puppy-tracker-card");
    return {
      activeId: card.shadowRoot.activeElement?.id || null,
      value: card.shadowRoot.querySelector("#weight-input")?.value || null,
    };
  });

  expect(focusState.activeId).toBe("weight-input");
  expect(focusState.value).toBe("512");
});
