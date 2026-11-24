import { DEMO_COMMANDS, DemoBackend, createOfflineHass } from "./backend.js";

const params = new URLSearchParams(location.search);
const language = params.get("lang") === "en" ? "en" : "nl";
const native = params.get("renderer") === "ha";
const text = language === "nl" ? {
  intro: "Probeer notities, groei en dagelijkse zorg met een verzonnen nest.",
  privacy: "Alle gegevens zijn fictief. Registraties blijven alleen in het geheugen van deze pagina.",
  reset: "Demo opnieuw beginnen", renderer: native ? "Eenvoudige weergave" : "Home Assistant-weergave",
  manual: "Handleiding", label: "Taal", journal: "Logboek", growth: "Groei", care: "Zorg",
  loading: "Demo laden…", ready: "Klaar om te oefenen. Opnieuw beginnen herstelt het voorbeeldnest.",
  fallback: "De Home Assistant-weergave is niet beschikbaar. De demo gebruikt de eenvoudige weergave.",
  scope: "Je kunt notities toevoegen en wijzigen, zorg afvinken en voedingsporties berekenen. Export, configuratie en echte Home Assistant-acties zitten niet in deze demo.",
} : {
  intro: "Try notes, growth and daily care with a fictional litter.",
  privacy: "All data is fictional. Practice entries stay only in this page's memory.",
  reset: "Reset demo", renderer: native ? "Simplified preview" : "Home Assistant preview",
  manual: "User manual", label: "Language", journal: "Journal", growth: "Growth", care: "Care",
  loading: "Loading demo…", ready: "Ready to try. Reset restores the example litter.",
  fallback: "The Home Assistant preview is unavailable. Using the simplified preview instead.",
  scope: "Try adding and editing notes, completing care and calculating feeding portions. Exports, configuration and real Home Assistant actions are not included in this demo.",
};
document.documentElement.lang = language;
for (const id of ["intro", "privacy", "reset", "renderer", "manual", "scope"]) document.getElementById(id).textContent = text[id];
document.getElementById("language-label").textContent = text.label;
document.getElementById("language").value = language;
document.getElementById("manual").href = language === "nl" ? "../docs/GEBRUIKERSHANDLEIDING.md" : "../docs/USER_MANUAL.md";
for (const button of document.querySelectorAll("[data-view]")) button.textContent = text[button.dataset.view];
const status = document.getElementById("status");
status.textContent = text.loading;
document.getElementById("reset").onclick = () => {
  // Clear only this demo's UI preferences; never clear unrelated browser storage.
  try {
    for (const key of Object.keys(localStorage)) {
      if ((key.startsWith("puppy_tracker.workspace.") || key.startsWith("puppy_tracker.card_state."))
          && key.includes(".puppy-demo-")) localStorage.removeItem(key);
    }
  } catch { /* The demo also works with browser storage disabled. */ }
  location.reload();
};
document.getElementById("language").onchange = (event) => { params.set("lang", event.target.value); location.search = params; };
document.getElementById("renderer").onclick = () => { params.set("renderer", native ? "offline" : "ha"); location.search = params; };
document.getElementById("unavailable-text").textContent = text.scope;
document.addEventListener("click", (event) => {
  const path = event.composedPath();
  const anchor = path.find((node) => node instanceof HTMLAnchorElement);
  const outsideDemo = anchor && new URL(anchor.href).origin === location.origin
    && new URL(anchor.href).pathname.startsWith("/config/");
  if (outsideDemo || path.some((node) => node.id === "bulk-action")) {
    event.preventDefault();
    event.stopPropagation();
    document.getElementById("unavailable").showModal();
  }
}, true);

const backend = new DemoBackend();
let provider;
let hass = createOfflineHass(backend, language);
let fallback = false;
if (native) {
  try {
    let timer;
    try {
      await Promise.race([
        (async () => {
          await import("https://demo.home-assistant.io/embed.js");
          await Promise.all(["ha-embed-provider", "ha-embed-card"].map((tag) => customElements.whenDefined(tag)));
        })(),
        new Promise((_, reject) => { timer = setTimeout(() => reject(Error("Preview load timeout")), 15000); }),
      ]);
    } finally { clearTimeout(timer); }
    provider = document.createElement("ha-embed-provider");
    provider.hidden = true;
    document.body.append(provider);
    await provider.updateComplete;
    provider.hass.updateHass({ language, locale: { ...provider.hass.locale, language },
      user: { ...provider.hass.user, id: "demo-user", is_admin: true }, states: backend.states });
    hass = provider.hass;
    for (const command of DEMO_COMMANDS) {
      hass.mockWS(command, (message, _currentHass, callback) => command === "puppy_tracker/subscribe"
        ? backend.subscribe(callback) : backend.call(message));
    }
  } catch {
    provider?.remove();
    provider = null;
    hass = createOfflineHass(backend, language);
    fallback = true;
  }
}

for (const module of ["card", "overview-card", "dossier-card", "quick-log-card", "care-execution-card", "calculator-card", "workspace-card"]) {
  await import(`../custom_components/puppy_tracker/frontend/puppy-tracker-${module}.js`);
}
const host = document.getElementById("card-host");
const configs = {
  journal: { preset: "journal", tabs: ["quickLog", "dossier"], default_tab: "quickLog", default_selected: "puppy", puppy_id: "p1" },
  growth: { preset: "growth", tabs: ["analysis"], default_tab: "analysis", tab_config: { analysis: { show_litter_comparison: false, show_advanced_analysis: false, show_eight_week_weight: false, show_puppy_cards: false } } },
  care: { preset: "care", tabs: ["care", "calculator"], default_tab: "care", tab_config: { calculator: { state_key: "puppy-demo-care.calculator" } } },
};
function show(view) {
  const config = { type: "custom:puppy-tracker-workspace-card", state_key: `puppy-demo-${view}`, litter_id: backend.litter.id, show_summary: false, ...configs[view] };
  host.replaceChildren();
  if (provider) {
    const card = document.createElement("ha-embed-card");
    const data = document.createElement("script");
    data.type = "application/json";
    data.textContent = JSON.stringify(config);
    card.append(data);
    // An explicit provider ID also works when the preview is outside its DOM.
    provider.id = "puppy-demo-provider";
    card.setAttribute("provider", provider.id);
    host.append(card);
  } else {
    const card = document.createElement("puppy-tracker-workspace-card");
    card.setConfig(config);
    host.append(card);
    card.hass = hass;
  }
  for (const button of document.querySelectorAll("[data-view]")) button.setAttribute("aria-pressed", String(button.dataset.view === view));
}
for (const button of document.querySelectorAll("[data-view]")) button.onclick = () => show(button.dataset.view);
show("journal");
status.textContent = fallback ? text.fallback : text.ready;
document.body.dataset.ready = "true";
