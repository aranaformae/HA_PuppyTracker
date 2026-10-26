# PDF.js display files

`pdf.mjs` and `pdf.worker.mjs` are unmodified browser builds from
[`pdfjs-dist` 6.4.299](https://www.npmjs.com/package/pdfjs-dist/v/6.4.299)
(Mozilla Foundation). The accompanying Apache 2.0 license is in `LICENSE`.

They are served with Puppy Tracker's versioned frontend files and imported only
when an administrator opens a document layout preview. Home Assistant/HACS
installations do not run npm, so these two runtime files must be packaged here.
The document PDF remains in browser memory; no PDF file is exposed as a static
resource by this directory.
