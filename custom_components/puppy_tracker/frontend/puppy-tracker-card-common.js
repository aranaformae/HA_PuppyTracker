export const DOMAIN = "puppy_tracker";

const CARD_TRANSLATIONS = {
  en: {
    add: "Add",
    activeEntry: "active item",
    activeEntries: "active items",
    additionalData: "Additional data",
    all: "All",
    allInOrder: "Everything is in order",
    administeredBy: "Administered by",
    administeredByPlaceholder: "Name or role",
    attention: "Attention",
    attentionCardDescription: "Shows weight alerts and upcoming dossier actions.",
    attentionDataLoadFailed: "Attention data could not be loaded.",
    cancel: "Cancel",
    careResult: "Result",
    careScore: "Score",
    chooseLitter: "Choose litter",
    collarColor: "Collar color",
    confirmDeleteRecord: "Delete dossier item \"{title}\"? You can restore it later.",
    dataRefreshFailed: "New Puppy Tracker data could not be loaded.",
    dateAndTime: "Date and time",
    deworming: "Deworming",
    dewormingNextDue: "Next deworming",
    deletedItemsLoadFailed: "Deleted dossier items could not be loaded.",
    diagnosis: "Finding / diagnosis",
    diagnosisPlaceholder: "Main findings",
    detailsPlaceholder: "Details or special notes...",
    dossier: "Dossier",
    dossierCardDescription: "Profile notes and chronological dossier items for litters and puppies.",
    dossierFor: "Dossier for",
    dossierItem: "Dossier item",
    dossierItemAdded: "Dossier item added.",
    dossierItemAdd: "Add dossier item...",
    dossierItemCouldNotDelete: "Dossier item could not be deleted.",
    dossierItemCouldNotRestore: "Dossier item could not be restored.",
    dossierItemCouldNotSave: "Dossier item could not be saved.",
    dossierItemDeleted: "Dossier item deleted.",
    dossierItemDelete: "Deleting dossier item...",
    dossierItemRestored: "Dossier item restored.",
    dossierItemRestore: "Restoring dossier item...",
    dossierItemSave: "Saving dossier item...",
    dossierItemUpdated: "Dossier item updated.",
    dossierLoadFailed: "The dossier could not be loaded.",
    dossierRefreshFailed: "The dossier could not be refreshed.",
    dosage: "Dosage",
    dosagePlaceholder: "For example 1 ml or by weight",
    duration: "Duration / period",
    durationPlaceholder: "For example 5 days",
    editDossierItem: "Edit dossier item",
    editProfileNote: "Edit profile note",
    extraDataOptional: "optional",
    frequency: "Frequency",
    frequencyPlaceholder: "For example twice a day",
    goodWeightAndDossier: "No active weight or dossier alerts.",
    invalidDateTime: "Enter a valid date and time.",
    laboratory: "Laboratory / authority",
    laboratoryPlaceholder: "Laboratory or authority name",
    litter: "Litter",
    litterDossier: "Litter dossier",
    litterDossierLoadFailed: "Litter dossier could not be loaded.",
    loading: "Loading...",
    milestone: "Milestone",
    milestonePlaceholder: "For example eyes open",
    milestoneCategory: "Category",
    milestoneCategoryPlaceholder: "For example development or socialization",
    medication: "Medication",
    medicationPlaceholder: "Medication name",
    name: "Name",
    nest: "Litter",
    noActiveWeightAlert: "No active alert",
    no: "No",
    noDossierItems: "No dossier items for {owner}.",
    noDossierItemsCanAdd: " Add the first item.",
    noDossierItemsInCategories: "No dossier items within the selected categories.",
    noItemsToShow: "No items to show.",
    noLitter: "No litter",
    noProfileNote: "No profile note yet.",
    noProfileNoteCanAdd: " Tap the pencil to add one.",
    newDossierItem: "New dossier item",
    note: "Note",
    optional: "optional",
    other: "Other",
    overviewCouldNotLoad: "Litter data could not be loaded.",
    profileNote: "Profile note",
    profileNoteHint: "Long-lived summary for this puppy",
    profileNotePlaceholder: "For example character, markings or lasting details...",
    profileNoteCouldNotSave: "Profile note could not be saved.",
    profileNoteSave: "Saving profile note...",
    profileNoteSaved: "Profile note saved.",
    product: "Product",
    productPlaceholder: "Deworming product name",
    puppy: "Puppy",
    puppyTrackerDossier: "Puppy dossier",
    recordTitlePlaceholder: "Short description",
    removed: "Deleted",
    restore: "Restore",
    save: "Save",
    saveChanges: "Save changes",
    showDeleted: "Show deleted",
    delete: "Delete",
    test: "Test / result",
    temperature: "Temperature",
    testName: "Test / examination",
    testNamePlaceholder: "For example Giardia rapid test",
    testResult: "Result",
    testResultPlaceholder: "For example negative / clear / carrier",
    timeline: "Timeline",
    title: "Title",
    treatment: "Treatment / advice",
    treatmentPlaceholder: "Treatment, advice or follow-up",
    type: "Type",
    upcoming: "Upcoming",
    upcomingHint: "Derived from due dates in dossier records",
    validMeasurementMissing: "No valid measurement yet",
    vaccination: "Vaccination",
    vaccine: "Vaccine",
    vaccinePlaceholder: "For example Nobivac Puppy DP",
    vaccinationNextDue: "Next vaccination",
    batchNumber: "Batch / lot number",
    batchNumberPlaceholder: "For example ABC123",
    veterinarian: "Veterinarian",
    veterinarianPlaceholder: "Veterinarian name",
    vetVisit: "Veterinary visit",
    clinic: "Practice / clinic",
    clinicPlaceholder: "Practice name",
    visitReason: "Visit reason",
    visitReasonPlaceholder: "For example litter check",
    weightChange: "Last change {weight}",
    weightDue: "Last weighing {time} ago",
    weightGrowth: "Growth {percent} per 24 hours",
    weightSinceBirth: "Since birth {percent}",
    first24h: "First 24 hours",
    overdueOne: "1 day overdue",
    overdueMany: "{days} days overdue",
    today: "Today",
    tomorrow: "Tomorrow",
    inDays: "In {days} days",
    planned: "Planned",
    yes: "Yes",
  },
  nl: {
    add: "Toevoegen",
    activeEntry: "actieve vermelding",
    activeEntries: "actieve vermeldingen",
    additionalData: "Aanvullende gegevens",
    all: "Alles",
    allInOrder: "Alles op orde",
    administeredBy: "Toegediend door",
    administeredByPlaceholder: "Naam of rol",
    attention: "Aandacht",
    attentionCardDescription: "Toont gewichtswaarschuwingen en aankomende dossieracties.",
    attentionDataLoadFailed: "Aandachtsgegevens konden niet worden geladen.",
    cancel: "Annuleren",
    careResult: "Resultaat",
    careScore: "Score",
    chooseLitter: "Nest kiezen",
    collarColor: "Halsbandkleur",
    confirmDeleteRecord: "Dossieritem \"{title}\" verwijderen? Je kunt het later herstellen.",
    dataRefreshFailed: "Nieuwe Puppy Tracker-data kon niet worden geladen.",
    dateAndTime: "Datum en tijd",
    deworming: "Ontworming",
    dewormingNextDue: "Volgende ontworming",
    deletedItemsLoadFailed: "Verwijderde dossieritems konden niet worden geladen.",
    diagnosis: "Bevinding / diagnose",
    diagnosisPlaceholder: "Belangrijkste bevindingen",
    detailsPlaceholder: "Details of bijzonderheden...",
    dossier: "Dossier",
    dossierCardDescription: "Profielnotities en chronologische dossieritems voor nesten en pups.",
    dossierFor: "Dossier van",
    dossierItem: "Dossieritem",
    dossierItemAdded: "Dossieritem toegevoegd.",
    dossierItemAdd: "Dossieritem toevoegen...",
    dossierItemCouldNotDelete: "Dossieritem kon niet worden verwijderd.",
    dossierItemCouldNotRestore: "Dossieritem kon niet worden hersteld.",
    dossierItemCouldNotSave: "Dossieritem kon niet worden opgeslagen.",
    dossierItemDeleted: "Dossieritem verwijderd.",
    dossierItemDelete: "Dossieritem verwijderen...",
    dossierItemRestored: "Dossieritem hersteld.",
    dossierItemRestore: "Dossieritem herstellen...",
    dossierItemSave: "Dossieritem opslaan...",
    dossierItemUpdated: "Dossieritem bijgewerkt.",
    dossierLoadFailed: "Het dossier kon niet worden geladen.",
    dossierRefreshFailed: "Het dossier kon niet worden vernieuwd.",
    dosage: "Dosering",
    dosagePlaceholder: "Bijvoorbeeld 1 ml of volgens gewicht",
    duration: "Duur / periode",
    durationPlaceholder: "Bijvoorbeeld 5 dagen",
    editDossierItem: "Dossieritem aanpassen",
    editProfileNote: "Profielnotitie aanpassen",
    extraDataOptional: "optioneel",
    frequency: "Frequentie",
    frequencyPlaceholder: "Bijvoorbeeld 2x per dag",
    goodWeightAndDossier: "Geen actieve gewichts- of dossierwaarschuwingen.",
    invalidDateTime: "Vul een geldige datum en tijd in.",
    laboratory: "Laboratorium / instantie",
    laboratoryPlaceholder: "Naam laboratorium of instantie",
    litter: "Nest",
    litterDossier: "Nestdossier",
    litterDossierLoadFailed: "Nestdossier kon niet worden geladen.",
    loading: "Laden...",
    milestone: "Mijlpaal",
    milestonePlaceholder: "Bijvoorbeeld ogen open",
    milestoneCategory: "Categorie",
    milestoneCategoryPlaceholder: "Bijvoorbeeld ontwikkeling of socialisatie",
    medication: "Medicatie",
    medicationPlaceholder: "Naam geneesmiddel",
    name: "Naam",
    nest: "Nest",
    noActiveWeightAlert: "Geen actieve waarschuwing",
    no: "Nee",
    noDossierItems: "Nog geen dossieritems voor {owner}.",
    noDossierItemsCanAdd: " Voeg de eerste vermelding toe.",
    noDossierItemsInCategories: "Geen dossieritems binnen de geselecteerde categorieen.",
    noItemsToShow: "Geen items om te tonen.",
    noLitter: "Geen nest",
    noProfileNote: "Nog geen profielnotitie.",
    noProfileNoteCanAdd: " Tik op het potlood om er een toe te voegen.",
    newDossierItem: "Nieuw dossieritem",
    note: "Notitie",
    optional: "optioneel",
    other: "Overig",
    overviewCouldNotLoad: "Nestdata kon niet worden geladen.",
    profileNote: "Profielnotitie",
    profileNoteHint: "Blijvende samenvatting van deze pup",
    profileNotePlaceholder: "Bijvoorbeeld karakter, herkenningspunten of blijvende bijzonderheden...",
    profileNoteCouldNotSave: "Profielnotitie kon niet worden opgeslagen.",
    profileNoteSave: "Profielnotitie opslaan...",
    profileNoteSaved: "Profielnotitie opgeslagen.",
    product: "Middel",
    productPlaceholder: "Naam ontwormingsmiddel",
    puppy: "Pup",
    puppyTrackerDossier: "Puppydossier",
    recordTitlePlaceholder: "Korte omschrijving",
    removed: "Verwijderd",
    restore: "Herstellen",
    save: "Opslaan",
    saveChanges: "Wijzigingen opslaan",
    showDeleted: "Verwijderde tonen",
    delete: "Verwijderen",
    test: "Test / uitslag",
    temperature: "Temperatuur",
    testName: "Test / onderzoek",
    testNamePlaceholder: "Bijvoorbeeld Giardia sneltest",
    testResult: "Uitslag",
    testResultPlaceholder: "Bijvoorbeeld negatief / vrij / drager",
    timeline: "Tijdlijn",
    title: "Titel",
    treatment: "Behandeling / advies",
    treatmentPlaceholder: "Behandeling, advies of vervolg",
    type: "Type",
    upcoming: "Aankomend",
    upcomingHint: "Afgeleid uit vervolgdatums in dossierrecords",
    validMeasurementMissing: "Nog geen geldige meting",
    vaccination: "Vaccinatie",
    vaccine: "Vaccin",
    vaccinePlaceholder: "Bijvoorbeeld Nobivac Puppy DP",
    vaccinationNextDue: "Volgende vaccinatie",
    batchNumber: "Batch-/lotnummer",
    batchNumberPlaceholder: "Bijvoorbeeld ABC123",
    veterinarian: "Dierenarts",
    veterinarianPlaceholder: "Naam dierenarts",
    vetVisit: "Dierenartsbezoek",
    clinic: "Praktijk / kliniek",
    clinicPlaceholder: "Naam praktijk",
    visitReason: "Reden bezoek",
    visitReasonPlaceholder: "Bijvoorbeeld nestcontrole",
    weightChange: "Laatste verschil {weight}",
    weightDue: "Laatste weging {time} geleden",
    weightGrowth: "Groei {percent} per 24 uur",
    weightSinceBirth: "Sinds geboorte {percent}",
    first24h: "Eerste 24 uur",
    overdueOne: "1 dag te laat",
    overdueMany: "{days} dagen te laat",
    today: "Vandaag",
    tomorrow: "Morgen",
    inDays: "Over {days} dagen",
    planned: "Gepland",
    yes: "Ja",
  },
};

export function languageForHass(hass = null) {
  const language = hass?.locale?.language || hass?.language || navigator.language || "nl";
  return String(language).toLowerCase().split("-")[0] === "en" ? "en" : "nl";
}

export function localize(hass, key, replacements = {}) {
  const language = languageForHass(hass);
  const template = CARD_TRANSLATIONS[language]?.[key] ?? CARD_TRANSLATIONS.nl[key] ?? key;
  return Object.entries(replacements).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value ?? "")),
    template,
  );
}

export async function fetchLitters(hass) {
  return hass.callWS({ type: `${DOMAIN}/litters` });
}

export async function fetchLitterData(hass, litterId) {
  return hass.callWS({ type: `${DOMAIN}/data`, litter_id: litterId });
}

export async function subscribeUpdates(hass, callback, owner = null) {
  const unsubscribe = await hass.connection.subscribeMessage(callback, { type: `${DOMAIN}/subscribe` });
  if (!owner || (owner.isConnected && owner._hass === hass)) return unsubscribe;

  await Promise.resolve(unsubscribe?.()).catch(() => undefined);
  return null;
}

export async function fetchExport(hass, litterId, format, options = {}) {
  const message = { type: `${DOMAIN}/export`, litter_id: litterId, format };
  if (options.puppy_id) message.puppy_id = options.puppy_id;
  if (Number.isFinite(Number(options.range_hours)) && Number(options.range_hours) > 0) {
    message.range_hours = Number(options.range_hours);
  }
  return hass.callWS(message);
}

export function downloadExportFile(result) {
  let payload = result.content;
  if (result.encoding === "base64") {
    const binary = atob(String(result.content || ""));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    payload = bytes;
  }

  const blob = new Blob([payload], { type: result.mime_type || "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = result.filename || "puppy-tracker-export";
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function formatWeight(value, fallback = "—") {
  const number = finiteNumber(value);
  if (number === null) return fallback;
  return `${new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 1 }).format(number)} g`;
}

export function formatSignedWeight(value, fallback = "—") {
  const number = finiteNumber(value);
  if (number === null) return fallback;
  const formatted = new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 1 }).format(Math.abs(number));
  return `${number > 0 ? "+" : number < 0 ? "−" : ""}${formatted} g`;
}

export function formatPercent(value, fallback = "—") {
  const number = finiteNumber(value);
  if (number === null) return fallback;
  const formatted = new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 2 }).format(Math.abs(number));
  return `${number > 0 ? "+" : number < 0 ? "−" : ""}${formatted}%`;
}

export function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function formatDateTime(value, fallback = "—", hass = null) {
  const date = parseDate(value);
  if (!date) return fallback;
  return new Intl.DateTimeFormat(languageForHass(hass) === "en" ? "en-US" : "nl-NL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatShortDateTime(value, fallback = "—") {
  const date = parseDate(value);
  if (!date) return fallback;
  return new Intl.DateTimeFormat("nl-NL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatAge(value, now = new Date()) {
  const birth = parseDate(value);
  if (!birth) return "—";
  let seconds = Math.max(0, (now.getTime() - birth.getTime()) / 1000);
  const hours = Math.floor(seconds / 3600);
  const days = Math.floor(hours / 24);
  if (days < 7) {
    if (days === 0) return `${hours} u`;
    return `${days} d ${hours % 24} u`;
  }
  if (days < 28) return `${days} dagen`;
  if (days < 90) return `${Math.floor(days / 7)} weken`;
  const months = Math.floor(days / 30.4375);
  if (months < 24) return `${months} maanden`;
  const years = Math.floor(months / 12);
  return `${years} jaar ${months % 12} mnd`;
}

export function formatHoursSince(value, fallback = "—") {
  const number = finiteNumber(value);
  if (number === null) return fallback;
  if (number < 1) return `${Math.max(0, Math.round(number * 60))} min`;
  if (number < 24) return `${new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 1 }).format(number)} u`;
  return `${new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 1 }).format(number / 24)} d`;
}

export function statusTone(statusCode) {
  if (["ok", "first_24h"].includes(statusCode)) return "ok";
  if (["low_growth"].includes(statusCode)) return "warning";
  if (["weigh_due", "no_measurement", "weight_loss", "first_day_excess_weight_loss"].includes(statusCode)) return "danger";
  return "neutral";
}

export function statusIcon(statusCode) {
  if (statusCode === "ok") return "✓";
  if (statusCode === "first_24h") return "◷";
  if (statusCode === "weigh_due" || statusCode === "no_measurement") return "⚖";
  if (statusCode === "low_growth") return "↘";
  if (statusCode === "weight_loss" || statusCode === "first_day_excess_weight_loss") return "!";
  return "•";
}

export function describeStatus(summary, hass = null) {
  const code = summary?.status_code;
  if (code === "weigh_due") {
    return localize(hass, "weightDue", { time: formatHoursSince(summary.hours_since_weighing) });
  }
  if (code === "no_measurement") return localize(hass, "validMeasurementMissing");
  if (code === "low_growth") {
    return localize(hass, "weightGrowth", { percent: formatPercent(summary.growth_24h_percent) });
  }
  if (code === "weight_loss") {
    return localize(hass, "weightChange", { weight: formatSignedWeight(summary.change_grams) });
  }
  if (code === "first_day_excess_weight_loss") {
    return localize(hass, "weightSinceBirth", { percent: formatPercent(summary.first_day_weight_change_percent) });
  }
  if (code === "first_24h") return localize(hass, "first24h");
  if (code === "ok") return localize(hass, "noActiveWeightAlert");
  return summary?.status || localize(hass, "dossierItem");
}

export function selectDefaultLitter(litters, preferredId = null) {
  if (!Array.isArray(litters) || !litters.length) return null;
  if (preferredId && litters.some((item) => item.id === preferredId)) return preferredId;
  const active = litters.find((item) => item.active !== false);
  return (active || litters[0]).id;
}

export function fireNavigate(element, path) {
  if (!path) return;
  const event = new CustomEvent("hass-navigate", {
    bubbles: true,
    composed: true,
    detail: { navigation_path: path },
  });
  element.dispatchEvent(event);
}

export function filterMeasurements(measurements, rangeHours) {
  const rows = Array.isArray(measurements) ? measurements : [];
  if (!rangeHours || rangeHours <= 0) return rows;
  const cutoff = Date.now() - rangeHours * 3600 * 1000;
  return rows.filter((item) => {
    const date = parseDate(item.timestamp);
    return date && date.getTime() >= cutoff;
  });
}

export function rangeToHours(range) {
  return {
    "24h": 24,
    "3d": 72,
    "7d": 168,
    "14d": 336,
    "30d": 720,
    all: 0,
  }[range] ?? 168;
}

export function sexLabel(value) {
  const text = String(value || "").toLowerCase();
  if (["male", "reu", "m"].includes(text)) return "Reu";
  if (["female", "teef", "f"].includes(text)) return "Teef";
  return value || "—";
}

export async function fetchRecords(hass, litterId, puppyId = null, includeDeleted = false) {
  const message = {
    type: `${DOMAIN}/records`,
    litter_id: litterId,
    include_deleted: Boolean(includeDeleted),
  };
  if (puppyId) message.puppy_id = puppyId;
  return hass.callWS(message);
}

export async function fetchUpcoming(hass, litterId, options = {}) {
  const message = {
    type: `${DOMAIN}/upcoming`,
    litter_id: litterId,
  };
  if (options.puppy_id) message.puppy_id = options.puppy_id;
  if (options.include_overdue !== undefined) {
    message.include_overdue = Boolean(options.include_overdue);
  }
  if (Number.isFinite(Number(options.days_ahead))) {
    message.days_ahead = Number(options.days_ahead);
  }
  return hass.callWS(message);
}

export async function updateProfileNote(hass, litterId, puppyId, profileNote) {
  return hass.callWS({
    type: `${DOMAIN}/profile_note/update`,
    litter_id: litterId,
    puppy_id: puppyId,
    profile_note: profileNote || null,
  });
}

export async function addDossierRecord(hass, litterId, puppyId, record) {
  const message = {
    type: `${DOMAIN}/record/add`,
    litter_id: litterId,
    record_type: record.record_type,
    data: record.data || {},
  };
  if (puppyId) message.puppy_id = puppyId;
  if (record.occurred_at) message.occurred_at = record.occurred_at;
  if (record.title) message.title = record.title;
  if (record.note) message.note = record.note;
  return hass.callWS(message);
}

export async function updateDossierRecord(hass, litterId, puppyId, recordId, record) {
  const message = {
    type: `${DOMAIN}/record/update`,
    litter_id: litterId,
    record_id: recordId,
    record_type: record.record_type,
    data: record.data || {},
  };
  if (puppyId) message.puppy_id = puppyId;
  if (record.occurred_at) message.occurred_at = record.occurred_at;
  message.title = record.title || null;
  message.note = record.note || null;
  return hass.callWS(message);
}

export async function deleteDossierRecord(hass, litterId, puppyId, recordId) {
  const message = {
    type: `${DOMAIN}/record/delete`,
    litter_id: litterId,
    record_id: recordId,
  };
  if (puppyId) message.puppy_id = puppyId;
  return hass.callWS(message);
}

export async function restoreDossierRecord(hass, litterId, puppyId, recordId) {
  const message = {
    type: `${DOMAIN}/record/restore`,
    litter_id: litterId,
    record_id: recordId,
  };
  if (puppyId) message.puppy_id = puppyId;
  return hass.callWS(message);
}
