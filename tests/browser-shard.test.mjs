import assert from "node:assert/strict";
import { test } from "node:test";
import { runBrowserShard } from "../scripts/run-browser-shard.mjs";

const projects = ["chromium", "iphone", "ipad-portrait", "ipad-landscape", "future-project"].map((name) => ({ name }));

test("every configured browser contributes to each shard, with isolated diagnostics", () => {
  const calls = [];
  assert.equal(runBrowserShard(projects, "2/4", (command, args, options) => {
    calls.push({ command, args, options });
    return { status: 0 };
  }), 0);
  assert.deepEqual(calls.map((call) => call.args.find((arg) => arg.startsWith("--project="))), projects.map(({ name }) => `--project=${name}`));
  assert(calls.every((call) => call.args.includes("--shard=2/4")));
  assert.equal(new Set(calls.map((call) => call.options.env.PLAYWRIGHT_HTML_OUTPUT_DIR)).size, projects.length);
  assert.equal(new Set(calls.map((call) => call.args.find((arg) => arg.startsWith("--output=")))).size, projects.length);
});

test("a failed browser fails CI but does not prevent the remaining profiles from running", () => {
  const visited = [];
  const status = runBrowserShard(projects, "1/4", (_command, args) => {
    visited.push(args.find((arg) => arg.startsWith("--project=")));
    return visited.length === 2 ? { status: 1 } : { status: 0 };
  });
  assert.equal(status, 1);
  assert.equal(visited.length, projects.length);
});

test("invalid shards or ambiguous report directories fail before running tests", () => {
  const never = () => { throw Error("Must not execute"); };
  for (const shard of ["0/4", "5/4", "1/0", "invalid"]) {
    assert.throws(() => runBrowserShard(projects, shard, never), /shard/);
  }
  for (const bad of [[], [{ name: "same" }, { name: "same" }], [{}], [{ name: "../outside" }]]) {
    assert.throws(() => runBrowserShard(bad, "1/4", never), /unique name/);
  }
});
