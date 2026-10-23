/**
 * plan-verify command line.
 * User arguments start at process.argv index 2 under both Node and ScriptC.
 */

import { readFileSync } from "node:fs";
import { bindScenario, evaluate, formatCheckJson, formatCheckText, formatErrorJson } from "./check.ts";
import { diffSpecs, formatDiffJson, formatDiffText } from "./diff.ts";
import { parseProperty, parseSpec } from "./ears.ts";
import { parseScenarioJson } from "./jsonvalue.ts";
import { formatLintJson, formatLintText, lintSpec } from "./lint.ts";
import { buildProblems } from "./report.ts";
import { formatScenariosJson, formatScenariosText, listScenarios } from "./scenarios.ts";
import { analyzePolicy, formatPolicyJson, formatPolicyText } from "./policy.ts";
import { formatEmitJson, printSmt } from "./smt.ts";
import { spaceSize } from "./solver.ts";
import { displayQuote } from "./text.ts";
import type { Requirement } from "./spec.ts";

const EXIT_OK = 0;
const EXIT_VIOLATIONS = 1;
const EXIT_USAGE = 2;

function main(): void {
  const args: string[] = [];
  for (let i = 2; i < process.argv.length; i++) args.push(process.argv[i]);
  if (args.length === 0) {
    console.error("error: missing command");
    usage(true);
    process.exit(EXIT_USAGE);
  }
  const command = args[0];
  if (command === "help" || command === "--help" || command === "-h") {
    usage(false);
    process.exit(EXIT_OK);
  }
  if (command === "policy") {
    commandPolicy(args.slice(1));
    return;
  }
  if (command === "check") {
    commandCheck(args.slice(1));
    return;
  }
  if (command === "diff") {
    commandDiff(args.slice(1));
    return;
  }
  if (command === "emit-smt") {
    commandEmit(args.slice(1));
    return;
  }
  if (command === "lint") {
    commandLint(args.slice(1));
    return;
  }
  if (command === "report") {
    commandReport(args.slice(1));
    return;
  }
  if (command === "scenarios") {
    commandScenarios(args.slice(1));
    return;
  }
  console.error("error: unknown command " + displayQuote(command));
  usage(true);
  process.exit(EXIT_USAGE);
}

interface Flags {
  json: boolean;
  input: string;
  property: string;
  positionals: string[];
  error: string;
}

function parseFlags(args: string[], allowInput: boolean, allowProperty: boolean): Flags {
  const flags: Flags = { json: false, input: "", property: "", positionals: [], error: "" };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--json") flags.json = true;
    else if (arg === "--input") {
      if (!allowInput) {
        flags.error = "unknown option --input";
        return flags;
      }
      if (flags.input.length > 0) {
        flags.error = "repeated option --input";
        return flags;
      }
      if (i + 1 >= args.length) {
        flags.error = "missing value for --input";
        return flags;
      }
      i++;
      flags.input = args[i];
    } else if (arg === "--property") {
      if (!allowProperty) {
        flags.error = "unknown option --property";
        return flags;
      }
      if (flags.property.length > 0) {
        flags.error = "repeated option --property";
        return flags;
      }
      if (i + 1 >= args.length) {
        flags.error = "missing value for --property";
        return flags;
      }
      i++;
      flags.property = args[i];
    } else if (arg.startsWith("--")) {
      flags.error = "unknown option " + arg;
      return flags;
    } else flags.positionals.push(arg);
  }
  return flags;
}

function commandCheck(args: string[]): void {
  const flags = parseFlags(args, true, false);
  if (flags.error.length > 0) fail(flags.json, flags.error);
  if (flags.positionals.length !== 1 || flags.input.length === 0) {
    fail(flags.json, "usage: plan-verify check [--json] <spec> --input <scenario>");
  }
  const specPath = flags.positionals[0];
  const scenarioPath = flags.input;
  const specText = readText(specPath);
  if (specText === null) fail(flags.json, "cannot read " + specPath);
  const spec = parseSpec(specText);
  if (!spec.ok) fail(flags.json, specPath + ":" + String(spec.line) + ": " + spec.message);
  const scenarioText = readText(scenarioPath);
  if (scenarioText === null) fail(flags.json, "cannot read " + scenarioPath);
  const json = parseScenarioJson(scenarioText);
  if (!json.ok) fail(flags.json, scenarioPath + ":" + String(json.line) + ": " + json.message);
  const bound = bindScenario(spec.spec, json.object);
  if (!bound.ok) fail(flags.json, "scenario " + scenarioPath + ": " + bound.message);
  const violations = evaluate(spec.spec, bound.env);
  if (flags.json) console.log(formatCheckJson(specPath, scenarioPath, violations));
  else console.log(formatCheckText(specPath, scenarioPath, violations));
  if (violations.length === 0) process.exit(EXIT_OK);
  process.exit(EXIT_VIOLATIONS);
}

function commandDiff(args: string[]): void {
  const flags = parseFlags(args, false, false);
  if (flags.error.length > 0) fail(flags.json, flags.error);
  if (flags.positionals.length !== 2) fail(flags.json, "usage: plan-verify diff [--json] <old-spec> <new-spec>");
  const oldPath = flags.positionals[0];
  const newPath = flags.positionals[1];
  const oldText = readText(oldPath);
  if (oldText === null) fail(flags.json, "cannot read " + oldPath);
  const newText = readText(newPath);
  if (newText === null) fail(flags.json, "cannot read " + newPath);
  const oldParsed = parseSpec(oldText);
  if (!oldParsed.ok) fail(flags.json, oldPath + ":" + String(oldParsed.line) + ": " + oldParsed.message);
  const newParsed = parseSpec(newText);
  if (!newParsed.ok) fail(flags.json, newPath + ":" + String(newParsed.line) + ": " + newParsed.message);
  const outcome = diffSpecs(oldPath, oldParsed.spec, newPath, newParsed.spec);
  if (outcome.kind === "error") fail(flags.json, outcome.message);
  if (flags.json) console.log(formatDiffJson(oldPath, newPath, outcome.report));
  else console.log(formatDiffText(oldPath, newPath, outcome.report));
  if (outcome.report.oldAcceptsNewRejectsFound || outcome.report.newAcceptsOldRejectsFound) process.exit(EXIT_VIOLATIONS);
  process.exit(EXIT_OK);
}

function commandEmit(args: string[]): void {
  const flags = parseFlags(args, false, false);
  if (flags.error.length > 0) fail(flags.json, flags.error);
  if (flags.positionals.length !== 1) fail(flags.json, "usage: plan-verify emit-smt [--json] <spec>");
  const specPath = flags.positionals[0];
  const specText = readText(specPath);
  if (specText === null) fail(flags.json, "cannot read " + specPath);
  const spec = parseSpec(specText);
  if (!spec.ok) fail(flags.json, specPath + ":" + String(spec.line) + ": " + spec.message);
  const smt = printSmt(specPath, spec.spec);
  if (flags.json) console.log(formatEmitJson(specPath, smt));
  else console.log(smt);
  process.exit(EXIT_OK);
}

function commandLint(args: string[]): void {
  const flags = parseFlags(args, false, false);
  if (flags.error.length > 0) fail(flags.json, flags.error);
  if (flags.input.length > 0 || flags.positionals.length !== 1) fail(flags.json, "usage: plan-verify lint [--json] <spec>");
  const specPath = flags.positionals[0];
  const specText = readText(specPath);
  if (specText === null) fail(flags.json, "cannot read " + specPath);
  const spec = parseSpec(specText);
  if (!spec.ok) fail(flags.json, specPath + ":" + String(spec.line) + ": " + spec.message);
  const outcome = lintSpec(spec.spec);
  if (outcome.kind === "error") fail(flags.json, outcome.message);
  const findings =
    outcome.report.conflicts.length +
    outcome.report.gaps.length +
    outcome.report.misuse.length +
    outcome.report.wording.length +
    outcome.report.redundant.length +
    outcome.report.duplicate.length +
    outcome.report.vacuous.length +
    outcome.report.unused.length;
  // Warnings stay exit 0. Conflicts, gaps, misuse, wording, redundant,
  // duplicate, vacuous, and unused schema still exit 1. Parse errors exit 2.
  if (flags.json) console.log(formatLintJson(specPath, outcome.report));
  else console.log(formatLintText(specPath, outcome.report));
  if (findings === 0) process.exit(EXIT_OK);
  process.exit(EXIT_VIOLATIONS);
}

function commandReport(args: string[]): void {
  const flags = parseFlags(args, false, false);
  if (flags.error.length > 0) fail(flags.json, flags.error);
  if (flags.json) fail(true, "usage: plan-verify report <spec>");
  if (flags.positionals.length !== 1) fail(false, "usage: plan-verify report <spec>");
  const specPath = flags.positionals[0];
  const specText = readText(specPath);
  if (specText === null) fail(false, "cannot read " + specPath);
  const spec = parseSpec(specText);
  if (!spec.ok) fail(false, specPath + ":" + String(spec.line) + ": " + spec.message);
  const outcome = lintSpec(spec.spec);
  if (outcome.kind === "error") fail(false, outcome.message);
  const doc = buildProblems(specPath, spec.spec, outcome.report);
  console.log(doc.text);
  if (doc.count === 0) process.exit(EXIT_OK);
  process.exit(EXIT_VIOLATIONS);
}

function commandScenarios(args: string[]): void {
  const flags = parseFlags(args, false, false);
  if (flags.error.length > 0) fail(flags.json, flags.error);
  if (flags.positionals.length !== 1) fail(flags.json, "usage: plan-verify scenarios [--json] <spec>");
  const specPath = flags.positionals[0];
  const specText = readText(specPath);
  if (specText === null) fail(flags.json, "cannot read " + specPath);
  const spec = parseSpec(specText);
  if (!spec.ok) fail(flags.json, specPath + ":" + String(spec.line) + ": " + spec.message);
  if (spaceSize(spec.spec) < 0) {
    fail(flags.json, "a symbol has an empty domain. Declare at least one allowed value.");
  }
  const rows = listScenarios(spec.spec);
  if (flags.json) console.log(formatScenariosJson(specPath, rows));
  else console.log(formatScenariosText(specPath, rows));
  process.exit(EXIT_OK);
}

function commandPolicy(args: string[]): void {
  const flags = parseFlags(args, false, true);
  if (flags.error.length > 0) fail(flags.json, flags.error);
  if (flags.positionals.length !== 1) fail(flags.json, "usage: plan-verify policy [--json] <spec> [--property <file>]");
  const specPath = flags.positionals[0];
  const specText = readText(specPath);
  if (specText === null) fail(flags.json, "cannot read " + specPath);
  const parsed = parseSpec(specText);
  if (!parsed.ok) fail(flags.json, specPath + ":" + String(parsed.line) + ": " + parsed.message);
  if (spaceSize(parsed.spec) < 0) {
    fail(flags.json, "a symbol has an empty domain. Declare at least one allowed value.");
  }
  let propertyReqs: Requirement[] = [];
  if (flags.property.length > 0) {
    const propertyText = readText(flags.property);
    if (propertyText === null) fail(flags.json, "cannot read " + flags.property);
    const property = parseProperty(propertyText, parsed.spec);
    if (!property.ok) fail(flags.json, flags.property + ":" + String(property.line) + ": " + property.message);
    propertyReqs = property.requirements;
  }
  const report = analyzePolicy(parsed.spec, flags.property, propertyReqs);
  if (flags.json) console.log(formatPolicyJson(specPath, parsed.spec, report));
  else console.log(formatPolicyText(specPath, parsed.spec, report));
  if (report.holds) process.exit(EXIT_OK);
  process.exit(EXIT_VIOLATIONS);
}

function readText(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function fail(json: boolean, message: string): never {
  if (json) console.log(formatErrorJson(message));
  else console.error("error: " + message);
  process.exit(EXIT_USAGE);
}

function usage(toStderr: boolean): void {
  const text =
    "usage:\n" +
    "  plan-verify check [--json] <spec> --input <scenario>\n" +
    "  plan-verify diff [--json] <old-spec> <new-spec>\n" +
    "  plan-verify emit-smt [--json] <spec>\n" +
    "  plan-verify lint [--json] <spec>\n" +
    "  plan-verify report <spec>\n" +
    "  plan-verify scenarios [--json] <spec>\n" +
    "  plan-verify policy [--json] <spec> [--property <file>]\n" +
    "  plan-verify help";
  if (toStderr) console.error(text);
  else console.log(text);
}

main();
