import { expect, test } from "@playwright/test";

async function openFixture(page) {
  await page.goto("/tests/e2e/cards.html");
  await page.waitForFunction(() => window.__puppyTrackerReady === true);
}

async function mountWeighingStation(page, config = {}) {
  await openFixture(page);

  await page.evaluate(async (config) => {
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
        if (message.type === "puppy_tracker/weight/save") {
          window.__weightSaves.push(structuredClone(message));
          return { measurement_id: "saved", puppy_id: message.puppy_id, weight: message.weight };
        }
        if (message.type === "puppy_tracker/weight/preview") return { anomaly: null, baseline_id: "previous" };
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
    window.__weightSaves = [];
    window.__serviceCalls = serviceCalls;

    const constructor = customElements.get("puppy-tracker-card");
    const card = document.createElement("puppy-tracker-card");
    window.__weighingCard = card;
    card.setConfig({ ...constructor.getStubConfig(), ...config });
    document.querySelector("#cards").appendChild(card);
    card.hass = hass;
  }, config);

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

async function interruptSession(page) {
  await notifyHassUpdate(page, { entityId: "sensor.pt_session", state: "Onderbroken",
    attributes: { session_id: "session-1", revision: 2 } });
}

async function offerUndo(page) {
  await notifyHassUpdate(page, { entityId: "select.pt_puppy", state: "Bob (Blue)" });
  await notifyHassUpdate(page, { entityId: "sensor.pt_last", state: "Alice (Red)", attributes: {
    litter_id: "l1", puppy_id: "p1", measurement_id: "saved-m1", weight: 428,
    undo_id: "undo-1", undo_expires_at: new Date(Date.now() + 120000).toISOString(),
  } });
}

test("undo weighing metadata arriving while typing updates only the action controls", async ({ page }) => {
  await mountWeighingStation(page);
  const card = page.locator("puppy-tracker-card");
  await card.locator("#weight-input").fill("490");
  await notifyHassUpdate(page, { entityId: "sensor.pt_last", state: "Alice (Red)", attributes: {
    litter_id: "l1", puppy_id: "p1", measurement_id: "saved-m1", weight: 428,
    undo_id: "undo-1", undo_expires_at: new Date(Date.now() + 120000).toISOString(),
  } });
  await expect(card.locator("#undo-last-weight")).toBeVisible();
  await expect(card.locator("#weight-input")).toBeFocused();
  await expect(card.locator("#weight-input")).toHaveValue("490");
});

test("undo weighing expiry is rearmed when the retained card reconnects", async ({ page }) => {
  await mountWeighingStation(page);
  await page.clock.install();
  await offerUndo(page);
  const button = page.locator("puppy-tracker-card #undo-last-weight");
  await expect(button).toBeEnabled();
  await page.evaluate(() => {
    const card = window.__weighingCard;
    card.remove();
    document.getElementById("cards").append(card);
  });
  await page.clock.fastForward(120100);
  await expect(button).toBeDisabled();
});

test("undo weighing identifies the saved puppy after auto advance, not the current selection @cross-browser @tablet", async ({ page }, info) => {
  await mountWeighingStation(page);
  await offerUndo(page);
  const card = page.locator("puppy-tracker-card");
  await expect(card.locator("#puppy-select")).toHaveValue("Bob (Blue)");
  await expect(card.locator("#undo-last-weight")).toContainText("Alice (Red) · 428 g");
  expect(await card.evaluate((node) => node.shadowRoot.querySelector(".card").scrollWidth <= node.shadowRoot.querySelector(".card").clientWidth + 1)).toBe(true);
  await card.screenshot({ path: info.outputPath("weighing-undo.png") });
  await page.evaluate(() => {
    const original = window.__mockHass.callWS;
    window.__mockHass.callWS = async (message) => {
      if (message.type !== "puppy_tracker/weighing_session/undo") return original(message);
      window.__undoRequest = message;
      return { ok: true };
    };
  });
  await card.locator("#undo-last-weight").click();
  await expect(card.locator("#local-message")).toHaveText("Weighing undone. History is retained.");
  await expect(card.locator("#undo-last-weight")).toBeHidden();
  expect(await page.evaluate(() => window.__undoRequest)).toEqual({
    type: "puppy_tracker/weighing_session/undo", undo_id: "undo-1", measurement_id: "saved-m1",
  });
  expect(await page.evaluate(() => window.__serviceCalls)).toEqual([]);
});

test("undo weighing expires without removing its row or replacing the input @cross-browser @tablet", async ({ page }) => {
  await mountWeighingStation(page);
  await page.clock.install();
  await offerUndo(page);
  const button = page.locator("puppy-tracker-card #undo-last-weight");
  await expect(button).toBeEnabled();
  await page.evaluate(() => { window.__undoInput = window.__weighingCard.shadowRoot.querySelector("#weight-input"); });
  const before = await button.boundingBox();
  await page.clock.fastForward(120010);
  await expect(button).toBeDisabled();
  await expect(button).toBeVisible();
  expect((await button.boundingBox()).height).toBe(before.height);
  expect(await page.evaluate(() => window.__undoInput === window.__weighingCard.shadowRoot.querySelector("#weight-input"))).toBe(true);
});

test("undo weighing retains the draft on rejected confirmation and on write failure", async ({ page }) => {
  await mountWeighingStation(page);
  await offerUndo(page);
  const card = page.locator("puppy-tracker-card");
  await expect(card.locator("#undo-last-weight")).toBeVisible();
  await card.locator("#weight-input").fill("460");
  page.once("dialog", (dialog) => dialog.dismiss());
  await card.locator("#undo-last-weight").click();
  await expect(card.locator("#weight-input")).toHaveValue("460");
  await page.evaluate(() => {
    const original = window.__mockHass.callWS;
    window.__mockHass.callWS = async (message) => {
      if (message.type !== "puppy_tracker/weighing_session/undo") return original(message);
      throw new Error("Disk full");
    };
  });
  page.once("dialog", (dialog) => dialog.accept());
  await card.locator("#undo-last-weight").click();
  await expect(card.locator("#local-message")).toHaveText("Disk full");
  await expect(card.locator("#weight-input")).toHaveValue("460");
  await expect(card.locator("#undo-last-weight")).toBeEnabled();
});

test("late undo weighing response cannot clear a different user's draft", async ({ page }) => {
  await mountWeighingStation(page);
  await offerUndo(page);
  await page.evaluate(() => {
    window.__mockHass.user = { id: "admin-a", is_admin: true };
    const original = window.__mockHass.callWS;
    window.__mockHass.callWS = (message) => message.type === "puppy_tracker/weighing_session/undo"
      ? new Promise((resolve) => { window.__finishUndo = resolve; }) : original(message);
  });
  await page.locator("puppy-tracker-card #undo-last-weight").click();
  await page.evaluate(() => {
    window.__mockHass.user = { id: "admin-b", is_admin: true };
    window.__weighingCard._draftWeight = "470";
    window.__finishUndo({ ok: true });
  });
  await expect(page.locator("puppy-tracker-card #weight-input")).toHaveValue("470");
  await expect(page.locator("puppy-tracker-card #local-message")).not.toHaveText("Weighing undone. History is retained.");
});

test("interrupted weighing offers explicit resume and retains the stable input node @cross-browser @tablet", async ({ page }, info) => {
  await mountWeighingStation(page);
  await interruptSession(page);
  const card = page.locator("puppy-tracker-card");
  await expect(card.locator("#session-recovery")).toBeVisible();
  await expect(card.locator("#recovery-title")).toHaveText("Interrupted weighing session");
  await expect(card.locator("#save-weight")).toBeDisabled();
  await expect(card.locator("#toggle-session")).toBeDisabled();
  await card.screenshot({ path: info.outputPath("weighing-recovery.png") });
  await page.evaluate(() => {
    window.__oldWeightNode = window.__weighingCard.shadowRoot.querySelector("#weight-input");
    const hass = window.__mockHass;
    const original = hass.callWS;
    hass.callWS = async (message) => {
      if (message.type !== "puppy_tracker/weighing_session/resolve") return original(message);
      window.__recoveryRequest = message;
      hass.states["sensor.pt_session"].state = "Bezig";
      hass.states["sensor.pt_session"].attributes.revision = 3;
      hass.states["sensor.pt_session"].last_updated = new Date().toISOString();
      window.__weighingCard.hass = { ...hass };
      return { ok: true };
    };
  });
  await card.locator("#resume-session").click();
  await expect(card.locator("#session-recovery")).toBeHidden();
  await expect(card.locator("#weight-input")).toBeEnabled();
  await expect(card.locator("#save-weight")).toBeEnabled();
  await expect.poll(() => page.evaluate(() => window.__recoveryRequest)).toEqual({
    type: "puppy_tracker/weighing_session/resolve", action: "resume", session_id: "session-1", revision: 2,
  });
  expect(await page.evaluate(() => window.__oldWeightNode === window.__weighingCard.shadowRoot.querySelector("#weight-input"))).toBe(true);
});

test("interrupted weighing keeps the recovery choice on failure and ignores double taps", async ({ page }) => {
  await mountWeighingStation(page);
  await interruptSession(page);
  await page.evaluate(() => {
    const original = window.__mockHass.callWS;
    window.__recoveryRequests = 0;
    window.__mockHass.callWS = (message) => {
      if (message.type !== "puppy_tracker/weighing_session/resolve") return original(message);
      window.__recoveryRequests++;
      return new Promise((resolve, reject) => { window.__rejectRecovery = reject; });
    };
    window.__weighingCard._resolveSession(window.__weighingCard._station(), "resume");
    window.__weighingCard._resolveSession(window.__weighingCard._station(), "resume");
  });
  const card = page.locator("puppy-tracker-card");
  await expect(card.locator("#resume-session")).toBeDisabled();
  expect(await page.evaluate(() => window.__recoveryRequests)).toBe(1);
  await page.evaluate(() => window.__rejectRecovery(new Error("De weegsessie is gewijzigd. Vernieuw de kaart en probeer opnieuw.")));
  await expect(card.locator("#local-message")).toContainText("The weighing session changed");
  await expect(card.locator("#session-recovery")).toBeVisible();
  await expect(card.locator("#resume-session")).toBeEnabled();
  await expect(card.locator("#save-weight")).toBeDisabled();
});

test("interrupted weighing discard is confirmed and reader accounts cannot resolve it", async ({ page }) => {
  await mountWeighingStation(page);
  await interruptSession(page);
  let dialogs = 0;
  page.on("dialog", (dialog) => { dialogs++; dialog.dismiss(); });
  await page.locator("puppy-tracker-card #discard-session").click();
  expect(dialogs).toBe(1);
  await expect(page.locator("puppy-tracker-card #session-recovery")).toBeVisible();
  await page.evaluate(() => {
    window.__mockHass.user = { id: "reader", is_admin: false };
    window.__weighingCard.hass = window.__mockHass;
    window.__weighingCard._render();
  });
  await expect(page.locator("puppy-tracker-card #resume-session")).toBeHidden();
  await expect(page.locator("puppy-tracker-card #discard-session")).toBeHidden();
  await expect(page.locator("puppy-tracker-card #recovery-admin")).toBeVisible();
});

test("hiding the puppy list retains selected puppy and measurement context from the first render @cross-browser @tablet", async ({ page }) => {
  await mountWeighingStation(page, { show_puppies: false });
  const card = page.locator("puppy-tracker-card");
  await expect(card.locator("#puppy-list")).toBeHidden();
  await expect(card.locator("#current-puppy-indicator")).toBeVisible();
  await expect(card.locator("#current-puppy-name")).toHaveText("Alice (Red)");
  await expect(card.locator("#selected-last-value")).not.toHaveText("None");
  await expect(card.locator("#selected-previous-value")).toHaveText("398 g");
  await expect(card.locator("#next-puppy-name")).toHaveText("Bob (Blue)");
  await card.locator("#puppy-select").selectOption("Bob (Blue)");
  await notifyHassUpdate(page);
  await expect(card.locator("#current-puppy-name")).toHaveText("Bob (Blue)");
  await expect(card.locator("#selected-previous-value")).toHaveText("390 g");
  await expect(card.locator("#puppy-list")).toBeHidden();
});

test("weighing uses IDs when puppy names and collar colours are identical @cross-browser @tablet", async ({ page }) => {
  await mountWeighingStation(page);
  await page.evaluate(() => {
    const card = window.__weighingCard;
    for (const device of card._devices.filter((device) => ["device-puppy-1", "device-puppy-2"].includes(device.id))) device.name = "Nova";
    const states = window.__mockHass.states;
    for (const id of ["sensor.p1_collar", "sensor.p2_collar"]) states[id].state = "paars";
    states["select.pt_puppy"].state = "Nova (paars)";
    states["select.pt_puppy"].attributes = { options: ["Nova (paars)", "Nova (paars) · 2"], puppy_options: { "Nova (paars)": "p1", "Nova (paars) · 2": "p2" } };
    states["sensor.pt_remaining"].state = "Nova (paars), Nova (paars)";
    states["sensor.pt_remaining"].attributes = { litter_id: "l1", remaining_puppy_ids: ["p1", "p2"] };
    states["sensor.pt_next"].state = "Nova (paars)";
    states["sensor.pt_next"].attributes = { litter_id: "l1", puppy_id: "p1" };
    const original = window.__mockHass.callWS;
    window.__identityPreviewCalls = [];
    window.__mockHass.callWS = async (msg) => { if (msg.type === "puppy_tracker/weight/preview") window.__identityPreviewCalls.push(msg); return original(msg); };
    card.hass = window.__mockHass;
  });
  const card = page.locator("puppy-tracker-card");
  await expect(card.locator('[data-puppy-id="p2"]')).toHaveAttribute("data-puppy-option", "Nova (paars) · 2");
  expect(await card.evaluate((node) => node._weighingPuppies(node._station()).bottomIndicatorRow.puppyId)).toBe("p2");
  await card.locator("#puppy-select").selectOption("Nova (paars) · 2");
  await expect(card.locator('[data-puppy-id="p2"]')).toHaveClass(/selected/);
  await expect(card.locator('[data-puppy-id="p1"]')).not.toHaveClass(/selected/);
  await card.locator("#weight-input").fill("425");
  await card.locator("#save-weight").click();
  await expect.poll(() => page.evaluate(() => window.__identityPreviewCalls.at(-1)?.puppy_id)).toBe("p2");
  await notifyHassUpdate(page, { entityId: "sensor.pt_remaining", attributes: { remaining_puppy_ids: ["p2"] } });
  await expect(card.locator("#remaining-value")).toHaveText("Nova (paars)");
});

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
    await expect(card.locator("#current-puppy-name")).toHaveText("Bob (Blue)");
    await card.locator('#puppy-list [data-puppy-id="p1"]').click();
    await notifyHassUpdate(page);
    await expect(input).toHaveValue("425");
    await input.fill("");
    await select.selectOption("Bob (Blue)");
    await notifyHassUpdate(page);
    await expect(input).toHaveValue("");
    await input.fill("430");
    await card.locator("#save-weight").click();
    await expect.poll(() => page.evaluate(() => window.__weightSaves.some((call) => call.weight === 430))).toBe(true);
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

test("unusual weight requires confirmation for the exact draft and current baseline @cross-browser @tablet", async ({ page }) => {
  await mountWeighingStation(page);
  await page.evaluate(() => {
    const original = window.__mockHass.callWS;
    window.__previewBaseline = "m1";
    window.__mockHass.callWS = async (message) => message.type === "puppy_tracker/weight/preview"
      ? { anomaly: { change_percent: 46.34 }, baseline_id: window.__previewBaseline }
      : original(message);
  });
  const card = page.locator("puppy-tracker-card");
  const input = card.locator("#weight-input");
  await input.fill("600");
  await card.locator("#save-weight").click();
  await expect(card.locator("#local-message")).toContainText("Press Save weight again");
  await expect(input).toHaveValue("600");
  expect(await page.evaluate(() => window.__weightSaves)).toHaveLength(0);
  await page.evaluate(() => { window.__previewBaseline = "m2"; });
  await card.locator("#save-weight").click();
  await expect.poll(() => card.evaluate((element) => element._pendingWeightConfirmation)).toContain("m2");
  expect(await page.evaluate(() => window.__weightSaves)).toHaveLength(0);
  await card.locator("#save-weight").click();
  await expect.poll(() => page.evaluate(() => window.__weightSaves.length)).toBe(1);
});

test("shows the selected puppy collar color prominently", async ({ page }) => {
  await mountWeighingStation(page);

  const indicator = page.locator("puppy-tracker-card #current-puppy-indicator");
  const collar = page.locator("puppy-tracker-card #current-puppy-collar");
  const nextIndicator = page.locator("puppy-tracker-card #next-puppy-indicator");
  const nextCollar = page.locator("puppy-tracker-card #next-puppy-collar");

  await expect(indicator).toContainText("Alice (Red)");
  await expect(collar).toBeVisible();
  await expect(collar).toHaveCSS("background-color", "rgb(229, 57, 53)");
  await expect(nextIndicator).toContainText("Next puppy");
  await expect(nextIndicator).toContainText("Bob (Blue)");
  await expect(nextCollar).toHaveCSS("background-color", "rgb(30, 136, 229)");

  await page.locator("puppy-tracker-card #puppy-select").selectOption("Bob (Blue)");
  await notifyHassUpdate(page);

  await expect(indicator).toContainText("Bob (Blue)");
  await expect(collar).toHaveCSS("background-color", "rgb(30, 136, 229)");
  await expect(page.locator("puppy-tracker-card #weight-input")).toBeFocused();

  await page.locator("puppy-tracker-card #weight-input").blur();
  await notifyHassUpdate(page, { entityId: "sensor.pt_next", state: "Bob" });
  await expect(nextIndicator).toContainText("Weigh now");
  await expect(nextIndicator).toContainText("Bob (Blue)");
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

test("weight entry is atomic while session actions use their HA services", async ({ page }) => {
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
      expect.objectContaining({ domain: "button", service: "press", entityId: "button.pt_reset" }),
    ])
  );
  expect(await page.evaluate(() => window.__weightSaves)).toEqual([
    expect.objectContaining({ type: "puppy_tracker/weight/save", litter_id: "l1", puppy_id: "p1", weight: 428 }),
  ]);
  expect(calls.filter((call) => call.domain === "number" || call.entityId === "button.pt_save")).toEqual([]);
});

test("a second dashboard cannot redirect a save through shared station controls @cross-browser @tablet", async ({ page }) => {
  await mountWeighingStation(page);
  await page.evaluate(() => {
    const original = window.__mockHass.callWS;
    window.__mockHass.callWS = async (message) => {
      const result = await original(message);
      if (message.type === "puppy_tracker/weight/preview") {
        window.__mockHass.states["select.pt_puppy"].state = "Bob (Blue)";
        window.__mockHass.states["number.pt_weight"].state = "999";
      }
      return result;
    };
  });
  const card = page.locator("puppy-tracker-card");
  await card.locator("#weight-input").fill("428");
  await card.locator("#save-weight").click();
  await expect(card.locator("#local-message")).toContainText("Alice (Red): 428 g saved");
  expect(await page.evaluate(() => window.__weightSaves)).toEqual([
    expect.objectContaining({ puppy_id: "p1", weight: 428 }),
  ]);
});

for (const change of ["refresh", "user", "connection", "role"]) {
  test(`weight preflight handles a ${change} update without misapplying writes @cross-browser @tablet`, async ({ page }) => {
    await mountWeighingStation(page);
    await page.evaluate((change) => {
      const hass = window.__mockHass;
      hass.user = { id: "admin", is_admin: true };
      hass.connection = {};
      const original = hass.callWS;
      hass.callWS = async (message) => {
        const result = await original(message);
        if (message.type === "puppy_tracker/weight/preview") {
          const next = { ...hass, states: { ...hass.states } };
          if (change === "user") next.user = { id: "other", is_admin: true };
          if (change === "connection") next.connection = {};
          if (change === "role") next.user = { id: "admin", is_admin: false };
          window.__weighingCard.hass = next;
        }
        return result;
      };
    }, change);
    const card = page.locator("puppy-tracker-card");
    await card.locator("#weight-input").fill("428");
    await card.locator("#save-weight").click();
    await expect.poll(() => card.evaluate((element) => element._weightSaveBusy)).toBe(false);
    expect(await page.evaluate(() => window.__weightSaves.length)).toBe(change === "refresh" ? 1 : 0);
    if (change === "refresh") await expect(card.locator("#local-message")).toContainText("428 g saved");
    else await expect(card.locator("#weight-input")).toHaveValue("428");
    if (change === "role") await expect(card.locator("#save-weight")).toBeDisabled();
  });
}

test("atomic save errors are translated and keep the draft @cross-browser @tablet", async ({ page }) => {
  await mountWeighingStation(page);
  await page.evaluate(() => {
    const original = window.__mockHass.callWS;
    window.__mockHass.callWS = (message) => {
      if (message.type === "puppy_tracker/weight/save") throw new Error("De vorige meting is gewijzigd. Controleer het gewicht opnieuw.");
      return original(message);
    };
  });
  const card = page.locator("puppy-tracker-card");
  await card.locator("#weight-input").fill("428");
  await card.locator("#save-weight").click();
  await expect(card.locator("#local-message")).toHaveText("The previous measurement changed. Check the weight again.");
  await expect(card.locator("#weight-input")).toHaveValue("428");
  await expect(card.locator("#save-weight")).toBeEnabled();
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
