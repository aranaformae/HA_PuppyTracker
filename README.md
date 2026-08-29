# 🐾 Puppy Weight Tracker

[![Home Assistant](https://img.shields.io/badge/Home%20Assistant-Custom%20Integration-41BDF5?logo=homeassistant&logoColor=white)](https://www.home-assistant.io/)
[![HACS](https://img.shields.io/badge/HACS-Custom-41BDF5?logo=homeassistantcommunitystore&logoColor=white)](https://hacs.xyz/)
[![GitHub release](https://img.shields.io/github/v/release/aranaformae/HA_PuppyTracker?display_name=tag)](https://github.com/aranaformae/HA_PuppyTracker/releases)
[![GitHub issues](https://img.shields.io/github/issues/aranaformae/HA_PuppyTracker)](https://github.com/aranaformae/HA_PuppyTracker/issues)

**Puppy Weight Tracker** is a custom Home Assistant integration for tracking puppy weights, growth, weighing sessions and litter health from one place.

It stores its own measurement history, creates Home Assistant devices and entities for litters and puppies, includes purpose-built dashboard cards, supports monitoring and notifications, and provides CSV/JSON export and print-friendly reports.

> **Current development line: 0.9.x**  
> The integration is approaching its first stable `1.0.0` release. Until then, configuration, entities and frontend behaviour may still change.

---

## ✨ Highlights

- 🐶 Manage multiple litters and puppies
- ⚖️ Record and manage puppy weights
- 🔁 Guided weighing sessions with automatic next-puppy selection
- 📈 Track current weight, previous weight, change and growth
- 🕒 Time-aware puppy age and last-weighed information
- 🚨 Monitoring for low growth, weight loss and overdue weighings
- 🔔 Optional Home Assistant and mobile notifications
- 🧾 Full measurement history with corrections, soft-delete and restore
- 🛡️ Storage integrity checks and Home Assistant diagnostics
- 📊 Built-in dashboard cards and growth graphs
- 📦 CSV and JSON export
- 🖨️ Print-friendly puppy and litter reports
- 🏠 Native Home Assistant devices, entities and configuration flow
- ⬇️ Install and update through HACS

---

## 🧠 How data is stored

Puppy Weight Tracker keeps its own persistent dataset in Home Assistant storage instead of relying only on Recorder history.

This means:

- measurements remain available even when Home Assistant Recorder purges old history;
- corrected measurements retain their previous versions;
- deleted measurements are soft-deleted and can be restored;
- graphs can use the integration's own measurement history;
- JSON export can preserve the complete technical history of a litter.

The integration also keeps an audit trail for important data changes.

---

## 🐕 Litter and puppy management

Everything is managed through the Home Assistant UI:

**Settings → Devices & services → Puppy Weight Tracker → Configure**

Available management options include:

- create a litter;
- edit, archive or remove a litter;
- add puppies;
- edit puppy details;
- archive or remove puppies;
- manage measurements;
- configure monitoring thresholds;
- run a storage integrity check.

Puppies can store information such as:

- name;
- collar / identification colour;
- sex;
- birth date and time;
- birth weight;
- notes.

The birth time defaults to the current Home Assistant local date and time when adding a new puppy.

---

## ⚖️ Weighing sessions

The integration includes a guided weighing workflow.

A session:

1. starts with the active puppies in the selected litter;
2. tracks which puppies have already been weighed;
3. records the entered weight;
4. automatically moves to the next unweighed puppy;
5. completes once every puppy in the session has been weighed.

Safeguards are included to reduce accidental duplicate measurements.

The weighing station exposes Home Assistant entities for the selected litter, selected puppy, weight input, session status, progress, next puppy and session controls.

---

## 📈 Growth and status monitoring

Puppy Weight Tracker calculates useful information for each puppy, including:

- current weight;
- birth weight;
- previous weight;
- difference from the previous measurement;
- total growth since birth;
- normalized growth over 24 hours;
- normalized growth percentage over 24 hours;
- puppy age;
- last weighing time;
- monitoring status.

Monitoring thresholds are configurable from the integration options.

Current monitoring can detect situations such as:

- no measurement available;
- maximum time between weighings exceeded;
- weight loss;
- growth below the configured minimum;
- excessive loss during the first 24 hours.

These values are intended as **monitoring aids**, not veterinary diagnoses.

---

## 🔔 Notifications

Optional notifications can be enabled for puppies that need attention.

The notification logic is state-aware and avoids repeatedly sending the same alert while the same condition remains active.

Optional notifications include:

- puppy needs attention;
- puppy returns to a normal status;
- weighing session completed.

Persistent Home Assistant notifications are supported, with optional delivery to selected `notify` entities.

---

## 🧾 Measurement history and corrections

Measurements are never simply overwritten when corrected.

A correction creates a new version while the previous value is retained as historical data.

From the dashboard or integration options you can:

- inspect active measurements;
- view previous correction versions;
- correct weight and timestamp;
- provide a correction reason;
- soft-delete a measurement;
- restore a deleted measurement.

Measurement timestamps are normalized internally and sorted timezone-safely.

---

## 🛡️ Data integrity and diagnostics

The integration includes storage integrity checks for measurement history.

Checks include, among other things:

- missing correction references;
- duplicate measurement IDs;
- correction-chain cycles;
- ambiguous correction branches;
- multiple active versions in one correction chain;
- invalid timestamps;
- birth-weight consistency.

Safe, unambiguous issues may be repaired automatically. The integration deliberately does **not** choose between ambiguous measurement branches.

A manual integrity check is available from the integration configuration.

Home Assistant diagnostics are also supported for troubleshooting. Diagnostics contain structural information and integrity results rather than a full dump of private puppy history.

---

# 🎛️ Dashboard cards

Puppy Weight Tracker includes its own Lovelace cards. They are served by the integration and loaded automatically; manual Lovelace resource registration is not normally required.

## Puppy weighing station

```yaml
type: custom:puppy-weight-tracker-card
title: Puppy weegstation
```

Designed for the day-to-day weighing workflow:

- litter selection;
- puppy selection;
- weight input;
- start/reset weighing session;
- save measurement;
- session progress;
- next puppy;
- recently weighed puppy;
- compact puppy status list.

---

## Growth overview

```yaml
type: custom:puppy-weight-overview-card
title: Puppy groeioverzicht
default_range: 7d
default_metric: weight
```

Provides:

- multi-puppy growth graphs;
- weight, 24-hour growth and total-growth views;
- ranges from 24 hours through the complete stored history;
- selected-puppy details;
- measurement management;
- CSV export;
- JSON backup.

Graphs use Puppy Weight Tracker's own stored measurements rather than depending only on Home Assistant Recorder history.

---

## Compact litter summary

```yaml
type: custom:puppy-weight-summary-card
title: Puppy Tracker
show_litter_selector: true
```

A compact dashboard card showing information such as:

- number of puppies;
- puppies needing attention;
- puppies due for weighing;
- average current weight;
- last completed weighing session.

Optionally use `navigate_path` to make it a shortcut to a dedicated puppy dashboard.

---

## Attention card

```yaml
type: custom:puppy-weight-attention-card
title: Aandacht
show_litter_selector: true
```

Shows only puppies whose current monitoring status needs attention.

When there are no current problems, the card displays a compact all-clear state.

---

## Litter overview

```yaml
type: custom:puppy-weight-litter-card
title: Nestoverzicht
active_only: true
default_sort: name
```

Provides a sortable litter overview with:

- puppy name and collar colour;
- current weight;
- last change;
- 24-hour growth;
- total growth;
- time since last weighing;
- monitoring status.

The layout adapts to narrow Home Assistant Sections columns and switches to a compact per-puppy layout when needed.

---

## Report & export

```yaml
type: custom:puppy-weight-report-card
title: Rapport & export
default_range: all
```

Supports:

- puppy or full-litter reports;
- selectable reporting period;
- CSV export;
- complete JSON litter backup;
- print-friendly reports.

> **0.9.3 note:** print/PDF output uses the browser's print workflow. Some embedded iPadOS / WebView environments may not open the native print dialog reliably. CSV and JSON export are not affected.

---

## Example dashboard

```yaml
type: vertical-stack
cards:
  - type: custom:puppy-weight-summary-card
    title: Puppy Tracker
    show_litter_selector: true

  - type: custom:puppy-weight-attention-card
    title: Aandacht
    show_litter_selector: true

  - type: custom:puppy-weight-litter-card
    title: Nestoverzicht
    active_only: true
    default_sort: name

  - type: custom:puppy-weight-tracker-card
    title: Puppy weegstation

  - type: custom:puppy-weight-overview-card
    title: Groei
    default_range: 7d
    default_metric: weight

  - type: custom:puppy-weight-report-card
    title: Rapport & export
    default_range: all
```

---

## 📤 Export formats

### CSV

CSV export is intended for spreadsheet use and contains the effective, active measurement history for the chosen scope.

Depending on the card, export can be filtered by puppy and period.

### JSON

JSON export is intended as a complete technical litter backup and can include:

- litter information;
- puppies;
- active measurements;
- previous correction versions;
- soft-deleted measurements;
- correction relationships;
- session information;
- audit history.

JSON is intentionally more complete than CSV.

---

# 📦 Installation

## HACS — recommended

1. Open **HACS** in Home Assistant.
2. Open the menu in the top-right corner.
3. Choose **Custom repositories**.
4. Add:

```text
https://github.com/aranaformae/HA_PuppyTracker
```

5. Select **Integration** as the category.
6. Install **Puppy Weight Tracker**.
7. Restart Home Assistant.
8. Go to **Settings → Devices & services**.
9. Add **Puppy Weight Tracker** if it has not already been configured.

Repository:

https://github.com/aranaformae/HA_PuppyTracker

---

## Manual installation

Copy:

```text
custom_components/puppy_weight_tracker
```

to:

```text
/config/custom_components/puppy_weight_tracker
```

The result should resemble:

```text
/config/custom_components/puppy_weight_tracker/
├── __init__.py
├── api.py
├── binary_sensor.py
├── button.py
├── config_flow.py
├── const.py
├── devices.py
├── diagnostics.py
├── frontend.py
├── integrity.py
├── manifest.json
├── notifications.py
├── number.py
├── select.py
├── sensor.py
├── services.yaml
├── session.py
├── storage.py
├── strings.json
├── time_utils.py
├── translations/
│   ├── en.json
│   └── nl.json
├── brand/
│   ├── icon.png
│   └── icon@2x.png
└── frontend/
    ├── puppy-weight-tracker-card.js
    ├── puppy-weight-overview-card.js
    ├── puppy-weight-summary-card.js
    ├── puppy-weight-attention-card.js
    ├── puppy-weight-litter-card.js
    └── puppy-weight-report-card.js
```

Restart Home Assistant after changing Python integration files.

---

## 🔄 Updating

When installed through HACS:

1. install the available Puppy Weight Tracker update in HACS;
2. restart Home Assistant when requested;
3. reload the dashboard if frontend changes were included.

The included frontend modules use versioned URLs to reduce stale browser caching after updates.

---

## 🧪 Troubleshooting

Useful places to check:

**Settings → System → Logs**

Search for:

```text
puppy_weight_tracker
```

If measurement history behaves unexpectedly, run:

**Settings → Devices & services → Puppy Weight Tracker → Configure → Data integrity check**

For issue reports, Home Assistant's **Download diagnostics** function can provide useful debugging information.

When reporting an issue, include:

- Home Assistant version;
- Puppy Weight Tracker version;
- relevant log messages;
- steps to reproduce;
- whether the problem occurs in a browser, the Home Assistant app, or both.

Please remove passwords, tokens, API keys and other private information before sharing logs.

---

## 🐛 Issues and feature requests

Found a bug or have an idea?

[Open an issue on GitHub](https://github.com/aranaformae/HA_PuppyTracker/issues)

Pull requests are also welcome.

---

## 🗺️ Roadmap to 1.0

The current `0.9.x` line is focused on stabilization and final polish before the first stable release.

Planned areas include:

- report/export reliability across platforms;
- final dashboard UX refinements;
- backup/import and restore workflows;
- migration testing from older releases;
- documentation and HACS polish;
- final entity/API compatibility review;
- additional automated validation and tests.

The goal is to publish a stable **1.0.0** once the data model, weighing workflow, monitoring, dashboards and upgrade path have proven reliable.

---

## ⚠️ Development status

Puppy Weight Tracker is still pre-1.0 software.

Although measurement integrity and migration handling are designed conservatively, development releases may still introduce changes to:

- entities;
- services and WebSocket APIs;
- storage schema;
- dashboard cards;
- configuration options.

Keeping a recent Home Assistant backup is recommended while using pre-1.0 versions.

---

## 🤝 Contributing

Contributions, bug reports and suggestions are welcome.

For code changes:

1. fork the repository;
2. create a feature branch;
3. make and test your changes;
4. commit the changes;
5. open a Pull Request.

Before publishing a release, validating with HACS Action and Home Assistant hassfest is recommended.

---

Made for Home Assistant 🏠 and growing puppies 🐾
