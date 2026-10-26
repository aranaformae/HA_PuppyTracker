import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { mountAsyncCard } from "./helpers/async-card.mjs";

const previewContent = readFileSync(new URL("./fixtures/document-preview.pdf", import.meta.url)).toString("base64");

async function mountDocuments(page, language = "nl", openManagement = true) {
  const report = await mountAsyncCard(page, "report", { language });
  await report.evaluate((el, examplePdf) => {
    const original = el._hass.callWS;
    const template = { format: "puppy_tracker_document_template", version: 1, name: "Voorbeeldcontract", language: "nl", logo: false, watermark: false, initials: true, optional_fields: [], blocks: [{ type: "text", text: "{{ pup.naam }}", fields: [], bold: false }] };
    const model = {
      fields: { "pup.naam": { nl: "Roepnaam pup", en: "Puppy call name" }, "contract.plaats": { nl: "Plaats ondertekening", en: "Signing location" } },
      templates: [{ id: "handover-example-nl", template, builtin: true, revision: "original" }],
      litters: [{ id: "a", name: "Luna 2026", puppies: [{ id: "a1", name: "Nova", collar_color: "paars", owner_ids: ["o1", "o2"] }, { id: "a2", name: "Groen", collar_color: "groen", owner_ids: ["o3"] }] }],
      owners: [{ id: "o1", name: "Alex" }, { id: "o2", name: "Sam" }, { id: "o3", name: "Robin" }], documents: [],
    };
    window.__docs = { calls: [], failSave: false, holdPreview: false, badTemplatePreview: false, model };
    const state = window.__docs;
    el.hass = { ...el._hass, user: { id: "documents-admin", is_admin: true }, callWS: async message => {
      if (!message.type.startsWith("puppy_tracker/documents/")) return original(message);
      state.calls.push(structuredClone(message));
      const download = { filename: "contract.pdf", mime_type: "application/pdf", encoding: "base64", content: btoa("%PDF-1.4\n%%EOF") };
      switch (message.type.split("documents/")[1]) {
        case "list": return structuredClone(state.model);
        case "template/preview": return state.badTemplatePreview ? download : { ...download, content: examplePdf };
        case "preview": {
          const result = { fingerprint: "checked", missing: message.details.place ? [] : ["contract.plaats"], download };
          if (state.holdPreview) return new Promise(resolve => { state.releasePreview = () => resolve(result); });
          return result;
        }
        case "save": return { document: { id: message.request_id, name: "Voorbeeldcontract", puppy_name: "Nova", created_at: "2026-10-24T10:00:00Z" }, download };
        case "template/save":
          if (state.failSave) throw Error("document_conflict");
          return { id: message.template_id, revision: "saved", template: message.template };
        case "download": return download;
        case "delete": case "template/delete": return { ok: true };
        default: throw Error(`Unexpected document request ${message.type}`);
      }
    } };
  }, previewContent);
  expect(await page.evaluate(() => window.__docs.calls)).toHaveLength(0);
  await report.locator("#contract-documents > summary").click();
  const panel = report.locator("puppy-tracker-documents");
  await expect(panel.locator("#document-buyer, #template-name")).toBeVisible();
  if (openManagement && await panel.locator("#template-management > summary").count()) await panel.locator("#template-management > summary").click();
  return { report, panel };
}

test("Document creation stays in front while template actions are separate and collapsed @cross-browser @tablet", async ({ page }) => {
  const { panel } = await mountDocuments(page, "nl", false);
  await expect(panel.locator("#create-document-heading")).toHaveText("Document maken");
  await expect(panel.locator("#document-template")).toBeVisible();
  await expect(panel.locator("#preview-document")).toBeVisible();
  await expect(panel.locator("#template-management")).not.toHaveAttribute("open", "");
  await expect(panel.locator("#new-template")).toBeHidden();
  await panel.locator("#document-buyer").selectOption("o1");
  await expect(panel.locator("#template-management")).not.toHaveAttribute("open", "");
  await panel.locator("#template-management > summary").click();
  await expect(panel.locator("#new-template")).toBeVisible();
  await panel.locator("#document-template").selectOption("handover-example-nl");
  await expect(panel.locator("#template-management")).toHaveAttribute("open", "");
});

test("Payment receipt requires an active receipt and clears it when the buyer changes @cross-browser", async ({ page }) => {
  const { panel } = await mountDocuments(page);
  await page.evaluate(() => {
    const model = window.__docs.model;
    model.templates.push({ id: "payment-receipt-nl", builtin: true, revision: "receipt", template: {
      format: "puppy_tracker_document_template", version: 1, name: "Betalingsbewijs", language: "nl", logo: false,
      blocks: [{ type: "data", text: "", fields: ["ontvangst.bedrag"] }], optional_fields: [],
    } });
    model.owners[0].payments = { a: [{ id: "p1", date: "2026-10-26", amount: "125.50", kind: "deposit", reference: "TRX" }] };
    model.owners[1].payments = { a: [{ id: "p2", date: "2026-10-25", amount: "20.00", kind: "other", reference: "" }] };
  });
  await panel.locator("#refresh-documents").click();
  await panel.locator("#document-template").selectOption("payment-receipt-nl");
  await panel.locator("#document-buyer").selectOption("o1");
  await expect(panel.locator("#preview-document")).toBeDisabled();
  await expect(panel.locator("#document-payment option")).toHaveCount(2);
  await panel.locator("#document-payment").selectOption("p1");
  await expect(panel.locator("#preview-document")).toBeEnabled();
  await panel.locator("#document-buyer").selectOption("o2");
  await expect(panel.locator("#document-payment")).toHaveValue("");
  await expect(panel.locator("#document-payment option[value='p1']")).toHaveCount(0);
  await expect(panel.locator("#preview-document")).toBeDisabled();
});

for (const language of ["nl", "en"]) {
  test(`Contract preview, missing fields, save and archive (${language}) @cross-browser @tablet`, async ({ page }) => {
    const { panel } = await mountDocuments(page, language);
    await expect(panel.locator("#document-puppy option").filter({ hasText: "Nova (paars)" })).toHaveCount(1);
    await expect(panel.locator("#preview-document")).toBeDisabled();
    await panel.locator("#document-buyer").selectOption("o1");
    let download = page.waitForEvent("download");
    await panel.locator("#preview-document").click(); await download;
    await expect(panel.locator("#document-checks")).toContainText(language === "nl" ? "Nog invullen" : "Still missing");
    await expect(panel.locator("#save-document")).toBeDisabled();
    await panel.locator("#document-place").fill("Teststad");
    download = page.waitForEvent("download");
    await panel.locator("#preview-document").click(); await download;
    await expect(panel.locator("#save-document")).toBeEnabled();
    await panel.screenshot({ path: test.info().outputPath("document-preview.png") });
    download = page.waitForEvent("download");
    await panel.locator("#save-document").click(); await download;
    await expect(panel.locator(".archive article")).toContainText("Nova");
    const saved = await page.evaluate(() => window.__docs.calls.find(c => c.type.endsWith("documents/save")));
    expect(saved).toMatchObject({ expected_fingerprint: "checked", puppy_id: "a1", owner_ids: ["o1"], details: { place: "Teststad" } });
    page.once("dialog", dialog => dialog.accept());
    await panel.locator("[data-delete]").click();
    await expect(panel.locator(".archive article")).toHaveCount(0);
  });
}

test("Template draft and focus survive dashboard refresh; failed save keeps changes @cross-browser @tablet", async ({ page }) => {
  const { report, panel } = await mountDocuments(page);
  await panel.locator("#edit-template").click(); await panel.locator("#editor-mode").selectOption("advanced");
  await panel.locator(".block > summary").click();
  const input = panel.locator("[data-block-text='0']");
  await input.fill("Aangepaste tekst");
  await report.evaluate(el => { el.hass = { ...el._hass }; el._render(); });
  await expect(input).toBeFocused();
  await expect(input).toHaveValue("Aangepaste tekst");
  await input.pressSequentially(" met aanvulling");
  await panel.screenshot({ path: test.info().outputPath("document-editor.png") });
  await page.evaluate(() => { window.__docs.failSave = true; });
  await panel.locator("#save-template").click();
  await expect(panel.locator("#document-error")).toContainText("gewijzigd");
  await expect(input).toHaveValue("Aangepaste tekst met aanvulling");
  await page.evaluate(() => { window.__docs.failSave = false; });
  await panel.locator("#save-template").click();
  await expect(panel.locator("#document-status")).toHaveText("Sjabloon opgeslagen.");
  const calls = await page.evaluate(() => window.__docs.calls.filter(c => c.type.endsWith("template/save")));
  expect(calls[0].template_id).toBe(calls[1].template_id);
  expect(calls[1].template.blocks[0].text).toBe("Aangepaste tekst met aanvulling");
  const download = page.waitForEvent("download");
  await panel.locator("#export-template").click();
  expect((await download).suggestedFilename()).toBe("puppy-tracker-document-template.json");
  page.once("dialog", dialog => dialog.accept());
  await panel.locator("#delete-template").click();
  await expect(panel.locator("#document-status")).toHaveText("Sjabloon verwijderd.");
});

test("Simple template editor uses readable fields and inserts sections in place @cross-browser @tablet", async ({ page }) => {
  const { panel } = await mountDocuments(page);
  await panel.locator("#edit-template").click();
  await expect(panel.locator("#editor-mode")).toHaveValue("simple");
  await expect(panel.locator("[data-block='0'] > summary")).not.toContainText("{{");
  await panel.locator("[data-block='0'] > summary").click();
  await expect(panel.locator("[data-simple-text='0']")).toHaveValue("⟦Roepnaam pup⟧");
  await panel.locator("[data-simple-text='0']").fill("Pup: ");
  await panel.locator("[data-field-search='0']").fill("roepnaam");
  await expect(panel.locator("[data-insert='0'] option")).toHaveCount(2);
  await panel.locator("[data-insert='0']").selectOption("pup.naam");
  await expect(panel.locator("[data-simple-text='0']")).toHaveValue("Pup: ⟦Roepnaam pup⟧");
  await expect(panel.locator("[data-used-fields='0'] .field-chip")).toHaveText("Roepnaam pup");
  expect(await panel.evaluate(el => el._editor.template.blocks[0].text)).toBe("Pup: {{ pup.naam }}");
  await panel.locator("#editor-mode").selectOption("advanced");
  await expect(panel.locator("[data-block-text='0']")).toHaveValue("Pup: {{ pup.naam }}");
  await panel.locator("#editor-mode").selectOption("simple");
  await expect(panel.locator("[data-simple-text='0']")).toHaveValue("Pup: ⟦Roepnaam pup⟧");
  await panel.locator(".insert-menu").first().locator("summary").click();
  await panel.locator("[data-add-after='-1'][data-add-kind='heading']").click();
  await expect(panel.locator("[data-simple-text='0']")).toBeVisible();
  await panel.locator("[data-simple-text='0']").fill("Pupgegevens");
  await panel.locator(".insert-menu").nth(1).locator("summary").click();
  await panel.locator("[data-add-after='0'][data-add-kind='data']").click();
  await expect(panel.locator("[data-block]")).toHaveCount(3);
  await panel.locator("[data-simple-text='1']").fill("Identiteit");
  await panel.locator("[data-field-search='1']").last().fill("roepnaam");
  await panel.locator("[data-add-field='1']").selectOption("pup.naam");
  await panel.screenshot({ path: test.info().outputPath("simple-document-editor.png") });
  await panel.locator("#save-template").click();
  const saved = await page.evaluate(() => window.__docs.calls.find(c => c.type.endsWith("template/save")).template);
  expect(saved.blocks.map(block => block.type)).toEqual(["heading", "data", "text"]);
  expect(saved.blocks[1].fields).toEqual(["pup.naam"]);
  expect(saved.blocks[2].text).toBe("Pup: {{ pup.naam }}");
});

test("Simple editor keeps mode, text and fields across draft recovery @cross-browser @tablet", async ({ page }) => {
  let { panel } = await mountDocuments(page);
  await panel.locator("#new-template").click();
  await expect(panel.locator("#editor-mode")).toHaveValue("simple");
  await panel.locator("#template-name").fill("Puppy letter");
  await panel.locator("[data-block='0'] > summary").click();
  await panel.locator("[data-simple-text='0']").fill("Hello ");
  await panel.locator("[data-field-search='0']").fill("roepnaam");
  await panel.locator("[data-insert='0']").selectOption("pup.naam");
  await expect(panel.locator("#draft-status")).toContainText("Concept lokaal bewaard");
  ({ panel } = await mountDocuments(page));
  await expect(panel.locator("#editor-mode")).toHaveValue("simple");
  await expect(panel.locator("[data-simple-text='0']")).toHaveValue("Hello ⟦Roepnaam pup⟧");
  await expect(panel.locator("[data-used-fields='0'] .field-chip")).toHaveText("Roepnaam pup");
  expect(await panel.evaluate(el => el._editor.template.blocks[0].text)).toBe("Hello {{ pup.naam }}");
});

test("Simple field insertion keeps caret position and multiline text @cross-browser @tablet", async ({ page }) => {
  const { panel } = await mountDocuments(page);
  await panel.locator("#new-template").click();
  await panel.locator("#template-name").fill("Care letter");
  await panel.locator("[data-block='0'] > summary").click();
  await panel.locator("[data-simple-text='0']").fill("Hello puppy\nGoodbye");
  await panel.locator("[data-simple-text='0']").evaluate(area => { area.focus(); area.setSelectionRange(6, 6); });
  await panel.locator("[data-field-search='0']").fill("roepnaam");
  await panel.locator("[data-insert='0']").selectOption("pup.naam");
  expect(await panel.evaluate(el => el._editor.template.blocks[0].text)).toBe("Hello {{ pup.naam }}puppy\nGoodbye");
  await panel.locator("#editor-mode").selectOption("advanced");
  await expect(panel.locator("[data-block-text='0']")).toHaveValue("Hello {{ pup.naam }}puppy\nGoodbye");
  await panel.locator("#editor-mode").selectOption("simple");
  await panel.locator("[data-simple-text='0']").fill("⟦Unknown field⟧");
  await panel.locator("#save-template").click();
  await expect(panel.locator("#template-errors")).toContainText("onbekend of ongeldig invulveld");
  expect(await page.evaluate(() => window.__docs.calls.some(c => c.type.endsWith("template/save")))).toBe(false);
});

test("Template block identities, deletion recovery and explicit field order @cross-browser @tablet", async ({ page }) => {
  const { panel } = await mountDocuments(page);
  await panel.locator("#template-file").setInputFiles({ name: "template.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({
    format: "puppy_tracker_document_template", version: 1, name: "Ordered", language: "nl",
    blocks: [{ type: "text", text: "First" }, { type: "text", text: "Second" }, { type: "data", fields: ["contract.plaats", "pup.naam"] }],
  })) });
  await panel.locator("[data-block='0'] > summary").click();
  await panel.locator("[data-move='0'][data-direction='1']").click();
  await expect(panel.locator("[data-block-text='1']")).toBeVisible();
  await panel.locator("[data-block-text='1']").fill("First moved");
  await panel.locator("[data-remove='1']").click();
  await panel.locator("[data-block='0'] > summary").click();
  await panel.locator("[data-block-text='0']").fill("Second edited after deletion");
  await panel.locator("#restore-block").click();
  await expect(panel.locator("[data-block-text='1']")).toHaveValue("First moved");
  await panel.locator("[data-duplicate='1']").click();
  await panel.locator("[data-block-text='2']").fill("Independent copy");
  await panel.locator("[data-block='3'] > summary").click();
  await expect(panel.locator(".selected-fields li span")).toHaveText(["Plaats ondertekening", "Roepnaam pup"]);
  await panel.locator("[data-field-up='1']").click();
  await expect(panel.locator(".selected-fields li span")).toHaveText(["Roepnaam pup", "Plaats ondertekening"]);
  await panel.locator("#save-template").click();
  const saved = await page.evaluate(() => window.__docs.calls.find(c => c.type.endsWith("template/save")).template);
  expect(saved.blocks.map(b => b.text)).toEqual(["Second edited after deletion", "First moved", "Independent copy", ""]);
  expect(saved.blocks[3].fields).toEqual(["pup.naam", "contract.plaats"]);
  expect(JSON.stringify(saved)).not.toMatch(/nextKey|data-key|removed/);
});

test("Editor validates locally, updates optional fields without losing focus and previews unsaved layout @cross-browser @tablet", async ({ page }) => {
  const { panel } = await mountDocuments(page);
  await panel.locator("#edit-template").click(); await panel.locator("#editor-mode").selectOption("advanced");
  await panel.locator("[data-block='0'] > summary").click();
  const input = panel.locator("[data-block-text='0']");
  await input.fill("{{ pup.unknown }}");
  await panel.locator("#save-template").click();
  await expect(panel.locator("#template-errors button")).toHaveCount(1);
  expect(await page.evaluate(() => window.__docs.calls.some(c => c.type.endsWith("template/save")))).toBe(false);
  await input.fill("{{ contract.plaats }}");
  await expect(input).toBeFocused();
  await expect(panel.locator("#template-errors button")).toHaveCount(0);
  await panel.locator("#optional-fields > summary").click();
  await expect(panel.locator("[data-optional]")).toHaveCount(1);
  await panel.locator("[data-optional='contract.plaats']").check();
  await panel.locator("#preview-template").click();
  await expect(panel.locator("[data-preview-page]")).toHaveText("1 / 2");
  await expect.poll(() => panel.locator("#inline-preview canvas").evaluate(canvas => canvas.width)).toBeGreaterThan(0);
  await expect.poll(() => panel.locator("#inline-preview canvas").evaluate(canvas => {
    const pixels = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    for (let index = 0; index < pixels.length; index += 16) if (pixels[index + 3] > 0 && pixels[index] < 100) return true;
    return false;
  })).toBe(true);
  const initialWidth = await panel.locator("#inline-preview canvas").evaluate(canvas => parseFloat(canvas.style.width));
  await panel.locator("[data-preview-zoom-in]").click();
  await expect(panel.locator("[data-preview-zoom]")).toHaveText("150%");
  await expect.poll(() => panel.locator("#inline-preview canvas").evaluate(canvas => parseFloat(canvas.style.width))).toBeGreaterThan(initialWidth * 1.4);
  await panel.locator("[data-preview-zoom-out]").click();
  await expect(panel.locator("[data-preview-zoom]")).toHaveText("100%");
  await panel.screenshot({ path: test.info().outputPath("inline-document-preview.png") });
  await panel.locator("[data-preview-next]").click();
  await expect(panel.locator("[data-preview-page]")).toHaveText("2 / 2");
  const pdf = page.waitForEvent("download");
  await panel.locator("[data-preview-download]").click();
  expect((await pdf).suggestedFilename()).toBe("contract.pdf");
  await expect(input).toHaveValue("{{ contract.plaats }}");
  const calls = await page.evaluate(() => window.__docs.calls);
  expect(calls.filter(c => c.type.endsWith("template/preview"))[0].template.optional_fields).toEqual(["contract.plaats"]);
  expect(calls.some(c => c.type.endsWith("/save"))).toBe(false);
  await panel.locator("[data-preview-close]").click();
  await input.fill("{{ unfinished");
  expect(await panel.evaluate(el => el._inlinePreview.hasResult)).toBe(false);
  const draft = page.waitForEvent("download");
  await panel.locator("#download-draft").click();
  const downloaded = await draft;
  expect(downloaded.suggestedFilename()).toBe("puppy-tracker-template-draft.json");
  const chunks = []; for await (const chunk of await downloaded.createReadStream()) chunks.push(chunk);
  expect(JSON.parse(Buffer.concat(chunks).toString()).blocks[0].text).toBe("{{ unfinished");
  await panel.screenshot({ path: test.info().outputPath("template-editor-tools.png") });
});

test("Inline PDF preview keeps a download fallback when rendering fails @cross-browser @tablet", async ({ page }) => {
  const { panel } = await mountDocuments(page);
  await page.evaluate(() => { window.__docs.badTemplatePreview = true; });
  await panel.locator("#edit-template").click();
  await panel.locator("#preview-template").click();
  await expect(panel.locator("[data-preview-status]")).toContainText("kan hier niet worden getoond");
  const download = page.waitForEvent("download");
  await panel.locator("[data-preview-download]").click();
  expect((await download).suggestedFilename()).toBe("contract.pdf");
  await panel.locator("[data-preview-close]").click();
  await expect(panel.locator("#preview-panel")).toBeHidden();
  await panel.locator("#template-name").fill("Still editable");
  await expect(panel.locator("#template-name")).toHaveValue("Still editable");
});

test("Long template navigation scrolls inside the block list @cross-browser @tablet", async ({ page }) => {
  const { panel } = await mountDocuments(page);
  await panel.locator("#template-file").setInputFiles({ name: "long.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({
    format: "puppy_tracker_document_template", version: 1, name: "Long example", language: "nl",
    blocks: Array.from({ length: 100 }, (_, i) => ({ type: "text", text: `Example paragraph ${i + 1}` })),
  })) });
  await panel.locator("#jump-block").scrollIntoViewIfNeeded();
  const before = await page.evaluate(() => scrollY);
  const key = await panel.locator("#jump-block option[data-index='95']").getAttribute("value");
  await panel.locator("#jump-block").selectOption(key);
  await expect(panel.locator("[data-block-text='95']")).toBeFocused();
  await expect.poll(() => panel.locator(".blocks").evaluate(el => el.scrollTop)).toBeGreaterThan(1000);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeCloseTo(before, 0);
  await panel.locator("[data-block-text='95']").fill("Edited late paragraph");
  await expect(panel.locator("[data-block-text='0']")).toHaveValue("Example paragraph 1");
});

test("Changing puppy clears foreign buyers and checked previews @cross-browser", async ({ page }) => {
  const { panel } = await mountDocuments(page);
  await panel.locator("#document-buyer").selectOption("o1");
  await panel.locator("#document-others").selectOption("o2");
  await panel.locator("#document-place").fill("Teststad");
  const download = page.waitForEvent("download");
  await panel.locator("#preview-document").click(); await download;
  await expect(panel.locator("#save-document")).toBeEnabled();
  await panel.locator("#document-puppy").selectOption("a2");
  await expect(panel.locator("#document-buyer")).toHaveValue("");
  await expect(panel.locator("#document-others option")).toHaveCount(1);
  await expect(panel.locator("#save-document")).toBeDisabled();
});

test("Import safe template JSON and retain unsaved draft on cancelled discard", async ({ page }) => {
  const { panel } = await mountDocuments(page);
  await panel.locator("#template-file").setInputFiles({ name: "template.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ format: "puppy_tracker_document_template", version: 1, name: "Imported", language: "en", blocks: [{ type: "text", text: "<img src=x onerror=alert(1)>" }, { type: "page_break" }] })) });
  await expect(panel.locator("#template-name")).toHaveValue("Imported");
  await expect(panel.locator("[data-template-flag='logo']")).toBeChecked();
  expect(await panel.locator(".blocks img").count()).toBe(0);
  page.once("dialog", dialog => dialog.dismiss());
  await panel.locator("#cancel-template").click();
  await expect(panel.locator("#template-name")).toHaveValue("Imported");
});

test("Document import, block editing and archive IDs work without secure-context UUID API @cross-browser @tablet", async ({ page }) => {
  const { panel } = await mountDocuments(page);
  await page.evaluate(() => { Object.defineProperty(window.crypto, "randomUUID", { value: undefined, configurable: true }); });
  await panel.locator("#template-file").setInputFiles({ name: "synthetic.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({
    format: "puppy_tracker_document_template", version: 1, name: "Local HTTP template", language: "nl",
    blocks: Array.from({ length: 100 }, (_, i) => ({ type: "text", text: `Example ${i + 1}` })),
  })) });
  await expect(panel.locator("#template-name")).toHaveValue("Local HTTP template");
  await panel.locator("[data-block='0'] > summary").click();
  await panel.locator("[data-duplicate='0']").click();
  expect(await panel.evaluate(el => new Set(el._templateEditor.keys).size)).toBe(101);
  await panel.locator("#save-template").click();
  await panel.locator("#document-buyer").selectOption("o1");
  await panel.locator("#document-place").fill("Teststad");
  const preview = page.waitForEvent("download");
  await panel.locator("#preview-document").click(); await preview;
  await expect(panel.locator("#save-document")).toBeEnabled();
  const saved = page.waitForEvent("download");
  await panel.locator("#save-document").click(); await saved;
  const ids = await page.evaluate(() => window.__docs.calls.flatMap(c => c.type.endsWith("template/save") ? [c.template_id] : c.request_id ? [c.request_id] : []));
  expect(ids).toHaveLength(2);
  for (const id of ids) expect(id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  expect(new Set(ids).size).toBe(2);
});

test("Import distinguishes file reading, JSON syntax and editor failures @cross-browser", async ({ page }) => {
  const { panel } = await mountDocuments(page);
  await panel.evaluate(el => el._import({ size: 20, text: async () => { throw new DOMException("unavailable", "NotReadableError"); } }));
  await expect(panel.locator("#document-error")).toContainText("bestand kon niet worden gelezen");
  await panel.locator("#template-file").setInputFiles({ name: "broken.json", mimeType: "application/json", buffer: Buffer.from("{unfinished") });
  await expect(panel.locator("#document-error")).toContainText("geen geldige JSON");
  await panel.evaluate(async el => {
    const edit = el._edit;
    el._edit = () => { throw Error("unexpected editor failure"); };
    await el._import({ size: 100, text: async () => JSON.stringify({ format: "puppy_tracker_document_template", version: 1, name: "Valid", language: "nl", blocks: [{ type: "text", text: "Example" }] }) });
    el._edit = edit;
  });
  await expect(panel.locator("#document-error")).toContainText("De opdracht is niet gelukt");
  await expect(panel.locator("#document-error")).not.toContainText("sjabloonbestand");
  await expect(panel.locator("#import-template")).toBeEnabled();
});

for (const language of ["nl", "en"]) test(`Watermark choices retain text and load logo independently from header (${language}) @cross-browser @tablet`, async ({ page }) => {
  const { panel } = await mountDocuments(page, language);
  await panel.evaluate(el => { el.loadLogo = async () => "test-logo-base64"; });
  await panel.locator("#edit-template").click(); await panel.locator("#editor-mode").selectOption("advanced");
  await expect(panel.locator("#watermark-text")).toBeHidden();
  await panel.locator("#template-watermark").selectOption("text");
  await panel.locator("#watermark-text").fill("CONCEPT");
  await expect(panel.locator("#watermark-text")).toBeFocused();
  await panel.locator("#template-watermark").selectOption("logo");
  await expect(panel.locator("#watermark-text")).toBeHidden();
  await expect(panel.locator("#watermark-logo-hint")).toBeVisible();
  await expect(panel.locator("[data-template-flag='logo']")).not.toBeChecked();
  await panel.locator("#preview-template").click();
  await expect(panel.locator("[data-preview-page]")).toHaveText("1 / 2");
  const call = await page.evaluate(() => window.__docs.calls.find(c => c.type.endsWith("template/preview")));
  expect(call.logo_base64).toBe("test-logo-base64");
  expect(call.template).toMatchObject({ logo: false, watermark: true, watermark_type: "logo", watermark_text: "CONCEPT" });
  await panel.locator("[data-preview-close]").click();
  await panel.locator("#template-watermark").selectOption("text");
  await expect(panel.locator("#watermark-text")).toHaveValue("CONCEPT");
  await panel.screenshot({ path: test.info().outputPath("document-watermark-settings.png") });
  await panel.locator("#save-template").click();
  await panel.locator("#edit-template").click(); await panel.locator("#editor-mode").selectOption("advanced");
  await expect(panel.locator("#template-watermark")).toHaveValue("text");
  await expect(panel.locator("#watermark-text")).toHaveValue("CONCEPT");
  await panel.locator("#template-watermark").selectOption("none");
  await expect(panel.locator("#watermark-text")).toBeHidden();
  await panel.locator("#preview-template").click();
  await expect(panel.locator("[data-preview-page]")).toHaveText("1 / 2");
  const last = await page.evaluate(() => window.__docs.calls.filter(c => c.type.endsWith("template/preview")).at(-1));
  expect(last.template.watermark).toBe(false);
  expect(last.logo_base64).toBeUndefined();
});

for (const language of ["nl", "en"]) test(`Template drafts recover after reload, including edits before the save timer (${language}) @cross-browser @tablet`, async ({ page }) => {
  let { panel } = await mountDocuments(page, language);
  await panel.locator("#new-template").click(); await panel.locator("#editor-mode").selectOption("advanced");
  await panel.locator("#template-name").fill("Local recovery");
  await panel.locator("[data-block='0'] > summary").click();
  await panel.locator("[data-block-text='0']").fill("{{ unfinished");
  await expect(panel.locator("#draft-status")).toContainText(language === "nl" ? "Concept lokaal bewaard" : "Draft saved locally");
  await expect(panel.locator("[data-block-text='0']")).toBeFocused();
  const id = await panel.evaluate(el => el._editor.id);
  // Reload immediately after another change: pagehide must flush the pending edit.
  await panel.locator("[data-block-text='0']").fill("{{ unfinished latest");
  ({ panel } = await mountDocuments(page, language));
  await expect(panel.locator("#template-name")).toHaveValue("Local recovery");
  await expect(panel.locator("[data-block-text='0']")).toBeVisible();
  await expect(panel.locator("[data-block-text='0']")).toHaveValue("{{ unfinished latest");
  expect(await panel.evaluate(el => el._editor.id)).toBe(id);
  await expect(panel.locator("#draft-status")).toContainText(language === "nl" ? "hersteld" : "restored");
  expect(await page.evaluate(() => window.__docs.calls.some(c => c.type.endsWith("template/save")))).toBe(false);
  await panel.locator("[data-block-text='0']").fill("Ready to save");
  await page.evaluate(() => { window.__docs.failSave = true; });
  await panel.locator("#save-template").click();
  await expect(panel.locator("#document-error")).not.toBeEmpty();
  await expect(panel.locator("#draft-status")).toContainText(language === "nl" ? "Concept lokaal bewaard" : "Draft saved locally");
  await page.evaluate(() => { window.__docs.failSave = false; });
  await panel.locator("#save-template").click();
  await expect(panel.locator("#document-buyer")).toBeVisible();
  expect(await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith("puppy_tracker.document_draft.")))).toEqual([]);
  ({ panel } = await mountDocuments(page, language));
  await expect(panel.locator("#document-buyer")).toBeVisible();
});

test("Discarding a draft clears the recovery copy and does not resurrect after reload @cross-browser", async ({ page }) => {
  let { panel } = await mountDocuments(page);
  await panel.locator("#edit-template").click(); await panel.locator("#editor-mode").selectOption("advanced");
  await panel.locator("#template-name").fill("Discard me");
  await expect(panel.locator("#draft-status")).toContainText("Concept lokaal bewaard");
  page.once("dialog", dialog => dialog.dismiss());
  await panel.locator("#cancel-template").click();
  await expect(panel.locator("#template-name")).toHaveValue("Discard me");
  await panel.locator("#template-name").fill("Last change before discard");
  page.once("dialog", dialog => dialog.accept());
  await panel.locator("#cancel-template").click();
  ({ panel } = await mountDocuments(page));
  await expect(panel.locator("#document-buyer")).toBeVisible();
});

test("Local drafts stay isolated between HA users @cross-browser @tablet", async ({ page }) => {
  const { report, panel } = await mountDocuments(page);
  await panel.locator("#edit-template").click(); await panel.locator("#editor-mode").selectOption("advanced");
  await panel.locator("#template-name").fill("Private draft A");
  await report.evaluate(el => { el.hass = { ...el._hass, user: { id: "other-admin", is_admin: true } }; });
  await expect(panel.locator("#document-buyer")).toBeVisible();
  await expect(panel).not.toContainText("Private draft A");
  await panel.locator("#template-management > summary").click();
  await panel.locator("#edit-template").click(); await panel.locator("#editor-mode").selectOption("advanced");
  await panel.locator("#template-name").fill("Private draft B");
  await report.evaluate(el => { el.hass = { ...el._hass, user: { id: "documents-admin", is_admin: true } }; });
  await expect(panel.locator("#template-name")).toHaveValue("Private draft A");
  await report.evaluate(el => { el.hass = { ...el._hass, user: { id: "other-admin", is_admin: true } }; });
  await expect(panel.locator("#template-name")).toHaveValue("Private draft B");
});

test("Storage failures keep input and download available without claiming draft saved @cross-browser", async ({ page }) => {
  const { panel } = await mountDocuments(page);
  await page.evaluate(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key.startsWith("puppy_tracker.document_draft.")) throw new DOMException("quota", "QuotaExceededError");
      return set.call(this, key, value);
    };
  });
  await panel.locator("#edit-template").click(); await panel.locator("#editor-mode").selectOption("advanced");
  await panel.locator("#template-name").fill("Keep my input");
  await expect(panel.locator("#draft-status")).toContainText("Automatisch bewaren is niet gelukt");
  await expect(panel.locator("#template-name")).toBeFocused();
  await expect(panel.locator("#template-name")).toHaveValue("Keep my input");
  const download = page.waitForEvent("download");
  await panel.locator("#download-draft").click();
  expect((await download).suggestedFilename()).toBe("puppy-tracker-template-draft.json");
});

test("A second tab cannot overwrite or discard the newer recovery copy @cross-browser", async ({ page, context }) => {
  const first = (await mountDocuments(page)).panel;
  await first.locator("#edit-template").click(); await first.locator("#editor-mode").selectOption("advanced");
  await first.locator("#template-name").fill("First draft");
  await expect(first.locator("#draft-status")).toContainText("Concept lokaal bewaard");
  const other = await context.newPage();
  try {
    const second = (await mountDocuments(other)).panel;
    await expect(second.locator("#template-name")).toHaveValue("First draft");
    await first.locator("#template-name").fill("Newer first draft");
    await expect(first.locator("#draft-status")).toContainText("Concept lokaal bewaard");
    await second.locator("#template-name").fill("Do not overwrite from second");
    await expect(second.locator("#draft-status")).toContainText("Een ander tabblad");
    await expect(second.locator("#template-name")).toHaveValue("Do not overwrite from second");
    other.once("dialog", dialog => dialog.accept());
    await second.locator("#cancel-template").click();
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("puppy_tracker.document_draft.v1.documents-admin")));
    expect(stored.editor.template.name).toBe("Newer first draft");
  } finally { await other.close(); }
});

test("Restored edits keep the original server revision for conflict checks @cross-browser", async ({ page }) => {
  let { panel } = await mountDocuments(page);
  await panel.locator("#edit-template").click(); await panel.locator("#editor-mode").selectOption("advanced");
  await panel.locator("#save-template").click();
  await panel.locator("#edit-template").click(); await panel.locator("#editor-mode").selectOption("advanced");
  await panel.locator("#template-name").fill("Work on existing template");
  ({ panel } = await mountDocuments(page));
  await expect(panel.locator("#template-name")).toHaveValue("Work on existing template");
  await page.evaluate(() => { window.__docs.failSave = true; });
  await panel.locator("#save-template").click();
  await expect(panel.locator("#document-error")).toContainText("gewijzigd");
  const call = await page.evaluate(() => window.__docs.calls.find(c => c.type.endsWith("template/save")));
  expect(call.expected_revision).toBe("saved");
  await expect(panel.locator("#template-name")).toHaveValue("Work on existing template");
});

test("Malformed local recovery data does not prevent starting a new draft @cross-browser", async ({ page }) => {
  await mountDocuments(page);
  await page.evaluate(() => localStorage.setItem("puppy_tracker.document_draft.v1.documents-admin", JSON.stringify({ version: 1, editor: { template: { blocks: [null] } } })));
  const { panel } = await mountDocuments(page);
  await expect(panel.locator("#draft-status")).toContainText("kon niet worden hersteld");
  await panel.locator("#new-template").click(); await panel.locator("#editor-mode").selectOption("advanced");
  await panel.locator("#template-name").fill("New recoverable draft");
  await expect(panel.locator("#draft-status")).toContainText("Concept lokaal bewaard");
});

for (const language of ["nl", "en"]) test(`Standard templates are grouped and default to the UI language (${language}) @cross-browser @tablet`, async ({ page }) => {
  const { panel } = await mountDocuments(page, language);
  await page.evaluate(() => {
    const source = window.__docs.model.templates[0];
    window.__docs.model.templates = [
      { ...source, id: "handover-example-nl", template: { ...source.template, name: "Overdrachtsbewijs", language: "nl" } },
      { ...source, id: "puppy-profile-en", template: { ...source.template, name: "Puppy information", language: "en" } },
      { ...source, id: "my-copy", builtin: false, template: { ...source.template, name: "My document", language: "en" } },
    ];
  });
  await panel.evaluate(el => { el._template = ""; });
  await panel.locator("#refresh-documents").click();
  const builtin = language === "nl" ? "handover-example-nl" : "puppy-profile-en";
  await expect(panel.locator("#document-template")).toHaveValue(builtin);
  await expect(panel.locator("#document-template optgroup")).toHaveCount(3);
  await expect(panel.locator("#document-template optgroup").first()).toHaveAttribute("label", language === "nl" ? "Standaard · Nederlands" : "Standard · English");
  await panel.locator("#document-template").selectOption("my-copy");
  await expect(panel.locator("#delete-template")).toBeVisible();
  await panel.locator("#document-template").selectOption(builtin);
  await expect(panel.locator("#delete-template")).toHaveCount(0);
  await panel.locator("#edit-template").click(); await panel.locator("#editor-mode").selectOption("advanced");
  await panel.locator("#template-name").fill("Personal copy");
  await panel.locator("#save-template").click();
  const saved = await page.evaluate(() => window.__docs.calls.find(c => c.type.endsWith("template/save")));
  expect(saved.template_id).not.toBe(builtin);
  expect(saved.expected_revision).toBeUndefined();
  expect(saved.template.language).toBe(language);
});

test("Revoked admin permission discards a delayed preview", async ({ page }) => {
  const { report, panel } = await mountDocuments(page);
  const downloads = []; page.on("download", d => downloads.push(d));
  await panel.locator("#document-buyer").selectOption("o1");
  await page.evaluate(() => { window.__docs.holdPreview = true; });
  await panel.locator("#preview-document").click();
  await expect.poll(() => page.evaluate(() => typeof window.__docs.releasePreview)).toBe("function");
  await report.evaluate(el => { el.hass = { ...el._hass, user: { id: "viewer", is_admin: false } }; });
  await page.evaluate(() => window.__docs.releasePreview());
  await expect(panel).toHaveCount(0);
  expect(downloads).toHaveLength(0);
  expect(await report.evaluate(el => el._documentPanel._model)).toBeNull();
});
