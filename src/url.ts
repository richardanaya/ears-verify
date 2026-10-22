/**
 * RFC 3986 absolute-URI parser and canonical form.
 *
 * Parsing keeps the characters that were written, so a later step can say
 * which normalization rule changed them. Canonical form follows RFC 3986
 * section 6 (lowercase scheme and host, default ports omitted, percent
 * encoding normalized, dot segments removed) plus the project conventions
 * in skills/ears-verify/SKILL.md: no userinfo, no empty query or fragment,
 * no trailing slash except the root, lowercase hyphenated path segments,
 * a fixed set of plural collection nouns, {camelCase} placeholders, and
 * query keys in ascending order. Curly braces are allowed in the path, query,
 * and fragment so a placeholder such as {customerId} can be written in the URL.
 */

import { formatInt } from "./text.ts";

export interface CanonOk {
  ok: true;
  canonical: string;
  violations: string[];
}

export interface CanonErr {
  ok: false;
  message: string;
}

export type CanonResult = CanonOk | CanonErr;

interface RawUrl {
  scheme: string;
  hasAuthority: boolean;
  hasUserinfo: boolean;
  host: string;
  hostLiteral: boolean;
  port: number;
  path: string;
  hasQuery: boolean;
  query: string;
  hasFragment: boolean;
  fragment: string;
}

interface Pair {
  key: string;
  value: string;
  hasEq: boolean;
}

class CanonFlags {
  scheme: boolean;
  host: boolean;
  port: boolean;
  pctUpper: boolean;
  pctDecode: boolean;
  dots: boolean;
  slash: boolean;
  emptyQuery: boolean;
  emptyFragment: boolean;
  hyphen: boolean;
  plural: boolean;
  camel: boolean;
  sort: boolean;
  userinfo: boolean;

  constructor() {
    this.scheme = false;
    this.host = false;
    this.port = false;
    this.pctUpper = false;
    this.pctDecode = false;
    this.dots = false;
    this.slash = false;
    this.emptyQuery = false;
    this.emptyFragment = false;
    this.hyphen = false;
    this.plural = false;
    this.camel = false;
    this.sort = false;
    this.userinfo = false;
  }
}

export function canonicalizeUrl(input: string): CanonResult {
  const parsed = parseRaw(input);
  if (!parsed.ok) return parsed;
  const flags = new CanonFlags();
  const raw = parsed.url;
  const scheme = lowerAscii(raw.scheme);
  if (scheme !== raw.scheme) flags.scheme = true;
  if (raw.hasUserinfo) flags.userinfo = true;

  let host = "";
  if (raw.hasAuthority) {
    const decoded = normalizePct(raw.host, flags);
    const lowered = lowerAscii(decoded);
    if (lowered !== decoded) flags.host = true;
    host = raw.hostLiteral ? "[" + lowered + "]" : lowered;
  }

  let omitPort = false;
  if (raw.port >= 0) {
    if ((scheme === "https" && raw.port === 443) || (scheme === "http" && raw.port === 80)) {
      flags.port = true;
      omitPort = true;
    }
  }

  let path = normalizePct(raw.path, flags);
  const dotted = removeDotSegments(path);
  if (dotted !== path) flags.dots = true;
  path = dotted;
  if (path.length > 1 && path.charCodeAt(path.length - 1) === 47) {
    flags.slash = true;
    path = path.slice(0, path.length - 1);
  }
  path = mapSegments(path, flags);

  let query = "";
  let keepQuery = false;
  if (raw.hasQuery) {
    if (raw.query.length === 0) flags.emptyQuery = true;
    else {
      query = canonQuery(raw.query, flags);
      keepQuery = true;
    }
  }

  let fragment = "";
  let keepFragment = false;
  if (raw.hasFragment) {
    if (raw.fragment.length === 0) flags.emptyFragment = true;
    else {
      fragment = rewritePlaceholders(normalizePct(raw.fragment, flags), flags);
      keepFragment = true;
    }
  }

  let canonical = scheme + ":";
  if (raw.hasAuthority) {
    canonical += "//" + host;
    if (raw.port >= 0 && !omitPort) canonical += ":" + formatInt(raw.port);
  }
  canonical += path;
  if (keepQuery) canonical += "?" + query;
  if (keepFragment) canonical += "#" + fragment;
  return { ok: true, canonical: canonical, violations: violationList(flags) };
}

export function formatCanonText(canonical: string, violations: string[]): string {
  const lines: string[] = [];
  lines.push(canonical);
  lines.push("violations: " + formatInt(violations.length));
  for (let i = 0; i < violations.length; i++) lines.push("- " + violations[i]);
  return lines.join("\n");
}

export function formatCanonJson(input: string, canonical: string, violations: string[]): string {
  return JSON.stringify(
    { ok: violations.length === 0, input: input, canonical: canonical, violations: violations },
    null,
    2,
  );
}

function violationList(flags: CanonFlags): string[] {
  const out: string[] = [];
  if (flags.scheme) out.push("lowercase the scheme");
  if (flags.host) out.push("lowercase the host");
  if (flags.port) out.push("omit the default port");
  if (flags.pctUpper) out.push("uppercase percent-encoding hex");
  if (flags.pctDecode) out.push("decode unreserved characters");
  if (flags.dots) out.push("remove dot segments");
  if (flags.slash) out.push("no trailing slash except the root");
  if (flags.emptyQuery) out.push("no empty query");
  if (flags.emptyFragment) out.push("no empty fragment");
  if (flags.hyphen) out.push("lowercase hyphenated path segments");
  if (flags.plural) out.push("plural collection nouns");
  if (flags.camel) out.push("use {camelCase} placeholders");
  if (flags.sort) out.push("sort query keys");
  if (flags.userinfo) out.push("no userinfo");
  return out;
}

type RawResult = { ok: true; url: RawUrl } | CanonErr;

function parseRaw(input: string): RawResult {
  if (input.length === 0) return { ok: false, message: "empty input" };
  const schemeEnd = scanScheme(input);
  if (schemeEnd < 0) {
    if (input.indexOf(":") === -1) return { ok: false, message: "missing scheme" };
    return { ok: false, message: "invalid scheme" };
  }
  const scheme = input.slice(0, schemeEnd);
  const rest = input.slice(schemeEnd + 1);
  if (rest.length >= 2 && rest.charCodeAt(0) === 47 && rest.charCodeAt(1) === 47) {
    return parseAuthority(scheme, rest.slice(2));
  }
  return parsePathOnly(scheme, rest);
}

function parseAuthority(scheme: string, rest: string): RawResult {
  const split = splitAuthority(rest);
  if (split === null) return { ok: false, message: "missing closing bracket in host" };
  const user = splitUserinfo(split.auth);
  if (!validUserinfo(user.userinfo)) return { ok: false, message: "invalid character in userinfo" };
  const hostport = parseHostPort(user.hostport);
  if (!hostport.ok) return hostport;
  const tail = splitTail(split.tail, true);
  if (!tail.ok) return tail;
  return {
    ok: true,
    url: {
      scheme: scheme,
      hasAuthority: true,
      hasUserinfo: user.hasUserinfo,
      host: hostport.host,
      hostLiteral: hostport.literal,
      port: hostport.port,
      path: tail.path,
      hasQuery: tail.hasQuery,
      query: tail.query,
      hasFragment: tail.hasFragment,
      fragment: tail.fragment,
    },
  };
}

function parsePathOnly(scheme: string, rest: string): RawResult {
  if (rest.length >= 2 && rest.charCodeAt(0) === 47 && rest.charCodeAt(1) === 47) {
    return { ok: false, message: "path cannot start with //" };
  }
  const tail = splitTail(rest, false);
  if (!tail.ok) return tail;
  return {
    ok: true,
    url: {
      scheme: scheme,
      hasAuthority: false,
      hasUserinfo: false,
      host: "",
      hostLiteral: false,
      port: -1,
      path: tail.path,
      hasQuery: tail.hasQuery,
      query: tail.query,
      hasFragment: tail.hasFragment,
      fragment: tail.fragment,
    },
  };
}

interface AuthSplit {
  auth: string;
  tail: string;
}

function splitAuthority(rest: string): AuthSplit | null {
  let depth = 0;
  for (let i = 0; i < rest.length; i++) {
    const code = rest.charCodeAt(i);
    if (code === 91) depth++;
    else if (code === 93) {
      if (depth === 0) return null;
      depth--;
    } else if (depth === 0 && (code === 47 || code === 63 || code === 35)) {
      return { auth: rest.slice(0, i), tail: rest.slice(i) };
    }
  }
  if (depth !== 0) return null;
  return { auth: rest, tail: "" };
}

interface UserSplit {
  hasUserinfo: boolean;
  userinfo: string;
  hostport: string;
}

function splitUserinfo(auth: string): UserSplit {
  let depth = 0;
  for (let i = 0; i < auth.length; i++) {
    const code = auth.charCodeAt(i);
    if (code === 91) depth++;
    else if (code === 93) depth--;
    else if (code === 64 && depth === 0) {
      return { hasUserinfo: true, userinfo: auth.slice(0, i), hostport: auth.slice(i + 1) };
    }
  }
  return { hasUserinfo: false, userinfo: "", hostport: auth };
}

interface HostOk {
  ok: true;
  host: string;
  literal: boolean;
  port: number;
}

function parseHostPort(hostport: string): HostOk | CanonErr {
  if (hostport.length === 0) return { ok: true, host: "", literal: false, port: -1 };
  if (hostport.charCodeAt(0) === 91) {
    const close = hostport.indexOf("]");
    if (close < 0) return { ok: false, message: "missing closing bracket in host" };
    const inner = hostport.slice(1, close);
    if (!validIpLiteral(inner)) return { ok: false, message: "invalid IPv6 address" };
    const after = hostport.slice(close + 1);
    if (after.length === 0) return { ok: true, host: inner, literal: true, port: -1 };
    if (after.charCodeAt(0) !== 58) return { ok: false, message: "invalid character in host" };
    const port = parsePort(after.slice(1));
    if (!port.ok) return port;
    return { ok: true, host: inner, literal: true, port: port.port };
  }
  const colon = hostport.lastIndexOf(":");
  let host = hostport;
  let port = -1;
  if (colon !== -1) {
    host = hostport.slice(0, colon);
    const parsed = parsePort(hostport.slice(colon + 1));
    if (!parsed.ok) return parsed;
    port = parsed.port;
  }
  if (!validRegName(host)) return { ok: false, message: "invalid character in host" };
  return { ok: true, host: host, literal: false, port: port };
}

function parsePort(text: string): { ok: true; port: number } | CanonErr {
  if (text.length === 0) return { ok: false, message: "empty port" };
  if (text.length > 1 && text.charCodeAt(0) === 48) return { ok: false, message: "invalid port" };
  if (text.length > 5) return { ok: false, message: "port out of range" };
  let value = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (!isDigit(code)) return { ok: false, message: "invalid port" };
    value = value * 10 + (code - 48);
  }
  if (value > 65535) return { ok: false, message: "port out of range" };
  return { ok: true, port: value };
}

interface TailOk {
  ok: true;
  path: string;
  hasQuery: boolean;
  query: string;
  hasFragment: boolean;
  fragment: string;
}

function splitTail(tail: string, authority: boolean): TailOk | CanonErr {
  let path = tail;
  let fragment = "";
  let hasFragment = false;
  const hash = tail.indexOf("#");
  if (hash !== -1) {
    hasFragment = true;
    fragment = tail.slice(hash + 1);
    path = tail.slice(0, hash);
  }
  let query = "";
  let hasQuery = false;
  const question = path.indexOf("?");
  if (question !== -1) {
    hasQuery = true;
    query = path.slice(question + 1);
    path = path.slice(0, question);
  }
  if (authority) {
    if (path.length > 0 && path.charCodeAt(0) !== 47) return { ok: false, message: "path must be empty or start with /" };
  } else if (path.length >= 2 && path.charCodeAt(0) === 47 && path.charCodeAt(1) === 47) {
    return { ok: false, message: "path cannot start with //" };
  }
  if (!validPath(path)) return { ok: false, message: "invalid character in path" };
  if (!validQueryOrFragment(query)) return { ok: false, message: "invalid character in query" };
  if (!validQueryOrFragment(fragment)) return { ok: false, message: "invalid character in fragment" };
  return { ok: true, path: path, hasQuery: hasQuery, query: query, hasFragment: hasFragment, fragment: fragment };
}

function mapSegments(path: string, flags: CanonFlags): string {
  let out = "";
  let start = 0;
  for (let i = 0; i <= path.length; i++) {
    if (i === path.length || path.charCodeAt(i) === 47) {
      if (i > start) out += canonSegment(path.slice(start, i), flags);
      if (i < path.length) out += "/";
      start = i + 1;
    }
  }
  return out;
}

function canonSegment(segment: string, flags: CanonFlags): string {
  let next = rewritePlaceholders(segment, flags);
  if (next.indexOf("-") >= 0) {
    const lower = lowerOutside(next);
    if (lower !== next) flags.hyphen = true;
    next = lower;
  }
  if (next.indexOf("{") < 0 && next.indexOf("}") < 0) {
    const plural = pluralOf(next);
    if (plural !== next) {
      flags.plural = true;
      next = plural;
    }
  }
  return next;
}

function rewritePlaceholders(value: string, flags: CanonFlags): string {
  let out = "";
  let i = 0;
  while (i < value.length) {
    if (value.charCodeAt(i) !== 123) {
      out += value.slice(i, i + 1);
      i++;
      continue;
    }
    const close = value.indexOf("}", i + 1);
    if (close < 0) {
      out += value.slice(i);
      break;
    }
    const inner = value.slice(i + 1, close);
    const camel = camelInner(inner);
    if (camel !== inner) flags.camel = true;
    out += "{" + camel + "}";
    i = close + 1;
  }
  return out;
}

function camelInner(inner: string): string {
  let separated = false;
  for (let i = 0; i < inner.length; i++) {
    const code = inner.charCodeAt(i);
    if (code === 95 || code === 45) separated = true;
  }
  if (!separated) {
    if (isCamel(inner)) return inner;
    if (inner.length === 0) return inner;
    return lowerChar(inner.charCodeAt(0)) + inner.slice(1);
  }
  const parts: string[] = [];
  let start = 0;
  for (let i = 0; i <= inner.length; i++) {
    const code = i < inner.length ? inner.charCodeAt(i) : 95;
    if (code === 95 || code === 45) {
      if (i > start) parts.push(inner.slice(start, i));
      start = i + 1;
    }
  }
  let out = "";
  for (let p = 0; p < parts.length; p++) {
    const lower = lowerAscii(parts[p]);
    if (p === 0) out += lower;
    else out += capitalize(lower);
  }
  return out;
}

function isCamel(inner: string): boolean {
  if (inner.length === 0) return false;
  const first = inner.charCodeAt(0);
  if (first < 97 || first > 122) return false;
  for (let i = 1; i < inner.length; i++) {
    const code = inner.charCodeAt(i);
    const letter = (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
    if (!letter && !isDigit(code)) return false;
  }
  return true;
}

function lowerOutside(value: string): string {
  let out = "";
  let depth = 0;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code === 123) depth++;
    if (depth === 0 && code >= 65 && code <= 90) out += String.fromCharCode(code + 32);
    else out += value.slice(i, i + 1);
    if (code === 125 && depth > 0) depth--;
  }
  return out;
}

function pluralOf(segment: string): string {
  const nouns: string[][] = [
    ["address", "addresses"],
    ["category", "categories"],
    ["company", "companies"],
    ["customer", "customers"],
    ["account", "accounts"],
    ["invoice", "invoices"],
    ["payment", "payments"],
    ["product", "products"],
    ["shipment", "shipments"],
    ["order", "orders"],
    ["item", "items"],
    ["user", "users"],
  ];
  const lower = lowerAscii(segment);
  for (let i = 0; i < nouns.length; i++) {
    if (lower === nouns[i][0] || lower === nouns[i][1]) return nouns[i][1];
  }
  return segment;
}

function canonQuery(query: string, flags: CanonFlags): string {
  const normalized = normalizePct(query, flags);
  const pairs = splitPairs(normalized);
  for (let i = 0; i < pairs.length; i++) {
    pairs[i].key = rewritePlaceholders(pairs[i].key, flags);
    pairs[i].value = rewritePlaceholders(pairs[i].value, flags);
  }
  const sorted = sortPairs(pairs);
  if (!samePairs(pairs, sorted)) flags.sort = true;
  return joinPairs(sorted);
}

function splitPairs(query: string): Pair[] {
  const pairs: Pair[] = [];
  let start = 0;
  for (let i = 0; i <= query.length; i++) {
    if (i === query.length || query.charCodeAt(i) === 38) {
      const piece = query.slice(start, i);
      const eq = piece.indexOf("=");
      if (eq < 0) pairs.push({ key: piece, value: "", hasEq: false });
      else pairs.push({ key: piece.slice(0, eq), value: piece.slice(eq + 1), hasEq: true });
      start = i + 1;
    }
  }
  return pairs;
}

function sortPairs(pairs: Pair[]): Pair[] {
  const out: Pair[] = [];
  for (let i = 0; i < pairs.length; i++) out.push(pairs[i]);
  for (let i = 1; i < out.length; i++) {
    const item = out[i];
    let j = i;
    while (j > 0 && pairAfter(out[j - 1], item)) {
      out[j] = out[j - 1];
      j--;
    }
    out[j] = item;
  }
  return out;
}

function pairAfter(left: Pair, right: Pair): boolean {
  const key = cmpText(left.key, right.key);
  if (key > 0) return true;
  if (key < 0) return false;
  return cmpText(left.value, right.value) > 0;
}

function samePairs(left: Pair[], right: Pair[]): boolean {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i++) {
    if (left[i].key !== right[i].key || left[i].value !== right[i].value || left[i].hasEq !== right[i].hasEq) return false;
  }
  return true;
}

function joinPairs(pairs: Pair[]): string {
  let out = "";
  for (let i = 0; i < pairs.length; i++) {
    if (i > 0) out += "&";
    out += pairs[i].key;
    if (pairs[i].hasEq) out += "=" + pairs[i].value;
  }
  return out;
}

function cmpText(left: string, right: string): number {
  const n = left.length < right.length ? left.length : right.length;
  for (let i = 0; i < n; i++) {
    const delta = left.charCodeAt(i) - right.charCodeAt(i);
    if (delta !== 0) return delta;
  }
  return left.length - right.length;
}

function normalizePct(value: string, flags: CanonFlags): string {
  let out = "";
  let i = 0;
  while (i < value.length) {
    if (
      value.charCodeAt(i) === 37 &&
      i + 2 < value.length &&
      isHex(value.charCodeAt(i + 1)) &&
      isHex(value.charCodeAt(i + 2))
    ) {
      const h1 = value.charCodeAt(i + 1);
      const h2 = value.charCodeAt(i + 2);
      const u1 = upperHex(h1);
      const u2 = upperHex(h2);
      if (u1 !== h1 || u2 !== h2) flags.pctUpper = true;
      const byte = hexValue(h1) * 16 + hexValue(h2);
      if (isUnreserved(byte)) {
        flags.pctDecode = true;
        out += String.fromCharCode(byte);
      } else out += "%" + String.fromCharCode(u1) + String.fromCharCode(u2);
      i += 3;
      continue;
    }
    out += value.slice(i, i + 1);
    i++;
  }
  return out;
}

function removeDotSegments(path: string): string {
  let input = path;
  let output = "";
  while (input.length > 0) {
    if (input.slice(0, 3) === "../") input = input.slice(3);
    else if (input.slice(0, 2) === "./") input = input.slice(2);
    else if (input.slice(0, 3) === "/./") input = "/" + input.slice(3);
    else if (input === "/.") input = "/";
    else if (input.slice(0, 4) === "/../") {
      input = "/" + input.slice(4);
      output = popSegment(output);
    } else if (input === "/..") {
      input = "/";
      output = popSegment(output);
    } else if (input === "." || input === "..") input = "";
    else {
      let end = 0;
      if (input.charCodeAt(0) === 47) end = 1;
      while (end < input.length && input.charCodeAt(end) !== 47) end++;
      output += input.slice(0, end);
      input = input.slice(end);
    }
  }
  return output;
}

function popSegment(output: string): string {
  let slash = -1;
  for (let i = output.length - 1; i >= 0; i--) {
    if (output.charCodeAt(i) === 47) {
      slash = i;
      break;
    }
  }
  if (slash < 0) return "";
  return output.slice(0, slash);
}

function scanScheme(input: string): number {
  if (!isAlpha(input.charCodeAt(0))) return -1;
  let i = 1;
  while (i < input.length) {
    const code = input.charCodeAt(i);
    if (code === 58) return i;
    if (!isSchemeChar(code)) return -1;
    i++;
  }
  return -1;
}

function validUserinfo(value: string): boolean {
  return scanBytes(value, false, false, true, true, false);
}

function validRegName(value: string): boolean {
  return scanBytes(value, false, false, false, false, false);
}

function validPath(value: string): boolean {
  return scanBytes(value, true, false, true, true, true);
}

function validQueryOrFragment(value: string): boolean {
  return scanBytes(value, true, true, true, true, true);
}

function scanBytes(value: string, slash: boolean, question: boolean, colon: boolean, at: boolean, brace: boolean): boolean {
  let i = 0;
  while (i < value.length) {
    const code = value.charCodeAt(i);
    if (code === 37) {
      if (i + 2 >= value.length) return false;
      if (!isHex(value.charCodeAt(i + 1)) || !isHex(value.charCodeAt(i + 2))) return false;
      i += 3;
      continue;
    }
    if (slash && code === 47) {
      i++;
      continue;
    }
    if (question && code === 63) {
      i++;
      continue;
    }
    if (colon && code === 58) {
      i++;
      continue;
    }
    if (at && code === 64) {
      i++;
      continue;
    }
    if (brace && (code === 123 || code === 125)) {
      i++;
      continue;
    }
    if (isUnreserved(code) || isSubDelim(code)) {
      i++;
      continue;
    }
    return false;
  }
  return true;
}

function validIpLiteral(inner: string): boolean {
  if (inner.length === 0) return false;
  if (inner.charCodeAt(0) === 118 || inner.charCodeAt(0) === 86) return validIpvFuture(inner);
  return validIpv6(inner);
}

function validIpvFuture(value: string): boolean {
  const first = value.charCodeAt(0);
  if (first !== 118 && first !== 86) return false;
  let i = 1;
  if (i >= value.length || !isHex(value.charCodeAt(i))) return false;
  while (i < value.length && isHex(value.charCodeAt(i))) i++;
  if (i >= value.length || value.charCodeAt(i) !== 46) return false;
  i++;
  if (i >= value.length) return false;
  while (i < value.length) {
    const code = value.charCodeAt(i);
    if (!(isUnreserved(code) || isSubDelim(code) || code === 58)) return false;
    i++;
  }
  return true;
}

function validIpv6(value: string): boolean {
  const first = value.indexOf("::");
  if (first !== -1 && value.indexOf("::", first + 2) !== -1) return false;
  if (first === -1) {
    const parts = splitColon(value);
    if (parts === null) return false;
    return countGroups(parts, true) === 8;
  }
  const left = splitColon(value.slice(0, first));
  const right = splitColon(value.slice(first + 2));
  if (left === null || right === null) return false;
  const leftCount = countGroups(left, right.length === 0);
  const rightCount = countGroups(right, true);
  if (leftCount < 0 || rightCount < 0) return false;
  return leftCount + rightCount < 8;
}

function splitColon(value: string): string[] | null {
  if (value.length === 0) return [];
  const parts: string[] = [];
  let start = 0;
  for (let i = 0; i <= value.length; i++) {
    if (i === value.length || value.charCodeAt(i) === 58) {
      if (i === start) return null;
      parts.push(value.slice(start, i));
      start = i + 1;
    }
  }
  return parts;
}

function countGroups(parts: string[], allowIpv4Tail: boolean): number {
  let count = 0;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const last = i === parts.length - 1;
    if (last && allowIpv4Tail && part.indexOf(".") !== -1) {
      if (!isIpv4(part)) return -1;
      count += 2;
    } else {
      if (!isH16(part)) return -1;
      count += 1;
    }
  }
  return count;
}

function isH16(value: string): boolean {
  if (value.length < 1 || value.length > 4) return false;
  for (let i = 0; i < value.length; i++) {
    if (!isHex(value.charCodeAt(i))) return false;
  }
  return true;
}

function isIpv4(value: string): boolean {
  const parts: string[] = [];
  let dots = 0;
  let start = 0;
  for (let i = 0; i <= value.length; i++) {
    if (i === value.length || value.charCodeAt(i) === 46) {
      if (i === start) return false;
      parts.push(value.slice(start, i));
      if (i !== value.length) dots++;
      start = i + 1;
    }
  }
  if (dots !== 3 || parts.length !== 4) return false;
  for (let i = 0; i < 4; i++) {
    if (!isDecOctet(parts[i])) return false;
  }
  return true;
}

function isDecOctet(value: string): boolean {
  if (value.length === 1) return isDigit(value.charCodeAt(0));
  if (value.length === 2) return value.charCodeAt(0) >= 49 && value.charCodeAt(0) <= 57 && isDigit(value.charCodeAt(1));
  if (value.length !== 3) return false;
  const a = value.charCodeAt(0);
  const b = value.charCodeAt(1);
  const c = value.charCodeAt(2);
  if (!isDigit(b) || !isDigit(c)) return false;
  if (a === 49) return true;
  if (a !== 50) return false;
  if (b >= 48 && b <= 52) return true;
  return b === 53 && c >= 48 && c <= 53;
}

function lowerAscii(value: string): string {
  let out = "";
  for (let i = 0; i < value.length; i++) out += lowerChar(value.charCodeAt(i));
  return out;
}

function lowerChar(code: number): string {
  if (code >= 65 && code <= 90) return String.fromCharCode(code + 32);
  return String.fromCharCode(code);
}

function capitalize(value: string): string {
  if (value.length === 0) return value;
  const code = value.charCodeAt(0);
  if (code >= 97 && code <= 122) return String.fromCharCode(code - 32) + value.slice(1);
  return value;
}

function upperHex(code: number): number {
  if (code >= 97 && code <= 102) return code - 32;
  return code;
}

function hexValue(code: number): number {
  if (code >= 48 && code <= 57) return code - 48;
  if (code >= 65 && code <= 70) return code - 55;
  if (code >= 97 && code <= 102) return code - 87;
  return 0;
}

function isSchemeChar(code: number): boolean {
  return isAlpha(code) || isDigit(code) || code === 43 || code === 45 || code === 46;
}

function isAlpha(code: number): boolean {
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

function isDigit(code: number): boolean {
  return code >= 48 && code <= 57;
}

function isHex(code: number): boolean {
  return isDigit(code) || (code >= 65 && code <= 70) || (code >= 97 && code <= 102);
}

function isUnreserved(code: number): boolean {
  return isAlpha(code) || isDigit(code) || code === 45 || code === 46 || code === 95 || code === 126;
}

function isSubDelim(code: number): boolean {
  return (
    code === 33 ||
    code === 36 ||
    code === 38 ||
    code === 39 ||
    code === 40 ||
    code === 41 ||
    code === 42 ||
    code === 43 ||
    code === 44 ||
    code === 59 ||
    code === 61
  );
}
