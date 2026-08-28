Puppy Weight Tracker

Custom Home Assistant integration for tracking puppy weights, weighing sessions and growth over time.

Features

* Track multiple puppies individually
* Record puppy weights
* Keep a weight history per puppy
* Support for weighing sessions
* Designed for use directly inside Home Assistant
* Suitable for dashboards and custom Lovelace cards

Installation via HACS

This integration can be installed as a custom repository in HACS.

1. Open HACS in Home Assistant.
2. Go to Custom repositories.
3. Add the URL of this GitHub repository.
4. Select Integration as the repository type.
5. Install Puppy Weight Tracker.
6. Restart Home Assistant.

The integration will be installed in:

/config/custom_components/puppy_weight_tracker/

Manual installation

Copy the directory:

custom_components/puppy_weight_tracker

to:

/config/custom_components/puppy_weight_tracker

Restart Home Assistant afterwards.

Repository structure

puppy-weight-tracker/
├── custom_components/
│   └── puppy_weight_tracker/
│       ├── __init__.py
│       ├── manifest.json
│       ├── config_flow.py
│       └── ...
├── hacs.json
└── README.md

Updating

When installed through HACS, new versions can be downloaded directly from HACS.

During development, the latest version can be retrieved from the repository’s default branch.

Development status

This integration is currently under active development.

Features, entities and configuration options may change between versions.

License

For personal use and development.