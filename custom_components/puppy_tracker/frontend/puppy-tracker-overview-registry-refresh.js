// Keep the overview card's Home Assistant registry cache in sync with
// structural Puppy Tracker changes (imports, new litters, and new puppies).
//
// The overview card discovers litters/puppies through HA's device/entity
// registries. Those registries were previously read only once when the card
// loaded. A restore can create the devices after that initial read, while the
// normal Puppy Tracker update subscription only reloads history. The result is
// a valid litter/history payload with zero discovered puppy rows until the
// browser reloads the card.
(() => {
  const CARD_TAG = "puppy-tracker-overview-card";

  const applyPatch = () => {
    const CardClass = customElements.get(CARD_TAG);
    if (!CardClass) return;

    const prototype = CardClass.prototype;
    if (prototype.__puppyTrackerRegistryRefreshPatched) return;
    prototype.__puppyTrackerRegistryRefreshPatched = true;

    prototype._refreshRegistryAfterDataUpdate = async function () {
      if (!this._hass) return;

      // Coalesce update bursts (for example an import that creates several
      // puppies and emits multiple HA state changes around the same time).
      if (this._registryRefreshPromise) {
        await this._registryRefreshPromise;
        return;
      }

      this._registryRefreshPromise = (async () => {
        const [entities, devices] = await Promise.all([
          this._hass.callWS({ type: "config/entity_registry/list" }),
          this._hass.callWS({ type: "config/device_registry/list" }),
        ]);

        this._entities = Array.isArray(entities) ? entities : [];
        this._devices = Array.isArray(devices) ? devices : [];
        this._registryLoaded = true;

        // A replace-all restore can also replace the selected litter device,
        // so selection must be reconciled against the refreshed registry.
        this._initializeSelection();
        this._lastStateSignature = this._currentStateSignature();
      })();

      try {
        await this._registryRefreshPromise;
      } finally {
        this._registryRefreshPromise = null;
      }
    };

    prototype._subscribeToData = async function () {
      if (
        !this._hass?.connection ||
        this._dataUnsubscribe ||
        this._dataSubscriptionPending
      ) {
        return;
      }

      this._dataSubscriptionPending = true;
      const hass = this._hass;

      try {
        const unsubscribe = await hass.connection.subscribeMessage(
          async () => {
            try {
              // Refresh discovery first. History may already contain imported
              // puppies, but _puppyRows() cannot expose them until their new
              // device/entity registry entries are visible to the card.
              await this._refreshRegistryAfterDataUpdate();
            } catch (err) {
              console.warn(
                "Puppy Tracker Overview card: registry refresh failed",
                err
              );
            }

            this._scheduleHistoryReload();
            this._scheduleMeasurementReload();
            this._scheduleRender();
          },
          { type: "puppy_tracker/subscribe" }
        );
        if (!this.isConnected || this._hass !== hass) {
          await Promise.resolve(unsubscribe?.()).catch(() => undefined);
          return;
        }
        this._dataUnsubscribe = unsubscribe;
      } catch (err) {
        console.warn("Puppy Tracker Overview card: update subscription failed", err);
      } finally {
        this._dataSubscriptionPending = false;
      }
    };
  };

  if (customElements.get(CARD_TAG)) {
    applyPatch();
  } else {
    customElements.whenDefined(CARD_TAG).then(applyPatch);
  }
})();
