"""Mother scope storage with combined base and mother integrity diagnostics."""

from __future__ import annotations

from copy import deepcopy
from typing import Any

from .integrity import inspect_and_repair_data
from .mother_integrity import inspect_mother_data, merge_integrity_reports
from .mother_schema import migrate_mother_scope_data
from .mother_storage import MotherScopeStorage


class MotherScopeIntegrityStorage(MotherScopeStorage):
    """Mother-aware storage with one combined integrity report."""

    def _migrate_mothers(self) -> bool:
        """Use the shared pure mother migration used by backup candidates too."""
        return migrate_mother_scope_data(self._data)

    def _combined_integrity(self, *, repair: bool) -> tuple[bool, dict[str, Any]]:
        base_changed, base_report = inspect_and_repair_data(self._data, repair=repair)
        mother_changed, mother_report = inspect_mother_data(self._data, repair=repair)
        return base_changed or mother_changed, merge_integrity_reports(base_report, mother_report)

    def refresh_integrity_report(self) -> dict[str, Any]:
        _changed, report = self._combined_integrity(repair=False)
        self._last_integrity_report = report
        return deepcopy(report)

    async def async_run_integrity_check(
        self,
        *,
        repair: bool = True,
    ) -> dict[str, Any]:
        async with self._lock:
            changed, report = self._combined_integrity(repair=repair)
            self._last_integrity_report = report
            if changed:
                self._add_audit_entry(
                    action="integrity_repair",
                    details={
                        "issues_found": report.get("issues_found", 0),
                        "repairs_applied": report.get("repairs_applied", 0),
                        "unresolved_critical": report.get("unresolved_critical", 0),
                        "repair_counts": report.get("repair_counts", {}),
                    },
                )
                await super().async_save()
                # super().async_save() refreshes only the base report.
                self._last_integrity_report = report
            return deepcopy(report)

    async def async_save(self) -> None:
        """Save normally, then keep mother diagnostics visible to HA."""
        await super().async_save()
        self.refresh_integrity_report()
