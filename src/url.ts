/**
 * RFC 3986 URI parser for absolute URIs.
 *
 * The component model is ground data for the SMT term evaluator:
 * scheme, userinfo, host, port, path, query, fragment.
 * `port` is the integer written in the URI, or -1 when the port is omitted.
 * Scheme defaults (443 for https, 80 for http) are not filled in.
 * scheme and reg-name hosts are lowercased (RFC 3986 case-insensitivity).
 * Percent-encoding is validated and kept as written. No IDNA, no WHATWG
 * whitespace stripping, and `\` is not a path separator.
 */

export interface UrlParts {
  scheme: string;
  userinfo: string;
  host: string;
  port: number;
  path: string;
  query: string;
  fragment: string;
}

export interface UrlOk {
  ok: true;
  url: UrlParts;
}

export interface UrlErr {
  ok: false;
  message: string;
}

export type UrlResult = UrlOk | UrlErr;

export function parseUrl(input: string): UrlResult {
  if (input.length === 0) return fail("empty input");
  const schemeEnd = scanScheme(input);
  if (schemeEnd < 0) {
    if (input.indexOf(":") === -1) return fail("missing scheme");
    return fail("invalid scheme");
  }
  const scheme = input.slice(0, schemeEnd).toLowerCase();
  const rest = input.slice(schemeEnd + 1);
  if (rest.startsWith("//")) {
    return parseAuthorityUri(scheme, rest.slice(2));
  }
  return parseNoAuthority(scheme, rest);
}

function fail(message: string): UrlErr {
  return { ok: false, message: message };
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

function parseAuthorityUri(scheme: string, rest: string): UrlResult {
  const end = authorityEnd(rest);
  if (end < 0) return fail("missing closing bracket in host");
  const auth = rest.slice(0, end);
  const tail = rest.slice(end);
  const split = splitUserinfo(auth);
  if (!validUserinfo(split.userinfo)) return fail("invalid character in userinfo");
  const hostport = parseHostPort(split.hostport);
  if (!hostport.ok) return hostport;
  if (tail.length > 0 && tail.charCodeAt(0) !== 47 && tail.charCodeAt(0) !== 63 && tail.charCodeAt(0) !== 35) {
    return fail("invalid character in path");
  }
  const tailParts = splitTail(tail, true);
  if (!tailParts.ok) return tailParts;
  return {
    ok: true,
    url: {
      scheme: scheme,
      userinfo: split.userinfo,
      host: hostport.host,
      port: hostport.port,
      path: tailParts.path,
      query: tailParts.query,
      fragment: tailParts.fragment,
    },
  };
}

function parseNoAuthority(scheme: string, rest: string): UrlResult {
  if (rest.startsWith("//")) return fail("path cannot start with //");
  const tailParts = splitTail(rest, false);
  if (!tailParts.ok) return tailParts;
  return {
    ok: true,
    url: {
      scheme: scheme,
      userinfo: "",
      host: "",
      port: -1,
      path: tailParts.path,
      query: tailParts.query,
      fragment: tailParts.fragment,
    },
  };
}

interface UserSplit {
  userinfo: string;
  hostport: string;
}

function splitUserinfo(auth: string): UserSplit {
  let bracket = false;
  for (let i = 0; i < auth.length; i++) {
    const code = auth.charCodeAt(i);
    if (code === 91) bracket = true;
    else if (code === 93) bracket = false;
    else if (code === 64 && !bracket) {
      return { userinfo: auth.slice(0, i), hostport: auth.slice(i + 1) };
    }
  }
  return { userinfo: "", hostport: auth };
}

interface HostPortOk {
  ok: true;
  host: string;
  port: number;
}

type HostPortResult = HostPortOk | UrlErr;

function parseHostPort(hostport: string): HostPortResult {
  if (hostport.length === 0) return { ok: true, host: "", port: -1 };
  if (hostport.charCodeAt(0) === 91) {
    const close = hostport.indexOf("]");
    if (close < 0) return fail("missing closing bracket in host");
    const inner = hostport.slice(1, close);
    if (!validIpLiteral(inner)) return fail("invalid IPv6 address");
    const after = hostport.slice(close + 1);
    if (after.length === 0) return { ok: true, host: inner.toLowerCase(), port: -1 };
    if (after.charCodeAt(0) !== 58) return fail("invalid character in host");
    const port = parsePortDigits(after.slice(1));
    if (!port.ok) return port;
    return { ok: true, host: inner.toLowerCase(), port: port.port };
  }
  const colon = hostport.lastIndexOf(":");
  let host = hostport;
  let port = -1;
  if (colon !== -1) {
    host = hostport.slice(0, colon);
    const portText = hostport.slice(colon + 1);
    const parsed = parsePortDigits(portText);
    if (!parsed.ok) return parsed;
    port = parsed.port;
  }
  if (!validRegName(host)) return fail("invalid character in host");
  return { ok: true, host: host.toLowerCase(), port: port };
}

interface PortOk {
  ok: true;
  port: number;
}

function parsePortDigits(text: string): PortOk | UrlErr {
  if (text.length === 0) return fail("empty port");
  if (text.length > 5) return fail("port out of range");
  let value = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (!isDigit(code)) return fail("invalid port");
    value = value * 10 + (code - 48);
  }
  if (value > 65535) return fail("port out of range");
  return { ok: true, port: value };
}

interface TailOk {
  ok: true;
  path: string;
  query: string;
  fragment: string;
}

function splitTail(tail: string, authority: boolean): TailOk | UrlErr {
  let path = tail;
  let query = "";
  let fragment = "";
  const hash = tail.indexOf("#");
  if (hash !== -1) {
    fragment = tail.slice(hash + 1);
    path = tail.slice(0, hash);
  }
  const question = path.indexOf("?");
  if (question !== -1) {
    query = path.slice(question + 1);
    path = path.slice(0, question);
  }
  if (authority) {
    if (path.length > 0 && path.charCodeAt(0) !== 47) return fail("path must be empty or start with /");
  } else if (path.startsWith("//")) {
    return fail("path cannot start with //");
  }
  if (!validPath(path)) return fail("invalid character in path");
  if (!validQueryOrFragment(query)) return fail("invalid character in query");
  if (!validQueryOrFragment(fragment)) return fail("invalid character in fragment");
  return { ok: true, path: path, query: query, fragment: fragment };
}

function authorityEnd(rest: string): number {
  let i = 0;
  if (rest.charCodeAt(0) === 91) {
    const close = rest.indexOf("]");
    if (close < 0) return -1;
    i = close + 1;
  }
  while (i < rest.length) {
    const code = rest.charCodeAt(i);
    if (code === 47 || code === 63 || code === 35) break;
    i++;
  }
  return i;
}

function validUserinfo(value: string): boolean {
  return scanBytes(value, false, false, true, false);
}

function validRegName(value: string): boolean {
  return scanBytes(value, false, false, false, false);
}

function validPath(value: string): boolean {
  return scanBytes(value, true, false, true, true);
}

function validQueryOrFragment(value: string): boolean {
  return scanBytes(value, true, true, true, true);
}

function scanBytes(value: string, slash: boolean, question: boolean, colon: boolean, at: boolean): boolean {
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
  if (inner.charCodeAt(0) === 118) return validIpvFuture(inner);
  return validIpv6(inner);
}

function validIpvFuture(value: string): boolean {
  if (value.charCodeAt(0) !== 118) return false;
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
  let start = 0;
  let dots = 0;
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
  if (value.length === 2) {
    return value.charCodeAt(0) >= 49 && value.charCodeAt(0) <= 57 && isDigit(value.charCodeAt(1));
  }
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
