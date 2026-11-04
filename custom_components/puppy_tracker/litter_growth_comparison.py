"""Age-aligned, read-only nest-period comparisons over effective weights.

This module is deliberately on demand, outside routine status/notification
metrics. Every puppy is sampled once, and every historical litter has equal
influence regardless of its size or weighing frequency.
"""

from bisect import bisect_left
from datetime import datetime
from statistics import median

from homeassistant.util import dt as dt_util

from .metrics import birth_datetime, finite_number, measurement_series

DAYS = 56
MAX_GAP_HOURS = 72
MIN_BAND_LITTERS = 5


def _curve(storage, litter_id: str, puppy_id: str, puppy: dict, now: datetime) -> dict:
    birth = birth_datetime(storage, litter_id, puppy_id)
    result = {"id": puppy_id, "name": puppy.get("name"),
              "collar_color": puppy.get("collar_color"), "points": [], "birth_weight": None}
    if birth is None or birth > now:
        return result
    birth_weight = finite_number(puppy.get("birth_weight"))
    if birth_weight is not None and birth_weight > 0:
        result["birth_weight"] = birth_weight
    # A recorded birth weight provides a genuine boundary, not an extrapolation.
    weights = {0.0: birth_weight} if result["birth_weight"] else {}
    for stamp, row in measurement_series(storage, litter_id, puppy_id):
        value = finite_number(row.get("weight"))
        if birth <= stamp <= now and value is not None and value > 0:
            weights[(stamp - birth).total_seconds() / 86400] = value
    times = sorted(weights)
    for day in range(DAYS + 1):
        if day > (now - birth).total_seconds() / 86400:
            break
        index = bisect_left(times, day)
        interpolated = False
        if index < len(times) and times[index] == day:
            value = weights[times[index]]
        elif 0 < index < len(times) and (times[index] - times[index - 1]) * 24 <= MAX_GAP_HOURS:
            a, b = times[index - 1], times[index]
            value = weights[a] + (weights[b] - weights[a]) * (day - a) / (b - a)
            interpolated = True
        else:
            continue
        result["points"].append({"day": day, "weight_grams": value,
            "birth_factor": value / birth_weight if result["birth_weight"] else None,
            "interpolated": interpolated})
    return result


def _curves(storage, litter_id: str, litter: dict, now: datetime) -> list[dict]:
    # Include inactive pups: archived/placed puppies are part of the nest history.
    return [_curve(storage, litter_id, key, puppy, now)
            for key, puppy in (litter.get("puppies") or {}).items()]


def _relative_curves(curves: list[dict]) -> list[dict]:
    indexed = {curve["id"]: {p["day"]: p for p in curve["points"]} for curve in curves}
    result = []
    for curve in curves:
        points = []
        for point in curve["points"]:
            day = point["day"]
            peers = [by_day[day] for key, by_day in indexed.items() if key != curve["id"] and day in by_day]
            if not peers:
                continue
            peer_weights = [p["weight_grams"] for p in peers]
            middle = median(peer_weights)
            growth_ratio = None
            previous = indexed[curve["id"]].get(day - 7)
            peer_rates = [(by_day[day]["weight_grams"] - by_day[day - 7]["weight_grams"]) / 7
                          for key, by_day in indexed.items()
                          if key != curve["id"] and day in by_day and day - 7 in by_day]
            if previous and peer_rates and median(peer_rates) > 0:
                growth_ratio = (point["weight_grams"] - previous["weight_grams"]) / 7 / median(peer_rates) * 100
            points.append({**point, "peer_count": len(peers),
                "peer_median_grams": middle, "peer_mean_grams": sum(peer_weights) / len(peers),
                "relative_weight_percent": point["weight_grams"] / middle * 100,
                "relative_growth_percent": growth_ratio,
                "interpolated": point["interpolated"] or any(p["interpolated"] for p in peers)})
        by_day = {point["day"]: point for point in points}
        for point in points:
            previous = by_day.get(point["day"] - 7)
            peers_now = {key for key, samples in indexed.items() if key != curve["id"] and point["day"] in samples}
            peers_before = {key for key, samples in indexed.items() if key != curve["id"] and point["day"] - 7 in samples}
            point["position_change_points"] = (
                point["relative_weight_percent"] - previous["relative_weight_percent"]
                if previous and peers_now == peers_before else None)
        result.append({**curve, "age_points": curve["points"], "points": points, "summary": points[-1] if points else None,
                       "weeks": [{"week": week, "day": week * 7, "comparison": by_day.get(week * 7),
                                  "age_point": indexed[curve["id"]].get(week * 7)} for week in range(1, 9)]})
    return result


def _first_birth(storage, litter_id: str, litter: dict) -> datetime | None:
    births = [birth_datetime(storage, litter_id, key) for key in (litter.get("puppies") or {})]
    return min((birth for birth in births if birth is not None), default=None)


def _matches(litter: dict, other: dict, reference_filter: str) -> bool:
    if reference_filter == "same_mother":
        return bool(litter.get("mother_id") and litter["mother_id"] == other.get("mother_id"))
    if reference_filter == "same_size":
        size = (litter.get("growth_analysis") or {}).get("size_class")
        return bool(size and size != "unknown" and size == (other.get("growth_analysis") or {}).get("size_class"))
    return True


def _percentile(values: list[float], fraction: float) -> float:
    ordered = sorted(values)
    position = (len(ordered) - 1) * fraction
    lower = int(position)
    upper = min(lower + 1, len(ordered) - 1)
    return ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower)


def build_litter_growth_comparison(storage, litter_id: str, *, include_history: bool = False,
                                  reference_filter: str = "all", now: datetime | None = None) -> dict:
    """Compare at exact elapsed ages; never use future weights or extrapolation."""
    litter = storage.get_litter(litter_id)
    if litter is None:
        raise ValueError("Unknown litter")
    if reference_filter not in ("all", "same_mother", "same_size"):
        raise ValueError("Unknown reference filter")
    now = dt_util.as_utc(now or dt_util.now())
    curves = _curves(storage, litter_id, litter, now)
    result = {"litter_id": litter_id, "max_age_days": DAYS,
              "max_interpolation_gap_hours": MAX_GAP_HOURS, "puppies": _relative_curves(curves),
              "history": None}
    if not include_history:
        return result
    birth = _first_birth(storage, litter_id, litter)
    sources = []
    if birth:
        for key, other in storage.get_litters().items():
            if key == litter_id or not _matches(litter, other, reference_filter):
                continue
            other_birth = _first_birth(storage, key, other)
            if other_birth is None or other_birth >= birth:
                continue
            other_curves = _curves(storage, key, other, now)
            points = []
            for day in range(DAYS + 1):
                samples = [p for curve in other_curves for p in curve["points"]
                           if p["day"] == day and p["birth_factor"] is not None]
                values = [p["birth_factor"] for p in samples]
                if len(values) >= 2:
                    points.append({"day": day, "birth_factor": median(values), "puppy_count": len(values),
                                   "interpolated": any(p["interpolated"] for p in samples)})
            # Day zero alone says nothing about development.
            if any(point["day"] > 0 for point in points):
                sources.append({"id": key, "name": other.get("name"), "points": points})
    reference = []
    for day in range(DAYS + 1):
        entries = [point for source in sources for point in source["points"] if point["day"] == day]
        if not entries:
            continue
        values = [entry["birth_factor"] for entry in entries]
        enough = len(values) >= MIN_BAND_LITTERS
        reference.append({"day": day, "birth_factor": median(values), "litter_count": len(values),
                          "puppy_count": sum(entry["puppy_count"] for entry in entries),
                          "interpolated": any(entry["interpolated"] for entry in entries),
                          "lower_factor": _percentile(values, .25) if enough else None,
                          "upper_factor": _percentile(values, .75) if enough else None})
    result["history"] = {"filter": reference_filter, "sources": sources, "reference": reference,
                          "minimum_band_litters": MIN_BAND_LITTERS}
    return result
