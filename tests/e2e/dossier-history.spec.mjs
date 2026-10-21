import { expect, test } from "@playwright/test";

async function mount(page, { language = "en", config = {}, workspace = false } = {}) {
  await page.goto("/tests/e2e/cards.html?production", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__puppyTrackerReady);
  await page.evaluate(({ language, config, workspace }) => {
    if (!customElements.get("ha-card")) customElements.define("ha-card", class extends HTMLElement {
      connectedCallback() { this.style.display = "block"; }
    });
    for (const [name, color] of Object.entries({ "--primary-color": "#007fa3", "--primary-text-color": "#222222", "--secondary-text-color": "#666666", "--divider-color": "#dddddd", "--card-background-color": "#ffffff", "--secondary-background-color": "#f5f5f5", "--text-primary-color": "#ffffff", "--error-color": "#b71c1c" })) document.documentElement.style.setProperty(name, color);
    const clone = (value) => structuredClone(value);
    const time = (day) => `2026-10-${day}T12:00:00Z`;
    const records = [
      { id: "nest", scope: "litter", type: "note", title: "Litter observation", note: "Nest only", occurred_at: time(10), data: {} },
      { id: "mother", scope: "mother", type: "temperature", title: "Luna check", note: "Mother only", occurred_at: time(11), data: { temperature_c: 38.4 } },
      { id: "p1-note", scope: "puppy", puppy_id: "p1", type: "feeding", title: "Bottle feeding", occurred_at: time(12), note: Array.from({ length: 20 }, (_, i) => `Observation ${i + 1}`).join("\n"), data: { feeding_type: "Milk", amount: 30, unit: "ml" } },
      { id: "behavior", scope: "puppy", puppy_id: "p2", type: "behavior_observation", title: "Behavior check", occurred_at: time(13), note: "Curious", data: { scores: { curiosity: 4 } } },
      { id: "care", scope: "puppy", puppy_id: "p1", type: "test", title: "ESI", occurred_at: time(14), data: { care_occurrence_id: "esi:p1:3", care_result: "Calm", care_instruction: "Grass", care_status: "completed" } },
    ].map((record) => ({ ...record, litter_id: "l1", created_at: record.occurred_at, updated_at: "v1" }));
    const measurements = [
      { id: "weight1", puppy_id: "p1", weight: 650, timestamp: time(15), status: "active" },
      { id: "weight2", puppy_id: "p2", weight: 700, timestamp: time(15), status: "active" },
      { id: "old", puppy_id: "p1", weight: 60, timestamp: time(14), status: "superseded", superseded_by: "weight1", correction_reason: "Typo" },
      { id: "deleted", puppy_id: "p1", weight: 620, timestamp: time(13), status: "deleted", deleted: true },
    ];
    const state = window.dossierHistory = { records, measurements, calls: [], fail: false, subscriptions: [] };
    const hass = {
      language, locale: { language }, config: { time_zone: "UTC" }, user: { is_admin: true }, states: {},
      connection: { subscribeMessage: async (callback) => { state.subscriptions.push(callback); return async () => {}; } },
      callWS: async (msg) => {
        state.calls.push(clone(msg));
        if (msg.type === "puppy_tracker/litters") return { litters: [{ id: "l1", name: "Milky Way", active: true }] };
        if (msg.type === "puppy_tracker/data") return { can_manage_records: true, can_manage_measurements: true,
          litter: { id: "l1", name: "Milky Way", mother: "Luna", mother_id: "m1" },
          puppies: ["p1", "p2"].filter((id) => !state.removedPuppy || id !== "p1").map((id, i) => ({ id, name: i ? "Bob" : "Alice", collar_color: i ? "Blue" : "Red", active: true, profile_note: "Persistent puppy profile", measurements: clone(measurements.filter((m) => m.puppy_id === id && m.status === "active")) })) };
        if (msg.type.endsWith("/records")) {
          const scope = msg.type.includes("/mother/") ? "mother" : msg.puppy_id ? "puppy" : "litter";
          return { can_manage_records: true, owner: { name: scope === "mother" ? "Luna" : "Owner", profile_note: "Persistent mother profile" },
            records: clone(records.filter((r) => r.scope === scope && (!msg.puppy_id || r.puppy_id === msg.puppy_id) && (msg.include_deleted || !r.deleted))),
            actions: { actions: clone((state.actions || []).filter((a) => scope === "litter" ? ["litter", "puppy"].includes(a.scope) : a.scope === scope && (!msg.puppy_id || a.puppy_id === msg.puppy_id))) } };
        }
        if (msg.type === "puppy_tracker/measurements") return { measurements: clone(measurements.filter((m) => m.puppy_id === msg.puppy_id)) };
        if (msg.type.endsWith("/record/add")) {
          if (state.fail) throw new Error("Save failed");
          const record = { id: `new-${records.length}`, litter_id: msg.litter_id, scope: msg.type.includes("/mother/") ? "mother" : msg.puppy_id ? "puppy" : "litter", puppy_id: msg.puppy_id || null, type: msg.record_type, occurred_at: msg.occurred_at, title: msg.title, note: msg.note, data: clone(msg.data) };
          records.push(record); return { record: clone(record) };
        }
        if (msg.type === "puppy_tracker/measurement/correct") return { ok: true };
        if (msg.type.endsWith("/record/update")) { Object.assign(records.find((r) => r.id === msg.record_id), { title: msg.title, note: msg.note, data: clone(msg.data) }); return { ok: true }; }
        throw new Error(msg.type);
      },
    };
    const card = document.createElement(workspace ? "puppy-tracker-workspace-card" : "puppy-tracker-dossier-card");
    card.setConfig(workspace ? { preset: "journal", litter_id: "l1", ...config } : { litter_id: "l1", ...config });
    document.querySelector("#cards").append(card);
    card.hass = hass;
  }, { language, config, workspace });
  const card = page.locator(workspace ? "puppy-tracker-workspace-card puppy-tracker-dossier-card" : "puppy-tracker-dossier-card");
  await expect(card.locator("#add-record")).toBeVisible();
  return card;
}

test("one dossier replaces Timeline and starts with a readable combined history @cross-browser @tablet", async ({ page }, info) => {
  const card = await mount(page, { workspace: true });
  await expect(page.locator("puppy-tracker-workspace-card [data-tab='timeline']")).toHaveCount(0);
  await expect(card.locator("#owner-select")).toHaveValue("__all__");
  await expect(card.locator(".record")).toHaveCount(7);
  await expect(card.locator(".history-filters")).not.toHaveAttribute("open");
  await expect(card.locator(".record-details[open]")).toHaveCount(0);
  const feeding = card.locator('[data-record-key="puppy:p1-note"]');
  await feeding.locator(".record-details > summary").click();
  await expect(feeding.locator(".record-note")).toContainText("Observation 20");
  expect(await feeding.locator(".record-note").evaluate((node) => node.scrollHeight <= node.clientHeight + 1)).toBe(true);
  await card.evaluate((node) => node._queueRefresh());
  await expect(feeding.locator(".record-details")).toHaveAttribute("open", "");
  expect(await card.locator("ha-card").evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  await card.screenshot({ path: info.outputPath("unified-dossier.png") });
});

test("owner scopes, behavior category, dates and empty filters agree @cross-browser @tablet", async ({ page }) => {
  const card = await mount(page);
  await card.locator("#owner-select").selectOption("__litter__");
  await expect(card.locator(".record")).toHaveCount(1);
  await expect(card.locator(".record")).toContainText("Litter observation");
  await card.locator("#owner-select").selectOption("__mother__");
  await expect(card.locator(".record")).toHaveCount(1);
  await expect(card.locator(".record")).toContainText("Luna check");
  await card.locator("#owner-select").selectOption("__all__");
  await card.locator(".history-filters > summary").click();
  await expect(card.locator('[data-dossier-category="behavior_observation"]')).toBeVisible();
  await card.locator('[data-dossier-category="__all__"]').click();
  await expect(card.locator(".record")).toHaveCount(0);
  await card.locator("#owner-select").selectOption("p2");
  await expect(card.locator(".record")).toHaveCount(0);
  await card.locator('[data-dossier-category="behavior_observation"]').click();
  await expect(card.locator(".record")).toHaveCount(1);
  await card.locator("#reset-history-filters").click();
  await card.locator("#from-date").fill("2026-10-14");
  await expect(card.locator(".record")).toHaveCount(1);
  await expect(card.locator(".record")).toContainText("700 g");
  await card.locator("#to-date").fill("2026-10-14");
  await expect(card.locator(".record")).toHaveCount(0);
});

for (const [owner, scope] of [["litter:", "litter"], ["mother:", "mother"], ["puppy:p2", "puppy"]]) {
  test(`New entry requires an explicit ${scope} owner in All and keeps failed input @cross-browser @tablet`, async ({ page }) => {
    const card = await mount(page);
    await card.locator("#add-record").click();
    const editor = page.locator("puppy-tracker-record-editor");
    await expect(editor.locator(".head .owner")).toHaveText("Choose an owner");
    await editor.locator("#record-title").fill("New observation");
    await editor.locator("#record-save").click();
    await expect(editor.locator("#record-new-owner")).toHaveAttribute("aria-invalid", "true");
    await editor.locator("#record-new-owner").selectOption(owner);
    const ownerLabel = scope === "litter" ? "Whole litter" : scope === "mother" ? "Mother · Luna" : "Puppy · Bob (Blue)";
    await expect(editor.locator(".head .owner")).toHaveText(ownerLabel);
    await editor.locator("#record-type").selectOption("feeding");
    await expect(editor.locator("#record-new-owner")).toHaveValue(owner);
    await expect(editor.locator(".head .owner")).toHaveText(ownerLabel);
    await editor.locator("#record-note").fill("Keep this note");
    await page.evaluate(() => { window.dossierHistory.fail = true; });
    await editor.locator("#record-save").click();
    await expect(editor.locator(".error")).toHaveText("Save failed");
    await expect(editor.locator("#record-new-owner")).toHaveValue(owner);
    await expect(editor.locator(".head .owner")).toHaveText(ownerLabel);
    await card.evaluate((node) => node._queueRefresh());
    await expect(editor.locator("#record-note")).toHaveValue("Keep this note");
    await page.evaluate(() => { window.dossierHistory.fail = false; });
    await editor.locator("#record-save").click();
    await expect(editor).toHaveCount(0);
    const entry = await page.evaluate(() => window.dossierHistory.records.at(-1));
    expect(entry).toMatchObject({ scope, note: "Keep this note", type: "feeding", puppy_id: scope === "puppy" ? "p2" : null });
  });
}

test("weight history retains correction semantics and no owner-change menu @cross-browser @tablet", async ({ page }) => {
  const card = await mount(page, { config: { default_selected: "puppy", puppy_id: "p1" } });
  await expect(card.locator('[data-event-type="weight"]')).toHaveCount(1);
  await expect(card.locator(".timeline-sub")).toHaveText("Alice (Red) · 3 active items");
  await card.locator(".history-filters > summary").click();
  await card.locator("#show-deleted").check();
  await expect(card.locator('[data-event-type="weight"]')).toHaveCount(3);
  await expect(card.locator(".timeline-sub")).toHaveText("Alice (Red) · 3 active items");
  await expect(card.locator('[data-record-key="weight:p1:old"] [data-edit-item]')).toHaveCount(0);
  const weight = card.locator('[data-record-key="weight:p1:weight1"]');
  await expect(weight.locator(".record-menu")).toHaveCount(0);
  await weight.getByRole("button", { name: "Correct measurement" }).click();
  await page.locator("puppy-tracker-record-editor #measurement-weight").fill("655");
  await page.locator("puppy-tracker-record-editor #record-save").click();
  await expect(page.locator("puppy-tracker-record-editor")).toHaveCount(0);
  expect(await page.evaluate(() => window.dossierHistory.calls.filter((call) => call.type.endsWith("/measurement/correct")))).toHaveLength(1);
  expect(await page.evaluate(() => window.dossierHistory.calls.filter((call) => call.type.endsWith("/record/update")))).toHaveLength(0);
});

test("history limits, simple configuration and read-only viewing remain independent @cross-browser @tablet", async ({ page }) => {
  const card = await mount(page, { config: { show_weights: false, show_profile_note: false, show_details: true, max_items: 25, max_height: 260 } });
  await page.evaluate(() => {
    const original = window.dossierHistory.records[0];
    for (let i = 0; i < 35; i += 1) window.dossierHistory.records.push({ ...structuredClone(original), id: `extra-${i}`, title: `Extra ${i}` });
  });
  await card.evaluate((node) => node._queueRefresh());
  await expect(card.locator(".record")).toHaveCount(25);
  await expect(card.locator('[data-event-type="weight"]')).toHaveCount(0);
  await expect(card.locator(".profile-panel")).toHaveCount(0);
  const sizes = await card.locator(".dossier-timeline-scroll").evaluate((node) => ({ height: node.clientHeight, full: node.scrollHeight }));
  expect(sizes.height).toBeLessThanOrEqual(260);
  expect(sizes.full).toBeGreaterThan(sizes.height);
  await card.locator("#show-more-history").click();
  await expect(card.locator(".record")).toHaveCount(40);
  await card.evaluate((node) => { node._hass.user.is_admin = false; node._render(); });
  await expect(card.locator("#add-record,[data-edit-item],.record-menu")).toHaveCount(0);
  await expect(card.locator(".record")).toHaveCount(40);
});

test("a missing selected puppy never becomes a litter entry @cross-browser @tablet", async ({ page }) => {
  const card = await mount(page, { config: { default_selected: "puppy", puppy_id: "p1" } });
  await page.evaluate(() => { window.dossierHistory.removedPuppy = true; });
  await card.evaluate((node) => node._queueRefresh());
  await expect(card.locator(".error")).toContainText("This owner is no longer available");
  await expect(card.locator("#add-record")).toHaveCount(0);
  await expect(card.locator(".record")).toHaveCount(0);
  await card.locator("#owner-select").selectOption("__all__");
  await expect(card.locator("#add-record")).toBeVisible();
  await expect(card.locator("#owner-select")).toHaveValue("__all__");
});

test("late owner responses cannot replace the currently selected mother @cross-browser @tablet", async ({ page }) => {
  const card = await mount(page);
  await card.evaluate((node) => {
    const original = node._hass.callWS;
    node._hass.callWS = async (msg) => {
      if (msg.type === "puppy_tracker/records" && msg.puppy_id === "p1") await new Promise((resolve) => { window.ownerResume = resolve; });
      return original(msg);
    };
    window.pendingOwner = node._selectOwner("p1");
  });
  await page.waitForFunction(() => typeof window.ownerResume === "function");
  await card.evaluate((node) => node._selectOwner("__mother__"));
  await page.evaluate(async () => { window.ownerResume(); await window.pendingOwner; });
  await expect(card.locator("#owner-select")).toHaveValue("__mother__");
  await expect(card.locator(".record")).toHaveCount(1);
  await expect(card.locator(".record")).toContainText("Luna check");
});

test("background refresh keeps unchanged DOM, page position and explicit history visibility @cross-browser @tablet", async ({ page }) => {
  const card = await mount(page);
  await page.evaluate(() => {
    for (const [height, before] of [[600, true], [1600, false]]) {
      const spacer = document.createElement("div"); spacer.style.height = `${height}px`;
      if (before) document.querySelector("#cards").before(spacer); else document.querySelector("#cards").after(spacer);
    }
    window.scrollTo(0, 650);
  });
  await card.evaluate((node) => { window.historyNode = node.shadowRoot.querySelector(".record"); });
  const scroll = await page.evaluate(() => window.scrollY);
  await card.evaluate(async (node) => { await node._queueRefresh(); await node._queueRefresh(); });
  expect(await card.evaluate((node) => node.shadowRoot.querySelector(".record") === window.historyNode)).toBe(true);
  expect(await page.evaluate(() => window.scrollY)).toBeCloseTo(scroll, 0);
  await card.locator("#toggle-timeline-items").click();
  await expect(card.locator(".timeline-items-content")).toBeHidden();
  await card.evaluate((node) => node._queueRefresh());
  await expect(card.locator(".timeline-items-content")).toBeHidden();
});

test("To do uses exact owners even when the litter API includes puppy follow-ups @cross-browser @tablet", async ({ page }) => {
  const card = await mount(page);
  await page.evaluate(() => {
    const state = window.dossierHistory;
    state.actions = ["nest", "mother", "p1-note"].map((id) => {
      const source = state.records.find((record) => record.id === id);
      source.type = "deworming"; source.data = { product: "Example", next_due_date: "2026-10-21" };
      return { id: `${id}:next_due_date`, source_record_id: id, record_id: id, litter_id: "l1", scope: source.scope,
        puppy_id: source.puppy_id || null, type: "deworming", record_type: "deworming", due_date: "2026-10-21", status: "due_today" };
    });
  });
  await card.evaluate((node) => node._queueRefresh());
  await expect(card.locator(".followup-row")).toHaveCount(3);
  await expect(card.locator(".followup-owner")).toHaveText(["Whole litter", "Mother · Luna", "Puppy · Alice (Red)"]);
  await card.locator("#owner-select").selectOption("__litter__");
  await expect(card.locator(".followup-row")).toHaveCount(1);
  await card.locator("#owner-select").selectOption("__mother__");
  await expect(card.locator(".followup-row")).toHaveCount(1);
  await expect(card.locator(".followup-row")).toContainText("Deworming");
  await card.locator("#owner-select").selectOption("__all__");
  for (const [source, scope] of [["mother", "mother"], ["p1-note", "puppy"]]) {
    await card.locator(`[data-complete-followup="${source}:next_due_date"]`).click();
    await page.locator("puppy-tracker-record-editor #record-save").click();
    await expect(page.locator("puppy-tracker-record-editor")).toHaveCount(0);
    const entry = await page.evaluate(() => window.dossierHistory.records.at(-1));
    expect(entry).toMatchObject({ scope, puppy_id: scope === "puppy" ? "p1" : null, type: "deworming" });
  }
});

for (const language of ["nl", "en"]) {
  test(`new entry owner heading follows switches and clearing (${language}) @cross-browser @tablet`, async ({ page }) => {
    const card = await mount(page, { language });
    await card.locator("#add-record").click();
    const editor = page.locator("puppy-tracker-record-editor");
    const placeholder = language === "nl" ? "Kies een eigenaar" : "Choose an owner";
    for (const owner of ["puppy:p1", "mother:", "litter:", "puppy:p2", ""]) {
      await editor.locator("#record-new-owner").selectOption(owner);
      const label = await editor.locator("#record-new-owner option:checked").textContent();
      await expect(editor.locator(".head .owner")).toHaveText(owner ? label : placeholder);
    }
    await editor.locator("#record-save").click();
    await expect(editor.locator("#record-new-owner")).toHaveAttribute("aria-invalid", "true");
    await expect(editor.locator(".head .owner")).toHaveText(placeholder);
  });
}
