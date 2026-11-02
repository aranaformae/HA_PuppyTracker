"""Coalescing and teardown shared by both notification coordinators."""

import asyncio
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from custom_components.puppy_tracker.notification_runner import NotificationCheckRunner


async def test_runner_coalesces_updates_until_the_latest_state_is_checked():
    entered, release = asyncio.Event(), asyncio.Event()
    calls = 0

    async def check():
        nonlocal calls
        calls += 1
        if calls == 1:
            entered.set()
            await release.wait()

    runner = NotificationCheckRunner(SimpleNamespace(async_create_task=asyncio.create_task), check)
    runner.schedule()
    task = runner.task
    await entered.wait()
    for _ in range(20):
        runner.schedule()
        assert runner.task is task
    release.set()
    await task
    assert calls == 2
    assert runner.task is None


async def test_runner_is_restartable_after_an_error_and_preserves_queued_updates():
    calls = 0
    done = asyncio.Event()

    async def check():
        nonlocal calls
        calls += 1
        if calls == 1:
            runner.schedule()
            raise RuntimeError("Temporary check failure")
        done.set()

    runner = NotificationCheckRunner(SimpleNamespace(async_create_task=asyncio.create_task), check)
    runner.schedule()
    first = runner.task
    with pytest.raises(RuntimeError, match="Temporary check failure"):
        await first
    await done.wait()
    if runner.task:
        await runner.task
    assert calls == 2
    runner.schedule()
    await runner.task
    assert calls == 3


async def test_runner_start_stop_are_idempotent_and_allow_a_clean_restart(hass, monkeypatch):
    signal_unsub, interval_unsub = Mock(), Mock()
    connect = Mock(return_value=signal_unsub)
    interval = Mock(return_value=interval_unsub)
    monkeypatch.setattr("custom_components.puppy_tracker.notification_runner.async_dispatcher_connect", connect)
    monkeypatch.setattr("custom_components.puppy_tracker.notification_runner.async_track_time_interval", interval)
    check = AsyncMock()
    runner = NotificationCheckRunner(hass, check)
    runner.start(("signal",), timedelta(minutes=10))
    runner.start(("signal",), timedelta(minutes=10))
    await runner.task
    connect.assert_called_once()
    interval.assert_called_once()
    await runner.async_stop()
    await runner.async_stop()
    signal_unsub.assert_called_once()
    interval_unsub.assert_called_once()
    runner.schedule()
    assert runner.task is None
    runner.start(("signal",), timedelta(minutes=10))
    await runner.task
    assert check.await_count == 2
    await runner.async_stop()
