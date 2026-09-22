import { expect, test } from "@playwright/test";

async function openFixture(page) {
  await page.goto("/tests/e2e/cards.html");
  await page.waitForFunction(() => window.__puppyTrackerReady === true);
}

async function mountReport(page, config = {}, storedState = null) {
  await openFixture(page);

  await page.evaluate(({ config, storedState }) => {
    if (storedState) {
      window.localStorage.setItem(
        "puppy_tracker.card_state.puppy-tracker-report-card",
        JSON.stringify(storedState),
      );
    }
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
            litter: {
              id: "l1",
              name: "Luna x Dutch",
              mother: "Luna",
              active: true,
            },
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
              {
                id: "p2",
                name: "Bob",
                active: false,
                collar_color: "Blue",
                summary: { needs_attention: false },
                measurements: [
                  { id: "m2", timestamp: now, weight: 520, status: "active" },
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

        if (message.type === "puppy_tracker/mother/export_url") {
          return { url: "/api/puppy_tracker/mother/export/test" };
        }

        throw new Error(`Unexpected WS call: ${message.type}`);
      },
    };

    window.__reportCalls = calls;

    const constructor = customElements.get("puppy-tracker-report-card");
    const card = document.createElement("puppy-tracker-report-card");
    card.setConfig({ ...constructor.getStubConfig(), ...config });
    document.querySelector("#cards").appendChild(card);
    card.hass = hass;
  }, { config, storedState });

  const card = page.locator("puppy-tracker-report-card");
  await expect(card.locator("#pdf")).toBeVisible();
  await expect(card.locator("#csv")).toBeVisible();
  await expect(card.locator("#json")).toBeVisible();
  await expect(card.locator(".title")).toHaveText("Report & export");
  await expect(card.locator(".sub")).toHaveText("Print-friendly puppy or litter report with existing CSV/JSON export.");
  return card;
}

test("report selection exposes one clear whole-litter scope and historical puppies", async ({ page }) => {
  const card = await mountReport(page);
  const options = card.locator("#puppy option");

  await expect(options).toHaveText([
    "Whole litter",
    "Mother · Luna",
    "Alice – Red",
    "Bob – Blue (inactive)",
  ]);
  await expect(card.locator("#puppy")).toHaveValue("__litter__");
  await expect(card.locator(".box").first().locator("b")).toHaveText("2");
  await expect(card.locator(".field label").nth(1)).toHaveText("Selection");
});

test("whole-litter PDF export keeps the puppy-only litter scope", async ({ page }) => {
  const card = await mountReport(page);

  await card.locator("#puppy").selectOption("__litter__");
  await expect(card.locator("#puppy")).toHaveValue("__litter__");

  const downloadPromise = page.waitForEvent("download");
  await card.locator("#pdf").click();
  await downloadPromise;

  const exportCall = await page.evaluate(() =>
    window.__reportCalls.find(
      (call) => call.type === "puppy_tracker/export" && call.format === "pdf"
    )
  );

  expect(exportCall).toBeTruthy();
  expect(exportCall.litter_id).toBe("l1");
  expect(exportCall.puppy_id).toBeUndefined();
});

test("report card localizes its own editor options", async ({ page }) => {
  await openFixture(page);

  const form = await page.evaluate(() => {
    const constructor = customElements.get("puppy-tracker-report-card");
    const config = constructor.getStubConfig();
    const schema = constructor.getConfigForm().schema;
    return {
      title: config.title,
      ranges: schema.find((field) => field.name === "default_range").selector.select.options.map((option) => option.label),
      profiles: schema.find((field) => field.name === "default_profile").selector.select.options.map((option) => option.label),
    };
  });

  expect(form).toEqual({
    title: "Report & export",
    ranges: ["24 hours", "3 days", "7 days", "14 days", "30 days", "All"],
    profiles: ["Full dossier", "Owner handover", "Internal breeding record"],
  });
});

test("configured range and profile defaults are applied on first use", async ({ page }) => {
  const card = await mountReport(page, {
    default_range: "14d",
    default_profile: "internal",
  });

  await expect(card.locator("#range")).toHaveValue("14d");
  await expect(card.locator("#profile")).toHaveValue("internal");
  await expect(card.locator('[data-pdf-section="attention"]')).toBeChecked();
  await expect(card.locator('[data-pdf-section="owner_contact"]')).not.toBeChecked();
});

test("all built-in PDF profiles select their documented sections", async ({ page }) => {
  const card = await mountReport(page);
  const profiles = {
    full: [true, true, true, true, true, true, true],
    handover: [true, true, true, true, false, true, true],
    internal: [true, true, true, true, true, true, false],
  };
  const sectionNames = [
    "summary",
    "chart",
    "measurements",
    "care",
    "attention",
    "owners",
    "owner_contact",
  ];

  for (const [profile, expected] of Object.entries(profiles)) {
    await card.locator("#profile").selectOption(profile);
    for (const [index, section] of sectionNames.entries()) {
      const checkbox = card.locator(`[data-pdf-section="${section}"]`);
      if (expected[index]) await expect(checkbox).toBeChecked();
      else await expect(checkbox).not.toBeChecked();
    }
  }
});

test("every report period maps to the expected API range", async ({ page }) => {
  const card = await mountReport(page);
  const ranges = [
    ["24h", 24],
    ["3d", 72],
    ["7d", 168],
    ["14d", 336],
    ["30d", 720],
    ["all", undefined],
  ];

  for (const [range, expectedHours] of ranges) {
    await card.locator("#range").selectOption(range);
    const downloadPromise = page.waitForEvent("download");
    await card.locator("#pdf").click();
    await downloadPromise;
    const exportCall = await page.evaluate(() =>
      window.__reportCalls.filter(
        (call) => call.type === "puppy_tracker/export" && call.format === "pdf"
      ).at(-1)
    );
    expect(exportCall.range_hours).toBe(expectedHours);
  }
});

test("legacy custom profiles keep contact details private unless explicitly enabled", async ({ page }) => {
  const legacySections = {
    summary: true,
    chart: true,
    measurements: true,
    care: true,
    attention: true,
    owners: true,
  };
  const card = await mountReport(page, {}, {
    reportProfile: "legacy",
    sectionState: legacySections,
    reportProfiles: {
      legacy: { en: "Legacy profile", nl: "Oud profiel", sections: legacySections },
    },
  });

  await expect(card.locator("#profile")).toHaveValue("legacy");
  await expect(card.locator('[data-pdf-section="owners"]')).toBeChecked();
  await expect(card.locator('[data-pdf-section="owner_contact"]')).not.toBeChecked();
});

test("PDF profiles, period and section dependencies produce the expected payload", async ({ page }) => {
  const card = await mountReport(page);

  await card.locator("#profile").selectOption("handover");
  await expect(card.locator('[data-pdf-section="attention"]')).not.toBeChecked();
  await expect(card.locator('[data-pdf-section="owners"]')).toBeChecked();
  await expect(card.locator('[data-pdf-section="owner_contact"]')).toBeChecked();

  await card.locator("#range").selectOption("3d");
  await card.locator("#puppy").selectOption("p1");
  const downloadPromise = page.waitForEvent("download");
  await card.locator("#pdf").click();
  await downloadPromise;

  const exportCall = await page.evaluate(() =>
    window.__reportCalls.find(
      (call) => call.type === "puppy_tracker/export" && call.format === "pdf"
    )
  );
  expect(exportCall).toMatchObject({
    litter_id: "l1",
    puppy_id: "p1",
    range_hours: 72,
    sections: {
      summary: true,
      chart: true,
      measurements: true,
      care: true,
      attention: false,
      owners: true,
      owner_contact: true,
    },
  });

  await card.locator('[data-pdf-section="owners"]').uncheck();
  await expect(card.locator('[data-pdf-section="owner_contact"]')).not.toBeChecked();
  await expect(card.locator('[data-pdf-section="owner_contact"]')).toBeDisabled();
  await expect(card.locator("#profile")).toHaveValue("custom");
});

test("a custom PDF profile preserves the selected sections", async ({ page }) => {
  const card = await mountReport(page);

  await card.locator('[data-pdf-section="chart"]').uncheck();
  page.once("dialog", (dialog) => dialog.accept("Compact dossier"));
  await card.locator("#save-profile").click();

  await expect(card.locator("#profile option:checked")).toHaveText("Compact dossier");
  await card.locator("#profile").selectOption("full");
  await expect(card.locator('[data-pdf-section="chart"]')).toBeChecked();
  await card.locator("#profile").selectOption({ label: "Compact dossier" });
  await expect(card.locator('[data-pdf-section="chart"]')).not.toBeChecked();
});

test("mother export exposes its history scope and only downloads JSON", async ({ page }) => {
  const card = await mountReport(page);

  await card.locator("#puppy").selectOption("__mother__");
  await expect(card.locator("#mother-export-scope")).toBeVisible();
  await expect(card.locator("#pdf")).toHaveCount(0);
  await expect(card.locator("#csv")).toHaveCount(0);
  await expect(card.locator("#range")).toHaveCount(0);
  await expect(card.locator("#profile")).toHaveCount(0);
  await expect(card.locator(".pdf-sections")).toHaveCount(0);
  await expect(card.locator(".preview")).toHaveCount(0);
  await expect(card.locator("#json")).toHaveText("Mother JSON");
  await card.locator("#mother-export-scope").selectOption("current");

  const downloadPromise = page.waitForEvent("download");
  await card.locator("#json").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("puppy-tracker-mother.json");

  const exportCall = await page.evaluate(() =>
    window.__reportCalls.find((call) => call.type === "puppy_tracker/mother/export_url")
  );
  expect(exportCall).toMatchObject({
    litter_id: "l1",
    history_scope: "current",
  });
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
    if (format !== "pdf") expect(exportCall.sections).toBeUndefined();
  });
}
