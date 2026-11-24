"""Exercise the installed HA runtime without a mismatched pytest fixture package.

Run in a dedicated virtual environment with the pinned compatibility requirements.
All data, configuration and HTTP traffic are temporary/local; no real HA instance
or GitHub account is used. This supplements, not replaces, the full pytest matrix.
"""
from __future__ import annotations

import argparse
import asyncio
from datetime import timedelta
from importlib.metadata import version
import logging
from pathlib import Path
import socket
import sys
from tempfile import TemporaryDirectory

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


async def check(config_dir: str) -> None:
    from aiohttp import ClientSession
    from homeassistant import bootstrap, loader
    from homeassistant.auth.const import GROUP_ID_ADMIN
    from homeassistant.config_entries import ConfigEntryState
    from homeassistant.core import HomeAssistant
    from homeassistant.helpers import entity_registry as er
    from homeassistant.helpers import issue_registry as ir
    from homeassistant.exceptions import HomeAssistantError
    from homeassistant.util import dt as dt_util

    from custom_components.puppy_tracker.const import DOMAIN
    from custom_components.puppy_tracker.frontend import FRONTEND_URL
    from custom_components.puppy_tracker.repairs import issue_id

    # Ask the OS for a local test port rather than claiming the user's HA port.
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    config = {
        "homeassistant": {"latitude": 52.0, "longitude": 5.0, "elevation": 0,
                          "time_zone": "Europe/Amsterdam", "unit_system": "metric", "country": "NL"},
        "http": {"server_host": "127.0.0.1", "server_port": port},
        "frontend": {},
    }
    hass = HomeAssistant(config_dir)
    loader.async_setup(hass)
    try:
        assert await bootstrap.async_from_config_dict(config, hass) is hass
        await hass.async_start()
        print("PASS: native Home Assistant startup", flush=True)
        flow = await hass.config_entries.flow.async_init(DOMAIN, context={"source": "user"})
        assert flow["type"] == "form" and flow["step_id"] == "user", flow
        created = await hass.config_entries.flow.async_configure(flow["flow_id"], {})
        assert created["type"] == "create_entry", created
        entry = created["result"]
        await hass.async_block_till_done()
        assert entry.state is ConfigEntryState.LOADED, entry.state
        print("PASS: first-install config flow and platform loading without restart", flush=True)

        await hass.services.async_call(DOMAIN, "create_litter", {"name": "Runtime test litter"}, blocking=True)
        storage = entry.runtime_data.storage
        litter_id = next(iter(storage.get_litters()))
        born = (dt_util.now() - timedelta(days=3)).isoformat()
        await hass.services.async_call(DOMAIN, "add_puppy", {"litter_id": litter_id,
            "name": "Runtime test pup", "collar_color": "paars", "birth_weight": 400,
            "birth_time": born}, blocking=True)
        puppy_id = next(iter(storage.get_litter(litter_id)["puppies"]))
        await hass.services.async_call(DOMAIN, "record_weight", {"litter_id": litter_id,
            "puppy_id": puppy_id, "weight": 450}, blocking=True)
        await hass.async_block_till_done()
        measurements = storage.get_active_measurements(litter_id, puppy_id)
        assert measurements[-1]["weight"] == 450
        registry = er.async_get(hass)
        assert any(e.unique_id == f"{puppy_id}_weight" for e in er.async_entries_for_config_entry(registry, entry.entry_id))
        print("PASS: create litter/puppy, weighing, persistent data and entity registration", flush=True)

        # Exercise HA's actual hidden-field filtering, not just our form handler.
        storage._data["settings"].update(notification_lead_minutes=25,
            notify_recovery=True, notify_session_complete=True)
        options = await hass.config_entries.options.async_init(entry.entry_id)
        for step in ("monitoring_and_notifications", "notifications", "notification_preferences"):
            options = await hass.config_entries.options.async_configure(
                options["flow_id"], {"next_step_id": step})
        markers = {key.schema: key for key in options["data_schema"].schema}
        assert markers["notify_recovery"].visible == {"field": "notifications_enabled", "value": True}
        options = await hass.config_entries.options.async_configure(options["flow_id"], {
            "notifications_enabled": False, "recurring_reminder_notifications_enabled": False})
        assert options["type"] == "create_entry", options
        settings = storage.get_settings()
        assert settings["notification_lead_minutes"] == 25
        assert settings["notify_recovery"] and settings["notify_session_complete"]
        print("PASS: native conditional forms preserve hidden notification preferences", flush=True)

        try:
            await hass.services.async_call(DOMAIN, "backup_to_file", {
                "path": "www/blocked.json"}, blocking=True)
        except (ValueError, HomeAssistantError):
            pass
        else:
            raise AssertionError("Public backup destinations must be rejected")
        await hass.async_block_till_done()
        backup_issue = issue_id(entry, "backup_failed")
        assert ir.async_get(hass).async_get_issue(DOMAIN, backup_issue).config_entry_id == entry.entry_id

        async def check_frontend():
            async with ClientSession() as client:
                for name in ("puppy-tracker-workspace-card.js", "puppy-tracker-overview-card.js",
                             "puppy-tracker-growth-comparison.js", "puppy-tracker-section-strategy.js"):
                    async with client.get(f"http://127.0.0.1:{port}{FRONTEND_URL}/{name}") as response:
                        assert response.status == 200, (name, response.status)
                        assert "text/javascript" in response.headers.get("Content-Type", "")
                        assert await response.text()
        await check_frontend()
        print("PASS: actual HTTP delivery of Workspace and imported card modules", flush=True)

        user = await hass.auth.async_create_user("Temporary runtime test", group_ids=[GROUP_ID_ADMIN])
        token = await hass.auth.async_create_refresh_token(user, client_id="https://runtime.test")
        access_token = hass.auth.async_create_access_token(token)
        async with ClientSession() as client, client.ws_connect(f"http://127.0.0.1:{port}/api/websocket") as ws:
            assert (await ws.receive_json())["type"] == "auth_required"
            await ws.send_json({"type": "auth", "access_token": access_token})
            assert (await ws.receive_json())["type"] == "auth_ok"
            await ws.send_json({"id": 1, "type": f"{DOMAIN}/data", "litter_id": litter_id})
            result = await ws.receive_json()
            assert result["success"], result
            assert result["result"]["puppies"][0]["id"] == puppy_id
        print("PASS: authenticated native WebSocket dashboard request", flush=True)

        # Native unload/reload is the runtime side of an installed update. The
        # Marketplace download/catalog, browser rendering and HACS migration are
        # separate checks; this script does not claim to exercise those.
        assert await hass.config_entries.async_unload(entry.entry_id)
        assert entry.state is ConfigEntryState.NOT_LOADED
        assert await hass.config_entries.async_setup(entry.entry_id)
        await hass.async_block_till_done()
        assert entry.state is ConfigEntryState.LOADED
        restored = entry.runtime_data.storage.get_active_measurements(litter_id, puppy_id)
        assert restored == measurements
        await check_frontend()
        print("PASS: native unload/reload preserves weights and card routes", flush=True)
        assert ir.async_get(hass).async_get_issue(DOMAIN, backup_issue) is not None
        await hass.services.async_call(DOMAIN, "backup_to_file", {
            "path": "backups/runtime.json"}, blocking=True)
        await hass.async_block_till_done()
        assert ir.async_get(hass).async_get_issue(DOMAIN, backup_issue) is None
        print("PASS: entry-linked Repairs survive reload and clear after a successful file backup", flush=True)
    finally:
        await hass.async_stop(force=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--expect-version", required=True)
    args = parser.parse_args()
    actual = version("homeassistant")
    if actual != args.expect_version:
        raise SystemExit(f"Expected Home Assistant {args.expect_version}, found {actual}")
    print(f"Home Assistant {actual}; Python {sys.version.split()[0]}", flush=True)
    logging.basicConfig(level=logging.WARNING)
    with TemporaryDirectory(prefix="puppy-tracker-runtime-") as config_dir:
        asyncio.run(asyncio.wait_for(check(config_dir), timeout=120))


if __name__ == "__main__":
    main()
