"""Behavior observation definitions and derived profile calculations."""

from __future__ import annotations

import math
from collections.abc import Iterable, Mapping
from copy import deepcopy
from typing import Any

from .records import RECORD_TYPE_BEHAVIOR_OBSERVATION as BEHAVIOR_RECORD_TYPE
from .time_utils import timestamp_sort_key

BEHAVIOR_SCORE_MIN = 1
BEHAVIOR_SCORE_MAX = 5

# Stable identifiers are stored in dossier records. Labels are translated at
# presentation boundaries so backups remain language independent.
BEHAVIOR_GROUPS: tuple[tuple[str, tuple[str, ...]], ...] = (
    (
        "observations",
        (
            "pick_up_hold",
            "hold_upright",
            "hold_on_back",
            "paw_stimulation",
            "cold_surface",
            "stimulus_recovery",
            "sound_sensitivity",
            "curiosity",
            "confidence",
            "persistence",
            "human_orientation",
            "settle_after_stimulus",
        ),
    ),
    (
        "traits",
        (
            "gentle",
            "bold",
            "calm",
            "spirited",
            "people_focused",
            "independent",
            "sensitive",
            "enterprising",
            "cooperative",
            "strong_willed",
        ),
    ),
)

BEHAVIOR_CRITERIA = frozenset(
    criterion for _group, criteria in BEHAVIOR_GROUPS for criterion in criteria
)


def normalize_behavior_scores(value: Any) -> dict[str, int]:
    """Return valid known 1-5 scores from an untrusted record value."""
    if not isinstance(value, Mapping):
        return {}

    normalized: dict[str, int] = {}
    for criterion, raw_score in value.items():
        if criterion not in BEHAVIOR_CRITERIA or isinstance(raw_score, bool):
            continue
        try:
            score = int(raw_score)
            numeric_score = float(raw_score)
        except (TypeError, ValueError, OverflowError):
            continue
        if not math.isfinite(numeric_score) or numeric_score != score:
            continue
        if BEHAVIOR_SCORE_MIN <= score <= BEHAVIOR_SCORE_MAX:
            normalized[str(criterion)] = score
    return normalized


def validate_behavior_scores(value: Any) -> dict[str, int]:
    """Validate a score mapping for a new or updated observation."""
    normalized = normalize_behavior_scores(value)
    supplied = value if isinstance(value, Mapping) else {}
    if not supplied:
        raise ValueError("A behavior observation requires at least one score")
    if len(normalized) != len(supplied):
        raise ValueError("Behavior scores must use known criteria and whole values from 1 to 5")
    return normalized


def validate_behavior_data(value: Any) -> dict[str, Any]:
    """Validate and normalize one behavior observation data payload."""
    if not isinstance(value, Mapping):
        raise ValueError("Behavior observation data must be an object")
    normalized = deepcopy(dict(value))
    normalized["scores"] = validate_behavior_scores(value.get("scores"))
    for key in ("observer", "context"):
        raw = value.get(key)
        if raw is None:
            normalized.pop(key, None)
            continue
        if not isinstance(raw, str):
            raise ValueError(f"Behavior {key} must be text")
        text = raw.strip()
        if len(text) > 500:
            raise ValueError(f"Behavior {key} is too long")
        if text:
            normalized[key] = text
        else:
            normalized.pop(key, None)
    age_days = value.get("age_days")
    if age_days is not None:
        if isinstance(age_days, bool):
            raise ValueError("Behavior age_days must be a non-negative number")
        try:
            parsed_age = float(age_days)
        except (TypeError, ValueError) as err:
            raise ValueError("Behavior age_days must be a non-negative number") from err
        if not math.isfinite(parsed_age) or parsed_age < 0 or parsed_age > 3650:
            raise ValueError("Behavior age_days must be a non-negative number")
        normalized["age_days"] = round(parsed_age, 2)
    return normalized


def _mean(values: Iterable[float]) -> float | None:
    numbers = list(values)
    if not numbers:
        return None
    return round(sum(numbers) / len(numbers), 2)


def build_behavior_profile(records: Iterable[Mapping[str, Any]]) -> dict[str, Any]:
    """Build a neutral longitudinal profile from active behavior observations."""
    observations: list[dict[str, Any]] = []
    values_by_criterion: dict[str, list[int]] = {
        criterion: [] for criterion in BEHAVIOR_CRITERIA
    }

    for record in records:
        if record.get("deleted") or record.get("type") != BEHAVIOR_RECORD_TYPE:
            continue
        data = record.get("data") if isinstance(record.get("data"), Mapping) else {}
        scores = normalize_behavior_scores(data.get("scores"))
        if not scores:
            continue
        observations.append(
            {
                "id": record.get("id"),
                "occurred_at": record.get("occurred_at"),
                "title": record.get("title"),
                "note": record.get("note"),
                "observer": data.get("observer"),
                "context": data.get("context"),
                "age_days": data.get("age_days"),
                "scores": scores,
                "score": _mean(scores.values()),
            }
        )

    observations.sort(key=lambda item: timestamp_sort_key(item.get("occurred_at")))
    for observation in observations:
        for criterion, score in observation["scores"].items():
            values_by_criterion[criterion].append(score)
    criteria: dict[str, dict[str, Any]] = {}
    for criterion, values in values_by_criterion.items():
        if not values:
            continue
        criteria[criterion] = {
            "average": _mean(values),
            "count": len(values),
            "first": values[0],
            "latest": values[-1],
            "change": values[-1] - values[0] if len(values) > 1 else None,
        }

    groups: dict[str, dict[str, Any]] = {}
    for group, group_criteria in BEHAVIOR_GROUPS:
        averages = [
            criteria[criterion]["average"]
            for criterion in group_criteria
            if criterion in criteria
        ]
        groups[group] = {
            "average": _mean(averages),
            "criteria_scored": len(averages),
            "criteria_total": len(group_criteria),
        }

    criterion_averages = [item["average"] for item in criteria.values()]
    return {
        "observation_count": len(observations),
        "first_observed_at": observations[0]["occurred_at"] if observations else None,
        "last_observed_at": observations[-1]["occurred_at"] if observations else None,
        "final_score": _mean(criterion_averages),
        "criteria_scored": len(criteria),
        "criteria_total": len(BEHAVIOR_CRITERIA),
        "groups": groups,
        "criteria": criteria,
        "observations": observations,
    }
