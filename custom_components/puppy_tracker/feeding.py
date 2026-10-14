"""Validated litter-specific, brand-neutral feeding calculator preferences."""

from copy import deepcopy
import math
from typing import Any


DEFAULT_FEEDING_SETTINGS = {
    "meat_percent": 50,
    "portions_per_day": 4,
    "kibble": {"method": "table", "grams_per_kg": 45, "coefficient": 13.32,
               "offset": 94.46, "min_kg": 1, "max_kg": 20,
               "table": [[1, 57], [2, 96], [5, 191], [10, 267], [15, 327], [20, 360]]},
    "meat": {"method": "per_kg", "grams_per_kg": 45, "coefficient": 45,
             "offset": 0, "min_kg": 0.1, "max_kg": 20,
             "table": [[1, 45], [20, 900]]},
}


def _number(value: Any, *, minimum: float = 0, maximum: float | None = None) -> float:
    if isinstance(value, bool):
        raise ValueError("Expected a finite number")
    try:
        number = float(value)
    except (TypeError, ValueError) as err:
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
    result = deepcopy(DEFAULT_FEEDING_SETTINGS)
    if set(value) - set(result):
        raise ValueError("Unknown feeding setting")
    result.update(value)
    if legacy_rate is not None and "meat" not in value:
        result["meat"]["grams_per_kg"] = legacy_rate
    if legacy_method is not None and "kibble" not in value:
        result["kibble"]["method"] = legacy_method
    result["meat_percent"] = _number(result["meat_percent"], maximum=100)
    portions = _number(result["portions_per_day"], minimum=1, maximum=12)
    if int(portions) != portions:
        raise ValueError("Portions must be whole numbers")
    result["portions_per_day"] = int(portions)
    for kind in ("kibble", "meat"):
        food = result[kind]
        if not isinstance(food, dict) or set(food) != set(DEFAULT_FEEDING_SETTINGS[kind]):
            raise ValueError("Invalid food profile fields")
        if food["method"] not in ("linear", "table", "per_kg"):
            raise ValueError("Invalid food calculation method")
        for key in ("grams_per_kg", "coefficient", "offset", "min_kg", "max_kg"):
            food[key] = _number(food[key])
        if food["grams_per_kg"] <= 0 or food["min_kg"] <= 0 or food["min_kg"] >= food["max_kg"]:
            raise ValueError("Invalid food rate or weight range")
        if food["coefficient"] == 0 and food["offset"] == 0:
            raise ValueError("Formula must produce a positive daily ration")
        table = food["table"]
        if not isinstance(table, list) or not 2 <= len(table) <= 100:
            raise ValueError("Food table requires 2 to 100 rows")
        previous = 0
        for index, row in enumerate(table):
            if not isinstance(row, list) or len(row) != 2:
                raise ValueError("Table rows require weight in kg and grams per day")
            weight, grams = (_number(row[0]), _number(row[1]))
            if weight <= previous or grams <= 0:
                raise ValueError("Table weights must be positive and strictly increasing; rations must be positive")
            table[index] = [weight, grams]
            previous = weight
    return result
