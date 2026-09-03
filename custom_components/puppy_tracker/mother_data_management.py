"""Mother-specific export/import steps layered onto Puppy Tracker data management."""

from __future__ import annotations

import json
from pathlib import Path
import re
from typing import Any

import voluptuous as vol

from homeassistant.components.file_upload import process_uploaded_file
from homeassistant.config_entries import ConfigFlowResult
from homeassistant.helpers import selector
from homeassistant.helpers.dispatcher import async_dispatcher_send

from .backup import BackupValidationError, describe_backup, parse_export_json
from .const import SIGNAL_DASHBOARD_UPDATE
from .mother_backup import describe_mother_export, validate_mother_export_document
from .mother_backup_http import async_signed_mother_export_path
from .mother_restore import mother_import_options, plan_mother_import
from .mother_restore_apply import async_apply_mother_import
from .runtime import PuppyTrackerRuntimeData, reconcile_dashboard_selection

MAX_BACKUP_BYTES = 20 * 1024 * 1024


class MotherDataManagementMixin:
    """Add mother dossier export/import to the existing data-management flow."""

    _mother_export_id: str | None = None
    _mother_import_litter_map: dict[str, str] | None = None

    @staticmethod
    def _mother_litter_field_key(index: int, source_name: str) -> str:
        """Build a readable, unique form key for a source litter context."""
        label = re.sub(r"[^a-zA-Z0-9]+", "_", source_name).strip("_") or "litter"
        return f"source_litter_{index + 1}_{label[:32]}"

    def _mother_options(self) -> list[selector.SelectOptionDict]:
        storage = self._get_storage()
        getter = getattr(storage, "get_mothers", None)
        mothers = getter() if callable(getter) else []
        return [
            selector.SelectOptionDict(
                value=str(mother.get("id")),
                label=str(mother.get("name") or "Moederhond"),
            )
            for mother in mothers
            if mother.get("id")
        ]

    async def async_step_export_data(
        self,
        user_input: dict[str, Any] | None = None,
    ) -> ConfigFlowResult:
        """Choose export scope including mother dossier."""
        if user_input is not None:
            scope = str(user_input["scope"])
            if scope == "mother":
                self._export_scope = scope
                return await self.async_step_export_mother()
            return await super().async_step_export_data(user_input)

        return self.async_show_form(
            step_id="export_data",
            data_schema=vol.Schema(
                {
                    vol.Required("scope", default="full"): selector.SelectSelector(
                        selector.SelectSelectorConfig(
                            options=["full", "litter", "puppy", "mother"],
                            translation_key="backup_scope",
                            mode=selector.SelectSelectorMode.DROPDOWN,
                        )
                    )
                }
            ),
        )

    async def async_step_export_mother(
        self,
        user_input: dict[str, Any] | None = None,
    ) -> ConfigFlowResult:
        """Choose a mother profile to export."""
        options = self._mother_options()
        if not options:
            return self.async_abort(reason="no_mothers")
        if user_input is not None:
            self._mother_export_id = str(user_input["mother_id"])
            return await self.async_step_export_mother_filter()
        return self.async_show_form(
            step_id="export_mother",
            data_schema=vol.Schema(
                {
                    vol.Required("mother_id"): selector.SelectSelector(
                        selector.SelectSelectorConfig(
                            options=options,
                            mode=selector.SelectSelectorMode.DROPDOWN,
                        )
                    )
                }
            ),
        )

    async def async_step_export_mother_filter(
        self,
        user_input: dict[str, Any] | None = None,
    ) -> ConfigFlowResult:
        """Choose all mother history or one linked litter context."""
        mother_id = self._mother_export_id
        storage = self._get_storage()
        if not mother_id:
            return await self.async_step_export_mother()

        data = storage.get_data()
        litter_options = [
            selector.SelectOptionDict(
                value=str(litter_id),
                label=str(litter.get("name") or "Nest"),
            )
            for litter_id, litter in data.get("litters", {}).items()
            if isinstance(litter, dict) and str(litter.get("mother_id") or "") == mother_id
        ]
        options = [selector.SelectOptionDict(value="__all__", label="Alle nesten")]
        options.extend(litter_options)

        if user_input is not None:
            context = str(user_input["context"])
            litter_id = None if context == "__all__" else context
            signed_path = async_signed_mother_export_path(
                self.hass,
                mother_id=mother_id,
                litter_id=litter_id,
            )
            return self.async_show_form(
                step_id="export_ready",
                description_placeholders={"download_url": signed_path},
                data_schema=vol.Schema({}),
            )

        return self.async_show_form(
            step_id="export_mother_filter",
            data_schema=vol.Schema(
                {
                    vol.Required("context", default="__all__"): selector.SelectSelector(
                        selector.SelectSelectorConfig(
                            options=options,
                            mode=selector.SelectSelectorMode.DROPDOWN,
                        )
                    )
                }
            ),
        )

    async def async_step_import_data(
        self,
        user_input: dict[str, Any] | None = None,
    ) -> ConfigFlowResult:
        """Upload either a legacy backup or a schema-8 mother dossier export."""
        errors: dict[str, str] = {}
        if user_input is not None:
            uploaded_file_id = str(user_input["backup_file"])

            def _read_uploaded_backup() -> str:
                with process_uploaded_file(self.hass, uploaded_file_id) as file_path:
                    path = Path(file_path)
                    if path.stat().st_size > MAX_BACKUP_BYTES:
                        raise BackupValidationError(
                            "backup_too_large",
                            "Backup exceeds the 20 MB import limit",
                        )
                    return path.read_text(encoding="utf-8")

            try:
                content = await self.hass.async_add_executor_job(_read_uploaded_backup)
                try:
                    raw = json.loads(content)
                except (TypeError, json.JSONDecodeError) as err:
                    raise BackupValidationError(
                        "invalid_backup_json", "Backup is not valid JSON"
                    ) from err

                if isinstance(raw, dict) and raw.get("scope") == "mother":
                    try:
                        validate_mother_export_document(raw)
                    except ValueError as err:
                        raise BackupValidationError("invalid_backup", str(err)) from err
                    self._import_document = raw
                else:
                    self._import_document = parse_export_json(content)
                self._import_mode = None
                self._import_plan = None
                self._import_result = None
                self._mother_import_litter_map = None
            except BackupValidationError as err:
                errors["base"] = err.code
            except (OSError, UnicodeError):
                errors["base"] = "invalid_backup_json"
            else:
                return await self.async_step_import_mode()

        return self.async_show_form(
            step_id="import_data",
            data_schema=vol.Schema(
                {
                    vol.Required("backup_file"): selector.FileSelector(
                        selector.FileSelectorConfig(accept=".json,application/json")
                    )
                }
            ),
            errors=errors,
        )

    async def async_step_import_mode(
        self,
        user_input: dict[str, Any] | None = None,
    ) -> ConfigFlowResult:
        """Choose mother merge/new behavior or delegate legacy imports."""
        document = self._import_document
        if document is None or document.get("scope") != "mother":
            return await super().async_step_import_mode(user_input)

        data = self._get_storage().get_data()
        options = mother_import_options(data, document)
        errors: dict[str, str] = {}
        if user_input is not None:
            mode = str(user_input["mode"])
            self._import_mode = mode
            try:
                self._import_plan = plan_mother_import(data, document, mode=mode)
            except ValueError:
                errors["base"] = "invalid_backup"
            else:
                if self._import_plan.get("requires_litter_mapping"):
                    return await self.async_step_import_mother_litters()
                self._mother_import_litter_map = {
                    item["source_litter_id"]: item["target_litter_id"]
                    for item in self._import_plan.get("resolved_litters", [])
                }
                return await self.async_step_import_preview()

        preview = describe_mother_export(document)
        return self.async_show_form(
            step_id="import_mode",
            description_placeholders={
                "source": str(preview["source_name"]),
                "litters": str(preview["litter_count"]),
                "puppies": "0",
                "measurements": "0",
                "records": str(preview["record_count"]),
                "audit_entries": str(preview["audit_count"]),
                "export_version": str(preview["export_version"]),
                "schema_version": str(preview["schema_version"]),
            },
            data_schema=vol.Schema(
                {
                    vol.Required("mode", default=options["default_mode"]): selector.SelectSelector(
                        selector.SelectSelectorConfig(
                            options=options["available_modes"],
                            mode=selector.SelectSelectorMode.DROPDOWN,
                        )
                    )
                }
            ),
            errors=errors,
        )

    async def async_step_import_mother_litters(
        self,
        user_input: dict[str, Any] | None = None,
    ) -> ConfigFlowResult:
        """Explicitly map source litter contexts; never guess by name."""
        plan = self._import_plan
        if plan is None or self._import_document is None:
            return await self.async_step_import_data()
        litter_options = self._litter_options()
        if not litter_options:
            return self.async_abort(reason="no_litters")

        unresolved = plan.get("unresolved_litters", [])
        fields: dict[Any, Any] = {}
        field_keys: dict[str, str] = {}
        for index, item in enumerate(unresolved):
            source_id = str(item["source_litter_id"])
            source_name = str(item.get("source_litter_name") or source_id)
            field_key = self._mother_litter_field_key(index, source_name)
            field_keys[source_id] = field_key
            fields[vol.Required(field_key)] = selector.SelectSelector(
                selector.SelectSelectorConfig(
                    options=litter_options,
                    mode=selector.SelectSelectorMode.DROPDOWN,
                )
            )

        if user_input is not None:
            mapping = {
                item["source_litter_id"]: item["target_litter_id"]
                for item in plan.get("resolved_litters", [])
            }
            for item in unresolved:
                source_id = str(item["source_litter_id"])
                mapping[source_id] = str(user_input[field_keys[source_id]])
            self._mother_import_litter_map = mapping
            return await self.async_step_import_preview()

        source_names = ", ".join(
            str(item.get("source_litter_name") or item["source_litter_id"])
            for item in unresolved
        )
        return self.async_show_form(
            step_id="import_mother_litters",
            description_placeholders={"source_litters": source_names},
            data_schema=vol.Schema(fields),
        )

    async def async_step_import_preview(
        self,
        user_input: dict[str, Any] | None = None,
    ) -> ConfigFlowResult:
        """Preview and commit mother imports or delegate legacy imports."""
        document = self._import_document
        if document is None or document.get("scope") != "mother":
            return await super().async_step_import_preview(user_input)
        plan = self._import_plan
        if plan is None:
            return await self.async_step_import_data()

        preview = describe_mother_export(document)
        errors: dict[str, str] = {}
        if user_input is not None:
            if not bool(user_input.get("confirm")):
                self._import_document = None
                self._import_mode = None
                self._import_plan = None
                self._mother_import_litter_map = None
                return await self.async_step_data_management()

            storage = self._get_storage()
            before = storage.get_data()
            try:
                self._import_result = await async_apply_mother_import(
                    storage,
                    document,
                    mode=self._import_mode,
                    litter_map=self._mother_import_litter_map,
                )
            except ValueError:
                errors["base"] = "invalid_backup"
            except Exception:
                errors["base"] = "unknown"
            else:
                after = storage.get_data()
                self._sync_after_import(before, after)
                runtime = self.config_entry.runtime_data
                if isinstance(runtime, PuppyTrackerRuntimeData):
                    reconcile_dashboard_selection(runtime)
                async_dispatcher_send(self.hass, SIGNAL_DASHBOARD_UPDATE)
                return await self.async_step_import_complete()

        return self.async_show_form(
            step_id="import_preview",
            description_placeholders={
                "source": str(preview["source_name"]),
                "litters": str(preview["litter_count"]),
                "puppies": "0",
                "measurements": "0",
                "records": str(preview["record_count"]),
                "audit_entries": str(preview["audit_count"]),
                "warnings": "0",
                "replace": "no",
                "target": "Linked litter contexts",
                "id_policy": "newly generated record and audit IDs",
            },
            data_schema=vol.Schema(
                {vol.Required("confirm", default=False): selector.BooleanSelector()}
            ),
            errors=errors,
        )
