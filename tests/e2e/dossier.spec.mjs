import { expect, test } from "@playwright/test";

async function openFixture(page, { production = false } = {}) {
  await page.goto(production ? "/tests/e2e/cards.html?production" : "/tests/e2e/cards.html");
  await page.waitForFunction(() => window.__puppyTrackerReady === true);
}

async function mountDossier(page, { compact = false, production = false } = {}) {
  await openFixture(page, { production });

  await page.evaluate(() => {
    const now = new Date().toISOString();
    const records = [];
    const motherRecords = [
      {
        id: "m1",
        type: "note",
        scope: "mother",
        litter_id: "l1",
        mother_id: "mother-1",
        puppy_id: null,
        occurred_at: now,
        created_at: now,
        updated_at: now,
        deleted: false,
        deleted_at: null,
        title: "Mother note",
        note: "Mother context",
        data: {},
      },
    ];
    const calls = [];
    let motherProfileNote = "";
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

    const assertPuppyOwner = (record, message) => {
      if ((record.puppy_id || null) !== (message.puppy_id || null)) {
        throw new Error("Record owner mismatch");
      }
    };

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
              mother: "Luna",
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

        if (message.type === "puppy_tracker/mother/records") {
          return {
            can_manage_records: true,
            owner: { scope: "mother", id: "mother-1", name: "Luna", profile_note: motherProfileNote },
            records: clone(
              motherRecords.filter((record) => message.include_deleted || !record.deleted)
            ),
          };
        }

        if (message.type === "puppy_tracker/mother/record/add") {
          const record = {
            id: `m${motherRecords.length + 1}`,
            type: message.record_type || "note",
            scope: "mother",
            litter_id: message.litter_id,
            mother_id: "mother-1",
            puppy_id: null,
            occurred_at: message.occurred_at || now,
            created_at: now,
            updated_at: now,
            deleted: false,
            deleted_at: null,
            title: message.title ?? "",
            note: message.note ?? "",
            data: clone(message.data ?? {}),
          };
          motherRecords.push(record);
          return { record: clone(record) };
        }

        if (message.type === "puppy_tracker/record/add") {
          const record = recordForMessage(message);
          records.push(record);
          return { record: clone(record) };
        }

        if (message.type === "puppy_tracker/record/update") {
          const index = records.findIndex((record) => record.id === message.record_id);
          if (index < 0) throw new Error("Record not found");
          assertPuppyOwner(records[index], message);
          records[index] = recordForMessage(message, records[index]);
          return { record: clone(records[index]) };
        }

        if (message.type === "puppy_tracker/record/change_owner") {
          const record = records.find((item) => item.id === message.record_id);
          if (!record) throw new Error("Record not found");
          if ((record.puppy_id || null) !== (message.source_puppy_id || null)) {
            throw new Error("Record owner mismatch");
          }
          record.puppy_id = message.target_puppy_id || null;
          record.scope = record.puppy_id ? "puppy" : "litter";
          record.updated_at = new Date().toISOString();
          return { record: clone(record) };
        }

        if (message.type === "puppy_tracker/record/delete") {
          const record = records.find((item) => item.id === message.record_id);
          if (!record) throw new Error("Record not found");
          assertPuppyOwner(record, message);
          record.deleted = true;
          record.deleted_at = new Date().toISOString();
          record.updated_at = record.deleted_at;
          return { record: clone(record) };
        }

        if (message.type === "puppy_tracker/record/restore") {
          const record = records.find((item) => item.id === message.record_id);
          if (!record) throw new Error("Record not found");
          assertPuppyOwner(record, message);
          record.deleted = false;
          record.deleted_at = null;
          record.updated_at = new Date().toISOString();
          return { record: clone(record) };
        }

        if (message.type === "puppy_tracker/mother/record/update") {
          const index = motherRecords.findIndex((record) => record.id === message.record_id);
          if (index < 0) throw new Error("Mother record not found");
          motherRecords[index] = {
            ...motherRecords[index],
            type: message.record_type,
            occurred_at: message.occurred_at || motherRecords[index].occurred_at,
            title: message.title ?? null,
            note: message.note ?? null,
            data: clone(message.data ?? {}),
            updated_at: new Date().toISOString(),
          };
          return { record: clone(motherRecords[index]) };
        }

        if (message.type === "puppy_tracker/mother/record/delete") {
          const record = motherRecords.find((item) => item.id === message.record_id);
          if (!record) throw new Error("Mother record not found");
          record.deleted = true;
          record.deleted_at = new Date().toISOString();
          record.updated_at = record.deleted_at;
          return { record: clone(record) };
        }

        if (message.type === "puppy_tracker/mother/record/restore") {
          const record = motherRecords.find((item) => item.id === message.record_id);
          if (!record) throw new Error("Mother record not found");
          record.deleted = false;
          record.deleted_at = null;
          record.updated_at = new Date().toISOString();
          return { record: clone(record) };
        }

        if (message.type === "puppy_tracker/mother/profile_note/update") {
          motherProfileNote = message.profile_note || "";
          return { profile_note: message.profile_note || null };
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
  if (!compact) await card.locator("#toggle-dossier-manage").click();
  return card;
}

test("dossier item management stays available without matching records", async ({ page }) => {
  const card = await mountDossier(page, { compact: true });

  await expect(card.locator("#toggle-dossier-manage")).toBeVisible();
  await card.locator("#owner-select").selectOption("__litter__");
  await expect(card.locator("#toggle-dossier-manage")).toBeVisible();

  await card.locator("#toggle-dossier-manage").click();
  await expect(card.locator("#toggle-dossier-manage")).toHaveText("Done editing");
});

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

test("dossier edits each source owner from the combined scope", async ({ page }) => {
  page.on("dialog", (dialog) => dialog.accept());
  const card = await mountDossier(page, { production: true });

  await card.locator("#add-record").click();
  await card.locator("#record-title").fill("Combined puppy check");
  await card.locator("#record-note").fill("Puppy source");
  await card.locator("#record-save").click();
  const puppyRecordId = await page.evaluate(() => window.__dossierRecords.at(-1).id);

  await card.locator("#owner-select").selectOption("__all__");
  await expect(card.locator("#toggle-dossier-manage")).toBeVisible();
  const puppyRecord = card.locator(".record").filter({ hasText: "Combined puppy check" });
  await expect(puppyRecord.locator(".aggregate-owner-badge")).toHaveText("Puppy · Alice");
  await puppyRecord.locator(".edit-record").click();
  await card.locator("#record-title").fill("Combined puppy check updated");
  await card.locator("#record-save").click();

  const puppyUpdate = await page.evaluate((recordId) =>
    window.__dossierCalls.find((call) => call.type === "puppy_tracker/record/update" && call.record_id === recordId),
  puppyRecordId);
  expect(puppyUpdate).toMatchObject({ record_id: puppyRecordId, puppy_id: "p1" });

  const motherRecord = card.locator(".record").filter({ hasText: "Mother note" });
  await expect(motherRecord.locator(".aggregate-owner-badge")).toHaveText("Mother · Luna");
  await motherRecord.locator(".edit-record").click();
  await card.locator("#record-title").fill("Mother note updated");
  await card.locator("#record-save").click();

  await expect(card.getByText("Mother note updated", { exact: true })).toBeVisible();
  await expect(
    page.locator("body").getByText("Mother context", { exact: true }),
  ).toHaveCount(1);
  const motherUpdate = await page.evaluate(() =>
    window.__dossierCalls.find((call) => call.type === "puppy_tracker/mother/record/update"),
  );
  expect(motherUpdate).toMatchObject({ record_id: "m1", litter_id: "l1" });

  const updatedPuppyRecord = card.locator(".record").filter({ hasText: "Combined puppy check updated" });
  await updatedPuppyRecord.locator(".delete-record").click();
  await expect(card.getByText("Combined puppy check updated", { exact: true })).toHaveCount(0);
  await card.locator("#show-deleted").check();
  const deletedPuppyRecord = card.locator(".record").filter({ hasText: "Combined puppy check updated" });
  await deletedPuppyRecord.locator(".restore-record").click();
  await expect(card.getByText("Combined puppy check updated", { exact: true })).toBeVisible();

  const deleteCall = await page.evaluate((recordId) =>
    window.__dossierCalls.find((call) => call.type === "puppy_tracker/record/delete" && call.record_id === recordId),
  puppyRecordId);
  const restoreCall = await page.evaluate((recordId) =>
    window.__dossierCalls.find((call) => call.type === "puppy_tracker/record/restore" && call.record_id === recordId),
  puppyRecordId);
  expect(deleteCall).toMatchObject({ record_id: puppyRecordId, puppy_id: "p1" });
  expect(restoreCall).toMatchObject({ record_id: puppyRecordId, puppy_id: "p1" });
});

test("mother dossier owns records, profile note and cross-litter history directly", async ({ page }) => {
  page.on("dialog", (dialog) => dialog.accept());
  const card = await mountDossier(page);

  await card.locator("#owner-select").selectOption("__mother__");
  await expect(card.locator("#mother-history-scope")).toBeVisible();
  await expect(card.getByText("Mother note", { exact: true })).toBeVisible();
  await expect(card.getByText("Mother profile", { exact: true })).toBeVisible();

  await card.locator("#add-record").click();
  await card.locator("#record-title").fill("Mother check");
  await card.locator("#record-note").fill("Mother remains calm");
  await card.locator("#record-save").click();
  await expect(card.getByText("Mother check", { exact: true })).toBeVisible();

  await card.locator("#profile-edit").click();
  await card.locator("#profile-note").fill("Healthy mother");
  await card.locator("#profile-save").click();
  await expect(card.getByText("Healthy mother", { exact: true })).toBeVisible();

  await card.locator("#mother-history-scope").selectOption("all");
  await expect.poll(() => page.evaluate(() => window.__dossierCalls.some(
    (call) => call.type === "puppy_tracker/mother/records" && call.history_scope === "all",
  ))).toBe(true);

  const added = card.locator(".record").filter({ hasText: "Mother check" });
  await added.locator(".delete-record").click();
  await expect(card.getByText("Mother check", { exact: true })).toHaveCount(0);
  await card.locator("#show-deleted").check();
  const deleted = card.locator(".record").filter({ hasText: "Mother check" });
  await deleted.locator(".restore-record").click();
  await expect(card.getByText("Mother check", { exact: true })).toBeVisible();

  const mutationTypes = await page.evaluate(() => window.__dossierCalls.map((call) => call.type));
  expect(mutationTypes).toEqual(expect.arrayContaining([
    "puppy_tracker/mother/record/add",
    "puppy_tracker/mother/profile_note/update",
    "puppy_tracker/mother/record/delete",
    "puppy_tracker/mother/record/restore",
  ]));
});

test("dossier hides internal care program identifiers", async ({ page }) => {
  const card = await mountDossier(page);

  await card.evaluate((element) => {
    element._hass.language = "nl";
    element._hass.locale = { language: "nl" };
    element._recordData.records = [
      {
        id: "care-record",
        type: "test",
        scope: "puppy",
        litter_id: "l1",
        puppy_id: "p1",
        occurred_at: "2026-09-01T17:47:00Z",
        title: "ENS",
        note: "good",
        deleted: false,
        data: {
          test_name: "Neurological stimulation",
          result: "Good",
          care_program_id: "2251b89c-0f0d-47e0-bcba-abe69e91e773",
          care_program_revision: 1,
          care_occurrence_id: "2251b89c-0f0d-47e0-bcba-abe69e91e773:80e0aa7d-b101-40e5-926c-e44798a85ceb:3",
          care_age_days: 3,
          care_scheduled_at: "2026-09-02T14:00:00+02:00",
          care_status: "completed",
          care_result: "Rustig",
          care_score: 4,
          care_data: {},
          reference_id: "internal-ref",
        },
      },
    ];
    element._render();
  });

  await expect(card.getByText("ENS", { exact: true })).toBeVisible();
  await expect(card.getByText("Neurological stimulation", { exact: true })).toBeVisible();
  await expect(card.getByText("Good", { exact: true })).toBeVisible();
  await expect(card.getByText("Resultaat", { exact: true })).toBeVisible();
  await expect(card.getByText("Rustig", { exact: true })).toBeVisible();
  await expect(card.getByText("Score", { exact: true })).toBeVisible();
  await expect(card.getByText("Care program id", { exact: true })).toHaveCount(0);
  await expect(card.getByText("Care occurrence id", { exact: true })).toHaveCount(0);
  await expect(card.getByText("Care result", { exact: true })).toHaveCount(0);
  await expect(card.getByText("2251b89c-0f0d-47e0-bcba-abe69e91e773", { exact: true })).toHaveCount(0);
  await expect(card.getByText("internal-ref", { exact: true })).toHaveCount(0);
});

test("dossier shows and edits user-facing care result fields", async ({ page }) => {
  const card = await mountDossier(page);

  await card.evaluate((element) => {
    const record = {
      id: "care-edit-record",
      type: "test",
      scope: "puppy",
      litter_id: "l1",
      puppy_id: "p1",
      occurred_at: "2026-09-01T17:47:00Z",
      title: "ENS",
      note: "Goed opgepakt",
      deleted: false,
      data: {
        test_name: "Neurological stimulation",
        care_program_id: "ens",
        care_program_revision: 1,
        care_occurrence_id: "ens:p1:3",
        care_age_days: 3,
        care_scheduled_at: "2026-09-01T14:00:00+02:00",
        care_instruction: "Geur 3: droge aarde.",
        care_status: "completed",
        care_result: "Rustig",
        care_score: 4,
        care_data: { stimulus: "tactiel" },
      },
    };
    window.__dossierRecords.push(record);
    element._recordData.records = [record];
    element._render();
  });

  const record = card.locator(".record").filter({ hasText: "ENS" });
  await expect(record.getByText("Care day", { exact: true })).toBeVisible();
  await expect(record.getByText("Instruction for this day", { exact: true })).toBeVisible();
  await expect(record.getByText("Rustig", { exact: true })).toBeVisible();
  await expect(record.getByText("tactiel", { exact: true })).toBeVisible();

  await record.locator(".edit-record").click();
  await expect(card.locator("#record-care-result")).toHaveValue("Rustig");
  await expect(card.locator("#record-care-score")).toHaveValue("4");
  await expect(card.locator("#record-care-status")).toHaveValue("completed");
  await card.locator("#record-care-result").fill("Gevoelig");
  await card.locator("#record-care-score").fill("3.5");
  await card.locator("#record-care-status").selectOption("missed");
  await card.locator("#record-save").click();

  const update = await page.evaluate(() =>
    window.__dossierCalls.find((call) => call.type === "puppy_tracker/record/update" && call.record_id === "care-edit-record"),
  );
  expect(update.data).toMatchObject({
    care_status: "missed",
    care_result: "Gevoelig",
    care_score: 3.5,
    care_age_days: 3,
    care_instruction: "Geur 3: droge aarde.",
  });
});

test("dossier can change a record owner and keeps the record identity", async ({ page }) => {
  const dialogs = [];
  page.on("dialog", async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.accept("0");
  });
  const card = await mountDossier(page);

  await card.locator("#add-record").click();
  await card.locator("#record-title").fill("Move me");
  await card.locator("#record-note").fill("Owner transfer");
  await card.locator("#record-save").click();
  const recordId = await page.evaluate(() => window.__dossierRecords.at(-1).id);

  await card.locator(".move-record").first().click();
  await expect(card.getByText("Owner transfer", { exact: true })).toHaveCount(0);
  await card.locator("#owner-select").selectOption("__litter__");
  await expect(card.getByText("Move me", { exact: true })).toBeVisible();

  const moveCall = await page.evaluate(() => window.__dossierCalls.find((call) => call.type === "puppy_tracker/record/change_owner"));
  expect(moveCall).toMatchObject({ record_id: recordId, source_puppy_id: "p1" });
  expect(moveCall).not.toHaveProperty("target_puppy_id");
  expect(dialogs[0]).toContain("0: Luna x Dutch");
  expect(dialogs[0]).toContain("1: Mother · Luna");
});

test("dossier can create a structured feeding record", async ({ page }) => {
  const card = await mountDossier(page);

  await card.locator("#add-record").click();
  await card.locator("#record-type").selectOption("feeding");
  await card.locator("#record-data-feeding_type").fill("Bottle");
  await card.locator("#record-data-amount").fill("45");
  await card.locator("#record-data-unit").fill("ml");
  await card.locator("#record-data-observation").fill("Drank well");
  await card.locator("#record-save").click();

  const addCall = await page.evaluate(() =>
    window.__dossierCalls.find((call) => call.type === "puppy_tracker/record/add" && call.record_type === "feeding")
  );
  expect(addCall).toMatchObject({
    record_type: "feeding",
    data: {
      feeding_type: "Bottle",
      amount: "45",
      unit: "ml",
      observation: "Drank well",
    },
  });
  await expect(card.locator(".record-heading strong").getByText("Feeding", { exact: true })).toBeVisible();
  await expect(card.getByText("Bottle", { exact: true })).toBeVisible();
});

test("dossier localizes temperature record labels", async ({ page }) => {
  const card = await mountDossier(page);

  await card.evaluate((element) => {
    element._hass.language = "nl";
    element._hass.locale = { language: "nl" };
    element._recordData.records = [
      {
        id: "temperature-record",
        type: "temperature",
        scope: "puppy",
        litter_id: "l1",
        puppy_id: "p1",
        occurred_at: "2026-09-01T17:47:00Z",
        title: "Temperatuur notitie",
        note: "",
        deleted: false,
        data: {
          temperature_c: 38.4,
          method: "rectaal",
          observation: "rustig",
        },
      },
    ];
    element._render();
  });

  await expect(card.getByText("Temperatuur notitie", { exact: true })).toBeVisible();
  await expect(card.locator(".type-badge").getByText("Temperatuur", { exact: true })).toBeVisible();
  await expect(card.getByText("Temperatuur (°C)", { exact: true })).toBeVisible();
  await expect(card.getByText("Meetmethode / locatie", { exact: true })).toBeVisible();
  await expect(card.getByText("Observatie / notitie", { exact: true })).toBeVisible();
  await expect(card.getByText("temperature", { exact: true })).toHaveCount(0);
  await expect(card.getByText("Temperature", { exact: true })).toHaveCount(0);
});

test("dossier category filters can be cleared completely", async ({ page }) => {
  const card = await mountDossier(page);

  await card.evaluate((element) => {
    element._recordData.records = [
      {
        id: "note-record",
        type: "note",
        scope: "puppy",
        litter_id: "l1",
        puppy_id: "p1",
        occurred_at: "2026-09-01T08:00:00Z",
        title: "Morning note",
        note: "",
        deleted: false,
        data: {},
      },
      {
        id: "vet-record",
        type: "vet_visit",
        scope: "puppy",
        litter_id: "l1",
        puppy_id: "p1",
        occurred_at: "2026-09-01T09:00:00Z",
        title: "Vet check",
        note: "",
        deleted: false,
        data: {},
      },
    ];
    element._render();
  });

  await expect(card.locator("[data-dossier-category]")).toHaveCount(3);
  await expect(card.getByText("Morning note", { exact: true })).toBeVisible();
  await expect(card.getByText("Vet check", { exact: true })).toBeVisible();

  await card.locator('[data-dossier-category="__all__"]').click();
  await expect(card.locator(".record")).toHaveCount(0);
  await expect(card.getByText("No dossier items within the selected categories.", { exact: true })).toBeVisible();

  await card.locator('[data-dossier-category="note"]').click();
  await expect(card.getByText("Morning note", { exact: true })).toBeVisible();
  await expect(card.getByText("Vet check", { exact: true })).toHaveCount(0);
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

test("vaccination form validates required product and stores enriched structured care data", async ({ page }) => {
  const card = await mountDossier(page);

  await card.locator("#add-record").click();
  await card.locator("#record-type").selectOption("vaccination");
  await expect(card.locator("#record-data-vaccine")).toBeVisible();

  await card.locator("#record-save").click();
  await expect(card.getByText(/Complete the required field\(s\): Vaccine/)).toBeVisible();

  let addCalls = await page.evaluate(() =>
    window.__dossierCalls.filter((call) => call.type === "puppy_tracker/record/add")
  );
  expect(addCalls).toHaveLength(0);

  await card.locator("#record-data-vaccine").fill("Nobivac Puppy DP");
  await card.locator("#record-data-vaccine_type").fill("Puppy DP");
  await card.locator("#record-data-batch_number").fill("LOT-2026-42");
  await card.locator("#record-data-veterinarian").fill("Dr. Vet");
  await card.locator("#record-data-clinic").fill("Puppy Clinic");
  await card.locator("#record-data-reaction").fill("No reaction observed");
  await card.locator("#record-data-weight_grams").fill("1450");
  await card.locator("#record-data-next_due_date").fill("2026-09-28");
  await card.locator("#record-save").click();

  addCalls = await page.evaluate(() =>
    window.__dossierCalls.filter((call) => call.type === "puppy_tracker/record/add")
  );
  expect(addCalls).toHaveLength(1);
  expect(addCalls[0].data).toEqual({
    vaccine: "Nobivac Puppy DP",
    vaccine_type: "Puppy DP",
    batch_number: "LOT-2026-42",
    veterinarian: "Dr. Vet",
    clinic: "Puppy Clinic",
    reaction: "No reaction observed",
    weight_grams: "1450",
    next_due_date: "2026-09-28",
  });

  await expect(card.getByText("Vaccine type / indication", { exact: true })).toBeVisible();
  await expect(card.getByText("Puppy DP", { exact: true })).toBeVisible();
  await expect(card.getByText("Reaction / observation", { exact: true })).toBeVisible();
  await expect(card.getByText("No reaction observed", { exact: true })).toBeVisible();
  await expect(card.getByText("Weight at administration (g)", { exact: true })).toBeVisible();
});

test("dossier shows compact overdue, today and upcoming care summaries", async ({ page }) => {
  const card = await mountDossier(page);

  await card.evaluate((element) => {
    element._recordData.actions = {
      actions: [
        { type: "vaccination", status: "overdue", due_date: "2026-08-30", days_until_due: -1 },
        { type: "deworming", status: "due_today", due_date: "2026-08-31", days_until_due: 0 },
        { type: "vaccination", status: "upcoming", due_date: "2026-09-05", days_until_due: 5 },
      ],
    };
    element._render();
  });

  await expect(card.getByText("1 overdue", { exact: true })).toBeVisible();
  await expect(card.getByText("1 due today", { exact: true })).toBeVisible();
  await expect(card.getByText("1 upcoming", { exact: true })).toBeVisible();
});
