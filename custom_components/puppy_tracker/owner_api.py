"""Websocket API for reusable owner/contact records."""

from __future__ import annotations

from typing import Any

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.dispatcher import async_dispatcher_send

from .const import DOMAIN, SIGNAL_DASHBOARD_UPDATE
from .runtime import get_runtime_data
from .storage_lock import mutation_coordinator
from .owners import PLACEMENT_FIELDS, OwnerConflict, owner_response


def _owners(hass: HomeAssistant):
    runtime = get_runtime_data(hass)
    return runtime.owners if runtime is not None else None


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/owners/list"})
@callback
def websocket_list_owners(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    owners = _owners(hass)
    if owners is None:
        connection.send_error(msg["id"], "not_loaded", "Puppy Tracker is not loaded")
        return
    connection.send_result(msg["id"], {"owners": [owner_response(owner) for owner in owners.get_all()]})


@websocket_api.require_admin
@websocket_api.websocket_command({
    vol.Required("type"): f"{DOMAIN}/owners/save",
    vol.Optional("owner_id"): str,
    vol.Optional("expected_revision"): str,
    vol.Required("name"): str,
    vol.Optional("email"): vol.Any(str, None),
    vol.Optional("phone"): vol.Any(str, None),
    vol.Optional("street"): vol.Any(str, None),
    vol.Optional("postal_code"): vol.Any(str, None),
    vol.Optional("city"): vol.Any(str, None),
    # Accepted for cached pre-schema-9 cards; OwnerStore migrates it to street.
    vol.Optional("address"): vol.Any(str, None),
    vol.Optional("notes"): vol.Any(str, None),
    vol.Optional("role"): str,
    vol.Optional("placement_status"): str,
    vol.Optional("placement_date"): vol.Any(str, None),
    vol.Optional("expected_pickup_date"): vol.Any(str, None),
    vol.Optional("payment_status"): str,
    vol.Optional("payment_date"): vol.Any(str, None),
    vol.Optional("payment_amount"): vol.Any(str, None),
    vol.Optional("registration_fee_amount"): vol.Any(str, None),
    vol.Optional("deposit_amount"): vol.Any(str, None),
    vol.Optional("deposit_date"): vol.Any(str, None),
    vol.Optional("payment_method"): str,
    vol.Optional("payment_balance"): vol.Any(str, None),
    vol.Optional("contact_preference"): str,
    vol.Optional("puppy_preferences"): [{
        vol.Required("puppy_id"): str,
        vol.Optional("note"): vol.Any(str, None),
    }],
    vol.Optional("litter_id"): vol.Any(str, None),
    vol.Optional("move_unassigned"): bool,
    vol.Optional("placement_notes"): vol.Any(str, None),
    vol.Optional("archived"): bool,
})
@websocket_api.async_response
async def websocket_save_owner(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    owners = _owners(hass)
    if owners is None:
        connection.send_error(msg["id"], "not_loaded", "Puppy Tracker is not loaded")
        return
    try:
        if msg.get("owner_id") and not msg.get("expected_revision"):
            raise OwnerConflict("Reload the contact before saving")
        async with mutation_coordinator(hass).operation():
            runtime = get_runtime_data(hass)
            litter_id = msg.get("litter_id")
            if any(field in msg for field in PLACEMENT_FIELDS) and "litter_id" not in msg:
                raise ValueError("Choose a litter before saving placement details")
            if litter_id:
                litter = runtime.storage.get_litter(litter_id)
                if litter is None:
                    raise ValueError("Unknown litter")
                puppy_ids = set(litter.get("puppies", {}))
                existing = owners.get(msg.get("owner_id")) or {}
                previous = existing.get("unassigned_placement") if msg.get("move_unassigned") else existing.get("placements", {}).get(litter_id)
                previous_preferences = (previous or {}).get("puppy_preferences", [])
                for preference in msg.get("puppy_preferences", []):
                    if preference["puppy_id"] not in puppy_ids and preference not in previous_preferences:
                        raise ValueError("Puppy preferences must belong to the selected litter")
            owner = await owners.async_upsert(msg, msg.get("owner_id"))
    except OwnerConflict as err:
        connection.send_error(msg["id"], "owner_conflict", str(err))
        return
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_owner", str(err))
        return
    async_dispatcher_send(hass, SIGNAL_DASHBOARD_UPDATE)
    connection.send_result(msg["id"], {"owner": owner_response(owner)})


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/owners/delete", vol.Required("owner_id"): str,
                                  vol.Optional("expected_revision"): str})
@websocket_api.async_response
async def websocket_delete_owner(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    owners = _owners(hass)
    if owners is None:
        connection.send_error(msg["id"], "not_loaded", "Puppy Tracker is not loaded")
        return
    try:
        if not msg.get("expected_revision"):
            raise OwnerConflict("Reload the contact before deleting")
        async with mutation_coordinator(hass).restore():
            runtime = get_runtime_data(hass)
            if any(msg["owner_id"] in (puppy.get("owner_ids") or [])
                   for litter in runtime.storage.get_litters().values()
                   for puppy in litter.get("puppies", {}).values()):
                connection.send_error(msg["id"], "owner_linked", "Unlink the contact from puppies before deleting it")
                return
            await owners.async_delete(msg["owner_id"], expected_revision=msg["expected_revision"])
    except OwnerConflict as err:
        connection.send_error(msg["id"], "owner_conflict", str(err))
        return
    except ValueError as err:
        connection.send_error(msg["id"], "not_found", str(err))
        return
    async_dispatcher_send(hass, SIGNAL_DASHBOARD_UPDATE)
    connection.send_result(msg["id"], {"ok": True})


@websocket_api.require_admin
@websocket_api.websocket_command({
    vol.Required("type"): f"{DOMAIN}/owners/payment/add",
    vol.Required("owner_id"): str,
    vol.Required("litter_id"): str,
    vol.Required("expected_revision"): str,
    vol.Required("request_id"): str,
    vol.Required("amount"): str,
    vol.Required("date"): str,
    vol.Required("kind"): str,
    vol.Required("method"): str,
    vol.Optional("reference"): str,
    vol.Optional("note"): str,
})
@websocket_api.async_response
async def websocket_add_owner_payment(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    owners = _owners(hass)
    if owners is None:
        connection.send_error(msg["id"], "not_loaded", "Puppy Tracker is not loaded")
        return
    try:
        async with mutation_coordinator(hass).operation():
            owner = await owners.async_record_payment(
                msg["owner_id"], msg["litter_id"], expected_revision=msg["expected_revision"],
                request_id=msg["request_id"], amount=msg["amount"], paid_date=msg["date"],
                kind=msg["kind"], method=msg["method"], reference=msg.get("reference", ""),
                note=msg.get("note", ""),
            )
    except OwnerConflict as err:
        connection.send_error(msg["id"], "owner_conflict", str(err))
        return
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_payment", str(err))
        return
    async_dispatcher_send(hass, SIGNAL_DASHBOARD_UPDATE)
    connection.send_result(msg["id"], {"owner": owner_response(owner)})


@websocket_api.require_admin
@websocket_api.websocket_command({
    vol.Required("type"): f"{DOMAIN}/owners/payment/void",
    vol.Required("owner_id"): str,
    vol.Required("litter_id"): str,
    vol.Required("payment_id"): str,
    vol.Required("expected_revision"): str,
    vol.Required("reason"): str,
})
@websocket_api.async_response
async def websocket_void_owner_payment(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    owners = _owners(hass)
    if owners is None:
        connection.send_error(msg["id"], "not_loaded", "Puppy Tracker is not loaded")
        return
    try:
        async with mutation_coordinator(hass).operation():
            owner = await owners.async_void_payment(
                msg["owner_id"], msg["litter_id"], msg["payment_id"],
                expected_revision=msg["expected_revision"], reason=msg["reason"],
            )
    except OwnerConflict as err:
        connection.send_error(msg["id"], "owner_conflict", str(err))
        return
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_payment", str(err))
        return
    async_dispatcher_send(hass, SIGNAL_DASHBOARD_UPDATE)
    connection.send_result(msg["id"], {"owner": owner_response(owner)})


@websocket_api.require_admin
@websocket_api.websocket_command({
    vol.Required("type"): f"{DOMAIN}/owners/link",
    vol.Required("litter_id"): str,
    vol.Required("puppy_id"): str,
    vol.Required("owner_ids"): [str],
    vol.Optional("expected_owner_ids"): [str],
})
@websocket_api.async_response
async def websocket_link_owners(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    """Link existing reusable owners to one puppy."""
    runtime = get_runtime_data(hass)
    if runtime is None or runtime.owners is None:
        connection.send_error(msg["id"], "not_loaded", "Puppy Tracker is not loaded")
        return
    try:
        async with mutation_coordinator(hass).restore():
            if any(runtime.owners.get(owner_id) is None for owner_id in msg["owner_ids"]):
                raise ValueError("Unknown owner")
            litter = runtime.storage.get_litter(msg["litter_id"])
            if litter is None or msg["puppy_id"] not in litter.get("puppies", {}):
                raise ValueError("Unknown puppy")
            linked = litter["puppies"][msg["puppy_id"]].get("owner_ids") or []
            if "expected_owner_ids" not in msg or set(msg["expected_owner_ids"]) != set(linked):
                raise OwnerConflict("Puppy links changed; reload before linking")
            before = runtime.owners.get_backup_data()
            try:
                for owner_id in set(msg["owner_ids"]):
                    if msg["litter_id"] not in runtime.owners.get(owner_id)["placements"]:
                        await runtime.owners.async_upsert({"litter_id": msg["litter_id"]}, owner_id)
                await runtime.storage.async_set_puppy_owner_ids(
                    msg["litter_id"], msg["puppy_id"], msg["owner_ids"]
                )
            except BaseException:
                await runtime.owners.async_restore_backup_data(before)
                raise
    except OwnerConflict as err:
        connection.send_error(msg["id"], "owner_conflict", str(err))
        return
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_puppy", str(err))
        return
    async_dispatcher_send(hass, SIGNAL_DASHBOARD_UPDATE)
    connection.send_result(msg["id"], {"ok": True, "owner_ids": msg["owner_ids"]})


def async_setup_owner_api(hass: HomeAssistant) -> None:
    """Register owner websocket commands once."""
    key = f"{DOMAIN}_owner_api_registered"
    if hass.data.get(key):
        return
    websocket_api.async_register_command(hass, websocket_list_owners)
    websocket_api.async_register_command(hass, websocket_save_owner)
    websocket_api.async_register_command(hass, websocket_delete_owner)
    websocket_api.async_register_command(hass, websocket_add_owner_payment)
    websocket_api.async_register_command(hass, websocket_void_owner_payment)
    websocket_api.async_register_command(hass, websocket_link_owners)
    hass.data[key] = True
