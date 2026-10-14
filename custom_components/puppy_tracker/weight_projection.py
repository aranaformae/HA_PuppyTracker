"""Indicative eight-week weights from a broad, elapsed-time-weighted window."""

from datetime import datetime, timedelta
from math import isfinite, sqrt
from typing import Any

from homeassistant.util import dt as dt_util


def eight_week_weight_projection(series: list, birth: datetime | None) -> dict[str, Any]:
    result = {"status": "insufficient_data", "weight_grams": None, "range_min_grams": None, "range_max_grams": None, "target_at": None, "method": "time_weighted_14_day_trend"}
    if birth is None:
        return result
    target = birth + timedelta(weeks=8)
    result["target_at"] = target.isoformat()
    now = dt_util.now()
    if now >= target:
        result["status"] = "past_target"
        return result
    unique = {}
    for timestamp, measurement in series:
        weight = measurement.get("weight")
        if birth <= timestamp <= now and isinstance(weight, (int, float)) and isfinite(weight) and weight > 0:
            unique[timestamp] = float(weight)
    points = sorted(unique.items())
    if not points:
        return result
    latest_time, latest_weight = points[-1]
    cutoff = latest_time - timedelta(days=14)
    inside = [(time, weight) for time, weight in points if time >= cutoff]
    if len(inside) < 4:
        return result
    before = [(time, weight) for time, weight in points if time < cutoff]
    if before and inside[0][0] > cutoff:
        a, wa = before[-1]
        b, wb = inside[0]
        baseline = wa + (wb - wa) * (cutoff - a).total_seconds() / (b - a).total_seconds()
        inside.insert(0, (cutoff, baseline))
    start = inside[0][0]
    span = (latest_time - start).total_seconds() / 86400
    if span < 7:
        return result
    # Integrate the piecewise-linear measured curve for a time-weighted fit.
    # Inserting extra samples on that curve leaves the fitted trend unchanged.
    area_y = area_xy = 0.0
    rates = []
    for (ta, wa), (tb, wb) in zip(inside, inside[1:]):
        a, b = (ta - start).total_seconds() / 86400, (tb - start).total_seconds() / 86400
        duration = b - a
        rate = (wb - wa) / duration
        area_y += duration * (wa + wb) / 2
        area_xy += wa * (b * b - a * a) / 2 + rate * ((b ** 3 - a ** 3) / 3 - a * (b * b - a * a) / 2)
        rates.append((duration, rate))
    slope = (area_xy - area_y * span / 2) / (span ** 3 / 12)
    if slope <= 0 or not isfinite(slope):
        return result
    spread = sqrt(sum(duration * (rate - slope) ** 2 for duration, rate in rates) / span)
    remaining = (target - latest_time).total_seconds() / 86400
    result.update({
        "status": "estimated",
        "weight_grams": round(latest_weight + slope * remaining),
        "range_min_grams": round(latest_weight + max(0, slope - spread) * remaining),
        "range_max_grams": round(latest_weight + (slope + spread) * remaining),
        "source_at": latest_time.isoformat(),
        "sample_start_at": start.isoformat(),
        "sample_span_days": round(span, 1),
        "sample_count": sum(time >= cutoff for time in unique),
        "daily_growth_grams": round(slope, 2),
        "remaining_days": round(remaining, 1),
        "indicative": True,
    })
    return result
