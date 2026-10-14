export const DEFAULT_FOOD_PROFILES = {
  kibble: { method: "table", grams_per_kg: 45, coefficient: 13.32, offset: 94.46,
    kcal_per_100g: 0, age_tables: [],
    min_kg: 1, max_kg: 20, table: [[1, 57], [2, 96], [5, 191], [10, 267], [15, 327], [20, 360]] },
  meat: { method: "per_kg", grams_per_kg: 45, coefficient: 45, offset: 0,
    kcal_per_100g: 0, age_tables: [],
    min_kg: 0.1, max_kg: 20, table: [[1, 45], [20, 900]] },
};

export function feedingSettingsFromStored(value = {}) {
  const foods = structuredClone(DEFAULT_FOOD_PROFILES);
  if (value?.kibble) foods.kibble = { kcal_per_100g: 0, age_tables: [], ...structuredClone(value.kibble) };
  else if (value?.kibble_formula) foods.kibble.method = value.kibble_formula;
  if (value?.meat) foods.meat = { kcal_per_100g: 0, age_tables: [], ...structuredClone(value.meat) };
  else if (value?.kivo_grams_per_kg != null) foods.meat.grams_per_kg = value.kivo_grams_per_kg;
  const share = value?.meat_percent ?? 50;
  let kibblePortions = 1, meatPortions = 2;
  if (value?.portions_per_day != null) {
    const total = Math.max(2, Number(value.portions_per_day));
    kibblePortions = Number(share) === 100 ? 0 : Number(share) === 0 ? Number(value.portions_per_day)
      : Math.max(1, Math.min(total - 1, Math.floor(total * (1 - Number(share) / 100) + 0.5)));
    meatPortions = Number(share) === 0 ? 0 : Number(share) === 100 ? Number(value.portions_per_day) : total - kibblePortions;
  }
  return { allocationMode: value?.allocation_mode ?? "ration", kcalPerKg: value?.kcal_per_kg ?? 0,
    meatPercent: share, kibblePortions: value?.kibble_portions_per_day ?? kibblePortions,
    meatPortions: value?.meat_portions_per_day ?? meatPortions, ...foods };
}

function validTable(table) {
  if (!Array.isArray(table) || table.length < 2 || table.length > 100) return false;
  let previous = 0;
  return table.every((row) => {
    if (!Array.isArray(row) || row.length !== 2 || row.some((value) => !validNumber(value))) return false;
    const weight = Number(row[0]);
    if (weight <= previous || Number(row[1]) <= 0) return false;
    previous = weight;
    return true;
  });
}

function validNumber(value) {
  return ["number", "string"].includes(typeof value) && String(value).trim() !== ""
    && Number.isFinite(Number(value)) && Number(value) >= 0;
}

function validFood(food) {
  if (!food || !["table", "linear", "per_kg", "age_table"].includes(food.method)
      || Object.keys(food).some((key) => !Object.hasOwn(DEFAULT_FOOD_PROFILES.kibble, key))) return false;
  const numeric = ["grams_per_kg", "coefficient", "offset", "min_kg", "max_kg"];
  if (numeric.some((key) => !validNumber(food[key]))) return false;
  if (Number(food.grams_per_kg) <= 0 || Number(food.min_kg) <= 0 || Number(food.min_kg) >= Number(food.max_kg)
      || Number(food.coefficient) + Number(food.offset) <= 0) return false;
  if (!validTable(food.table) || !validNumber(food.kcal_per_100g === undefined ? 0 : food.kcal_per_100g)) return false;
  const stages = food.age_tables === undefined ? [] : food.age_tables;
  if (!Array.isArray(stages) || stages.length > 24) return false;
  let previous = -1;
  return stages.every((stage) => {
    if (!stage || Object.keys(stage).length !== 2 || !validNumber(stage.from_day)
        || !Number.isInteger(Number(stage.from_day)) || Number(stage.from_day) > 3650
        || Number(stage.from_day) <= previous || !validTable(stage.table)) return false;
    previous = Number(stage.from_day);
    return true;
  });
}

export function feedingSettingsForStorage(value) {
  const share = Number(value.meatPercent);
  const mode = value.allocationMode === undefined ? "ration" : value.allocationMode;
  const target = value.kcalPerKg === undefined ? 0 : value.kcalPerKg;
  const validPortions = (count, active) => count != null && typeof count !== "boolean" && String(count).trim() !== ""
    && Number.isInteger(Number(count)) && Number(count) >= (active ? 1 : 0) && Number(count) <= 12;
  if (value.meatPercent == null || String(value.meatPercent).trim() === "" || typeof value.meatPercent === "boolean"
      || !Number.isFinite(share) || share < 0 || share > 100
      || !validPortions(value.kibblePortions, share < 100) || !validPortions(value.meatPortions, share > 0)
      || !["ration", "energy"].includes(mode) || !validNumber(target)
      || !validFood(value.kibble) || !validFood(value.meat)) return null;
  for (const kind of ["kibble", "meat"]) {
    const active = kind === "kibble" ? share < 100 : share > 0;
    if (mode === "energy" && (Number(target) <= 0 || (active && Number(value[kind].kcal_per_100g ?? 0) <= 0))) return null;
    if (mode === "ration" && value[kind].method === "age_table" && !value[kind].age_tables?.length) return null;
  }
  const food = (profile) => ({ ...Object.fromEntries(Object.entries(profile).filter(([key]) => !["age_tables", "kcal_per_100g"].includes(key)).map(([key, value]) =>
    [key, key === "method" ? value : key === "table" ? value.map((row) => row.map(Number)) : Number(value)])),
    kcal_per_100g: Number(profile.kcal_per_100g ?? 0),
    age_tables: (profile.age_tables ?? []).map((stage) => ({ from_day: Number(stage.from_day), table: stage.table.map((row) => row.map(Number)) })) });
  return { allocation_mode: mode, kcal_per_kg: Number(target), meat_percent: share, kibble_portions_per_day: Number(value.kibblePortions),
    meat_portions_per_day: Number(value.meatPortions), kibble: food(value.kibble), meat: food(value.meat) };
}

function scheduleForProfile(profile) {
  const kibble = profile.meat_percent < 100 ? profile.kibble_portions_per_day : 0;
  const meat = profile.meat_percent > 0 ? profile.meat_portions_per_day : 0;
  return { kibble, meat, total: kibble + meat };
}

export function feedingSchedule(settings) {
  const profile = feedingSettingsForStorage(settings);
  return profile ? scheduleForProfile(profile) : null;
}

function interpolateTable(weightKg, table) {
  table = table.map((row) => row.map(Number));
  if (weightKg < table[0][0] || weightKg > table.at(-1)[0]) return null;
  for (let index = 1; index < table.length; index += 1) {
    const [lowKg, lowGrams] = table[index - 1], [highKg, highGrams] = table[index];
    if (weightKg <= highKg) return lowGrams + (highGrams - lowGrams) * (weightKg - lowKg) / (highKg - lowKg);
  }
  return null;
}

export function foodDailyAmount(weightKg, food, ageDays = null) {
  if (!Number.isFinite(weightKg) || weightKg <= 0 || !validFood(food)) return null;
  if (food.method === "per_kg") return weightKg * Number(food.grams_per_kg);
  if (food.method === "linear") {
    if (weightKg < Number(food.min_kg) || weightKg > Number(food.max_kg)) return null;
    return weightKg * Number(food.coefficient) + Number(food.offset);
  }
  if (food.method === "age_table") {
    if (!validNumber(ageDays)) return null;
    const stage = food.age_tables?.findLast((stage) => Number(stage.from_day) <= Number(ageDays));
    return stage ? interpolateTable(weightKg, stage.table) : null;
  }
  return interpolateTable(weightKg, food.table);
}

export function calculateFeedingForWeight(weightGrams, settings = feedingSettingsFromStored(), ageDays = null) {
  const profile = feedingSettingsForStorage(settings);
  if (!profile) return { status: "invalid_settings" };
  const weight = Number(weightGrams);
  if (!Number.isFinite(weight) || weight <= 0) return { status: "missing_weight" };
  const share = profile.meat_percent / 100, kg = weight / 1000;
  const energy = profile.allocation_mode === "energy";
  if (!energy && !validNumber(ageDays) && ((share < 1 && profile.kibble.method === "age_table")
      || (share > 0 && profile.meat.method === "age_table"))) return { status: "missing_age" };
  if (!energy) {
    for (const kind of ["kibble", "meat"]) {
      const active = kind === "kibble" ? share < 1 : share > 0;
      if (active && profile[kind].method === "age_table" && Number(ageDays) < profile[kind].age_tables[0].from_day)
        return { status: "before_age_stage", food: kind };
    }
  }
  const kcalDaily = energy ? kg * profile.kcal_per_kg : null;
  const kibbleBase = share === 1 ? 0 : energy ? kcalDaily * 100 / profile.kibble.kcal_per_100g : foodDailyAmount(kg, profile.kibble, ageDays);
  const meatBase = share === 0 ? 0 : energy ? kcalDaily * 100 / profile.meat.kcal_per_100g : foodDailyAmount(kg, profile.meat, ageDays);
  if (kibbleBase === null || meatBase === null) return { status: "outside_food_range", food: kibbleBase === null ? "kibble" : "meat" };
  const meatDaily = meatBase * share, kibbleDaily = kibbleBase * (1 - share), totalDaily = meatDaily + kibbleDaily;
  if (!Number.isFinite(totalDaily)) return { status: "invalid_settings" };
  const schedule = scheduleForProfile(profile);
  return { status: "ok", meatDaily, kibbleDaily, totalDaily, kcalDaily,
    meatPerPortion: schedule.meat ? meatDaily / schedule.meat : null,
    kibblePerPortion: schedule.kibble ? kibbleDaily / schedule.kibble : null,
    feedingMoments: schedule.total };
}
