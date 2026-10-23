import { createServer } from "node:http";
import { once } from "node:events";
import { webkit } from "@playwright/test";

const server = createServer((_request, response) => {
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  response.end("<!doctype html><title>Lifecycle check</title><h1>Ready</h1>");
});
server.listen(0, "127.0.0.1");
await once(server, "listening");

let browser;
try {
  browser = await webkit.launch();
  const url = `http://127.0.0.1:${server.address().port}/`;
  for (let index = 1; index <= 96; index += 1) {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 5_000 });
      if (await page.locator("h1").textContent() !== "Ready") {
        throw new Error(`Unexpected document in context ${index}`);
      }
      if (index % 16 === 0) console.log(`WebKit: ${index}/96 fresh contexts loaded`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
