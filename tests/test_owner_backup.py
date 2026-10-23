from __future__ import annotations

import pytest
from copy import deepcopy
from unittest.mock import AsyncMock

from custom_components.puppy_tracker.owners import (
    OwnerStore,
    _normalize,
    final_payment_amount,
    normalize_owner_backup_data,
    PLACEMENT_FIELDS,
)


@pytest.mark.parametrize("phone", ["0612345678", "020 123 4567", "+31 6 12345678", "003212345678"])
def test_owner_phone_remains_text_in_normalization_and_backup(phone):
    owner = _normalize({"name": "Alex", "phone": phone}, owner_id="owner-1")
    assert owner["phone"] == phone
    result = normalize_owner_backup_data({"owners": {"owner-1": owner}})
    assert result["owners"]["owner-1"]["phone"] == phone


def test_owner_backup_normalizes_owner_records() -> None:
    result = normalize_owner_backup_data({
        "owners": {
            "owner-1": {
                "id": "owner-1",
                "name": "Alex",
                "role": "owner",
                "placement_status": "reserved",
                "placement_date": "2026-09-01",
                "expected_pickup_date": "2026-10-01",
                "payment_status": "registration_fee",
                "payment_date": "2026-09-20",
                "contact_preference": "whatsapp",
                "payment_amount": "2500.00",
                "registration_fee_amount": "250",
                "deposit_amount": "500,00",
                "deposit_date": "2026-09-02",
                "payment_method": "bank_transfer",
                "payment_balance": "1400",
                "puppy_preferences": [
                    {"puppy_id": "puppy-red", "note": "Rustige eerste keuze"},
                    {"puppy_id": "puppy-blue", "note": "Goede tweede match"},
                ],
                "status_history": [{"status": "interested", "changed_at": "2026-08-01T10:00:00+00:00"}],
            }
        }
    })

    assert result["owners"]["owner-1"]["name"] == "Alex"
    assert "payment_status" not in result["owners"]["owner-1"]
    assert result["owners"]["owner-1"]["contact_preference"] == "whatsapp"
    result["owners"]["owner-1"] = result["owners"]["owner-1"]["unassigned_placement"]
    assert result["owners"]["owner-1"]["payment_status"] == "registration_fee"
    assert result["owners"]["owner-1"]["expected_pickup_date"] == "2026-10-01"
    assert result["owners"]["owner-1"]["payment_amount"] == "2500"
    assert result["owners"]["owner-1"]["registration_fee_amount"] == "250"
    assert result["owners"]["owner-1"]["deposit_amount"] == "500"
    assert result["owners"]["owner-1"]["deposit_date"] == "2026-09-02"
    assert result["owners"]["owner-1"]["payment_balance"] == "1400"
    assert result["owners"]["owner-1"]["puppy_preferences"] == [
        {"puppy_id": "puppy-red", "note": "Rustige eerste keuze"},
        {"puppy_id": "puppy-blue", "note": "Goede tweede match"},
    ]
    assert final_payment_amount(result["owners"]["owner-1"]) == "1750"
    assert result["owners"]["owner-1"]["status_history"][0]["status"] == "interested"


def test_legacy_owner_address_migrates_losslessly_to_street() -> None:
    owner = _normalize(
        {
            "name": "Alex",
            "address": "Dorpsstraat 12, 1234 AB Amsterdam",
        }
    )

    assert owner["street"] == "Dorpsstraat 12, 1234 AB Amsterdam"
    assert owner["postal_code"] is None
    assert owner["city"] is None
    assert "address" not in owner


def test_split_owner_address_is_preserved() -> None:
    owner = _normalize(
        {
            "name": "Alex",
            "street": "Dorpsstraat 12",
            "postal_code": "1234 AB",
            "city": "Amsterdam",
        }
    )

    assert (owner["street"], owner["postal_code"], owner["city"]) == (
        "Dorpsstraat 12",
        "1234 AB",
        "Amsterdam",
    )


def test_cached_legacy_card_can_still_update_the_street_value() -> None:
    owner = _normalize(
        {"address": "Nieuweweg 5"},
        owner_id="owner-1",
        existing={
            "name": "Alex",
            "street": "Oudeweg 1",
            "postal_code": "1234 AB",
            "city": "Amsterdam",
        },
    )

    assert owner["street"] == "Nieuweweg 5"
    assert owner["postal_code"] == "1234 AB"
    assert owner["city"] == "Amsterdam"


def test_owner_backup_rejects_invalid_owner_record() -> None:
    with pytest.raises(ValueError, match="invalid owner"):
        normalize_owner_backup_data({"owners": {"owner-1": "invalid"}})


@pytest.mark.parametrize(
    ("field", "value", "message"),
    [
        ("expected_pickup_date", "tomorrow", "must be an ISO date"),
        ("deposit_amount", "many", "must be a number"),
        ("registration_fee_amount", "-1", "must be a non-negative number"),
    ],
)
def test_owner_rejects_invalid_payment_fields(field, value, message) -> None:
    with pytest.raises(ValueError, match=message):
        _normalize({"name": "Alex", field: value})


def test_owner_rejects_advance_payments_above_total() -> None:
    with pytest.raises(ValueError, match="cannot exceed total amount"):
        _normalize({
            "name": "Alex",
            "payment_amount": "500",
            "registration_fee_amount": "250",
            "deposit_amount": "300",
        })


def test_owner_preferences_are_ordered_trimmed_and_clearable() -> None:
    owner = _normalize({
        "name": "Alex",
        "puppy_preferences": [
            {"puppy_id": " puppy-red ", "note": " Eerste keuze "},
            {"puppy_id": "puppy-blue", "note": ""},
        ],
    })

    assert owner["puppy_preferences"] == [
        {"puppy_id": "puppy-red", "note": "Eerste keuze"},
        {"puppy_id": "puppy-blue", "note": None},
    ]
    assert _normalize({"name": "Changed"}, existing=owner)["puppy_preferences"] == owner["puppy_preferences"]
    assert _normalize({"name": "Changed", "puppy_preferences": []}, existing=owner)["puppy_preferences"] == []


@pytest.mark.parametrize(
    ("preferences", "message"),
    [
        ("puppy-red", "must be a list"),
        ([{"puppy_id": str(index)} for index in range(4)], "at most 3 items"),
        ([{"puppy_id": "puppy-red"}, {"puppy_id": "puppy-red"}], "must be unique"),
        ([{"note": "Missing puppy"}], "requires a puppy_id"),
        ([{"puppy_id": "puppy-red", "note": 42}], "note must be text"),
        ([{"puppy_id": "puppy-red", "note": "x" * 241}], "at most 240 characters"),
    ],
)
def test_owner_rejects_invalid_puppy_preferences(preferences, message) -> None:
    with pytest.raises(ValueError, match=message):
        _normalize({"name": "Alex", "puppy_preferences": preferences})


def test_final_payment_requires_valid_total() -> None:
    assert final_payment_amount({"registration_fee_amount": "250"}) is None
    assert final_payment_amount({"payment_amount": "NaN"}) is None


@pytest.mark.parametrize("balance", [None, "", "1750", "0", 0])
def test_paid_in_full_always_has_zero_outstanding_without_changing_schedule(balance):
    owner = _normalize({
        "name": "Alex", "payment_amount": "2500", "registration_fee_amount": "250",
        "deposit_amount": "500", "payment_balance": balance,
        "payment_status": "full", "payment_date": "2026-10-21",
    })
    assert owner["payment_balance"] == "0"
    assert owner["payment_date"] == "2026-10-21"
    assert final_payment_amount(owner) == "1750"
    assert normalize_owner_backup_data({"owners": {owner["id"]: owner}})["owners"][owner["id"]]["unassigned_placement"] == {field: owner[field] for field in PLACEMENT_FIELDS}


@pytest.mark.parametrize("status", ["none", "registration_fee", "deposit"])
def test_partial_payment_balances_remain_manually_editable(status):
    owner = _normalize({"name": "Alex", "payment_status": status, "payment_balance": "1400"})
    assert owner["payment_balance"] == "1400"


def test_paid_in_full_legacy_data_does_not_invent_a_payment_date():
    owner = _normalize({"name": "Alex", "payment_status": "full", "payment_balance": "500"})
    assert owner["payment_balance"] == "0"
    assert owner["payment_date"] is None


async def test_final_payment_survives_owner_store_backup_reload_and_can_be_corrected(hass):
    store = OwnerStore(hass)
    store._store.async_save = AsyncMock()
    owner = await store.async_upsert({"name": "Alex", "payment_status": "deposit", "payment_balance": "1750"})
    paid = await store.async_upsert({"payment_status": "full", "payment_date": "2026-10-21"}, owner["id"])
    assert paid["unassigned_placement"]["payment_balance"] == "0"
    restored = OwnerStore(hass)
    restored._store.async_save = AsyncMock()
    await restored.async_restore_backup_data(store.get_backup_data())
    restored._store.async_load = AsyncMock(return_value=restored.get_backup_data())
    await restored.async_load()
    assert restored.get(owner["id"]) == paid
    corrected = await restored.async_upsert({"payment_status": "deposit", "payment_balance": "100"}, owner["id"])
    assert corrected["unassigned_placement"]["payment_balance"] == "100"


async def test_failed_final_payment_save_retains_the_previous_balance(hass):
    store = OwnerStore(hass)
    store._store.async_save = AsyncMock()
    owner = await store.async_upsert({"name": "Alex", "payment_status": "deposit", "payment_balance": "1750"})
    store._store.async_save.side_effect = OSError("disk full")
    with pytest.raises(OSError, match="disk full"):
        await store.async_upsert({"payment_status": "full", "payment_date": "2026-10-21"}, owner["id"])
    assert store.get(owner["id"]) == owner


def test_owner_status_change_is_added_to_history() -> None:
    owner = _normalize(
        {"name": "Alex", "placement_status": "reserved"},
        owner_id="owner-1",
        existing={"name": "Alex", "placement_status": "interested", "created_at": "2026-08-01T10:00:00+00:00"},
    )

    assert owner["status_history"][-1]["status"] == "reserved"
    assert owner["status_history"][-1]["changed_at"]


@pytest.mark.asyncio
async def test_owner_reload_and_restore_preserve_history_timestamps(hass) -> None:
    owner = _normalize({"name": "Alex"}, owner_id="owner-1")
    owner.update(created_at="2025-01-01T10:00:00+00:00", updated_at="2025-02-01T10:00:00+00:00")
    snapshot = normalize_owner_backup_data({"owners": {"owner-1": owner}})
    store = OwnerStore(hass)
    store._store.async_load = AsyncMock(return_value=deepcopy(snapshot))
    store._store.async_save = AsyncMock()
    await store.async_load()
    assert store.get_backup_data() == snapshot
    store._store.async_save.assert_not_awaited()
    await store.async_restore_backup_data(snapshot)
    assert store.get_backup_data() == snapshot


@pytest.mark.asyncio
async def test_owner_reload_adds_new_optional_fields_to_legacy_records(hass) -> None:
    legacy_owner = {
        "id": "owner-1",
        "name": "Alex",
        "role": "owner",
        "placement_status": "reserved",
        "placement_date": "2026-09-01",
        "payment_status": "deposit",
        "payment_date": "2026-09-02",
        "payment_amount": "2500",
        "payment_method": "bank_transfer",
        "payment_balance": "1400",
        "contact_preference": "email",
        "status_history": [],
        "created_at": "2026-08-01T10:00:00+00:00",
        "updated_at": "2026-08-02T10:00:00+00:00",
    }
    store = OwnerStore(hass)
    store._store.async_load = AsyncMock(return_value={"owners": {"owner-1": legacy_owner}})
    store._store.async_save = AsyncMock()

    await store.async_load()

    migrated = store.get("owner-1")
    assert migrated is not None
    migrated = migrated["unassigned_placement"]
    assert migrated["payment_amount"] == "2500"
    assert migrated["expected_pickup_date"] is None
    assert migrated["registration_fee_amount"] is None
    assert migrated["deposit_amount"] is None
    assert migrated["deposit_date"] is None
    assert migrated["puppy_preferences"] == []
    store._store.async_save.assert_awaited_once()


@pytest.mark.asyncio
@pytest.mark.parametrize("operation", ["create", "update", "delete"])
async def test_failed_owner_write_keeps_original_data(hass, operation) -> None:
    store = OwnerStore(hass)
    store._store.async_save = AsyncMock()
    owner = await store.async_upsert({"name": "Alex"})
    before = store.get_backup_data()
    store._store.async_save.side_effect = OSError("disk full")
    with pytest.raises(OSError, match="disk full"):
        if operation == "delete":
            await store.async_delete(owner["id"])
        else:
            await store.async_upsert({"name": "Changed"}, owner["id"] if operation == "update" else None)
    assert store.get_backup_data() == before
