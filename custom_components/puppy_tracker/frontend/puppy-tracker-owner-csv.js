import { CONTACT_PREFERENCE_LABELS, OWNER_ROLE_LABELS, PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS, PLACEMENT_STATUS_LABELS, SEX_LABELS, configuredCsvDelimiter, csvCell, csvFilename, dateOnly, finalPaymentAmount, formattedDate, optionLabel, text } from "./puppy-tracker-owner-common.js";
import { selectVisibleOwners } from "./puppy-tracker-owner-contacts.js";
import { getLinkedPuppies, litterLabel, ownerForLitter, visibleLitterIds } from "./puppy-tracker-owner-placements.js";
import { matrixModel, puppyPreferenceLabel } from "./puppy-tracker-owner-preferences.js";
import { downloadExportFile } from "./puppy-tracker-card-common.js";

/** Owner csv operations; canonical state and lifecycle belong to the card. */

export function ownerCsvContent(card) {
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
    ].map((key) => text(card, key));
    const rows = [headers];
    const matrixView = card._activeView === "matrix";
    const contacts = matrixView ? matrixModel(card).owners : selectVisibleOwners(card);
    for (const contact of contacts) {
      for (const litterId of matrixView ? [card._selectedLitter] : visibleLitterIds(card, contact)) {
        const owner = ownerForLitter(card, contact, litterId);
        const history = (owner.status_history || []).map((entry) => {
          const status = optionLabel(card, entry.status, PLACEMENT_STATUS_LABELS, entry.status);
          return `${status} · ${formattedDate(card, entry.changed_at, true)}`;
        }).join(" | ");
        const puppyPreferences = Array.isArray(owner.puppy_preferences) ? owner.puppy_preferences.slice(0, 3) : [];
        const preferenceValues = [0, 1, 2].flatMap((index) => {
          const preference = puppyPreferences[index];
          return preference ? [puppyPreferenceLabel(card, preference.puppy_id, false), preference.note] : ["", ""];
        });
        const ownerValues = [
          owner.name,
          owner.email,
          owner.phone,
          owner.street || owner.address,
          owner.postal_code,
          owner.city,
          optionLabel(card, owner.role, OWNER_ROLE_LABELS, "owner"),
          optionLabel(card, owner.contact_preference, CONTACT_PREFERENCE_LABELS, "none"),
          optionLabel(card, owner.placement_status, PLACEMENT_STATUS_LABELS, "interested"),
          owner.placement_date,
          owner.expected_pickup_date,
          ...preferenceValues,
          optionLabel(card, owner.payment_status, PAYMENT_STATUS_LABELS, "none"),
          owner.payment_amount,
          owner.registration_fee_amount,
          owner.deposit_amount,
          owner.deposit_date,
          finalPaymentAmount(owner),
          owner.payment_balance,
          optionLabel(card, owner.payment_method, PAYMENT_METHOD_LABELS, "none"),
          owner.payment_date,
          owner.notes,
          history,
        ];
        const linkedPuppies = getLinkedPuppies(card, owner.id).filter((puppy) => puppy.litter_id === litterId).sort((left, right) =>
          `${left.litter_name || ""}\u0000${left.name || ""}`.localeCompare(`${right.litter_name || ""}\u0000${right.name || ""}`),
        );
        for (const puppy of linkedPuppies.length ? linkedPuppies : [null]) {
          rows.push([
            ...ownerValues,
            puppy?.litter_name || (litterId ? litterLabel(card, litterId) : ""),
            puppy?.registered_name,
            puppy?.name,
            puppy ? dateOnly(puppy.birth_time, puppy.litter_birth_date, card._hass) : "",
            puppy ? optionLabel(card, puppy.sex, SEX_LABELS, puppy.sex) : "",
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
            text(card, owner.archived ? "yes" : "no"),
          ]);
        }
      }
    }
    const delimiter = configuredCsvDelimiter(card._config);
    return `\ufeff${rows.map((row) => row.map(csvCell).join(delimiter)).join("\r\n")}\r\n`;
}

export async function downloadOwnersCsv(card) {
    const context = card._context;
    if (!card._owners.length || card._loading || card._busy || card._showEditor) return;
    if (!await card._load(true) || !card._isCurrent(context) || !card._owners.length) return;
    downloadExportFile({
      content: ownerCsvContent(card),
      filename: csvFilename(),
      mime_type: "text/csv;charset=utf-8",
    });
    card._status = text(card, "csvDone");
    card._error = "";
    const status = card.querySelector("#owner-status");
    const error = card.querySelector("#owner-error");
    if (status) status.textContent = card._status;
    if (error) error.textContent = "";
}
