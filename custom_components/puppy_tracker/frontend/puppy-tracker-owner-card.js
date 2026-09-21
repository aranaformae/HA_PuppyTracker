import { escapeHtml, languageForHass } from "./puppy-tracker-card-common.js";

const TAG = "puppy-tracker-owner-card";

const OWNER_ROLE_LABELS = {
  owner: { nl: "Eigenaar", en: "Owner" },
  co_owner: { nl: "Mede-eigenaar", en: "Co-owner" },
  breeder: { nl: "Fokker", en: "Breeder" },
  veterinarian: { nl: "Dierenarts", en: "Veterinarian" },
  contact: { nl: "Contactpersoon", en: "Contact" },
};
const PLACEMENT_STATUS_LABELS = {
  interested: { nl: "Interesse", en: "Interested" }, option: { nl: "Optie", en: "Option" },
  reserved: { nl: "Gereserveerd", en: "Reserved" }, sold: { nl: "Verkocht", en: "Sold" }, placed: { nl: "Geplaatst", en: "Placed" },
};
const PAYMENT_STATUS_LABELS = {
  none: { nl: "Geen", en: "None" }, registration_fee: { nl: "Inschrijfgeld", en: "Registration fee" },
  deposit: { nl: "Aanbetaling", en: "Deposit" }, full: { nl: "Volledig betaald", en: "Paid in full" },
};
const CONTACT_PREFERENCE_LABELS = {
  none: { nl: "Geen voorkeur", en: "No preference" }, email: { nl: "E-mail", en: "Email" },
  phone: { nl: "Telefoon", en: "Phone" }, whatsapp: { nl: "WhatsApp", en: "WhatsApp" },
};
const PAYMENT_METHOD_LABELS = {
  none: { nl: "Niet opgegeven", en: "Not specified" }, bank_transfer: { nl: "Bankoverschrijving", en: "Bank transfer" },
  cash: { nl: "Contant", en: "Cash" }, card: { nl: "Kaart", en: "Card" }, other: { nl: "Anders", en: "Other" },
};

const COPY = {
  nl: {
    title: "Baasjes beheren", subtitle: "Contactpersonen die later aan een pup gekoppeld kunnen worden.", addOwner: "Baasje toevoegen", editOwner: "Baasje wijzigen", update: "Wijzigingen opslaan", cancel: "Annuleren", name: "Naam", email: "E-mail", phone: "Telefoon", address: "Adres", role: "Rol", placementStatus: "Plaatsingsstatus", placementDate: "Plaatsingsdatum", paymentStatus: "Betalingsstatus", paymentAmount: "Totaalbedrag", paymentBalance: "Openstaand bedrag", paymentMethod: "Betaalmethode", paymentDate: "Betaaldatum", contactPreference: "Voorkeurscontact", notes: "Notities", owners: "Baasjes", linkedPuppies: "Gekoppelde pups", noLinkedPuppies: "Geen gekoppelde pups", statusHistory: "Statusgeschiedenis", noContact: "Geen contactgegevens", linkTitle: "Baasje koppelen aan pup", linkSave: "Koppeling opslaan", litter: "Nest", puppy: "Pup", saved: "Baasje opgeslagen.", linked: "Koppeling opgeslagen.", deleted: "Baasje verwijderd.", confirmDelete: "Dit baasje verwijderen?", edit: "Bewerken", remove: "Verwijderen", loading: "Baasjes laden…", empty: "Nog geen baasjes toegevoegd.", unknown: "Niet opgegeven",
  },
  en: {
    title: "Manage owners", subtitle: "Contacts that can be linked to a puppy later.", addOwner: "Add owner", editOwner: "Edit owner", update: "Save changes", cancel: "Cancel", name: "Name", email: "Email", phone: "Phone", address: "Address", role: "Role", placementStatus: "Placement status", placementDate: "Placement date", paymentStatus: "Payment status", paymentAmount: "Total amount", paymentBalance: "Outstanding amount", paymentMethod: "Payment method", paymentDate: "Payment date", contactPreference: "Preferred contact", notes: "Notes", owners: "Owners", linkedPuppies: "Linked puppies", noLinkedPuppies: "No linked puppies", statusHistory: "Status history", noContact: "No contact details", linkTitle: "Link owner to puppy", linkSave: "Save link", litter: "Litter", puppy: "Puppy", saved: "Owner saved.", linked: "Link saved.", deleted: "Owner deleted.", confirmDelete: "Delete this owner?", edit: "Edit", remove: "Delete", loading: "Loading owners…", empty: "No owners added yet.", unknown: "Not specified",
  },
};

function text(card, key) {
  const language = languageForHass(card?._hass);
  return COPY[language]?.[key] || COPY.nl[key] || key;
}

function optionLabel(card, value, labels, fallback = "") {
  const language = languageForHass(card?._hass);
  return labels[value]?.[language] || labels[value]?.nl || fallback || value || text(card, "unknown");
}

function selectField(card, name, label, labels, value) {
  const options = Object.keys(labels).map((key) => `<option value="${escapeHtml(key)}" ${key === value ? "selected" : ""}>${escapeHtml(optionLabel(card, key, labels))}</option>`).join("");
  return `<label><span>${escapeHtml(label)}</span><select name="${escapeHtml(name)}">${options}</select></label>`;
}

function formattedDate(card, value, includeTime = false) {
  if (!value) return "—";
  const date = new Date(includeTime ? value : `${value}T12:00:00`);
  if (!Number.isFinite(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(languageForHass(card?._hass) === "en" ? "en-US" : "nl-NL", includeTime
    ? { dateStyle: "medium", timeStyle: "short" }
    : { dateStyle: "medium" }).format(date);
}

class PuppyTrackerOwnerCard extends HTMLElement {
  constructor() {
    super();
    this._config = {};
    this._hass = null;
    this._owners = [];
    this._litters = [];
    this._puppies = [];
    this._selectedPuppy = "";
    this._selectedLitter = "";
    this._editing = null;
    this._expandedOwnerId = null;
    this._showOwnerEditor = false;
    this._status = "";
    this._error = "";
    this._loaded = false;
    this._loading = false;
    this._busy = false;
  }

  static getStubConfig() { return { title: "" }; }
  static getConfigForm() { return { schema: [{ name: "title", selector: { text: {} } }] }; }

  setConfig(config) {
    this._config = { title: "", ...config };
    this._render();
    if (this._hass && !this._loaded) this._load();
  }

  set hass(value) {
    this._hass = value;
    if (this._config && !this._loaded && !this._loading) this._load();
  }

  connectedCallback() {
    if (this._hass && !this._loaded && !this._loading) this._load();
  }

  getCardSize() { return 7; }
  getGridOptions() { return { columns: 12, min_columns: 6 }; }

  async _load(force = false) {
    if (!this._hass || this._loading || (this._loaded && !force)) return;
    this._loading = true;
    this._error = "";
    this._render();
    try {
      const [ownerResult, litterResult] = await Promise.all([
        this._hass.callWS({ type: "puppy_tracker/owners/list" }),
        this._hass.callWS({ type: "puppy_tracker/litters" }),
      ]);
      this._owners = ownerResult?.owners || [];
      this._litters = litterResult?.litters || [];
      if (!this._selectedLitter && this._litters[0]) this._selectedLitter = this._litters[0].id;
      const data = await Promise.all(this._litters.map(async (litter) => {
        const result = await this._hass.callWS({ type: "puppy_tracker/data", litter_id: litter.id });
        return (result?.puppies || []).map((puppy) => ({ ...puppy, litter_id: litter.id, litter_name: litter.name || text(this, "litter") }));
      }));
      this._puppies = data.flat();
      this._loaded = true;
      if (this._expandedOwnerId && !this._owners.some((owner) => owner.id === this._expandedOwnerId)) this._expandedOwnerId = null;
    } catch (error) {
      this._error = error?.message || String(error);
    } finally {
      this._loading = false;
      this._render();
    }
  }

  async _save(form) {
    if (this._busy) return;
    const data = Object.fromEntries(new FormData(form).entries());
    if (this._editing) data.owner_id = this._editing;
    this._busy = true;
    this._error = "";
    try {
      await this._hass.callWS({ type: "puppy_tracker/owners/save", ...data });
      this._editing = null;
      this._showOwnerEditor = false;
      this._status = text(this, "saved");
      this._loaded = false;
      await this._load();
    } catch (error) {
      this._error = error?.message || String(error);
    } finally {
      this._busy = false;
      this._render();
    }
  }

  async _delete(id) {
    if (this._busy || !window.confirm(text(this, "confirmDelete"))) return;
    this._busy = true;
    this._error = "";
    try {
      await this._hass.callWS({ type: "puppy_tracker/owners/delete", owner_id: id });
      this._expandedOwnerId = null;
      this._status = text(this, "deleted");
      this._loaded = false;
      await this._load();
    } catch (error) {
      this._error = error?.message || String(error);
    } finally {
      this._busy = false;
      this._render();
    }
  }

  async _link() {
    if (this._busy) return;
    const puppy = this._puppies.find((item) => item.id === this._selectedPuppy);
    if (!puppy) return;
    const ownerIds = [...this.querySelectorAll("input[name=linked_owner]:checked")].map((input) => input.value);
    this._busy = true;
    this._error = "";
    try {
      await this._hass.callWS({ type: "puppy_tracker/owners/link", litter_id: puppy.litter_id, puppy_id: puppy.id, owner_ids: ownerIds });
      this._status = text(this, "linked");
      this._loaded = false;
      await this._load();
    } catch (error) {
      this._error = error?.message || String(error);
    } finally {
      this._busy = false;
      this._render();
    }
  }

  _linkedPuppies(ownerId) {
    return this._puppies.filter((puppy) => (puppy.owner_ids || []).includes(ownerId));
  }

  _openEditor(ownerId = null) {
    this._editing = ownerId;
    this._showOwnerEditor = true;
    this._status = "";
    this._error = "";
    this._render();
    queueMicrotask(() => this.querySelector('input[name="name"]')?.focus({ preventScroll: true }));
  }

  _detail(label, value, className = "") {
    return `<div class="${className}"><span>${escapeHtml(label)}</span><div>${escapeHtml(value ?? "—")}</div></div>`;
  }

  _ownerDetails(owner) {
    const linked = this._linkedPuppies(owner.id).map((puppy) => `${puppy.name || text(this, "puppy")} (${puppy.litter_name})`).join(", ") || text(this, "noLinkedPuppies");
    const history = (owner.status_history || []).map((entry) => `${optionLabel(this, entry.status, PLACEMENT_STATUS_LABELS, entry.status)} · ${formattedDate(this, entry.changed_at, true)}`).join("\n") || "—";
    return `<div class="owner-detail" id="owner-detail-${escapeHtml(owner.id)}">
      ${this._detail(text(this, "name"), owner.name)}
      ${this._detail(text(this, "role"), optionLabel(this, owner.role, OWNER_ROLE_LABELS, "owner"))}
      ${this._detail(text(this, "placementStatus"), optionLabel(this, owner.placement_status, PLACEMENT_STATUS_LABELS, "interested"))}
      ${this._detail(text(this, "placementDate"), formattedDate(this, owner.placement_date))}
      ${this._detail(text(this, "paymentStatus"), optionLabel(this, owner.payment_status, PAYMENT_STATUS_LABELS, "none"))}
      ${this._detail(text(this, "paymentAmount"), owner.payment_amount ?? "—")}
      ${this._detail(text(this, "paymentMethod"), optionLabel(this, owner.payment_method, PAYMENT_METHOD_LABELS, "none"))}
      ${this._detail(text(this, "paymentBalance"), owner.payment_balance ?? "—")}
      ${this._detail(text(this, "paymentDate"), formattedDate(this, owner.payment_date))}
      ${this._detail(text(this, "contactPreference"), optionLabel(this, owner.contact_preference, CONTACT_PREFERENCE_LABELS, "none"))}
      ${this._detail(text(this, "email"), owner.email || "—")}
      ${this._detail(text(this, "phone"), owner.phone || "—")}
      ${this._detail(text(this, "address"), owner.address || "—")}
      ${this._detail(text(this, "linkedPuppies"), linked, "wide")}
      ${this._detail(text(this, "statusHistory"), history, "wide preformatted")}
      ${this._detail(text(this, "notes"), owner.notes || "—", "wide notes preformatted")}
    </div>`;
  }

  _ownerList() {
    if (!this._owners.length) return `<div class="empty">${escapeHtml(text(this, this._loading ? "loading" : "empty"))}</div>`;
    return this._owners.map((owner) => {
      const expanded = owner.id === this._expandedOwnerId;
      const contact = [owner.email, owner.phone].filter(Boolean).join(" · ") || text(this, "noContact");
      return `<article class="owner" data-owner="${escapeHtml(owner.id)}">
        <button type="button" class="owner-toggle" data-toggle-owner="${escapeHtml(owner.id)}" aria-expanded="${expanded}" aria-controls="owner-detail-${escapeHtml(owner.id)}"><span><strong>${escapeHtml(owner.name)}</strong><small>${escapeHtml(contact)}</small></span><ha-icon icon="mdi:chevron-${expanded ? "up" : "down"}"></ha-icon></button>
        <div class="owner-actions"><button type="button" data-edit="${escapeHtml(owner.id)}" title="${escapeHtml(text(this, "edit"))}" aria-label="${escapeHtml(text(this, "edit"))}"><ha-icon icon="mdi:pencil-outline"></ha-icon></button><button type="button" data-delete="${escapeHtml(owner.id)}" title="${escapeHtml(text(this, "remove"))}" aria-label="${escapeHtml(text(this, "remove"))}"><ha-icon icon="mdi:delete-outline"></ha-icon></button></div>
        ${expanded ? this._ownerDetails(owner) : ""}
      </article>`;
    }).join("");
  }

  _ownerForm() {
    if (!this._showOwnerEditor) return `<button type="button" id="add-owner" class="primary add-owner"><ha-icon icon="mdi:plus"></ha-icon>${escapeHtml(text(this, "addOwner"))}</button>`;
    const owner = this._owners.find((item) => item.id === this._editing) || {};
    return `<section class="owner-editor"><h3>${escapeHtml(text(this, this._editing ? "editOwner" : "addOwner"))}</h3><form class="form">
      <label><span>${escapeHtml(text(this, "name"))}</span><input name="name" required autocomplete="name" value="${escapeHtml(owner.name || "")}"></label>
      <label><span>${escapeHtml(text(this, "email"))}</span><input name="email" type="email" autocomplete="email" value="${escapeHtml(owner.email || "")}"></label>
      <label><span>${escapeHtml(text(this, "phone"))}</span><input name="phone" autocomplete="tel" value="${escapeHtml(owner.phone || "")}"></label>
      <label><span>${escapeHtml(text(this, "address"))}</span><input name="address" autocomplete="street-address" value="${escapeHtml(owner.address || "")}"></label>
      ${selectField(this, "role", text(this, "role"), OWNER_ROLE_LABELS, owner.role || "owner")}
      ${selectField(this, "placement_status", text(this, "placementStatus"), PLACEMENT_STATUS_LABELS, owner.placement_status || "interested")}
      <label><span>${escapeHtml(text(this, "placementDate"))}</span><input name="placement_date" type="date" value="${escapeHtml(owner.placement_date || "")}"></label>
      ${selectField(this, "payment_status", text(this, "paymentStatus"), PAYMENT_STATUS_LABELS, owner.payment_status || "none")}
      <label><span>${escapeHtml(text(this, "paymentAmount"))}</span><input name="payment_amount" type="number" step="any" inputmode="decimal" value="${escapeHtml(owner.payment_amount ?? "")}"></label>
      <label><span>${escapeHtml(text(this, "paymentBalance"))}</span><input name="payment_balance" type="number" step="any" inputmode="decimal" value="${escapeHtml(owner.payment_balance ?? "")}"></label>
      ${selectField(this, "payment_method", text(this, "paymentMethod"), PAYMENT_METHOD_LABELS, owner.payment_method || "none")}
      <label><span>${escapeHtml(text(this, "paymentDate"))}</span><input name="payment_date" type="date" value="${escapeHtml(owner.payment_date || "")}"></label>
      ${selectField(this, "contact_preference", text(this, "contactPreference"), CONTACT_PREFERENCE_LABELS, owner.contact_preference || "none")}
      <label class="wide"><span>${escapeHtml(text(this, "notes"))}</span><textarea name="notes" rows="5">${escapeHtml(owner.notes || "")}</textarea></label>
      <div class="actions wide"><button type="button" class="secondary" id="cancel-owner">${escapeHtml(text(this, "cancel"))}</button><button type="submit" class="primary">${escapeHtml(text(this, this._editing ? "update" : "addOwner"))}</button></div>
    </form></section>`;
  }

  _linkSection(litterPuppies, puppy, linked, litterOptions, puppyOptions) {
    return `<section class="link"><h3>${escapeHtml(text(this, "linkTitle"))}</h3><div class="link-form"><label><span>${escapeHtml(text(this, "litter"))}</span><select id="link-litter">${litterOptions}</select></label><label><span>${escapeHtml(text(this, "puppy"))}</span><select id="link-puppy" ${litterPuppies.length ? "" : "disabled"}>${puppyOptions}</select></label><fieldset class="checks"><legend>${escapeHtml(text(this, "owners"))}</legend>${this._owners.map((owner) => `<label><input type="checkbox" name="linked_owner" value="${escapeHtml(owner.id)}" ${linked.has(owner.id) ? "checked" : ""}>${escapeHtml(owner.name)}</label>`).join("") || `<span class="empty">${escapeHtml(text(this, "empty"))}</span>`}</fieldset></div><div class="actions"><button type="button" id="link-save" class="primary" ${!puppy || this._busy ? "disabled" : ""}>${escapeHtml(text(this, "linkSave"))}</button></div></section>`;
  }

  _render() {
    if (!this._config) return;
    const litterPuppies = this._puppies.filter((item) => item.litter_id === this._selectedLitter);
    const puppy = litterPuppies.find((item) => item.id === this._selectedPuppy) || litterPuppies[0] || null;
    this._selectedPuppy = puppy?.id || "";
    const linked = new Set(puppy?.owner_ids || []);
    const litterOptions = this._litters.map((litter) => `<option value="${escapeHtml(litter.id)}" ${litter.id === this._selectedLitter ? "selected" : ""}>${escapeHtml(litter.name || text(this, "litter"))}</option>`).join("");
    const puppyOptions = litterPuppies.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === this._selectedPuppy ? "selected" : ""}>${escapeHtml(item.name || text(this, "puppy"))}</option>`).join("");

    this.innerHTML = `<ha-card><div class="head"><div><div class="title">${escapeHtml(this._config.title || text(this, "title"))}</div><div class="sub">${escapeHtml(text(this, "subtitle"))}</div></div>${this._showOwnerEditor ? "" : this._ownerForm()}</div>${this._showOwnerEditor ? this._ownerForm() : ""}<section class="list" aria-live="polite">${this._ownerList()}</section>${this._linkSection(litterPuppies, puppy, linked, litterOptions, puppyOptions)}${this._error ? `<div class="message error" role="alert">${escapeHtml(this._error)}</div>` : ""}${this._status ? `<div class="message" role="status">${escapeHtml(this._status)}</div>` : ""}</ha-card><style>
      :host{display:block}ha-card{padding:16px}.head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.title{font-size:1.25rem;font-weight:700}.sub{font-size:.85rem;color:var(--secondary-text-color);margin-top:3px}.primary,.secondary,.owner-actions button{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:40px;border:1px solid var(--primary-color);border-radius:8px;padding:0 12px;background:var(--primary-color);color:var(--text-primary-color,#fff);font:inherit;font-weight:600;cursor:pointer}.secondary,.owner-actions button{background:var(--secondary-background-color);border-color:var(--divider-color);color:var(--primary-text-color)}button:disabled{opacity:.55;cursor:default}.owner-editor,.link{margin-top:16px;padding-top:14px;border-top:1px solid var(--divider-color)}h3{margin:0 0 10px;font-size:1rem;letter-spacing:0}.form,.link-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.form label,.link-form label{display:grid;gap:4px;color:var(--secondary-text-color);font-size:.78rem}.form input,.form select,.form textarea,.link-form select{box-sizing:border-box;width:100%;min-height:42px;border:1px solid var(--divider-color);border-radius:8px;background:var(--card-background-color);color:var(--primary-text-color);padding:9px;font:inherit}.form textarea{min-height:112px;resize:vertical}.wide,.checks{grid-column:1/-1}.actions{display:flex;gap:8px;justify-content:flex-end;margin-top:10px}.list{display:grid;gap:8px;margin-top:16px}.owner{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;border-top:1px solid var(--divider-color);padding-top:9px}.owner-toggle{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0;border:0;background:transparent;color:var(--primary-text-color);padding:5px 2px;text-align:left;font:inherit;cursor:pointer}.owner-toggle span{min-width:0}.owner-toggle strong,.owner-toggle small{display:block;overflow-wrap:anywhere}.owner-toggle small{color:var(--secondary-text-color);margin-top:2px;font-size:.78rem}.owner-actions{display:flex;gap:5px}.owner-actions button{width:38px;padding:0}.owner-actions ha-icon{--mdc-icon-size:19px}.owner-detail{grid-column:1/-1;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;padding:12px;background:var(--secondary-background-color);border-radius:8px;font-size:.85rem}.owner-detail>div{min-width:0;overflow-wrap:anywhere}.owner-detail span{display:block;color:var(--secondary-text-color);font-size:.72rem;margin-bottom:3px}.owner-detail .wide{grid-column:1/-1}.owner-detail .preformatted>div{white-space:pre-wrap;word-break:break-word}.owner-detail .notes>div{max-height:none;overflow:visible}.checks{min-width:0;margin:2px 0 0;padding:10px;border:1px solid var(--divider-color);border-radius:8px;display:grid;gap:7px}.checks legend{padding:0 4px;color:var(--secondary-text-color);font-size:.78rem}.checks label{display:flex;align-items:center;gap:7px;color:var(--primary-text-color)}.empty,.message{color:var(--secondary-text-color);padding:10px 2px}.error{color:var(--error-color)}@media(max-width:520px){.head{display:grid}.add-owner{width:100%}.form,.link-form,.owner-detail{grid-template-columns:1fr}.wide,.checks,.owner-detail .wide{grid-column:auto}.owner{grid-template-columns:minmax(0,1fr) auto}.owner-actions{flex-direction:column}.actions{flex-wrap:wrap}.actions button{flex:1 1 auto}}
    </style>`;

    this.querySelector("form")?.addEventListener("submit", (event) => { event.preventDefault(); this._save(event.currentTarget); });
    this.querySelector("#add-owner")?.addEventListener("click", () => this._openEditor());
    this.querySelector("#cancel-owner")?.addEventListener("click", () => { this._editing = null; this._showOwnerEditor = false; this._error = ""; this._render(); });
    this.querySelectorAll("[data-toggle-owner]").forEach((button) => button.addEventListener("click", () => { this._expandedOwnerId = this._expandedOwnerId === button.dataset.toggleOwner ? null : button.dataset.toggleOwner; this._render(); }));
    this.querySelectorAll("[data-edit]").forEach((button) => button.addEventListener("click", () => this._openEditor(button.dataset.edit)));
    this.querySelectorAll("[data-delete]").forEach((button) => button.addEventListener("click", () => this._delete(button.dataset.delete)));
    this.querySelector("#link-litter")?.addEventListener("change", (event) => { this._selectedLitter = event.target.value; this._selectedPuppy = ""; this._render(); });
    this.querySelector("#link-puppy")?.addEventListener("change", (event) => { this._selectedPuppy = event.target.value; this._render(); });
    this.querySelector("#link-save")?.addEventListener("click", () => this._link());
  }
}

if (!customElements.get(TAG)) customElements.define(TAG, PuppyTrackerOwnerCard);
window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === TAG)) window.customCards.push({ type: TAG, name: "Puppy Tracker Owners", description: "Manage owner contacts and puppy links." });
