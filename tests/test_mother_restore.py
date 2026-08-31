from custom_components.puppy_tracker.mother_restore import (
    MOTHER_IMPORT_MERGE,
    MOTHER_IMPORT_NEW,
    mother_import_options,
    plan_mother_import,
)


def _document() -> dict:
    return {
        "scope": "mother",
        "mother": {"id": "source-mother", "name": "Luna", "records": []},
        "linked_litters": [
            {"id": "litter-1", "name": "Nest A"},
            {"id": "source-litter-2", "name": "Nest B"},
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
