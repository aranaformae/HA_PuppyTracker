import { DOCUMENT_BLOCK_KINDS } from "./puppy-tracker-document-editor.js";

const PREFIX = "puppy_tracker.document_draft.v1.";
const MAX_BYTES = 500000;

function validDraft(value) {
  const editor = value?.editor, template = editor?.template;
  return value?.version === 1 && typeof value.saved_at === "string"
    && typeof editor?.id === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(editor.id)
    && (editor.revision === null || typeof editor.revision === "string" && editor.revision.length <= 128)
    && template?.format === "puppy_tracker_document_template" && template.version === 1
    && typeof template.name === "string" && ["nl", "en"].includes(template.language)
    && ["logo", "watermark", "initials"].every(key => typeof template[key] === "boolean")
    && (template.watermark_type === undefined || ["text", "logo"].includes(template.watermark_type))
    && (template.watermark_text === undefined || typeof template.watermark_text === "string")
    && Array.isArray(template.optional_fields) && template.optional_fields.length <= 200 && template.optional_fields.every(key => typeof key === "string")
    && Array.isArray(template.blocks) && template.blocks.length <= 200
    && template.blocks.every(block => DOCUMENT_BLOCK_KINDS.includes(block?.type)
      && typeof block.text === "string" && Array.isArray(block.fields) && block.fields.length <= 200
      && block.fields.every(key => typeof key === "string") && (block.bold === undefined || typeof block.bold === "boolean"));
}

// A recovery copy, never an implicit save of the shared HA template.
export class DocumentDraftStore {
  constructor(userId, status) {
    this.key = userId ? PREFIX + encodeURIComponent(userId) : null;
    this.status = status;
    this.expected = null;
    this.lastEditor = null;
    this.timer = null;
    this.reader = null;
  }
  load() {
    if (!this.key) { this.status("draftUnavailable"); return null; }
    try {
      this.expected = localStorage.getItem(this.key);
      if (!this.expected) return null;
      if (new TextEncoder().encode(this.expected).length > MAX_BYTES) throw Error();
      const value = JSON.parse(this.expected);
      if (!validDraft(value)) throw Error();
      this.lastEditor = JSON.stringify(value.editor);
      return value;
    } catch { this.status("draftRestoreFailed"); return null; }
  }
  schedule(reader) {
    this.reader = reader;
    clearTimeout(this.timer);
    this.status("draftPending");
    this.timer = setTimeout(() => this.flush(), 600);
  }
  flush(reader = this.reader) {
    clearTimeout(this.timer); this.timer = null;
    const snapshot = reader?.();
    if (!snapshot) return;
    try {
      if (!this.key) throw Error();
      // Do not overwrite a recovery copy changed by another card/tab.
      if (localStorage.getItem(this.key) !== this.expected) {
        this.status("draftConflict"); return;
      }
      const editor = JSON.stringify(snapshot.editor);
      if (editor !== this.lastEditor) {
        const raw = JSON.stringify({ version: 1, saved_at: new Date().toISOString(), ...snapshot });
        if (new TextEncoder().encode(raw).length > MAX_BYTES) throw Error();
        localStorage.setItem(this.key, raw);
        this.expected = raw;
        this.lastEditor = editor;
      }
      this.status("draftSaved");
    } catch { this.status("draftUnavailable"); }
  }
  clear() {
    this.dispose(); this.reader = null;
    try {
      if (this.key && localStorage.getItem(this.key) === this.expected) {
        localStorage.removeItem(this.key);
        this.expected = null;
        this.lastEditor = null;
      }
      this.status("");
    } catch { this.status("draftClearFailed"); }
  }
  dispose() { clearTimeout(this.timer); this.timer = null; }
}
