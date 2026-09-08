import { expect, test } from "@playwright/test";

test("mobile tab changes preserve the dashboard scroll position", async ({ page }) => {
  await page.goto("/tests/e2e/cards.html?production");
  await page.evaluate(async () => {
    await customElements.whenDefined("puppy-tracker-mobile-card");
    document.body.style.margin = "0";
    const spacer = document.createElement("div");
    spacer.style.height = "900px";
    document.body.append(spacer);

    const shell = document.createElement("div");
    shell.id = "dashboard-scroll-shell";
    shell.style.cssText = "height:500px;overflow:auto";
    const innerSpacer = document.createElement("div");
    innerSpacer.style.height = "140px";
    shell.append(innerSpacer);

    const card = document.createElement("puppy-tracker-mobile-card");
    card.setConfig({ show_weighing: true, show_quick_log: true, show_today: true });
    shell.append(card);

    const innerFooter = document.createElement("div");
    innerFooter.style.height = "900px";
    shell.append(innerFooter);
    document.body.append(shell);
    shell.scrollTop = 100;

    const footer = document.createElement("div");
    footer.style.height = "900px";
    document.body.append(footer);
    window.scrollTo(0, 760);
  });

  const before = await page.evaluate(() => ({
    page: window.scrollY,
    shell: document.getElementById("dashboard-scroll-shell").scrollTop,
  }));
  await page.locator("puppy-tracker-mobile-card [data-tab='quickLog']").click();
  await expect(page.locator("puppy-tracker-mobile-card [data-tab='quickLog']")).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(100);
  const after = await page.evaluate(() => ({
    page: window.scrollY,
    shell: document.getElementById("dashboard-scroll-shell").scrollTop,
  }));

  expect(Math.abs(after.page - before.page)).toBeLessThanOrEqual(1);
  expect(Math.abs(after.shell - before.shell)).toBeLessThanOrEqual(1);
});
