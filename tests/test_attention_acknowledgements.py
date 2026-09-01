from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from custom_components.puppy_tracker.attention_acknowledgements import (
    AttentionAcknowledgementStore,
)


async def test_attention_acknowledgement_can_be_set_and_removed(hass) -> None:
    store = AttentionAcknowledgementStore(hass)
    store._store.async_save = AsyncMock()

    await store.async_set("litter-1", "weight:pup-1:low_growth:m-1", True)

    assert store.is_acknowledged("litter-1", "weight:pup-1:low_growth:m-1")
    saved = store._store.async_save.await_args.args[0]
    assert saved["litters"]["litter-1"]["weight:pup-1:low_growth:m-1"]["acknowledged_at"]

    await store.async_set("litter-1", "weight:pup-1:low_growth:m-1", False)

    assert not store.is_acknowledged("litter-1", "weight:pup-1:low_growth:m-1")
    assert store.get_acknowledgements("litter-1") == {}


async def test_attention_acknowledgement_rolls_back_on_save_failure(hass) -> None:
    store = AttentionAcknowledgementStore(hass)
    store._data = {
        "litters": {
            "litter-1": {
                "dossier:record-1:next_due_date": {
                    "acknowledged_at": "2026-09-01T12:00:00+00:00"
                }
            }
        }
    }
    store._store.async_save = AsyncMock(side_effect=OSError("disk full"))

    with pytest.raises(OSError, match="disk full"):
        await store.async_set("litter-1", "care:program:pup:3", True)

    acknowledgements = store.get_acknowledgements("litter-1")
    assert "dossier:record-1:next_due_date" in acknowledgements
    assert "care:program:pup:3" not in acknowledgements


async def test_attention_acknowledgements_are_scoped_per_litter(hass) -> None:
    store = AttentionAcknowledgementStore(hass)
    store._store.async_save = AsyncMock()

    await store.async_set("litter-a", "care:occurrence-1", True)

    assert store.is_acknowledged("litter-a", "care:occurrence-1")
    assert not store.is_acknowledged("litter-b", "care:occurrence-1")
