import {
  describeStatus,
  escapeHtml,
  fetchLitterData,
  fetchLitters,
  fireNavigate,
  selectDefaultLitter,
  statusIcon,
  statusTone,
  subscribeUpdates,
} from "./puppy-tracker-card-common.js";

function actionStatusText(action) {
  const days = Number(action?.days_until_due ?? action?.days_until);
  if (action?.status === "overdue") {
    const amount = Math.abs(days);
    return amount === 1 ? "1 dag te laat" : `${amount} dagen te laat`;
  }
  if (action?.status === "due_today") return "Vandaag";
  if (action?.status === "upcoming") return days === 1 ? "Morgen" : `Over ${days} dagen`;
  return "Gepland";
}

function actionTone(action) {
  if (action?.status === "overdue") return "danger";
  if (action?.status === "due_today") return "warning";
  return "neutral";
}

function formatDueDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : String(value || "");
}

class PuppyTrackerAttentionCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass = null;
    this._config = {};
    this._litters = [];
    this._selectedLitterId = null;
    this._data = null;
    this._loading = false;
    this._error = "";
    this._unsubscribe = null;
    this._subscriptionPending = false;
    this._refreshing = false;
    this._refreshAgain = false;
  }

  static getStubConfig() {
    return { title: "Aandacht", show_litter_selector: true, navigate_path: "" };
  }

  static getConfigForm() {
    return {
      schema: [
        { name: "title", selector: { text: {} } },
        { name: "show_litter_selector", selector: { boolean: {} } },
        { name: "navigate_path", selector: { text: {} } },
      ],
    };
  }

  setConfig(config) {
    this._config = { title: "Aandacht", show_litter_selector: true, navigate_path: "", ...config };
    this._selectedLitterId = config.litter_id || this._selectedLitterId;
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._litters.length && !this._loading) {
      this._loadInitial();
    } else if (this.isConnected) {
      this._ensureSubscription();
    }
  }

  connectedCallback() {
    if (!this._hass) return;
    if (!this._litters.length && !this._loading) {
      this._loadInitial();
    } else {
      this._ensureSubscription();
    }
  }

  disconnectedCallback() {
    if (this._unsubscribe) Promise.resolve(this._unsubscribe()).catch(() => undefined);
    this._unsubscribe = null;
  }

  getCardSize() { return 3; }
  getGridOptions() { return { columns: 12, min_columns: 6 }; }

  async _loadInitial() {
    if (!this._hass || this._loading) return;
    this._loading = true;
    try {
      const response = await fetchLitters(this._hass);
      this._litters = response?.litters || [];
      this._selectedLitterId = selectDefaultLitter(this._litters, this._selectedLitterId || this._config.litter_id);
      await this._loadData(false);
      await this._ensureSubscription();
    } catch (err) {
      this._error = err?.message || "Aandachtsgegevens konden niet worden geladen.";
    } finally {
      this._loading = false;
      this._render();
    }
  }

  async _ensureSubscription() {
    if (!this._hass || this._unsubscribe || this._subscriptionPending || !this.isConnected) return;
    this._subscriptionPending = true;
    try {
      this._unsubscribe = await subscribeUpdates(this._hass, () => this._queueRefresh());
    } catch (err) {
      // Keep showing the last good data. The next hass/connected cycle retries.
      this._unsubscribe = null;
    } finally {
      this._subscriptionPending = false;
    }
  }

  async _queueRefresh() {
    if (!this._hass) return;
    if (this._refreshing) {
      this._refreshAgain = true;
      return;
    }
    this._refreshing = true;
    try {
      do {
        this._refreshAgain = false;
        const response = await fetchLitters(this._hass);
        this._litters = response?.litters || this._litters;
        this._selectedLitterId = selectDefaultLitter(
          this._litters,
          this._selectedLitterId || this._config.litter_id
        );
        await this._loadData(false);
      } while (this._refreshAgain);
      this._error = "";
    } catch (err) {
      this._error = err?.message || "Nieuwe Puppy Tracker-data kon niet worden geladen.";
    } finally {
      this._refreshing = false;
      this._render();
    }
  }

  async _loadData(render = true) {
    if (!this._hass || !this._selectedLitterId) return;
    try {
      this._data = await fetchLitterData(this._hass, this._selectedLitterId);
      this._error = "";
    } catch (err) {
      this._error = err?.message || "Nestdata kon niet worden geladen.";
    }
    if (render) this._render();
  }

  _render() {
    const litter = this._data?.litter;
    const activePuppies = (this._data?.puppies || []).filter((puppy) => puppy.active !== false);
    const entries = [];

    for (const puppy of activePuppies) {
      const summary = puppy.summary || {};
      if (summary.needs_attention) {
        entries.push({
          kind: "weight",
          puppy_id: puppy.id,
          name: puppy.name || "Puppy",
          collar_color: puppy.collar_color,
          tone: statusTone(summary.status_code),
          icon: statusIcon(summary.status_code),
          reason: describeStatus(summary),
          status: summary.status || "Aandacht",
        });
      }
      for (const action of summary.dossier_actions?.actions || []) {
        if (!action.due_soon) continue;
        entries.push({
          kind: "dossier",
          puppy_id: puppy.id,
          name: puppy.name || "Puppy",
          collar_color: puppy.collar_color,
          tone: actionTone(action),
          icon: `<ha-icon icon="${escapeHtml(action.icon || "mdi:calendar-alert")}"></ha-icon>`,
          reason: `${action.title || action.label || "Vervolgactie"} · ${formatDueDate(action.due_date || action.due_at)}`,
          status: actionStatusText(action),
        });
      }
    }

    for (const action of litter?.summary?.dossier_actions?.actions || []) {
      if (!action.due_soon) continue;
      entries.push({
        kind: "dossier",
        puppy_id: null,
        name: "Nestdossier",
        collar_color: null,
        tone: actionTone(action),
        icon: `<ha-icon icon="${escapeHtml(action.icon || "mdi:calendar-alert")}"></ha-icon>`,
        reason: `${action.title || action.label || "Vervolgactie"} · ${formatDueDate(action.due_date || action.due_at)}`,
        status: actionStatusText(action),
      });
    }

    const selector = this._config.show_litter_selector !== false && this._litters.length > 1
      ? `<select id="litter-select">${this._litters.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === this._selectedLitterId ? "selected" : ""}>${escapeHtml(item.name || "Nest")}</option>`).join("")}</select>`
      : "";

    const body = this._error
      ? `<div class="error">${escapeHtml(this._error)}</div>`
      : entries.length
        ? `<div class="list">${entries.map((entry) => `
            <div class="row ${entry.tone}" ${entry.puppy_id ? `data-puppy="${escapeHtml(entry.puppy_id)}"` : ""}>
              <div class="icon ${entry.kind === "dossier" ? "ha" : ""}">${entry.kind === "dossier" ? entry.icon : escapeHtml(entry.icon)}</div>
              <div class="main"><div class="name">${escapeHtml(entry.name)}${entry.collar_color ? `<span class="collar">${escapeHtml(entry.collar_color)}</span>` : ""}</div><div class="reason">${escapeHtml(entry.reason)}</div></div>
              <div class="status">${escapeHtml(entry.status)}</div>
            </div>`).join("")}</div>`
        : `<div class="all-ok"><span>✓</span><div><strong>Alles op orde</strong><div>Geen actieve gewichts- of dossierwaarschuwingen.</div></div></div>`;

    this.shadowRoot.innerHTML = `
      <ha-card>
        <style>
          ha-card{padding:16px;container-type:inline-size;container-name:attention-card}.top{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:10px}.title{font-size:18px;font-weight:600}.sub{font-size:12px;color:var(--secondary-text-color);margin-top:2px}
          select{min-height:38px;max-width:48%;border:1px solid var(--divider-color);border-radius:10px;background:var(--card-background-color);color:var(--primary-text-color);padding:0 10px;font-size:14px}
          .list{display:grid;gap:8px}.row{display:grid;grid-template-columns:34px minmax(0,1fr) auto;align-items:center;gap:10px;padding:10px 11px;border:1px solid var(--divider-color);border-radius:12px}.icon{display:grid;place-items:center;width:30px;height:30px;border-radius:50%;background:var(--secondary-background-color);font-weight:700}.icon.ha ha-icon{--mdc-icon-size:18px}.name{font-weight:600}.collar{font-weight:400;color:var(--secondary-text-color);margin-left:7px}.reason{font-size:12px;color:var(--secondary-text-color);margin-top:2px}.status{font-size:12px;font-weight:600;white-space:nowrap}.danger .status,.danger .icon{color:var(--error-color)}.warning .status,.warning .icon{color:var(--warning-color,var(--primary-color))}.all-ok{display:flex;align-items:center;gap:12px;padding:13px;border:1px solid var(--divider-color);border-radius:12px}.all-ok>span{font-size:24px}.all-ok div div{font-size:12px;color:var(--secondary-text-color);margin-top:2px}.error{color:var(--error-color)}
          .row.clickable{cursor:pointer}@container attention-card (max-width:520px){.status{display:none}.row{grid-template-columns:34px minmax(0,1fr)}.top{align-items:flex-start}.top select{max-width:52%}}
        </style>
        <div class="top"><div class="title">${escapeHtml(this._config.title)}<div class="sub">${escapeHtml(litter?.name || (this._loading ? "Laden…" : "Geen nest"))}</div></div>${selector}</div>
        ${body}
      </ha-card>`;

    this.shadowRoot.getElementById("litter-select")?.addEventListener("change", async (event) => {
      this._selectedLitterId = event.target.value;
      await this._loadData();
    });
    if (this._config.navigate_path) {
      this.shadowRoot.querySelectorAll(".row").forEach((row) => {
        row.classList.add("clickable");
        row.addEventListener("click", () => fireNavigate(this, this._config.navigate_path));
      });
    }
  }
}

if (!customElements.get("puppy-tracker-attention-card")) {
  customElements.define("puppy-tracker-attention-card", PuppyTrackerAttentionCard);
}
window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === "puppy-tracker-attention-card")) {
  window.customCards.push({ type: "puppy-tracker-attention-card", name: "Puppy Tracker Attention", description: "Toont gewichtswaarschuwingen en aankomende dossieracties." });
}
