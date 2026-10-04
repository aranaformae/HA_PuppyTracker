import {
  addDossierRecord,
  deleteDossierRecord,
  escapeHtml,
  fetchLitterData,
  fetchLitters,
  formatDateTime,
  languageForHass,
  requestLitterChange,
  selectDefaultLitter,
  subscribeUpdates,
  updateDossierRecord,
} from "./puppy-tracker-card-common.js";

const RECORD_TYPE = "behavior_observation";

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

function text(card, key) {
  const language = languageForHass(card?._hass);
  return TEXT[language]?.[key] || TEXT.nl[key] || key;
}

function nowInputValue(value = null) {
  const date = value ? new Date(value) : new Date();
  const safe = Number.isFinite(date.getTime()) ? date : new Date();
  const pad = (number) => String(number).padStart(2, "0");
  return `${safe.getFullYear()}-${pad(safe.getMonth() + 1)}-${pad(safe.getDate())}T${pad(safe.getHours())}:${pad(safe.getMinutes())}`;
}

function average(values) {
  const valid = values.filter((value) => Number.isFinite(Number(value))).map(Number);
  return valid.length ? Math.round((valid.reduce((sum, value) => sum + value, 0) / valid.length) * 100) / 100 : null;
}

function scoreText(value, hass) {
  return Number.isFinite(Number(value))
    ? Number(value).toLocaleString(languageForHass(hass) === "en" ? "en-US" : "nl-NL", { maximumFractionDigits: 2 })
    : "—";
}

export function behaviorProfile(records = []) {
  const observations = records
    .filter((record) => record?.type === RECORD_TYPE && !record.deleted && record.data?.scores && typeof record.data.scores === "object")
    .map((record) => {
      const scores = Object.fromEntries(Object.entries(record.data.scores).filter(([key, value]) => BEHAVIOR_GROUPS.some(([, keys]) => keys.includes(key)) && Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 5).map(([key, value]) => [key, Number(value)]));
      return { ...record, scores, score: average(Object.values(scores)) };
    })
    .filter((record) => Object.keys(record.scores).length)
    .sort((left, right) => Date.parse(left.occurred_at || 0) - Date.parse(right.occurred_at || 0));
  const criteria = {};
  for (const [, keys] of BEHAVIOR_GROUPS) {
    for (const key of keys) {
      const values = observations.map((record) => record.scores[key]).filter(Number.isFinite);
      if (values.length) criteria[key] = { average: average(values), count: values.length, latest: values.at(-1), first: values[0] };
    }
  }
  const groups = Object.fromEntries(BEHAVIOR_GROUPS.map(([group, keys]) => [group, { average: average(keys.map((key) => criteria[key]?.average).filter(Number.isFinite)), count: keys.filter((key) => criteria[key]).length, total: keys.length }]));
  return { observations, criteria, groups, finalScore: average(Object.values(criteria).map((item) => item.average)), criteriaCount: Object.keys(criteria).length };
}

class PuppyTrackerBehaviorCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass = null;
    this._config = {};
    this._litters = [];
    this._data = null;
    this._selectedLitterId = null;
    this._selectedPuppyId = null;
    this._editing = null;
    this._loading = false;
    this._saving = false;
    this._error = "";
    this._status = "";
    this._unsubscribe = null;
    this._subscriptionPending = false;
    this._refreshing = false;
    this._refreshAgain = false;
    this._refreshDeferred = false;
  }

  static getStubConfig() { return { show_litter_selector: true, show_profile: true, show_history: true, max_items: 20 }; }

  setConfig(config) {
    this._config = { ...PuppyTrackerBehaviorCard.getStubConfig(), ...config };
    this._selectedLitterId = config.litter_id || this._selectedLitterId;
    this._selectedPuppyId = config.puppy_id || this._selectedPuppyId;
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._litters.length && !this._loading) this._loadInitial();
    else if (this.isConnected) this._subscribe();
  }

  connectedCallback() {
    if (!this._hass) return;
    if (!this._litters.length && !this._loading) this._loadInitial();
    else this._subscribe();
  }

  disconnectedCallback() {
    if (this._unsubscribe) Promise.resolve(this._unsubscribe()).catch(() => undefined);
    this._unsubscribe = null;
  }

  getCardSize() { return 8; }
  getGridOptions() { return { columns: 12, min_columns: 6 }; }

  async _loadInitial() {
    this._loading = true;
    try {
      const response = await fetchLitters(this._hass);
      this._litters = response?.litters || [];
      this._selectedLitterId = selectDefaultLitter(this._litters, this._selectedLitterId);
      await this._loadData(false);
      await this._subscribe();
    } catch (error) {
      this._error = error?.message || text(this, "loadFailed");
    } finally {
      this._loading = false;
      this._render();
    }
  }

  async _subscribe() {
    if (!this._hass || this._unsubscribe || this._subscriptionPending || !this.isConnected) return;
    this._subscriptionPending = true;
    try { this._unsubscribe = await subscribeUpdates(this._hass, () => this._queueRefresh(), this); }
    catch (_error) { this._unsubscribe = null; }
    finally { this._subscriptionPending = false; }
  }

  async _queueRefresh() {
    if (this._editing || this._saving) { this._refreshDeferred = true; return; }
    if (this._refreshing) { this._refreshAgain = true; return; }
    this._refreshing = true;
    try {
      do {
        this._refreshAgain = false;
        await this._loadData(false);
      } while (this._refreshAgain);
      this._error = "";
    } catch (error) {
      this._error = error?.message || text(this, "loadFailed");
    } finally {
      this._refreshing = false;
      this._render();
    }
  }

  async _loadData(render = true) {
    if (!this._selectedLitterId) { this._data = null; if (render) this._render(); return; }
    this._data = await fetchLitterData(this._hass, this._selectedLitterId);
    const puppies = this._data?.puppies || [];
    if (!puppies.some((puppy) => puppy.id === this._selectedPuppyId)) this._selectedPuppyId = puppies.find((puppy) => puppy.active !== false)?.id || puppies[0]?.id || null;
    if (render) this._render();
  }

  _selectedPuppy() { return (this._data?.puppies || []).find((puppy) => puppy.id === this._selectedPuppyId) || null; }

  _startEditor(record = null) {
    const puppy = this._selectedPuppy();
    if (!puppy || !this._data?.can_manage_records) return;
    this._editing = {
      id: record?.id || null,
      occurred_at: nowInputValue(record?.occurred_at),
      observer: record?.data?.observer || "",
      context: record?.data?.context || "",
      note: record?.note || "",
      scores: { ...(record?.data?.scores || {}) },
    };
    this._error = "";
    this._render();
  }

  async _cancelEditor() {
    this._editing = null;
    this._error = "";
    if (this._refreshDeferred) {
      this._refreshDeferred = false;
      await this._queueRefresh();
    } else {
      this._render();
    }
  }

  async _changeLitter(litterId) {
    this._selectedLitterId = litterId;
    this._selectedPuppyId = null;
    this._editing = null;
    this._refreshDeferred = false;
    requestLitterChange(this, litterId);
    try {
      await this._loadData();
      this._error = "";
    } catch (error) {
      this._error = error?.message || text(this, "loadFailed");
      this._render();
    }
  }

  async _changePuppy(puppyId) {
    this._selectedPuppyId = puppyId || null;
    this._editing = null;
    if (this._refreshDeferred) {
      this._refreshDeferred = false;
      await this._queueRefresh();
    } else {
      this._render();
    }
  }

  _captureInputs() {
    if (!this._editing) return;
    for (const key of ["occurred_at", "observer", "context", "note"]) {
      const input = this.shadowRoot?.getElementById(`behavior-${key}`);
      if (input) this._editing[key] = input.value;
    }
  }

  async _save() {
    if (!this._editing || this._saving || !this._selectedPuppyId) return;
    this._captureInputs();
    const scores = Object.fromEntries(Object.entries(this._editing.scores).filter(([, value]) => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 5).map(([key, value]) => [key, Number(value)]));
    if (!Object.keys(scores).length) { this._error = text(this, "noScores"); this._render(); return; }
    const occurred = new Date(this._editing.occurred_at);
    if (!Number.isFinite(occurred.getTime())) { this._error = text(this, "invalidDate"); this._render(); return; }
    const puppy = this._selectedPuppy();
    const birth = new Date(puppy?.birth_time || this._data?.litter?.birth_date || "");
    const ageDays = Number.isFinite(birth.getTime()) ? Math.max(0, Math.round(((occurred.getTime() - birth.getTime()) / 86400000) * 100) / 100) : null;
    const payload = {
      record_type: RECORD_TYPE,
      occurred_at: occurred.toISOString(),
      title: null,
      note: this._editing.note.trim() || null,
      data: {
        scores,
        observer: this._editing.observer.trim() || null,
        context: this._editing.context.trim() || null,
        ...(ageDays === null ? {} : { age_days: ageDays }),
      },
    };
    this._saving = true;
    try {
      if (this._editing.id) {
        await updateDossierRecord(this._hass, this._selectedLitterId, this._selectedPuppyId, this._editing.id, payload);
        this._status = text(this, "updated");
      } else {
        await addDossierRecord(this._hass, this._selectedLitterId, this._selectedPuppyId, payload);
        this._status = text(this, "saved");
      }
      this._editing = null;
      this._error = "";
      await this._loadData(false);
      this._refreshDeferred = false;
    } catch (error) {
      this._error = error?.message || text(this, "saveFailed");
    } finally {
      this._saving = false;
      this._render();
    }
  }

  async _delete(record) {
    if (!this._data?.can_manage_records || !window.confirm(text(this, "confirmDelete"))) return;
    this._saving = true;
    try {
      await deleteDossierRecord(this._hass, this._selectedLitterId, this._selectedPuppyId, record.id);
      this._status = text(this, "deleted");
      await this._loadData(false);
      this._refreshDeferred = false;
    } catch (error) {
      this._error = error?.message || text(this, "deleteFailed");
    } finally {
      this._saving = false;
      this._render();
    }
  }

  _renderScoreRows(group, scores = null, profile = null) {
    const keys = BEHAVIOR_GROUPS.find(([name]) => name === group)?.[1] || [];
    return keys.map((key) => {
      if (scores) {
        const choices = [1, 2, 3, 4, 5].map((score) => `<label class="score-option"><input type="radio" name="score-${escapeHtml(key)}" data-score-key="${escapeHtml(key)}" value="${score}" ${Number(scores[key]) === score ? "checked" : ""}><span>${score}</span></label>`).join("");
        return `<div class="score-row"><span>${escapeHtml(text(this, key))}</span><div class="score-control">${choices}<button type="button" class="score-clear" data-score-clear="${escapeHtml(key)}" title="${escapeHtml(text(this, "clearScore"))}" aria-label="${escapeHtml(text(this, "clearScore"))}"><ha-icon icon="mdi:close"></ha-icon></button></div></div>`;
      }
      const item = profile?.criteria[key];
      if (!item) return "";
      return `<div class="profile-row"><span>${escapeHtml(text(this, key))}</span><strong>${escapeHtml(scoreText(item.average, this._hass))}</strong><small>${item.count}× · ${escapeHtml(text(this, "latest"))} ${item.latest}</small></div>`;
    }).join("");
  }

  _renderEditor() {
    if (!this._editing) return "";
    return `<section class="editor"><div class="section-head"><div><h3>${escapeHtml(text(this, this._editing.id ? "edit" : "add"))}</h3><small>${escapeHtml(text(this, "scoreHint"))}</small></div></div>
      <div class="editor-meta"><label>${escapeHtml(text(this, "when"))}<input id="behavior-occurred_at" type="datetime-local" value="${escapeHtml(this._editing.occurred_at)}" required></label><label>${escapeHtml(text(this, "observer"))}<input id="behavior-observer" value="${escapeHtml(this._editing.observer)}" maxlength="500" placeholder="${escapeHtml(text(this, "observerPlaceholder"))}"></label><label class="wide">${escapeHtml(text(this, "context"))}<input id="behavior-context" value="${escapeHtml(this._editing.context)}" maxlength="500" placeholder="${escapeHtml(text(this, "contextPlaceholder"))}"></label></div>
      ${BEHAVIOR_GROUPS.map(([group]) => `<fieldset><legend>${escapeHtml(text(this, group))}</legend>${this._renderScoreRows(group, this._editing.scores)}</fieldset>`).join("")}
      <label class="note-field">${escapeHtml(text(this, "note"))}<textarea id="behavior-note" rows="4" placeholder="${escapeHtml(text(this, "notePlaceholder"))}">${escapeHtml(this._editing.note)}</textarea></label>
      <div class="actions"><button type="button" class="secondary" id="behavior-cancel">${escapeHtml(text(this, "cancel"))}</button><button type="button" class="primary" id="behavior-save" ${this._saving ? "disabled" : ""}>${escapeHtml(text(this, "save"))}</button></div></section>`;
  }

  _render() {
    if (!this.shadowRoot) return;
    const puppy = this._selectedPuppy();
    const profile = behaviorProfile(puppy?.records || []);
    const litterOptions = this._litters.map((litter) => `<option value="${escapeHtml(litter.id)}" ${litter.id === this._selectedLitterId ? "selected" : ""}>${escapeHtml(litter.name || text(this, "litter"))}</option>`).join("");
    const puppyOptions = (this._data?.puppies || []).map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === this._selectedPuppyId ? "selected" : ""}>${escapeHtml(item.name || text(this, "puppy"))}${item.collar_color ? ` · ${escapeHtml(item.collar_color)}` : ""}</option>`).join("");
    const groupCards = BEHAVIOR_GROUPS.map(([group]) => `<section class="profile-group"><div class="group-title"><strong>${escapeHtml(text(this, group))}</strong><span>${escapeHtml(text(this, "groupScore"))}: ${escapeHtml(scoreText(profile.groups[group]?.average, this._hass))}</span></div><div class="profile-list">${this._renderScoreRows(group, null, profile) || `<div class="empty">—</div>`}</div></section>`).join("");
    const profileSection = this._config.show_profile !== false ? `<section class="profile-summary"><div class="stat"><span>${escapeHtml(text(this, "finalScore"))}</span><strong>${escapeHtml(scoreText(profile.finalScore, this._hass))}<small>/5</small></strong></div><div class="stat"><span>${escapeHtml(text(this, "observationsCount"))}</span><strong>${profile.observations.length}</strong></div><div class="stat"><span>${escapeHtml(text(this, "criteriaCount"))}</span><strong>${profile.criteriaCount}<small>/${BEHAVIOR_GROUPS.flatMap(([, keys]) => keys).length}</small></strong></div><p>${escapeHtml(text(this, "neutralNote"))}</p></section>${profile.observations.length ? groupCards : `<div class="empty">${escapeHtml(text(this, "noProfile"))}</div>`}` : "";
    const history = [...profile.observations].reverse().slice(0, Math.max(1, Number(this._config.max_items) || 20));
    const historySection = this._config.show_history !== false ? `<section class="history"><div class="section-head"><h3>${escapeHtml(text(this, "history"))}</h3><span>${profile.observations.length}</span></div><div class="history-list">${history.length ? history.map((record) => `<article><div><strong>${escapeHtml(formatDateTime(record.occurred_at, "—", this._hass))}</strong><span>${record.data?.observer ? escapeHtml(record.data.observer) : ""}${record.data?.context ? ` · ${escapeHtml(record.data.context)}` : ""}</span>${record.note ? `<p>${escapeHtml(record.note)}</p>` : ""}</div><b>${escapeHtml(scoreText(record.score, this._hass))}</b>${this._data?.can_manage_records ? `<div class="row-actions"><button type="button" data-edit="${escapeHtml(record.id)}" title="${escapeHtml(text(this, "edit"))}"><ha-icon icon="mdi:pencil-outline"></ha-icon></button><button type="button" data-delete="${escapeHtml(record.id)}" title="${escapeHtml(text(this, "delete"))}"><ha-icon icon="mdi:delete-outline"></ha-icon></button></div>` : ""}</article>`).join("") : `<div class="empty">${escapeHtml(text(this, "noProfile"))}</div>`}</div></section>` : "";

    this.shadowRoot.innerHTML = `<ha-card><style>
      ha-card{padding:16px;container-type:inline-size;container-name:behavior-card;overflow-anchor:none}.head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.title{font-size:18px;font-weight:650}.subtitle,.section-head small{font-size:12px;color:var(--secondary-text-color);line-height:1.4}.selectors{display:flex;gap:8px;flex-wrap:wrap}.selectors label,.editor-meta label,.note-field{display:grid;gap:4px;font-size:11px;color:var(--secondary-text-color)}select,input,textarea{box-sizing:border-box;width:100%;min-height:42px;border:1px solid var(--divider-color);border-radius:8px;background:var(--card-background-color);color:var(--primary-text-color);padding:8px 10px;font:inherit}.selectors select{min-width:150px}.toolbar{display:flex;justify-content:flex-end;margin-top:12px}.toolbar button,.actions button{min-height:42px;border:0;border-radius:8px;padding:0 14px;font:inherit;font-weight:650;cursor:pointer}.primary{background:var(--primary-color);color:var(--text-primary-color,#fff)}.secondary{background:var(--secondary-background-color);color:var(--primary-text-color);border:1px solid var(--divider-color)!important}.profile-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:14px}.profile-summary p{grid-column:1/-1;margin:0;color:var(--secondary-text-color);font-size:11px;line-height:1.4}.stat{border:1px solid var(--divider-color);border-radius:8px;padding:10px}.stat span{display:block;font-size:11px;color:var(--secondary-text-color)}.stat strong{display:block;margin-top:4px;font-size:20px}.stat small{font-size:11px;color:var(--secondary-text-color);margin-left:2px}.profile-group,.history,.editor{margin-top:14px;border-top:1px solid var(--divider-color);padding-top:12px}.group-title,.section-head{display:flex;justify-content:space-between;gap:8px;align-items:center}.group-title span,.section-head span{font-size:12px;color:var(--secondary-text-color)}.profile-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1px 14px;margin-top:8px}.profile-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 8px;padding:7px 0;border-bottom:1px solid color-mix(in srgb,var(--divider-color) 55%,transparent)}.profile-row span{font-size:12px}.profile-row strong{font-size:13px}.profile-row small{grid-column:1/-1;color:var(--secondary-text-color);font-size:10px}.history-list{display:grid;max-height:520px;overflow-y:auto;overscroll-behavior:contain;scrollbar-gutter:stable}.history article{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:10px;align-items:center;padding:10px 0;border-bottom:1px solid var(--divider-color)}.history article span{display:block;color:var(--secondary-text-color);font-size:11px;margin-top:2px}.history article p{margin:5px 0 0;white-space:pre-wrap;font-size:12px}.row-actions{display:flex;gap:3px}.row-actions button{display:grid;place-items:center;width:36px;height:36px;border:1px solid var(--divider-color);border-radius:8px;background:var(--secondary-background-color);color:var(--primary-text-color);cursor:pointer}.row-actions ha-icon{--mdc-icon-size:18px}.editor h3,.history h3{margin:0;font-size:15px}.editor-meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-top:10px}.editor-meta .wide{grid-column:1/-1}fieldset{border:0;padding:0;margin:16px 0 0}legend{font-size:14px;font-weight:650;margin-bottom:5px}.score-row{display:grid;grid-template-columns:minmax(150px,1fr) auto;gap:10px;align-items:center;padding:7px 0;border-bottom:1px solid var(--divider-color)}.score-row>span{font-size:12px}.score-control{display:grid;grid-template-columns:repeat(6,38px);gap:3px}.score-option{position:relative}.score-option input{position:absolute;opacity:0;pointer-events:none}.score-option span,.score-clear{display:grid;place-items:center;width:38px;height:38px;border:1px solid var(--divider-color);border-radius:7px;background:var(--secondary-background-color);color:var(--primary-text-color);font-weight:650;cursor:pointer}.score-clear{padding:0}.score-clear ha-icon{--mdc-icon-size:17px}.score-option input:checked+span{background:var(--primary-color);border-color:var(--primary-color);color:var(--text-primary-color,#fff)}.score-option input:focus-visible+span,.score-clear:focus-visible{outline:2px solid var(--primary-color);outline-offset:2px}.note-field{margin-top:12px}.actions{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}.empty{padding:18px 4px;color:var(--secondary-text-color);font-size:12px}.error{color:var(--error-color);font-size:12px;margin-top:10px}.status{color:var(--secondary-text-color);font-size:12px;margin-top:10px}
      @container behavior-card (max-width:620px){.head{display:grid}.selectors{display:grid;grid-template-columns:1fr}.selectors select{min-width:0}.profile-list{grid-template-columns:1fr}.score-row{grid-template-columns:1fr}.score-control{grid-template-columns:repeat(5,minmax(38px,1fr))}.score-option span{width:100%}.editor-meta{grid-template-columns:1fr}.editor-meta .wide{grid-column:auto}}
      @container behavior-card (max-width:390px){ha-card{padding:13px}.profile-summary{grid-template-columns:1fr 1fr}.profile-summary .stat:first-child{grid-column:1/-1}.history article{grid-template-columns:minmax(0,1fr) auto}.row-actions{grid-column:1/-1}.actions{display:grid;grid-template-columns:1fr 1fr}.actions button{width:100%}}
    </style><div class="head"><div><div class="title">${escapeHtml(this._config.title || text(this, "title"))}</div><div class="subtitle">${escapeHtml(text(this, "subtitle"))}</div></div><div class="selectors">${this._config.show_litter_selector === false ? "" : `<label>${escapeHtml(text(this, "litter"))}<select id="behavior-litter">${litterOptions}</select></label>`}<label>${escapeHtml(text(this, "puppy"))}<select id="behavior-puppy" ${puppyOptions ? "" : "disabled"}><option value="">${escapeHtml(text(this, "choosePuppy"))}</option>${puppyOptions}</select></label></div></div>${this._error ? `<div class="error">${escapeHtml(this._error)}</div>` : ""}${this._status ? `<div class="status">${escapeHtml(this._status)}</div>` : ""}${puppy && this._data?.can_manage_records && !this._editing ? `<div class="toolbar"><button type="button" class="primary" id="behavior-add"><ha-icon icon="mdi:plus"></ha-icon> ${escapeHtml(text(this, "add"))}</button></div>` : ""}${this._renderEditor()}${puppy ? `${profileSection}${historySection}` : `<div class="empty">${escapeHtml(text(this, "choosePuppy"))}</div>`}</ha-card>`;

    this.shadowRoot.getElementById("behavior-litter")?.addEventListener("change", (event) => this._changeLitter(event.target.value));
    this.shadowRoot.getElementById("behavior-puppy")?.addEventListener("change", (event) => this._changePuppy(event.target.value));
    this.shadowRoot.getElementById("behavior-add")?.addEventListener("click", () => this._startEditor());
    this.shadowRoot.getElementById("behavior-cancel")?.addEventListener("click", () => this._cancelEditor());
    this.shadowRoot.getElementById("behavior-save")?.addEventListener("click", () => this._save());
    this.shadowRoot.querySelectorAll("[data-score-key]").forEach((input) => input.addEventListener("change", (event) => { if (this._editing) this._editing.scores[event.target.dataset.scoreKey] = Number(event.target.value); }));
    this.shadowRoot.querySelectorAll("[data-score-clear]").forEach((button) => button.addEventListener("click", () => {
      if (!this._editing) return;
      this._captureInputs();
      delete this._editing.scores[button.dataset.scoreClear];
      button.closest(".score-control")?.querySelectorAll("[data-score-key]").forEach((input) => { input.checked = false; });
    }));
    this.shadowRoot.querySelectorAll("[data-edit]").forEach((button) => button.addEventListener("click", () => this._startEditor(profile.observations.find((record) => record.id === button.dataset.edit))));
    this.shadowRoot.querySelectorAll("[data-delete]").forEach((button) => button.addEventListener("click", () => { const record = profile.observations.find((item) => item.id === button.dataset.delete); if (record) this._delete(record); }));
  }
}

if (!customElements.get("puppy-tracker-behavior-card")) customElements.define("puppy-tracker-behavior-card", PuppyTrackerBehaviorCard);
