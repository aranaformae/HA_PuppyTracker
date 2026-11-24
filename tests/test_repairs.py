"""Technical Repairs follow real state transitions without scans or private data."""

from types import SimpleNamespace
from unittest.mock import Mock, patch

import pytest
from homeassistant.helpers import issue_registry as ir
from homeassistant.helpers.dispatcher import async_dispatcher_send
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.puppy_tracker import async_remove_entry
from custom_components.puppy_tracker.const import DOMAIN, SIGNAL_DASHBOARD_UPDATE
from custom_components.puppy_tracker.repairs import async_setup_repairs, issue_id
from custom_components.puppy_tracker.runtime import PuppyTrackerRuntimeData


@pytest.fixture
async def repair_context(hass):
    report = {"unresolved_critical": 0, "unresolved_warnings": 0}
    storage = SimpleNamespace(get_integrity_report=lambda: dict(report),
                              async_run_integrity_check=Mock(side_effect=AssertionError("Do not rescan")))
    runtime = PuppyTrackerRuntimeData(storage=storage)
    entry = MockConfigEntry(domain=DOMAIN, data={})
    entry.runtime_data = runtime
    entry.add_to_hass(hass)
    async_setup_repairs(hass, entry, runtime)
    return entry, runtime, report, ir.async_get(hass)


async def test_integrity_issue_updates_and_clears_without_exposing_records(hass, repair_context):
    entry, runtime, report, registry = repair_context
    report.update(unresolved_critical=2, unresolved_warnings=1, private_note="NEVER EXPOSE")
    async_dispatcher_send(hass, SIGNAL_DASHBOARD_UPDATE)
    await hass.async_block_till_done()
    issue = registry.async_get_issue(DOMAIN, issue_id(entry, "storage_integrity"))
    assert issue.translation_placeholders == {"critical": "2", "warnings": "1"}
    report.update(unresolved_critical=0, unresolved_warnings=0)
    async_dispatcher_send(hass, SIGNAL_DASHBOARD_UPDATE)
    await hass.async_block_till_done()
    assert registry.async_get_issue(DOMAIN, issue_id(entry, "storage_integrity")) is None
    runtime.storage.async_run_integrity_check.assert_not_called()


async def test_backup_issue_survives_reload_unknown_and_clears_only_after_success(hass, repair_context):
    entry, runtime, _, registry = repair_context
    runtime.last_backup_status = "error"
    runtime.last_backup_path = "/private/customer-data/backup.json"
    async_dispatcher_send(hass, SIGNAL_DASHBOARD_UPDATE)
    await hass.async_block_till_done()
    key = issue_id(entry, "backup_failed")
    assert registry.async_get_issue(DOMAIN, key).is_persistent
    registry.async_ignore(DOMAIN, key, True)
    with patch.object(ir, "async_create_issue", wraps=ir.async_create_issue) as create:
        for _ in range(3):
            async_dispatcher_send(hass, SIGNAL_DASHBOARD_UPDATE)
        await hass.async_block_till_done()
        create.assert_not_called()
    await entry._async_process_on_unload(hass)
    runtime.last_backup_status = "unknown"
    async_setup_repairs(hass, entry, runtime)
    issue = registry.async_get_issue(DOMAIN, key)
    assert issue.dismissed_version is not None
    assert issue.translation_placeholders == {}
    runtime.last_backup_status = "ok"
    async_dispatcher_send(hass, SIGNAL_DASHBOARD_UPDATE)
    await hass.async_block_till_done()
    assert registry.async_get_issue(DOMAIN, key) is None


async def test_unload_disconnects_and_actual_removal_cleans_issues(hass, repair_context):
    entry, runtime, report, registry = repair_context
    report["unresolved_critical"] = 1
    async_dispatcher_send(hass, SIGNAL_DASHBOARD_UPDATE)
    await hass.async_block_till_done()
    await entry._async_process_on_unload(hass)
    runtime.last_backup_status = "error"
    async_dispatcher_send(hass, SIGNAL_DASHBOARD_UPDATE)
    await hass.async_block_till_done()
    assert registry.async_get_issue(DOMAIN, issue_id(entry, "backup_failed")) is None
    assert registry.async_get_issue(DOMAIN, issue_id(entry, "storage_integrity")) is not None
    await async_remove_entry(hass, entry)
    assert registry.async_get_issue(DOMAIN, issue_id(entry, "storage_integrity")) is None
