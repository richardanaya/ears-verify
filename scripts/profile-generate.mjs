#!/usr/bin/env node
// Rebuild an instrumented binary, lint gen-10..gen-50 and the examples, merge profiles.
// Linux only. Writes bench/plan-verify.profdata for npm run build:release.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

if (process.platform !== "linux") {
  console.error("profile generation is Linux-only");
  process.exit(1);
}

// ScriptC 0.4.2 instruments profile version 10. Ubuntu's default Clang 18
// runtime is version 9 and writes empty profiles. Prefer Clang 19+ when present.
function clangPath() {
  const ver = spawnSync("clang", ["--version"], { encoding: "utf8" });
  const text = String(ver.stdout || "") + String(ver.stderr || "");
  const match = /clang version (\d+)/.exec(text);
  const major = match === null ? 0 : Number(match[1]);
  if (major >= 19) return process.env.PATH || "";
  if (!existsSync("/usr/bin/clang-19")) {
    console.error("profile generation needs Clang 19 or newer so the profile runtime matches ScriptC");
    process.exit(1);
  }
  const shim = join(tmpdir(), "plan-verify-clang19");
  mkdirSync(shim, { recursive: true });
  const clangLink = join(shim, "clang");
  const clangxxLink = join(shim, "clang++");
  rmSync(clangLink, { force: true });
  rmSync(clangxxLink, { force: true });
  symlinkSync("/usr/bin/clang-19", clangLink);
  if (existsSync("/usr/bin/clang++-19")) symlinkSync("/usr/bin/clang++-19", clangxxLink);
  console.error("using Clang 19 for the instrumented link");
  return shim + ":" + (process.env.PATH || "");
}

const env = Object.assign({}, process.env, { PATH: clangPath() });

const scriptc = "node_modules/.bin/scriptc";
const rawDir = "bench/profraw";
const pattern = rawDir + "/%p.profraw";
const out = "bench/plan-verify.profdata";

rmSync(rawDir, { recursive: true, force: true });
mkdirSync(rawDir, { recursive: true });
mkdirSync("build", { recursive: true });

const built = spawnSync(
  scriptc,
  ["build", "src/main.ts", "-o", "build/plan-verify", "--optimization=speed", "--profile-generate=" + pattern],
  { stdio: "inherit", env: env },
);
if (built.status !== 0) process.exit(built.status === null ? 1 : built.status);

const specs = [
  "bench/specs/gen-10.ears.md",
  "bench/specs/gen-15.ears.md",
  "bench/specs/gen-20.ears.md",
  "bench/specs/gen-25.ears.md",
  "bench/specs/gen-50.ears.md",
];

function collectEars(dir, found) {
  const names = readdirSync(dir, { withFileTypes: true });
  for (let i = 0; i < names.length; i++) {
    const entry = names[i];
    const path = join(dir, entry.name);
    if (entry.isDirectory()) collectEars(path, found);
    else if (entry.name.endsWith(".ears.md")) found.push(path);
  }
}

const examples = [];
collectEars("examples", examples);
const files = specs.concat(examples);

for (let i = 0; i < files.length; i++) {
  const file = files[i];
  const run = spawnSync("./build/plan-verify", ["lint", file], { stdio: "ignore" });
  const status = run.status === null ? -1 : run.status;
  if (status < 0) {
    console.error("lint crashed " + file);
    process.exit(1);
  }
  console.log("profiled " + file + " exit " + String(status));
}

const raws = readdirSync(rawDir)
  .filter(function (name) {
    return name.endsWith(".profraw");
  })
  .map(function (name) {
    return join(rawDir, name);
  });
if (raws.length === 0) {
  console.error("no raw profiles in " + rawDir);
  process.exit(1);
}

const merged = spawnSync(scriptc, ["merge-profiles", "-o", out].concat(raws), { stdio: "inherit", env: env });
if (merged.status !== 0) process.exit(merged.status === null ? 1 : merged.status);
console.log("wrote " + out);
