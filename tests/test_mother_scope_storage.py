from custom_components.puppy_tracker.mother_storage import MotherScopeStorage


def _storage_with(data: dict) -> MotherScopeStorage:
    storage = object.__new__(MotherScopeStorage)
    storage._data = data
    return storage


def test_existing_litter_mother_is_migrated_to_profile() -> None:
    storage = _storage_with(
        {
            "schema_version": 7,
            "mothers": {},
            "litters": {
                "litter-1": {"id": "litter-1", "mother": "Luna", "puppies": {}},
            },
        }
    )

    assert storage._migrate_mothers()
    litter = storage._data["litters"]["litter-1"]
    mother_id = litter["mother_id"]
    assert mother_id
    assert storage._data["mothers"][mother_id]["name"] == "Luna"
    assert storage._data["mothers"][mother_id]["records"] == []


def test_same_mother_name_is_reused_across_litters() -> None:
    storage = _storage_with(
        {
            "schema_version": 7,
            "mothers": {},
            "litters": {
                "litter-1": {"id": "litter-1", "mother": "Luna", "puppies": {}},
                "litter-2": {"id": "litter-2", "mother": " luna ", "puppies": {}},
            },
        }
    )

    assert storage._migrate_mothers()
    first = storage._data["litters"]["litter-1"]["mother_id"]
    second = storage._data["litters"]["litter-2"]["mother_id"]
    assert first == second
    assert len(storage._data["mothers"]) == 1
