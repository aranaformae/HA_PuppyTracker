"""Refresh date-derived views at Home Assistant local midnight."""
from datetime import datetime

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.helpers.event import async_track_time_change

from .const import SIGNAL_DASHBOARD_UPDATE


@callback
def async_setup_day_rollover(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Use HA's local clock scheduler, with cleanup on integration unload."""
    @callback
    def refresh(_now: datetime) -> None:
        async_dispatcher_send(hass, SIGNAL_DASHBOARD_UPDATE)

    entry.async_on_unload(async_track_time_change(hass, refresh, hour=0, minute=0, second=0))
