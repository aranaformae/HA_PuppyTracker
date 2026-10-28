import { puppySelectorLabel, downloadExportFile, escapeHtml, languageForHass, preserveScrollPosition, subscribeUpdates, createUuid } from "./puppy-tracker-card-common.js";
import { FormState, SavedRecordRefresh, appendEditAction } from "./puppy-tracker-form-state.js";
import { collarColor } from "./puppy-tracker-collar-chart-colors.js";

const TAG = "puppy-tracker-owner-card";

const OWNER_EDITOR_SECTIONS = {
  contact: { title: "contactDetails", edit: "editContact", field: "name" },
  address: { title: "addressDetails", edit: "editAddress", field: "street" },
  placement: { title: "placementDetails", edit: "editPlacement", field: "placement_status" },
  preferences: { title: "puppyPreferences", edit: "editPreferences", field: "preference_puppy_1" },
  financial: { title: "financialDetails", edit: "editFinancial", field: "payment_status" },
  notes: { title: "notesSection", edit: "editNotes", field: "notes" },
};

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
const PLACEMENT_FILTER_LABELS = {
  active: { nl: "Actief (inclusief verkocht)", en: "Active (including sold)" },
  all: { nl: "Alle dossiers", en: "All dossiers" },
  ...PLACEMENT_STATUS_LABELS,
  archived: { nl: "Gearchiveerde dossiers", en: "Archived dossiers" },
};
const OWNER_SORT_LABELS = {
  name: { nl: "Naam", en: "Name" },
  pickup: { nl: "Eerstvolgende ophaaldatum", en: "Next pickup date" },
  status: { nl: "Plaatsingsstatus", en: "Placement status" },
  balance: { nl: "Hoogste openstaande bedrag", en: "Highest outstanding amount" },
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
const PAYMENT_KIND_LABELS = {
  registration_fee: { nl: "Inschrijfgeld", en: "Registration fee" },
  deposit: { nl: "Aanbetaling", en: "Deposit" },
  final: { nl: "Slotbetaling", en: "Final payment" },
  other: { nl: "Overig", en: "Other" },
};
const SEX_LABELS = {
  male: { nl: "Reu", en: "Male" },
  female: { nl: "Teef", en: "Female" },
};

const COPY = {
  nl: {
    changedElsewhere: "Deze gegevens zijn ondertussen gewijzigd. Je invoer is behouden. Laad de nieuwste gegevens voordat je opnieuw opslaat.",
    reloadLatest: "Nieuwste gegevens laden",
    unsavedChanges: "Niet-opgeslagen wijzigingen",
    notesSection: "Notities",
    editContact: "Contactgegevens bewerken",
    editAddress: "Adresgegevens bewerken",
    editPlacement: "Plaatsing bewerken",
    editPreferences: "Pupvoorkeuren bewerken",
    editFinancial: "Betalingen bewerken",
    editNotes: "Notities bewerken",
    title: "Baasjes beheren",
    subtitle: "Contactpersonen die later aan een pup gekoppeld kunnen worden.",
    ownersView: "Baasjes beheren",
    matrixView: "Voorkeurenmatrix",
    defaultView: "Standaardweergave",
    matrixSubtitle: "Vergelijk pupvoorkeuren en bestaande koppelingen per nest.",
    matrixLitter: "Nest voor vergelijking",
    placementFilter: "Statusfilter",
    ownerSort: "Sorteren op",
    visibleOwners: "{visible} van {total} baasjes zichtbaar",
    clearFilters: "Filters wissen",
    allContactsCount: "Alle contacten, over alle nesten",
    pickupAgenda: "Ophaalagenda",
    pickupAgendaHint: "Volgt de filters hierboven. Geplaatste en gearchiveerde dossiers zijn niet opgenomen.",
    noPickups: "Geen ophaaldatums binnen deze selectie.",
    pickupPast: "Datum verstreken · controleer de plaatsing",
    pickupToday: "Vandaag",
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
    editOwner: "Baasje bewerken",
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
    paymentHistory: "Ontvangen betalingen",
    paymentHistoryHint: "Alleen vanaf nu apart geregistreerde ontvangsten. Eerdere bedragen en het openstaande saldo blijven apart handmatig bijgehouden.",
    noPaymentEvents: "Nog geen afzonderlijke ontvangsten geregistreerd.",
    recordedTotal: "Totaal hier geregistreerd",
    addPayment: "Ontvangst toevoegen",
    savePayment: "Ontvangst opslaan",
    paymentReceivedDate: "Datum ontvangst",
    paymentKind: "Soort betaling",
    paymentReference: "Referentie (optioneel)",
    paymentNote: "Notitie (optioneel)",
    paymentAmountReceived: "Ontvangen bedrag",
    paymentSaved: "Ontvangst geregistreerd.",
    paymentVoided: "Ontvangst ingetrokken.",
    voidPayment: "Intrekken",
    voidedPayment: "Ingetrokken",
    voidPaymentPrompt: "Waarom wordt deze ontvangst ingetrokken? De oorspronkelijke registratie blijft zichtbaar.",
    paymentInvalid: "Vul een positief bedrag met maximaal twee decimalen en een geldige datum in.",
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
    pickupSummary: "Ophalen",
    balanceSummary: "Openstaand",
    ownerAttention: "Nog te regelen",
    missingContact: "Contactgegevens ontbreken",
    missingPickup: "Ophaaldatum ontbreekt",
    outstandingPayment: "Betaling open",
    callContact: "Bellen",
    emailContact: "E-mail opstellen",
    whatsappContact: "WhatsApp openen",
    copyContact: "Kopiëren",
    contactCopied: "Gekopieerd.",
    contactCopyFailed: "Kopiëren is niet gelukt. De gegevens blijven beschikbaar om handmatig te kopiëren.",
    possibleDuplicate: "Dit contact bestaat mogelijk al",
    duplicateMatches: "Overeenkomst op",
    openExistingOwner: "Bestaand baasje openen",
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
    changedElsewhere: "These details have changed in the meantime. Your input has been kept. Load the latest details before saving again.",
    reloadLatest: "Load latest details",
    unsavedChanges: "Unsaved changes",
    notesSection: "Notes",
    editContact: "Edit contact details",
    editAddress: "Edit address details",
    editPlacement: "Edit placement",
    editPreferences: "Edit puppy preferences",
    editFinancial: "Edit payments",
    editNotes: "Edit notes",
    title: "Manage owners",
    subtitle: "Contacts that can be linked to a puppy later.",
    ownersView: "Manage owners",
    matrixView: "Preference matrix",
    defaultView: "Default view",
    matrixSubtitle: "Compare puppy preferences and existing links per litter.",
    matrixLitter: "Litter to compare",
    placementFilter: "Status filter",
    ownerSort: "Sort by",
    visibleOwners: "{visible} of {total} owners visible",
    clearFilters: "Clear filters",
    allContactsCount: "All contacts, across all litters",
    pickupAgenda: "Pickup schedule",
    pickupAgendaHint: "Follows the filters above. Placed and archived dossiers are excluded.",
    noPickups: "No pickup dates within this selection.",
    pickupPast: "Date passed · check placement",
    pickupToday: "Today",
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
    paymentHistory: "Payments received",
    paymentHistoryHint: "Only receipts recorded separately from now on. Earlier amounts and the outstanding balance remain tracked manually.",
    noPaymentEvents: "No individual receipts recorded yet.",
    recordedTotal: "Total recorded here",
    addPayment: "Add receipt",
    savePayment: "Save receipt",
    paymentReceivedDate: "Date received",
    paymentKind: "Payment type",
    paymentReference: "Reference (optional)",
    paymentNote: "Note (optional)",
    paymentAmountReceived: "Amount received",
    paymentSaved: "Receipt recorded.",
    paymentVoided: "Receipt voided.",
    voidPayment: "Void",
    voidedPayment: "Voided",
    voidPaymentPrompt: "Why is this receipt being voided? The original record will remain visible.",
    paymentInvalid: "Enter a positive amount with up to two decimals and a valid date.",
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
    pickupSummary: "Pickup",
    balanceSummary: "Outstanding",
    ownerAttention: "To arrange",
    missingContact: "Contact details missing",
    missingPickup: "Pickup date missing",
    outstandingPayment: "Payment outstanding",
    callContact: "Call",
    emailContact: "Compose email",
    whatsappContact: "Open WhatsApp",
    copyContact: "Copy",
    contactCopied: "Copied.",
    contactCopyFailed: "Copying failed. The details remain available to copy manually.",
    possibleDuplicate: "Possible existing contact",
    duplicateMatches: "Matching",
    openExistingOwner: "Open existing owner",
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

function formattedAmount(card, value) {
  const amount = numericAmount(value);
  if (amount === null) return null;
  const configuredCurrency = card._hass?.config?.currency;
  const currency = /^[A-Z]{3}$/.test(configuredCurrency || "") ? configuredCurrency : "EUR";
  return new Intl.NumberFormat(languageForHass(card._hass) === "en" ? "en-US" : "nl-NL", {
    style: "currency", currency,
  }).format(amount);
}

function contactPhone(value) {
  const number = String(value || "").trim().replace(/[\s().-]/g, "").replace(/^00/, "+");
  return /^(?:\+[1-9]\d{5,14}|\d{6,15})$/.test(number) ? number : null;
}

function contactEmail(value) {
  const address = String(value || "").trim();
  return /^[^@\s<>?,;:#]+@[^@\s<>?,;:#]+$/.test(address) ? address : null;
}

function contactIdentity(field, value) {
  return field === "phone" ? contactPhone(value) : contactEmail(value)?.toLowerCase() || null;
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
    this._matrixOnlyConflicts = false;
    this._matrixSelectedPuppy = "";
    this._matrixSelectedOwner = "";
    this._matrixPerspective = "puppy";
    this._matrixSelection = null;
    this._editing = null;
    this._expandedOwnerId = null;
    this._ownerGroups = new Map();
    this._duplicateIndexes = new WeakMap();
    this._editorGroups = { contact: true };
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
    this._placementFilter = "active";
    this._ownerSort = "name";
    this._pickupAgendaOpen = false;
    this._detailLitters = new Map();
    this._editingLitter = "";
    this._editingContact = null;
    this._paymentDraft = null;
    this._linkBaseline = null;
    this._conflict = false;
    this._context = null;
    this._principal = null;
    this._loadSequence = 0;
    this._refreshDeferred = false;
    this._refreshTimer = null;
    this._unsubscribe = null;
    this._subscriptionPending = null;
    this._connectionListeners = null;
    this._focusOut = () => this._scheduleRefresh();
    this._savedRefresh = new SavedRecordRefresh(this,
      () => this._load(true, { background: true, propagate: true }), () => this._context);
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
    if (this._hass && this.isConnected && !this._loaded) this._queueRefresh();
  }

  set hass(value) {
    const previous = this._context;
    const wasBusy = this._busy;
    const privateChanged = this._principal && (this._principal.user !== value?.user?.id || this._principal.admin !== value?.user?.is_admin);
    this._principal = { user: value?.user?.id, admin: value?.user?.is_admin };
    const changed = !previous || previous.connection !== value?.connection
      || previous.user !== value?.user?.id || previous.admin !== value?.user?.is_admin;
    this._hass = value;
    if (changed) {
      this._stopConnection();
      this._invalidateLoads();
      this._context = { connection: value?.connection, user: value?.user?.id, admin: value?.user?.is_admin };
      if (privateChanged) this._clearPrivateState();
      if (privateChanged || wasBusy || value?.user?.is_admin === false) this._render();
    }
    if (!value || value.user?.is_admin === false) return;
    if (!this.isConnected) return;
    if (changed) this._updateActionState();
    this._watchConnection();
    this._subscribe();
    if (changed || !this._loaded) this._queueRefresh();
  }

  connectedCallback() {
    this.addEventListener("focusout", this._focusOut);
    if (!this._hass || this._hass.user?.is_admin === false) return;
    this._context ||= { connection: this._hass.connection, user: this._hass.user?.id, admin: this._hass.user?.is_admin };
    this._updateActionState();
    this._watchConnection();
    this._subscribe();
    this._queueRefresh();
  }

  disconnectedCallback() {
    const wasBusy = this._busy;
    this.removeEventListener("focusout", this._focusOut);
    this._stopConnection();
    this._invalidateLoads();
    if (wasBusy) this._render();
    else this._updateActionState();
  }

  _isCurrent(context) {
    return Boolean(context) && this.isConnected && context === this._context && this._hass
      && context.connection === this._hass.connection && context.user === this._hass.user?.id
      && context.admin === this._hass.user?.is_admin && context.admin !== false && context.connection?.connected !== false;
  }

  _invalidateLoads() {
    this._context = null;
    this._loadSequence += 1;
    this._loading = false;
    this._loaded = false;
    this._busy = false;
    this._savedRefresh.reset();
    clearTimeout(this._refreshTimer);
    this._refreshTimer = null;
    this._refreshDeferred = false;
  }

  _clearPrivateState() {
    this._formState.reset();
    this._linkFormState.reset();
    this._owners = [];
    this._puppies = [];
    this._litters = [];
    this._ownerGroups.clear();
    this._duplicateIndexes = new WeakMap();
    this._editorGroups = { contact: true };
    this._detailLitters.clear();
    this._editing = null;
    this._editingContact = null;
    this._editingLitter = "";
    this._paymentDraft = null;
    this._linkBaseline = null;
    this._showOwnerEditor = false;
    this._expandedOwnerId = null;
    this._matrixSelection = null;
    this._ownerScope = null;
    this._ownerSearch = "";
    this._placementFilter = "active";
    this._ownerSort = "name";
    this._lastSavedOwnerId = null;
    this._pickupAgendaOpen = false;
    this._lastSavedLitter = "";
    this._selectedLitter = "";
    this._selectedPuppy = "";
    this._matrixSelectedOwner = "";
    this._matrixSelectedPuppy = "";
    this._status = "";
    this._error = "";
    this._conflict = false;
    this._paymentBeforeFull = null;
  }

  _stopSubscription() {
    const unsubscribe = this._unsubscribe;
    this._unsubscribe = null;
    this._subscriptionPending = null;
    if (unsubscribe) Promise.resolve().then(unsubscribe).catch(() => undefined);
  }

  _stopConnection() {
    this._stopSubscription();
    const listeners = this._connectionListeners;
    if (!listeners) return;
    listeners.connection.removeEventListener?.("ready", listeners.ready);
    listeners.connection.removeEventListener?.("disconnected", listeners.disconnected);
    this._connectionListeners = null;
  }

  _watchConnection() {
    const connection = this._hass?.connection;
    if (!connection || this._connectionListeners) return;
    const ready = () => {
      if (this._hass?.connection !== connection || !this.isConnected || this._hass.user?.is_admin === false) return;
      this._context ||= { connection, user: this._hass.user?.id, admin: this._hass.user?.is_admin };
      this._updateActionState();
      this._subscribe();
      this._queueRefresh();
    };
    const disconnected = () => {
      const wasBusy = this._busy;
      this._stopSubscription();
      this._invalidateLoads();
      if (wasBusy) this._render();
      else this._updateActionState();
    };
    connection.addEventListener?.("ready", ready);
    connection.addEventListener?.("disconnected", disconnected);
    this._connectionListeners = { connection, ready, disconnected };
  }

  async _subscribe() {
    const context = this._context;
    if (!this._isCurrent(context) || !context.connection?.subscribeMessage || this._unsubscribe || this._subscriptionPending) return;
    const pending = {};
    this._subscriptionPending = pending;
    try {
      const unsubscribe = await subscribeUpdates(this._hass, () => {
        if (this._isCurrent(context)) this._queueRefresh();
      });
      if (this._isCurrent(context) && this._subscriptionPending === pending) this._unsubscribe = unsubscribe;
      else await unsubscribe?.();
    } catch (_error) {
      // A later hass update or connection-ready signal retries the subscription.
    } finally {
      if (this._subscriptionPending === pending) this._subscriptionPending = null;
    }
  }

  get _showEditor() { return this._showOwnerEditor || this._linkFormState.dirty; }

  _interactionActive() {
    const active = this.getRootNode().activeElement;
    return this._showEditor || this.contains(active) && active?.matches("input,select,textarea");
  }

  _queueRefresh() {
    this._refreshDeferred = true;
    this._scheduleRefresh();
  }

  _scheduleRefresh() {
    if (this._refreshTimer !== null || !this._refreshDeferred || !this._isCurrent(this._context)) return;
    this._refreshTimer = setTimeout(() => {
      this._refreshTimer = null;
      if (!this._refreshDeferred || this._busy || this._loading || this._interactionActive()) return;
      this._refreshDeferred = false;
      this._load(true, { background: true });
    }, 0);
  }

  getCardSize() { return 7; }
  getGridOptions() { return { columns: 12, min_columns: 6 }; }

  async _load(force = false, { background = false, propagate = false, render = true, allowEditing = false } = {}) {
    const context = this._context;
    if (!this._isCurrent(context) || (this._loading && !force) || (this._loaded && !force)) return false;
    const hass = this._hass;
    const sequence = ++this._loadSequence;
    const current = () => this._isCurrent(context) && sequence === this._loadSequence;
    let changed = false;
    this._loading = true;
    try {
      const [ownerResult, litterResult] = await Promise.all([
        hass.callWS({ type: "puppy_tracker/owners/list" }),
        hass.callWS({ type: "puppy_tracker/litters" }),
      ]);
      if (!current()) return false;
      const owners = ownerResult?.owners || [];
      const litters = (litterResult?.litters || []).map(({ summary, growth_analysis, ...litter }) => litter);
      const data = await Promise.all(litters.map(async (litter) => {
        const result = await hass.callWS({ type: "puppy_tracker/data", litter_id: litter.id });
        const litterDetails = result?.litter || litter;
        return (result?.puppies || []).map((puppy) => ({
          ...Object.fromEntries(["id", "name", "registered_name", "collar_color", "coat_color", "breed", "sex", "birth_time", "chip_number", "owner_ids"]
            .map((field) => [field, puppy[field]])),
          litter_id: litter.id,
          litter_name: litterDetails.name || text(this, "litter"),
          litter_birth_date: litterDetails.birth_date,
          mother: litterDetails.mother,
          mother_details: litterDetails.mother_details || {},
          father: litterDetails.father,
          father_details: litterDetails.father_details || {},
        }));
      }));
      if (!current()) return false;
      if (!allowEditing && this._interactionActive()) {
        this._refreshDeferred = true;
        return false;
      }
      changed = !this._loaded || Boolean(this._error) || this._savedRefresh.failedContext === context
        || JSON.stringify([owners, litters, data.flat()]) !== JSON.stringify([this._owners, this._litters, this._puppies]);
      this._owners = owners;
      this._litters = litters;
      this._puppies = data.flat();
      if (!this._litters.some((litter) => litter.id === this._selectedLitter)) {
        this._selectedLitter = this._litters.find((litter) => litter.active !== false)?.id || this._litters[0]?.id || "";
      }
      if (this._ownerScope === null) this._ownerScope = this._litters.find((litter) => litter.active !== false)?.id || "__unassigned__";
      if (!["__all__", "__unassigned__"].includes(this._ownerScope) && !this._litters.some((litter) => litter.id === this._ownerScope)) this._ownerScope = "__all__";
      const selectedLitterPuppies = this._puppies.filter((puppy) => puppy.litter_id === this._selectedLitter);
      if (!selectedLitterPuppies.some((puppy) => puppy.id === this._matrixSelectedPuppy)) {
        this._matrixSelectedPuppy = selectedLitterPuppies[0]?.id || "";
      }
      this._loaded = true;
      if (!this._conflict) this._error = "";
      this._savedRefresh.refreshed();
      if (this._expandedOwnerId && !this._owners.some((owner) => owner.id === this._expandedOwnerId)) this._expandedOwnerId = null;
      return true;
    } catch (error) {
      if (!current()) return false;
      if (propagate) throw error;
      this._error = error?.message || String(error);
      const message = this.querySelector("#owner-error");
      if (message) message.textContent = this._error;
      return false;
    } finally {
      if (current()) {
        this._loading = false;
        if (render && !this._busy && (!background || changed) && !this._interactionActive()) this._render();
        this._scheduleRefresh();
      }
    }
  }

  async _runMutation(message, saved) {
    const context = this._context;
    if (this._busy || !this._isCurrent(context) || this._conflict) return;
    this._loadSequence += 1;
    this._loading = false;
    this._busy = true;
    this._error = "";
    this._status = "";
    this._savedRefresh.reset();
    this._render();
    try {
      const result = await this._hass.callWS(message);
      if (!this._isCurrent(context)) return;
      saved(result);
      this._refreshDeferred = false;
      // Keep the confirmed write separate from its fallible follow-up read.
      await this._savedRefresh.run();
    } catch (error) {
      if (!this._isCurrent(context)) return;
      this._conflict = error?.code === "owner_conflict";
      this._error = this._conflict ? text(this, "changedElsewhere")
        : error?.code === "owner_linked" ? text(this, "unlinkBeforeDelete") : error?.message || String(error);
    } finally {
      if (this._isCurrent(context)) {
        this._busy = false;
        this._render();
        this._scheduleRefresh();
      }
    }
  }

  _updateActionState() {
    const blocked = this._busy || this._conflict || !this._isCurrent(this._context);
    this.querySelectorAll('button[type="submit"], #add-owner, [data-edit], [data-edit-owner-section], [data-mark-paid], [data-add-dossier], [data-matrix-edit-owner], [data-add-payment], [data-void-payment], [data-cancel-payment]')
      .forEach((button) => { button.disabled = blocked; });
    this.querySelectorAll("[data-delete], [data-assign-owner]").forEach((button) => { button.disabled = blocked || this._showEditor; });
    this.querySelectorAll("[data-copy-owner-contact]").forEach((button) => { button.disabled = blocked; });
    this.querySelectorAll("[data-open-duplicate-owner]").forEach((button) => { button.disabled = blocked; });
    this.querySelectorAll("[data-pickup-owner]").forEach((button) => { button.disabled = blocked || this._showOwnerEditor; });
    const link = this.querySelector("#link-save");
    if (link) link.disabled = blocked || this._showOwnerEditor || !this._selectedPuppy;
    const reload = this.querySelector("#reload-owner-conflict");
    if (reload) reload.disabled = this._busy || !this._isCurrent(this._context);
    const csv = this.querySelector("#export-owners-csv");
    if (csv) csv.disabled = blocked || this._showEditor || !this._owners.length;
    this.querySelectorAll("#owners-view, #matrix-view").forEach((button) => { button.disabled = this._busy || this._showOwnerEditor; });
  }

  async _reloadConflict() {
    if (this._busy || !this._formState.confirmDiscard() || !this._linkFormState.confirmDiscard()) return;
    const context = this._context;
    this._busy = true;
    this._render();
    try {
      if (!await this._load(true, { render: false, allowEditing: true }) || !this._isCurrent(context)) return;
      this._formState.reset();
      this._linkFormState.reset();
      this._linkBaseline = null;
      this._editingContact = this._owners.find((owner) => owner.id === this._editing) || null;
      if (this._editing && !this._editingContact) { this._editing = null; this._showOwnerEditor = false; }
      this._paymentBeforeFull = null;
      this._conflict = false;
      this._error = "";
      this._refreshDeferred = false;
    } finally {
      if (this._isCurrent(context)) { this._busy = false; this._render(); }
    }
  }

  async _save(form) {
    if (this._busy || !this._showOwnerEditor) return;
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
      delete data[puppyField];
      delete data[noteField];
      if (!puppyId) {
        hasEmptyEarlierPreference = true;
        if (note) {
          this._formState.error(`[name="${puppyField}"]`, text(this, "selectPuppyForNote"));
          return;
        }
        continue;
      }
      if (hasEmptyEarlierPreference) {
        this._formState.error(`[name="${puppyField}"]`, text(this, "fillEarlierPreference"));
        return;
      }
      if (selectedPuppies.has(puppyId)) {
        this._formState.error(`[name="${puppyField}"]`, text(this, "duplicatePuppyPreference"));
        return;
      }
      puppyPreferences.push({ puppy_id: puppyId, note: note || null });
      selectedPuppies.add(puppyId);
    }
    data.puppy_preferences = puppyPreferences;
    data.litter_id = this._editingLitter || null;
    data.archived = form.elements.archived.checked;
    if (this._editing) {
      data.owner_id = this._editing;
      data.expected_revision = this._editingContact?.revision || "";
    }
    await this._runMutation({ type: "puppy_tracker/owners/save", ...data }, (result) => {
      this._owners = this._owners.filter((owner) => owner.id !== result.owner.id).concat(result.owner);
      this._lastSavedOwnerId = result?.owner?.id || this._editing;
      this._lastSavedLitter = this._editingLitter;
      this._ownerScope = this._editingLitter || "__unassigned__";
      const dossier = this._ownerForLitter(result.owner, this._editingLitter);
      if (!this._matchesPlacementFilter(dossier)) this._placementFilter = dossier.archived ? "archived" : dossier.placement_status || "interested";
      this._formState.reset();
      this._editing = null;
      this._editingContact = null;
      this._showOwnerEditor = false;
      this._status = `${text(this, "saved")} ${data.name || ""}`;
    });
  }

  async _delete(id) {
    if (this._busy || this._showEditor || !window.confirm(text(this, "confirmDelete"))) return;
    const owner = this._owners.find((item) => item.id === id);
    await this._runMutation({ type: "puppy_tracker/owners/delete", owner_id: id, expected_revision: owner?.revision || "" }, () => {
      this._owners = this._owners.filter((item) => item.id !== id);
      this._expandedOwnerId = null;
      this._lastSavedOwnerId = null;
      this._status = text(this, "deleted");
    });
  }

  async _link() {
    if (this._busy || this._showOwnerEditor) return;
    const puppy = this._puppies.find((item) => item.id === this._selectedPuppy);
    if (!puppy) return;
    const ownerIds = [...this.querySelectorAll("input[name=linked_owner]:checked")].map((input) => input.value);
    await this._runMutation({ type: "puppy_tracker/owners/link", litter_id: puppy.litter_id, puppy_id: puppy.id,
      owner_ids: ownerIds, expected_owner_ids: this._linkBaseline?.ownerIds || puppy.owner_ids || [] }, () => {
      puppy.owner_ids = ownerIds;
      this._linkFormState.reset();
      this._linkBaseline = null;
      this._lastSavedOwnerId = null;
      this._status = text(this, "linked");
    });
  }

  _linkedPuppies(ownerId) {
    return this._puppies.filter((puppy) => (puppy.owner_ids || []).includes(ownerId));
  }

  _linkedPuppiesLabel(owner) {
    const visibleLitters = new Set(this._visibleLitterIds(owner));
    return this._linkedPuppies(owner.id).filter((puppy) => visibleLitters.has(puppy.litter_id)).map((puppy) => {
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
      return this._matchesPlacementFilter(this._ownerForLitter(owner, id));
    });
  }

  _matchesPlacementFilter(dossier) {
    if (this._placementFilter === "all") return true;
    if (this._placementFilter === "archived") return Boolean(dossier.archived);
    const status = dossier.placement_status || "interested";
    if (this._placementFilter === "active") return !dossier.archived && status !== "placed";
    return status === this._placementFilter;
  }

  _placementFilterControl() {
    const disabled = this._busy || this._showOwnerEditor ? "disabled" : "";
    const options = Object.keys(PLACEMENT_FILTER_LABELS).map((key) => `<option value="${key}" ${key === this._placementFilter ? "selected" : ""}>${escapeHtml(optionLabel(this, key, PLACEMENT_FILTER_LABELS))}</option>`).join("");
    return `<label><span>${escapeHtml(text(this, "placementFilter"))}</span><select id="owner-status-filter" ${disabled}>${options}</select></label>`;
  }

  _visibleOwners() {
    const query = this._ownerSearch.trim().toLocaleLowerCase();
    const owners = this._owners.filter((owner) => this._visibleLitterIds(owner).length && (!query ||
      [owner.name, owner.email, owner.phone, this._linkedPuppiesLabel(owner)].join(" ").toLocaleLowerCase().includes(query)));
    const collator = new Intl.Collator(languageForHass(this._hass) === "en" ? "en-US" : "nl-NL", { numeric: true, sensitivity: "base" });
    return owners.map((owner) => ({ owner, key: this._ownerSortKey(owner) })).sort((left, right) => {
      if (left.key === null && right.key !== null) return 1;
      if (right.key === null && left.key !== null) return -1;
      const difference = this._ownerSort === "balance" ? right.key - left.key : left.key - right.key;
      return difference || collator.compare(left.owner.name, right.owner.name) || String(left.owner.id).localeCompare(String(right.owner.id));
    }).map(({ owner }) => owner);
  }

  _ownerSortKey(owner) {
    if (this._ownerSort === "name") return 0;
    const dossiers = this._visibleLitterIds(owner).map((id) => this._ownerForLitter(owner, id));
    if (this._ownerSort === "balance") {
      const amounts = dossiers.map((dossier) => numericAmount(dossier.payment_balance)).filter((value) => value !== null);
      return amounts.length ? amounts.reduce((total, amount) => total + amount, 0) : null;
    }
    if (this._ownerSort === "status") return Math.min(...dossiers.map((dossier) => Math.max(0, Object.keys(PLACEMENT_STATUS_LABELS).indexOf(dossier.placement_status || "interested"))));
    const dates = dossiers.map((dossier) => dossier.expected_pickup_date ? new Date(`${dateOnly(dossier.expected_pickup_date)}T12:00:00`).getTime() : NaN).filter(Number.isFinite);
    return dates.length ? Math.min(...dates) : null;
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
    const sortOptions = Object.keys(OWNER_SORT_LABELS).map((key) => `<option value="${key}" ${key === this._ownerSort ? "selected" : ""}>${escapeHtml(optionLabel(this, key, OWNER_SORT_LABELS))}</option>`).join("");
    return `<div class="owner-filters"><label><span>${escapeHtml(text(this, "ownerScope"))}</span><select id="owner-scope" ${disabled}>${options}</select></label>${this._placementFilterControl()}<label><span>${escapeHtml(text(this, "searchOwners"))}</span><input id="owner-search" type="search" value="${escapeHtml(this._ownerSearch)}" ${disabled}></label><label><span>${escapeHtml(text(this, "ownerSort"))}</span><select id="owner-sort" ${disabled}>${sortOptions}</select></label></div>`;
  }

  _filterSummary(owners) {
    const count = text(this, "visibleOwners").replace("{visible}", owners.length).replace("{total}", this._owners.length);
    const filtered = this._ownerScope !== "__all__" || this._placementFilter !== "all" || Boolean(this._ownerSearch);
    return `<span id="owner-filter-count" role="status" aria-live="polite" tabindex="-1">${escapeHtml(count)}<small>${escapeHtml(text(this, "allContactsCount"))}</small></span><button type="button" id="clear-owner-filters" class="secondary" ${!filtered || this._busy || this._showOwnerEditor ? "disabled" : ""}>${escapeHtml(text(this, "clearFilters"))}</button>`;
  }

  _pickupAgenda(owners) {
    const entries = owners.flatMap((owner) => this._visibleLitterIds(owner).flatMap((litterId) => {
      const dossier = this._ownerForLitter(owner, litterId);
      const date = dateOnly(dossier.expected_pickup_date);
      if (!date || dossier.archived || dossier.placement_status === "placed") return [];
      const puppies = this._linkedPuppies(owner.id).filter((puppy) => puppy.litter_id === litterId);
      return [{ owner, litterId, date, puppies }];
    })).sort((left, right) => left.date.localeCompare(right.date) || left.owner.name.localeCompare(right.owner.name) || left.litterId.localeCompare(right.litterId));
    // Compare calendar dates in Home Assistant's zone, without parsing date-only
    // values as UTC or adding a timer that rebuilds an open form at midnight.
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: this._hass?.config?.time_zone || undefined, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const dateParts = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    const today = `${dateParts.year}-${dateParts.month}-${dateParts.day}`;
    let previousDate = null;
    const rows = entries.map(({ owner, litterId, date, puppies }) => {
      const heading = date !== previousDate ? `<h4>${escapeHtml(formattedDate(this, date))}${date === today ? ` · ${escapeHtml(text(this, "pickupToday"))}` : ""}</h4>` : "";
      previousDate = date;
      const puppyNames = puppies.map((puppy) => puppySelectorLabel(puppy, text(this, "puppy"))).join(", ") || text(this, "noLinkedPuppies");
      return `${heading}<button type="button" class="pickup-entry" data-pickup-owner="${escapeHtml(owner.id)}" data-pickup-litter="${escapeHtml(litterId)}" ${this._busy || this._showOwnerEditor ? "disabled" : ""}><span><strong>${escapeHtml(owner.name)}</strong><span>${escapeHtml(puppyNames)}</span><small>${escapeHtml(this._litterLabel(litterId))}</small>${date < today ? `<small class="pickup-past">${escapeHtml(text(this, "pickupPast"))}</small>` : ""}</span><ha-icon icon="mdi:pencil-outline" aria-hidden="true"></ha-icon><span class="pickup-edit-label">${escapeHtml(text(this, "editPlacement"))}</span></button>`;
    }).join("");
    return `<summary>${escapeHtml(text(this, "pickupAgenda"))} (${entries.length})</summary><p class="sub">${escapeHtml(text(this, "pickupAgendaHint"))}</p><div class="pickup-list">${rows || `<div class="empty">${escapeHtml(text(this, "noPickups"))}</div>`}</div>`;
  }

  _refreshOwnerResults() {
    preserveScrollPosition(this, () => {
      const list = this.querySelector(".list");
      if (!list) return;
      const owners = this._visibleOwners();
      list.innerHTML = this._ownerList(owners);
      list.scrollTop = 0;
      this.querySelector(".owner-filter-summary").innerHTML = this._filterSummary(owners);
      this.querySelector(".pickup-agenda").innerHTML = this._pickupAgenda(owners);
      this._bindOwnerRows();
      this._bindOwnerOverview();
    });
  }

  _bindOwnerOverview() {
    this.querySelector("#clear-owner-filters")?.addEventListener("click", () => {
      if (this._busy || this._showOwnerEditor) return;
      this._ownerScope = "__all__";
      this._placementFilter = "all";
      this._ownerSearch = "";
      this._matrixSelection = null;
      this.querySelector("#owner-scope").value = this._ownerScope;
      this.querySelector("#owner-status-filter").value = this._placementFilter;
      this.querySelector("#owner-search").value = "";
      this._refreshOwnerResults();
      this.querySelector("#owner-filter-count")?.focus({ preventScroll: true });
    });
    this.querySelectorAll("[data-pickup-owner]").forEach((button) => button.addEventListener("click", () => {
      this._openEditor(button.dataset.pickupOwner, { section: "placement", litterId: button.dataset.pickupLitter });
    }));
  }

  async _assignDossier(ownerId, litterId) {
    if (!litterId || this._busy || this._showEditor) return;
    const owner = this._owners.find((item) => item.id === ownerId);
    await this._runMutation({ type: "puppy_tracker/owners/save", owner_id: ownerId, name: owner.name,
      expected_revision: owner.revision || "", litter_id: litterId, move_unassigned: true }, (result) => {
      this._owners = this._owners.map((item) => item.id === ownerId ? result.owner : item);
      this._lastSavedOwnerId = ownerId;
      this._lastSavedLitter = litterId;
      this._ownerScope = litterId;
      this._detailLitters.set(ownerId, litterId);
      this._status = text(this, "linked");
    });
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
      if (!this._matchesPlacementFilter(owner)) return false;
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
    return `<section class="matrix-view"><div class="matrix-controls"><label><span>${escapeHtml(text(this, "matrixLitter"))}</span><select id="matrix-litter">${litterOptions}</select></label>${this._placementFilterControl()}<label class="matrix-toggle"><input id="matrix-only-conflicts" type="checkbox" ${this._matrixOnlyConflicts ? "checked" : ""}><span>${escapeHtml(text(this, "onlyConflicts"))}</span></label></div>${model.allPuppies.length ? this._matrixSummary(model) : ""}<div class="matrix-layout">${this._matrixDesktop(model)}${this._matrixMobile(model)}<div class="matrix-detail-region"><section id="matrix-detail" class="matrix-detail" ${details ? "" : "hidden"}>${details}</section></div></div></section>`;
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
      details.querySelector("[data-matrix-edit-owner]")?.addEventListener("click", (event) => this._openEditor(event.currentTarget.dataset.matrixEditOwner, { section: "preferences" }));
    });
    this._updateActionState();
  }

  _switchView(view) {
    if (!["owners", "matrix"].includes(view) || view === this._activeView || this._showOwnerEditor || this._busy) return;
    this._activeView = view;
    this._matrixSelection = null;
    this._status = "";
    if (!this._conflict) this._error = "";
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
    this._scheduleRefresh();
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
    const matrixView = this._activeView === "matrix";
    const contacts = matrixView ? this._matrixModel().owners : this._visibleOwners();
    for (const contact of contacts) {
      for (const litterId of matrixView ? [this._selectedLitter] : this._visibleLitterIds(contact)) {
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
    const context = this._context;
    if (!this._owners.length || this._loading || this._busy || this._showEditor) return;
    if (!await this._load(true) || !this._isCurrent(context) || !this._owners.length) return;
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

  _openEditor(ownerId = null, { paidInFull = false, litterId, section = "contact" } = {}) {
    if (this._conflict || !this._formState.discard()) return;
    const contact = this._owners.find((item) => item.id === ownerId);
    this._savedRefresh.reset();
    this._editingContact = contact ? structuredClone(contact) : null;
    const target = paidInFull ? "financial" : Object.hasOwn(OWNER_EDITOR_SECTIONS, section) ? section : "contact";
    this._editorGroups = { [target]: true };
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
    const context = this._context;
    queueMicrotask(() => {
      if (this._isCurrent(context) && this._showOwnerEditor) this.querySelector(`[name="${paidInFull ? "payment_date" : OWNER_EDITOR_SECTIONS[target].field}"]`)?.focus({ preventScroll: true });
    });
  }

  _detail(label, value, className = "") {
    return `<div class="${className}"><span>${escapeHtml(label)}</span><div>${escapeHtml(value ?? "—")}</div></div>`;
  }

  _contactDetail(owner, field) {
    const value = String(owner[field] || "");
    if (!value.trim()) return this._detail(text(this, field), "—");
    const links = [];
    const phone = field === "phone" ? contactPhone(value) : null;
    const email = field === "email" ? contactEmail(value) : null;
    if (phone) links.push([`tel:${phone}`, "callContact", "mdi:phone-outline"]);
    if (phone?.startsWith("+")) links.push([`https://wa.me/${phone.slice(1)}`, "whatsappContact", "mdi:whatsapp"]);
    if (email) links.push([`mailto:${encodeURIComponent(email)}`, "emailContact", "mdi:email-outline"]);
    const actions = links.map(([url, label, icon]) => `<a class="owner-contact-action" href="${escapeHtml(url)}" ${label === "whatsappContact" ? 'target="_blank" rel="noopener noreferrer"' : ""} title="${escapeHtml(text(this, label))}" aria-label="${escapeHtml(`${text(this, label)}: ${value}`)}"><ha-icon icon="${icon}" aria-hidden="true"></ha-icon></a>`).join("");
    return `<div data-contact-kind="${field}"><span>${escapeHtml(text(this, field))}</span><div class="owner-contact-row"><span class="owner-contact-text">${escapeHtml(value)}</span><div class="owner-contact-actions">${actions}<button type="button" class="owner-contact-action" data-copy-owner-contact="${escapeHtml(owner.id)}" data-contact-field="${field}" title="${escapeHtml(`${text(this, "copyContact")}: ${text(this, field)}`)}" aria-label="${escapeHtml(`${text(this, "copyContact")}: ${text(this, field)}`)}"><ha-icon icon="mdi:content-copy" aria-hidden="true"></ha-icon></button></div></div></div>`;
  }

  async _copyContact(ownerId, field) {
    const context = this._context;
    if (!this._isCurrent(context) || this._busy || !["phone", "email"].includes(field)) return;
    const owner = this._owners.find((item) => item.id === ownerId);
    const value = String(owner?.[field] || "");
    if (!value.trim()) return;
    let message;
    try {
      await navigator.clipboard.writeText(value);
      message = text(this, "contactCopied");
    } catch (_error) {
      message = text(this, "contactCopyFailed");
    }
    if (!this._isCurrent(context)) return;
    const feedback = [...this.querySelectorAll("[data-contact-feedback]")].find((node) => node.dataset.contactFeedback === ownerId);
    if (feedback) feedback.textContent = message;
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
      const editLabel = OWNER_EDITOR_SECTIONS[key]?.edit;
      const edit = editLabel ? `<button type="button" class="owner-section-edit" data-edit-owner-section="${key}" data-section-owner="${escapeHtml(owner.id)}" data-section-litter="${escapeHtml(litterId)}" title="${escapeHtml(text(this, editLabel))}" aria-label="${escapeHtml(text(this, editLabel))}"><ha-icon icon="mdi:pencil-outline"></ha-icon></button>` : "";
      return `<details class="owner-detail-group" data-owner-group="${key}" data-group-owner="${escapeHtml(owner.id)}" ${open ? "open" : ""}><summary><ha-icon class="owner-section-chevron" icon="mdi:chevron-down" aria-hidden="true"></ha-icon><span class="owner-section-title">${escapeHtml(text(this, title))}</span>${edit}</summary><div class="owner-detail-fields">${fields}</div></details>`;
    };
    return `<div class="owner-detail" id="owner-detail-${escapeHtml(owner.id)}">
      <div class="dossier-controls"><label class="dossier-select"><span>${escapeHtml(text(this, "dossierLitter"))}</span><select data-owner-dossier="${escapeHtml(owner.id)}">${litterOptions}</select></label>${addDossier}</div>${assign}
      ${group("contact", "contactDetails", `
      ${this._detail(text(this, "name"), owner.name)}
      ${this._detail(text(this, "role"), optionLabel(this, owner.role, OWNER_ROLE_LABELS, "owner"))}
      ${this._contactDetail(owner, "email")}
      ${this._contactDetail(owner, "phone")}
      ${this._detail(text(this, "contactPreference"), optionLabel(this, owner.contact_preference, CONTACT_PREFERENCE_LABELS, "none"))}
      <div class="owner-contact-feedback wide" data-contact-feedback="${escapeHtml(owner.id)}" role="status" aria-live="polite"></div>
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
      ${litterId ? group("payments", "paymentHistory", this._paymentHistory(owner, litterId)) : ""}
      ${group("notes", "notesSection", `${this._detail(text(this, "notes"), owner.notes || "—", "wide notes preformatted")}${this._detail(text(this, "placementNotes"), owner.placement_notes || "—", "wide preformatted")}`, true)}
      ${group("history", "statusHistory", this._detail(text(this, "statusHistory"), history, "wide preformatted"))}
    </div>`;
  }

  _paymentHistory(owner, litterId) {
    const entries = owner.payment_events || [];
    const cents = entries.filter(entry => !entry.voided_at).reduce((sum, entry) => sum + Math.round(Number(entry.amount) * 100), 0);
    const draft = this._paymentDraft?.ownerId === owner.id && this._paymentDraft.litterId === litterId ? this._paymentDraft : null;
    const options = (labels, selected) => Object.entries(labels).map(([key]) => `<option value="${key}" ${key === selected ? "selected" : ""}>${escapeHtml(optionLabel(this, key, labels, key))}</option>`).join("");
    const form = draft ? `<form class="payment-event-form" data-payment-form="${escapeHtml(owner.id)}" data-payment-litter="${escapeHtml(litterId)}">
      <label>${escapeHtml(text(this, "paymentAmountReceived"))}<input name="amount" type="text" inputmode="decimal" required value="${escapeHtml(draft.amount)}"></label>
      <label>${escapeHtml(text(this, "paymentReceivedDate"))}<input name="date" type="date" required value="${escapeHtml(draft.date)}"></label>
      <label>${escapeHtml(text(this, "paymentKind"))}<select name="kind">${options(PAYMENT_KIND_LABELS, draft.kind)}</select></label>
      <label>${escapeHtml(text(this, "paymentMethod"))}<select name="method">${options(PAYMENT_METHOD_LABELS, draft.method)}</select></label>
      <label>${escapeHtml(text(this, "paymentReference"))}<input name="reference" maxlength="120" value="${escapeHtml(draft.reference)}"></label>
      <label>${escapeHtml(text(this, "paymentNote"))}<input name="note" maxlength="240" value="${escapeHtml(draft.note)}"></label>
      <div class="actions"><button type="button" class="secondary" data-cancel-payment>${escapeHtml(text(this, "cancel"))}</button><button type="submit" class="primary">${escapeHtml(text(this, "savePayment"))}</button></div>
    </form>` : `<button type="button" class="secondary" data-add-payment="${escapeHtml(owner.id)}" data-payment-litter="${escapeHtml(litterId)}">${escapeHtml(text(this, "addPayment"))}</button>`;
    return `<div class="payment-history wide"><p>${escapeHtml(text(this, "paymentHistoryHint"))}</p>
      <strong>${escapeHtml(text(this, "recordedTotal"))}: ${escapeHtml(formattedAmount(this, (cents / 100).toFixed(2)))}</strong>
      ${entries.length ? `<ul>${[...entries].reverse().map(entry => `<li class="${entry.voided_at ? "voided" : ""}"><div><strong>${escapeHtml(formattedAmount(this, entry.amount))}</strong> · ${escapeHtml(formattedDate(this, entry.date))} · ${escapeHtml(optionLabel(this, entry.kind, PAYMENT_KIND_LABELS, entry.kind))} · ${escapeHtml(optionLabel(this, entry.method, PAYMENT_METHOD_LABELS, "none"))}${entry.reference ? ` · ${escapeHtml(entry.reference)}` : ""}${entry.note ? `<small>${escapeHtml(entry.note)}</small>` : ""}${entry.voided_at ? `<small>${escapeHtml(text(this, "voidedPayment"))}: ${escapeHtml(entry.void_reason)}</small>` : ""}</div>${entry.voided_at ? "" : `<button type="button" class="secondary" data-void-payment="${escapeHtml(entry.id)}" data-payment-owner="${escapeHtml(owner.id)}" data-payment-litter="${escapeHtml(litterId)}">${escapeHtml(text(this, "voidPayment"))}</button>`}</li>`).join("")}</ul>` : `<p>${escapeHtml(text(this, "noPaymentEvents"))}</p>`}
      ${form}</div>`;
  }

  async _savePayment(form) {
    const draft = this._paymentDraft;
    if (!draft || this._busy) return;
    const data = Object.fromEntries(new FormData(form).entries());
    Object.assign(draft, data);
    const amount = Number(data.amount.replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0 || !/^\d+(?:[.,]\d{1,2})?$/.test(data.amount) || !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
      this._error = text(this, "paymentInvalid");
      this._render();
      return;
    }
    const owner = this._owners.find(item => item.id === draft.ownerId);
    await this._runMutation({ type: "puppy_tracker/owners/payment/add", owner_id: draft.ownerId,
      litter_id: draft.litterId, expected_revision: owner?.revision || "", request_id: draft.requestId,
      amount: data.amount, date: data.date, kind: data.kind, method: data.method,
      reference: data.reference, note: data.note }, result => {
      this._owners = this._owners.filter(item => item.id !== result.owner.id).concat(result.owner);
      this._paymentDraft = null;
      this._status = text(this, "paymentSaved");
    });
  }

  async _voidPayment(button) {
    if (this._busy) return;
    const reason = window.prompt(text(this, "voidPaymentPrompt"));
    if (!reason?.trim()) return;
    const owner = this._owners.find(item => item.id === button.dataset.paymentOwner);
    await this._runMutation({ type: "puppy_tracker/owners/payment/void", owner_id: owner?.id,
      litter_id: button.dataset.paymentLitter, payment_id: button.dataset.voidPayment,
      expected_revision: owner?.revision || "", reason: reason.trim() }, result => {
      this._owners = this._owners.filter(item => item.id !== result.owner.id).concat(result.owner);
      this._status = text(this, "paymentVoided");
    });
  }

  _ownerAttention(owner) {
    const visible = this._visibleLitterIds(owner);
    const actions = [];
    for (const litterId of visible) {
      const dossier = this._ownerForLitter(owner, litterId);
      if (dossier.archived || !["reserved", "sold"].includes(dossier.placement_status)) continue;
      const issues = [];
      if (!String(owner.email || "").trim() && !String(owner.phone || "").trim()) issues.push(["contact", "missingContact", "mdi:account-alert-outline"]);
      if (dossier.placement_status === "sold" && !dossier.expected_pickup_date) issues.push(["placement", "missingPickup", "mdi:calendar-alert"]);
      if (dossier.payment_status !== "full" && numericAmount(dossier.payment_balance) > 0) issues.push(["financial", "outstandingPayment", "mdi:cash-clock"]);
      for (const [section, key, icon] of issues) {
        const label = [visible.length > 1 ? this._litterLabel(litterId) : "", text(this, key)].filter(Boolean).join(" · ");
        actions.push(`<button type="button" class="owner-attention-action" data-edit-owner-section="${section}" data-section-owner="${escapeHtml(owner.id)}" data-section-litter="${escapeHtml(litterId)}" title="${escapeHtml(`${owner.name} · ${this._litterLabel(litterId)} · ${text(this, key)}`)}"><ha-icon icon="${icon}" aria-hidden="true"></ha-icon>${escapeHtml(label)}</button>`);
      }
    }
    return actions.length ? `<div class="owner-attention" role="group" aria-label="${escapeHtml(text(this, "ownerAttention"))}">${actions.join("")}</div>` : "";
  }

  _ownerList(owners = this._visibleOwners()) {
    if (!this._owners.length) return `<div class="empty">${escapeHtml(text(this, this._loading ? "loading" : "empty"))}</div>`;
    if (!owners.length) return `<div class="empty">${escapeHtml(text(this, "noMatchingOwners"))}</div>`;
    return owners.map((owner) => {
      const expanded = owner.id === this._expandedOwnerId;
      const contact = [owner.email, owner.phone].filter(Boolean).join(" · ") || text(this, "noContact");
      const linked = this._linkedPuppiesLabel(owner);
      const dossiers = this._visibleLitterIds(owner).map((id) => {
        const dossier = this._ownerForLitter(owner, id);
        const status = [this._litterLabel(id), optionLabel(this, dossier.placement_status, PLACEMENT_STATUS_LABELS, "interested"), dossier.archived ? text(this, "archivedColumn") : ""].filter(Boolean).join(" · ");
        const balance = formattedAmount(this, dossier.payment_balance);
        return `<small class="owner-dossier-summary" data-summary-litter="${escapeHtml(id)}"><span>${escapeHtml(status)}</span>${dossier.expected_pickup_date ? `<span>${escapeHtml(text(this, "pickupSummary"))}: ${escapeHtml(formattedDate(this, dossier.expected_pickup_date))}</span>` : ""}${balance !== null ? `<span>${escapeHtml(text(this, "balanceSummary"))}: ${escapeHtml(balance)}</span>` : ""}</small>`;
      }).join("");
      return `<article class="owner" data-owner="${escapeHtml(owner.id)}">
        <button type="button" class="owner-toggle" data-toggle-owner="${escapeHtml(owner.id)}" aria-expanded="${expanded}" aria-controls="owner-detail-${escapeHtml(owner.id)}"><span><strong>${escapeHtml(owner.name)}</strong><small>${escapeHtml(contact)}</small>${dossiers}${linked ? `<small class="owner-puppies">${escapeHtml(text(this, "linkedPuppies"))}: ${escapeHtml(linked)}</small>` : ""}</span><ha-icon icon="mdi:chevron-${expanded ? "up" : "down"}"></ha-icon></button>
        <div class="owner-actions"><button type="button" data-edit="${escapeHtml(owner.id)}" title="${escapeHtml(text(this, "edit"))}" aria-label="${escapeHtml(text(this, "edit"))}"><ha-icon icon="mdi:pencil-outline"></ha-icon></button><button type="button" data-delete="${escapeHtml(owner.id)}" title="${escapeHtml(text(this, "remove"))}" aria-label="${escapeHtml(text(this, "remove"))}"><ha-icon icon="mdi:delete-outline"></ha-icon></button></div>
        ${this._ownerAttention(owner)}
        ${expanded ? this._ownerDetails(owner) : ""}
      </article>`;
    }).join("");
  }

  _ownerForm() {
    if (!this._showOwnerEditor) return `<button type="button" id="add-owner" class="primary add-owner"><ha-icon icon="mdi:plus"></ha-icon>${escapeHtml(text(this, "addOwner"))}</button>`;
    const contact = this._editingContact || {};
    const owner = this._ownerForLitter(contact, this._editingLitter);
    const litterOptions = [["", text(this, "unassigned")], ...this._litters.map((litter) => [litter.id, litter.name])].map(([id, label]) => `<option value="${escapeHtml(id)}" ${id === this._editingLitter ? "selected" : ""}>${escapeHtml(label)}</option>`).join("");
    return `<section class="owner-editor"><h3>${escapeHtml(text(this, this._editing ? "editOwner" : "addOwner"))}${contact.name ? `: ${escapeHtml(contact.name)}` : ""}</h3><form class="form">
      <label class="wide"><span>${escapeHtml(text(this, "dossierLitter"))}</span><select id="owner-litter" data-draft-ignore ${this._busy ? "disabled" : ""}>${litterOptions}</select></label>
      ${this._editorSection("contact", `
      <label><span>${escapeHtml(text(this, "name"))}</span><input name="name" required autocomplete="name" value="${escapeHtml(owner.name || "")}"></label>
      <label><span>${escapeHtml(text(this, "email"))}</span><input name="email" type="email" autocomplete="email" value="${escapeHtml(owner.email || "")}"></label>
      <label><span>${escapeHtml(text(this, "phone"))}</span><input name="phone" autocomplete="tel" value="${escapeHtml(owner.phone || "")}"></label>
      ${selectField(this, "role", text(this, "role"), OWNER_ROLE_LABELS, owner.role || "owner")}
      ${selectField(this, "contact_preference", text(this, "contactPreference"), CONTACT_PREFERENCE_LABELS, owner.contact_preference || "none")}
      <div class="owner-duplicates wide" role="status" aria-live="polite" hidden></div>
      `)}
      ${this._editorSection("address", `
      <label><span>${escapeHtml(text(this, "street"))}</span><input name="street" autocomplete="street-address" value="${escapeHtml(owner.street || owner.address || "")}"></label>
      <label><span>${escapeHtml(text(this, "postalCode"))}</span><input name="postal_code" autocomplete="postal-code" value="${escapeHtml(owner.postal_code || "")}"></label>
      <label><span>${escapeHtml(text(this, "city"))}</span><input name="city" autocomplete="address-level2" value="${escapeHtml(owner.city || "")}"></label>
      `)}
      ${this._editorSection("placement", `
      ${selectField(this, "placement_status", text(this, "placementStatus"), PLACEMENT_STATUS_LABELS, owner.placement_status || "interested")}
      <label><span>${escapeHtml(text(this, "placementDate"))}</span><input name="placement_date" type="date" value="${escapeHtml(owner.placement_date || "")}"></label>
      <label><span>${escapeHtml(text(this, "expectedPickupDate"))}</span><input name="expected_pickup_date" type="date" value="${escapeHtml(owner.expected_pickup_date || "")}"></label>
      <label class="completed-toggle wide"><input name="archived" type="checkbox" ${owner.archived ? "checked" : ""}>${escapeHtml(text(this, "archived"))}</label>
      `)}
      ${this._editorSection("preferences", this._puppyPreferenceFields(owner))}
      ${this._editorSection("financial", `
      ${selectField(this, "payment_status", text(this, "paymentStatus"), PAYMENT_STATUS_LABELS, owner.payment_status || "none")}
      <label><span>${escapeHtml(text(this, "paymentAmount"))}</span><input name="payment_amount" type="number" min="0" step="0.01" inputmode="decimal" value="${escapeHtml(owner.payment_amount ?? "")}"></label>
      <label><span>${escapeHtml(text(this, "registrationFeeAmount"))}</span><input name="registration_fee_amount" type="number" min="0" step="0.01" inputmode="decimal" value="${escapeHtml(owner.registration_fee_amount ?? "")}"></label>
      <label><span>${escapeHtml(text(this, "depositAmount"))}</span><input name="deposit_amount" type="number" min="0" step="0.01" inputmode="decimal" value="${escapeHtml(owner.deposit_amount ?? "")}"></label>
      <label><span>${escapeHtml(text(this, "depositDate"))}</span><input name="deposit_date" type="date" value="${escapeHtml(owner.deposit_date || "")}"></label>
      <label class="calculated"><span>${escapeHtml(text(this, "finalPaymentAmount"))}</span><output id="final-payment-amount">${escapeHtml(finalPaymentAmount(owner) || "—")}</output></label>
      <label><span>${escapeHtml(text(this, "paymentBalance"))}</span><input name="payment_balance" type="number" min="0" step="0.01" inputmode="decimal" value="${escapeHtml(owner.payment_balance ?? "")}"></label>
      ${selectField(this, "payment_method", text(this, "paymentMethod"), PAYMENT_METHOD_LABELS, owner.payment_method || "none")}
      <label><span>${escapeHtml(text(this, "paymentDate"))}</span><input name="payment_date" type="date" value="${escapeHtml(owner.payment_date || "")}"></label>
      `)}
      ${this._editorSection("notes", `
      <label class="wide"><span>${escapeHtml(text(this, "notes"))}</span><textarea name="notes" rows="5">${escapeHtml(owner.notes || "")}</textarea></label>
      <label class="wide"><span>${escapeHtml(text(this, "placementNotes"))}</span><textarea name="placement_notes" rows="3">${escapeHtml(owner.placement_notes || "")}</textarea></label>
      `)}
      ${this._ownerErrorMarkup()}
      <div class="owner-editor-actions wide"><div class="owner-draft-status" role="status" aria-live="polite"></div><div class="actions"><button type="button" class="secondary" id="cancel-owner">${escapeHtml(text(this, "cancel"))}</button><button type="submit" class="primary">${escapeHtml(text(this, this._editing ? "update" : "addOwner"))}</button></div></div>
    </form></section>`;
  }

  _editorSection(key, fields) {
    return `<details class="owner-editor-group wide" data-owner-editor-group="${key}" ${this._editorGroups[key] ? "open" : ""}><summary><ha-icon class="owner-section-chevron" icon="mdi:chevron-down" aria-hidden="true"></ha-icon>${escapeHtml(text(this, OWNER_EDITOR_SECTIONS[key].title))}</summary><div class="owner-editor-fields">${fields}</div></details>`;
  }

  _captureEditorGroups() {
    if (!this._formState.root || this._formState.root !== this.querySelector(".owner-editor form")) return;
    this.querySelectorAll("[data-owner-editor-group]").forEach((group) => { this._editorGroups[group.dataset.ownerEditorGroup] = group.open; });
  }

  _updateOwnerDraftStatus() {
    const status = this.querySelector(".owner-draft-status");
    if (!status) return;
    const message = this._formState.dirty ? text(this, "unsavedChanges") : "";
    if (status.textContent !== message) status.textContent = message;
  }

  _duplicateOwners() {
    const form = this._formState.root;
    if (!form) return [];
    const keys = ["email", "phone"].map((field) => [field, contactIdentity(field, form.elements[field].value)]).filter(([, key]) => key);
    if (!keys.length) return [];
    let index = this._duplicateIndexes.get(this._owners);
    if (!index) {
      // Reload/save replaces owner snapshots; weak keys let old indexes expire.
      index = { email: new Map(), phone: new Map(), owners: new Map() };
      for (const owner of this._owners) {
        index.owners.set(owner.id, owner);
        for (const field of ["email", "phone"]) {
          const key = contactIdentity(field, owner[field]);
          if (!key) continue;
          if (!index[field].has(key)) index[field].set(key, []);
          index[field].get(key).push(owner.id);
        }
      }
      this._duplicateIndexes.set(this._owners, index);
    }
    const matches = new Map();
    for (const [field, key] of keys) {
      for (const id of index[field].get(key) || []) {
        if (id === this._editing) continue;
        if (!matches.has(id)) matches.set(id, { owner: index.owners.get(id), fields: [] });
        matches.get(id).fields.push(field);
      }
    }
    return [...matches.values()];
  }

  _updateDuplicateWarning() {
    const warning = this.querySelector(".owner-duplicates");
    if (!warning || !this._isCurrent(this._context)) return;
    const matches = this._duplicateOwners();
    const signature = JSON.stringify(matches.map(({ owner, fields }) => [owner.id, owner.name, fields]));
    if (warning.dataset.matches === signature) return;
    warning.dataset.matches = signature;
    warning.hidden = !matches.length;
    warning.innerHTML = matches.length ? `<strong>${escapeHtml(text(this, "possibleDuplicate"))}</strong><div class="owner-duplicate-list">${matches.map(({ owner, fields }) => `<div class="owner-duplicate-match"><span><strong>${escapeHtml(owner.name)}</strong><small>${escapeHtml(text(this, "duplicateMatches"))}: ${escapeHtml(fields.map((field) => text(this, field)).join(", "))}</small></span><button type="button" class="secondary" data-open-duplicate-owner="${escapeHtml(owner.id)}" title="${escapeHtml(`${text(this, "openExistingOwner")}: ${owner.name}`)}" aria-label="${escapeHtml(`${text(this, "openExistingOwner")}: ${owner.name}`)}"><ha-icon icon="mdi:account-edit-outline" aria-hidden="true"></ha-icon>${escapeHtml(text(this, "openExistingOwner"))}</button></div>`).join("")}</div>` : "";
    warning.querySelectorAll("[data-open-duplicate-owner]").forEach((button) => button.addEventListener("click", () => {
      if (this._busy || !this._isCurrent(this._context)) return;
      const owner = this._owners.find((item) => item.id === button.dataset.openDuplicateOwner);
      if (!owner) return;
      const litters = this._ownerLitterIds(owner);
      const litterId = litters.includes(this._editingLitter) ? this._editingLitter : litters[0] || "";
      this._openEditor(owner.id, { litterId, section: "contact" });
    }));
    this._updateActionState();
  }

  _ownerErrorMarkup() {
    return `<div id="owner-error" class="message error wide" role="alert">${escapeHtml(this._error)}</div>${this._conflict ? `<button type="button" class="secondary wide" id="reload-owner-conflict"><ha-icon icon="mdi:refresh"></ha-icon>${escapeHtml(text(this, "reloadLatest"))}</button>` : ""}`;
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
    this._updateOwnerDraftStatus();
  }

  _render() {
    preserveScrollPosition(this, () => this._renderContent());
  }

  _renderContent() {
    if (!this._config) return;
    this._captureEditorGroups();
    const listScroll = this.querySelector(".list")?.scrollTop || 0;
    const pickupScroll = this.querySelector(".pickup-list")?.scrollTop || 0;
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
    if (!this._linkFormState.dirty) this._linkBaseline = { ownerIds: [...linked] };
    const litterOptions = this._litters.map((litter) => `<option value="${escapeHtml(litter.id)}" ${litter.id === this._selectedLitter ? "selected" : ""}>${escapeHtml(litter.name || text(this, "litter"))}</option>`).join("");
    const puppyOptions = litterPuppies.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === this._selectedPuppy ? "selected" : ""}>${escapeHtml(puppySelectorLabel(item, text(this, "puppy")))}</option>`).join("");

    const ownersView = this._activeView !== "matrix";
    const headerActions = `<div class="head-actions"><button type="button" id="export-owners-csv" class="secondary" ${!this._owners.length || this._loading ? "disabled" : ""}><ha-icon icon="mdi:file-delimited-outline"></ha-icon>${escapeHtml(text(this, "exportCsv"))}</button>${ownersView && !this._showOwnerEditor ? this._ownerForm() : ""}</div>`;
    const viewTabs = `<div class="view-tabs" role="tablist" aria-label="${escapeHtml(text(this, "title"))}"><button type="button" id="owners-view" role="tab" aria-selected="${ownersView}" class="${ownersView ? "active" : ""}"><ha-icon icon="mdi:account-multiple-outline"></ha-icon>${escapeHtml(text(this, "ownersView"))}</button><button type="button" id="matrix-view" role="tab" aria-selected="${!ownersView}" class="${ownersView ? "" : "active"}" ${this._showOwnerEditor ? "disabled" : ""}><ha-icon icon="mdi:table-large"></ha-icon>${escapeHtml(text(this, "matrixView"))}</button></div>`;
    const visibleOwners = ownersView ? this._visibleOwners() : [];
    const ownersContent = ownersView ? `${this._showOwnerEditor ? this._ownerForm() : ""}${this._ownerFilters()}<div class="owner-filter-summary">${this._filterSummary(visibleOwners)}</div><details class="pickup-agenda" ${this._pickupAgendaOpen ? "open" : ""}>${this._pickupAgenda(visibleOwners)}</details><section class="list" aria-live="polite">${this._ownerList(visibleOwners)}</section>${this._linkSection(litterPuppies, puppy, linked, litterOptions, puppyOptions)}` : "";
    const content = ownersView ? ownersContent : this._matrixView();
    const subtitle = text(this, ownersView ? "subtitle" : "matrixSubtitle");
    this.innerHTML = `<ha-card><div class="head"><div><div class="title">${escapeHtml(this._config.title || text(this, "title"))}</div><div class="sub">${escapeHtml(subtitle)}</div></div>${headerActions}</div>${viewTabs}${content}${this._showOwnerEditor ? "" : this._ownerErrorMarkup()}<div id="owner-status" class="message" role="status" aria-live="polite">${escapeHtml(this._status)}</div></ha-card><style>
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
      .owner-editor-group{min-width:0;border-top:1px solid var(--divider-color)}
      .owner-editor-group summary,.owner-detail-group summary{display:flex;align-items:center;gap:8px;min-height:48px;box-sizing:border-box;list-style:none;cursor:pointer}
      .owner-editor-group summary{padding:4px 0;font-weight:600}
      .owner-editor-group summary::-webkit-details-marker,.owner-detail-group summary::-webkit-details-marker{display:none}
      .owner-section-chevron{flex:0 0 20px;--mdc-icon-size:20px;transform:rotate(-90deg)}
      details[open]>summary>.owner-section-chevron{transform:none}
      .owner-section-title{flex:1;min-width:0;overflow-wrap:anywhere}
      .owner-detail-group summary>.owner-section-title{color:var(--primary-text-color);font-size:inherit;margin:0}
      .owner-section-edit{display:inline-grid;place-items:center;flex:0 0 44px;width:44px;height:44px;padding:0;border:0;border-radius:8px;background:transparent;color:var(--primary-color);cursor:pointer}
      .owner-section-edit ha-icon{--mdc-icon-size:20px}
      .owner-editor-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;min-width:0;padding:4px 0 14px}
      .owner-editor-group summary:focus-visible,.owner-section-edit:focus-visible{outline:2px solid var(--primary-color);outline-offset:2px}
      .owner-draft-status{min-height:20px;line-height:20px;font-size:.8rem;color:var(--warning-color,var(--secondary-text-color))}
      .owner-duplicates{min-width:0;padding:10px;border-left:3px solid var(--warning-color,var(--primary-color));background:var(--secondary-background-color);border-radius:6px;font-size:.8rem}
      .owner-duplicates[hidden]{display:none}
      .owner-duplicate-list{max-height:200px;overflow-y:auto;margin-top:5px}
      .owner-duplicate-match{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:6px 10px;padding:6px 0;min-width:0}
      .owner-duplicate-match>span{min-width:0;overflow-wrap:anywhere}
      .owner-duplicate-match strong,.owner-duplicate-match small{display:block}
      .owner-duplicate-match small{margin-top:3px;color:var(--secondary-text-color)}
      .owner-duplicate-match button{min-height:44px;max-width:100%;white-space:normal;overflow-wrap:anywhere;font-size:inherit}
      .owner-editor-actions{border-top:1px solid var(--divider-color);padding-top:10px}
      .owner-editor-actions button{min-height:44px;min-width:0;white-space:normal;overflow-wrap:anywhere}
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
      .owner-filters{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));align-items:end;gap:10px;margin-top:16px}
      .owner-filter-summary{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin:12px 0;font-size:.85rem}
      .owner-filter-summary small{display:block;color:var(--secondary-text-color);margin-top:3px}
      .pickup-agenda{border-block:1px solid var(--divider-color);margin:12px 0}
      .pickup-agenda summary{padding:14px 0;cursor:pointer;font-weight:600;min-height:44px;box-sizing:border-box}
      .pickup-agenda .sub{margin:0 0 10px}
      .pickup-list{max-height:360px;overflow-y:auto;overflow-anchor:none}
      .pickup-list h4{margin:12px 0 6px;font-size:.9rem}
      .pickup-entry{display:flex;align-items:center;gap:12px;width:100%;text-align:start;padding:12px;margin-bottom:6px;border:1px solid var(--divider-color);border-radius:8px;background:var(--card-background-color);color:var(--primary-text-color);font:inherit;cursor:pointer;overflow-wrap:anywhere}
      .pickup-entry>span:first-child{flex:1;min-width:0;display:grid;gap:4px}
      .pickup-entry small{color:var(--secondary-text-color)}
      .pickup-entry .pickup-past{color:var(--warning-color,#765800)}
      .pickup-edit-label{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
      .owner-filters label,.dossier-select,.assign-dossier label{display:grid;gap:4px;min-width:0;color:var(--secondary-text-color);font-size:.78rem}
      .owner-filters select,.owner-filters input[type=search],.dossier-select select,.assign-dossier select{box-sizing:border-box;width:100%;min-height:42px;padding:8px;border:1px solid var(--divider-color);border-radius:8px;background:var(--card-background-color);color:var(--primary-text-color);font:inherit}
      .form .completed-toggle{display:flex;align-items:center;gap:8px;grid-column:1/-1}
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
      .owner-toggle .owner-dossier-summary{display:flex;flex-wrap:wrap;gap:2px 12px;margin-top:5px;line-height:1.5}
      .owner-dossier-summary>span{overflow-wrap:anywhere}
      .owner-toggle .owner-puppies{color:var(--primary-text-color);margin-top:5px;font-weight:600}
      .owner-actions{display:flex;gap:5px}
      .owner-actions button{width:38px;padding:0}
      .owner-actions ha-icon{--mdc-icon-size:19px}
      .owner-attention{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:6px;min-width:0}
      .owner-attention-action{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:44px;max-width:100%;padding:6px 10px;border:1px solid var(--divider-color);border-radius:6px;background:var(--secondary-background-color);color:var(--warning-color,var(--primary-text-color));font:inherit;font-size:.78rem;text-align:left;overflow-wrap:anywhere;cursor:pointer}
      .owner-attention-action ha-icon{flex:0 0 18px;--mdc-icon-size:18px}
      .owner-attention-action:focus-visible{outline:2px solid var(--primary-color);outline-offset:2px}
      .owner-detail{grid-column:1/-1;min-width:0;font-size:.85rem}
      .owner-detail-group{border-top:1px solid var(--divider-color)}
      .owner-detail-group summary{padding:4px 2px;color:var(--primary-text-color);font-weight:600;overflow-wrap:anywhere}
      .owner-detail-group summary:focus-visible{outline:2px solid var(--primary-color);outline-offset:2px}
      .owner-detail-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;padding:2px 2px 14px}
      .payment-history{display:grid;gap:10px}.payment-history p{margin:0;color:var(--secondary-text-color);font-size:.85rem}.payment-history ul{list-style:none;margin:0;padding:0}.payment-history li{display:flex;justify-content:space-between;align-items:center;gap:10px;border-top:1px solid var(--divider-color);padding:8px 0}.payment-history li>div{min-width:0;overflow-wrap:anywhere}.payment-history li small{display:block;color:var(--secondary-text-color)}.payment-history li.voided{opacity:.65}.payment-event-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.payment-event-form label{display:grid;gap:4px}.payment-event-form .actions{grid-column:1/-1}
      .owner-detail-fields>div{min-width:0;overflow-wrap:anywhere}
      .owner-detail span{display:block;color:var(--secondary-text-color);font-size:.72rem;margin-bottom:3px}
      .owner-detail .wide{grid-column:1/-1}
      .owner-detail .preformatted>div{white-space:pre-wrap;word-break:break-word}
      .owner-detail .notes>div{max-height:none;overflow:visible}
      .owner-contact-row{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;min-width:0}
      .owner-contact-row>.owner-contact-text{min-width:0;margin:0;color:var(--primary-text-color);font-size:inherit;overflow-wrap:anywhere;user-select:text}
      .owner-contact-actions{display:flex;flex-wrap:wrap;gap:2px}
      .owner-contact-action{display:inline-grid;place-items:center;width:44px;height:44px;box-sizing:border-box;padding:0;border:1px solid var(--divider-color);border-radius:6px;background:var(--secondary-background-color);color:var(--primary-color);text-decoration:none;cursor:pointer}
      .owner-contact-action ha-icon{--mdc-icon-size:20px}
      .owner-contact-action:focus-visible{outline:2px solid var(--primary-color);outline-offset:2px}
      .owner-contact-feedback{min-height:20px;color:var(--secondary-text-color);font-size:.78rem}
      .checks{min-width:0;margin:2px 0 0;padding:10px;border:1px solid var(--divider-color);border-radius:8px;display:grid;gap:7px;max-height:260px;overflow-y:auto}
      .checks legend{padding:0 4px;color:var(--secondary-text-color);font-size:.78rem}
      .checks label{display:flex;align-items:center;gap:7px;color:var(--primary-text-color)}
      .empty,.message{color:var(--secondary-text-color);padding:10px 2px}
      .message:empty{display:none}
      .error{color:var(--error-color)}
      .matrix-view{margin-top:14px}
      .matrix-controls{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end}
      .matrix-controls>label:not(.matrix-toggle),.mobile-puppy-select{display:grid;gap:4px;min-width:0;color:var(--secondary-text-color);font-size:.78rem}
      .matrix-controls>label:not(.matrix-toggle){flex:1 1 220px}
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
        .form,.link-form,.owner-detail-fields,.owner-editor-fields,.preference-row,.owner-filters,.payment-event-form{grid-template-columns:1fr}
        .wide,.checks,.owner-detail .wide{grid-column:auto}
        .owner{grid-template-columns:minmax(0,1fr) auto}
        .owner-actions{flex-direction:column}
        .actions{flex-wrap:wrap}
        .actions button{flex:1 1 auto}
      }
    </style>`;

    if (this.querySelector(".list")) this.querySelector(".list").scrollTop = listScroll;
    if (this.querySelector(".pickup-list")) this.querySelector(".pickup-list").scrollTop = pickupScroll;
    this._formState.bind(this.querySelector(".owner-editor form"));
    this._syncPaymentStatus();
    const ownerForm = this._formState.root;
    if (ownerForm) {
      this._updateDuplicateWarning();
      for (const event of ["input", "change"]) ownerForm.addEventListener(event, () => { this._updateOwnerDraftStatus(); this._updateDuplicateWarning(); });
      ownerForm.querySelectorAll("[data-owner-editor-group]").forEach((group) => group.addEventListener("toggle", () => {
        if (group.isConnected && group.closest("form") === this._formState.root) this._editorGroups[group.dataset.ownerEditorGroup] = group.open;
      }));
    }
    this._linkFormState.bind(this.querySelector(".link-form .checks"));
    this._updateFinalPaymentPreview();
    const savedStatus = this.querySelector("#owner-status");
    if (this._status && this._lastSavedOwnerId && savedStatus) {
      appendEditAction(this, savedStatus, () => this._openEditor(this._lastSavedOwnerId, { litterId: this._lastSavedLitter }), text(this, "editOwner"));
    }
    this._savedRefresh.bind(savedStatus);
    this.querySelector("#reload-owner-conflict")?.addEventListener("click", () => this._reloadConflict());
    this.querySelectorAll('.checks input').forEach((input) => input.addEventListener("change", () => this._updateActionState()));
    this.querySelector(".owner-editor form")?.addEventListener("submit", (event) => { event.preventDefault(); this._save(event.currentTarget); });
    this.querySelector("#export-owners-csv")?.addEventListener("click", () => this._downloadOwnersCsv());
    this.querySelector("#owners-view")?.addEventListener("click", () => this._switchView("owners"));
    this.querySelector("#matrix-view")?.addEventListener("click", () => this._switchView("matrix"));
    this.querySelector("#add-owner")?.addEventListener("click", () => this._openEditor());
    this._bindOwnerOverview();
    this.querySelector(".pickup-agenda")?.addEventListener("toggle", (event) => {
      if (event.currentTarget.isConnected) this._pickupAgendaOpen = event.currentTarget.open;
    });
    this.querySelector("#owner-scope")?.addEventListener("change", (event) => {
      const scope = event.target.value;
      const litterId = ["__all__", "__unassigned__"].includes(scope) ? this._selectedLitter : scope;
      if (!this._changeLitter(litterId, scope)) event.target.value = this._ownerScope;
    });
    this.querySelector("#owner-status-filter")?.addEventListener("change", (event) => {
      this._placementFilter = event.target.value;
      this._matrixSelection = null;
      this._render();
      this.querySelector("#owner-status-filter")?.focus({ preventScroll: true });
      this._scheduleRefresh();
    });
    this.querySelector("#owner-search")?.addEventListener("input", (event) => {
      this._ownerSearch = event.target.value;
      this._refreshOwnerResults();
    });
    this.querySelector("#owner-sort")?.addEventListener("change", (event) => {
      this._ownerSort = event.target.value;
      const list = this.querySelector(".list");
      list.innerHTML = this._ownerList();
      list.scrollTop = 0;
      this._bindOwnerRows();
    });
    this.querySelector("#owner-litter")?.addEventListener("change", (event) => {
      this._captureEditorGroups();
      if (!this._formState.discard()) { event.target.value = this._editingLitter; return; }
      this._editingLitter = event.target.value;
      this._paymentBeforeFull = null;
      this._render();
      this.querySelector("#owner-litter")?.focus({ preventScroll: true });
    });
    this.querySelector("#cancel-owner")?.addEventListener("click", () => {
      if (!this._formState.discard()) return;
      this._editing = null;
      this._editingContact = null;
      this._showOwnerEditor = false;
      this._error = "";
      this._conflict = false;
      this._render();
      this._queueRefresh();
    });
    this._bindOwnerRows();
    this.querySelector('[name="payment_status"]')?.addEventListener("change", () => this._syncPaymentStatus(true));
    this.querySelectorAll('input[name="payment_amount"], input[name="registration_fee_amount"], input[name="deposit_amount"]').forEach((input) => input.addEventListener("input", () => this._updateFinalPaymentPreview()));
    this.querySelector("#link-litter")?.addEventListener("change", (event) => { if (!this._changeLitter(event.target.value)) event.target.value = this._selectedLitter; });
    this.querySelector("#link-puppy")?.addEventListener("change", (event) => { if (!this._linkFormState.discard()) { event.target.value = this._selectedPuppy; return; } this._selectedPuppy = event.target.value; this._render(); this._scheduleRefresh(); });
    this.querySelector("#link-save")?.addEventListener("click", () => this._link());
    this.querySelector("#matrix-litter")?.addEventListener("change", (event) => { if (!this._changeLitter(event.target.value)) event.target.value = this._selectedLitter; });
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
    this.querySelectorAll("[data-matrix-edit-owner]").forEach((button) => button.addEventListener("click", (event) => this._openEditor(event.currentTarget.dataset.matrixEditOwner, { section: "preferences" })));
  }

  _bindOwnerRows() {
    this.querySelectorAll("[data-add-payment]").forEach(button => button.addEventListener("click", () => {
      const now = new Date();
      this._paymentDraft = { ownerId: button.dataset.addPayment, litterId: button.dataset.paymentLitter,
        requestId: createUuid(), amount: "", date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
        kind: "other", method: "bank_transfer", reference: "", note: "" };
      this._render();
      this.querySelector(".payment-event-form [name=amount]")?.focus({ preventScroll: true });
    }));
    this.querySelectorAll("[data-payment-form]").forEach(form => {
      const capture = () => { if (this._paymentDraft) Object.assign(this._paymentDraft, Object.fromEntries(new FormData(form).entries())); };
      form.addEventListener("input", capture);
      form.addEventListener("change", capture);
      form.addEventListener("submit", event => { event.preventDefault(); this._savePayment(form); });
      form.querySelector("[data-cancel-payment]")?.addEventListener("click", () => { this._paymentDraft = null; this._render(); });
    });
    this.querySelectorAll("[data-void-payment]").forEach(button => button.addEventListener("click", () => this._voidPayment(button)));
    this.querySelectorAll("[data-copy-owner-contact]").forEach((button) => button.addEventListener("click", () => this._copyContact(button.dataset.copyOwnerContact, button.dataset.contactField)));
    this.querySelectorAll("[data-owner-group]").forEach((group) => group.addEventListener("toggle", () => {
      if (!group.isConnected) return;
      const state = this._ownerGroups.get(group.dataset.groupOwner) || {};
      state[group.dataset.ownerGroup] = group.open;
      this._ownerGroups.set(group.dataset.groupOwner, state);
    }));
    this.querySelectorAll("[data-toggle-owner]").forEach((button) => button.addEventListener("click", () => { this._expandedOwnerId = this._expandedOwnerId === button.dataset.toggleOwner ? null : button.dataset.toggleOwner; this._render(); }));
    this.querySelectorAll("[data-delete]").forEach((button) => button.addEventListener("click", () => this._delete(button.dataset.delete)));
    this.querySelectorAll("[data-edit]").forEach((button) => button.addEventListener("click", () => this._openEditor(button.dataset.edit)));
    this.querySelectorAll("[data-edit-owner-section]").forEach((button) => button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this._openEditor(button.dataset.sectionOwner, { section: button.dataset.editOwnerSection, litterId: button.dataset.sectionLitter });
    }));
    this.querySelectorAll("[data-mark-paid]").forEach((button) => button.addEventListener("click", () => this._openEditor(button.dataset.markPaid, { paidInFull: true })));
    this.querySelectorAll("[data-owner-dossier]").forEach((select) => select.addEventListener("change", () => { this._detailLitters.set(select.dataset.ownerDossier, select.value); this._render(); }));
    this.querySelectorAll("[data-add-dossier]").forEach((button) => button.addEventListener("click", () => {
      const owner = this._owners.find((item) => item.id === button.dataset.addDossier);
      const litter = this._litters.find((item) => !owner.placements?.[item.id]);
      if (litter) this._openEditor(owner.id, { litterId: litter.id, section: "placement" });
    }));
    this.querySelectorAll("[data-assign-owner]").forEach((button) => button.addEventListener("click", () => {
      const select = [...this.querySelectorAll("[data-assign-litter]")].find((item) => item.dataset.assignLitter === button.dataset.assignOwner);
      this._assignDossier(button.dataset.assignOwner, select?.value);
    }));
    this._updateActionState();
  }
}

if (!customElements.get(TAG)) customElements.define(TAG, PuppyTrackerOwnerCard);
window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === TAG)) window.customCards.push({ type: TAG, name: "Puppy Tracker Owners", description: "Manage owner contacts and puppy links." });
