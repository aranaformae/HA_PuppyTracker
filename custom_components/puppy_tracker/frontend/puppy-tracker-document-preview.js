import { downloadExportFile, escapeHtml } from "./puppy-tracker-card-common.js";

let pdfLibrary;
async function loadPdfLibrary() {
  if (!pdfLibrary) pdfLibrary = import("./vendor/pdfjs/pdf.mjs").then(library => {
    library.GlobalWorkerOptions.workerSrc = new URL("./vendor/pdfjs/pdf.worker.mjs", import.meta.url).href;
    return library;
  }).catch(error => { pdfLibrary = null; throw error; });
  return pdfLibrary;
}

function pdfBytes(result) {
  if (result?.encoding !== "base64" || result?.mime_type !== "application/pdf") throw Error("invalid_pdf_preview");
  const binary = atob(result.content);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export class DocumentPdfPreview {
  constructor(text, close) {
    this.t = text;
    this.close = close;
    this.result = null;
    this.pageNumber = 1;
    this.zoom = 1;
    this.generation = 0;
    this.renderNumber = 0;
    this.status = "";
  }
  get hasResult() { return Boolean(this.result); }
  setResult(result) {
    this.clear();
    this.result = result;
    this.status = "previewLoading";
  }
  clear() {
    this.generation++;
    this.renderNumber++;
    const renderTask = this.renderTask, loadingTask = this.loadingTask, pdf = this.pdf;
    this.renderTask = null; this.loadingTask = null; this.pdf = null;
    this.result = null; this.pageNumber = 1; this.zoom = 1;
    this.status = "";
    this.update();
    try { renderTask?.cancel(); } catch { /* Already completed. */ }
    for (const resource of [loadingTask, pdf]) {
      try { Promise.resolve(resource?.destroy()).catch(() => {}); } catch { /* Already closed. */ }
    }
  }
  destroy() {
    this.clear();
    this.resizeObserver?.disconnect(); this.resizeObserver = null;
    this.root = null;
  }
  mount(root) {
    this.resizeObserver?.disconnect();
    this.root = root;
    root.innerHTML = `<div class="preview-toolbar"><strong>${escapeHtml(this.t("inlinePreview"))}</strong><button type="button" data-preview-close>${escapeHtml(this.t("previewClose"))}</button></div>
      <div class="preview-controls"><button type="button" data-preview-prev>${escapeHtml(this.t("previousPage"))}</button><span data-preview-page></span><button type="button" data-preview-next>${escapeHtml(this.t("nextPage"))}</button><button type="button" data-preview-zoom-out aria-label="${escapeHtml(this.t("zoomOut"))}">−</button><span data-preview-zoom></span><button type="button" data-preview-zoom-in aria-label="${escapeHtml(this.t("zoomIn"))}">+</button><button type="button" data-preview-download>${escapeHtml(this.t("downloadPreview"))}</button></div>
      <p data-preview-status role="status"></p><div class="preview-canvas"><canvas role="img" aria-label="${escapeHtml(this.t("inlinePreview"))}"></canvas></div>`;
    root.querySelector("[data-preview-close]").addEventListener("click", this.close);
    root.querySelector("[data-preview-prev]").addEventListener("click", () => this.showPage(this.pageNumber - 1));
    root.querySelector("[data-preview-next]").addEventListener("click", () => this.showPage(this.pageNumber + 1));
    root.querySelector("[data-preview-zoom-out]").addEventListener("click", () => this.setZoom(this.zoom / 1.5));
    root.querySelector("[data-preview-zoom-in]").addEventListener("click", () => this.setZoom(this.zoom * 1.5));
    root.querySelector("[data-preview-download]").addEventListener("click", () => { if (this.result) downloadExportFile(this.result); });
    this.lastWidth = root.clientWidth;
    this.resizeObserver = new ResizeObserver(() => {
      const width = this.root?.clientWidth || 0;
      if (this.pdf && width > 0 && width !== this.lastWidth) this.renderPage();
      this.lastWidth = width;
    });
    this.resizeObserver.observe(root);
    this.update();
    if (this.result && !this.pdf && !this.loadingTask) this.load();
    else if (this.pdf) this.renderPage();
  }
  update() {
    const root = this.root;
    if (!root?.isConnected) return;
    const total = this.pdf?.numPages || 0;
    root.querySelector("[data-preview-page]").textContent = total ? `${this.pageNumber} / ${total}` : "";
    root.querySelector("[data-preview-prev]").disabled = !total || this.pageNumber <= 1;
    root.querySelector("[data-preview-next]").disabled = !total || this.pageNumber >= total;
    root.querySelector("[data-preview-download]").disabled = !this.result;
    root.querySelector("[data-preview-zoom]").textContent = `${Math.round(this.zoom * 100)}%`;
    root.querySelector("[data-preview-zoom-out]").disabled = !total || this.zoom <= 1;
    root.querySelector("[data-preview-zoom-in]").disabled = !total || this.zoom >= 3;
    root.querySelector("[data-preview-status]").textContent = this.status ? this.t(this.status) : "";
    root.querySelector(".preview-canvas").hidden = !this.pdf;
  }
  async load() {
    const generation = this.generation;
    this.status = "previewLoading"; this.update();
    try {
      const library = await loadPdfLibrary();
      if (generation !== this.generation || !this.result) return;
      const task = library.getDocument({ data: pdfBytes(this.result) });
      this.loadingTask = task;
      const pdf = await task.promise;
      if (generation !== this.generation) { await pdf.destroy(); return; }
      this.loadingTask = null; this.pdf = pdf; this.status = "";
      this.update();
      await this.renderPage();
    } catch {
      if (generation !== this.generation) return;
      const failed = this.loadingTask;
      this.loadingTask = null; this.status = "previewFailed"; this.update();
      try { Promise.resolve(failed?.destroy()).catch(() => {}); } catch { /* Already closed. */ }
    }
  }
  showPage(number) {
    if (!this.pdf || number < 1 || number > this.pdf.numPages) return;
    this.pageNumber = number; this.update(); this.renderPage();
  }
  setZoom(value) {
    if (!this.pdf) return;
    this.zoom = Math.max(1, Math.min(3, value));
    this.update(); this.renderPage();
  }
  async renderPage() {
    const root = this.root, pdf = this.pdf;
    if (!root?.isConnected || !pdf || root.clientWidth <= 0) return;
    const token = ++this.renderNumber;
    try { this.renderTask?.cancel(); } catch { /* Already completed. */ }
    this.renderTask = null;
    try {
      const page = await pdf.getPage(this.pageNumber);
      if (token !== this.renderNumber || root !== this.root) return;
      const base = page.getViewport({ scale: 1 });
      const width = Math.max(200, root.querySelector(".preview-canvas").clientWidth - 8);
      const viewport = page.getViewport({ scale: Math.min(4, width / base.width * this.zoom) });
      const canvas = root.querySelector("canvas");
      const ratio = Math.min(window.devicePixelRatio || 1, 2, 3000 / Math.max(viewport.width, viewport.height));
      canvas.width = Math.ceil(viewport.width * ratio);
      canvas.height = Math.ceil(viewport.height * ratio);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      const context = canvas.getContext("2d");
      const task = page.render({ canvasContext: context, viewport, transform: ratio === 1 ? null : [ratio, 0, 0, ratio, 0, 0] });
      this.renderTask = task;
      await task.promise;
      if (token === this.renderNumber) this.renderTask = null;
    } catch (error) {
      if (error?.name === "RenderingCancelledException" || token !== this.renderNumber) return;
      this.status = "previewFailed"; this.update();
    }
  }
}
