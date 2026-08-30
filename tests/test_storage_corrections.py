"""Regression tests for non-destructive correction chains."""

from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_correct_delete_restore_round_trip(
    storage,
    install_litter,
    make_measurement,
) -> None:
    original = make_measurement("a", 400, "2026-08-28T10:00:00+00:00")
    litter_id, puppy_id = install_litter(measurements=[original])

    corrected_id = await storage.async_correct_measurement(
        litter_id,
        puppy_id,
        "a",
        new_weight=420,
        new_timestamp="2026-08-28T10:00:00+00:00",
        reason="test",
    )

    assert storage.get_measurement(litter_id, puppy_id, "a")["superseded_by"] == corrected_id
    assert [item["weight"] for item in storage.get_active_measurements(litter_id, puppy_id)] == [420]

    await storage.async_delete_weight(litter_id, puppy_id, corrected_id)

    assert storage.get_measurement(litter_id, puppy_id, corrected_id)["deleted"] is True
    assert storage.get_measurement(litter_id, puppy_id, "a")["superseded_by"] is None
    assert [item["weight"] for item in storage.get_active_measurements(litter_id, puppy_id)] == [400]

    restored_id = await storage.async_restore_weight(litter_id, puppy_id, corrected_id)

    assert restored_id == corrected_id
    assert storage.get_measurement(litter_id, puppy_id, corrected_id)["deleted"] is False
    assert storage.get_measurement(litter_id, puppy_id, "a")["superseded_by"] == corrected_id
    assert [item["weight"] for item in storage.get_active_measurements(litter_id, puppy_id)] == [420]


@pytest.mark.asyncio
async def test_restore_after_chain_changed_creates_new_terminal_version(
    storage,
    install_litter,
    make_measurement,
) -> None:
    original = make_measurement("a", 400, "2026-08-28T10:00:00+00:00")
    litter_id, puppy_id = install_litter(measurements=[original])

    b_id = await storage.async_correct_measurement(
        litter_id,
        puppy_id,
        "a",
        new_weight=420,
        new_timestamp="2026-08-28T10:00:00+00:00",
    )
    await storage.async_delete_weight(litter_id, puppy_id, b_id)

    c_id = await storage.async_correct_measurement(
        litter_id,
        puppy_id,
        "a",
        new_weight=430,
        new_timestamp="2026-08-28T10:00:00+00:00",
    )
    restored_id = await storage.async_restore_weight(litter_id, puppy_id, b_id)

    assert restored_id not in {"a", b_id, c_id}
    assert storage.get_measurement(litter_id, puppy_id, b_id)["deleted"] is True
    assert storage.get_measurement(litter_id, puppy_id, c_id)["superseded_by"] == restored_id
    restored = storage.get_measurement(litter_id, puppy_id, restored_id)
    assert restored["source_measurement_id"] == c_id
    assert restored["weight"] == 420
    assert [item["id"] for item in storage.get_active_measurements(litter_id, puppy_id)] == [restored_id]


@pytest.mark.asyncio
async def test_birth_correction_keeps_profile_in_sync(
    storage,
    install_litter,
    make_measurement,
) -> None:
    birth = make_measurement(
        "birth-a",
        400,
        "2026-08-28T10:00:00+00:00",
        kind="birth",
        note="Geboortegewicht",
    )
    litter_id, puppy_id = install_litter(
        measurements=[birth],
        puppy_overrides={
            "birth_measurement_id": "birth-a",
            "birth_weight": 400.0,
            "birth_time": "2026-08-28T10:00:00+00:00",
        },
    )

    replacement_id = await storage.async_correct_measurement(
        litter_id,
        puppy_id,
        "birth-a",
        new_weight=405,
        new_timestamp="2026-08-28T10:05:00+00:00",
        reason="correctie geboortegewicht",
    )
    puppy = storage.get_puppy(litter_id, puppy_id)

    assert puppy["birth_measurement_id"] == replacement_id
    assert puppy["birth_weight"] == 405
    assert puppy["birth_time"] == "2026-08-28T10:05:00+00:00"
    assert storage.get_measurement(litter_id, puppy_id, replacement_id)["kind"] == "birth"


@pytest.mark.asyncio
async def test_weight_only_correction_preserves_original_seconds(
    storage,
    install_litter,
    make_measurement,
) -> None:
    """Changing only weight must not round the measurement time to a minute."""
    from custom_components.puppy_tracker.metrics import (
        current_weight,
        previous_weight,
        weight_change,
    )

    previous = make_measurement(
        "previous",
        400,
        "2026-08-28T10:00:20+00:00",
        created_at="2026-08-28T10:00:21+00:00",
    )
    current = make_measurement(
        "current",
        420,
        "2026-08-28T10:00:47.654321+00:00",
        created_at="2026-08-28T10:00:48+00:00",
    )
    litter_id, puppy_id = install_litter(measurements=[previous, current])

    replacement_id = await storage.async_correct_measurement(
        litter_id,
        puppy_id,
        "current",
        new_weight=425,
        new_timestamp=None,
        reason="gewicht corrigeren",
    )

    replacement = storage.get_measurement(litter_id, puppy_id, replacement_id)
    assert replacement["timestamp"] == "2026-08-28T10:00:47.654321+00:00"
    assert [
        item["id"] for item in storage.get_active_measurements(litter_id, puppy_id)
    ] == ["previous", replacement_id]
    assert previous_weight(storage, litter_id, puppy_id) == 400
    assert current_weight(storage, litter_id, puppy_id) == 425
    assert weight_change(storage, litter_id, puppy_id) == 25


@pytest.mark.asyncio
async def test_weight_only_correction_keeps_order_for_equal_measurement_times(
    storage,
    install_litter,
    make_measurement,
) -> None:
    """Created-at remains the deterministic order when measurement times match."""
    from custom_components.puppy_tracker.metrics import (
        current_weight,
        previous_weight,
    )

    first = make_measurement(
        "first",
        400,
        "2026-08-28T10:00:00+00:00",
        created_at="2026-08-28T10:00:01+00:00",
    )
    second = make_measurement(
        "second",
        420,
        "2026-08-28T10:00:00+00:00",
        created_at="2026-08-28T10:00:02+00:00",
    )
    litter_id, puppy_id = install_litter(measurements=[first, second])

    replacement_id = await storage.async_correct_measurement(
        litter_id,
        puppy_id,
        "second",
        new_weight=425,
        new_timestamp=None,
    )

    active = storage.get_active_measurements(litter_id, puppy_id)
    assert [item["id"] for item in active] == ["first", replacement_id]
    assert previous_weight(storage, litter_id, puppy_id) == 400
    assert current_weight(storage, litter_id, puppy_id) == 425
