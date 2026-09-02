"""Tests for canonical puppy weight and monitoring metrics."""

from __future__ import annotations

from datetime import datetime, timezone

from custom_components.puppy_tracker import metrics


NOW = datetime(2026, 8, 30, 12, 0, tzinfo=timezone.utc)


def _set_now(monkeypatch) -> None:
    monkeypatch.setattr(metrics.dt_util, "now", lambda: NOW)


def test_current_previous_and_change_use_chronological_order(
    storage,
    install_litter,
    make_measurement,
) -> None:
    measurements = [
        make_measurement("later", 667, "2026-08-28T19:11:00+00:00"),
        make_measurement("earlier", 666, "2026-08-28T20:35:00+02:00"),
    ]
    litter_id, puppy_id = install_litter(measurements=measurements)

    assert metrics.current_weight(storage, litter_id, puppy_id) == 667
    assert metrics.previous_weight(storage, litter_id, puppy_id) == 666
    assert metrics.weight_change(storage, litter_id, puppy_id) == 1


def test_daily_growth_is_normalized_to_24_hours(
    storage,
    install_litter,
    make_measurement,
) -> None:
    measurements = [
        make_measurement("a", 400, "2026-08-30T00:00:00+00:00"),
        make_measurement("b", 420, "2026-08-30T12:00:00+00:00"),
    ]
    litter_id, puppy_id = install_litter(measurements=measurements)

    result = metrics.daily_growth_data(storage, litter_id, puppy_id)

    assert result is not None
    assert result["actual_change_grams"] == 20
    assert result["sample_interval_hours"] == 12
    assert result["daily_change_grams"] == 40
    assert result["daily_change_percent"] == 10


def test_growth_analysis_reports_trend_and_litter_threshold(
    monkeypatch,
    storage,
    install_litter,
    make_measurement,
) -> None:
    _set_now(monkeypatch)
    litter_id, puppy_id = install_litter(
        measurements=[
            make_measurement("a", 400, "2026-08-28T10:00:00+00:00"),
            make_measurement("b", 420, "2026-08-29T10:00:00+00:00"),
            make_measurement("c", 450, "2026-08-30T10:00:00+00:00"),
        ],
        litter_overrides={
            "growth_analysis": {"min_daily_growth_percent": 5.0}
        },
    )

    result = metrics.growth_analysis(storage, litter_id, puppy_id)

    assert result["status_code"] == "on_track"
    assert result["trend_code"] == "rising"
    assert result["measurement_count"] == 3
    assert result["min_daily_growth_percent"] == 5.0


def test_growth_analysis_flags_a_sudden_isolated_weight_change(
    monkeypatch,
    storage,
    install_litter,
    make_measurement,
) -> None:
    _set_now(monkeypatch)
    litter_id, puppy_id = install_litter(
        measurements=[
            make_measurement("a", 400, "2026-08-28T10:00:00+00:00"),
            make_measurement("b", 420, "2026-08-29T10:00:00+00:00"),
            make_measurement("c", 700, "2026-08-30T10:00:00+00:00"),
        ]
    )

    result = metrics.growth_analysis(storage, litter_id, puppy_id)

    assert result["status_code"] == "possible_input_error"
    assert result["data_quality"] == "review"
    assert result["anomaly"]["code"] == "sudden_weight_change"


def test_growth_analysis_compares_current_weight_with_litter_median(
    monkeypatch,
    storage,
    install_litter,
    make_measurement,
) -> None:
    _set_now(monkeypatch)
    litter_id, puppy_id = install_litter(
        measurements=[make_measurement("selected", 500, "2026-08-30T10:00:00+00:00")],
    )
    selected = storage.get_puppy(litter_id, puppy_id)
    assert selected is not None
    for extra_id, weight, name in (("puppy-2", 400, "Pup 2"), ("puppy-3", 450, "Pup 3")):
        storage._data["litters"][litter_id]["puppies"][extra_id] = {
            **selected,
            "id": extra_id,
            "name": name,
            "measurements": [make_measurement(extra_id, weight, "2026-08-30T10:00:00+00:00")],
        }

    result = metrics.growth_analysis(storage, litter_id, puppy_id)

    assert result["litter_comparison"] == {
        "sample_size": 3,
        "rank": 1,
        "median_weight": 450.0,
        "delta_percent": 11.11,
        "position_code": "above_median",
    }


def test_growth_analysis_flags_sustained_weight_loss(
    monkeypatch,
    storage,
    install_litter,
    make_measurement,
) -> None:
    _set_now(monkeypatch)
    litter_id, puppy_id = install_litter(
        measurements=[
            make_measurement("a", 500, "2026-08-28T10:00:00+00:00"),
            make_measurement("b", 490, "2026-08-29T10:00:00+00:00"),
            make_measurement("c", 480, "2026-08-30T10:00:00+00:00"),
        ]
    )

    result = metrics.growth_analysis(storage, litter_id, puppy_id)

    assert result["status_code"] == "sustained_weight_loss"
    assert result["weight_pattern"] == {
        "consecutive_loss_measurements": 2,
        "sustained_loss": True,
    }


def test_growth_analysis_compares_daily_growth_with_litter_tempo(
    monkeypatch,
    storage,
    install_litter,
    make_measurement,
) -> None:
    _set_now(monkeypatch)
    litter_id, puppy_id = install_litter(
        measurements=[
            make_measurement("selected-old", 400, "2026-08-29T10:00:00+00:00"),
            make_measurement("selected-new", 420, "2026-08-30T10:00:00+00:00"),
        ]
    )
    selected = storage.get_puppy(litter_id, puppy_id)
    assert selected is not None
    for extra_id, weights in (("puppy-2", (400, 430)), ("puppy-3", (400, 425))):
        storage._data["litters"][litter_id]["puppies"][extra_id] = {
            **selected,
            "id": extra_id,
            "measurements": [
                make_measurement(f"{extra_id}-old", weights[0], "2026-08-29T10:00:00+00:00"),
                make_measurement(f"{extra_id}-new", weights[1], "2026-08-30T10:00:00+00:00"),
            ],
        }

    result = metrics.growth_analysis(storage, litter_id, puppy_id)

    assert result["litter_growth_comparison"] == {
        "sample_size": 3,
        "rank": 3,
        "median_daily_growth_percent": 6.25,
        "delta_percentage_points": -1.25,
        "position_code": "near_median",
    }


def test_growth_analysis_flags_sustained_low_growth(
    monkeypatch,
    storage,
    install_litter,
    make_measurement,
) -> None:
    _set_now(monkeypatch)
    litter_id, puppy_id = install_litter(
        measurements=[
            make_measurement("a", 400, "2026-08-28T10:00:00+00:00"),
            make_measurement("b", 404, "2026-08-29T10:00:00+00:00"),
            make_measurement("c", 408, "2026-08-30T10:00:00+00:00"),
        ]
    )

    result = metrics.growth_analysis(storage, litter_id, puppy_id)

    assert result["status_code"] == "sustained_low_growth"
    assert result["growth_pattern"]["consecutive_low_growth_samples"] == 2


def test_status_without_measurement_requires_attention(
    monkeypatch,
    storage,
    install_litter,
) -> None:
    _set_now(monkeypatch)
    litter_id, puppy_id = install_litter(measurements=[])

    result = metrics.calculate_puppy_status(storage, litter_id, puppy_id)

    assert result["status_code"] == "no_measurement"
    assert result["needs_attention"] is True


def test_first_24_hours_allows_normal_weight_loss(
    monkeypatch,
    storage,
    install_litter,
    make_measurement,
) -> None:
    _set_now(monkeypatch)
    litter_id, puppy_id = install_litter(
        measurements=[
            make_measurement("latest", 365, "2026-08-30T11:00:00+00:00")
        ],
        puppy_overrides={
            "birth_time": "2026-08-30T00:00:00+00:00",
            "birth_weight": 400.0,
        },
    )

    result = metrics.calculate_puppy_status(storage, litter_id, puppy_id)

    assert result["status_code"] == "first_24h"
    assert result["needs_attention"] is False
    assert result["first_day_weight_change_percent"] == -8.75


def test_first_24_hours_flags_excess_weight_loss(
    monkeypatch,
    storage,
    install_litter,
    make_measurement,
) -> None:
    _set_now(monkeypatch)
    litter_id, puppy_id = install_litter(
        measurements=[
            make_measurement("latest", 350, "2026-08-30T11:00:00+00:00")
        ],
        puppy_overrides={
            "birth_time": "2026-08-30T00:00:00+00:00",
            "birth_weight": 400.0,
        },
    )

    result = metrics.calculate_puppy_status(storage, litter_id, puppy_id)

    assert result["status_code"] == "first_day_excess_weight_loss"
    assert result["needs_attention"] is True
    assert result["weight_loss"] is True


def test_weight_loss_after_first_day_has_priority(
    monkeypatch,
    storage,
    install_litter,
    make_measurement,
) -> None:
    _set_now(monkeypatch)
    litter_id, puppy_id = install_litter(
        measurements=[
            make_measurement("old", 450, "2026-08-30T00:00:00+00:00"),
            make_measurement("latest", 440, "2026-08-30T11:00:00+00:00"),
        ],
        puppy_overrides={"birth_time": "2026-08-28T10:00:00+00:00"},
    )

    result = metrics.calculate_puppy_status(storage, litter_id, puppy_id)

    assert result["status_code"] == "weight_loss"
    assert result["needs_attention"] is True


def test_low_growth_is_flagged_during_monitoring_period(
    monkeypatch,
    storage,
    install_litter,
    make_measurement,
) -> None:
    _set_now(monkeypatch)
    litter_id, puppy_id = install_litter(
        measurements=[
            make_measurement("old", 400, "2026-08-29T11:00:00+00:00"),
            make_measurement("latest", 410, "2026-08-30T11:00:00+00:00"),
        ],
        puppy_overrides={"birth_time": "2026-08-28T10:00:00+00:00"},
    )

    result = metrics.calculate_puppy_status(storage, litter_id, puppy_id)

    assert result["status_code"] == "low_growth"
    assert result["growth_check_active"] is True
    assert result["daily_growth_percent"] == 2.5


def test_litter_growth_override_replaces_global_minimum(
    monkeypatch,
    storage,
    install_litter,
    make_measurement,
) -> None:
    _set_now(monkeypatch)
    litter_id, puppy_id = install_litter(
        measurements=[
            make_measurement("old", 400, "2026-08-29T11:00:00+00:00"),
            make_measurement("latest", 410, "2026-08-30T11:00:00+00:00"),
        ],
        litter_overrides={
            "growth_analysis": {"min_daily_growth_percent": 1.0}
        },
        puppy_overrides={"birth_time": "2026-08-28T10:00:00+00:00"},
    )

    result = metrics.calculate_puppy_status(storage, litter_id, puppy_id)

    assert result["status_code"] == "ok"
    assert result["min_daily_growth_percent"] == 1.0


def test_empty_litter_growth_override_uses_global_setting(
    monkeypatch,
    storage,
    install_litter,
    make_measurement,
) -> None:
    _set_now(monkeypatch)
    litter_id, puppy_id = install_litter(
        measurements=[
            make_measurement("old", 400, "2026-08-29T11:00:00+00:00"),
            make_measurement("latest", 410, "2026-08-30T11:00:00+00:00"),
        ],
        litter_overrides={"growth_analysis": {}},
    )

    result = metrics.calculate_puppy_status(storage, litter_id, puppy_id)

    assert result["status_code"] == "low_growth"
    assert result["min_daily_growth_percent"] == 5.0


def test_stale_weighing_is_flagged_before_growth_rules(
    monkeypatch,
    storage,
    install_litter,
    make_measurement,
) -> None:
    _set_now(monkeypatch)
    litter_id, puppy_id = install_litter(
        measurements=[
            make_measurement("latest", 430, "2026-08-29T10:00:00+00:00")
        ],
        puppy_overrides={"birth_time": "2026-08-27T10:00:00+00:00"},
    )

    result = metrics.calculate_puppy_status(storage, litter_id, puppy_id)

    assert result["status_code"] == "weigh_due"
    assert result["needs_attention"] is True
    assert result["hours_since_weighing"] == 26
