"""Shared background task scheduling helpers."""

from __future__ import annotations

import asyncio

# Strong references to background tasks so they don't get GC'd mid-execution.
# See: https://docs.python.org/3/library/asyncio-task.html#asyncio.create_task
_background_tasks: set[asyncio.Task] = set()


def spawn_background(coro) -> asyncio.Task:
    """Schedule a coroutine as a background task with a prevented GC reference."""
    task = asyncio.create_task(coro)
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)
    return task
