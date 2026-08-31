// Resolve the reusable mother profile for the recurring-reminder owner selector.
// The regular litter payload contains the mother name, while the persistent
// mother_id lives in the mother-scope API.

const REMINDER_TAG = "puppy-tracker-recurring-reminder-card";

function patchRecurringMotherOwner() {
  const Card = customElements.get(REMINDER_TAG);
  if (!Card || Card.prototype.__puppyTrackerRecurringMotherOwnerPatched) return;

  const originalLoadCurrent = Card.prototype._loadCurrent;
  const originalOwners = Card.prototype._owners;

  Card.prototype._loadCurrent = async function (...args) {
    await originalLoadCurrent.apply(this, args);
    this.__recurringMotherOwner = null;

    const litter = this._litterData?.litter;
    if (!this._hass || !this._selectedLitterId || !litter?.mother) return;

    try {
      const payload = await this._hass.callWS({
        type: "puppy_tracker/mother/records",
        litter_id: this._selectedLitterId,
        history_scope: "current",
        include_deleted: false,
      });
      if (payload?.owner?.id) {
        this.__recurringMotherOwner = {
          id: String(payload.owner.id),
          name: payload.owner.name || litter.mother,
        };
      }
    } catch (_error) {
      // A litter without a resolved mother profile should not make the whole
      // reminder card fail; litter and puppy reminders remain usable.
      this.__recurringMotherOwner = null;
    }

    this._render();
  };

  Card.prototype._owners = function (...args) {
    const owners = originalOwners.apply(this, args);
    if (owners.some((owner) => owner.scope === "mother")) return owners;

    const mother = this.__recurringMotherOwner;
    if (!mother?.id) return owners;

    const isEnglish = String(this._hass?.language || this._hass?.locale?.language || "nl")
      .toLowerCase()
      .startsWith("en");
    const label = `${isEnglish ? "Mother" : "Moederhond"} · ${mother.name || (isEnglish ? "Mother" : "Moederhond")}`;
    const option = {
      value: `mother:${mother.id}`,
      scope: "mother",
      id: mother.id,
      label,
    };

    const litterIndex = owners.findIndex((owner) => owner.scope === "litter");
    owners.splice(litterIndex >= 0 ? litterIndex + 1 : 0, 0, option);
    return owners;
  };

  Card.prototype.__puppyTrackerRecurringMotherOwnerPatched = true;
}

if (customElements.get(REMINDER_TAG)) patchRecurringMotherOwner();
else customElements.whenDefined(REMINDER_TAG).then(patchRecurringMotherOwner);
