"""Import and export options-flow steps for Puppy Tracker."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import voluptuous as vol

from homeassistant.components.file_upload import process_uploaded_file
from homeassistant.config_entries import ConfigFlowResult
from homeassistant.helpers import selector
from homeassistant.helpers.dispatcher import async_dispatcher_send

from .backup import (
    BackupValidationError,
    async_apply_import,
    describe_backup,
    parse_export_json,
    prepare_import,
)
from .backup_http import async_signed_export_path
from .const import (
    SIGNAL_DASHBOARD_UPDATE,
    SIGNAL_NEW_LITTER,
    SIGNAL_NEW_PUPPY,
    SIGNAL_UPDATE,
)
from .devices import (
    async_remove_litter_device,
    async_remove_puppy_device,
    async_sync_devices,
)
from .runtime import PuppyTrackerRuntimeData, reconcile_dashboard_selection

MAX_BACKUP_BYTES = 20 * 1024 * 1024


class PuppyTrackerDataManagementMixin:
    """Add JSON data-management steps to the existing options flow."""

    _export_scope: str | None = None
    _import_document: dict[str, Any] | None = None
    _import_mode: str | None = None
    _import_plan: dict[str, Any] | None = None
    _import_result: dict[str, Any] | None = None

    def _litter_options(self) -> list[selector.SelectOptionDict]:
        storage = self._get_storage()
        return [
            selector.SelectOptionDict(
                value=litter_id,
                label=str(litter.get("name") or "Litter"),
            )
            for litter_id, litter in storage.get_litters().items()
        ]

    def _puppy_options(self) -> list[selector.SelectOptionDict]:
        storage = self._get_storage()
        options: list[selector.SelectOptionDict] = []
        for litter_id, litter in storage.get_litters().items():
            litter_name = str(litter.get("name") or "Litter")
            for puppy_id, puppy in litter.get("puppies", {}).items():
                options.append(
                    selector.SelectOptionDict(
                        value=f"{litter_id}|{puppy_id}",
                        label=f"{litter_name} · {puppy.get('name') or 'Puppy'}",
                    )
                )
        return options

    async def async_step_data_management(
        self,
        user_input: dict[str, Any] | None = None,
    ) -> ConfigFlowResult:
        """Show backup and restore menu."""
        del user_input
        return self.async_show_menu(
            step_id="data_management",
            menu_options=["export_data", "import_data"],
        )

    async def async_step_export_data(
        self,
        user_input: dict[str, Any] | None = None,
    ) -> ConfigFlowResult:
        """Choose full, litter, or puppy export."""
        if user_input is not None:
            scope = str(user_input["scope"])
            self._export_scope = scope
            if scope == "full":
                return await self._show_export_ready(scope="full")
            if scope == "litter":
                return await self.async_step_export_litter()
            return await self.async_step_export_puppy()

        return self.async_show_form(
            step_id="export_data",
            data_schema=vol.Schema(
                {
                    vol.Required("scope", default="full"): selector.SelectSelector(
                        selector.SelectSelectorConfig(
                            options=["full", "litter", "puppy"],
                            translation_key="backup_scope",
                            mode=selector.SelectSelectorMode.DROPDOWN,
                        )
                    )
                }
            ),
        )

    async def async_step_export_litter(
        self,
        user_input: dict[str, Any] | None = None,
    ) -> ConfigFlowResult:
        """Choose a litter to export."""
        options = self._litter_options()
        if not options:
            return self.async_abort(reason="no_litters")

        if user_input is not None:
            return await self._show_export_ready(
                scope="litter",
                litter_id=str(user_input["litter_id"]),
            )

        return self.async_show_form(
            step_id="export_litter",
            data_schema=vol.Schema(
                {
                    vol.Required("litter_id"): selector.SelectSelector(
                        selector.SelectSelectorConfig(
                            options=options,
                            mode=selector.SelectSelectorMode.DROPDOWN,
                        )
                    )
                }
            ),
        )

    async def async_step_export_puppy(
        self,
        user_input: dict[str, Any] | None = None,
    ) -> ConfigFlowResult:
        """Choose one puppy to export."""
        options = self._puppy_options()
        if not options:
            return self.async_abort(reason="no_puppies")

        if user_input is not None:
            litter_id, puppy_id = str(user_input["puppy"]).split("|", 1)
            return await self._show_export_ready(
                scope="puppy",
                litter_id=litter_id,
                puppy_id=puppy_id,
            )

        return self.async_show_form(
            step_id="export_puppy",
            data_schema=vol.Schema(
                {
                    vol.Required("puppy"): selector.SelectSelector(
                        selector.SelectSelectorConfig(
                            options=options,
                            mode=selector.SelectSelectorMode.DROPDOWN,
                        )
                    )
                }
            ),
        )

    async def _show_export_ready(
        self,
        *,
        scope: str,
        litter_id: str | None = None,
        puppy_id: str | None = None,
    ) -> ConfigFlowResult:
        signed_path = async_signed_export_path(
            self.hass,
            scope=scope,
            litter_id=litter_id,
            puppy_id=puppy_id,
        )
        return self.async_show_form(
            step_id="export_ready",
            description_placeholders={"download_url": signed_path},
            data_schema=vol.Schema({}),
        )

    async def async_step_export_ready(
        self,
        user_input: dict[str, Any] | None = None,
    ) -> ConfigFlowResult:
        """Finish after the user has had an opportunity to download."""
        if user_input is not None:
            return self.async_create_entry(title="", data={})
        return await self.async_step_export_data()

    async def async_step_import_data(
        self,
        user_input: dict[str, Any] | None = None,
    ) -> ConfigFlowResult:
        """Upload and validate a Puppy Tracker JSON backup."""
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
                self._import_document = parse_export_json(content)
                self._import_mode = None
                self._import_plan = None
                self._import_result = None
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
                        selector.FileSelectorConfig(
                            accept=".json,application/json",
                        )
                    )
                }
            ),
            errors=errors,
        )

    async def async_step_import_mode(
        self,
        user_input: dict[str, Any] | None = None,
    ) -> ConfigFlowResult:
        """Choose how the validated backup should be restored."""
        document = self._import_document
        if document is None:
            return await self.async_step_import_data()

        scope = str(document["scope"])
        current_litters = self._get_storage().get_litters()

        if scope == "full":
            modes = ["merge_as_new", "replace_all"]
            translation_key = "full_import_mode"
        else:
            modes = ["new_litter"]
            if current_litters:
                modes.append("existing_litter")
            translation_key = "partial_import_mode"

        errors: dict[str, str] = {}
        if user_input is not None:
            mode = str(user_input["mode"])
            self._import_mode = mode
            if mode == "existing_litter":
                return await self.async_step_import_target()

            try:
                self._import_plan = prepare_import(
                    self._get_storage(),
                    document,
                    mode=mode,
                )
            except BackupValidationError as err:
                errors["base"] = err.code
            else:
                return await self.async_step_import_preview()

        description = describe_backup(document)
        return self.async_show_form(
            step_id="import_mode",
            description_placeholders={
                "source": str(description["source_name"]),
                "litters": str(description["litters"]),
                "puppies": str(description["puppies"]),
                "measurements": str(description["measurements"]),
                "records": str(description["records"]),
            },
            data_schema=vol.Schema(
                {
                    vol.Required("mode", default=modes[0]): selector.SelectSelector(
                        selector.SelectSelectorConfig(
                            options=modes,
                            translation_key=translation_key,
                            mode=selector.SelectSelectorMode.DROPDOWN,
                        )
                    )
                }
            ),
            errors=errors,
        )

    async def async_step_import_target(
        self,
        user_input: dict[str, Any] | None = None,
    ) -> ConfigFlowResult:
        """Choose the destination litter for a partial import."""
        document = self._import_document
        if document is None or self._import_mode != "existing_litter":
            return await self.async_step_import_data()

        options = self._litter_options()
        if not options:
            return self.async_abort(reason="no_litters")

        errors: dict[str, str] = {}
        if user_input is not None:
            try:
                self._import_plan = prepare_import(
                    self._get_storage(),
                    document,
                    mode=self._import_mode,
                    target_litter_id=str(user_input["litter_id"]),
                )
            except BackupValidationError as err:
                errors["base"] = err.code
            else:
                return await self.async_step_import_preview()

        return self.async_show_form(
            step_id="import_target",
            data_schema=vol.Schema(
                {
                    vol.Required("litter_id"): selector.SelectSelector(
                        selector.SelectSelectorConfig(
                            options=options,
                            mode=selector.SelectSelectorMode.DROPDOWN,
                        )
                    )
                }
            ),
            errors=errors,
        )

    async def async_step_import_preview(
        self,
        user_input: dict[str, Any] | None = None,
    ) -> ConfigFlowResult:
        """Show the dry-run result and require explicit confirmation."""
        plan = self._import_plan
        if plan is None:
            return await self.async_step_import_data()

        summary = plan["summary"]
        errors: dict[str, str] = {}

        if user_input is not None:
            if not bool(user_input.get("confirm")):
                self._import_document = None
                self._import_mode = None
                self._import_plan = None
                return await self.async_step_data_management()

            storage = self._get_storage()
            before = storage.get_data()
            try:
                self._import_result = await async_apply_import(storage, plan)
            except BackupValidationError as err:
                errors["base"] = err.code
            except Exception:
                errors["base"] = "unknown"
            else:
                after = storage.get_data()
                self._sync_after_import(before, after)

                runtime = self.config_entry.runtime_data
                if isinstance(runtime, PuppyTrackerRuntimeData):
                    reconcile_dashboard_selection(runtime)
                    if summary.get("replaces_all"):
                        await runtime.care_reminders.async_clear_states()

                async_dispatcher_send(self.hass, SIGNAL_DASHBOARD_UPDATE)
                return await self.async_step_import_complete()

        return self.async_show_form(
            step_id="import_preview",
            description_placeholders={
                "source": str(summary["source_name"]),
                "litters": str(summary["litters"]),
                "puppies": str(summary["puppies"]),
                "measurements": str(summary["measurements"]),
                "records": str(summary["records"]),
                "warnings": str(summary.get("integrity_warnings", 0)),
                "replace": "yes" if summary.get("replaces_all") else "no",
            },
            data_schema=vol.Schema(
                {
                    vol.Required("confirm", default=False): selector.BooleanSelector(),
                }
            ),
            errors=errors,
        )

    def _sync_after_import(
        self,
        before: dict[str, Any],
        after: dict[str, Any],
    ) -> None:
        """Synchronize HA devices/entities after a committed import."""
        old_litters = before.get("litters", {})
        new_litters = after.get("litters", {})

        for litter_id, old_litter in old_litters.items():
            old_puppy_ids = list(old_litter.get("puppies", {}).keys())
            if litter_id not in new_litters:
                async_remove_litter_device(
                    self.hass,
                    self.config_entry,
                    litter_id,
                    old_puppy_ids,
                )
                continue

            new_puppy_ids = set(new_litters[litter_id].get("puppies", {}))
            for puppy_id in old_puppy_ids:
                if puppy_id not in new_puppy_ids:
                    async_remove_puppy_device(
                        self.hass,
                        self.config_entry,
                        puppy_id,
                    )

        async_sync_devices(
            self.hass,
            self.config_entry,
            after,
        )

        for litter_id, litter in new_litters.items():
            if litter_id not in old_litters:
                async_dispatcher_send(
                    self.hass,
                    SIGNAL_NEW_LITTER,
                    litter_id,
                )

            old_puppies = old_litters.get(litter_id, {}).get("puppies", {})
            for puppy_id in litter.get("puppies", {}):
                if puppy_id not in old_puppies:
                    async_dispatcher_send(
                        self.hass,
                        SIGNAL_NEW_PUPPY,
                        litter_id,
                        puppy_id,
                    )
                async_dispatcher_send(
                    self.hass,
                    SIGNAL_UPDATE,
                    puppy_id,
                )

    async def async_step_import_complete(
        self,
        user_input: dict[str, Any] | None = None,
    ) -> ConfigFlowResult:
        """Show the committed import result."""
        if user_input is not None:
            self._import_document = None
            self._import_mode = None
            self._import_plan = None
            self._import_result = None
            return self.async_create_entry(title="", data={})

        result = self._import_result or {}
        return self.async_show_form(
            step_id="import_complete",
            description_placeholders={
                "source": str(result.get("source_name", "")),
                "litters": str(result.get("litters", 0)),
                "puppies": str(result.get("puppies", 0)),
                "measurements": str(result.get("measurements", 0)),
                "records": str(result.get("records", 0)),
            },
            data_schema=vol.Schema({}),
        )