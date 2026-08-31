from custom_components.puppy_tracker.records import (
    RECORD_SCOPE_MOTHER,
    create_record,
    normalize_record,
)


def test_create_record_supports_mother_scope() -> None:
    record = create_record(
        litter_id="litter-1",
        mother_id="mother-1",
        record_type="temperature",
        occurred_at="2026-08-31T12:00:00+00:00",
        data={"temperature_c": 38.4},
        now="2026-08-31T12:01:00+00:00",
    )

    assert record["scope"] == RECORD_SCOPE_MOTHER
    assert record["litter_id"] == "litter-1"
    assert record["mother_id"] == "mother-1"
    assert record["puppy_id"] is None


def test_normalize_record_repairs_mother_ownership() -> None:
    record = {
        "id": "record-1",
        "type": "note",
        "scope": "litter",
        "litter_id": "wrong-litter",
        "mother_id": None,
        "puppy_id": None,
        "occurred_at": "2026-08-31T12:00:00+00:00",
        "created_at": "2026-08-31T12:00:00+00:00",
        "updated_at": "2026-08-31T12:00:00+00:00",
        "deleted": False,
        "deleted_at": None,
        "title": None,
        "note": None,
        "data": {},
    }

    assert normalize_record(
        record,
        litter_id="litter-1",
        mother_id="mother-1",
        puppy_id=None,
        now="2026-08-31T12:00:00+00:00",
    )
    assert record["scope"] == RECORD_SCOPE_MOTHER
    assert record["litter_id"] == "litter-1"
    assert record["mother_id"] == "mother-1"
    assert record["puppy_id"] is None
