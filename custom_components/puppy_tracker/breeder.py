"""Central breeder identity used by reports and full backups."""

from typing import Any
from urllib.parse import urlsplit


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
    if logo:
        parsed = urlsplit(logo)
        if (
            not logo.startswith("/") or logo.startswith("//")
            or parsed.scheme or parsed.netloc or "\\" in logo
            or any(ord(char) < 32 for char in logo)
        ):
            raise ValueError("Logo must use a local Home Assistant path")
    return result
