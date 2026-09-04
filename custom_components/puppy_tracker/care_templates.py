"""Reusable care-program templates with safe starter examples."""

from __future__ import annotations

import asyncio
from copy import deepcopy
from typing import Any
from uuid import uuid4

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .care_programs import normalize_care_program
from .const import DOMAIN

TEMPLATE_STORE_KEY = f"{DOMAIN}_care_program_templates"
TEMPLATE_STORE_VERSION = 1
TEMPLATE_FIELDS = (
    "title",
    "description",
    "record_type",
    "schedule_type",
    "start_age_days",
    "end_age_days",
    "interval_days",
    "time_of_day",
    "result_fields",
    "counts_for_attention",
    "notifications_enabled",
    "notification_lead_minutes",
    "instructions",
    "instructions_by_age",
)

BUILT_IN_TEMPLATES: tuple[dict[str, Any], ...] = (
    {
        "id": "builtin_ens_14_days", "name": "ENS · 14 dagen vanaf dag 3",
        "description": "Korte, rustige ENS-oefeningen. Werk stap voor stap en stop bij duidelijke stresssignalen.",
        "record_type": "note", "schedule_type": "range", "start_age_days": 3, "end_age_days": 16,
        "interval_days": 1, "time_of_day": "09:00", "result_fields": ["result", "score", "note"],
        "instructions": "1. Neem de pup rustig op.\n2. Voer per sessie een korte prikkel uit.\n3. Houd de pup warm en ondersteunend vast.\n4. Noteer de reactie en stop bij stress.",
    },
    {
        "id": "builtin_esi_14_days", "name": "ESI · 14 dagen vanaf dag 3",
        "description": "Voorzichtige opbouw van neutrale materialen naar duidelijkere natuurlijke geuren. Dit is een praktische heuristiek, geen gevalideerde intensiteitsschaal.",
        "record_type": "note", "schedule_type": "range", "start_age_days": 3, "end_age_days": 16,
        "interval_days": 1, "time_of_day": "10:00", "result_fields": ["result", "note"],
        "instructions": "Presenteer het item droog en indirect, bijvoorbeeld in een schoon ademend zakje of geperforeerd bakje. Begin kort, laat de pup weg bewegen en forceer niets. Gebruik geen etherische olie, parfum, schoonmaakmiddel, rook of los klein materiaal.",
        "instructions_by_age": {
            "3": "Geur 1 · zeer mild: schoon katoenen doekje.", "4": "Geur 2 · zeer mild: schoon karton.",
            "5": "Geur 3 · mild: schone wollen stof.", "6": "Geur 4 · mild: ongeparfumeerd hout.",
            "7": "Geur 5 · natuurlijk: droog gras.", "8": "Geur 6 · natuurlijk: schoon blad.",
            "9": "Geur 7 · duidelijker natuurlijk: droge aarde.", "10": "Geur 8 · duidelijker natuurlijk: schone dennennaald of dennenappel, zonder hars.",
            "11": "Geur 9 · objectgeur: ongeparfumeerde tennisbal.", "12": "Geur 10 · objectgeur: schoon leer.",
            "13": "Geur 11 · uitgesproken: droge zwarte thee in een afgesloten, ademend zakje.", "14": "Geur 12 · uitgesproken natuurlijk: gedroogde kamille in een afgesloten, ademend zakje.",
            "15": "Geur 13 · uitgesproken natuurlijk: gedroogde rozemarijn in een afgesloten, ademend zakje.", "16": "Geur 14 · individueel: herhaal de geur waarbij deze pup het meest ontspannen bleef.",
        },
    },
    {
        "id": "builtin_deworming_8_weeks", "name": "Ontworming · 2, 4, 6 en 8 weken",
        "description": "Voorbeeldschema; middel, dosering en definitieve planning altijd afstemmen met de dierenarts.",
        "record_type": "deworming", "schedule_type": "range", "start_age_days": 14, "end_age_days": 56,
        "interval_days": 14, "time_of_day": "09:00", "result_fields": ["result", "note"],
        "instructions": "1. Controleer gewicht en voorschrift.\n2. Dien alleen het voorgeschreven middel toe.\n3. Leg middel en dosering vast.\n4. Noteer bijzonderheden en de volgende geplande datum.",
    },
    {
        "id": "builtin_daily_neonatal_check", "name": "Dagelijkse neonatale controle",
        "description": "Dagelijkse korte controle van gedrag, drinken, temperatuur en algemene indruk.",
        "record_type": "note", "schedule_type": "range", "start_age_days": 0, "end_age_days": 14,
        "interval_days": 1, "time_of_day": "08:00", "result_fields": ["result", "note"],
        "instructions": "1. Observeer de pup vóór het oppakken.\n2. Controleer drinken, activiteit en temperatuur volgens het eigen protocol.\n3. Vergelijk met eerdere observaties.\n4. Noteer afwijkingen en overleg bij twijfel met de dierenarts.",
    },
)


def _normalize_template(data: dict[str, Any], template_id: str | None = None) -> dict[str, Any]:
    if not isinstance(data, dict):
        raise ValueError("template must be an object")
    name = str(data.get("name") or data.get("title") or "").strip()
    if not name:
        raise ValueError("template name is required")

    # Reuse the care-program validator so imported templates cannot be saved in
    # a shape that will only fail later when a program is created from them.
    program = normalize_care_program(
        {key: deepcopy(data[key]) for key in TEMPLATE_FIELDS if key in data}
        | {"litter_id": "__template__"},
        program_id="template-validation",
    )
    result = {key: deepcopy(program[key]) for key in TEMPLATE_FIELDS if key in program}
    result_id = template_id or str(data.get("id") or uuid4())
    if result_id.startswith("builtin_"):
        raise ValueError("template ids starting with builtin_ are reserved")
    result["id"] = result_id
    result["name"] = name
    return result


def normalize_care_template_backup_data(data: Any) -> dict[str, Any]:
    """Validate and normalize the user-owned care-template store snapshot."""
    if not isinstance(data, dict) or not isinstance(data.get("templates"), dict):
        raise ValueError("Care template backup templates must be an object")

    templates: dict[str, dict[str, Any]] = {}
    for key, value in data["templates"].items():
        template_id = str(key)
        if not template_id or not isinstance(value, dict):
            raise ValueError("Care template backup contains an invalid template")
        if str(value.get("id") or "") != template_id:
            raise ValueError("Care template backup identifier does not match its container key")
        templates[template_id] = _normalize_template(value, template_id)
    return {"templates": templates}


class CareProgramTemplateStore:
    """Persist user templates while exposing built-in starter templates."""

    def __init__(self, hass: HomeAssistant) -> None:
        self._store: Store[dict[str, Any]] = Store(hass, TEMPLATE_STORE_VERSION, TEMPLATE_STORE_KEY)
        self._data: dict[str, Any] = {"templates": {}}
        self._lock = asyncio.Lock()

    async def async_load(self) -> None:
        loaded = await self._store.async_load()
        templates = loaded.get("templates", {}) if isinstance(loaded, dict) else {}
        self._data = {"templates": {
            str(key): _normalize_template(value, str(key))
            for key, value in templates.items()
            if isinstance(value, dict)
        }} if isinstance(templates, dict) else {"templates": {}}
        if loaded != self._data:
            await self._store.async_save(self._data)

    def get_all(self) -> list[dict[str, Any]]:
        return [deepcopy(item) for item in BUILT_IN_TEMPLATES] + [deepcopy(item) for item in self._data["templates"].values()]

    def get(self, template_id: str) -> dict[str, Any] | None:
        for item in self.get_all():
            if item["id"] == template_id:
                return item
        return None

    async def async_save(self, data: dict[str, Any]) -> str:
        return (await self.async_save_many([data]))[0]

    async def async_save_many(self, data: list[dict[str, Any]]) -> list[str]:
        """Validate and persist a template batch as one storage operation."""
        items = [_normalize_template(item) for item in data]
        ids = [item["id"] for item in items]
        if len(ids) != len(set(ids)):
            raise ValueError("template ids must be unique within an import")
        async with self._lock:
            previous = deepcopy(self._data)
            self._data["templates"].update({item["id"]: item for item in items})
            try:
                await self._store.async_save(self._data)
            except Exception:
                self._data = previous
                raise
        return ids

    async def async_delete(self, template_id: str) -> None:
        if template_id.startswith("builtin_"):
            raise ValueError("Built-in templates cannot be deleted")
        async with self._lock:
            if template_id not in self._data["templates"]:
                raise ValueError("Unknown template")
            del self._data["templates"][template_id]
            await self._store.async_save(self._data)

    def get_backup_data(self) -> dict[str, Any]:
        return deepcopy(self._data)

    async def async_restore_backup_data(self, data: dict[str, Any]) -> None:
        """Atomically replace the user-owned template store snapshot."""
        restored = normalize_care_template_backup_data(data)
        async with self._lock:
            previous = deepcopy(self._data)
            self._data = restored
            try:
                await self._store.async_save(self._data)
            except Exception:
                self._data = previous
                try:
                    await self._store.async_save(self._data)
                except Exception:
                    pass
                raise
