// Puppy Tracker litter-card profile-note enhancement.
// Kept separate from the main card so the enhancement can stay small and
// frontend-only: profile_note is already part of puppy_tracker/data.

const LITTER_CARD_TAG = "puppy-tracker-litter-card";

function enhanceProfileNote(card) {
  const puppyId = card?._expandedPuppyId;
  const puppies = Array.isArray(card?._data?.puppies) ? card._data.puppies : [];
  const puppy = puppies.find((item) => String(item?.id) === String(puppyId));
  const note = String(puppy?.profile_note || "").trim();
  const detail = card?.shadowRoot?.querySelector(".detail");

  if (!detail || !note || detail.querySelector(".profile-note")) return;

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

function patchLitterCard() {
  const Card = customElements.get(LITTER_CARD_TAG);
  if (!Card || Card.prototype.__puppyTrackerProfileNotePatched) return;

  const originalRender = Card.prototype._render;
  if (typeof originalRender !== "function") return;

  Card.prototype._render = function (...args) {
    const result = originalRender.apply(this, args);
    enhanceProfileNote(this);
    return result;
  };
  Card.prototype.__puppyTrackerProfileNotePatched = true;
}

if (customElements.get(LITTER_CARD_TAG)) {
  patchLitterCard();
} else {
  customElements.whenDefined(LITTER_CARD_TAG).then(patchLitterCard);
}
