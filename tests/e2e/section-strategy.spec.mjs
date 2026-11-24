import { expect, test } from "@playwright/test";

async function ready(page) {
  await page.goto("/tests/e2e/cards.html?production=1");
  await page.waitForFunction(() => window.__puppyTrackerReady);
}

test("Puppy Tracker sections generate supported cards without changing data @cross-browser @tablet", async ({ page }) => {
  await ready(page);
  const result = await page.evaluate(async () => {
    const Strategy = customElements.get("ll-strategy-section-puppy-tracker");
    const hass = { language: "en", callWS: () => { throw Error("Generation must not write or fetch private data"); } };
    const layouts = {};
    for (const layout of ["daily", "growth", "journal", "mobile", "management"]) {
      layouts[layout] = await Strategy.generate({ ...Strategy.getStubConfig(), layout, litter_id: "l1", show_litter_selector: false }, hass);
    }
    let rejected = false;
    try { await Strategy.generate({ layout: "invalid" }, hass); } catch { rejected = true; }
    const dutch = await Strategy.generate({ layout: "growth" }, { language: "nl" });
    return { layouts, rejected, dutch, registered: window.customStrategies.filter((s) => s.type === "puppy-tracker") };
  });
  expect(result.registered).toHaveLength(1);
  expect(result.registered[0].strategyType).toBe("section");
  expect(result.rejected).toBe(true);
  expect(result.dutch.cards[0].heading).toBe("Puppy Tracker · Groei");
  for (const section of Object.values(result.layouts)) {
    expect(section.type).toBe("grid");
    expect(section.cards[0].type).toBe("heading");
    for (const card of section.cards.slice(1)) {
      expect(["custom:puppy-tracker-workspace-card", "custom:puppy-tracker-owner-card", "custom:puppy-tracker-report-card"]).toContain(card.type);
      expect(card.litter_id).toBe("l1");
      expect(card.show_litter_selector).toBe(false);
    }
  }
  expect(result.layouts.daily.cards.slice(1).map((c) => c.preset)).toEqual(["home", "care"]);
  expect(result.layouts.daily.cards[2].tabs).toEqual(["care", "calculator"]);
  expect(result.layouts.growth.cards[1].preset).toBe("growth");
  expect(result.layouts.management.cards).toHaveLength(3);
});

test("section editor keeps its form stable and ignores late litter responses @cross-browser", async ({ page }) => {
  await ready(page);
  const result = await page.evaluate(async () => {
    const Strategy = customElements.get("ll-strategy-section-puppy-tracker");
    const editor = Strategy.getConfigElement();
    editor.setConfig(Strategy.getStubConfig());
    document.querySelector("#cards").append(editor);
    let resolveOld;
    editor.hass = { language: "nl", connection: {}, user: { id: "old" }, callWS: () => new Promise((resolve) => { resolveOld = resolve; }) };
    const current = { language: "en", connection: {}, user: { id: "new" }, callWS: async () => ({ litters: [{ id: "new", name: "Current litter" }] }) };
    editor.hass = current;
    await new Promise((resolve) => setTimeout(resolve, 0));
    resolveOld({ litters: [{ id: "old", name: "Old context" }] });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const form = editor.shadowRoot.querySelector("ha-form");
    const schema = form.schema;
    let saved;
    editor.addEventListener("config-changed", (event) => { saved = event.detail.config; });
    form.dispatchEvent(new CustomEvent("value-changed", { detail: { value: { ...form.data, layout: "growth", litter_id: "new" } }, bubbles: true }));
    editor.setConfig(saved);
    editor.hass = { ...current };
    return { saved, sameForm: form === editor.shadowRoot.querySelector("ha-form"), sameSchema: schema === form.schema,
      litters: form.schema.find((field) => field.name === "litter_id").selector.select.options };
  });
  expect(result.saved.layout).toBe("growth");
  expect(result.saved.litter_id).toBe("new");
  expect(result.sameForm).toBe(true);
  expect(result.sameSchema).toBe(true);
  expect(result.litters.map((o) => o.value)).toEqual(["", "new"]);
});
