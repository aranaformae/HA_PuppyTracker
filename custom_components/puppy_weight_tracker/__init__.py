"""Puppy Weight Tracker integration."""

from __future__ import annotations

import logging

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.dispatcher import async_dispatcher_send

from .api import async_setup_api
from .const import (
    DOMAIN,
    SIGNAL_DASHBOARD_UPDATE,
    SIGNAL_NEW_LITTER,
    SIGNAL_NEW_PUPPY,
    SIGNAL_UPDATE,
)
from .devices import async_sync_devices
from .frontend import async_setup_frontend, async_unload_frontend
from .notifications import PuppyNotificationManager
from .session import (
    get_session,
    mark_weight_recorded,
    new_session_state,
)
from .storage import PuppyWeightStorage


_LOGGER = logging.getLogger(__name__)


PLATFORMS = [
    "sensor",
    "binary_sensor",
    "select",
    "number",
    "button",
]


SERVICE_CREATE_LITTER = "create_litter"
SERVICE_ADD_PUPPY = "add_puppy"
SERVICE_RECORD_WEIGHT = "record_weight"


CREATE_LITTER_SCHEMA = vol.Schema(
    {
        vol.Required(
            "name"
        ): cv.string,

        vol.Optional(
            "birth_date"
        ): cv.string,

        vol.Optional(
            "mother"
        ): cv.string,

        vol.Optional(
            "father"
        ): cv.string,
    }
)


ADD_PUPPY_SCHEMA = vol.Schema(
    {
        vol.Required(
            "litter_id"
        ): cv.string,

        vol.Required(
            "name"
        ): cv.string,

        vol.Optional(
            "collar_color"
        ): cv.string,

        vol.Optional(
            "sex"
        ): cv.string,

        vol.Optional(
            "birth_weight"
        ): vol.All(
            vol.Coerce(float),
            vol.Range(
                min=1,
                max=5000,
            ),
        ),

        vol.Optional(
            "birth_time"
        ): cv.string,

        vol.Optional(
            "notes"
        ): cv.string,
    }
)


RECORD_WEIGHT_SCHEMA = vol.Schema(
    {
        vol.Required(
            "litter_id"
        ): cv.string,

        vol.Required(
            "puppy_id"
        ): cv.string,

        vol.Required(
            "weight"
        ): vol.All(
            vol.Coerce(float),
            vol.Range(
                min=1,
                max=10000,
            ),
        ),

        vol.Optional(
            "timestamp"
        ): cv.string,

        vol.Optional(
            "note"
        ): cv.string,
    }
)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
) -> bool:
    """Set up Puppy Weight Tracker."""

    storage = PuppyWeightStorage(
        hass
    )

    await storage.async_load()

    hass.data.setdefault(
        DOMAIN,
        {},
    )

    hass.data[
        DOMAIN
    ][
        entry.entry_id
    ] = {
        "storage": storage,
        "selected_litter_id": None,
        "selected_puppy_id": None,
        "weight_input": 0.0,
        "weighing_session": new_session_state(),
    }

    runtime = hass.data[
        DOMAIN
    ][
        entry.entry_id
    ]

    async_setup_api(hass)
    await async_setup_frontend(hass)

    async_sync_devices(
        hass,
        entry,
        storage.get_data(),
    )

    await hass.config_entries.async_forward_entry_setups(
        entry,
        PLATFORMS,
    )

    notification_manager = PuppyNotificationManager(
        hass,
        entry,
        storage,
        runtime,
    )
    runtime["notification_manager"] = notification_manager
    await notification_manager.async_start()

    async def handle_create_litter(
        call: ServiceCall,
    ) -> None:
        """Create a litter."""

        litter_id = await storage.async_create_litter(
            name=call.data[
                "name"
            ],
            birth_date=call.data.get(
                "birth_date"
            ),
            mother=call.data.get(
                "mother"
            ),
            father=call.data.get(
                "father"
            ),
        )

        async_sync_devices(
            hass,
            entry,
            storage.get_data(),
        )

        async_dispatcher_send(
            hass,
            SIGNAL_NEW_LITTER,
            litter_id,
        )

        async_dispatcher_send(
            hass,
            SIGNAL_DASHBOARD_UPDATE,
        )

        _LOGGER.info(
            "Created puppy litter '%s' with id %s",
            call.data["name"],
            litter_id,
        )

    async def handle_add_puppy(
        call: ServiceCall,
    ) -> None:
        """Add a puppy."""

        puppy_id = await storage.async_add_puppy(
            litter_id=call.data[
                "litter_id"
            ],
            name=call.data[
                "name"
            ],
            birth_weight=call.data.get(
                "birth_weight"
            ),
            birth_time=call.data.get(
                "birth_time"
            ),
            collar_color=call.data.get(
                "collar_color"
            ),
            sex=call.data.get(
                "sex"
            ),
            notes=call.data.get(
                "notes"
            ),
        )

        async_sync_devices(
            hass,
            entry,
            storage.get_data(),
        )

        async_dispatcher_send(
            hass,
            SIGNAL_NEW_PUPPY,
            call.data[
                "litter_id"
            ],
            puppy_id,
        )

        async_dispatcher_send(
            hass,
            SIGNAL_UPDATE,
            puppy_id,
        )

        async_dispatcher_send(
            hass,
            SIGNAL_DASHBOARD_UPDATE,
        )

        _LOGGER.info(
            "Added puppy '%s' with id %s",
            call.data["name"],
            puppy_id,
        )

    async def handle_record_weight(
        call: ServiceCall,
    ) -> None:
        """Record puppy weight."""

        litter_id = call.data[
            "litter_id"
        ]

        puppy_id = call.data[
            "puppy_id"
        ]

        weight = float(
            call.data[
                "weight"
            ]
        )

        puppy = storage.get_puppy(
            litter_id,
            puppy_id,
        )

        if puppy is None:
            raise ValueError(
                "The specified puppy does not exist in this litter"
            )

        measurement_id = (
            await storage.async_record_weight(
                litter_id=litter_id,
                puppy_id=puppy_id,
                weight=weight,
                timestamp=call.data.get(
                    "timestamp"
                ),
                note=call.data.get(
                    "note"
                ),
            )
        )

        session_completed = mark_weight_recorded(
            runtime,
            litter_id=litter_id,
            puppy_id=puppy_id,
            puppy_name=puppy.get(
                "name",
                "Puppy",
            ),
            weight=weight,
        )

        if session_completed:
            await storage.async_record_completed_weighing_session(
                litter_id,
                get_session(runtime),
            )

        async_dispatcher_send(
            hass,
            SIGNAL_UPDATE,
            puppy_id,
        )

        async_dispatcher_send(
            hass,
            SIGNAL_DASHBOARD_UPDATE,
        )

        _LOGGER.info(
            "Recorded weight %.1f g for puppy '%s' "
            "(measurement %s)",
            weight,
            puppy.get(
                "name",
                puppy_id,
            ),
            measurement_id,
        )

    if not hass.services.has_service(
        DOMAIN,
        SERVICE_CREATE_LITTER,
    ):
        hass.services.async_register(
            DOMAIN,
            SERVICE_CREATE_LITTER,
            handle_create_litter,
            schema=CREATE_LITTER_SCHEMA,
        )

    if not hass.services.has_service(
        DOMAIN,
        SERVICE_ADD_PUPPY,
    ):
        hass.services.async_register(
            DOMAIN,
            SERVICE_ADD_PUPPY,
            handle_add_puppy,
            schema=ADD_PUPPY_SCHEMA,
        )

    if not hass.services.has_service(
        DOMAIN,
        SERVICE_RECORD_WEIGHT,
    ):
        hass.services.async_register(
            DOMAIN,
            SERVICE_RECORD_WEIGHT,
            handle_record_weight,
            schema=RECORD_WEIGHT_SCHEMA,
        )

    return True


async def async_unload_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
) -> bool:
    """Unload Puppy Weight Tracker."""

    unload_ok = (
        await hass.config_entries.async_unload_platforms(
            entry,
            PLATFORMS,
        )
    )

    if not unload_ok:
        return False

    runtime = hass.data.get(DOMAIN, {}).get(entry.entry_id, {})
    notification_manager = runtime.get("notification_manager")
    if notification_manager is not None:
        await notification_manager.async_stop()

    async_unload_frontend(hass)

    for service in (
        SERVICE_CREATE_LITTER,
        SERVICE_ADD_PUPPY,
        SERVICE_RECORD_WEIGHT,
    ):
        if hass.services.has_service(
            DOMAIN,
            service,
        ):
            hass.services.async_remove(
                DOMAIN,
                service,
            )

    if DOMAIN in hass.data:
        hass.data[
            DOMAIN
        ].pop(
            entry.entry_id,
            None,
        )

        if not hass.data[
            DOMAIN
        ]:
            hass.data.pop(
                DOMAIN
            )

    return True