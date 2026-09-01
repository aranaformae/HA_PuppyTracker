"""Tests for the pure mother-scope schema migration helper."""

from __future__ import annotations

from custom_components.puppy_tracker.mother_schema import migrate_mother_scope_data


def test_mother_schema_migration_reuses_profile_by_name() -> None:
    data = {
        "litters": {
            "litter-1": {"mother": " Luna "},
            "litter-2": {"mother": "luna"},
        }
    }

    assert migrate_mother_scope_data(data) is True

    mothers = data["mothers"]
    assert len(mothers) == 1
    mother_id = next(iter(mothers))
    assert mothers[mother_id]["name"] == "Luna"
    assert data["litters"]["litter-1"]["mother_id"] == mother_id
    assert data["litters"]["litter-2"]["mother_id"] == mother_id

    assert migrate_mother_scope_data(data) is False


def test_mother_schema_migration_relinks_unknown_source_id_by_name() -> None:
    data = {
        "mothers": {
            "mother-local": {
                "id": "mother-local",
                "name": "Luna",
                "profile_note": "Persistent profile",
                "records": [],
                "created_at": "2026-08-01T08:00:00+00:00",
                "updated_at": "2026-08-31T08:00:00+00:00",
            }
        },
        "litters": {
            "imported-litter": {
                "mother": "Luna",
                "mother_id": "mother-from-other-installation",
            }
        },
    }

    assert migrate_mother_scope_data(data) is True
    assert data["litters"]["imported-litter"]["mother_id"] == "mother-local"
    assert len(data["mothers"]) == 1
    assert data["mothers"]["mother-local"]["profile_note"] == "Persistent profile"
