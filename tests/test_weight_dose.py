"""Weight-based hints use the exact owner's effective, non-future weighing."""

from copy import deepcopy
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import pytest
from homeassistant.auth.const import GROUP_ID_ADMIN, GROUP_ID_READ_ONLY
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.puppy_tracker.care_occurrences import derive_litter_care_occurrences
from custom_components.puppy_tracker.care_programs import AgeBasedCareProgramStore, normalize_care_program
from custom_components.puppy_tracker.const import DOMAIN
from custom_components.puppy_tracker.recurring_reminder_api import async_setup_recurring_reminder_api
from custom_components.puppy_tracker.recurring_reminder_view import async_reminder_items
from custom_components.puppy_tracker.recurring_reminders import RecurringReminderStore, normalize_reminder
from custom_components.puppy_tracker.runtime import PuppyTrackerRuntimeData
from custom_components.puppy_tracker.weight_dose import calculate_weight_dose, dose_fingerprint, dose_for_occurrence, dose_notice, normalize_weight_dose

NOW = datetime(2026, 11, 4, 12, tzinfo=UTC)
CONFIG = {"amount_per_kg": 0.2, "unit": "ml", "max_weight_age_hours": 24}


@pytest.mark.parametrize("age,maximum,status", [(0,24,"ready"),(24,24,"ready"),(24.01,24,"stale_weight"),
    (48,168,"ready"),(168.01,168,"stale_weight")])
def test_amount_and_strict_freshness_boundary(storage, install_litter, make_measurement, age, maximum, status):
    litter_id, puppy_id = install_litter(measurements=[make_measurement("m1",2750,(NOW-timedelta(hours=age)).isoformat())])
    dose = calculate_weight_dose(storage, {**CONFIG,"max_weight_age_hours":maximum}, litter_id,"puppy",puppy_id,now=NOW)
    assert dose["amount"] == pytest.approx(0.55)
    assert dose["status"] == status and dose["measurement_id"] == "m1"
    assert dose["weight_grams"] == 2750
    assert dose["unit"] == "ml"
    if status == "stale_weight":
        assert "GEWICHT TE OUD" in dose_notice(dose)
        assert "WEIGHT TOO OLD" in dose_notice(dose,"en")


def test_corrected_deleted_future_and_nonpositive_weights_do_not_supply_a_dose(storage, install_litter, make_measurement):
    litter_id, puppy_id = install_litter(measurements=[
        make_measurement("superseded",5000,(NOW-timedelta(hours=3)).isoformat(),superseded_by="corrected"),
        make_measurement("corrected",2500,(NOW-timedelta(hours=3)).isoformat(),source_measurement_id="superseded"),
        make_measurement("deleted",9000,(NOW-timedelta(hours=2)).isoformat(),deleted=True),
        make_measurement("future",7000,(NOW+timedelta(hours=1)).isoformat()),
        make_measurement("zero",0,(NOW-timedelta(hours=1)).isoformat()),
    ])
    before=storage.get_data()
    dose=calculate_weight_dose(storage,CONFIG,litter_id,"puppy",puppy_id,now=NOW)
    assert dose["amount"] == 0.5 and dose["measurement_id"] == "corrected"
    assert storage.get_data() == before
    assert calculate_weight_dose(storage,None,litter_id,"puppy",puppy_id,now=NOW) is None


def test_missing_unknown_and_mother_weights_are_explicitly_unavailable(storage, install_litter):
    litter_id, puppy_id=install_litter()
    for scope,owner in [("puppy",puppy_id),("puppy","unknown"),("mother","mother")]:
        dose=calculate_weight_dose(storage,CONFIG,litter_id,scope,owner,now=NOW)
        assert dose["amount"] is None
        assert "geen individueel gewicht" in dose_notice(dose)


def test_litter_reminder_uses_separate_puppy_weights_and_warnings(storage,install_litter,make_measurement):
    litter_id,puppy_id=install_litter(measurements=[make_measurement("m1",2000,NOW.isoformat())])
    other=deepcopy(storage._data["litters"][litter_id]["puppies"][puppy_id])
    other.update(id="p2",name="Nova",collar_color="paars",measurements=[make_measurement("m2",3000,(NOW-timedelta(days=2)).isoformat())])
    storage._data["litters"][litter_id]["puppies"]["p2"]=other
    inactive=deepcopy(other);inactive.update(id="p3",active=False)
    storage._data["litters"][litter_id]["puppies"]["p3"]=inactive
    dose=calculate_weight_dose(storage,CONFIG,litter_id,"litter",litter_id,now=NOW)
    assert dose["status"]=="per_puppy" and len(dose["items"])==2
    assert [item["dose"]["amount"] for item in dose["items"]]==[0.4,0.6]
    assert [item["dose"]["status"] for item in dose["items"]]==["ready","stale_weight"]
    assert "Nova (paars)" in dose_notice(dose) and "GEWICHT TE OUD" in dose_notice(dose)


@pytest.mark.parametrize("bad", [True,{}, {**CONFIG,"amount_per_kg":0},{**CONFIG,"amount_per_kg":float("inf")},
    {**CONFIG,"amount_per_kg":True},{**CONFIG,"max_weight_age_hours":0},
    {**CONFIG,"max_weight_age_hours":8761},{**CONFIG,"unit":""},{**CONFIG,"extra":"bad"}])
def test_invalid_formulas_are_rejected(bad):
    with pytest.raises(ValueError): normalize_weight_dose(bad)


def test_very_small_amounts_are_not_rounded_to_zero(storage,install_litter,make_measurement):
    litter_id,puppy_id=install_litter(measurements=[make_measurement("m1",100,NOW.isoformat())])
    dose=calculate_weight_dose(storage,{**CONFIG,"amount_per_kg":0.0000001},litter_id,"puppy",puppy_id,now=NOW)
    assert dose["amount"]==pytest.approx(0.00000001) and dose["amount"]>0
    assert "0 ml" not in dose_notice(dose)


def test_notification_fingerprint_changes_only_with_meaningful_basis(storage,install_litter,make_measurement):
    litter_id,puppy_id=install_litter(measurements=[make_measurement("m1",2000,NOW.isoformat())])
    first=calculate_weight_dose(storage,CONFIG,litter_id,"puppy",puppy_id,now=NOW)
    later=calculate_weight_dose(storage,CONFIG,litter_id,"puppy",puppy_id,now=NOW+timedelta(hours=1))
    old=calculate_weight_dose(storage,CONFIG,litter_id,"puppy",puppy_id,now=NOW+timedelta(hours=25))
    assert dose_fingerprint(first)==dose_fingerprint(later)
    assert dose_fingerprint(first)!=dose_fingerprint(old)


async def test_scheduler_backup_roundtrip_and_derived_occurrences(hass,storage,install_litter,make_measurement,monkeypatch):
    monkeypatch.setattr("custom_components.puppy_tracker.weight_dose.dt_util.now",lambda:NOW)
    litter_id,puppy_id=install_litter(measurements=[make_measurement("m1",2500,NOW.isoformat())])
    programs=AgeBasedCareProgramStore(hass);programs._store.async_save=AsyncMock()
    program_id=await programs.async_create({"litter_id":litter_id,"title":"Care","record_type":"note",
        "schedule_type":"once","start_age_days":3,"weight_dose":CONFIG})
    occurrence=derive_litter_care_occurrences(programs.get_program(program_id),[storage.get_puppy(litter_id,puppy_id)])[0]
    assert dose_for_occurrence(storage,occurrence)["dose"]["amount"]==0.5
    program_backup=programs.get_backup_data()
    await programs.async_restore_backup_data(program_backup)
    assert programs.get_program(program_id)["weight_dose"]==CONFIG
    reminders=RecurringReminderStore(hass);reminders._store.async_save=AsyncMock()
    reminder_id=await reminders.async_create({"litter_id":litter_id,"owner_scope":"puppy","owner_id":puppy_id,
        "title":"Food","record_type":"feeding","schedule_mode":"interval","interval_minutes":240,"weight_dose":CONFIG})
    await reminders.async_restore_backup_data(reminders.get_backup_data())
    assert reminders.get_reminder(reminder_id)["weight_dose"]==CONFIG
    items=await async_reminder_items(reminders,storage,litter_id=litter_id)
    assert items[0]["dose"]["amount"]==0.5


@pytest.mark.parametrize("admin",[True,False])
async def test_live_endpoint_checks_permissions_and_uses_stored_formula(hass,storage,install_litter,make_measurement,hass_ws_client,admin,monkeypatch):
    monkeypatch.setattr("custom_components.puppy_tracker.weight_dose.dt_util.now",lambda:NOW)
    litter_id,puppy_id=install_litter(measurements=[make_measurement("m1",2500,NOW.isoformat())])
    programs=AgeBasedCareProgramStore(hass);programs._store.async_save=AsyncMock()
    program_id=await programs.async_create({"litter_id":litter_id,"title":"Care","record_type":"medication",
        "schedule_type":"once","start_age_days":3,"weight_dose":CONFIG})
    entry=MockConfigEntry(domain=DOMAIN,data={});entry.runtime_data=PuppyTrackerRuntimeData(storage=storage,care_programs=programs)
    entry.add_to_hass(hass);async_setup_recurring_reminder_api(hass)
    user=await hass.auth.async_create_user("dose reader",group_ids=[GROUP_ID_ADMIN if admin else GROUP_ID_READ_ONLY])
    token=await hass.auth.async_create_refresh_token(user,client_id="https://test.client")
    client=await hass_ws_client(hass,access_token=hass.auth.async_create_access_token(token))
    await client.send_json_auto_id({"type":f"{DOMAIN}/weight_dose","source":"program","source_id":program_id,"puppy_id":puppy_id})
    response=await client.receive_json();assert response["success"] is admin
    if admin:
        assert response["result"]["dose"]["amount"]==0.5
        await client.send_json_auto_id({"type":f"{DOMAIN}/weight_dose","source":"program","source_id":program_id,"puppy_id":"unknown"})
        assert not (await client.receive_json())["success"]
    else: assert response["error"]["code"]=="unauthorized"


@pytest.mark.parametrize("source",["program","reminder"])
async def test_notifications_refresh_for_new_weight_and_expiry_without_repeating_unchanged_doses(
        hass,storage,install_litter,make_measurement,monkeypatch,source):
    from unittest.mock import Mock
    from custom_components.puppy_tracker.care_notifications import async_check_care_notifications
    from custom_components.puppy_tracker.recurring_notifications import RecurringReminderNotificationManager

    clock=[NOW]
    monkeypatch.setattr("custom_components.puppy_tracker.weight_dose.dt_util.now",lambda:clock[0])
    storage._data["settings"].update(notifications_enabled=True,recurring_reminder_notifications_enabled=True,notify_entities=["notify.phone"])
    litter_id,puppy_id=install_litter(measurements=[make_measurement("m1",2500,NOW.isoformat())])
    programs=AgeBasedCareProgramStore(hass);programs._store.async_save=AsyncMock()
    reminders=RecurringReminderStore(hass);reminders._store.async_save=AsyncMock()
    runtime=PuppyTrackerRuntimeData(storage=storage,care_programs=programs,recurring_reminders=reminders)
    prefix="custom_components.puppy_tracker."+("care_notifications" if source=="program" else "recurring_notifications")
    sender=AsyncMock()
    monkeypatch.setattr(prefix+".async_send_notify_entities",sender)
    monkeypatch.setattr(prefix+".async_create_persistent_notification",Mock())
    if source=="program":
        await programs.async_create({"litter_id":litter_id,"title":"Care","record_type":"note",
            "schedule_type":"once","start_age_days":3,"weight_dose":CONFIG})
        async def check(): await async_check_care_notifications(hass,runtime)
    else:
        await reminders.async_create({"litter_id":litter_id,"owner_scope":"puppy","owner_id":puppy_id,
            "title":"Care","record_type":"note","schedule_mode":"once","due_at":(NOW-timedelta(hours=1)).isoformat(),"weight_dose":CONFIG})
        manager=RecurringReminderNotificationManager(hass,Mock(),runtime)
        check=manager.async_check
    await check();await check()
    assert sender.await_count==1
    assert "0.5 ml" in sender.call_args.args[3] or "0,5 ml" in sender.call_args.args[3]
    tag=sender.call_args.kwargs["notification_tag"]
    clock[0]+=timedelta(hours=25)
    await check();await check()
    assert sender.await_count==2
    assert "TOO OLD" in sender.call_args.args[3] or "TE OUD" in sender.call_args.args[3]
    storage._data["litters"][litter_id]["puppies"][puppy_id]["measurements"].append(make_measurement("m2",3000,clock[0].isoformat()))
    await check();await check()
    assert sender.await_count==3
    assert "0.6 ml" in sender.call_args.args[3] or "0,6 ml" in sender.call_args.args[3]
    assert "TOO OLD" not in sender.call_args.args[3] and "TE OUD" not in sender.call_args.args[3]
    assert sender.call_args.kwargs["notification_tag"]==tag


async def test_changing_calculation_hints_does_not_reopen_completed_occurrences(hass):
    programs=AgeBasedCareProgramStore(hass);programs._store.async_save=AsyncMock()
    program_id=await programs.async_create({"litter_id":"l1","title":"Care","record_type":"note",
        "schedule_type":"once","start_age_days":3,"weight_dose":CONFIG})
    before=programs.get_program(program_id)
    await programs.async_update(program_id,{"weight_dose":{**CONFIG,"amount_per_kg":0.3,"max_weight_age_hours":168}})
    after=programs.get_program(program_id)
    assert after["revision"]==before["revision"]
    assert after["weight_dose"]["amount_per_kg"]==0.3
