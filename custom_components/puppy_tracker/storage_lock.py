"""Allow normal store writes together, but isolate a complete backup restore."""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

from homeassistant.core import HomeAssistant


class MutationCoordinator:
    """Task-aware write barrier shared by all stores of the integration."""

    def __init__(self) -> None:
        self._active: dict[asyncio.Task, int] = {}
        self._restoring: asyncio.Task | None = None
        self._waiting_restores = 0
        self._changed = asyncio.Event()

    def _notify(self) -> None:
        self._changed.set()
        self._changed = asyncio.Event()

    async def acquire(self) -> asyncio.Task:
        task = asyncio.current_task()
        if task is None:
            raise RuntimeError("Store writes require an asyncio task")
        # An existing cross-store operation may finish while a restore waits.
        while (self._restoring not in (None, task)
               or (self._waiting_restores and self._restoring is not task and task not in self._active)):
            await self._changed.wait()
        self._active[task] = self._active.get(task, 0) + 1
        return task

    def release(self, task: asyncio.Task) -> None:
        count = self._active[task] - 1
        if count:
            self._active[task] = count
        else:
            del self._active[task]
        self._notify()

    @asynccontextmanager
    async def operation(self):
        """Keep a multi-step write inside the barrier until all steps finish."""
        task = await self.acquire()
        try:
            yield
        finally:
            self.release(task)

    @asynccontextmanager
    async def restore(self):
        task = asyncio.current_task()
        if self._restoring is task:
            yield
            return
        if task in self._active:
            raise RuntimeError("Start restores outside individual store locks")
        self._waiting_restores += 1
        try:
            while self._restoring is not None or self._active:
                await self._changed.wait()
            self._restoring = task
        finally:
            self._waiting_restores -= 1
            self._notify()
        try:
            yield
        finally:
            self._restoring = None
            self._notify()


def mutation_coordinator(hass: HomeAssistant) -> MutationCoordinator:
    key = "puppy_tracker_mutation_coordinator"
    if key not in hass.data:
        hass.data[key] = MutationCoordinator()
    return hass.data[key]


class CoordinatedLock:
    """An ordinary per-store lock which also participates in the write barrier."""

    def __init__(self, coordinator: MutationCoordinator) -> None:
        self._coordinator = coordinator
        self._lock = asyncio.Lock()
        self._owner: asyncio.Task | None = None

    async def acquire(self) -> bool:
        task = await self._coordinator.acquire()
        try:
            await self._lock.acquire()
        except BaseException:
            self._coordinator.release(task)
            raise
        self._owner = task
        return True

    def release(self) -> None:
        if not self._lock.locked() or self._owner is None:
            raise RuntimeError("Lock is not acquired")
        owner = self._owner
        self._owner = None
        self._lock.release()
        self._coordinator.release(owner)

    def locked(self) -> bool:
        return self._lock.locked()

    async def __aenter__(self):
        await self.acquire()
        return self

    async def __aexit__(self, *args) -> None:
        self.release()
