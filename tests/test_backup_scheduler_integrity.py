"""Tests for cross-store scheduler backup referential integrity."""

from __future__ import annotations

from copy import deepcopy

import pytest

from custom_components.puppy_tracker.backup_scheduler_integrity import (
    validate_scheduler_references,
)


def _data() -> dict:
    return {
        "mothers": {
            "mother-1": {
                "id": "mother-1",
                "name": "Luna",
                "records": [],
            }
        },
        "litters": {
            "litter-1": {
                "id": "litter-1",
                "mother_id": "mother-1",
                "puppies": {
                    "puppy-1": {"id": "puppy-1", "name": "Groen"},
                },
            },
            "litter-2": {
                "id": "litter-2",
                "mother_id": None,
                "puppies": {
                    "puppy-2": {"id": "puppy-2", "name": "Blauw"},
                },
            },
        },
    }


def _schedulers() -> dict:
    return {
        "version": 1,
        "care_programs": {
            "programs": {
                "care-1": {"id": "care-1", "litter_id": "litter-1"},
            },
            "quarantined_programs": {
                "future-care": {"litter_id": "does-not-exist", "future": True},
            },
        },
        "recurring_reminders": {
            "reminders": {
                "litter-reminder": {
                    "id": "litter-reminder",
                    "owner_scope": "litter",
                    "owner_id": "litter-1",
                    "litter_id": "litter-1",
                },
                "puppy-reminder": {
                    "id": "puppy-reminder",
                    "owner_scope": "puppy",
                    "owner_id": "puppy-1",
                    "litter_id": "litter-1",
                },
                "mother-reminder": {
                    "id": "mother-reminder",
                    "owner_scope": "mother",
                    "owner_id": "mother-1",
                    "litter_id": "litter-1",
                },
            },
            "quarantined_reminders": {
                "future-reminder": {
                    "owner_scope": "puppy",
                    "owner_id": "missing",
                    "litter_id": "missing",
                    "future": True,
                },
            },
        },
    }


def test_valid_scheduler_references_and_opaque_quarantine_pass() -> None:
    validate_scheduler_references(_data(), _schedulers())


def test_care_program_must_reference_existing_litter() -> None:
    schedulers = _schedulers()
    schedulers["care_programs"]["programs"]["care-1"]["litter_id"] = "missing"

    with pytest.raises(ValueError, match="unknown litter"):
        validate_scheduler_references(_data(), schedulers)


def test_puppy_reminder_owner_must_belong_to_declared_litter() -> None:
    schedulers = _schedulers()
    reminder = schedulers["recurring_reminders"]["reminders"]["puppy-reminder"]
    reminder["owner_id"] = "puppy-2"

    with pytest.raises(ValueError, match="outside litter"):
        validate_scheduler_references(_data(), schedulers)


def test_mother_reminder_must_match_litter_link() -> None:
    data = _data()
    data["litters"]["litter-1"]["mother_id"] = None

    with pytest.raises(ValueError, match="not linked"):
        validate_scheduler_references(data, _schedulers())


def test_mother_reminder_must_reference_existing_mother() -> None:
    data = _data()
    data["mothers"] = {}

    with pytest.raises(ValueError, match="unknown mother"):
        validate_scheduler_references(data, _schedulers())


def test_litter_reminder_owner_id_must_equal_litter_id() -> None:
    schedulers = deepcopy(_schedulers())
    reminder = schedulers["recurring_reminders"]["reminders"]["litter-reminder"]
    reminder["owner_id"] = "litter-2"

    with pytest.raises(ValueError, match="does not match litter_id"):
        validate_scheduler_references(_data(), schedulers)
