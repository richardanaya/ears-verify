#!/usr/bin/env node
// Release native build: speed, strip, and on Linux a committed profile.
// PGO (--profile-use) is Linux-only. Other platforms get a plain speed build.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const scriptc = "node_modules/.bin/scriptc";
const profile = "bench/plan-verify.profdata";
const args = [
  "build",
  "src/main.ts",
  "-o",
  "build/plan-verify",
  "--optimization=speed",
  "--strip",
];

if (process.platform === "linux") {
  if (!existsSync(profile)) {
    console.error("missing " + profile + "; run npm run profile");
    process.exit(1);
  }
  args.push("--profile-use=" + profile);
} else {
  console.error("PGO is Linux-only; building with --optimization=speed --strip");
}

const result = spawnSync(scriptc, args, { stdio: "inherit" });
process.exit(result.status === null ? 1 : result.status);
