from custom_components.puppy_tracker.mother_integrity import inspect_mother_data


def _record() -> dict:
    return {
        "id": "record-1",
        "type": "temperature",
        "scope": "mother",
        "litter_id": "litter-1",
        "mother_id": "mother-1",
        "puppy_id": None,
        "occurred_at": "2026-08-31T10:00:00+00:00",
        "created_at": "2026-08-31T10:00:00+00:00",
        "updated_at": "2026-08-31T10:00:00+00:00",
        "deleted": False,
        "deleted_at": None,
        "data": {"temperature_c": "38.4"},
    }


def _data() -> dict:
    return {
        "mothers": {
            "mother-1": {
                "id": "mother-1",
                "name": "Luna",
                "records": [_record()],
            }
        },
        "litters": {
            "litter-1": {
                "id": "litter-1",
                "name": "Nest",
                "mother_id": "mother-1",
            }
        },
    }


def test_valid_mother_profile_and_record_are_healthy() -> None:
    changed, report = inspect_mother_data(_data(), repair=False)
    assert changed is False
    assert report["healthy"] is True
    assert report["checked"] == {"mothers": 1, "mother_records": 1}


def test_mother_record_ownership_is_safely_repaired_from_container() -> None:
    data = _data()
    record = data["mothers"]["mother-1"]["records"][0]
    record["scope"] = "litter"
    record["mother_id"] = "wrong"
    record["puppy_id"] = "puppy-1"

    changed, report = inspect_mother_data(data, repair=True)

    assert changed is True
    assert record["scope"] == "mother"
    assert record["mother_id"] == "mother-1"
    assert record["puppy_id"] is None
    assert report["repairs_applied"] == 3


def test_conflicting_litter_owner_is_reported_not_guessed() -> None:
    data = _data()
    data["litters"]["litter-1"]["mother_id"] = "mother-2"

    changed, report = inspect_mother_data(data, repair=True)

    assert changed is False
    assert report["healthy"] is False
    assert report["unresolved_critical"] >= 1
    assert report["issue_counts"]["mother_record_litter_owner_mismatch"] == 1
