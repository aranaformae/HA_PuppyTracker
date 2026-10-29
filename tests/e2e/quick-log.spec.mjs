import { expect, test } from "@playwright/test";

async function openFixture(page) {
  await page.goto("/tests/e2e/cards.html");
  await page.waitForFunction(() => window.__puppyTrackerReady === true);
}

async function mountQuickLog(page, language = "en", config = {}) {
  await openFixture(page);

  await page.evaluate(({ selectedLanguage, config }) => {
    const calls = [];
    const subscriptions = [];
    const hass = {
      locale: { language: selectedLanguage },
      language: selectedLanguage,
      states: {},
      connection: {
        subscribeMessage: async (callback, message) => {
          calls.push({ ...message, subscription: true });
          subscriptions.push(callback);
          return async () => {};
        },
      },
      callWS: async (message) => {
        calls.push(JSON.parse(JSON.stringify(message)));
        if (message.type === "puppy_tracker/recurring_reminders") return { reminders: [] };

        if (message.type === "puppy_tracker/litters") {
          return {
            litters: [
              { id: "l1", name: "Luna x Dutch", active: true },
              { id: "l2", name: "Second litter", active: true },
            ],
          };
        }

        if (message.type === "puppy_tracker/data") {
          const second = message.litter_id === "l2";
          return {
            can_manage_records: true,
            litter: {
              id: message.litter_id,
              name: second ? "Second litter" : "Luna x Dutch",
              mother: second ? "Nova" : "Luna",
              active: true,
            },
            puppies: second
              ? [{ id: "p3", name: "Charlie", active: true }]
              : [
                  { id: "p1", name: "Alice", active: true },
                  { id: "p2", name: "Bob", active: true },
                ],
          };
        }

        if (message.type === "puppy_tracker/record/add") {
          return {
            record: {
              id: `r${calls.length}`,
              type: message.record_type,
              litter_id: message.litter_id,
              puppy_id: message.puppy_id || null,
              occurred_at: message.occurred_at,
              title: message.title || null,
              note: message.note || null,
              data: message.data || {},
            },
          };
        }

        if (message.type === "puppy_tracker/mother/record/add") {
          return {
            record: {
              id: `mr${calls.length}`,
              type: message.record_type,
              litter_id: message.litter_id,
              scope: "mother",
              mother_id: "mother-luna",
              occurred_at: message.occurred_at,
              title: message.title || null,
              note: message.note || null,
              data: message.data || {},
            },
          };
        }

        throw new Error(`Unexpected WS call: ${message.type}`);
      },
    };

    window.__quickLogCalls = calls;
    window.__quickLogSubscriptions = subscriptions;

    const constructor = customElements.get("puppy-tracker-quick-log-card");
    const card = document.createElement("puppy-tracker-quick-log-card");
    card.setConfig({ ...constructor.getStubConfig(), ...config });
    document.querySelector("#cards").appendChild(card);
    card.hass = hass;
  }, { selectedLanguage: language, config });

  const card = page.locator("puppy-tracker-quick-log-card");
  await expect(card.locator("#owner-select")).toBeVisible();
  return card;
}

function recordAddCalls(page) {
  return page.evaluate(() =>
    window.__quickLogCalls.filter((call) => call.type === "puppy_tracker/record/add")
  );
}

test("a chosen owner takes precedence over the remembered note owner", { tag: ["@cross-browser", "@tablet"] }, async ({ page }) => {
  const card = await mountQuickLog(page);
  await card.locator("#owner-select").selectOption("p1");
  await card.locator('[data-preset="note"]').click();
  await card.locator("#quick-note").fill("First puppy");
  await card.locator("#quick-save").click();

  for (const owner of ["p2", "__mother__", "__litter__"]) {
    await card.locator("#owner-select").selectOption(owner);
    await card.locator('[data-preset="note"]').click();
    await expect(card.locator("#owner-select")).toHaveValue(owner);
    await card.locator("#quick-note").fill(`Observation for ${owner}`);
    await page.evaluate(() => window.__quickLogSubscriptions[0]({ reason: "test-update" }));
    await card.locator("#quick-save").click();
    await expect(card.locator("#quick-save")).toHaveCount(0);
    await expect(card.locator("#owner-select")).toHaveValue(owner);
    await card.locator('[data-preset="note"]').click();
    await expect(card.locator("#owner-select")).toHaveValue(owner);
    await card.locator("#quick-cancel").click();
  }

  const calls = await recordAddCalls(page);
  expect(calls.map((call) => call.puppy_id || "__litter__")).toEqual(["p1", "p2", "__litter__"]);
  const motherCalls = await page.evaluate(() => window.__quickLogCalls.filter((call) => call.type === "puppy_tracker/mother/record/add"));
  expect(motherCalls).toHaveLength(1);
  expect(motherCalls[0].note).toBe("Observation for __mother__");
});

test("configured puppy is an initial default, not a forced owner on refresh", { tag: ["@cross-browser", "@tablet"] }, async ({ page }) => {
  const card = await mountQuickLog(page, "en", { default_selected: "puppy", puppy_id: "p1" });
  await expect(card.locator("#owner-select")).toHaveValue("p1");
  for (const owner of ["p2", "__mother__", "__litter__"]) {
    await card.locator("#owner-select").selectOption(owner);
    await card.evaluate(async (element) => {
      await element._queueRefresh();
      element.setConfig({ ...element._config, title: "Quick Log updated" });
    });
    await expect(card.locator("#owner-select")).toHaveValue(owner);
    await card.locator('[data-preset="note"]').click();
    await expect(card.locator("#owner-select")).toHaveValue(owner);
    await card.locator("#quick-cancel").click();
  }
});

test("remembered owners only initialize a new session without an explicit owner", async ({ page }) => {
  const card = await mountQuickLog(page);
  await card.evaluate((element) => {
    element._rememberOwner("note", "p2");
    element._rememberOwner("feeding", "p1");
    const replacement = document.createElement(element.localName);
    replacement.setConfig(element._config);
    element.replaceWith(replacement);
    replacement.hass = element._hass;
  });
  await card.locator('[data-preset="note"]').click();
  await expect(card.locator("#owner-select")).toHaveValue("p2");
  await card.locator("#quick-cancel").click();
  await card.locator('[data-preset="feeding"]').click();
  await expect(card.locator("#owner-select")).toHaveValue("p2");
  await card.locator("#quick-note").fill("Keep this draft with Bob");
  await card.evaluate((element) => element.setConfig({ ...element._config, title: "New title" }));
  await expect(card.locator("#owner-select")).toHaveValue("p2");
  await expect(card.locator("#quick-note")).toHaveValue("Keep this draft with Bob");
});

test("logs a feeding observation for the selected puppy with an editable current timestamp", async ({ page }) => {
  const card = await mountQuickLog(page, "en");

  await card.locator("#owner-select").selectOption("p1");
  await card.locator('[data-preset="feeding"]').click();
  await expect(card.locator("#quick-data-feeding_category option")).toHaveText([
    "", "Mother's milk", "Bottle", "Tube", "Gruel", "Solid food", "Kibble", "Fresh meat", "Shelf-stable meat", "Supplement",
  ]);
  await card.locator("#quick-data-feeding_category").selectOption("bottle");

  const occurred = card.locator("#quick-occurred");
  await expect(occurred).not.toHaveValue("");

  const initialValue = await occurred.inputValue();
  const initialDate = new Date(initialValue);
  expect(Number.isFinite(initialDate.getTime())).toBe(true);
  expect(Math.abs(Date.now() - initialDate.getTime())).toBeLessThan(60_000);

  const editedLocalValue = "2026-08-31T05:00";
  await occurred.fill(editedLocalValue);
  await card.locator("#quick-note").fill("Bottle 45 ml, drank well");
  await card.locator("#quick-save").click();

  const calls = await recordAddCalls(page);
  expect(calls).toHaveLength(1);
  expect(calls[0]).toEqual(
    expect.objectContaining({
      litter_id: "l1",
      puppy_id: "p1",
      record_type: "feeding",
      title: "Feeding",
      note: "Bottle 45 ml, drank well",
      data: expect.objectContaining({ feeding_category: "bottle" }),
    })
  );
  const expectedOccurredAt = await page.evaluate(
    (value) => new Date(value).toISOString(),
    editedLocalValue
  );
  expect(calls[0].occurred_at).toBe(expectedOccurredAt);
});

test("logs a structured daily care observation for the selected puppy @cross-browser @tablet", async ({ page }) => {
  const card = await mountQuickLog(page, "nl");
  await card.locator("#owner-select").selectOption("p1");
  await card.locator('[data-preset="daily_care"]').click();
  await expect(card.locator("#quick-data-care_area option")).toHaveText([
    "", "Ontlasting", "Urine", "Navel", "Huid", "Activiteit",
  ]);
  await card.locator("#quick-data-care_area").selectOption("stool");
  await card.locator("#quick-data-observation").fill("Normaal gevormd");
  await card.locator("#quick-save").click();
  const calls = await recordAddCalls(page);
  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({ litter_id: "l1", puppy_id: "p1", record_type: "daily_care",
    data: { care_area: "stool", observation: "Normaal gevormd" } });
});

test("supports litter-scoped medication and puppy-scoped milestone logging", async ({ page }) => {
  const card = await mountQuickLog(page, "en");

  await expect(card.locator("#owner-select")).toHaveValue("__litter__");
  await card.locator('[data-preset="medication"]').click();
  await card.locator("#quick-note").fill("Medication administered to the whole litter");
  await card.locator("#quick-save").click();

  await card.locator("#owner-select").selectOption("p2");
  await card.locator('[data-preset="milestone"]').click();
  await card.locator("#quick-note").fill("Eyes opened");
  await card.locator("#quick-save").click();

  const calls = await recordAddCalls(page);
  expect(calls).toHaveLength(2);
  expect(calls[0].record_type).toBe("medication");
  expect(calls[0].puppy_id).toBeUndefined();
  expect(calls[1].record_type).toBe("milestone");
  expect(calls[1].puppy_id).toBe("p2");
});

test("exposes every shared dossier type and saves structured deworming", { tag: ["@cross-browser", "@tablet"] }, async ({ page }) => {
  const card = await mountQuickLog(page, "en");
  const presetValues = await card.locator("[data-preset]").evaluateAll((buttons) =>
    buttons.map((button) => button.dataset.preset)
  );
  expect(presetValues).toEqual([
    "note",
    "feeding",
    "daily_care",
    "temperature",
    "vaccination",
    "test",
    "deworming",
    "medication",
    "vet_visit",
    "milestone",
    "other",
  ]);

  await card.locator("#owner-select").selectOption("p1");
  await card.locator('[data-preset="deworming"]').click();
  await card.locator("#quick-data-product").fill("Puppy wormer");
  await card.locator("#quick-data-amount").fill("1.5");
  await card.locator("#quick-data-unit").fill("ml");
  await card.locator("#quick-save").click();

  const calls = await recordAddCalls(page);
  expect(calls).toHaveLength(1);
  expect(calls[0]).toEqual(expect.objectContaining({
    puppy_id: "p1",
    record_type: "deworming",
    title: "Deworming",
    data: { product: "Puppy wormer", amount: "1.5", unit: "ml", recurring_completion: "none" },
  }));

  const dimensions = await card.evaluate((element) => {
    const container = element.shadowRoot.querySelector("ha-card");
    return { clientWidth: container.clientWidth, scrollWidth: container.scrollWidth };
  });
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
});

test("Quick Log validates and saves a completed test with its reference @cross-browser @tablet", async ({ page }) => {
  const card = await mountQuickLog(page, "nl");
  await card.locator("#owner-select").selectOption("p1");
  await card.locator('[data-preset="test"]').click();
  await card.locator("#quick-data-test_name").fill("Giardia");
  await card.locator("#quick-data-test_status").selectOption("completed");
  await card.locator("#quick-save").click();
  expect(await recordAddCalls(page)).toHaveLength(0);
  await card.locator("#quick-data-result").fill("Negatief");
  await card.locator("#quick-data-reference_number").fill("LAB-42");
  await card.locator("#quick-save").click();
  await expect.poll(async () => (await recordAddCalls(page)).length).toBe(1);
  expect((await recordAddCalls(page))[0]).toMatchObject({ record_type: "test", puppy_id: "p1", data: { test_name: "Giardia", test_status: "completed", result: "Negatief", reference_number: "LAB-42" } });
});

test("logs a temperature for the selected mother instead of the whole litter", async ({ page }) => {
  const card = await mountQuickLog(page, "en");

  await card.locator("#owner-select").selectOption({ label: "Mother · Luna" });
  await card.locator('[data-preset="temperature"]').click();
  await card.locator("#quick-temperature").fill("38.4");
  await card.locator("#quick-save").click();

  const calls = await page.evaluate(() => window.__quickLogCalls);
  expect(calls.filter((call) => call.type === "puppy_tracker/record/add")).toHaveLength(0);
  expect(calls).toContainEqual(expect.objectContaining({
    type: "puppy_tracker/mother/record/add",
    litter_id: "l1",
    record_type: "temperature",
    data: { temperature_c: 38.4, recurring_completion: "none" },
  }));
});

test("logs a structured temperature for the selected puppy with an optional observation", async ({ page }) => {
  const card = await mountQuickLog(page, "en");

  await card.locator("#owner-select").selectOption("p2");
  await card.locator('[data-preset="temperature"]').click();
  await card.locator("#quick-temperature").fill("37.9");
  await card.locator("#quick-note").fill("Sleeping after feeding");
  await card.locator("#quick-save").click();

  const calls = await recordAddCalls(page);
  expect(calls).toHaveLength(1);
  expect(calls[0]).toEqual(expect.objectContaining({
    litter_id: "l1",
    puppy_id: "p2",
    record_type: "temperature",
    title: "Temperature",
    note: "Sleeping after feeding",
    data: { temperature_c: 37.9, recurring_completion: "none" },
  }));
});

test("switching presets preserves unsaved input", async ({ page }) => {
  const card = await mountQuickLog(page, "en");

  await card.locator('[data-preset="note"]').click();
  await card.locator("#quick-note").fill("Keep this text");
  const occurred = await card.locator("#quick-occurred").inputValue();

  await card.locator('[data-preset="daily_care"]').click();

  await expect(card.locator("#quick-note")).toHaveValue("Keep this text");
  await expect(card.locator("#quick-occurred")).toHaveValue(occurred);

  await card.locator('[data-preset="feeding"]').click();
  await card.locator("#quick-data-amount").fill("45");
  await card.locator('[data-preset="medication"]').click();
  await card.locator("#quick-data-medication").fill("Draft medicine");
  await card.locator('[data-preset="feeding"]').click();
  await expect(card.locator("#quick-data-amount")).toHaveValue("45");
});

test("live updates are deferred while Quick Log contains unsaved input", async ({ page }) => {
  const card = await mountQuickLog(page, "en");

  await card.locator('[data-preset="note"]').click();
  await card.locator("#quick-note").fill("Unsaved bedside observation");

  await page.evaluate(() => window.__quickLogSubscriptions?.[0]?.({ reason: "test-update" }));
  await page.waitForTimeout(100);

  await expect(card.locator("#quick-note")).toHaveValue("Unsaved bedside observation");

  const state = await card.evaluate((element) => ({
    refreshDeferred: Boolean(element._refreshDeferred),
    draftActive: Boolean(element._draft),
  }));
  expect(state.refreshDeferred).toBe(true);
  expect(state.draftActive).toBe(true);
});

test("Quick Log is localized in Dutch", async ({ page }) => {
  const card = await mountQuickLog(page, "nl");

  await expect(card.getByText("Snel loggen", { exact: true })).toBeVisible();
  await expect(card.getByText("Voeding", { exact: true })).toBeVisible();
  await expect(card.getByText("Dagelijkse zorg", { exact: true })).toBeVisible();
  await expect(card.getByText("Medicatie", { exact: true })).toBeVisible();
  await expect(card.getByText("Mijlpaal", { exact: true })).toBeVisible();
  await expect(card.getByText("Temperatuur", { exact: true })).toBeVisible();
});
