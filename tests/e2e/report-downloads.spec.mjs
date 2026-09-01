import { expect, test } from "@playwright/test";

async function openFixture(page) {
  await page.goto("/tests/e2e/cards.html");
  await page.waitForFunction(() => window.__puppyTrackerReady === true);
}

async function mountReport(page) {
  await openFixture(page);

  await page.evaluate(() => {
    const now = new Date().toISOString();
    const calls = [];
    const exports = {
      pdf: {
        content: btoa("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n"),
        encoding: "base64",
        mime_type: "application/pdf",
        filename: "puppy-tracker-report.pdf",
      },
      csv: {
        content: "puppy,weight\nAlice,410\n",
        encoding: "utf-8",
        mime_type: "text/csv;charset=utf-8",
        filename: "puppy-tracker-report.csv",
      },
      json: {
        content: JSON.stringify({ litter: "l1", backup: true }),
        encoding: "utf-8",
        mime_type: "application/json",
        filename: "puppy-tracker-backup.json",
      },
    };

    const hass = {
      locale: { language: "en" },
      language: "en",
      states: {},
      connection: {
        subscribeMessage: async () => async () => {},
      },
      callWS: async (message) => {
        calls.push(JSON.parse(JSON.stringify(message)));

        if (message.type === "puppy_tracker/litters") {
          return { litters: [{ id: "l1", name: "Luna x Dutch", active: true }] };
        }

        if (message.type === "puppy_tracker/data") {
          return {
            litter: { id: "l1", name: "Luna x Dutch", active: true },
            puppies: [
              {
                id: "p1",
                name: "Alice",
                active: true,
                collar_color: "Red",
                summary: { needs_attention: false },
                measurements: [
                  { id: "m1", timestamp: now, weight: 410, status: "active" },
                ],
              },
            ],
          };
        }

        if (message.type === "puppy_tracker/export") {
          const result = exports[message.format];
          if (!result) throw new Error(`Unexpected export format: ${message.format}`);
          return { ...result };
        }

        throw new Error(`Unexpected WS call: ${message.type}`);
      },
    };

    window.__reportCalls = calls;

    const constructor = customElements.get("puppy-tracker-report-card");
    const card = document.createElement("puppy-tracker-report-card");
    card.setConfig(constructor.getStubConfig());
    document.querySelector("#cards").appendChild(card);
    card.hass = hass;
  });

  const card = page.locator("puppy-tracker-report-card");
  await expect(card.locator("#pdf")).toBeVisible();
  await expect(card.locator("#csv")).toBeVisible();
  await expect(card.locator("#json")).toBeVisible();
  return card;
}

test("report selection uses the shared Alles label", async ({ page }) => {
  const card = await mountReport(page);

  await expect(card.locator("#puppy option[value='all']")).toHaveText("Alles");
  await expect(card.locator(".field label").nth(1)).toHaveText("Selectie");
  await expect(card.locator("#puppy")).not.toContainText("Compleet nest");
});

for (const [buttonId, format, filename] of [
  ["pdf", "pdf", "puppy-tracker-report.pdf"],
  ["csv", "csv", "puppy-tracker-report.csv"],
  ["json", "json", "puppy-tracker-backup.json"],
]) {
  test(`${format.toUpperCase()} export triggers a downloadable file`, async ({ page }) => {
    const card = await mountReport(page);

    const downloadPromise = page.waitForEvent("download");
    await card.locator(`#${buttonId}`).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toBe(filename);

    const exportCall = await page.evaluate((expectedFormat) =>
      window.__reportCalls.find(
        (call) => call.type === "puppy_tracker/export" && call.format === expectedFormat
      )
    , format);

    expect(exportCall).toBeTruthy();
    expect(exportCall.litter_id).toBe("l1");
  });
}
