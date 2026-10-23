"""Reusable contacts must not share financial/placement state between litters."""

from copy import deepcopy
from unittest.mock import AsyncMock
from inspect import unwrap

import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.puppy_tracker import owner_api
from custom_components.puppy_tracker.const import DOMAIN
from custom_components.puppy_tracker.owners import OwnerStore, normalize_owner_backup_data, owner_for_litter
from custom_components.puppy_tracker.runtime import PuppyTrackerRuntimeData


@pytest.fixture
def owners(hass):
    store = OwnerStore(hass)
    store._store.async_save = AsyncMock()
    return store


def legacy_owner():
    return {"id": "o1", "name": "Alex", "phone": "0612345678", "notes": "Contact note",
            "payment_amount": "2500", "deposit_amount": "500", "payment_balance": "2000",
            "placement_status": "reserved", "puppy_preferences": [{"puppy_id": "p1", "note": "First choice"}],
            "created_at": "2025-01-01T10:00:00+00:00", "updated_at": "2025-02-01T10:00:00+00:00"}


@pytest.mark.parametrize("source", ["link", "preference"])
async def test_legacy_migration_uses_only_unambiguous_litter(owners, source):
    legacy = legacy_owner()
    if source == "link":
        legacy["puppy_preferences"] = []
    snapshot = {"owners": {"o1": legacy}}
    litters = {"l1": {"puppies": {"p1": {"id": "p1", "owner_ids": ["o1"] if source == "link" else []}}},
               "l2": {"puppies": {}}}
    owners._store.async_load = AsyncMock(return_value=deepcopy(snapshot))
    await owners.async_load(litters)
    contact = owners.get("o1")
    assert set(contact["placements"]) == {"l1"}
    assert contact["unassigned_placement"] is None
    assert contact["placements"]["l1"]["payment_balance"] == "2000"
    assert contact["created_at"] == legacy["created_at"]
    assert contact["updated_at"] == legacy["updated_at"]
    assert contact["notes"] == "Contact note"
    assert "payment_amount" not in contact
    assert snapshot["owners"]["o1"] == legacy
    saved = owners.get_backup_data()
    owners._store.async_save.reset_mock()
    owners._store.async_load = AsyncMock(return_value=saved)
    await owners.async_load(litters)
    assert owners.get_backup_data() == saved
    owners._store.async_save.assert_not_awaited()


@pytest.mark.parametrize("litters", [{}, {
    "l1": {"puppies": {"p1": {"id": "p1"}}},
    "l2": {"puppies": {"p2": {"id": "p2", "owner_ids": ["o1"]}}},
}])
def test_ambiguous_or_unlinked_history_stays_unassigned_without_duplicating_money(litters):
    contact = normalize_owner_backup_data({"owners": {"o1": legacy_owner()}}, litters)["owners"]["o1"]
    assert contact["placements"] == {}
    assert contact["unassigned_placement"]["deposit_amount"] == "500"
    assert contact["unassigned_placement"]["puppy_preferences"][0]["puppy_id"] == "p1"


async def test_separate_nest_dossiers_preserve_payments_preferences_history_and_notes(owners):
    contact = await owners.async_upsert({"name": "Alex", "notes": "Shared contact note", "litter_id": "l1",
        "placement_status": "reserved", "payment_amount": "2500", "deposit_amount": "500", "payment_balance": "2000",
        "puppy_preferences": [{"puppy_id": "p1"}], "placement_notes": "First litter"})
    first = deepcopy(contact["placements"]["l1"])
    contact = await owners.async_upsert({"litter_id": "l2", "payment_amount": "3000", "payment_balance": "3000",
        "puppy_preferences": [{"puppy_id": "p2"}], "placement_notes": "Second litter"}, contact["id"])
    assert contact["placements"]["l1"] == first
    assert contact["placements"]["l2"]["deposit_amount"] is None
    assert contact["placements"]["l2"]["placement_status"] == "interested"
    contact = await owners.async_upsert({"litter_id": "l2", "payment_status": "full", "placement_status": "placed",
                                       "archived": True}, contact["id"])
    assert contact["placements"]["l1"] == first
    assert contact["placements"]["l2"]["payment_balance"] == "0"
    assert contact["placements"]["l2"]["status_history"][-1]["status"] == "placed"
    before_cases = deepcopy(contact["placements"])
    renamed = await owners.async_upsert({"name": "Alex Updated", "phone": "0612345678"}, contact["id"])
    assert renamed["placements"] == before_cases
    assert renamed["notes"] == "Shared contact note"
    assert renamed["unassigned_placement"] is None
    await owners.async_restore_backup_data(owners.get_backup_data())
    assert owners.get(renamed["id"]) == renamed


async def test_assigning_old_dossier_moves_it_without_overwriting_other_nests(owners):
    await owners.async_restore_backup_data({"owners": {"o1": legacy_owner()}})
    contact = await owners.async_upsert({"litter_id": "l2", "payment_amount": "1000"}, "o1")
    before = deepcopy(contact)
    with pytest.raises(ValueError, match="already has a dossier"):
        await owners.async_upsert({"litter_id": "l2", "move_unassigned": True}, "o1")
    assert owners.get("o1") == before
    contact = await owners.async_upsert({"litter_id": "l1", "move_unassigned": True}, "o1")
    assert contact["unassigned_placement"] is None
    assert contact["placements"]["l1"] == before["unassigned_placement"]
    assert contact["placements"]["l2"] == before["placements"]["l2"]


@pytest.mark.parametrize("operation", ["new_case", "change_case", "move"])
async def test_failed_dossier_writes_leave_every_dossier_and_contact_intact(owners, operation):
    await owners.async_restore_backup_data({"owners": {"o1": legacy_owner()}})
    await owners.async_upsert({"litter_id": "l1", "payment_amount": "1000"}, "o1")
    before = owners.get_backup_data()
    owners._store.async_save.side_effect = OSError("disk full")
    data = {"litter_id": "l1" if operation == "change_case" else "l2", "name": "Changed"}
    if operation == "move":
        data["move_unassigned"] = True
    with pytest.raises(OSError):
        await owners.async_upsert(data, "o1")
    assert owners.get_backup_data() == before


@pytest.mark.parametrize("data", [
    {"version": 99, "owners": {}},
    {"owners": {"o1": {"name": "Alex", "placements": []}}},
    {"owners": {"o1": {"name": "Alex", "placements": {"": {}}}}},
    {"owners": {"o1": {"name": "Alex", "placements": {"l1": {"archived": "false"}}}}},
    {"owners": {"o1": {"name": "Alex", "placements": {}, "unassigned_placement": []}}},
])
def test_backup_rejects_invalid_dossier_structures(data):
    with pytest.raises(ValueError):
        normalize_owner_backup_data(data)


async def test_litter_export_never_borrows_another_payment_or_unassigned_balance(owners):
    await owners.async_restore_backup_data({"owners": {"o1": legacy_owner()}})
    contact = await owners.async_upsert({"litter_id": "l1", "payment_amount": "3000"}, "o1")
    assert owner_for_litter(contact, "l1")["payment_amount"] == "3000"
    assert "payment_amount" not in owner_for_litter(contact, "l2")
    assert "payment_amount" not in owner_for_litter(contact, "missing")
    assert owners.get("o1") == contact


@pytest.fixture
async def owner_client(hass, hass_ws_client, owners, storage):
    entry = MockConfigEntry(domain=DOMAIN)
    entry.runtime_data = PuppyTrackerRuntimeData(storage=storage, owners=owners)
    entry.add_to_hass(hass)
    owner_api.async_setup_owner_api(hass)
    return await hass_ws_client(hass)


async def test_websocket_requires_explicit_litter_and_rejects_foreign_preferences(owner_client, owners, install_litter):
    litter_id, puppy_id = install_litter()
    await owner_client.send_json_auto_id({"type": "puppy_tracker/owners/save", "name": "Alex", "payment_amount": "1000"})
    assert not (await owner_client.receive_json())["success"]
    for target in ("missing", litter_id):
        await owner_client.send_json_auto_id({"type": "puppy_tracker/owners/save", "name": "Alex", "litter_id": target,
                                             "puppy_preferences": [{"puppy_id": "foreign-puppy"}]})
        assert not (await owner_client.receive_json())["success"]
    assert owners.get_all() == []
    await owner_client.send_json_auto_id({"type": "puppy_tracker/owners/save", "name": "Alex", "litter_id": litter_id,
                                         "puppy_preferences": [{"puppy_id": puppy_id}], "placement_notes": "Nest notes"})
    response = await owner_client.receive_json()
    assert response["success"]
    assert response["result"]["owner"]["placements"][litter_id]["placement_notes"] == "Nest notes"


async def test_link_creates_membership_without_copying_unassigned_money(owner_client, owners, storage, install_litter):
    litter_id, puppy_id = install_litter()
    await owners.async_restore_backup_data({"owners": {"o1": legacy_owner()}})
    old = owners.get("o1")["unassigned_placement"]
    await owner_client.send_json_auto_id({"type": "puppy_tracker/owners/link", "litter_id": litter_id,
                                         "puppy_id": puppy_id, "owner_ids": ["o1"]})
    assert (await owner_client.receive_json())["success"]
    contact = owners.get("o1")
    assert contact["placements"][litter_id]["payment_amount"] is None
    assert contact["unassigned_placement"] == old
    assert storage.get_litter(litter_id)["puppies"][puppy_id]["owner_ids"] == ["o1"]


async def test_link_failure_rolls_back_contact_memberships(hass, owner_client, owners, storage, install_litter):
    litter_id, puppy_id = install_litter()
    await owners.async_restore_backup_data({"owners": {"o1": legacy_owner()}})
    before = owners.get_backup_data()
    before_storage = storage.get_data()
    storage.async_save.side_effect = OSError("disk full")
    with pytest.raises(OSError, match="disk full"):
        await unwrap(owner_api.websocket_link_owners)(hass, None, {
            "id": 1, "litter_id": litter_id, "puppy_id": puppy_id, "owner_ids": ["o1"],
        })
    assert owners.get_backup_data() == before
    assert storage.get_data() == before_storage


async def test_contact_delete_cannot_leave_orphaned_puppy_links(owner_client, owners, install_litter):
    install_litter(puppy_overrides={"owner_ids": ["o1"]})
    await owners.async_restore_backup_data({"owners": {"o1": legacy_owner()}})
    before = owners.get_backup_data()
    await owner_client.send_json_auto_id({"type": "puppy_tracker/owners/delete", "owner_id": "o1"})
    response = await owner_client.receive_json()
    assert not response["success"]
    assert response["error"]["code"] == "owner_linked"
    assert owners.get_backup_data() == before


@pytest.mark.parametrize("broken", [{"owners": {"o1": "broken"}}, {"owners": []}, {"version": 99, "owners": {}}])
async def test_invalid_upgrade_never_discards_or_saves_over_contacts(owners, broken):
    await owners.async_upsert({"name": "Existing"})
    before = owners.get_backup_data()
    owners._store.async_save.reset_mock()
    owners._store.async_load = AsyncMock(return_value=broken)
    with pytest.raises(ValueError):
        await owners.async_load()
    assert owners.get_backup_data() == before
    owners._store.async_save.assert_not_awaited()


async def test_complete_backup_roundtrip_keeps_all_contacts_and_litter_dossiers(hass, owners, storage, install_litter):
    from custom_components.puppy_tracker.backup import build_export_document, prepare_import
    from custom_components.puppy_tracker.backup_transaction import async_apply_import_transaction
    from tests.test_backup_transaction import _runtime_stores, TARGET_CARE_SETTINGS

    first, first_pup = install_litter(litter_id="l1", puppy_id="p1", puppy_overrides={"owner_ids": ["o1"]})
    second, second_pup = install_litter(litter_id="l2", puppy_id="p2", puppy_overrides={"owner_ids": ["o1"]})
    await owners.async_restore_backup_data({"owners": {"o1": legacy_owner()}})
    await owners.async_upsert({"litter_id": first, "payment_amount": "2500"}, "o1")
    await owners.async_upsert({"litter_id": second, "payment_amount": "3000", "archived": True}, "o1")
    before = owners.get_backup_data()
    schedulers = {"version": 1, "care_programs": {"programs": {}},
                  "recurring_reminders": {"reminders": {}}, "care_templates": {"templates": {}}}
    document = build_export_document(storage, scope="full", care_reminder_settings=TARGET_CARE_SETTINGS,
                                    scheduler_data=schedulers, owner_data=before)
    assert document["owners"] == before
    plan = prepare_import(storage, document, mode="replace_all")
    await owners.async_delete("o1")
    care, programs, recurring, templates = _runtime_stores(hass)
    await async_apply_import_transaction(storage, plan, care_reminders=care, care_programs=programs,
        recurring_reminders=recurring, care_templates=templates, owners=owners)
    assert owners.get_backup_data() == before
    assert storage.get_litter(first)["puppies"][first_pup]["owner_ids"] == ["o1"]
    assert storage.get_litter(second)["puppies"][second_pup]["owner_ids"] == ["o1"]
