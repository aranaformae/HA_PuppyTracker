// Puppy Tracker litter-card data display enhancement.
// Uses the existing puppy_tracker/data payload to enrich presentation without
// changing storage or API contracts.

import { languageForHass } from "./puppy-tracker-card-common.js";

const SPARK_BLOCKS = "▁▂▃▄▅▆▇█";

const TEXT = {
  en: {
    born: "Born",
    first24h: "First 24 hours: weight loss can be normal",
    growth24: "24h growth",
    growthDevelopment: "Weight development since birth",
    highestWeight: "Highest weight",
    lastMeasurement: "Latest measurement {weight}",
    lastWeighing: "Latest weighing",
    lowestWeight: "Lowest weight",
    noComparison: "No comparison available yet",
    noDevelopment: "No development available yet",
    profileNote: "Profile note",
    sinceBirth: "Since birth",
    sincePrevious: "Since previous measurement",
    trendTitle: "Weight trend from the latest measurements",
  },
  nl: {
    born: "Geboren",
    first24h: "Eerste 24 uur: gewichtsverlies kan normaal zijn",
    growth24: "24u groei",
    growthDevelopment: "Gewichtsontwikkeling sinds geboorte",
    highestWeight: "Hoogste gewicht",
    lastMeasurement: "Laatste meting {weight}",
    lastWeighing: "Laatste weging",
    lowestWeight: "Laagste gewicht",
    noComparison: "Nog geen vergelijkingsbasis",
    noDevelopment: "Nog geen ontwikkeling beschikbaar",
    profileNote: "Profielnotitie",
    sinceBirth: "Sinds geboorte",
    sincePrevious: "Sinds vorige meting",
    trendTitle: "Gewichtstrend van de laatste metingen",
  },
};

function text(hass, key, replacements = {}) {
  const language = languageForHass(hass);
  const template = TEXT[language]?.[key] ?? TEXT.nl[key] ?? key;
  return Object.entries(replacements).reduce(
    (result, [name, value]) => result.replaceAll(`{${name}}`, String(value ?? "")),
    template,
  );
}

function locale(hass) {
  return languageForHass(hass) === "en" ? "en-US" : "nl-NL";
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function signed(value, digits = 1, suffix = "", hass = null) {
  const number = finite(value);
  if (number === null) return "—";
  const sign = number > 0 ? "+" : "";
  return `${sign}${number.toLocaleString(locale(hass), { maximumFractionDigits: digits })}${suffix}`;
}

function percent(value, hass = null) {
  return signed(value, 1, "%", hass);
}

function grams(value, hass = null) {
  return signed(value, 1, " g", hass);
}

function localDateTime(value, hass = null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale(hass), {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function activeMeasurements(puppy) {
  const measurements = Array.isArray(puppy?.measurements) ? puppy.measurements : [];
  return measurements
    .filter((item) => finite(item?.weight) !== null)
    .slice()
    .sort((a, b) => new Date(a?.timestamp || 0).getTime() - new Date(b?.timestamp || 0).getTime());
}

function sparkline(puppy) {
  const weights = activeMeasurements(puppy).slice(-10).map((item) => finite(item.weight));
  if (weights.length < 2) return "";
  const min = Math.min(...weights);
  const max = Math.max(...weights);
  if (max === min) return SPARK_BLOCKS[3].repeat(weights.length);
  return weights.map((weight) => {
    const index = Math.max(0, Math.min(SPARK_BLOCKS.length - 1,
      Math.round(((weight - min) / (max - min)) * (SPARK_BLOCKS.length - 1))));
    return SPARK_BLOCKS[index];
  }).join("");
}

function trendArrow(puppy) {
  const weights = activeMeasurements(puppy).slice(-3).map((item) => finite(item.weight));
  if (weights.length < 2) return "→";
  const delta = weights[weights.length - 1] - weights[0];
  if (delta > 0) return "↑";
  if (delta < 0) return "↓";
  return "→";
}

function averageGrowth(puppy) {
  const summary = puppy?.summary || {};
  const birthWeight = finite(puppy?.birth_weight);
  const currentWeight = finite(summary.current_weight);
  const birthTime = puppy?.birth_time ? new Date(puppy.birth_time).getTime() : NaN;
  const measurements = activeMeasurements(puppy);
  const latestTime = measurements.length
    ? new Date(measurements[measurements.length - 1]?.timestamp || 0).getTime()
    : NaN;

  if (birthWeight === null || birthWeight <= 0 || currentWeight === null ||
      !Number.isFinite(birthTime) || !Number.isFinite(latestTime) || latestTime <= birthTime) {
    return { gramsPerDay: null, percentPerDay: null, ageDaysAtMeasurement: null };
  }

  const ageDaysAtMeasurement = (latestTime - birthTime) / 86400000;
  const totalGrams = currentWeight - birthWeight;
  const totalPercent = (totalGrams / birthWeight) * 100;
  return {
    gramsPerDay: totalGrams / ageDaysAtMeasurement,
    percentPerDay: totalPercent / ageDaysAtMeasurement,
    ageDaysAtMeasurement,
  };
}

function isFirstDay(summary) {
  return ["first_24h", "first_day_excess_weight_loss"].includes(String(summary?.status_code || ""));
}

function changePercent(currentWeight, previousWeight) {
  const current = finite(currentWeight);
  const previous = finite(previousWeight);
  if (current === null || previous === null || previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

function statusExplanation(puppy, hass = null) {
  const s = puppy?.summary || {};
  if (s.status_code === "weigh_due" && finite(s.hours_since_weighing) !== null) {
    return languageForHass(hass) === "en"
      ? `Not weighed for ${Math.round(Number(s.hours_since_weighing))} hours`
      : `${Math.round(Number(s.hours_since_weighing))} uur niet gewogen`;
  }
  if (s.status_code === "low_growth" && finite(s.growth_24h_percent) !== null) {
    return `${text(hass, "growth24")} ${percent(s.growth_24h_percent, hass)}`;
  }
  if (s.status_code === "weight_loss" && finite(s.change_grams) !== null) {
    return text(hass, "lastMeasurement", { weight: grams(s.change_grams, hass) });
  }
  if (s.status_code === "first_day_excess_weight_loss" && finite(s.first_day_weight_change_percent) !== null) {
    return `${text(hass, "sinceBirth")} ${percent(s.first_day_weight_change_percent, hass)}`;
  }
  if (s.status_code === "first_24h") return text(hass, "first24h");
  if (s.status_code === "ok" && finite(s.growth_24h_percent) !== null) {
    return `${text(hass, "growth24")} ${grams(s.growth_24h_grams, hass)} · ${percent(s.growth_24h_percent, hass)}`;
  }
  return "";
}

function enhanceRow(card, row, puppy) {
  const hass = card?._hass || null;
  const s = puppy?.summary || {};
  const measurements = activeMeasurements(puppy);
  const hasComparison = measurements.length >= 2;
  const firstDay = isFirstDay(s);
  const avg = averageGrowth(puppy);
  const birthWeight = finite(puppy?.birth_weight);
  const currentWeight = finite(s.current_weight);
  const totalGrowthGrams = birthWeight !== null && currentWeight !== null ? currentWeight - birthWeight : null;

  const weightSmall = row.querySelector(".weight small");
  if (weightSmall) weightSmall.textContent = `${trendArrow(puppy)} ${grams(s.change_grams, hass)}`;

  const growth = row.querySelector(".growth24");
  if (growth) {
    const main = growth.querySelector("b");
    const small = growth.querySelector("small");
    if (firstDay) {
      if (main) main.textContent = percent(s.growth_birth_percent, hass);
      if (small) small.textContent = `${grams(totalGrowthGrams, hass)} · ${text(hass, "sinceBirth").toLowerCase()}`;
    } else if (!hasComparison) {
      if (main) main.textContent = "—";
      if (small) small.textContent = text(hass, "noComparison");
    } else {
      if (main) main.textContent = percent(s.growth_24h_percent, hass);
      if (small) small.textContent = languageForHass(hass) === "en"
        ? `${grams(s.growth_24h_grams, hass)} · avg. ${percent(avg.percentPerDay, hass)}/day`
        : `${grams(s.growth_24h_grams, hass)} · gem. ${percent(avg.percentPerDay, hass)}/dag`;
    }
  }

  const total = row.querySelector(".total-growth");
  if (total) {
    const main = total.querySelector("b");
    const small = total.querySelector("small");
    if (main) main.textContent = `${grams(totalGrowthGrams, hass)} · ${percent(s.growth_birth_percent, hass)}`;
    if (small) small.textContent = text(hass, "sinceBirth").toLowerCase();
  }

  const last = row.querySelector(".last-weighed");
  if (last) {
    const small = last.querySelector("small");
    if (small) small.textContent = localDateTime(s.last_weighed, hass);
  }

  const identity = row.querySelector(".identity > div");
  const spark = sparkline(puppy);
  if (identity && spark && !identity.querySelector(".puppy-sparkline")) {
    const line = document.createElement("small");
    line.className = "puppy-sparkline";
    line.textContent = spark;
    line.title = text(hass, "trendTitle");
    line.style.letterSpacing = "1px";
    line.style.fontFamily = "monospace";
    line.style.overflow = "visible";
    identity.append(line);
  }

  const stateSmall = row.querySelector(".state small");
  const explanation = statusExplanation(puppy, hass);
  if (stateSmall && explanation) stateSmall.textContent = explanation;

  const code = String(s.status_code || "unknown");
  if (code === "ok" || code === "first_24h") {
    row.style.borderLeft = "3px solid var(--success-color, var(--primary-color))";
  } else if (code === "low_growth" || code === "weigh_due") {
    row.style.borderLeft = "3px solid var(--warning-color, var(--primary-color))";
  } else if (s.needs_attention) {
    row.style.borderLeft = "3px solid var(--error-color)";
  }
}

function statCell(labelText, valueText) {
  const cell = document.createElement("div");
  const label = document.createElement("span");
  label.textContent = labelText;
  const value = document.createElement("b");
  value.textContent = valueText;
  cell.append(label, value);
  return cell;
}

function setDetailValue(detail, labelText, valueText) {
  for (const cell of detail.children) {
    const label = cell.querySelector?.(":scope > span");
    const value = cell.querySelector?.(":scope > b");
    if (label?.textContent === labelText && value) {
      value.textContent = valueText;
      return;
    }
  }
}

function enhanceDetail(card, puppy) {
  const detail = card?.shadowRoot?.querySelector(".detail");
  if (!detail || detail.querySelector(".puppy-data-insights")) return;

  const s = puppy?.summary || {};
  const hass = card?._hass || null;
  const measurements = activeMeasurements(puppy);
  const hasComparison = measurements.length >= 2;
  const firstDay = isFirstDay(s);
  const weights = measurements.map((item) => finite(item.weight)).filter((item) => item !== null);
  const birthWeight = finite(puppy?.birth_weight);
  const currentWeight = finite(s.current_weight);
  const totalGrowthGrams = birthWeight !== null && currentWeight !== null ? currentWeight - birthWeight : null;
  const totalGrowthPercent = finite(s.growth_birth_percent);
  const previousGrowthPercent = changePercent(currentWeight, s.previous_weight);

  if (!hasComparison) setDetailValue(detail, languageForHass(hass) === "en" ? "Previous measurement" : "Vorige meting", "—");

  const section = document.createElement("div");
  section.className = "puppy-data-insights";
  section.style.gridColumn = "1 / -1";
  section.style.display = "grid";
  section.style.gridTemplateColumns = "repeat(auto-fit,minmax(120px,1fr))";
  section.style.gap = "8px";
  section.style.marginTop = "4px";
  section.style.paddingTop = "10px";
  section.style.borderTop = "1px solid var(--divider-color)";

  if (firstDay) {
    section.append(
      statCell(text(hass, "sinceBirth"), `${grams(totalGrowthGrams, hass)} · ${percent(totalGrowthPercent, hass)}`),
    );
    if (hasComparison) {
      section.append(
        statCell(text(hass, "sincePrevious"), `${grams(s.change_grams, hass)} · ${percent(previousGrowthPercent, hass)}`),
        statCell(text(hass, "lowestWeight"), `${Math.min(...weights).toLocaleString(locale(hass))} g`),
        statCell(text(hass, "highestWeight"), `${Math.max(...weights).toLocaleString(locale(hass))} g`),
      );
    }
  } else if (hasComparison) {
    section.append(
      statCell(text(hass, "growth24"), `${grams(s.growth_24h_grams, hass)} · ${percent(s.growth_24h_percent, hass)}`),
      statCell(text(hass, "lowestWeight"), `${Math.min(...weights).toLocaleString(locale(hass))} g`),
      statCell(text(hass, "highestWeight"), `${Math.max(...weights).toLocaleString(locale(hass))} g`),
    );
  }

  section.append(
    statCell(text(hass, "born"), localDateTime(puppy?.birth_time, hass)),
    statCell(text(hass, "lastWeighing"), localDateTime(s.last_weighed, hass)),
  );

  const progress = document.createElement("div");
  progress.className = "growth-progress";
  progress.style.gridColumn = "1 / -1";
  progress.style.marginTop = "4px";
  const progressLabel = document.createElement("span");
  progressLabel.textContent = text(hass, "growthDevelopment");
  const progressText = document.createElement("b");
  progressText.textContent = hasComparison
    ? `${birthWeight !== null ? `${birthWeight.toLocaleString(locale(hass))} g` : "—"} → ${currentWeight !== null ? `${currentWeight.toLocaleString(locale(hass))} g` : "—"} · ${grams(totalGrowthGrams, hass)} · ${percent(totalGrowthPercent, hass)}`
    : text(hass, "noDevelopment");
  progressText.style.whiteSpace = "normal";
  progressText.style.overflow = "visible";
  progress.append(progressLabel, progressText);

  if (hasComparison) {
    const track = document.createElement("div");
    track.style.height = "6px";
    track.style.marginTop = "6px";
    track.style.borderRadius = "999px";
    track.style.background = "var(--divider-color)";
    track.style.overflow = "hidden";
    const fill = document.createElement("div");
    fill.style.height = "100%";
    fill.style.width = `${Math.max(0, Math.min(100, totalGrowthPercent || 0))}%`;
    fill.style.background = "var(--primary-color)";
    fill.style.borderRadius = "inherit";
    track.append(fill);
    progress.append(track);
  }

  section.append(progress);
  detail.append(section);

  const note = String(puppy?.profile_note || "").trim();
  if (note) {
    const block = document.createElement("div");
    block.className = "profile-note";
    block.style.gridColumn = "1 / -1";
    block.style.marginTop = "4px";
    block.style.paddingTop = "9px";
    block.style.borderTop = "1px solid var(--divider-color)";

    const label = document.createElement("span");
    label.textContent = text(hass, "profileNote");
    const paragraph = document.createElement("p");
    paragraph.textContent = note;
    paragraph.style.margin = "4px 0 0";
    paragraph.style.fontSize = "12px";
    paragraph.style.lineHeight = "1.45";
    paragraph.style.whiteSpace = "pre-wrap";
    paragraph.style.overflowWrap = "anywhere";
    paragraph.style.color = "var(--primary-text-color)";
    block.append(label, paragraph);
    detail.append(block);
  }
}

export function enhanceLitterCard(card) {
  const puppies = Array.isArray(card?._data?.puppies) ? card._data.puppies : [];
  const byId = new Map(puppies.map((puppy) => [String(puppy?.id), puppy]));

  card?.shadowRoot?.querySelectorAll(".puppy-row").forEach((row) => {
    const puppy = byId.get(String(row?.dataset?.puppy));
    if (puppy) enhanceRow(card, row, puppy);
  });

  const expanded = byId.get(String(card?._expandedPuppyId));
  if (expanded) enhanceDetail(card, expanded);
}
