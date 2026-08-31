// Puppy Tracker litter-card data display enhancement.
// Uses the existing puppy_tracker/data payload to enrich presentation without
// changing storage or API contracts.

const LITTER_CARD_TAG = "puppy-tracker-litter-card";
const SPARK_BLOCKS = "▁▂▃▄▅▆▇█";

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function signed(value, digits = 1, suffix = "") {
  const number = finite(value);
  if (number === null) return "—";
  const sign = number > 0 ? "+" : "";
  return `${sign}${number.toLocaleString("nl-NL", { maximumFractionDigits: digits })}${suffix}`;
}

function percent(value) {
  return signed(value, 1, "%");
}

function grams(value) {
  return signed(value, 1, " g");
}

function localDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("nl-NL", {
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

function statusExplanation(puppy) {
  const s = puppy?.summary || {};
  if (s.status_code === "weigh_due" && finite(s.hours_since_weighing) !== null) {
    return `${Math.round(Number(s.hours_since_weighing))} uur niet gewogen`;
  }
  if (s.status_code === "low_growth" && finite(s.growth_24h_percent) !== null) {
    return `24u groei ${percent(s.growth_24h_percent)}`;
  }
  if (s.status_code === "weight_loss" && finite(s.change_grams) !== null) {
    return `Laatste meting ${grams(s.change_grams)}`;
  }
  if (s.status_code === "first_day_excess_weight_loss" && finite(s.first_day_weight_change_percent) !== null) {
    return `Sinds geboorte ${percent(s.first_day_weight_change_percent)}`;
  }
  if (s.status_code === "first_24h") return "Eerste 24 uur: gewichtsverlies kan normaal zijn";
  if (s.status_code === "ok" && finite(s.growth_24h_percent) !== null) {
    return `24u groei ${grams(s.growth_24h_grams)} · ${percent(s.growth_24h_percent)}`;
  }
  return "";
}

function enhanceRow(row, puppy) {
  const s = puppy?.summary || {};
  const measurements = activeMeasurements(puppy);
  const hasComparison = measurements.length >= 2;
  const firstDay = isFirstDay(s);
  const avg = averageGrowth(puppy);
  const birthWeight = finite(puppy?.birth_weight);
  const currentWeight = finite(s.current_weight);
  const totalGrowthGrams = birthWeight !== null && currentWeight !== null ? currentWeight - birthWeight : null;

  const weightSmall = row.querySelector(".weight small");
  if (weightSmall) weightSmall.textContent = `${trendArrow(puppy)} ${grams(s.change_grams)}`;

  const growth = row.querySelector(".growth24");
  if (growth) {
    const main = growth.querySelector("b");
    const small = growth.querySelector("small");
    if (firstDay) {
      if (main) main.textContent = percent(s.growth_birth_percent);
      if (small) small.textContent = `${grams(totalGrowthGrams)} · sinds geboorte`;
    } else if (!hasComparison) {
      if (main) main.textContent = "—";
      if (small) small.textContent = "Nog geen vergelijkingsbasis";
    } else {
      if (main) main.textContent = percent(s.growth_24h_percent);
      if (small) small.textContent = `${grams(s.growth_24h_grams)} · gem. ${percent(avg.percentPerDay)}/dag`;
    }
  }

  const total = row.querySelector(".total-growth");
  if (total) {
    const main = total.querySelector("b");
    const small = total.querySelector("small");
    if (main) main.textContent = `${grams(totalGrowthGrams)} · ${percent(s.growth_birth_percent)}`;
    if (small) small.textContent = "sinds geboorte";
  }

  const last = row.querySelector(".last-weighed");
  if (last) {
    const small = last.querySelector("small");
    if (small) small.textContent = localDateTime(s.last_weighed);
  }

  const identity = row.querySelector(".identity > div");
  const spark = sparkline(puppy);
  if (identity && spark && !identity.querySelector(".puppy-sparkline")) {
    const line = document.createElement("small");
    line.className = "puppy-sparkline";
    line.textContent = spark;
    line.title = "Gewichtstrend van de laatste metingen";
    line.style.letterSpacing = "1px";
    line.style.fontFamily = "monospace";
    line.style.overflow = "visible";
    identity.append(line);
  }

  const stateSmall = row.querySelector(".state small");
  const explanation = statusExplanation(puppy);
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
  const measurements = activeMeasurements(puppy);
  const hasComparison = measurements.length >= 2;
  const firstDay = isFirstDay(s);
  const weights = measurements.map((item) => finite(item.weight)).filter((item) => item !== null);
  const birthWeight = finite(puppy?.birth_weight);
  const currentWeight = finite(s.current_weight);
  const totalGrowthGrams = birthWeight !== null && currentWeight !== null ? currentWeight - birthWeight : null;
  const totalGrowthPercent = finite(s.growth_birth_percent);
  const previousGrowthPercent = changePercent(currentWeight, s.previous_weight);

  if (!hasComparison) setDetailValue(detail, "Vorige meting", "—");

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
      statCell("Sinds geboorte", `${grams(totalGrowthGrams)} · ${percent(totalGrowthPercent)}`),
    );
    if (hasComparison) {
      section.append(
        statCell("Sinds vorige meting", `${grams(s.change_grams)} · ${percent(previousGrowthPercent)}`),
        statCell("Laagste gewicht", `${Math.min(...weights).toLocaleString("nl-NL")} g`),
        statCell("Hoogste gewicht", `${Math.max(...weights).toLocaleString("nl-NL")} g`),
      );
    }
  } else if (hasComparison) {
    section.append(
      statCell("24u groei", `${grams(s.growth_24h_grams)} · ${percent(s.growth_24h_percent)}`),
      statCell("Laagste gewicht", `${Math.min(...weights).toLocaleString("nl-NL")} g`),
      statCell("Hoogste gewicht", `${Math.max(...weights).toLocaleString("nl-NL")} g`),
    );
  }

  section.append(
    statCell("Geboren", localDateTime(puppy?.birth_time)),
    statCell("Laatste weging", localDateTime(s.last_weighed)),
  );

  const progress = document.createElement("div");
  progress.className = "growth-progress";
  progress.style.gridColumn = "1 / -1";
  progress.style.marginTop = "4px";
  const progressLabel = document.createElement("span");
  progressLabel.textContent = "Gewichtsontwikkeling sinds geboorte";
  const progressText = document.createElement("b");
  progressText.textContent = hasComparison
    ? `${birthWeight !== null ? `${birthWeight.toLocaleString("nl-NL")} g` : "—"} → ${currentWeight !== null ? `${currentWeight.toLocaleString("nl-NL")} g` : "—"} · ${grams(totalGrowthGrams)} · ${percent(totalGrowthPercent)}`
    : "Nog geen ontwikkeling beschikbaar";
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
    label.textContent = "Profielnotitie";
    const text = document.createElement("p");
    text.textContent = note;
    text.style.margin = "4px 0 0";
    text.style.fontSize = "12px";
    text.style.lineHeight = "1.45";
    text.style.whiteSpace = "pre-wrap";
    text.style.overflowWrap = "anywhere";
    text.style.color = "var(--primary-text-color)";
    block.append(label, text);
    detail.append(block);
  }
}

function enhanceLitterCard(card) {
  const puppies = Array.isArray(card?._data?.puppies) ? card._data.puppies : [];
  const byId = new Map(puppies.map((puppy) => [String(puppy?.id), puppy]));

  card?.shadowRoot?.querySelectorAll(".puppy-row").forEach((row) => {
    const puppy = byId.get(String(row?.dataset?.puppy));
    if (puppy) enhanceRow(row, puppy);
  });

  const expanded = byId.get(String(card?._expandedPuppyId));
  if (expanded) enhanceDetail(card, expanded);
}

function patchLitterCard() {
  const Card = customElements.get(LITTER_CARD_TAG);
  if (!Card || Card.prototype.__puppyTrackerDataDisplayPatched) return;
  const originalRender = Card.prototype._render;
  if (typeof originalRender !== "function") return;

  Card.prototype._render = function (...args) {
    const result = originalRender.apply(this, args);
    enhanceLitterCard(this);
    return result;
  };
  Card.prototype.__puppyTrackerDataDisplayPatched = true;
}

if (customElements.get(LITTER_CARD_TAG)) patchLitterCard();
else customElements.whenDefined(LITTER_CARD_TAG).then(patchLitterCard);
