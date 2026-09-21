"""Tests for canonical Puppy Tracker dispatcher updates."""

from __future__ import annotations

from custom_components.puppy_tracker import updates
from custom_components.puppy_tracker.const import (
    SIGNAL_DASHBOARD_UPDATE,
    SIGNAL_UPDATE,
)


def test_measurement_update_refreshes_puppy_and_dashboard(hass, monkeypatch) -> None:
    calls = []
    monkeypatch.setattr(
        updates,
        "async_dispatcher_send",
        lambda _hass, signal, *args: calls.append((signal, args)),
    )

    updates.dispatch_measurement_update(hass, "pup-1")

    assert calls == [
        (SIGNAL_UPDATE, ("pup-1",)),
        (SIGNAL_DASHBOARD_UPDATE, ()),
    ]


def test_dossier_update_deduplicates_puppies_and_dashboard(hass, monkeypatch) -> None:
    calls = []
    monkeypatch.setattr(
        updates,
        "async_dispatcher_send",
        lambda _hass, signal, *args: calls.append((signal, args)),
    )

    updates.dispatch_dossier_update(hass, "pup-1", None, "pup-2", "pup-1")

    assert calls == [
        (SIGNAL_UPDATE, ("pup-1",)),
        (SIGNAL_UPDATE, ("pup-2",)),
        (SIGNAL_DASHBOARD_UPDATE, ()),
    ]


def test_litter_dossier_update_only_refreshes_dashboard(hass, monkeypatch) -> None:
    calls = []
    monkeypatch.setattr(
        updates,
        "async_dispatcher_send",
        lambda _hass, signal, *args: calls.append((signal, args)),
    )

    updates.dispatch_dossier_update(hass)

    assert calls == [(SIGNAL_DASHBOARD_UPDATE, ())]
