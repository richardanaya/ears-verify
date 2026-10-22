/**
 * EARS spec parser.
 *
 * A spec is markdown-ish text. Requirement lines start with an id such as
 * `R1.1`, then an EARS sentence. Headings (`#`), blank lines, `//` comments,
 * and full-line HTML comments are ignored. Indented or following lines
 * continue the sentence until a blank line, a heading, or the next id.
 *
 * Sentence shape, clauses optional and in this order:
 *   While <state>, when <trigger>, if <condition>, where <feature>,
 *   the <system> shall <response>.
 *
 * Conditions and responses use a small predicate language over URL
 * components, not free English. See parsePredicate.
 */

export interface Clause {
  keyword: string;
  text: string;
  pred: Pred;
}

export type Pred =
  | { kind: "empty"; component: string }
  | { kind: "not_empty"; component: string }
  | { kind: "eq"; component: string; value: string }
  | { kind: "neq"; component: string; value: string }
  | { kind: "one_of"; component: string; values: string[] }
  | { kind: "port_eq"; value: number }
  | { kind: "port_omitted" }
  | { kind: "port_explicit" }
  | { kind: "prefix"; component: string; value: string };

export interface Requirement {
  id: string;
  line: number;
  sentence: string;
  system: string;
  clauses: Clause[];
  responseText: string;
  response: Pred;
}

export interface SpecOk {
  ok: true;
  requirements: Requirement[];
}

export interface SpecErr {
  ok: false;
  line: number;
  message: string;
}

export type SpecResult = SpecOk | SpecErr;

interface SentenceOk {
  ok: true;
  system: string;
  clauses: Clause[];
  responseText: string;
  response: Pred;
}

type SentenceResult = SentenceOk | SpecErr;

interface PredOk {
  ok: true;
  pred: Pred;
}

type PredResult = PredOk | SpecErr;

class Cursor {
  text: string;
  i: number;

  constructor(text: string) {
    this.text = text;
    this.i = 0;
  }
}

export function parseSpec(text: string): SpecResult {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const lines = splitLines(source);
  const requirements: Requirement[] = [];
  let index = 0;
  while (index < lines.length) {
    const trimmed = stripCr(lines[index]).trim();
    if (isIgnorable(trimmed)) {
      index++;
      continue;
    }
    const id = matchId(trimmed);
    if (id === null) {
      return {
        ok: false,
        line: index + 1,
        message: "expected a requirement id such as R1.1, a heading, or a comment",
      };
    }
    const startLine = index + 1;
    let sentence = id.rest;
    index++;
    while (index < lines.length) {
      const next = stripCr(lines[index]).trim();
      if (next.length === 0 || isIgnorable(next) || matchId(next) !== null) break;
      sentence += " " + next;
      index++;
    }
    const parsed = parseSentence(sentence.trim());
    if (!parsed.ok) return { ok: false, line: startLine, message: parsed.message };
    requirements.push({
      id: id.id,
      line: startLine,
      sentence: sentence.trim(),
      system: parsed.system,
      clauses: parsed.clauses,
      responseText: parsed.responseText,
      response: parsed.response,
    });
  }
  if (requirements.length === 0) {
    return { ok: false, line: 1, message: "no requirements found" };
  }
  for (let i = 0; i < requirements.length; i++) {
    for (let j = 0; j < i; j++) {
      if (requirements[i].id === requirements[j].id) {
        return {
          ok: false,
          line: requirements[i].line,
          message: "duplicate requirement id " + requirements[i].id,
        };
      }
    }
  }
  return { ok: true, requirements: requirements };
}

export function parseSentence(sentence: string): SentenceResult {
  const text = sentence.trim();
  if (text.length === 0 || text.charCodeAt(text.length - 1) !== 46) {
    return { ok: false, line: 0, message: "EARS sentence must end with '.'" };
  }
  const cur = new Cursor(text.slice(0, text.length - 1));
  const clauses: Clause[] = [];
  let lastOrder = -1;
  while (true) {
    skipWs(cur);
    const keyword = matchKeyword(cur);
    if (keyword.length === 0) break;
    const order = keywordOrder(keyword);
    if (order <= lastOrder) {
      return {
        ok: false,
        line: 0,
        message: "clauses must appear in order: while, when, if, where",
      };
    }
    lastOrder = order;
    skipWs(cur);
    const body = readUntilComma(cur);
    if (body === null) {
      return { ok: false, line: 0, message: "expected a comma after the " + keyword + " clause" };
    }
    const pred = parsePredicate(body.trim());
    if (!pred.ok) return pred;
    clauses.push({ keyword: keyword, text: body.trim(), pred: pred.pred });
  }
  skipWs(cur);
  if (!consumeWord(cur, "the") && !consumeWord(cur, "The")) {
    return { ok: false, line: 0, message: "expected \"the <system> shall <response>\"" };
  }
  skipWs(cur);
  if (cur.text.startsWith("shall", cur.i)) {
    return { ok: false, line: 0, message: "expected a system name before shall" };
  }
  if (!hasShallWord(cur.text.slice(cur.i))) {
    return { ok: false, line: 0, message: "expected \"shall\"" };
  }
  const system = readSystem(cur);
  if (system.length === 0) {
    return { ok: false, line: 0, message: "expected a system name before shall" };
  }
  skipWs(cur);
  if (!consumeWord(cur, "shall")) {
    return { ok: false, line: 0, message: "expected \"shall\"" };
  }
  skipWs(cur);
  const responseText = cur.text.slice(cur.i).trim();
  if (responseText.length === 0) {
    return { ok: false, line: 0, message: "expected a response after shall" };
  }
  const response = parseResponse(responseText);
  if (!response.ok) return response;
  return {
    ok: true,
    system: system,
    clauses: clauses,
    responseText: responseText,
    response: response.pred,
  };
}

function parseResponse(text: string): PredResult {
  if (text === "reject a non-empty userinfo" || text === "reject non-empty userinfo") {
    return { ok: true, pred: { kind: "empty", component: "userinfo" } };
  }
  if (text === "require an omitted port" || text === "require port omitted") {
    return { ok: true, pred: { kind: "port_omitted" } };
  }
  const hostList = matchAcceptOnly(text);
  if (hostList !== null) {
    if (hostList.length === 0) {
      return { ok: false, line: 0, message: "unsupported predicate: " + text };
    }
    if (hostList.length === 1) {
      return { ok: true, pred: { kind: "eq", component: "host", value: hostList[0].toLowerCase() } };
    }
    const values: string[] = [];
    for (let i = 0; i < hostList.length; i++) values.push(hostList[i].toLowerCase());
    return { ok: true, pred: { kind: "one_of", component: "host", values: values } };
  }
  const port = matchRequirePort(text);
  if (port === -2) return { ok: false, line: 0, message: "port is out of range" };
  if (port >= 0) return { ok: true, pred: { kind: "port_eq", value: port } };
  return parsePredicate(text);
}

function parsePredicate(text: string): PredResult {
  const names = ["scheme", "userinfo", "host", "path", "query", "fragment"];
  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    if (text === name + " is empty") return { ok: true, pred: { kind: "empty", component: name } };
    if (text === name + " is not empty") {
      return { ok: true, pred: { kind: "not_empty", component: name } };
    }
  }
  if (text === "port is omitted") return { ok: true, pred: { kind: "port_omitted" } };
  if (text === "port is explicit") return { ok: true, pred: { kind: "port_explicit" } };
  const port = matchPrefixedPort(text, "port is ");
  if (port === -2) return { ok: false, line: 0, message: "port is out of range" };
  if (port >= 0) return { ok: true, pred: { kind: "port_eq", value: port } };
  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    const eq = matchQuoted(text, name + " is \"");
    if (eq !== null) {
      return { ok: true, pred: { kind: "eq", component: name, value: normalize(name, eq) } };
    }
    const neq = matchQuoted(text, name + " is not \"");
    if (neq !== null) {
      return { ok: true, pred: { kind: "neq", component: name, value: normalize(name, neq) } };
    }
    const prefix = matchQuoted(text, name + " starts with \"");
    if (prefix !== null) {
      return { ok: true, pred: { kind: "prefix", component: name, value: prefix } };
    }
    const oneOf = matchOneOf(text, name);
    if (oneOf !== null) {
      if (oneOf.length === 0) break;
      const values: string[] = [];
      for (let v = 0; v < oneOf.length; v++) values.push(normalize(name, oneOf[v]));
      return { ok: true, pred: { kind: "one_of", component: name, values: values } };
    }
  }
  return { ok: false, line: 0, message: "unsupported predicate: " + text };
}

function matchAcceptOnly(text: string): string[] | null {
  if (text.startsWith("accept only host ")) return parseOrList(text.slice("accept only host ".length));
  if (text.startsWith("accept only hosts ")) return parseOrList(text.slice("accept only hosts ".length));
  return null;
}

function matchOneOf(text: string, component: string): string[] | null {
  const prefix = component + " is one of ";
  if (!text.startsWith(prefix)) return null;
  return parseOrList(text.slice(prefix.length));
}

function matchRequirePort(text: string): number {
  if (text.startsWith("require an explicit port of ")) {
    return matchPrefixedPort(text, "require an explicit port of ");
  }
  if (text.startsWith("require explicit port ")) {
    return matchPrefixedPort(text, "require explicit port ");
  }
  if (text.startsWith("require port ")) return matchPrefixedPort(text, "require port ");
  return -1;
}

function matchPrefixedPort(text: string, prefix: string): number {
  if (!text.startsWith(prefix)) return -1;
  return parsePortLiteral(text.slice(prefix.length));
}

function parsePortLiteral(text: string): number {
  if (text.length === 0 || text.length > 5) return -2;
  let value = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 48 || code > 57) return -1;
    value = value * 10 + (code - 48);
  }
  if (value > 65535) return -2;
  return value;
}

function matchQuoted(text: string, prefix: string): string | null {
  if (!text.startsWith(prefix)) return null;
  if (text.charCodeAt(text.length - 1) !== 34) return null;
  const value = text.slice(prefix.length, text.length - 1);
  if (!validLiteral(value)) return null;
  return value;
}

function parseOrList(text: string): string[] | null {
  const values: string[] = [];
  let i = 0;
  if (text.length === 0) return null;
  while (i < text.length) {
    if (text.charCodeAt(i) !== 34) return null;
    i++;
    const start = i;
    while (i < text.length && text.charCodeAt(i) !== 34) {
      if (text.charCodeAt(i) === 92 || text.charCodeAt(i) === 10) return null;
      i++;
    }
    if (i >= text.length) return null;
    values.push(text.slice(start, i));
    i++;
    if (i === text.length) return values;
    if (!text.startsWith(" or ", i)) return null;
    i += 4;
  }
  return null;
}

function validLiteral(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code === 34 || code === 92 || code === 10 || code === 13) return false;
  }
  return true;
}

function normalize(component: string, value: string): string {
  if (component === "scheme" || component === "host") return value.toLowerCase();
  return value;
}

function matchKeyword(cur: Cursor): string {
  const words = ["While", "while", "When", "when", "If", "if", "Where", "where"];
  const canon = ["while", "while", "when", "when", "if", "if", "where", "where"];
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    if (!cur.text.startsWith(word, cur.i)) continue;
    const after = cur.i + word.length;
    if (after >= cur.text.length) continue;
    const code = cur.text.charCodeAt(after);
    if (code !== 32 && code !== 9) continue;
    cur.i = after;
    return canon[i];
  }
  return "";
}

function keywordOrder(keyword: string): number {
  if (keyword === "while") return 0;
  if (keyword === "when") return 1;
  if (keyword === "if") return 2;
  if (keyword === "where") return 3;
  return 9;
}

function readUntilComma(cur: Cursor): string | null {
  const start = cur.i;
  let quoted = false;
  let i = cur.i;
  while (i < cur.text.length) {
    const code = cur.text.charCodeAt(i);
    if (code === 34) quoted = !quoted;
    else if (code === 44 && !quoted) {
      const body = cur.text.slice(start, i);
      cur.i = i + 1;
      return body;
    }
    i++;
  }
  return null;
}

function hasShallWord(text: string): boolean {
  const at = text.indexOf("shall");
  if (at < 0) return false;
  if (at > 0) {
    const before = text.charCodeAt(at - 1);
    if (before !== 32 && before !== 9) return false;
  }
  const after = at + 5;
  if (after < text.length && isNameChar(text.charCodeAt(after))) return false;
  return true;
}

function readSystem(cur: Cursor): string {
  skipWs(cur);
  const rest = cur.text.slice(cur.i);
  const needle = " shall";
  const at = rest.indexOf(needle);
  if (at <= 0) return "";
  const after = at + needle.length;
  if (after < rest.length) {
    const code = rest.charCodeAt(after);
    if (isNameChar(code)) return "";
  }
  const system = rest.slice(0, at).trim();
  if (!validSystem(system)) return "";
  cur.i = cur.i + at + 1;
  return system;
}

function validSystem(value: string): boolean {
  let i = 0;
  if (value.length === 0) return false;
  while (i < value.length) {
    if (!isAlpha(value.charCodeAt(i))) return false;
    i++;
    while (i < value.length && isNameChar(value.charCodeAt(i))) i++;
    if (i === value.length) return true;
    if (value.charCodeAt(i) !== 32) return false;
    i++;
    if (i === value.length) return false;
  }
  return false;
}

function consumeWord(cur: Cursor, word: string): boolean {
  if (!cur.text.startsWith(word, cur.i)) return false;
  const after = cur.i + word.length;
  if (after < cur.text.length && isNameChar(cur.text.charCodeAt(after))) return false;
  cur.i = after;
  return true;
}

function skipWs(cur: Cursor): void {
  while (cur.i < cur.text.length) {
    const code = cur.text.charCodeAt(cur.i);
    if (code !== 32 && code !== 9) break;
    cur.i++;
  }
}

interface IdMatch {
  id: string;
  rest: string;
}

function matchId(line: string): IdMatch | null {
  if (line.length === 0 || line.charCodeAt(0) !== 82) return null;
  let i = 1;
  if (i >= line.length || !isDigit(line.charCodeAt(i))) return null;
  while (i < line.length && isDigit(line.charCodeAt(i))) i++;
  while (i < line.length && line.charCodeAt(i) === 46) {
    i++;
    if (i >= line.length || !isDigit(line.charCodeAt(i))) return null;
    while (i < line.length && isDigit(line.charCodeAt(i))) i++;
  }
  const idEnd = i;
  if (i >= line.length) return null;
  const code = line.charCodeAt(i);
  if (code !== 32 && code !== 9) return null;
  while (i < line.length && (line.charCodeAt(i) === 32 || line.charCodeAt(i) === 9)) i++;
  return { id: line.slice(0, idEnd), rest: line.slice(i) };
}

function isIgnorable(line: string): boolean {
  if (line.length === 0) return true;
  if (line.charCodeAt(0) === 35) return true;
  if (line.startsWith("//")) return true;
  if (line.startsWith("<!--")) return true;
  return false;
}

function splitLines(text: string): string[] {
  const lines: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) {
      lines.push(text.slice(start, i));
      start = i + 1;
    }
  }
  if (start < text.length || text.length === 0) lines.push(text.slice(start));
  return lines;
}

function stripCr(line: string): string {
  if (line.length > 0 && line.charCodeAt(line.length - 1) === 13) return line.slice(0, line.length - 1);
  return line;
}

function isAlpha(code: number): boolean {
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

function isDigit(code: number): boolean {
  return code >= 48 && code <= 57;
}

function isNameChar(code: number): boolean {
  return isAlpha(code) || isDigit(code) || code === 45 || code === 95;
}
