// Show immediate feedback after saving a puppy weight.
// The selected puppy's current weight is still the previous effective
// measurement when the save starts, so the comparison can be calculated
// without inventing parallel authoritative state in the frontend.
(() => {
  const CARD_TAG = "puppy-tracker-card";

  const localeFor = (card) =>
    card?._hass?.locale?.language || card?._hass?.language || navigator.language || "nl-NL";

  const isDutch = (locale) => String(locale || "").toLowerCase().startsWith("nl");

  const formatNumber = (value, locale, maximumFractionDigits = 1) =>
    new Intl.NumberFormat(locale || "nl-NL", {
      maximumFractionDigits,
      minimumFractionDigits: 0,
    }).format(value);

  const formatSigned = (value, locale, maximumFractionDigits = 1) => {
    if (value === 0) return formatNumber(0, locale, maximumFractionDigits);
    const formatted = formatNumber(Math.abs(value), locale, maximumFractionDigits);
    return `${value > 0 ? "+" : "−"}${formatted}`;
  };

  const selectedPuppy = (card, station) => {
    if (typeof card?._puppyRows !== "function") return null;
    const rows = card._puppyRows(station);
    return rows.find((row) => row.selected) || null;
  };

  const applyPatch = () => {
    const CardClass = customElements.get(CARD_TAG);
    if (!CardClass) return;

    const prototype = CardClass.prototype;
    if (prototype.__puppyTrackerWeighingFeedbackPatched) return;
    prototype.__puppyTrackerWeighingFeedbackPatched = true;

    const originalSaveWeight = prototype._saveWeight;
    if (typeof originalSaveWeight !== "function") return;

    prototype._saveWeight = async function (station) {
      const input = this.shadowRoot?.querySelector("#weight-input");
      const savedWeight = Number(input?.value ?? this._draftWeight ?? 0);
      const puppy = selectedPuppy(this, station);
      const previousWeight = Number(puppy?.weight);
      const hasPreviousWeight = Number.isFinite(previousWeight) && previousWeight > 0;
      const puppyName = puppy?.name || "Puppy";

      await originalSaveWeight.call(this, station);

      // Preserve the base card's validation/service errors unchanged.
      if (!Number.isFinite(savedWeight) || savedWeight <= 0) return;
      if (this._localMessage && this._localMessageType === "error") return;

      const locale = localeFor(this);
      const weightText = `${formatNumber(savedWeight, locale, 0)} g`;

      if (!hasPreviousWeight) {
        this._localMessage = isDutch(locale)
          ? `${puppyName}: ${weightText} opgeslagen · eerste meting.`
          : `${puppyName}: ${weightText} saved · first measurement.`;
        this._localMessageType = "success";
        this._scheduleRender?.(true);
        return;
      }

      const gainGrams = savedWeight - previousWeight;
      const growthPercent = (gainGrams / previousWeight) * 100;
      const gainText = `${formatSigned(gainGrams, locale, 0)} g`;
      const percentText = `${formatSigned(growthPercent, locale, 1)}%`;
      const previousText = `${formatNumber(previousWeight, locale, 0)} g`;

      this._localMessage = isDutch(locale)
        ? `${puppyName}: ${weightText} opgeslagen · ${gainText} (${percentText}) t.o.v. vorige meting van ${previousText}.`
        : `${puppyName}: ${weightText} saved · ${gainText} (${percentText}) vs previous measurement of ${previousText}.`;
      this._localMessageType = "success";
      this._scheduleRender?.(true);
    };
  };

  if (customElements.get(CARD_TAG)) {
    applyPatch();
  } else {
    customElements.whenDefined(CARD_TAG).then(applyPatch);
  }
})();
