"""Shared lifecycle for coalesced notification checks, without delivery rules."""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable, Iterable
from contextlib import suppress
from datetime import timedelta
from typing import Any

from homeassistant.core import CALLBACK_TYPE, HomeAssistant, callback
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.event import async_track_time_interval


class NotificationCheckRunner:
    """Own subscriptions, reruns and cancellation for one notification manager."""

    def __init__(self, hass: HomeAssistant, check: Callable[[], Awaitable[None]]) -> None:
        self.hass = hass
        self._check = check
        self._unsub: list[CALLBACK_TYPE] = []
        self.task: asyncio.Task[None] | None = None
        self.stopping = False
        self._scheduled = False
        self._rerun_requested = False

    @callback
    def start(self, signals: Iterable[str], interval: timedelta) -> None:
        if self._unsub or (self.stopping and self.task is not None):
            return
        self.stopping = False
        self._unsub = [async_dispatcher_connect(self.hass, signal, self.schedule) for signal in signals]
        self._unsub.append(async_track_time_interval(self.hass, self.schedule, interval))
        self.schedule()

    @callback
    def schedule(self, *args: Any) -> None:
        if self.stopping:
            return
        if self._scheduled:
            self._rerun_requested = True
            return
        self._scheduled = True
        self.task = self.hass.async_create_task(self._run())

    async def _run(self) -> None:
        try:
            while True:
                self._rerun_requested = False
                await self._check()
                # Include updates dispatched by a completed check's writes.
                await asyncio.sleep(0)
                if not self._rerun_requested:
                    break
        finally:
            self._scheduled = False
            self.task = None
            if self._rerun_requested and not self.stopping:
                self._rerun_requested = False
                self.schedule()

    async def async_stop(self) -> None:
        self.stopping = True
        for unsub in self._unsub:
            unsub()
        self._unsub.clear()
        task = self.task
        if task is not None and not task.done():
            task.cancel()
            with suppress(asyncio.CancelledError):
                await task
        self.task = None
        self._scheduled = False
        self._rerun_requested = False
