"""Central dossier preferences and entity controls share one atomic store."""

from unittest.mock import AsyncMock, MagicMock

import pytest
from homeassistant.data_entry_flow import FlowResultType
from homeassistant.helpers.dispatcher import async_dispatcher_send
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.puppy_tracker.care_reminders import CareReminderStore
from custom_components.puppy_tracker.config_flow import PuppyTrackerOptionsFlow
from custom_components.puppy_tracker.const import DOMAIN, SIGNAL_DASHBOARD_UPDATE
from custom_components.puppy_tracker.number import CareReminderLeadDays
from custom_components.puppy_tracker.runtime import PuppyTrackerRuntimeData
from custom_components.puppy_tracker.switch import CareReminderCategorySwitch


def setup_flow(hass, storage):
    store = CareReminderStore(hass)
    store._store.async_save = AsyncMock()
    store._data["states"] = {"record-1": {"state": "due_soon"}}
    entry = MockConfigEntry(domain=DOMAIN, data={})
    entry.runtime_data = PuppyTrackerRuntimeData(storage=storage, care_reminders=store)
    entry.add_to_hass(hass)
    flow = PuppyTrackerOptionsFlow()
    flow.hass = hass
    flow.handler = entry.entry_id
    return flow, store, entry


async def test_form_uses_saved_entity_values_and_preserves_delivery_state(hass, storage):
    flow, store, entry = setup_flow(hass, storage)
    number = CareReminderLeadDays(entry)
    switch = CareReminderCategorySwitch(entry, category="vaccination", name="Vaccination", icon="mdi:needle")
    for entity in (number, switch):
        entity.hass = hass
        entity.async_write_ha_state = MagicMock()
    await number.async_set_native_value(7)
    await switch.async_turn_off()
    before_states = store.get_states()
    assert "dossier_notification_preferences" in (await flow.async_step_notifications())["menu_options"]
    form = await flow.async_step_dossier_notification_preferences()
    values = form["data_schema"]({})
    assert values == {"lead_days": 7, "vaccination": False, "deworming": True}
    store._store.async_save.reset_mock()
    result = await flow.async_step_dossier_notification_preferences({"lead_days": 3, "vaccination": True, "deworming": False})
    assert result["type"] is FlowResultType.CREATE_ENTRY
    store._store.async_save.assert_awaited_once()
    assert number.native_value == 3
    assert switch.is_on is True
    assert store.get_categories()["deworming"] is False
    assert store.get_states() == before_states
    reopened = await flow.async_step_dossier_notification_preferences()
    assert reopened["data_schema"]({}) == {"lead_days": 3, "vaccination": True, "deworming": False}


async def test_failed_form_save_rolls_back_all_preferences(hass, storage):
    flow, store, _entry = setup_flow(hass, storage)
    before = store.get_snapshot_data()
    store._store.async_save = AsyncMock(side_effect=OSError("save failed"))
    result = await flow.async_step_dossier_notification_preferences({"lead_days": 0, "vaccination": False, "deworming": False})
    assert result["errors"] == {"base": "unknown"}
    assert store.get_snapshot_data() == before


@pytest.mark.parametrize("lead_days", [-1, 31, 2.5])
async def test_invalid_lead_days_do_not_change_categories(hass, storage, lead_days):
    flow, store, _entry = setup_flow(hass, storage)
    before = store.get_snapshot_data()
    result = await flow.async_step_dossier_notification_preferences({"lead_days": lead_days, "vaccination": False, "deworming": False})
    assert result["errors"] == {"base": "invalid_notification_settings"}
    assert store.get_snapshot_data() == before
    store._store.async_save.assert_not_awaited()


async def test_entities_refresh_on_form_save_and_unregister_cleanly(hass, storage):
    flow, _store, entry = setup_flow(hass, storage)
    entities = [
        CareReminderLeadDays(entry),
        CareReminderCategorySwitch(entry, category="vaccination", name="Vaccination", icon="mdi:needle"),
        CareReminderCategorySwitch(entry, category="deworming", name="Deworming", icon="mdi:shield-bug-outline"),
    ]
    removers = []
    for entity in entities:
        entity.hass = hass
        entity.async_write_ha_state = MagicMock()
        entity.async_on_remove = removers.append
        await entity.async_added_to_hass()
    try:
        await flow.async_step_dossier_notification_preferences({"lead_days": 0, "vaccination": False, "deworming": False})
        await hass.async_block_till_done()
        for entity in entities:
            entity.async_write_ha_state.assert_called_once()
        assert entities[0].native_value == 0
        assert entities[1].is_on is False
        assert entities[2].is_on is False
    finally:
        for remove in removers:
            remove()
    for entity in entities:
        entity.async_write_ha_state.reset_mock()
    async_dispatcher_send(hass, SIGNAL_DASHBOARD_UPDATE)
    await hass.async_block_till_done()
    for entity in entities:
        entity.async_write_ha_state.assert_not_called()
