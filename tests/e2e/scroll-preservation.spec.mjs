import { expect, test } from "@playwright/test";

for (const mutation of [false, true]) {
  test(`scroll preservation does not overwrite a later user scroll, layout change=${mutation} @cross-browser @tablet`, async ({ page }) => {
    await page.goto("/tests/e2e/cards.html");
    const result = await page.evaluate(async (mutation) => {
      const { preserveScrollPosition } = await import("/custom_components/puppy_tracker/frontend/puppy-tracker-card-common.js");
      const filler = document.createElement("div");
      filler.style.height = "3000px";
      const shell = document.createElement("div");
      shell.style.cssText = "height:120px;overflow:auto";
      const content = document.createElement("div");
      content.style.height = "1000px";
      shell.append(content);
      document.body.replaceChildren(shell, filler);
      window.scrollTo(0, 300);
      shell.scrollTop = 90;
      await new Promise(requestAnimationFrame);
      const before = { page: window.scrollY, nested: shell.scrollTop };
      preserveScrollPosition(content, () => {
        if (mutation) {
          window.scrollTo(0, 0);
          shell.scrollTop = 0;
        }
      });
      const afterMutation = { page: window.scrollY, nested: shell.scrollTop };
      window.scrollTo(0, 450);
      shell.scrollTop = 150;
      await new Promise(requestAnimationFrame);
      return { before, afterMutation, afterUserScroll: { page: window.scrollY, nested: shell.scrollTop } };
    }, mutation);
    expect(result.afterMutation).toEqual(result.before);
    expect(result.afterUserScroll).toEqual({ page: 450, nested: 150 });
  });
}
