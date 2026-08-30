"""Typed runtime state for Puppy Weight Tracker."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from .session import new_session_state
from .storage import PuppyWeightStorage

if TYPE_CHECKING:
    from .notifications import PuppyNotificationManager


@dataclass(slots=True)
class PuppyWeightTrackerRuntimeData:
    """Runtime-only state owned by one config entry."""

    storage: PuppyWeightStorage
    selected_litter_id: str | None = None
    selected_puppy_id: str | None = None
    weight_input: float = 0.0
    weighing_session: dict[str, Any] = field(default_factory=new_session_state)
    notification_manager: PuppyNotificationManager | None = None
