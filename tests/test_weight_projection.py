"""Broad-window eight-week forecasts remain indicative and time weighted."""

from datetime import datetime, timedelta, timezone

import pytest

from custom_components.puppy_tracker import weight_projection
from custom_components.puppy_tracker.metrics import growth_analysis


BIRTH = datetime(2026, 10, 1, tzinfo=timezone.utc)


def points(values):
    return [(BIRTH + timedelta(days=day), {"weight": weight}) for day, weight in values]


def test_eight_week_forecast_uses_fourteen_day_trend_not_last_intervals(monkeypatch):
    monkeypatch.setattr(weight_projection.dt_util, "now", lambda: BIRTH + timedelta(days=30))
    result = weight_projection.eight_week_weight_projection(points([(0, 10000), (16, 2000), (20, 2400), (24, 2800), (30, 3400)]), BIRTH)
    assert result["weight_grams"] == 6000
    assert result["daily_growth_grams"] == 100
    assert result["sample_span_days"] == 14
    assert result["sample_count"] == 4
    assert result["indicative"] is True
    assert result["target_at"] == (BIRTH + timedelta(weeks=8)).isoformat()


def test_dense_sampling_does_not_distort_the_trend(monkeypatch):
    monkeypatch.setattr(weight_projection.dt_util, "now", lambda: BIRTH + timedelta(days=30))
    sparse = [(16, 2000), (20, 2400), (24, 2800), (30, 3400)]
    dense = sorted([*sparse, (29, 3300), (29.5, 3350), (29.8, 3380)])
    a = weight_projection.eight_week_weight_projection(points(sparse), BIRTH)
    b = weight_projection.eight_week_weight_projection(points(dense), BIRTH)
    assert a["weight_grams"] == b["weight_grams"] == 6000
    assert a["daily_growth_grams"] == b["daily_growth_grams"]


def test_projection_is_exposed_in_canonical_analysis_without_mutation(storage, install_litter, make_measurement, monkeypatch):
    monkeypatch.setattr(weight_projection.dt_util, "now", lambda: BIRTH + timedelta(days=30))
    litter_id, puppy_id = install_litter(puppy_overrides={"birth_time": BIRTH.isoformat()}, measurements=[
        make_measurement(str(day), 400 + day * 100, (BIRTH + timedelta(days=day)).isoformat())
        for day in (16, 20, 24, 30)
    ])
    before = storage.get_data()
    assert growth_analysis(storage, litter_id, puppy_id)["eight_week_weight"]["weight_grams"] == 6000
    assert storage.get_data() == before
    storage.async_save.assert_not_awaited()


@pytest.mark.parametrize("values", [[], [(27, 1000), (28, 1100), (29, 1200), (30, 1300)], [(16, 2000), (20, 1900), (24, 1800), (30, 1700)]])
def test_insufficient_span_or_nonpositive_trend_produces_no_estimate(monkeypatch, values):
    monkeypatch.setattr(weight_projection.dt_util, "now", lambda: BIRTH + timedelta(days=30))
    assert weight_projection.eight_week_weight_projection(points(values), BIRTH)["weight_grams"] is None


def test_unknown_birth_or_target_already_reached(monkeypatch):
    monkeypatch.setattr(weight_projection.dt_util, "now", lambda: BIRTH + timedelta(weeks=8))
    assert weight_projection.eight_week_weight_projection([], BIRTH)["status"] == "past_target"
    assert weight_projection.eight_week_weight_projection([], None)["status"] == "insufficient_data"


def test_boundary_interpolation_limits_the_window_and_variability_produces_a_band(monkeypatch):
    monkeypatch.setattr(weight_projection.dt_util, "now", lambda: BIRTH + timedelta(days=30))
    result = weight_projection.eight_week_weight_projection(points([(10, 1000), (18, 2000), (22, 2500), (25, 2400), (30, 3100)]), BIRTH)
    assert result["sample_start_at"] == (BIRTH + timedelta(days=16)).isoformat()
    assert result["range_min_grams"] <= result["weight_grams"] <= result["range_max_grams"]
    assert result["range_min_grams"] < result["range_max_grams"]
