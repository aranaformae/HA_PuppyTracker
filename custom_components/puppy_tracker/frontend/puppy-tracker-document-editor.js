import { escapeHtml as esc, preserveScrollPosition, createUuid } from "./puppy-tracker-card-common.js";

export const DOCUMENT_BLOCK_KINDS = ["heading", "text", "data", "signature", "page_break"];
const tokenPattern = () => /{{\s*([a-z_]+\.[a-z_]+)\s*}}/g;

// The simple editor uses a normal textarea for stable iOS selection and focus.
// Human labels are UI-only; the saved template retains the same field tokens.
const escapedPattern = value => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// UI-only identities and removed blocks never enter exported template JSON.
export class DocumentTemplateEditor {
  constructor(template, { fields, language, text, changed, save, cancel, preview, download }) {
    this.template = template;
    this.fields = fields;
    this.language = language;
    this.t = text;
    this.actions = { changed, save, cancel, preview, download };
    this.keys = template.blocks.map(() => createUuid());
    this.open = new Set();
    this.removed = [];
    this.issues = [];
    this.scroll = 0;
    this.optionalOpen = false;
    this.layoutOpen = false;
    this.mode = "advanced";
  }

  label(key) { return this.fields[key]?.[this.language()] || key; }
  title(index) {
    const block = this.template.blocks[index];
    if (this.mode === "simple") {
      const text = this.displayText(block.text || "");
      const label = block.type === "page_break" ? this.t("page_break")
        : ["heading", "data"].includes(block.type) ? text || this.t(block.type)
          : `${this.t(block.type)}: ${text.slice(0, 60)}`;
      return `${index + 1}. ${label}`;
    }
    return `${index + 1}. ${this.t(block.type)}: ${(block.text || "").slice(0, 80)}`;
  }
  usedFields() {
    return new Set(this.template.blocks.flatMap(block => [
      ...[...(block.text || "").matchAll(tokenPattern())].map(match => match[1]),
      ...(block.type === "data" ? block.fields || [] : []),
    ]).filter(key => this.fields[key]));
  }
  fieldOptions(exclude = [], query = "") {
    const groups = new Map();
    const needle = query.trim().toLocaleLowerCase(this.language());
    for (const key of Object.keys(this.fields).filter(key => !exclude.includes(key)
      && (!needle || `${this.label(key)} ${key}`.toLocaleLowerCase(this.language()).includes(needle)))) {
      const group = key.split(".")[0];
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push(key);
    }
    return `<option value="">${esc(this.t("choose"))}</option>${[...groups].map(([group, keys]) =>
      `<optgroup label="${esc(this.t(`group_${group}`))}">${keys.map(key => `<option value="${esc(key)}">${esc(this.label(key))}</option>`).join("")}</optgroup>`).join("")}`;
  }

  capture() {
    if (!this.root?.isConnected) return;
    this.scroll = this.root.querySelector(".blocks")?.scrollTop || 0;
    this.open = new Set([...this.root.querySelectorAll("[data-key][open]")].map(node => node.dataset.key));
    this.optionalOpen = Boolean(this.root.querySelector("#optional-fields")?.open);
    this.layoutOpen = Boolean(this.root.querySelector("#layout-settings")?.open);
  }
  mount(root) { this.root = root; this.render(false); }
  changed() {
    this.actions.changed();
    if (this.issues.length) this.issues = this.check();
    this.feedback();
    this.refreshOptionalFields();
  }
  refreshOptionalFields() {
    const list = this.root.querySelector("#optional-fields .field-list");
    const keys = [...this.usedFields()];
    if (JSON.stringify([...list.querySelectorAll("[data-optional]")].map(node => node.dataset.optional)) === JSON.stringify(keys)) return;
    list.innerHTML = keys.map(key => `<label><input type="checkbox" data-optional="${esc(key)}" ${(this.template.optional_fields || []).includes(key) ? "checked" : ""}>${esc(this.label(key))}</label>`).join("") || esc(this.t("noUsedFields"));
  }
  check() {
    const issues = [], template = this.template;
    const add = (code, index = null) => issues.push({ code, index });
    if (typeof template.name !== "string" || !template.name.trim() || template.name.trim().length > 150) add("nameRequired");
    if (template.watermark_text !== undefined && (typeof template.watermark_text !== "string" || template.watermark_text.length > 150)) add("invalid_template");
    if (template.watermark_type !== undefined && !["text", "logo"].includes(template.watermark_type)) add("invalid_template");
    if (!template.blocks.length || template.blocks.length > 200) add("blockLimit");
    if (new TextEncoder().encode(JSON.stringify(template)).length > 150000) add("templateTooLarge");
    for (const [index, block] of template.blocks.entries()) {
      const content = block.text || "";
      if (content.length > 12000 || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(content)) add("invalid_document_text", index);
      const remaining = content.replace(tokenPattern(), "");
      if (/{{|}}|{%|{#/.test(remaining) || (this.mode === "simple" && /⟦|⟧/.test(remaining))
        || [...content.matchAll(tokenPattern())].some(m => !this.fields[m[1]])) add("unknown_template_field", index);
      if (block.type === "data" && !block.fields?.length) add("emptyDataBlock", index);
      if (block.fields?.some(key => !this.fields[key])) add("unknown_template_field", index);
    }
    if (template.optional_fields?.some(key => !this.fields[key])) add("unknown_template_field");
    return issues;
  }
  validate() {
    this.issues = this.check();
    this.feedback();
    if (!this.issues.length) return true;
    const issue = this.issues[0];
    if (issue.index !== null) this.goTo(this.keys[issue.index]);
    else this.root.querySelector("#template-name")?.focus({ preventScroll: true });
    return false;
  }
  feedback() {
    if (!this.root) return;
    const issues = this.root.querySelector("#template-errors");
    issues.replaceChildren();
    for (const issue of this.issues) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "error";
      button.textContent = `${issue.index === null ? "" : `${this.t("block")} ${issue.index + 1}: `}${this.t(issue.code)}`;
      button.addEventListener("click", () => issue.index === null
        ? this.root.querySelector("#template-name").focus({ preventScroll: true }) : this.goTo(this.keys[issue.index]));
      issues.append(button);
    }
    this.root.querySelectorAll("[data-block]").forEach(node => {
      const index = Number(node.dataset.block);
      node.querySelector("summary").textContent = this.title(index);
      const error = node.querySelector(".block-error");
      error.textContent = this.issues.filter(i => i.index === index).map(i => this.t(i.code)).join(" ");
      node.querySelector("textarea")?.setAttribute("aria-invalid", String(Boolean(error.textContent)));
    });
    for (const option of this.root.querySelectorAll("#jump-block option[data-index]")) option.textContent = this.title(Number(option.dataset.index));
  }
  goTo(key) {
    const block = this.root.querySelector(`[data-key="${key}"]`);
    if (!block) return;
    block.open = true; this.open.add(key);
    const list = this.root.querySelector(".blocks");
    list.scrollTop += block.getBoundingClientRect().top - list.getBoundingClientRect().top;
    (block.querySelector("textarea") || block.querySelector("select") || block.querySelector("button"))?.focus({ preventScroll: true });
  }
  structural(change, focusKey = null) {
    this.capture();
    change();
    this.issues = [];
    this.actions.changed();
    this.render(false);
    if (focusKey) this.goTo(focusKey);
  }
  remove(index) {
    this.structural(() => {
      this.removed.push({ block: this.template.blocks.splice(index, 1)[0], key: this.keys.splice(index, 1)[0], nextKey: this.keys[index], index });
      if (this.removed.length > 20) this.removed.shift();
    });
  }
  restore() {
    const item = this.removed.at(-1);
    if (!item || this.keys.length >= 200) return;
    this.structural(() => {
      this.removed.pop();
      const next = this.keys.indexOf(item.nextKey);
      const index = next < 0 ? Math.min(item.index, this.keys.length) : next;
      this.keys.splice(index, 0, item.key);
      this.template.blocks.splice(index, 0, item.block);
    }, item.key);
  }
  add(kind, after = this.keys.length - 1, source = null) {
    if (this.keys.length >= 200) return;
    const key = createUuid();
    this.structural(() => {
      this.keys.splice(after + 1, 0, key);
      this.template.blocks.splice(after + 1, 0, source ? structuredClone(source) : { type: kind, text: "", fields: [], bold: false });
    }, key);
  }

  placeholder(key) {
    if (this._placeholderLanguage !== this.language()) {
      const labels = Object.fromEntries(Object.keys(this.fields).map(field => [field, this.label(field)]));
      const counts = Object.values(labels).reduce((result, label) => (result[label] = (result[label] || 0) + 1, result), {});
      this._placeholders = Object.fromEntries(Object.entries(labels).map(([field, label]) =>
        [field, `⟦${counts[label] > 1 ? `${this.t(`group_${field.split(".")[0]}`)} · ` : ""}${label}⟧`]));
      this._placeholderKeys = Object.fromEntries(Object.entries(this._placeholders).map(([field, text]) => [text, field]));
      this._placeholderPattern = new RegExp(Object.keys(this._placeholderKeys).map(escapedPattern).join("|"), "g");
      this._placeholderLanguage = this.language();
    }
    return this._placeholders[key];
  }
  displayText(value) {
    return value.replace(tokenPattern(), (match, key) => this.fields[key] ? this.placeholder(key) : match);
  }
  storedText(value) {
    this.placeholder(Object.keys(this.fields)[0]);
    return value.replace(this._placeholderPattern, marker => `{{ ${this._placeholderKeys[marker]} }}`);
  }
  fieldBadges(index) {
    const text = this.template.blocks[index].text || "";
    return [...new Set([...text.matchAll(tokenPattern())].map(match => match[1]))]
      .filter(key => this.fields[key]).map(key => `<span class="field-chip">${esc(this.label(key))}</span>`).join("");
  }
  updateFieldBadges(index) {
    const row = this.root.querySelector(`[data-used-fields="${index}"]`);
    if (row) row.innerHTML = this.fieldBadges(index);
  }

  searchMarkup(index, kind, exclude = []) {
    return `<div class="field-picker"><label>${esc(this.t("searchField"))}<input type="search" data-field-search="${index}" data-search-kind="${kind}" autocomplete="off"></label>
      <label>${esc(kind === "data" ? this.t("addField") : this.t("insert"))}<select data-${kind === "data" ? "add-field" : "insert"}="${index}">${this.fieldOptions(exclude)}</select></label></div>`;
  }
  insertMenu(after) {
    if (this.keys.length >= 200) return "";
    return `<details class="insert-menu"><summary>${esc(this.t("insertHere"))}</summary><div class="actions">${DOCUMENT_BLOCK_KINDS.map(kind =>
      `<button type="button" data-add-after="${after}" data-add-kind="${kind}">${esc(this.t(kind))}</button>`).join("")}</div></details>`;
  }

  blockMarkup(block, index) {
    const key = this.keys[index], fields = block.fields || [];
    return `<details class="block ${this.mode === "simple" ? "simple-block" : ""}" data-block="${index}" data-key="${key}" ${this.open.has(key) ? "open" : ""}>
      <summary>${esc(this.title(index))}</summary>${this.mode === "simple" ? `<details class="block-tools"><summary>${esc(this.t("moreActions"))}</summary>` : ""}<div class="actions">
      <button type="button" data-move="${index}" data-direction="-1" ${index === 0 ? "disabled" : ""}>${esc(this.t("up"))}</button>
      <button type="button" data-move="${index}" data-direction="1" ${index === this.keys.length - 1 ? "disabled" : ""}>${esc(this.t("down"))}</button>
      <button type="button" data-duplicate="${index}" ${this.keys.length >= 200 ? "disabled" : ""}>${esc(this.t("duplicate"))}</button>
      <button type="button" data-remove="${index}">${esc(this.t("remove"))}</button></div>${this.mode === "simple" ? "</details>" : ""}
      <p class="block-error error" role="status"></p>
      ${block.type === "page_break" ? "" : this.mode === "simple"
        ? `<label>${esc(["heading", "data"].includes(block.type) ? this.t("sectionTitle") : this.t("content"))}<textarea data-simple-text="${index}" rows="${["heading", "data"].includes(block.type) ? 2 : 6}" maxlength="12000">${esc(this.displayText(block.text || ""))}</textarea></label><div class="used-field-chips" data-used-fields="${index}">${this.fieldBadges(index)}</div>${["text", "signature"].includes(block.type) ? this.searchMarkup(index, "text") : ""}`
        : `<label>${esc(this.t("content"))}<textarea data-block-text="${index}" rows="6" maxlength="12000">${esc(block.text)}</textarea></label>${this.searchMarkup(index, "text")}`}
      ${block.type === "text" ? `<label><input type="checkbox" data-bold="${index}" ${block.bold ? "checked" : ""}>${esc(this.t("bold"))}</label>` : ""}
      ${block.type === "data" ? `<h3>${esc(this.t("fields"))}</h3><ol class="selected-fields">${fields.map((field, position) => `<li><span>${esc(this.label(field))}</span><div class="actions">
        <button type="button" data-field-up="${position}" data-owner-block="${index}" ${position === 0 ? "disabled" : ""} aria-label="${esc(this.t("up") + ': ' + this.label(field))}">↑</button>
        <button type="button" data-field-down="${position}" data-owner-block="${index}" ${position === fields.length - 1 ? "disabled" : ""} aria-label="${esc(this.t("down") + ': ' + this.label(field))}">↓</button>
        <button type="button" data-field-remove="${position}" data-owner-block="${index}" aria-label="${esc(this.t("remove") + ': ' + this.label(field))}">×</button></div></li>`).join("")}</ol>
        ${this.searchMarkup(index, "data", fields)}` : ""}
      </details>${this.mode === "simple" ? this.insertMenu(index) : ""}`;
  }
  render(capture = true) {
    if (capture) this.capture();
    const template = this.template;
    const watermarkMode = template.watermark ? template.watermark_type || "text" : "none";
    preserveScrollPosition(this.root, () => {
      this.root.innerHTML = `<section class="editor"><div class="grid"><label>${esc(this.t("editorMode"))}<select id="editor-mode"><option value="simple" ${this.mode === "simple" ? "selected" : ""}>${esc(this.t("simpleMode"))}</option><option value="advanced" ${this.mode === "advanced" ? "selected" : ""}>${esc(this.t("advancedMode"))}</option></select></label></div>
        ${this.mode === "advanced" ? `<p>${esc(this.t("editorHint"))}</p>` : `<p>${esc(this.t("fieldHint"))}</p>`}
        <div class="grid"><label>${esc(this.t("name"))}<input id="template-name" maxlength="150" value="${esc(template.name)}"></label>
        <label>${esc(this.t("language"))}<select id="template-language"><option value="nl" ${template.language === "nl" ? "selected" : ""}>Nederlands</option><option value="en" ${template.language === "en" ? "selected" : ""}>English</option></select></label></div>
        ${this.mode === "simple" ? `<details id="layout-settings" ${this.layoutOpen ? "open" : ""}><summary>${esc(this.t("layoutSettings"))}</summary>` : ""}
        <div class="flags">${["logo", "initials"].map(key => `<label><input type="checkbox" data-template-flag="${key}" ${template[key] ? "checked" : ""}>${esc(this.t(key))}</label>`).join("")}</div>
        <div class="grid watermark-settings"><label>${esc(this.t("watermark"))}<select id="template-watermark">${[["none", "watermarkNone"], ["text", "watermarkTextMode"], ["logo", "watermarkLogoMode"]].map(([mode, key]) => `<option value="${mode}" ${watermarkMode === mode ? "selected" : ""}>${esc(this.t(key))}</option>`).join("")}</select></label>
        <label id="watermark-text-field" ${watermarkMode !== "text" ? "hidden" : ""}>${esc(this.t("watermarkText"))}<input id="watermark-text" maxlength="150" value="${esc(template.watermark_text || "")}"><small>${esc(this.t("watermarkTextHint"))}</small></label></div>
        <p id="watermark-logo-hint" ${watermarkMode !== "logo" ? "hidden" : ""}>${esc(this.t("watermarkLogoHint"))}</p>
        ${this.mode === "simple" ? "</details>" : ""}
        <div class="actions"><button type="button" id="preview-template">${esc(this.t("previewTemplate"))}</button><button type="button" id="download-draft">${esc(this.t("downloadDraft"))}</button></div>
        <p>${esc(this.t("previewTemplateHint"))}</p><div id="template-errors" class="actions" role="alert"></div>
        <label>${esc(this.t(this.mode === "simple" ? "jumpSection" : "jumpBlock"))} (${this.keys.length}/200)<select id="jump-block"><option value="">${esc(this.t("choose"))}</option>${this.keys.map((key, index) => `<option value="${key}" data-index="${index}">${esc(this.title(index))}</option>`).join("")}</select></label>
        <div class="blocks">${this.mode === "simple" ? this.insertMenu(-1) : ""}${template.blocks.map((block, index) => this.blockMarkup(block, index)).join("")}</div>
        <div class="actions">${this.mode === "advanced" ? `<select id="add-kind" aria-label="${esc(this.t("add"))}">${DOCUMENT_BLOCK_KINDS.map(kind => `<option value="${kind}">${esc(this.t(kind))}</option>`).join("")}</select><button id="add-block" type="button" ${this.keys.length >= 200 ? "disabled" : ""}>${esc(this.t("add"))}</button>` : ""}
        <button id="restore-block" type="button" ${!this.removed.length || this.keys.length >= 200 ? "disabled" : ""}>${esc(this.t("restoreBlock"))}${this.removed.length ? ` (${this.removed.length})` : ""}</button></div>
        <details id="optional-fields" ${this.optionalOpen ? "open" : ""}><summary>${esc(this.t("optional"))}</summary><p>${esc(this.t("optionalHint"))}</p><div class="field-list">${[...this.usedFields()].map(key => `<label><input type="checkbox" data-optional="${esc(key)}" ${(template.optional_fields || []).includes(key) ? "checked" : ""}>${esc(this.label(key))}</label>`).join("") || esc(this.t("noUsedFields"))}</div></details>
        <div class="actions"><button type="button" id="save-template" class="primary">${esc(this.t("saveTemplate"))}</button><button type="button" id="cancel-template">${esc(this.t("cancel"))}</button></div></section>`;
      this.bind();
      this.root.querySelector(".blocks").scrollTop = this.scroll;
      this.feedback();
    });
  }
  bind() {
    const on = (selector, event, callback) => this.root.querySelectorAll(selector).forEach(node => node.addEventListener(event, e => {
      if (this.root.closest("fieldset")?.disabled) return;
      callback(e, node);
    }));
    on("#editor-mode", "change", e => { this.capture(); this.mode = e.target.value; this.render(false); this.actions.changed(true); });
    on("#template-name", "input", e => { this.template.name = e.target.value; this.changed(); });
    on("#template-language", "change", e => { this.template.language = e.target.value; this.changed(); });
    on("[data-template-flag]", "change", (e, node) => { this.template[node.dataset.templateFlag] = node.checked; this.changed(); });
    on("#template-watermark", "change", e => {
      const mode = e.target.value;
      this.template.watermark = mode !== "none";
      if (mode !== "none") this.template.watermark_type = mode;
      this.root.querySelector("#watermark-text-field").hidden = mode !== "text";
      this.root.querySelector("#watermark-logo-hint").hidden = mode !== "logo";
      this.changed();
    });
    on("#watermark-text", "input", e => { this.template.watermark_text = e.target.value; this.changed(); });
    on("[data-block-text]", "input", (e, node) => { this.template.blocks[Number(node.dataset.blockText)].text = node.value; this.changed(); });
    on("[data-simple-text]", "input", (e, node) => {
      const index = Number(node.dataset.simpleText);
      this.template.blocks[index].text = this.storedText(node.value);
      this.updateFieldBadges(index); this.changed();
    });
    on("[data-bold]", "change", (e, node) => { this.template.blocks[Number(node.dataset.bold)].bold = node.checked; this.changed(); });
    on("#optional-fields", "change", e => {
      const node = e.target.closest("[data-optional]");
      if (!node) return;
      const fields = new Set(this.template.optional_fields || []);
      if (node.checked) fields.add(node.dataset.optional); else fields.delete(node.dataset.optional);
      this.template.optional_fields = [...fields]; this.changed();
    });
    on("[data-field-search]", "input", (e, node) => {
      const index = Number(node.dataset.fieldSearch), kind = node.dataset.searchKind;
      const block = this.template.blocks[index];
      const selector = kind === "data" ? `[data-add-field="${index}"]` : `[data-insert="${index}"]`;
      this.root.querySelector(selector).innerHTML = this.fieldOptions(kind === "data" ? block.fields || [] : [], node.value);
    });
    on("[data-insert]", "change", (e, node) => {
      if (!node.value) return;
      const index = Number(node.dataset.insert);
      const simple = this.mode === "simple";
      const area = this.root.querySelector(`[data-${simple ? "simple" : "block"}-text="${index}"]`);
      area.setRangeText(simple ? this.placeholder(node.value) : `{{ ${node.value} }}`, area.selectionStart, area.selectionEnd, "end");
      this.template.blocks[index].text = simple ? this.storedText(area.value) : area.value;
      if (simple) this.updateFieldBadges(index);
      node.value = ""; this.changed(); area.focus({ preventScroll: true });
    });
    on("[data-move]", "click", (e, node) => {
      const index = Number(node.dataset.move), next = index + Number(node.dataset.direction);
      if (next < 0 || next >= this.keys.length) return;
      const key = this.keys[index];
      this.structural(() => {
        [this.keys[index], this.keys[next]] = [this.keys[next], this.keys[index]];
        [this.template.blocks[index], this.template.blocks[next]] = [this.template.blocks[next], this.template.blocks[index]];
      }, key);
    });
    on("[data-remove]", "click", (e, node) => this.remove(Number(node.dataset.remove)));
    on("[data-duplicate]", "click", (e, node) => this.add(null, Number(node.dataset.duplicate), this.template.blocks[Number(node.dataset.duplicate)]));
    on("[data-add-field]", "change", (e, node) => {
      if (!node.value) return;
      const block = this.template.blocks[Number(node.dataset.addField)], value = node.value;
      this.structural(() => { block.fields = [...(block.fields || []), value]; });
    });
    for (const action of ["up", "down", "remove"]) on(`[data-field-${action}]`, "click", (e, node) => {
      const index = Number(node.dataset.ownerBlock), position = Number(node.dataset[`field${action[0].toUpperCase()}${action.slice(1)}`]);
      const fields = this.template.blocks[index].fields;
      this.structural(() => {
        if (action === "remove") fields.splice(position, 1);
        else { const next = position + (action === "up" ? -1 : 1); [fields[position], fields[next]] = [fields[next], fields[position]]; }
      });
    });
    on("#restore-block", "click", () => this.restore());
    on("#add-block", "click", () => this.add(this.root.querySelector("#add-kind").value));
    on("[data-add-after]", "click", (e, node) => this.add(node.dataset.addKind, Number(node.dataset.addAfter)));
    on("#jump-block", "change", e => { if (e.target.value) this.goTo(e.target.value); });
    on("#save-template", "click", () => this.actions.save());
    on("#preview-template", "click", () => this.actions.preview());
    on("#download-draft", "click", () => this.actions.download());
    on("#cancel-template", "click", () => this.actions.cancel());
  }
}
