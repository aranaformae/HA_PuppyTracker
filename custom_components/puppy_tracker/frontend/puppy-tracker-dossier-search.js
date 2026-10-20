import { escapeHtml, languageForHass } from "./puppy-tracker-card-common.js";

const TEXT = {
  nl: { search: "Zoeken in items", clear: "Zoekterm wissen", none: "Geen items gevonden voor deze zoekterm en filters.", count: "{count} gevonden" },
  en: { search: "Search items", clear: "Clear search", none: "No items match this search and the selected filters.", count: "{count} found" },
};

export function searchText(hass, key, count = 0) {
  return TEXT[languageForHass(hass)][key].replace("{count}", String(count));
}

function normalized(value) {
  return String(value ?? "").normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
}

export function matchesDossierSearch(record, query) {
  const terms = normalized(query).trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const content = normalized([record?.title, record?.note, record?.data?.result, record?.data?.test_result, record?.data?.care_result].filter((value) => value !== null && value !== undefined).join(" "));
  return terms.every((term) => content.includes(term));
}

export function searchMarkup(hass, query, count) {
  return `<div class="record-search"><label for="record-search">${escapeHtml(searchText(hass, "search"))}</label><div><input id="record-search" type="search" value="${escapeHtml(query || "")}" autocomplete="off"><button id="clear-record-search" type="button" title="${escapeHtml(searchText(hass, "clear"))}" aria-label="${escapeHtml(searchText(hass, "clear"))}" ${query ? "" : "disabled"}><ha-icon icon="mdi:close"></ha-icon></button></div><span id="record-search-count" aria-live="polite">${escapeHtml(searchText(hass, "count", count))}</span></div>`;
}

export function bindSearch(root, onChange) {
  const input = root.getElementById("record-search");
  const clear = root.getElementById("clear-record-search");
  input?.addEventListener("input", () => {
    clear.disabled = !input.value;
    onChange(input.value);
  });
  clear?.addEventListener("click", () => {
    input.value = "";
    clear.disabled = true;
    onChange("");
    input.focus({ preventScroll: true });
  });
}

export function syncSearchControls(root, hass, query, count) {
  const input = root.getElementById("record-search");
  if (input && input.value !== (query || "")) input.value = query || "";
  const clear = root.getElementById("clear-record-search");
  if (clear) clear.disabled = !query;
  const counter = root.getElementById("record-search-count");
  if (counter) counter.textContent = searchText(hass, "count", count);
}

export function syncTimelineToggle(root, visible, contentSelector, label) {
  const content = root.querySelector(contentSelector);
  const button = root.getElementById("toggle-timeline-items");
  if (!content || !button) return;
  if (!visible && content.contains(root.activeElement)) button.focus({ preventScroll: true });
  content.hidden = !visible;
  button.setAttribute("aria-expanded", String(visible));
  button.classList.toggle("secondary", visible);
  button.querySelector("ha-icon")?.setAttribute("icon", `mdi:chevron-${visible ? "up" : "down"}`);
  button.querySelector("span").textContent = label;
}

export const SEARCH_STYLE = `.record-search{display:grid;gap:5px;margin-bottom:10px;min-width:0}.record-search label,.record-search>span{margin:0;font-size:12px;color:var(--secondary-text-color)}.record-search>div{display:grid;grid-template-columns:minmax(0,1fr) 40px;gap:6px}.record-search input{box-sizing:border-box;width:100%;min-width:0;min-height:40px;padding:0 10px;border:1px solid var(--divider-color);border-radius:8px;background:var(--card-background-color);color:var(--primary-text-color);font:inherit}.record-search button{display:flex;align-items:center;justify-content:center;min-height:40px;padding:0;border:1px solid var(--divider-color);border-radius:8px;background:transparent;color:var(--primary-text-color);cursor:pointer}.record-search button:disabled{opacity:.4}.record-search ha-icon{--mdc-icon-size:18px}`;
