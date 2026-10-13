"""Regression tests for the canonical Puppy Tracker config flow."""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest
from homeassistant.data_entry_flow import FlowResultType
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.puppy_tracker.config_flow import (
    PuppyTrackerConfigFlow,
    PuppyTrackerOptionsFlow,
)
from custom_components.puppy_tracker.config_flow_management import (
    PuppyTrackerManagementOptionsFlow,
)
from custom_components.puppy_tracker.const import (
    DEFAULT_LITTER_GROWTH_ANALYSIS,
    DOMAIN,
)
from custom_components.puppy_tracker.mother_storage import MotherScopeStorage
from custom_components.puppy_tracker.runtime import PuppyTrackerRuntimeData
from custom_components.puppy_tracker.storage import _empty_data


async def test_user_flow_opens_and_creates_entry(hass) -> None:
    flow = PuppyTrackerConfigFlow()
    flow.hass = hass
    flow.handler = DOMAIN
    flow.context = {"source": "user"}
    result = await flow.async_step_user()

    assert result["type"] is FlowResultType.FORM
    assert result["step_id"] == "user"
    assert not result["errors"]

    result = await flow.async_step_user({})

    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["title"] == "Puppy Tracker"
    assert result["data"] == {}
    assert flow.unique_id == DOMAIN


def test_config_flow_does_not_patch_management_module() -> None:
    assert PuppyTrackerManagementOptionsFlow in PuppyTrackerOptionsFlow.__mro__


def test_litter_edit_schema_keeps_empty_growth_overrides_optional() -> None:
    flow = PuppyTrackerManagementOptionsFlow()
    schema = flow._litter_edit_schema(
        {
            "name": "Luna 2026",
            "mother": "Luna",
            "father": "Dutch",
            "growth_analysis": DEFAULT_LITTER_GROWTH_ANALYSIS,
        }
    )

    validated = schema({"name": "Luna 2026", "action": "save"})

    for key in (
        "min_daily_growth_percent",
        "max_hours_between_weighings",
        "growth_monitoring_days",
        "first_day_max_weight_loss_percent",
        "expected_adult_weight_min_grams",
        "expected_adult_weight_max_grams",
    ):
        assert key not in validated


def test_litter_edit_schema_suggests_every_saved_growth_setting() -> None:
    flow = PuppyTrackerManagementOptionsFlow()
    schema = flow._litter_edit_schema(
        {
            "name": "Luna 2026",
            "growth_analysis": {
                **DEFAULT_LITTER_GROWTH_ANALYSIS,
                "min_daily_growth_percent": 6.5,
                "growth_milestones_percent": [200, 300, 400],
                "double_weight_reference_days": 12,
                "milestone_projection_measurements": 3,
            },
        }
    )
    fields = {marker.schema: marker for marker in schema.schema}

    assert fields["min_daily_growth_percent"].description == {
        "suggested_value": 6.5
    }
    assert fields["growth_milestones_percent"].description == {
        "suggested_value": "200, 300, 400"
    }
    assert fields["double_weight_reference_days"].description == {
        "suggested_value": 12
    }
    assert fields["milestone_projection_measurements"].description == {
        "suggested_value": 3
    }


async def test_user_flow_rejects_a_second_config_entry(hass) -> None:
    entry = MockConfigEntry(domain=DOMAIN, unique_id=None, data={})
    entry.add_to_hass(hass)
    flow = PuppyTrackerConfigFlow()
    flow.hass = hass
    flow.handler = DOMAIN
    flow.context = {"source": "user"}

    result = await flow.async_step_user()

    assert result["type"] is FlowResultType.ABORT
    assert result["reason"] == "single_instance_allowed"


@pytest.mark.parametrize("custom_growth", [False, True])
async def test_litter_edit_saves_parent_identity_and_growth_settings(
    hass, custom_growth
) -> None:
    storage = MotherScopeStorage(hass)
    storage._data = _empty_data()
    storage.async_save = AsyncMock()
    litter_id = await storage.async_create_litter(
        name="Luna 2026", mother="Luna", father="Dutch"
    )
    if custom_growth:
        storage._data["litters"][litter_id]["growth_analysis"].update(
            {
                "min_daily_growth_percent": 6.5,
                "growth_milestones_percent": [200, 300, 400],
                "double_weight_reference_days": 12,
                "milestone_projection_measurements": 3,
            }
        )
    original_growth = storage.get_litter(litter_id)["growth_analysis"]
    storage.async_save.reset_mock()
    entry = MockConfigEntry(domain=DOMAIN, data={})
    entry.runtime_data = PuppyTrackerRuntimeData(storage=storage)
    entry.add_to_hass(hass)
    flow = PuppyTrackerOptionsFlow()
    flow.hass = hass
    flow.handler = entry.entry_id
    flow._selected_litter_id = litter_id

    form = await flow.async_step_edit_litter()
    storage.async_save.assert_not_awaited()
    # Model the values Home Assistant prefills from the form's suggestions.
    user_input = {
        marker.schema: marker.description["suggested_value"]
        for marker in form["data_schema"].schema
        if marker.description and "suggested_value" in marker.description
    }
    user_input.update(
        name="Milky Way 2026",
        mother_registered_name="Milky Way Moonlight",
        mother_birth_date="2022-05-06",
        father_registered_name="Dutch Star",
        action="save",
    )
    validated = form["data_schema"](user_input)
    result = await flow.async_step_edit_litter(validated)

    assert result["type"] is FlowResultType.CREATE_ENTRY
    litter = storage.get_litter(litter_id)
    assert litter["name"] == "Milky Way 2026"
    assert litter["father_details"]["registered_name"] == "Dutch Star"
    assert litter["growth_analysis"] == original_growth
    mother = storage.get_mother_for_litter(litter_id)
    assert mother["registered_name"] == "Milky Way Moonlight"
    assert mother["birth_date"] == "2022-05-06"
    storage.async_save.assert_awaited()


async def test_litter_edit_can_clear_an_existing_growth_override(
    hass, storage, install_litter
) -> None:
    litter_id, _ = install_litter(
        litter_overrides={
            "growth_analysis": {
                **DEFAULT_LITTER_GROWTH_ANALYSIS,
                "min_daily_growth_percent": 6.5,
            }
        }
    )
    runtime_storage = MotherScopeStorage(hass)
    runtime_storage._data = storage.get_data()
    runtime_storage.async_save = AsyncMock()
    entry = MockConfigEntry(domain=DOMAIN, data={})
    entry.runtime_data = PuppyTrackerRuntimeData(storage=runtime_storage)
    entry.add_to_hass(hass)
    flow = PuppyTrackerManagementOptionsFlow()
    flow.hass = hass
    flow.handler = entry.entry_id
    flow._selected_litter_id = litter_id
    form = await flow.async_step_edit_litter()

    validated = form["data_schema"]({"name": "Luna 2026", "action": "save"})
    assert "min_daily_growth_percent" not in validated
    result = await flow.async_step_edit_litter(validated)

    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert runtime_storage.get_litter(litter_id)["growth_analysis"][
        "min_daily_growth_percent"
    ] is None
