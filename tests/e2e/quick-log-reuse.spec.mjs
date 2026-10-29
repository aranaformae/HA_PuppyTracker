import { expect, test } from "@playwright/test";

async function mount(page, { mobile = false, language = "en" } = {}) {
  await page.goto("/tests/e2e/cards.html?production=1", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__puppyTrackerReady === true);
  await page.evaluate(({ mobile, language }) => {
    window.localStorage.clear();
    if (!customElements.get("ha-card")) customElements.define("ha-card", class extends HTMLElement {
      connectedCallback() { this.style.display = "block"; }
    });
    document.documentElement.style.cssText = "--primary-color:#087eaf;--text-primary-color:#fff;--primary-text-color:#222;--secondary-text-color:#666;--divider-color:#ddd;--card-background-color:#fff;--secondary-background-color:#f4f4f4;--error-color:#b71c1c";
    const previous = new Date(Date.now() - 3600000).toISOString();
    const state = window.reuseFixture = { entries: {}, calls: [], saved: [], failRead: false, failSave: false, hold: false };
    for (const [owner, amount] of [["p1", "45"], ["p2", "52"], ["mother", "65"], ["litter", "120"]]) {
      state.entries[owner] = [
        { id: `feeding-${owner}`, type: "feeding", litter_id: "l1", occurred_at: previous, title: "Bottle feeding", note: "Old observation", data: { feeding_type: "Bottle", amount, unit: "ml", observation: "Old observation", care_program_id: "old-program", recurring_reminder_id: "old-reminder" } },
        { id: `medication-${owner}`, type: "medication", litter_id: "l1", occurred_at: previous, title: "Medication", note: "Old clinical note", data: { medication: "Example product", dose: "0.4 ml", frequency: "3 times", duration: "10 days", care_occurrence_id: "old-occurrence" } },
      ];
    }
    const hass = {
      language, locale: { language }, user: { id: "admin", is_admin: true }, states: {},
      connection: { subscribeMessage: async () => async () => {} },
      callWS: async (msg) => {
        state.calls.push(structuredClone(msg));
        if (msg.type === "puppy_tracker/litters") return { litters: [{ id: "l1", name: "Test litter", active: true }, { id: "l2", name: "Second litter", active: true }] };
        if (msg.type === "puppy_tracker/data") return { can_manage_records: true, litter: { id: msg.litter_id, name: "Test litter", mother: "Luna", mother_id: "m1" }, puppies: [{ id: "p1", name: "Nova", collar_color: "paars", active: true }, { id: "p2", name: "Bob", collar_color: "blauw", active: true }] };
        if (msg.type === "puppy_tracker/recurring_reminders") return { reminders: [] };
        if (msg.type === "puppy_tracker/onboarding") return { visible: false };
        if (["puppy_tracker/records", "puppy_tracker/mother/records"].includes(msg.type)) {
          const owner = msg.type.includes("/mother/") ? "mother" : msg.puppy_id || "litter";
          const response = { can_manage_records: true, records: structuredClone(state.entries[owner] || []),
            owner: state.replyOwner || { scope: owner === "mother" ? "mother" : owner === "litter" ? "litter" : "puppy", id: owner === "mother" ? "m1" : owner === "litter" ? msg.litter_id : owner } };
          if (state.hold && !state.release) await new Promise((resolve) => { state.release = resolve; });
          if (state.failRead) throw new Error("Read failed");
          return response;
        }
        if (["puppy_tracker/record/add", "puppy_tracker/mother/record/add"].includes(msg.type)) {
          if (state.failSave) { state.failSave = false; throw new Error("Save failed"); }
          state.saved.push(structuredClone(msg));
          return { record: { id: `saved-${state.saved.length}`, type: msg.record_type, data: msg.data, occurred_at: msg.occurred_at } };
        }
        throw new Error(msg.type);
      },
    };
    const workspace = document.createElement("puppy-tracker-workspace-card");
    workspace.id = "reuse-workspace";
    workspace.setConfig({ preset: mobile ? "mobile" : "journal", default_tab: "quickLog", litter_id: "l1", default_selected: "puppy", puppy_id: "p1" });
    document.querySelector("#cards").append(workspace);
    workspace.hass = hass;
  }, { mobile, language });
  const card = page.locator("#reuse-workspace puppy-tracker-quick-log-card");
  await expect(card.locator("#owner-select")).toHaveValue("p1");
  return card;
}

async function holdRead(page, card) {
  await page.evaluate(() => { window.reuseFixture.hold = true; window.reuseFixture.release = null; });
  await card.locator("#quick-reuse").click();
  await expect(card.locator("#quick-reuse")).toBeDisabled();
  await expect.poll(() => page.evaluate(() => typeof window.reuseFixture.release)).toBe("function");
}

async function releaseRead(page) {
  await page.evaluate(() => { window.reuseFixture.hold = false; window.reuseFixture.release(); });
}

test("Mobile feeding category is saved for the selected puppy @cross-browser @tablet", async ({ page }) => {
  const card = await mount(page, { mobile: true, language: "nl" });
  await card.locator('[data-preset="feeding"]').click();
  await expect(card.locator("#quick-data-feeding_category option")).toContainText(["", "Moedermelk", "Fles", "Sonde", "Pap", "Vast voer", "Brokken", "Vers vlees", "Houdbaar vlees", "Supplement"]);
  await card.locator("#quick-data-feeding_category").selectOption("shelf_stable_meat");
  await card.locator("#quick-data-amount").fill("12");
  await card.locator("#quick-data-unit").fill("ml");
  await card.locator("#quick-save").click();
  const saved = await page.evaluate(() => window.reuseFixture.saved[0]);
  expect(saved).toMatchObject({ litter_id: "l1", puppy_id: "p1", record_type: "feeding", data: { feeding_category: "shelf_stable_meat", amount: "12", unit: "ml" } });
});

for (const mobile of [false, true]) {
  for (const type of ["feeding", "medication"]) {
    test(`${mobile ? "Mobile" : "Journal"} reuses ${type} as an editable unsaved draft @cross-browser @tablet`, async ({ page }) => {
      const card = await mount(page, { mobile });
      await card.locator(`[data-preset="${type}"]`).click();
      await card.locator("#quick-note").fill("Current observation");
      if (type === "feeding") await card.locator("#quick-data-observation").fill("New feeding observation");
      page.once("dialog", (dialog) => dialog.accept());
      await card.locator("#quick-reuse").click();
      await expect(card.locator(".reuse-feedback")).toContainText("Nova (paars)");
      await expect(card.locator("#quick-note")).toHaveValue("Current observation");
      await expect(card.locator("#owner-select")).toHaveValue("p1");
      expect(await page.evaluate(() => window.reuseFixture.saved)).toEqual([]);
      const time = await card.locator("#quick-occurred").inputValue();
      expect(Math.abs(new Date(time).getTime() - Date.now())).toBeLessThan(60000);
      if (type === "feeding") {
        await expect(card.locator("#quick-data-feeding_type")).toHaveValue("Bottle");
        await expect(card.locator("#quick-data-amount")).toHaveValue("45");
        await expect(card.locator("#quick-data-unit")).toHaveValue("ml");
        await expect(card.locator("#quick-data-observation")).toHaveValue("New feeding observation");
        await card.locator("#quick-data-amount").fill("37");
      } else {
        await expect(card.locator("#quick-data-medication")).toHaveValue("Example product");
        await expect(card.locator("#quick-data-dose")).toHaveValue("0.4 ml");
        await expect(card.locator("#quick-data-frequency")).toHaveValue("");
        await expect(card.locator("#quick-data-duration")).toHaveValue("");
        await expect(card.locator(".reuse-feedback")).toContainText("not dosage advice");
        await card.locator("#quick-data-dose").fill("0.3 ml");
      }
      await card.screenshot({ path: test.info().outputPath(`reuse-${type}.png`) });
      expect(await card.locator("ha-card").evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
      await page.evaluate(() => { window.reuseFixture.failSave = true; });
      await card.locator("#quick-save").click();
      await expect(card.locator(".error")).toContainText("Save failed");
      await expect(card.locator(".reuse-feedback")).toContainText("Nova (paars)");
      await card.locator("#quick-save").click();
      await expect(card.locator("#quick-save")).toHaveCount(0);
      const saved = await page.evaluate(() => window.reuseFixture.saved);
      expect(saved).toHaveLength(1);
      expect(saved[0]).toMatchObject({ litter_id: "l1", puppy_id: "p1", record_type: type, note: "Current observation", data: type === "feeding"
        ? { feeding_type: "Bottle", amount: "37", unit: "ml", observation: "New feeding observation", recurring_completion: "none" }
        : { medication: "Example product", dose: "0.3 ml", recurring_completion: "none" } });
      expect(saved[0].data.care_program_id).toBeUndefined();
      expect(saved[0].data.recurring_reminder_id).toBeUndefined();
      expect(await page.evaluate(() => JSON.stringify(window.localStorage))).not.toContain("Example product");
    });
  }
}

for (const [owner, amount] of [["p2", "52"], ["__mother__", "65"], ["__litter__", "120"]]) {
  test(`Reuse only reads the selected ${owner} dossier @cross-browser @tablet`, async ({ page }) => {
    const card = await mount(page, { mobile: true, language: "nl" });
    await card.locator("#owner-select").selectOption(owner);
    await card.locator('[data-preset="feeding"]').click();
    await card.locator("#quick-reuse").click();
    await expect(card.locator("#quick-data-amount")).toHaveValue(amount);
    await expect(card.locator("#owner-select")).toHaveValue(owner);
    await expect(card.locator(".reuse-feedback")).toContainText("Bron:");
    const request = await page.evaluate(() => window.reuseFixture.calls.find((msg) => msg.type.endsWith("/records")));
    expect(request).toEqual(owner === "__mother__"
      ? { type: "puppy_tracker/mother/records", litter_id: "l1", history_scope: "current" }
      : { type: "puppy_tracker/records", litter_id: "l1", ...(owner === "p2" ? { puppy_id: "p2" } : {}) });
    await card.locator("#quick-save").click();
    const saved = await page.evaluate(() => window.reuseFixture.saved[0]);
    expect(saved.type).toBe(owner === "__mother__" ? "puppy_tracker/mother/record/add" : "puppy_tracker/record/add");
    expect(saved.puppy_id).toBe(owner === "p2" ? "p2" : undefined);
  });
}

test("Reuse ignores deleted, missed, future, foreign and unstructured records @cross-browser @tablet", async ({ page }) => {
  const card = await mount(page);
  await page.evaluate(() => {
    const state = window.reuseFixture;
    const valid = state.entries.p1[0];
    const recent = new Date(Date.now() - 1000).toISOString();
    state.entries.p1.push(
      { ...valid, id: "deleted", deleted: true, occurred_at: recent, data: { amount: "999" } },
      { ...valid, id: "missed", occurred_at: recent, data: { amount: "998", care_status: "missed" } },
      { ...valid, id: "future", occurred_at: new Date(Date.now() + 86400000).toISOString(), data: { amount: "997" } },
      { ...valid, id: "foreign", occurred_at: recent, litter_id: "l2", data: { amount: "996" } },
      { ...valid, id: "other-pup", occurred_at: recent, puppy_id: "p2", data: { amount: "995" } },
      { ...valid, id: "invalid", occurred_at: "invalid", data: { amount: "994" } },
      { ...valid, id: "unstructured", occurred_at: recent, data: { observation: "Notes only" } },
    );
  });
  await card.locator('[data-preset="feeding"]').click();
  await card.locator("#quick-reuse").click();
  await expect(card.locator("#quick-data-amount")).toHaveValue("45");
  await expect(card.locator("#quick-data-observation")).toHaveValue("");
});

test("Reuse errors, an empty history and cancelled replacement keep the draft intact @cross-browser @tablet", async ({ page }) => {
  const card = await mount(page, { language: "nl" });
  await card.locator('[data-preset="feeding"]').click();
  await card.locator("#quick-data-amount").fill("27");
  page.once("dialog", (dialog) => dialog.dismiss());
  await card.locator("#quick-reuse").click();
  expect(await page.evaluate(() => window.reuseFixture.calls.filter((msg) => msg.type.endsWith("/records")).length)).toBe(0);
  await page.evaluate(() => { window.reuseFixture.failRead = true; });
  page.once("dialog", (dialog) => dialog.accept());
  await card.locator("#quick-reuse").click();
  await expect(card.locator(".reuse-feedback")).toContainText("Je invoer is behouden");
  await expect(card.locator("#quick-data-amount")).toHaveValue("27");
  await expect(card.locator("#quick-reuse")).toBeEnabled();
  await page.evaluate(() => { window.reuseFixture.failRead = false; window.reuseFixture.entries.p1 = []; });
  page.once("dialog", (dialog) => dialog.accept());
  await card.locator("#quick-reuse").click();
  await expect(card.locator(".reuse-feedback")).toContainText("Geen eerdere geschikte");
  await expect(card.locator("#quick-data-amount")).toHaveValue("27");
});

for (const change of ["owner", "category", "litter", "permissions", "connection", "mutated-user", "mutated-connection", "cancel", "detach"]) {
  test(`Late reuse cannot overwrite after ${change} changes @cross-browser @tablet`, async ({ page }) => {
    const card = await mount(page);
    await card.locator('[data-preset="feeding"]').click();
    await holdRead(page, card);
    if (change === "owner") await card.locator("#owner-select").selectOption("p2");
    if (change === "category") await card.locator('[data-preset="medication"]').click();
    if (change === "litter") await card.locator("#litter-select").selectOption("l2");
    if (change === "cancel") await card.locator("#quick-cancel").click();
    if (["permissions", "connection"].includes(change)) await card.evaluate((el, change) => {
      el.hass = change === "permissions" ? { ...el._hass, user: { id: "admin", is_admin: false } }
        : { ...el._hass, connection: { subscribeMessage: async () => async () => {} } };
    }, change);
    if (["mutated-user", "mutated-connection"].includes(change)) await card.evaluate((el, change) => {
      if (change === "mutated-user") el._hass.user.id = "another-user";
      else el._hass.connection = { subscribeMessage: async () => async () => {} };
      el.hass = el._hass;
    }, change);
    if (change === "detach") await page.locator("#reuse-workspace").evaluate((el) => el._selectTab("dossier"));
    await releaseRead(page);
    if (change === "detach") await page.locator("#reuse-workspace").evaluate((el) => el._selectTab("quickLog"));
    if (change === "cancel" || change === "litter") {
      await expect(card.locator("#quick-save")).toHaveCount(0);
    } else {
      const field = card.locator(change === "category" ? "#quick-data-medication" : "#quick-data-amount");
      await expect(field).toHaveValue("");
      await expect(card.locator(".reuse-feedback")).toBeHidden();
    }
    expect(await page.evaluate(() => window.reuseFixture.saved.length)).toBe(0);
  });
}

test("Typing and saving during a reuse request never applies a late copy @cross-browser @tablet", async ({ page }) => {
  const card = await mount(page);
  await card.locator('[data-preset="feeding"]').click();
  await holdRead(page, card);
  await card.locator("#quick-data-amount").fill("27");
  await releaseRead(page);
  await expect(card.locator(".reuse-feedback")).toContainText("Your input changed");
  await expect(card.locator("#quick-data-amount")).toBeFocused();
  await expect(card.locator("#quick-data-amount")).toHaveValue("27");
  page.once("dialog", (dialog) => dialog.accept());
  await holdRead(page, card);
  await card.locator("#quick-save").click();
  await expect(card.locator("#quick-save")).toHaveCount(0);
  await releaseRead(page);
  await expect(card.locator("#quick-save")).toHaveCount(0);
  expect(await page.evaluate(() => window.reuseFixture.saved[0].data)).toEqual({ amount: "27", recurring_completion: "none" });
});

test("Reuse locks double taps and clears fields absent from the source @cross-browser @tablet", async ({ page }) => {
  const card = await mount(page);
  await page.evaluate(() => { window.reuseFixture.entries.p1[0].data = { amount: "45" }; });
  await card.locator('[data-preset="feeding"]').click();
  await card.locator("#quick-data-unit").fill("g");
  page.once("dialog", (dialog) => dialog.accept());
  await holdRead(page, card);
  await card.evaluate((el) => el._reusePrevious());
  expect(await page.evaluate(() => window.reuseFixture.calls.filter((msg) => msg.type.endsWith("/records")).length)).toBe(1);
  await releaseRead(page);
  await expect(card.locator("#quick-data-amount")).toHaveValue("45");
  await expect(card.locator("#quick-data-unit")).toHaveValue("");
  await card.locator("#owner-select").selectOption("p2");
  await expect(card.locator(".reuse-feedback")).toContainText("Nova (paars)");
  await expect(card.locator("#owner-select")).toHaveValue("p2");
  await card.locator('[data-preset="medication"]').click();
  await card.locator('[data-preset="feeding"]').click();
  await expect(card.locator(".reuse-feedback")).toContainText("Nova (paars)");
});

test("Reuse rejects history for a mother linked differently on the server @cross-browser @tablet", async ({ page }) => {
  const card = await mount(page);
  await card.locator("#owner-select").selectOption("__mother__");
  await card.locator('[data-preset="feeding"]').click();
  await page.evaluate(() => { window.reuseFixture.replyOwner = { scope: "mother", id: "another-mother" }; });
  await card.locator("#quick-reuse").click();
  await expect(card.locator(".reuse-feedback")).toContainText("This owner is no longer available");
  await expect(card.locator("#quick-data-amount")).toHaveValue("");
  expect(await page.evaluate(() => window.reuseFixture.saved.length)).toBe(0);
});
