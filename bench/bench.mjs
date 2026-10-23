#!/usr/bin/env node
// Wall-clock timings for plan-verify lint. One run each. No hyperfine.
// Usage: node bench/bench.mjs
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const nodeCmd = process.execPath;
const nodeArgs = ["--experimental-strip-types", "src/main.ts"];
const nativeCmd = "build/plan-verify";
const releaseCmd = "build/plan-verify-release";
const haveNative = existsSync(nativeCmd);
const haveRelease = existsSync(releaseCmd);

const cases = [
  ["help", ["help"]],
  ["lint-conflict", ["lint", "examples/order-conflict.ears.md"]],
  ["lint-plan", ["lint", "examples/plan-to-problems/generated.ears.md"]],
  ["lint-10", ["lint", "bench/specs/gen-10.ears.md"]],
  ["lint-15", ["lint", "bench/specs/gen-15.ears.md"]],
  ["lint-20", ["lint", "bench/specs/gen-20.ears.md"]],
  ["lint-25", ["lint", "bench/specs/gen-25.ears.md"]],
  ["lint-50", ["lint", "bench/specs/gen-50.ears.md"]],
  ["lint-100", ["lint", "bench/specs/gen-100.ears.md"]],
];

function timeRun(command, args) {
  const start = process.hrtime.bigint();
  const result = spawnSync(command, args, { encoding: "utf8" });
  const end = process.hrtime.bigint();
  const ms = Number(end - start) / 1e6;
  const status = result.status === null ? -1 : result.status;
  return { ms: ms, status: status };
}

function cell(row) {
  return row.ms.toFixed(1) + " ms  exit " + String(row.status);
}

console.log("plan-verify bench");
console.log("node " + process.version);
if (haveNative) console.log("native " + nativeCmd);
else console.log("native binary missing; run npm run build");
if (haveRelease) console.log("release " + releaseCmd);
console.log("");
let header = "workload".padEnd(16) + "node";
if (haveNative) header += " ".repeat(22) + "native";
if (haveRelease) header += " ".repeat(22) + "release";
console.log(header);

for (let i = 0; i < cases.length; i++) {
  const name = cases[i][0];
  const args = cases[i][1];
  const nodeRow = timeRun(nodeCmd, nodeArgs.concat(args));
  let line = name.padEnd(16) + cell(nodeRow).padEnd(28);
  if (haveNative) {
    const nativeRow = timeRun(nativeCmd, args);
    line += cell(nativeRow).padEnd(28);
  }
  if (haveRelease) {
    const releaseRow = timeRun(releaseCmd, args);
    line += cell(releaseRow);
  }
  console.log(line);
}
