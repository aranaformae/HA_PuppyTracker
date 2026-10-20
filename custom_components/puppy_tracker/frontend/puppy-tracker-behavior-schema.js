import { languageForHass } from "./puppy-tracker-card-common.js";

export function behaviorAgeDays(birthTime, occurredAt) {
  const birth = new Date(birthTime || "");
  const occurred = new Date(occurredAt || "");
  return Number.isFinite(birth.getTime()) && Number.isFinite(occurred.getTime())
    ? Math.max(0, Math.round(((occurred.getTime() - birth.getTime()) / 86400000) * 100) / 100) : null;
}

export const BEHAVIOR_GROUPS = [
  ["observations", [
    "pick_up_hold", "hold_upright", "hold_on_back", "paw_stimulation",
    "cold_surface", "stimulus_recovery", "sound_sensitivity", "curiosity",
    "confidence", "persistence", "human_orientation", "settle_after_stimulus",
  ]],
  ["traits", [
    "gentle", "bold", "calm", "spirited", "people_focused", "independent",
    "sensitive", "enterprising", "cooperative", "strong_willed",
  ]],
];

const TEXT = {
  nl: {
    title: "Gedragsprofiel", subtitle: "Volg observaties door de tijd; scores geven zichtbaarheid aan en zijn geen goed/fout-oordeel.",
    litter: "Nest", puppy: "Pup", choosePuppy: "Kies een pup", observations: "Oefeningen en observaties", traits: "Karaktereigenschappen",
    add: "Observatie toevoegen", edit: "Observatie aanpassen", cancel: "Annuleren", save: "Opslaan", delete: "Verwijderen", clearScore: "Niet beoordelen",
    when: "Datum en tijd", observer: "Observator", observerPlaceholder: "Naam van observator", context: "Context", contextPlaceholder: "Bijvoorbeeld rustige ruimte, na voeding",
    note: "Notities", notePlaceholder: "Aanvullende waarnemingen en omstandigheden", scoreHint: "1 = nauwelijks zichtbaar · 5 = zeer duidelijk · leeg = niet beoordeeld",
    finalScore: "Eindscore zichtbaarheid", groupScore: "Groepsgemiddelde", observationsCount: "Meetmomenten", criteriaCount: "Criteria gescoord",
    noProfile: "Nog geen gedragsobservaties voor deze pup.", history: "Observatiehistorie", noScores: "Kies ten minste één score.", saved: "Gedragsobservatie opgeslagen.", updated: "Gedragsobservatie bijgewerkt.", deleted: "Gedragsobservatie verwijderd.",
    loadFailed: "Gedragsgegevens konden niet worden geladen.", saveFailed: "Gedragsobservatie kon niet worden opgeslagen.", deleteFailed: "Gedragsobservatie kon niet worden verwijderd.", invalidDate: "Kies een geldige datum en tijd.", confirmDelete: "Deze gedragsobservatie verwijderen? Je kunt deze later via het dossier herstellen.",
    average: "Gemiddelde", latest: "Laatste", times: "keer", neutralNote: "De eindscore is het gemiddelde van de criteriumgemiddelden. Een hogere score betekent alleen dat kenmerken duidelijker zichtbaar waren.",
    pick_up_hold: "Oppakken en vasthouden", hold_upright: "Rechtop houden", hold_on_back: "Op de rug houden", paw_stimulation: "Voetzoolprikkel", cold_surface: "Koude ondergrond", stimulus_recovery: "Herstelsnelheid na prikkel", sound_sensitivity: "Geluidsgevoeligheid", curiosity: "Nieuwsgierigheid", confidence: "Zelfvertrouwen", persistence: "Doorzettingsvermogen", human_orientation: "Mensgerichtheid (contact zoeken)", settle_after_stimulus: "Rust kunnen terugvinden",
    gentle: "Zacht", bold: "Stoer", calm: "Rustig", spirited: "Pittig", people_focused: "Mensgericht", independent: "Zelfstandig", sensitive: "Gevoelig", enterprising: "Ondernemend", cooperative: "Meegaand", strong_willed: "Eigenwijs",
  },
  en: {
    title: "Behavior profile", subtitle: "Track observations over time; scores describe visibility and are not a good/bad judgement.",
    litter: "Litter", puppy: "Puppy", choosePuppy: "Choose a puppy", observations: "Exercises and observations", traits: "Character traits",
    add: "Add observation", edit: "Edit observation", cancel: "Cancel", save: "Save", delete: "Delete", clearScore: "Do not assess",
    when: "Date and time", observer: "Observer", observerPlaceholder: "Observer name", context: "Context", contextPlaceholder: "For example quiet room, after feeding",
    note: "Notes", notePlaceholder: "Additional observations and circumstances", scoreHint: "1 = barely visible · 5 = very clear · empty = not assessed",
    finalScore: "Final visibility score", groupScore: "Group average", observationsCount: "Sessions", criteriaCount: "Criteria scored",
    noProfile: "No behavior observations for this puppy yet.", history: "Observation history", noScores: "Select at least one score.", saved: "Behavior observation saved.", updated: "Behavior observation updated.", deleted: "Behavior observation deleted.",
    loadFailed: "Behavior data could not be loaded.", saveFailed: "Behavior observation could not be saved.", deleteFailed: "Behavior observation could not be deleted.", invalidDate: "Choose a valid date and time.", confirmDelete: "Delete this behavior observation? It can be restored later from the dossier.",
    average: "Average", latest: "Latest", times: "times", neutralNote: "The final score is the mean of the criterion averages. A higher score only means traits were more clearly visible.",
    pick_up_hold: "Pick up and hold", hold_upright: "Hold upright", hold_on_back: "Hold on back", paw_stimulation: "Paw stimulation", cold_surface: "Cold surface", stimulus_recovery: "Recovery after stimulus", sound_sensitivity: "Sound sensitivity", curiosity: "Curiosity", confidence: "Confidence", persistence: "Persistence", human_orientation: "Human orientation (seeking contact)", settle_after_stimulus: "Settle after stimulus",
    gentle: "Gentle", bold: "Bold", calm: "Calm", spirited: "Spirited", people_focused: "People-focused", independent: "Independent", sensitive: "Sensitive", enterprising: "Enterprising", cooperative: "Cooperative", strong_willed: "Strong-willed",
  },
};

export function behaviorText(card, key) {
  const language = languageForHass(card?._hass);
  return TEXT[language]?.[key] || TEXT.nl[key] || key;
}
