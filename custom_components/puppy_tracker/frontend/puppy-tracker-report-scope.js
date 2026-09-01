import {
  downloadExportFile,
  fetchExport,
  languageForHass,
  rangeToHours,
} from "./puppy-tracker-card-common.js";

const REPORT_TAG = "puppy-tracker-report-card";
const LITTER_VALUE = "__litter__";

function copy(card, nl, en) {
  return languageForHass(card?._hass) === "en" ? en : nl;
}

function patchReportScopes() {
  const Card = customElements.get(REPORT_TAG);
  if (!Card || Card.prototype.__puppyTrackerReportScopesPatched) return;

  const originalLoadData = Card.prototype._loadData;
  const originalSelectedPuppies = Card.prototype._selectedPuppies;
  const originalExport = Card.prototype._export;
  const originalRender = Card.prototype._render;

  Card.prototype._loadData = async function (render = true) {
    if (this._selectedPuppyId !== LITTER_VALUE) {
      return originalLoadData.call(this, render);
    }

    this._selectedPuppyId = "all";
    try {
      await originalLoadData.call(this, false);
    } finally {
      this._selectedPuppyId = LITTER_VALUE;
    }
    if (render) this._render();
  };

  Card.prototype._selectedPuppies = function (...args) {
    if (this._selectedPuppyId !== LITTER_VALUE) {
      return originalSelectedPuppies.apply(this, args);
    }

    const intended = this._selectedPuppyId;
    this._selectedPuppyId = "all";
    try {
      return originalSelectedPuppies.apply(this, args);
    } finally {
      this._selectedPuppyId = intended;
    }
  };

  Card.prototype._export = async function (format) {
    if (this._selectedPuppyId !== LITTER_VALUE) {
      return originalExport.call(this, format);
    }
    if (!this._hass || !this._selectedLitterId) return;

    this._status = `${format.toUpperCase()} voorbereiden…`;
    this._render();
    try {
      const result = await fetchExport(
        this._hass,
        this._selectedLitterId,
        format,
        ["csv", "pdf"].includes(format)
          ? {
              puppy_id: null,
              range_hours: rangeToHours(this._range),
            }
          : {},
      );
      downloadExportFile(result);
      this._status = format === "json"
        ? copy(this, "Volledige JSON-backup gedownload.", "Complete JSON backup downloaded.")
        : format === "pdf"
          ? copy(this, "PDF-rapport gedownload.", "PDF report downloaded.")
          : copy(this, "CSV gedownload.", "CSV downloaded.");
    } catch (error) {
      this._status = error?.message || copy(this, "Export mislukt.", "Export failed.");
    }
    this._render();
  };

  Card.prototype._render = function (...args) {
    const result = originalRender.apply(this, args);
    const select = this.shadowRoot?.getElementById("puppy");
    if (!select) return result;

    let litterOption = Array.from(select.options).find((item) => item.value === LITTER_VALUE);
    if (!litterOption) {
      litterOption = document.createElement("option");
      litterOption.value = LITTER_VALUE;
      litterOption.textContent = copy(this, "Hele nest", "Whole litter");
      const allOption = Array.from(select.options).find((item) => item.value === "all");
      select.insertBefore(litterOption, allOption?.nextSibling || select.options[0] || null);
    }

    if (this._selectedPuppyId === LITTER_VALUE) select.value = LITTER_VALUE;
    return result;
  };

  Card.prototype.__puppyTrackerReportScopesPatched = true;
}

if (customElements.get(REPORT_TAG)) patchReportScopes();
else customElements.whenDefined(REPORT_TAG).then(patchReportScopes);
