import { expect, test } from "@playwright/test";

test.use({ timezoneId: "Europe/Amsterdam" });

for (const language of ["nl", "en"]) {
  test(`puppy item names include collars without duplicate colour names (${language}) @cross-browser @tablet`, async ({ page }) => {
    // Exercise local midnight, when the UTC date is still the previous day.
    await page.clock.install({ time: new Date("2026-10-21T22:30:00Z") });
    await page.goto("/tests/e2e/cards.html?production", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__puppyTrackerReady);
    await page.evaluate((language) => {
      const date = new Date();
      const now = date.toISOString();
      const today = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      const puppies = [
        { id: "p1", name: "Nova", collar_color: "paars" },
        { id: "p2", name: "Paars", collar_color: "paars" },
        { id: "p3", name: "Benen", collar_color: "" },
        { id: "p4", name: "Nova", collar_color: "blauw" },
      ].map((p, i) => ({ ...p, active: true, owner_ids: ["owner"],
        measurements: [{ id: `w${p.id}`, weight: 600 + i, timestamp: now }],
        records: [{ id: `r${p.id}`, scope: "puppy", puppy_id: p.id, litter_id: "l1", type: "note", note: "Observation", occurred_at: now }],
        summary: { needs_attention: true, status_code: "low_growth", dossier_actions: { actions: [] } },
      }));
      const occurrences = puppies.map((p) => ({ id: `care:${p.id}`, puppy_id: p.id, puppy_name: p.name,
        collar_color: p.collar_color, program_id: "program", title: "ENS", status: "due_today", age_days: 3,
        scheduled_at: now, scheduled_date: today, days_until_due: 0, counts_for_attention: true }));
      const data = { can_manage_records: true, can_manage_measurements: true,
        litter: { id: "l1", name: "Nest", records: [], summary: {} }, puppies };
      const calls = window.identityCalls = [];
      const hass = { language, locale: { language }, user: { is_admin: true }, states: {},
        connection: { subscribeMessage: async () => async () => {} },
        callWS: async (msg) => {
          calls.push(structuredClone(msg));
          if (msg.type === "puppy_tracker/litters") return { litters: [{ id: "l1", name: "Nest", active: true }] };
          if (msg.type === "puppy_tracker/data") return structuredClone(data);
          if (msg.type === "puppy_tracker/records") return { can_manage_records: true, records: structuredClone(puppies.find((p) => p.id === msg.puppy_id)?.records || []), actions: { actions: [] } };
          if (msg.type === "puppy_tracker/care_occurrences") return { occurrences: structuredClone(occurrences), skipped: [] };
          if (msg.type === "puppy_tracker/care_programs") return { programs: [] };
          if (msg.type === "puppy_tracker/recurring_reminders") return { reminders: [{ id: "rem", owner_scope: "puppy", owner_id: "p4", owner_name: "Nova", title: "Feeding", record_type: "feeding", status: "overdue", next_due_at: now, updated_at: now }] };
          if (msg.type === "puppy_tracker/owners/list") return { owners: [{ id: "owner", name: "Family", puppy_preferences: [{ puppy_id: "p1" }] }] };
          if (msg.type === "puppy_tracker/attention_acknowledgements") return { acknowledgements: [] };
          throw new Error(msg.type);
        },
      };
      for (const surface of ["dossier", "today", "attention", "litter", "calculator", "care-execution", "recurring-reminder", "owner", "report"]) {
        const card = document.createElement(`puppy-tracker-${surface}-card`);
        card.setConfig({ litter_id: "l1", default_selected: "all", show_today_only: false });
        document.querySelector("#cards").append(card);
        card.hass = hass;
      }
      window.identityData = structuredClone(data);
    }, language);

    const labels = ["Nova (paars)", "Paars", "Benen", "Nova (blauw)"];
    const dossier = page.locator("puppy-tracker-dossier-card");
    await expect(dossier.locator(".record")).toHaveCount(8);
    for (const [index, label] of labels.entries()) {
      for (const type of ["weight", "puppy"]) {
        const key = type === "weight" ? `weight:p${index + 1}:wp${index + 1}` : `puppy:rp${index + 1}`;
        await expect(dossier.locator(`[data-record-key="${key}"] .aggregate-owner-badge`)).toContainText(label);
      }
    }
    const today = page.locator("puppy-tracker-today-card");
    await expect(today).toContainText("Nova (paars)");
    await expect(today).toContainText("Nova (blauw)");
    const attention = page.locator("puppy-tracker-attention-card");
    await expect(attention.locator(".row .name").filter({ hasText: "Nova (blauw)" }).first()).toBeVisible();
    for (const surface of ["litter", "calculator", "care-execution"]) {
      const card = page.locator(`puppy-tracker-${surface}-card`);
      for (const label of labels) await expect(card).toContainText(label);
      await expect(card).not.toContainText("Paars (paars)");
      expect(await card.locator("ha-card").evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    }
    await expect(page.locator("puppy-tracker-recurring-reminder-card")).toContainText("Nova (blauw)");
    const owners = page.locator("puppy-tracker-owner-card");
    await owners.locator('[data-toggle-owner="owner"]').click();
    await expect(owners.locator(".owner-detail")).toContainText("Nova (paars)");
    const csv = await owners.evaluate((node) => node._ownerCsvContent());
    expect(csv).not.toContain('"Nova (paars)"');
    const report = page.locator("puppy-tracker-report-card");
    await report.locator("#puppy").selectOption("p4");
    await expect(report.locator(".preview-summary")).toContainText("Nova (blauw)");
    await dossier.locator('[data-record-key="puppy:rp4"] [data-edit-item]').click();
    await expect(page.locator("puppy-tracker-record-editor .head .owner")).toHaveText("Nova (blauw)");
    expect(await page.evaluate(() => window.identityCalls.filter((c) => c.type === "puppy_tracker/records").at(-1).puppy_id)).toBe("p4");
    expect(await page.evaluate(() => window.identityData.puppies.map((p) => p.name))).toEqual(["Nova", "Paars", "Benen", "Nova"]);
    await page.locator("puppy-tracker-record-editor #record-cancel").click();
    await dossier.screenshot({ path: test.info().outputPath(`puppy-identities-${language}.png`) });
  });
}
