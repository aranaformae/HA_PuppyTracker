import { expect, test } from "@playwright/test";

test("owner views can load before the card without registering extra cards or sharing state @cross-browser @tablet", async ({ page }) => {
  await page.route("**/owner-module-check.html", route => route.fulfill({
    contentType: "text/html", body: "<!doctype html><html><body></body></html>",
  }));
  await page.goto("/owner-module-check.html");
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const result = await page.evaluate(async () => {
    const base = "/custom_components/puppy_tracker/frontend/puppy-tracker-owner-";
    for (const name of ["csv", "finance", "contacts", "preferences", "placements", "common"]) {
      await import(`${base}${name}.js`);
    }
    const registeredByViews = window.customCards?.some(item => item.type === "puppy-tracker-owner-card") || false;
    const definedByViews = Boolean(customElements.get("puppy-tracker-owner-card"));
    const { financialFields } = await import(`${base}finance.js`);
    const { ownerForLitter } = await import(`${base}placements.js`);
    const { ownerCsvContent } = await import(`${base}csv.js`);
    await import(`${base}card.js`);
    const first = document.createElement("puppy-tracker-owner-card");
    const second = document.createElement("puppy-tracker-owner-card");
    first.setConfig({ type: "custom:puppy-tracker-owner-card" });
    second.setConfig({ type: "custom:puppy-tracker-owner-card" });
    first._hass = second._hass = { language: "en", user: { is_admin: true } };
    first._owners = [{ id: "o1", name: "Alex", phone: "0612345678", placements: {
      l1: { payment_amount: "1000", deposit_amount: "100", placement_notes: "First litter" },
      l2: { payment_amount: "2000", deposit_amount: "250", placement_notes: "Second litter" },
    } }];
    first._litters = [{ id: "l1", name: "Litter one" }, { id: "l2", name: "Litter two" }];
    first._ownerScope = "l2";
    first._selectedLitter = "l2";
    const snapshot = JSON.stringify(first._owners);
    const dossier = ownerForLitter(first, first._owners[0], "l2");
    const fields = financialFields(first, dossier);
    const csv = ownerCsvContent(first);
    return { registeredByViews, definedByViews,
      registrations: window.customCards.filter(item => item.type === "puppy-tracker-owner-card").length,
      fields, csv, untouched: snapshot === JSON.stringify(first._owners),
      independent: second._owners.length === 0 && first._formState !== second._formState,
      siblingDossier: ownerForLitter(first, first._owners[0], "l1").payment_amount };
  });
  expect(errors).toEqual([]);
  expect(result.registeredByViews).toBe(false);
  expect(result.definedByViews).toBe(false);
  expect(result.registrations).toBe(1);
  expect(result.fields).toContain('value="2000"');
  expect(result.csv).toContain('"2000"');
  expect(result.csv).toContain('"0612345678"');
  expect(result.csv).toContain('"Second litter"');
  expect(result.csv).not.toContain('"First litter"');
  expect(result.untouched).toBe(true);
  expect(result.independent).toBe(true);
  expect(result.siblingDossier).toBe("1000");
});
