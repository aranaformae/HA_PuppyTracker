"""Tests for longitudinal puppy behavior profiles."""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock

import pytest

from custom_components.puppy_tracker.behavior import (
    BEHAVIOR_CRITERIA,
    BEHAVIOR_RECORD_TYPE,
    build_behavior_profile,
    normalize_behavior_scores,
    validate_behavior_scores,
)
from custom_components.puppy_tracker.integrity import inspect_and_repair_data
from custom_components.puppy_tracker.mother_integrity import inspect_mother_data
from custom_components.puppy_tracker.mother_storage import MotherScopeStorage


def _record(record_id: str, occurred_at: str, scores: dict, **data) -> dict:
    return {
        "id": record_id,
        "type": BEHAVIOR_RECORD_TYPE,
        "occurred_at": occurred_at,
        "deleted": False,
        "data": {"scores": scores, **data},
    }


def test_behavior_profile_uses_equal_weight_per_criterion() -> None:
    profile = build_behavior_profile(
        [
            _record("later", "2026-09-02T10:00:00+00:00", {"curiosity": 5}),
            _record(
                "first",
                "2026-09-01T10:00:00+00:00",
                {"curiosity": 3, "calm": 1},
                observer="Fabien",
            ),
        ]
    )

    assert profile["observation_count"] == 2
    assert profile["criteria"]["curiosity"] == {
        "average": 4.0,
        "count": 2,
        "first": 3,
        "latest": 5,
        "change": 2,
    }
    assert profile["criteria"]["calm"]["average"] == 1.0
    assert profile["final_score"] == 2.5
    assert profile["observations"][0]["observer"] == "Fabien"


def test_behavior_profile_ignores_deleted_other_and_invalid_records() -> None:
    deleted = _record("deleted", "2026-09-01T10:00:00+00:00", {"calm": 5})
    deleted["deleted"] = True
    other = _record("other", "2026-09-01T10:00:00+00:00", {"calm": 4})
    other["type"] = "note"

    profile = build_behavior_profile(
        [deleted, other, _record("invalid", "2026-09-01T10:00:00+00:00", {"calm": 9})]
    )

    assert profile["observation_count"] == 0
    assert profile["final_score"] is None


def test_behavior_score_validation_is_strict_and_future_safe() -> None:
    assert normalize_behavior_scores({"calm": "4", "unknown": 3, "bold": 2.5}) == {
        "calm": 4
    }
    assert validate_behavior_scores({"calm": 1, "bold": "5"}) == {
        "calm": 1,
        "bold": 5,
    }
    assert validate_behavior_scores({"calm": 1.0}) == {"calm": 1}

    with pytest.raises(ValueError, match="at least one"):
        validate_behavior_scores({})
    with pytest.raises(ValueError, match="known criteria"):
        validate_behavior_scores({"calm": 6})
    with pytest.raises(ValueError, match="known criteria"):
        validate_behavior_scores({"calm": float("nan")})


async def test_behavior_records_require_a_puppy_and_valid_scores(
    storage, install_litter
) -> None:
    litter_id, puppy_id = install_litter()

    record_id = await storage.async_add_record(
        litter_id,
        puppy_id=puppy_id,
        record_type=BEHAVIOR_RECORD_TYPE,
        data={"scores": {"calm": 4}, "observer": "  Fabien  ", "age_days": 21},
    )
    record = storage.get_record(litter_id, record_id, puppy_id)
    assert record["data"] == {
        "scores": {"calm": 4},
        "observer": "Fabien",
        "age_days": 21.0,
    }

    with pytest.raises(ValueError, match="belong to a puppy"):
        await storage.async_add_record(
            litter_id,
            record_type=BEHAVIOR_RECORD_TYPE,
            data={"scores": {"calm": 3}},
        )

    with pytest.raises(ValueError, match="belong to a puppy"):
        await storage.async_change_record_owner(
            litter_id,
            record_id,
            source_puppy_id=puppy_id,
            target_scope="litter",
        )

    assert storage.get_record(litter_id, record_id, puppy_id) is not None


async def test_behavior_record_cannot_move_to_mother_scope(hass) -> None:
    storage = MotherScopeStorage(hass)
    storage._data = {
        "litters": {
            "litter-1": {
                "id": "litter-1",
                "mother_id": "mother-1",
                "records": [],
                "puppies": {
                    "puppy-1": {"id": "puppy-1", "records": []},
                },
            },
        },
        "mothers": {
            "mother-1": {"id": "mother-1", "records": []},
        },
        "audit_log": [],
    }
    storage._lock = asyncio.Lock()
    storage.async_save = AsyncMock()
    record_id = await storage.async_add_record(
        "litter-1",
        puppy_id="puppy-1",
        record_type=BEHAVIOR_RECORD_TYPE,
        data={"scores": {"calm": 3}},
    )

    with pytest.raises(ValueError, match="belong to a puppy"):
        await storage.async_change_record_owner(
            "litter-1",
            record_id,
            source_puppy_id="puppy-1",
            source_scope="puppy",
            target_scope="mother",
        )

    assert storage.get_record("litter-1", record_id, "puppy-1") is not None
    assert storage.get_records("litter-1", mother_id="mother-1") == []

    with pytest.raises(ValueError, match="belong to a puppy"):
        await storage.async_add_record(
            "litter-1",
            mother_id="mother-1",
            record_type=f" {BEHAVIOR_RECORD_TYPE} ",
            data={"scores": {"calm": 3}},
        )


def _stored_behavior_record(*, scope: str, scores: dict) -> dict:
    return {
        "id": "behavior-1",
        "type": BEHAVIOR_RECORD_TYPE,
        "scope": scope,
        "litter_id": "litter-1",
        "mother_id": "mother-1" if scope == "mother" else None,
        "puppy_id": "puppy-1" if scope == "puppy" else None,
        "occurred_at": "2026-09-01T10:00:00+00:00",
        "created_at": "2026-09-01T10:00:00+00:00",
        "updated_at": "2026-09-01T10:00:00+00:00",
        "deleted": False,
        "deleted_at": None,
        "title": None,
        "note": None,
        "data": {"scores": scores},
    }


def test_integrity_enforces_behavior_scope_and_score_contract() -> None:
    invalid_litter_record = _stored_behavior_record(scope="litter", scores={"calm": 3})
    invalid_puppy_record = _stored_behavior_record(scope="puppy", scores={"unknown": 3})
    data = {
        "litters": {
            "litter-1": {
                "id": "litter-1",
                "records": [invalid_litter_record],
                "puppies": {
                    "puppy-1": {
                        "id": "puppy-1",
                        "records": [invalid_puppy_record],
                        "measurements": [],
                        "birth_weight": None,
                        "birth_time": None,
                        "birth_measurement_id": None,
                    }
                },
            }
        }
    }

    changed, report = inspect_and_repair_data(data, repair=False)

    assert changed is False
    assert report["issue_counts"]["behavior_record_requires_puppy"] == 1
    assert report["issue_counts"]["invalid_behavior_record_data"] == 1
    assert report["unresolved_critical"] == 2


def test_mother_integrity_rejects_behavior_records() -> None:
    data = {
        "mothers": {
            "mother-1": {
                "id": "mother-1",
                "name": "Luna",
                "records": [_stored_behavior_record(scope="mother", scores={"calm": 3})],
            }
        },
        "litters": {
            "litter-1": {"id": "litter-1", "mother_id": "mother-1"},
        },
    }

    changed, report = inspect_mother_data(data, repair=False)

    assert changed is False
    assert report["issue_counts"]["behavior_record_requires_puppy"] == 1
    assert report["unresolved_critical"] == 1


def test_behavior_criteria_cover_the_reference_form() -> None:
    assert len(BEHAVIOR_CRITERIA) == 22
