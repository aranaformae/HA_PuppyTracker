# 🐾 Puppy Weight Tracker

[![Home Assistant](https://img.shields.io/badge/Home%20Assistant-Custom%20Integration-41BDF5?logo=home-assistant&logoColor=white)](https://www.home-assistant.io/)
[![HACS](https://img.shields.io/badge/HACS-Custom-41BDF5?logo=home-assistant-community-store&logoColor=white)](https://hacs.xyz/)
[![GitHub last commit](https://img.shields.io/github/last-commit/aranaformae/HA_PuppyTracker)](https://github.com/aranaformae/HA_PuppyTracker/commits)
[![GitHub issues](https://img.shields.io/github/issues/aranaformae/HA_PuppyTracker)](https://github.com/aranaformae/HA_PuppyTracker/issues)

<p align=“center”>
  <img src=“custom_components/puppy_weight_tracker/brand/icon@2x.png”
       alt=“Puppy Weight Tracker”
       width=“180”>
</p>

A custom Home Assistant integration for tracking puppy weights, weighing sessions, and growth over time.

> Designed to make monitoring a litter simple and accessible directly from Home Assistant.

—

## ✨ Features

- Track multiple puppies individually
- Record puppy weights
- Keep historical weight measurements
- Manage weighing sessions
- Use collected data in Home Assistant dashboards
- Designed to work with custom Lovelace/dashboard cards
- Install and update through HACS
- Home Assistant-native integration structure

—

## 📋 Requirements

- Home Assistant **2024.6.0 or newer**
- HACS is recommended for installation and updates

—

## 📦 Installation

### HACS — recommended

Click the button below to add this repository to HACS:

[![Open your Home Assistant instance and open this repository inside the Home Assistant Community Store.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=aranaformae&repository=HA_PuppyTracker&category=integration)

Then:

1. Add the repository as an **Integration**.
2. Open **Puppy Weight Tracker** in HACS.
3. Select **Download**.
4. Restart Home Assistant.
5. Go to **Settings → Devices & services**.
6. Add **Puppy Weight Tracker** if it is not discovered automatically.

### Add manually to HACS

If the button above is not available:

1. Open **HACS** in Home Assistant.
2. Open the menu in the top-right corner.
3. Select **Custom repositories**.
4. Add:

   ```text
   https://github.com/aranaformae/HA_PuppyTracker
   ```

5. Select **Integration** as the category.
6. Click **Add**.
7. Find **Puppy Weight Tracker** in HACS.
8. Select **Download**.
9. Restart Home Assistant.

—

## 🧰 Manual installation

1. Download or clone this repository.
2. Copy:

   ```text
   custom_components/puppy_weight_tracker
   ```

   to:

   ```text
   /config/custom_components/puppy_weight_tracker
   ```

3. Restart Home Assistant.
4. Go to **Settings → Devices & services** and add the integration.

The final structure should look like this:

```text
/config/
└── custom_components/
    └── puppy_weight_tracker/
        ├── __init__.py
        ├── config_flow.py
        ├── const.py
        ├── manifest.json
        └── ...
```

—

## ⚙️ Configuration

Puppy Weight Tracker is intended to be configured through the Home Assistant user interface.

Go to:

**Settings → Devices & services → Add integration → Puppy Weight Tracker**

Available options may change while the integration is under active development.

—

## 🐶 Usage

After configuring the integration, puppy and weighing data can be used within Home Assistant for monitoring and dashboard presentation.

Typical use cases include:

- Recording an individual puppy’s weight
- Running weighing sessions for a litter
- Reviewing historical measurements
- Monitoring growth over time
- Building a litter overview dashboard

—

## 🔄 Updating

### HACS

When installed through HACS:

1. Open **HACS**.
2. Open **Puppy Weight Tracker**.
3. Download the available update.
4. Restart Home Assistant when required.

### Development branch

If no GitHub releases are published, HACS can use the repository’s default branch.

A typical development workflow is:

```text
Edit
  ↓
Commit
  ↓
Push to GitHub
  ↓
Update/download in HACS
  ↓
Restart Home Assistant
  ↓
Test
```

—

## 📁 Repository structure

```text
HA_PuppyTracker/
├── custom_components/
│   └── puppy_weight_tracker/
│       ├── __init__.py
│       ├── config_flow.py
│       ├── const.py
│       ├── manifest.json
│       └── ...
│
├── .github/
│   └── workflows/
│       └── ...
├── .gitignore
├── hacs.json
└── README.md
```

All files required by the Home Assistant integration belong inside:

```text
custom_components/puppy_weight_tracker/
```

—

## ✅ HACS compatibility

This repository uses the standard HACS custom-integration layout:

```text
custom_components/
└── puppy_weight_tracker/
```

The repository root contains:

- `README.md`
- `hacs.json`
- the `custom_components` directory

For HACS validation, the integration’s `manifest.json` should contain the metadata required by Home Assistant/HACS, including:

- `domain`
- `name`
- `version`
- `documentation`
- `issue_tracker`
- `codeowners`

—

## 🧪 Development

This project is under active development.

Changes to Python files generally require a Home Assistant restart before testing.

Useful log location:

**Settings → System → Logs**

Search for:

```text
puppy_weight_tracker
```

Before publishing a release, it is recommended to validate the repository with:

- [HACS Action](https://github.com/hacs/action)
- [Home Assistant hassfest](https://github.com/home-assistant/actions)

—

## 🐛 Issues and feature requests

Found a bug or have an idea?

[Open an issue on GitHub](https://github.com/aranaformae/HA_PuppyTracker/issues)

When reporting an issue, please include:

- Home Assistant version
- Puppy Weight Tracker version or commit
- Relevant Home Assistant log messages
- Steps to reproduce the problem

Please remove passwords, tokens, API keys, and other private information before posting logs.

—

## 🗺️ Roadmap

Possible future improvements include:

- Growth statistics
- Weight gain calculations
- Improved historical graphs
- Litter overview
- Dashboard improvements
- Notifications for unexpected weight changes
- Additional puppy information
- More configurable weighing-session workflows

—

## 🤝 Contributing

Contributions, bug reports, and suggestions are welcome through GitHub Issues and Pull Requests.

For code changes:

1. Fork the repository.
2. Create a feature branch.
3. Make and test your changes.
4. Commit your changes.
5. Open a Pull Request.

—

## ⚠️ Development status

Puppy Weight Tracker is currently under active development.

Development versions may contain breaking changes to:

- Entities
- Services
- Configuration
- Stored data
- Dashboard integration

Use development versions with this in mind.

—

<p align=“center”>
  Made for Home Assistant 🏠 and growing puppies 🐾
</p>
