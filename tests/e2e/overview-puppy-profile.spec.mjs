import { expect, test } from "@playwright/test";

test("growth overview edits the selected puppy through the shared profile form @cross-browser @tablet", async ({ page }) => {
  await page.goto("/tests/e2e/cards.html");
  await page.waitForFunction(() => window.__puppyTrackerReady === true);
  await page.evaluate(() => {
    const device = { id: "device-l1", identifiers: [["puppy_tracker", "litter_l1"]], name: "Litter" };
    const puppy = { id: "p1", name: "Nova", collar_color: "purple", updated_at: "v1", measurements: [], summary: {} };
    const history = { can_manage_measurements: true, litter: { id: "l1" }, puppies: [puppy] };
    window.__profileSaveCalls = [];
    const card = document.createElement("puppy-tracker-overview-card");
    card.id = "growth-profile-card";
    card._config = { show_summary: false, show_growth_milestones: false, show_advanced_analysis: false };
    card._hass = { language: "en", user: { is_admin: true }, states: {},
      callWS: async (message) => {
        if (message.type === "puppy_tracker/puppy_profile/save") {
          window.__profileSaveCalls.push(message);
          return { puppy_id: "p1", updated_at: "v2" };
        }
        if (message.type === "config/device_registry/list") return [device];
        if (message.type === "config/entity_registry/list") return [];
        if (message.type === "puppy_tracker/data") return { ...history, puppies: [{ ...puppy, name: "Nova II", updated_at: "v2" }] };
        throw new Error(`Unexpected request: ${message.type}`);
      } };
    card._devices = [device];
    card._registryLoaded = true;
    card._selectedLitterId = device.id;
    card._selectedPuppyId = puppy.id;
    card._history = history;
    card._puppyRows = () => [{ puppyId: "p1", name: "Nova", displayName: "Nova (purple)", collar: "purple", statusCode: "ok", status: "On track", age: "3 days", sex: "Female", entityIds: {}, analysis: {} }];
    card._chartSvg = () => "";
    card._measurementPanelHtml = () => "";
    document.querySelector("#cards").append(card);
    card._render();
  });
  const card = page.locator("#growth-profile-card");
  await card.locator("#edit-puppy-profile").click();
  await page.locator("puppy-tracker-puppy-profile-editor #name").fill("Nova II");
  await page.locator("puppy-tracker-puppy-profile-editor button[type='submit']").click();
  await expect(page.locator("puppy-tracker-puppy-profile-editor")).toHaveCount(0);
  await expect(card.locator(".detail-panel [role='status']")).toContainText("Puppy details saved");
  const saveCalls = await page.evaluate(() => window.__profileSaveCalls);
  expect(saveCalls).toHaveLength(1);
  expect(saveCalls[0]).toMatchObject({ litter_id: "l1", puppy_id: "p1", expected_updated_at: "v1", profile: { name: "Nova II", collar_color: "purple" } });
  expect(await card.evaluate((element) => element._selectedPuppyId)).toBe("p1");
  await card.evaluate((element) => { element._history.can_manage_measurements = false; element._render(); });
  await expect(card.locator("#edit-puppy-profile")).toHaveCount(0);
});
