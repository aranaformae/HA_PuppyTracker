"""Privacy-safe technical Repairs using existing reports, without new scans."""

from inspect import signature

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import issue_registry as ir
from homeassistant.helpers.dispatcher import async_dispatcher_connect

from .const import DOMAIN, SIGNAL_DASHBOARD_UPDATE, SIGNAL_TECHNICAL_ISSUES_UPDATE
from .runtime import PuppyTrackerRuntimeData

_CONFIG_ENTRY_ISSUES = "config_entry_id" in signature(ir.async_create_issue).parameters
_KINDS = ("backup_failed", "storage_integrity")


def issue_id(entry: ConfigEntry, kind: str) -> str:
    """Keep separate entry lifetimes from sharing an issue or ignored state."""
    return f"{entry.entry_id}_{kind}"


@callback
def async_setup_repairs(hass: HomeAssistant, entry: ConfigEntry, runtime: PuppyTrackerRuntimeData) -> None:
    """Refresh changed technical states after writes and explicit integrity checks."""
    previous: dict[str, object] = {}

    @callback
    def refresh(*_args) -> None:
        report = runtime.storage.get_integrity_report()
        critical = report.get("unresolved_critical", 0)
        warnings = report.get("unresolved_warnings", 0)
        states = {"storage_integrity": {"critical": str(critical), "warnings": str(warnings)}
                  if critical or warnings else None}
        # Unknown after reload is not proof that a previously failed backup succeeded.
        if runtime.last_backup_status != "unknown":
            states["backup_failed"] = {} if runtime.last_backup_status == "error" else None
        for kind, placeholders in states.items():
            if kind in previous and previous[kind] == placeholders:
                continue
            if placeholders is None:
                ir.async_delete_issue(hass, DOMAIN, issue_id(entry, kind))
            else:
                ir.async_create_issue(hass, DOMAIN, issue_id(entry, kind),
                    **({"config_entry_id": entry.entry_id} if _CONFIG_ENTRY_ISSUES else {}),
                    is_fixable=False, is_persistent=True, severity=ir.IssueSeverity.WARNING,
                    translation_key=kind, translation_placeholders=placeholders,
                    learn_more_url="https://github.com/aranaformae/HA_PuppyTracker/blob/main/docs/NOTIFICATIONS.md#technical-repairs")
            previous[kind] = placeholders

    for signal in (SIGNAL_DASHBOARD_UPDATE, SIGNAL_TECHNICAL_ISSUES_UPDATE):
        entry.async_on_unload(async_dispatcher_connect(hass, signal, refresh))
    refresh()


@callback
def async_remove_repairs(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Also clean up on supported releases before entry-linked Repairs existed."""
    for kind in _KINDS:
        ir.async_delete_issue(hass, DOMAIN, issue_id(entry, kind))
