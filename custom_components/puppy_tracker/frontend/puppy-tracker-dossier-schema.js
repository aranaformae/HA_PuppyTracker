import { escapeHtml, languageForHass, localize } from "./puppy-tracker-card-common.js";

export const RECORD_TYPES = [
  ["note", "note", "mdi:note-text-outline"],
  ["feeding", "feeding", "mdi:baby-bottle-outline"],
  ["daily_care", "dailyCare", "mdi:hand-heart-outline"],
  ["temperature", "temperature", "mdi:thermometer"],
  ["vaccination", "vaccination", "mdi:needle"],
  ["test", "test", "mdi:test-tube"],
  ["deworming", "deworming", "mdi:shield-bug-outline"],
  ["medication", "medication", "mdi:pill"],
  ["vet_visit", "vetVisit", "mdi:stethoscope"],
  ["milestone", "milestone", "mdi:flag-checkered"],
  ["other", "other", "mdi:dots-horizontal-circle-outline"],
];

export const TYPE_META = Object.fromEntries(
  RECORD_TYPES.map(([value, labelKey, icon]) => [value, { labelKey, icon }]),
);
TYPE_META.behavior_observation = { labelKey: "behaviorObservation", icon: "mdi:head-heart-outline" };

const SURFACE_TYPE_META = {
  weight: { icon: "mdi:scale", en: "Weight", nl: "Gewicht" },
  care: { icon: "mdi:calendar-heart", en: "Care program", nl: "Zorgprogramma" },
  reminder: { icon: "mdi:bell-outline", en: "Reminder", nl: "Herinnering" },
  dossier: { icon: "mdi:file-document-outline", en: "Dossier", nl: "Dossier" },
};

export function recordTypeLabel(hass, value) {
  const type = String(value || "other");
  const recordMeta = TYPE_META[type];
  if (recordMeta) return localize(hass, recordMeta.labelKey);
  const surfaceMeta = SURFACE_TYPE_META[type];
  if (surfaceMeta) return surfaceMeta[languageForHass(hass)] || surfaceMeta.nl;
  const label = type.replaceAll("_", " ");
  return label ? label.charAt(0).toUpperCase() + label.slice(1) : localize(hass, "other");
}

export function recordTypeIcon(value) {
  const type = String(value || "other");
  return TYPE_META[type]?.icon || SURFACE_TYPE_META[type]?.icon || TYPE_META.other.icon;
}

export function recordTypeOptions(hass, selectedType) {
  const types = RECORD_TYPES.map(([value, labelKey]) => [value, localize(hass, labelKey)]);
  if (selectedType && !types.some(([value]) => value === selectedType)) {
    types.push([selectedType, recordTypeLabel(hass, selectedType)]);
  }
  return types.map(([value, label]) => `<option value="${escapeHtml(value)}" ${value === selectedType ? "selected" : ""}>${escapeHtml(label)}</option>`).join("");
}

const SCHEMA_COPY = {
  en: {
    feedingCategory: "Feeding category",
    feedingMilk: "Mother's milk",
    feedingBottle: "Bottle",
    feedingTube: "Tube",
    feedingGruel: "Gruel",
    feedingSolid: "Solid food",
    feedingKibble: "Kibble",
    feedingFreshMeat: "Fresh meat",
    feedingShelfStableMeat: "Shelf-stable meat",
    feedingSupplement: "Supplement",
    feedingType: "Food / details",
    feedingTypePlaceholder: "For example brand, milk type or preparation",
    feedingAmount: "Amount",
    feedingAmountPlaceholder: "For example 45",
    feedingUnit: "Unit",
    feedingUnitPlaceholder: "For example ml, grams or feeds",
    feedingObservation: "Observation / note",
    feedingObservationPlaceholder: "For example drank well or needed help",
    careArea: "Observation type",
    careStool: "Stool",
    careUrine: "Urine",
    careNavel: "Navel",
    careSkin: "Skin",
    careActivity: "Activity",
    careObservation: "What did you observe?",
    careObservationPlaceholder: "Describe what you saw",
    vaccineType: "Vaccine type / indication",
    vaccineTypePlaceholder: "For example Puppy DP or core vaccine",
    reaction: "Reaction / observation",
    reactionPlaceholder: "For example no reaction or mild tenderness",
    temperatureValue: "Temperature (°C)",
    temperatureValuePlaceholder: "For example 38.4",
    temperatureMethod: "Measurement method / location",
    temperatureMethodPlaceholder: "For example rectal",
    temperatureObservation: "Observation / note",
    temperatureObservationPlaceholder: "For example calm, sleeping or after feeding",
    activeIngredient: "Active ingredient",
    activeIngredientPlaceholder: "For example pyrantel / febantel",
    amount: "Amount",
    amountPlaceholder: "For example 1.5",
    unit: "Unit",
    unitPlaceholder: "For example ml, tablet or mg",
    route: "Route",
    routePlaceholder: "For example oral or subcutaneous",
    administrationWeight: "Weight at administration (g)",
    administrationWeightPlaceholder: "Optional puppy weight in grams",
    freeTextDose: "Dose (free text)",
    testStatus: "Test status",
    testStatusPlanned: "Planned",
    testStatusPending: "Awaiting result",
    testStatusCompleted: "Result available",
    testStatusInconclusive: "Inconclusive",
    testReferenceNumber: "Test reference number",
    testReferenceNumberPlaceholder: "Laboratory or sample reference",
    vetFindings: "Findings",
    vetFindingsPlaceholder: "Examination findings",
    clinicalFollowupDate: "Follow-up date",
    completedTestNeedsResult: "Enter the result before marking the test complete.",
    testFollowupNeedsName: "Enter a test name before setting a follow-up date.",
    vetFollowupNeedsReason: "Enter a visit reason or finding before setting a follow-up date.",
    required: "required",
    requiredFieldsMissing: "Complete the required field(s): {fields}.",
    overdueSummary: "overdue",
    dueTodaySummary: "due today",
    upcomingSummary: "upcoming",
  },
  nl: {
    feedingCategory: "Voedingscategorie",
    feedingMilk: "Moedermelk",
    feedingBottle: "Fles",
    feedingTube: "Sonde",
    feedingGruel: "Pap",
    feedingSolid: "Vast voer",
    feedingKibble: "Brokken",
    feedingFreshMeat: "Vers vlees",
    feedingShelfStableMeat: "Houdbaar vlees",
    feedingSupplement: "Supplement",
    feedingType: "Voeding / details",
    feedingTypePlaceholder: "Bijvoorbeeld merk, melksoort of bereiding",
    feedingAmount: "Hoeveelheid",
    feedingAmountPlaceholder: "Bijvoorbeeld 45",
    feedingUnit: "Eenheid",
    feedingUnitPlaceholder: "Bijvoorbeeld ml, gram of voedingen",
    feedingObservation: "Observatie / notitie",
    feedingObservationPlaceholder: "Bijvoorbeeld dronk goed of had hulp nodig",
    careArea: "Soort observatie",
    careStool: "Ontlasting",
    careUrine: "Urine",
    careNavel: "Navel",
    careSkin: "Huid",
    careActivity: "Activiteit",
    careObservation: "Wat heb je waargenomen?",
    careObservationPlaceholder: "Beschrijf wat je zag",
    vaccineType: "Vaccintype / indicatie",
    vaccineTypePlaceholder: "Bijvoorbeeld Puppy DP of basisvaccinatie",
    reaction: "Reactie / observatie",
    reactionPlaceholder: "Bijvoorbeeld geen reactie of lichte gevoeligheid",
    temperatureValue: "Temperatuur (°C)",
    temperatureValuePlaceholder: "Bijvoorbeeld 38,4",
    temperatureMethod: "Meetmethode / locatie",
    temperatureMethodPlaceholder: "Bijvoorbeeld rectaal",
    temperatureObservation: "Observatie / notitie",
    temperatureObservationPlaceholder: "Bijvoorbeeld rustig, slapend of na voeding",
    activeIngredient: "Werkzame stof",
    activeIngredientPlaceholder: "Bijvoorbeeld pyrantel / febantel",
    amount: "Hoeveelheid",
    amountPlaceholder: "Bijvoorbeeld 1,5",
    unit: "Eenheid",
    unitPlaceholder: "Bijvoorbeeld ml, tablet of mg",
    route: "Toedieningsweg",
    routePlaceholder: "Bijvoorbeeld oraal of subcutaan",
    administrationWeight: "Gewicht bij toediening (g)",
    administrationWeightPlaceholder: "Optioneel gewicht van de pup in gram",
    freeTextDose: "Dosering (vrije tekst)",
    testStatus: "Teststatus",
    testStatusPlanned: "Gepland",
    testStatusPending: "Uitslag afwachten",
    testStatusCompleted: "Uitslag bekend",
    testStatusInconclusive: "Onduidelijk",
    testReferenceNumber: "Testreferentie",
    testReferenceNumberPlaceholder: "Referentie van laboratorium of monster",
    vetFindings: "Bevindingen",
    vetFindingsPlaceholder: "Bevindingen bij onderzoek",
    clinicalFollowupDate: "Vervolgdatum",
    completedTestNeedsResult: "Vul de uitslag in voordat je de test als afgerond markeert.",
    testFollowupNeedsName: "Vul een testnaam in voordat je een vervolgdatum instelt.",
    vetFollowupNeedsReason: "Vul een reden of bevinding in voordat je een vervolgdatum instelt.",
    required: "verplicht",
    requiredFieldsMissing: "Vul de verplichte veld(en) in: {fields}.",
    overdueSummary: "te laat",
    dueTodaySummary: "vandaag",
    upcomingSummary: "aankomend",
  },
};

export function schemaText(hass, key, replacements = {}) {
  const language = languageForHass(hass);
  const template = SCHEMA_COPY[language]?.[key] ?? SCHEMA_COPY.nl[key] ?? key;
  return Object.entries(replacements).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value ?? "")),
    template,
  );
}

export const TYPE_FIELDS = {
  feeding: [
    { key: "feeding_category", schemaLabelKey: "feedingCategory", options: [
      ["milk", "feedingMilk"], ["bottle", "feedingBottle"], ["tube", "feedingTube"],
      ["gruel", "feedingGruel"], ["solid_food", "feedingSolid"],
      ["kibble", "feedingKibble"], ["fresh_meat", "feedingFreshMeat"],
      ["shelf_stable_meat", "feedingShelfStableMeat"], ["supplement", "feedingSupplement"],
    ] },
    { key: "feeding_type", schemaLabelKey: "feedingType", schemaPlaceholderKey: "feedingTypePlaceholder" },
    { key: "amount", schemaLabelKey: "feedingAmount", schemaPlaceholderKey: "feedingAmountPlaceholder", type: "number", min: "0", step: "any" },
    { key: "unit", schemaLabelKey: "feedingUnit", schemaPlaceholderKey: "feedingUnitPlaceholder" },
    { key: "observation", schemaLabelKey: "feedingObservation", schemaPlaceholderKey: "feedingObservationPlaceholder", type: "textarea", wide: true },
  ],
  daily_care: [
    { key: "care_area", schemaLabelKey: "careArea", options: [
      ["stool", "careStool"], ["urine", "careUrine"], ["navel", "careNavel"],
      ["skin", "careSkin"], ["activity", "careActivity"],
    ], required: true },
    { key: "observation", schemaLabelKey: "careObservation", schemaPlaceholderKey: "careObservationPlaceholder", type: "textarea", wide: true, required: true },
  ],
  temperature: [
    { key: "temperature_c", schemaLabelKey: "temperatureValue", schemaPlaceholderKey: "temperatureValuePlaceholder", type: "number", min: "20", max: "45", step: "0.1", required: true },
    { key: "method", schemaLabelKey: "temperatureMethod", schemaPlaceholderKey: "temperatureMethodPlaceholder" },
    { key: "observation", schemaLabelKey: "temperatureObservation", schemaPlaceholderKey: "temperatureObservationPlaceholder", type: "textarea", wide: true },
  ],
  vaccination: [
    { key: "vaccine", labelKey: "vaccine", placeholderKey: "vaccinePlaceholder", required: true },
    { key: "vaccine_type", schemaLabelKey: "vaccineType", schemaPlaceholderKey: "vaccineTypePlaceholder" },
    { key: "batch_number", labelKey: "batchNumber", placeholderKey: "batchNumberPlaceholder" },
    { key: "veterinarian", labelKey: "veterinarian", placeholderKey: "veterinarianPlaceholder" },
    { key: "clinic", labelKey: "clinic", placeholderKey: "clinicPlaceholder" },
    { key: "reaction", schemaLabelKey: "reaction", schemaPlaceholderKey: "reactionPlaceholder", type: "textarea", wide: true },
    { key: "weight_grams", schemaLabelKey: "administrationWeight", schemaPlaceholderKey: "administrationWeightPlaceholder", type: "number", min: "0", step: "1" },
    { key: "next_due_date", labelKey: "vaccinationNextDue", type: "date" },
  ],
  test: [
    { key: "test_name", labelKey: "testName", placeholderKey: "testNamePlaceholder" },
    { key: "test_status", schemaLabelKey: "testStatus", options: [
      ["planned", "testStatusPlanned"], ["pending", "testStatusPending"],
      ["completed", "testStatusCompleted"], ["inconclusive", "testStatusInconclusive"],
    ] },
    { key: "result", labelKey: "testResult", placeholderKey: "testResultPlaceholder" },
    { key: "laboratory", labelKey: "laboratory", placeholderKey: "laboratoryPlaceholder" },
    { key: "reference_number", schemaLabelKey: "testReferenceNumber", schemaPlaceholderKey: "testReferenceNumberPlaceholder", maxLength: 120 },
    { key: "next_due_date", schemaLabelKey: "clinicalFollowupDate", type: "date" },
  ],
  deworming: [
    { key: "product", labelKey: "product", placeholderKey: "productPlaceholder", required: true },
    { key: "active_ingredient", schemaLabelKey: "activeIngredient", schemaPlaceholderKey: "activeIngredientPlaceholder" },
    { key: "amount", schemaLabelKey: "amount", schemaPlaceholderKey: "amountPlaceholder", type: "number", min: "0", step: "any" },
    { key: "unit", schemaLabelKey: "unit", schemaPlaceholderKey: "unitPlaceholder" },
    { key: "dose", schemaLabelKey: "freeTextDose", placeholderKey: "dosagePlaceholder" },
    { key: "route", schemaLabelKey: "route", schemaPlaceholderKey: "routePlaceholder" },
    { key: "batch_number", labelKey: "batchNumber", placeholderKey: "batchNumberPlaceholder" },
    { key: "administered_by", labelKey: "administeredBy", placeholderKey: "administeredByPlaceholder" },
    { key: "weight_grams", schemaLabelKey: "administrationWeight", schemaPlaceholderKey: "administrationWeightPlaceholder", type: "number", min: "0", step: "1" },
    { key: "next_due_date", labelKey: "dewormingNextDue", type: "date" },
  ],
  medication: [
    { key: "medication", labelKey: "medication", placeholderKey: "medicationPlaceholder" },
    { key: "dose", labelKey: "dosage", placeholderKey: "dosagePlaceholder" },
    { key: "unit", schemaLabelKey: "unit", schemaPlaceholderKey: "unitPlaceholder" },
    { key: "route", schemaLabelKey: "route", schemaPlaceholderKey: "routePlaceholder" },
    { key: "administered_by", labelKey: "administeredBy", placeholderKey: "administeredByPlaceholder" },
    { key: "frequency", labelKey: "frequency", placeholderKey: "frequencyPlaceholder" },
    { key: "duration", labelKey: "duration", placeholderKey: "durationPlaceholder" },
  ],
  vet_visit: [
    { key: "veterinarian", labelKey: "veterinarian", placeholderKey: "veterinarianPlaceholder" },
    { key: "clinic", labelKey: "clinic", placeholderKey: "clinicPlaceholder" },
    { key: "reason", labelKey: "visitReason", placeholderKey: "visitReasonPlaceholder" },
    { key: "findings", schemaLabelKey: "vetFindings", schemaPlaceholderKey: "vetFindingsPlaceholder", type: "textarea", wide: true },
    { key: "diagnosis", labelKey: "diagnosis", type: "textarea", wide: true, placeholderKey: "diagnosisPlaceholder" },
    { key: "treatment", labelKey: "treatment", type: "textarea", wide: true, placeholderKey: "treatmentPlaceholder" },
    { key: "next_due_date", schemaLabelKey: "clinicalFollowupDate", type: "date" },
  ],
  milestone: [
    { key: "milestone", labelKey: "milestone", placeholderKey: "milestonePlaceholder" },
    { key: "category", labelKey: "milestoneCategory", placeholderKey: "milestoneCategoryPlaceholder" },
  ],
};

export const KNOWN_DATA_KEYS = new Set(
  Object.values(TYPE_FIELDS).flat().map((field) => field.key),
);

export function fieldLabel(hass, field) {
  if (field.schemaLabelKey) return schemaText(hass, field.schemaLabelKey);
  return localize(hass, field.labelKey);
}

export function fieldPlaceholder(hass, field) {
  if (field.schemaPlaceholderKey) return schemaText(hass, field.schemaPlaceholderKey);
  return field.placeholderKey ? localize(hass, field.placeholderKey) : "";
}

export function fieldValueLabel(hass, field, value) {
  const option = field.options?.find(([key]) => key === value);
  return option ? schemaText(hass, option[1]) : value;
}

export function clinicalValidationField(recordType, data = {}) {
  if (recordType === "test" && data.test_status === "completed" && !String(data.result || "").trim()) return "result";
  if (recordType === "test" && data.next_due_date && !String(data.test_name || "").trim()) return "test_name";
  if (recordType === "vet_visit" && data.next_due_date && !["reason", "findings", "diagnosis", "treatment"].some((key) => String(data[key] || "").trim())) return "reason";
  return "";
}

export function clinicalValidationMessage(hass, recordType, data = {}) {
  const key = clinicalValidationField(recordType, data);
  return key ? schemaText(hass, { result: "completedTestNeedsResult", test_name: "testFollowupNeedsName", reason: "vetFollowupNeedsReason" }[key]) : "";
}

export function renderFieldControl(hass, field, id, value, { rows = 3 } = {}) {
  const safeValue = escapeHtml(value ?? "");
  const placeholder = escapeHtml(fieldPlaceholder(hass, field) || "");
  if (field.options) return `<select id="${escapeHtml(id)}"><option value=""></option>${field.options.map(([key, label]) => `<option value="${escapeHtml(key)}" ${value === key ? "selected" : ""}>${escapeHtml(schemaText(hass, label))}</option>`).join("")}</select>`;
  if (field.type === "textarea") return `<textarea id="${escapeHtml(id)}" rows="${rows}" placeholder="${placeholder}">${safeValue}</textarea>`;
  return `<input id="${escapeHtml(id)}" type="${escapeHtml(field.type || "text")}" value="${safeValue}" placeholder="${placeholder}" ${inputAttributes(field)} ${field.maxLength ? `maxlength="${field.maxLength}"` : ""}>`;
}

export function requiredFieldsForType(recordType) {
  return (TYPE_FIELDS[recordType] || []).filter((field) => field.required);
}

export function missingRequiredFields(recordType, data = {}) {
  return requiredFieldsForType(recordType).filter((field) => {
    const value = data?.[field.key];
    return value === null || value === undefined || String(value).trim() === "";
  });
}

export function requiredFieldsMessage(hass, recordType, data = {}) {
  const missing = missingRequiredFields(recordType, data);
  if (!missing.length) return "";
  return schemaText(hass, "requiredFieldsMissing", {
    fields: missing.map((field) => fieldLabel(hass, field)).join(", "),
  });
}

export function inputAttributes(field) {
  const attributes = [];
  if (field.min !== undefined) attributes.push(`min="${String(field.min)}"`);
  if (field.max !== undefined) attributes.push(`max="${String(field.max)}"`);
  if (field.step !== undefined) attributes.push(`step="${String(field.step)}"`);
  return attributes.join(" ");
}
