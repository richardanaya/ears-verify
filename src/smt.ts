/**
 * SMT-LIB term AST, printer, and ground evaluator.
 *
 * Each EARS requirement becomes one named assertion
 * `(assert (! (=> <condition> <shall-result>) :named R1.1_L12))`.
 * URL components are uninterpreted constants: strings, plus `port : Int`
 * where -1 (printed `(- 1)`) means the URI omitted the port.
 *
 * The AST is pure data. `evalTerm` decides it for a concrete URL.
 * A later symbolic or automata search can walk the same nodes without
 * going through the English parser. This module never calls an SMT solver.
 */

import type { Clause, Pred, Requirement } from "./ears.ts";
import type { UrlParts } from "./url.ts";
import { displayQuote, formatInt } from "./text.ts";

export type Term =
  | { kind: "bool"; value: boolean }
  | { kind: "int"; value: number }
  | { kind: "str"; value: string }
  | { kind: "var"; name: string }
  | { kind: "eq"; left: Term; right: Term }
  | { kind: "not"; arg: Term }
  | { kind: "and"; args: Term[] }
  | { kind: "or"; args: Term[] }
  | { kind: "implies"; left: Term; right: Term }
  | { kind: "prefixof"; prefix: Term; full: Term };

export interface NamedAssert {
  id: string;
  name: string;
  line: number;
  sentence: string;
  term: Term;
}

interface ValueBool {
  kind: "bool";
  value: boolean;
}

interface ValueInt {
  kind: "int";
  value: number;
}

interface ValueStr {
  kind: "str";
  value: string;
}

type Value = ValueBool | ValueInt | ValueStr;

export interface Verdict {
  holds: boolean;
  reason: string;
}

const DECLS: string[] = [
  "(declare-fun scheme () String)",
  "(declare-fun userinfo () String)",
  "(declare-fun host () String)",
  "(declare-fun port () Int)",
  "(declare-fun path () String)",
  "(declare-fun query () String)",
  "(declare-fun fragment () String)",
];

export function assertionsFrom(requirements: Requirement[]): NamedAssert[] {
  const out: NamedAssert[] = [];
  for (let i = 0; i < requirements.length; i++) {
    const req = requirements[i];
    out.push({
      id: req.id,
      name: req.id + "_L" + formatInt(req.line),
      line: req.line,
      sentence: req.sentence,
      term: {
        kind: "implies",
        left: antecedent(req.clauses),
        right: predToTerm(req.response),
      },
    });
  }
  return out;
}

export function printSmt(specPath: string, assertions: NamedAssert[]): string {
  let out = "";
  out += "; ears-verify SMT-LIB 2\n";
  out += "; spec: " + specPath + "\n";
  out += "; port is the integer written in the URI, or (- 1) when the port is omitted.\n";
  out += "; Scheme defaults are not filled in. No solver is invoked by ears-verify.\n";
  out += "(set-logic ALL)\n";
  for (let i = 0; i < DECLS.length; i++) out += DECLS[i] + "\n";
  for (let i = 0; i < assertions.length; i++) {
    const assertion = assertions[i];
    out += "\n";
    out += "; " + assertion.name + " line " + formatInt(assertion.line) + ": " + assertion.sentence + "\n";
    out += "(assert (! " + printTerm(assertion.term) + " :named " + assertion.name + "))\n";
  }
  if (out.endsWith("\n")) return out.slice(0, out.length - 1);
  return out;
}

export function judge(term: Term, url: UrlParts): Verdict {
  const value = evalTerm(term, url);
  if (value.kind === "bool" && value.value) return { holds: true, reason: "" };
  return { holds: false, reason: explainFalse(term, url) };
}

export function predToTerm(pred: Pred): Term {
  if (pred.kind === "empty") return eqVar(pred.component, "");
  if (pred.kind === "not_empty") return { kind: "not", arg: eqVar(pred.component, "") };
  if (pred.kind === "eq") return eqVar(pred.component, pred.value);
  if (pred.kind === "neq") return { kind: "not", arg: eqVar(pred.component, pred.value) };
  if (pred.kind === "one_of") {
    const args: Term[] = [];
    for (let i = 0; i < pred.values.length; i++) args.push(eqVar(pred.component, pred.values[i]));
    if (args.length === 1) return args[0];
    return { kind: "or", args: args };
  }
  if (pred.kind === "port_eq") return eqPort(pred.value);
  if (pred.kind === "port_omitted") return eqPort(-1);
  return { kind: "not", arg: eqPort(-1) };
}

export function printTerm(term: Term): string {
  if (term.kind === "bool") return term.value ? "true" : "false";
  if (term.kind === "int") return printInt(term.value);
  if (term.kind === "str") return "\"" + escapeSmt(term.value) + "\"";
  if (term.kind === "var") return term.name;
  if (term.kind === "eq") return "(= " + printTerm(term.left) + " " + printTerm(term.right) + ")";
  if (term.kind === "not") return "(not " + printTerm(term.arg) + ")";
  if (term.kind === "and") return printNary("and", term.args);
  if (term.kind === "or") return printNary("or", term.args);
  if (term.kind === "implies") return "(=> " + printTerm(term.left) + " " + printTerm(term.right) + ")";
  return "(str.prefixof " + printTerm(term.prefix) + " " + printTerm(term.full) + ")";
}

function antecedent(clauses: Clause[]): Term {
  if (clauses.length === 0) return { kind: "bool", value: true };
  if (clauses.length === 1) return predToTerm(clauses[0].pred);
  const args: Term[] = [];
  for (let i = 0; i < clauses.length; i++) args.push(predToTerm(clauses[i].pred));
  return { kind: "and", args: args };
}

function eqVar(name: string, value: string): Term {
  return { kind: "eq", left: { kind: "var", name: name }, right: { kind: "str", value: value } };
}

function eqPort(value: number): Term {
  return { kind: "eq", left: { kind: "var", name: "port" }, right: { kind: "int", value: value } };
}

function printNary(op: string, args: Term[]): string {
  let out = "(" + op;
  for (let i = 0; i < args.length; i++) out += " " + printTerm(args[i]);
  return out + ")";
}

function printInt(value: number): string {
  const truncated = Math.trunc(value);
  if (truncated < 0) return "(- " + formatInt(-truncated) + ")";
  return formatInt(truncated);
}

function escapeSmt(value: string): string {
  let out = "";
  for (let i = 0; i < value.length; i++) {
    if (value.charCodeAt(i) === 34) out += "\"\"";
    else out += value.slice(i, i + 1);
  }
  return out;
}

function evalTerm(term: Term, url: UrlParts): Value {
  if (term.kind === "bool") return { kind: "bool", value: term.value };
  if (term.kind === "int") return { kind: "int", value: term.value };
  if (term.kind === "str") return { kind: "str", value: term.value };
  if (term.kind === "var") return lookup(term.name, url);
  if (term.kind === "eq") {
    const left = evalTerm(term.left, url);
    const right = evalTerm(term.right, url);
    return { kind: "bool", value: sameValue(left, right) };
  }
  if (term.kind === "not") {
    const arg = evalTerm(term.arg, url);
    return { kind: "bool", value: arg.kind === "bool" && !arg.value };
  }
  if (term.kind === "and") {
    for (let i = 0; i < term.args.length; i++) {
      const arg = evalTerm(term.args[i], url);
      if (!(arg.kind === "bool" && arg.value)) return { kind: "bool", value: false };
    }
    return { kind: "bool", value: true };
  }
  if (term.kind === "or") {
    for (let i = 0; i < term.args.length; i++) {
      const arg = evalTerm(term.args[i], url);
      if (arg.kind === "bool" && arg.value) return { kind: "bool", value: true };
    }
    return { kind: "bool", value: false };
  }
  if (term.kind === "implies") {
    const left = evalTerm(term.left, url);
    if (left.kind === "bool" && !left.value) return { kind: "bool", value: true };
    const right = evalTerm(term.right, url);
    return { kind: "bool", value: right.kind === "bool" && right.value };
  }
  const prefix = evalTerm(term.prefix, url);
  const full = evalTerm(term.full, url);
  if (prefix.kind !== "str" || full.kind !== "str") return { kind: "bool", value: false };
  if (prefix.value.length > full.value.length) return { kind: "bool", value: false };
  return { kind: "bool", value: full.value.slice(0, prefix.value.length) === prefix.value };
}

function lookup(name: string, url: UrlParts): Value {
  if (name === "scheme") return { kind: "str", value: url.scheme };
  if (name === "userinfo") return { kind: "str", value: url.userinfo };
  if (name === "host") return { kind: "str", value: url.host };
  if (name === "port") return { kind: "int", value: url.port };
  if (name === "path") return { kind: "str", value: url.path };
  if (name === "query") return { kind: "str", value: url.query };
  if (name === "fragment") return { kind: "str", value: url.fragment };
  return { kind: "str", value: "" };
}

function sameValue(left: Value, right: Value): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "bool" && right.kind === "bool") return left.value === right.value;
  if (left.kind === "int" && right.kind === "int") return left.value === right.value;
  if (left.kind === "str" && right.kind === "str") return left.value === right.value;
  return false;
}

function explainFalse(term: Term, url: UrlParts): string {
  if (term.kind === "implies") return explainFalse(term.right, url);
  if (term.kind === "and") {
    for (let i = 0; i < term.args.length; i++) {
      const arg = evalTerm(term.args[i], url);
      if (!(arg.kind === "bool" && arg.value)) return explainFalse(term.args[i], url);
    }
    return "conjunction failed";
  }
  if (term.kind === "or") return explainOr(term, url);
  if (term.kind === "not") return explainNot(term.arg, url);
  if (term.kind === "eq") return explainEq(term, url);
  if (term.kind === "prefixof") return explainPrefix(term, url);
  if (term.kind === "bool") return "required condition is false";
  return "constraint failed";
}

function explainEq(term: Term, url: UrlParts): string {
  if (term.kind !== "eq") return "equality failed";
  if (term.left.kind === "var" && term.left.name === "port" && term.right.kind === "int") {
    return explainPort(url.port, term.right.value);
  }
  if (term.left.kind === "var" && term.right.kind === "str") {
    const actual = componentString(term.left.name, url);
    if (term.right.value.length === 0) {
      return term.left.name + " is " + displayQuote(actual) + "; required empty " + term.left.name;
    }
    return (
      term.left.name +
      " is " +
      displayQuote(actual) +
      "; required " +
      term.left.name +
      " " +
      displayQuote(term.right.value)
    );
  }
  return "equality failed";
}

function explainPort(actual: number, expected: number): string {
  if (expected < 0) {
    if (actual < 0) return "port is omitted; required omitted port";
    return "port is " + formatInt(actual) + "; required omitted port";
  }
  if (actual < 0) return "port is omitted; required explicit port " + formatInt(expected);
  return "port is " + formatInt(actual) + "; required explicit port " + formatInt(expected);
}

function explainNot(arg: Term, url: UrlParts): string {
  if (arg.kind === "eq" && arg.left.kind === "var" && arg.left.name === "port" && arg.right.kind === "int") {
    if (arg.right.value < 0) {
      if (url.port < 0) return "port is omitted; required an explicit port";
      return "port is " + formatInt(url.port) + "; required a different port";
    }
  }
  if (arg.kind === "eq" && arg.left.kind === "var" && arg.right.kind === "str") {
    const actual = componentString(arg.left.name, url);
    if (arg.right.value.length === 0) {
      return arg.left.name + " is empty; required non-empty " + arg.left.name;
    }
    return (
      arg.left.name +
      " is " +
      displayQuote(actual) +
      "; required " +
      arg.left.name +
      " to differ from " +
      displayQuote(arg.right.value)
    );
  }
  return "negated constraint failed";
}

function explainOr(term: Term, url: UrlParts): string {
  if (term.kind !== "or" || term.args.length === 0) return "disjunction failed";
  const first = term.args[0];
  if (first.kind === "eq" && first.left.kind === "var" && first.right.kind === "str") {
    const name = first.left.name;
    let allEq = true;
    const options: string[] = [];
    for (let i = 0; i < term.args.length; i++) {
      const arg = term.args[i];
      if (!(arg.kind === "eq" && arg.left.kind === "var" && arg.left.name === name && arg.right.kind === "str")) {
        allEq = false;
        break;
      }
      options.push(displayQuote(arg.right.value));
    }
    if (allEq) {
      let list = "";
      for (let i = 0; i < options.length; i++) {
        if (i > 0) list += ", ";
        list += options[i];
      }
      return (
        name +
        " is " +
        displayQuote(componentString(name, url)) +
        "; required " +
        name +
        " to be one of " +
        list
      );
    }
  }
  return "disjunction failed";
}

function explainPrefix(term: Term, url: UrlParts): string {
  if (term.kind !== "prefixof") return "prefix constraint failed";
  const name = term.full.kind === "var" ? term.full.name : "value";
  const actual = term.full.kind === "var" ? componentString(term.full.name, url) : "";
  const prefix = term.prefix.kind === "str" ? term.prefix.value : "";
  return name + " is " + displayQuote(actual) + "; required " + name + " to start with " + displayQuote(prefix);
}

function componentString(name: string, url: UrlParts): string {
  if (name === "scheme") return url.scheme;
  if (name === "userinfo") return url.userinfo;
  if (name === "host") return url.host;
  if (name === "path") return url.path;
  if (name === "query") return url.query;
  if (name === "fragment") return url.fragment;
  return "";
}
