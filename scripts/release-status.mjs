// One compact, read-only status snapshot. Deliberately no watch/poll loop.
import { spawnSync } from "node:child_process";
import { failedRun } from "./release-gate.cjs";

const [tag, option] = process.argv.slice(2);
if (!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(tag || "") || option && option !== "--errors") {
  process.stderr.write("Usage: node scripts/release-status.mjs vX.Y.Z [--errors]\n");
  process.exit(2);
}
function command(binary, args, optional = false) {
  const result = spawnSync(binary, args, { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  if (result.status !== 0) {
    if (optional) return null;
    throw Error((result.stderr || result.error?.message || "Status unavailable").trim().split("\n")[0]);
  }
  return result.stdout;
}
try {
  const release = command("gh", ["release", "view", tag, "--json", "url,isDraft"], true);
  if (release && !JSON.parse(release).isDraft) {
    process.stdout.write(JSON.stringify({ status: "published", tag, url: JSON.parse(release).url }) + "\n");
  } else {
    const sha = command("git", ["rev-parse", "--verify", `${tag}^{commit}`]).trim();
    const columns = "databaseId,displayTitle,event,headSha,status,conclusion,url,startedAt";
    const ci = JSON.parse(command("gh", ["run", "list", "--workflow", "ci.yml", "--commit", sha, "--limit", "20", "--json", columns]))
      .filter(run => ["push", "workflow_dispatch"].includes(run.event))
      .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt) || b.databaseId - a.databaseId)[0];
    const publishing = JSON.parse(command("gh", ["run", "list", "--workflow", "release.yml", "--limit", "20", "--json", columns]))
      .find(run => run.displayTitle === `Release ${tag}` || run.displayTitle === `Release ${sha}` || run.headSha === sha);
    const failed = failedRun(ci, publishing);
    const result = { status: failed ? "failed" : "pending", tag, sha,
      ...(ci ? { ci_url: ci.url, ci_status: ci.status, ci_conclusion: ci.conclusion } : {}),
      ...(publishing ? { release_workflow_url: publishing.url } : {}) };
    if (failed && option === "--errors") {
      const logs = command("gh", ["run", "view", String(failed.databaseId), "--log-failed"], true) || "";
      result.errors = logs.split("\n").filter(line => /error|failed|expected|received|timeout/i.test(line)).slice(-30).join("\n").slice(-6000);
    }
    process.stdout.write(JSON.stringify(result) + "\n");
    if (failed) process.exitCode = 1;
  }
} catch (error) {
  process.stdout.write(JSON.stringify({ status: "unknown", tag, error: error.message }) + "\n");
  process.exitCode = 2;
}
