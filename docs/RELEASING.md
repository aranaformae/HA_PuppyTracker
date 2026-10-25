# Commit and Release Conventions

This is the maintainer procedure. User setup belongs in the root README;
contributor setup and pull-request expectations are in
[CONTRIBUTING.md](../CONTRIBUTING.md).

## Commits and changelog

- Use a short English imperative subject describing the result, for example
  `Fix mother ownership in Quick Log` or `Document backup restore limits`.
  Conventional Commit prefixes are not required by the current repository.
- Group one coherent behavior change and its tests/documentation in a commit.
  Combine tightly coupled fixes instead of layering temporary patches. Keep
  unrelated work separate and never stage unrelated local files.
- Reference relevant issues in the body. Use `Closes #N` only when merge-time
  closure is intended and the full issue is satisfied. If closure depends on a
  successful publication, link the issue without auto-closing and close it
  after the release succeeds.
- Maintain [CHANGELOG.md](../CHANGELOG.md) under Unreleased, using Added,
  Changed, Fixed, Deprecated, Removed and Security as applicable. Prefer useful
  summaries to one entry per commit. State breaking changes, migration steps
  and security impact explicitly; omit empty sections from released entries.
- The release action reads the matching version section of the curated
  changelog. GitHub-generated notes are a fallback when that section is empty;
  publication does not need an AI-generated summary or a second notes-edit step.

## Version policy

Use `MAJOR.MINOR.PATCH` versions and a lowercase `v` tag. Before 1.0, use a minor
bump for a breaking workflow/interface/storage change or a substantial feature
milestone; patch releases cover compatible fixes, small improvements and
documentation-only updates. Always call out breaking changes explicitly.
After 1.0, preserve the compatibility-sensitive identifiers and data contracts
described in [Architecture](ARCHITECTURE.md#pre-10-rule).

Two version fields must be identical:

- `custom_components/puppy_tracker/manifest.json`: `version`
- `custom_components/puppy_tracker/const.py`: `VERSION`

`frontend.py` derives the frontend cache version from `VERSION`. Do not update
only the manifest or add a second independent frontend version.

## Prepare and publish

1. Fetch the remote history/tags, inspect HEAD and the working tree, and ensure
   the intended release is based on the reviewed current `main`. Do not assume
   an earlier described patch exists. Inspect the diff against the previous
   release, including migrations and compatibility notes.
2. Choose an unused version. Move the applicable Unreleased entries to a dated
   release heading in the changelog and update its comparison links. Keep an
   Unreleased section for future work. Update both version fields. A
   documentation-only release still needs a version bump for HACS.
3. Use the configured local environment and run checks appropriate to the
   implementation. `npm run test:all` checks Python compilation, pytest,
   JavaScript syntax and the full browser matrix. Reuse already completed local
   checks when the tested code has not changed; a version-only commit does not
   require repeating the same local browser tests. Record any limits. Remote CI
   still runs every required check for the exact release commit, once. Do not
   dismiss unexplained failures or disable checks to make a release pass.
4. When relevant, verify real-device workflows, HACS upgrade, browser-cache
   refresh, notifications and restart behavior. Record what was actually
   checked; automated WebKit is not a real iPhone/Companion App test.
5. Commit the reviewed files explicitly, then commit any separate version-only
   change as `Release v<version>`. Create an annotated `v<version>` tag on that
   exact commit, then push `main` and the tag atomically without force.

For example, after preparing and committing a future `X.Y.Z` release:

```sh
git tag -a vX.Y.Z -m "Release vX.Y.Z"
git push --atomic origin main vX.Y.Z
node scripts/release-status.mjs vX.Y.Z
```

Substitute the real version; do not reuse an existing tag. The normal trigger
is the tag push. The action also supports a `release/v<version>` branch whose
suffix must match the manifest. These are alternative triggers, not two steps
to execute for one release. A manual publish retry for an existing tag is also
available with `gh workflow run release.yml -f tag=vX.Y.Z`.

## One validation run, automatic publication

The [CI workflow](../.github/workflows/ci.yml) validates pushes to `main` and
`release/v*`, pull requests and manual dispatches. It owns backend, metadata,
JavaScript syntax, HACS, Hassfest and all browser checks. Browser tests are split
across four jobs using the preinstalled Playwright container and one worker per
job. The test set and project/viewport coverage are unchanged. File-level
sharding preserves existing test-file execution order and isolation.

The [release workflow](../.github/workflows/release.yml) does not repeat those
tests. `scripts/release-gate.cjs` requires a successful trusted CI run for the
same full commit SHA, validates the tag/version and publishes. If CI is still
running, the gate exits immediately with `pending`. A GitHub `workflow_run`
event resumes publication when CI completes; no waiting job or agent polling
loop is needed. If the tag has no CI run yet, the gate dispatches CI. Same-SHA
CI concurrency prevents duplicate validations from running together, while
different commit SHAs do not cancel a pending release's validation.

PR/fork results do not authorize publication. The privileged gate runs code
from the trusted default branch, reads release metadata through the API and
does not execute code or download artifacts from the completed run. Existing
published releases are left unchanged. The initial workflow update must be on
the default branch before using this publication flow.

## Verify publication and failures

Use one compact, read-only status snapshot. A pushed tag is not a published
release. GitHub Actions itself consumes no language-model tokens; avoiding
repeated agent calls, full log dumps and regenerated release notes reduces
agent usage. Four shards reduce elapsed browser-test time, not the amount of
coverage; actual runtime depends on runners and test-file distribution.

```sh
node scripts/release-status.mjs vX.Y.Z
node scripts/release-status.mjs vX.Y.Z --errors
```

The second command includes at most 30 relevant failure lines/6,000 characters.
Neither command waits or polls. Stop after reporting `pending` and the workflow
URL unless the user explicitly asks to monitor completion. Never announce a
pending tag as a published release.

- When publication is complete, verify the published release is not
  a draft or prerelease and its tag resolves to that exact commit.
- Check the release summary, changelog comparison, migration instructions and
  version metadata. Only then announce the release and close fully completed
  issues with commit/release and test evidence. Keep partial features open.
- If validation fails, inspect the failed step and diagnostics first. Re-run
  only when the same commit failed for an understood transient infrastructure
  reason. Retry the failed CI jobs (`gh run rerun <ci-run-id> --failed`), not the
  whole test suite or a second release-validation run. CI completion resumes
  publication automatically. A product/test correction requires a new commit and unused patch
  version; keep failed release refs as evidence, rather than silently moving
  a tag. Never force-move or overwrite a published release tag.
- If publishing alone fails after all gates pass, confirm whether the release
  was already created before retrying the failed job. Do not bypass gates by
  manually publishing an unchecked release. Use the manual publish retry above
  after checking the existing release status; matching successful CI is reused.

This procedure does not replace the scoped [security/privacy review](SECURITY_PRIVACY.md),
[storage migration contract](storage-migrations.md) or
[iOS/iPadOS release checklist](ios-ipados-release-checklist.md).
