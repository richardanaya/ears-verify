/**
 * Parser for an EARS spec with a declared vocabulary.
 *
 * Declarations come first in practice. A requirement can only mention
 * symbols declared above it. Clauses, when present, go in this order:
 * while, when, if, where. `then` is required exactly when an if clause
 * is present. The response is `the <system> shall <boolean>`.
 *
 * A declaration may bind a symbol to a phrase. Matching is the exact
 * word sequence, case-insensitive, and the longest match wins.
 * "is not" inside a phrase that contains "is" is the same symbol, negated.
 * An Int or enum may also bind `as` (how a requirement states it) and
 * `says` (how a report states it). A Bool may bind `action` as a second phrase.
 */

import {
  findEnum,
  findSymbol,
  findVariant,
  negateReport,
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

export type PropertyResult = { ok: true; requirements: Requirement[] } | { ok: false; line: number; message: string };

/** Requirement lines only. Symbols come from the spec this property is checked against. */
export function parseProperty(text: string, spec: Spec): PropertyResult {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const lines = splitLines(source);
  const requirements: Requirement[] = [];
  let index = 0;
  while (index < lines.length) {
    const trimmed = lines[index].trim();
    if (isIgnorable(trimmed)) {
      index++;
      continue;
    }
    if (isDeclaration(trimmed)) {
      return { ok: false, line: index + 1, message: "a property cannot declare symbols" };
    }
    const id = matchId(trimmed);
    if (id === null) {
      return { ok: false, line: index + 1, message: "expected a requirement id such as P1" };
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
    for (let r = 0; r < requirements.length; r++) {
      if (requirements[r].id === id.id) {
        return { ok: false, line: startLine, message: "duplicate requirement " + id.id };
      }
    }
    const parsed = parseSentence(sentence, spec);
    if (!parsed.ok) return { ok: false, line: startLine, message: parsed.message };
    requirements.push({
      id: id.id,
      line: startLine,
      sentence: sentence,
      system: parsed.system,
      antecedent: parsed.antecedent,
      consequent: parsed.consequent,
      hasWhen: parsed.hasWhen,
      hasIf: parsed.hasIf,
      whenTerm: parsed.whenTerm,
    });
  }
  if (requirements.length === 0) return { ok: false, line: 1, message: "expected a requirement" };
  return { ok: true, requirements: requirements };
}

interface IdMatch {
  id: string;
  rest: string;
}

function matchId(line: string): IdMatch | null {
  if (line.length < 2) return null;
  const head = line.charCodeAt(0);
  if (head !== 82 && head !== 80) return null;
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
  const described = parseQuoted(cur, "description");
  if (!described.ok) return described.message;
  const phrased = parseOptionalPhrase(cur, spec);
  if (!phrased.ok) return phrased.message;
  const tail = parseWordingTail(cur, spec, sort, name, phrased.phrase);
  if (!tail.ok) return tail.message;
  const decl: SymbolDecl = {
    role: role,
    name: name,
    sort: sort,
    description: described.text,
    phrase: phrased.phrase,
    outcomeYes: tail.yes,
    outcomeNo: tail.no,
    action: tail.action,
    says: tail.says,
    asText: tail.asText,
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

function parseQuoted(cur: Cur, label: string): { ok: true; text: string } | { ok: false; message: string } {
  cur.skip();
  if (cur.i >= cur.text.length || cur.text.charCodeAt(cur.i) !== 34) {
    return { ok: false, message: "expected a " + label + " in quotes" };
  }
  cur.i++;
  let out = "";
  while (cur.i < cur.text.length) {
    const code = cur.text.charCodeAt(cur.i);
    if (code === 34) {
      cur.i++;
      if (out.length === 0) return { ok: false, message: "expected a " + label };
      return { ok: true, text: out };
    }
    if (code === 10 || code === 13) return { ok: false, message: label + " cannot contain a newline" };
    if (code === 92) {
      cur.i++;
      if (cur.i >= cur.text.length) return { ok: false, message: "unterminated string" };
      const esc = cur.text.charCodeAt(cur.i);
      if (esc === 110 || esc === 114) return { ok: false, message: label + " cannot contain a newline" };
      if (esc === 34 || esc === 92 || esc === 47) out += cur.text.slice(cur.i, cur.i + 1);
      else if (esc === 116) out += "\t";
      else return { ok: false, message: "bad escape in " + label };
      cur.i++;
      continue;
    }
    out += cur.text.slice(cur.i, cur.i + 1);
    cur.i++;
  }
  return { ok: false, message: "unterminated string" };
}

function parseOptionalPhrase(cur: Cur, spec: Spec): { ok: true; phrase: string } | { ok: false; message: string } {
  cur.skip();
  if (cur.eof()) return { ok: true, phrase: "" };
  const save = cur.i;
  const word = readIdent(cur);
  if (word === null || lowerAscii(word) !== "phrase") {
    cur.i = save;
    return { ok: true, phrase: "" };
  }
  const quoted = parseQuoted(cur, "phrase");
  if (!quoted.ok) return quoted;
  const phrase = normalizeSpaces(quoted.text);
  if (phrase.length === 0) return { ok: false, message: "expected a phrase" };
  const clash = phraseClash(spec, phrase);
  if (clash.length > 0) return { ok: false, message: clash };
  return { ok: true, phrase: phrase };
}

interface WordingTail {
  ok: true;
  yes: string;
  no: string;
  action: string;
  says: string;
  asText: string;
}

function parseWordingTail(cur: Cur, spec: Spec, sort: Sort, name: string, phrase: string): WordingTail | { ok: false; message: string } {
  let yes = "";
  let no = "";
  let action = "";
  let says = "";
  let asText = "";
  let sawOutcome = false;
  while (!cur.eof()) {
    const save = cur.i;
    const word = readIdent(cur);
    if (word === null) return { ok: false, message: "unexpected trailing text" };
    const key = lowerAscii(word);
    if (key === "outcome") {
      if (sawOutcome) return { ok: false, message: "repeated outcome" };
      cur.i = save;
      const stated = parseOptionalOutcome(cur, sort);
      if (!stated.ok) return stated;
      yes = stated.yes;
      no = stated.no;
      sawOutcome = true;
      continue;
    }
    if (key === "action") {
      if (action.length > 0) return { ok: false, message: "repeated action" };
      if (sort.kind !== "bool") return { ok: false, message: "action is only for Bool" };
      const quoted = parseQuoted(cur, "action");
      if (!quoted.ok) return { ok: false, message: articleQuote(quoted.message, "action") };
      const text = normalizeSpaces(quoted.text);
      if (phrase.length > 0 && lowerAscii(phrase) === lowerAscii(text)) {
        return { ok: false, message: displayQuote(text) + " is already a phrase" };
      }
      const clash = phraseClash(spec, text);
      if (clash.length > 0) return { ok: false, message: clash };
      action = text;
      continue;
    }
    if (key === "says") {
      if (says.length > 0) return { ok: false, message: "repeated says" };
      if (sort.kind === "bool") return { ok: false, message: "says is only for Int or enum" };
      const quoted = parseQuoted(cur, "says");
      if (!quoted.ok) return { ok: false, message: articleQuote(quoted.message, "says") };
      const text = normalizeSpaces(quoted.text);
      if (!holePresent(text, name)) return { ok: false, message: "says needs {value}" };
      says = text;
      continue;
    }
    if (key === "as") {
      if (asText.length > 0) return { ok: false, message: "repeated as" };
      if (sort.kind === "bool") return { ok: false, message: "as is only for Int or enum" };
      const quoted = parseQuoted(cur, "as");
      if (!quoted.ok) return { ok: false, message: articleQuote(quoted.message, "as") };
      const text = normalizeSpaces(quoted.text);
      const patternError = validateAs(text, name);
      if (patternError !== null) return { ok: false, message: patternError };
      asText = text;
      continue;
    }
    return { ok: false, message: "unexpected trailing text" };
  }
  return { ok: true, yes: yes, no: no, action: action, says: says, asText: asText };
}

function articleQuote(message: string, label: string): string {
  if (message === "expected a " + label) return "expected an " + label;
  if (message === "expected a " + label + " in quotes") return "expected an " + label + " in quotes";
  return message;
}

function holePresent(text: string, symbolName: string): boolean {
  if (containsToken(text, "{value}")) return true;
  if (containsToken(text, "{name}")) return true;
  if (containsToken(text, "{" + symbolName + "}")) return true;
  return false;
}

function containsToken(text: string, token: string): boolean {
  if (token.length === 0 || token.length > text.length) return false;
  for (let i = 0; i + token.length <= text.length; i++) {
    if (text.slice(i, i + token.length) === token) return true;
  }
  return false;
}

function validateAs(text: string, symbolName: string): string | null {
  const tokens = tokenizeAs(text, symbolName);
  if (tokens === null) return "as can only be words, {op}, and {value}";
  let values = 0;
  let ops = 0;
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].kind === "value") values++;
    if (tokens[i].kind === "op") ops++;
  }
  if (values === 0) return "as needs {value}";
  if (values > 1) return "as has more than one {value}";
  if (ops > 1) return "repeated {op}";
  return null;
}

function parseOptionalOutcome(
  cur: Cur,
  sort: Sort,
): { ok: true; yes: string; no: string } | { ok: false; message: string } {
  cur.skip();
  if (cur.eof()) return { ok: true, yes: "", no: "" };
  const save = cur.i;
  const word = readIdent(cur);
  if (word === null || lowerAscii(word) !== "outcome") {
    cur.i = save;
    return { ok: true, yes: "", no: "" };
  }
  if (sort.kind !== "bool") return { ok: false, message: "outcome is only for Bool" };
  const yesQuoted = parseQuoted(cur, "outcome");
  if (!yesQuoted.ok) return { ok: false, message: outcomeQuoteMessage(yesQuoted.message) };
  const yes = normalizeSpaces(yesQuoted.text);
  const yesError = outcomeWords(yes);
  if (yesError !== null) return { ok: false, message: yesError };
  cur.skip();
  if (cur.i < cur.text.length && cur.text.charCodeAt(cur.i) === 47) {
    cur.i++;
    const noQuoted = parseQuoted(cur, "outcome");
    if (!noQuoted.ok) return { ok: false, message: outcomeQuoteMessage(noQuoted.message) };
    const no = normalizeSpaces(noQuoted.text);
    const noError = outcomeWords(no);
    if (noError !== null) return { ok: false, message: noError };
    return { ok: true, yes: yes, no: no };
  }
  return { ok: true, yes: yes, no: negateReport(yes) };
}

function outcomeQuoteMessage(message: string): string {
  if (message === "expected a outcome") return "expected an outcome";
  if (message === "expected a outcome in quotes") return "expected an outcome in quotes";
  return message;
}

function outcomeWords(text: string): string | null {
  if (text.length === 0) return "expected an outcome";
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (isPhraseStop(code) || code === 43) return "an outcome can only be words";
  }
  return null;
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
  const left = parseSum(cur, spec, true);
  if (!left.ok) return left;
  const english = consumeEnglishOp(cur);
  let op = english;
  if (op.length === 0) op = peekOp(cur);
  if (op.length === 0) return left;
  if (english.length === 0) {
    cur.skip();
    cur.i += op.length;
  }
  const right = parseSum(cur, spec, true);
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

function parseSum(cur: Cur, spec: Spec, allowPattern: boolean): Parsed {
  let left = parseUnary(cur, spec, allowPattern);
  if (!left.ok) return left;
  while (true) {
    const op = peekAdd(cur);
    if (op.length === 0) return left;
    cur.skip();
    cur.i += 1;
    const right = parseUnary(cur, spec, allowPattern);
    if (!right.ok) return right;
    if (left.sort.kind !== "int" || right.sort.kind !== "int") return { ok: false, message: op + " expects integers" };
    if (op === "+") left = { ok: true, term: { kind: "add", left: left.term, right: right.term }, sort: { kind: "int" } };
    else left = { ok: true, term: { kind: "sub", left: left.term, right: right.term }, sort: { kind: "int" } };
  }
}

function parseUnary(cur: Cur, spec: Spec, allowPattern: boolean): Parsed {
  const save = cur.i;
  cur.skip();
  if (cur.i < cur.text.length && cur.text.charCodeAt(cur.i) === 45) {
    const after = cur.i + 1;
    const code = after < cur.text.length ? cur.text.charCodeAt(after) : 0;
    if (code !== 61) {
      cur.i++;
      const inner = parseUnary(cur, spec, allowPattern);
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
  return parseAtom(cur, spec, allowPattern);
}

function parseAtom(cur: Cur, spec: Spec, allowPattern: boolean): Parsed {
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
  const save = cur.i;
  const phraseHit = matchPhrase(cur, spec);
  if (!allowPattern) {
    if (phraseHit !== null) {
      cur.i = phraseHit.end;
      return finishPhrase(spec, phraseHit);
    }
  } else {
    const patternHit = matchAsPattern(cur, spec);
    if (patternHit !== null && !patternHit.ok) return { ok: false, message: patternHit.message };
    const patternEnd = patternHit !== null && patternHit.ok ? patternHit.end : -1;
    if (phraseHit !== null && phraseHit.end >= patternEnd) {
      cur.i = phraseHit.end;
      return finishPhrase(spec, phraseHit);
    }
    if (patternHit !== null && patternHit.ok) {
      cur.i = patternHit.end;
      return finishPattern(spec, patternHit);
    }
  }
  cur.i = save;
  const word = readRawIdent(cur);
  if (word === null) {
    if (hasPhrase(spec) && readPhraseWord(cur.text, save) !== null) {
      return unknownPhrase(cur, spec, save);
    }
    return { ok: false, message: "expected an expression" };
  }
  const lower = word.toLowerCase();
  if (lower === "true") return { ok: true, term: { kind: "bool", value: true }, sort: { kind: "bool" } };
  if (lower === "false") return { ok: true, term: { kind: "bool", value: false }, sort: { kind: "bool" } };
  if (isReserved(word)) return { ok: false, message: "unexpected " + displayQuote(word) };
  const symbol = findSymbol(spec, word);
  if (symbol >= 0) return symbolTerm(spec, symbol);
  const variant = findVariant(spec, word);
  if (variant !== null) {
    return {
      ok: true,
      term: { kind: "enum", enumName: variant.enumName, variant: word, index: variant.index },
      sort: { kind: "enum", enumName: variant.enumName },
    };
  }
  if (hasPhrase(spec)) return unknownPhrase(cur, spec, save);
  return { ok: false, message: "unknown symbol " + displayQuote(word) };
}

function symbolTerm(spec: Spec, index: number): Parsed {
  const decl = spec.symbols[index];
  let sort: SortTag = { kind: "bool" };
  if (decl.sort.kind === "int") sort = { kind: "int" };
  else if (decl.sort.kind === "enum") sort = { kind: "enum", enumName: decl.sort.enumName };
  return { ok: true, term: { kind: "sym", name: decl.name, index: index, phrase: decl.phrase }, sort: sort };
}

interface PhraseHit {
  index: number;
  end: number;
  negated: boolean;
}

function finishPhrase(spec: Spec, hit: PhraseHit): Parsed {
  const base = symbolTerm(spec, hit.index);
  if (!base.ok) return base;
  if (!hit.negated) return base;
  if (base.sort.kind !== "bool") return { ok: false, message: "not expects a boolean" };
  return { ok: true, term: { kind: "not", term: base.term }, sort: { kind: "bool" } };
}

function matchPhrase(cur: Cur, spec: Spec): PhraseHit | null {
  const words: string[] = [];
  const ends: number[] = [];
  let pos = cur.i;
  while (pos < cur.text.length) {
    while (pos < cur.text.length && isSpace(cur.text.charCodeAt(pos))) pos++;
    const read = readPhraseWord(cur.text, pos);
    if (read === null) break;
    words.push(lowerAscii(read.word));
    ends.push(read.end);
    pos = read.end;
  }
  if (words.length === 0) return null;
  let bestEnd = -1;
  let bestIndex = -1;
  let bestNegated = false;
  for (let s = 0; s < spec.symbols.length; s++) {
    const sym = spec.symbols[s];
    const candidates: string[] = [];
    if (sym.phrase.length > 0) candidates.push(sym.phrase);
    if (sym.action.length > 0) candidates.push(sym.action);
    for (let c = 0; c < candidates.length; c++) {
      const hit = matchParts(splitWords(candidates[c]), words, ends);
      if (hit === null) continue;
      if (hit.end > bestEnd) {
        bestEnd = hit.end;
        bestIndex = s;
        bestNegated = hit.negated;
      }
    }
  }
  if (bestIndex < 0) return null;
  return { index: bestIndex, end: bestEnd, negated: bestNegated };
}

interface PartHit {
  end: number;
  negated: boolean;
}

function matchParts(parts: string[], words: string[], ends: number[]): PartHit | null {
  let pos = 0;
  let negated = false;
  for (let w = 0; w < parts.length; w++) {
    if (pos >= words.length) return null;
    if (lowerAscii(parts[w]) !== words[pos]) return null;
    const nextPart = w + 1 < parts.length ? lowerAscii(parts[w + 1]) : "";
    if (lowerAscii(parts[w]) === "is" && nextPart !== "not" && w + 1 < parts.length) {
      if (pos + 1 < words.length && words[pos + 1] === "not") {
        negated = true;
        pos += 2;
        continue;
      }
    }
    pos++;
  }
  if (pos <= 0) return null;
  return { end: ends[pos - 1], negated: negated };
}

interface AsToken {
  kind: string;
  text: string;
}

function tokenizeAs(text: string, symbolName: string): AsToken[] | null {
  const parts = splitWords(text);
  if (parts.length === 0) return null;
  const tokens: AsToken[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part.charCodeAt(0) === 123) {
      if (part.charCodeAt(part.length - 1) !== 125) return null;
      const inner = part.slice(1, part.length - 1);
      if (inner === "op") tokens.push({ kind: "op", text: "" });
      else if (inner === "value" || inner === "name" || inner === symbolName) tokens.push({ kind: "value", text: "" });
      else return null;
      continue;
    }
    for (let c = 0; c < part.length; c++) {
      const code = part.charCodeAt(c);
      if (isPhraseStop(code) || code === 43 || code === 123 || code === 125) return null;
    }
    tokens.push({ kind: "word", text: part });
  }
  return tokens;
}

interface AsOk {
  ok: true;
  index: number;
  end: number;
  op: string;
  right: Term;
  rightSort: SortTag;
}

type AsHit = AsOk | { ok: false; message: string };

function matchAsPattern(cur: Cur, spec: Spec): AsHit | null {
  let best: AsOk | null = null;
  let startedMessage = "";
  for (let s = 0; s < spec.symbols.length; s++) {
    if (spec.symbols[s].asText.length === 0) continue;
    const save = cur.i;
    const hit = matchOneAs(cur, spec, s);
    cur.i = save;
    if (hit === null) continue;
    if (!hit.ok) {
      if (startedMessage.length === 0) startedMessage = hit.message;
      continue;
    }
    if (best === null || hit.end > best.end) best = hit;
  }
  if (best !== null) return best;
  if (startedMessage.length > 0) return { ok: false, message: startedMessage };
  return null;
}

function matchOneAs(cur: Cur, spec: Spec, index: number): AsOk | { ok: false; message: string } | null {
  const sym = spec.symbols[index];
  const tokens = tokenizeAs(sym.asText, sym.name);
  if (tokens === null) return null;
  let op = "=";
  let right: Term = { kind: "int", value: 0 };
  let rightSort: SortTag = { kind: "int" };
  let sawValue = false;
  let started = false;
  for (let t = 0; t < tokens.length; t++) {
    const token = tokens[t];
    if (token.kind === "word") {
      cur.skip();
      const word = readRawIdent(cur);
      if (word === null || !sameLoose(token.text, word)) {
        if (!started) return null;
        return { ok: false, message: "expected " + displayQuote(token.text) };
      }
      started = true;
      continue;
    }
    if (token.kind === "op") {
      op = matchOpHole(cur);
      started = true;
      continue;
    }
    const value = parseValueHole(cur, spec, sym);
    if (!value.ok) {
      if (!started) return null;
      return value;
    }
    right = value.term;
    rightSort = value.sort;
    sawValue = true;
    started = true;
  }
  if (!sawValue) return null;
  return { ok: true, index: index, end: cur.i, op: op, right: right, rightSort: rightSort };
}

function parseValueHole(cur: Cur, spec: Spec, sym: SymbolDecl): Parsed {
  if (sym.sort.kind === "enum") {
    const word = readIdent(cur);
    if (word === null) return { ok: false, message: "expected a " + sym.sort.enumName + " variant" };
    const variant = findVariant(spec, word);
    if (variant === null || variant.enumName !== sym.sort.enumName) {
      return { ok: false, message: "expected a " + sym.sort.enumName + " variant" };
    }
    return {
      ok: true,
      term: { kind: "enum", enumName: variant.enumName, variant: word, index: variant.index },
      sort: { kind: "enum", enumName: variant.enumName },
    };
  }
  return parseSum(cur, spec, false);
}

function matchOpHole(cur: Cur): string {
  const save = cur.i;
  if (consumeWord(cur, "at")) {
    if (consumeWord(cur, "most")) return "<=";
    if (consumeWord(cur, "least")) return ">=";
    cur.i = save;
  }
  if (consumeWord(cur, "less")) {
    if (consumeWord(cur, "than")) return "<";
    cur.i = save;
  }
  if (consumeWord(cur, "greater")) {
    if (consumeWord(cur, "than")) return ">";
    cur.i = save;
  }
  if (consumeWord(cur, "not")) return "!=";
  cur.i = save;
  return "=";
}

function sameLoose(pattern: string, text: string): boolean {
  const a = lowerAscii(pattern);
  const b = lowerAscii(text);
  if (a === b) return true;
  if (a.length > 1 && a.slice(a.length - 1) === "s" && a.slice(0, a.length - 1) === b) return true;
  if (b.length > 1 && b.slice(b.length - 1) === "s" && b.slice(0, b.length - 1) === a) return true;
  return false;
}

function finishPattern(spec: Spec, hit: AsOk): Parsed {
  const left = symbolTerm(spec, hit.index);
  if (!left.ok) return left;
  if (hit.op !== "=" && hit.op !== "!=") {
    if (left.sort.kind !== "int" || hit.rightSort.kind !== "int") return { ok: false, message: "comparison expects integers" };
  } else if (!sameSort(left.sort, hit.rightSort)) {
    return { ok: false, message: "cannot compare " + sortName(left.sort) + " with " + sortName(hit.rightSort) };
  }
  if (hit.op === "=") return { ok: true, term: { kind: "eq", left: left.term, right: hit.right }, sort: { kind: "bool" } };
  if (hit.op === "!=") return { ok: true, term: { kind: "neq", left: left.term, right: hit.right }, sort: { kind: "bool" } };
  if (hit.op === "<") return { ok: true, term: { kind: "lt", left: left.term, right: hit.right }, sort: { kind: "bool" } };
  if (hit.op === "<=") return { ok: true, term: { kind: "le", left: left.term, right: hit.right }, sort: { kind: "bool" } };
  if (hit.op === ">") return { ok: true, term: { kind: "gt", left: left.term, right: hit.right }, sort: { kind: "bool" } };
  return { ok: true, term: { kind: "ge", left: left.term, right: hit.right }, sort: { kind: "bool" } };
}

function unknownPhrase(cur: Cur, spec: Spec, start: number): Parsed {
  const span = phraseSpan(cur.text, start);
  cur.i = span.end;
  return { ok: false, message: unknownPhraseMessage(span.text, spec) };
}

interface Span {
  text: string;
  end: number;
}

function phraseSpan(text: string, start: number): Span {
  let pos = start;
  while (pos < text.length && isSpace(text.charCodeAt(pos))) pos++;
  const wordStart = pos;
  let end = pos;
  while (pos < text.length) {
    while (pos < text.length && isSpace(text.charCodeAt(pos))) pos++;
    const read = readPhraseWord(text, pos);
    if (read === null) break;
    const lower = lowerAscii(read.word);
    if (lower === "and" || lower === "or" || lower === "not") break;
    end = read.end;
    pos = read.end;
  }
  return { text: normalizeSpaces(text.slice(wordStart, end)), end: end };
}

function unknownPhraseMessage(span: string, spec: Spec): string {
  const picked = closestPhrases(span, spec);
  let message = "unknown phrase " + displayQuote(span);
  if (picked.length === 0) return message;
  message += ". Closest:";
  for (let i = 0; i < picked.length; i++) {
    message += " " + displayQuote(picked[i]);
    if (i + 1 < picked.length) message += ",";
  }
  return message + ".";
}

function closestPhrases(span: string, spec: Spec): string[] {
  const target = lowerAscii(span);
  const bestIdx: number[] = [];
  const bestDist: number[] = [];
  for (let s = 0; s < spec.symbols.length; s++) {
    const phrase = spec.symbols[s].phrase;
    if (phrase.length === 0) continue;
    const dist = editDistance(target, lowerAscii(phrase));
    let place = 0;
    while (place < bestIdx.length) {
      const better = dist < bestDist[place] || (dist === bestDist[place] && s < bestIdx[place]);
      if (better) break;
      place++;
    }
    if (place >= 3) continue;
    if (bestIdx.length < 3) {
      bestIdx.push(0);
      bestDist.push(0);
    }
    for (let k = bestIdx.length - 1; k > place; k--) {
      bestIdx[k] = bestIdx[k - 1];
      bestDist[k] = bestDist[k - 1];
    }
    bestIdx[place] = s;
    bestDist[place] = dist;
  }
  const out: string[] = [];
  for (let i = 0; i < bestIdx.length; i++) out.push(spec.symbols[bestIdx[i]].phrase);
  return out;
}

function editDistance(a: string, b: string): number {
  const n = a.length;
  const m = b.length;
  const prev: number[] = [];
  const curr: number[] = [];
  for (let j = 0; j <= m; j++) {
    prev.push(j);
    curr.push(0);
  }
  for (let i = 1; i <= n; i++) {
    curr[0] = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= m; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      let best = prev[j] + 1;
      const ins = curr[j - 1] + 1;
      if (ins < best) best = ins;
      const sub = prev[j - 1] + cost;
      if (sub < best) best = sub;
      curr[j] = best;
    }
    for (let j = 0; j <= m; j++) prev[j] = curr[j];
  }
  return prev[m];
}

interface PhraseWord {
  word: string;
  end: number;
}

function readPhraseWord(text: string, pos: number): PhraseWord | null {
  if (pos >= text.length || isSpace(text.charCodeAt(pos)) || isPhraseStop(text.charCodeAt(pos))) return null;
  const start = pos;
  pos++;
  while (pos < text.length && !isSpace(text.charCodeAt(pos)) && !isPhraseStop(text.charCodeAt(pos))) pos++;
  return { word: text.slice(start, pos), end: pos };
}

function isPhraseStop(code: number): boolean {
  return code === 40 || code === 41 || code === 44 || code === 61 || code === 60 || code === 62 || code === 33 || code === 46;
}

function hasPhrase(spec: Spec): boolean {
  for (let i = 0; i < spec.symbols.length; i++) {
    if (spec.symbols[i].phrase.length > 0) return true;
  }
  return false;
}

function phraseClash(spec: Spec, phrase: string): string {
  const parts = splitWords(phrase);
  if (parts.length === 0) return "expected a phrase";
  for (let i = 0; i < phrase.length; i++) {
    const code = phrase.charCodeAt(i);
    if (isPhraseStop(code) || code === 43) return "a phrase can only be words";
  }
  const first = lowerAscii(parts[0]);
  if (first === "not" || first === "and" || first === "or") {
    return "a phrase cannot start with " + displayQuote(parts[0]);
  }
  if (parts.length === 1 && isReserved(parts[0])) return displayQuote(phrase) + " is a reserved word";
  const lower = lowerAscii(phrase);
  for (let i = 0; i < spec.symbols.length; i++) {
    const sym = spec.symbols[i];
    if (sym.phrase.length > 0 && lowerAscii(sym.phrase) === lower) return displayQuote(phrase) + " is already a phrase";
    if (sym.action.length > 0 && lowerAscii(sym.action) === lower) return displayQuote(phrase) + " is already a phrase";
    if (lowerAscii(sym.name) === lower) return displayQuote(phrase) + " is already a symbol";
  }
  for (let i = 0; i < spec.enums.length; i++) {
    const decl = spec.enums[i];
    if (lowerAscii(decl.name) === lower) return displayQuote(phrase) + " is already an enum";
    for (let v = 0; v < decl.variants.length; v++) {
      if (lowerAscii(decl.variants[v]) === lower) return displayQuote(phrase) + " is already an enum variant";
    }
  }
  return "";
}

function splitWords(text: string): string[] {
  const parts: string[] = [];
  let start = 0;
  for (let i = 0; i <= text.length; i++) {
    if (i === text.length || text.charCodeAt(i) === 32) {
      if (i > start) parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  return parts;
}

function normalizeSpaces(text: string): string {
  let out = "";
  let pending = false;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (isSpace(code)) {
      if (out.length > 0) pending = true;
      continue;
    }
    if (pending) out += " ";
    pending = false;
    out += text.slice(i, i + 1);
  }
  return out;
}

function lowerAscii(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 65 && code <= 90) out += String.fromCharCode(code + 32);
    else out += text.slice(i, i + 1);
  }
  return out;
}

function consumeEnglishOp(cur: Cur): string {
  const save = cur.i;
  if (!consumeWord(cur, "is")) return "";
  const afterIs = cur.i;
  if (consumeWord(cur, "not")) return "!=";
  cur.i = afterIs;
  if (consumeWord(cur, "at")) {
    if (consumeWord(cur, "most")) return "<=";
    if (consumeWord(cur, "least")) return ">=";
    cur.i = save;
    return "";
  }
  if (consumeWord(cur, "less")) {
    if (consumeWord(cur, "than")) return "<";
    cur.i = save;
    return "";
  }
  if (consumeWord(cur, "greater")) {
    if (consumeWord(cur, "than")) return ">";
    cur.i = save;
    return "";
  }
  return "=";
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
  const lower = lowerAscii(name);
  for (let i = 0; i < spec.symbols.length; i++) {
    const sym = spec.symbols[i];
    if (sym.phrase.length > 0 && lowerAscii(sym.phrase) === lower) {
      return displayQuote(name) + " is already a phrase";
    }
    if (sym.action.length > 0 && lowerAscii(sym.action) === lower) {
      return displayQuote(name) + " is already a phrase";
    }
  }
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
    word === "int" ||
    word === "phrase" ||
    word === "outcome" ||
    word === "action" ||
    word === "says" ||
    word === "as"
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
