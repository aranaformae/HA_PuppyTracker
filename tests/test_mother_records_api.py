"""Exercise mother dossier responses against real records and follow-up logic."""

from copy import deepcopy
from datetime import date
from unittest.mock import AsyncMock

import pytest
from homeassistant.auth.const import GROUP_ID_READ_ONLY
from homeassistant.setup import async_setup_component

from custom_components.puppy_tracker import mother_api, upcoming
from custom_components.puppy_tracker.mother_api import _mother_records_payload
from custom_components.puppy_tracker.mother_storage import MotherScopeStorage


@pytest.fixture
async def mother_dossier(hass, storage, install_litter, monkeypatch):
    for litter_id, mother_id in (("litter-1", "mother-1"), ("litter-2", "mother-1"), ("other", "mother-2")):
        install_litter(litter_id=litter_id, litter_overrides={"mother_id": mother_id})
    main = MotherScopeStorage(hass)
    main._data = deepcopy(storage._data)
    main._data["mothers"] = {
        mother_id: {"id": mother_id, "name": name, "records": []}
        for mother_id, name in (("mother-1", "Luna"), ("mother-2", "Other mother"))
    }
    main.async_save = AsyncMock()
    monkeypatch.setattr(upcoming, "local_today", lambda: date(2026, 10, 21))

    async def add(litter_id="litter-1", mother_id="mother-1", due="2026-10-21", **changes):
        return await main.async_add_record(
            litter_id, mother_id=mother_id, record_type="deworming",
            occurred_at="2026-10-20T12:00:00+00:00",
            data={"product": "Example", **({"next_due_date": due} if due else {})},
            **changes,
        )

    ids = {
        "current": await add(),
        "previous": await add("litter-2", due="2026-10-22"),
        "deleted": await add(),
        "completed": await add(),
        "future": await add(due="2026-12-01"),
        "other_mother": await add("other", "mother-2"),
    }
    await main.async_delete_record("litter-1", ids["deleted"], mother_id="mother-1")
    ids["completion"] = await add(due=None, followup_record_id=ids["completed"], followup_due_date="2026-10-21")
    await main.async_add_record("litter-1", puppy_id="puppy-1", record_type="deworming", data={"product": "Puppy", "next_due_date": "2026-10-21"})
    await main.async_add_record("litter-1", record_type="deworming", data={"product": "Litter", "next_due_date": "2026-10-21"})
    return main, ids


@pytest.mark.parametrize("history_scope", ["current", "all"])
@pytest.mark.parametrize("include_deleted", [False, True])
def test_records_response_derives_only_open_actions_in_selected_mother_history(mother_dossier, history_scope, include_deleted):
    main, ids = mother_dossier
    before = main.get_data()
    payload = _mother_records_payload(main, "litter-1", history_scope=history_scope,
        include_deleted=include_deleted, can_manage_records=True)

    actions = payload["actions"]
    expected = [ids["current"]] + ([ids["previous"]] if history_scope == "all" else [])
    assert [action["source_record_id"] for action in actions["actions"]] == expected
    assert actions["open_count"] == len(expected)
    assert actions["due_today_count"] == 1
    assert actions["upcoming_count"] == (history_scope == "all")
    assert actions["overdue_count"] == 0
    for action in actions["actions"]:
        assert action["scope"] == "mother"
        assert action["puppy_id"] is None
        assert action["litter_id"] == ("litter-2" if action["source_record_id"] == ids["previous"] else "litter-1")
    assert (ids["deleted"] in {record["id"] for record in payload["records"]}) == include_deleted
    assert main.get_data() == before


async def test_mother_action_disappears_after_completion_and_returns_after_undo(mother_dossier):
    main, ids = mother_dossier

    def payload():
        return _mother_records_payload(main, "litter-1", history_scope="current",
            include_deleted=True, can_manage_records=False)

    result = payload()
    assert result["can_manage_records"] is False
    assert result["actions"]["open_count"] == 1
    completion = await main.async_add_record("litter-1", mother_id="mother-1", record_type="deworming",
        data={"product": "Actual product"}, followup_record_id=ids["current"], followup_due_date="2026-10-21")
    assert payload()["actions"]["actions"] == []
    await main.async_delete_record("litter-1", completion, mother_id="mother-1")
    assert [action["source_record_id"] for action in payload()["actions"]["actions"]] == [ids["current"]]


@pytest.mark.parametrize("admin", [False, True])
async def test_websocket_returns_mother_actions_and_respects_deleted_history_permissions(
    hass, mother_dossier, hass_ws_client, monkeypatch, admin,
):
    main, ids = mother_dossier
    monkeypatch.setattr(mother_api, "get_runtime_storage", lambda _hass: main)
    await async_setup_component(hass, "websocket_api", {})
    mother_api.async_setup_mother_api(hass)
    if admin:
        client = await hass_ws_client(hass)
    else:
        user = await hass.auth.async_create_user("Reader", group_ids=[GROUP_ID_READ_ONLY])
        refresh = await hass.auth.async_create_refresh_token(user, client_id="https://test.client")
        client = await hass_ws_client(hass, access_token=hass.auth.async_create_access_token(refresh))
    await client.send_json_auto_id({"type": "puppy_tracker/mother/records", "litter_id": "litter-1", "include_deleted": True})
    response = await client.receive_json()
    assert response["success"] is True
    result = response["result"]
    assert result["can_manage_records"] is admin
    assert result["include_deleted"] is admin
    assert (ids["deleted"] in {record["id"] for record in result["records"]}) is admin
    assert [action["source_record_id"] for action in result["actions"]["actions"]] == [ids["current"]]
