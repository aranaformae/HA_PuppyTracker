import { existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function findJavaScriptFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === ".venv" || entry.name === "node_modules") {
      continue;
    }
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...findJavaScriptFiles(path));
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push(path);
    }
  }
  return files;
}

function run(label, command, args) {
  console.log(`\n==> ${label}`);
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
  });
  if (result.error) {
    console.error(`Could not start ${command}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const virtualenvPython = process.platform === "win32"
  ? join(root, ".venv", "Scripts", "python.exe")
  : join(root, ".venv", "bin", "python");
const pythonCandidates = process.platform === "win32"
  ? [virtualenvPython, "py", "python"]
  : [virtualenvPython, "python3", "python"];
const python = pythonCandidates.find((candidate) =>
  candidate === virtualenvPython ? existsSync(candidate) : true,
);

if (!python) {
  console.error("No Python interpreter found. Create .venv and install requirements_test.txt first.");
  process.exit(1);
}

run("Compile Python sources", python, ["-m", "compileall", "-q", "custom_components/puppy_tracker", "tests"]);
run("Run Python tests", python, ["-m", "pytest", "-v"]);

const javascriptFiles = findJavaScriptFiles(root);
for (const file of javascriptFiles) {
  run(`Check JavaScript syntax: ${file.slice(root.length + 1)}`, "node", ["--check", file]);
}

run("Run Playwright tests", process.platform === "win32" ? "npm.cmd" : "npm", ["run", "test:e2e"]);
console.log("\nAll local checks passed.");
