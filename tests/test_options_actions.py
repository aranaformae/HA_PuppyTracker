"""Exercise management forms with real storage and clearable optional values."""

import json
from pathlib import Path
from unittest.mock import AsyncMock

import pytest
import voluptuous as vol
from homeassistant.data_entry_flow import FlowResultType
from homeassistant.helpers import device_registry as dr
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.puppy_tracker.config_flow import PuppyTrackerOptionsFlow
from custom_components.puppy_tracker import CREATE_LITTER_SCHEMA
from custom_components.puppy_tracker.const import DOMAIN
from custom_components.puppy_tracker.devices import async_sync_devices
from custom_components.puppy_tracker.mother_storage import MotherScopeStorage
from custom_components.puppy_tracker.runtime import PuppyTrackerRuntimeData
from custom_components.puppy_tracker.storage import _empty_data
from custom_components.puppy_tracker.dog_identity import puppy_selector_label
from custom_components.puppy_tracker.select import PuppySelect


@pytest.mark.parametrize("puppy, expected", [
    ({"name": "Alice", "collar_color": "Red"}, "Alice (Red)"),
    ({"name": "Alice", "collar_color": ""}, "Alice"),
    ({"name": "Alice"}, "Alice"),
    ({"name": "Red", "collar_color": "red"}, "Red"),
    ({"name": " Alice ", "collar_color": " Red "}, "Alice (Red)"),
    ({"collar_color": "Red"}, "Puppy (Red)"),
])
def test_puppy_selector_labels_match_weighing_options(puppy, expected):
    assert puppy_selector_label(puppy) == expected
    assert PuppySelect._base_label(puppy) == expected


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


def _prefilled_litter_input(form):
    return {
        group.schema: {
            marker.schema: (
                marker.description["suggested_value"]
                if marker.description and "suggested_value" in marker.description
                else marker.default()
            )
            for marker in section.schema.schema
            if (marker.description and "suggested_value" in marker.description)
            or marker.default is not vol.UNDEFINED
        }
        for group, section in form["data_schema"].schema.items()
    }


@pytest.mark.parametrize("step", ["manage_puppy", "manage_measurements", "export_puppy"])
async def test_puppy_management_selectors_include_collar_without_changing_ids(options_flow, step):
    flow, storage = options_flow
    litter_id, puppy_id = flow._selected_litter_id, flow._selected_puppy_id
    storage._data["litters"][litter_id]["puppies"][puppy_id].update(name="Alice", collar_color="Red")
    form = await getattr(flow, f"async_step_{step}")()
    field = next(value for marker, value in form["data_schema"].schema.items() if marker.schema == "puppy")
    options = field.config["options"]
    assert options[0]["value"] == f"{litter_id}|{puppy_id}"
    assert "Luna 2026" in options[0]["label"]
    assert options[0]["label"].endswith("Alice (Red)")
    storage.async_save.assert_not_awaited()


async def test_litter_puppy_session_reuses_litter_after_edit(options_flow):
    flow, storage = options_flow
    root = await flow.async_step_init()
    assert "manage_puppy" in root["menu_options"]
    assert "add_puppy" in root["menu_options"]
    assert "litter_puppies" in root["menu_options"]
    choose = await flow.async_step_litter_puppies()
    assert choose["step_id"] == "choose_litter_puppy"
    puppy_id = flow._selected_puppy_id
    edit = await flow.async_step_choose_litter_puppy({"puppy_id": puppy_id})
    values = _prefilled_input(edit)
    values.update(name="Updated", action="save")
    result = await flow.async_step_edit_puppy(edit["data_schema"](values))
    assert result["step_id"] == "choose_litter_puppy"
    assert storage.get_puppy(flow._selected_litter_id, puppy_id)["name"] == "Updated"
    add = await flow.async_step_choose_litter_puppy({"puppy_id": "__new__"})
    assert add["step_id"] == "add_puppy"
    assert "litter_id" not in {marker.schema for marker in add["data_schema"].schema}
    new_values = add["data_schema"]({"name": "New"})
    result = await flow.async_step_add_puppy(new_values)
    assert result["step_id"] == "choose_litter_puppy"
    assert any(puppy["name"] == "New" for puppy in storage.get_litter(flow._selected_litter_id)["puppies"].values())


async def test_litter_puppy_session_asks_for_litter_when_multiple_are_active(options_flow):
    flow, storage = options_flow
    await storage.async_create_litter("Second litter")
    form = await flow.async_step_litter_puppies()
    assert form["step_id"] == "litter_puppies"
    result = await flow.async_step_litter_puppies(
        form["data_schema"]({"litter_id": flow._selected_litter_id})
    )
    assert result["step_id"] == "choose_litter_puppy"


async def test_integrity_preview_requires_explicit_repair(options_flow):
    flow, storage = options_flow
    storage.async_run_integrity_check = AsyncMock(return_value={
        "healthy": False, "issues_found": 1, "repairs_applied": 0,
        "unresolved_critical": 0, "unresolved_warnings": 1,
        "checked": {"measurement_versions": 1},
    })
    preview = await flow.async_step_integrity()
    assert preview["step_id"] == "integrity"
    storage.async_run_integrity_check.assert_awaited_once_with(repair=False)
    storage.async_save.assert_not_awaited()
    result = await flow.async_step_integrity({"confirm_repair": True})
    assert result["step_id"] == "integrity_result"
    storage.async_run_integrity_check.assert_awaited_with(repair=True)


async def test_litter_archive_has_separate_confirmation(options_flow):
    flow, storage = options_flow
    before = storage.get_litter(flow._selected_litter_id)["active"]
    menu = await flow.async_step_litter_actions()
    assert menu["menu_options"] == [
        "edit_litter", "toggle_archive_litter", "confirm_delete_litter"
    ]
    form = await flow.async_step_toggle_archive_litter()
    assert storage.get_litter(flow._selected_litter_id)["active"] == before
    await flow.async_step_toggle_archive_litter({"confirm": True})
    assert storage.get_litter(flow._selected_litter_id)["active"] != before


async def test_collapsed_litter_sections_preserve_existing_details(options_flow):
    flow, storage = options_flow
    litter_id = flow._selected_litter_id
    before = storage.get_litter(litter_id)
    mother_before = storage.get_mother_for_litter(litter_id)
    form = await flow.async_step_edit_litter()
    result = await flow.async_step_edit_litter(
        form["data_schema"]({"basic": {"name": "New litter name"}})
    )
    assert result["type"] is FlowResultType.CREATE_ENTRY
    after = storage.get_litter(litter_id)
    assert after["name"] == "New litter name"
    assert after["father_details"] == before["father_details"]
    assert after["growth_analysis"] == before["growth_analysis"]
    assert storage.get_mother_for_litter(litter_id)["birth_date"] == mother_before["birth_date"]


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
    flow._mother_export_id = storage.get_mother_for_litter(
        flow._selected_litter_id
    )["id"]
    before = storage.get_data()
    form = await getattr(flow, f"async_step_{step}")()

    assert form["type"] is FlowResultType.FORM
    integration = Path(__file__).resolve().parents[1] / "custom_components" / "puppy_tracker"
    languages = {
        language: json.loads(
            (integration / "translations" / f"{language}.json").read_text()
        )
        for language in ("nl", "en")
    }
    for marker, validator in form["data_schema"].schema.items():
        if hasattr(validator, "schema") and hasattr(validator, "options"):
            for language, translations in languages.items():
                section_labels = translations["options"]["step"][form["step_id"]]["sections"][marker.schema]
                assert section_labels["name"]
                for child in validator.schema.schema:
                    assert child.schema in section_labels["data"]
            continue
        if marker.default is not vol.UNDEFINED:
            validator(marker.default())
        if marker.description and "suggested_value" in marker.description:
            validator(marker.description["suggested_value"])
        for language, translations in languages.items():
            labels = translations["options"]["step"][form["step_id"]]["data"]
            assert marker.schema in labels, (language, step, marker.schema)
            config = getattr(validator, "config", {})
            if translation_key := config.get("translation_key"):
                options = translations["selector"][translation_key]["options"]
                assert set(config["options"]) <= options.keys(), (language, translation_key)
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
    data = _prefilled_litter_input(form)
    data["basic"].pop("birth_date")
    data["mother_section"].pop("mother_birth_date")
    data["father_section"].pop("father_birth_date")
    result = await flow.async_step_edit_litter(form["data_schema"](data))

    assert result["type"] is FlowResultType.CREATE_ENTRY
    litter = storage.get_litter(flow._selected_litter_id)
    assert litter["birth_date"] is None
    assert litter["father_details"]["birth_date"] is None
    assert storage.get_mother_for_litter(flow._selected_litter_id)["birth_date"] is None


@pytest.mark.parametrize("clear", [False, True])
async def test_parent_chip_numbers_can_be_saved_and_cleared(options_flow, clear):
    flow, storage = options_flow
    form = await flow.async_step_edit_litter()
    data = _prefilled_litter_input(form)
    data["mother_section"]["mother_chip_number"] = "000123456789012"
    data["father_section"]["father_chip_number"] = "000987654321098"
    result = await flow.async_step_edit_litter(form["data_schema"](data))
    assert result["type"] is FlowResultType.CREATE_ENTRY
    form = await flow.async_step_edit_litter()
    data = _prefilled_litter_input(form)
    assert data["mother_section"]["mother_chip_number"] == "000123456789012"
    assert data["father_section"]["father_chip_number"] == "000987654321098"
    if clear:
        data["mother_section"].pop("mother_chip_number")
        data["father_section"].pop("father_chip_number")
    result = await flow.async_step_edit_litter(form["data_schema"](data))
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert storage.get_mother_for_litter(flow._selected_litter_id)["chip_number"] == (
        None if clear else "000123456789012"
    )
    assert storage.get_litter(flow._selected_litter_id)["father_details"]["chip_number"] == (
        None if clear else "000987654321098"
    )


async def test_create_litter_form_and_action_accept_parent_chip_numbers(options_flow):
    flow, storage = options_flow
    data = {
        "name": "Chip litter", "mother": "Nova", "father": "Cooper",
        "mother_chip_number": "000123456789012",
        "father_chip_number": "000987654321098",
    }
    assert CREATE_LITTER_SCHEMA(data) == data
    form = await flow.async_step_create_litter()
    result = await flow.async_step_create_litter(form["data_schema"](data))
    assert result["type"] is FlowResultType.CREATE_ENTRY
    litter = next(item for item in storage.get_litters().values() if item["name"] == "Chip litter")
    assert litter["father_details"]["chip_number"] == data["father_chip_number"]
    assert storage.get_mother_for_litter(litter["id"])["chip_number"] == data["mother_chip_number"]


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
