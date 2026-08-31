import { expect, test } from "@playwright/test";

async function openFixture(page) {
  await page.goto("/tests/e2e/cards.html");
  await page.waitForFunction(() => window.__puppyTrackerReady === true);
}

async function mountDossier(page) {
  await openFixture(page);

  await page.evaluate(() => {
    const now = new Date().toISOString();
    const records = [];
    const calls = [];
    const puppies = [
      {
        id: "p1",
        name: "Alice",
        active: true,
        collar_color: "Red",
        profile_note: "Calm puppy",
        summary: { dossier_actions: { actions: [] } },
      },
      {
        id: "p2",
        name: "Bob",
        active: true,
        collar_color: "Blue",
        profile_note: "",
        summary: { dossier_actions: { actions: [] } },
      },
    ];

    const clone = (value) => JSON.parse(JSON.stringify(value));
    const recordForMessage = (message, existing = null) => ({
      id: existing?.id || `r${records.length + 1}`,
      type: message.record_type || existing?.type || "note",
      scope: message.puppy_id ? "puppy" : "litter",
      litter_id: message.litter_id,
      puppy_id: message.puppy_id || existing?.puppy_id || null,
      occurred_at: message.occurred_at || existing?.occurred_at || now,
      created_at: existing?.created_at || now,
      updated_at: new Date().toISOString(),
      deleted: existing?.deleted || false,
      deleted_at: existing?.deleted_at || null,
      title: message.title ?? existing?.title ?? "",
      note: message.note ?? existing?.note ?? "",
      data: clone(message.data ?? existing?.data ?? {}),
    });

    const hass = {
      locale: { language: "en" },
      language: "en",
      states: {},
      connection: {
        subscribeMessage: async (callback, message) => {
          calls.push({ ...message, subscription: true });
          window.__dossierSubscription = callback;
          return async () => {};
        },
      },
      callWS: async (message) => {
        calls.push(clone(message));

        if (message.type === "puppy_tracker/litters") {
          return {
            litters: [{ id: "l1", name: "Luna x Dutch", active: true }],
          };
        }

        if (message.type === "puppy_tracker/data") {
          return {
            can_manage_records: true,
            litter: {
              id: "l1",
              name: "Luna x Dutch",
              active: true,
              summary: { dossier_actions: { actions: [] } },
            },
            puppies: clone(puppies),
          };
        }

        if (message.type === "puppy_tracker/records") {
          const ownerRecords = records.filter(
            (record) => (record.puppy_id || null) === (message.puppy_id || null)
          );
          return {
            can_manage_records: true,
            records: clone(
              ownerRecords.filter((record) => message.include_deleted || !record.deleted)
            ),
          };
        }

        if (message.type === "puppy_tracker/record/add") {
          const record = recordForMessage(message);
          records.push(record);
          return { record: clone(record) };
        }

        if (message.type === "puppy_tracker/record/update") {
          const index = records.findIndex((record) => record.id === message.record_id);
          if (index < 0) throw new Error("Record not found");
          records[index] = recordForMessage(message, records[index]);
          return { record: clone(records[index]) };
        }

        if (message.type === "puppy_tracker/record/delete") {
          const record = records.find((item) => item.id === message.record_id);
          if (!record) throw new Error("Record not found");
          record.deleted = true;
          record.deleted_at = new Date().toISOString();
          record.updated_at = record.deleted_at;
          return { record: clone(record) };
        }

        if (message.type === "puppy_tracker/record/restore") {
          const record = records.find((item) => item.id === message.record_id);
          if (!record) throw new Error("Record not found");
          record.deleted = false;
          record.deleted_at = null;
          record.updated_at = new Date().toISOString();
          return { record: clone(record) };
        }

        if (message.type === "puppy_tracker/profile_note/update") {
          const puppy = puppies.find((item) => item.id === message.puppy_id);
          if (puppy) puppy.profile_note = message.profile_note || "";
          return { profile_note: message.profile_note || null };
        }

        throw new Error(`Unexpected WS call: ${message.type}`);
      },
    };

    window.__mockDossierHass = hass;
    window.__dossierCalls = calls;
    window.__dossierRecords = records;

    const constructor = customElements.get("puppy-tracker-dossier-card");
    const card = document.createElement("puppy-tracker-dossier-card");
    card.setConfig(constructor.getStubConfig());
    document.querySelector("#cards").appendChild(card);
    card.hass = hass;
  });

  const card = page.locator("puppy-tracker-dossier-card");
  await expect(card.locator("#owner-select")).toBeVisible();
  await card.locator("#owner-select").selectOption("p1");
  await expect(card.locator("#add-record")).toBeVisible();
  return card;
}

test("dossier create, edit, delete and restore flow", async ({ page }) => {
  page.on("dialog", (dialog) => dialog.accept());
  const card = await mountDossier(page);

  await card.locator("#add-record").click();
  await card.locator("#record-title").fill("First check");
  await card.locator("#record-note").fill("Everything looks good");
  await card.locator("#record-save").click();

  await expect(card.getByText("First check", { exact: true })).toBeVisible();

  await card.locator(".edit-record").first().click();
  await card.locator("#record-title").fill("Updated check");
  await card.locator("#record-note").fill("Updated note");
  await card.locator("#record-save").click();

  await expect(card.getByText("Updated check", { exact: true })).toBeVisible();
  await expect(card.getByText("Updated note", { exact: true })).toBeVisible();

  await card.locator(".delete-record").first().click();
  await expect(card.getByText("Updated check", { exact: true })).toHaveCount(0);

  await card.locator("#show-deleted").check();
  await expect(card.locator(".restore-record")).toBeVisible();
  await card.locator(".restore-record").first().click();

  await expect(card.getByText("Updated check", { exact: true })).toBeVisible();

  const mutationTypes = await page.evaluate(() =>
    window.__dossierCalls
      .map((call) => call.type)
      .filter((type) => type?.startsWith("puppy_tracker/record/"))
  );

  expect(mutationTypes).toEqual(
    expect.arrayContaining([
      "puppy_tracker/record/add",
      "puppy_tracker/record/update",
      "puppy_tracker/record/delete",
      "puppy_tracker/record/restore",
    ])
  );
});

test("live updates do not reset an active dossier form", async ({ page }) => {
  const card = await mountDossier(page);

  await card.locator("#add-record").click();
  await card.locator("#record-title").fill("Unsaved title");
  await card.locator("#record-note").fill("Unsaved details");

  await page.evaluate(() => window.__dossierSubscription?.({ reason: "test-update" }));
  await page.waitForTimeout(100);

  await expect(card.locator("#record-title")).toHaveValue("Unsaved title");
  await expect(card.locator("#record-note")).toHaveValue("Unsaved details");

  const editorState = await page.evaluate(() => {
    const cardElement = document.querySelector("puppy-tracker-dossier-card");
    return {
      refreshDeferred: Boolean(cardElement._refreshDeferred),
      editorActive: Boolean(cardElement._editor),
    };
  });

  expect(editorState.refreshDeferred).toBe(true);
  expect(editorState.editorActive).toBe(true);
});
