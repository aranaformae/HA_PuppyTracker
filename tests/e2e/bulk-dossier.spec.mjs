import { expect, test } from "@playwright/test";

async function openFixture(page) {
  await page.goto("/tests/e2e/cards.html");
  await page.waitForFunction(() => window.__puppyTrackerReady === true);
}

async function mountBulkDossier(page, language = "en", failPuppyId = null) {
  await openFixture(page);

  await page.evaluate(({ selectedLanguage, initialFailure }) => {
    const calls = [];
    const successfulAdds = [];
    const subscriptions = [];
    let nextRecord = 1;

    window.__bulkFailPuppyId = initialFailure;

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
            litters: [{ id: "l1", name: "Luna x Dutch", active: true }],
          };
        }

        if (message.type === "puppy_tracker/data") {
          return {
            can_manage_records: true,
            litter: { id: "l1", name: "Luna x Dutch", active: true },
            puppies: [
              { id: "p1", name: "Alice", active: true },
              { id: "p2", name: "Bob", active: true },
              { id: "p3", name: "Charlie", active: true },
            ],
          };
        }

        if (message.type === "puppy_tracker/record/add") {
          if (message.puppy_id === window.__bulkFailPuppyId) {
            throw new Error(`Simulated failure for ${message.puppy_id}`);
          }
          const recordId = `bulk-${nextRecord++}`;
          successfulAdds.push({
            puppy_id: message.puppy_id,
            record_id: recordId,
            message: JSON.parse(JSON.stringify(message)),
          });
          return { ok: true, record_id: recordId };
        }

        throw new Error(`Unexpected WS call: ${message.type}`);
      },
    };

    window.__bulkCalls = calls;
    window.__bulkSuccessfulAdds = successfulAdds;
    window.__bulkSubscriptions = subscriptions;

    const constructor = customElements.get("puppy-tracker-bulk-dossier-card");
    const card = document.createElement("puppy-tracker-bulk-dossier-card");
    card.setConfig(constructor.getStubConfig());
    document.querySelector("#cards").appendChild(card);
    card.hass = hass;
  }, { selectedLanguage: language, initialFailure: failPuppyId });

  const card = page.locator("puppy-tracker-bulk-dossier-card");
  await expect(card.locator("#select-all")).toBeVisible();
  await expect(card.locator("#bulk-type")).toBeVisible();
  return card;
}

function recordAddCalls(page) {
  return page.evaluate(() =>
    window.__bulkCalls.filter((call) => call.type === "puppy_tracker/record/add")
  );
}

test("creates enriched individual deworming records for the whole litter after review", async ({ page }) => {
  const card = await mountBulkDossier(page, "en");

  await card.locator("#select-all").click();
  await expect(card.getByText("3 selected", { exact: true })).toBeVisible();

  await card.locator("#bulk-title").fill("Routine deworming");
  await card.locator("#bulk-note").fill("All puppies tolerated treatment well");
  await card.locator("#bulk-data-product").fill("Puppy wormer");
  await card.locator("#bulk-data-active_ingredient").fill("Pyrantel / febantel");
  await card.locator("#bulk-data-amount").fill("1.5");
  await card.locator("#bulk-data-unit").fill("ml");
  await card.locator("#bulk-data-dose").fill("1.5 ml oral");
  await card.locator("#bulk-data-route").fill("oral");
  await card.locator("#bulk-data-batch_number").fill("WORM-42");
  await card.locator("#bulk-data-administered_by").fill("Breeder");
  await card.locator("#bulk-data-weight_grams").fill("1500");
  await card.locator("#bulk-data-next_due_date").fill("2026-09-14");

  await card.locator("#bulk-review").click();
  await expect(card.getByText("Review bulk entry", { exact: true })).toBeVisible();
  await expect(card.getByText("Alice, Bob, Charlie", { exact: true })).toBeVisible();
  await expect(card.getByText("Routine deworming", { exact: true })).toBeVisible();
  await expect(card.getByText(/Active ingredient: Pyrantel \/ febantel/)).toBeVisible();
  await expect(card.getByText(/Weight at administration \(g\): 1500/)).toBeVisible();

  await card.locator("#bulk-confirm").click();
  await expect(card.getByText("Saved for all 3 puppies.", { exact: true })).toBeVisible();

  const calls = await recordAddCalls(page);
  expect(calls).toHaveLength(3);
  expect(calls.map((call) => call.puppy_id)).toEqual(["p1", "p2", "p3"]);
  for (const call of calls) {
    expect(call.record_type).toBe("deworming");
    expect(call.title).toBe("Routine deworming");
    expect(call.note).toBe("All puppies tolerated treatment well");
    expect(call.data).toEqual({
      product: "Puppy wormer",
      active_ingredient: "Pyrantel / febantel",
      amount: "1.5",
      unit: "ml",
      dose: "1.5 ml oral",
      route: "oral",
      batch_number: "WORM-42",
      administered_by: "Breeder",
      weight_grams: "1500",
      next_due_date: "2026-09-14",
    });
  }

  const ids = await card.evaluate((element) =>
    element._result.successes.map((success) => success.record_id)
  );
  expect(new Set(ids).size).toBe(3);
});

test("bulk care review blocks missing required product fields", async ({ page }) => {
  const card = await mountBulkDossier(page, "en");

  await card.locator("#select-all").click();
  await card.locator("#bulk-review").click();

  await expect(card.getByText(/Complete the required field\(s\): Product/)).toBeVisible();
  await expect(card.getByText("Review bulk entry", { exact: true })).toHaveCount(0);
  expect(await recordAddCalls(page)).toHaveLength(0);
});

test("supports all planned bulk care record types", async ({ page }) => {
  const card = await mountBulkDossier(page, "en");
  const values = await card.locator("#bulk-type option").evaluateAll((options) =>
    options.map((option) => option.value)
  );
  expect(values).toEqual([
    "deworming",
    "vaccination",
    "test",
    "vet_visit",
    "milestone",
  ]);
});

test("partial failure keeps only failed puppies selected for a safe retry", async ({ page }) => {
  const card = await mountBulkDossier(page, "en", "p2");

  await card.locator("#select-all").click();
  await card.locator("#bulk-type").selectOption("vaccination");
  await card.locator("#bulk-title").fill("First vaccination");
  await card.locator("#bulk-data-vaccine").fill("Puppy DP");
  await card.locator("#bulk-data-batch_number").fill("LOT-42");
  await card.locator("#bulk-review").click();
  await card.locator("#bulk-confirm").click();

  await expect(card.getByText(/Saved for 2 of 3 puppies/)).toBeVisible();
  await expect(card.getByText("Failed puppies", { exact: true })).toBeVisible();

  const checkedAfterFailure = await card.locator(".puppy-check").evaluateAll((inputs) =>
    inputs.filter((input) => input.checked).map((input) => input.dataset.puppyId)
  );
  expect(checkedAfterFailure).toEqual(["p2"]);
  await expect(card.locator("#bulk-title")).toHaveValue("First vaccination");
  await expect(card.locator("#bulk-data-vaccine")).toHaveValue("Puppy DP");

  let successful = await page.evaluate(() => window.__bulkSuccessfulAdds.map((item) => item.puppy_id));
  expect(successful).toEqual(["p1", "p3"]);

  await page.evaluate(() => { window.__bulkFailPuppyId = null; });
  await card.locator("#bulk-review").click();
  await expect(card.getByText("Save for 1 puppy", { exact: true })).toBeVisible();
  await card.locator("#bulk-confirm").click();
  await expect(card.getByText("Saved for 1 puppy.", { exact: true })).toBeVisible();

  successful = await page.evaluate(() => window.__bulkSuccessfulAdds.map((item) => item.puppy_id));
  expect(successful).toEqual(["p1", "p3", "p2"]);

  const allCalls = await recordAddCalls(page);
  expect(allCalls.map((call) => call.puppy_id)).toEqual(["p1", "p2", "p3", "p2"]);
});

test("bulk dossier UI is localized in Dutch", async ({ page }) => {
  const card = await mountBulkDossier(page, "nl");

  await expect(card.getByText("Bulk dossier", { exact: true })).toBeVisible();
  await expect(card.getByText("Hele nest selecteren", { exact: true })).toBeVisible();
  await expect(card.getByText("Gedeeld dossieritem", { exact: true })).toBeVisible();
  await expect(card.getByText("Controleren", { exact: true })).toBeVisible();
  await expect(card.getByText("Werkzame stof", { exact: true })).toBeVisible();
  await expect(card.getByText("Gewicht bij toediening (g)", { exact: true })).toBeVisible();
});
