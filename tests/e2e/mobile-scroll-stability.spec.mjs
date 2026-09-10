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
    card.setConfig({ show_weighing: true, show_quick_log: true, show_today: true, show_care_today: true });
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
  await page.locator("puppy-tracker-mobile-card [data-tab='care']").click();
  await expect(page.locator("puppy-tracker-mobile-card [data-tab='care']")).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(100);
  const after = await page.evaluate(() => ({
    page: window.scrollY,
    shell: document.getElementById("dashboard-scroll-shell").scrollTop,
  }));

  expect(Math.abs(after.page - before.page)).toBeLessThanOrEqual(1);
  expect(Math.abs(after.shell - before.shell)).toBeLessThanOrEqual(1);
});

test("weighing state updates wait until nested dashboard scrolling stops", async ({ page }) => {
  await page.goto("/tests/e2e/cards.html?production");
  const result = await page.evaluate(async () => {
    await customElements.whenDefined("puppy-tracker-card");

    const shell = document.createElement("div");
    shell.style.cssText = "height:180px;overflow:auto";
    const spacer = document.createElement("div");
    spacer.style.height = "300px";
    shell.append(spacer);

    const card = document.createElement("puppy-tracker-card");
    card._registryLoaded = true;
    card._station = () => ({ ids: {} });
    card._currentStateSignature = () => card._hass?.states?.test?.state || "";
    let renders = 0;
    card._render = () => { renders += 1; };
    shell.append(card);

    const footer = document.createElement("div");
    footer.style.height = "300px";
    shell.append(footer);
    document.body.append(shell);
    shell.scrollTop = 120;
    shell.dispatchEvent(new Event("scroll"));

    card.hass = { states: { test: { state: "one" } } };
    await new Promise((resolve) => setTimeout(resolve, 80));
    const during = { renders, scrollTop: shell.scrollTop };

    await new Promise((resolve) => setTimeout(resolve, 360));
    const after = { renders, scrollTop: shell.scrollTop };
    shell.remove();
    return { during, after };
  });

  expect(result.during.renders).toBe(0);
  expect(result.during.scrollTop).toBe(120);
  expect(result.after.renders).toBe(1);
  expect(result.after.scrollTop).toBe(120);
});
