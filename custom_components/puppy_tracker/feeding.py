"""Validated litter-specific, brand-neutral feeding calculator preferences."""

from copy import deepcopy
import math
from typing import Any


DEFAULT_FEEDING_SETTINGS = {
    "allocation_mode": "ration",
    "kcal_per_kg": 0,
    "meat_percent": 50,
    "kibble_portions_per_day": 1,
    "meat_portions_per_day": 2,
    "kibble": {"method": "table", "grams_per_kg": 45, "coefficient": 13.32,
               "kcal_per_100g": 0, "age_tables": [],
               "offset": 94.46, "min_kg": 1, "max_kg": 20,
               "table": [[1, 57], [2, 96], [5, 191], [10, 267], [15, 327], [20, 360]]},
    "meat": {"method": "per_kg", "grams_per_kg": 45, "coefficient": 45,
             "kcal_per_100g": 0, "age_tables": [],
             "offset": 0, "min_kg": 0.1, "max_kg": 20,
             "table": [[1, 45], [20, 900]]},
}


def _table(value: Any) -> list[list[float]]:
    if not isinstance(value, list) or not 2 <= len(value) <= 100:
        raise ValueError("Food table requires 2 to 100 rows")
    result = []
    previous = 0
    for row in value:
        if not isinstance(row, list) or len(row) != 2:
            raise ValueError("Table rows require weight in kg and grams per day")
        weight, grams = _number(row[0]), _number(row[1])
        if weight <= previous or grams <= 0:
            raise ValueError("Table weights must be positive and strictly increasing; rations must be positive")
        result.append([weight, grams])
        previous = weight
    return result


def _number(value: Any, *, minimum: float = 0, maximum: float | None = None) -> float:
    if isinstance(value, bool):
        raise ValueError("Expected a finite number")
    try:
        number = float(value)
    except (TypeError, ValueError, OverflowError) as err:
        raise ValueError("Expected a finite number") from err
    if not math.isfinite(number) or number < minimum or (maximum is not None and number > maximum):
        raise ValueError("Number outside permitted range")
    return int(number) if number.is_integer() else number


def normalize_feeding_settings(value: Any = None) -> dict[str, Any]:
    """Validate complete profiles, upgrading the original fixed-product format."""
    if value is None:
        value = {}
    if not isinstance(value, dict):
        raise ValueError("Feeding settings must be an object")
    value = deepcopy(value)
    legacy_rate = value.pop("kivo_grams_per_kg", None)
    legacy_method = value.pop("kibble_formula", None)
    legacy_portions = value.pop("portions_per_day", None)
    result = deepcopy(DEFAULT_FEEDING_SETTINGS)
    if set(value) - set(result):
        raise ValueError("Unknown feeding setting")
    result.update(value)
    if legacy_rate is not None and "meat" not in value:
        result["meat"]["grams_per_kg"] = legacy_rate
    if legacy_method is not None and "kibble" not in value:
        result["kibble"]["method"] = legacy_method
    result["meat_percent"] = _number(result["meat_percent"], maximum=100)
    if result["allocation_mode"] not in ("ration", "energy"):
        raise ValueError("Invalid ration allocation mode")
    result["kcal_per_kg"] = _number(result["kcal_per_kg"])
    if result["allocation_mode"] == "energy" and result["kcal_per_kg"] <= 0:
        raise ValueError("Enter a positive daily energy target per kg")
    if legacy_portions is not None:
        portions = _number(legacy_portions, minimum=1, maximum=12)
        if int(portions) != portions:
            raise ValueError("Portions must be whole numbers")
        share = result["meat_percent"]
        if share == 0:
            kibble, meat = int(portions), 0
        elif share == 100:
            kibble, meat = 0, int(portions)
        else:
            total = max(2, int(portions))
            kibble = max(1, min(total - 1, math.floor(total * (1 - share / 100) + 0.5)))
            meat = total - kibble
        for key, count in (("kibble_portions_per_day", kibble), ("meat_portions_per_day", meat)):
            if key not in value:
                result[key] = count
    for key, active in (("kibble_portions_per_day", result["meat_percent"] < 100),
                        ("meat_portions_per_day", result["meat_percent"] > 0)):
        count = _number(result[key], minimum=1 if active else 0, maximum=12)
        if int(count) != count:
            raise ValueError("Portions must be whole numbers")
        result[key] = int(count)
    for kind in ("kibble", "meat"):
        food = result[kind]
        required = set(DEFAULT_FEEDING_SETTINGS[kind]) - {"age_tables", "kcal_per_100g"}
        if not isinstance(food, dict) or not required <= set(food) or set(food) - set(DEFAULT_FEEDING_SETTINGS[kind]):
            raise ValueError("Invalid food profile fields")
        food.setdefault("age_tables", [])
        food.setdefault("kcal_per_100g", 0)
        if food["method"] not in ("linear", "table", "per_kg", "age_table"):
            raise ValueError("Invalid food calculation method")
        for key in ("grams_per_kg", "coefficient", "offset", "min_kg", "max_kg"):
            food[key] = _number(food[key])
        if food["grams_per_kg"] <= 0 or food["min_kg"] <= 0 or food["min_kg"] >= food["max_kg"]:
            raise ValueError("Invalid food rate or weight range")
        if food["coefficient"] == 0 and food["offset"] == 0:
            raise ValueError("Formula must produce a positive daily ration")
        food["table"] = _table(food["table"])
        food["kcal_per_100g"] = _number(food["kcal_per_100g"])
        active = result["meat_percent"] < 100 if kind == "kibble" else result["meat_percent"] > 0
        if result["allocation_mode"] == "energy" and active and food["kcal_per_100g"] <= 0:
            raise ValueError("Included foods need a positive energy density")
        stages = food["age_tables"]
        if not isinstance(stages, list) or len(stages) > 24:
            raise ValueError("Age table requires at most 24 stages")
        if result["allocation_mode"] == "ration" and food["method"] == "age_table" and not stages:
            raise ValueError("Age table requires at least one stage")
        previous = -1
        for stage in stages:
            if not isinstance(stage, dict) or set(stage) != {"from_day", "table"}:
                raise ValueError("Invalid age table stage")
            day = _number(stage["from_day"], maximum=3650)
            if int(day) != day or day <= previous:
                raise ValueError("Stage start days must be whole and strictly increasing")
            stage["from_day"] = int(day)
            stage["table"] = _table(stage["table"])
            previous = day
    return result
