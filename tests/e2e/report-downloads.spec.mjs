import { expect, test } from "@playwright/test";

test("branding and profile note are independently selected without sending hidden contact data @cross-browser @mobile @tablet", async ({ page }) => {
  const card = await mountReport(page, { breeder_name: "Test kennel", breeder_contact: "private@example.com", logo_url: "https://external.invalid/logo.png" });
  await expect(card.locator('[data-pdf-section="breeder_contact"]')).not.toBeChecked();
  await expect(card.locator('[data-pdf-section="profile_note"]')).not.toBeChecked();
  let download = page.waitForEvent("download");
  await card.locator("#pdf").click();
  await download;
  let message = await page.evaluate(() => window.__reportCalls.filter((call) => call.format === "pdf").at(-1));
  expect(message.branding).toEqual({});
  await card.locator('[data-pdf-section="breeder_contact"]').check();
  await card.locator('[data-pdf-section="profile_note"]').check();
  await card.locator('[data-pdf-section="brand_logo"]').uncheck();
  download = page.waitForEvent("download");
  await card.locator("#pdf").click();
  await download;
  message = await page.evaluate(() => window.__reportCalls.filter((call) => call.format === "pdf").at(-1));
  expect(message.branding).toEqual({});
  expect(message.sections).toMatchObject({ breeder_contact: true, profile_note: true, brand_logo: false });
  await card.locator('[data-pdf-section="identity"]').uncheck();
  await expect(card.locator('[data-pdf-section="profile_note"]')).toBeDisabled();
  await expect(card.locator('[data-pdf-section="profile_note"]')).not.toBeChecked();
});

for (const logoUrl of ["/local/test-logo.png", "/api/puppy_tracker/files/managed-logo?authSig=test"]) {
test(`local or signed managed logo ${logoUrl} is converted and skipped when excluded @cross-browser @mobile @tablet`, async ({ page }) => {
  const card = await mountReport(page, { logo_url: "/local/obsolete-card-logo.png" }, null, logoUrl);
  const png = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 160;
    canvas.height = 40;
    const context = canvas.getContext("2d");
    context.fillStyle = "green";
    context.fillRect(0, 0, 160, 40);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  let requests = 0;
  await page.route((url) => url.pathname + url.search === logoUrl, async (route) => {
    requests += 1;
    await route.fulfill({ contentType: "image/png", body: Buffer.from(png, "base64") });
  });
  let download = page.waitForEvent("download");
  await card.locator("#pdf").click();
  await download;
  const message = await page.evaluate(() => window.__reportCalls.filter((call) => call.format === "pdf").at(-1));
  expect(Buffer.from(message.branding.logo_base64, "base64").subarray(0, 2)).toEqual(Buffer.from([255, 216]));
  expect(message.branding.logo_base64.length).toBeLessThanOrEqual(682668);
  expect(requests).toBe(1);
  await card.locator('[data-pdf-section="brand_logo"]').uncheck();
  download = page.waitForEvent("download");
  await card.locator("#pdf").click();
  await download;
  expect(requests).toBe(1);
});
}

async function openFixture(page) {
  await page.goto("/tests/e2e/cards.html");
  await page.waitForFunction(() => window.__puppyTrackerReady === true);
}

async function mountReport(page, config = {}, storedState = null, logoUrl = "") {
  await openFixture(page);

  await page.evaluate(({ config, storedState, logoUrl }) => {
    window.__reportLogoUrl = logoUrl;
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

        if (message.type === "puppy_tracker/report/logo") return { logo_url: window.__reportLogoUrl };

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
              records: [{ id: "litter-note", type: "note", title: "Nestnotitie", occurred_at: now }],
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
                records: [
                  { id: "temperature-1", type: "temperature", title: "Temperature", occurred_at: now, data: { temperature_c: 38.4 } },
                  { id: "care-1", type: "note", title: "ENS", occurred_at: now, data: { care_occurrence_id: "ens:1" } },
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
  }, { config, storedState, logoUrl });

  const card = page.locator("puppy-tracker-report-card");
  await expect(card.locator("#pdf")).toBeVisible();
  await expect(card.locator("#csv")).toHaveCount(1);
  await expect(card.locator("#json")).toHaveCount(1);
  await expect(card.locator(".title")).toHaveText("Report & export");
  await expect(card.locator(".sub")).toHaveText("Create a PDF report, export data or use a document template.");
  return card;
}

test("report selection exposes one clear whole-litter scope and historical puppies", async ({ page }) => {
  const card = await mountReport(page);
  const options = card.locator("#puppy option");

  await expect(options).toHaveText([
    "Whole litter",
    "Mother · Luna",
    "Alice (Red)",
    "Bob (Blue) (inactive)",
  ]);
  await expect(card.locator("#puppy")).toHaveValue("__litter__");
  await expect(card.locator(".box").first().locator("b")).toHaveText("2");
  await expect(card.locator(".field label").nth(1)).toHaveText("Selection");
  await expect(card.locator(".report-section").first()).toContainText("PDF report");
  await expect(card.locator(".report-section").last()).toContainText("Data export and backup");
  await expect(card.locator(".report-section").first().locator("#csv, #json")).toHaveCount(0);
  await expect(card.locator(".report-section").last().locator("#pdf")).toHaveCount(0);
});

test("PDF and data export sections can be collapsed without losing selection @mobile @tablet", async ({ page }) => {
  const card = await mountReport(page);
  await expect(card.locator("#profile")).toBeVisible();
  await expect(card.locator("#pdf-language")).toBeVisible();
  await expect(card.locator("#pdf-report")).toHaveAttribute("open", "");
  await expect(card.locator("#data-export")).not.toHaveAttribute("open", "");
  await card.locator("#data-export > summary").click();
  await expect(card.locator("#csv")).toBeVisible();
  await card.locator("#puppy").selectOption("p1");
  await expect(card.locator("#data-export")).toHaveAttribute("open", "");
  await card.locator("#pdf-report > summary").click();
  await expect(card.locator("#pdf")).toBeHidden();
  await expect(card.locator("#profile")).toBeHidden();
  await expect(card.locator("#pdf-language")).toBeHidden();
  await expect(card.locator("#range")).toBeVisible();
  await card.locator("#range").selectOption("14d");
  await expect(card.locator("#pdf-report")).not.toHaveAttribute("open", "");
  await expect(card.locator("#puppy")).toHaveValue("p1");
  await expect(card.locator("#contract-documents")).not.toHaveAttribute("open", "");
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

test("individual puppy PDF includes litter notes in its default dossier scope", async ({ page }) => {
  const card = await mountReport(page);
  await card.locator("#puppy").selectOption("p1");
  await expect(card.locator(".preview-counts .box").nth(4).locator("b")).toHaveText("2");
  await card.locator(".dossier-filters summary").click();
  await expect(card.locator('[data-dossier-scope="litter"]')).toBeChecked();
  await expect(card.locator('[data-dossier-scope="puppy"]')).toBeChecked();

  const downloadPromise = page.waitForEvent("download");
  await card.locator("#pdf").click();
  await downloadPromise;
  const exportCall = await page.evaluate(() => window.__reportCalls.filter(
    (call) => call.type === "puppy_tracker/export" && call.format === "pdf"
  ).at(-1));
  expect(exportCall).toMatchObject({ puppy_id: "p1", dossier_scopes: ["litter", "puppy"] });
});

test("report card localizes its own editor options", async ({ page }) => {
  await openFixture(page);

  const form = await page.evaluate(() => {
    const constructor = customElements.get("puppy-tracker-report-card");
    const config = constructor.getStubConfig();
    const schema = constructor.getConfigForm().schema;
    if (schema.some((field) => ["breeder_name", "breeder_contact", "logo_url"].includes(field.name))) throw new Error("Breeder settings belong to integration configuration");
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
    full: [true, true, true, true, true, true, true, true, true, true],
    handover: [true, true, true, true, true, true, true, false, true, true],
    internal: [true, true, true, true, true, true, true, true, true, false],
  };
  const sectionNames = [
    "identity",
    "summary",
    "chart",
    "measurements",
    "care",
    "behavior",
    "dossier",
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
      identity: true,
      summary: true,
      chart: true,
      measurements: true,
      care: true,
      behavior: true,
      dossier: true,
      attention: false,
      owners: true,
      owner_contact: true,
    },
    language: "en",
    dossier_scopes: ["litter", "puppy"],
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

test("PDF preview and dossier filters match the export payload", async ({ page }) => {
  const card = await mountReport(page);
  await expect(card.locator(".preview-counts .box").nth(4).locator("b")).toHaveText("2");
  await card.locator(".dossier-filters summary").click();
  await card.locator("#no-dossier-types").click();
  await expect(card.locator(".preview-counts .box").nth(4).locator("b")).toHaveText("0");
  await card.locator('[data-dossier-type="temperature"]').check();
  await card.locator('[data-dossier-scope="litter"]').uncheck();
  await card.locator("#pdf-language").selectOption("nl");
  await card.locator("#puppy").selectOption("p1");
  await expect(card.locator(".preview-counts .box").nth(4).locator("b")).toHaveText("1");
  await expect(card.locator(".preview-summary")).toContainText("Alice");
  await expect(card.locator(".preview-summary")).toContainText("Dutch");

  const downloadPromise = page.waitForEvent("download");
  await card.locator("#pdf").click();
  await downloadPromise;
  const exportCall = await page.evaluate(() => window.__reportCalls.filter(
    (call) => call.type === "puppy_tracker/export" && call.format === "pdf"
  ).at(-1));
  expect(exportCall).toMatchObject({
    puppy_id: "p1", language: "nl", dossier_types: ["temperature"], dossier_scopes: ["puppy"],
  });
});

test("section switches immediately update the PDF preview", async ({ page }) => {
  const card = await mountReport(page);
  await expect(card.locator(".preview-counts .box").nth(1).locator("b")).toHaveText("2");
  await expect(card.locator(".preview-counts .box").nth(2).locator("b")).toHaveText("1");
  await card.locator('[data-pdf-section="care"]').uncheck();
  await card.locator('[data-pdf-section="measurements"]').uncheck();
  await card.locator('[data-pdf-section="chart"]').uncheck();
  await expect(card.locator(".preview-counts .box").nth(1).locator("b")).toHaveText("0");
  await expect(card.locator(".preview-counts .box").nth(2).locator("b")).toHaveText("0");
});

test("@mobile @tablet report controls stay within the card", async ({ page }) => {
  const card = await mountReport(page);
  await card.locator(".dossier-filters summary").click();
  const widths = await card.evaluate((element) => {
    const surface = element.shadowRoot.querySelector("ha-card");
    return { client: surface.clientWidth, scroll: surface.scrollWidth };
  });
  expect(widths.scroll).toBeLessThanOrEqual(widths.client + 1);
  await expect(card.locator("#pdf-language")).toBeVisible();
  await expect(card.locator(".preview-summary")).toBeVisible();
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
  await expect(card.locator("#json")).toHaveText("Mother JSON backup");
  await card.locator("#mother-export-scope").selectOption("current");
  await card.locator("#data-export > summary").click();

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
    if (format !== "pdf") await card.locator("#data-export > summary").click();

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
