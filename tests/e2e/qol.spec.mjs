import { expect, test } from "@playwright/test";

async function openFixture(page) {
  await page.goto("/tests/e2e/cards.html");
  await page.waitForFunction(() => window.__puppyTrackerReady === true);
}

test("Today card renders as status-only without weighing-session action", async ({ page }) => {
  await openFixture(page);

  const result = await page.evaluate(() => {
    const card = document.createElement("puppy-tracker-today-card");
    card.setConfig({ title: "Vandaag", show_litter_selector: true });
    document.querySelector("#cards").appendChild(card);

    return {
      hasSessionAction: Boolean(card.shadowRoot?.querySelector("#session-action")),
      text: card.shadowRoot?.textContent || "",
    };
  });

  expect(result.hasSessionAction).toBe(false);
  expect(result.text).not.toContain("Start weegsessie");
  expect(result.text).not.toContain("Start weighing session");
});

test("overview chart uses each puppy collar color for line point and legend", async ({ page }) => {
  await openFixture(page);

  const result = await page.evaluate(() => {
    const card = document.createElement("puppy-tracker-overview-card");
    card._puppyRows = () => [
      { puppyId: "blue", collar: "Blauw" },
      { puppyId: "pink", collar: "Roze" },
    ];

    card.shadowRoot.innerHTML = `
      <svg>
        <polyline id="blue-line" class="chart-line" style="--series-index:0"></polyline>
        <circle id="blue-point" class="chart-point" style="--series-index:0"></circle>
        <polyline id="pink-line" class="chart-line" style="--series-index:1"></polyline>
      </svg>
      <span id="pink-legend" class="legend-color" style="--series-index:1"></span>
    `;

    card._applyCollarChartColors();

    const color = (selector) => card.shadowRoot
      .querySelector(selector)
      ?.style.getPropertyValue("--series-color");

    return {
      blueLine: color("#blue-line"),
      bluePoint: color("#blue-point"),
      pinkLine: color("#pink-line"),
      pinkLegend: color("#pink-legend"),
      hasOverrideStyle: Boolean(
        card.shadowRoot.querySelector("#puppy-tracker-collar-chart-colors")
      ),
    };
  });

  expect(result.blueLine).toBe("#1e88e5");
  expect(result.bluePoint).toBe("#1e88e5");
  expect(result.pinkLine).toBe("#ec407a");
  expect(result.pinkLegend).toBe("#ec407a");
  expect(result.hasOverrideStyle).toBe(true);
});

test("Attention keeps unacknowledged alerts visible and acknowledged alerts collapsed", async ({ page }) => {
  await openFixture(page);

  const result = await page.evaluate(async () => {
    const calls = [];
    const card = document.createElement("puppy-tracker-attention-card");
    card._hass = {
      language: "en",
      locale: { language: "en" },
      callWS: async (payload) => {
        calls.push(payload);
        return {};
      },
    };
    card._selectedLitterId = "litter-1";
    card._data = {
      litter: { id: "litter-1", name: "Litter", summary: { dossier_actions: { actions: [] } } },
      puppies: [{
        id: "pup-1",
        name: "Blue",
        active: true,
        summary: {
          needs_attention: false,
          dossier_actions: {
            actions: [
              {
                id: "record-vax:next_due_date",
                due_soon: true,
                record_type: "vaccination",
                due_date: "2026-09-01",
                status: "due_today",
                days_until_due: 0,
              },
              {
                id: "record-worm:next_due_date",
                due_soon: true,
                record_type: "deworming",
                due_date: "2026-09-01",
                status: "due_today",
                days_until_due: 0,
              },
            ],
          },
        },
      }],
    };
    card.__attentionAcknowledgements = {
      "dossier:record-vax:next_due_date": { acknowledged_at: "2026-09-01T12:00:00Z" },
    };
    card.setConfig({ title: "Attention", show_litter_selector: false });
    card._render();
    document.querySelector("#cards").appendChild(card);

    const initial = {
      openRows: card.shadowRoot.querySelectorAll(".list > .row:not([hidden])").length,
      acknowledgedRows: card.shadowRoot.querySelectorAll(".attention-ack-list > .row").length,
      detailsOpen: card.shadowRoot.querySelector(".attention-acknowledged")?.open || false,
      summary: card.shadowRoot.querySelector(".attention-acknowledged summary")?.textContent || "",
      filters: Array.from(card.shadowRoot.querySelectorAll("[data-attention-filter-type]"))
        .map((item) => item.textContent),
    };

    card.shadowRoot.querySelector('[data-attention-filter-type="deworming"]')?.click();
    const filtered = {
      openRows: card.shadowRoot.querySelectorAll(".list > .row:not([hidden])").length,
      acknowledgedRows: card.shadowRoot.querySelectorAll(".attention-ack-list > .row").length,
      vaccinationActive: card.shadowRoot.querySelector('[data-attention-filter-type="vaccination"]')?.classList.contains("active") || false,
      dewormingActive: card.shadowRoot.querySelector('[data-attention-filter-type="deworming"]')?.classList.contains("active") || false,
    };

    const undo = card.shadowRoot.querySelector(".attention-ack-list .attention-ack-button");
    undo?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    return {
      initial,
      filtered,
      afterUndoOpenRows: card.shadowRoot.querySelectorAll(".list > .row:not([hidden])").length,
      afterUndoAcknowledged: card.shadowRoot.querySelectorAll(".attention-ack-list > .row").length,
      call: calls.find((item) => item.type === "puppy_tracker/attention_acknowledgement/set"),
    };
  });

  expect(result.initial.openRows).toBe(1);
  expect(result.initial.acknowledgedRows).toBe(1);
  expect(result.initial.detailsOpen).toBe(false);
  expect(result.initial.summary).toContain("Acknowledged (1)");
  expect(result.initial.filters).toContain("Vaccination");
  expect(result.initial.filters).toContain("Deworming");
  expect(result.filtered.openRows).toBe(0);
  expect(result.filtered.acknowledgedRows).toBe(1);
  expect(result.filtered.vaccinationActive).toBe(true);
  expect(result.filtered.dewormingActive).toBe(false);
  expect(result.afterUndoOpenRows).toBe(1);
  expect(result.afterUndoAcknowledged).toBe(0);
  expect(result.call).toMatchObject({
    litter_id: "litter-1",
    attention_id: "dossier:record-vax:next_due_date",
    acknowledged: false,
  });
});
