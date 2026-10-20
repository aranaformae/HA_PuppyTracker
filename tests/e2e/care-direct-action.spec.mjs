import { expect, test } from "@playwright/test";

async function openFixture(page) {
  await page.goto("/tests/e2e/cards.html");
  await page.waitForFunction(() => window.__puppyTrackerReady === true);
  expect(await page.evaluate(() => window.__puppyTrackerModuleErrors)).toEqual([]);
}

for (const isAdmin of [true, false]) {
test(`Attention care and acknowledgement actions match admin permissions (${isAdmin}) @cross-browser @tablet`, async ({ page }) => {
  await openFixture(page);

  await page.evaluate((isAdmin) => {
    const card = document.createElement("puppy-tracker-attention-card");
    card._hass = {
      user: { is_admin: isAdmin },
      language: "en",
      locale: { language: "en" },
      callWS: async () => ({}),
    };
    card._selectedLitterId = "litter-1";
    card._litters = [{ id: "litter-1", name: "Litter", active: true }];
    card._data = {
      litter: {
        id: "litter-1",
        name: "Litter",
        summary: { dossier_actions: { actions: [] } },
      },
      puppies: [{
        id: "pup-1",
        name: "Blue",
        active: true,
        summary: { needs_attention: false, dossier_actions: { actions: [] } },
      }],
    };
    card.__careOccurrences = [{
      id: "program-1:pup-1:3",
      program_id: "program-1",
      litter_id: "litter-1",
      puppy_id: "pup-1",
      puppy_name: "Blue",
      title: "ENS",
      record_type: "test",
      age_days: 3,
      status: "due_today",
      days_until_due: 0,
      result_fields: ["result", "note"],
    }];
    card.__attentionAcknowledgements = {};
    card.setConfig({ title: "Attention", show_litter_selector: false });
    document.querySelector("#cards").appendChild(card);
    card._render();
  }, isAdmin);

  const card = page.locator("puppy-tracker-attention-card");
  const row = card.locator('[data-care-occurrence="program-1:pup-1:3"]');
  await expect(row).toBeVisible();
  if (!isAdmin) {
    await expect(row.locator(".care-direct-action")).toHaveCount(0);
    await expect(row.getByRole("button", { name: "Acknowledge" })).toBeDisabled();
    await row.locator(".main").click();
    await expect(card.locator(".care-result-dialog")).toHaveCount(0);
    return;
  }
  await expect(row.getByRole("button", { name: "Complete care action" })).toBeVisible();
  await expect(row.getByRole("button", { name: "Acknowledge" })).toBeVisible();

  await row.getByRole("button", { name: "Complete care action" }).click();
  await expect(card.locator(".care-result-dialog")).toBeVisible();
});
}

test("non-admin care execution remains readable without write controls @cross-browser @tablet", async ({ page }) => {
  await openFixture(page);
  await page.evaluate(() => {
    const now = new Date();
    const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    window.__carePermissionCalls = [];
    const card = document.createElement("puppy-tracker-care-execution-card");
    card.setConfig({ show_day_selector: false });
    document.querySelector("#cards").append(card);
    card.hass = {
      user: { is_admin: false }, language: "en", locale: { language: "en" },
      connection: { subscribeMessage: async () => async () => {} },
      callWS: async (message) => {
        window.__carePermissionCalls.push(message);
        if (message.type === "puppy_tracker/litters") return { litters: [{ id: "litter-1", name: "Litter" }] };
        if (message.type === "puppy_tracker/care_occurrences") return { occurrences: [{
          id: "program-1:pup-1:3", program_id: "program-1", puppy_id: "pup-1", puppy_name: "Blue",
          title: "ENS", age_days: 3, scheduled_date: day, status: "due_today", days_until_due: 0,
        }] };
        throw new Error(message.type);
      },
    };
  });
  const card = page.locator("puppy-tracker-care-execution-card");
  await expect(card.locator(".row")).toContainText("ENS");
  await expect(card.locator('button[data-action="completed"]')).toBeDisabled();
  await expect(card.locator('button[data-action="missed"]')).toBeDisabled();
  await card.locator(".main").click();
  await expect(card.locator(".care-result-dialog")).toHaveCount(0);
  expect(await page.evaluate(() => window.__carePermissionCalls.some((message) => message.type === "puppy_tracker/care_occurrence/record"))).toBe(false);
});
