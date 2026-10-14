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
      ["sensor.p1_previous", "device-puppy-1", "p1_previous_weight"],
      ["sensor.p1_growth", "device-puppy-1", "p1_growth_24h_percent"],
      ["sensor.p1_status", "device-puppy-1", "p1_status"],
      ["sensor.p1_age", "device-puppy-1", "p1_age"],
      ["sensor.p1_collar", "device-puppy-1", "p1_collar_color"],
      ["sensor.p1_last", "device-puppy-1", "p1_last_weighed"],
      ["sensor.p2_weight", "device-puppy-2", "p2_weight"],
      ["sensor.p2_previous", "device-puppy-2", "p2_previous_weight"],
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
      "sensor.p1_previous": makeState("sensor.p1_previous", "398"),
      "sensor.p1_growth": makeState("sensor.p1_growth", "4.2"),
      "sensor.p1_status": makeState("sensor.p1_status", "Goed", { status_code: "ok" }),
      "sensor.p1_age": makeState("sensor.p1_age", "2 d 4 u"),
      "sensor.p1_collar": makeState("sensor.p1_collar", "Red"),
      "sensor.p1_last": makeState("sensor.p1_last", now),
      "sensor.p2_weight": makeState("sensor.p2_weight", "395"),
      "sensor.p2_previous": makeState("sensor.p2_previous", "390"),
      "sensor.p2_growth": makeState("sensor.p2_growth", "3.8"),
      "sensor.p2_status": makeState("sensor.p2_status", "Goed", { status_code: "ok" }),
      "sensor.p2_age": makeState("sensor.p2_age", "2 d 4 u"),
      "sensor.p2_collar": makeState("sensor.p2_collar", "Blue"),
      "sensor.p2_last": makeState("sensor.p2_last", new Date(Date.now() - 3600000).toISOString()),
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
    window.__weighingCard = card;
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
    window.__weighingCard.hass = hass;
  }, mutate);
}

for (const mobile of [false, true]) {
  test(`weighing preserves entered weight and marks session puppies ${mobile ? "@mobile @tablet" : "@cross-browser"}`, async ({ page }) => {
    await mountWeighingStation(page);
    if (mobile) {
      await page.evaluate(() => {
        window.__weighingCard.remove();
        const workspace = document.createElement("puppy-tracker-workspace-card");
        workspace.setConfig({ preset: "mobile" });
        document.querySelector("#cards").append(workspace);
        workspace.hass = window.__mockHass;
      });
      await expect(page.locator("puppy-tracker-workspace-card #weight-input")).toBeVisible();
      await page.evaluate(() => {
        window.__weighingCard = document.querySelector("puppy-tracker-workspace-card").shadowRoot.querySelector("puppy-tracker-card");
      });
    }
    const card = page.locator(mobile ? "puppy-tracker-workspace-card puppy-tracker-card" : "puppy-tracker-card");
    const input = card.locator("#weight-input");
    const select = card.locator("#puppy-select");
    await input.fill("425");
    await select.selectOption("Bob (Blue)");
    await notifyHassUpdate(page);
    await expect(input).toHaveValue("425");
    await expect(card.locator("#current-puppy-name")).toHaveText("Bob");
    await card.locator('#puppy-list [data-puppy-id="p1"]').click();
    await notifyHassUpdate(page);
    await expect(input).toHaveValue("425");
    await input.fill("");
    await select.selectOption("Bob (Blue)");
    await notifyHassUpdate(page);
    await expect(input).toHaveValue("");
    await input.fill("430");
    await card.locator("#save-weight").click();
    await expect.poll(() => page.evaluate(() => window.__serviceCalls.some((call) => call.domain === "number" && call.data.value === 430))).toBe(true);
    await notifyHassUpdate(page, { entityId: "sensor.pt_progress", attributes: { litter_id: "l1", weighed_puppy_ids: ["p2"] } });
    await notifyHassUpdate(page, { entityId: "sensor.pt_session", state: "Bezig" });
    await expect(select.locator('option[value="Bob (Blue)"]')).toHaveText("Bob (Blue) · ✓ Weighed");
    await expect(select.locator('option[value="Bob (Blue)"]')).toBeEnabled();
    await expect(select.locator('option[value="Alice (Red)"]')).toHaveText("Alice (Red)");
    await select.selectOption("Alice (Red)");
    await notifyHassUpdate(page);
    await select.selectOption("Bob (Blue)");
    await notifyHassUpdate(page);
    await expect(select).toHaveValue("Bob (Blue)");
    await expect(input).toBeFocused();
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await input.blur();
    await notifyHassUpdate(page, { entityId: "sensor.pt_session", state: "Voltooid" });
    await expect(card.locator("#session-badge")).toHaveText("Completed");
    await expect(select.locator(".weighed-option")).toHaveCount(1);
    await notifyHassUpdate(page, { entityId: "sensor.pt_progress", attributes: { weighed_puppy_ids: ["p1", "p2"] } });
    await expect(select.locator('option[value="Alice (Red)"]')).toHaveText("Alice (Red) · ✓ Weighed");
    await expect(select.locator(".weighed-option")).toHaveCount(2);
    await notifyHassUpdate(page, { entityId: "sensor.pt_progress", attributes: { litter_id: "l2" } });
    await expect(select.locator(".weighed-option")).toHaveCount(0);
    await notifyHassUpdate(page, { entityId: "sensor.pt_progress", attributes: { litter_id: "l1" } });
    await notifyHassUpdate(page, { entityId: "sensor.pt_session", state: "Niet gestart" });
    await expect(select.locator(".weighed-option")).toHaveCount(0);
  });
}

test("last measurement correction targets the saved puppy and keeps compact session controls @cross-browser @tablet", async ({ page }) => {
  await mountWeighingStation(page);
  const card = page.locator("puppy-tracker-card");
  await expect(card.locator("#edit-last-measurement")).toBeDisabled();
  await page.evaluate(() => {
    const original = window.__mockHass.callWS;
    window.__correctionCalls = [];
    window.__correctionFails = true;
    window.__mockHass.callWS = async (message) => {
      if (message.type === "puppy_tracker/measurements") {
        window.__correctionCalls.push(message);
        return { measurements: [{ id: "m1", status: "active", weight: 428 }] };
      }
      if (message.type === "puppy_tracker/measurement/correct") {
        window.__correctionCalls.push(message);
        if (window.__correctionFails) throw new Error("Please retry");
        return { measurement_id: "m2", ok: true };
      }
      return original(message);
    };
  });
  await notifyHassUpdate(page, { entityId: "sensor.pt_last", state: "Alice (Red)", attributes: { litter_id: "l1", puppy_id: "p1", measurement_id: "m1", weight: 428 } });
  await expect(card.locator("#edit-last-measurement")).toBeEnabled();
  const left = await card.locator("#toggle-session").boundingBox();
  const right = await card.locator("#edit-last-measurement").boundingBox();
  expect(Math.abs(left.y - right.y)).toBeLessThan(1);
  expect(Math.abs(left.width - right.width)).toBeLessThan(1);
  await card.locator("#puppy-select").selectOption("Bob (Blue)");
  await notifyHassUpdate(page);
  await expect(card.locator("#weight-input")).toBeFocused();
  await card.locator("#weight-input").blur();
  await card.locator("#edit-last-measurement").click();
  const editor = card.locator("#measurement-editor");
  await expect(editor).toContainText("Alice (Red)");
  await editor.locator("input").fill("420");
  await editor.locator('[type="submit"]').click();
  await expect(editor.locator("#correction-error")).toHaveText("Please retry");
  await expect(editor.locator("input")).toHaveValue("420");
  await page.evaluate(() => { window.__correctionFails = false; });
  await editor.locator('[type="submit"]').click();
  await expect(editor).toBeHidden();
  expect(await page.evaluate(() => window.__correctionCalls.at(-1))).toEqual({ type: "puppy_tracker/measurement/correct", litter_id: "l1", puppy_id: "p1", measurement_id: "m1", weight: 420 });
});

test("shows the selected puppy collar color prominently", async ({ page }) => {
  await mountWeighingStation(page);

  const indicator = page.locator("puppy-tracker-card #current-puppy-indicator");
  const collar = page.locator("puppy-tracker-card #current-puppy-collar");
  const nextIndicator = page.locator("puppy-tracker-card #next-puppy-indicator");
  const nextCollar = page.locator("puppy-tracker-card #next-puppy-collar");

  await expect(indicator).toContainText("Alice");
  await expect(collar).toBeVisible();
  await expect(collar).toHaveCSS("background-color", "rgb(229, 57, 53)");
  await expect(nextIndicator).toContainText("Next puppy");
  await expect(nextIndicator).toContainText("Bob");
  await expect(nextCollar).toHaveCSS("background-color", "rgb(30, 136, 229)");

  await page.locator("puppy-tracker-card #puppy-select").selectOption("Bob (Blue)");
  await notifyHassUpdate(page);

  await expect(indicator).toContainText("Bob");
  await expect(collar).toHaveCSS("background-color", "rgb(30, 136, 229)");
  await expect(page.locator("puppy-tracker-card #weight-input")).toBeFocused();

  await page.locator("puppy-tracker-card #weight-input").blur();
  await notifyHassUpdate(page, { entityId: "sensor.pt_next", state: "Bob" });
  await expect(nextIndicator).toContainText("Weigh now");
  await expect(nextIndicator).toContainText("Bob");
  await expect(nextCollar).toHaveCSS("background-color", "rgb(30, 136, 229)");
});

test("weighing station localizes sensor-backed status without the legacy bridge", async ({ page }) => {
  await mountWeighingStation(page);

  const card = page.locator("puppy-tracker-card");
  await expect(card.locator("#card-title")).toHaveText("Puppy weighing station");
  await expect(card.locator("#session-badge")).toHaveText("Not started");
  await expect(card.locator(".puppy-row").first()).toContainText("2 d 4 h");
  await expect(card.locator(".puppy-row").first()).toContainText("Good");
  await expect(card.locator("#weight-input")).toHaveAttribute("placeholder", "e.g. 428");

  await notifyHassUpdate(page, { entityId: "sensor.pt_session", state: "Bezig" });
  await notifyHassUpdate(page, { entityId: "sensor.pt_message", state: "Weegsessie gestart" });

  await expect(card.locator("#session-badge")).toHaveText("In progress");
  await expect(card.locator("#local-message")).toHaveText("Weighing session started");
});

test("shows the last weighing moment for the selected puppy", async ({ page }) => {
  await mountWeighingStation(page);

  const details = page.locator("puppy-tracker-card .session-grid");
  await expect(details).toContainText("Latest weighing for selected puppy");
  const p1Last = await page.evaluate(() => window.__mockHass.states["sensor.p1_last"].state);
  const p2Last = await page.evaluate(() => window.__mockHass.states["sensor.p2_last"].state);
  await expect(details).toContainText(p1Last);
  await expect(details).toContainText("398 g");
  await expect(details).toContainText("+12 g");

  await page.locator("puppy-tracker-card #puppy-select").selectOption("Bob (Blue)");
  await notifyHassUpdate(page);

  await expect(details).toContainText(p2Last);
  await expect(details).toContainText("390 g");
  await expect(details).toContainText("+5 g");
  await expect(details).not.toContainText(p1Last);
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

  await page.locator("puppy-tracker-card #toggle-session").click();
  await notifyHassUpdate(page);

  const weight = page.locator("puppy-tracker-card #weight-input");
  await weight.fill("428");
  await page.locator("puppy-tracker-card #save-weight").click();

  await expect(page.locator("puppy-tracker-card #toggle-session")).toHaveText("Reset session");
  await page.locator("puppy-tracker-card #toggle-session").click();
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
