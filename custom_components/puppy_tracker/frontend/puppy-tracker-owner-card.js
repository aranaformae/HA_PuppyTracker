import { languageForHass } from "./puppy-tracker-card-common.js";

const ownerEscape = (value) => String(value || "").replace(/[&<>\"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char]));

function ownerLabel(card, value, labels, fallback) {
  const language = languageForHass(card?._hass);
  return labels[value]?.[language] || labels[value]?.nl || fallback || value || "—";
}

const OWNER_ROLE_LABELS = {
  owner: { nl: "Eigenaar", en: "Owner" },
  co_owner: { nl: "Mede-eigenaar", en: "Co-owner" },
  breeder: { nl: "Fokker", en: "Breeder" },
  veterinarian: { nl: "Dierenarts", en: "Veterinarian" },
  contact: { nl: "Contactpersoon", en: "Contact" },
};
const PLACEMENT_STATUS_LABELS = {
  interested: { nl: "Interesse", en: "Interested" },
  option: { nl: "Optie", en: "Option" },
  reserved: { nl: "Gereserveerd", en: "Reserved" },
  sold: { nl: "Verkocht", en: "Sold" },
  placed: { nl: "Geplaatst", en: "Placed" },
};
const PAYMENT_STATUS_LABELS = {
  none: { nl: "Geen", en: "None" },
  registration_fee: { nl: "Inschrijfgeld", en: "Registration fee" },
  deposit: { nl: "Aanbetaling", en: "Deposit" },
  full: { nl: "Volledig betaald", en: "Paid in full" },
};
const CONTACT_PREFERENCE_LABELS = {
  none: { nl: "Geen voorkeur", en: "No preference" }, email: { nl: "E-mail", en: "Email" },
  phone: { nl: "Telefoon", en: "Phone" }, whatsapp: { nl: "WhatsApp", en: "WhatsApp" },
};
const PAYMENT_METHOD_LABELS = {
  none: { nl: "Niet opgegeven", en: "Not specified" }, bank_transfer: { nl: "Bankoverschrijving", en: "Bank transfer" },
  cash: { nl: "Contant", en: "Cash" }, card: { nl: "Kaart", en: "Card" }, other: { nl: "Anders", en: "Other" },
};

class PuppyTrackerOwnerCard extends HTMLElement {
  setConfig(config) {
    this._config = { title: "Baasje beheren", ...config };
    this._owners = []; this._litters = []; this._puppies = [];
    this._selectedPuppy = ""; this._selectedLitter = ""; this._editing = null;
    this._expandedOwnerId = null; this._status = ""; this._loaded = false; this._loading = false;
    this._load();
  }

  set hass(value) { this._hass = value; if (this._config && !this._loaded && !this._loading) this._load(); }

  async _load(force = false) {
    if (!this._hass || this._loading || (this._loaded && !force)) return;
    this._loading = true;
    try {
      const [ownerResult, litterResult] = await Promise.all([
        this._hass.callWS({ type: "puppy_tracker/owners/list" }),
        this._hass.callWS({ type: "puppy_tracker/litters" }),
      ]);
      this._owners = ownerResult.owners || []; this._litters = litterResult.litters || [];
      if (!this._selectedLitter && this._litters[0]) this._selectedLitter = this._litters[0].id;
      const data = await Promise.all(this._litters.map(async (litter) => {
        const result = await this._hass.callWS({ type: "puppy_tracker/data", litter_id: litter.id });
        return (result.puppies || []).map((puppy) => ({ ...puppy, litter_name: litter.name || "Nest" }));
      }));
      this._puppies = data.flat(); this._loaded = true; this._render();
    } catch (error) { this._status = error.message; this._render(); }
    finally { this._loading = false; }
  }

  async _save(form) {
    const data = Object.fromEntries(new FormData(form).entries()); if (this._editing) data.owner_id = this._editing;
    try { await this._hass.callWS({ type: "puppy_tracker/owners/save", ...data }); this._editing = null; this._status = "Opgeslagen"; await this._load(true); }
    catch (error) { this._status = error.message; this._render(); }
  }

  async _delete(id) {
    if (!confirm("Dit baasje verwijderen?")) return;
    try { await this._hass.callWS({ type: "puppy_tracker/owners/delete", owner_id: id }); this._expandedOwnerId = null; await this._load(true); }
    catch (error) { this._status = error.message; this._render(); }
  }

  async _link() {
    const puppy = this._puppies.find((item) => item.id === this._selectedPuppy); if (!puppy) return;
    const owner_ids = [...this.querySelectorAll("input[name=linked_owner]:checked")].map((input) => input.value);
    try { await this._hass.callWS({ type: "puppy_tracker/owners/link", litter_id: this._selectedLitter, puppy_id: puppy.id, owner_ids }); this._status = "Koppeling opgeslagen"; await this._load(true); }
    catch (error) { this._status = error.message; this._render(); }
  }

  _linkedPuppies(ownerId) {
    return this._puppies.filter((puppy) => (puppy.owner_ids || []).includes(ownerId));
  }

  _render() {
    const selected = this._owners.find((owner) => owner.id === this._editing) || {};
    const puppy = this._puppies.find((item) => item.id === this._selectedPuppy) || this._puppies[0];
    if (!this._selectedPuppy && puppy) this._selectedPuppy = puppy.id;
    const linked = new Set(puppy?.owner_ids || []);
    const litterOptions = this._litters.map((litter) => `<option value="${ownerEscape(litter.id)}" ${litter.id === this._selectedLitter ? "selected" : ""}>${ownerEscape(litter.name || "Nest")}</option>`).join("");
    const puppyOptions = this._puppies.map((item) => `<option value="${ownerEscape(item.id)}" ${item.id === this._selectedPuppy ? "selected" : ""}>${ownerEscape(item.name || "Pup")}</option>`).join("");
    const owners = this._owners.map((owner) => {
      const expanded = owner.id === this._expandedOwnerId;
      const linkedPuppies = this._linkedPuppies(owner.id);
      const language = languageForHass(this._hass);
      const label = (nl, en) => language === "en" ? en : nl;
      const history = owner.status_history?.map((entry) => `${ownerLabel(this, entry.status, PLACEMENT_STATUS_LABELS, entry.status)} · ${entry.changed_at}`).join("\n") || "—";
      const detail = expanded ? `<div class="owner-detail"><div><span>${label("Naam", "Name")}</span>${ownerEscape(owner.name)}</div><div><span>${label("Rol", "Role")}</span>${ownerEscape(ownerLabel(this, owner.role, OWNER_ROLE_LABELS, "owner"))}</div><div><span>${label("Plaatsingsstatus", "Placement status")}</span>${ownerEscape(ownerLabel(this, owner.placement_status, PLACEMENT_STATUS_LABELS, "interested"))}</div><div><span>${label("Geplaatst op", "Placed on")}</span>${ownerEscape(owner.placement_date || "—")}</div><div><span>${label("Betaling", "Payment")}</span>${ownerEscape(ownerLabel(this, owner.payment_status, PAYMENT_STATUS_LABELS, "none"))}</div><div><span>${label("Bedrag", "Amount")}</span>${ownerEscape(owner.payment_amount || "—")}</div><div><span>${label("Betaalmethode", "Payment method")}</span>${ownerEscape(ownerLabel(this, owner.payment_method, PAYMENT_METHOD_LABELS, "none"))}</div><div><span>${label("Openstaand", "Balance")}</span>${ownerEscape(owner.payment_balance || "—")}</div><div><span>${label("Betaald op", "Paid on")}</span>${ownerEscape(owner.payment_date || "—")}</div><div><span>${label("Voorkeurscontact", "Preferred contact")}</span>${ownerEscape(ownerLabel(this, owner.contact_preference, CONTACT_PREFERENCE_LABELS, "none"))}</div><div><span>E-mail</span>${ownerEscape(owner.email || "—")}</div><div><span>${label("Telefoon", "Phone")}</span>${ownerEscape(owner.phone || "—")}</div><div><span>${label("Adres", "Address")}</span>${ownerEscape(owner.address || "—")}</div><div class="owner-puppies"><span>${label("Gekoppelde pups", "Linked puppies")}</span>${ownerEscape(linkedPuppies.map((puppy) => `${puppy.name || "Pup"} (${puppy.litter_name})`).join(", ") || label("Geen gekoppelde pups", "No linked puppies"))}</div><div><span>${label("Statusgeschiedenis", "Status history")}</span>${ownerEscape(history)}</div><div><span>${label("Notities", "Notes")}</span>${ownerEscape(owner.notes || "—")}</div></div>` : "";
      return `<div class="owner" data-owner="${ownerEscape(owner.id)}" role="button" tabindex="0" aria-expanded="${expanded}"><div><strong>${ownerEscape(owner.name)}</strong><small>${ownerEscape([owner.email, owner.phone].filter(Boolean).join(" · ") || "Geen contactgegevens")}</small></div><div class="owner-actions"><button data-edit="${ownerEscape(owner.id)}" title="Bewerken">✎</button><button data-delete="${ownerEscape(owner.id)}" title="Verwijderen">×</button></div>${detail}</div>`;
    }).join("");
    this.innerHTML = `<ha-card><style>ha-card{padding:16px}.title{font-size:18px;font-weight:600;margin-bottom:4px}.sub{font-size:12px;color:var(--secondary-text-color);margin-bottom:12px}.form,.link-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.form label{display:grid;gap:4px;font-size:12px;color:var(--secondary-text-color)}.form input,.form textarea,.link-form select{box-sizing:border-box;width:100%;min-height:42px;border:1px solid var(--divider-color);border-radius:9px;background:var(--card-background-color);color:var(--primary-text-color);padding:9px;font:inherit}.form textarea{min-height:70px;grid-column:1/-1}.actions{display:flex;gap:8px;margin-top:10px}.actions button{min-height:40px;border:0;border-radius:9px;padding:0 13px;cursor:pointer;background:var(--primary-color);color:var(--text-primary-color,#fff);font-weight:600}.actions .secondary{background:var(--secondary-background-color);color:var(--primary-text-color);border:1px solid var(--divider-color)}.list{display:grid;gap:7px;margin-top:16px}.owner{display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;align-items:center;border-top:1px solid var(--divider-color);padding-top:9px;cursor:pointer}.owner small{display:block;color:var(--secondary-text-color);margin-top:2px}.owner-actions{display:flex;gap:5px}.owner-actions button{border:1px solid var(--divider-color);background:var(--secondary-background-color);color:var(--primary-text-color);border-radius:8px;padding:7px;cursor:pointer}.owner-detail{flex:1 0 100%;background:var(--secondary-background-color);border-radius:8px;padding:10px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;font-size:13px}.owner-detail span{display:block;color:var(--secondary-text-color);font-size:11px;margin-bottom:2px}.status{font-size:12px;color:var(--secondary-text-color);margin-top:8px}.link{border-top:1px solid var(--divider-color);margin-top:16px;padding-top:12px}.checks{grid-column:1/-1;display:grid;gap:6px}.checks label{display:flex;gap:7px;align-items:center}@media(max-width:430px){.form,.link-form,.owner-detail{grid-template-columns:1fr}.form textarea,.checks{grid-column:auto}.owner{align-items:flex-start}.owner-actions{flex-direction:column}}</style><div class="title">${ownerEscape(this._config.title)}</div><div class="sub">Contactpersonen voor koppeling aan een pup</div><form class="form"><input name="name" required placeholder="Naam" value="${ownerEscape(selected.name)}"><input name="email" type="email" placeholder="E-mail" value="${ownerEscape(selected.email)}"><input name="phone" placeholder="Telefoon" value="${ownerEscape(selected.phone)}"><input name="address" placeholder="Adres" value="${ownerEscape(selected.address)}"><textarea name="notes" placeholder="Notities">${ownerEscape(selected.notes)}</textarea><div class="actions"><button type="submit">${this._editing ? "Bijwerken" : "Baasje toevoegen"}</button>${this._editing ? '<button type="button" class="secondary" id="cancel">Annuleren</button>' : ""}</div></form><div class="link"><strong>Baasje koppelen aan pup</strong><div class="link-form"><select id="link-litter">${litterOptions}</select><select id="link-puppy">${puppyOptions}</select><div class="checks">${this._owners.map((owner) => `<label><input type="checkbox" name="linked_owner" value="${ownerEscape(owner.id)}" ${linked.has(owner.id) ? "checked" : ""}>${ownerEscape(owner.name)}</label>`).join("")}</div></div><div class="actions"><button type="button" id="link-save">Koppeling opslaan</button></div></div><div class="list">${owners}</div><div class="status">${ownerEscape(this._status)}</div></ha-card>`;
    const card = this.querySelector("ha-card");
    const detailStyle = document.createElement("style");
    detailStyle.textContent = ".owner-detail > div:nth-last-child(-n+3) { grid-column: 1 / -1; overflow-wrap: anywhere; white-space: pre-wrap; word-break: break-word; }";
    card.appendChild(detailStyle);
    card.style.display = "flex";
    card.style.flexDirection = "column";
    this.querySelector(".list").style.order = "2";
    this.querySelector(".link").style.order = "3";
    this.querySelector(".status").style.order = "4";
    const form = this.querySelector("form");
    const addSelect = (name, label, options, value) => {
      const wrapper = document.createElement("label"); wrapper.textContent = label;
      const select = document.createElement("select");
      select.name = name;
      select.setAttribute("aria-label", label);
      options.forEach(([optionValue, optionLabel]) => { const option = new Option(optionLabel, optionValue); option.selected = optionValue === value; select.add(option); });
      wrapper.appendChild(select); form.insertBefore(wrapper, form.querySelector("textarea"));
    };
    addSelect("role", "Rol", [["owner", "Eigenaar"], ["co_owner", "Mede-eigenaar"], ["breeder", "Fokker"], ["veterinarian", "Dierenarts"], ["contact", "Contactpersoon"]], selected.role || "owner");
    addSelect("placement_status", "Plaatsingsstatus", [["interested", "Interesse"], ["option", "Optie"], ["reserved", "Gereserveerd"], ["sold", "Verkocht"], ["placed", "Geplaatst"]], selected.placement_status || "interested");
    addSelect("payment_status", "Betalingsstatus", [["none", "Geen"], ["registration_fee", "Inschrijfgeld"], ["deposit", "Aanbetaling"], ["full", "Volledig"]], selected.payment_status || "none");
    addSelect("contact_preference", "Voorkeurscontact", [["none", "Geen voorkeur"], ["email", "E-mail"], ["phone", "Telefoon"], ["whatsapp", "WhatsApp"]], selected.contact_preference || "none");
    addSelect("payment_method", "Betaalmethode", [["none", "Niet opgegeven"], ["bank_transfer", "Bankoverschrijving"], ["cash", "Contant"], ["card", "Kaart"], ["other", "Anders"]], selected.payment_method || "none");
    const addInputField = (name, label, type, value) => {
      const wrapper = document.createElement("label"); wrapper.textContent = label;
      const input = document.createElement("input"); input.name = name; input.type = type; input.value = value || "";
      wrapper.appendChild(input); form.insertBefore(wrapper, form.querySelector("textarea"));
    };
    addInputField("payment_amount", "Totaalbedrag", "number", selected.payment_amount);
    addInputField("payment_balance", "Openstaand bedrag", "number", selected.payment_balance);
    const addDateField = (name, label, value) => {
      const wrapper = document.createElement("label");
      wrapper.textContent = label;
      const input = document.createElement("input");
      input.type = "date";
      input.name = name;
      input.value = value || "";
      input.setAttribute("aria-label", label);
      wrapper.appendChild(input);
      form.insertBefore(wrapper, form.querySelector("textarea"));
    };
    addDateField("placement_date", "Plaatsingsdatum", selected.placement_date);
    addDateField("payment_date", "Betaaldatum", selected.payment_date);
    this.querySelector("form").addEventListener("submit", (event) => { event.preventDefault(); this._save(event.currentTarget); });
    this.querySelector("#cancel")?.addEventListener("click", () => { this._editing = null; this._status = ""; this._render(); });
    this.querySelectorAll("[data-owner]").forEach((row) => row.addEventListener("click", () => { this._expandedOwnerId = this._expandedOwnerId === row.dataset.owner ? null : row.dataset.owner; this._render(); }));
    this.querySelectorAll("[data-owner]").forEach((row) => row.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); row.click(); } }));
    this.querySelectorAll("[data-edit]").forEach((button) => button.addEventListener("click", (event) => { event.stopPropagation(); this._editing = button.dataset.edit; this._render(); }));
    this.querySelectorAll("[data-delete]").forEach((button) => button.addEventListener("click", (event) => { event.stopPropagation(); this._delete(button.dataset.delete); }));
    this.querySelector("#link-litter")?.addEventListener("change", async (event) => { this._selectedLitter = event.target.value; this._selectedPuppy = ""; await this._load(true); });
    this.querySelector("#link-puppy")?.addEventListener("change", (event) => { this._selectedPuppy = event.target.value; this._render(); });
    this.querySelector("#link-save")?.addEventListener("click", () => this._link());
  }
}

if (!customElements.get("puppy-tracker-owner-card")) customElements.define("puppy-tracker-owner-card", PuppyTrackerOwnerCard);
window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === "puppy-tracker-owner-card")) window.customCards.push({ type: "puppy-tracker-owner-card", name: "Puppy Tracker Owners", description: "Beheer baasjes en contactpersonen." });
