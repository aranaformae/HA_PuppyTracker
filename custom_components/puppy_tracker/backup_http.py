"""Authenticated, short-lived JSON backup download endpoints."""

from __future__ import annotations

from datetime import timedelta

from aiohttp import web

from homeassistant.components.http import HomeAssistantView
from homeassistant.components.http.auth import async_sign_path
from homeassistant.core import HomeAssistant
from homeassistant.helpers.network import get_url

from .backup import SCHEDULER_BACKUP_VERSION, serialize_export
from .const import DOMAIN
from .runtime import PuppyTrackerRuntimeData

DATA_BACKUP_HTTP_REGISTERED = f"{DOMAIN}_backup_http_registered"
DOWNLOAD_TTL = timedelta(minutes=10)


def _runtime(hass: HomeAssistant) -> PuppyTrackerRuntimeData:
    for entry in hass.config_entries.async_entries(DOMAIN):
        runtime = entry.runtime_data
        if isinstance(runtime, PuppyTrackerRuntimeData):
            return runtime
    raise RuntimeError("Puppy Tracker is not loaded")


def _download_response(
    runtime: PuppyTrackerRuntimeData,
    *,
    scope: str,
    litter_id: str | None = None,
    puppy_id: str | None = None,
) -> web.Response:
    care_reminder_settings = None
    scheduler_data = None
    if scope == "full":
        if runtime.care_reminders is None:
            raise RuntimeError("Puppy Tracker care reminders are not loaded")
        if runtime.care_programs is None:
            raise RuntimeError("Puppy Tracker care programs are not loaded")
        if runtime.recurring_reminders is None:
            raise RuntimeError("Puppy Tracker recurring reminders are not loaded")
        care_reminder_settings = runtime.care_reminders.get_backup_settings()
        scheduler_data = {
            "version": SCHEDULER_BACKUP_VERSION,
            "care_programs": runtime.care_programs.get_backup_data(),
            "recurring_reminders": runtime.recurring_reminders.get_backup_data(),
        }

    filename, _mime, content = serialize_export(
        runtime.storage,
        scope=scope,
        litter_id=litter_id,
        puppy_id=puppy_id,
        care_reminder_settings=care_reminder_settings,
        scheduler_data=scheduler_data,
    )
    return web.Response(
        text=content,
        content_type="application/json",
        charset="utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store, max-age=0",
            "X-Content-Type-Options": "nosniff",
        },
    )


class PuppyTrackerFullBackupView(HomeAssistantView):
    """Download a complete Puppy Tracker backup."""

    url = f"/api/{DOMAIN}/backup/full"
    name = f"api:{DOMAIN}:backup:full"
    requires_auth = True

    def __init__(self, hass: HomeAssistant) -> None:
        self._hass = hass

    async def get(self, request: web.Request) -> web.Response:
        del request
        return _download_response(_runtime(self._hass), scope="full")


class PuppyTrackerLitterBackupView(HomeAssistantView):
    """Download one complete litter backup."""

    url = f"/api/{DOMAIN}/backup/litter/{{litter_id}}"
    name = f"api:{DOMAIN}:backup:litter"
    requires_auth = True

    def __init__(self, hass: HomeAssistant) -> None:
        self._hass = hass

    async def get(self, request: web.Request, litter_id: str) -> web.Response:
        del request
        try:
            return _download_response(
                _runtime(self._hass),
                scope="litter",
                litter_id=litter_id,
            )
        except ValueError as err:
            raise web.HTTPNotFound(text=str(err)) from err


class PuppyTrackerPuppyBackupView(HomeAssistantView):
    """Download one puppy with its full measurement and dossier history."""

    url = f"/api/{DOMAIN}/backup/puppy/{{litter_id}}/{{puppy_id}}"
    name = f"api:{DOMAIN}:backup:puppy"
    requires_auth = True

    def __init__(self, hass: HomeAssistant) -> None:
        self._hass = hass

    async def get(
        self,
        request: web.Request,
        litter_id: str,
        puppy_id: str,
    ) -> web.Response:
        del request
        try:
            return _download_response(
                _runtime(self._hass),
                scope="puppy",
                litter_id=litter_id,
                puppy_id=puppy_id,
            )
        except ValueError as err:
            raise web.HTTPNotFound(text=str(err)) from err


def async_setup_backup_http(hass: HomeAssistant) -> None:
    """Register authenticated backup endpoints once per Home Assistant process."""
    if hass.data.get(DATA_BACKUP_HTTP_REGISTERED):
        return

    hass.http.register_view(PuppyTrackerFullBackupView(hass))
    hass.http.register_view(PuppyTrackerLitterBackupView(hass))
    hass.http.register_view(PuppyTrackerPuppyBackupView(hass))
    hass.data[DATA_BACKUP_HTTP_REGISTERED] = True


def async_signed_export_path(
    hass: HomeAssistant,
    *,
    scope: str,
    litter_id: str | None = None,
    puppy_id: str | None = None,
) -> str:
    """Return a short-lived signed absolute URL for one backup export."""
    async_setup_backup_http(hass)

    if scope == "full":
        path = f"/api/{DOMAIN}/backup/full"
    elif scope == "litter" and litter_id:
        path = f"/api/{DOMAIN}/backup/litter/{litter_id}"
    elif scope == "puppy" and litter_id and puppy_id:
        path = f"/api/{DOMAIN}/backup/puppy/{litter_id}/{puppy_id}"
    else:
        raise ValueError("Invalid export scope or owner")

    signed_path = async_sign_path(hass, path, DOWNLOAD_TTL)
    base_url = get_url(
        hass,
        prefer_external=True,
        allow_internal=True,
        allow_external=True,
        allow_cloud=True,
        allow_ip=True,
    )
    return f"{base_url.rstrip('/')}{signed_path}"
