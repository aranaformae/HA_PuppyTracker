import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const requirements = join(root, "requirements_ha_runtime.txt");
const version = readFileSync(requirements, "utf8").match(/^homeassistant==([\d.]+)$/m)?.[1];
if (!version) throw new Error("Missing pinned Home Assistant runtime version");
const environment = join(homedir(), ".cache", "puppy-tracker", "venvs", `ha-${version}`);
const executable = process.platform === "win32" ? ["Scripts", "python.exe"] : ["bin", "python"];
const python = process.env.PUPPY_TRACKER_RUNTIME_PYTHON || join(environment, ...executable);
const env = { ...process.env, PYTHONPYCACHEPREFIX: join(homedir(), ".cache", "puppy-tracker", "pycache") };

function run(command, args, timeout) {
  const result = spawnSync(command, args, { cwd: root, env, stdio: "inherit", timeout });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (process.argv.includes("--setup")) {
  if (!existsSync(python)) {
    const local = join(root, ".venv", ...executable);
    run(existsSync(local) ? local : (process.platform === "win32" ? "python" : "python3"),
      ["-m", "venv", environment], 60_000);
  }
  run(python, ["-m", "pip", "install", "--disable-pip-version-check", "-r", requirements], 600_000);
}
if (!existsSync(python)) {
  console.error("Run npm run test:ha-runtime -- --setup to create the isolated runtime outside the project folder.");
  process.exit(1);
}
run(python, ["scripts/check-ha-runtime.py", "--expect-version", version], 180_000);
