import { languageForHass, localize } from "./puppy-tracker-card-common.js";

export const RECORD_TYPES = [
  ["note", "note", "mdi:note-text-outline"],
  ["feeding", "feeding", "mdi:baby-bottle-outline"],
  ["temperature", "temperature", "mdi:thermometer"],
  ["vaccination", "vaccination", "mdi:needle"],
  ["test", "test", "mdi:test-tube"],
  ["deworming", "deworming", "mdi:shield-bug-outline"],
  ["medication", "medication", "mdi:pill"],
  ["vet_visit", "vetVisit", "mdi:stethoscope"],
  ["milestone", "milestone", "mdi:flag-checkered"],
  ["other", "other", "mdi:dots-horizontal-circle-outline"],
];

export const BULK_RECORD_TYPES = [
  ["deworming", "deworming"],
  ["vaccination", "vaccination"],
  ["test", "test"],
  ["vet_visit", "vetVisit"],
  ["milestone", "milestone"],
];

export const TYPE_META = Object.fromEntries(
  RECORD_TYPES.map(([value, labelKey, icon]) => [value, { labelKey, icon }]),
);

const SCHEMA_COPY = {
  en: {
    feedingType: "Food / feeding type",
    feedingTypePlaceholder: "For example bottle, nursing or solid food",
    feedingAmount: "Amount",
    feedingAmountPlaceholder: "For example 45",
    feedingUnit: "Unit",
    feedingUnitPlaceholder: "For example ml, grams or feeds",
    feedingObservation: "Observation / note",
    feedingObservationPlaceholder: "For example drank well or needed help",
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
    required: "required",
    requiredFieldsMissing: "Complete the required field(s): {fields}.",
    overdueSummary: "overdue",
    dueTodaySummary: "due today",
    upcomingSummary: "upcoming",
  },
  nl: {
    feedingType: "Voeding / soort",
    feedingTypePlaceholder: "Bijvoorbeeld fles, moedermelk of vast voer",
    feedingAmount: "Hoeveelheid",
    feedingAmountPlaceholder: "Bijvoorbeeld 45",
    feedingUnit: "Eenheid",
    feedingUnitPlaceholder: "Bijvoorbeeld ml, gram of voedingen",
    feedingObservation: "Observatie / notitie",
    feedingObservationPlaceholder: "Bijvoorbeeld dronk goed of had hulp nodig",
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
    { key: "feeding_type", schemaLabelKey: "feedingType", schemaPlaceholderKey: "feedingTypePlaceholder" },
    { key: "amount", schemaLabelKey: "feedingAmount", schemaPlaceholderKey: "feedingAmountPlaceholder", type: "number", min: "0", step: "any" },
    { key: "unit", schemaLabelKey: "feedingUnit", schemaPlaceholderKey: "feedingUnitPlaceholder" },
    { key: "observation", schemaLabelKey: "feedingObservation", schemaPlaceholderKey: "feedingObservationPlaceholder", type: "textarea", wide: true },
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
    { key: "result", labelKey: "testResult", placeholderKey: "testResultPlaceholder" },
    { key: "laboratory", labelKey: "laboratory", placeholderKey: "laboratoryPlaceholder" },
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
    { key: "frequency", labelKey: "frequency", placeholderKey: "frequencyPlaceholder" },
    { key: "duration", labelKey: "duration", placeholderKey: "durationPlaceholder" },
  ],
  vet_visit: [
    { key: "veterinarian", labelKey: "veterinarian", placeholderKey: "veterinarianPlaceholder" },
    { key: "clinic", labelKey: "clinic", placeholderKey: "clinicPlaceholder" },
    { key: "reason", labelKey: "visitReason", placeholderKey: "visitReasonPlaceholder" },
    { key: "diagnosis", labelKey: "diagnosis", type: "textarea", wide: true, placeholderKey: "diagnosisPlaceholder" },
    { key: "treatment", labelKey: "treatment", type: "textarea", wide: true, placeholderKey: "treatmentPlaceholder" },
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
