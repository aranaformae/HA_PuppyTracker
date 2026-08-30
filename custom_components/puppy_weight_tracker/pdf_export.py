"""Dependency-free PDF report generation for Puppy Weight Tracker."""

from __future__ import annotations

import base64
import math
import re
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from homeassistant.util import dt as dt_util

from .metrics import calculate_puppy_metrics
from .storage import PuppyWeightStorage
from .time_utils import timestamp_sort_key

PAGE_WIDTH = 595.28
PAGE_HEIGHT = 841.89
MARGIN = 42.0
CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN


def _safe_filename(value: str | None) -> str:
    text = (value or "nest").strip().lower()
    text = re.sub(r"[^a-z0-9_-]+", "-", text)
    return text.strip("-") or "nest"


def _active_measurements(puppy: dict[str, Any], range_hours: float | None = None) -> list[dict[str, Any]]:
    cutoff = None
    if range_hours is not None and range_hours > 0:
        cutoff = dt_util.now().timestamp() - float(range_hours) * 3600
    rows = [
        measurement
        for measurement in puppy.get("measurements", [])
        if not measurement.get("deleted", False)
        and measurement.get("superseded_by") is None
        and (cutoff is None or timestamp_sort_key(measurement.get("timestamp")) >= cutoff)
    ]
    return sorted(
        rows,
        key=lambda item: (
            timestamp_sort_key(item.get("timestamp")),
            item.get("created_at") or "",
        ),
    )


def _format_local_datetime(value: str | None) -> str:
    if not value:
        return "—"
    try:
        parsed = dt_util.parse_datetime(value)
        if parsed is None:
            return "—"
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=dt_util.UTC)
        local = dt_util.as_local(parsed)
        return local.strftime("%d-%m-%Y %H:%M")
    except (TypeError, ValueError):
        return "—"


def _format_weight(value: Any) -> str:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return "—"
    if math.isclose(number, round(number), abs_tol=1e-9):
        return f"{int(round(number))} g"
    return f"{number:.1f} g".replace(".", ",")


def _format_signed_weight(value: float | None) -> str:
    if value is None:
        return "—"
    prefix = "+" if value > 0 else "" if value == 0 else "-"
    return f"{prefix}{abs(value):.1f} g".replace(".0 g", " g").replace(".", ",")


def _format_percent(value: float | None) -> str:
    if value is None:
        return "—"
    prefix = "+" if value > 0 else "" if value == 0 else "-"
    return f"{prefix}{abs(value):.2f}%".replace(".00%", "%").replace(".", ",")


def _pdf_literal(text: str) -> bytes:
    raw = str(text).encode("cp1252", errors="replace")
    out = bytearray(b"(")
    for byte in raw:
        if byte in (0x28, 0x29, 0x5C):
            out.extend(b"\\" + bytes([byte]))
        elif 32 <= byte <= 126:
            out.append(byte)
        else:
            out.extend(f"\\{byte:03o}".encode("ascii"))
    out.extend(b")")
    return bytes(out)


def _estimate_width(text: str, size: float, bold: bool = False) -> float:
    factor = 0.54 if bold else 0.50
    return len(str(text)) * size * factor


def _wrap(text: str, size: float, width: float, bold: bool = False) -> list[str]:
    words = str(text or "").split()
    if not words:
        return [""]
    lines: list[str] = []
    current = words[0]
    for word in words[1:]:
        candidate = f"{current} {word}"
        if _estimate_width(candidate, size, bold) <= width:
            current = candidate
        else:
            lines.append(current)
            current = word
    lines.append(current)
    return lines


@dataclass
class _Page:
    operations: bytearray = field(default_factory=bytearray)

    def add(self, operation: bytes | str) -> None:
        if isinstance(operation, str):
            operation = operation.encode("ascii")
        self.operations.extend(operation)
        if not operation.endswith(b"\n"):
            self.operations.extend(b"\n")


class _PdfReport:
    def __init__(self) -> None:
        self.pages: list[_Page] = []
        self.page = _Page()
        self.pages.append(self.page)
        self.y = MARGIN

    @staticmethod
    def _py(top: float) -> float:
        return PAGE_HEIGHT - top

    def new_page(self) -> None:
        self.page = _Page()
        self.pages.append(self.page)
        self.y = MARGIN

    def ensure(self, height: float) -> None:
        if self.y + height > PAGE_HEIGHT - MARGIN:
            self.new_page()

    def text(self, x: float, top: float, text: str, *, size: float = 10, bold: bool = False, gray: float = 0) -> None:
        font = "/F2" if bold else "/F1"
        y = self._py(top + size)
        self.page.add(f"{gray:.3f} g")
        self.page.add(b"BT " + font.encode("ascii") + f" {size:.2f} Tf 1 0 0 1 {x:.2f} {y:.2f} Tm ".encode("ascii") + _pdf_literal(text) + b" Tj ET")
        if gray:
            self.page.add("0 g")

    def line(self, x1: float, top1: float, x2: float, top2: float, *, gray: float = 0.75, width: float = 0.6) -> None:
        self.page.add(f"{gray:.3f} G {width:.2f} w {x1:.2f} {self._py(top1):.2f} m {x2:.2f} {self._py(top2):.2f} l S 0 G")

    def rect(self, x: float, top: float, width: float, height: float, *, gray: float = 0.85) -> None:
        self.page.add(f"{gray:.3f} G 0.6 w {x:.2f} {self._py(top + height):.2f} {width:.2f} {height:.2f} re S 0 G")

    def colored_line(self, points: list[tuple[float, float]], rgb: tuple[float, float, float], *, width: float = 1.6) -> None:
        if len(points) < 2:
            return
        r, g, b = rgb
        first_x, first_top = points[0]
        ops = [f"{r:.3f} {g:.3f} {b:.3f} RG {width:.2f} w {first_x:.2f} {self._py(first_top):.2f} m"]
        for x, top in points[1:]:
            ops.append(f"{x:.2f} {self._py(top):.2f} l")
        ops.append("S 0 G")
        self.page.add(" ".join(ops))

    def paragraph(self, text: str, *, size: float = 9.5, bold: bool = False, indent: float = 0, gray: float = 0, spacing: float = 3) -> None:
        lines = _wrap(text, size, CONTENT_WIDTH - indent, bold)
        self.ensure(len(lines) * (size + spacing))
        for line in lines:
            self.text(MARGIN + indent, self.y, line, size=size, bold=bold, gray=gray)
            self.y += size + spacing

    def heading(self, text: str, *, level: int = 1) -> None:
        size = 20 if level == 1 else 14
        gap = 8 if level == 1 else 6
        self.ensure(size + gap + 6)
        self.text(MARGIN, self.y, text, size=size, bold=True)
        self.y += size + gap

    def table(self, headers: list[str], rows: list[list[str]], widths: list[float], *, font_size: float = 7.8) -> None:
        row_padding = 4.0
        line_height = font_size + 2.2

        def row_height(cells: list[str], bold: bool = False) -> float:
            return max(
                [len(_wrap(cell, font_size, width - 2 * row_padding, bold)) for cell, width in zip(cells, widths)] + [1]
            ) * line_height + 2 * row_padding

        def draw_row(cells: list[str], *, bold: bool = False, header: bool = False) -> None:
            height = row_height(cells, bold)
            if self.y + height > PAGE_HEIGHT - MARGIN:
                self.new_page()
                draw_row(headers, bold=True, header=True)
            x = MARGIN
            if header:
                self.page.add(f"0.94 g {MARGIN:.2f} {self._py(self.y + height):.2f} {sum(widths):.2f} {height:.2f} re f 0 g")
            for cell, width in zip(cells, widths):
                wrapped = _wrap(cell, font_size, width - 2 * row_padding, bold)
                top = self.y + row_padding
                for line in wrapped:
                    self.text(x + row_padding, top, line, size=font_size, bold=bold, gray=0.25 if header else 0)
                    top += line_height
                x += width
            self.line(MARGIN, self.y + height, MARGIN + sum(widths), self.y + height, gray=0.82)
            self.y += height

        draw_row(headers, bold=True, header=True)
        for row in rows:
            draw_row(row)
        self.y += 8

    def chart(self, series: list[tuple[str, list[dict[str, Any]]]]) -> None:
        points_all: list[tuple[float, float]] = []
        for _, rows in series:
            for row in rows:
                try:
                    points_all.append((timestamp_sort_key(row.get("timestamp")), float(row.get("weight"))))
                except (TypeError, ValueError):
                    continue
        if len(points_all) < 2:
            return
        self.ensure(205)
        chart_top = self.y + 8
        chart_height = 150
        chart_left = MARGIN + 38
        chart_width = CONTENT_WIDTH - 50
        min_t = min(t for t, _ in points_all)
        max_t = max(t for t, _ in points_all)
        min_w_raw = min(w for _, w in points_all)
        max_w_raw = max(w for _, w in points_all)
        pad = max(10.0, (max_w_raw - min_w_raw) * 0.1)
        min_w = max(0.0, min_w_raw - pad)
        max_w = max_w_raw + pad

        self.text(MARGIN, self.y, "Gewichtsontwikkeling", size=11, bold=True)
        self.y += 16
        chart_top = self.y
        self.line(chart_left, chart_top, chart_left, chart_top + chart_height, gray=0.65)
        self.line(chart_left, chart_top + chart_height, chart_left + chart_width, chart_top + chart_height, gray=0.65)
        self.text(MARGIN, chart_top - 1, _format_weight(max_w), size=7.5, gray=0.35)
        self.text(MARGIN, chart_top + chart_height - 8, _format_weight(min_w), size=7.5, gray=0.35)

        palette = [
            (0.20, 0.40, 0.65),
            (0.30, 0.60, 0.10),
            (0.80, 0.10, 0.10),
            (0.45, 0.25, 0.55),
            (0.75, 0.45, 0.08),
            (0.05, 0.55, 0.55),
        ]
        for index, (name, rows) in enumerate(series):
            chart_points: list[tuple[float, float]] = []
            for row in rows:
                try:
                    ts = timestamp_sort_key(row.get("timestamp"))
                    weight = float(row.get("weight"))
                except (TypeError, ValueError):
                    continue
                x = chart_left + ((ts - min_t) / max(1.0, max_t - min_t)) * chart_width
                top = chart_top + (1 - (weight - min_w) / max(1.0, max_w - min_w)) * chart_height
                chart_points.append((x, top))
            self.colored_line(chart_points, palette[index % len(palette)])

        self.y = chart_top + chart_height + 12
        legend_x = MARGIN
        for index, (name, _) in enumerate(series):
            color = palette[index % len(palette)]
            if legend_x + _estimate_width(name, 8) + 24 > PAGE_WIDTH - MARGIN:
                self.y += 12
                legend_x = MARGIN
            self.page.add(f"{color[0]:.3f} {color[1]:.3f} {color[2]:.3f} rg {legend_x:.2f} {self._py(self.y + 7):.2f} 10 3 re f 0 g")
            self.text(legend_x + 14, self.y, name, size=8)
            legend_x += _estimate_width(name, 8) + 34
        self.y += 20

    def build(self) -> bytes:
        objects: list[bytes] = []

        def add_object(data: bytes) -> int:
            objects.append(data)
            return len(objects)

        font_regular = add_object(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>")
        font_bold = add_object(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>")
        pages_placeholder = add_object(b"")
        page_refs: list[int] = []

        for page in self.pages:
            stream = bytes(page.operations)
            content_ref = add_object(b"<< /Length " + str(len(stream)).encode("ascii") + b" >>\nstream\n" + stream + b"endstream")
            page_ref = add_object(
                f"<< /Type /Page /Parent {pages_placeholder} 0 R /MediaBox [0 0 {PAGE_WIDTH:.2f} {PAGE_HEIGHT:.2f}] ".encode("ascii")
                + f"/Resources << /Font << /F1 {font_regular} 0 R /F2 {font_bold} 0 R >> >> ".encode("ascii")
                + f"/Contents {content_ref} 0 R >>".encode("ascii")
            )
            page_refs.append(page_ref)

        kids = " ".join(f"{ref} 0 R" for ref in page_refs)
        objects[pages_placeholder - 1] = f"<< /Type /Pages /Kids [{kids}] /Count {len(page_refs)} >>".encode("ascii")
        catalog_ref = add_object(f"<< /Type /Catalog /Pages {pages_placeholder} 0 R >>".encode("ascii"))

        output = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
        offsets = [0]
        for index, obj in enumerate(objects, start=1):
            offsets.append(len(output))
            output.extend(f"{index} 0 obj\n".encode("ascii"))
            output.extend(obj)
            output.extend(b"\nendobj\n")
        xref = len(output)
        output.extend(f"xref\n0 {len(objects) + 1}\n".encode("ascii"))
        output.extend(b"0000000000 65535 f \n")
        for offset in offsets[1:]:
            output.extend(f"{offset:010d} 00000 n \n".encode("ascii"))
        output.extend(
            f"trailer\n<< /Size {len(objects) + 1} /Root {catalog_ref} 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode("ascii")
        )
        return bytes(output)


def build_pdf_export(
    storage: PuppyWeightStorage,
    litter_id: str,
    *,
    puppy_id: str | None = None,
    range_hours: float | None = None,
) -> tuple[str, str, str]:
    """Return filename, MIME type and base64 PDF content."""
    litter = storage.get_litter(litter_id)
    if litter is None:
        raise ValueError("Unknown litter")

    puppies: list[tuple[str, dict[str, Any]]] = []
    for current_id, puppy in litter.get("puppies", {}).items():
        if puppy.get("active", True) is False:
            continue
        if puppy_id is not None and current_id != puppy_id:
            continue
        puppies.append((current_id, puppy))
    if puppy_id is not None and not puppies:
        raise ValueError("Unknown puppy")

    report = _PdfReport()
    title = f"Puppy Weight Tracker - {litter.get('name') or 'Nest'}"
    if puppy_id is not None and puppies:
        title = f"Puppy Weight Tracker - {puppies[0][1].get('name') or 'Puppy'}"
    report.heading(title, level=1)
    local_now = dt_util.as_local(dt_util.now()).strftime("%d-%m-%Y %H:%M")
    period = "Volledige historie" if not range_hours else f"Laatste {range_hours / 24:g} dagen" if range_hours >= 24 else f"Laatste {range_hours:g} uur"
    report.paragraph(f"{period}  |  gegenereerd {local_now}", size=9, gray=0.35)
    report.y += 4

    report.table(
        ["Nest", "Moeder", "Vader", "Pups"],
        [[
            str(litter.get("name") or "—"),
            str(litter.get("mother") or "—"),
            str(litter.get("father") or "—"),
            str(len(puppies)),
        ]],
        [150, 125, 125, 80],
        font_size=8.5,
    )

    warnings: list[str] = []
    summary_rows: list[list[str]] = []
    chart_series: list[tuple[str, list[dict[str, Any]]]] = []
    for current_id, puppy in puppies:
        rows = _active_measurements(puppy, range_hours)
        metrics = calculate_puppy_metrics(storage, litter_id, current_id)
        current_weight = metrics.get("current_weight")
        birth_weight = puppy.get("birth_weight")
        try:
            birth = float(birth_weight) if birth_weight is not None else None
        except (TypeError, ValueError):
            birth = None
        growth_birth = metrics.get("growth_birth_percent")
        growth24 = metrics.get("growth_24h_percent")
        status_label = str(metrics.get("status") or "Onbekend")
        if metrics.get("needs_attention"):
            warnings.append(f"{puppy.get('name') or 'Puppy'}: {status_label}")
        summary_rows.append([
            str(puppy.get("name") or "Puppy"),
            str(puppy.get("collar_color") or "—"),
            "Teef" if puppy.get("sex") == "female" else "Reu" if puppy.get("sex") == "male" else str(puppy.get("sex") or "—"),
            _format_weight(birth),
            _format_weight(current_weight),
            _format_percent(growth24),
            _format_percent(growth_birth),
            status_label,
        ])
        chart_series.append((str(puppy.get("name") or "Puppy"), rows))

    if warnings:
        report.heading("Actuele aandachtspunten", level=2)
        for warning in warnings:
            report.paragraph(f"• {warning}", size=9.5)
    else:
        report.paragraph("Actuele status: geen actieve waarschuwingen voor de pups in dit rapport.", size=9.5, bold=True)
        report.y += 4

    report.heading("Samenvatting", level=2)
    report.table(
        ["Pup", "Band", "Gesl.", "Geboorte", "Huidig", "Groei 24u", "Totaal", "Status"],
        summary_rows,
        [76, 55, 42, 58, 55, 60, 55, 80],
        font_size=7.4,
    )
    report.chart(chart_series)

    for current_id, puppy in puppies:
        report.heading(str(puppy.get("name") or "Puppy"), level=2)
        report.paragraph(
            f"Band: {puppy.get('collar_color') or '—'}  |  Geboren: {_format_local_datetime(puppy.get('birth_time'))}  |  Geboortegewicht: {_format_weight(puppy.get('birth_weight'))}",
            size=8.5,
            gray=0.25,
        )
        rows = _active_measurements(puppy, range_hours)
        table_rows: list[list[str]] = []
        previous: float | None = None
        for measurement in rows:
            try:
                weight = float(measurement.get("weight"))
            except (TypeError, ValueError):
                continue
            diff = weight - previous if previous is not None else None
            previous = weight
            table_rows.append([
                _format_local_datetime(measurement.get("timestamp")),
                _format_weight(weight),
                _format_signed_weight(diff),
                str(measurement.get("kind") or "weging"),
                str(measurement.get("note") or ""),
            ])
        if table_rows:
            report.table(
                ["Datum/tijd", "Gewicht", "Verschil", "Type", "Notitie"],
                table_rows,
                [105, 60, 65, 65, 186],
                font_size=7.6,
            )
        else:
            report.paragraph("Geen geldige metingen in deze periode.", size=9)

    report.ensure(40)
    report.line(MARGIN, report.y, PAGE_WIDTH - MARGIN, report.y, gray=0.8)
    report.y += 8
    report.paragraph(
        "Gegenereerd door Puppy Weight Tracker. Monitoringwaarden zijn bedoeld als hulpmiddel bij het volgen van groei en vervangen geen veterinaire beoordeling.",
        size=7.5,
        gray=0.45,
    )

    pdf_bytes = report.build()
    stamp = dt_util.now().strftime("%Y%m%d-%H%M%S")
    subject = puppies[0][1].get("name") if puppy_id is not None and puppies else litter.get("name")
    filename = f"puppy-weight-tracker-{_safe_filename(subject)}-{stamp}.pdf"
    return filename, "application/pdf", base64.b64encode(pdf_bytes).decode("ascii")
