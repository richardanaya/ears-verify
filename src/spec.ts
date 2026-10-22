/**
 * Declared vocabulary of an EARS spec.
 * Events and states are booleans. Inputs and outputs are Bool, Int, or enum.
 * Every Int has an inclusive range so the solver's domain is finite.
 */

import { replaceWord } from "./text.ts";

export type Role = "event" | "state" | "input" | "output";

export type Sort =
  | { kind: "bool" }
  | { kind: "int"; min: number; max: number }
  | { kind: "enum"; enumName: string };

export interface EnumDecl {
  name: string;
  variants: string[];
  line: number;
}

export interface SymbolDecl {
  role: Role;
  name: string;
  sort: Sort;
  description: string;
  /** Plain words that stand for this symbol in a requirement. Empty means the name is used. */
  phrase: string;
  /** How a report states this Bool when it is true. Empty means the phrase is used. */
  outcomeYes: string;
  /** How a report states this Bool when it is false. Empty means it is derived. */
  outcomeNo: string;
  unwanted: boolean;
  line: number;
  source: string;
}

export interface Requirement {
  id: string;
  line: number;
  sentence: string;
  system: string;
  antecedent: Term | null;
  consequent: Term;
  hasWhen: boolean;
  hasIf: boolean;
  whenTerm: Term | null;
}

export interface Spec {
  enums: EnumDecl[];
  symbols: SymbolDecl[];
  requirements: Requirement[];
}

/**
 * Predicate terms. Sorts are checked when the spec is parsed, so a term
 * that reaches the solver is boolean, integer, or an enum value of one type.
 */
export type Term =
  | { kind: "bool"; value: boolean }
  | { kind: "int"; value: number }
  | { kind: "enum"; enumName: string; variant: string; index: number }
  | { kind: "sym"; name: string; index: number; phrase: string }
  | { kind: "not"; term: Term }
  | { kind: "and"; left: Term; right: Term }
  | { kind: "or"; left: Term; right: Term }
  | { kind: "eq"; left: Term; right: Term }
  | { kind: "neq"; left: Term; right: Term }
  | { kind: "lt"; left: Term; right: Term }
  | { kind: "le"; left: Term; right: Term }
  | { kind: "gt"; left: Term; right: Term }
  | { kind: "ge"; left: Term; right: Term }
  | { kind: "add"; left: Term; right: Term }
  | { kind: "sub"; left: Term; right: Term };

export function findSymbol(spec: Spec, name: string): number {
  for (let i = 0; i < spec.symbols.length; i++) {
    if (spec.symbols[i].name === name) return i;
  }
  return -1;
}

export function findEnum(spec: Spec, name: string): EnumDecl | null {
  for (let i = 0; i < spec.enums.length; i++) {
    if (spec.enums[i].name === name) return spec.enums[i];
  }
  return null;
}

export function findVariant(spec: Spec, variant: string): { enumName: string; index: number } | null {
  for (let i = 0; i < spec.enums.length; i++) {
    const decl = spec.enums[i];
    for (let v = 0; v < decl.variants.length; v++) {
      if (decl.variants[v] === variant) return { enumName: decl.name, index: v };
    }
  }
  return null;
}

export function isDriver(sym: SymbolDecl): boolean {
  return sym.role !== "output";
}

export function domainSize(spec: Spec, sym: SymbolDecl): number {
  if (sym.sort.kind === "bool") return 2;
  if (sym.sort.kind === "int") return sym.sort.max - sym.sort.min + 1;
  const decl = findEnum(spec, sym.sort.enumName);
  if (decl === null) return 0;
  return decl.variants.length;
}

export function codeAt(sym: SymbolDecl, domainIndex: number): number {
  if (sym.sort.kind === "int") return sym.sort.min + domainIndex;
  return domainIndex;
}

export function displayCode(spec: Spec, sym: SymbolDecl, code: number): string {
  if (sym.sort.kind === "bool") return code === 1 ? "true" : "false";
  if (sym.sort.kind === "int") return String(Math.trunc(code));
  const decl = findEnum(spec, sym.sort.enumName);
  if (decl === null) return "?";
  if (code < 0 || code >= decl.variants.length) return "?";
  return decl.variants[code];
}

/**
 * How a report names one assigned symbol.
 * A Bool uses its outcome when one is declared. Otherwise a phrase that
 * contains "is" is stated with "was" or "was not", and any other phrase
 * stays as written, with "not" in front when the Bool is false.
 * An integer or enum phrase is stated with "was".
 */
export function describeAssignment(sym: SymbolDecl, shown: string, isTrue: boolean): string {
  if (sym.sort.kind === "bool") return reportBool(sym, isTrue);
  if (sym.phrase.length === 0) return sym.name + " is " + shown;
  return replaceWord(sym.phrase + " is " + shown, "is", "was");
}

/** How a report states a Bool. */
export function reportBool(sym: SymbolDecl, isTrue: boolean): string {
  if (isTrue && sym.outcomeYes.length > 0) return sym.outcomeYes;
  if (!isTrue && sym.outcomeNo.length > 0) return sym.outcomeNo;
  if (!isTrue && sym.outcomeYes.length > 0) return negateReport(sym.outcomeYes);
  if (sym.phrase.length === 0) return sym.name + " is " + (isTrue ? "true" : "false");
  if (hasWord(sym.phrase, "is")) {
    if (isTrue) return replaceWord(sym.phrase, "is", "was");
    return replaceWord(sym.phrase, "is", "was not");
  }
  if (isTrue) return sym.phrase;
  return "not " + sym.phrase;
}

/** Insert "not" after the first "was" or "is", or prefix "not" when neither is there. */
export function negateReport(text: string): string {
  const afterWas = insertNotAfter(text, "was");
  if (afterWas.length > 0) return afterWas;
  const afterIs = insertNotAfter(text, "is");
  if (afterIs.length > 0) return afterIs;
  return "not " + text;
}

function insertNotAfter(text: string, word: string): string {
  const changed = replaceWord(text, word, word + " not");
  if (changed === text) return "";
  return changed;
}

function hasWord(text: string, word: string): boolean {
  return replaceWord(text, word, word + "\u0001") !== text;
}

export function termMentions(term: Term, index: number): boolean {
  if (term.kind === "sym") return term.index === index;
  if (term.kind === "not") return termMentions(term.term, index);
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
    return termMentions(term.left, index) || termMentions(term.right, index);
  }
  return false;
}

export function requirementMentions(req: Requirement, index: number): boolean {
  if (req.antecedent !== null && termMentions(req.antecedent, index)) return true;
  return termMentions(req.consequent, index);
}
