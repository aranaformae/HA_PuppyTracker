"""Central breeder identity used by reports and full backups."""

from typing import Any
from urllib.parse import urlsplit
from .managed_files import validate_file_id

CONTRACT_BREEDER_FIELDS = ("representatives", "street", "postal_code", "city", "phone", "email", "registration", "ubn", "iban", "account_holder")


def normalize_breeder(value: Any = None) -> dict[str, str]:
    """Validate editable text and a same-origin logo path."""
    if value is None:
        value = {}
    if not isinstance(value, dict):
        raise ValueError("Breeder information must be an object")
    result = {}
    for key, limit in (("name", 200), ("contact", 2000), ("logo_url", 2000)):
        raw = value.get(key, "")
        if not isinstance(raw, str) or len(raw) > limit:
            raise ValueError(f"Invalid breeder {key}")
        result[key] = raw.strip()
    logo = result["logo_url"]
    for key in CONTRACT_BREEDER_FIELDS:
        raw = value.get(key, "")
        if not isinstance(raw, str) or len(raw) > 300 or any(ord(c) < 32 for c in raw):
            raise ValueError(f"Invalid breeder {key}")
        if raw.strip():
            result[key] = raw.strip()
    if logo:
        parsed = urlsplit(logo)
        if (
            not logo.startswith("/") or logo.startswith("//")
            or parsed.scheme or parsed.netloc or "\\" in logo
            or any(ord(char) < 32 for char in logo)
        ):
            raise ValueError("Logo must use a local Home Assistant path")
    if value.get("logo_file_id"):
        result["logo_file_id"] = validate_file_id(value["logo_file_id"])
    return result
