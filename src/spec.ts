/**
 * Declared vocabulary of an EARS spec.
 * Events and states are booleans. Inputs and outputs are Bool, Int, or enum.
 * Every Int has an inclusive range so the solver's domain is finite.
 * The seven url.* names are strings (url.port is an Int) and appear when a
 * requirement uses them. The solver does not enumerate strings.
 */

export type Role = "event" | "state" | "input" | "output";

export type Sort =
  | { kind: "bool" }
  | { kind: "int"; min: number; max: number }
  | { kind: "enum"; enumName: string }
  | { kind: "string" };

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
  | { kind: "sym"; name: string; index: number }
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
  | { kind: "sub"; left: Term; right: Term }
  | { kind: "str"; value: string }
  | { kind: "empty"; term: Term }
  | { kind: "prefix"; left: Term; right: Term }
  | { kind: "suffix"; left: Term; right: Term }
  | { kind: "contains"; left: Term; right: Term };

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
  if (sym.sort.kind === "string") return 0;
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
  if (sym.sort.kind === "string") return "\"\"";
  const decl = findEnum(spec, sym.sort.enumName);
  if (decl === null) return "?";
  if (code < 0 || code >= decl.variants.length) return "?";
  return decl.variants[code];
}

export function termMentions(term: Term, index: number): boolean {
  if (term.kind === "sym") return term.index === index;
  if (term.kind === "not" || term.kind === "empty") return termMentions(term.term, index);
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
    return termMentions(term.left, index) || termMentions(term.right, index);
  }
  return false;
}

export function termUsesString(spec: Spec, term: Term): boolean {
  if (term.kind === "str") return true;
  if (term.kind === "sym") return spec.symbols[term.index].sort.kind === "string";
  if (term.kind === "not" || term.kind === "empty") return termUsesString(spec, term.term);
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
    return termUsesString(spec, term.left) || termUsesString(spec, term.right);
  }
  return false;
}

export function requirementUsesString(spec: Spec, req: Requirement): boolean {
  if (req.antecedent !== null && termUsesString(spec, req.antecedent)) return true;
  return termUsesString(spec, req.consequent);
}

const URL_ORDER = ["url.scheme", "url.userinfo", "url.host", "url.port", "url.path", "url.query", "url.fragment"];

export function ensureUrlSymbol(spec: Spec, name: string): number {
  const existing = findSymbol(spec, name);
  if (existing >= 0) return existing;
  let known = false;
  for (let i = 0; i < URL_ORDER.length; i++) {
    if (URL_ORDER[i] === name) known = true;
  }
  if (!known) return -1;
  spec.symbols.push(urlSymbol(name));
  return spec.symbols.length - 1;
}

function urlSymbol(name: string): SymbolDecl {
  if (name === "url.port") {
    return {
      role: "input",
      name: name,
      sort: { kind: "int", min: -1, max: 65535 },
      description: "The TCP port, or -1 when the URL omits it.",
      unwanted: false,
      line: 0,
      source: 'input url.port: Int -1..65535 "The TCP port, or -1 when the URL omits it."',
    };
  }
  let description = "The URL scheme.";
  if (name === "url.userinfo") description = "The userinfo. A canonical URL has none.";
  else if (name === "url.host") description = "The URL host.";
  else if (name === "url.path") description = "The URL path.";
  else if (name === "url.query") description = "The URL query, without the question mark.";
  else if (name === "url.fragment") description = "The URL fragment, without the hash.";
  return {
    role: "input",
    name: name,
    sort: { kind: "string" },
    description: description,
    unwanted: false,
    line: 0,
    source: "input " + name + ': String "' + description + '"',
  };
}

export function requirementMentions(req: Requirement, index: number): boolean {
  if (req.antecedent !== null && termMentions(req.antecedent, index)) return true;
  return termMentions(req.consequent, index);
}
