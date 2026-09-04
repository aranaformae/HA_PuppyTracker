from __future__ import annotations

import pytest

from custom_components.puppy_tracker.owners import _normalize, normalize_owner_backup_data


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
