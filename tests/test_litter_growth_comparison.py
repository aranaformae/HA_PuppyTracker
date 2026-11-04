"""Age alignment and equal-litter references must not invent observations."""
from copy import deepcopy
from datetime import UTC, datetime, timedelta

import pytest
from homeassistant.auth.const import GROUP_ID_READ_ONLY
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.puppy_tracker.api import async_setup_api
from custom_components.puppy_tracker.const import DOMAIN
from custom_components.puppy_tracker.litter_growth_comparison import build_litter_growth_comparison
from custom_components.puppy_tracker.runtime import PuppyTrackerRuntimeData

BIRTH = datetime(2026, 8, 28, 10, tzinfo=UTC)
NOW = BIRTH + timedelta(days=60)


@pytest.fixture
def nest(storage, install_litter, make_measurement):
    def create(key="current", *, birth=BIRTH, sizes=(400, 500, 600), rates=None, days=range(57), **overrides):
        install_litter(litter_id=key, puppy_overrides={"birth_time": birth.isoformat()},
                       litter_overrides={"mother_id": "mother-1", "growth_analysis": {"size_class": "medium"}, **overrides})
        litter = storage._data["litters"][key]
        base = deepcopy(next(iter(litter["puppies"].values())))
        litter["puppies"] = {}
        for index, size in enumerate(sizes):
            rate = rates[index] if rates else .1
            puppy = {**deepcopy(base), "id": f"p{index}", "name": f"Pup {index}",
                     "birth_weight": size, "birth_time": (birth + timedelta(hours=index)).isoformat()}
            puppy["measurements"] = [make_measurement(f"m{index}-{day}", size * (1 + day * rate),
                (birth + timedelta(hours=index, days=day)).isoformat()) for day in days]
            litter["puppies"][puppy["id"]] = puppy
        return litter
    return create


def at(curve, day):
    return next(point for point in curve["points"] if point["day"] == day)


def test_same_age_not_same_clock_and_excludes_selected_puppy(storage, nest):
    nest()
    before = storage.get_data()
    result = build_litter_growth_comparison(storage, "current", now=NOW)
    puppy = result["puppies"][0]
    point = at(puppy, 21)
    assert point["weight_grams"] == 1240
    assert point["peer_median_grams"] == pytest.approx((1550 + 1860) / 2)
    assert point["relative_weight_percent"] == pytest.approx(400 / 550 * 100)
    assert point["birth_factor"] == 3.1
    assert point["position_change_points"] == pytest.approx(0)
    assert point["relative_growth_percent"] == pytest.approx(400 / 550 * 100)
    assert point["peer_count"] == 2
    assert not point["interpolated"]
    assert len(puppy["weeks"]) == 8
    assert puppy["weeks"][-1]["comparison"]["day"] == 56
    assert result["history"] is None
    assert storage.get_data() == before


def test_position_change_distinguishes_stable_small_pup_from_falling_behind(storage, nest):
    nest(sizes=(400,400,400), rates=(.05,.1,.1))
    point = at(build_litter_growth_comparison(storage,"current",now=NOW)["puppies"][0],21)
    expected = (2.05/3.1 - 1.7/2.4)*100
    assert point["position_change_points"] == pytest.approx(expected)
    assert point["position_change_points"] < 0
    assert point["relative_growth_percent"] == pytest.approx(50)


def test_interpolation_is_bounded_and_no_end_extrapolation(storage, nest):
    nest(days=(0,2,6,8))
    puppy = build_litter_growth_comparison(storage,"current",now=NOW)["puppies"][0]
    assert at(puppy,1)["interpolated"]
    assert at(puppy,1)["weight_grams"] == pytest.approx(440)
    days = {p["day"] for p in puppy["points"]}
    assert days == {0,1,2,6,7,8}
    assert puppy["summary"]["day"] == 8
    assert puppy["summary"]["position_change_points"] == pytest.approx(0)
    assert puppy["weeks"][1]["comparison"] is None
    assert 9 not in days and 56 not in days


def test_future_invalid_deleted_and_superseded_weights_are_excluded(storage, nest, make_measurement):
    litter=nest(days=(0,1))
    p=litter["puppies"]["p0"]
    p["measurements"] += [make_measurement("old",9000,(BIRTH+timedelta(days=1)).isoformat(),superseded_by="new"),
        make_measurement("new",440,(BIRTH+timedelta(days=1)).isoformat(),source_measurement_id="old"),
        make_measurement("deleted",8000,(BIRTH+timedelta(days=1)).isoformat(),deleted=True),
        make_measurement("future",7000,(BIRTH+timedelta(days=4)).isoformat()),
        make_measurement("zero",0,(BIRTH+timedelta(days=1)).isoformat())]
    result=build_litter_growth_comparison(storage,"current",now=BIRTH+timedelta(days=2))
    assert at(result["puppies"][0],1)["weight_grams"]==440
    assert max(p["day"] for p in result["puppies"][0]["age_points"])==1


def test_inactive_puppies_are_retained_in_historical_nest_comparison(storage,nest):
    litter=nest()
    litter["puppies"]["p1"]["active"]=False
    litter["active"]=False
    assert at(build_litter_growth_comparison(storage,"current",now=NOW)["puppies"][0],7)["peer_count"]==2


def test_no_birth_weight_still_allows_peer_comparison_but_not_normalization(storage,nest):
    litter=nest()
    litter["puppies"]["p0"]["birth_weight"]=None
    point=at(build_litter_growth_comparison(storage,"current",now=NOW)["puppies"][0],7)
    assert point["relative_weight_percent"] is not None and point["birth_factor"] is None
    litter["puppies"]["p0"]["birth_time"]=None
    assert build_litter_growth_comparison(storage,"current",now=NOW)["puppies"][0]["summary"] is None


def test_single_puppy_retains_own_curve_without_inventing_peers(storage,nest):
    nest(sizes=(400,))
    puppy=build_litter_growth_comparison(storage,"current",now=NOW)["puppies"][0]
    assert puppy["summary"] is None and not puppy["points"]
    assert len(puppy["age_points"])==57
    assert puppy["weeks"][0]["age_point"]["birth_factor"]==pytest.approx(1.7)


def test_nonpositive_peer_growth_does_not_produce_a_ratio(storage,nest):
    nest(rates=(.1,0,0))
    assert at(build_litter_growth_comparison(storage,"current",now=NOW)["puppies"][0],7)["relative_growth_percent"] is None


def test_history_weights_litters_equally_and_excludes_current_and_newer(storage,nest):
    nest()
    nest("small",birth=BIRTH-timedelta(days=150),sizes=(300,400),rates=(.1,.1))
    nest("large",birth=BIRTH-timedelta(days=75),sizes=(400,)*8,rates=(.2,)*8,active=False)
    nest("newer",birth=BIRTH+timedelta(days=1),rates=(.5,)*3)
    result=build_litter_growth_comparison(storage,"current",include_history=True,now=NOW)
    history=result["history"]
    assert {s["id"] for s in history["sources"]}=={"small","large"}
    point=next(p for p in history["reference"] if p["day"]==7)
    assert point["birth_factor"]==pytest.approx((1.7+2.4)/2)
    assert point["litter_count"]==2 and point["puppy_count"]==10
    assert point["lower_factor"] is None and point["upper_factor"] is None


def test_history_band_requires_five_litters_at_each_age_and_filters_known_identity(storage,nest):
    nest()
    for index in range(5):
        nest(f"old{index}",birth=BIRTH-timedelta(days=75+index*10),sizes=(300,400),
             rates=(.1+index*.01,)*2,days=range(57 if index < 4 else 8),
             mother_id="mother-1" if index < 2 else "mother-2",
             growth_analysis={"size_class":"medium" if index < 3 else "large"})
    history=build_litter_growth_comparison(storage,"current",include_history=True,now=NOW)["history"]
    at7=next(p for p in history["reference"] if p["day"]==7)
    assert at7["lower_factor"]==pytest.approx(1.77)
    assert at7["upper_factor"]==pytest.approx(1.91)
    assert next(p for p in history["reference"] if p["day"]==14)["lower_factor"] is None
    for filter_name,count in [("same_mother",2),("same_size",3)]:
        ref=build_litter_growth_comparison(storage,"current",include_history=True,reference_filter=filter_name,now=NOW)
        assert len(ref["history"]["sources"])==count
    storage._data["litters"]["current"]["mother_id"]=None
    assert not build_litter_growth_comparison(storage,"current",include_history=True,reference_filter="same_mother",now=NOW)["history"]["sources"]


def test_history_requires_two_puppies_with_birth_weights_at_each_age(storage,nest):
    nest()
    litter=nest("old",birth=BIRTH-timedelta(days=100),sizes=(300,400))
    litter["puppies"]["p1"]["birth_weight"]=None
    assert not build_litter_growth_comparison(storage,"current",include_history=True,now=NOW)["history"]["sources"]


async def test_comparison_api_is_read_only_and_rejects_unknown_litter(hass,hass_ws_client,storage,nest):
    nest()
    entry=MockConfigEntry(domain=DOMAIN,data={})
    entry.runtime_data=PuppyTrackerRuntimeData(storage=storage)
    entry.add_to_hass(hass)
    async_setup_api(hass)
    user=await hass.auth.async_create_user("comparison reader",group_ids=[GROUP_ID_READ_ONLY])
    token=await hass.auth.async_create_refresh_token(user,client_id="https://test.client")
    client=await hass_ws_client(hass,access_token=hass.auth.async_create_access_token(token))
    before=storage.get_data()
    await client.send_json_auto_id({"type":"puppy_tracker/growth_comparison","litter_id":"current"})
    response=await client.receive_json()
    assert response["success"] and response["result"]["history"] is None
    assert storage.get_data()==before
    await client.send_json_auto_id({"type":"puppy_tracker/growth_comparison","litter_id":"unknown"})
    assert (await client.receive_json())["error"]["code"]=="invalid_comparison"


def test_position_change_is_not_claimed_after_reference_membership_changes(storage,nest):
    litter=nest()
    litter["puppies"]["p2"]["measurements"] = [m for m in litter["puppies"]["p2"]["measurements"] if datetime.fromisoformat(m["timestamp"]) <= BIRTH+timedelta(days=10,hours=2)]
    point=at(build_litter_growth_comparison(storage,"current",now=NOW)["puppies"][0],14)
    assert point["peer_count"]==1
    assert point["position_change_points"] is None
    assert point["relative_growth_percent"] is not None


def test_outlier_does_not_dominate_median_and_default_does_not_read_other_nests(storage,nest,monkeypatch):
    nest(sizes=(400,400,400,4000))
    def unexpected_history():
        raise AssertionError("Historical nests should only be read on request")
    monkeypatch.setattr(storage,"get_litters",unexpected_history)
    point=at(build_litter_growth_comparison(storage,"current",now=NOW)["puppies"][0],7)
    assert point["relative_weight_percent"]==pytest.approx(100)
    assert point["peer_median_grams"]==pytest.approx(680)
    assert point["peer_mean_grams"]==pytest.approx(2720)
