"""Mother profile and dossier storage extension for Puppy Tracker."""

from __future__ import annotations

from copy import deepcopy
from typing import Any
from uuid import uuid4

from .records import create_record, normalize_record, sorted_records, validate_record_type
from .storage import PuppyTrackerStorage, _now_iso
from .time_utils import normalize_timestamp

MOTHER_SCHEMA_VERSION = 8


def _clean_name(value: str | None) -> str | None:
    if not isinstance(value, str):
        return None
    value = value.strip()
    return value or None


def _name_key(value: str | None) -> str:
    return (_clean_name(value) or "").casefold()


class MotherScopeStorage(PuppyTrackerStorage):
    """Puppy Tracker storage with reusable mother profiles."""

    async def async_load(self) -> None:
        await super().async_load()
        changed = self._migrate_mothers()
        if self._data.get("schema_version", 1) < MOTHER_SCHEMA_VERSION:
            self._data["schema_version"] = MOTHER_SCHEMA_VERSION
            changed = True
        if changed:
            await self.async_save()

    def _migrate_mothers(self) -> bool:
        """Create reusable mother profiles and link existing litters safely."""
        changed = False
        now = _now_iso()
        mothers = self._data.setdefault("mothers", {})
        if not isinstance(mothers, dict):
            return False

        by_name = {
            _name_key(mother.get("name")): str(mother_id)
            for mother_id, mother in mothers.items()
            if isinstance(mother, dict) and _name_key(mother.get("name"))
        }

        for litter_id, litter in self._data.get("litters", {}).items():
            if not isinstance(litter, dict):
                continue
            mother_name = _clean_name(litter.get("mother"))
            mother_id = litter.get("mother_id")
            mother = mothers.get(str(mother_id)) if mother_id else None

            if mother is None and mother_name:
                existing_id = by_name.get(_name_key(mother_name))
                if existing_id:
                    mother_id = existing_id
                    mother = mothers[existing_id]
                else:
                    mother_id = str(uuid4())
                    mother = {
                        "id": mother_id,
                        "name": mother_name,
                        "profile_note": None,
                        "records": [],
                        "created_at": now,
                        "updated_at": now,
                    }
                    mothers[mother_id] = mother
                    by_name[_name_key(mother_name)] = mother_id
                    changed = True

            if mother is not None:
                mother.setdefault("id", str(mother_id))
                mother.setdefault("name", mother_name or "Moederhond")
                mother.setdefault("profile_note", None)
                mother.setdefault("records", [])
                mother.setdefault("created_at", now)
                mother.setdefault("updated_at", now)
                if litter.get("mother_id") != str(mother_id):
                    litter["mother_id"] = str(mother_id)
                    changed = True
                if not mother_name and mother.get("name"):
                    litter["mother"] = mother.get("name")
                    changed = True
            elif "mother_id" not in litter:
                litter["mother_id"] = None
                changed = True

        linked_litters: dict[str, str] = {}
        for litter_id, litter in self._data.get("litters", {}).items():
            if isinstance(litter, dict) and litter.get("mother_id"):
                linked_litters.setdefault(str(litter["mother_id"]), str(litter_id))

        for mother_id, mother in mothers.items():
            if not isinstance(mother, dict):
                continue
            records = mother.get("records")
            if not isinstance(records, list):
                continue
            fallback_litter_id = linked_litters.get(str(mother_id), "")
            for record in records:
                if not isinstance(record, dict):
                    continue
                litter_id = str(record.get("litter_id") or fallback_litter_id)
                if litter_id and normalize_record(
                    record,
                    litter_id=litter_id,
                    mother_id=str(mother_id),
                    puppy_id=None,
                    now=now,
                ):
                    changed = True

        return changed

    def _find_mother_by_name(self, name: str | None) -> dict[str, Any] | None:
        key = _name_key(name)
        if not key:
            return None
        for mother in self._data.get("mothers", {}).values():
            if isinstance(mother, dict) and _name_key(mother.get("name")) == key:
                return mother
        return None

    async def _link_litter_mother(self, litter_id: str, mother_name: str | None) -> None:
        async with self._lock:
            litter = self._require_litter(litter_id)
            name = _clean_name(mother_name)
            now = _now_iso()
            if not name:
                litter["mother_id"] = None
                litter["mother"] = None
                litter["updated_at"] = now
            else:
                mother = self._find_mother_by_name(name)
                if mother is None:
                    mother_id = str(uuid4())
                    mother = {
                        "id": mother_id,
                        "name": name,
                        "profile_note": None,
                        "records": [],
                        "created_at": now,
                        "updated_at": now,
                    }
                    self._data.setdefault("mothers", {})[mother_id] = mother
                litter["mother_id"] = mother["id"]
                litter["mother"] = mother["name"]
                litter["updated_at"] = now
            self._data["updated_at"] = now
        await self.async_save()

    async def async_create_litter(
        self,
        name: str,
        birth_date: str | None = None,
        mother: str | None = None,
        father: str | None = None,
    ) -> str:
        litter_id = await super().async_create_litter(
            name=name,
            birth_date=birth_date,
            mother=mother,
            father=father,
        )
        await self._link_litter_mother(litter_id, mother)
        return litter_id

    async def async_update_litter(
        self,
        litter_id: str,
        *,
        name: str,
        birth_date: str | None,
        mother: str | None,
        father: str | None,
        growth_analysis: dict[str, Any] | None = None,
    ) -> None:
        await super().async_update_litter(
            litter_id,
            name=name,
            birth_date=birth_date,
            mother=mother,
            father=father,
            growth_analysis=growth_analysis,
        )
        await self._link_litter_mother(litter_id, mother)

    def get_mothers(self) -> list[dict[str, Any]]:
        """Return all mother profiles sorted by name."""
        mothers = [
            deepcopy(item)
            for item in self._data.get("mothers", {}).values()
            if isinstance(item, dict)
        ]
        mothers.sort(key=lambda item: str(item.get("name") or "").casefold())
        return mothers

    def get_mother(self, mother_id: str) -> dict[str, Any] | None:
        mother = self._data.get("mothers", {}).get(mother_id)
        return deepcopy(mother) if isinstance(mother, dict) else None

    def get_mother_for_litter(self, litter_id: str) -> dict[str, Any] | None:
        litter = self.get_litter(litter_id)
        if not litter or not litter.get("mother_id"):
            return None
        return self.get_mother(str(litter["mother_id"]))

    def _require_mother(self, mother_id: str) -> dict[str, Any]:
        mother = self._data.get("mothers", {}).get(mother_id)
        if not isinstance(mother, dict):
            raise ValueError(f"Unknown mother: {mother_id}")
        return mother

    async def async_update_mother_profile_note(
        self, mother_id: str, profile_note: str | None
    ) -> None:
        async with self._lock:
            mother = self._require_mother(mother_id)
            note = (
                profile_note.strip()
                if isinstance(profile_note, str) and profile_note.strip()
                else None
            )
            mother["profile_note"] = note
            mother["updated_at"] = _now_iso()
        await self.async_save()

    def get_records(
        self,
        litter_id: str,
        puppy_id: str | None = None,
        *,
        mother_id: str | None = None,
        include_deleted: bool = False,
        newest_first: bool = False,
    ) -> list[dict[str, Any]]:
        if mother_id is None:
            return super().get_records(
                litter_id,
                puppy_id,
                include_deleted=include_deleted,
                newest_first=newest_first,
            )
        mother = self.get_mother(mother_id)
        if mother is None:
            return []
        records = mother.get("records", [])
        if not isinstance(records, list):
            return []
        return sorted_records(
            records,
            include_deleted=include_deleted,
            newest_first=newest_first,
            copy_items=True,
        )

    def get_record(
        self,
        litter_id: str,
        record_id: str,
        puppy_id: str | None = None,
        *,
        mother_id: str | None = None,
    ) -> dict[str, Any] | None:
        if mother_id is None:
            return super().get_record(litter_id, record_id, puppy_id)
        mother = self.get_mother(mother_id)
        if mother is None:
            return None
        for record in mother.get("records", []):
            if isinstance(record, dict) and record.get("id") == record_id:
                return deepcopy(record)
        return None

    async def async_add_record(
        self,
        litter_id: str,
        *,
        record_type: str,
        puppy_id: str | None = None,
        mother_id: str | None = None,
        occurred_at: str | None = None,
        title: str | None = None,
        note: str | None = None,
        data: dict[str, Any] | None = None,
    ) -> str:
        if mother_id is None:
            return await super().async_add_record(
                litter_id,
                record_type=record_type,
                puppy_id=puppy_id,
                occurred_at=occurred_at,
                title=title,
                note=note,
                data=data,
            )
        async with self._lock:
            litter = self._require_litter(litter_id)
            if str(litter.get("mother_id") or "") != mother_id:
                raise ValueError("Mother is not linked to this litter")
            mother = self._require_mother(mother_id)
            now = _now_iso()
            record = create_record(
                litter_id=litter_id,
                mother_id=mother_id,
                record_type=validate_record_type(record_type),
                occurred_at=occurred_at,
                title=title,
                note=note,
                data=data,
                now=now,
            )
            mother.setdefault("records", []).append(record)
            mother["updated_at"] = now
            litter["updated_at"] = now
            self._add_audit_entry(
                action="add_mother_record",
                litter_id=litter_id,
                record_id=record["id"],
                details={"mother_id": mother_id, "type": record["type"]},
            )
        await self.async_save()
        return str(record["id"])

    async def async_update_record(
        self,
        litter_id: str,
        record_id: str,
        *,
        record_type: str,
        puppy_id: str | None = None,
        mother_id: str | None = None,
        occurred_at: str | None = None,
        title: str | None = None,
        note: str | None = None,
        data: dict[str, Any] | None = None,
    ) -> None:
        if mother_id is None:
            return await super().async_update_record(
                litter_id,
                record_id,
                record_type=record_type,
                puppy_id=puppy_id,
                occurred_at=occurred_at,
                title=title,
                note=note,
                data=data,
            )
        async with self._lock:
            mother = self._require_mother(mother_id)
            record = self._require_record(mother, record_id)
            now = _now_iso()
            record["type"] = validate_record_type(record_type)
            if occurred_at is not None:
                record["occurred_at"] = normalize_timestamp(occurred_at, now) or now
            record["title"] = title.strip() if isinstance(title, str) and title.strip() else None
            record["note"] = note.strip() if isinstance(note, str) and note.strip() else None
            record["data"] = deepcopy(data) if isinstance(data, dict) else {}
            record["updated_at"] = now
            mother["updated_at"] = now
            self._require_litter(litter_id)["updated_at"] = now
        await self.async_save()

    async def async_delete_record(
        self,
        litter_id: str,
        record_id: str,
        puppy_id: str | None = None,
        *,
        mother_id: str | None = None,
    ) -> None:
        if mother_id is None:
            return await super().async_delete_record(litter_id, record_id, puppy_id)
        async with self._lock:
            mother = self._require_mother(mother_id)
            record = self._require_record(mother, record_id)
            if record.get("deleted", False):
                return
            now = _now_iso()
            record["deleted"] = True
            record["deleted_at"] = now
            record["updated_at"] = now
            mother["updated_at"] = now
            self._require_litter(litter_id)["updated_at"] = now
        await self.async_save()

    async def async_restore_record(
        self,
        litter_id: str,
        record_id: str,
        puppy_id: str | None = None,
        *,
        mother_id: str | None = None,
    ) -> None:
        if mother_id is None:
            return await super().async_restore_record(litter_id, record_id, puppy_id)
        async with self._lock:
            mother = self._require_mother(mother_id)
            record = self._require_record(mother, record_id)
            if not record.get("deleted", False):
                return
            now = _now_iso()
            record["deleted"] = False
            record["deleted_at"] = None
            record["updated_at"] = now
            mother["updated_at"] = now
            self._require_litter(litter_id)["updated_at"] = now
        await self.async_save()
