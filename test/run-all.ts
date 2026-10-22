/**
 * Run the typecheck, ScriptC coverage gate, native build, unit tests,
 * and golden CLI tests. Unit tests and each CLI case run once under Node
 * and once as the native binary; stdout, stderr, and exit status must match
 * each other and the checked-in golden files.
 *
 * Write or refresh goldens with: node --experimental-strip-types test/run-all.ts --write-golden
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
}

interface Case {
  name: string;
  args: string[];
}

const WRITE = hasFlag("--write-golden");
let failed = 0;

function hasFlag(flag: string): boolean {
  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i] === flag) return true;
  }
  return false;
}

function run(command: string, args: string[]): RunResult {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.error !== undefined) {
    let stderr = result.stderr;
    if (stderr.length === 0) stderr = result.error.message + "\n";
    return { status: -1, stdout: result.stdout, stderr: stderr };
  }
  let status = -1;
  if (result.status !== null) status = result.status;
  return { status: status, stdout: result.stdout, stderr: result.stderr };
}

function fail(message: string): void {
  console.error("FAIL " + message);
  failed++;
}

function step(title: string, result: RunResult, ok: boolean): void {
  if (ok) {
    console.log("PASS " + title);
    return;
  }
  fail(title);
  if (result.stdout.length > 0) console.error(result.stdout);
  if (result.stderr.length > 0) console.error(result.stderr);
}

function requireCoverage(entry: string): void {
  const result = run("node_modules/.bin/scriptc", ["coverage", entry, "--fail-on=blockers"]);
  const text = result.stdout + result.stderr;
  const ok =
    result.status === 0 &&
    text.indexOf("(100%)") !== -1 &&
    text.indexOf("fully static") !== -1 &&
    text.indexOf("blockers") === -1;
  step("coverage " + entry, result, ok);
  console.log(result.stdout);
}

function requireBuild(entry: string, out: string): void {
  const result = run("node_modules/.bin/scriptc", ["build", entry, "-o", out]);
  step("build " + out, result, result.status === 0);
}

function nodeRun(entry: string, args: string[]): RunResult {
  const full = ["--experimental-strip-types", entry];
  for (let i = 0; i < args.length; i++) full.push(args[i]);
  return run(process.execPath, full);
}

function comparePair(name: string, nodeResult: RunResult, binResult: RunResult): void {
  if (
    nodeResult.status !== binResult.status ||
    nodeResult.stdout !== binResult.stdout ||
    nodeResult.stderr !== binResult.stderr
  ) {
    fail(name + " node/native differ");
    console.error("node status " + String(nodeResult.status));
    console.error("native status " + String(binResult.status));
    console.error("--- node stdout ---\n" + nodeResult.stdout);
    console.error("--- native stdout ---\n" + binResult.stdout);
    console.error("--- node stderr ---\n" + nodeResult.stderr);
    console.error("--- native stderr ---\n" + binResult.stderr);
    return;
  }
  const dir = "test/golden/" + name;
  const stdoutPath = dir + ".stdout";
  const stderrPath = dir + ".stderr";
  const exitPath = dir + ".exit";
  const exitText = String(nodeResult.status) + "\n";
  if (WRITE) {
    writeFileSync(stdoutPath, nodeResult.stdout, "utf8");
    writeFileSync(stderrPath, nodeResult.stderr, "utf8");
    writeFileSync(exitPath, exitText, "utf8");
  }
  const expectedOut = readFileSync(stdoutPath, "utf8");
  const expectedErr = readFileSync(stderrPath, "utf8");
  const expectedExit = readFileSync(exitPath, "utf8");
  if (nodeResult.stdout !== expectedOut || nodeResult.stderr !== expectedErr || exitText !== expectedExit) {
    fail(name + " golden mismatch");
    console.error("--- actual stdout ---\n" + nodeResult.stdout);
    console.error("--- golden stdout ---\n" + expectedOut);
    console.error("--- actual stderr ---\n" + nodeResult.stderr);
    console.error("--- golden stderr ---\n" + expectedErr);
    console.error("--- actual exit ---\n" + exitText);
    console.error("--- golden exit ---\n" + expectedExit);
    return;
  }
  console.log("PASS " + name + " (node = native = golden, exit " + String(nodeResult.status) + ")");
}

function main(): void {
  mkdirSync("build", { recursive: true });
  mkdirSync("test/golden", { recursive: true });

  const version = run("node_modules/.bin/scriptc", ["--version"]);
  const versionText = version.stdout.trim();
  step("scriptc version 0.4.1", version, version.status === 0 && versionText === "0.4.1");
  console.log(version.stdout);

  const tsc = run(process.execPath, ["node_modules/typescript/bin/tsc", "--noEmit", "-p", "tsconfig.json"]);
  step("tsc --noEmit", tsc, tsc.status === 0);

  requireCoverage("src/main.ts");
  requireCoverage("test/unit.ts");
  requireCoverage("test/run-all.ts");

  requireBuild("src/main.ts", "build/ears-verify");
  requireBuild("test/unit.ts", "build/unit-tests");

  if (failed !== 0) {
    console.error("stopping before golden tests (" + String(failed) + " failed)");
    process.exit(1);
  }

  const unitNode = nodeRun("test/unit.ts", []);
  const unitBin = run("build/unit-tests", []);
  comparePair("unit", unitNode, unitBin);

  const cases: Case[] = [
    { name: "check-bad", args: ["check", "examples/url-safety.ears.md", "https://bob@evil.com"] },
    { name: "check-good", args: ["check", "examples/url-safety.ears.md", "https://example.com/path"] },
    { name: "check-bad-json", args: ["check", "--json", "examples/url-safety.ears.md", "https://bob@evil.com"] },
    { name: "emit-smt", args: ["emit-smt", "examples/url-safety.ears.md"] },
    { name: "malformed-spec", args: ["check", "test/fixtures/malformed.ears.md", "https://example.com/"] },
    { name: "malformed-url", args: ["check", "examples/url-safety.ears.md", "http://ex ample.com"] },
    { name: "policy", args: ["policy"] },
    { name: "lint", args: ["lint", "examples/url-safety.ears.md"] },
    { name: "usage", args: [] },
  ];
  for (let i = 0; i < cases.length; i++) {
    const item = cases[i];
    const nodeResult = nodeRun("src/main.ts", item.args);
    const binResult = run("build/ears-verify", item.args);
    comparePair(item.name, nodeResult, binResult);
  }

  if (failed !== 0) {
    console.error(String(failed) + " failed");
    process.exit(1);
  }
  console.log("all tests passed");
  process.exit(0);
}

main();
