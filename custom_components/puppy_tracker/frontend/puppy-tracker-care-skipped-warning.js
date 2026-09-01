import { escapeHtml, languageForHass } from "./puppy-tracker-card-common.js";

const TAGS = ["puppy-tracker-today-card", "puppy-tracker-attention-card"];

function t(card, nl, en) {
  return languageForHass(card?._hass) === "en" ? en : nl;
}

function uniqueSkipped(items) {
  const byPuppy = new Map();
  for (const item of items || []) {
    const puppyId = String(item?.puppy_id || "");
    if (!puppyId || byPuppy.has(puppyId)) continue;
    byPuppy.set(puppyId, item);
  }
  return [...byPuppy.values()];
}

function warningText(card, skipped) {
  const missingBirth = skipped.filter((item) => item?.reason_code === "missing_birth_time");
  const other = skipped.filter((item) => item?.reason_code !== "missing_birth_time");
  const parts = [];

  if (missingBirth.length) {
    const names = missingBirth.map((item) => item?.puppy_name || t(card, "Pup", "Puppy")).join(", ");
    parts.push(t(
      card,
      `Geen zorgplanning voor ${names}: geboortetijd ontbreekt.`,
      `No care schedule for ${names}: birth time is missing.`,
    ));
  }

  if (other.length) {
    const names = other.map((item) => item?.puppy_name || t(card, "Pup", "Puppy")).join(", ");
    parts.push(t(
      card,
      `Zorgplanning kon niet worden berekend voor ${names}. Controleer het programma.`,
      `Care schedule could not be calculated for ${names}. Check the program.`,
    ));
  }

  return parts.join(" ");
}

function renderWarning(card) {
  const root = card?.shadowRoot;
  if (!root) return;
  root.querySelector(".care-skipped-warning")?.remove();

  const skipped = uniqueSkipped(card.__careSkipped || []);
  if (!skipped.length) return;

  // A card must never claim everything is fine while one or more puppies are
  // silently excluded from age-based care derivation.
  root.querySelector(".all-ok")?.remove();

  const warning = document.createElement("div");
  warning.className = "care-skipped-warning";
  warning.innerHTML = `<style>
    .care-skipped-warning{margin-top:12px;display:flex;gap:9px;align-items:flex-start;padding:10px 12px;border:1px solid var(--warning-color,var(--primary-color));border-radius:10px;background:var(--secondary-background-color);font-size:.84rem;line-height:1.35}.care-skipped-warning ha-icon{flex:0 0 auto;color:var(--warning-color,var(--primary-color))}
  </style><ha-icon icon="mdi:alert-circle-outline"></ha-icon><div>${escapeHtml(warningText(card, skipped))}</div>`;
  root.querySelector("ha-card")?.appendChild(warning);
}

function patch(tag) {
  const ctor = customElements.get(tag);
  const proto = ctor?.prototype;
  if (!proto || proto.__careSkippedWarningPatched) return;
  const originalRender = proto._render;
  if (typeof originalRender !== "function") return;

  proto._render = function (...args) {
    const result = originalRender.apply(this, args);
    renderWarning(this);
    return result;
  };
  proto.__careSkippedWarningPatched = true;
}

for (const tag of TAGS) patch(tag);
