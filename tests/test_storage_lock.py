"""Write barriers drain nested cross-store operations without starvation."""

import asyncio

import pytest

from custom_components.puppy_tracker.storage_lock import CoordinatedLock, MutationCoordinator


async def test_restore_waits_for_nested_writes_and_blocks_new_writers():
    gate = MutationCoordinator()
    first, second = CoordinatedLock(gate), CoordinatedLock(gate)
    entered, finish = asyncio.Event(), asyncio.Event()
    order = []

    async def existing_write():
        async with first:
            entered.set()
            await finish.wait()
            async with second:
                order.append("existing")

    async def restore():
        async with gate.restore():
            async with first:
                async with second:
                    order.append("restore")

    async def new_write():
        async with second:
            order.append("new")

    existing = asyncio.create_task(existing_write())
    await entered.wait()
    restoring = asyncio.create_task(restore())
    await asyncio.sleep(0)
    new = asyncio.create_task(new_write())
    await asyncio.sleep(0)
    finish.set()
    await asyncio.gather(existing, restoring, new)
    assert order == ["existing", "restore", "new"]


async def test_cancelling_waiting_restore_and_lock_waiter_releases_barrier():
    gate = MutationCoordinator()
    lock = CoordinatedLock(gate)
    await lock.acquire()

    async def restore():
        async with gate.restore():
            pass

    waiting = asyncio.create_task(lock.acquire())
    await asyncio.sleep(0)
    restoring = asyncio.create_task(restore())
    await asyncio.sleep(0)
    for task in (waiting, restoring):
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
    lock.release()
    async with gate.restore():
        async with lock:
            pass
    assert not gate._active
