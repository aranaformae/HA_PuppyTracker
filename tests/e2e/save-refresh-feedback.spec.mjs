import { expect, test } from "@playwright/test";
import { mountAsyncCard, pendingCount, release } from "./helpers/async-card.mjs";

async function draft(card, kind) {
  if (kind === "behavior") {
    await card.locator("#behavior-add").click();
    await card.locator('[data-score-key="curiosity"][value="4"] + span').click();
    await card.locator("#behavior-note").fill("Keep this observation");
  } else {
    await card.locator("#add-temperature").click();
    await card.locator("#temperature-value").fill("38.4");
    await card.locator("#temperature-note").fill("Keep this observation");
  }
}

async function save(card, kind) {
  if (kind === "behavior") await card.locator("#behavior-save").click();
  else await card.locator("form.editor").evaluate((form) => form.requestSubmit());
}

async function writes(page) {
  return page.evaluate(() => window.__async.calls.filter((call) => call.type.endsWith("record/add")));
}

for (const language of ["nl", "en"]) {
  for (const [kind, scope] of [["temperature", "litter"], ["temperature", "mother"], ["temperature", "puppy"], ["behavior", "puppy"]]) {
    test(`${kind} ${scope}: ${language} confirms saving despite failed refresh and retries only the read @cross-browser @tablet`, async ({ page }) => {
      const card = await mountAsyncCard(page, kind, { language, config: { default_selected: scope, default_range: "all" } });
      await draft(card, kind);
      const read = scope === "mother" ? "puppy_tracker/mother/records" : "puppy_tracker/data";
      await page.evaluate((read) => window.__async.hold.add(read), read);
      await save(card, kind);
      await release(page, read, { error: "Overview offline" });
      const status = card.locator(kind === "behavior" ? ".status" : ".message.success");
      await expect(status).toContainText(language === "en" ? "saved for" : "opgeslagen voor");
      await expect(card.locator(".saved-refresh-warning")).toContainText(language === "en" ? "Saved, but the overview" : "Opgeslagen, maar het overzicht");
      await expect(card.locator(".error")).toHaveCount(0);
      await expect(card.locator(".editor")).toHaveCount(0);
      const context = await card.evaluate((el) => el._savedRecord);
      expect(context).toMatchObject({ litterId: "a", scope, puppyId: scope === "puppy" ? "a1" : null });
      expect((await writes(page))[0]).toMatchObject({ litter_id: "a", record_type: kind === "behavior" ? "behavior_observation" : "temperature" });
      await card.evaluate((el) => el._save());
      await card.locator("[data-retry-saved-refresh]").click();
      await expect(card.locator("[data-retry-saved-refresh]")).toBeDisabled();
      await release(page, read, { error: "Still offline" });
      await expect(card.locator("[data-retry-saved-refresh]")).toBeEnabled();
      await card.locator("[data-retry-saved-refresh]").click();
      await release(page, read);
      await expect(card.locator(".saved-refresh-warning")).toHaveCount(0);
      await expect(status).toContainText(language === "en" ? "saved for" : "opgeslagen voor");
      expect(await writes(page)).toHaveLength(1);
      await expect(card.locator(".history")).toContainText("Keep this observation");
    });
  }
}

for (const kind of ["temperature", "behavior"]) {
  test(`${kind}: a failed write retains the draft without a success or refresh warning @cross-browser`, async ({ page }) => {
    const card = await mountAsyncCard(page, kind, { config: { default_selected: "puppy" } });
    await draft(card, kind);
    await page.evaluate(() => window.__async.hold.add("puppy_tracker/record/add"));
    await save(card, kind);
    await release(page, "puppy_tracker/record/add", { error: "Write failed" });
    await expect(card.locator(".error")).toContainText("Write failed");
    await expect(card.locator(".saved-refresh-warning,.message.success,.status")).toHaveCount(0);
    await expect(card.locator(kind === "behavior" ? "#behavior-note" : "#temperature-note")).toHaveValue("Keep this observation");
    await page.evaluate(() => window.__async.hold.delete("puppy_tracker/record/add"));
    await save(card, kind);
    await expect(card.locator(".editor")).toHaveCount(0);
    expect(await writes(page)).toHaveLength(2);
  });

  test(`${kind}: a late retry cannot replace a new draft or move focus @cross-browser`, async ({ page }) => {
    const card = await mountAsyncCard(page, kind, { config: { default_selected: "puppy" } });
    await draft(card, kind);
    await page.evaluate(() => window.__async.hold.add("puppy_tracker/data"));
    await save(card, kind);
    await release(page, "puppy_tracker/data", { error: "Read failed" });
    await card.locator("[data-retry-saved-refresh]").click();
    await expect.poll(() => pendingCount(page, "puppy_tracker/data")).toBe(1);
    await draft(card, kind);
    await release(page, "puppy_tracker/data");
    await expect(card.locator(kind === "behavior" ? "#behavior-note" : "#temperature-note")).toHaveValue("Keep this observation");
    await expect(card.locator(kind === "behavior" ? "#behavior-note" : "#temperature-note")).toBeFocused();
    expect(await writes(page)).toHaveLength(1);
  });
}
