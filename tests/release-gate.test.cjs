const assert = require("node:assert/strict");
const { test } = require("node:test");
const { publishRelease, releaseNotes, failedRun } = require("../scripts/release-gate.cjs");

const SHA = "a".repeat(40), OTHER = "b".repeat(40), TAG = "v0.32.4";
const notFound = () => Object.assign(Error("Not found"), { status: 404 });
const run = (changes = {}) => ({ id: 10, event: "push", head_sha: SHA, head_repository: { full_name: "example/puppy" },
  head_branch: "main", status: "completed", conclusion: "success", created_at: "2026-10-25T12:00:00Z", html_url: "https://github.com/example/puppy/actions/runs/10", ...changes });

function fixture() {
  const state = { runs: [run()], calls: [], refs: { [`tags/${TAG}`]: { type: "commit", sha: SHA } },
    files: { "custom_components/puppy_tracker/manifest.json": JSON.stringify({ domain: "puppy_tracker", name: "Puppy Tracker", version: "0.32.4" }),
      "custom_components/puppy_tracker/const.py": 'VERSION = "0.32.4"\n',
      "CHANGELOG.md": "## [Unreleased]\n\n## [0.32.4] - 2026-10-25\n\n### Fixed\n\n- A useful change.\n\n## [0.32.3]\n- Old change.\n" }, release: null };
  const method = (name, fn) => async args => { state.calls.push([name, args]); return { data: await fn(args) }; };
  const github = { rest: {
    git: {
      getRef: method("getRef", ({ ref }) => { if (!state.refs[ref]) throw notFound(); return { object: state.refs[ref] }; }),
      getTag: method("getTag", () => ({ object: { type: "commit", sha: SHA } })),
    },
    repos: {
      getContent: method("getContent", ({ path, ref }) => { assert.equal(ref, SHA); return { encoding: "base64", content: Buffer.from(state.files[path]).toString("base64") }; }),
      getReleaseByTag: method("getReleaseByTag", () => { if (!state.release) throw notFound(); return state.release; }),
      generateReleaseNotes: method("generateReleaseNotes", () => ({ body: "Generated fallback" })),
      createRelease: method("createRelease", args => state.release = { ...args, html_url: "https://github.com/example/puppy/releases/tag/" + TAG }),
      updateRelease: method("updateRelease", args => state.release = { ...args, html_url: "https://github.com/example/puppy/releases/tag/" + TAG }),
    },
    actions: { listWorkflowRuns() {}, createWorkflowDispatch: method("dispatchCI", () => ({})) },
  }, paginate: async (_method, args) => { state.calls.push(["listCI", args]); assert.equal(args.head_sha, SHA); assert.equal(args.workflow_id, "ci.yml"); return state.runs; } };
  const context = { repo: { owner: "example", repo: "puppy" }, eventName: "push", ref: `refs/tags/${TAG}`, payload: { after: SHA } };
  const core = { setOutput() {}, info() {}, summary: { addHeading() { return this; }, addRaw() { return this; }, async write() {} } };
  return { state, github, context, core };
}

test("publish reuses successful exact-commit CI and curated notes", async () => {
  const f = fixture(), result = await publishRelease(f);
  assert.equal(result.status, "published");
  assert.equal(f.state.release.target_commitish, SHA);
  assert.equal(f.state.release.body, "### Fixed\n\n- A useful change.");
  assert.equal(f.state.calls.filter(([name]) => name === "createRelease").length, 1);
  assert.equal(f.state.calls.filter(([name]) => name === "dispatchCI").length, 0);
});

test("pending CI returns immediately; CI completion publishes without polling", async () => {
  const f = fixture();
  f.state.runs = [run({ status: "in_progress", conclusion: null })];
  assert.equal((await publishRelease(f)).status, "pending");
  assert.equal(f.state.release, null);
  f.state.runs = [run()]; f.context.eventName = "workflow_run"; f.context.payload.workflow_run = run();
  assert.equal((await publishRelease(f)).status, "published");
});

test("missing CI starts one dispatch; publication still waits for it", async () => {
  const f = fixture(); f.state.runs = [];
  assert.equal((await publishRelease(f)).status, "pending");
  assert.equal(f.state.calls.find(([name]) => name === "dispatchCI")[1].ref, TAG);
  assert.equal(f.state.release, null);
});

for (const conclusion of ["failure", "cancelled", "timed_out", "skipped"]) test(`${conclusion} CI blocks publication`, async () => {
  const f = fixture(); f.state.runs = [run({ conclusion })];
  await assert.rejects(publishRelease(f), /did not pass/);
  assert.equal(f.state.release, null);
});

test("a newer failed run is not hidden by an older successful run", async () => {
  const f = fixture(); f.state.runs.push(run({ id: 11, conclusion: "failure", created_at: "2026-10-25T13:00:00Z" }));
  await assert.rejects(publishRelease(f), /did not pass/);
});

test("successful CI from another commit cannot authorize publication", async () => {
  const f = fixture(); f.state.runs = [run({ head_sha: OTHER })];
  assert.equal((await publishRelease(f)).status, "pending");
  assert.equal(f.state.release, null);
});

for (const changes of [{ event: "pull_request" }, { head_repository: { full_name: "fork/puppy" } }]) test("PR/fork workflow completion is ignored before privileged API calls", async () => {
  const f = fixture(); f.context.eventName = "workflow_run"; f.context.payload.workflow_run = run(changes);
  assert.equal((await publishRelease(f)).status, "ignored");
  assert.deepEqual(f.state.calls, []);
});

test("ordinary CI completion without a matching release request publishes nothing", async () => {
  const f = fixture(); f.context.eventName = "workflow_run"; f.context.payload.workflow_run = run();
  f.state.refs[`tags/${TAG}`].sha = OTHER;
  assert.equal((await publishRelease(f)).status, "not_requested");
  assert.equal(f.state.release, null);
});

test("release branch supports tag creation only after its exact commit passes", async () => {
  const f = fixture(); delete f.state.refs[`tags/${TAG}`];
  f.context.ref = `refs/heads/release/${TAG}`;
  f.state.refs[`heads/release/${TAG}`] = { type: "commit", sha: SHA };
  assert.equal((await publishRelease(f)).status, "published");
  assert.equal(f.state.release.tag_name, TAG);
});

test("a release branch advanced to another commit cannot publish its stale CI result", async () => {
  const f = fixture(); delete f.state.refs[`tags/${TAG}`];
  f.context.eventName = "workflow_run"; f.context.payload.workflow_run = run({ head_branch: `release/${TAG}` });
  f.state.refs[`heads/release/${TAG}`] = { type: "commit", sha: OTHER };
  assert.equal((await publishRelease(f)).status, "superseded");
});

test("release branch can reuse the same commit's main CI completion", async () => {
  const f = fixture(); delete f.state.refs[`tags/${TAG}`];
  f.context.eventName = "workflow_run"; f.context.payload.workflow_run = run({ head_branch: "main" });
  f.state.refs[`heads/release/${TAG}`] = { type: "commit", sha: SHA };
  assert.equal((await publishRelease(f)).status, "published");
});

test("annotated tags are peeled before matching CI", async () => {
  const f = fixture(); f.state.refs[`tags/${TAG}`] = { type: "tag", sha: "c".repeat(40) };
  assert.equal((await publishRelease(f)).status, "published");
  assert(f.state.calls.some(([name]) => name === "getTag"));
});

test("metadata and ref mismatches cannot publish", async () => {
  const f = fixture(); f.state.files["custom_components/puppy_tracker/const.py"] = 'VERSION = "0.32.3"\n';
  await assert.rejects(publishRelease(f), /Version mismatch/);
  const other = fixture(); other.state.files["custom_components/puppy_tracker/manifest.json"] = JSON.stringify({ domain: "puppy_tracker", name: "Puppy Tracker", version: "0.32.5" });
  await assert.rejects(publishRelease(other), /ref does not match/);
});

test("published releases are idempotent and do not rerun validation", async () => {
  const f = fixture(); f.state.release = { draft: false, html_url: "https://example.invalid/released" };
  assert.equal((await publishRelease(f)).release_url, f.state.release.html_url);
  assert(!f.state.calls.some(([name]) => ["listCI", "createRelease", "updateRelease"].includes(name)));
});

test("an existing draft still requires successful CI before publication", async () => {
  const f = fixture(); f.state.release = { id: 1, draft: true }; f.state.runs = [run({ conclusion: "failure" })];
  await assert.rejects(publishRelease(f), /did not pass/);
  assert.equal(f.state.release.draft, true);
});

test("near-simultaneous publication events do not overwrite the first release", async () => {
  const f = fixture();
  f.github.rest.repos.createRelease = async () => {
    f.state.release = { draft: false, html_url: "https://example.invalid/winner" };
    throw Object.assign(Error("already exists"), { status: 422 });
  };
  assert.equal((await publishRelease(f)).release_url, "https://example.invalid/winner");
});

test("manual retry validates an existing tag", async () => {
  const f = fixture(); f.context.eventName = "workflow_dispatch"; f.manualTag = TAG;
  assert.equal((await publishRelease(f)).status, "published");
  const missing = fixture(); missing.context.eventName = "workflow_dispatch"; missing.manualTag = "v0.99.0";
  await assert.rejects(publishRelease(missing), /tag does not exist/);
});

test("a tag moved during validation cannot be published", async () => {
  const f = fixture(), getRef = f.github.rest.git.getRef;
  let reads = 0;
  f.github.rest.git.getRef = async args => {
    if (++reads === 3) return { data: { object: { type: "commit", sha: OTHER } } };
    return getRef(args);
  };
  await assert.rejects(publishRelease(f), /tag changed during validation/);
  assert.equal(f.state.release, null);
});

test("draft release is published only after checks and a successful rerun can recover failure", async () => {
  const f = fixture(); f.state.release = { id: 1, draft: true }; f.state.runs = [run({ conclusion: "failure" })];
  await assert.rejects(publishRelease(f), /did not pass/);
  f.state.runs = [run({ run_attempt: 2 })];
  assert.equal((await publishRelease(f)).status, "published");
  assert.equal(f.state.release.draft, false);
  assert(f.state.calls.some(([name]) => name === "updateRelease"));
});

test("curated note extraction omits Unreleased and other versions", () => {
  assert.equal(releaseNotes("## [Unreleased]\nFuture\n## [1.0.0] - now\n\n### Added\nUseful\n## [0.9.0]\nOld", "1.0.0"), "### Added\nUseful");
  assert.equal(releaseNotes("## [0.9.0]\nOld", "1.0.0"), "");
});

test("status ignores an old publication failure while CI is being retried", () => {
  const old = { status: "completed", conclusion: "failure", startedAt: "2026-10-25T12:00:00Z" };
  const retry = { status: "in_progress", conclusion: null, startedAt: "2026-10-25T13:00:00Z" };
  assert.equal(failedRun(retry, old), undefined);
  assert.equal(failedRun({ ...retry, status: "completed", conclusion: "success" }, old), undefined);
  const current = { ...old, startedAt: "2026-10-25T14:00:00Z" };
  assert.equal(failedRun({ ...retry, status: "completed", conclusion: "success" }, current), current);
});

test("a successful rerun completion does not wait for stale REST status to refresh", async () => {
  const f = fixture(); f.context.eventName = "workflow_run";
  f.context.payload.workflow_run = run({ run_attempt: 2 });
  f.state.runs = [run({ conclusion: "failure", run_attempt: 1 })];
  assert.equal((await publishRelease(f)).status, "published");
});

test("a successful completion cannot bypass a different newer pending run", async () => {
  const f = fixture(); f.context.eventName = "workflow_run"; f.context.payload.workflow_run = run();
  f.state.runs.push(run({ id: 11, status: "in_progress", conclusion: null, created_at: "2026-10-25T13:00:00Z" }));
  assert.equal((await publishRelease(f)).status, "pending");
  assert.equal(f.state.release, null);
});
