"""Contract identity fields for puppies and parent dogs."""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from custom_components.puppy_tracker.dog_identity import (
    DEFAULT_DOG_BREED,
    normalize_parent_details,
)
from custom_components.puppy_tracker.mother_storage import MotherScopeStorage
from custom_components.puppy_tracker.storage import _empty_data


def test_parent_identity_is_trimmed_and_defaults_the_requested_breed() -> None:
    details = normalize_parent_details(
        {
            "registered_name": "  Milky Way Luna  ",
            "birth_date": "2023-04-12",
            "wala_number": " WALA00012345 ",
        },
        call_name=" Luna ",
    )

    assert details == {
        "registered_name": "Milky Way Luna",
        "call_name": "Luna",
        "birth_date": "2023-04-12",
        "breed": DEFAULT_DOG_BREED,
        "wala_number": "WALA00012345",
    }


def test_parent_identity_rejects_invalid_birth_date() -> None:
    with pytest.raises(ValueError, match="birth_date must be an ISO date"):
        normalize_parent_details({"birth_date": "tomorrow"})


@pytest.mark.asyncio
async def test_storage_persists_contract_identity_for_litter_and_puppy(hass) -> None:
    storage = MotherScopeStorage(hass)
    storage._data = _empty_data()
    storage.async_save = AsyncMock()

    litter_id = await storage.async_create_litter(
        name="Milky Way 2026",
        birth_date="2026-10-01",
        mother="Luna",
        mother_details={
            "registered_name": "Milky Way Moonlight",
            "birth_date": "2022-05-06",
            "wala_number": "WALA-MOTHER",
        },
        father="Cooper",
        father_details={
            "registered_name": "Doodle Cooper Star",
            "birth_date": "2021-02-03",
            "wala_number": "WALA-FATHER",
        },
    )
    puppy_id = await storage.async_add_puppy(
        litter_id,
        "Rood",
        registered_name="Milky Way Aurora",
        coat_color="Caramel",
        chip_number="000123",
    )

    litter = storage.get_litter(litter_id)
    puppy = storage.get_puppy(litter_id, puppy_id)
    mother = storage.get_mother_for_litter(litter_id)

    assert litter is not None
    assert litter["father"] == "Cooper"
    assert litter["father_details"]["registered_name"] == "Doodle Cooper Star"
    assert litter["father_details"]["breed"] == DEFAULT_DOG_BREED
    assert mother is not None
    assert mother["registered_name"] == "Milky Way Moonlight"
    assert mother["wala_number"] == "WALA-MOTHER"
    assert puppy is not None
    assert puppy["registered_name"] == "Milky Way Aurora"
    assert puppy["coat_color"] == "Caramel"
    assert puppy["breed"] == DEFAULT_DOG_BREED
    assert puppy["chip_number"] == "000123"


@pytest.mark.asyncio
async def test_new_litter_does_not_erase_existing_mother_identity(hass) -> None:
    storage = MotherScopeStorage(hass)
    storage._data = _empty_data()
    storage.async_save = AsyncMock()

    await storage.async_create_litter(
        name="First litter",
        mother="Luna",
        mother_details={
            "registered_name": "Milky Way Moonlight",
            "birth_date": "2022-05-06",
            "wala_number": "WALA-MOTHER",
        },
    )
    await storage.async_create_litter(
        name="Second litter",
        mother="Luna",
        mother_details={
            "registered_name": None,
            "birth_date": None,
            "breed": DEFAULT_DOG_BREED,
            "wala_number": None,
        },
    )

    mother = storage.get_mothers()[0]
    assert mother["registered_name"] == "Milky Way Moonlight"
    assert mother["birth_date"] == "2022-05-06"
    assert mother["wala_number"] == "WALA-MOTHER"


@pytest.mark.asyncio
async def test_invalid_parent_identity_does_not_partially_update_litter(hass) -> None:
    storage = MotherScopeStorage(hass)
    storage._data = _empty_data()
    storage.async_save = AsyncMock()
    litter_id = await storage.async_create_litter(
        name="Original litter",
        mother="Luna",
        father="Cooper",
    )

    with pytest.raises(ValueError, match="birth_date must be an ISO date"):
        await storage.async_update_litter(
            litter_id,
            name="Changed litter",
            birth_date="2026-10-01",
            mother="Luna",
            mother_details={"birth_date": "invalid"},
            father="Cooper",
        )

    litter = storage.get_litter(litter_id)
    assert litter is not None
    assert litter["name"] == "Original litter"

    with pytest.raises(ValueError, match="birth_date must be an ISO date"):
        await storage.async_update_litter(
            litter_id,
            name="Changed litter",
            birth_date="2026-10-01",
            mother="Luna",
            father="Cooper",
            father_details={"birth_date": "invalid"},
        )

    litter = storage.get_litter(litter_id)
    assert litter is not None
    assert litter["name"] == "Original litter"
