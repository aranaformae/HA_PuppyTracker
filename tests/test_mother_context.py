from custom_components.puppy_tracker.mother_context import (
    mother_context_payload,
    mother_litter_ids,
    mother_records,
)


def _data() -> dict:
    return {
        "mothers": {
            "mother-1": {
                "id": "mother-1",
                "name": "Luna",
                "profile_note": "Rustige moeder",
                "records": [
                    {
                        "id": "r1",
                        "litter_id": "litter-1",
                        "occurred_at": "2025-01-01T10:00:00+00:00",
                        "created_at": "2025-01-01T10:00:01+00:00",
                        "deleted": False,
                    },
                    {
                        "id": "r2",
                        "litter_id": "litter-2",
                        "occurred_at": "2026-08-31T10:00:00+00:00",
                        "created_at": "2026-08-31T10:00:01+00:00",
                        "deleted": False,
                    },
                    {
                        "id": "r3",
                        "litter_id": "litter-2",
                        "occurred_at": "2026-08-31T11:00:00+00:00",
                        "created_at": "2026-08-31T11:00:01+00:00",
                        "deleted": True,
                    },
                ],
            }
        },
        "litters": {
            "litter-1": {
                "id": "litter-1",
                "name": "Nest 2025",
                "mother_id": "mother-1",
                "birth_date": "2025-01-01",
            },
            "litter-2": {
                "id": "litter-2",
                "name": "Nest 2026",
                "mother_id": "mother-1",
                "birth_date": "2026-08-31",
            },
            "other": {
                "id": "other",
                "name": "Ander nest",
                "mother_id": "mother-2",
            },
        },
    }


def test_mother_litters_are_reusable_and_sorted_newest_first() -> None:
    assert mother_litter_ids(_data(), "mother-1") == ["litter-2", "litter-1"]


def test_mother_records_can_show_all_or_one_litter() -> None:
    mother = _data()["mothers"]["mother-1"]
    assert [item["id"] for item in mother_records(mother)] == ["r2", "r1"]
    assert [item["id"] for item in mother_records(mother, litter_id="litter-2")] == ["r2"]
    assert [item["id"] for item in mother_records(mother, litter_id="litter-2", include_deleted=True)] == ["r3", "r2"]


def test_context_payload_labels_records_with_litter_name() -> None:
    payload = mother_context_payload(_data(), "mother-1")
    assert payload is not None
    assert payload["filter"]["mode"] == "all"
    assert payload["linked_litters"][0] == {"id": "litter-2", "name": "Nest 2026"}
    assert payload["records"][0]["litter_name"] == "Nest 2026"


def test_context_payload_rejects_unlinked_litter_filter() -> None:
    try:
        mother_context_payload(_data(), "mother-1", litter_id="other")
    except ValueError as err:
        assert "not linked" in str(err)
    else:
        raise AssertionError("Expected unlinked litter filter to be rejected")
