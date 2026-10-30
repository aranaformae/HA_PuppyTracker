import { expect, test } from "@playwright/test";

async function mount(page, surface) {
  await page.goto("/tests/e2e/cards.html?production=1");
  await page.waitForFunction(() => window.__puppyTrackerReady === true);
  await page.evaluate((surface) => {
    const card = document.createElement(`puppy-tracker-${surface}-card`);
    card._hass = {
      language: "nl", user: { is_admin: true },
      connection: { subscribeMessage: async () => async () => {} },
      callWS: async () => ({}),
    };
    card._litters = [{ id: "l1", name: "Nest" }, { id: "l2", name: "Ander nest" }];
    card._selectedLitterId = "l1";
    card._data = {
      litter: { id: "l1", name: "Nest", summary: { active_puppies: 1, dossier_actions: { actions: [] } } },
      puppies: [{ id: "p1", name: "Nova", active: true, summary: {
        needs_attention: true, status_code: "growth_low", status: "Aandacht",
        dossier_actions: { actions: [] },
      } }],
    };
    card.__careOccurrences = [{ id: "ens:p1:3", program_id: "ens", litter_id: "l1", puppy_id: "p1",
      puppy_name: "Nova", title: "ENS", record_type: "test", age_days: 3,
      status: "due_today", days_until_due: 0, result_fields: [] }];
    card.__attentionAcknowledgements = {};
    card.setConfig({ navigate_path: "/dashboard-puppies/care" });
    document.querySelector("#cards").append(card);
  }, surface);
  return page.locator(`puppy-tracker-${surface}-card`);
}

for (const surface of ["summary", "attention"]) {
  test(`${surface} dashboard link navigates with Enter @cross-browser @tablet`, async ({ page }) => {
    const card = await mount(page, surface);
    const link = card.getByRole("link", { name: /Dashboard openen/ });
    await expect(link).toHaveAttribute("href", "/dashboard-puppies/care");
    await link.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/dashboard-puppies\/care$/);
  });
}

test("summary statistics navigate without hijacking selector clicks @cross-browser @tablet", async ({ page }) => {
  const card = await mount(page, "summary");
  await card.locator("#litter-select").dispatchEvent("click");
  await expect(page).toHaveURL(/cards.html\?production=1$/);
  await card.locator(".stat").first().click();
  await expect(page).toHaveURL(/\/dashboard-puppies\/care$/);
});

test("attention acknowledgement and care execution stay on the dashboard @cross-browser @tablet", async ({ page }) => {
  const card = await mount(page, "attention");
  await card.locator('[data-attention-type="weight"] .attention-ack-button').click();
  await expect(page).toHaveURL(/cards.html\?production=1$/);
  await card.locator(".care-direct-action").click();
  await expect(card.locator(".care-result-dialog")).toBeVisible();
  await expect(page).toHaveURL(/cards.html\?production=1$/);
});
