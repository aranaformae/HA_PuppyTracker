# Contributing to Puppy Tracker

Puppy Tracker began as a personal project. Practical feedback, documentation
corrections and focused contributions are welcome. Issues may be written in
Dutch or English. This is a pre-1.0 project; not every suggestion can be promised
or scheduled.

## Report a problem or suggest a feature

Search [existing issues](https://github.com/aranaformae/HA_PuppyTracker/issues)
first. Choose the bug-report or feature-request form when opening an issue.
For a bug, include the exact Puppy Tracker and Home Assistant versions, the
affected Workspace/tab, steps, expected result and actual result. Mention the
browser/device for frontend problems. Use a small, anonymized YAML example
instead of a full dashboard when possible.

Do not upload real owner details, addresses, payments, full backups, access
tokens or signed download URLs. Redact screenshots and logs. Diagnostics can
still identify an installation, so review them before sharing.

Do not publish exploitable security details in a public issue. Use private
vulnerability reporting through the repository's Security tab if that option is
available. Otherwise request a private reporting channel in an issue without
including the vulnerability or private data. The implemented permission policy
is documented in [Security and privacy](docs/SECURITY_PRIVACY.md).

## Local setup

1. Clone the repository and inspect the current branch, HEAD and local changes.
   Existing code and Git history are authoritative, not descriptions of an older
   patch. Keep unrelated local changes out of your contribution.
2. Use a separate development Home Assistant installation and synthetic data,
   not the only copy of a real litter's records. Back up before manual upgrade
   or migration checks.
3. Create `.venv` with Python 3.14. CI tests Home Assistant 2026.9.4 (the
   supported baseline) and 2026.10.4 (the current stable release). Local setup
   uses the pinned current-stable test harness. Install the Python requirements
   and Node.js 22 or newer frontend dependencies:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements_test.txt
npm ci
npx playwright install chromium webkit
```

On Windows use `.venv\Scripts\python.exe` instead. Linux may need
`npx playwright install --with-deps chromium webkit` for browser system libraries.
See [Local tests](tests/README.md) for activation, troubleshooting and the
differences between local and CI environments.

## Make a focused change

- Discuss larger features or storage/API changes in an issue first. Keep pull
  requests focused and identify the problem they solve.
- Follow existing domain helpers and shared frontend schemas. Do not introduce
  per-card copies of ownership, completion or calculation rules, or new
  prototype-patch layers.
- Preserve UUIDs, exact timestamps, correction history and owner scopes. Storage,
  backup and permission changes need explicit design and regression coverage.
- Keep Dutch and English translations and placeholders aligned. Update the
  relevant user/technical guide and add a concise changelog entry under
  Unreleased. Do not bump release versions in ordinary feature pull requests.
- Add executable regression tests at the lowest useful level. Python owns
  storage/calculation/transaction behavior; Playwright owns rendered controls,
  interaction, focus and scrolling. Avoid duplicate source-string tests for
  behavior already covered through the UI.

Run the complete local check before submitting:

```sh
npm run test:all
```

The runner uses the repository `.venv` automatically. For a targeted backend
check, use `.venv/bin/python -m pytest tests/test_records.py`; browser checks can
be selected with `npm run test:e2e -- tests/e2e/dossier.spec.mjs`.
Explain any failure or unperformed manual check instead of calling it passed.
HACS and Hassfest run in GitHub Actions; relevant actual-device checks remain
manual and are listed in the [touch-device checklist](docs/ios-ipados-release-checklist.md).

In the pull request, summarize the behavior change, tests actually run,
documentation updates and any migration/permission impact. Use synthetic-data
screenshots for visual changes. Maintainers handle releases using the
[commit and release conventions](docs/RELEASING.md).
