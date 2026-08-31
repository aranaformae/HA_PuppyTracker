import { expect, test } from "@playwright/test";

async function openFixture(page) {
  await page.goto("/tests/e2e/cards.html");
  await page.waitForFunction(() => window.__puppyTrackerReady === true);
}

for (const language of ["nl", "en"]) {
  test(`attention card survives async data rerender in ${language}`, async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await openFixture(page);

    await page.evaluate((selectedLanguage) => {
      const callbacks = [];
      const hass = {
        locale: { language: selectedLanguage },
        language: selectedLanguage,
        states: {},
        connection: {
          subscribeMessage: async (callback) => {
            callbacks.push(callback);
            return async () => {};
          },
        },
        callWS: async (message) => {
          if (message.type === "puppy_tracker/litters") {
            await new Promise((resolve) => setTimeout(resolve, 15));
            return {
              litters: [{ id: "l1", name: "Luna x Dutch", active: true }],
            };
          }

          if (message.type === "puppy_tracker/data") {
            await new Promise((resolve) => setTimeout(resolve, 15));
            return {
              litter: {
                id: "l1",
                name: "Luna x Dutch",
                active: true,
                summary: { dossier_actions: { actions: [] } },
              },
              puppies: [
                {
                  id: "p1",
                  name: "Alice",
                  active: true,
                  collar_color: "Red",
                  summary: {
                    needs_attention: false,
                    dossier_actions: { actions: [] },
                  },
                },
              ],
            };
          }

          throw new Error(`Unexpected WS call: ${message.type}`);
        },
      };

      window.__attentionCallbacks = callbacks;
      window.__attentionHass = hass;

      const constructor = customElements.get("puppy-tracker-attention-card");
      const card = document.createElement("puppy-tracker-attention-card");
      card.setConfig(constructor.getStubConfig());
      document.querySelector("#cards").appendChild(card);
      card.hass = hass;
    }, language);

    const card = page.locator("puppy-tracker-attention-card");
    const expected = language === "en" ? "Everything is in order" : "Alles op orde";
    await expect(card.getByText(expected, { exact: true })).toBeVisible();

    await page.evaluate(() => window.__attentionCallbacks?.[0]?.({ reason: "test-update" }));
    await expect(card.getByText(expected, { exact: true })).toBeVisible();

    const html = await card.evaluate((element) => element.shadowRoot?.innerHTML || "");
    expect(html).not.toContain("Custom element doesn't exist");
    expect(html).not.toContain("Configuratiefout");
    expect(html).not.toContain("Configuration error");
    expect(pageErrors).toEqual([]);
  });
}
