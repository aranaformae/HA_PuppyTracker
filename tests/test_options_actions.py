"""Exercise management forms with real storage and clearable optional values."""

from unittest.mock import AsyncMock

import pytest
import voluptuous as vol
from homeassistant.data_entry_flow import FlowResultType
from homeassistant.helpers import device_registry as dr
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.puppy_tracker.config_flow import PuppyTrackerOptionsFlow
from custom_components.puppy_tracker.const import DOMAIN
from custom_components.puppy_tracker.devices import async_sync_devices
from custom_components.puppy_tracker.mother_storage import MotherScopeStorage
from custom_components.puppy_tracker.runtime import PuppyTrackerRuntimeData
from custom_components.puppy_tracker.storage import _empty_data


@pytest.fixture
async def options_flow(hass):
    storage = MotherScopeStorage(hass)
    storage._data = _empty_data()
    storage.async_save = AsyncMock()
    litter_id = await storage.async_create_litter(
        "Luna 2026", birth_date="2026-08-28", mother="Luna", father="Dutch",
        mother_details={"birth_date": "2022-05-06"},
        father_details={"birth_date": "2021-02-03"},
    )
    puppy_id = await storage.async_add_puppy(
        litter_id, "Rood", birth_weight=400,
        birth_time="2026-08-28T10:00:00.123456+00:00", chip_number="000123",
        registered_name="Aurora", coat_color="Caramel", collar_color="rood",
        sex="female", profile_note="Existing note",
    )
    entry = MockConfigEntry(domain=DOMAIN, data={})
    entry.runtime_data = PuppyTrackerRuntimeData(storage=storage)
    entry.add_to_hass(hass)
    flow = PuppyTrackerOptionsFlow()
    flow.hass = hass
    flow.handler = entry.entry_id
    flow._selected_litter_id = litter_id
    flow._selected_puppy_id = puppy_id
    flow._selected_measurement_id = storage.get_puppy(
        litter_id, puppy_id
    )["birth_measurement_id"]
    storage.async_save.reset_mock()
    return flow, storage


def _prefilled_input(form):
    return {
        marker.schema: marker.description["suggested_value"]
        for marker in form["data_schema"].schema
        if marker.description and "suggested_value" in marker.description
    }


@pytest.mark.parametrize("step", [
    "create_litter", "manage_litter", "edit_litter", "confirm_delete_litter",
    "add_puppy", "manage_puppy", "edit_puppy", "confirm_delete_puppy",
    "manage_measurements", "select_measurement", "edit_measurement",
    "confirm_delete_measurement", "settings", "notification_preferences",
    "test_notification", "export_data", "export_litter", "export_puppy",
    "export_mother", "export_mother_filter", "import_data",
])
async def test_management_forms_have_valid_prefills_and_do_not_save(options_flow, step):
    flow, storage = options_flow
    flow._export_mother_id = storage.get_mother_for_litter(
        flow._selected_litter_id
    )["id"]
    before = storage.get_data()
    form = await getattr(flow, f"async_step_{step}")()

    assert form["type"] is FlowResultType.FORM
    for marker, validator in form["data_schema"].schema.items():
        if marker.default is not vol.UNDEFINED:
            validator(marker.default())
        if marker.description and "suggested_value" in marker.description:
            validator(marker.description["suggested_value"])
    assert storage.get_data() == before
    storage.async_save.assert_not_awaited()


@pytest.mark.parametrize("clear", [False, True])
async def test_puppy_edit_preserves_or_clears_optional_fields(options_flow, clear):
    flow, storage = options_flow
    form = await flow.async_step_edit_puppy()
    data = _prefilled_input(form)
    optional_fields = (
        "registered_name", "coat_color", "collar_color", "sex", "birth_weight",
        "birth_time", "profile_note", "chip_number",
    )
    if clear:
        for field in optional_fields:
            data.pop(field, None)
    data.update(name="Aurora", action="save")
    before = storage.get_puppy(flow._selected_litter_id, flow._selected_puppy_id)
    result = await flow.async_step_edit_puppy(form["data_schema"](data))

    assert result["type"] is FlowResultType.CREATE_ENTRY
    after = storage.get_puppy(flow._selected_litter_id, flow._selected_puppy_id)
    assert after["name"] == "Aurora"
    for field in optional_fields:
        assert after[field] == (None if clear else before[field])
    assert (after["birth_measurement_id"] is None) == clear
    storage.async_save.assert_awaited()


async def test_litter_edit_clears_parent_dates_without_repopulating(options_flow):
    flow, storage = options_flow
    form = await flow.async_step_edit_litter()
    data = _prefilled_input(form)
    data.pop("birth_date")
    data.pop("mother_birth_date")
    data.pop("father_birth_date")
    data["action"] = "save"
    result = await flow.async_step_edit_litter(form["data_schema"](data))

    assert result["type"] is FlowResultType.CREATE_ENTRY
    litter = storage.get_litter(flow._selected_litter_id)
    assert litter["birth_date"] is None
    assert litter["father_details"]["birth_date"] is None
    assert storage.get_mother_for_litter(flow._selected_litter_id)["birth_date"] is None


async def test_notification_recipients_can_be_cleared_without_changing_thresholds(
    options_flow,
):
    flow, storage = options_flow
    storage._data["settings"]["notify_entities"] = ["notify.mobile_app_phone"]
    before = storage.get_settings()
    form = await flow.async_step_notification_preferences()
    # An empty optional entity picker omits its key from submitted form data.
    result = await flow.async_step_notification_preferences(form["data_schema"]({}))

    assert result["type"] is FlowResultType.CREATE_ENTRY
    after = storage.get_settings()
    assert after == {**before, "notify_entities": []}


async def test_monitoring_settings_preserve_all_notification_preferences(options_flow):
    flow, storage = options_flow
    storage._data["settings"].update(
        notifications_enabled=True, recurring_reminder_notifications_enabled=False,
        notification_lead_minutes=0, notify_recovery=True,
        notify_entities=["notify.mobile_app_phone"],
    )
    before = storage.get_settings()
    form = await flow.async_step_settings()
    data = form["data_schema"]({"min_daily_growth_percent": 6.5})
    result = await flow.async_step_settings(data)

    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert storage.get_settings() == {**before, "min_daily_growth_percent": 6.5}


def test_device_sync_retains_puppy_litter_link_and_device_ids(options_flow):
    flow, storage = options_flow
    registry = dr.async_get(flow.hass)
    async_sync_devices(flow.hass, flow.config_entry, storage.get_data())
    before = list(dr.async_entries_for_config_entry(registry, flow.handler))
    litter = next(device for device in before if device.model == "Litter")
    puppy = next(device for device in before if device.model == "Puppy")
    assert puppy.via_device_id == litter.id

    async_sync_devices(flow.hass, flow.config_entry, storage.get_data())
    after = list(dr.async_entries_for_config_entry(registry, flow.handler))
    assert {device.id for device in after} == {device.id for device in before}
    assert registry.async_get(puppy.id).via_device_id == litter.id


@pytest.mark.parametrize("delete_litter", [False, True])
async def test_confirmed_deletion_removes_matching_devices(options_flow, delete_litter):
    flow, storage = options_flow
    registry = dr.async_get(flow.hass)
    async_sync_devices(flow.hass, flow.config_entry, storage.get_data())
    before = list(dr.async_entries_for_config_entry(registry, flow.handler))
    step = "confirm_delete_litter" if delete_litter else "confirm_delete_puppy"
    result = await getattr(flow, f"async_step_{step}")({"confirm": True})

    assert result["type"] is FlowResultType.CREATE_ENTRY
    after = list(dr.async_entries_for_config_entry(registry, flow.handler))
    assert {device.model for device in after} == (
        {"Mother dog"} if delete_litter else {"Mother dog", "Litter"}
    )
    assert {device.id for device in after} < {device.id for device in before}
    assert storage.get_puppy(flow._selected_litter_id, flow._selected_puppy_id) is None
