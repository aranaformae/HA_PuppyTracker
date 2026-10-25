"""Print-friendly document layout, isolated from the dashboard report renderer."""

from dataclasses import dataclass

from .document_templates import FIELDS, render_text, template_uses_logo
from .pdf_export import CONTENT_WIDTH, MARGIN, PAGE_HEIGHT, PAGE_WIDTH, _PdfReport, _TextBlock, _estimate_width, _jpeg_dimensions, _wrap

BODY_TOP = 66
BODY_BOTTOM = PAGE_HEIGHT - 70
BODY_HEIGHT = BODY_BOTTOM - BODY_TOP
ROW_LEADING = 13
ROW_PADDING = 7
LABEL_WIDTH = 166


@dataclass
class _DocumentText(_TextBlock):
    before: float = 0
    after: float = 0
    rule: bool = False

    @property
    def height(self):
        return super().height + self.before + self.after


class DocumentPdf(_PdfReport):
    """One layout for template previews and generated contracts."""

    def __init__(self, title: str, logo: bytes | None, initials: bool, language: str, watermark: bool,
                 *, header_logo: bool = True, watermark_type: str = "text", watermark_text: str = ""):
        super().__init__(logo)
        self.title = title
        self.initials = initials
        self.language = language
        self.watermark = watermark
        self.header_logo = header_logo
        self.watermark_type = watermark_type
        self.watermark_text = watermark_text or title
        if watermark:
            self.graphics_states["WM"] = .075
        self.y = BODY_TOP

    def new_page(self):
        super().new_page()
        self.y = BODY_TOP

    def ensure(self, height):
        if self.y > BODY_TOP and self.y + height > BODY_BOTTOM:
            self.new_page()

    def start_document(self):
        """Align the title and optional logo without a mostly empty cover page."""
        width = CONTENT_WIDTH - (100 if self.logo and self.header_logo else 0)
        lines = _wrap(self.title, 22, width, True)
        for index, line in enumerate(lines):
            self.text(MARGIN, BODY_TOP + index * 28, line, size=22, bold=True, gray=.12)
        height = len(lines) * 28
        if self.logo and self.header_logo:
            image_width, image_height = _jpeg_dimensions(self.logo)
            scale = min(82 / image_width, 60 / image_height)
            image_width, image_height = image_width * scale, image_height * scale
            x = MARGIN + CONTENT_WIDTH - image_width
            self.page.add(f"q {image_width:.2f} 0 0 {image_height:.2f} {x:.2f} {self._py(BODY_TOP + image_height):.2f} cm /Im1 Do Q")
            height = max(height, image_height)
        self.y = BODY_TOP + height + 16
        self.line(MARGIN, self.y, MARGIN + CONTENT_WIDTH, self.y, gray=.72, width=.9)
        self.y += 12

    def _flush_pending(self, following_height):
        pending, self._pending_text = self._pending_text, []
        if not pending and not following_height:
            return
        self.ensure(min(sum(block.height for block in pending) + following_height, BODY_HEIGHT))
        for index, block in enumerate(pending):
            self._draw_text_block(block, following_height=following_height if index == len(pending) - 1 else 0)

    def _draw_text_block(self, block, *, following_height=0):
        self.ensure(min(block.height, BODY_HEIGHT) if getattr(block, "rule", False) else block.size + block.spacing)
        self.y += getattr(block, "before", 0)
        for index, line in enumerate(block.lines):
            # Keep the last two lines together when a paragraph crosses a page.
            remaining = min(2, len(block.lines) - index)
            height = remaining * (block.size + block.spacing)
            if len(block.lines) - index <= 2:
                height += getattr(block, "after", 0) + following_height
            self.ensure(min(height, BODY_HEIGHT))
            self.text(MARGIN + block.indent, self.y, line, size=block.size, bold=block.bold, gray=block.gray)
            self.y += block.size + block.spacing
        if getattr(block, "rule", False):
            self.line(MARGIN, self.y + 2, MARGIN + CONTENT_WIDTH, self.y + 2, gray=.86)
        self.y += getattr(block, "after", 0)

    def heading(self, text, *, level=2):
        self._pending_text.append(_DocumentText(
            _wrap(text, 12, CONTENT_WIDTH, True), 12, 3, bold=True, gray=.18,
            before=12, after=10, rule=True,
        ))

    def paragraph(self, text, *, bold=False, keep_with_next=False):
        block = _DocumentText(_wrap(text, 10, CONTENT_WIDTH, bold), 10, 4, bold=bold, gray=.12, after=6)
        if keep_with_next:
            self._pending_text.append(block)
            return
        self._flush_pending(min(block.height, 28))
        self._draw_text_block(block)

    def _row(self, left, right):
        """Keep ordinary rows intact; split exceptionally long values by line."""
        count = max(len(left), len(right))
        height = count * ROW_LEADING + ROW_PADDING * 2
        self.ensure(height if height <= BODY_HEIGHT else 2 * ROW_LEADING + 2 * ROW_PADDING)
        offset = 0
        while offset < count:
            available = int((BODY_BOTTOM - self.y - 2 * ROW_PADDING) // ROW_LEADING)
            if available < 1:
                self.new_page()
                continue
            size = min(count - offset, available)
            height = size * ROW_LEADING + 2 * ROW_PADDING
            self.page.add(f"q .965 g {MARGIN:.2f} {self._py(self.y + height):.2f} {LABEL_WIDTH:.2f} {height:.2f} re f Q")
            self.rect(MARGIN, self.y, CONTENT_WIDTH, height, gray=.88)
            for index in range(size):
                top = self.y + ROW_PADDING + index * ROW_LEADING
                if offset + index < len(left):
                    self.text(MARGIN + 10, top, left[offset + index], size=9, gray=.38)
                elif offset and index == 0:
                    self.text(MARGIN + 10, top, left[0], size=9, gray=.38)
                if offset + index < len(right):
                    self.text(MARGIN + LABEL_WIDTH + 12, top, right[offset + index], size=10, gray=.12)
            self.y += height
            offset += size

    def data_block(self, title, rows):
        wrapped = [(_wrap(label, 9, LABEL_WIDTH - 20), _wrap(value, 10, CONTENT_WIDTH - LABEL_WIDTH - 24)) for label, value in rows]
        title_height = len(_wrap(title, 10.5, CONTENT_WIDTH, True)) * 14 + 10 if title else 0
        row_heights = [max(len(left), len(right)) * ROW_LEADING + 2 * ROW_PADDING for left, right in wrapped]
        pending_height = sum(block.height for block in self._pending_text)
        group_height = title_height + sum(row_heights)
        # Compact identities stay together; big groups keep their title and first row.
        keep = group_height if group_height + pending_height <= BODY_HEIGHT else title_height + min(row_heights[0], 2 * ROW_LEADING + 2 * ROW_PADDING)
        self._flush_pending(keep)
        if title:
            for line in _wrap(title, 10.5, CONTENT_WIDTH, True):
                self.ensure(24)
                self.text(MARGIN, self.y, line, size=10.5, bold=True, gray=.22)
                self.y += 14
            self.y += 10
        for left, right in wrapped:
            self._row(left, right)
        self.y += 8

    def signature(self, content):
        for paragraph in content.split("\n"):
            self.paragraph(paragraph, keep_with_next=True)
        self._flush_pending(100)
        self.ensure(100)
        gap = 32
        width = (CONTENT_WIDTH - gap) / 2
        labels = ("Verkoper(s):", "Koper(s):") if self.language == "nl" else ("Seller(s):", "Buyer(s):")
        hint = "Naam en handtekening" if self.language == "nl" else "Name and signature"
        for index, label in enumerate(labels):
            x = MARGIN + index * (width + gap)
            self.text(x, self.y + 12, label, size=10, bold=True, gray=.2)
            self.line(x, self.y + 70, x + width, self.y + 70, gray=.62)
            self.text(x, self.y + 77, hint, size=8, gray=.45)
        self.y += 100

    def _draw_watermark(self):
        if self.watermark_type == "logo":
            if self.logo:
                width, height = _jpeg_dimensions(self.logo)
                scale = min(300 / width, 300 / height)
                width, height = width * scale, height * scale
                x, y = (PAGE_WIDTH - width) / 2, (PAGE_HEIGHT - height) / 2
                self.page.add(f"q /WM gs {width:.2f} 0 0 {height:.2f} {x:.2f} {y:.2f} cm /Im1 Do Q")
        else:
            size = min(54, CONTENT_WIDTH / max(1, _estimate_width(self.watermark_text, 1, True)))
            width = _estimate_width(self.watermark_text, size, True)
            self.page.add(f"q /WM gs .866025 .5 -.5 .866025 {PAGE_WIDTH / 2:.2f} {PAGE_HEIGHT / 2:.2f} cm")
            self.text(-width / 2, PAGE_HEIGHT - size, self.watermark_text, size=size, bold=True)
            self.page.add("Q")

    def build(self):
        self._flush_pending(0)
        for number, page in enumerate(self.pages, 1):
            self.page = page
            if number > 1:
                self.text(MARGIN, 31, self.title[:85], size=8, gray=.4)
                self.line(MARGIN, 49, MARGIN + CONTENT_WIDTH, 49, gray=.88)
            self.line(MARGIN, PAGE_HEIGHT - 55, MARGIN + CONTENT_WIDTH, PAGE_HEIGHT - 55, gray=.82)
            self.text(MARGIN, PAGE_HEIGHT - 37, f"{number} / {len(self.pages)}", size=8, gray=.4)
            if self.initials:
                labels = ("Paraaf verkoper", "Paraaf koper") if self.language == "nl" else ("Seller initials", "Buyer initials")
                for index, label in enumerate(labels):
                    x = MARGIN + CONTENT_WIDTH - 224 + index * 120
                    self.text(x, PAGE_HEIGHT - 37, label, size=7, gray=.4)
                    self.line(x + 66, PAGE_HEIGHT - 28, x + 104, PAGE_HEIGHT - 28, gray=.6)
            if self.watermark:
                operations = page.operations
                page.operations = bytearray()
                self._draw_watermark()
                page.operations.extend(operations)
        return super().build()


def build_document_pdf(snapshot: dict, logo: bytes | None = None) -> bytes:
    template, values = snapshot["template"], snapshot["values"]
    lang, optional = template["language"], template["optional_fields"]
    pdf = DocumentPdf(template["name"], logo if template_uses_logo(template) else None, template["initials"], lang, template["watermark"],
                      header_logo=template["logo"], watermark_type=template.get("watermark_type", "text"), watermark_text=template.get("watermark_text", ""))
    pdf.start_document()

    def render(text):
        return render_text(text, values, optional, lang)

    for block in template["blocks"]:
        kind, content = block["type"], render(block["text"])
        if kind == "page_break":
            pdf._flush_pending(0)
            if pdf.y > BODY_TOP:
                pdf.new_page()
        elif kind == "heading":
            pdf.heading(content)
        elif kind == "data":
            rows = [(FIELDS[key][0 if lang == "nl" else 1], render("{{ " + key + " }}")) for key in block["fields"]]
            pdf.data_block(content, rows)
        elif kind == "signature":
            pdf.signature(content)
        else:
            for paragraph in content.split("\n"):
                pdf.paragraph(paragraph, bold=block.get("bold", False))
    return pdf.build()
