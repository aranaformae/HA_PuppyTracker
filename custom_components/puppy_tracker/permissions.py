"""Authorization shared by private HTTP export routes."""

from aiohttp import web
from homeassistant.components.http.const import KEY_HASS_USER


def require_admin_request(request: web.Request) -> None:
    """Recheck the HA principal, including for HA-signed download URLs."""
    user = request.get(KEY_HASS_USER)
    if user is None:
        raise web.HTTPUnauthorized()
    if not user.is_admin:
        raise web.HTTPForbidden()
