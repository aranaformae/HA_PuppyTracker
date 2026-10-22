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
- The GitHub release action also generates a summary from commit subjects and
  a comparison link. This is separate from the curated changelog, not an
  automatic reader of it. `Release v...` version-only subjects are omitted.

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
3. Run `npm run test:all` in the configured local environment. It checks Python
   compilation, pytest, JavaScript syntax and the complete Playwright matrix.
   For documentation-only changes, verify links, YAML/issue-form structure and
   metadata and run local pytest; record that local browser tests were not
   rerun. The remote release gate still runs the full browser suite. Do not
   dismiss unexplained failures or disable checks to make a release pass.
4. When relevant, verify real-device workflows, HACS upgrade, browser-cache
   refresh, notifications and restart behavior. Record what was actually
   checked; automated WebKit is not a real iPhone/Companion App test.
5. Commit the reviewed files explicitly, then commit any separate version-only
   change as `Release v<version>`. Push the release commit to `main` without
   force. Create an annotated `v<version>` tag on that exact commit and push it.

For example, after preparing and committing a future `X.Y.Z` release:

```sh
git push origin main
git tag -a vX.Y.Z -m "Release vX.Y.Z"
git push origin vX.Y.Z
```

Substitute the real version; do not reuse an existing tag. The normal trigger
is the tag push. The action also supports a `release/v<version>` branch whose
suffix must match the manifest. These are alternative triggers, not two steps
to execute for one release. There is no manual-dispatch trigger.

## Verify publication and failures

The [release workflow](../.github/workflows/release.yml) publishes only after
backend tests, metadata/ref checks, JavaScript syntax, HACS, Hassfest and browser
E2E have succeeded. The [main CI workflow](../.github/workflows/ci.yml) runs
separately. A pushed tag is not a published release.

- Check both runs on the intended commit. Verify the published release is not
  a draft or prerelease and its tag resolves to that exact commit.
- Check the release summary, changelog comparison, migration instructions and
  version metadata. Only then announce the release and close fully completed
  issues with commit/release and test evidence. Keep partial features open.
- If validation fails, inspect the failed step and diagnostics first. Re-run
  only when the same commit failed for an understood transient infrastructure
  reason. A product/test correction requires a new commit and unused patch
  version; keep failed release refs as evidence, rather than silently moving
  a tag. Never force-move or overwrite a published release tag.
- If publishing alone fails after all gates pass, confirm whether the release
  was already created before retrying the failed job. Do not bypass gates by
  manually publishing an unchecked release.

This procedure does not replace the scoped [security/privacy review](SECURITY_PRIVACY.md),
[storage migration contract](storage-migrations.md) or
[iOS/iPadOS release checklist](ios-ipados-release-checklist.md).
