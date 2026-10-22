import { expect, test } from "@playwright/test";
import { mountAsyncCard, pendingCount, release } from "./helpers/async-card.mjs";

const DATA = "puppy_tracker/data";
const LITTERS = "puppy_tracker/litters";

for (const kind of ["behavior", "report"]) {
  const litter = kind === "behavior" ? "#behavior-litter" : "#litter";
  const puppy = kind === "behavior" ? "#behavior-puppy" : "#puppy";
  for (const oldError of [false, true]) {
    test(`${kind}: A-B-A ignores old ${oldError ? "errors" : "successes"} and cannot end the new loading state @cross-browser @tablet`, async ({ page }) => {
      const card = await mountAsyncCard(page, kind);
      await page.evaluate(() => window.__async.hold.add("puppy_tracker/data"));
      await card.locator(litter).selectOption("b");
      await card.locator(litter).selectOption("a");
      await expect.poll(() => pendingCount(page, DATA)).toBe(2);
      await expect(card.locator(puppy)).toBeDisabled();
      await expect(card.locator(`${puppy} option[value='b1']`)).toHaveCount(0);
      await release(page, DATA, { error: oldError ? "Old litter failed" : null });
      await expect(card.locator(puppy)).toBeDisabled();
      await expect(card.locator(".error")).toHaveCount(0);
      await release(page, DATA);
      await expect(card.locator(puppy)).toBeEnabled();
      await expect(card.locator(`${puppy} option[value='a1']`)).toHaveCount(1);
      await expect(card.locator(`${puppy} option[value='b1']`)).toHaveCount(0);
      await expect(card.locator(litter)).toHaveValue("a");
    });
  }

  test(`${kind}: a late initial response and detached response cannot replace the configured litter`, async ({ page }) => {
    const card = await mountAsyncCard(page, kind, { hold: [LITTERS] });
    await card.evaluate((el) => el.setConfig({ litter_id: "b" }));
    await expect.poll(() => pendingCount(page, LITTERS)).toBe(2);
    await release(page, LITTERS, { error: "Stale initial error" });
    await expect.poll(() => card.evaluate((el) => el._loading)).toBe(true);
    await release(page, LITTERS);
    await expect(card.locator(`${puppy} option[value='b1']`)).toHaveCount(1);
    await page.evaluate(() => { window.__async.hold.delete("puppy_tracker/litters"); window.__async.hold.add("puppy_tracker/data"); window.__async.card._queueRefresh(); });
    await expect.poll(() => pendingCount(page, DATA)).toBe(1);
    await card.evaluate((el) => { el.remove(); document.querySelector("#cards").append(el); });
    await expect.poll(() => pendingCount(page, DATA)).toBe(2);
    await release(page, DATA, { error: "Detached error" });
    await release(page, DATA);
    await expect(card.locator(".error")).toHaveCount(0);
    await expect(card.locator(litter)).toHaveValue("b");
  });

  test(`${kind}: a current load failure keeps the litter selector available for recovery`, async ({ page }) => {
    const card = await mountAsyncCard(page, kind);
    await page.evaluate(() => window.__async.hold.add("puppy_tracker/data"));
    await card.locator(litter).selectOption("b");
    await release(page, DATA, { error: "Current load failed" });
    await expect(card.locator(".error")).toContainText("Current load failed");
    await expect(card.locator(litter)).toBeEnabled();
    if (kind === "report") await expect(card.locator("#pdf")).toBeDisabled();
    await card.locator(litter).selectOption("a");
    await release(page, DATA);
    await expect(card.locator(".error")).toHaveCount(0);
    await expect(card.locator(`${puppy} option[value='a1']`)).toHaveCount(1);
  });

  test(`${kind}: replacing the HA connection restarts an interrupted initial load`, async ({ page }) => {
    const card = await mountAsyncCard(page, kind, { hold: [LITTERS] });
    await card.evaluate((el) => { el.hass = { ...el._hass, connection: { ...el._hass.connection } }; });
    await expect.poll(() => pendingCount(page, LITTERS)).toBe(2);
    await release(page, LITTERS, { error: "Previous connection closed" });
    await expect.poll(() => card.evaluate((el) => el._loading)).toBe(true);
    await release(page, LITTERS);
    await expect(card.locator(`${puppy} option[value='a1']`)).toHaveCount(1);
    await expect(card.locator(puppy)).toBeEnabled();
    await expect(card.locator(".error")).toHaveCount(0);
  });

  test(`${kind}: an older success arriving last cannot replace the current puppy list`, async ({ page }) => {
    const card = await mountAsyncCard(page, kind);
    await page.evaluate(() => { window.__async.hold.add("puppy_tracker/data"); window.__async.card._queueRefresh(); });
    await expect.poll(() => pendingCount(page, DATA)).toBe(1);
    await card.locator(litter).selectOption("b");
    await release(page, DATA, { index: 1 });
    await card.locator(puppy).selectOption("b2");
    await release(page, DATA);
    await expect(card.locator(puppy)).toHaveValue("b2");
    await expect(card.locator(`${puppy} option[value='a1']`)).toHaveCount(0);
  });
}

test("behavior: a refresh completed during editing preserves the draft, focus and puppy @cross-browser @tablet", async ({ page }) => {
  const card = await mountAsyncCard(page, "behavior");
  await page.evaluate(() => { window.__async.hold.add("puppy_tracker/data"); window.__async.card._queueRefresh(); });
  await expect.poll(() => pendingCount(page, DATA)).toBe(1);
  await card.locator("#behavior-add").click();
  await card.locator("#behavior-note").fill("Keep my draft");
  await release(page, DATA);
  await expect.poll(() => card.evaluate((el) => el._refreshing)).toBe(false);
  await expect(card.locator("#behavior-note")).toHaveValue("Keep my draft");
  await expect(card.locator("#behavior-note")).toBeFocused();
  await expect(card.locator("#behavior-puppy")).toHaveValue("a1");
  await page.evaluate(() => { window.__async.hold.delete("puppy_tracker/data"); window.__async.card._formState.reset(); });
  await card.locator("#behavior-cancel").click();
  await expect(card.locator(".editor")).toHaveCount(0);
  await expect.poll(() => card.evaluate((el) => el._refreshDeferred)).toBe(false);
});

test("report: revoking admin access invalidates all pending data @cross-browser", async ({ page }) => {
  const card = await mountAsyncCard(page, "report");
  await page.evaluate(() => { window.__async.hold.add("puppy_tracker/data"); window.__async.card._queueRefresh(); });
  await expect.poll(() => pendingCount(page, DATA)).toBe(1);
  await card.evaluate((el) => { el.hass = { ...el._hass, user: { is_admin: false } }; });
  await release(page, DATA);
  await expect(card.locator("#pdf")).toHaveCount(0);
  await expect.poll(() => card.evaluate((el) => el._data)).toBe(null);
});
