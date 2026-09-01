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
