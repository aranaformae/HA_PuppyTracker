import json

from custom_components.puppy_tracker.mother_backup import (
    MOTHER_EXPORT_VERSION,
    MOTHER_SCHEMA_VERSION,
    build_mother_export_document,
    describe_mother_export,
    serialize_mother_export,
    validate_mother_export_document,
)


def _data() -> dict:
    return {
        "schema_version": MOTHER_SCHEMA_VERSION,
        "mothers": {
            "mother-1": {
                "id": "mother-1",
                "name": "Luna",
                "profile_note": None,
                "records": [
                    {
                        "id": "r1",
                        "scope": "mother",
                        "litter_id": "litter-1",
                        "mother_id": "mother-1",
                        "puppy_id": None,
                        "occurred_at": "2025-01-01T10:00:00+00:00",
                        "created_at": "2025-01-01T10:00:01+00:00",
                        "deleted": False,
                    },
                    {
                        "id": "r2",
                        "scope": "mother",
                        "litter_id": "litter-2",
                        "mother_id": "mother-1",
                        "puppy_id": None,
                        "occurred_at": "2026-08-31T10:00:00+00:00",
                        "created_at": "2026-08-31T10:00:01+00:00",
                        "deleted": False,
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
                "father": "Dutch",
            },
            "litter-2": {
                "id": "litter-2",
                "name": "Nest 2026",
                "mother_id": "mother-1",
                "birth_date": "2026-08-31",
                "father": "Dutch",
            },
        },
        "audit_log": [
            {
                "action": "add_mother_record",
                "litter_id": "litter-1",
                "details": {"mother_id": "mother-1"},
            },
            {
                "action": "add_mother_record",
                "litter_id": "litter-2",
                "details": {"mother_id": "mother-1"},
            },
        ],
    }


def test_full_mother_export_contains_history_from_all_litters() -> None:
    document = build_mother_export_document(_data(), "mother-1")
    assert document["scope"] == "mother"
    assert document["export_version"] == MOTHER_EXPORT_VERSION
    assert document["schema_version"] == MOTHER_SCHEMA_VERSION
    assert document["filter"] == {"mode": "all", "litter_id": None}
    assert {item["litter_id"] for item in document["mother"]["records"]} == {
        "litter-1",
        "litter-2",
    }
    assert len(document["linked_litters"]) == 2
    assert len(document["audit_log"]) == 2


def test_litter_filtered_mother_export_only_contains_that_context() -> None:
    document = build_mother_export_document(
        _data(),
        "mother-1",
        litter_id="litter-2",
    )
    assert document["filter"] == {"mode": "litter", "litter_id": "litter-2"}
    assert [item["id"] for item in document["mother"]["records"]] == ["r2"]
    assert [item["id"] for item in document["linked_litters"]] == ["litter-2"]
    assert len(document["audit_log"]) == 1


def test_mother_export_preview_reports_filter_and_counts() -> None:
    document = build_mother_export_document(_data(), "mother-1")
    preview = describe_mother_export(document)
    assert preview["source_name"] == "Luna"
    assert preview["litter_count"] == 2
    assert preview["record_count"] == 2
    assert preview["filter_mode"] == "all"


def test_mother_export_validation_rejects_foreign_or_unlisted_context() -> None:
    document = build_mother_export_document(_data(), "mother-1")
    document["mother"]["records"][0]["mother_id"] = "other-mother"
    try:
        validate_mother_export_document(document)
    except ValueError as error:
        assert "foreign mother" in str(error)
    else:
        raise AssertionError("foreign mother record should be rejected")

    document = build_mother_export_document(_data(), "mother-1")
    document["mother"]["records"][0]["litter_id"] = "missing-litter"
    try:
        validate_mother_export_document(document)
    except ValueError as error:
        assert "unlisted litter" in str(error)
    else:
        raise AssertionError("unlisted litter context should be rejected")


def test_filtered_export_validation_refuses_records_from_other_litter() -> None:
    document = build_mother_export_document(_data(), "mother-1", litter_id="litter-2")
    document["mother"]["records"].append(
        {
            "id": "foreign-context",
            "scope": "mother",
            "mother_id": "mother-1",
            "puppy_id": None,
            "litter_id": "litter-1",
        }
    )
    document["linked_litters"].append({"id": "litter-1", "name": "Nest 2025"})
    try:
        validate_mother_export_document(document)
    except ValueError as error:
        assert "another litter" in str(error)
    else:
        raise AssertionError("mixed filtered export should be rejected")


def test_mother_export_serializes_to_readable_json_filename() -> None:
    filename, mime_type, content = serialize_mother_export(
        _data(),
        "mother-1",
        litter_id="litter-2",
    )
    assert filename.startswith("puppy-tracker-mother-luna-nest-2026-")
    assert filename.endswith(".json")
    assert mime_type == "application/json;charset=utf-8"
    document = json.loads(content)
    assert document["scope"] == "mother"
    assert document["filter"]["litter_id"] == "litter-2"
