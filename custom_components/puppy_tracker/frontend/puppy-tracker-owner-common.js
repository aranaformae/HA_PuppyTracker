import { calendarDate, escapeHtml, languageForHass } from "./puppy-tracker-card-common.js";

/** Shared owner labels and stateless formatting; no card registration or retained state. */
export const TAG = "puppy-tracker-owner-card";

export const OWNER_EDITOR_SECTIONS = {
  contact: { title: "contactDetails", edit: "editContact", field: "name" },
  address: { title: "addressDetails", edit: "editAddress", field: "street" },
  placement: { title: "placementDetails", edit: "editPlacement", field: "placement_status" },
  preferences: { title: "puppyPreferences", edit: "editPreferences", field: "preference_puppy_1" },
  financial: { title: "financialDetails", edit: "editFinancial", field: "payment_status" },
  notes: { title: "notesSection", edit: "editNotes", field: "notes" },
};

export const OWNER_ROLE_LABELS = {
  owner: { nl: "Eigenaar", en: "Owner" },
  co_owner: { nl: "Mede-eigenaar", en: "Co-owner" },
  breeder: { nl: "Fokker", en: "Breeder" },
  veterinarian: { nl: "Dierenarts", en: "Veterinarian" },
  contact: { nl: "Contactpersoon", en: "Contact" },
};
export const PLACEMENT_STATUS_LABELS = {
  interested: { nl: "Interesse", en: "Interested" }, option: { nl: "Optie", en: "Option" },
  reserved: { nl: "Gereserveerd", en: "Reserved" }, sold: { nl: "Verkocht", en: "Sold" }, placed: { nl: "Geplaatst", en: "Placed" },
};
export const PLACEMENT_FILTER_LABELS = {
  active: { nl: "Actief (inclusief verkocht)", en: "Active (including sold)" },
  all: { nl: "Alle dossiers", en: "All dossiers" },
  ...PLACEMENT_STATUS_LABELS,
  archived: { nl: "Gearchiveerde dossiers", en: "Archived dossiers" },
};
export const OWNER_SORT_LABELS = {
  name: { nl: "Naam", en: "Name" },
  pickup: { nl: "Eerstvolgende ophaaldatum", en: "Next pickup date" },
  status: { nl: "Plaatsingsstatus", en: "Placement status" },
  balance: { nl: "Hoogste openstaande bedrag", en: "Highest outstanding amount" },
};
export const PAYMENT_STATUS_LABELS = {
  none: { nl: "Geen", en: "None" }, registration_fee: { nl: "Inschrijfgeld", en: "Registration fee" },
  deposit: { nl: "Aanbetaling", en: "Deposit" }, full: { nl: "Volledig betaald", en: "Paid in full" },
};
export const CONTACT_PREFERENCE_LABELS = {
  none: { nl: "Geen voorkeur", en: "No preference" }, email: { nl: "E-mail", en: "Email" },
  phone: { nl: "Telefoon", en: "Phone" }, whatsapp: { nl: "WhatsApp", en: "WhatsApp" },
};
export const PAYMENT_METHOD_LABELS = {
  none: { nl: "Niet opgegeven", en: "Not specified" }, bank_transfer: { nl: "Bankoverschrijving", en: "Bank transfer" },
  cash: { nl: "Contant", en: "Cash" }, card: { nl: "Kaart", en: "Card" }, other: { nl: "Anders", en: "Other" },
};
export const PAYMENT_KIND_LABELS = {
  registration_fee: { nl: "Inschrijfgeld", en: "Registration fee" },
  deposit: { nl: "Aanbetaling", en: "Deposit" },
  final: { nl: "Slotbetaling", en: "Final payment" },
  other: { nl: "Overig", en: "Other" },
};
export const SEX_LABELS = {
  male: { nl: "Reu", en: "Male" },
  female: { nl: "Teef", en: "Female" },
};

export const COPY = {
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

export function text(card, key) {
  const language = languageForHass(card?._hass);
  return COPY[language]?.[key] || COPY.nl[key] || key;
}

export function optionLabel(card, value, labels, fallback = "") {
  const language = languageForHass(card?._hass);
  return labels[value]?.[language] || labels[value]?.nl || labels[fallback]?.[language] || labels[fallback]?.nl || fallback || value || text(card, "unknown");
}

export function selectField(card, name, label, labels, value) {
  const options = Object.keys(labels).map((key) => `<option value="${escapeHtml(key)}" ${key === value ? "selected" : ""}>${escapeHtml(optionLabel(card, key, labels))}</option>`).join("");
  return `<label><span>${escapeHtml(label)}</span><select name="${escapeHtml(name)}">${options}</select></label>`;
}

export function formattedDate(card, value, includeTime = false) {
  if (!value) return "—";
  const date = new Date(includeTime ? value : `${value}T12:00:00`);
  if (!Number.isFinite(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(languageForHass(card?._hass) === "en" ? "en-US" : "nl-NL", includeTime
    ? { dateStyle: "medium", timeStyle: "short", timeZone: card._hass?.config?.time_zone || undefined }
    : { dateStyle: "medium" }).format(date);
}

export function csvCell(value) {
  return `"${String(value ?? "").replace(/\r\n?/g, "\n").replaceAll('"', '""')}"`;
}

export function configuredCsvDelimiter(config) {
  return config?.csv_delimiter === "semicolon" || config?.csv_delimiter === ";" ? ";" : ",";
}

export function dateOnly(value, fallback = "", hass = null) {
  const selected = String(value || fallback || "");
  if (selected.includes("T")) return calendarDate(selected, hass);
  return /^\d{4}-\d{2}-\d{2}/.test(selected) ? selected.slice(0, 10) : selected;
}

export function numericAmount(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const parsed = Number(String(value).trim().replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function finalPaymentAmount(values) {
  const total = numericAmount(values?.payment_amount);
  if (total === null) return "";
  const registrationFee = numericAmount(values?.registration_fee_amount) ?? 0;
  const deposit = numericAmount(values?.deposit_amount) ?? 0;
  const result = Math.round((total - registrationFee - deposit + Number.EPSILON) * 100) / 100;
  if (result < 0) return "";
  return result.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

export function formattedAmount(card, value) {
  const amount = numericAmount(value);
  if (amount === null) return null;
  const configuredCurrency = card._hass?.config?.currency;
  const currency = /^[A-Z]{3}$/.test(configuredCurrency || "") ? configuredCurrency : "EUR";
  return new Intl.NumberFormat(languageForHass(card._hass) === "en" ? "en-US" : "nl-NL", {
    style: "currency", currency,
  }).format(amount);
}

export function contactPhone(value) {
  const number = String(value || "").trim().replace(/[\s().-]/g, "").replace(/^00/, "+");
  return /^(?:\+[1-9]\d{5,14}|\d{6,15})$/.test(number) ? number : null;
}

export function contactEmail(value) {
  const address = String(value || "").trim();
  return /^[^@\s<>?,;:#]+@[^@\s<>?,;:#]+$/.test(address) ? address : null;
}

export function contactIdentity(field, value) {
  return field === "phone" ? contactPhone(value) : contactEmail(value)?.toLowerCase() || null;
}

export function csvFilename() {
  const stamp = new Date().toISOString().replaceAll("-", "").replaceAll(":", "").slice(0, 15);
  return `puppy-tracker-owners-${stamp}Z.csv`;
}

export function detail(card, label, value, className = "") {
    return `<div class="${className}"><span>${escapeHtml(label)}</span><div>${escapeHtml(value ?? "—")}</div></div>`;
}
