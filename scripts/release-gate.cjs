"use strict";

const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const SHA = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;

async function optional(request) {
  try { return await request(); } catch (error) { if (error.status === 404) return null; throw error; }
}

async function tagCommit(github, repo, tag) {
  const result = await optional(() => github.rest.git.getRef({ ...repo, ref: `tags/${tag}` }));
  if (!result) return null;
  let object = result.data.object;
  for (let depth = 0; object.type === "tag" && depth < 5; depth++) {
    object = (await github.rest.git.getTag({ ...repo, tag_sha: object.sha })).data.object;
  }
  if (object.type !== "commit" || !SHA.test(object.sha)) throw Error("Release tag must resolve to a commit");
  return object.sha;
}

async function fileAt(github, repo, path, ref) {
  const result = await github.rest.repos.getContent({ ...repo, path, ref });
  if (result.data.encoding !== "base64" || typeof result.data.content !== "string") throw Error(`Cannot read ${path}`);
  return Buffer.from(result.data.content, "base64").toString("utf8");
}

function trustedRun(run, repository, sha) {
  return ["push", "workflow_dispatch"].includes(run.event) && run.head_sha === sha
    && run.head_repository?.full_name?.toLowerCase() === repository.toLowerCase();
}

function releaseNotes(changelog, version) {
  const lines = changelog.split(/\r?\n/);
  const start = lines.findIndex(line => line.startsWith(`## [${version}]`));
  if (start < 0) return "";
  const end = lines.findIndex((line, index) => index > start && line.startsWith("## ["));
  return lines.slice(start + 1, end < 0 ? undefined : end).join("\n").trim();
}

function failedRun(ci, publishing) {
  const failed = run => run?.status === "completed" && !["success", "skipped"].includes(run.conclusion);
  if (failed(ci)) return ci;
  if (ci && ci.status !== "completed") return undefined;
  if (failed(publishing) && (!ci || Date.parse(publishing.startedAt) >= Date.parse(ci.startedAt))) return publishing;
  return undefined;
}

async function publishRelease({ github, context, core, manualTag = "" }) {
  const repo = context.repo, repository = `${repo.owner}/${repo.repo}`;
  const source = context.payload.workflow_run;
  const finish = async (status, details = {}) => {
    const result = { status, ...details };
    core.setOutput("status", status);
    core.info(JSON.stringify(result));
    await core.summary.addHeading("Release status").addRaw(
      `**${status}**${details.tag ? ` · ${details.tag}` : ""}\n\n${details.message || ""}\n\n${details.release_url || details.ci_url || ""}\n`,
    ).write();
    return result;
  };
  // Privileged workflow_run events must never publish PR/fork results.
  if (context.eventName === "workflow_run" && (!source || !trustedRun(source, repository, source.head_sha))) return finish("ignored");
  if (context.eventName === "push" && context.payload.deleted) return finish("ignored");

  let tag, sha, branch = "", needsExistingTag = false;
  if (context.eventName === "workflow_dispatch") {
    tag = manualTag; needsExistingTag = true;
  } else if (context.eventName === "push" && context.ref.startsWith("refs/tags/")) {
    tag = context.ref.slice("refs/tags/".length); needsExistingTag = true;
  } else if (context.eventName === "push" && context.ref.startsWith("refs/heads/release/v")) {
    branch = context.ref.slice("refs/heads/".length);
    tag = branch.slice("release/".length); sha = context.payload.after;
  } else if (context.eventName === "workflow_run") {
    sha = source.head_sha;
  } else return finish("ignored");
  if (tag && (!tag.startsWith("v") || !VERSION.test(tag.slice(1)))) throw Error("Invalid version tag");
  if (needsExistingTag) {
    sha = await tagCommit(github, repo, tag);
    if (!sha) throw Error("Release tag does not exist");
  }
  if (!SHA.test(sha || "")) throw Error("Invalid release commit");
  const manifest = JSON.parse(await fileAt(github, repo, "custom_components/puppy_tracker/manifest.json", sha));
  const version = manifest.version;
  if (manifest.domain !== "puppy_tracker" || manifest.name !== "Puppy Tracker" || typeof version !== "string" || !VERSION.test(version)) throw Error("Invalid release metadata");
  const expectedTag = `v${version}`;
  if (tag && tag !== expectedTag) throw Error("Release ref does not match manifest version");
  tag = expectedTag;
  const currentTag = await tagCommit(github, repo, tag);
  if (context.eventName === "workflow_run") {
    if (currentTag !== sha) {
      const requestedBranch = `release/${tag}`;
      const request = await optional(() => github.rest.git.getRef({ ...repo, ref: `heads/${requestedBranch}` }));
      if (request?.data.object.sha !== sha) return finish(source.head_branch === requestedBranch ? "superseded" : "not_requested");
      branch = requestedBranch;
    }
  }
  if (currentTag && currentTag !== sha) throw Error("Existing release tag points at a different commit; use a new version");
  if (branch) {
    const head = await optional(() => github.rest.git.getRef({ ...repo, ref: `heads/${branch}` }));
    if (head?.data.object.sha !== sha) return finish("superseded", { tag, sha });
  }
  const constants = await fileAt(github, repo, "custom_components/puppy_tracker/const.py", sha);
  if (constants.match(/^VERSION = "([^"]+)"$/m)?.[1] !== version) throw Error("Version mismatch between manifest and const.py");
  const existing = await optional(() => github.rest.repos.getReleaseByTag({ ...repo, tag }));
  if (existing && !existing.data.draft) return finish("published", { tag, sha, release_url: existing.data.html_url });

  const runs = (await github.paginate(github.rest.actions.listWorkflowRuns, {
    ...repo, workflow_id: "ci.yml", head_sha: sha, per_page: 100,
  })).map(run => {
    // A completion webhook can be fresher than cached REST data after a rerun.
    if (context.eventName === "workflow_run" && source?.id === run.id && (source.run_attempt || 1) >= (run.run_attempt || 1)) return { ...run, ...source };
    return run;
  }).filter(run => trustedRun(run, repository, sha)).sort((a, b) =>
    Date.parse(b.run_started_at || b.created_at) - Date.parse(a.run_started_at || a.created_at) || b.id - a.id,
  );
  const run = runs[0];
  if (!run) {
    // A simultaneous branch push and dispatch share a SHA concurrency group in CI.
    await github.rest.actions.createWorkflowDispatch({ ...repo, workflow_id: "ci.yml", ref: branch || tag });
    return finish("pending", { tag, sha, message: "CI requested. Publication resumes automatically after CI completes." });
  }
  if (run.status !== "completed") return finish("pending", { tag, sha, ci_url: run.html_url, message: "CI is running. Publication resumes automatically; no polling is needed." });
  if (run.conclusion !== "success") throw Error(`CI for ${sha} did not pass (${run.conclusion}): ${run.html_url}`);

  const latestTag = await tagCommit(github, repo, tag);
  if (latestTag !== currentTag) throw Error("Release tag changed during validation");
  let body = releaseNotes(await fileAt(github, repo, "CHANGELOG.md", sha), version);
  if (!body) body = (await github.rest.repos.generateReleaseNotes({ ...repo, tag_name: tag, target_commitish: sha })).data.body;
  const args = { ...repo, tag_name: tag, target_commitish: sha, name: tag, body, draft: false, prerelease: version.includes("-") };
  let published;
  try {
    published = existing
      ? await github.rest.repos.updateRelease({ ...args, release_id: existing.data.id })
      : await github.rest.repos.createRelease(args);
  } catch (error) {
    if (error.status !== 422) throw error;
    // Two near-simultaneous tag/CI-completion events can race. Never overwrite.
    published = await github.rest.repos.getReleaseByTag({ ...repo, tag });
    if (published.data.draft || await tagCommit(github, repo, tag) !== sha) throw error;
  }
  return finish("published", { tag, sha, ci_url: run.html_url, release_url: published.data.html_url });
}

module.exports = { publishRelease, releaseNotes, trustedRun, failedRun };
