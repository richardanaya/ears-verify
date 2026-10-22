/**
 * Parser for an EARS spec with a declared vocabulary.
 *
 * Declarations come first in practice. A requirement can only mention
 * symbols declared above it. Clauses, when present, go in this order:
 * while, when, if, where. `then` is required exactly when an if clause
 * is present. The response is `the <system> shall <boolean>`.
 */

import {
  findEnum,
  findSymbol,
  findVariant,
  type EnumDecl,
  type Requirement,
  type Role,
  type Sort,
  type Spec,
  type SymbolDecl,
  type Term,
} from "./spec.ts";
import { displayQuote } from "./text.ts";

export type SpecResult = { ok: true; spec: Spec } | { ok: false; line: number; message: string };

const RANGE_BOUND = 1000000;

type SortTag = { kind: "bool" } | { kind: "int" } | { kind: "enum"; enumName: string };

type Parsed = { ok: true; term: Term; sort: SortTag } | { ok: false; message: string };

class Cur {
  text: string;
  i: number;

  constructor(text: string) {
    this.text = text;
    this.i = 0;
  }

  skip(): void {
    while (this.i < this.text.length) {
      const code = this.text.charCodeAt(this.i);
      if (code !== 32 && code !== 9 && code !== 10 && code !== 13) break;
      this.i++;
    }
  }

  eof(): boolean {
    this.skip();
    return this.i >= this.text.length;
  }
}

export function parseSpec(text: string): SpecResult {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const lines = splitLines(source);
  const spec: Spec = { enums: [], symbols: [], requirements: [] };
  let index = 0;
  while (index < lines.length) {
    const trimmed = lines[index].trim();
    if (isIgnorable(trimmed)) {
      index++;
      continue;
    }
    if (isDeclaration(trimmed)) {
      const message = parseDeclaration(trimmed, index + 1, spec);
      if (message !== null) return { ok: false, line: index + 1, message: message };
      index++;
      continue;
    }
    const id = matchId(trimmed);
    if (id === null) {
      return {
        ok: false,
        line: index + 1,
        message: "expected a requirement id such as R1, a declaration, a heading, or a comment",
      };
    }
    const startLine = index + 1;
    let sentence = id.rest.trim();
    index++;
    while (index < lines.length) {
      const next = lines[index].trim();
      if (next.length === 0 || isIgnorable(next) || matchId(next) !== null || isDeclaration(next)) break;
      if (sentence.length === 0) sentence = next;
      else sentence += " " + next;
      index++;
    }
    if (sentence.length === 0) {
      return { ok: false, line: startLine, message: "expected a sentence after " + id.id };
    }
    for (let r = 0; r < spec.requirements.length; r++) {
      if (spec.requirements[r].id === id.id) {
        return { ok: false, line: startLine, message: "duplicate requirement " + id.id };
      }
    }
    const parsed = parseSentence(sentence, spec);
    if (!parsed.ok) return { ok: false, line: startLine, message: parsed.message };
    const requirement: Requirement = {
      id: id.id,
      line: startLine,
      sentence: sentence,
      system: parsed.system,
      antecedent: parsed.antecedent,
      consequent: parsed.consequent,
      hasWhen: parsed.hasWhen,
      hasIf: parsed.hasIf,
      whenTerm: parsed.whenTerm,
    };
    spec.requirements.push(requirement);
  }
  return { ok: true, spec: spec };
}

interface IdMatch {
  id: string;
  rest: string;
}

function matchId(line: string): IdMatch | null {
  if (line.length < 2 || line.charCodeAt(0) !== 82) return null;
  let i = 1;
  if (!isDigit(line.charCodeAt(i))) return null;
  while (i < line.length && isDigit(line.charCodeAt(i))) i++;
  while (i < line.length && line.charCodeAt(i) === 46) {
    i++;
    if (i >= line.length || !isDigit(line.charCodeAt(i))) return null;
    while (i < line.length && isDigit(line.charCodeAt(i))) i++;
  }
  if (i < line.length && !isSpace(line.charCodeAt(i))) return null;
  return { id: line.slice(0, i), rest: line.slice(i) };
}

function isDeclaration(line: string): boolean {
  const word = leadingWord(line).toLowerCase();
  return word === "enum" || word === "event" || word === "state" || word === "input" || word === "output" || word === "unwanted";
}

function isIgnorable(line: string): boolean {
  if (line.length === 0) return true;
  if (line.startsWith("#")) return true;
  if (line.startsWith("//")) return true;
  if (line.startsWith("<!--")) return true;
  if (line === "-->") return true;
  return false;
}

function parseDeclaration(line: string, lineNo: number, spec: Spec): string | null {
  const cur = new Cur(line);
  const first = readIdent(cur);
  if (first === null) return "expected a declaration";
  const keyword = first.toLowerCase();
  if (keyword === "enum") return parseEnum(cur, lineNo, spec);
  let unwanted = false;
  let roleWord = keyword;
  if (keyword === "unwanted") {
    unwanted = true;
    const second = readIdent(cur);
    if (second === null || second.toLowerCase() !== "event") return "unwanted only applies to an event";
    roleWord = "event";
  }
  if (roleWord !== "event" && roleWord !== "state" && roleWord !== "input" && roleWord !== "output") {
    return "expected a declaration";
  }
  const role: Role = roleWord;
  const name = readIdent(cur);
  if (name === null) return "expected a symbol name";
  const clash = nameClash(spec, name);
  if (clash.length > 0) return clash;
  cur.skip();
  if (cur.i >= cur.text.length || cur.text.charCodeAt(cur.i) !== 58) return "expected ':'";
  cur.i++;
  const sort = parseSort(cur, spec, role);
  if (typeof sort === "string") return sort;
  if ((role === "event" || role === "state") && sort.kind !== "bool") {
    return role === "event" ? "events must be Bool" : "states must be Bool";
  }
  const described = parseDescription(cur);
  if (!described.ok) return described.message;
  if (!cur.eof()) return "unexpected trailing text";
  const decl: SymbolDecl = {
    role: role,
    name: name,
    sort: sort,
    description: described.text,
    unwanted: unwanted,
    line: lineNo,
    source: line,
  };
  spec.symbols.push(decl);
  return null;
}

function parseEnum(cur: Cur, lineNo: number, spec: Spec): string | null {
  const name = readIdent(cur);
  if (name === null) return "expected an enum name";
  const clash = nameClash(spec, name);
  if (clash.length > 0) return clash;
  cur.skip();
  if (cur.i >= cur.text.length || cur.text.charCodeAt(cur.i) !== 123) return "expected '{'";
  cur.i++;
  const variants: string[] = [];
  cur.skip();
  if (cur.i < cur.text.length && cur.text.charCodeAt(cur.i) === 125) return "expected a variant";
  while (!cur.eof()) {
    const variant = readIdent(cur);
    if (variant === null) return "expected a variant";
    const variantClash = nameClash(spec, variant);
    if (variantClash.length > 0) return variantClash;
    for (let i = 0; i < variants.length; i++) {
      if (variants[i] === variant) return displayQuote(variant) + " is already an enum variant";
    }
    variants.push(variant);
    cur.skip();
    if (cur.i < cur.text.length && cur.text.charCodeAt(cur.i) === 44) {
      cur.i++;
      cur.skip();
      if (cur.i < cur.text.length && cur.text.charCodeAt(cur.i) === 125) return "trailing comma";
      continue;
    }
    break;
  }
  cur.skip();
  if (cur.i >= cur.text.length || cur.text.charCodeAt(cur.i) !== 125) return "expected '}'";
  cur.i++;
  if (!cur.eof()) return "unexpected trailing text";
  const decl: EnumDecl = { name: name, variants: variants, line: lineNo };
  spec.enums.push(decl);
  return null;
}

function parseSort(cur: Cur, spec: Spec, role: Role): Sort | string {
  const word = readIdent(cur);
  if (word === null) return "expected a type";
  const lower = word.toLowerCase();
  if (lower === "bool") return { kind: "bool" };
  if (lower === "int") {
    if (role === "event" || role === "state") return role === "event" ? "events must be Bool" : "states must be Bool";
    const min = readSigned(cur);
    if (min === null) return "expected an integer range such as 1..10";
    cur.skip();
    if (cur.i + 1 >= cur.text.length || cur.text.charCodeAt(cur.i) !== 46 || cur.text.charCodeAt(cur.i + 1) !== 46) {
      return "expected '..' in the integer range";
    }
    cur.i += 2;
    const max = readSigned(cur);
    if (max === null) return "expected the end of the integer range";
    if (min < -RANGE_BOUND || max > RANGE_BOUND) return "integer range must stay inside -1000000..1000000";
    if (min > max) return "integer range min is greater than max";
    return { kind: "int", min: min, max: max };
  }
  const enumDecl = findEnum(spec, word);
  if (enumDecl === null) return "unknown enum " + displayQuote(word);
  if (role === "event" || role === "state") return role === "event" ? "events must be Bool" : "states must be Bool";
  return { kind: "enum", enumName: enumDecl.name };
}

function parseDescription(cur: Cur): { ok: true; text: string } | { ok: false; message: string } {
  cur.skip();
  if (cur.i >= cur.text.length || cur.text.charCodeAt(cur.i) !== 34) {
    return { ok: false, message: "expected a description in quotes" };
  }
  cur.i++;
  let out = "";
  while (cur.i < cur.text.length) {
    const code = cur.text.charCodeAt(cur.i);
    if (code === 34) {
      cur.i++;
      if (out.length === 0) return { ok: false, message: "expected a description" };
      return { ok: true, text: out };
    }
    if (code === 10 || code === 13) return { ok: false, message: "description cannot contain a newline" };
    if (code === 92) {
      cur.i++;
      if (cur.i >= cur.text.length) return { ok: false, message: "unterminated string" };
      const esc = cur.text.charCodeAt(cur.i);
      if (esc === 110 || esc === 114) return { ok: false, message: "description cannot contain a newline" };
      if (esc === 34 || esc === 92 || esc === 47) out += cur.text.slice(cur.i, cur.i + 1);
      else if (esc === 116) out += "\t";
      else return { ok: false, message: "bad escape in description" };
      cur.i++;
      continue;
    }
    out += cur.text.slice(cur.i, cur.i + 1);
    cur.i++;
  }
  return { ok: false, message: "unterminated string" };
}

interface SentenceOk {
  ok: true;
  system: string;
  antecedent: Term | null;
  consequent: Term;
  hasWhen: boolean;
  hasIf: boolean;
  whenTerm: Term | null;
}

type SentenceResult = SentenceOk | { ok: false; message: string };

function parseSentence(sentence: string, spec: Spec): SentenceResult {
  if (sentence.charCodeAt(sentence.length - 1) !== 46) return { ok: false, message: "expected a period" };
  const body = sentence.slice(0, sentence.length - 1).trim();
  if (body.length === 0) return { ok: false, message: "expected a sentence" };
  const parts = splitCommas(body);
  if (parts === null) return { ok: false, message: "unbalanced parentheses" };
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].length === 0) return { ok: false, message: "empty clause" };
  }
  const guards: Term[] = [];
  let hasWhen = false;
  let hasIf = false;
  let whenTerm: Term | null = null;
  let lastKeyword = -1;
  const keywords = ["while", "when", "if", "where"];
  for (let i = 0; i < parts.length - 1; i++) {
    const cur = new Cur(parts[i]);
    const word = readIdent(cur);
    if (word === null) return { ok: false, message: "expected while, when, if, or where" };
    const keyword = word.toLowerCase();
    let keyIndex = -1;
    for (let k = 0; k < keywords.length; k++) {
      if (keywords[k] === keyword) keyIndex = k;
    }
    if (keyIndex < 0) return { ok: false, message: "expected while, when, if, or where" };
    if (keyIndex === lastKeyword) return { ok: false, message: "repeated " + keyword + " clause" };
    if (keyIndex < lastKeyword) return { ok: false, message: "expected while, when, if, where in that order" };
    lastKeyword = keyIndex;
    const condition = parsePredicate(cur.text.slice(cur.i), spec, "condition");
    if (!condition.ok) return condition;
    if (condition.sort.kind !== "bool") return { ok: false, message: "expected a boolean" };
    guards.push(condition.term);
    if (keyword === "when") {
      hasWhen = true;
      whenTerm = condition.term;
    }
    if (keyword === "if") hasIf = true;
  }
  const response = parseResponse(parts[parts.length - 1], spec, hasIf);
  if (!response.ok) return response;
  return {
    ok: true,
    system: response.system,
    antecedent: andAll(guards),
    consequent: response.consequent,
    hasWhen: hasWhen,
    hasIf: hasIf,
    whenTerm: whenTerm,
  };
}

interface ResponseOk {
  ok: true;
  system: string;
  consequent: Term;
}

function parseResponse(text: string, spec: Spec, hasIf: boolean): ResponseOk | { ok: false; message: string } {
  const cur = new Cur(text);
  const first = readIdent(cur);
  if (first === null) return { ok: false, message: "expected the system name" };
  let rest = text;
  let hasThen = false;
  if (first.toLowerCase() === "then") {
    hasThen = true;
    rest = cur.text.slice(cur.i);
  } else {
    cur.i = 0;
  }
  if (hasIf && !hasThen) return { ok: false, message: "expected \"then\"" };
  if (!hasIf && hasThen) return { ok: false, message: "unexpected \"then\" without an if clause" };
  const body = new Cur(rest);
  const theWord = readIdent(body);
  if (theWord === null || theWord.toLowerCase() !== "the") return { ok: false, message: "expected \"the\"" };
  let system = "";
  while (true) {
    const save = body.i;
    const word = readSystemWord(body);
    if (word === null) {
      body.i = save;
      return { ok: false, message: "expected \"shall\"" };
    }
    const lower = word.toLowerCase();
    if (lower === "shall") break;
    if (lower === "should" || lower === "must" || lower === "will") {
      return { ok: false, message: "expected \"shall\"" };
    }
    if (system.length === 0) system = word;
    else system += " " + word;
  }
  if (system.length === 0) return { ok: false, message: "expected a system name before shall" };
  const predText = body.text.slice(body.i);
  if (predText.trim().length === 0) return { ok: false, message: "expected a response" };
  const pred = parsePredicate(predText, spec, "response");
  if (!pred.ok) return pred;
  if (pred.sort.kind !== "bool") return { ok: false, message: "expected a boolean" };
  return { ok: true, system: system, consequent: pred.term };
}

function parsePredicate(text: string, spec: Spec, slot: string): Parsed {
  const cur = new Cur(text);
  if (cur.eof()) return { ok: false, message: slot === "response" ? "expected a response" : "expected a condition" };
  const parsed = parseOr(cur, spec);
  if (!parsed.ok) return parsed;
  if (!cur.eof()) {
    const word = peekIdent(cur);
    if (word.length > 0) return { ok: false, message: "unexpected " + displayQuote(word) };
    return { ok: false, message: "unexpected trailing text" };
  }
  return parsed;
}

function parseOr(cur: Cur, spec: Spec): Parsed {
  let left = parseAnd(cur, spec);
  if (!left.ok) return left;
  while (consumeWord(cur, "or")) {
    const right = parseAnd(cur, spec);
    if (!right.ok) return right;
    if (left.sort.kind !== "bool" || right.sort.kind !== "bool") return { ok: false, message: "or expects booleans" };
    left = { ok: true, term: { kind: "or", left: left.term, right: right.term }, sort: { kind: "bool" } };
  }
  return left;
}

function parseAnd(cur: Cur, spec: Spec): Parsed {
  let left = parseNot(cur, spec);
  if (!left.ok) return left;
  while (consumeWord(cur, "and")) {
    const right = parseNot(cur, spec);
    if (!right.ok) return right;
    if (left.sort.kind !== "bool" || right.sort.kind !== "bool") return { ok: false, message: "and expects booleans" };
    left = { ok: true, term: { kind: "and", left: left.term, right: right.term }, sort: { kind: "bool" } };
  }
  return left;
}

function parseNot(cur: Cur, spec: Spec): Parsed {
  if (consumeWord(cur, "not")) {
    const inner = parseNot(cur, spec);
    if (!inner.ok) return inner;
    if (inner.sort.kind !== "bool") return { ok: false, message: "not expects a boolean" };
    return { ok: true, term: { kind: "not", term: inner.term }, sort: { kind: "bool" } };
  }
  return parseCmp(cur, spec);
}

function parseCmp(cur: Cur, spec: Spec): Parsed {
  const left = parseSum(cur, spec);
  if (!left.ok) return left;
  const op = peekOp(cur);
  if (op.length === 0) return left;
  cur.skip();
  cur.i += op.length;
  const right = parseSum(cur, spec);
  if (!right.ok) return right;
  if (op === "=" || op === "!=") {
    if (!sameSort(left.sort, right.sort)) {
      return { ok: false, message: "cannot compare " + sortName(left.sort) + " with " + sortName(right.sort) };
    }
    const kind = op === "=" ? "eq" : "neq";
    return { ok: true, term: { kind: kind, left: left.term, right: right.term }, sort: { kind: "bool" } };
  }
  if (left.sort.kind !== "int" || right.sort.kind !== "int") return { ok: false, message: "comparison expects integers" };
  let kind: "lt" | "le" | "gt" | "ge" = "lt";
  if (op === "<") kind = "lt";
  else if (op === "<=") kind = "le";
  else if (op === ">") kind = "gt";
  else kind = "ge";
  return { ok: true, term: { kind: kind, left: left.term, right: right.term }, sort: { kind: "bool" } };
}

function parseSum(cur: Cur, spec: Spec): Parsed {
  let left = parseUnary(cur, spec);
  if (!left.ok) return left;
  while (true) {
    const op = peekAdd(cur);
    if (op.length === 0) return left;
    cur.skip();
    cur.i += 1;
    const right = parseUnary(cur, spec);
    if (!right.ok) return right;
    if (left.sort.kind !== "int" || right.sort.kind !== "int") return { ok: false, message: op + " expects integers" };
    if (op === "+") left = { ok: true, term: { kind: "add", left: left.term, right: right.term }, sort: { kind: "int" } };
    else left = { ok: true, term: { kind: "sub", left: left.term, right: right.term }, sort: { kind: "int" } };
  }
}

function parseUnary(cur: Cur, spec: Spec): Parsed {
  const save = cur.i;
  cur.skip();
  if (cur.i < cur.text.length && cur.text.charCodeAt(cur.i) === 45) {
    const after = cur.i + 1;
    const code = after < cur.text.length ? cur.text.charCodeAt(after) : 0;
    if (code !== 61) {
      cur.i++;
      const inner = parseUnary(cur, spec);
      if (!inner.ok) return inner;
      if (inner.sort.kind !== "int") return { ok: false, message: "unary minus expects an integer" };
      if (inner.term.kind === "int") {
        return { ok: true, term: { kind: "int", value: -inner.term.value }, sort: { kind: "int" } };
      }
      return {
        ok: true,
        term: { kind: "sub", left: { kind: "int", value: 0 }, right: inner.term },
        sort: { kind: "int" },
      };
    }
  }
  cur.i = save;
  return parseAtom(cur, spec);
}

function parseAtom(cur: Cur, spec: Spec): Parsed {
  cur.skip();
  if (cur.i >= cur.text.length) return { ok: false, message: "expected an expression" };
  const code = cur.text.charCodeAt(cur.i);
  if (code === 40) {
    cur.i++;
    const inner = parseOr(cur, spec);
    if (!inner.ok) return inner;
    cur.skip();
    if (cur.i >= cur.text.length || cur.text.charCodeAt(cur.i) !== 41) return { ok: false, message: "expected ')'" };
    cur.i++;
    return inner;
  }
  if (isDigit(code)) {
    const value = readPositive(cur);
    if (value === null) return { ok: false, message: "integer is too long" };
    return { ok: true, term: { kind: "int", value: value }, sort: { kind: "int" } };
  }
  const word = readRawIdent(cur);
  if (word === null) return { ok: false, message: "expected an expression" };
  const lower = word.toLowerCase();
  if (lower === "true") return { ok: true, term: { kind: "bool", value: true }, sort: { kind: "bool" } };
  if (lower === "false") return { ok: true, term: { kind: "bool", value: false }, sort: { kind: "bool" } };
  if (isReserved(word)) return { ok: false, message: "unexpected " + displayQuote(word) };
  const symbol = findSymbol(spec, word);
  if (symbol >= 0) {
    const decl = spec.symbols[symbol];
    let sort: SortTag = { kind: "bool" };
    if (decl.sort.kind === "int") sort = { kind: "int" };
    else if (decl.sort.kind === "enum") sort = { kind: "enum", enumName: decl.sort.enumName };
    return { ok: true, term: { kind: "sym", name: decl.name, index: symbol }, sort: sort };
  }
  const variant = findVariant(spec, word);
  if (variant !== null) {
    return {
      ok: true,
      term: { kind: "enum", enumName: variant.enumName, variant: word, index: variant.index },
      sort: { kind: "enum", enumName: variant.enumName },
    };
  }
  return { ok: false, message: "unknown symbol " + displayQuote(word) };
}

function andAll(terms: Term[]): Term | null {
  if (terms.length === 0) return null;
  let acc = terms[0];
  for (let i = 1; i < terms.length; i++) acc = { kind: "and", left: acc, right: terms[i] };
  return acc;
}

function splitCommas(text: string): string[] | null {
  const parts: string[] = [];
  let start = 0;
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code === 40) depth++;
    else if (code === 41) {
      depth--;
      if (depth < 0) return null;
    } else if (code === 44 && depth === 0) {
      parts.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  if (depth !== 0) return null;
  parts.push(text.slice(start).trim());
  return parts;
}

function sameSort(left: SortTag, right: SortTag): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "enum" && right.kind === "enum") return left.enumName === right.enumName;
  return true;
}

function sortName(sort: SortTag): string {
  if (sort.kind === "bool") return "Bool";
  if (sort.kind === "int") return "Int";
  return sort.enumName;
}

function nameClash(spec: Spec, name: string): string {
  if (isReserved(name)) return displayQuote(name) + " is a reserved word";
  if (findSymbol(spec, name) >= 0) return displayQuote(name) + " is already a symbol";
  if (findEnum(spec, name) !== null) return displayQuote(name) + " is already an enum";
  if (findVariant(spec, name) !== null) return displayQuote(name) + " is already an enum variant";
  return "";
}

function isReserved(name: string): boolean {
  const word = name.toLowerCase();
  return (
    word === "not" ||
    word === "and" ||
    word === "or" ||
    word === "true" ||
    word === "false" ||
    word === "while" ||
    word === "when" ||
    word === "if" ||
    word === "where" ||
    word === "then" ||
    word === "the" ||
    word === "shall" ||
    word === "should" ||
    word === "must" ||
    word === "will" ||
    word === "event" ||
    word === "state" ||
    word === "input" ||
    word === "output" ||
    word === "unwanted" ||
    word === "enum" ||
    word === "bool" ||
    word === "int"
  );
}

function consumeWord(cur: Cur, expected: string): boolean {
  const save = cur.i;
  const word = readIdent(cur);
  if (word !== null && word.toLowerCase() === expected) return true;
  cur.i = save;
  return false;
}

function peekIdent(cur: Cur): string {
  const save = cur.i;
  const word = readIdent(cur);
  cur.i = save;
  if (word === null) return "";
  return word;
}

function peekOp(cur: Cur): string {
  const save = cur.i;
  cur.skip();
  const two = cur.text.slice(cur.i, cur.i + 2);
  cur.i = save;
  if (two === "!=" || two === "<=" || two === ">=") return two;
  if (two.length === 0) return "";
  const one = two.slice(0, 1);
  if (one === "=" || one === "<" || one === ">") return one;
  return "";
}

function peekAdd(cur: Cur): string {
  const save = cur.i;
  cur.skip();
  if (cur.i >= cur.text.length) {
    cur.i = save;
    return "";
  }
  const ch = cur.text.slice(cur.i, cur.i + 1);
  cur.i = save;
  if (ch === "+" || ch === "-") return ch;
  return "";
}

function readIdent(cur: Cur): string | null {
  cur.skip();
  return readRawIdent(cur);
}

function readRawIdent(cur: Cur): string | null {
  if (cur.i >= cur.text.length || !isIdentStart(cur.text.charCodeAt(cur.i))) return null;
  const start = cur.i;
  cur.i++;
  while (cur.i < cur.text.length && isIdentPart(cur.text.charCodeAt(cur.i))) cur.i++;
  return cur.text.slice(start, cur.i);
}

function readSystemWord(cur: Cur): string | null {
  cur.skip();
  if (cur.i >= cur.text.length || !isIdentStart(cur.text.charCodeAt(cur.i))) return null;
  const start = cur.i;
  cur.i++;
  while (cur.i < cur.text.length) {
    const code = cur.text.charCodeAt(cur.i);
    if (isIdentPart(code) || code === 45) {
      cur.i++;
      continue;
    }
    break;
  }
  return cur.text.slice(start, cur.i);
}

function readSigned(cur: Cur): number | null {
  const save = cur.i;
  cur.skip();
  let negative = false;
  if (cur.i < cur.text.length && cur.text.charCodeAt(cur.i) === 45) {
    negative = true;
    cur.i++;
  }
  if (cur.i >= cur.text.length || !isDigit(cur.text.charCodeAt(cur.i))) {
    cur.i = save;
    return null;
  }
  const value = readPositive(cur);
  if (value === null) return null;
  return negative ? -value : value;
}

function readPositive(cur: Cur): number | null {
  if (cur.i >= cur.text.length || !isDigit(cur.text.charCodeAt(cur.i))) return null;
  if (cur.text.charCodeAt(cur.i) === 48) {
    const next = cur.i + 1;
    if (next < cur.text.length && isDigit(cur.text.charCodeAt(next))) return null;
    cur.i++;
    return 0;
  }
  let value = 0;
  let digits = 0;
  while (cur.i < cur.text.length && isDigit(cur.text.charCodeAt(cur.i))) {
    value = value * 10 + (cur.text.charCodeAt(cur.i) - 48);
    cur.i++;
    digits++;
    if (digits > 9) return null;
  }
  return value;
}

function leadingWord(line: string): string {
  let i = 0;
  while (i < line.length && isSpace(line.charCodeAt(i))) i++;
  const start = i;
  if (i >= line.length || !isIdentStart(line.charCodeAt(i))) return "";
  i++;
  while (i < line.length && isIdentPart(line.charCodeAt(i))) i++;
  return line.slice(start, i);
}

function splitLines(text: string): string[] {
  const lines: string[] = [];
  let start = 0;
  for (let i = 0; i <= text.length; i++) {
    if (i === text.length || text.charCodeAt(i) === 10) {
      let line = text.slice(start, i);
      if (line.length > 0 && line.charCodeAt(line.length - 1) === 13) line = line.slice(0, line.length - 1);
      lines.push(line);
      start = i + 1;
    }
  }
  return lines;
}

function isDigit(code: number): boolean {
  return code >= 48 && code <= 57;
}

function isSpace(code: number): boolean {
  return code === 32 || code === 9 || code === 10 || code === 13;
}

function isIdentStart(code: number): boolean {
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || code === 95;
}

function isIdentPart(code: number): boolean {
  return isIdentStart(code) || isDigit(code);
}
