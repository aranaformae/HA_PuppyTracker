import { escapeHtml, languageForHass } from "./puppy-tracker-card-common.js";
import { bindSaveFeedback } from "./puppy-tracker-form-state.js";

const LABELS = {
  nl: {
    add: "Pup toevoegen", edit: "Pupgegevens bewerken", name: "Roepnaam",
    registered: "Nestnaam / geregistreerde naam", collar: "Bandkleur", coat: "Vachtkleur",
    breed: "Soort", sex: "Geslacht", unknown: "Niet ingevuld", male: "Reu", female: "Teef",
    weight: "Geboortegewicht (g)", birth: "Geboortedatum en tijd", chip: "Chipnummer",
    note: "Profielnotitie", cancel: "Annuleren", save: "Opslaan",
    stale: "Deze pup is intussen gewijzigd. Sluit dit formulier en open de pup opnieuw.",
    failed: "De pupgegevens konden niet worden opgeslagen.",
    added: "Pup toegevoegd. Herlaad de pagina als het overzicht niet bijwerkt.",
    saved: "Pupgegevens opgeslagen. Herlaad de pagina als het overzicht niet bijwerkt.",
  },
  en: {
    add: "Add puppy", edit: "Edit puppy details", name: "Call name",
    registered: "Litter / registered name", collar: "Collar colour", coat: "Coat colour",
    breed: "Breed / type", sex: "Sex", unknown: "Not set", male: "Male", female: "Female",
    weight: "Birth weight (g)", birth: "Birth date and time", chip: "Microchip number",
    note: "Profile note", cancel: "Cancel", save: "Save",
    stale: "This puppy changed while you were editing. Close and reopen the form.",
    failed: "Puppy details could not be saved.",
    added: "Puppy added. Reload the page if the overview did not update.",
    saved: "Puppy details saved. Reload the page if the overview did not update.",
  },
};

export function puppyProfileSaveMessage(hass, wasEdit) {
  return (LABELS[languageForHass(hass)] || LABELS.nl)[wasEdit ? "saved" : "added"];
}

function localDateTime(value) {
  const date = new Date(value || "");
  if (!Number.isFinite(date.getTime())) return "";
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export class PuppyProfileEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._busy = false;
    this.addEventListener("keydown", (event) => {
      if (event.key === "Escape") { event.preventDefault(); this.close(); }
      if (event.key !== "Tab") return;
      const focusable = [...this.shadowRoot.querySelectorAll("input:not(:disabled),select:not(:disabled),textarea:not(:disabled),button:not(:disabled)")];
      if (!focusable.length) return;
      const active = this.shadowRoot.activeElement;
      if (event.shiftKey && active === focusable[0]) {
        event.preventDefault();
        focusable.at(-1).focus();
      } else if (!event.shiftKey && active === focusable.at(-1)) {
        event.preventDefault();
        focusable[0].focus();
      }
    });
  }

  open({ hass, litterId, puppy = null, onSaved, onClose }) {
    this._hass = hass;
    this._litterId = litterId;
    this._puppy = puppy;
    this._onSaved = onSaved;
    this._onClose = onClose;
    this._sourceTime = localDateTime(puppy?.birth_time);
    let previousFocus = document.activeElement;
    while (previousFocus?.shadowRoot?.activeElement) previousFocus = previousFocus.shadowRoot.activeElement;
    this._previousFocus = previousFocus;
    document.body.append(this);
    this._render();
    this.shadowRoot.querySelector("#name")?.focus();
    this._previousOverflow = {
      body: document.body.style.overflow,
      root: document.documentElement.style.overflow,
    };
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    this._background = [...document.body.children].filter((element) => element !== this)
      .map((element) => ({ element, inert: element.inert }));
    this._background.forEach(({ element }) => { element.inert = true; });
  }

  disconnectedCallback() {
    if (!this._previousOverflow) return;
    document.body.style.overflow = this._previousOverflow.body;
    document.documentElement.style.overflow = this._previousOverflow.root;
    this._background.forEach(({ element, inert }) => { element.inert = inert; });
    this._background = [];
    this._previousOverflow = null;
  }

  close() {
    if (this._busy) return;
    this.remove();
    this._previousFocus?.focus?.();
    this._onClose?.();
  }

  _render() {
    const t = LABELS[languageForHass(this._hass)] || LABELS.nl;
    const puppy = this._puppy || {};
    const field = (id, label, value = "", extra = "") => `<label><span>${escapeHtml(label)}</span><input id="${id}" value="${escapeHtml(value ?? "")}" ${extra}></label>`;
    this.shadowRoot.innerHTML = `<style>
      :host{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;background:rgba(0,0,0,.62);padding:12px;box-sizing:border-box}
      .panel{width:min(650px,100%);max-height:calc(100dvh - 24px);overflow:auto;box-sizing:border-box;background:var(--card-background-color);color:var(--primary-text-color);border-radius:16px;padding:20px;box-shadow:0 16px 48px #0005}
      h2{margin:0 0 16px;font-size:20px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}label{display:grid;gap:5px;min-width:0;font-size:13px;color:var(--secondary-text-color)}
      input,select,textarea{box-sizing:border-box;width:100%;min-height:44px;border:1px solid var(--divider-color);border-radius:8px;background:var(--card-background-color);color:var(--primary-text-color);padding:9px;font:inherit;font-size:16px}
      textarea{min-height:95px;resize:vertical}.wide{grid-column:1/-1}.actions{display:flex;justify-content:flex-end;gap:10px;margin-top:18px}button{min-height:44px;border:1px solid var(--divider-color);border-radius:8px;padding:0 14px;background:var(--secondary-background-color);color:var(--primary-text-color);font:inherit;cursor:pointer}button.primary{background:var(--primary-color);color:var(--text-primary-color,#fff);border-color:var(--primary-color)}button:disabled{opacity:.6}.error{margin-top:10px;color:var(--error-color);font-size:13px}
      @media(max-width:520px){.panel{padding:16px}.grid{grid-template-columns:1fr}}
    </style><div class="panel" role="dialog" aria-modal="true" aria-labelledby="profile-title"><h2 id="profile-title">${escapeHtml(puppy.id ? t.edit : t.add)}</h2><form><div class="grid">
      ${field("name", t.name, puppy.name, 'required maxlength="160"')}
      ${field("registered", t.registered, puppy.registered_name)}
      ${field("collar", t.collar, puppy.collar_color)}
      ${field("coat", t.coat, puppy.coat_color)}
      ${field("breed", t.breed, puppy.breed)}
      <label><span>${escapeHtml(t.sex)}</span><select id="sex"><option value="">${escapeHtml(t.unknown)}</option><option value="male" ${puppy.sex === "male" ? "selected" : ""}>${escapeHtml(t.male)}</option><option value="female" ${puppy.sex === "female" ? "selected" : ""}>${escapeHtml(t.female)}</option></select></label>
      ${field("weight", t.weight, puppy.birth_weight, 'type="number" min="1" max="5000" step="1" inputmode="decimal"')}
      ${field("birth", t.birth, this._sourceTime, 'type="datetime-local" step="1"')}
      ${field("chip", t.chip, puppy.chip_number)}
      <label class="wide"><span>${escapeHtml(t.note)}</span><textarea id="note">${escapeHtml(puppy.profile_note || "")}</textarea></label>
    </div><div class="error" role="alert" hidden></div><div class="actions"><button type="button" id="cancel">${escapeHtml(t.cancel)}</button><button type="submit" class="primary">${escapeHtml(t.save)}</button></div></form></div>`;
    this.shadowRoot.querySelector("#cancel").addEventListener("click", () => this.close());
    this.shadowRoot.querySelector("form").addEventListener("submit", (event) => {
      event.preventDefault();
      void this._save();
    });
  }

  async _save() {
    if (this._busy) return;
    const root = this.shadowRoot;
    const read = (id) => root.getElementById(id).value.trim();
    const birth = read("birth");
    const profile = {
      name: read("name"), registered_name: read("registered"), collar_color: read("collar"),
      coat_color: read("coat"), breed: read("breed"), sex: read("sex") || null,
      birth_weight: read("weight") ? Number(read("weight")) : null,
      birth_time: birth === this._sourceTime ? (this._puppy?.birth_time || null) : (birth ? new Date(birth).toISOString() : null),
      chip_number: read("chip"), profile_note: read("note"),
    };
    this._busy = true;
    bindSaveFeedback(this, 'button[type="submit"]', { busy: true });
    root.querySelectorAll("button,input,select,textarea").forEach((control) => { control.disabled = true; });
    const error = root.querySelector(".error");
    error.hidden = true;
    try {
      const result = await this._hass.callWS({
        type: "puppy_tracker/puppy_profile/save", litter_id: this._litterId,
        ...(this._puppy ? { puppy_id: this._puppy.id, expected_updated_at: this._puppy.updated_at } : {}),
        profile,
      });
      this._busy = false;
      this._onSaved?.(result);
      this.close();
    } catch (err) {
      this._busy = false;
      root.querySelectorAll("button,input,select,textarea").forEach((control) => { control.disabled = false; });
      const t = LABELS[languageForHass(this._hass)] || LABELS.nl;
      error.textContent = err?.code === "stale_profile" ? t.stale : (err?.message || t.failed);
      error.hidden = false;
      bindSaveFeedback(this, 'button[type="submit"]', { busy: false, failed: true });
    }
  }
}

if (!customElements.get("puppy-tracker-puppy-profile-editor")) {
  customElements.define("puppy-tracker-puppy-profile-editor", PuppyProfileEditor);
}
