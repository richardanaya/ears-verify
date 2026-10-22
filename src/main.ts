/**
 * ears-verify command line.
 * Arguments are process.argv from index 2 under both Node and ScriptC,
 * so the two runs see the same user arguments and print the same report.
 */

import { readFileSync } from "node:fs";
import { checkUrl, formatErrorJson, formatJson, formatText } from "./check.ts";
import { parseSpec } from "./ears.ts";
import { assertionsFrom, printSmt } from "./smt.ts";
import { displayQuote } from "./text.ts";
import { parseUrl } from "./url.ts";

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
  if (command === "policy" || command === "lint") {
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
  console.error("error: unknown command " + displayQuote(command));
  usage(true);
  process.exit(EXIT_USAGE);
}

function commandCheck(args: string[]): void {
  let json = false;
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--json") json = true;
    else if (arg.startsWith("--")) fail(json, "unknown option " + arg);
    else positional.push(arg);
  }
  if (positional.length !== 2) fail(json, "usage: ears-verify check [--json] <spec> <url>");
  const specPath = positional[0];
  const rawUrl = positional[1];
  const text = readSpec(specPath, json);
  const spec = parseSpec(text);
  if (!spec.ok) fail(json, specPath + ":" + String(spec.line) + ": " + spec.message);
  const url = parseUrl(rawUrl);
  if (!url.ok) fail(json, "malformed URL " + displayQuote(rawUrl) + ": " + url.message);
  const report = checkUrl(spec.requirements, url.url);
  if (json) {
    const rendered = formatJson(specPath, rawUrl, report);
    console.log(rendered.endsWith("\n") ? rendered.slice(0, rendered.length - 1) : rendered);
  } else {
    const rendered = formatText(specPath, rawUrl, report);
    console.log(rendered.endsWith("\n") ? rendered.slice(0, rendered.length - 1) : rendered);
  }
  if (report.ok) process.exit(EXIT_OK);
  process.exit(EXIT_VIOLATIONS);
}

function commandEmit(args: string[]): void {
  if (args.length !== 1) fail(false, "usage: ears-verify emit-smt <spec>");
  const specPath = args[0];
  const text = readSpec(specPath, false);
  const spec = parseSpec(text);
  if (!spec.ok) fail(false, specPath + ":" + String(spec.line) + ": " + spec.message);
  console.log(printSmt(specPath, assertionsFrom(spec.requirements)));
  process.exit(EXIT_OK);
}

function readSpec(path: string, json: boolean): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    fail(json, "cannot read " + path);
  }
}

function fail(json: boolean, message: string): never {
  if (json) {
    const rendered = formatErrorJson(message);
    console.log(rendered.endsWith("\n") ? rendered.slice(0, rendered.length - 1) : rendered);
  } else {
    console.error("error: " + message);
  }
  process.exit(EXIT_USAGE);
}

function usage(toStderr: boolean): void {
  const text =
    "usage:\n" +
    "  ears-verify check [--json] <spec> <url>\n" +
    "  ears-verify emit-smt <spec>\n" +
    "  ears-verify policy\n" +
    "  ears-verify lint\n" +
    "  ears-verify help";
  if (toStderr) console.error(text);
  else console.log(text);
}

main();
