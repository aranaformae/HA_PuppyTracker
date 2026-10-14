export const DEFAULT_FOOD_PROFILES = {
  kibble: { method: "table", grams_per_kg: 45, coefficient: 13.32, offset: 94.46,
    min_kg: 1, max_kg: 20, table: [[1, 57], [2, 96], [5, 191], [10, 267], [15, 327], [20, 360]] },
  meat: { method: "per_kg", grams_per_kg: 45, coefficient: 45, offset: 0,
    min_kg: 0.1, max_kg: 20, table: [[1, 45], [20, 900]] },
};

export function feedingSettingsFromStored(value = {}) {
  const foods = structuredClone(DEFAULT_FOOD_PROFILES);
  if (value?.kibble) foods.kibble = structuredClone(value.kibble);
  else if (value?.kibble_formula) foods.kibble.method = value.kibble_formula;
  if (value?.meat) foods.meat = structuredClone(value.meat);
  else if (value?.kivo_grams_per_kg != null) foods.meat.grams_per_kg = value.kivo_grams_per_kg;
  return { meatPercent: value?.meat_percent ?? 50, portions: value?.portions_per_day ?? 4, ...foods };
}

function validFood(food) {
  if (!food || !["table", "linear", "per_kg"].includes(food.method)) return false;
  const numeric = ["grams_per_kg", "coefficient", "offset", "min_kg", "max_kg"];
  if (numeric.some((key) => food[key] == null || typeof food[key] === "boolean" || String(food[key]).trim() === ""
      || !Number.isFinite(Number(food[key])) || Number(food[key]) < 0)) return false;
  if (Number(food.grams_per_kg) <= 0 || Number(food.min_kg) <= 0 || Number(food.min_kg) >= Number(food.max_kg)
      || Number(food.coefficient) + Number(food.offset) <= 0) return false;
  if (!Array.isArray(food.table) || food.table.length < 2 || food.table.length > 100) return false;
  let previous = 0;
  return food.table.every((row) => {
    if (!Array.isArray(row) || row.length !== 2 || row.some((value) => value == null || typeof value === "boolean" || String(value).trim() === "" || !Number.isFinite(Number(value)))) return false;
    const weight = Number(row[0]);
    if (weight <= previous || Number(row[1]) <= 0) return false;
    previous = weight;
    return true;
  });
}

export function feedingSettingsForStorage(value) {
  const share = Number(value.meatPercent), portions = Number(value.portions);
  if (value.meatPercent == null || String(value.meatPercent).trim() === "" || typeof value.meatPercent === "boolean" || typeof value.portions === "boolean"
      || !Number.isFinite(share) || share < 0 || share > 100 || !Number.isInteger(portions) || portions < 1 || portions > 12
      || !validFood(value.kibble) || !validFood(value.meat)) return null;
  const food = (profile) => Object.fromEntries(Object.entries(profile).map(([key, value]) =>
    [key, key === "method" ? value : key === "table" ? value.map((row) => row.map(Number)) : Number(value)]));
  return { meat_percent: share, portions_per_day: portions, kibble: food(value.kibble), meat: food(value.meat) };
}

export function foodDailyAmount(weightKg, food) {
  if (!Number.isFinite(weightKg) || weightKg <= 0 || !validFood(food)) return null;
  if (food.method === "per_kg") return weightKg * Number(food.grams_per_kg);
  if (food.method === "linear") {
    if (weightKg < Number(food.min_kg) || weightKg > Number(food.max_kg)) return null;
    return weightKg * Number(food.coefficient) + Number(food.offset);
  }
  const table = food.table.map((row) => row.map(Number));
  if (weightKg < table[0][0] || weightKg > table.at(-1)[0]) return null;
  for (let index = 1; index < table.length; index += 1) {
    const [lowKg, lowGrams] = table[index - 1], [highKg, highGrams] = table[index];
    if (weightKg <= highKg) return lowGrams + (highGrams - lowGrams) * (weightKg - lowKg) / (highKg - lowKg);
  }
  return null;
}

export function calculateFeedingForWeight(weightGrams, settings = feedingSettingsFromStored()) {
  const profile = feedingSettingsForStorage(settings);
  if (!profile) return { status: "invalid_settings" };
  const weight = Number(weightGrams);
  if (!Number.isFinite(weight) || weight <= 0) return { status: "missing_weight" };
  const share = profile.meat_percent / 100, kg = weight / 1000;
  const kibbleBase = share === 1 ? 0 : foodDailyAmount(kg, profile.kibble);
  const meatBase = share === 0 ? 0 : foodDailyAmount(kg, profile.meat);
  if (kibbleBase === null || meatBase === null) return { status: "outside_food_range", food: kibbleBase === null ? "kibble" : "meat" };
  const meatDaily = meatBase * share, kibbleDaily = kibbleBase * (1 - share), totalDaily = meatDaily + kibbleDaily;
  if (!Number.isFinite(totalDaily)) return { status: "invalid_settings" };
  return { status: "ok", meatDaily, kibbleDaily, totalDaily,
    meatPerPortion: meatDaily / profile.portions_per_day,
    kibblePerPortion: kibbleDaily / profile.portions_per_day,
    totalPerPortion: totalDaily / profile.portions_per_day };
}
