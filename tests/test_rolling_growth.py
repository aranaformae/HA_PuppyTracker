"""Elapsed-time windows and shared anomaly preflight regression coverage."""

from datetime import datetime, timedelta, timezone

import pytest

from custom_components.puppy_tracker.metrics import measurement_series, preview_weight, weight_change_anomaly
from custom_components.puppy_tracker.rolling_growth import rolling_growth


def series(points):
    start = datetime(2026, 10, 1, tzinfo=timezone.utc)
    return [(start + timedelta(hours=hours), {"weight": weight}) for hours, weight in points]


def test_rolling_windows_interpolate_without_extrapolating():
    result = rolling_growth(series([(0, 400), (24, 440), (60, 500), (84, 540)]))
    assert result["growth48"][-1]["value"] == pytest.approx((540 - 460) / 460 * 100, abs=.01)
    assert result["growth48"][-1]["interpolated"] is True
    assert result["growth72"][-1]["value"] == pytest.approx((540 - 420) / 420 * 100, abs=.01)
    assert result["weightAverage48"][-1]["value"] == 500
    assert rolling_growth(series([(0, 400), (47, 500)]))["growth48"] == []
    assert rolling_growth([])["weightAverage48"] == []


def test_average_is_not_changed_by_extra_samples_on_the_same_linear_curve():
    sparse = rolling_growth(series([(0, 400), (48, 500)]))
    dense = rolling_growth(series([(0, 400), (12, 425), (24, 450), (48, 500)]))
    assert sparse["weightAverage48"][-1]["value"] == dense["weightAverage48"][-1]["value"] == 450
    assert rolling_growth(series([(0, 300), (0, 400), (48, 500)]))["weightAverage48"][-1]["value"] == 450


def test_preview_and_stored_anomaly_use_the_same_rule_without_mutation(storage, install_litter, make_measurement):
    litter_id, puppy_id = install_litter(measurements=[
        make_measurement("m1", 400, "2026-10-01T00:00:00Z"),
        make_measurement("m2", 410, "2026-10-02T00:00:00Z"),
    ])
    before = storage.get_data()
    preview = preview_weight(storage, litter_id, puppy_id, 600)
    proposed = [*measurement_series(storage, litter_id, puppy_id), (datetime.now(timezone.utc), {"weight": 600})]
    assert preview["anomaly"] == weight_change_anomaly(proposed)
    assert preview["baseline_id"] == "m2"
    assert storage.get_data() == before
    storage.async_save.assert_not_awaited()
    assert preview_weight(storage, litter_id, puppy_id, 420)["anomaly"] is None
    with pytest.raises(ValueError):
        preview_weight(storage, litter_id, "missing", 500)


def test_rolling_growth_ignores_deleted_and_superseded_versions(storage, install_litter, make_measurement):
    litter_id, puppy_id = install_litter(measurements=[
        make_measurement("m1", 400, "2026-10-01T00:00:00Z"),
        make_measurement("old", 900, "2026-10-03T00:00:00Z", superseded_by="m2"),
        make_measurement("deleted", 999, "2026-10-03T00:00:00Z", deleted=True),
        make_measurement("m2", 500, "2026-10-03T00:00:00Z"),
    ])
    assert rolling_growth(measurement_series(storage, litter_id, puppy_id))["growth48"][-1]["value"] == 25
