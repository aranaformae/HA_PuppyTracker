export const RECORD_TYPES = [
  ["note", "note", "mdi:note-text-outline"],
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

export const TYPE_FIELDS = {
  vaccination: [
    { key: "vaccine", labelKey: "vaccine", placeholderKey: "vaccinePlaceholder", required: true },
    { key: "batch_number", labelKey: "batchNumber", placeholderKey: "batchNumberPlaceholder" },
    { key: "veterinarian", labelKey: "veterinarian", placeholderKey: "veterinarianPlaceholder" },
    { key: "next_due_date", labelKey: "vaccinationNextDue", type: "date" },
  ],
  test: [
    { key: "test_name", labelKey: "testName", placeholderKey: "testNamePlaceholder" },
    { key: "result", labelKey: "testResult", placeholderKey: "testResultPlaceholder" },
    { key: "laboratory", labelKey: "laboratory", placeholderKey: "laboratoryPlaceholder" },
  ],
  deworming: [
    { key: "product", labelKey: "product", placeholderKey: "productPlaceholder", required: true },
    { key: "dose", labelKey: "dosage", placeholderKey: "dosagePlaceholder" },
    { key: "administered_by", labelKey: "administeredBy", placeholderKey: "administeredByPlaceholder" },
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

export function requiredFieldsForType(recordType) {
  return (TYPE_FIELDS[recordType] || []).filter((field) => field.required);
}

export function missingRequiredFields(recordType, data = {}) {
  return requiredFieldsForType(recordType).filter((field) => {
    const value = data?.[field.key];
    return value === null || value === undefined || String(value).trim() === "";
  });
}
