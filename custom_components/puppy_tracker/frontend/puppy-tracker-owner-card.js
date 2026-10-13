import { downloadExportFile, escapeHtml, languageForHass } from "./puppy-tracker-card-common.js";
import { collarColor } from "./puppy-tracker-collar-chart-colors.js";

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
    ownersView: "Baasjes beheren",
    matrixView: "Voorkeurenmatrix",
    defaultView: "Standaardweergave",
    matrixSubtitle: "Vergelijk pupvoorkeuren en bestaande koppelingen per nest.",
    matrixLitter: "Nest voor vergelijking",
    showResolved: "Toon verkochte en geplaatste baasjes",
    onlyConflicts: "Alleen conflicten in eerste voorkeur",
    firstChoiceConflicts: "Conflicten eerste voorkeur",
    puppiesWithoutPreferences: "Pups zonder voorkeur",
    ownersWithoutPreferences: "Baasjes zonder keuze",
    linkedMatches: "Bestaande koppelingen",
    matrixOwner: "Baasje",
    matrixTotals: "Voorkeuren",
    matrixEmpty: "Voor dit nest zijn nog geen passende baasjes of voorkeuren beschikbaar.",
    matrixNoPuppies: "Dit nest heeft nog geen pups.",
    matrixNoLitters: "Er zijn nog geen nesten beschikbaar.",
    matrixLoading: "Voorkeuren laden…",
    matrixNoConflicts: "Er zijn geen conflicten in de eerste voorkeur.",
    noPreferenceForPuppy: "Voor deze pup zijn geen voorkeuren of koppelingen vastgelegd.",
    preferenceDetails: "Voorkeurdetails",
    preferenceRank: "Voorkeurspositie",
    linkedStatus: "Gekoppeld",
    notLinkedStatus: "Niet gekoppeld",
    editFromMatrix: "Baasje bewerken",
    firstShort: "1e",
    secondShort: "2e",
    thirdShort: "3e",
    noCollarColor: "Geen halsbandkleur",
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
    fatherChipNumber: "Chipnummer vader",
    motherRegisteredName: "Naam moeder",
    motherCallName: "Roepnaam moeder",
    motherBirthDate: "Geboortedatum moeder",
    motherBreed: "Soort moeder",
    motherWala: "WALA moeder",
    motherChipNumber: "Chipnummer moeder",
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
    ownersView: "Manage owners",
    matrixView: "Preference matrix",
    defaultView: "Default view",
    matrixSubtitle: "Compare puppy preferences and existing links per litter.",
    matrixLitter: "Litter to compare",
    showResolved: "Show sold and placed owners",
    onlyConflicts: "First-choice conflicts only",
    firstChoiceConflicts: "First-choice conflicts",
    puppiesWithoutPreferences: "Puppies without preferences",
    ownersWithoutPreferences: "Owners without a choice",
    linkedMatches: "Existing links",
    matrixOwner: "Owner",
    matrixTotals: "Preferences",
    matrixEmpty: "No matching owners or preferences are available for this litter yet.",
    matrixNoPuppies: "This litter does not have any puppies yet.",
    matrixNoLitters: "No litters are available yet.",
    matrixLoading: "Loading preferences…",
    matrixNoConflicts: "There are no first-choice conflicts.",
    noPreferenceForPuppy: "No preferences or links have been recorded for this puppy.",
    preferenceDetails: "Preference details",
    preferenceRank: "Preference rank",
    linkedStatus: "Linked",
    notLinkedStatus: "Not linked",
    editFromMatrix: "Edit owner",
    firstShort: "1st",
    secondShort: "2nd",
    thirdShort: "3rd",
    noCollarColor: "No collar color",
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
    fatherChipNumber: "Father chip number",
    motherRegisteredName: "Mother registered name",
    motherCallName: "Mother call name",
    motherBirthDate: "Mother birth date",
    motherBreed: "Mother breed / type",
    motherWala: "Mother WALA",
    motherChipNumber: "Mother chip number",
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
    this._activeView = null;
    this._matrixShowResolved = false;
    this._matrixOnlyConflicts = false;
    this._matrixSelectedPuppy = "";
    this._matrixSelection = null;
    this._editing = null;
    this._expandedOwnerId = null;
    this._showOwnerEditor = false;
    this._status = "";
    this._error = "";
    this._loaded = false;
    this._loading = false;
    this._busy = false;
  }

  static getStubConfig() { return { title: "", default_view: "owners", csv_delimiter: "comma" }; }
  static getConfigForm() {
    const configCard = { _hass: document.querySelector("home-assistant")?.hass || null };
    return { schema: [
      { name: "title", selector: { text: {} } },
      { name: "default_view", selector: { select: { mode: "dropdown", options: [
        { value: "owners", label: text(configCard, "ownersView") },
        { value: "matrix", label: text(configCard, "matrixView") },
      ] } } },
      { name: "csv_delimiter", selector: { select: { mode: "dropdown", options: [
        { value: "comma", label: text(configCard, "csvComma") },
        { value: "semicolon", label: text(configCard, "csvSemicolon") },
      ] } } },
    ] };
  }

  setConfig(config) {
    const previousDefaultView = this._config?.default_view;
    const nextConfig = { ...PuppyTrackerOwnerCard.getStubConfig(), ...config };
    if (!["owners", "matrix"].includes(nextConfig.default_view)) nextConfig.default_view = "owners";
    this._config = nextConfig;
    if (!this._activeView || previousDefaultView !== nextConfig.default_view) {
      this._activeView = nextConfig.default_view;
    }
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
      if (!this._litters.some((litter) => litter.id === this._selectedLitter)) {
        this._selectedLitter = this._litters[0]?.id || "";
      }
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
      const selectedLitterPuppies = this._puppies.filter((puppy) => puppy.litter_id === this._selectedLitter);
      if (!selectedLitterPuppies.some((puppy) => puppy.id === this._matrixSelectedPuppy)) {
        this._matrixSelectedPuppy = selectedLitterPuppies[0]?.id || "";
      }
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

  _rankLabel(rank, compact = false) {
    if (![1, 2, 3].includes(rank)) return "—";
    return text(this, compact ? ["firstShort", "secondShort", "thirdShort"][rank - 1] : `preference${rank}`);
  }

  _matrixModel() {
    const allPuppies = this._puppies.filter((puppy) => puppy.litter_id === this._selectedLitter);
    const puppyIds = new Set(allPuppies.map((puppy) => puppy.id));
    const preferencesByOwner = new Map();
    const linksByOwner = new Map();
    const resolvedStatuses = new Set(["sold", "placed"]);

    const owners = this._owners.filter((owner) => {
      const allPreferences = Array.isArray(owner.puppy_preferences) ? owner.puppy_preferences : [];
      const preferences = new Map();
      allPreferences.slice(0, 3).forEach((preference, index) => {
        if (puppyIds.has(preference?.puppy_id)) {
          preferences.set(preference.puppy_id, { rank: index + 1, note: preference.note || "" });
        }
      });
      const linkedPuppyIds = new Set(
        allPuppies
          .filter((puppy) => (puppy.owner_ids || []).includes(owner.id))
          .map((puppy) => puppy.id),
      );
      const candidateRole = ["owner", "co_owner"].includes(owner.role || "owner");
      const belongsInLitter = preferences.size > 0 || linkedPuppyIds.size > 0 || (candidateRole && allPreferences.length === 0);
      if (!belongsInLitter) return false;
      if (!this._matrixShowResolved && resolvedStatuses.has(owner.placement_status)) return false;
      preferencesByOwner.set(owner.id, preferences);
      linksByOwner.set(owner.id, linkedPuppyIds);
      return true;
    }).sort((left, right) => String(left.name || "").localeCompare(String(right.name || "")));

    const rankCounts = new Map(allPuppies.map((puppy) => [puppy.id, [0, 0, 0]]));
    for (const owner of owners) {
      for (const [puppyId, preference] of preferencesByOwner.get(owner.id) || []) {
        rankCounts.get(puppyId)[preference.rank - 1] += 1;
      }
    }
    const conflictPuppyIds = new Set(
      allPuppies
        .filter((puppy) => (rankCounts.get(puppy.id)?.[0] || 0) > 1)
        .map((puppy) => puppy.id),
    );
    const puppiesWithoutPreferences = allPuppies.filter((puppy) =>
      (rankCounts.get(puppy.id) || []).every((count) => count === 0),
    ).length;
    const ownersWithoutPreferences = owners.filter((owner) =>
      (preferencesByOwner.get(owner.id)?.size || 0) === 0,
    ).length;
    const linkedMatches = owners.reduce(
      (total, owner) => total + (linksByOwner.get(owner.id)?.size || 0),
      0,
    );

    const puppies = this._matrixOnlyConflicts
      ? allPuppies.filter((puppy) => conflictPuppyIds.has(puppy.id))
      : allPuppies;
    const visiblePuppyIds = new Set(puppies.map((puppy) => puppy.id));
    const visibleOwners = this._matrixOnlyConflicts
      ? owners.filter((owner) => {
        const preferences = preferencesByOwner.get(owner.id) || new Map();
        const links = linksByOwner.get(owner.id) || new Set();
        return [...visiblePuppyIds].some((puppyId) => preferences.has(puppyId) || links.has(puppyId));
      })
      : owners;

    if (!puppies.some((puppy) => puppy.id === this._matrixSelectedPuppy)) {
      this._matrixSelectedPuppy = puppies[0]?.id || "";
    }
    if (this._matrixSelection) {
      const selectionVisible = visibleOwners.some((owner) => owner.id === this._matrixSelection.ownerId)
        && puppies.some((puppy) => puppy.id === this._matrixSelection.puppyId);
      if (!selectionVisible) this._matrixSelection = null;
    }

    return {
      allPuppies,
      puppies,
      owners: visibleOwners,
      preferencesByOwner,
      linksByOwner,
      rankCounts,
      conflictPuppyIds,
      stats: {
        conflicts: conflictPuppyIds.size,
        puppiesWithoutPreferences,
        ownersWithoutPreferences,
        linkedMatches,
      },
    };
  }

  _matrixPuppyHeader(puppy, index) {
    const colorName = puppy.collar_color || text(this, "noCollarColor");
    const color = collarColor(puppy.collar_color, index);
    return `<div class="matrix-puppy"><span class="collar-swatch" style="--collar-color:${escapeHtml(color)}" title="${escapeHtml(`${text(this, "puppyCollarColor")}: ${colorName}`)}" aria-hidden="true"></span><span><strong>${escapeHtml(puppy.name || text(this, "puppy"))}</strong><small>${escapeHtml(colorName)}</small></span></div>`;
  }

  _matrixCell(owner, puppy, model) {
    const preference = model.preferencesByOwner.get(owner.id)?.get(puppy.id);
    const linked = model.linksByOwner.get(owner.id)?.has(puppy.id) || false;
    if (!preference && !linked) return `<td class="matrix-empty" aria-label="${escapeHtml(text(this, "noPuppyPreference"))}">—</td>`;
    const conflict = preference?.rank === 1 && model.conflictPuppyIds.has(puppy.id);
    const selected = this._matrixSelection?.ownerId === owner.id && this._matrixSelection?.puppyId === puppy.id;
    const description = [
      preference ? this._rankLabel(preference.rank) : null,
      linked ? text(this, "linkedStatus") : null,
      conflict ? text(this, "firstChoiceConflicts") : null,
      preference?.note || null,
    ].filter(Boolean).join(" · ");
    return `<td><button type="button" class="matrix-cell${conflict ? " conflict" : ""}${selected ? " selected" : ""}" data-matrix-owner="${escapeHtml(owner.id)}" data-matrix-puppy="${escapeHtml(puppy.id)}" aria-pressed="${selected}" aria-label="${escapeHtml(`${owner.name} · ${puppy.name || text(this, "puppy")} · ${description}`)}" title="${escapeHtml(description)}">${preference ? `<span class="rank rank-${preference.rank}">${escapeHtml(this._rankLabel(preference.rank, true))}</span>` : ""}${preference?.note ? `<ha-icon class="cell-icon" icon="mdi:note-text-outline" aria-hidden="true"></ha-icon>` : ""}${linked ? `<ha-icon class="cell-icon linked-icon" icon="mdi:link-variant" aria-hidden="true"></ha-icon>` : ""}${conflict ? `<ha-icon class="cell-icon conflict-icon" icon="mdi:alert-circle-outline" aria-hidden="true"></ha-icon>` : ""}</button></td>`;
  }

  _matrixSummary(model) {
    const items = [
      [model.stats.conflicts, "firstChoiceConflicts"],
      [model.stats.puppiesWithoutPreferences, "puppiesWithoutPreferences"],
      [model.stats.ownersWithoutPreferences, "ownersWithoutPreferences"],
      [model.stats.linkedMatches, "linkedMatches"],
    ];
    return `<div class="matrix-summary">${items.map(([value, label]) => `<div><strong>${value}</strong><span>${escapeHtml(text(this, label))}</span></div>`).join("")}</div>`;
  }

  _matrixDesktop(model) {
    if (!model.puppies.length) {
      return `<div class="matrix-desktop empty matrix-empty-state">${escapeHtml(text(this, this._matrixOnlyConflicts ? "matrixNoConflicts" : "matrixNoPuppies"))}</div>`;
    }
    if (!model.owners.length) {
      return `<div class="matrix-desktop empty matrix-empty-state">${escapeHtml(text(this, "matrixEmpty"))}</div>`;
    }
    return `<div class="matrix-desktop"><div class="matrix-scroll"><table class="preference-matrix"><thead><tr><th scope="col" class="owner-column">${escapeHtml(text(this, "matrixOwner"))}</th>${model.puppies.map((puppy, index) => `<th scope="col">${this._matrixPuppyHeader(puppy, index)}</th>`).join("")}</tr></thead><tbody>${model.owners.map((owner) => `<tr><th scope="row" class="owner-column"><strong>${escapeHtml(owner.name)}</strong><small>${escapeHtml(optionLabel(this, owner.placement_status, PLACEMENT_STATUS_LABELS, "interested"))}</small></th>${model.puppies.map((puppy) => this._matrixCell(owner, puppy, model)).join("")}</tr>`).join("")}</tbody><tfoot><tr><th scope="row" class="owner-column">${escapeHtml(text(this, "matrixTotals"))}</th>${model.puppies.map((puppy) => { const counts = model.rankCounts.get(puppy.id) || [0, 0, 0]; return `<td><span class="rank-totals"><b>${escapeHtml(text(this, "firstShort"))}</b> ${counts[0]} · <b>${escapeHtml(text(this, "secondShort"))}</b> ${counts[1]} · <b>${escapeHtml(text(this, "thirdShort"))}</b> ${counts[2]}</span></td>`; }).join("")}</tr></tfoot></table></div></div>`;
  }

  _matrixMobile(model) {
    if (!model.puppies.length) {
      return `<div class="matrix-mobile empty matrix-empty-state">${escapeHtml(text(this, this._matrixOnlyConflicts ? "matrixNoConflicts" : "matrixNoPuppies"))}</div>`;
    }
    const puppy = model.puppies.find((item) => item.id === this._matrixSelectedPuppy) || model.puppies[0];
    const puppyIndex = model.allPuppies.findIndex((item) => item.id === puppy.id);
    const matches = model.owners.map((owner) => ({
      owner,
      preference: model.preferencesByOwner.get(owner.id)?.get(puppy.id),
      linked: model.linksByOwner.get(owner.id)?.has(puppy.id) || false,
    })).filter((item) => item.preference || item.linked).sort((left, right) =>
      (left.preference?.rank || 99) - (right.preference?.rank || 99)
      || String(left.owner.name || "").localeCompare(String(right.owner.name || "")),
    );
    const counts = model.rankCounts.get(puppy.id) || [0, 0, 0];
    const options = model.puppies.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === puppy.id ? "selected" : ""}>${escapeHtml(item.name || text(this, "puppy"))}${item.collar_color ? ` · ${escapeHtml(item.collar_color)}` : ""}</option>`).join("");
    return `<div class="matrix-mobile"><label class="mobile-puppy-select"><span>${escapeHtml(text(this, "puppy"))}</span><select id="matrix-puppy">${options}</select></label><div class="mobile-puppy-head">${this._matrixPuppyHeader(puppy, puppyIndex)}<span>${escapeHtml(text(this, "firstShort"))} ${counts[0]} · ${escapeHtml(text(this, "secondShort"))} ${counts[1]} · ${escapeHtml(text(this, "thirdShort"))} ${counts[2]}</span></div><div class="mobile-matches">${matches.length ? matches.map(({ owner, preference, linked }) => {
      const selected = this._matrixSelection?.ownerId === owner.id && this._matrixSelection?.puppyId === puppy.id;
      const conflict = preference?.rank === 1 && model.conflictPuppyIds.has(puppy.id);
      return `<button type="button" class="mobile-match${selected ? " selected" : ""}${conflict ? " conflict" : ""}" data-matrix-owner="${escapeHtml(owner.id)}" data-matrix-puppy="${escapeHtml(puppy.id)}" aria-pressed="${selected}"><span class="mobile-match-rank">${preference ? escapeHtml(this._rankLabel(preference.rank, true)) : `<ha-icon icon="mdi:link-variant" aria-hidden="true"></ha-icon>`}</span><span class="mobile-match-main"><strong>${escapeHtml(owner.name)}</strong><small>${escapeHtml(optionLabel(this, owner.placement_status, PLACEMENT_STATUS_LABELS, "interested"))}${linked ? ` · ${escapeHtml(text(this, "linkedStatus"))}` : ""}</small>${preference?.note ? `<span>${escapeHtml(preference.note)}</span>` : ""}</span>${conflict ? `<ha-icon class="conflict-icon" icon="mdi:alert-circle-outline" aria-hidden="true"></ha-icon>` : ""}</button>`;
    }).join("") : `<div class="empty">${escapeHtml(text(this, "noPreferenceForPuppy"))}</div>`}</div></div>`;
  }

  _matrixDetailsMarkup() {
    if (!this._matrixSelection) return "";
    const owner = this._owners.find((item) => item.id === this._matrixSelection.ownerId);
    const puppy = this._puppies.find((item) => item.id === this._matrixSelection.puppyId);
    if (!owner || !puppy) return "";
    const preferences = Array.isArray(owner.puppy_preferences) ? owner.puppy_preferences : [];
    const index = preferences.findIndex((preference) => preference.puppy_id === puppy.id);
    const preference = index >= 0 ? preferences[index] : null;
    const linked = (puppy.owner_ids || []).includes(owner.id);
    return `<div class="matrix-detail-content"><div><span>${escapeHtml(text(this, "preferenceDetails"))}</span><strong>${escapeHtml(owner.name)} · ${escapeHtml(puppy.name || text(this, "puppy"))}</strong></div><dl><div><dt>${escapeHtml(text(this, "preferenceRank"))}</dt><dd>${escapeHtml(preference ? this._rankLabel(index + 1) : "—")}</dd></div><div><dt>${escapeHtml(text(this, "placementStatus"))}</dt><dd>${escapeHtml(optionLabel(this, owner.placement_status, PLACEMENT_STATUS_LABELS, "interested"))}</dd></div><div><dt>${escapeHtml(text(this, "linkedPuppies"))}</dt><dd>${escapeHtml(text(this, linked ? "linkedStatus" : "notLinkedStatus"))}</dd></div><div class="detail-note"><dt>${escapeHtml(text(this, "preferenceNote"))}</dt><dd>${escapeHtml(preference?.note || "—")}</dd></div></dl><button type="button" class="secondary" data-matrix-edit-owner="${escapeHtml(owner.id)}"><ha-icon icon="mdi:pencil-outline"></ha-icon>${escapeHtml(text(this, "editFromMatrix"))}</button></div>`;
  }

  _matrixView() {
    if (!this._litters.length) return `<section class="matrix-view"><div class="empty matrix-empty-state">${escapeHtml(text(this, this._loading ? "matrixLoading" : "matrixNoLitters"))}</div></section>`;
    const model = this._matrixModel();
    const litterOptions = this._litters.map((litter) => `<option value="${escapeHtml(litter.id)}" ${litter.id === this._selectedLitter ? "selected" : ""}>${escapeHtml(litter.name || text(this, "litter"))}</option>`).join("");
    const details = this._matrixDetailsMarkup();
    return `<section class="matrix-view"><div class="matrix-controls"><label><span>${escapeHtml(text(this, "matrixLitter"))}</span><select id="matrix-litter">${litterOptions}</select></label><label class="matrix-toggle"><input id="matrix-show-resolved" type="checkbox" ${this._matrixShowResolved ? "checked" : ""}><span>${escapeHtml(text(this, "showResolved"))}</span></label><label class="matrix-toggle"><input id="matrix-only-conflicts" type="checkbox" ${this._matrixOnlyConflicts ? "checked" : ""}><span>${escapeHtml(text(this, "onlyConflicts"))}</span></label></div>${model.allPuppies.length ? this._matrixSummary(model) : ""}${this._matrixDesktop(model)}${this._matrixMobile(model)}<section id="matrix-detail" class="matrix-detail" ${details ? "" : "hidden"}>${details}</section></section>`;
  }

  _selectMatrixCell(ownerId, puppyId) {
    const selected = this._matrixSelection?.ownerId === ownerId && this._matrixSelection?.puppyId === puppyId;
    this._matrixSelection = selected ? null : { ownerId, puppyId };
    this.querySelectorAll("[data-matrix-owner]").forEach((button) => {
      const active = !selected && button.dataset.matrixOwner === ownerId && button.dataset.matrixPuppy === puppyId;
      button.classList.toggle("selected", active);
      button.setAttribute("aria-pressed", String(active));
    });
    const details = this.querySelector("#matrix-detail");
    if (!details) return;
    details.innerHTML = this._matrixDetailsMarkup();
    details.hidden = !this._matrixSelection;
    details.querySelector("[data-matrix-edit-owner]")?.addEventListener("click", (event) => this._openEditor(event.currentTarget.dataset.matrixEditOwner));
  }

  _switchView(view) {
    if (!["owners", "matrix"].includes(view) || view === this._activeView || this._showOwnerEditor) return;
    this._activeView = view;
    this._matrixSelection = null;
    this._status = "";
    this._error = "";
    this._render();
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
      "fatherBirthDate", "fatherBreed", "fatherWala", "fatherChipNumber", "motherRegisteredName",
      "motherCallName", "motherBirthDate", "motherBreed", "motherWala", "motherChipNumber",
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
          puppy?.father_details?.chip_number,
          puppy?.mother_details?.registered_name,
          puppy?.mother,
          puppy?.mother_details?.birth_date,
          puppy?.mother_details?.breed,
          puppy?.mother_details?.wala_number,
          puppy?.mother_details?.chip_number,
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
    this._activeView = "owners";
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

    const ownersView = this._activeView !== "matrix";
    const headerActions = `<div class="head-actions"><button type="button" id="export-owners-csv" class="secondary" ${!this._owners.length || this._loading ? "disabled" : ""}><ha-icon icon="mdi:file-delimited-outline"></ha-icon>${escapeHtml(text(this, "exportCsv"))}</button>${ownersView && !this._showOwnerEditor ? this._ownerForm() : ""}</div>`;
    const viewTabs = `<div class="view-tabs" role="tablist" aria-label="${escapeHtml(text(this, "title"))}"><button type="button" id="owners-view" role="tab" aria-selected="${ownersView}" class="${ownersView ? "active" : ""}"><ha-icon icon="mdi:account-multiple-outline"></ha-icon>${escapeHtml(text(this, "ownersView"))}</button><button type="button" id="matrix-view" role="tab" aria-selected="${!ownersView}" class="${ownersView ? "" : "active"}" ${this._showOwnerEditor ? "disabled" : ""}><ha-icon icon="mdi:table-large"></ha-icon>${escapeHtml(text(this, "matrixView"))}</button></div>`;
    const ownersContent = `${this._showOwnerEditor ? this._ownerForm() : ""}<section class="list" aria-live="polite">${this._ownerList()}</section>${this._linkSection(litterPuppies, puppy, linked, litterOptions, puppyOptions)}`;
    const content = ownersView ? ownersContent : this._matrixView();
    const subtitle = text(this, ownersView ? "subtitle" : "matrixSubtitle");
    this.innerHTML = `<ha-card><div class="head"><div><div class="title">${escapeHtml(this._config.title || text(this, "title"))}</div><div class="sub">${escapeHtml(subtitle)}</div></div>${headerActions}</div>${viewTabs}${content}<div id="owner-error" class="message error" role="alert">${escapeHtml(this._error)}</div><div id="owner-status" class="message" role="status" aria-live="polite">${escapeHtml(this._status)}</div></ha-card><style>
      :host{display:block}
      ha-card{padding:16px;container-type:inline-size;container-name:owner-card}
      .head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
      .head-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end}
      .title{font-size:1.25rem;font-weight:700}
      .sub{font-size:.85rem;color:var(--secondary-text-color);margin-top:3px}
      .primary,.secondary,.owner-actions button{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:40px;border:1px solid var(--primary-color);border-radius:8px;padding:0 12px;background:var(--primary-color);color:var(--text-primary-color,#fff);font:inherit;font-weight:600;cursor:pointer}
      .secondary,.owner-actions button{background:var(--secondary-background-color);border-color:var(--divider-color);color:var(--primary-text-color)}
      button:disabled{opacity:.55;cursor:default}
      .view-tabs{display:inline-grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:3px;margin-top:14px;padding:3px;border-radius:8px;background:var(--secondary-background-color)}
      .view-tabs button{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:38px;padding:0 12px;border:0;border-radius:6px;background:transparent;color:var(--secondary-text-color);font:inherit;font-weight:600;cursor:pointer}
      .view-tabs button.active{background:var(--card-background-color);color:var(--primary-text-color);box-shadow:0 1px 3px rgba(0,0,0,.16)}
      .view-tabs ha-icon{--mdc-icon-size:19px}
      .owner-editor,.link{margin-top:16px;padding-top:14px;border-top:1px solid var(--divider-color)}
      h3{margin:0 0 10px;font-size:1rem;letter-spacing:0}
      .form,.link-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
      .form-heading{grid-column:1/-1;margin:8px 0 0;font-size:.86rem;letter-spacing:0}
      .form-heading:first-child{margin-top:0}
      .form label,.link-form label{display:grid;gap:4px;color:var(--secondary-text-color);font-size:.78rem}
      .form input,.form select,.form textarea,.form output,.link-form select{box-sizing:border-box;width:100%;min-height:42px;border:1px solid var(--divider-color);border-radius:8px;background:var(--card-background-color);color:var(--primary-text-color);padding:9px;font:inherit}
      .form output{display:flex;align-items:center;background:var(--secondary-background-color)}
      .form textarea{min-height:112px;resize:vertical}
      .wide,.checks{grid-column:1/-1}
      .preferences{display:grid;gap:8px}
      .preference-row{min-width:0;margin:0;padding:8px 10px 10px;border:1px solid var(--divider-color);border-radius:8px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
      .preference-row legend{padding:0 5px;color:var(--primary-text-color);font-size:.8rem;font-weight:600}
      .actions{display:flex;gap:8px;justify-content:flex-end;margin-top:10px}
      .list{display:grid;gap:8px;margin-top:16px}
      .owner{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;border-top:1px solid var(--divider-color);padding-top:9px}
      .owner-toggle{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0;border:0;background:transparent;color:var(--primary-text-color);padding:5px 2px;text-align:left;font:inherit;cursor:pointer}
      .owner-toggle span{min-width:0}
      .owner-toggle strong,.owner-toggle small{display:block;overflow-wrap:anywhere}
      .owner-toggle small{color:var(--secondary-text-color);margin-top:2px;font-size:.78rem}
      .owner-actions{display:flex;gap:5px}
      .owner-actions button{width:38px;padding:0}
      .owner-actions ha-icon{--mdc-icon-size:19px}
      .owner-detail{grid-column:1/-1;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;padding:12px;background:var(--secondary-background-color);border-radius:8px;font-size:.85rem}
      .owner-detail>div{min-width:0;overflow-wrap:anywhere}
      .owner-detail span{display:block;color:var(--secondary-text-color);font-size:.72rem;margin-bottom:3px}
      .owner-detail .wide{grid-column:1/-1}
      .owner-detail .preformatted>div{white-space:pre-wrap;word-break:break-word}
      .owner-detail .notes>div{max-height:none;overflow:visible}
      .checks{min-width:0;margin:2px 0 0;padding:10px;border:1px solid var(--divider-color);border-radius:8px;display:grid;gap:7px}
      .checks legend{padding:0 4px;color:var(--secondary-text-color);font-size:.78rem}
      .checks label{display:flex;align-items:center;gap:7px;color:var(--primary-text-color)}
      .empty,.message{color:var(--secondary-text-color);padding:10px 2px}
      .message:empty{display:none}
      .error{color:var(--error-color)}
      .matrix-view{margin-top:14px}
      .matrix-controls{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end}
      .matrix-controls>label:first-child,.mobile-puppy-select{display:grid;gap:4px;color:var(--secondary-text-color);font-size:.78rem}
      .matrix-controls>label:first-child{flex:1 1 220px}
      .matrix-controls select,.mobile-puppy-select select{box-sizing:border-box;width:100%;min-height:42px;border:1px solid var(--divider-color);border-radius:8px;background:var(--card-background-color);color:var(--primary-text-color);padding:0 9px;font:inherit}
      .matrix-toggle{display:flex;align-items:center;gap:7px;min-height:42px;color:var(--primary-text-color);font-size:.8rem}
      .matrix-toggle input{width:18px;height:18px;accent-color:var(--primary-color)}
      .matrix-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));margin:14px 0;border-top:1px solid var(--divider-color);border-bottom:1px solid var(--divider-color)}
      .matrix-summary>div{min-width:0;padding:10px;border-right:1px solid var(--divider-color)}
      .matrix-summary>div:last-child{border-right:0}
      .matrix-summary strong,.matrix-summary span{display:block}
      .matrix-summary strong{font-size:1.2rem}
      .matrix-summary span{margin-top:2px;color:var(--secondary-text-color);font-size:.72rem;overflow-wrap:anywhere}
      .matrix-empty-state{margin-top:14px;text-align:center}
      .matrix-scroll{max-height:min(620px,65vh);overflow:auto;overscroll-behavior:contain;scrollbar-gutter:stable;border:1px solid var(--divider-color);border-radius:8px}
      .preference-matrix{border-collapse:separate;border-spacing:0;min-width:100%;width:max-content;background:var(--card-background-color);font-size:.8rem}
      .preference-matrix th,.preference-matrix td{box-sizing:border-box;min-width:104px;height:58px;padding:6px 8px;border-right:1px solid var(--divider-color);border-bottom:1px solid var(--divider-color);text-align:center;vertical-align:middle}
      .preference-matrix tr>*:last-child{border-right:0}
      .preference-matrix tfoot tr>*{border-bottom:0}
      .preference-matrix thead th{position:sticky;top:0;z-index:3;background:var(--card-background-color)}
      .preference-matrix .owner-column{position:sticky;left:0;z-index:2;min-width:160px;max-width:210px;text-align:left;background:var(--card-background-color)}
      .preference-matrix thead .owner-column{z-index:4}
      .preference-matrix tbody .owner-column strong,.preference-matrix tbody .owner-column small{display:block;overflow-wrap:anywhere}
      .preference-matrix tbody .owner-column small{margin-top:2px;color:var(--secondary-text-color);font-weight:400}
      .matrix-puppy{display:flex;align-items:center;justify-content:center;gap:7px;min-width:0}
      .matrix-puppy>span:last-child{min-width:0}
      .matrix-puppy strong,.matrix-puppy small{display:block;overflow-wrap:anywhere}
      .matrix-puppy small{margin-top:2px;color:var(--secondary-text-color);font-weight:400}
      .collar-swatch{display:block;flex:0 0 auto;width:18px;height:18px;border:2px solid var(--card-background-color);border-radius:50%;background:var(--collar-color);box-shadow:0 0 0 1px var(--divider-color)}
      .matrix-cell{position:relative;display:inline-flex;align-items:center;justify-content:center;gap:4px;width:82px;min-height:42px;padding:4px;border:1px solid transparent;border-radius:8px;background:transparent;color:var(--primary-text-color);cursor:pointer}
      .matrix-cell:hover,.matrix-cell.selected,.mobile-match.selected{border-color:var(--primary-color,#039be5);background:color-mix(in srgb,var(--primary-color,#039be5) 10%,transparent)}
      .matrix-cell.conflict,.mobile-match.conflict{border-color:var(--error-color,#db4437)}
      .rank{display:inline-flex;align-items:center;justify-content:center;width:29px;height:29px;border-radius:50%;font-weight:700}
      .rank-1{background:var(--primary-color,#039be5);color:var(--text-primary-color,#fff)}
      .rank-2{border:2px solid var(--primary-color,#039be5);color:var(--primary-color,#039be5)}
      .rank-3{background:var(--secondary-background-color,#f2f2f2);color:var(--primary-text-color,#212121)}
      .cell-icon{--mdc-icon-size:17px;color:var(--secondary-text-color)}
      .linked-icon{color:var(--primary-color,#039be5)}
      .conflict-icon{color:var(--error-color,#db4437)}
      .matrix-cell .conflict-icon{position:absolute;top:1px;right:1px;--mdc-icon-size:14px}
      .matrix-empty{color:var(--disabled-text-color,var(--secondary-text-color))}
      .rank-totals{white-space:nowrap;color:var(--secondary-text-color);font-size:.72rem}
      .rank-totals b{color:var(--primary-text-color)}
      .matrix-mobile{display:none}
      .matrix-detail{margin-top:14px;padding-top:14px;border-top:1px solid var(--divider-color)}
      .matrix-detail[hidden]{display:none}
      .matrix-detail-content{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:start}
      .matrix-detail-content>div:first-child>span{display:block;color:var(--secondary-text-color);font-size:.72rem}
      .matrix-detail-content>div:first-child>strong{display:block;margin-top:3px}
      .matrix-detail dl{grid-column:1/-1;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:0}
      .matrix-detail dl>div{min-width:0}
      .matrix-detail dt{color:var(--secondary-text-color);font-size:.72rem}
      .matrix-detail dd{margin:3px 0 0;overflow-wrap:anywhere}
      .matrix-detail .detail-note{grid-column:1/-1}
      @container owner-card (max-width:620px){
        .matrix-controls{display:grid;grid-template-columns:1fr;align-items:stretch}
        .matrix-toggle{min-height:32px}
        .matrix-summary{grid-template-columns:repeat(2,minmax(0,1fr))}
        .matrix-summary>div:nth-child(2){border-right:0}
        .matrix-summary>div:nth-child(-n+2){border-bottom:1px solid var(--divider-color)}
        .matrix-desktop{display:none}
        .matrix-mobile{display:block}
        .mobile-puppy-select{margin-bottom:10px}
        .mobile-puppy-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid var(--divider-color)}
        .mobile-puppy-head>span{color:var(--secondary-text-color);font-size:.75rem;white-space:nowrap}
        .mobile-matches{display:grid}
        .mobile-match{display:grid;grid-template-columns:42px minmax(0,1fr) auto;gap:9px;align-items:center;min-width:0;padding:10px 4px;border:1px solid transparent;border-bottom-color:var(--divider-color);background:transparent;color:var(--primary-text-color);text-align:left;font:inherit;cursor:pointer}
        .mobile-match-rank{display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:50%;background:var(--secondary-background-color);font-weight:700}
        .mobile-match-rank ha-icon{--mdc-icon-size:19px;color:var(--primary-color)}
        .mobile-match-main{min-width:0}
        .mobile-match-main strong,.mobile-match-main small,.mobile-match-main>span{display:block;overflow-wrap:anywhere}
        .mobile-match-main small{margin-top:2px;color:var(--secondary-text-color);font-size:.72rem}
        .mobile-match-main>span{margin-top:5px;font-size:.8rem;line-height:1.35}
        .matrix-detail-content{grid-template-columns:1fr}
        .matrix-detail-content .secondary{justify-self:start}
        .matrix-detail dl{grid-template-columns:1fr 1fr}
      }
      @container owner-card (max-width:520px){
        .head{display:grid}
        .head-actions{display:grid;justify-content:stretch}
        .head-actions button{width:100%}
        .view-tabs{display:grid}
        .form,.link-form,.owner-detail,.preference-row{grid-template-columns:1fr}
        .wide,.checks,.owner-detail .wide{grid-column:auto}
        .owner{grid-template-columns:minmax(0,1fr) auto}
        .owner-actions{flex-direction:column}
        .actions{flex-wrap:wrap}
        .actions button{flex:1 1 auto}
      }
    </style>`;

    this.querySelector(".owner-editor form")?.addEventListener("submit", (event) => { event.preventDefault(); this._save(event.currentTarget); });
    this.querySelector("#export-owners-csv")?.addEventListener("click", () => this._downloadOwnersCsv());
    this.querySelector("#owners-view")?.addEventListener("click", () => this._switchView("owners"));
    this.querySelector("#matrix-view")?.addEventListener("click", () => this._switchView("matrix"));
    this.querySelector("#add-owner")?.addEventListener("click", () => this._openEditor());
    this.querySelector("#cancel-owner")?.addEventListener("click", () => { this._editing = null; this._showOwnerEditor = false; this._error = ""; this._render(); });
    this.querySelectorAll("[data-toggle-owner]").forEach((button) => button.addEventListener("click", () => { this._expandedOwnerId = this._expandedOwnerId === button.dataset.toggleOwner ? null : button.dataset.toggleOwner; this._render(); }));
    this.querySelectorAll("[data-edit]").forEach((button) => button.addEventListener("click", () => this._openEditor(button.dataset.edit)));
    this.querySelectorAll("[data-delete]").forEach((button) => button.addEventListener("click", () => this._delete(button.dataset.delete)));
    this.querySelectorAll('input[name="payment_amount"], input[name="registration_fee_amount"], input[name="deposit_amount"]').forEach((input) => input.addEventListener("input", () => this._updateFinalPaymentPreview()));
    this.querySelector("#link-litter")?.addEventListener("change", (event) => { this._selectedLitter = event.target.value; this._selectedPuppy = ""; this._matrixSelectedPuppy = ""; this._matrixSelection = null; this._render(); });
    this.querySelector("#link-puppy")?.addEventListener("change", (event) => { this._selectedPuppy = event.target.value; this._render(); });
    this.querySelector("#link-save")?.addEventListener("click", () => this._link());
    this.querySelector("#matrix-litter")?.addEventListener("change", (event) => { this._selectedLitter = event.target.value; this._selectedPuppy = ""; this._matrixSelectedPuppy = ""; this._matrixSelection = null; this._render(); });
    this.querySelector("#matrix-show-resolved")?.addEventListener("change", (event) => { this._matrixShowResolved = event.target.checked; this._matrixSelection = null; this._render(); });
    this.querySelector("#matrix-only-conflicts")?.addEventListener("change", (event) => { this._matrixOnlyConflicts = event.target.checked; this._matrixSelection = null; this._render(); });
    this.querySelector("#matrix-puppy")?.addEventListener("change", (event) => { this._matrixSelectedPuppy = event.target.value; this._matrixSelection = null; this._render(); });
    this.querySelectorAll("[data-matrix-owner]").forEach((button) => button.addEventListener("click", () => this._selectMatrixCell(button.dataset.matrixOwner, button.dataset.matrixPuppy)));
    this.querySelector("[data-matrix-edit-owner]")?.addEventListener("click", (event) => this._openEditor(event.currentTarget.dataset.matrixEditOwner));
  }
}

if (!customElements.get(TAG)) customElements.define(TAG, PuppyTrackerOwnerCard);
window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === TAG)) window.customCards.push({ type: TAG, name: "Puppy Tracker Owners", description: "Manage owner contacts and puppy links." });
