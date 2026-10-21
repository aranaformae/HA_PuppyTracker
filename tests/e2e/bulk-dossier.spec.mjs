import { expect, test } from "@playwright/test";

async function openFixture(page) {
  await page.goto("/tests/e2e/cards.html");
  await page.waitForFunction(() => window.__puppyTrackerReady === true);
}

async function mountBulkDossier(page, language = "en", failPuppyId = null, initialHold = []) {
  await openFixture(page);

  await page.evaluate(({ selectedLanguage, initialFailure, initialHold }) => {
    const calls = [];
    const successfulAdds = [];
    const subscriptions = [];
    let nextRecord = 1;

    window.__bulkFailPuppyId = initialFailure;
    window.__bulkPending = [];
    window.__bulkHold = new Set(initialHold);
    const response = (message, result) => window.__bulkHold.has(message.type)
      ? new Promise((resolve, reject) => window.__bulkPending.push({
        message: structuredClone(message), resolve: (value = result) => resolve(value), reject,
      })) : result;

    const hass = {
      locale: { language: selectedLanguage },
      language: selectedLanguage,
      states: {},
      connection: {
        subscribeMessage: async (callback, message) => {
          calls.push({ ...message, subscription: true });
          subscriptions.push(callback);
          return async () => { const index = subscriptions.indexOf(callback); if (index >= 0) subscriptions.splice(index, 1); };
        },
      },
      callWS: async (message) => {
        calls.push(JSON.parse(JSON.stringify(message)));

        if (message.type === "puppy_tracker/litters") {
          return response(message, {
            litters: [{ id: "l1", name: "Luna x Dutch", active: true }, { id: "l2", name: "Other litter", active: true }],
          });
        }

        if (message.type === "puppy_tracker/data") {
          return response(message, {
            can_manage_records: true,
            litter: { id: message.litter_id, name: message.litter_id === "l1" ? "Luna x Dutch" : "Other litter", active: true },
            puppies: message.litter_id === "l2" ? [{ id: "other", name: "Other puppy", active: true }] : [
              { id: "p1", name: "Alice", active: true },
              { id: "p2", name: "Bob", active: true },
              { id: "p3", name: "Charlie", active: true },
            ],
          });
        }

        if (message.type === "puppy_tracker/record/add") {
          await response(message, { ok: true });
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
    window.__bulkHass = hass;

    const constructor = customElements.get("puppy-tracker-bulk-dossier-card");
    const card = document.createElement("puppy-tracker-bulk-dossier-card");
    card.setConfig(constructor.getStubConfig());
    document.querySelector("#cards").appendChild(card);
    card.hass = hass;
  }, { selectedLanguage: language, initialFailure: failPuppyId, initialHold });

  const card = page.locator("puppy-tracker-bulk-dossier-card");
  await expect(card.locator("#select-all")).toBeVisible();
  if (!initialHold.length) await expect(card.locator("#bulk-type")).toBeVisible();
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

  await expect(card.locator("#bulk-data-product")).toHaveAttribute("aria-invalid", "true");
  await expect(card.locator("#bulk-data-product-error")).toContainText("Complete the required field(s): Product");
  await expect(card.getByText("Review bulk entry", { exact: true })).toHaveCount(0);
  expect(await recordAddCalls(page)).toHaveLength(0);
});

test("supports every shared dossier record type", async ({ page }) => {
  const card = await mountBulkDossier(page, "en");
  const values = await card.locator("#bulk-type option").evaluateAll((options) =>
    options.map((option) => option.value)
  );
  expect(values).toEqual([
    "note",
    "feeding",
    "temperature",
    "vaccination",
    "test",
    "deworming",
    "medication",
    "vet_visit",
    "milestone",
    "other",
  ]);

  await card.locator("#bulk-data-product").fill("Draft wormer");
  await card.locator("#bulk-type").selectOption("medication");
  await expect(card.locator("#bulk-data-medication")).toBeVisible();
  await expect(card.locator("#bulk-data-dose")).toBeVisible();
  await card.locator("#bulk-type").selectOption("deworming");
  await expect(card.locator("#bulk-data-product")).toHaveValue("Draft wormer");
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

  const activeIngredient = card.locator("#bulk-data-active_ingredient");
  await expect(activeIngredient).toBeVisible();
  await expect(activeIngredient).toHaveAttribute("placeholder", "Bijvoorbeeld pyrantel / febantel");

  const weight = card.locator("#bulk-data-weight_grams");
  await expect(weight).toBeVisible();
  await expect(weight).toHaveAttribute("placeholder", "Optioneel gewicht van de pup in gram");
});

async function releasePending(page, type, index = 0, result = null, error = null) {
  await page.evaluate(({ type, index, result, error }) => {
    const pending = window.__bulkPending.filter((item) => item.message.type === type)[index];
    window.__bulkPending.splice(window.__bulkPending.indexOf(pending), 1);
    if (error) pending.reject(new Error(error));
    else if (result) pending.resolve(result);
    else pending.resolve();
  }, { type, index, result, error });
}

async function pendingCount(page, type, count) {
  await expect.poll(() => page.evaluate((type) => window.__bulkPending.filter((item) => item.message.type === type).length, type)).toBe(count);
}

for (const language of ["nl", "en"]) {
  test(`bulk save pins litter, puppies and input through delayed failures and retries (${language}) @cross-browser @tablet`, async ({ page }) => {
    const card = await mountBulkDossier(page, language, "p2");
    await card.locator("#select-all").click();
    await card.locator("#bulk-title").fill("Original entry");
    await card.locator("#bulk-data-product").fill("Original product");
    await card.locator("#bulk-review").click();
    await page.evaluate(() => window.__bulkHold.add("puppy_tracker/record/add"));
    await card.locator("#bulk-confirm").click();
    await pendingCount(page, "puppy_tracker/record/add", 1);
    for (const selector of ["#bulk-litter", "#select-all", "#clear-all", "#bulk-title", "#bulk-type", "#bulk-back", "#bulk-confirm", ".puppy-check"]) {
      await expect(card.locator(selector).first()).toBeDisabled();
    }
    await card.evaluate(async (node) => {
      node._setSelection([]);
      node._togglePuppy("p3", false);
      node._changeType("note");
      node.shadowRoot.getElementById("bulk-back").dispatchEvent(new Event("click"));
      node.setConfig({ ...node._config, litter_id: "l2" });
      await node._selectLitter("l2");
      await node._saveBulk();
    });
    expect(await card.evaluate((node) => ({ litter: node._selectedLitterId, selected: [...node._selectedPuppyIds], type: node._form.record_type, review: node._review })))
      .toEqual({ litter: "l1", selected: ["p1", "p2", "p3"], type: "deworming", review: true });
    for (let index = 0; index < 3; index += 1) {
      await pendingCount(page, "puppy_tracker/record/add", 1);
      await releasePending(page, "puppy_tracker/record/add");
    }
    await expect(card.locator(".error")).toContainText("p2");
    expect(await card.locator(".puppy-check:checked").evaluateAll((inputs) => inputs.map((input) => input.dataset.puppyId))).toEqual(["p2"]);
    await expect(card.locator("#bulk-title")).toHaveValue("Original entry");
    await page.evaluate(() => { window.__bulkFailPuppyId = null; });
    await card.locator("#bulk-review").click();
    await card.locator("#bulk-confirm").click();
    await pendingCount(page, "puppy_tracker/record/add", 1);
    await releasePending(page, "puppy_tracker/record/add");
    await expect.poll(() => card.evaluate((node) => node._saving)).toBe(false);
    const calls = await recordAddCalls(page);
    expect(calls.map((call) => call.puppy_id)).toEqual(["p1", "p2", "p3", "p2"]);
    for (const call of calls) expect(call).toMatchObject({ litter_id: "l1", record_type: "deworming", title: "Original entry", data: { product: "Original product" } });
    expect(await page.evaluate(() => window.__bulkSuccessfulAdds.map((item) => item.puppy_id))).toEqual(["p1", "p3", "p2"]);
  });
}

test("a refresh started before typing cannot change an active bulk save @cross-browser @tablet", async ({ page }) => {
  const card = await mountBulkDossier(page);
  await page.evaluate(() => {
    window.__bulkHold.add("puppy_tracker/litters");
    window.__bulkHold.add("puppy_tracker/record/add");
    for (const callback of window.__bulkSubscriptions) callback({});
  });
  await pendingCount(page, "puppy_tracker/litters", 1);
  await card.locator("#select-all").click();
  await card.locator("#bulk-data-product").fill("Original product");
  await card.locator("#bulk-review").click();
  await card.locator("#bulk-confirm").click();
  await pendingCount(page, "puppy_tracker/record/add", 1);
  await releasePending(page, "puppy_tracker/litters", 0, { litters: [{ id: "l2", name: "Other litter", active: true }] });
  await expect.poll(() => card.evaluate((node) => node._refreshing)).toBeFalsy();
  expect(await card.evaluate((node) => node._selectedLitterId)).toBe("l1");
  for (let index = 0; index < 3; index += 1) {
    await pendingCount(page, "puppy_tracker/record/add", 1);
    await releasePending(page, "puppy_tracker/record/add");
  }
  await expect.poll(() => card.evaluate((node) => node._saving)).toBe(false);
  expect((await recordAddCalls(page)).map((call) => call.litter_id)).toEqual(["l1", "l1", "l1"]);
  expect(await card.evaluate((node) => node._result.litter_id)).toBe("l1");
  await pendingCount(page, "puppy_tracker/litters", 1);
  await releasePending(page, "puppy_tracker/litters", 0, { litters: [{ id: "l2", name: "Other litter", active: true }] });
  await expect(card.locator(".puppy-option")).toContainText("Other puppy");
  expect(await card.evaluate((node) => node._result)).toBeNull();
});

for (const outcome of ["success", "failure"]) {
  test(`bulk litter changes ignore an older ${outcome} during A-B-A selection @cross-browser @tablet`, async ({ page }) => {
    const card = await mountBulkDossier(page);
    await page.evaluate(() => window.__bulkHold.add("puppy_tracker/data"));
    await card.locator("#bulk-litter").selectOption("l2");
    await pendingCount(page, "puppy_tracker/data", 1);
    await card.locator("#bulk-litter").selectOption("l1");
    await pendingCount(page, "puppy_tracker/data", 2);
    await releasePending(page, "puppy_tracker/data", 0, null, outcome === "failure" ? "Old request failed" : null);
    await expect.poll(() => card.evaluate((node) => node._loading)).toBe(true);
    await expect(card.locator("#select-all")).toBeDisabled();
    await expect(card.locator("#bulk-type")).toHaveCount(0);
    await releasePending(page, "puppy_tracker/data");
    await expect(card.locator(".puppy-option")).toHaveCount(3);
    await expect(card.locator("#bulk-litter")).toHaveValue("l1");
    await expect(card.locator("#bulk-data-product")).toBeEnabled();
    await expect(card).not.toContainText("Old request failed");
    await expect(card).not.toContainText("Other puppy");
  });
}

test("bulk reconnect ignores requests from the detached card lifecycle @cross-browser @tablet", async ({ page }) => {
  const card = await mountBulkDossier(page);
  await page.evaluate(() => window.__bulkHold.add("puppy_tracker/data"));
  await card.locator("#bulk-litter").selectOption("l2");
  await pendingCount(page, "puppy_tracker/data", 1);
  await card.evaluate((node) => { const parent = node.parentElement; node.remove(); parent.append(node); });
  await pendingCount(page, "puppy_tracker/data", 2);
  await releasePending(page, "puppy_tracker/data", 1, { can_manage_records: true, litter: { id: "l2" }, puppies: [{ id: "new", name: "Current puppy", active: true }] });
  await expect(card.locator(".puppy-option")).toContainText("Current puppy");
  await releasePending(page, "puppy_tracker/data", 0, null, "Detached request failed");
  await expect(card).not.toContainText("Detached request failed");
  await expect(card.locator(".puppy-option")).toContainText("Current puppy");
});

test("bulk configuration changes invalidate an unfinished initial load @cross-browser @tablet", async ({ page }) => {
  const card = await mountBulkDossier(page, "en", null, ["puppy_tracker/litters"]);
  await pendingCount(page, "puppy_tracker/litters", 1);
  await card.evaluate((node) => node.setConfig({ ...node._config, litter_id: "l2" }));
  await pendingCount(page, "puppy_tracker/litters", 2);
  await releasePending(page, "puppy_tracker/litters", 1);
  await expect(card.locator(".puppy-option")).toContainText("Other puppy");
  await releasePending(page, "puppy_tracker/litters", 0, null, "Old initial load failed");
  await expect(card.locator("#bulk-litter")).toHaveValue("l2");
  await expect(card).not.toContainText("Old initial load failed");
  await expect(card.locator("#bulk-data-product")).toBeEnabled();
  expect(await page.evaluate(() => window.__bulkCalls.filter((call) => call.type === "puppy_tracker/data").map((call) => call.litter_id))).toEqual(["l2"]);
});

for (const inputEvent of ["input", "change"]) {
  test(`a late bulk refresh preserves ${inputEvent}-only drafts, focus and page scroll @cross-browser @tablet`, async ({ page }) => {
    const card = await mountBulkDossier(page);
    await page.evaluate(() => {
      window.__bulkHold.add("puppy_tracker/data");
      for (const callback of window.__bulkSubscriptions) callback({});
    });
    await pendingCount(page, "puppy_tracker/data", 1);
    if (inputEvent === "input") await card.locator("#bulk-note").fill("Keep this draft while data is refreshed");
    else await card.locator("#bulk-note").evaluate((input) => {
      input.value = "Keep this draft while data is refreshed";
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await card.evaluate((node) => {
      const spacer = document.createElement("div"); spacer.style.height = "2000px"; document.body.append(spacer);
      window.__bulkNote = node.shadowRoot.getElementById("bulk-note");
      window.__bulkNote.focus({ preventScroll: true });
      window.scrollTo(0, 200);
    });
    await releasePending(page, "puppy_tracker/data", 0, { can_manage_records: false, litter: { id: "l1" }, puppies: [] });
    await expect.poll(() => card.evaluate((node) => node._refreshing)).toBe(false);
    expect(await card.evaluate((node) => ({
      same: node.shadowRoot.getElementById("bulk-note") === window.__bulkNote,
      focused: node.shadowRoot.activeElement === window.__bulkNote, scroll: window.scrollY,
    }))).toEqual({ same: true, focused: true, scroll: 200 });
    await expect(card.locator("#bulk-note")).toHaveValue("Keep this draft while data is refreshed");
    await expect(card.locator(".puppy-option")).toHaveCount(3);
  });
}

test("bulk save reruns a refresh whose data was invalidated while saving @cross-browser @tablet", async ({ page }) => {
  const card = await mountBulkDossier(page);
  await page.evaluate(() => {
    window.__bulkHold.add("puppy_tracker/data");
    for (const callback of window.__bulkSubscriptions) callback({});
  });
  await pendingCount(page, "puppy_tracker/data", 1);
  await card.locator("#select-all").click();
  await card.locator("#bulk-data-product").fill("Original product");
  await card.locator("#bulk-review").click();
  await card.locator("#bulk-confirm").click();
  await expect.poll(() => card.evaluate((node) => node._saving)).toBe(false);
  await releasePending(page, "puppy_tracker/data");
  await expect.poll(() => page.evaluate(() => window.__bulkCalls.filter((call) => call.type === "puppy_tracker/data").length)).toBe(3);
  await pendingCount(page, "puppy_tracker/data", 1);
  await releasePending(page, "puppy_tracker/data", 0, { can_manage_records: false, litter: { id: "l1" }, puppies: [] });
  await expect.poll(() => card.evaluate((node) => node._refreshing)).toBe(false);
  await expect(card.locator("#bulk-type")).toHaveCount(0);
  expect(await card.evaluate((node) => node._refreshDeferred)).toBe(false);
  expect(await recordAddCalls(page)).toHaveLength(3);
});

test("Workspace keeps the bulk tab and litter pinned until the save completes @cross-browser @tablet", async ({ page }) => {
  const standalone = await mountBulkDossier(page);
  await standalone.evaluate((node) => node.remove());
  await page.evaluate(() => {
    const workspace = document.createElement("puppy-tracker-workspace-card");
    workspace.setConfig({ preset: "journal", litter_id: "l1", tabs: ["behavior"], default_tab: "behavior", state_key: "bulk-safe-save" });
    document.querySelector("#cards").append(workspace);
    workspace.hass = window.__bulkHass;
  });
  const workspace = page.locator("puppy-tracker-workspace-card");
  const openBehavior = async () => {
    const select = workspace.locator("#workspace-tab-select");
    if (await select.isVisible()) await select.selectOption("behavior");
    else await workspace.locator('[data-tab="behavior"]').click();
  };
  await workspace.locator("#bulk-action").click();
  const card = workspace.locator("puppy-tracker-bulk-dossier-card");
  await expect(card.locator("#bulk-type")).toBeVisible();
  await card.locator("#select-all").click();
  await card.locator("#bulk-data-product").fill("Original product");
  await card.locator("#bulk-review").click();
  await page.evaluate(() => window.__bulkHold.add("puppy_tracker/record/add"));
  await card.locator("#bulk-confirm").click();
  await pendingCount(page, "puppy_tracker/record/add", 1);
  await workspace.locator("#bulk-action").click();
  await openBehavior();
  await card.evaluate((node) => node.dispatchEvent(new CustomEvent("puppy-tracker-litter-change", { bubbles: true, composed: true, cancelable: true, detail: { litterId: "l2" } })));
  expect(await workspace.evaluate((node) => ({ tab: node._tab, litter: node._litterId }))).toEqual({ tab: "bulk", litter: "l1" });
  for (let index = 0; index < 3; index += 1) {
    await pendingCount(page, "puppy_tracker/record/add", 1);
    await releasePending(page, "puppy_tracker/record/add");
  }
  await expect.poll(() => card.evaluate((node) => node._saving)).toBe(false);
  await openBehavior();
  await expect(workspace.locator("puppy-tracker-behavior-card")).toBeVisible();
  expect((await recordAddCalls(page)).map((call) => call.litter_id)).toEqual(["l1", "l1", "l1"]);
});
