/**
 * Run the typecheck, ScriptC coverage gate, native build, unit tests,
 * and golden CLI tests. Unit tests and each CLI case run once under Node
 * and once as the native binary; stdout, stderr, and exit status must match
 * each other and the checked-in golden files. Samples in README.md and
 * skills/spec-verify/SKILL.md marked with `<!-- verify stdout|stderr <exit>`
 * are run under Node and build/spec-verify and must match the fenced bytes.
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

  requireBuild("src/main.ts", "build/spec-verify");
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
    { name: "emit-smt-json", args: ["emit-smt", "--json", "examples/order.ears.md"] },
    { name: "emit-smt-json-usage", args: ["emit-smt", "--json"] },
    { name: "check-pass-json", args: ["check", "--json", "examples/order.ears.md", "--input", "examples/order-pass.json"] },
    { name: "lint-conflict", args: ["lint", "examples/order-conflict.ears.md"] },
    { name: "lint-repair", args: ["lint", "examples/order-repair.ears.md"] },
    { name: "lint-repair-json", args: ["lint", "--json", "examples/order-repair.ears.md"] },
    { name: "lint-conflict-json", args: ["lint", "--json", "examples/order-conflict.ears.md"] },
    { name: "lint-gap", args: ["lint", "examples/order.ears.md"] },
    { name: "lint-clean", args: ["lint", "examples/order-covered.ears.md"] },
    { name: "lint-misuse", args: ["lint", "examples/order-misuse.ears.md"] },
    { name: "lint-wording", args: ["lint", "examples/order-wording.ears.md"] },
    { name: "lint-unhandled", args: ["lint", "examples/order-unhandled.ears.md"] },
    { name: "lint-unanswered", args: ["lint", "examples/order-unanswered.ears.md"] },
    { name: "lint-vague", args: ["lint", "examples/order-vague.ears.md"] },
    { name: "lint-quantity", args: ["lint", "examples/order-quantity.ears.md"] },
    { name: "lint-status", args: ["lint", "examples/order-status.ears.md"] },
    { name: "lint-chain", args: ["lint", "examples/order-chain.ears.md"] },
    { name: "lint-redundant", args: ["lint", "examples/order-redundant.ears.md"] },
    { name: "lint-repeat", args: ["lint", "examples/order-repeat.ears.md"] },
    { name: "lint-duplicate", args: ["lint", "examples/order-duplicate.ears.md"] },
    { name: "lint-negation", args: ["lint", "examples/order-negation.ears.md"] },
    { name: "lint-unmeasured", args: ["lint", "examples/order-unmeasured.ears.md"] },
    { name: "lint-vacuous", args: ["lint", "examples/order-vacuous.ears.md"] },
    { name: "lint-vacuous-json", args: ["lint", "--json", "examples/order-vacuous.ears.md"] },
    { name: "lint-unused", args: ["lint", "examples/order-unused.ears.md"] },
    { name: "lint-unused-json", args: ["lint", "--json", "examples/order-unused.ears.md"] },
    { name: "lint-checkout", args: ["lint", "examples/checkout.ears.md"] },
    { name: "lint-awkward", args: ["lint", "examples/order-awkward.ears.md"] },
    { name: "lint-clear", args: ["lint", "examples/order-clear.ears.md"] },
    { name: "scenarios", args: ["scenarios", "examples/order.ears.md"] },
    { name: "scenarios-json", args: ["scenarios", "--json", "examples/order.ears.md"] },
    { name: "scenarios-status", args: ["scenarios", "examples/order-status.ears.md"] },
    { name: "lint-wide", args: ["lint", "examples/order-wide.ears.md"] },
    { name: "malformed-spec", args: ["check", "test/fixtures/malformed.ears.md", "--input", "examples/order-pass.json"] },
    { name: "unknown-phrase", args: ["lint", "test/fixtures/unknown-phrase.ears.md"] },
    { name: "malformed-scenario", args: ["check", "examples/order.ears.md", "--input", "examples/order-bad.json"] },
    { name: "policy", args: ["policy", "examples/order.ears.md"] },
    { name: "policy-covered", args: ["policy", "examples/order-covered.ears.md"] },
    { name: "policy-counterexample", args: ["policy", "examples/order.ears.md", "--property", "examples/order-always.ears.md"] },
    { name: "policy-holds", args: ["policy", "examples/order.ears.md", "--property", "examples/order-same.ears.md"] },
    { name: "policy-status", args: ["policy", "examples/order-status.ears.md"] },
    { name: "policy-vacuous", args: ["policy", "examples/order-status.ears.md", "--property", "examples/status-placed.ears.md"] },
    { name: "policy-json", args: ["policy", "--json", "examples/order.ears.md", "--property", "examples/order-always.ears.md"] },
    { name: "policy-wide", args: ["policy", "examples/order-wide.ears.md"] },
    { name: "usage", args: [] },
    { name: "help", args: ["help"] },
  ];
  for (let i = 0; i < cases.length; i++) {
    const item = cases[i];
    const nodeResult = nodeRun("src/main.ts", item.args);
    const binResult = run("build/spec-verify", item.args);
    comparePair(item.name, nodeResult, binResult);
  }

  checkDocSamples("readme", "README.md", false);
  checkDocSamples("skill", "skills/spec-verify/SKILL.md", true);
  checkPlanToProblems();

  if (failed !== 0) {
    console.error(String(failed) + " failed");
    process.exit(1);
  }
  console.log("all tests passed");
  process.exit(0);
}

function checkPlanToProblems(): void {
  const dir = "examples/plan-to-problems/";
  const spec = dir + "generated.ears.md";
  const lintNode = nodeRun("src/main.ts", ["lint", "--json", spec]);
  const lintBin = run("build/spec-verify", ["lint", "--json", spec]);
  const lintOk = sameSaved("plan-to-problems lint", lintNode, lintBin, dir + "lint.json", 1);
  const reportNode = nodeRun("src/main.ts", ["report", spec]);
  const reportBin = run("build/spec-verify", ["report", spec]);
  const reportOk = sameSaved("plan-to-problems report", reportNode, reportBin, dir + "problems.md", 1);
  if (!lintOk || !reportOk) return;
  const planted = readFileSync(dir + "planted.txt", "utf8");
  const expected = readFileSync(dir + "expected-problems.md", "utf8");
  if (plantedDetected(planted, expected, lintNode.stdout, reportNode.stdout)) {
    console.log("PASS plan-to-problems planted problems");
  }
}

function sameSaved(name: string, nodeResult: RunResult, binResult: RunResult, savedPath: string, exitCode: number): boolean {
  if (
    nodeResult.status !== binResult.status ||
    nodeResult.stdout !== binResult.stdout ||
    nodeResult.stderr !== binResult.stderr
  ) {
    fail(name + " node/native differ");
    console.error("--- node stdout ---\n" + nodeResult.stdout);
    console.error("--- native stdout ---\n" + binResult.stdout);
    console.error("--- node stderr ---\n" + nodeResult.stderr);
    console.error("--- native stderr ---\n" + binResult.stderr);
    return false;
  }
  const saved = readFileSync(savedPath, "utf8");
  if (nodeResult.stdout !== saved || nodeResult.stderr.length !== 0 || nodeResult.status !== exitCode) {
    fail(name + " saved output mismatch");
    console.error("expected exit " + String(exitCode) + ", got " + String(nodeResult.status));
    console.error("--- actual stdout ---\n" + nodeResult.stdout);
    console.error("--- saved stdout ---\n" + saved);
    if (nodeResult.stderr.length > 0) console.error("--- stderr ---\n" + nodeResult.stderr);
    return false;
  }
  console.log("PASS " + name + " (node = native = saved, exit " + String(exitCode) + ")");
  return true;
}

function plantedDetected(planted: string, expected: string, lintJson: string, problems: string): boolean {
  const lines = nonEmptyLines(planted);
  if (lines.length === 0) {
    fail("plan-to-problems planted list is empty");
    return false;
  }
  if (problems.indexOf("keeps ") !== -1 || problems.indexOf("breaks ") !== -1) {
    fail("plan-to-problems report picks a winner");
    return false;
  }
  let conflicts = 0;
  for (let i = 0; i < lines.length; i++) {
    const words = wordsOf(lines[i]);
    if (words.length < 2) {
      fail("plan-to-problems planted line " + lines[i]);
      return false;
    }
    const kind = words[0];
    if (kind === "conflict") {
      if (words.length !== 3) {
        fail("plan-to-problems conflict needs two ids");
        return false;
      }
      conflicts++;
      const pair = "\"" + words[1] + "\",\n        \"" + words[2] + "\"";
      if (lintJson.indexOf(pair) < 0 || problems.indexOf(words[1]) < 0 || problems.indexOf(words[2]) < 0) {
        fail("plan-to-problems conflict " + words[1] + " " + words[2]);
        return false;
      }
    } else if (kind === "gap") {
      const marker = "\"output\": \"" + words[1] + "\"";
      if (lintJson.indexOf(marker) < 0 || problems.indexOf(words[1]) < 0) {
        fail("plan-to-problems gap " + words[1]);
        return false;
      }
    } else if (kind === "vacuous") {
      const marker = "\"id\": \"" + words[1] + "\"";
      if (lintJson.indexOf(marker) < 0 || problems.indexOf(words[1]) < 0) {
        fail("plan-to-problems vacuous " + words[1]);
        return false;
      }
    } else if (kind === "redundant") {
      const redundantAt = lintJson.indexOf('"redundant":');
      const marker = '"id": "' + words[1] + '"';
      if (
        redundantAt < 0 ||
        lintJson.indexOf(marker, redundantAt) < 0 ||
        problems.indexOf(words[1]) < 0 ||
        problems.indexOf("adds nothing") < 0
      ) {
        fail("plan-to-problems redundant " + words[1]);
        return false;
      }
    } else {
      fail("plan-to-problems unknown planted kind " + kind);
      return false;
    }
    for (let w = 1; w < words.length; w++) {
      if (expected.indexOf(words[w]) < 0) {
        fail("plan-to-problems expected-problems.md omits " + words[w]);
        return false;
      }
    }
  }
  if (conflicts < 2) {
    fail("plan-to-problems needs two contradictions");
    return false;
  }
  if (countText(lintJson, '"kind": "negation"') !== 2) {
    fail("plan-to-problems negated triggers");
    return false;
  }
  const questions = countText(problems, "Which requirement should win?");
  if (questions < conflicts) {
    fail("plan-to-problems winner questions " + String(questions));
    return false;
  }
  return true;
}

function wordsOf(line: string): string[] {
  const words: string[] = [];
  let start = 0;
  for (let i = 0; i <= line.length; i++) {
    if (i === line.length || line.charCodeAt(i) === 32) {
      if (i > start) words.push(line.slice(start, i));
      start = i + 1;
    }
  }
  return words;
}

function countText(text: string, needle: string): number {
  let count = 0;
  let from = 0;
  while (from < text.length) {
    const at = text.indexOf(needle, from);
    if (at < 0) break;
    count++;
    from = at + needle.length;
  }
  return count;
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
    if (args.length === 0 || args[0] !== "build/spec-verify") {
      fail(label + " verify block must start with build/spec-verify");
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
