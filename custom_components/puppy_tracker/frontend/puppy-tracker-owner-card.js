import { puppySelectorLabel, downloadExportFile, escapeHtml, languageForHass, preserveScrollPosition } from "./puppy-tracker-card-common.js";
import { FormState, appendEditAction } from "./puppy-tracker-form-state.js";
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
    showResolved: "Toon verkochte, geplaatste en gearchiveerde dossiers",
    onlyConflicts: "Alleen conflicten in eerste voorkeur",
    firstChoiceConflicts: "Conflicten eerste voorkeur",
    puppiesWithoutPreferences: "Pups zonder voorkeur",
    ownersWithoutPreferences: "Baasjes zonder keuze",
    linkedMatches: "Bestaande koppelingen",
    matrixOwner: "Baasje",
    perPuppy: "Per pup",
    perOwner: "Per baasje",
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
    addressDetails: "Adresgegevens",
    financialDetails: "Financieel",
    adminOnly: "Baasjesgegevens en betalingen zijn alleen beschikbaar voor beheerders.",
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
    unavailableLitter: "Niet meer beschikbaar nest",
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
    markPaidInFull: "Volledig betaald registreren",
    contactPreference: "Voorkeurscontact",
    notes: "Algemene contactnotities",
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
    confirmDelete: "Deze contactpersoon met alle nestdossiers definitief verwijderen?",
    unlinkBeforeDelete: "Ontkoppel deze contactpersoon eerst van de pups, of archiveer alleen het nestdossier.",
    edit: "Bewerken",
    remove: "Verwijderen",
    loading: "Baasjes laden…",
    empty: "Nog geen baasjes toegevoegd.",
    unknown: "Niet opgegeven",
    exportCsv: "Selectie exporteren (CSV)",
    csvDone: "Baasjes-CSV gedownload.",
    csvComma: "Komma (,) - Nextcloud",
    csvSemicolon: "Puntkomma (;) - Excel NL",
    ownerScope: "Baasjes voor",
    allLitters: "Alle nesten",
    unassigned: "Zonder nest",
    searchOwners: "Zoeken op naam, contactgegevens of pup",
    showCompleted: "Afgeronde en gearchiveerde dossiers tonen",
    noMatchingOwners: "Geen baasjes binnen deze selectie.",
    dossierLitter: "Dossier voor nest",
    placementNotes: "Notities bij dit nest",
    archived: "Dossier archiveren",
    assignDossier: "Dossier aan nest koppelen",
    addDossier: "Nestdossier toevoegen",
    archivedColumn: "Gearchiveerd",
    chooseLitter: "Kies een nest",
    yes: "Ja",
    no: "Nee",
  },
  en: {
    title: "Manage owners",
    subtitle: "Contacts that can be linked to a puppy later.",
    ownersView: "Manage owners",
    matrixView: "Preference matrix",
    defaultView: "Default view",
    matrixSubtitle: "Compare puppy preferences and existing links per litter.",
    matrixLitter: "Litter to compare",
    showResolved: "Show sold, placed and archived dossiers",
    onlyConflicts: "First-choice conflicts only",
    firstChoiceConflicts: "First-choice conflicts",
    puppiesWithoutPreferences: "Puppies without preferences",
    ownersWithoutPreferences: "Owners without a choice",
    linkedMatches: "Existing links",
    matrixOwner: "Owner",
    perPuppy: "By puppy",
    perOwner: "By owner",
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
    addressDetails: "Address details",
    financialDetails: "Financial",
    adminOnly: "Owner details and payments are only available to administrators.",
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
    unavailableLitter: "Litter no longer available",
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
    markPaidInFull: "Record payment in full",
    contactPreference: "Preferred contact",
    notes: "General contact notes",
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
    confirmDelete: "Permanently delete this contact and all litter dossiers?",
    unlinkBeforeDelete: "Unlink this contact from the puppies first, or archive only the litter dossier.",
    edit: "Edit",
    remove: "Delete",
    loading: "Loading owners…",
    empty: "No owners added yet.",
    unknown: "Not specified",
    exportCsv: "Export selection (CSV)",
    csvDone: "Owner CSV downloaded.",
    csvComma: "Comma (,) - Nextcloud",
    csvSemicolon: "Semicolon (;) - Excel NL",
    ownerScope: "Owners for",
    allLitters: "All litters",
    unassigned: "Without litter",
    searchOwners: "Search by name, contact details or puppy",
    showCompleted: "Show completed and archived dossiers",
    noMatchingOwners: "No owners match this selection.",
    dossierLitter: "Dossier for litter",
    placementNotes: "Notes for this litter",
    archived: "Archive dossier",
    assignDossier: "Assign dossier to litter",
    addDossier: "Add litter dossier",
    archivedColumn: "Archived",
    chooseLitter: "Choose a litter",
    yes: "Yes",
    no: "No",
  },
};

function text(card, key) {
  const language = languageForHass(card?._hass);
  return COPY[language]?.[key] || COPY.nl[key] || key;
}

function optionLabel(card, value, labels, fallback = "") {
  const language = languageForHass(card?._hass);
  return labels[value]?.[language] || labels[value]?.nl || labels[fallback]?.[language] || labels[fallback]?.nl || fallback || value || text(card, "unknown");
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
    this._matrixSelectedOwner = "";
    this._matrixPerspective = "puppy";
    this._matrixSelection = null;
    this._editing = null;
    this._expandedOwnerId = null;
    this._ownerGroups = new Map();
    this._showOwnerEditor = false;
    this._status = "";
    this._error = "";
    this._loaded = false;
    this._loading = false;
    this._busy = false;
    this._formState = new FormState(this);
    this._linkFormState = new FormState(this);
    this._ownerScope = null;
    this._ownerSearch = "";
    this._showCompleted = false;
    this._detailLitters = new Map();
    this._editingLitter = "";
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
    if (value?.user?.is_admin === false) {
      this._formState.reset();
      this._linkFormState.reset();
      this._owners = [];
      this._puppies = [];
      this._litters = [];
      this._ownerGroups.clear();
      this._editing = null;
      this._detailLitters.clear();
      this._ownerSearch = "";
      this._loaded = false;
      this._render();
      return;
    }
    if (this._config && !this._loaded && !this._loading) this._load();
  }

  connectedCallback() {
    if (this._hass && !this._loaded && !this._loading) this._load();
  }

  getCardSize() { return 7; }
  getGridOptions() { return { columns: 12, min_columns: 6 }; }

  async _load(force = false) {
    if (!this._hass || this._hass.user?.is_admin === false || this._loading || (this._loaded && !force)) return false;
    this._loading = true;
    this._error = "";
    this._render();
    try {
      const [ownerResult, litterResult] = await Promise.all([
        this._hass.callWS({ type: "puppy_tracker/owners/list" }),
        this._hass.callWS({ type: "puppy_tracker/litters" }),
      ]);
      if (this._hass?.user?.is_admin === false) return false;
      this._owners = ownerResult?.owners || [];
      this._litters = litterResult?.litters || [];
      if (!this._litters.some((litter) => litter.id === this._selectedLitter)) {
        this._selectedLitter = this._litters.find((litter) => litter.active !== false)?.id || this._litters[0]?.id || "";
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
      if (this._hass?.user?.is_admin === false) return false;
      this._puppies = data.flat();
      if (this._ownerScope === null) this._ownerScope = this._litters.find((litter) => litter.active !== false)?.id || "__unassigned__";
      if (!["__all__", "__unassigned__"].includes(this._ownerScope) && !this._litters.some((litter) => litter.id === this._ownerScope)) this._ownerScope = "__all__";
      const selectedLitterPuppies = this._puppies.filter((puppy) => puppy.litter_id === this._selectedLitter);
      if (!selectedLitterPuppies.some((puppy) => puppy.id === this._matrixSelectedPuppy)) {
        this._matrixSelectedPuppy = selectedLitterPuppies[0]?.id || "";
      }
      this._loaded = true;
      if (this._expandedOwnerId && !this._owners.some((owner) => owner.id === this._expandedOwnerId)) this._expandedOwnerId = null;
      return true;
    } catch (error) {
      this._error = error?.message || String(error);
      return false;
    } finally {
      this._loading = false;
      this._render();
    }
  }

  async _save(form) {
    if (this._busy) return;
    this._formState.clearErrors();
    const data = Object.fromEntries(new FormData(form).entries());
    for (const field of ["payment_amount", "registration_fee_amount", "deposit_amount", "payment_balance"]) {
      if (!String(data[field] || "").trim()) continue;
      const amount = numericAmount(data[field]);
      if (amount === null || amount < 0) {
        this._formState.error(`[name="${field}"]`, languageForHass(this._hass) === "en" ? "Enter a valid non-negative amount." : "Vul een geldig bedrag van nul of hoger in.");
        return;
      }
    }
    const total = numericAmount(data.payment_amount);
    const paidCents = Math.round(((numericAmount(data.registration_fee_amount) || 0) + (numericAmount(data.deposit_amount) || 0) + Number.EPSILON) * 100);
    if (total !== null && paidCents > Math.round((total + Number.EPSILON) * 100)) {
      this._formState.error('[name="deposit_amount"]', languageForHass(this._hass) === "en" ? "Registration fee and deposit cannot exceed the total amount." : "Inschrijfgeld en aanbetaling mogen samen niet hoger zijn dan het totaalbedrag.");
      return;
    }
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
    data.litter_id = this._editingLitter || null;
    data.archived = form.elements.archived.checked;
    if (this._editing) data.owner_id = this._editing;
    this._busy = true;
    this._error = "";
    this._render();
    try {
      const result = await this._hass.callWS({ type: "puppy_tracker/owners/save", ...data });
      this._lastSavedOwnerId = result?.owner?.id || this._editing;
      this._lastSavedLitter = this._editingLitter;
      this._ownerScope = this._editingLitter || "__unassigned__";
      if (data.archived || ["sold", "placed"].includes(data.placement_status)) this._showCompleted = true;
      this._formState.reset();
      this._editing = null;
      this._showOwnerEditor = false;
      this._status = `${text(this, "saved")} ${data.name || ""}`;
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
    this._render();
    try {
      await this._hass.callWS({ type: "puppy_tracker/owners/delete", owner_id: id });
      if (this._editing === id) { this._formState.reset(); this._editing = null; this._showOwnerEditor = false; }
      this._expandedOwnerId = null;
      this._lastSavedOwnerId = null;
      this._status = text(this, "deleted");
      this._loaded = false;
      await this._load();
    } catch (error) {
      this._error = error?.code === "owner_linked" ? text(this, "unlinkBeforeDelete") : error?.message || String(error);
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
    this._render();
    try {
      await this._hass.callWS({ type: "puppy_tracker/owners/link", litter_id: puppy.litter_id, puppy_id: puppy.id, owner_ids: ownerIds });
      this._linkFormState.reset();
      this._lastSavedOwnerId = null;
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

  _linkedPuppiesLabel(ownerId) {
    return this._linkedPuppies(ownerId).filter((puppy) => [null, "__all__"].includes(this._ownerScope) || puppy.litter_id === this._ownerScope).map((puppy) => {
      const label = puppySelectorLabel(puppy, text(this, "puppy"));
      return puppy.litter_name ? `${label} (${puppy.litter_name})` : label;
    }).join(", ");
  }

  _ownerForLitter(owner, litterId) {
    return { ...owner, ...(litterId ? owner.placements?.[litterId] : owner.unassigned_placement) };
  }

  _litterLabel(litterId) {
    return litterId ? this._litters.find((litter) => litter.id === litterId)?.name || text(this, "unavailableLitter") : text(this, "unassigned");
  }

  _ownerLitterIds(owner) {
    const ids = new Set(Object.keys(owner.placements || {}));
    this._linkedPuppies(owner.id).forEach((puppy) => ids.add(puppy.litter_id));
    if (owner.unassigned_placement || !ids.size) ids.add("");
    return [...ids];
  }

  _visibleLitterIds(owner) {
    return this._ownerLitterIds(owner).filter((id) => {
      if (this._ownerScope !== "__all__" && id !== (this._ownerScope === "__unassigned__" ? "" : this._ownerScope)) return false;
      const dossier = this._ownerForLitter(owner, id);
      return this._showCompleted || (!dossier.archived && !["sold", "placed"].includes(dossier.placement_status));
    });
  }

  _visibleOwners() {
    const query = this._ownerSearch.trim().toLocaleLowerCase();
    return this._owners.filter((owner) => this._visibleLitterIds(owner).length && (!query ||
      [owner.name, owner.email, owner.phone, this._linkedPuppies(owner.id).map((puppy) => puppySelectorLabel(puppy)).join(" ")].join(" ").toLocaleLowerCase().includes(query)));
  }

  _detailLitter(owner) {
    const visible = this._visibleLitterIds(owner);
    const selected = this._detailLitters.get(owner.id);
    return visible.includes(selected) ? selected : visible[0] || "";
  }

  _ownerFilters() {
    const disabled = this._busy || this._showOwnerEditor ? "disabled" : "";
    const options = [
      ["__all__", text(this, "allLitters")],
      ...this._litters.map((litter) => [litter.id, litter.name]),
      ["__unassigned__", `${text(this, "unassigned")} (${this._owners.filter((owner) => this._ownerLitterIds(owner).includes("")).length})`],
    ].map(([id, label]) => `<option value="${escapeHtml(id)}" ${id === this._ownerScope ? "selected" : ""}>${escapeHtml(label)}</option>`).join("");
    return `<div class="owner-filters"><label><span>${escapeHtml(text(this, "ownerScope"))}</span><select id="owner-scope" ${disabled}>${options}</select></label><label><span>${escapeHtml(text(this, "searchOwners"))}</span><input id="owner-search" type="search" value="${escapeHtml(this._ownerSearch)}" ${disabled}></label><label class="completed-toggle"><input id="owner-show-completed" type="checkbox" ${this._showCompleted ? "checked" : ""} ${disabled}>${escapeHtml(text(this, "showCompleted"))}</label></div>`;
  }

  async _assignDossier(ownerId, litterId) {
    if (!litterId || this._busy) return;
    const owner = this._owners.find((item) => item.id === ownerId);
    this._busy = true;
    this._error = "";
    this._render();
    try {
      await this._hass.callWS({ type: "puppy_tracker/owners/save", owner_id: ownerId, name: owner.name, litter_id: litterId, move_unassigned: true });
      this._lastSavedOwnerId = ownerId;
      this._lastSavedLitter = litterId;
      this._ownerScope = litterId;
      this._detailLitters.set(ownerId, litterId);
      this._status = text(this, "linked");
      await this._load(true);
    } catch (error) {
      this._error = error?.message || String(error);
    } finally {
      this._busy = false;
      this._render();
    }
  }

  _puppyPreferenceLabel(puppyId, includeCollar = true) {
    const puppy = this._puppies.find((item) => item.id === puppyId);
    if (!puppy) return text(this, "unavailablePuppy");
    return [puppy.litter_name, includeCollar ? puppySelectorLabel(puppy, text(this, "puppy")) : puppy.name || text(this, "puppy")].filter(Boolean).join(" · ");
  }

  _puppyPreferenceOptions(selectedId) {
    const puppies = this._puppies.filter((puppy) => !this._editingLitter || puppy.litter_id === this._editingLitter).sort((left, right) =>
      `${left.litter_name || ""}\u0000${left.name || ""}`.localeCompare(`${right.litter_name || ""}\u0000${right.name || ""}`),
    );
    const options = puppies.map((puppy) => `<option value="${escapeHtml(puppy.id)}" ${puppy.id === selectedId ? "selected" : ""}>${escapeHtml([puppy.litter_name, puppySelectorLabel(puppy, text(this, "puppy"))].filter(Boolean).join(" · "))}</option>`);
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

    const owners = this._owners.map((owner) => this._ownerForLitter(owner, this._selectedLitter)).filter((owner) => {
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
      const belongsInLitter = Boolean(owner.placements?.[this._selectedLitter]) || linkedPuppyIds.size > 0;
      if (!belongsInLitter) return false;
      if (!this._matrixShowResolved && (owner.archived || resolvedStatuses.has(owner.placement_status))) return false;
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
    if (!visibleOwners.some((owner) => owner.id === this._matrixSelectedOwner)) {
      this._matrixSelectedOwner = visibleOwners[0]?.id || "";
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
    return `<div class="matrix-puppy"><span class="collar-swatch" style="--collar-color:${escapeHtml(color)}" title="${escapeHtml(`${text(this, "puppyCollarColor")}: ${colorName}`)}" aria-hidden="true"></span><span><strong>${escapeHtml(puppySelectorLabel(puppy, text(this, "puppy")))}</strong></span></div>`;
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
    return `<td><button type="button" class="matrix-cell${conflict ? " conflict" : ""}${selected ? " selected" : ""}" data-matrix-owner="${escapeHtml(owner.id)}" data-matrix-puppy="${escapeHtml(puppy.id)}" aria-pressed="${selected}" aria-label="${escapeHtml(`${owner.name} · ${puppySelectorLabel(puppy, text(this, "puppy"))} · ${description}`)}" title="${escapeHtml(description)}">${preference ? `<span class="rank rank-${preference.rank}">${escapeHtml(this._rankLabel(preference.rank, true))}</span>` : ""}${preference?.note ? `<ha-icon class="cell-icon" icon="mdi:note-text-outline" aria-hidden="true"></ha-icon>` : ""}${linked ? `<ha-icon class="cell-icon linked-icon" icon="mdi:link-variant" aria-hidden="true"></ha-icon>` : ""}${conflict ? `<ha-icon class="cell-icon conflict-icon" icon="mdi:alert-circle-outline" aria-hidden="true"></ha-icon>` : ""}</button></td>`;
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
    const perspective = `<div class="matrix-perspective" role="group" aria-label="${escapeHtml(text(this, "matrixView"))}">${["puppy", "owner"].map((mode) => `<button type="button" data-matrix-perspective="${mode}" aria-pressed="${this._matrixPerspective === mode}">${escapeHtml(text(this, mode === "puppy" ? "perPuppy" : "perOwner"))}</button>`).join("")}</div>`;
    if (this._matrixPerspective === "owner") {
      const owner = model.owners.find((item) => item.id === this._matrixSelectedOwner);
      if (!owner) return `<div class="matrix-mobile">${perspective}<div class="empty">${escapeHtml(text(this, "matrixEmpty"))}</div></div>`;
      const matches = model.puppies.map((puppy) => ({
        owner, puppy,
        preference: model.preferencesByOwner.get(owner.id)?.get(puppy.id),
        linked: model.linksByOwner.get(owner.id)?.has(puppy.id) || false,
      })).filter((item) => item.preference || item.linked).sort((left, right) =>
        (left.preference?.rank || 99) - (right.preference?.rank || 99)
        || String(left.puppy.name || "").localeCompare(String(right.puppy.name || "")),
      );
      const options = model.owners.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === owner.id ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("");
      return `<div class="matrix-mobile">${perspective}<label class="mobile-puppy-select"><span>${escapeHtml(text(this, "matrixOwner"))}</span><select id="matrix-owner">${options}</select></label><div class="mobile-matches">${matches.length ? matches.map((match) => this._matrixMobileMatch(match, model)).join("") : `<div class="empty">${escapeHtml(text(this, "noPuppyPreferences"))}</div>`}</div></div>`;
    }
    const puppy = model.puppies.find((item) => item.id === this._matrixSelectedPuppy) || model.puppies[0];
    const puppyIndex = model.allPuppies.findIndex((item) => item.id === puppy.id);
    const matches = model.owners.map((owner) => ({
      owner,
      puppy,
      preference: model.preferencesByOwner.get(owner.id)?.get(puppy.id),
      linked: model.linksByOwner.get(owner.id)?.has(puppy.id) || false,
    })).filter((item) => item.preference || item.linked).sort((left, right) =>
      (left.preference?.rank || 99) - (right.preference?.rank || 99)
      || String(left.owner.name || "").localeCompare(String(right.owner.name || "")),
    );
    const counts = model.rankCounts.get(puppy.id) || [0, 0, 0];
    const options = model.puppies.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === puppy.id ? "selected" : ""}>${escapeHtml(puppySelectorLabel(item, text(this, "puppy")))}</option>`).join("");
    return `<div class="matrix-mobile">${perspective}<label class="mobile-puppy-select"><span>${escapeHtml(text(this, "puppy"))}</span><select id="matrix-puppy">${options}</select></label><div class="mobile-puppy-head">${this._matrixPuppyHeader(puppy, puppyIndex)}<span>${escapeHtml(text(this, "firstShort"))} ${counts[0]} · ${escapeHtml(text(this, "secondShort"))} ${counts[1]} · ${escapeHtml(text(this, "thirdShort"))} ${counts[2]}</span></div><div class="mobile-matches">${matches.length ? matches.map((match) => this._matrixMobileMatch(match, model)).join("") : `<div class="empty">${escapeHtml(text(this, "noPreferenceForPuppy"))}</div>`}</div></div>`;
  }

  _matrixMobileMatch({ owner, puppy, preference, linked }, model) {
    const selected = this._matrixSelection?.ownerId === owner.id && this._matrixSelection?.puppyId === puppy.id;
    const conflict = preference?.rank === 1 && model.conflictPuppyIds.has(puppy.id);
    const heading = this._matrixPerspective === "owner"
      ? this._matrixPuppyHeader(puppy, model.allPuppies.findIndex((item) => item.id === puppy.id))
      : `<strong>${escapeHtml(owner.name)}</strong>`;
    const indicators = [
      preference?.note ? ["mdi:note-text-outline", "preferenceNote"] : null,
      linked ? ["mdi:link-variant", "linkedStatus"] : null,
      conflict ? ["mdi:alert-circle-outline", "firstChoiceConflicts"] : null,
    ].filter(Boolean).map(([icon, label]) => `<ha-icon icon="${icon}" title="${escapeHtml(text(this, label))}" aria-label="${escapeHtml(text(this, label))}"></ha-icon>`).join("");
    return `<div class="mobile-match-row"><button type="button" class="mobile-match${selected ? " selected" : ""}${conflict ? " conflict" : ""}" data-matrix-owner="${escapeHtml(owner.id)}" data-matrix-puppy="${escapeHtml(puppy.id)}" aria-expanded="${selected}" aria-pressed="${selected}"><span class="mobile-match-rank">${preference ? `<span class="rank rank-${preference.rank}">${preference.rank}</span>` : "—"}</span><span class="mobile-match-main">${heading}<small>${escapeHtml(optionLabel(this, owner.placement_status, PLACEMENT_STATUS_LABELS, "interested"))}</small></span><span class="mobile-match-icons">${indicators}<ha-icon icon="mdi:chevron-down" aria-hidden="true"></ha-icon></span></button><section class="matrix-detail mobile-match-detail" data-detail-owner="${escapeHtml(owner.id)}" data-detail-puppy="${escapeHtml(puppy.id)}" ${selected ? "" : "hidden"}>${selected ? this._matrixDetailsMarkup() : ""}</section></div>`;
  }

  _matrixDetailsMarkup() {
    if (!this._matrixSelection) return "";
    const contact = this._owners.find((item) => item.id === this._matrixSelection.ownerId);
    const owner = contact ? this._ownerForLitter(contact, this._selectedLitter) : null;
    const puppy = this._puppies.find((item) => item.id === this._matrixSelection.puppyId);
    if (!owner || !puppy) return "";
    const preferences = Array.isArray(owner.puppy_preferences) ? owner.puppy_preferences : [];
    const index = preferences.findIndex((preference) => preference.puppy_id === puppy.id);
    const preference = index >= 0 ? preferences[index] : null;
    const linked = (puppy.owner_ids || []).includes(owner.id);
    const fields = [
      ["preferenceRank", preference ? this._rankLabel(index + 1) : "—"],
      ["placementStatus", optionLabel(this, owner.placement_status, PLACEMENT_STATUS_LABELS, "interested")],
      ["linkedPuppies", text(this, linked ? "linkedStatus" : "notLinkedStatus")],
      ["email", owner.email],
      ["phone", owner.phone],
    ];
    return `<div class="matrix-detail-content"><div><span>${escapeHtml(text(this, "preferenceDetails"))}</span><strong>${escapeHtml(owner.name)} · ${escapeHtml(puppySelectorLabel(puppy, text(this, "puppy")))}</strong></div><dl>${fields.map(([label, value]) => `<div><dt>${escapeHtml(text(this, label))}</dt><dd>${escapeHtml(value || "—")}</dd></div>`).join("")}<div class="detail-note"><dt>${escapeHtml(text(this, "preferenceNote"))}</dt><dd>${escapeHtml(preference?.note || "—")}</dd></div></dl><button type="button" class="secondary" data-matrix-edit-owner="${escapeHtml(owner.id)}"><ha-icon icon="mdi:pencil-outline"></ha-icon>${escapeHtml(text(this, "editFromMatrix"))}</button></div>`;
  }

  _matrixView() {
    if (!this._litters.length) return `<section class="matrix-view"><div class="empty matrix-empty-state">${escapeHtml(text(this, this._loading ? "matrixLoading" : "matrixNoLitters"))}</div></section>`;
    const model = this._matrixModel();
    const litterOptions = this._litters.map((litter) => `<option value="${escapeHtml(litter.id)}" ${litter.id === this._selectedLitter ? "selected" : ""}>${escapeHtml(litter.name || text(this, "litter"))}</option>`).join("");
    const details = this._matrixDetailsMarkup();
    return `<section class="matrix-view"><div class="matrix-controls"><label><span>${escapeHtml(text(this, "matrixLitter"))}</span><select id="matrix-litter">${litterOptions}</select></label><label class="matrix-toggle"><input id="matrix-show-resolved" type="checkbox" ${this._matrixShowResolved ? "checked" : ""}><span>${escapeHtml(text(this, "showResolved"))}</span></label><label class="matrix-toggle"><input id="matrix-only-conflicts" type="checkbox" ${this._matrixOnlyConflicts ? "checked" : ""}><span>${escapeHtml(text(this, "onlyConflicts"))}</span></label></div>${model.allPuppies.length ? this._matrixSummary(model) : ""}<div class="matrix-layout">${this._matrixDesktop(model)}${this._matrixMobile(model)}<div class="matrix-detail-region"><section id="matrix-detail" class="matrix-detail" ${details ? "" : "hidden"}>${details}</section></div></div></section>`;
  }

  _selectMatrixCell(ownerId, puppyId) {
    const selected = this._matrixSelection?.ownerId === ownerId && this._matrixSelection?.puppyId === puppyId;
    this._matrixSelection = selected ? null : { ownerId, puppyId };
    this.querySelectorAll("[data-matrix-owner]").forEach((button) => {
      const active = !selected && button.dataset.matrixOwner === ownerId && button.dataset.matrixPuppy === puppyId;
      button.classList.toggle("selected", active);
      button.setAttribute("aria-pressed", String(active));
    });
    this.querySelectorAll(".mobile-match[data-matrix-owner]").forEach((button) => {
      button.setAttribute("aria-expanded", button.getAttribute("aria-pressed"));
    });
    this.querySelectorAll("#matrix-detail, .mobile-match-detail").forEach((details) => {
      const active = this._matrixSelection && (details.id === "matrix-detail"
        || (details.dataset.detailOwner === ownerId && details.dataset.detailPuppy === puppyId));
      details.innerHTML = active ? this._matrixDetailsMarkup() : "";
      details.hidden = !active;
      details.querySelector("[data-matrix-edit-owner]")?.addEventListener("click", (event) => this._openEditor(event.currentTarget.dataset.matrixEditOwner));
    });
  }

  _switchView(view) {
    if (!["owners", "matrix"].includes(view) || view === this._activeView || this._showOwnerEditor) return;
    this._activeView = view;
    this._matrixSelection = null;
    this._status = "";
    this._error = "";
    this._render();
  }

  _changeLitter(litterId, scope = null) {
    if (litterId !== this._selectedLitter && !this._linkFormState.discard()) return false;
    if (litterId !== this._selectedLitter) {
      this._selectedLitter = litterId;
      this._selectedPuppy = "";
      this._matrixSelectedPuppy = "";
      this._matrixSelection = null;
    }
    this._ownerScope = scope ?? (["__all__", "__unassigned__"].includes(this._ownerScope) ? this._ownerScope : litterId);
    this._render();
    return true;
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
      "motherCallName", "motherBirthDate", "motherBreed", "motherWala", "motherChipNumber", "placementNotes", "archivedColumn",
    ].map((key) => text(this, key));
    const rows = [headers];
    for (const contact of this._visibleOwners()) {
      for (const litterId of this._visibleLitterIds(contact)) {
        const owner = this._ownerForLitter(contact, litterId);
        const history = (owner.status_history || []).map((entry) => {
          const status = optionLabel(this, entry.status, PLACEMENT_STATUS_LABELS, entry.status);
          return `${status} · ${formattedDate(this, entry.changed_at, true)}`;
        }).join(" | ");
        const puppyPreferences = Array.isArray(owner.puppy_preferences) ? owner.puppy_preferences.slice(0, 3) : [];
        const preferenceValues = [0, 1, 2].flatMap((index) => {
          const preference = puppyPreferences[index];
          return preference ? [this._puppyPreferenceLabel(preference.puppy_id, false), preference.note] : ["", ""];
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
        const linkedPuppies = this._linkedPuppies(owner.id).filter((puppy) => puppy.litter_id === litterId).sort((left, right) =>
          `${left.litter_name || ""}\u0000${left.name || ""}`.localeCompare(`${right.litter_name || ""}\u0000${right.name || ""}`),
        );
        for (const puppy of linkedPuppies.length ? linkedPuppies : [null]) {
          rows.push([
            ...ownerValues,
            puppy?.litter_name || (litterId ? this._litterLabel(litterId) : ""),
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
            owner.placement_notes,
            text(this, owner.archived ? "yes" : "no"),
          ]);
        }
      }
    }
    const delimiter = configuredCsvDelimiter(this._config);
    return `\ufeff${rows.map((row) => row.map(csvCell).join(delimiter)).join("\r\n")}\r\n`;
  }

  async _downloadOwnersCsv() {
    if (!this._owners.length || this._loading) return;
    if (!await this._load(true) || !this._owners.length) return;
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

  _openEditor(ownerId = null, { paidInFull = false, litterId } = {}) {
    if (!this._formState.discard()) return;
    const contact = this._owners.find((item) => item.id === ownerId);
    const scopeLitter = this._litters.some((litter) => litter.id === this._ownerScope) ? this._ownerScope : "";
    const defaultLitter = this._activeView === "matrix" ? this._selectedLitter : contact ? this._detailLitter(contact) : scopeLitter;
    this._editingLitter = litterId ?? defaultLitter;
    this._paymentBeforeFull = null;
    this._lastSavedOwnerId = null;
    this._activeView = "owners";
    this._editing = ownerId;
    this._showOwnerEditor = true;
    this._status = "";
    this._error = "";
    this._render();
    if (paidInFull) {
      this.querySelector('[name="payment_status"]').value = "full";
      this._syncPaymentStatus(true);
    }
    queueMicrotask(() => this.querySelector(paidInFull ? '[name="payment_date"]' : 'input[name="name"]')?.focus({ preventScroll: true }));
  }

  _detail(label, value, className = "") {
    return `<div class="${className}"><span>${escapeHtml(label)}</span><div>${escapeHtml(value ?? "—")}</div></div>`;
  }

  _ownerDetails(owner) {
    const litterId = this._detailLitter(owner);
    const contact = owner;
    owner = this._ownerForLitter(owner, litterId);
    const linked = this._linkedPuppies(owner.id).filter((puppy) => puppy.litter_id === litterId).map((puppy) => puppySelectorLabel(puppy, text(this, "puppy"))).join(", ") || text(this, "noLinkedPuppies");
    const litterOptions = this._visibleLitterIds(contact).map((id) => `<option value="${escapeHtml(id)}" ${id === litterId ? "selected" : ""}>${escapeHtml(this._litterLabel(id))}</option>`).join("");
    const assignable = this._litters.filter((litter) => !contact.placements?.[litter.id]);
    const addDossier = assignable.length && (litterId || !contact.unassigned_placement) ? `<button type="button" class="secondary" data-add-dossier="${escapeHtml(owner.id)}" ${this._busy ? "disabled" : ""}><ha-icon icon="mdi:folder-plus-outline"></ha-icon>${escapeHtml(text(this, "addDossier"))}</button>` : "";
    const assign = !litterId && contact.unassigned_placement && assignable.length ? `<div class="assign-dossier"><label><span>${escapeHtml(text(this, "dossierLitter"))}</span><select data-assign-litter="${escapeHtml(owner.id)}"><option value="">${escapeHtml(text(this, "chooseLitter"))}</option>${assignable.map((litter) => `<option value="${escapeHtml(litter.id)}">${escapeHtml(litter.name)}</option>`).join("")}</select></label><button type="button" class="secondary" data-assign-owner="${escapeHtml(owner.id)}" ${this._busy ? "disabled" : ""}><ha-icon icon="mdi:link-variant"></ha-icon>${escapeHtml(text(this, "assignDossier"))}</button></div>` : "";
    const history = (owner.status_history || []).map((entry) => `${optionLabel(this, entry.status, PLACEMENT_STATUS_LABELS, entry.status)} · ${formattedDate(this, entry.changed_at, true)}`).join("\n") || "—";
    const group = (key, title, fields, defaultOpen = false) => {
      const open = this._ownerGroups.get(owner.id)?.[key] ?? defaultOpen;
      return `<details class="owner-detail-group" data-owner-group="${key}" data-group-owner="${escapeHtml(owner.id)}" ${open ? "open" : ""}><summary>${escapeHtml(text(this, title))}</summary><div class="owner-detail-fields">${fields}</div></details>`;
    };
    return `<div class="owner-detail" id="owner-detail-${escapeHtml(owner.id)}">
      <div class="dossier-controls"><label class="dossier-select"><span>${escapeHtml(text(this, "dossierLitter"))}</span><select data-owner-dossier="${escapeHtml(owner.id)}">${litterOptions}</select></label>${addDossier}</div>${assign}
      ${group("contact", "contactDetails", `
      ${this._detail(text(this, "name"), owner.name)}
      ${this._detail(text(this, "role"), optionLabel(this, owner.role, OWNER_ROLE_LABELS, "owner"))}
      ${this._detail(text(this, "email"), owner.email || "—")}
      ${this._detail(text(this, "phone"), owner.phone || "—")}
      ${this._detail(text(this, "contactPreference"), optionLabel(this, owner.contact_preference, CONTACT_PREFERENCE_LABELS, "none"))}
      `, true)}
      ${group("address", "addressDetails", `
      ${this._detail(text(this, "street"), owner.street || owner.address || "—")}
      ${this._detail(text(this, "postalCode"), owner.postal_code || "—")}
      ${this._detail(text(this, "city"), owner.city || "—")}
      `)}
      ${group("placement", "placementDetails", `
      ${this._detail(text(this, "placementStatus"), optionLabel(this, owner.placement_status, PLACEMENT_STATUS_LABELS, "interested"))}
      ${this._detail(text(this, "placementDate"), formattedDate(this, owner.placement_date))}
      ${this._detail(text(this, "expectedPickupDate"), formattedDate(this, owner.expected_pickup_date))}
      ${this._detail(text(this, "linkedPuppies"), linked, "wide")}
      ${this._detail(text(this, "placementNotes"), owner.placement_notes || "—", "wide preformatted")}
      `, true)}
      ${group("preferences", "puppyPreferences", this._puppyPreferenceDetails(owner))}
      ${group("financial", "financialDetails", `
      ${this._detail(text(this, "paymentStatus"), optionLabel(this, owner.payment_status, PAYMENT_STATUS_LABELS, "none"))}
      ${this._detail(text(this, "paymentAmount"), owner.payment_amount ?? "—")}
      ${this._detail(text(this, "registrationFeeAmount"), owner.registration_fee_amount ?? "—")}
      ${this._detail(text(this, "depositAmount"), owner.deposit_amount ?? "—")}
      ${this._detail(text(this, "depositDate"), formattedDate(this, owner.deposit_date))}
      ${this._detail(text(this, "finalPaymentAmount"), finalPaymentAmount(owner) || "—")}
      ${this._detail(text(this, "paymentMethod"), optionLabel(this, owner.payment_method, PAYMENT_METHOD_LABELS, "none"))}
      ${this._detail(text(this, "paymentBalance"), owner.payment_balance ?? "—")}
      ${this._detail(text(this, "paymentDate"), formattedDate(this, owner.payment_date))}
      ${owner.payment_status !== "full" ? `<div class="wide"><button type="button" class="secondary" data-mark-paid="${escapeHtml(owner.id)}" ${this._busy ? "disabled" : ""}><ha-icon icon="mdi:cash-check"></ha-icon>${escapeHtml(text(this, "markPaidInFull"))}</button></div>` : ""}
      `)}
      ${group("notes", "notes", this._detail(text(this, "notes"), owner.notes || "—", "wide notes preformatted"), true)}
      ${group("history", "statusHistory", this._detail(text(this, "statusHistory"), history, "wide preformatted"))}
    </div>`;
  }

  _ownerList() {
    if (!this._owners.length) return `<div class="empty">${escapeHtml(text(this, this._loading ? "loading" : "empty"))}</div>`;
    const owners = this._visibleOwners();
    if (!owners.length) return `<div class="empty">${escapeHtml(text(this, "noMatchingOwners"))}</div>`;
    return owners.map((owner) => {
      const expanded = owner.id === this._expandedOwnerId;
      const contact = [owner.email, owner.phone].filter(Boolean).join(" · ") || text(this, "noContact");
      const linked = this._linkedPuppiesLabel(owner.id);
      const dossiers = this._visibleLitterIds(owner).map((id) => {
        const dossier = this._ownerForLitter(owner, id);
        return [this._litterLabel(id), optionLabel(this, dossier.placement_status, PLACEMENT_STATUS_LABELS, "interested"), dossier.archived ? text(this, "archivedColumn") : ""].filter(Boolean).join(" · ");
      }).join(", ");
      return `<article class="owner" data-owner="${escapeHtml(owner.id)}">
        <button type="button" class="owner-toggle" data-toggle-owner="${escapeHtml(owner.id)}" aria-expanded="${expanded}" aria-controls="owner-detail-${escapeHtml(owner.id)}"><span><strong>${escapeHtml(owner.name)}</strong><small>${escapeHtml(contact)}</small><small>${escapeHtml(dossiers)}</small>${linked ? `<small class="owner-puppies">${escapeHtml(text(this, "linkedPuppies"))}: ${escapeHtml(linked)}</small>` : ""}</span><ha-icon icon="mdi:chevron-${expanded ? "up" : "down"}"></ha-icon></button>
        <div class="owner-actions"><button type="button" data-edit="${escapeHtml(owner.id)}" title="${escapeHtml(text(this, "edit"))}" aria-label="${escapeHtml(text(this, "edit"))}"><ha-icon icon="mdi:pencil-outline"></ha-icon></button><button type="button" data-delete="${escapeHtml(owner.id)}" title="${escapeHtml(text(this, "remove"))}" aria-label="${escapeHtml(text(this, "remove"))}"><ha-icon icon="mdi:delete-outline"></ha-icon></button></div>
        ${expanded ? this._ownerDetails(owner) : ""}
      </article>`;
    }).join("");
  }

  _ownerForm() {
    if (!this._showOwnerEditor) return `<button type="button" id="add-owner" class="primary add-owner"><ha-icon icon="mdi:plus"></ha-icon>${escapeHtml(text(this, "addOwner"))}</button>`;
    const contact = this._owners.find((item) => item.id === this._editing) || {};
    const owner = this._ownerForLitter(contact, this._editingLitter);
    const litterOptions = [["", text(this, "unassigned")], ...this._litters.map((litter) => [litter.id, litter.name])].map(([id, label]) => `<option value="${escapeHtml(id)}" ${id === this._editingLitter ? "selected" : ""}>${escapeHtml(label)}</option>`).join("");
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
      <label class="wide"><span>${escapeHtml(text(this, "dossierLitter"))}</span><select id="owner-litter" data-draft-ignore ${this._busy ? "disabled" : ""}>${litterOptions}</select></label>
      ${selectField(this, "placement_status", text(this, "placementStatus"), PLACEMENT_STATUS_LABELS, owner.placement_status || "interested")}
      <label><span>${escapeHtml(text(this, "placementDate"))}</span><input name="placement_date" type="date" value="${escapeHtml(owner.placement_date || "")}"></label>
      <label><span>${escapeHtml(text(this, "expectedPickupDate"))}</span><input name="expected_pickup_date" type="date" value="${escapeHtml(owner.expected_pickup_date || "")}"></label>
      <h4 class="form-heading">${escapeHtml(text(this, "puppyPreferences"))}</h4>
      ${this._puppyPreferenceFields(owner)}
      <label class="wide"><span>${escapeHtml(text(this, "placementNotes"))}</span><textarea name="placement_notes" rows="3">${escapeHtml(owner.placement_notes || "")}</textarea></label>
      <label class="completed-toggle wide"><input name="archived" type="checkbox" ${owner.archived ? "checked" : ""}>${escapeHtml(text(this, "archived"))}</label>
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
    const owners = this._owners.filter((owner) => linked.has(owner.id) || ((owner.placements?.[this._selectedLitter] || this._ownerLitterIds(owner).includes("")) && !this._ownerForLitter(owner, this._selectedLitter).archived));
    return `<section class="link"><h3>${escapeHtml(text(this, "linkTitle"))}</h3><div class="link-form"><label><span>${escapeHtml(text(this, "litter"))}</span><select id="link-litter">${litterOptions}</select></label><label><span>${escapeHtml(text(this, "puppy"))}</span><select id="link-puppy" ${litterPuppies.length ? "" : "disabled"}>${puppyOptions}</select></label><fieldset class="checks"><legend>${escapeHtml(text(this, "owners"))}</legend>${owners.map((owner) => `<label><input type="checkbox" name="linked_owner" value="${escapeHtml(owner.id)}" ${linked.has(owner.id) ? "checked" : ""}>${escapeHtml(owner.name)}</label>`).join("") || `<span class="empty">${escapeHtml(text(this, "noMatchingOwners"))}</span>`}</fieldset></div><div class="actions"><button type="button" id="link-save" class="primary" ${!puppy || this._busy ? "disabled" : ""}>${escapeHtml(text(this, "linkSave"))}</button></div></section>`;
  }

  _updateFinalPaymentPreview() {
    const form = this.querySelector(".owner-editor form");
    const output = this.querySelector("#final-payment-amount");
    if (!form || !output) return;
    output.textContent = finalPaymentAmount(Object.fromEntries(new FormData(form).entries())) || "—";
  }

  _syncPaymentStatus(markPaid = false) {
    const form = this.querySelector(".owner-editor form");
    if (!form) return;
    const paid = form.elements.payment_status.value === "full";
    const balance = form.elements.payment_balance;
    const date = form.elements.payment_date;
    if (paid && markPaid && !balance.readOnly) this._paymentBeforeFull = { balance: balance.value, date: date.value };
    if (paid) {
      balance.value = "0";
      if (markPaid && !date.value) {
        const now = new Date();
        date.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
        if (this._paymentBeforeFull) this._paymentBeforeFull.automaticDate = date.value;
      }
    } else if (this._paymentBeforeFull) {
      balance.value = this._paymentBeforeFull.balance;
      if (date.value === this._paymentBeforeFull.automaticDate) date.value = this._paymentBeforeFull.date;
      this._paymentBeforeFull = null;
    }
    balance.readOnly = paid;
    this._formState.capture();
  }

  _render() {
    preserveScrollPosition(this, () => this._renderContent());
  }

  _renderContent() {
    if (!this._config) return;
    const listScroll = this.querySelector(".list")?.scrollTop || 0;
    this._formState.capture();
    this._linkFormState.capture();
    if (this._hass?.user?.is_admin === false) {
      this.innerHTML = `<ha-card style="display:block;padding:16px"><div role="status">${escapeHtml(text(this, "adminOnly"))}</div></ha-card>`;
      return;
    }
    this.querySelectorAll("[data-owner-group]").forEach((group) => {
      const state = this._ownerGroups.get(group.dataset.groupOwner) || {};
      state[group.dataset.ownerGroup] = group.open;
      this._ownerGroups.set(group.dataset.groupOwner, state);
    });
    const ownerIds = new Set(this._owners.map((owner) => owner.id));
    for (const id of this._ownerGroups.keys()) if (!ownerIds.has(id)) this._ownerGroups.delete(id);
    const litterPuppies = this._puppies.filter((item) => item.litter_id === this._selectedLitter);
    const puppy = litterPuppies.find((item) => item.id === this._selectedPuppy) || litterPuppies[0] || null;
    this._selectedPuppy = puppy?.id || "";
    const linked = new Set(puppy?.owner_ids || []);
    const litterOptions = this._litters.map((litter) => `<option value="${escapeHtml(litter.id)}" ${litter.id === this._selectedLitter ? "selected" : ""}>${escapeHtml(litter.name || text(this, "litter"))}</option>`).join("");
    const puppyOptions = litterPuppies.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === this._selectedPuppy ? "selected" : ""}>${escapeHtml(puppySelectorLabel(item, text(this, "puppy")))}</option>`).join("");

    const ownersView = this._activeView !== "matrix";
    const headerActions = `<div class="head-actions"><button type="button" id="export-owners-csv" class="secondary" ${!this._owners.length || this._loading ? "disabled" : ""}><ha-icon icon="mdi:file-delimited-outline"></ha-icon>${escapeHtml(text(this, "exportCsv"))}</button>${ownersView && !this._showOwnerEditor ? this._ownerForm() : ""}</div>`;
    const viewTabs = `<div class="view-tabs" role="tablist" aria-label="${escapeHtml(text(this, "title"))}"><button type="button" id="owners-view" role="tab" aria-selected="${ownersView}" class="${ownersView ? "active" : ""}"><ha-icon icon="mdi:account-multiple-outline"></ha-icon>${escapeHtml(text(this, "ownersView"))}</button><button type="button" id="matrix-view" role="tab" aria-selected="${!ownersView}" class="${ownersView ? "" : "active"}" ${this._showOwnerEditor ? "disabled" : ""}><ha-icon icon="mdi:table-large"></ha-icon>${escapeHtml(text(this, "matrixView"))}</button></div>`;
    const ownersContent = `${this._showOwnerEditor ? this._ownerForm() : ""}${this._ownerFilters()}<section class="list" aria-live="polite">${this._ownerList()}</section>${this._linkSection(litterPuppies, puppy, linked, litterOptions, puppyOptions)}`;
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
      .form input[readonly]{background:var(--secondary-background-color)}
      .form textarea{min-height:112px;resize:vertical}
      .wide,.checks{grid-column:1/-1}
      .preferences{display:grid;gap:8px}
      .preference-row{min-width:0;margin:0;padding:8px 10px 10px;border:1px solid var(--divider-color);border-radius:8px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
      .preference-row legend{padding:0 5px;color:var(--primary-text-color);font-size:.8rem;font-weight:600}
      .actions{display:flex;gap:8px;justify-content:flex-end;margin-top:10px}
      .list{display:grid;gap:8px;margin-top:16px}
      .list{max-height:600px;overflow-y:auto;scrollbar-gutter:stable}
      .owner-filters{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:16px}
      .owner-filters label,.dossier-select,.assign-dossier label{display:grid;gap:4px;min-width:0;color:var(--secondary-text-color);font-size:.78rem}
      .owner-filters select,.owner-filters input[type=search],.dossier-select select,.assign-dossier select{box-sizing:border-box;width:100%;min-height:42px;padding:8px;border:1px solid var(--divider-color);border-radius:8px;background:var(--card-background-color);color:var(--primary-text-color);font:inherit}
      .owner-filters .completed-toggle,.form .completed-toggle{display:flex;align-items:center;gap:8px;grid-column:1/-1}
      .completed-toggle input{width:18px;height:18px;min-height:18px;accent-color:var(--primary-color)}
      .dossier-select{margin-bottom:12px}
      .dossier-controls{display:flex;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px}
      .dossier-controls .dossier-select{flex:1 1 160px;margin:0}
      .assign-dossier{display:flex;align-items:end;gap:10px;flex-wrap:wrap;margin-bottom:12px}
      .assign-dossier label{flex:1 1 160px}
      .owner{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;border-top:1px solid var(--divider-color);padding-top:9px}
      .owner-toggle{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0;border:0;background:transparent;color:var(--primary-text-color);padding:5px 2px;text-align:left;font:inherit;cursor:pointer}
      .owner-toggle span{min-width:0}
      .owner-toggle strong,.owner-toggle small{display:block;overflow-wrap:anywhere}
      .owner-toggle small{color:var(--secondary-text-color);margin-top:2px;font-size:.78rem}
      .owner-toggle .owner-puppies{color:var(--primary-text-color);margin-top:5px;font-weight:600}
      .owner-actions{display:flex;gap:5px}
      .owner-actions button{width:38px;padding:0}
      .owner-actions ha-icon{--mdc-icon-size:19px}
      .owner-detail{grid-column:1/-1;min-width:0;font-size:.85rem}
      .owner-detail-group{border-top:1px solid var(--divider-color)}
      .owner-detail-group summary{box-sizing:border-box;min-height:44px;padding:12px 2px;color:var(--primary-text-color);font-weight:600;cursor:pointer;overflow-wrap:anywhere}
      .owner-detail-group summary:focus-visible{outline:2px solid var(--primary-color);outline-offset:2px}
      .owner-detail-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;padding:2px 2px 14px}
      .owner-detail-fields>div{min-width:0;overflow-wrap:anywhere}
      .owner-detail span{display:block;color:var(--secondary-text-color);font-size:.72rem;margin-bottom:3px}
      .owner-detail .wide{grid-column:1/-1}
      .owner-detail .preformatted>div{white-space:pre-wrap;word-break:break-word}
      .owner-detail .notes>div{max-height:none;overflow:visible}
      .checks{min-width:0;margin:2px 0 0;padding:10px;border:1px solid var(--divider-color);border-radius:8px;display:grid;gap:7px;max-height:260px;overflow-y:auto}
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
      .matrix-layout,.matrix-desktop,.matrix-detail-region{min-width:0}
      .matrix-perspective{display:flex;gap:0;margin-bottom:12px}
      .matrix-perspective button{flex:1;min-height:44px;border:1px solid var(--divider-color);border-radius:0;background:transparent;color:var(--primary-text-color);font:inherit;cursor:pointer}
      .matrix-perspective button:first-child{border-radius:8px 0 0 8px}
      .matrix-perspective button:last-child{border-radius:0 8px 8px 0}
      .matrix-perspective button[aria-pressed="true"]{background:var(--primary-color,#039be5);color:var(--text-primary-color,#fff)}
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
      .matrix-detail .detail-note dd{white-space:pre-wrap}
      @container owner-card (min-width:1000px){
        .matrix-layout{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:18px;align-items:start}
        .matrix-detail-region{min-height:180px}
        .matrix-detail{margin-top:0;padding:0 0 0 16px;border-top:0;border-left:1px solid var(--divider-color)}
        .matrix-detail-content{grid-template-columns:1fr}
        .matrix-detail dl{grid-template-columns:repeat(2,minmax(0,1fr))}
        .matrix-detail-content .secondary{justify-self:start}
      }
      @container owner-card (max-width:620px){
        .matrix-controls{display:grid;grid-template-columns:1fr;align-items:stretch}
        .matrix-toggle{min-height:32px}
        .matrix-summary{grid-template-columns:repeat(2,minmax(0,1fr))}
        .matrix-summary>div:nth-child(2){border-right:0}
        .matrix-summary>div:nth-child(-n+2){border-bottom:1px solid var(--divider-color)}
        .matrix-desktop{display:none}
        .matrix-mobile{display:block}
        .matrix-detail-region{display:none}
        .mobile-puppy-select{margin-bottom:10px}
        .mobile-puppy-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid var(--divider-color)}
        .mobile-puppy-head>span{color:var(--secondary-text-color);font-size:.75rem;white-space:nowrap}
        .mobile-matches{display:grid}
        .mobile-match{display:grid;grid-template-columns:42px minmax(0,1fr) auto;gap:9px;align-items:center;box-sizing:border-box;width:100%;min-width:0;min-height:54px;padding:10px 4px;border:1px solid transparent;border-bottom-color:var(--divider-color);background:transparent;color:var(--primary-text-color);text-align:left;font:inherit;cursor:pointer}
        .mobile-match-rank{display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:50%;background:var(--secondary-background-color);font-weight:700}
        .mobile-match-rank ha-icon{--mdc-icon-size:19px;color:var(--primary-color)}
        .mobile-match-main{min-width:0}
        .mobile-match-main strong,.mobile-match-main small,.mobile-match-main>span{display:block;overflow-wrap:anywhere}
        .mobile-match-main small{margin-top:2px;color:var(--secondary-text-color);font-size:.72rem}
        .mobile-match-main>span{margin-top:5px;font-size:.8rem;line-height:1.35}
        .mobile-match-main .matrix-puppy{justify-content:flex-start}
        .mobile-match-icons{display:flex;gap:3px;align-items:center;flex-wrap:wrap;max-width:84px}
        .mobile-match-icons ha-icon{display:inline-flex;width:18px;height:18px;--mdc-icon-size:18px}
        .mobile-match[aria-expanded="true"] .mobile-match-icons ha-icon:last-child{transform:rotate(180deg)}
        .mobile-match-detail{margin:0;padding:12px 4px;border-top:0;border-bottom:1px solid var(--divider-color)}
        .matrix-detail-content{grid-template-columns:1fr}
        .matrix-detail-content .secondary{justify-self:start}
        .matrix-detail dl{grid-template-columns:1fr 1fr}
      }
      @container owner-card (max-width:520px){
        .head{display:grid}
        .head-actions{display:grid;justify-content:stretch}
        .head-actions button{width:100%}
        .view-tabs{display:grid}
        .form,.link-form,.owner-detail-fields,.preference-row,.owner-filters{grid-template-columns:1fr}
        .wide,.checks,.owner-detail .wide{grid-column:auto}
        .owner{grid-template-columns:minmax(0,1fr) auto}
        .owner-actions{flex-direction:column}
        .actions{flex-wrap:wrap}
        .actions button{flex:1 1 auto}
      }
    </style>`;

    if (this.querySelector(".list")) this.querySelector(".list").scrollTop = listScroll;
    this._formState.bind(this.querySelector(".owner-editor form"));
    this._syncPaymentStatus();
    this._linkFormState.bind(this.querySelector(".link-form .checks"));
    this._updateFinalPaymentPreview();
    const savedStatus = this.querySelector("#owner-status");
    if (this._status && this._lastSavedOwnerId && savedStatus) {
      appendEditAction(this, savedStatus, () => this._openEditor(this._lastSavedOwnerId, { litterId: this._lastSavedLitter }), text(this, "editOwner"));
    }
    this.querySelector(".owner-editor form")?.addEventListener("submit", (event) => { event.preventDefault(); this._save(event.currentTarget); });
    this.querySelector("#export-owners-csv")?.addEventListener("click", () => this._downloadOwnersCsv());
    this.querySelector("#owners-view")?.addEventListener("click", () => this._switchView("owners"));
    this.querySelector("#matrix-view")?.addEventListener("click", () => this._switchView("matrix"));
    this.querySelector("#add-owner")?.addEventListener("click", () => this._openEditor());
    this.querySelector("#owner-scope")?.addEventListener("change", (event) => {
      const scope = event.target.value;
      const litterId = ["__all__", "__unassigned__"].includes(scope) ? this._selectedLitter : scope;
      if (!this._changeLitter(litterId, scope)) event.target.value = this._ownerScope;
    });
    this.querySelector("#owner-show-completed")?.addEventListener("change", (event) => { this._showCompleted = event.target.checked; this._render(); });
    this.querySelector("#owner-search")?.addEventListener("input", (event) => {
      this._ownerSearch = event.target.value;
      this.querySelector(".list").innerHTML = this._ownerList();
      this._bindOwnerRows();
    });
    this.querySelector("#owner-litter")?.addEventListener("change", (event) => {
      if (!this._formState.discard()) { event.target.value = this._editingLitter; return; }
      this._editingLitter = event.target.value;
      this._paymentBeforeFull = null;
      this._render();
      this.querySelector("#owner-litter")?.focus({ preventScroll: true });
    });
    this.querySelector("#cancel-owner")?.addEventListener("click", () => { if (!this._formState.discard()) return; this._editing = null; this._showOwnerEditor = false; this._error = ""; this._render(); });
    this._bindOwnerRows();
    this.querySelector('[name="payment_status"]')?.addEventListener("change", () => this._syncPaymentStatus(true));
    this.querySelectorAll('input[name="payment_amount"], input[name="registration_fee_amount"], input[name="deposit_amount"]').forEach((input) => input.addEventListener("input", () => this._updateFinalPaymentPreview()));
    this.querySelector("#link-litter")?.addEventListener("change", (event) => { if (!this._changeLitter(event.target.value)) event.target.value = this._selectedLitter; });
    this.querySelector("#link-puppy")?.addEventListener("change", (event) => { if (!this._linkFormState.discard()) { event.target.value = this._selectedPuppy; return; } this._selectedPuppy = event.target.value; this._render(); });
    this.querySelector("#link-save")?.addEventListener("click", () => this._link());
    this.querySelector("#matrix-litter")?.addEventListener("change", (event) => { if (!this._changeLitter(event.target.value)) event.target.value = this._selectedLitter; });
    this.querySelector("#matrix-show-resolved")?.addEventListener("change", (event) => { this._matrixShowResolved = event.target.checked; this._matrixSelection = null; this._render(); });
    this.querySelector("#matrix-only-conflicts")?.addEventListener("change", (event) => { this._matrixOnlyConflicts = event.target.checked; this._matrixSelection = null; this._render(); });
    this.querySelector("#matrix-puppy")?.addEventListener("change", (event) => { this._matrixSelectedPuppy = event.target.value; this._matrixSelection = null; this._render(); });
    this.querySelector("#matrix-owner")?.addEventListener("change", (event) => { this._matrixSelectedOwner = event.target.value; this._matrixSelection = null; this._render(); });
    this.querySelectorAll("[data-matrix-perspective]").forEach((button) => button.addEventListener("click", () => {
      if (this._matrixPerspective === button.dataset.matrixPerspective) return;
      this._matrixPerspective = button.dataset.matrixPerspective;
      this._matrixSelection = null;
      this._render();
    }));
    this.querySelectorAll("[data-matrix-owner]").forEach((button) => button.addEventListener("click", () => this._selectMatrixCell(button.dataset.matrixOwner, button.dataset.matrixPuppy)));
    this.querySelectorAll("[data-matrix-edit-owner]").forEach((button) => button.addEventListener("click", (event) => this._openEditor(event.currentTarget.dataset.matrixEditOwner)));
  }

  _bindOwnerRows() {
    this.querySelectorAll("[data-owner-group]").forEach((group) => group.addEventListener("toggle", () => {
      if (!group.isConnected) return;
      const state = this._ownerGroups.get(group.dataset.groupOwner) || {};
      state[group.dataset.ownerGroup] = group.open;
      this._ownerGroups.set(group.dataset.groupOwner, state);
    }));
    this.querySelectorAll("[data-toggle-owner]").forEach((button) => button.addEventListener("click", () => { this._expandedOwnerId = this._expandedOwnerId === button.dataset.toggleOwner ? null : button.dataset.toggleOwner; this._render(); }));
    this.querySelectorAll("[data-delete]").forEach((button) => button.addEventListener("click", () => this._delete(button.dataset.delete)));
    this.querySelectorAll("[data-edit]").forEach((button) => button.addEventListener("click", () => this._openEditor(button.dataset.edit)));
    this.querySelectorAll("[data-mark-paid]").forEach((button) => button.addEventListener("click", () => this._openEditor(button.dataset.markPaid, { paidInFull: true })));
    this.querySelectorAll("[data-owner-dossier]").forEach((select) => select.addEventListener("change", () => { this._detailLitters.set(select.dataset.ownerDossier, select.value); this._render(); }));
    this.querySelectorAll("[data-add-dossier]").forEach((button) => button.addEventListener("click", () => {
      const owner = this._owners.find((item) => item.id === button.dataset.addDossier);
      const litter = this._litters.find((item) => !owner.placements?.[item.id]);
      if (litter) this._openEditor(owner.id, { litterId: litter.id });
    }));
    this.querySelectorAll("[data-assign-owner]").forEach((button) => button.addEventListener("click", () => {
      const select = [...this.querySelectorAll("[data-assign-litter]")].find((item) => item.dataset.assignLitter === button.dataset.assignOwner);
      this._assignDossier(button.dataset.assignOwner, select?.value);
    }));
  }
}

if (!customElements.get(TAG)) customElements.define(TAG, PuppyTrackerOwnerCard);
window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === TAG)) window.customCards.push({ type: TAG, name: "Puppy Tracker Owners", description: "Manage owner contacts and puppy links." });
