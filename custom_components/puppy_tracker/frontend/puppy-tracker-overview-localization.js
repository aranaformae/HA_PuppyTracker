// Stateless localization owned by the Overview card render lifecycle.

const EXACT_EN = new Map([
  ["Puppy groeioverzicht", "Puppy growth overview"],
  ["24 uur", "24 hours"],
  ["3 dagen", "3 days"],
  ["7 dagen", "7 days"],
  ["14 dagen", "14 days"],
  ["30 dagen", "30 days"],
  ["Actief", "Active"],
  ["Actieve metingen exporteren als CSV", "Export active measurements as CSV"],
  ["Actuele aandacht", "Current attention"],
  ["Aandacht", "Attention"],
  ["Afwijking mediaan", "Difference from median"],
  ["Afwijking nesttempo", "Difference from litter growth rate"],
  ["Alle ingesteld", "All configured milestones reached"],
  ["Alle pups in grafiek", "All puppies in chart"],
  ["Alleen deze pup", "Only this puppy"],
  ["Alles", "All"],
  ["Analyse", "Analysis"],
  ["Annuleren", "Cancel"],
  ["Aanhoudend gewichtsverlies", "Sustained weight loss"],
  ["Aanhoudend lage groei", "Sustained low growth"],
  ["Aanhoudende daling", "Sustained decline"],
  ["Bandje", "Collar"],
  ["Beperkt", "Limited"],
  ["Bezig", "In progress"],
  ["Betrouwbaarheid mijlpaal", "Milestone confidence"],
  ["Binnen nestinstelling", "Within litter setting"],
  ["Boven nestmediaan", "Above litter median"],
  ["Boven nesttempo", "Above litter growth rate"],
  ["Compleet nest", "Complete litter"],
  ["Controleer of de integratie geladen is en herlaad daarna de kaart.", "Check that the integration is loaded, then reload the card."],
  ["Controleer of Puppy Tracker geladen is.", "Check that Puppy Tracker is loaded."],
  ["Correctie opslaan…", "Saving correction…"],
  ["Correctie opslaan mislukt.", "Saving correction failed."],
  ["Data-integriteit vraagt aandacht", "Data integrity needs attention"],
  ["Datakwaliteit", "Data quality"],
  ["Datum en tijd", "Date and time"],
  ["De actie kon niet worden uitgevoerd.", "The action could not be completed."],
  ["De bijbehorende select-entity is niet gevonden.", "The associated select entity was not found."],
  ["De kaart kon de Puppy Tracker-entities niet automatisch vinden.", "The card could not automatically find the Puppy Tracker entities."],
  ["De meetgeschiedenis kon niet worden geladen.", "Measurement history could not be loaded."],
  ["De meting blijft bewaard en kan later worden hersteld.", "The measurement is retained and can be restored later."],
  ["De opgeslagen meetgegevens konden niet worden geladen.", "Stored measurement data could not be loaded."],
  ["Deze meting verwijderen?", "Delete this measurement?"],
  ["Export mislukt.", "Export failed."],
  ["JSON-nestback-up gedownload.", "Litter JSON backup downloaded."],
  ["JSON-nestback-up", "Litter JSON backup"],
  ["PDF en CSV volgen de gekozen pup en periode. JSON is een importeerbare nestback-up inclusief correctie- en verwijderhistorie.", "PDF and CSV follow the selected puppy and period. JSON is an importable litter backup including correction and deletion history."],
  ["Geboortegewicht", "Birth weight"],
  ["Geboortegewicht hersteld", "Birth weight regained"],
  ["Geen", "None"],
  ["Geen aanhoudend lage groei", "No sustained low growth"],
  ["Geen aanhoudende daling", "No sustained decline"],
  ["Geen actieve pups gevonden in dit nest.", "No active puppies found in this litter."],
  ["Geen actieve pups gevonden voor dit nest.", "No active puppies found for this litter."],
  ["Geen metingen binnen de gekozen filters.", "No measurements within the selected filters."],
  ["Geen nest", "No litter"],
  ["Geen nesten gevonden", "No litters found"],
  ["Geen pups om te tonen.", "No puppies to show."],
  ["Geen data", "No data"],
  ["Geen meting", "No measurement"],
  ["Gemiddeld", "Average"],
  ["Geslacht", "Sex"],
  ["Geselecteerde pup", "Selected puppy"],
  ["Gewicht", "Weight"],
  ["Gewichtspatroon", "Weight pattern"],
  ["Gewichtsverlies", "Weight loss"],
  ["Gewicht opslaan", "Save weight"],
  ["Gewichtsontwikkeling", "Weight development"],
  ["Grafiek", "Chart"],
  ["Grafiek laden…", "Loading chart…"],
  ["Grafiekperiode", "Chart period"],
  ["Groei / 24 uur", "Growth / 24 hours"],
  ["Groei 24 uur", "Growth 24 hours"],
  ["Groei 24u", "Growth 24h"],
  ["Groei per 24 uur", "Growth per 24 hours"],
  ["Groei sinds geboorte", "Growth since birth"],
  ["Groei neemt af", "Growth is slowing"],
  ["Groei stabiel", "Growth rate is stable"],
  ["Groei versnelt", "Growth is accelerating"],
  ["Groeianalyse", "Growth analysis"],
  ["Groeimijlpalen", "Growth milestones"],
  ["Groeipatroon", "Growth pattern"],
  ["Grootste meetgat", "Longest measurement gap"],
  ["Goed", "Good"],
  ["Hoge betrouwbaarheid", "High confidence"],
  ["Historie", "History"],
  ["Historie inklappen", "Collapse history"],
  ["Huidig gewicht", "Current weight"],
  ["Huidige meting", "Current measurement"],
  ["Laatste", "Latest"],
  ["Laatste geldige weging", "Latest valid weighing"],
  ["Laatste weging", "Latest weighing"],
  ["Laatste weging geselecteerde pup", "Latest weighing for selected puppy"],
  ["Laatst gewogen", "Last weighed"],
  ["Vorige meting geselecteerde pup", "Previous measurement for selected puppy"],
  ["Verschil met vorige meting", "Difference from previous measurement"],
  ["Leeftijd", "Age"],
  ["Lichtste", "Lightest"],
  ["Meetgegevens vernieuwen", "Refresh measurement data"],
  ["Meetritme prognose", "Projection measurement cadence"],
  ["Meetgeschiedenis", "Measurement history"],
  ["Meetgeschiedenis filteren", "Filter measurement history"],
  ["Meetgeschiedenis laden…", "Loading measurement history…"],
  ["Meting herstellen mislukt.", "Restoring measurement failed."],
  ["Meting herstellen…", "Restoring measurement…"],
  ["Meting hersteld en weer actief.", "Measurement restored and active again."],
  ["Meting hersteld als nieuwe actieve versie, omdat de correctieketen intussen was gewijzigd.", "Measurement restored as a new active version because the correction chain had changed."],
  ["Meting verwijderen mislukt.", "Deleting measurement failed."],
  ["Meting verwijderen…", "Deleting measurement…"],
  ["Meting verwijderd. Bij een correctie is de direct vorige versie weer actief.", "Measurement deleted. For a correction, the directly previous version is active again."],
  ["Metingen", "Measurements"],
  ["Metingen beheren", "Manage measurements"],
  ["Metingen sluiten", "Close measurements"],
  ["Mediaan meetinterval", "Median measurement interval"],
  ["Meer data nodig", "More data needed"],
  ["Naam", "Name"],
  ["Nest", "Litter"],
  ["Nestdrempel", "Litter threshold"],
  ["Nestpositie", "Position within litter"],
  ["Nesttempo", "Litter growth rate"],
  ["Nestdata kon niet worden geladen.", "Litter data could not be loaded."],
  ["Nestoverzicht kon niet worden geladen.", "Litter overview could not be loaded."],
  ["Niet gestart", "Not started"],
  ["Niet op schema", "Not on track"],
  ["Nog niet te schatten", "Not enough data to estimate"],
  ["Nog geen historische meetpunten in deze periode.", "No historical measurement points in this period yet."],
  ["Nog geen volledige sessie", "No complete session yet"],
  ["Nog te wegen", "Still to weigh"],
  ["Notitie", "Note"],
  ["Oude versie (bewaard)", "Previous version (retained)"],
  ["Oude versies", "Previous versions"],
  ["Onbekend", "Unknown"],
  ["Onder nestdrempel", "Below litter threshold"],
  ["Onder nestmediaan", "Below litter median"],
  ["Onder nesttempo", "Below litter growth rate"],
  ["Onregelmatig meetinterval", "Irregular measurement interval"],
  ["Onvoldoende data", "Insufficient data"],
  ["Onvoldoende nestdata", "Insufficient litter data"],
  ["Onvoldoende nesttempo-data", "Insufficient litter growth data"],
  ["Op schema", "On track"],
  ["Opnieuw zoeken", "Search again"],
  ["Opslaan", "Save"],
  ["PDF downloaden", "Download PDF"],
  ["PDF en CSV volgen de gekozen pup en periode. JSON blijft bewust een volledige nestbackup inclusief correctie- en verwijderhistorie.", "PDF and CSV follow the selected puppy and period. JSON intentionally remains a complete litter backup including correction and deletion history."],
  ["PDF-rapport gedownload.", "PDF report downloaded."],
  ["Periode", "Period"],
  ["Printvriendelijk pup- of nestrapport met bestaande CSV/JSON-export.", "Print-friendly puppy or litter report with the existing CSV/JSON export."],
  ["Pup", "Puppy"],
  ["Puppy", "Puppy"],
  ["Puppy Tracker zoeken…", "Searching for Puppy Tracker…"],
  ["Puppy Tracker-data kon niet worden geladen.", "Puppy Tracker data could not be loaded."],
  ["Puppy weegstation niet gevonden", "Puppy weighing station not found"],
  ["Pups", "Puppies"],
  ["Rapport", "Report"],
  ["Rapportgegevens konden niet worden geladen.", "Report data could not be loaded."],
  ["Reden", "Reason"],
  ["Reden (optioneel)", "Reason (optional)"],
  ["Redelijke betrouwbaarheid", "Moderate confidence"],
  ["Reset sessie", "Reset session"],
  ["Rond nestmediaan", "Near litter median"],
  ["Rond nesttempo", "Near litter growth rate"],
  ["Sinds geboorte", "Since birth"],
  ["Sorteerrichting", "Sort direction"],
  ["Start weegsessie", "Start weighing session"],
  ["Status", "Status"],
  ["Spreiding groeitempo", "Growth-rate spread"],
  ["Te wegen", "To weigh"],
  ["Tik op een meetpunt voor details.", "Tap a measurement point for details."],
  ["Totale groei", "Total growth"],
  ["Trend", "Trend"],
  ["Controleer laatste meting", "Check latest measurement"],
  ["Controleren", "Needs review"],
  ["Verschil", "Difference"],
  ["Verwijderd", "Deleted"],
  ["Verwijderen", "Delete"],
  ["Voer een geldig gewicht in.", "Enter a valid weight."],
  ["Voer een geldige datum en tijd in.", "Enter a valid date and time."],
  ["Voer eerst een geldig gewicht in.", "Enter a valid weight first."],
  ["Volgende pup", "Next puppy"],
  ["Volgende groeimijlpaal", "Next growth milestone"],
  ["Nu te wegen", "Weigh now"],
  ["Volledige JSON-backup gedownload.", "Complete JSON backup downloaded."],
  ["Volledige nestdata exporteren als JSON", "Export complete litter data as JSON"],
  ["Voltooid", "Completed"],
  ["Voortgang", "Progress"],
  ["Voortgang naar mijlpaal", "Progress toward milestone"],
  ["Vorige meting", "Previous measurement"],
  ["Weging", "Weighing"],
  ["Weging nodig", "Weighing due"],
  ["Wegen", "Weigh"],
  ["Wijzigen", "Edit"],
  ["Zwaarste", "Heaviest"],
  ["Eerste 24 uur", "First 24 hours"],
  ["Eerste trend", "Initial trend"],
  ["Geschatte datum volgende", "Estimated date for next milestone"],
  ["Lage betrouwbaarheid", "Low confidence"],
  ["Lage groei", "Low growth"],
  ["Voldoende regelmatig", "Sufficiently regular"],
  ["Verouderd", "Stale"],
  ["Verschil geboortegewicht", "Difference from birth weight"],
  ["Ja", "Yes"],
  ["Nee", "No"],
  ["Herstellen", "Restore"],
  ["Bijv. foutieve invoer", "E.g. incorrect entry"],
  ["actief", "active"],
  ["aandacht", "attention"],
  ["bijv. 428", "e.g. 428"],
  ["gem.", "avg."],
  ["gewicht", "weight"],
  ["laatste weging", "latest weighing"],
  ["sinds geboorte", "since birth"],
  ["te wegen", "to weigh"],
]);

const PATTERNS_EN = [
  [/^(\d+)\/(\d+) gewogen$/, (_m, done, total) => `${done}/${total} weighed`],
  [/^Laatste sessie (.+)$/, (_m, value) => `Last session ${value}`],
  [/^(\d+) pups$/, (_m, count) => `${count} puppies`],
  [/^(\d+) aandacht$/, (_m, count) => `${count} attention`],
  [/^(\d+) te wegen$/, (_m, count) => `${count} to weigh`],
  [/^gem\. (.+)$/, (_m, value) => `avg. ${value}`],
  [/^(\d+) actief$/, (_m, count) => `${count} active`],
  [/^(\d+) oude versies$/, (_m, count) => `${count} previous versions`],
  [/^(\d+) verwijderd$/, (_m, count) => `${count} deleted`],
  [/^(\d+) eerdere versie$/, (_m, count) => `${count} previous version`],
  [/^(\d+) eerdere versies$/, (_m, count) => `${count} previous versions`],
  [/^(\d+) historische versie ingeklapt$/, (_m, count) => `${count} historical version collapsed`],
  [/^(\d+) historische versies ingeklapt$/, (_m, count) => `${count} historical versions collapsed`],
  [/^(\d+) pup · eigen meetdata$/, (_m, count) => `${count} puppy · own measurement data`],
  [/^(\d+) pups · eigen meetdata$/, (_m, count) => `${count} puppies · own measurement data`],
  [/^(\d+) u$/, (_m, count) => `${count} h`],
  [/^(\d+) d (\d+) u$/, (_m, days, hours) => `${days} d ${hours} h`],
  [/^(\d+) dagen$/, (_m, count) => `${count} days`],
  [/^(\d+) weken$/, (_m, count) => `${count} weeks`],
  [/^(\d+) maanden$/, (_m, count) => `${count} months`],
  [/^(\d+) jaar (\d+) mnd$/, (_m, years, months) => `${years} y ${months} mo`],
  [/^(.+) uur$/, (_m, value) => `${value} hours`],
  [/^(.+) %-punt$/, (_m, value) => `${value} percentage points`],
  [/^(\d+(?:[.,]\d+)?)x geboortegewicht$/, (_m, factor) => `${factor}x birth weight`],
  [/^Geschat (.+)$/, (_m, value) => `Estimated ${value}`],
  [/^Bereikt (.+)$/, (_m, value) => `Reached ${value}`],
  [/^Verdubbeling binnen (\d+) dagen$/, (_m, days) => `Doubling within ${days} days`],
  [/^(\d+(?:[.,]\d+)?) u$/, (_m, count) => `${count} h`],
  [/^(\d+(?:[.,]\d+)?) d$/, (_m, count) => `${count} d`],
  [/^Notitie: (.+)$/, (_m, value) => `Note: ${value}`],
  [/^Correctiereden: (.+)$/, (_m, value) => `Correction reason: ${value}`],
  [/^correctie van (.+)$/, (_m, value) => `correction of ${value}`],
  [/^vervangen door (.+)$/, (_m, value) => `replaced by ${value}`],
  [/^(CSV|JSON|PDF) voorbereiden…$/, (_m, format) => `Preparing ${format}…`],
  [/^(CSV|JSON|PDF) maken…$/, (_m, format) => `Creating ${format}…`],
  [/^(CSV|JSON|PDF) export klaar$/, (_m, format) => `${format} export ready`],
  [/^(CSV|JSON|PDF) export mislukt$/, (_m, format) => `${format} export failed`],
  [/^Correctie opgeslagen als actieve versie(?: \(([^)]+)\))?\.$/, (_m, id) => `Correction saved as active version${id ? ` (${id})` : ""}.`],
  [/^(\d+) kritisch probleem\/problemen konden niet automatisch worden gerepareerd\. Open Puppy Tracker → Configureren → Data-integriteit controleren en download eventueel diagnostiek\.$/, (_m, count) => `${count} critical issue(s) could not be repaired automatically. Open Puppy Tracker → Configure → Check data integrity and optionally download diagnostics.`],
  [/^Niet gevonden in Home Assistant: (.+)\. Herlaad de integratie en vernieuw daarna het dashboard\.$/, (_m, items) => `Not found in Home Assistant: ${translateMissingControls(items)}. Reload the integration and then refresh the dashboard.`],
  [/^De entity voor (.+) is niet gevonden\. Herlaad de Puppy Tracker-integratie en vernieuw daarna het dashboard\.$/, (_m, label) => `The entity for ${translateMissingControls(label)} was not found. Reload the Puppy Tracker integration and then refresh the dashboard.`],
];

const MISSING_CONTROL_EN = new Map([
  ["Weegsessie starten", "start weighing session"],
  ["Gewicht opslaan", "save weight"],
  ["Weegsessie resetten", "reset weighing session"],
  ["Gewicht invoeren", "weight input"],
]);

function translateMissingControls(value) {
  return String(value || "")
    .split(",")
    .map((part) => {
      const trimmed = part.trim();
      return MISSING_CONTROL_EN.get(trimmed) || trimmed;
    })
    .join(", ");
}

function currentLanguage(hass = null) {
  const language =
    hass?.locale?.language ||
    hass?.language ||
    document.documentElement?.lang ||
    navigator.language ||
    "nl";
  return String(language).toLowerCase().split("-")[0] === "en" ? "en" : "nl";
}

export function localizeOverviewValue(hass, value) {
  if (currentLanguage(hass) !== "en") return value;
  const original = String(value ?? "");
  const match = original.match(/^(\s*)([\s\S]*?)(\s*)$/);
  const prefix = match?.[1] || "";
  const text = match?.[2] || original;
  const suffix = match?.[3] || "";
  if (!text) return original;

  const exact = EXACT_EN.get(text);
  if (exact !== undefined) return `${prefix}${exact}${suffix}`;

  for (const [pattern, replacer] of PATTERNS_EN) {
    const result = text.match(pattern);
    if (result) return `${prefix}${replacer(...result)}${suffix}`;
  }

  return original;
}

function shouldProtectText(node) {
  const element = node.parentElement;
  if (!element) return false;

  // These nodes primarily contain user-supplied card titles, litter names, or
  // puppy names. Do not reinterpret user content as a UI label.
  if (element.matches(".title, h2")) {
    return true;
  }

  if (
    element.closest(
      ".puppy-name, .identity strong, .puppy-head strong, .detail-title h3, .measurement-panel-header h3, .chart-tooltip strong, .legend-item"
    )
  ) {
    return true;
  }

  if (element.matches("option")) {
    const selectId = element.parentElement?.id;
    if (["litter-select", "puppy-select", "litter", "puppy"].includes(selectId)) {
      return element.value !== "all";
    }
  }

  return false;
}

export function localizeOverviewRoot(root, hass = null) {
  if (!root || currentLanguage(hass) !== "en") return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  for (const node of nodes) {
    const parentName = node.parentElement?.tagName;
    if (["STYLE", "SCRIPT"].includes(parentName)) continue;
    if (shouldProtectText(node)) continue;
    const translated = localizeOverviewValue(hass, node.nodeValue);
    if (translated !== node.nodeValue) node.nodeValue = translated;
  }

  root.querySelectorAll?.("[title], [aria-label], [placeholder]").forEach((element) => {
    for (const attribute of ["title", "aria-label", "placeholder"]) {
      if (!element.hasAttribute(attribute)) continue;
      const value = element.getAttribute(attribute);
      const translated = localizeOverviewValue(hass, value);
      if (translated !== value) element.setAttribute(attribute, translated);
    }
  });
}

export function localizeOverviewSchema(hass, value) {
  if (Array.isArray(value)) return value.map((item) => localizeOverviewSchema(hass, item));
  if (!value || typeof value !== "object") return value;

  const result = {};
  for (const [key, item] of Object.entries(value)) {
    result[key] = key === "label" && typeof item === "string"
      ? localizeOverviewValue(hass, item)
      : localizeOverviewSchema(hass, item);
  }
  return result;
}
