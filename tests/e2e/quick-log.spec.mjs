import { expect, test } from "@playwright/test";

async function openFixture(page) {
  await page.goto("/tests/e2e/cards.html");
  await page.waitForFunction(() => window.__puppyTrackerReady === true);
}

async function mountQuickLog(page, language = "en") {
  await openFixture(page);

  await page.evaluate((selectedLanguage) => {
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

        throw new Error(`Unexpected WS call: ${message.type}`);
      },
    };

    window.__quickLogCalls = calls;
    window.__quickLogSubscriptions = subscriptions;

    const constructor = customElements.get("puppy-tracker-quick-log-card");
    const card = document.createElement("puppy-tracker-quick-log-card");
    card.setConfig(constructor.getStubConfig());
    document.querySelector("#cards").appendChild(card);
    card.hass = hass;
  }, language);

  const card = page.locator("puppy-tracker-quick-log-card");
  await expect(card.locator("#owner-select")).toBeVisible();
  return card;
}

function recordAddCalls(page) {
  return page.evaluate(() =>
    window.__quickLogCalls.filter((call) => call.type === "puppy_tracker/record/add")
  );
}

test("logs a feeding observation for the selected puppy with an editable current timestamp", async ({ page }) => {
  const card = await mountQuickLog(page, "en");

  await card.locator("#owner-select").selectOption("p1");
  await card.locator('[data-preset="feeding"]').click();

  const occurred = card.locator("#quick-occurred");
  await expect(occurred).not.toHaveValue("");

  const initialValue = await occurred.inputValue();
  const initialDate = new Date(initialValue);
  expect(Number.isFinite(initialDate.getTime())).toBe(true);
  expect(Math.abs(Date.now() - initialDate.getTime())).toBeLessThan(60_000);

  await occurred.fill("2026-08-31T05:00:00");
  await card.locator("#quick-note").fill("Bottle 45 ml, drank well");
  await card.locator("#quick-save").click();

  const calls = await recordAddCalls(page);
  expect(calls).toHaveLength(1);
  expect(calls[0]).toEqual(
    expect.objectContaining({
      litter_id: "l1",
      puppy_id: "p1",
      record_type: "note",
      title: "Feeding",
      note: "Bottle 45 ml, drank well",
    })
  );
  expect(new Date(calls[0].occurred_at).toISOString()).toBe("2026-08-31T05:00:00.000Z");
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

test("switching presets preserves unsaved input", async ({ page }) => {
  const card = await mountQuickLog(page, "en");

  await card.locator('[data-preset="note"]').click();
  await card.locator("#quick-note").fill("Keep this text");
  const occurred = await card.locator("#quick-occurred").inputValue();

  await card.locator('[data-preset="elimination"]').click();

  await expect(card.locator("#quick-note")).toHaveValue("Keep this text");
  await expect(card.locator("#quick-occurred")).toHaveValue(occurred);
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
  await expect(card.getByText("Ontlasting / urine", { exact: true })).toBeVisible();
  await expect(card.getByText("Medicatie", { exact: true })).toBeVisible();
  await expect(card.getByText("Mijlpaal", { exact: true })).toBeVisible();
});
