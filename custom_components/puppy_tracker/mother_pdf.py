"""Mother-only PDF projection, reusing the dossier report layout and charts."""

from __future__ import annotations

import base64
import math
from typing import Any

from homeassistant.util import dt as dt_util

from .mother_context import mother_context_payload
from .pdf_export import (
    _PdfReport, _PDF_RECORD_TYPES, _care_result_text, _collar_rgb, _format_care_score,
    _format_date, _format_local_datetime, _pdf_text, _period_label,
    _record_data_text, _report_logo, _safe_filename,
)
from .time_utils import timestamp_sort_key

MOTHER_PDF_SECTIONS = {
    "identity": True, "summary": True, "chart": True, "measurements": True,
    "care": True, "dossier": True, "litter_context": False,
    "profile_note": False, "brand_logo": True, "breeder_name": True,
    "breeder_contact": False,
}
_COPY = {
    "nl": {"title": "Moederdossier", "all": "Alle nesten", "current": "Alleen dit nest",
           "summary": "Samenvatting moederhistorie", "records": "Registraties in deze periode",
           "latest": "Laatste geldige temperatuur", "chart": "Temperatuurontwikkeling",
           "measurements": "Temperatuurmetingen", "no_temperatures": "Geen geldige temperatuurmetingen in deze periode.",
           "care": "Uitgevoerde zorg en herinneringen", "none": "Geen registraties in deze periode.",
           "litters": "Nestcontext", "temperature": "Temperatuur (°C)", "method": "Meetmethode"},
    "en": {"title": "Mother dossier", "all": "All litters", "current": "Current litter only",
           "summary": "Mother history summary", "records": "Records in this period",
           "latest": "Latest valid temperature", "chart": "Temperature development",
           "measurements": "Temperature measurements", "no_temperatures": "No valid temperature measurements in this period.",
           "care": "Completed care and reminders", "none": "No records in this period.",
           "litters": "Litter context", "temperature": "Temperature (°C)", "method": "Measurement method"},
}


def build_mother_pdf(data: dict[str, Any], litter_id: str, *, history_scope: str = "all",
                     range_hours: float | None = None, sections: dict[str, bool] | None = None,
                     dossier_types: list[str] | None = None, language: str = "nl",
                     branding: dict[str, str] | None = None) -> tuple[str, str, str]:
    """Build from one main-storage snapshot; never read puppy or buyer records."""
    litter = data.get("litters", {}).get(litter_id)
    if not isinstance(litter, dict):
        raise ValueError("Unknown litter")
    if language not in _COPY or history_scope not in {"all", "current"}:
        raise ValueError("Unsupported mother PDF language or history scope")
    if range_hours is not None and (not math.isfinite(range_hours) or range_hours < 0):
        raise ValueError("Invalid report period")
    mother_id = str(litter.get("mother_id") or "")
    context = mother_context_payload(data, mother_id, litter_id=litter_id if history_scope == "current" else None)
    if context is None:
        raise ValueError("This litter has no linked mother profile")
    mother = context["mother"]
    visible = {**MOTHER_PDF_SECTIONS, **(sections or {})}
    if set(visible) - MOTHER_PDF_SECTIONS.keys():
        raise ValueError("Unsupported mother PDF section")
    t = lambda key: _pdf_text(language, key)
    text = _COPY[language]
    now = dt_util.now()
    cutoff = now.timestamp() - range_hours * 3600 if range_hours else None
    records = [record for record in context["records"]
               if record.get("scope", "mother") == "mother"
               and record.get("mother_id", mother_id) == mother_id
               and (cutoff is None or timestamp_sort_key(record.get("occurred_at")) >= cutoff)]
    records.sort(key=lambda record: timestamp_sort_key(record.get("occurred_at")))
    temperatures = [record for record in records if record.get("type") == "temperature"]
    care = [record for record in records if record.get("type") != "temperature" and
            ((record.get("data") or {}).get("care_occurrence_id") or (record.get("data") or {}).get("recurring_reminder_id"))]
    care_ids = {record["id"] for record in care}
    ordinary = [record for record in records if record.get("type") != "temperature" and record["id"] not in care_ids
                and (dossier_types is None or record.get("type") in dossier_types)]
    points = []
    temperature_values = {}
    for record in temperatures:
        value = (record.get("data") or {}).get("temperature_c")
        try:
            number = float(str(value).replace(",", "."))
        except (ValueError, TypeError):
            continue
        if math.isfinite(number) and 20 <= number <= 45 and timestamp_sort_key(record.get("occurred_at")) > 0:
            points.append({"timestamp": record["occurred_at"], "weight": number, "litter_id": record.get("litter_id"), "litter_name": record.get("litter_name")})
            temperature_values[record["id"]] = number
    def temp(value: float) -> str:
        return f"{value:.1f}".replace(".", "," if language == "nl" else ".") + " °C"

    branding = branding or {}
    report = _PdfReport(_report_logo(branding.get("logo_base64")) if visible["brand_logo"] else None)
    report.brand_logo()
    if visible["breeder_name"] and branding.get("name"):
        report.paragraph(str(branding["name"])[:200], size=14, bold=True)
    if visible["breeder_contact"] and branding.get("contact"):
        for line in str(branding["contact"])[:2000].splitlines():
            report.paragraph(line, size=9)
    report.heading(f"{text['title']} - {mother.get('name') or t('mother')}", level=1)
    report.paragraph(f"{text[history_scope]}{': ' + str(litter.get('name') or litter_id) if history_scope == 'current' else ''} | {_period_label(range_hours, language)}", size=9)
    report.paragraph(f"{t('generated')}: {_format_local_datetime(now.isoformat(), language)}", size=8, gray=0.35)
    if visible["identity"]:
        report.heading(t("identity_details"), level=2)
        report.table([t("details"), t("value")], [
            [t("registered_name"), mother.get("registered_name") or "—"],
            [t("call_name"), mother.get("name") or "—"],
            [t("birth_date"), _format_date(mother.get("birth_date"), language)],
            [t("breed"), mother.get("breed") or "—"],
            [t("wala"), mother.get("wala_number") or "—"],
            [t("chip"), mother.get("chip_number") or "—"],
        ], [140, 341], keep_together=True)
        if visible["profile_note"]:
            report.heading(t("profile_note"), level=3)
            report.paragraph(str(mother.get("profile_note") or text["none"]))
    if visible["litter_context"]:
        report.heading(text["litters"], level=2)
        litters = context["linked_litters"] if history_scope == "all" else [{"id": litter_id, "name": litter.get("name")}]
        report.table([t("litter"), t("birth_date")], [[item.get("name") or item["id"],
            _format_date(data.get("litters", {}).get(item["id"], {}).get("birth_date"), language)] for item in litters], [300, 181])
    if visible["summary"]:
        report.heading(text["summary"], level=2)
        report.table([t("details"), t("value")], [[text["records"], str(len(records))],
            [text["measurements"], str(len(points))], [text["care"], str(len(care))],
            [text["latest"], f"{temp(points[-1]['weight'])} · {_format_local_datetime(points[-1]['timestamp'], language)}" if points else "—"]], [240, 241], keep_together=True)
    if visible["chart"]:
        grouped = {}
        for point in points:
            grouped.setdefault(point["litter_id"], []).append(point)
        series = [(f"{mother.get('name') or t('mother')}{' - ' + str(rows[0]['litter_name']) if len(grouped) > 1 else ''}", rows,
                   (0.0, 0.5, 0.6) if index == 0 else _collar_rgb(None, index)) for index, rows in enumerate(grouped.values())]
        if not report.chart(series, language,
                            title=text["chart"], format_value=lambda value: _format_care_score(value, language) + " °C", min_padding=0.1):
            report.heading(text["chart"], level=2)
            report.paragraph(text["no_temperatures"])
    if visible["measurements"]:
        report.heading(text["measurements"], level=2)
        if temperatures:
            report.table([t("date_time"), t("litter"), text["temperature"], text["method"], t("note")], [[
                _format_local_datetime(record.get("occurred_at"), language), str(record.get("litter_name") or "—"),
                temp(temperature_values[record["id"]]) if record["id"] in temperature_values else "—",
                str((record.get("data") or {}).get("method") or "—"), str(record.get("note") or ""),
            ] for record in temperatures], [91, 90, 70, 80, 150], font_size=7.5)
        else:
            report.paragraph(text["no_temperatures"])
    def render_records(rows: list[dict[str, Any]], heading: str, is_care: bool = False) -> None:
        report.heading(heading, level=2)
        if not rows:
            report.paragraph(text["none"])
            return
        table = []
        for record in rows:
            values = record.get("data") or {}
            display_record = record
            if is_care and values.get("care_occurrence_id"):
                extra_keys = set(values.get("care_data") or {})
                display_record = {**record, "data": {key: value for key, value in values.items()
                                  if not key.startswith("care_") and key not in extra_keys}}
            details = _record_data_text(display_record, language)
            if is_care and values.get("care_occurrence_id"):
                details += f"\n{t('status')}: {t('missed') if values.get('care_status') == 'missed' else t('completed')}\n{_care_result_text(values, language)}"
                if values.get("care_instruction"):
                    details += f"\n{t('instruction')}: {values['care_instruction']}"
                if values.get("care_score") is not None:
                    details += f"\n{t('score')}: {_format_care_score(values['care_score'], language)}"
            table.append([_format_local_datetime(record.get("occurred_at"), language), str(record.get("litter_name") or "—"),
                          str(record.get("title") or _PDF_RECORD_TYPES[language].get(record.get("type"), t("details"))), details, str(record.get("note") or "")])
        report.table([t("date_time"), t("litter"), t("details"), t("result"), t("note")], table, [77, 80, 95, 130, 99], font_size=7)
    if visible["care"]:
        render_records(care, text["care"], True)
    if visible["dossier"]:
        render_records(ordinary, t("dossier"))
    stamp = now.strftime("%Y%m%d-%H%M%S")
    return f"puppy-tracker-mother-{_safe_filename(mother.get('name'))}-{stamp}.pdf", "application/pdf", base64.b64encode(report.build()).decode("ascii")
