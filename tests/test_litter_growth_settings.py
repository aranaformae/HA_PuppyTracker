"""Regression tests for per-litter growth settings."""

from custom_components.puppy_tracker.const import (
    DEFAULT_DOUBLE_WEIGHT_REFERENCE_DAYS,
    DEFAULT_GROWTH_MILESTONES_PERCENT,
    DEFAULT_MILESTONE_PROJECTION_MEASUREMENTS,
)
from custom_components.puppy_tracker.storage import _normalize_litter_growth_analysis


def test_missing_milestone_fields_use_safe_defaults() -> None:
    normalized = _normalize_litter_growth_analysis({})

    assert normalized["growth_milestones_percent"] == list(
        DEFAULT_GROWTH_MILESTONES_PERCENT
    )
    assert (
        normalized["double_weight_reference_days"]
        == DEFAULT_DOUBLE_WEIGHT_REFERENCE_DAYS
    )
    assert (
        normalized["milestone_projection_measurements"]
        == DEFAULT_MILESTONE_PROJECTION_MEASUREMENTS
    )
    assert normalized["min_daily_growth_percent"] is None


def test_custom_milestone_fields_remain_configurable() -> None:
    normalized = _normalize_litter_growth_analysis(
        {
            "growth_milestones_percent": "200, 300, 400",
            "double_weight_reference_days": 12,
            "milestone_projection_measurements": 3,
        }
    )

    assert normalized["growth_milestones_percent"] == [200, 300, 400]
    assert normalized["double_weight_reference_days"] == 12
    assert normalized["milestone_projection_measurements"] == 3
