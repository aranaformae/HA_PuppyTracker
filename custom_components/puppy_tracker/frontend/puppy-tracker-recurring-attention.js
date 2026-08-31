import { escapeHtml, languageForHass } from "./puppy-tracker-card-common.js";

const TAG = "puppy-tracker-attention-card";
function en(card) { return languageForHass(card?._hass) === "en"; }
function t(card, nl, english) { return en(card) ? english : nl; }
function statusText(card, item) {
  const minutes = Number(item?.minutes_until_due);
  if (item?.status === "overdue") {
    const amount = Math.abs(minutes);
    return amount < 60 ? t(card, `${amount} min te laat`, `${amount} min overdue`) : t(card, `${Math.floor(amount / 60)} u te laat`, `${Math.floor(amount / 60)} h overdue`);
  }
  if (item?.status === "due_soon") return minutes <= 0 ? t(card, "Nu", "Now") : t(card, `over ${minutes} min`, `in ${minutes} min`);
  return "";
}

function patch() {
  const Card = customElements.get(TAG);
  if (!Card || Card.prototype.__puppyTrackerRecurringAttentionPatched) return;
  const originalLoadData = Card.prototype._loadData;
  const originalRender = Card.prototype._render;

  Card.prototype._loadData = async function (render = true) {
    await originalLoadData.call(this, false);
    this.__recurringReminders = [];
    if (this._hass && this._selectedLitterId) {
      try {
        const response = await this._hass.callWS({ type: "puppy_tracker/recurring_reminders", litter_id: this._selectedLitterId });
        this.__recurringReminders = response?.reminders || [];
      } catch (_error) {
        this.__recurringReminders = [];
      }
    }
    if (render) this._render();
  };

  Card.prototype._render = function (...args) {
    const result = originalRender.apply(this, args);
    const root = this.shadowRoot;
    if (!root) return result;
    const due = (this.__recurringReminders || []).filter((item) => item.enabled !== false && ["overdue", "due_soon"].includes(item.status));
    if (!due.length) return result;

    let list = root.querySelector(".list");
    if (!list) {
      root.querySelector(".all-ok")?.remove();
      list = document.createElement("div");
      list.className = "list";
      root.querySelector("ha-card")?.append(list);
    }

    for (const item of due) {
      if (list.querySelector(`[data-recurring-reminder="${CSS.escape(String(item.id))}"]`)) continue;
      const row = document.createElement("div");
      row.className = `row ${item.status === "overdue" ? "danger" : "warning"}`;
      row.dataset.recurringReminder = String(item.id);
      row.innerHTML = `
        <div class="icon ha"><ha-icon icon="${item.record_type === "temperature" ? "mdi:thermometer-alert" : "mdi:bell-ring-outline"}"></ha-icon></div>
        <div class="main"><div class="name">${escapeHtml(item.owner_name || t(this,"Herinnering","Reminder"))}</div><div class="reason">${escapeHtml(item.title || t(this,"Terugkerende actie","Recurring action"))}</div></div>
        <div class="status">${escapeHtml(statusText(this, item))}</div>`;
      list.append(row);
    }
    return result;
  };

  Card.prototype.__puppyTrackerRecurringAttentionPatched = true;
}

if (customElements.get(TAG)) patch();
else customElements.whenDefined(TAG).then(patch);
