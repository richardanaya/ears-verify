/**
 * Evaluation and printing for predicate terms.
 * Partial assignments use three-valued logic: an assertion is pruned only
 * when it is forced false, which keeps the search sound.
 */

import { findEnum, type Spec, type SymbolDecl, type Term } from "./spec.ts";
import { formatInt, formatSmtInt } from "./text.ts";

export const T_FALSE = 0;
export const T_TRUE = 1;
export const T_UNKNOWN = 2;

export class Binding {
  known: boolean[];
  code: number[];

  constructor(n: number) {
    this.known = [];
    this.code = [];
    for (let i = 0; i < n; i++) {
      this.known.push(false);
      this.code.push(0);
    }
  }

  copy(): Binding {
    const next = new Binding(this.code.length);
    for (let i = 0; i < this.code.length; i++) {
      next.known[i] = this.known[i];
      next.code[i] = this.code[i];
    }
    return next;
  }
}

interface Value {
  known: boolean;
  kind: string;
  code: number;
}

function unknownValue(): Value {
  return { known: false, kind: "", code: 0 };
}

function knownValue(kind: string, code: number): Value {
  return { known: true, kind: kind, code: code };
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
  const eq = left.code === right.code;
  if (term.kind === "eq") return eq ? T_TRUE : T_FALSE;
  if (term.kind === "neq") return eq ? T_FALSE : T_TRUE;
  if (left.kind !== "int") return T_UNKNOWN;
  if (term.kind === "lt") return left.code < right.code ? T_TRUE : T_FALSE;
  if (term.kind === "le") return left.code <= right.code ? T_TRUE : T_FALSE;
  if (term.kind === "gt") return left.code > right.code ? T_TRUE : T_FALSE;
  return left.code >= right.code ? T_TRUE : T_FALSE;
}

function evalValue(term: Term, spec: Spec, env: Binding): Value {
  if (term.kind === "bool") return knownValue("bool", term.value ? 1 : 0);
  if (term.kind === "int") return knownValue("int", term.value);
  if (term.kind === "enum") return knownValue("enum:" + term.enumName, term.index);
  if (term.kind === "sym") {
    if (!env.known[term.index]) return unknownValue();
    const sym = spec.symbols[term.index];
    if (sym.sort.kind === "bool") return knownValue("bool", env.code[term.index] === 1 ? 1 : 0);
    if (sym.sort.kind === "int") return knownValue("int", env.code[term.index]);
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
  return term.kind === "bool" || term.kind === "int" || term.kind === "enum" || term.kind === "sym";
}

export function formatTerm(term: Term): string {
  if (term.kind === "bool") return term.value ? "true" : "false";
  if (term.kind === "int") return formatInt(term.value);
  if (term.kind === "enum") return term.variant;
  if (term.kind === "sym") {
    if (term.phrase.length > 0) return term.phrase;
    return term.name;
  }
  if (term.kind === "not") {
    if (isSimple(term.term)) return "not " + formatTerm(term.term);
    return "not (" + formatTerm(term.term) + ")";
  }
  if (term.kind === "and") return formatSide(term.left, "and", true) + " and " + formatSide(term.right, "and", false);
  if (term.kind === "or") return formatSide(term.left, "or", true) + " or " + formatSide(term.right, "or", false);
  if (term.kind === "add") return formatSide(term.left, "add", true) + " + " + formatSide(term.right, "add", false);
  if (term.kind === "sub") return formatSide(term.left, "add", true) + " - " + formatSide(term.right, "add", false);
  return formatSide(term.left, "add", true) + " " + comparisonWord(term) + " " + formatSide(term.right, "add", true);
}

function comparisonWord(term: Term): string {
  if (
    term.kind !== "eq" &&
    term.kind !== "neq" &&
    term.kind !== "lt" &&
    term.kind !== "le" &&
    term.kind !== "gt" &&
    term.kind !== "ge"
  ) {
    return "?";
  }
  if (term.left.kind === "sym" && term.left.phrase.length > 0) {
    if (term.kind === "eq") return "is";
    if (term.kind === "neq") return "is not";
    if (term.kind === "lt") return "is less than";
    if (term.kind === "le") return "is at most";
    if (term.kind === "gt") return "is greater than";
    return "is at least";
  }
  return cmpOp(term);
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
  if (term.kind === "sym") return term.name;
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

export function formatScenario(spec: Spec, env: Binding): string {
  const lines: string[] = [];
  lines.push("{");
  for (let i = 0; i < spec.symbols.length; i++) {
    const sym = spec.symbols[i];
    const comma = i + 1 < spec.symbols.length ? "," : "";
    lines.push("  \"" + sym.name + "\": " + jsonLiteral(spec, sym, env.code[i]) + comma);
  }
  lines.push("}");
  return lines.join("\n");
}

function jsonLiteral(spec: Spec, sym: SymbolDecl, code: number): string {
  if (sym.sort.kind === "bool") return code === 1 ? "true" : "false";
  if (sym.sort.kind === "int") return formatInt(code);
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
  if (term.kind === "not") {
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
    term.kind === "sub"
  ) {
    collectIndexes(term.left, found);
    collectIndexes(term.right, found);
  }
}
