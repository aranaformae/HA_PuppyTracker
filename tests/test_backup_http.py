"""Tests for Puppy Tracker signed backup download URLs."""

from __future__ import annotations

import json
from types import SimpleNamespace

from custom_components.puppy_tracker import backup_http


def test_signed_export_url_is_absolute(monkeypatch) -> None:
    """Config-flow download links must bypass the HA frontend router."""
    registered_views = []
    hass = SimpleNamespace(
        data={},
        http=SimpleNamespace(register_view=registered_views.append),
    )

    monkeypatch.setattr(
        backup_http,
        "async_sign_path",
        lambda _hass, path, _ttl: f"{path}?authSig=signed",
    )
    monkeypatch.setattr(
        backup_http,
        "get_url",
        lambda _hass, **_kwargs: "https://ha.example/",
    )

    url = backup_http.async_signed_export_path(
        hass,
        scope="puppy",
        litter_id="litter-1",
        puppy_id="puppy-1",
    )

    assert url == (
        "https://ha.example/api/puppy_tracker/backup/puppy/"
        "litter-1/puppy-1?authSig=signed"
    )
    assert not url.startswith("/api/")
    assert len(registered_views) == 3


def test_full_download_includes_external_scheduler_store_snapshots(storage) -> None:
    runtime = SimpleNamespace(
        storage=storage,
        care_reminders=SimpleNamespace(
            get_backup_settings=lambda: {
                "lead_days": 7,
                "categories": {"vaccination": True, "deworming": True},
            }
        ),
        care_programs=SimpleNamespace(
            get_backup_data=lambda: {"programs": {}}
        ),
        recurring_reminders=SimpleNamespace(
            get_backup_data=lambda: {"reminders": {}}
        ),
    )

    response = backup_http._download_response(runtime, scope="full")
    payload = json.loads(response.text)

    assert payload["export_version"] == 5
    assert payload["schedulers"] == {
        "version": 1,
        "care_programs": {"programs": {}},
        "recurring_reminders": {"reminders": {}},
    }
