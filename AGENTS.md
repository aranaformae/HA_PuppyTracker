# Release work

- Inspect Git HEAD and follow `docs/RELEASING.md` for commits and releases.
- CI validates each commit; release publication reuses that exact commit's CI.
- After pushing a release, use `node scripts/release-status.mjs vX.Y.Z` once.
  Report the workflow URL if pending. Do not wait, poll or repeatedly fetch logs
  unless the user explicitly asks to monitor completion.
- For release errors, use the same command with `--errors` for bounded diagnostics.
  Retry only understood transient failures; never bypass CI or move a published tag.
