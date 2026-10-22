/**
 * Run the typecheck, ScriptC coverage gate, native build, unit tests,
 * and golden CLI tests. Unit tests and each CLI case run once under Node
 * and once as the native binary; stdout, stderr, and exit status must match
 * each other and the checked-in golden files. Samples in README.md and
 * skills/ears-verify/SKILL.md marked with `<!-- verify stdout|stderr <exit>`
 * are run under Node and build/ears-verify and must match the fenced bytes.
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
    { name: "check-fail", args: ["check", "examples/order.ears.md", "--input", "examples/order-fail.json"] },
    { name: "check-pass", args: ["check", "examples/order.ears.md", "--input", "examples/order-pass.json"] },
    { name: "check-fail-json", args: ["check", "--json", "examples/order.ears.md", "--input", "examples/order-fail.json"] },
    { name: "emit-smt", args: ["emit-smt", "examples/order.ears.md"] },
    { name: "lint-conflict", args: ["lint", "examples/order-conflict.ears.md"] },
    { name: "lint-conflict-json", args: ["lint", "--json", "examples/order-conflict.ears.md"] },
    { name: "lint-gap", args: ["lint", "examples/order.ears.md"] },
    { name: "lint-clean", args: ["lint", "examples/order-covered.ears.md"] },
    { name: "lint-misuse", args: ["lint", "examples/order-misuse.ears.md"] },
    { name: "lint-wording", args: ["lint", "examples/order-wording.ears.md"] },
    { name: "lint-wide", args: ["lint", "examples/order-wide.ears.md"] },
    { name: "malformed-spec", args: ["check", "test/fixtures/malformed.ears.md", "--input", "examples/order-pass.json"] },
    { name: "unknown-phrase", args: ["lint", "test/fixtures/unknown-phrase.ears.md"] },
    { name: "malformed-scenario", args: ["check", "examples/order.ears.md", "--input", "examples/order-bad.json"] },
    { name: "policy", args: ["policy"] },
    { name: "usage", args: [] },
    { name: "help", args: ["help"] },
  ];
  for (let i = 0; i < cases.length; i++) {
    const item = cases[i];
    const nodeResult = nodeRun("src/main.ts", item.args);
    const binResult = run("build/ears-verify", item.args);
    comparePair(item.name, nodeResult, binResult);
  }

  checkDocSamples("readme", "README.md", false);
  checkDocSamples("skill", "skills/ears-verify/SKILL.md", true);

  if (failed !== 0) {
    console.error(String(failed) + " failed");
    process.exit(1);
  }
  console.log("all tests passed");
  process.exit(0);
}

function checkDocSamples(label: string, path: string, strictText: boolean): void {
  const text = readFileSync(path, "utf8");
  const startMark = "<!-- verify ";
  const fences: number[] = [];
  let cursor = 0;
  let found = 0;
  while (cursor < text.length) {
    const at = text.indexOf(startMark, cursor);
    if (at < 0) break;
    const headerEnd = text.indexOf("\n", at);
    if (headerEnd < 0) {
      fail(label + " verify header is truncated");
      return;
    }
    const header = text.slice(at + startMark.length, headerEnd).trim();
    const space = header.indexOf(" ");
    if (space < 0) {
      fail(label + " verify header needs a stream and an exit code");
      return;
    }
    const stream = header.slice(0, space);
    const exitCode = parseExit(header.slice(space + 1).trim());
    if ((stream !== "stdout" && stream !== "stderr") || exitCode < 0) {
      fail(label + " verify header " + header);
      return;
    }
    const argsEnd = text.indexOf("\n-->", headerEnd);
    if (argsEnd < 0) {
      fail(label + " verify block is missing -->");
      return;
    }
    const args = nonEmptyLines(text.slice(headerEnd + 1, argsEnd));
    if (args.length === 0 || args[0] !== "build/ears-verify") {
      fail(label + " verify block must start with build/ears-verify");
      return;
    }
    const fenceAt = text.indexOf("```", argsEnd);
    const fenceLineEnd = fenceAt < 0 ? -1 : text.indexOf("\n", fenceAt);
    const closeAt = fenceLineEnd < 0 ? -1 : text.indexOf("\n```", fenceLineEnd);
    if (fenceAt < 0 || fenceLineEnd < 0 || closeAt < 0) {
      fail(label + " verify block is missing a fence");
      return;
    }
    fences.push(fenceAt);
    const body = text.slice(fenceLineEnd + 1, closeAt + 1);
    const native = run(args[0], args.slice(1));
    const nodeArgs: string[] = ["--experimental-strip-types", "src/main.ts"];
    for (let i = 1; i < args.length; i++) nodeArgs.push(args[i]);
    const nodeResult = run(process.execPath, nodeArgs);
    const command = args.join(" ");
    if (native.status !== nodeResult.status || native.stdout !== nodeResult.stdout || native.stderr !== nodeResult.stderr) {
      fail(label + " node/native differ " + command);
      console.error("--- node stdout ---\n" + nodeResult.stdout);
      console.error("--- native stdout ---\n" + native.stdout);
      return;
    }
    const actual = stream === "stdout" ? native.stdout : native.stderr;
    const other = stream === "stdout" ? native.stderr : native.stdout;
    if (native.status !== exitCode || actual !== body || other.length !== 0) {
      fail(label + " sample " + command);
      console.error("expected exit " + String(exitCode) + ", got " + String(native.status));
      console.error("--- cli ---");
      console.error(actual);
      console.error("--- doc ---");
      console.error(body);
      if (other.length > 0) console.error("--- other stream ---\n" + other);
    } else {
      console.log("PASS " + label + " " + command);
    }
    found++;
    cursor = closeAt + 4;
  }
  if (found === 0) fail(label + " has no verify blocks");
  if (strictText) requireTextFencesVerified(label, text, fences);
}

function requireTextFencesVerified(label: string, text: string, fences: number[]): void {
  const mark = "```text\n";
  let cursor = 0;
  let found = 0;
  while (cursor < text.length) {
    const at = text.indexOf(mark, cursor);
    if (at < 0) break;
    let covered = false;
    for (let i = 0; i < fences.length; i++) {
      if (fences[i] === at) covered = true;
    }
    if (!covered) {
      fail(label + " text sample is not tied to a verify block");
      return;
    }
    found++;
    cursor = at + mark.length;
  }
  if (found !== fences.length) fail(label + " verify block is missing a text sample");
  else console.log("PASS " + label + " text samples are all verified");
}

function parseExit(text: string): number {
  if (text.length === 0) return -1;
  let value = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 48 || code > 57) return -1;
    value = value * 10 + (code - 48);
  }
  return value;
}

function nonEmptyLines(text: string): string[] {
  const lines: string[] = [];
  let start = 0;
  for (let i = 0; i <= text.length; i++) {
    if (i === text.length || text.charCodeAt(i) === 10) {
      let line = text.slice(start, i);
      if (line.length > 0 && line.charCodeAt(line.length - 1) === 13) {
        line = line.slice(0, line.length - 1);
      }
      const trimmed = line.trim();
      if (trimmed.length > 0) lines.push(trimmed);
      start = i + 1;
    }
  }
  return lines;
}

main();
