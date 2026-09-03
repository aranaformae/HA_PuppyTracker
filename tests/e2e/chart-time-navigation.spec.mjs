import { expect, test } from "@playwright/test";

async function openFixture(page) {
  await page.goto("/tests/e2e/cards.html");
  await page.waitForFunction(() => window.__puppyTrackerReady === true);
}

test("chart ranges behave as zoom levels without dropping older points", async ({ page }) => {
  await openFixture(page);

  const result = await page.evaluate(async () => {
    const element = document.createElement("puppy-tracker-overview-card");
    element.style.display = "block";
    element.style.width = "440px";
    document.querySelector("#cards").appendChild(element);

    const now = Date.now();
    element._historyLoading = false;
    element._historyError = "";
    element._metric = "weight";
    element._selectedPuppyId = "p1";
    element._history = {
      puppies: [
        {
          id: "p1",
          measurements: [
            { id: "old", timestamp: new Date(now - 10 * 24 * 3600 * 1000).toISOString(), weight: 310, kind: "weight" },
            { id: "recent", timestamp: new Date(now - 12 * 3600 * 1000).toISOString(), weight: 520, kind: "weight" },
          ],
        },
      ],
    };

    const row = {
      puppyId: "p1",
      name: "Pup 1",
      collar: "blauw",
      entityIds: {},
      statusCode: "ok",
    };

    const renderRange = async (hours) => {
      element._rangeHours = hours;
      element.shadowRoot.innerHTML = element._chartSvg([row]);
      element._ensureChartTimeNavigationStyles();
      element._bindChartTimeNavigation();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      element._chartScrollToNowPending = true;
      element._restoreChartViewport();
      await new Promise((resolve) => requestAnimationFrame(resolve));

      const scroll = element.shadowRoot.querySelector(".chart-scroll");
      const svg = element.shadowRoot.querySelector("svg.chart");
      return {
        points: element.shadowRoot.querySelectorAll(".chart-point").length,
        widthPercent: Number.parseFloat(svg.style.getPropertyValue("--chart-width")),
        rangeHours: Number(scroll.dataset.rangeHours),
        scrollLeft: scroll.scrollLeft,
        maxScroll: Math.max(0, scroll.scrollWidth - scroll.clientWidth),
        hasNowLine: Boolean(element.shadowRoot.querySelector(".chart-now-line")),
        nowLabel: element.shadowRoot.querySelector(".chart-now-label")?.textContent || "",
        hasBackNow: Boolean(element.shadowRoot.querySelector(".chart-back-now")),
      };
    };

    const range24 = await renderRange(24);
    const range72 = await renderRange(72);
    const range168 = await renderRange(168);

    return { range24, range72, range168 };
  });

  expect(result.range24.points).toBe(2);
  expect(result.range72.points).toBe(2);
  expect(result.range168.points).toBe(2);

  expect(result.range24.rangeHours).toBe(24);
  expect(result.range72.rangeHours).toBe(72);
  expect(result.range168.rangeHours).toBe(168);

  expect(result.range24.widthPercent).toBeGreaterThan(result.range72.widthPercent);
  expect(result.range72.widthPercent).toBeGreaterThan(result.range168.widthPercent);
  expect(result.range24.widthPercent).toBeGreaterThan(100);

  expect(result.range24.scrollLeft).toBeGreaterThan(0);
  expect(Math.abs(result.range24.scrollLeft - result.range24.maxScroll)).toBeLessThanOrEqual(2);
  expect(result.range24.hasNowLine).toBe(true);
  expect(["NU", "NOW"]).toContain(result.range24.nowLabel);
  expect(result.range24.hasBackNow).toBe(true);
});

test("growth chart renders the milestone projection window around its central estimate", async ({ page }) => {
  await openFixture(page);

  const result = await page.evaluate(() => {
    const element = document.createElement("puppy-tracker-overview-card");
    element.style.display = "block";
    element.style.width = "440px";
    element._historyLoading = false;
    element._historyError = "";
    element._metric = "weight";
    element._rangeHours = 168;
    element._selectedPuppyId = "p1";
    const now = Date.now();
    element._history = {
      puppies: [{
        id: "p1",
        summary: {
          growth_analysis: {
            growth_milestones: {
              next: {
                target_percent: 200,
                target_weight: 800,
                estimated_at: new Date(now + 2 * 24 * 3600 * 1000).toISOString(),
                estimated_range_start: new Date(now + 24 * 3600 * 1000).toISOString(),
                estimated_range_end: new Date(now + 3 * 24 * 3600 * 1000).toISOString(),
                projection_confidence_code: "medium",
              },
            },
          },
        },
        measurements: [
          { id: "old", timestamp: new Date(now - 3 * 24 * 3600 * 1000).toISOString(), weight: 500, kind: "weight" },
          { id: "recent", timestamp: new Date(now - 3600000).toISOString(), weight: 650, kind: "weight" },
        ],
      }],
    };
    const row = {
      puppyId: "p1",
      name: "Pup 1",
      collar: "blauw",
      entityIds: {},
      statusCode: "ok",
      weight: 650,
      analysis: {
        growth_milestones: {
          next: {
            target_percent: 200,
            target_weight: 800,
            estimated_at: new Date(now + 2 * 24 * 3600 * 1000).toISOString(),
            estimated_range_start: new Date(now + 24 * 3600 * 1000).toISOString(),
            estimated_range_end: new Date(now + 3 * 24 * 3600 * 1000).toISOString(),
            projection_confidence_code: "medium",
          },
        },
      },
    };
    document.querySelector("#cards").appendChild(element);
    element.shadowRoot.innerHTML = element._chartSvg([row]);
    const band = element.shadowRoot.querySelector(".milestone-projection-band");
    const line = element.shadowRoot.querySelector(".milestone-projection");
    return {
      bandClass: band?.getAttribute("class") || "",
      bandX: Number(band?.getAttribute("x")),
      bandWidth: Number(band?.getAttribute("width")),
      lineX: Number(line?.getAttribute("x1")),
      svgWidth: element.shadowRoot.querySelector("svg.chart")?.getBoundingClientRect().width || 0,
    };
  });

  expect(result.bandClass).toContain("milestone-projection-band");
  expect(result.bandWidth).toBeGreaterThan(0);
  expect(result.lineX).toBeGreaterThan(result.bandX);
  expect(result.lineX).toBeLessThan(result.bandX + result.bandWidth);
  expect(result.svgWidth).toBeGreaterThan(0);
});

test("return-to-now button restores the right edge after scrolling into history", async ({ page }) => {
  await openFixture(page);

  const result = await page.evaluate(async () => {
    const element = document.createElement("puppy-tracker-overview-card");
    element.style.display = "block";
    element.style.width = "440px";
    document.querySelector("#cards").appendChild(element);

    const now = Date.now();
    element._historyLoading = false;
    element._historyError = "";
    element._metric = "weight";
    element._rangeHours = 24;
    element._selectedPuppyId = "p1";
    element._history = {
      puppies: [
        {
          id: "p1",
          measurements: [
            { id: "old", timestamp: new Date(now - 6 * 24 * 3600 * 1000).toISOString(), weight: 300, kind: "weight" },
            { id: "recent", timestamp: new Date(now - 2 * 3600 * 1000).toISOString(), weight: 500, kind: "weight" },
          ],
        },
      ],
    };

    const row = { puppyId: "p1", name: "Pup 1", collar: "blauw", entityIds: {}, statusCode: "ok" };
    element.shadowRoot.innerHTML = element._chartSvg([row]);
    element._ensureChartTimeNavigationStyles();
    element._bindChartTimeNavigation();

    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    element._chartScrollToNowPending = true;
    element._restoreChartViewport();
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const scroll = element.shadowRoot.querySelector(".chart-scroll");
    const button = element.shadowRoot.querySelector(".chart-back-now");
    const maxScroll = Math.max(0, scroll.scrollWidth - scroll.clientWidth);
    const initialAtNow = Math.abs(scroll.scrollLeft - maxScroll) <= 2;

    scroll.scrollLeft = 0;
    scroll.dispatchEvent(new Event("scroll"));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const buttonEnabledInPast = button.disabled === false;
    const anchorInPast = Number(element._chartViewportAnchorTime) < Number(scroll.dataset.contentEnd);

    // Make the button deterministic in the browser test while preserving the
    // production smooth-scroll path.
    scroll.scrollTo = ({ left }) => {
      scroll.scrollLeft = left;
    };
    button.click();
    await new Promise((resolve) => requestAnimationFrame(resolve));

    return {
      initialAtNow,
      buttonEnabledInPast,
      anchorInPast,
      returnedAtNow: Math.abs(scroll.scrollLeft - maxScroll) <= 2,
    };
  });

  expect(result.initialAtNow).toBe(true);
  expect(result.buttonEnabledInPast).toBe(true);
  expect(result.anchorInPast).toBe(true);
  expect(result.returnedAtNow).toBe(true);
});
