"""Authenticated mother dossier backup download endpoint."""

from __future__ import annotations

from datetime import timedelta

from aiohttp import web

from homeassistant.components.http import HomeAssistantView
from homeassistant.components.http.auth import async_sign_path
from homeassistant.core import HomeAssistant
from homeassistant.helpers.network import get_url

from .const import DOMAIN
from .mother_backup import serialize_mother_export
from .runtime import PuppyTrackerRuntimeData

DATA_MOTHER_BACKUP_HTTP_REGISTERED = f"{DOMAIN}_mother_backup_http_registered"
DOWNLOAD_TTL = timedelta(minutes=10)


def _runtime(hass: HomeAssistant) -> PuppyTrackerRuntimeData:
    for entry in hass.config_entries.async_entries(DOMAIN):
        runtime = entry.runtime_data
        if isinstance(runtime, PuppyTrackerRuntimeData):
            return runtime
    raise RuntimeError("Puppy Tracker is not loaded")


class PuppyTrackerMotherBackupView(HomeAssistantView):
    """Download one mother's dossier, optionally limited to one litter."""

    url = f"/api/{DOMAIN}/backup/mother/{{mother_id}}"
    name = f"api:{DOMAIN}:backup:mother"
    requires_auth = True

    def __init__(self, hass: HomeAssistant) -> None:
        self._hass = hass

    async def get(self, request: web.Request, mother_id: str) -> web.Response:
        litter_id = request.query.get("litter_id") or None
        try:
            filename, _mime, content = serialize_mother_export(
                _runtime(self._hass).storage.get_data(),
                mother_id,
                litter_id=litter_id,
            )
        except ValueError as err:
            raise web.HTTPNotFound(text=str(err)) from err
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


def async_setup_mother_backup_http(hass: HomeAssistant) -> None:
    """Register the mother backup endpoint once."""
    if hass.data.get(DATA_MOTHER_BACKUP_HTTP_REGISTERED):
        return
    hass.http.register_view(PuppyTrackerMotherBackupView(hass))
    hass.data[DATA_MOTHER_BACKUP_HTTP_REGISTERED] = True


def async_signed_mother_export_path(
    hass: HomeAssistant,
    *,
    mother_id: str,
    litter_id: str | None = None,
) -> str:
    """Return a short-lived signed absolute URL for one mother export."""
    async_setup_mother_backup_http(hass)
    path = f"/api/{DOMAIN}/backup/mother/{mother_id}"
    if litter_id:
        path = f"{path}?litter_id={litter_id}"
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
