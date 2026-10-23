import { expect, test } from "@playwright/test";
import { pendingCount, release } from "./helpers/async-card.mjs";

async function mount(page, { language = "en", hold = [], cards = 1, shadow = false } = {}) {
  await page.goto("/tests/e2e/cards.html?production");
  await page.waitForFunction(() => window.__puppyTrackerReady);
  await page.evaluate(async ({ language, hold, cards, shadow }) => {
    const { saveOwner } = await import("/tests/e2e/helpers/owners.mjs");
    const clone = (value) => structuredClone(value);
    const state = window.__async = {
      owners: [
        { id: "o1", revision: "r1", name: "Alex", phone: "0612345678", notes: "Original contact note",
          placements: { l1: { placement_status: "reserved", payment_amount: "2500", payment_balance: "1000" } }, unassigned_placement: null },
        { id: "o2", revision: "r2", name: "Sam", placements: {}, unassigned_placement: { payment_amount: "777" } },
      ],
      litters: [{ id: "l1", name: "First litter", active: true }],
      puppies: [{ id: "p1", name: "Nova", collar_color: "paars", owner_ids: [] }],
      hold: new Set(hold), pending: [], calls: [], connections: [], cards: [], revision: 2,
    };
    const wait = (message, result) => state.hold.has(message.type)
      ? new Promise((resolve, reject) => state.pending.push({ message, resolve: (value = result) => resolve(value), reject }))
      : Promise.resolve(result);
    state.emit = () => state.connections.forEach((connection) => connection.updates.forEach((callback) => callback({})));
    state.makeConnection = () => {
      const connection = {
        connected: true, updates: new Set(), listeners: new Map(), unsubscribed: 0,
        addEventListener(type, callback) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(callback); },
        removeEventListener(type, callback) { this.listeners.get(type)?.delete(callback); },
        fire(type) { this.connected = type === "ready"; this.listeners.get(type)?.forEach((callback) => callback(this)); },
        async subscribeMessage(callback) {
          this.updates.add(callback);
          const unsubscribe = () => { this.updates.delete(callback); this.unsubscribed++; };
          await wait({ type: "subscription" });
          return unsubscribe;
        },
      };
      state.connections.push(connection);
      return connection;
    };
    state.makeHass = (connection = state.makeConnection(), userId = "admin", admin = true) => ({
      connection, user: { id: userId, is_admin: admin }, language, locale: { language },
      callWS: async (message) => {
        state.calls.push(clone(message));
        if (message.type === "puppy_tracker/owners/list") return wait(message, { owners: clone(state.owners) });
        if (message.type === "puppy_tracker/litters") return wait(message, { litters: clone(state.litters) });
        if (message.type === "puppy_tracker/data") return wait(message, { puppies: clone(state.puppies) });
        await wait(message);
        const owner = state.owners.find((owner) => owner.id === message.owner_id);
        const conflict = () => { throw Object.assign(new Error("Server conflict"), { code: "owner_conflict" }); };
        if (message.type === "puppy_tracker/owners/save") {
          if (message.owner_id && message.expected_revision !== owner?.revision) conflict();
          const result = saveOwner(state.owners, message);
          result.owner.revision = `r${++state.revision}`;
          Object.assign(state.owners.find((owner) => owner.id === result.owner.id), result.owner);
          state.emit();
          return clone(result);
        }
        if (message.type === "puppy_tracker/owners/delete") {
          if (message.expected_revision !== owner?.revision) conflict();
          state.owners = state.owners.filter((owner) => owner.id !== message.owner_id);
        } else if (message.type === "puppy_tracker/owners/link") {
          if (JSON.stringify(message.expected_owner_ids) !== JSON.stringify(state.puppies[0].owner_ids)) conflict();
          state.puppies[0].owner_ids = clone(message.owner_ids);
        } else throw new Error(`Unexpected command ${message.type}`);
        state.emit();
        return { ok: true };
      },
    });
    let container = document.querySelector("#cards");
    if (shadow) {
      const host = document.createElement("div");
      container.append(host);
      container = host.attachShadow({ mode: "open" });
    }
    for (let index = 0; index < cards; index++) {
      const card = document.createElement("puppy-tracker-owner-card");
      card.setConfig({});
      container.append(card);
      card.hass = state.makeHass();
      state.cards.push(card);
    }
  }, { language, hold, cards, shadow });
  const card = page.locator("puppy-tracker-owner-card").first();
  if (!hold.includes("puppy_tracker/owners/list")) await expect(card.locator('[data-edit="o1"]')).toBeVisible();
  return card;
}

async function writes(page) {
  return page.evaluate(() => window.__async.calls.filter((call) => /owners\/(save|delete|link)$/.test(call.type)));
}

async function notify(page, change = false) {
  await page.evaluate((change) => {
    if (change) { window.__async.owners[0].name = "Changed elsewhere"; window.__async.owners[0].revision = "remote"; }
    window.__async.emit();
  }, change);
}

test("two owner cards update each other without rebuilding identical content @cross-browser @tablet", async ({ page }) => {
  const card = await mount(page, { cards: 2 });
  const other = page.locator("puppy-tracker-owner-card").nth(1);
  await card.locator('[data-edit="o1"]').click();
  await card.locator('[name="name"]').fill("Saved on phone");
  await card.locator('button[type="submit"]').click();
  await expect(other.locator(".list")).toContainText("Saved on phone");
  await other.evaluate((element) => { element.testRow = element.querySelector(".owner"); });
  await notify(page);
  await expect.poll(() => other.evaluate((element) => !element._loading && !element._refreshDeferred && element._refreshTimer === null)).toBe(true);
  expect(await other.evaluate((element) => element.testRow === element.querySelector(".owner"))).toBe(true);
  await page.evaluate(() => { window.__async.puppies[0].measurements = [{ weight: 550 }]; window.__async.litters[0].summary = { weight: 550 }; });
  await notify(page);
  await expect.poll(() => other.evaluate((element) => !element._loading && !element._refreshDeferred && element._refreshTimer === null)).toBe(true);
  expect(await other.evaluate((element) => element.testRow === element.querySelector(".owner"))).toBe(true);
});

test("incoming changes leave active search and scroll alone until focus leaves @cross-browser @tablet", async ({ page }) => {
  const card = await mount(page);
  await page.evaluate(() => {
    const spacer = document.createElement("div");
    spacer.style.height = "1800px";
    document.body.prepend(spacer);
  });
  await card.locator("#owner-search").fill("Alex");
  const before = await page.evaluate(() => window.scrollY);
  await notify(page, true);
  await expect.poll(() => card.evaluate((element) => element._refreshDeferred)).toBe(true);
  await expect(card.locator("#owner-search")).toBeFocused();
  await expect(card.locator(".list")).toContainText("Alex");
  expect(await page.evaluate(() => window.scrollY)).toBe(before);
  await card.locator("#owner-search").fill("");
  await card.locator("#owner-search").evaluate((element) => element.blur());
  await expect(card.locator(".list")).toContainText("Changed elsewhere");
});

test("Home Assistant shadow-root focus also postpones background rendering @cross-browser @tablet", async ({ page }) => {
  const card = await mount(page, { shadow: true });
  await card.locator("#owner-search").fill("Alex");
  expect(await card.evaluate((element) => document.activeElement !== element.querySelector("#owner-search") && element.getRootNode().activeElement === element.querySelector("#owner-search"))).toBe(true);
  await notify(page, true);
  await expect.poll(() => card.evaluate((element) => element._refreshDeferred)).toBe(true);
  await expect(card.locator("#owner-search")).toBeFocused();
  await expect(card.locator(".list")).toContainText("Alex");
  await card.locator("#owner-search").fill("");
  await card.locator("#owner-search").evaluate((element) => element.blur());
  await expect(card.locator(".list")).toContainText("Changed elsewhere");
});

for (const language of ["nl", "en"]) {
  test(`stale edits keep input and require an explicit reload (${language}) @cross-browser @tablet`, async ({ page }) => {
    const card = await mount(page, { language });
    await card.locator('[data-edit="o1"]').click();
    await card.locator('[name="notes"]').fill("My unsaved note");
    await notify(page, true);
    await expect(card.locator('[name="notes"]')).toBeFocused();
    await card.locator('button[type="submit"]').click();
    await expect(card.locator("#owner-error")).toContainText(language === "en" ? "changed in the meantime" : "ondertussen gewijzigd");
    await expect(card.locator('[name="notes"]')).toHaveValue("My unsaved note");
    await expect(card.locator('button[type="submit"]')).toBeDisabled();
    await expect(card.locator('[data-edit="o1"]')).toBeDisabled();
    await card.locator("#reload-owner-conflict").scrollIntoViewIfNeeded();
    expect(await card.locator("ha-card").evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`owner-conflict-${language}.png`) });
    page.once("dialog", (dialog) => dialog.dismiss());
    await card.locator("#reload-owner-conflict").click();
    await expect(card.locator('[name="notes"]')).toHaveValue("My unsaved note");
    await page.evaluate(() => window.__async.hold.add("puppy_tracker/owners/list"));
    page.once("dialog", (dialog) => dialog.accept());
    await card.locator("#reload-owner-conflict").click();
    await expect(card.locator('[name="notes"]')).toBeDisabled();
    await release(page, "puppy_tracker/owners/list", { error: "Offline" });
    await expect(card.locator('[name="notes"]')).toHaveValue("My unsaved note");
    page.once("dialog", (dialog) => dialog.accept());
    await card.locator("#reload-owner-conflict").click();
    await release(page, "puppy_tracker/owners/list");
    await expect(card.locator('[name="name"]')).toHaveValue("Changed elsewhere");
    await expect(card.locator('[name="notes"]')).toHaveValue("Original contact note");
    await page.evaluate(() => window.__async.hold.clear());
    await card.locator('[name="notes"]').fill("Reviewed latest version");
    await card.locator('button[type="submit"]').click();
    await expect(card.locator(".owner-editor")).toHaveCount(0);
    expect((await writes(page)).map((message) => message.expected_revision)).toEqual(["r1", "remote"]);
  });

  test(`confirmed save survives failed refresh and retries only the read (${language}) @cross-browser @tablet`, async ({ page }) => {
    const card = await mount(page, { language });
    await card.locator('[data-edit="o1"]').click();
    await card.locator('[name="name"]').fill("Confirmed new name");
    await page.evaluate(() => window.__async.hold.add("puppy_tracker/owners/list"));
    await card.locator('button[type="submit"]').click();
    await release(page, "puppy_tracker/owners/list", { error: "Refresh offline" });
    await expect(card.locator(".owner-editor")).toHaveCount(0);
    await expect(card.locator("#owner-status")).toContainText(language === "en" ? "saved" : "opgeslagen");
    await expect(card.locator("#owner-error")).toBeEmpty();
    await expect(card.locator(".list")).toContainText("Confirmed new name");
    await expect(card.locator(".saved-refresh-warning")).toBeVisible();
    await card.locator("[data-retry-saved-refresh]").click();
    await release(page, "puppy_tracker/owners/list");
    await expect(card.locator(".saved-refresh-warning")).toHaveCount(0);
    expect(await writes(page)).toHaveLength(1);
  });
}

test("a late refresh retry cannot replace a new draft or steal focus @cross-browser @tablet", async ({ page }) => {
  const card = await mount(page);
  await card.locator('[data-edit="o1"]').click();
  await card.locator('[name="name"]').fill("Saved name");
  await page.evaluate(() => window.__async.hold.add("puppy_tracker/owners/list"));
  await card.locator('button[type="submit"]').click();
  await release(page, "puppy_tracker/owners/list", { error: "Offline" });
  await card.locator("[data-retry-saved-refresh]").click();
  await expect.poll(() => pendingCount(page, "puppy_tracker/owners/list")).toBe(1);
  await card.locator('[data-edit="o1"]').click();
  await card.locator('[name="notes"]').fill("New draft during retry");
  await release(page, "puppy_tracker/owners/list");
  await expect(card.locator('[name="notes"]')).toHaveValue("New draft during retry");
  await expect(card.locator('[name="notes"]')).toBeFocused();
  expect(await writes(page)).toHaveLength(1);
});

test("linking uses the displayed baseline and cannot overwrite another device @cross-browser @tablet", async ({ page }) => {
  const card = await mount(page);
  await card.locator('[name="linked_owner"][value="o1"]').check();
  await page.evaluate(() => { window.__async.puppies[0].owner_ids = ["o2"]; window.__async.emit(); });
  await card.locator("#link-save").click();
  await expect(card.locator("#reload-owner-conflict")).toBeVisible();
  await expect(card.locator('[name="linked_owner"][value="o1"]')).toBeChecked();
  page.once("dialog", (dialog) => dialog.accept());
  await card.locator("#reload-owner-conflict").click();
  await expect(card.locator('[name="linked_owner"][value="o2"]')).toBeChecked();
  await expect(card.locator('[name="linked_owner"][value="o1"]')).not.toBeChecked();
  expect((await writes(page))[0].expected_owner_ids).toEqual([]);
});

test("an update received during a read is not lost @cross-browser @tablet", async ({ page }) => {
  const card = await mount(page);
  await page.evaluate(() => window.__async.hold.add("puppy_tracker/owners/list"));
  await notify(page);
  await expect.poll(() => pendingCount(page, "puppy_tracker/owners/list")).toBe(1);
  await notify(page, true);
  await release(page, "puppy_tracker/owners/list");
  await expect.poll(() => pendingCount(page, "puppy_tracker/owners/list")).toBe(1);
  await release(page, "puppy_tracker/owners/list");
  await expect(card.locator(".list")).toContainText("Changed elsewhere");
});

for (const outcome of ["failed", "obsolete"]) {
  test(`a ${outcome} second-stage read cannot publish a partial snapshot @cross-browser @tablet`, async ({ page }) => {
    const card = await mount(page);
    await page.evaluate(() => window.__async.hold.add("puppy_tracker/data"));
    await notify(page, true);
    await expect.poll(() => pendingCount(page, "puppy_tracker/data")).toBe(1);
    expect(await card.evaluate((element) => element._owners[0].name)).toBe("Alex");
    if (outcome === "failed") {
      await release(page, "puppy_tracker/data", { error: "Litter data unavailable" });
      await expect(card.locator("#owner-error")).toHaveText("Litter data unavailable");
      expect(await card.evaluate((element) => element._owners[0].name)).toBe("Alex");
    } else {
      await page.evaluate(() => {
        const state = window.__async;
        state.hold.clear();
        state.owners[0].name = "Latest connection";
        state.cards[0].hass = state.makeHass();
      });
      await expect(card.locator(".list")).toContainText("Latest connection");
      await release(page, "puppy_tracker/data");
      await expect(card.locator(".list")).toContainText("Latest connection");
    }
  });
}

for (const change of ["connection", "user", "permission", "detach"]) {
  test(`late reads and subscriptions are discarded after ${change} @cross-browser @tablet`, async ({ page }) => {
    const card = await mount(page, { hold: ["puppy_tracker/owners/list", "subscription"] });
    await expect.poll(() => pendingCount(page, "puppy_tracker/owners/list")).toBe(1);
    await page.evaluate((change) => {
      const state = window.__async;
      const card = state.cards[0];
      state.owners[0].name = "Current contact";
      state.hold.clear();
      if (change === "detach") card.remove();
      else card.hass = state.makeHass(state.makeConnection(), change === "user" ? "different-admin" : "admin", change !== "permission");
    }, change);
    if (change === "detach") {
      await page.evaluate(() => document.querySelector("#cards").append(window.__async.cards[0]));
    }
    await release(page, "puppy_tracker/owners/list");
    await release(page, "subscription");
    if (change === "permission") {
      await expect(card).toContainText("administrator");
      await expect(card).not.toContainText("Alex");
      expect(await card.evaluate((element) => element._owners)).toEqual([]);
    } else await expect(card.locator(".list")).toContainText("Current contact");
    expect(await page.evaluate(() => window.__async.connections[0].unsubscribed)).toBe(1);
  });
}

test("same-connection reconnect preserves drafts and ordinary hass updates do not resubscribe @cross-browser @tablet", async ({ page }) => {
  const card = await mount(page);
  await card.locator('[data-edit="o1"]').click();
  await card.locator('[name="notes"]').fill("Draft across reconnect");
  await page.evaluate(() => {
    const card = window.__async.cards[0];
    card.hass = { ...card._hass };
    window.__async.connections[0].fire("disconnected");
    window.__async.connections[0].fire("ready");
  });
  await expect(card.locator('[name="notes"]')).toHaveValue("Draft across reconnect");
  await expect(card.locator('[name="notes"]')).toBeFocused();
  await expect(card.locator('button[type="submit"]')).toBeEnabled();
  expect(await page.evaluate(() => window.__async.connections[0].updates.size)).toBe(1);
  await page.evaluate(() => {
    const state = window.__async;
    state.connections[0].fire("disconnected");
    state.cards[0].hass = state.makeHass();
  });
  await expect(card.locator('[name="notes"]')).toBeFocused();
  await expect(card.locator('button[type="submit"]')).toBeEnabled();
  page.once("dialog", (dialog) => dialog.accept());
  await card.locator("#cancel-owner").click();
  await notify(page, true);
  await expect(card.locator(".list")).toContainText("Changed elsewhere");
  await card.evaluate((element) => element.remove());
  await expect.poll(() => page.evaluate(() => window.__async.connections.reduce((total, connection) => total + connection.updates.size, 0))).toBe(0);
  expect(await page.evaluate(() => window.__async.connections.flatMap((connection) => [...connection.listeners.values()]).reduce((count, items) => count + items.size, 0))).toBe(0);
});

test("permission change during a write cannot restore private data from its late response @cross-browser @tablet", async ({ page }) => {
  const card = await mount(page);
  await card.locator('[data-edit="o1"]').click();
  await card.locator('[name="notes"]').fill("Private draft");
  await page.evaluate(() => window.__async.hold.add("puppy_tracker/owners/save"));
  await card.locator('button[type="submit"]').click();
  await expect.poll(() => pendingCount(page, "puppy_tracker/owners/save")).toBe(1);
  await page.evaluate(() => {
    const card = window.__async.cards[0];
    card.hass = window.__async.makeHass(card._hass.connection, "viewer", false);
  });
  await release(page, "puppy_tracker/owners/save");
  await expect(card).toContainText("administrator");
  await expect(card).not.toContainText("Private draft");
  expect(await card.evaluate((element) => [element._owners, element._editingContact, element._status])).toEqual([[], null, ""]);
});

for (const operation of ["delete", "link", "move"]) {
  test(`confirmed ${operation} is reflected locally even when refreshing fails @cross-browser @tablet`, async ({ page }) => {
    const card = await mount(page);
    await page.evaluate(() => window.__async.hold.add("puppy_tracker/owners/list"));
    if (operation === "delete") {
      page.once("dialog", (dialog) => dialog.accept());
      await card.locator('[data-delete="o1"]').click();
    } else if (operation === "link") {
      await card.locator('[name="linked_owner"][value="o1"]').check();
      await card.locator("#link-save").click();
    } else {
      await card.locator("#owner-scope").selectOption("__unassigned__");
      await card.locator('[data-toggle-owner="o2"]').click();
      await card.locator('[data-assign-litter="o2"]').selectOption("l1");
      await card.locator('[data-assign-owner="o2"]').click();
    }
    await release(page, "puppy_tracker/owners/list", { error: "Offline after confirmed write" });
    await expect(card.locator(".saved-refresh-warning")).toBeVisible();
    await expect(card.locator("#owner-error")).toBeEmpty();
    if (operation === "delete") await expect(card.locator('[data-edit="o1"]')).toHaveCount(0);
    if (operation === "link") await expect(card.locator(".owner-puppies")).toContainText("Nova (paars)");
    if (operation === "move") await expect(card.locator(".list")).toContainText("Sam");
    await card.locator("[data-retry-saved-refresh]").click();
    await release(page, "puppy_tracker/owners/list");
    await expect(card.locator(".saved-refresh-warning")).toHaveCount(0);
    expect(await writes(page)).toHaveLength(1);
  });
}

test("failed writing keeps the draft and does not claim success @cross-browser @tablet", async ({ page }) => {
  const card = await mount(page);
  await card.locator('[data-edit="o1"]').click();
  await card.locator('[name="notes"]').fill("Retain after failed write");
  await page.evaluate(() => window.__async.hold.add("puppy_tracker/owners/save"));
  await card.locator('button[type="submit"]').click();
  await release(page, "puppy_tracker/owners/save", { error: "Write failed" });
  await expect(card.locator("#owner-error")).toHaveText("Write failed");
  await expect(card.locator("#owner-status")).toBeEmpty();
  await expect(card.locator(".saved-refresh-warning")).toHaveCount(0);
  await expect(card.locator('[name="notes"]')).toHaveValue("Retain after failed write");
  await page.evaluate(() => window.__async.hold.clear());
  await card.locator('button[type="submit"]').click();
  await expect(card.locator(".owner-editor")).toHaveCount(0);
});
