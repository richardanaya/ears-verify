/**
 * ears-verify command line.
 * User arguments start at process.argv index 2 under both Node and ScriptC.
 */

import { readFileSync } from "node:fs";
import { bindScenario, evaluate, formatCheckJson, formatCheckText, formatErrorJson } from "./check.ts";
import { parseSpec } from "./ears.ts";
import { parseScenarioJson } from "./jsonvalue.ts";
import { formatLintJson, formatLintText, lintSpec } from "./lint.ts";
import { printSmt } from "./smt.ts";
import { displayQuote } from "./text.ts";
import { canonicalizeUrl, formatCanonJson, formatCanonText } from "./url.ts";

const EXIT_OK = 0;
const EXIT_VIOLATIONS = 1;
const EXIT_USAGE = 2;
const EXIT_UNIMPLEMENTED = 3;

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
    console.log("not implemented yet");
    process.exit(EXIT_UNIMPLEMENTED);
  }
  if (command === "check") {
    commandCheck(args.slice(1));
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
  if (command === "canonicalize") {
    commandCanonicalize(args.slice(1));
    return;
  }
  console.error("error: unknown command " + displayQuote(command));
  usage(true);
  process.exit(EXIT_USAGE);
}

interface Flags {
  json: boolean;
  input: string;
  positionals: string[];
  error: string;
}

function parseFlags(args: string[]): Flags {
  const flags: Flags = { json: false, input: "", positionals: [], error: "" };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--json") flags.json = true;
    else if (arg === "--input") {
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
    } else if (arg.startsWith("--")) {
      flags.error = "unknown option " + arg;
      return flags;
    } else flags.positionals.push(arg);
  }
  return flags;
}

function commandCheck(args: string[]): void {
  const flags = parseFlags(args);
  if (flags.error.length > 0) fail(flags.json, flags.error);
  if (flags.positionals.length !== 1 || flags.input.length === 0) {
    fail(flags.json, "usage: ears-verify check [--json] <spec> --input <scenario>");
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

function commandEmit(args: string[]): void {
  const flags = parseFlags(args);
  if (flags.error.length > 0) fail(false, flags.error);
  if (flags.json || flags.input.length > 0 || flags.positionals.length !== 1) fail(false, "usage: ears-verify emit-smt <spec>");
  const specPath = flags.positionals[0];
  const specText = readText(specPath);
  if (specText === null) fail(false, "cannot read " + specPath);
  const spec = parseSpec(specText);
  if (!spec.ok) fail(false, specPath + ":" + String(spec.line) + ": " + spec.message);
  console.log(printSmt(specPath, spec.spec));
  process.exit(EXIT_OK);
}

function commandCanonicalize(args: string[]): void {
  const flags = parseFlags(args);
  if (flags.error.length > 0) fail(flags.json, flags.error);
  if (flags.input.length > 0 || flags.positionals.length !== 1) {
    fail(flags.json, "usage: ears-verify canonicalize [--json] <url>");
  }
  const input = flags.positionals[0];
  const result = canonicalizeUrl(input);
  if (!result.ok) fail(flags.json, result.message);
  if (flags.json) console.log(formatCanonJson(input, result.canonical, result.violations));
  else console.log(formatCanonText(result.canonical, result.violations));
  if (result.violations.length === 0) process.exit(EXIT_OK);
  process.exit(EXIT_VIOLATIONS);
}

function commandLint(args: string[]): void {
  const flags = parseFlags(args);
  if (flags.error.length > 0) fail(flags.json, flags.error);
  if (flags.input.length > 0 || flags.positionals.length !== 1) fail(flags.json, "usage: ears-verify lint [--json] <spec>");
  const specPath = flags.positionals[0];
  const specText = readText(specPath);
  if (specText === null) fail(flags.json, "cannot read " + specPath);
  const spec = parseSpec(specText);
  if (!spec.ok) fail(flags.json, specPath + ":" + String(spec.line) + ": " + spec.message);
  const outcome = lintSpec(spec.spec);
  if (outcome.kind === "error") fail(flags.json, outcome.message);
  const findings = outcome.report.conflicts.length + outcome.report.gaps.length + outcome.report.misuse.length + outcome.report.wording.length;
  if (flags.json) console.log(formatLintJson(specPath, outcome.report));
  else console.log(formatLintText(specPath, outcome.report));
  if (findings === 0) process.exit(EXIT_OK);
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
    "  ears-verify check [--json] <spec> --input <scenario>\n" +
    "  ears-verify emit-smt <spec>\n" +
    "  ears-verify lint [--json] <spec>\n" +
    "  ears-verify canonicalize [--json] <url>\n" +
    "  ears-verify policy\n" +
    "  ears-verify help";
  if (toStderr) console.error(text);
  else console.log(text);
}

main();
