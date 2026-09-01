import { escapeHtml, languageForHass } from "./puppy-tracker-card-common.js";

const TAGS = ["puppy-tracker-today-card", "puppy-tracker-attention-card"];

function t(card, nl, en) {
  return languageForHass(card?._hass) === "en" ? en : nl;
}

function ensureStyle(card) {
  const root = card?.shadowRoot;
  if (!root || root.querySelector("#puppy-tracker-care-direct-action-style")) return;
  const style = document.createElement("style");
  style.id = "puppy-tracker-care-direct-action-style";
  style.textContent = `
    .care-direct-action{display:inline-flex;align-items:center;justify-content:center;gap:5px;min-height:30px;border:0;border-radius:9px;padding:0 9px;background:var(--primary-color);color:var(--text-primary-color,#fff);font:inherit;font-size:.76rem;font-weight:700;cursor:pointer;white-space:nowrap}
    .care-direct-action:hover{filter:brightness(1.05)}
    .care-direct-action ha-icon{--mdc-icon-size:16px}
    .care-row[data-care-occurrence]{grid-template-columns:24px minmax(0,1fr) auto auto!important}
    .list>.row[data-care-occurrence],.attention-ack-list>.row[data-care-occurrence]{grid-template-columns:34px minmax(0,1fr) auto auto 32px!important}
    @container attention-card (max-width:520px){
      .list>.row[data-care-occurrence],.attention-ack-list>.row[data-care-occurrence]{grid-template-columns:34px minmax(0,1fr) auto 32px!important}
      .list>.row[data-care-occurrence]>.status,.attention-ack-list>.row[data-care-occurrence]>.status{display:none}
      .care-direct-action{padding:0 8px}
    }
  `;
  root.append(style);
}

function addButtons(card) {
  const root = card?.shadowRoot;
  if (!root) return;
  ensureStyle(card);
  root.querySelectorAll("[data-care-occurrence]").forEach((row) => {
    if (row.querySelector(":scope > .care-direct-action")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "care-direct-action";
    button.title = t(card, "Zorgactie uitvoeren", "Complete care action");
    button.setAttribute("aria-label", button.title);
    button.innerHTML = `<ha-icon icon="mdi:check-circle-outline"></ha-icon><span>${escapeHtml(t(card, "Uitvoeren", "Complete"))}</span>`;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      // The canonical result workflow already belongs to the care row. Trigger
      // that existing handler instead of creating a second completion path.
      row.click();
    });
    const ackButton = row.querySelector(":scope > .attention-ack-button");
    if (ackButton) row.insertBefore(button, ackButton);
    else row.append(button);
  });
}

function patch(tag) {
  const Card = customElements.get(tag);
  const proto = Card?.prototype;
  if (!proto || proto.__puppyTrackerCareDirectActionPatched) return;
  const originalRender = proto._render;
  if (typeof originalRender !== "function") return;
  proto._render = function (...args) {
    const result = originalRender.apply(this, args);
    addButtons(this);
    return result;
  };
  proto.__puppyTrackerCareDirectActionPatched = true;
}

for (const tag of TAGS) {
  if (customElements.get(tag)) patch(tag);
  else customElements.whenDefined(tag).then(() => patch(tag));
}
