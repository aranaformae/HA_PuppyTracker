"""Authenticated serving for registered managed logo assets."""

from aiohttp import web
from datetime import timedelta
from homeassistant.components.http import HomeAssistantView
from homeassistant.components.http.auth import async_sign_path
from homeassistant.core import HomeAssistant

from .const import DOMAIN
from .runtime import get_runtime_data
from .managed_files import validate_file_id


def signed_file_path(hass: HomeAssistant, file_id: str) -> str:
    return async_sign_path(hass, f"/api/{DOMAIN}/files/{validate_file_id(file_id)}", timedelta(minutes=10))


class ManagedFileView(HomeAssistantView):
    url = f"/api/{DOMAIN}/files/{{file_id}}"
    name = f"api:{DOMAIN}:files"
    requires_auth = True

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass

    async def get(self, request: web.Request, file_id: str) -> web.Response:
        runtime = get_runtime_data(self.hass)
        if runtime is None or file_id not in runtime.storage.get_managed_files():
            raise web.HTTPNotFound()
        # Only branding is exposed in this first phase, not future private documents.
        if runtime.storage.get_breeder().get("logo_file_id") != file_id:
            raise web.HTTPNotFound()
        try:
            content = await runtime.storage.files.async_read(file_id)
        except (OSError, ValueError) as err:
            raise web.HTTPNotFound() from err
        return web.Response(body=content, content_type="image/jpeg", headers={
            "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
            "Content-Disposition": 'inline; filename="breeder-logo.jpg"',
        })


def async_setup_managed_files_http(hass: HomeAssistant) -> None:
    key = f"{DOMAIN}_managed_files_http_registered"
    if not hass.data.get(key):
        hass.http.register_view(ManagedFileView(hass))
        hass.data[key] = True
