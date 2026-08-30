export const DOMAIN = "puppy_tracker";

export async function fetchLitters(hass) {
  return hass.callWS({ type: `${DOMAIN}/litters` });
}

export async function fetchLitterData(hass, litterId) {
  return hass.callWS({ type: `${DOMAIN}/data`, litter_id: litterId });
}

export async function subscribeUpdates(hass, callback) {
  return hass.connection.subscribeMessage(callback, { type: `${DOMAIN}/subscribe` });
}

export async function fetchExport(hass, litterId, format, options = {}) {
  const message = { type: `${DOMAIN}/export`, litter_id: litterId, format };
  if (options.puppy_id) message.puppy_id = options.puppy_id;
  if (Number.isFinite(Number(options.range_hours)) && Number(options.range_hours) > 0) {
    message.range_hours = Number(options.range_hours);
  }
  return hass.callWS(message);
}

export function downloadExportFile(result) {
  let payload = result.content;
  if (result.encoding === "base64") {
    const binary = atob(String(result.content || ""));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    payload = bytes;
  }

  const blob = new Blob([payload], { type: result.mime_type || "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = result.filename || "puppy-weight-tracker-export";
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function formatWeight(value, fallback = "—") {
  const number = finiteNumber(value);
  if (number === null) return fallback;
  return `${new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 1 }).format(number)} g`;
}

export function formatSignedWeight(value, fallback = "—") {
  const number = finiteNumber(value);
  if (number === null) return fallback;
  const formatted = new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 1 }).format(Math.abs(number));
  return `${number > 0 ? "+" : number < 0 ? "−" : ""}${formatted} g`;
}

export function formatPercent(value, fallback = "—") {
  const number = finiteNumber(value);
  if (number === null) return fallback;
  const formatted = new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 2 }).format(Math.abs(number));
  return `${number > 0 ? "+" : number < 0 ? "−" : ""}${formatted}%`;
}

export function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function formatDateTime(value, fallback = "—") {
  const date = parseDate(value);
  if (!date) return fallback;
  return new Intl.DateTimeFormat("nl-NL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatShortDateTime(value, fallback = "—") {
  const date = parseDate(value);
  if (!date) return fallback;
  return new Intl.DateTimeFormat("nl-NL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatAge(value, now = new Date()) {
  const birth = parseDate(value);
  if (!birth) return "—";
  let seconds = Math.max(0, (now.getTime() - birth.getTime()) / 1000);
  const hours = Math.floor(seconds / 3600);
  const days = Math.floor(hours / 24);
  if (days < 7) {
    if (days === 0) return `${hours} u`;
    return `${days} d ${hours % 24} u`;
  }
  if (days < 28) return `${days} dagen`;
  if (days < 90) return `${Math.floor(days / 7)} weken`;
  const months = Math.floor(days / 30.4375);
  if (months < 24) return `${months} maanden`;
  const years = Math.floor(months / 12);
  return `${years} jaar ${months % 12} mnd`;
}

export function formatHoursSince(value, fallback = "—") {
  const number = finiteNumber(value);
  if (number === null) return fallback;
  if (number < 1) return `${Math.max(0, Math.round(number * 60))} min`;
  if (number < 24) return `${new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 1 }).format(number)} u`;
  return `${new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 1 }).format(number / 24)} d`;
}

export function statusTone(statusCode) {
  if (["ok", "first_24h"].includes(statusCode)) return "ok";
  if (["low_growth"].includes(statusCode)) return "warning";
  if (["weigh_due", "no_measurement", "weight_loss", "first_day_excess_weight_loss"].includes(statusCode)) return "danger";
  return "neutral";
}

export function statusIcon(statusCode) {
  if (statusCode === "ok") return "✓";
  if (statusCode === "first_24h") return "◷";
  if (statusCode === "weigh_due" || statusCode === "no_measurement") return "⚖";
  if (statusCode === "low_growth") return "↘";
  if (statusCode === "weight_loss" || statusCode === "first_day_excess_weight_loss") return "!";
  return "•";
}

export function describeStatus(summary) {
  const code = summary?.status_code;
  if (code === "weigh_due") {
    return `Laatste weging ${formatHoursSince(summary.hours_since_weighing)} geleden`;
  }
  if (code === "no_measurement") return "Nog geen geldige meting";
  if (code === "low_growth") {
    return `Groei ${formatPercent(summary.growth_24h_percent)} per 24 uur`;
  }
  if (code === "weight_loss") {
    return `Laatste verschil ${formatSignedWeight(summary.change_grams)}`;
  }
  if (code === "first_day_excess_weight_loss") {
    return `Sinds geboorte ${formatPercent(summary.first_day_weight_change_percent)}`;
  }
  if (code === "first_24h") return "Eerste 24 uur";
  if (code === "ok") return "Geen actieve waarschuwing";
  return summary?.status || "Onbekend";
}

export function selectDefaultLitter(litters, preferredId = null) {
  if (!Array.isArray(litters) || !litters.length) return null;
  if (preferredId && litters.some((item) => item.id === preferredId)) return preferredId;
  const active = litters.find((item) => item.active !== false);
  return (active || litters[0]).id;
}

export function fireNavigate(element, path) {
  if (!path) return;
  const event = new CustomEvent("hass-navigate", {
    bubbles: true,
    composed: true,
    detail: { navigation_path: path },
  });
  element.dispatchEvent(event);
}

export function filterMeasurements(measurements, rangeHours) {
  const rows = Array.isArray(measurements) ? measurements : [];
  if (!rangeHours || rangeHours <= 0) return rows;
  const cutoff = Date.now() - rangeHours * 3600 * 1000;
  return rows.filter((item) => {
    const date = parseDate(item.timestamp);
    return date && date.getTime() >= cutoff;
  });
}

export function rangeToHours(range) {
  return {
    "24h": 24,
    "3d": 72,
    "7d": 168,
    "14d": 336,
    "30d": 720,
    all: 0,
  }[range] ?? 168;
}

export function sexLabel(value) {
  const text = String(value || "").toLowerCase();
  if (["male", "reu", "m"].includes(text)) return "Reu";
  if (["female", "teef", "f"].includes(text)) return "Teef";
  return value || "—";
}
