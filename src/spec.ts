/**
 * Declared vocabulary of an EARS spec.
 * Events and states are booleans. Inputs and outputs are Bool, Int, or enum.
 * Every Int has an inclusive range so the solver's domain is finite.
 */

import { formatInt, replaceWord } from "./text.ts";

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
  /** Verb words that also name this Bool, such as "start the subscription". */
  action: string;
  /** Report template for an Int or enum. `{value}` stands for the number or variant. */
  says: string;
  /** Requirement pattern for an Int or enum. `{value}` and `{op}` are holes. */
  asText: string;
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
 * An integer or enum uses `says` when that template is declared.
 * Otherwise a singular integer reads "the quantity was 12", and a plural
 * or an enum reads "were set to" or "was set to".
 */
export function describeAssignment(sym: SymbolDecl, shown: string, isTrue: boolean): string {
  if (sym.sort.kind === "bool") return reportBool(sym, isTrue);
  return speakBound(sym, shown, "eq", false);
}

/**
 * How a report states an integer or enum comparison.
 * `linked` means the right side is another phrase, so a numeric `says`
 * template is left unused. `rel` is eq, neq, lt, le, gt, or ge.
 */
export function speakBound(sym: SymbolDecl, shown: string, rel: string, linked: boolean): string {
  if (!linked && sym.says.length > 0) return speakSays(sym, shown, rel);
  const name = sym.phrase.length > 0 ? sym.phrase : sym.name;
  const be = copulaOf(name);
  if (linked) return name + " " + be + " " + linkedTail(rel, shown);
  if (rel === "eq") {
    if (sym.sort.kind === "enum" || pluralNoun(name)) return name + " " + be + " set to " + shown;
    return name + " " + be + " " + shown;
  }
  if (rel === "neq") {
    if (sym.sort.kind === "enum" || pluralNoun(name)) return name + " " + be + " not set to " + shown;
    return name + " " + be + " not " + shown;
  }
  return name + " " + be + " " + relationTail(rel, shown);
}

/** The number or variant on the right of a comparison, or empty when it is not a literal. */
export function literalShown(term: Term): string {
  if (term.kind === "int") return formatInt(term.value);
  if (term.kind === "enum") return term.variant;
  return "";
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

/** Insert "not" after the first "was", "were", or "is", or prefix "not" when none is there. */
export function negateReport(text: string): string {
  const afterWas = insertNotAfter(text, "was");
  if (afterWas.length > 0) return afterWas;
  const afterWere = insertNotAfter(text, "were");
  if (afterWere.length > 0) return afterWere;
  const afterIs = insertNotAfter(text, "is");
  if (afterIs.length > 0) return afterIs;
  return "not " + text;
}

function speakSays(sym: SymbolDecl, shown: string, rel: string): string {
  const filled = fillTemplate(sym.says, shown, sym.name);
  if (rel === "eq") return filled;
  if (rel === "neq") return negateReport(filled);
  if (rel === "le") return "at most " + filled;
  if (rel === "ge") return "at least " + filled;
  if (rel === "lt") return "less than " + filled;
  if (rel === "gt") return "greater than " + filled;
  return filled;
}

function fillTemplate(template: string, shown: string, symbolName: string): string {
  let text = replaceToken(template, "{value}", shown);
  text = replaceToken(text, "{name}", shown);
  text = replaceToken(text, "{" + symbolName + "}", shown);
  return text;
}

function replaceToken(text: string, token: string, shown: string): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    if (text.slice(i, i + token.length) === token) {
      out += shown;
      i += token.length;
      continue;
    }
    out += text.slice(i, i + 1);
    i++;
  }
  return out;
}

function linkedTail(rel: string, shown: string): string {
  if (rel === "neq") return "not " + shown;
  return relationTail(rel, shown);
}

function relationTail(rel: string, shown: string): string {
  if (rel === "le") return "at most " + shown;
  if (rel === "ge") return "at least " + shown;
  if (rel === "lt") return "less than " + shown;
  if (rel === "gt") return "greater than " + shown;
  return shown;
}

function copulaOf(phrase: string): string {
  if (pluralNoun(phrase)) return "were";
  return "was";
}

function pluralNoun(phrase: string): boolean {
  const last = lowerLast(phrase);
  if (last.length === 0) return false;
  if (last === "status" || last === "is" || last === "bus") return false;
  if (last.length >= 2 && last.slice(last.length - 2) === "ss") return false;
  if (last.length >= 4 && last.slice(last.length - 4) === "ness") return false;
  return last.slice(last.length - 1) === "s";
}

function lowerLast(phrase: string): string {
  let start = 0;
  for (let i = 0; i < phrase.length; i++) {
    if (phrase.charCodeAt(i) === 32) start = i + 1;
  }
  let out = "";
  for (let i = start; i < phrase.length; i++) {
    const code = phrase.charCodeAt(i);
    if (code >= 65 && code <= 90) out += String.fromCharCode(code + 32);
    else out += phrase.slice(i, i + 1);
  }
  return out;
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
