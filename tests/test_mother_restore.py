from custom_components.puppy_tracker.mother_restore import (
    MOTHER_IMPORT_MERGE,
    MOTHER_IMPORT_NEW,
    apply_mother_import,
    mother_import_options,
    plan_mother_import,
)


def _document() -> dict:
    return {
        "scope": "mother",
        "mother": {
            "id": "source-mother",
            "name": "Luna",
            "profile_note": "Bronprofiel",
            "records": [
                {
                    "id": "record-a",
                    "type": "temperature",
                    "scope": "mother",
                    "mother_id": "source-mother",
                    "puppy_id": None,
                    "litter_id": "litter-1",
                    "occurred_at": "2026-08-31T10:00:00+00:00",
                    "created_at": "2026-08-31T10:00:00+00:00",
                    "updated_at": "2026-08-31T10:00:00+00:00",
                    "deleted": False,
                    "deleted_at": None,
                    "title": None,
                    "note": None,
                    "data": {"temperature_c": 38.4},
                },
                {
                    "id": "record-b",
                    "type": "note",
                    "scope": "mother",
                    "mother_id": "source-mother",
                    "puppy_id": None,
                    "litter_id": "source-litter-2",
                    "occurred_at": "2026-08-31T11:00:00+00:00",
                    "created_at": "2026-08-31T11:00:00+00:00",
                    "updated_at": "2026-08-31T11:00:00+00:00",
                    "deleted": False,
                    "deleted_at": None,
                    "title": "Controle",
                    "note": "Alles rustig",
                    "data": {},
                },
            ],
        },
        "linked_litters": [
            {"id": "litter-1", "name": "Nest A"},
            {"id": "source-litter-2", "name": "Nest B"},
        ],
        "audit_log": [
            {
                "id": "audit-a",
                "action": "add_mother_record",
                "litter_id": "litter-1",
                "record_id": "record-a",
                "details": {"mother_id": "source-mother"},
            },
            {
                "id": "audit-b",
                "action": "add_mother_record",
                "litter_id": "source-litter-2",
                "record_id": "record-b",
                "details": {"mother_id": "source-mother"},
            },
        ],
    }


def test_matching_mother_defaults_to_merge_but_new_profile_remains_available() -> None:
    data = {
        "mothers": {"mother-1": {"id": "mother-1", "name": " luna "}},
        "litters": {},
    }

    options = mother_import_options(data, _document())

    assert options["matching_mother_id"] == "mother-1"
    assert options["default_mode"] == MOTHER_IMPORT_MERGE
    assert options["available_modes"] == [MOTHER_IMPORT_MERGE, MOTHER_IMPORT_NEW]


def test_without_matching_mother_new_profile_is_the_only_valid_default() -> None:
    data = {"mothers": {}, "litters": {}}

    options = mother_import_options(data, _document())

    assert options["matching_mother_id"] is None
    assert options["default_mode"] == MOTHER_IMPORT_NEW
    assert options["available_modes"] == [MOTHER_IMPORT_NEW]


def test_import_plan_never_guesses_unmatched_litter_contexts() -> None:
    data = {
        "mothers": {"mother-1": {"id": "mother-1", "name": "Luna"}},
        "litters": {"litter-1": {"id": "litter-1", "name": "Nest A"}},
    }

    plan = plan_mother_import(data, _document())

    assert plan["mode"] == MOTHER_IMPORT_MERGE
    assert plan["target_mother_id"] == "mother-1"
    assert plan["resolved_litters"] == [
        {
            "source_litter_id": "litter-1",
            "source_litter_name": "Nest A",
            "target_litter_id": "litter-1",
        }
    ]
    assert plan["unresolved_litters"] == [
        {
            "source_litter_id": "source-litter-2",
            "source_litter_name": "Nest B",
            "target_litter_id": None,
        }
    ]
    assert plan["requires_litter_mapping"] is True


def test_merge_cannot_be_forced_without_matching_profile() -> None:
    data = {"mothers": {}, "litters": {}}

    try:
        plan_mother_import(data, _document(), mode=MOTHER_IMPORT_MERGE)
    except ValueError as error:
        assert "No matching mother profile" in str(error)
    else:
        raise AssertionError("merge should have been rejected")


def test_merge_import_keeps_existing_records_and_remaps_imported_ids() -> None:
    data = {
        "schema_version": 8,
        "mothers": {
            "mother-1": {
                "id": "mother-1",
                "name": "Luna",
                "profile_note": "Lokaal profiel",
                "records": [{"id": "existing", "type": "note", "litter_id": "litter-1"}],
            }
        },
        "litters": {
            "litter-1": {"id": "litter-1", "name": "Nest A", "mother_id": "mother-1"},
            "litter-2": {"id": "litter-2", "name": "Nest B", "mother_id": "mother-1"},
        },
        "audit_log": [],
    }

    result = apply_mother_import(
        data,
        _document(),
        litter_map={"source-litter-2": "litter-2"},
        now="2026-08-31T12:00:00+00:00",
    )

    assert result["mode"] == MOTHER_IMPORT_MERGE
    assert result["mother_id"] == "mother-1"
    assert result["imported_records"] == 2
    assert len(data["mothers"]["mother-1"]["records"]) == 1  # input was not mutated
    imported = result["data"]["mothers"]["mother-1"]["records"]
    assert len(imported) == 3
    assert {record["id"] for record in imported[1:]} .isdisjoint({"record-a", "record-b", "existing"})
    assert [record["litter_id"] for record in imported[1:]] == ["litter-1", "litter-2"]
    assert result["data"]["mothers"]["mother-1"]["profile_note"] == "Lokaal profiel"
    imported_audit = result["data"]["audit_log"][:2]
    assert len(imported_audit) == 2
    assert {item["litter_id"] for item in imported_audit} == {"litter-1", "litter-2"}
    assert all(item["id"] not in {"audit-a", "audit-b"} for item in imported_audit)
    assert all(item["details"]["mother_id"] == "mother-1" for item in imported_audit)
    assert all(item["record_id"] in {record["id"] for record in imported[1:]} for item in imported_audit)


def test_new_profile_import_uses_clear_unique_name_and_links_unowned_litters() -> None:
    data = {
        "schema_version": 8,
        "mothers": {"mother-1": {"id": "mother-1", "name": "Luna", "records": []}},
        "litters": {
            "litter-1": {"id": "litter-1", "name": "Nest A", "mother_id": None},
            "litter-2": {"id": "litter-2", "name": "Nest B", "mother_id": None},
        },
        "audit_log": [],
    }

    result = apply_mother_import(
        data,
        _document(),
        mode=MOTHER_IMPORT_NEW,
        litter_map={"source-litter-2": "litter-2"},
        now="2026-08-31T12:00:00+00:00",
    )

    assert result["mother_id"] != "mother-1"
    assert result["mother_name"] == "Luna (geïmporteerd)"
    assert result["data"]["litters"]["litter-1"]["mother_id"] == result["mother_id"]
    assert result["data"]["litters"]["litter-2"]["mother_id"] == result["mother_id"]
    assert len(result["data"]["mothers"][result["mother_id"]]["records"]) == 2


def test_import_refuses_unresolved_or_conflicting_litter_mapping() -> None:
    data = {
        "schema_version": 8,
        "mothers": {
            "mother-1": {"id": "mother-1", "name": "Luna", "records": []},
            "mother-2": {"id": "mother-2", "name": "Other", "records": []},
        },
        "litters": {
            "litter-1": {"id": "litter-1", "name": "Nest A", "mother_id": "mother-1"},
            "litter-2": {"id": "litter-2", "name": "Nest B", "mother_id": "mother-2"},
        },
        "audit_log": [],
    }

    try:
        apply_mother_import(data, _document())
    except ValueError as error:
        assert "Missing litter mapping" in str(error)
    else:
        raise AssertionError("unresolved litter should have been rejected")

    try:
        apply_mother_import(
            data,
            _document(),
            litter_map={"source-litter-2": "litter-2"},
        )
    except ValueError as error:
        assert "linked to another mother" in str(error)
    else:
        raise AssertionError("conflicting mother link should have been rejected")
