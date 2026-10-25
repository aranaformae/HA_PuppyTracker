"""Paginated contract documents using the existing dependency-free PDF writer."""

from .document_templates import FIELDS, render_text
from .pdf_export import CONTENT_WIDTH, MARGIN, PAGE_HEIGHT, _PdfReport, _wrap


class DocumentPdf(_PdfReport):
    """Reserve a running header and footer independently of report sections."""

    def __init__(self, title: str, logo: bytes | None, initials: bool, language: str, watermark: bool):
        super().__init__(logo)
        self.title = title
        self.initials = initials
        self.language = language
        self.watermark = watermark
        self.y = 66

    def new_page(self):
        super().new_page()
        self.y = 66

    def ensure(self, height):
        if self.y > 66 and self.y + height > PAGE_HEIGHT - 65:
            self.new_page()

    def build(self):
        self._flush_pending(0)
        for number, page in enumerate(self.pages, 1):
            self.page = page
            self.text(MARGIN, 25, self.title[:85], size=8, gray=.35)
            self.text(MARGIN, PAGE_HEIGHT - 35, f"{number} / {len(self.pages)}", size=8, gray=.35)
            if self.initials:
                self.text(MARGIN + CONTENT_WIDTH - 150, PAGE_HEIGHT - 35,
                          "Paraaf: __________________" if self.language == "nl" else "Initials: __________________", size=8)
            if self.watermark:
                # A text watermark is drawn behind content, never obscuring it.
                operations = page.operations
                page.operations = bytearray()
                self.text(MARGIN, PAGE_HEIGHT / 2, self.title[:40], size=22, gray=.96)
                page.operations.extend(operations)
        return super().build()


def build_document_pdf(snapshot: dict, logo: bytes | None = None) -> bytes:
    template, values = snapshot["template"], snapshot["values"]
    lang, optional = template["language"], template["optional_fields"]
    pdf = DocumentPdf(template["name"], logo if template["logo"] else None, template["initials"], lang, template["watermark"])
    pdf.brand_logo()
    pdf.heading(template["name"])
    def render(text):
        return render_text(text, values, optional, lang)
    for block in template["blocks"]:
        kind, content = block["type"], render(block["text"])
        if kind == "page_break":
            pdf._flush_pending(0)
            if pdf.y > 66:
                pdf.new_page()
        elif kind == "heading":
            pdf.heading(content, level=2)
        elif kind == "data":
            if content:
                pdf.heading(content, level=2)
            # Keep a small identity group together; large groups paginate by row.
            rows = [(FIELDS[key][0 if lang == "nl" else 1], render("{{ " + key + " }}")) for key in block["fields"]]
            height = sum(max(len(_wrap(label, 9, 170)), len(_wrap(value, 9, CONTENT_WIDTH - 180))) * 12 + 5 for label, value in rows)
            pdf._flush_pending(min(height, PAGE_HEIGHT - 140))
            for label, value in rows:
                left, right = _wrap(label, 9, 170), _wrap(value, 9, CONTENT_WIDTH - 180)
                pdf.ensure(max(len(left), len(right)) * 12 + 5)
                for i in range(max(len(left), len(right))):
                    pdf.ensure(12)
                    if i < len(left):
                        pdf.text(MARGIN, pdf.y, left[i], size=9, bold=True)
                    if i < len(right):
                        pdf.text(MARGIN + 180, pdf.y, right[i], size=9)
                    pdf.y += 12
                pdf.y += 5
            pdf.y += 8
        else:
            paragraphs = content.split("\n")
            if kind == "signature":
                height = sum(len(_wrap(p, 9.5, CONTENT_WIDTH)) * 12.5 for p in paragraphs) + 95
                pdf._flush_pending(min(height, PAGE_HEIGHT - 140))
            for paragraph in paragraphs:
                pdf.paragraph(paragraph, bold=block.get("bold", False))
            if kind == "signature":
                pdf.ensure(85)
                pdf.y += 40
                pdf.paragraph("Verkoper(s): __________________    Koper(s): __________________" if lang == "nl" else "Seller(s): __________________    Buyer(s): __________________")
                pdf.y += 25
            else:
                pdf.y += 5
    return pdf.build()
