"""Regression tests for the canonical Puppy Tracker config flow."""

from __future__ import annotations

from homeassistant.data_entry_flow import FlowResultType
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.puppy_tracker.config_flow import (
    PuppyTrackerConfigFlow,
    PuppyTrackerOptionsFlow,
)
from custom_components.puppy_tracker.config_flow_management import (
    PuppyTrackerManagementOptionsFlow,
)
from custom_components.puppy_tracker.const import DOMAIN


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
