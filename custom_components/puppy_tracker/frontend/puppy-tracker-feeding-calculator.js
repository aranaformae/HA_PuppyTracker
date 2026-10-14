// Values from the supplied Ydolo puppy PDF; interpolate only inside its table.
export const YDOLO_FEEDING_TABLE = Object.freeze([
  [1, 57], [2, 96], [5, 191], [10, 267], [15, 327], [20, 360],
].map((point) => Object.freeze(point)));

export const KIVO_PUPPY_RANGE = Object.freeze({ min: 40, max: 50, default: 45 });

export function ydoloDailyAmount(weightKg, formula = "table") {
  if (!Number.isFinite(weightKg) || weightKg < 1 || weightKg > 20) return null;
  if (formula === "linear") return 13.32 * weightKg + 94.46;
  if (formula !== "table") return null;
  for (let index = 1; index < YDOLO_FEEDING_TABLE.length; index += 1) {
    const [lowerWeight, lowerAmount] = YDOLO_FEEDING_TABLE[index - 1];
    const [upperWeight, upperAmount] = YDOLO_FEEDING_TABLE[index];
    if (weightKg <= upperWeight) {
      return lowerAmount + (upperAmount - lowerAmount) * (weightKg - lowerWeight) / (upperWeight - lowerWeight);
    }
  }
  return null;
}

export function calculateFeedingForWeight(weightGrams, { meatPercent = 50, kivoPerKg = 45, portions = 4, kibbleFormula = "table" } = {}) {
  const weight = Number(weightGrams);
  const share = Number(meatPercent);
  const rate = Number(kivoPerKg);
  const meals = Number(portions);
  if (!Number.isFinite(weight) || weight <= 0) return { status: "missing_weight" };
  if (!Number.isFinite(share) || share < 0 || share > 100
      || !Number.isFinite(rate) || rate < KIVO_PUPPY_RANGE.min || rate > KIVO_PUPPY_RANGE.max
      || !Number.isInteger(meals) || meals < 1 || meals > 12) return { status: "invalid_settings" };
  const kg = weight / 1000;
  const kibbleBase = share === 100 ? 0 : ydoloDailyAmount(kg, kibbleFormula);
  if (kibbleBase === null) return { status: "outside_kibble_range" };
  const meatDaily = kg * rate * share / 100;
  const kibbleDaily = kibbleBase * (100 - share) / 100;
  const totalDaily = meatDaily + kibbleDaily;
  if (!Number.isFinite(totalDaily)) return { status: "invalid_settings" };
  return {
    status: "ok", meatDaily, kibbleDaily, totalDaily,
    meatPerPortion: meatDaily / meals, kibblePerPortion: kibbleDaily / meals,
    totalPerPortion: totalDaily / meals,
  };
}
