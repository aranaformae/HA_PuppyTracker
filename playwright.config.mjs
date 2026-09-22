import { defineConfig } from "@playwright/test";

const webkitBase = {
  browserName: "webkit",
  hasTouch: true,
};

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: false,
  workers: process.env.CI ? 1 : 2,
  reporter: process.env.CI
    ? [["line"], ["html", { open: "never" }]]
    : "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "python3 -m http.server 4173 --bind 127.0.0.1 --directory .",
    url: "http://127.0.0.1:4173/tests/e2e/cards.html",
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: "chromium-desktop",
      grepInvert: /@mobile/,
      use: {
        browserName: "chromium",
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      name: "webkit-iphone",
      grep: /@cross-browser|@mobile/,
      use: {
        ...webkitBase,
        viewport: { width: 393, height: 852 },
        deviceScaleFactor: 3,
        isMobile: true,
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      },
    },
    {
      name: "webkit-ipad-portrait",
      grep: /@tablet/,
      use: {
        ...webkitBase,
        viewport: { width: 820, height: 1180 },
        deviceScaleFactor: 2,
        isMobile: true,
        userAgent:
          "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      },
    },
    {
      name: "webkit-ipad-landscape",
      grep: /@tablet/,
      use: {
        ...webkitBase,
        viewport: { width: 1180, height: 820 },
        deviceScaleFactor: 2,
        isMobile: true,
        userAgent:
          "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      },
    },
  ],
});
