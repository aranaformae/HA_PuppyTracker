import { downloadExportFile, escapeHtml, languageForHass } from "./puppy-tracker-card-common.js";

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
const SEX_LABELS = {
  male: { nl: "Reu", en: "Male" },
  female: { nl: "Teef", en: "Female" },
};

const COPY = {
  nl: {
    title: "Baasjes beheren",
    subtitle: "Contactpersonen die later aan een pup gekoppeld kunnen worden.",
    addOwner: "Baasje toevoegen",
    editOwner: "Baasje wijzigen",
    update: "Wijzigingen opslaan",
    cancel: "Annuleren",
    contactDetails: "Contactgegevens",
    placementDetails: "Plaatsing",
    puppyPreferences: "Top 3 pupvoorkeuren",
    preference1: "1e voorkeur",
    preference2: "2e voorkeur",
    preference3: "3e voorkeur",
    preferenceNote: "Korte notitie",
    preference1Puppy: "Pup 1e voorkeur",
    preference1Note: "Notitie 1e voorkeur",
    preference2Puppy: "Pup 2e voorkeur",
    preference2Note: "Notitie 2e voorkeur",
    preference3Puppy: "Pup 3e voorkeur",
    preference3Note: "Notitie 3e voorkeur",
    noPuppyPreference: "Geen pup gekozen",
    noPuppyPreferences: "Geen pupvoorkeuren vastgelegd",
    unavailablePuppy: "Niet meer beschikbare pup",
    selectPuppyForNote: "Kies eerst een pup voor deze notitie.",
    duplicatePuppyPreference: "Kies elke pup maximaal één keer.",
    fillEarlierPreference: "Vul eerst de voorgaande pupvoorkeur in.",
    paymentDetails: "Betalingen",
    name: "Naam",
    email: "E-mail",
    phone: "Telefoon",
    street: "Straat en huisnummer",
    postalCode: "Postcode",
    city: "Plaats",
    role: "Rol",
    placementStatus: "Plaatsingsstatus",
    placementDate: "Plaatsingsdatum",
    expectedPickupDate: "Verwachte ophaaldatum",
    paymentStatus: "Betalingsstatus",
    paymentAmount: "Totaalbedrag",
    registrationFeeAmount: "Inschrijfgeld",
    depositAmount: "Bedrag aanbetaling",
    depositDate: "Datum aanbetaling",
    finalPaymentAmount: "Slotbetaling (berekend)",
    paymentBalance: "Werkelijk openstaand bedrag",
    paymentMethod: "Betaalmethode",
    paymentDate: "Datum slotbetaling",
    contactPreference: "Voorkeurscontact",
    notes: "Notities",
    owners: "Baasjes",
    linkedPuppies: "Gekoppelde pups",
    noLinkedPuppies: "Geen gekoppelde pups",
    statusHistory: "Statusgeschiedenis",
    noContact: "Geen contactgegevens",
    linkTitle: "Baasje koppelen aan pup",
    linkSave: "Koppeling opslaan",
    litter: "Nest",
    puppy: "Pup",
    puppyRegisteredName: "Nestnaam pup",
    puppyCallName: "Roepnaam pup",
    puppyBirthDate: "Geboortedatum pup",
    puppySex: "Geslacht pup",
    puppyCoatColor: "Vachtkleur pup",
    puppyCollarColor: "Halsbandkleur pup",
    puppyBreed: "Soort pup",
    fatherRegisteredName: "Naam vader",
    fatherCallName: "Roepnaam vader",
    fatherBirthDate: "Geboortedatum vader",
    fatherBreed: "Soort vader",
    fatherWala: "WALA vader",
    motherRegisteredName: "Naam moeder",
    motherCallName: "Roepnaam moeder",
    motherBirthDate: "Geboortedatum moeder",
    motherBreed: "Soort moeder",
    motherWala: "WALA moeder",
    chipNumber: "Chipnummer pup",
    saved: "Baasje opgeslagen.",
    linked: "Koppeling opgeslagen.",
    deleted: "Baasje verwijderd.",
    confirmDelete: "Dit baasje verwijderen?",
    edit: "Bewerken",
    remove: "Verwijderen",
    loading: "Baasjes laden…",
    empty: "Nog geen baasjes toegevoegd.",
    unknown: "Niet opgegeven",
    exportCsv: "CSV exporteren",
    csvDone: "Baasjes-CSV gedownload.",
    csvComma: "Komma (,) - Nextcloud",
    csvSemicolon: "Puntkomma (;) - Excel NL",
  },
  en: {
    title: "Manage owners",
    subtitle: "Contacts that can be linked to a puppy later.",
    addOwner: "Add owner",
    editOwner: "Edit owner",
    update: "Save changes",
    cancel: "Cancel",
    contactDetails: "Contact details",
    placementDetails: "Placement",
    puppyPreferences: "Top 3 puppy preferences",
    preference1: "1st preference",
    preference2: "2nd preference",
    preference3: "3rd preference",
    preferenceNote: "Short note",
    preference1Puppy: "1st preference puppy",
    preference1Note: "1st preference note",
    preference2Puppy: "2nd preference puppy",
    preference2Note: "2nd preference note",
    preference3Puppy: "3rd preference puppy",
    preference3Note: "3rd preference note",
    noPuppyPreference: "No puppy selected",
    noPuppyPreferences: "No puppy preferences recorded",
    unavailablePuppy: "Puppy no longer available",
    selectPuppyForNote: "Select a puppy before adding a note.",
    duplicatePuppyPreference: "Select each puppy no more than once.",
    fillEarlierPreference: "Fill the previous puppy preference first.",
    paymentDetails: "Payments",
    name: "Name",
    email: "Email",
    phone: "Phone",
    street: "Street and house number",
    postalCode: "Postal code",
    city: "City",
    role: "Role",
    placementStatus: "Placement status",
    placementDate: "Placement date",
    expectedPickupDate: "Expected pickup date",
    paymentStatus: "Payment status",
    paymentAmount: "Total amount",
    registrationFeeAmount: "Registration fee",
    depositAmount: "Deposit amount",
    depositDate: "Deposit date",
    finalPaymentAmount: "Final payment (calculated)",
    paymentBalance: "Actual outstanding amount",
    paymentMethod: "Payment method",
    paymentDate: "Final payment date",
    contactPreference: "Preferred contact",
    notes: "Notes",
    owners: "Owners",
    linkedPuppies: "Linked puppies",
    noLinkedPuppies: "No linked puppies",
    statusHistory: "Status history",
    noContact: "No contact details",
    linkTitle: "Link owner to puppy",
    linkSave: "Save link",
    litter: "Litter",
    puppy: "Puppy",
    puppyRegisteredName: "Puppy registered name",
    puppyCallName: "Puppy call name",
    puppyBirthDate: "Puppy birth date",
    puppySex: "Puppy sex",
    puppyCoatColor: "Puppy coat color",
    puppyCollarColor: "Puppy collar color",
    puppyBreed: "Puppy breed / type",
    fatherRegisteredName: "Father registered name",
    fatherCallName: "Father call name",
    fatherBirthDate: "Father birth date",
    fatherBreed: "Father breed / type",
    fatherWala: "Father WALA",
    motherRegisteredName: "Mother registered name",
    motherCallName: "Mother call name",
    motherBirthDate: "Mother birth date",
    motherBreed: "Mother breed / type",
    motherWala: "Mother WALA",
    chipNumber: "Puppy microchip number",
    saved: "Owner saved.",
    linked: "Link saved.",
    deleted: "Owner deleted.",
    confirmDelete: "Delete this owner?",
    edit: "Edit",
    remove: "Delete",
    loading: "Loading owners…",
    empty: "No owners added yet.",
    unknown: "Not specified",
    exportCsv: "Export CSV",
    csvDone: "Owner CSV downloaded.",
    csvComma: "Comma (,) - Nextcloud",
    csvSemicolon: "Semicolon (;) - Excel NL",
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

function csvCell(value) {
  return `"${String(value ?? "").replace(/\r\n?/g, "\n").replaceAll('"', '""')}"`;
}

function configuredCsvDelimiter(config) {
  return config?.csv_delimiter === "semicolon" || config?.csv_delimiter === ";" ? ";" : ",";
}

function dateOnly(value, fallback = "") {
  const selected = String(value || fallback || "");
  return /^\d{4}-\d{2}-\d{2}/.test(selected) ? selected.slice(0, 10) : selected;
}

function numericAmount(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const parsed = Number(String(value).trim().replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function finalPaymentAmount(values) {
  const total = numericAmount(values?.payment_amount);
  if (total === null) return "";
  const registrationFee = numericAmount(values?.registration_fee_amount) ?? 0;
  const deposit = numericAmount(values?.deposit_amount) ?? 0;
  const result = Math.round((total - registrationFee - deposit + Number.EPSILON) * 100) / 100;
  if (result < 0) return "";
  return result.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

function csvFilename() {
  const stamp = new Date().toISOString().replaceAll("-", "").replaceAll(":", "").slice(0, 15);
  return `puppy-tracker-owners-${stamp}Z.csv`;
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

  static getStubConfig() { return { title: "", csv_delimiter: "comma" }; }
  static getConfigForm() {
    const configCard = { _hass: document.querySelector("home-assistant")?.hass || null };
    return { schema: [
      { name: "title", selector: { text: {} } },
      { name: "csv_delimiter", selector: { select: { mode: "dropdown", options: [
        { value: "comma", label: text(configCard, "csvComma") },
        { value: "semicolon", label: text(configCard, "csvSemicolon") },
      ] } } },
    ] };
  }

  setConfig(config) {
    this._config = { ...PuppyTrackerOwnerCard.getStubConfig(), ...config };
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
        const litterDetails = result?.litter || litter;
        return (result?.puppies || []).map((puppy) => ({
          ...puppy,
          litter_id: litter.id,
          litter_name: litterDetails.name || text(this, "litter"),
          litter_birth_date: litterDetails.birth_date,
          mother: litterDetails.mother,
          mother_details: litterDetails.mother_details || {},
          father: litterDetails.father,
          father_details: litterDetails.father_details || {},
        }));
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
    const puppyPreferences = [];
    const selectedPuppies = new Set();
    let hasEmptyEarlierPreference = false;
    for (let rank = 1; rank <= 3; rank += 1) {
      const puppyField = `preference_puppy_${rank}`;
      const noteField = `preference_note_${rank}`;
      const puppyId = String(data[puppyField] || "").trim();
      const note = String(data[noteField] || "").trim();
      const select = form.querySelector(`[name="${puppyField}"]`);
      select?.setCustomValidity("");
      delete data[puppyField];
      delete data[noteField];
      if (!puppyId) {
        hasEmptyEarlierPreference = true;
        if (note) {
          select?.setCustomValidity(text(this, "selectPuppyForNote"));
          select?.reportValidity();
          return;
        }
        continue;
      }
      if (hasEmptyEarlierPreference) {
        select?.setCustomValidity(text(this, "fillEarlierPreference"));
        select?.reportValidity();
        return;
      }
      if (selectedPuppies.has(puppyId)) {
        select?.setCustomValidity(text(this, "duplicatePuppyPreference"));
        select?.reportValidity();
        return;
      }
      puppyPreferences.push({ puppy_id: puppyId, note: note || null });
      selectedPuppies.add(puppyId);
    }
    data.puppy_preferences = puppyPreferences;
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

  _puppyPreferenceLabel(puppyId) {
    const puppy = this._puppies.find((item) => item.id === puppyId);
    if (!puppy) return text(this, "unavailablePuppy");
    return [puppy.litter_name, puppy.name || text(this, "puppy")].filter(Boolean).join(" · ");
  }

  _puppyPreferenceOptions(selectedId) {
    const puppies = [...this._puppies].sort((left, right) =>
      `${left.litter_name || ""}\u0000${left.name || ""}`.localeCompare(`${right.litter_name || ""}\u0000${right.name || ""}`),
    );
    const options = puppies.map((puppy) => `<option value="${escapeHtml(puppy.id)}" ${puppy.id === selectedId ? "selected" : ""}>${escapeHtml(this._puppyPreferenceLabel(puppy.id))}</option>`);
    if (selectedId && !puppies.some((puppy) => puppy.id === selectedId)) {
      options.unshift(`<option value="${escapeHtml(selectedId)}" selected>${escapeHtml(text(this, "unavailablePuppy"))}</option>`);
    }
    options.unshift(`<option value="">${escapeHtml(text(this, "noPuppyPreference"))}</option>`);
    return options.join("");
  }

  _puppyPreferenceFields(owner) {
    const preferences = Array.isArray(owner.puppy_preferences) ? owner.puppy_preferences.slice(0, 3) : [];
    return `<div class="preferences wide">${[0, 1, 2].map((index) => {
      const preference = preferences[index] || {};
      const rank = index + 1;
      return `<fieldset class="preference-row"><legend>${escapeHtml(text(this, `preference${rank}`))}</legend><label><span>${escapeHtml(text(this, "puppy"))}</span><select name="preference_puppy_${rank}">${this._puppyPreferenceOptions(preference.puppy_id || "")}</select></label><label><span>${escapeHtml(text(this, "preferenceNote"))}</span><input name="preference_note_${rank}" maxlength="240" value="${escapeHtml(preference.note || "")}"></label></fieldset>`;
    }).join("")}</div>`;
  }

  _puppyPreferenceDetails(owner) {
    const preferences = Array.isArray(owner.puppy_preferences) ? owner.puppy_preferences.slice(0, 3) : [];
    if (!preferences.length) {
      return this._detail(text(this, "puppyPreferences"), text(this, "noPuppyPreferences"), "wide");
    }
    return preferences.map((preference, index) => {
      const note = preference.note ? `\n${text(this, "preferenceNote")}: ${preference.note}` : "";
      return this._detail(text(this, `preference${index + 1}`), `${this._puppyPreferenceLabel(preference.puppy_id)}${note}`, "wide preformatted");
    }).join("");
  }

  _ownerCsvContent() {
    const headers = [
      "name", "email", "phone", "street", "postalCode", "city", "role", "contactPreference",
      "placementStatus", "placementDate", "expectedPickupDate",
      "preference1Puppy", "preference1Note", "preference2Puppy", "preference2Note",
      "preference3Puppy", "preference3Note", "paymentStatus",
      "paymentAmount", "registrationFeeAmount", "depositAmount", "depositDate",
      "finalPaymentAmount", "paymentBalance", "paymentMethod", "paymentDate",
      "notes", "statusHistory", "litter", "puppyRegisteredName", "puppyCallName",
      "puppyBirthDate", "puppySex", "puppyCoatColor", "puppyCollarColor",
      "chipNumber", "puppyBreed", "fatherRegisteredName", "fatherCallName",
      "fatherBirthDate", "fatherBreed", "fatherWala", "motherRegisteredName",
      "motherCallName", "motherBirthDate", "motherBreed", "motherWala",
    ].map((key) => text(this, key));
    const rows = [headers];
    for (const owner of this._owners) {
      const history = (owner.status_history || []).map((entry) => {
        const status = optionLabel(this, entry.status, PLACEMENT_STATUS_LABELS, entry.status);
        return `${status} · ${formattedDate(this, entry.changed_at, true)}`;
      }).join(" | ");
      const puppyPreferences = Array.isArray(owner.puppy_preferences) ? owner.puppy_preferences.slice(0, 3) : [];
      const preferenceValues = [0, 1, 2].flatMap((index) => {
        const preference = puppyPreferences[index];
        return preference ? [this._puppyPreferenceLabel(preference.puppy_id), preference.note] : ["", ""];
      });
      const ownerValues = [
        owner.name,
        owner.email,
        owner.phone,
        owner.street || owner.address,
        owner.postal_code,
        owner.city,
        optionLabel(this, owner.role, OWNER_ROLE_LABELS, "owner"),
        optionLabel(this, owner.contact_preference, CONTACT_PREFERENCE_LABELS, "none"),
        optionLabel(this, owner.placement_status, PLACEMENT_STATUS_LABELS, "interested"),
        owner.placement_date,
        owner.expected_pickup_date,
        ...preferenceValues,
        optionLabel(this, owner.payment_status, PAYMENT_STATUS_LABELS, "none"),
        owner.payment_amount,
        owner.registration_fee_amount,
        owner.deposit_amount,
        owner.deposit_date,
        finalPaymentAmount(owner),
        owner.payment_balance,
        optionLabel(this, owner.payment_method, PAYMENT_METHOD_LABELS, "none"),
        owner.payment_date,
        owner.notes,
        history,
      ];
      const linkedPuppies = this._linkedPuppies(owner.id).sort((left, right) =>
        `${left.litter_name || ""}\u0000${left.name || ""}`.localeCompare(`${right.litter_name || ""}\u0000${right.name || ""}`),
      );
      for (const puppy of linkedPuppies.length ? linkedPuppies : [null]) {
        rows.push([
          ...ownerValues,
          puppy?.litter_name,
          puppy?.registered_name,
          puppy?.name,
          puppy ? dateOnly(puppy.birth_time, puppy.litter_birth_date) : "",
          puppy ? optionLabel(this, puppy.sex, SEX_LABELS, puppy.sex) : "",
          puppy?.coat_color,
          puppy?.collar_color,
          puppy?.chip_number,
          puppy?.breed,
          puppy?.father_details?.registered_name,
          puppy?.father,
          puppy?.father_details?.birth_date,
          puppy?.father_details?.breed,
          puppy?.father_details?.wala_number,
          puppy?.mother_details?.registered_name,
          puppy?.mother,
          puppy?.mother_details?.birth_date,
          puppy?.mother_details?.breed,
          puppy?.mother_details?.wala_number,
        ]);
      }
    }
    const delimiter = configuredCsvDelimiter(this._config);
    return `\ufeff${rows.map((row) => row.map(csvCell).join(delimiter)).join("\r\n")}\r\n`;
  }

  _downloadOwnersCsv() {
    if (!this._owners.length) return;
    downloadExportFile({
      content: this._ownerCsvContent(),
      filename: csvFilename(),
      mime_type: "text/csv;charset=utf-8",
    });
    this._status = text(this, "csvDone");
    this._error = "";
    const status = this.querySelector("#owner-status");
    const error = this.querySelector("#owner-error");
    if (status) status.textContent = this._status;
    if (error) error.textContent = "";
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
      ${this._detail(text(this, "expectedPickupDate"), formattedDate(this, owner.expected_pickup_date))}
      ${this._detail(text(this, "paymentStatus"), optionLabel(this, owner.payment_status, PAYMENT_STATUS_LABELS, "none"))}
      ${this._detail(text(this, "paymentAmount"), owner.payment_amount ?? "—")}
      ${this._detail(text(this, "registrationFeeAmount"), owner.registration_fee_amount ?? "—")}
      ${this._detail(text(this, "depositAmount"), owner.deposit_amount ?? "—")}
      ${this._detail(text(this, "depositDate"), formattedDate(this, owner.deposit_date))}
      ${this._detail(text(this, "finalPaymentAmount"), finalPaymentAmount(owner) || "—")}
      ${this._detail(text(this, "paymentMethod"), optionLabel(this, owner.payment_method, PAYMENT_METHOD_LABELS, "none"))}
      ${this._detail(text(this, "paymentBalance"), owner.payment_balance ?? "—")}
      ${this._detail(text(this, "paymentDate"), formattedDate(this, owner.payment_date))}
      ${this._detail(text(this, "contactPreference"), optionLabel(this, owner.contact_preference, CONTACT_PREFERENCE_LABELS, "none"))}
      ${this._detail(text(this, "email"), owner.email || "—")}
      ${this._detail(text(this, "phone"), owner.phone || "—")}
      ${this._detail(text(this, "street"), owner.street || owner.address || "—")}
      ${this._detail(text(this, "postalCode"), owner.postal_code || "—")}
      ${this._detail(text(this, "city"), owner.city || "—")}
      ${this._detail(text(this, "linkedPuppies"), linked, "wide")}
      ${this._puppyPreferenceDetails(owner)}
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
      <h4 class="form-heading">${escapeHtml(text(this, "contactDetails"))}</h4>
      <label><span>${escapeHtml(text(this, "name"))}</span><input name="name" required autocomplete="name" value="${escapeHtml(owner.name || "")}"></label>
      <label><span>${escapeHtml(text(this, "email"))}</span><input name="email" type="email" autocomplete="email" value="${escapeHtml(owner.email || "")}"></label>
      <label><span>${escapeHtml(text(this, "phone"))}</span><input name="phone" autocomplete="tel" value="${escapeHtml(owner.phone || "")}"></label>
      <label><span>${escapeHtml(text(this, "street"))}</span><input name="street" autocomplete="street-address" value="${escapeHtml(owner.street || owner.address || "")}"></label>
      <label><span>${escapeHtml(text(this, "postalCode"))}</span><input name="postal_code" autocomplete="postal-code" value="${escapeHtml(owner.postal_code || "")}"></label>
      <label><span>${escapeHtml(text(this, "city"))}</span><input name="city" autocomplete="address-level2" value="${escapeHtml(owner.city || "")}"></label>
      ${selectField(this, "role", text(this, "role"), OWNER_ROLE_LABELS, owner.role || "owner")}
      ${selectField(this, "contact_preference", text(this, "contactPreference"), CONTACT_PREFERENCE_LABELS, owner.contact_preference || "none")}
      <h4 class="form-heading">${escapeHtml(text(this, "placementDetails"))}</h4>
      ${selectField(this, "placement_status", text(this, "placementStatus"), PLACEMENT_STATUS_LABELS, owner.placement_status || "interested")}
      <label><span>${escapeHtml(text(this, "placementDate"))}</span><input name="placement_date" type="date" value="${escapeHtml(owner.placement_date || "")}"></label>
      <label><span>${escapeHtml(text(this, "expectedPickupDate"))}</span><input name="expected_pickup_date" type="date" value="${escapeHtml(owner.expected_pickup_date || "")}"></label>
      <h4 class="form-heading">${escapeHtml(text(this, "puppyPreferences"))}</h4>
      ${this._puppyPreferenceFields(owner)}
      <h4 class="form-heading">${escapeHtml(text(this, "paymentDetails"))}</h4>
      ${selectField(this, "payment_status", text(this, "paymentStatus"), PAYMENT_STATUS_LABELS, owner.payment_status || "none")}
      <label><span>${escapeHtml(text(this, "paymentAmount"))}</span><input name="payment_amount" type="number" min="0" step="0.01" inputmode="decimal" value="${escapeHtml(owner.payment_amount ?? "")}"></label>
      <label><span>${escapeHtml(text(this, "registrationFeeAmount"))}</span><input name="registration_fee_amount" type="number" min="0" step="0.01" inputmode="decimal" value="${escapeHtml(owner.registration_fee_amount ?? "")}"></label>
      <label><span>${escapeHtml(text(this, "depositAmount"))}</span><input name="deposit_amount" type="number" min="0" step="0.01" inputmode="decimal" value="${escapeHtml(owner.deposit_amount ?? "")}"></label>
      <label><span>${escapeHtml(text(this, "depositDate"))}</span><input name="deposit_date" type="date" value="${escapeHtml(owner.deposit_date || "")}"></label>
      <label class="calculated"><span>${escapeHtml(text(this, "finalPaymentAmount"))}</span><output id="final-payment-amount">${escapeHtml(finalPaymentAmount(owner) || "—")}</output></label>
      <label><span>${escapeHtml(text(this, "paymentBalance"))}</span><input name="payment_balance" type="number" min="0" step="0.01" inputmode="decimal" value="${escapeHtml(owner.payment_balance ?? "")}"></label>
      ${selectField(this, "payment_method", text(this, "paymentMethod"), PAYMENT_METHOD_LABELS, owner.payment_method || "none")}
      <label><span>${escapeHtml(text(this, "paymentDate"))}</span><input name="payment_date" type="date" value="${escapeHtml(owner.payment_date || "")}"></label>
      <label class="wide"><span>${escapeHtml(text(this, "notes"))}</span><textarea name="notes" rows="5">${escapeHtml(owner.notes || "")}</textarea></label>
      <div class="actions wide"><button type="button" class="secondary" id="cancel-owner">${escapeHtml(text(this, "cancel"))}</button><button type="submit" class="primary">${escapeHtml(text(this, this._editing ? "update" : "addOwner"))}</button></div>
    </form></section>`;
  }

  _linkSection(litterPuppies, puppy, linked, litterOptions, puppyOptions) {
    return `<section class="link"><h3>${escapeHtml(text(this, "linkTitle"))}</h3><div class="link-form"><label><span>${escapeHtml(text(this, "litter"))}</span><select id="link-litter">${litterOptions}</select></label><label><span>${escapeHtml(text(this, "puppy"))}</span><select id="link-puppy" ${litterPuppies.length ? "" : "disabled"}>${puppyOptions}</select></label><fieldset class="checks"><legend>${escapeHtml(text(this, "owners"))}</legend>${this._owners.map((owner) => `<label><input type="checkbox" name="linked_owner" value="${escapeHtml(owner.id)}" ${linked.has(owner.id) ? "checked" : ""}>${escapeHtml(owner.name)}</label>`).join("") || `<span class="empty">${escapeHtml(text(this, "empty"))}</span>`}</fieldset></div><div class="actions"><button type="button" id="link-save" class="primary" ${!puppy || this._busy ? "disabled" : ""}>${escapeHtml(text(this, "linkSave"))}</button></div></section>`;
  }

  _updateFinalPaymentPreview() {
    const form = this.querySelector(".owner-editor form");
    const output = this.querySelector("#final-payment-amount");
    if (!form || !output) return;
    output.textContent = finalPaymentAmount(Object.fromEntries(new FormData(form).entries())) || "—";
  }

  _render() {
    if (!this._config) return;
    const litterPuppies = this._puppies.filter((item) => item.litter_id === this._selectedLitter);
    const puppy = litterPuppies.find((item) => item.id === this._selectedPuppy) || litterPuppies[0] || null;
    this._selectedPuppy = puppy?.id || "";
    const linked = new Set(puppy?.owner_ids || []);
    const litterOptions = this._litters.map((litter) => `<option value="${escapeHtml(litter.id)}" ${litter.id === this._selectedLitter ? "selected" : ""}>${escapeHtml(litter.name || text(this, "litter"))}</option>`).join("");
    const puppyOptions = litterPuppies.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === this._selectedPuppy ? "selected" : ""}>${escapeHtml(item.name || text(this, "puppy"))}</option>`).join("");

    const headerActions = `<div class="head-actions"><button type="button" id="export-owners-csv" class="secondary" ${!this._owners.length || this._loading ? "disabled" : ""}><ha-icon icon="mdi:file-delimited-outline"></ha-icon>${escapeHtml(text(this, "exportCsv"))}</button>${this._showOwnerEditor ? "" : this._ownerForm()}</div>`;
    this.innerHTML = `<ha-card><div class="head"><div><div class="title">${escapeHtml(this._config.title || text(this, "title"))}</div><div class="sub">${escapeHtml(text(this, "subtitle"))}</div></div>${headerActions}</div>${this._showOwnerEditor ? this._ownerForm() : ""}<section class="list" aria-live="polite">${this._ownerList()}</section>${this._linkSection(litterPuppies, puppy, linked, litterOptions, puppyOptions)}<div id="owner-error" class="message error" role="alert">${escapeHtml(this._error)}</div><div id="owner-status" class="message" role="status" aria-live="polite">${escapeHtml(this._status)}</div></ha-card><style>
      :host{display:block}ha-card{padding:16px}.head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.head-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end}.title{font-size:1.25rem;font-weight:700}.sub{font-size:.85rem;color:var(--secondary-text-color);margin-top:3px}.primary,.secondary,.owner-actions button{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:40px;border:1px solid var(--primary-color);border-radius:8px;padding:0 12px;background:var(--primary-color);color:var(--text-primary-color,#fff);font:inherit;font-weight:600;cursor:pointer}.secondary,.owner-actions button{background:var(--secondary-background-color);border-color:var(--divider-color);color:var(--primary-text-color)}button:disabled{opacity:.55;cursor:default}.owner-editor,.link{margin-top:16px;padding-top:14px;border-top:1px solid var(--divider-color)}h3{margin:0 0 10px;font-size:1rem;letter-spacing:0}.form,.link-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.form-heading{grid-column:1/-1;margin:8px 0 0;font-size:.86rem;letter-spacing:0}.form-heading:first-child{margin-top:0}.form label,.link-form label{display:grid;gap:4px;color:var(--secondary-text-color);font-size:.78rem}.form input,.form select,.form textarea,.form output,.link-form select{box-sizing:border-box;width:100%;min-height:42px;border:1px solid var(--divider-color);border-radius:8px;background:var(--card-background-color);color:var(--primary-text-color);padding:9px;font:inherit}.form output{display:flex;align-items:center;background:var(--secondary-background-color)}.form textarea{min-height:112px;resize:vertical}.wide,.checks{grid-column:1/-1}.preferences{display:grid;gap:8px}.preference-row{min-width:0;margin:0;padding:8px 10px 10px;border:1px solid var(--divider-color);border-radius:8px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.preference-row legend{padding:0 5px;color:var(--primary-text-color);font-size:.8rem;font-weight:600}.actions{display:flex;gap:8px;justify-content:flex-end;margin-top:10px}.list{display:grid;gap:8px;margin-top:16px}.owner{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;border-top:1px solid var(--divider-color);padding-top:9px}.owner-toggle{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0;border:0;background:transparent;color:var(--primary-text-color);padding:5px 2px;text-align:left;font:inherit;cursor:pointer}.owner-toggle span{min-width:0}.owner-toggle strong,.owner-toggle small{display:block;overflow-wrap:anywhere}.owner-toggle small{color:var(--secondary-text-color);margin-top:2px;font-size:.78rem}.owner-actions{display:flex;gap:5px}.owner-actions button{width:38px;padding:0}.owner-actions ha-icon{--mdc-icon-size:19px}.owner-detail{grid-column:1/-1;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;padding:12px;background:var(--secondary-background-color);border-radius:8px;font-size:.85rem}.owner-detail>div{min-width:0;overflow-wrap:anywhere}.owner-detail span{display:block;color:var(--secondary-text-color);font-size:.72rem;margin-bottom:3px}.owner-detail .wide{grid-column:1/-1}.owner-detail .preformatted>div{white-space:pre-wrap;word-break:break-word}.owner-detail .notes>div{max-height:none;overflow:visible}.checks{min-width:0;margin:2px 0 0;padding:10px;border:1px solid var(--divider-color);border-radius:8px;display:grid;gap:7px}.checks legend{padding:0 4px;color:var(--secondary-text-color);font-size:.78rem}.checks label{display:flex;align-items:center;gap:7px;color:var(--primary-text-color)}.empty,.message{color:var(--secondary-text-color);padding:10px 2px}.message:empty{display:none}.error{color:var(--error-color)}@media(max-width:520px){.head{display:grid}.head-actions{display:grid;justify-content:stretch}.head-actions button{width:100%}.form,.link-form,.owner-detail,.preference-row{grid-template-columns:1fr}.wide,.checks,.owner-detail .wide{grid-column:auto}.owner{grid-template-columns:minmax(0,1fr) auto}.owner-actions{flex-direction:column}.actions{flex-wrap:wrap}.actions button{flex:1 1 auto}}
    </style>`;

    this.querySelector("form")?.addEventListener("submit", (event) => { event.preventDefault(); this._save(event.currentTarget); });
    this.querySelector("#export-owners-csv")?.addEventListener("click", () => this._downloadOwnersCsv());
    this.querySelector("#add-owner")?.addEventListener("click", () => this._openEditor());
    this.querySelector("#cancel-owner")?.addEventListener("click", () => { this._editing = null; this._showOwnerEditor = false; this._error = ""; this._render(); });
    this.querySelectorAll("[data-toggle-owner]").forEach((button) => button.addEventListener("click", () => { this._expandedOwnerId = this._expandedOwnerId === button.dataset.toggleOwner ? null : button.dataset.toggleOwner; this._render(); }));
    this.querySelectorAll("[data-edit]").forEach((button) => button.addEventListener("click", () => this._openEditor(button.dataset.edit)));
    this.querySelectorAll("[data-delete]").forEach((button) => button.addEventListener("click", () => this._delete(button.dataset.delete)));
    this.querySelectorAll('input[name="payment_amount"], input[name="registration_fee_amount"], input[name="deposit_amount"]').forEach((input) => input.addEventListener("input", () => this._updateFinalPaymentPreview()));
    this.querySelector("#link-litter")?.addEventListener("change", (event) => { this._selectedLitter = event.target.value; this._selectedPuppy = ""; this._render(); });
    this.querySelector("#link-puppy")?.addEventListener("change", (event) => { this._selectedPuppy = event.target.value; this._render(); });
    this.querySelector("#link-save")?.addEventListener("click", () => this._link());
  }
}

if (!customElements.get(TAG)) customElements.define(TAG, PuppyTrackerOwnerCard);
window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === TAG)) window.customCards.push({ type: TAG, name: "Puppy Tracker Owners", description: "Manage owner contacts and puppy links." });
