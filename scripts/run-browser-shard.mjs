import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function runBrowserShard(projects, shard, run = spawnSync) {
  const match = /^(\d+)\/(\d+)$/.exec(shard || "");
  if (!match || +match[1] < 1 || +match[1] > +match[2]) throw new Error("Use a shard such as 1/4");
  const names = projects.map((project) => project.name);
  if (!names.length || new Set(names).size !== names.length || names.some((name) => !/^[\w-]+$/.test(name || ""))) {
    throw new Error("Every browser project needs a unique name for isolated reports");
  }
  let failed = false;
  for (const name of names) {
    console.log(`Browser profile ${name}, shard ${shard}`);
    const result = run(process.platform === "win32" ? "npm.cmd" : "npm", [
      "run", "test:e2e", "--", `--project=${name}`, `--shard=${shard}`,
      `--output=${join(root, "test-results", name)}`,
    ], {
      cwd: root,
      stdio: "inherit",
      env: { ...process.env, PLAYWRIGHT_HTML_OUTPUT_DIR: join(root, "playwright-report", name) },
    });
    if (result.error || result.status !== 0) {
      console.error(`Browser profile ${name} failed${result.error ? `: ${result.error.message}` : ""}`);
      failed = true;
    }
  }
  return failed ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // Resolve the actual config instead of maintaining a second project list in CI.
  const { default: config } = await import("../playwright.config.mjs");
  process.exitCode = runBrowserShard(config.projects || [], process.argv[2]);
}
