"""Regression tests for shared Puppy Tracker notification delivery."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from custom_components.puppy_tracker.notification_delivery import (
    async_send_notify_entities,
    normalize_notify_entities,
)
from custom_components.puppy_tracker.notification_settings_flow import (
    NotificationSettingsMixin,
)


class _Services:
    """Small Home Assistant service-registry stand-in."""

    def __init__(self, *, available: bool = True) -> None:
        self.has_service = MagicMock(return_value=available)
        self.async_call = AsyncMock()


def _hass(*, available: bool = True):
    return SimpleNamespace(services=_Services(available=available))


def test_normalize_notify_entities_filters_invalid_values() -> None:
    assert normalize_notify_entities(
        ["notify.phone", "light.kitchen", None, 123, "notify.tablet"]
    ) == ["notify.phone", "notify.tablet"]


async def test_best_effort_delivery_uses_non_blocking_calls() -> None:
    hass = _hass()

    await async_send_notify_entities(
        hass,
        ["notify.phone"],
        "Title",
        "Message",
    )

    hass.services.async_call.assert_awaited_once_with(
        "notify",
        "send_message",
        {
            "entity_id": "notify.phone",
            "title": "Title",
            "message": "Message",
        },
        blocking=False,
    )


async def test_best_effort_delivery_swallow_target_failure() -> None:
    hass = _hass()
    hass.services.async_call.side_effect = [RuntimeError("offline"), None]

    await async_send_notify_entities(
        hass,
        ["notify.phone", "notify.tablet"],
        "Title",
        "Message",
    )

    assert hass.services.async_call.await_count == 2


async def test_strict_delivery_reports_missing_notify_service() -> None:
    hass = _hass(available=False)

    with pytest.raises(ValueError, match="notify.send_message"):
        await async_send_notify_entities(
            hass,
            ["notify.phone"],
            "Title",
            "Message",
            strict=True,
        )

    hass.services.async_call.assert_not_awaited()


async def test_strict_delivery_is_blocking_and_propagates_target_failure() -> None:
    hass = _hass()
    hass.services.async_call.side_effect = RuntimeError("delivery failed")

    with pytest.raises(RuntimeError, match="delivery failed"):
        await async_send_notify_entities(
            hass,
            ["notify.phone"],
            "Title",
            "Message",
            strict=True,
        )

    hass.services.async_call.assert_awaited_once_with(
        "notify",
        "send_message",
        {
            "entity_id": "notify.phone",
            "title": "Title",
            "message": "Message",
        },
        blocking=True,
    )


async def test_no_push_targets_do_not_require_notify_service() -> None:
    hass = _hass(available=False)

    await async_send_notify_entities(
        hass,
        [],
        "Title",
        "Message",
        strict=True,
    )

    hass.services.has_service.assert_not_called()
    hass.services.async_call.assert_not_awaited()


async def test_test_notification_uses_strict_shared_delivery(
    monkeypatch,
) -> None:
    hass = _hass()
    persistent_create = MagicMock()
    monkeypatch.setattr(
        "custom_components.puppy_tracker.notification_settings_flow.async_create",
        persistent_create,
    )

    flow = NotificationSettingsMixin()
    flow.hass = hass

    await flow._async_send_test_notification(["notify.phone"])

    hass.services.async_call.assert_awaited_once()
    assert hass.services.async_call.await_args.kwargs["blocking"] is True
    persistent_create.assert_called_once()


async def test_test_notification_surfaces_push_failure_before_success_message(
    monkeypatch,
) -> None:
    hass = _hass(available=False)
    persistent_create = MagicMock()
    monkeypatch.setattr(
        "custom_components.puppy_tracker.notification_settings_flow.async_create",
        persistent_create,
    )

    flow = NotificationSettingsMixin()
    flow.hass = hass

    with pytest.raises(ValueError, match="notify.send_message"):
        await flow._async_send_test_notification(["notify.phone"])

    persistent_create.assert_not_called()
