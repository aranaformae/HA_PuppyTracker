"""Dashboard weighing commands with explicit targets and locked preflight checks."""

from datetime import timedelta
import math
from typing import Any

from homeassistant.util import dt as dt_util

from .const import DUPLICATE_CONFIRMATION_SECONDS, DUPLICATE_WEIGHING_WINDOW_SECONDS
from .metrics import preview_weight
from .runtime import PuppyTrackerRuntimeData
from .session import async_record_station_weight, get_session
from .time_utils import parse_timestamp, timestamp_sort_key


async def async_save_dashboard_weight(
    runtime: PuppyTrackerRuntimeData, *, litter_id: str, puppy_id: str, weight: float,
    expected_session: dict[str, Any] | None = None,
    preview: dict[str, Any] | None = None,
) -> str:
    """Save one reviewed weighing, never reading a shared selection or input."""
    if not math.isfinite(weight) or not 0 < weight <= 10000:
        raise ValueError("Voer een geldig gewicht van maximaal 10000 gram in.")

    def validate() -> None:
        if preview is not None:
            current = preview_weight(runtime.storage, litter_id, puppy_id, weight)
            if current["baseline_id"] != preview["baseline_id"]:
                raise ValueError("De vorige meting is gewijzigd. Controleer het gewicht opnieuw.")
            if current["anomaly"] and not preview.get("confirmed"):
                raise ValueError("Controleer de afwijkende meting en bevestig het gewicht opnieuw.")
        measurements = runtime.storage.get_active_measurements(litter_id, puppy_id)
        latest = max(measurements, key=lambda item: timestamp_sort_key(item.get("created_at")), default={})
        created = parse_timestamp(latest.get("created_at"))
        if latest.get("note") != "Dashboardweging" or created is None:
            return
        if not 0 <= (dt_util.now() - created).total_seconds() <= DUPLICATE_WEIGHING_WINDOW_SECONDS:
            return
        session = get_session(runtime)
        pending = session.get("duplicate_pending") or {}
        expiry = parse_timestamp(pending.get("expires_at"))
        if (expiry and dt_util.now() <= expiry and pending.get("puppy_id") == puppy_id
            and pending.get("measurement_id") == latest.get("id") and pending.get("weight") == weight):
            return
        session["duplicate_pending"] = {
            "puppy_id": puppy_id, "measurement_id": latest.get("id"), "weight": weight,
            "expires_at": (dt_util.now() + timedelta(seconds=DUPLICATE_CONFIRMATION_SECONDS)).isoformat(),
        }
        session["message"] = (
            f"{runtime.storage.get_puppy(litter_id, puppy_id).get('name', 'Puppy')} is minder dan "
            f"2 minuten geleden gewogen. Druk nogmaals op Gewicht opslaan om {weight:g} g te bevestigen."
        )
        raise ValueError("Mogelijke dubbele meting. Druk binnen 30 seconden nogmaals op Gewicht opslaan om te bevestigen.")

    return await async_record_station_weight(
        runtime, litter_id=litter_id, puppy_id=puppy_id, weight=weight,
        note="Dashboardweging", expected_session=expected_session, validate_write=validate,
    )
