/**
 * Evaluation and printing for predicate terms.
 * Partial assignments use three-valued logic: an assertion is pruned only
 * when it is forced false, which keeps the search sound.
 */

import { findEnum, type Spec, type SymbolDecl, type Term } from "./spec.ts";
import { displayQuote, formatInt, formatSmtInt } from "./text.ts";

export const T_FALSE = 0;
export const T_TRUE = 1;
export const T_UNKNOWN = 2;

export class Binding {
  known: boolean[];
  code: number[];
  text: string[];

  constructor(n: number) {
    this.known = [];
    this.code = [];
    this.text = [];
    for (let i = 0; i < n; i++) {
      this.known.push(false);
      this.code.push(0);
      this.text.push("");
    }
  }

  copy(): Binding {
    const next = new Binding(this.code.length);
    for (let i = 0; i < this.code.length; i++) {
      next.known[i] = this.known[i];
      next.code[i] = this.code[i];
      next.text[i] = this.text[i];
    }
    return next;
  }
}

interface Value {
  known: boolean;
  kind: string;
  code: number;
  text: string;
}

function unknownValue(): Value {
  return { known: false, kind: "", code: 0, text: "" };
}

function knownValue(kind: string, code: number): Value {
  return { known: true, kind: kind, code: code, text: "" };
}

function knownText(text: string): Value {
  return { known: true, kind: "string", code: 0, text: text };
}

export function evalBool(term: Term, spec: Spec, env: Binding): number {
  if (term.kind === "bool") return term.value ? T_TRUE : T_FALSE;
  if (term.kind === "sym") {
    if (!env.known[term.index]) return T_UNKNOWN;
    const sym = spec.symbols[term.index];
    if (sym.sort.kind !== "bool") return T_UNKNOWN;
    return env.code[term.index] === 1 ? T_TRUE : T_FALSE;
  }
  if (term.kind === "not") {
    const inner = evalBool(term.term, spec, env);
    if (inner === T_UNKNOWN) return T_UNKNOWN;
    return inner === T_TRUE ? T_FALSE : T_TRUE;
  }
  if (term.kind === "and") {
    const left = evalBool(term.left, spec, env);
    const right = evalBool(term.right, spec, env);
    if (left === T_FALSE || right === T_FALSE) return T_FALSE;
    if (left === T_TRUE && right === T_TRUE) return T_TRUE;
    return T_UNKNOWN;
  }
  if (term.kind === "or") {
    const left = evalBool(term.left, spec, env);
    const right = evalBool(term.right, spec, env);
    if (left === T_TRUE || right === T_TRUE) return T_TRUE;
    if (left === T_FALSE && right === T_FALSE) return T_FALSE;
    return T_UNKNOWN;
  }
  if (
    term.kind === "eq" ||
    term.kind === "neq" ||
    term.kind === "lt" ||
    term.kind === "le" ||
    term.kind === "gt" ||
    term.kind === "ge"
  ) {
    return evalCmp(term, spec, env);
  }
  if (term.kind === "empty") return evalEmpty(term.term, spec, env);
  if (term.kind === "prefix" || term.kind === "suffix" || term.kind === "contains") return evalTextOp(term, spec, env);
  return T_UNKNOWN;
}

function evalCmp(term: Term, spec: Spec, env: Binding): number {
  if (
    term.kind !== "eq" &&
    term.kind !== "neq" &&
    term.kind !== "lt" &&
    term.kind !== "le" &&
    term.kind !== "gt" &&
    term.kind !== "ge"
  ) {
    return T_UNKNOWN;
  }
  const left = evalValue(term.left, spec, env);
  const right = evalValue(term.right, spec, env);
  if (!left.known || !right.known) return T_UNKNOWN;
  if (left.kind !== right.kind) return T_UNKNOWN;
  if (left.kind === "string") {
    const same = left.text === right.text;
    if (term.kind === "eq") return same ? T_TRUE : T_FALSE;
    if (term.kind === "neq") return same ? T_FALSE : T_TRUE;
    return T_UNKNOWN;
  }
  const eq = left.code === right.code;
  if (term.kind === "eq") return eq ? T_TRUE : T_FALSE;
  if (term.kind === "neq") return eq ? T_FALSE : T_TRUE;
  if (left.kind !== "int") return T_UNKNOWN;
  if (term.kind === "lt") return left.code < right.code ? T_TRUE : T_FALSE;
  if (term.kind === "le") return left.code <= right.code ? T_TRUE : T_FALSE;
  if (term.kind === "gt") return left.code > right.code ? T_TRUE : T_FALSE;
  return left.code >= right.code ? T_TRUE : T_FALSE;
}

function evalEmpty(term: Term, spec: Spec, env: Binding): number {
  const value = evalValue(term, spec, env);
  if (!value.known) return T_UNKNOWN;
  if (value.kind === "string") return value.text.length === 0 ? T_TRUE : T_FALSE;
  if (value.kind === "int") return value.code === -1 ? T_TRUE : T_FALSE;
  return T_UNKNOWN;
}

function evalTextOp(term: Term, spec: Spec, env: Binding): number {
  if (term.kind !== "prefix" && term.kind !== "suffix" && term.kind !== "contains") return T_UNKNOWN;
  const left = evalValue(term.left, spec, env);
  const right = evalValue(term.right, spec, env);
  if (!left.known || !right.known) return T_UNKNOWN;
  if (left.kind !== "string" || right.kind !== "string") return T_UNKNOWN;
  let holds = false;
  if (term.kind === "prefix") holds = hasPrefix(left.text, right.text);
  else if (term.kind === "suffix") holds = hasSuffix(left.text, right.text);
  else holds = left.text.indexOf(right.text) >= 0;
  return holds ? T_TRUE : T_FALSE;
}

function hasPrefix(text: string, prefix: string): boolean {
  if (prefix.length > text.length) return false;
  return text.slice(0, prefix.length) === prefix;
}

function hasSuffix(text: string, suffix: string): boolean {
  if (suffix.length > text.length) return false;
  return text.slice(text.length - suffix.length) === suffix;
}

function evalValue(term: Term, spec: Spec, env: Binding): Value {
  if (term.kind === "bool") return knownValue("bool", term.value ? 1 : 0);
  if (term.kind === "int") return knownValue("int", term.value);
  if (term.kind === "enum") return knownValue("enum:" + term.enumName, term.index);
  if (term.kind === "str") return knownText(term.value);
  if (term.kind === "sym") {
    if (!env.known[term.index]) return unknownValue();
    const sym = spec.symbols[term.index];
    if (sym.sort.kind === "bool") return knownValue("bool", env.code[term.index] === 1 ? 1 : 0);
    if (sym.sort.kind === "int") return knownValue("int", env.code[term.index]);
    if (sym.sort.kind === "string") return knownText(env.text[term.index]);
    return knownValue("enum:" + sym.sort.enumName, env.code[term.index]);
  }
  if (term.kind === "add" || term.kind === "sub") {
    const left = evalValue(term.left, spec, env);
    const right = evalValue(term.right, spec, env);
    if (!left.known || !right.known) return unknownValue();
    if (left.kind !== "int" || right.kind !== "int") return unknownValue();
    const code = term.kind === "add" ? left.code + right.code : left.code - right.code;
    return knownValue("int", code);
  }
  return unknownValue();
}

export function evalAssertion(antecedent: Term | null, consequent: Term, spec: Spec, env: Binding): number {
  const guard = antecedent === null ? T_TRUE : evalBool(antecedent, spec, env);
  if (guard === T_FALSE) return T_TRUE;
  const body = evalBool(consequent, spec, env);
  if (body === T_TRUE) return T_TRUE;
  if (guard === T_TRUE && body === T_FALSE) return T_FALSE;
  return T_UNKNOWN;
}

function isSimple(term: Term): boolean {
  return term.kind === "bool" || term.kind === "int" || term.kind === "enum" || term.kind === "sym" || term.kind === "str";
}

export function formatTerm(term: Term): string {
  if (term.kind === "bool") return term.value ? "true" : "false";
  if (term.kind === "int") return formatInt(term.value);
  if (term.kind === "enum") return term.variant;
  if (term.kind === "sym") return term.name;
  if (term.kind === "str") return displayQuote(term.value);
  if (term.kind === "empty") return formatTerm(term.term) + " is empty";
  if (term.kind === "prefix") return formatTerm(term.left) + " starts with " + formatTerm(term.right);
  if (term.kind === "suffix") return formatTerm(term.left) + " ends with " + formatTerm(term.right);
  if (term.kind === "contains") return formatTerm(term.left) + " contains " + formatTerm(term.right);
  if (term.kind === "not") {
    if (isSimple(term.term)) return "not " + formatTerm(term.term);
    return "not (" + formatTerm(term.term) + ")";
  }
  if (term.kind === "and") return formatSide(term.left, "and", true) + " and " + formatSide(term.right, "and", false);
  if (term.kind === "or") return formatSide(term.left, "or", true) + " or " + formatSide(term.right, "or", false);
  if (term.kind === "add") return formatSide(term.left, "add", true) + " + " + formatSide(term.right, "add", false);
  if (term.kind === "sub") return formatSide(term.left, "add", true) + " - " + formatSide(term.right, "add", false);
  return formatSide(term.left, "add", true) + " " + cmpOp(term) + " " + formatSide(term.right, "add", true);
}

function formatSide(term: Term, parent: string, isLeft: boolean): string {
  if (needsParen(term, parent, isLeft)) return "(" + formatTerm(term) + ")";
  return formatTerm(term);
}

function needsParen(term: Term, parent: string, isLeft: boolean): boolean {
  if (parent === "or") return term.kind === "or" && !isLeft;
  if (parent === "and") return term.kind === "or" || (term.kind === "and" && !isLeft);
  if (parent === "add") {
    if (term.kind === "or" || term.kind === "and" || term.kind === "not") return true;
    if (term.kind === "eq" || term.kind === "neq" || term.kind === "lt" || term.kind === "le" || term.kind === "gt" || term.kind === "ge") {
      return true;
    }
    if ((term.kind === "add" || term.kind === "sub") && !isLeft) return true;
  }
  return false;
}

function cmpOp(term: Term): string {
  if (term.kind === "eq") return "=";
  if (term.kind === "neq") return "!=";
  if (term.kind === "lt") return "<";
  if (term.kind === "le") return "<=";
  if (term.kind === "gt") return ">";
  if (term.kind === "ge") return ">=";
  return "?";
}

export function formatSmtTerm(term: Term): string {
  if (term.kind === "bool") return term.value ? "true" : "false";
  if (term.kind === "int") return formatSmtInt(term.value);
  if (term.kind === "enum") return term.variant;
  if (term.kind === "sym") return smtSymbol(term.name);
  if (term.kind === "str") return smtString(term.value);
  if (term.kind === "empty") {
    if (term.term.kind === "sym" && term.term.name === "url.port") return "(= " + formatSmtTerm(term.term) + " (- 1))";
    return "(= " + formatSmtTerm(term.term) + " \"\")";
  }
  if (term.kind === "prefix") return "(str.prefixof " + formatSmtTerm(term.right) + " " + formatSmtTerm(term.left) + ")";
  if (term.kind === "suffix") return "(str.suffixof " + formatSmtTerm(term.right) + " " + formatSmtTerm(term.left) + ")";
  if (term.kind === "contains") return "(str.contains " + formatSmtTerm(term.left) + " " + formatSmtTerm(term.right) + ")";
  if (term.kind === "not") return "(not " + formatSmtTerm(term.term) + ")";
  if (term.kind === "and") return "(and " + formatSmtTerm(term.left) + " " + formatSmtTerm(term.right) + ")";
  if (term.kind === "or") return "(or " + formatSmtTerm(term.left) + " " + formatSmtTerm(term.right) + ")";
  if (term.kind === "eq") return "(= " + formatSmtTerm(term.left) + " " + formatSmtTerm(term.right) + ")";
  if (term.kind === "neq") return "(not (= " + formatSmtTerm(term.left) + " " + formatSmtTerm(term.right) + "))";
  if (term.kind === "lt") return "(< " + formatSmtTerm(term.left) + " " + formatSmtTerm(term.right) + ")";
  if (term.kind === "le") return "(<= " + formatSmtTerm(term.left) + " " + formatSmtTerm(term.right) + ")";
  if (term.kind === "gt") return "(> " + formatSmtTerm(term.left) + " " + formatSmtTerm(term.right) + ")";
  if (term.kind === "ge") return "(>= " + formatSmtTerm(term.left) + " " + formatSmtTerm(term.right) + ")";
  if (term.kind === "add") return "(+ " + formatSmtTerm(term.left) + " " + formatSmtTerm(term.right) + ")";
  return "(- " + formatSmtTerm(term.left) + " " + formatSmtTerm(term.right) + ")";
}

function smtSymbol(name: string): string {
  for (let i = 0; i < name.length; i++) {
    const code = name.charCodeAt(i);
    const ident = (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || code === 95 || (i > 0 && code >= 48 && code <= 57);
    if (!ident) return "|" + name + "|";
  }
  return name;
}

function smtString(value: string): string {
  let out = "\"";
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code === 34) out += "\"\"";
    else out += value.slice(i, i + 1);
  }
  return out + "\"";
}

export function formatScenario(spec: Spec, env: Binding): string {
  const lines: string[] = [];
  lines.push("{");
  for (let i = 0; i < spec.symbols.length; i++) {
    const sym = spec.symbols[i];
    const comma = i + 1 < spec.symbols.length ? "," : "";
    lines.push("  \"" + sym.name + "\": " + jsonLiteral(spec, sym, env.code[i], env.text[i]) + comma);
  }
  lines.push("}");
  return lines.join("\n");
}

function jsonLiteral(spec: Spec, sym: SymbolDecl, code: number, text: string): string {
  if (sym.sort.kind === "bool") return code === 1 ? "true" : "false";
  if (sym.sort.kind === "int") return formatInt(code);
  if (sym.sort.kind === "string") return displayQuote(text);
  const decl = findEnum(spec, sym.sort.enumName);
  const variant = decl === null || code < 0 || code >= decl.variants.length ? "?" : decl.variants[code];
  return "\"" + variant + "\"";
}

export function mentionedIndexes(antecedent: Term | null, consequent: Term): number[] {
  const found: number[] = [];
  if (antecedent !== null) collectIndexes(antecedent, found);
  collectIndexes(consequent, found);
  const ordered: number[] = [];
  for (let i = 0; i < found.length; i++) {
    let seen = false;
    for (let j = 0; j < ordered.length; j++) {
      if (ordered[j] === found[i]) seen = true;
    }
    if (!seen) ordered.push(found[i]);
  }
  const sorted: number[] = [];
  for (let i = 0; i < ordered.length; i++) sorted.push(ordered[i]);
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      if (sorted[j] < sorted[i]) {
        const tmp = sorted[i];
        sorted[i] = sorted[j];
        sorted[j] = tmp;
      }
    }
  }
  return sorted;
}

function collectIndexes(term: Term, found: number[]): void {
  if (term.kind === "sym") {
    found.push(term.index);
    return;
  }
  if (term.kind === "not" || term.kind === "empty") {
    collectIndexes(term.term, found);
    return;
  }
  if (
    term.kind === "and" ||
    term.kind === "or" ||
    term.kind === "eq" ||
    term.kind === "neq" ||
    term.kind === "lt" ||
    term.kind === "le" ||
    term.kind === "gt" ||
    term.kind === "ge" ||
    term.kind === "add" ||
    term.kind === "sub" ||
    term.kind === "prefix" ||
    term.kind === "suffix" ||
    term.kind === "contains"
  ) {
    collectIndexes(term.left, found);
    collectIndexes(term.right, found);
  }
}
