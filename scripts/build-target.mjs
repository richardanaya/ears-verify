#!/usr/bin/env node
// Release build for one CI target. Speed and strip everywhere.
// The committed profile is Linux x64 only (glibc and musl).
// Cross targets need zig on PATH (SCRIPTC_CC=zigcc) and the matching
// @scriptc/runtime-*@0.4.2 package installed in this project.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";

const name = process.argv[2] || "";

const targets = {
  "linux-x64-gnu": {
    out: "build/plan-verify",
    pgo: true,
    env: {},
  },
  "linux-x64-musl": {
    out: "build/plan-verify",
    pgo: true,
    env: {
      SCRIPTC_CC: "zigcc",
      SCRIPTC_TARGET: "x86_64-linux-musl",
    },
  },
  "linux-arm64-gnu": {
    out: "build/plan-verify",
    pgo: false,
    env: {
      SCRIPTC_CC: "zigcc",
      SCRIPTC_TARGET: "aarch64-linux-gnu.2.36",
    },
  },
  "macos-arm64": {
    out: "build/plan-verify",
    pgo: false,
    env: {},
  },
  "macos-x64": {
    out: "build/plan-verify",
    pgo: false,
    env: {},
  },
  "x86_64-windows-gnu": {
    out: "build/plan-verify.exe",
    pgo: false,
    env: {
      SCRIPTC_CC: "zigcc",
      SCRIPTC_TARGET: "x86_64-windows-gnu",
    },
  },
};

const spec = targets[name];
if (spec === undefined) {
  console.error("usage: node scripts/build-target.mjs <" + Object.keys(targets).join("|") + ">");
  process.exit(1);
}

const scriptc = "node_modules/scriptc/bin/scriptc.exe";
const profile = "bench/plan-verify.profdata";
const args = ["build", "src/main.ts", "-o", spec.out, "--optimization=speed", "--strip"];

if (spec.pgo) {
  if (!existsSync(profile)) {
    console.error("missing " + profile);
    process.exit(1);
  }
  args.push("--profile-use=" + profile);
}

mkdirSync("build", { recursive: true });
const env = Object.assign({}, process.env, spec.env);
const result = spawnSync(scriptc, args, { stdio: "inherit", env: env });
if (result.status !== 0) process.exit(result.status === null ? 1 : result.status);
if (!existsSync(spec.out)) {
  console.error("missing " + spec.out);
  process.exit(1);
}
console.log(spec.out);
