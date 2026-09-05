from __future__ import annotations

import pytest
from copy import deepcopy
from unittest.mock import AsyncMock

from custom_components.puppy_tracker.owners import OwnerStore, _normalize, normalize_owner_backup_data


def test_owner_backup_normalizes_owner_records() -> None:
    result = normalize_owner_backup_data({
        "owners": {
            "owner-1": {
                "id": "owner-1",
                "name": "Alex",
                "role": "owner",
                "placement_status": "reserved",
                "payment_status": "registration_fee",
                "payment_date": "2026-09-02",
                "contact_preference": "whatsapp",
                "payment_amount": "1250",
                "payment_method": "bank_transfer",
                "payment_balance": "250",
                "status_history": [{"status": "interested", "changed_at": "2026-08-01T10:00:00+00:00"}],
            }
        }
    })

    assert result["owners"]["owner-1"]["name"] == "Alex"
    assert result["owners"]["owner-1"]["payment_status"] == "registration_fee"
    assert result["owners"]["owner-1"]["contact_preference"] == "whatsapp"
    assert result["owners"]["owner-1"]["payment_balance"] == "250"
    assert result["owners"]["owner-1"]["status_history"][0]["status"] == "interested"


def test_owner_backup_rejects_invalid_owner_record() -> None:
    with pytest.raises(ValueError, match="invalid owner"):
        normalize_owner_backup_data({"owners": {"owner-1": "invalid"}})


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
    snapshot = {"owners": {"owner-1": owner}}
    store = OwnerStore(hass)
    store._store.async_load = AsyncMock(return_value=deepcopy(snapshot))
    store._store.async_save = AsyncMock()
    await store.async_load()
    assert store.get_backup_data() == snapshot
    store._store.async_save.assert_not_awaited()
    await store.async_restore_backup_data(snapshot)
    assert store.get_backup_data() == snapshot


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
