"""Elapsed-time growth windows over effective measurements, without extrapolation."""

from bisect import bisect_right
from math import isfinite
from typing import Any


def rolling_growth(series: list) -> dict[str, Any]:
    points = {}
    for timestamp, measurement in series:
        weight = measurement.get("weight")
        if isinstance(weight, (int, float)) and isfinite(weight) and weight > 0:
            points[timestamp.timestamp()] = (timestamp.isoformat(), float(weight))
    times = sorted(points)
    weights = [points[time][1] for time in times]
    area = [0.0]
    for index in range(1, len(times)):
        area.append(area[-1] + (times[index] - times[index - 1]) * (weights[index] + weights[index - 1]) / 2)
    result = {"growth48": [], "growth72": [], "weightAverage48": []}
    for index, time in enumerate(times):
        for hours in (48, 72):
            start = time - hours * 3600
            if start < times[0]:
                continue
            baseline_index = bisect_right(times, start) - 1
            elapsed = start - times[baseline_index]
            baseline = weights[baseline_index]
            if elapsed:
                next_index = baseline_index + 1
                baseline += (weights[next_index] - baseline) * elapsed / (times[next_index] - times[baseline_index])
            result[f"growth{hours}"].append({
                "timestamp": points[time][0],
                "value": round((weights[index] - baseline) / baseline * 100, 2),
                "change_grams": round(weights[index] - baseline, 1),
                "interpolated": bool(elapsed),
            })
            if hours == 48:
                start_area = area[baseline_index] + elapsed * (weights[baseline_index] + baseline) / 2
                result["weightAverage48"].append({
                    "timestamp": points[time][0],
                    "value": round((area[index] - start_area) / (hours * 3600), 1),
                })
    return result
