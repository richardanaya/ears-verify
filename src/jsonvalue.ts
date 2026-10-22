/**
 * A small JSON reader for flat scenario objects.
 * Values are booleans, integers, or strings. Nested values are rejected.
 * This stays in the static ScriptC tier, which does not accept JSON.parse.
 */

export type JsonValue =
  | { kind: "bool"; value: boolean }
  | { kind: "int"; value: number }
  | { kind: "string"; value: string };

export interface JsonObject {
  keys: string[];
  values: JsonValue[];
}

export type JsonResult = { ok: true; object: JsonObject } | { ok: false; line: number; message: string };

class Cur {
  text: string;
  i: number;
  line: number;

  constructor(text: string) {
    this.text = text;
    this.i = 0;
    this.line = 1;
  }
}

export function parseScenarioJson(text: string): JsonResult {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const cur = new Cur(source);
  skip(cur);
  if (cur.i >= cur.text.length) return fail(cur, "expected an object");
  if (cur.text.charCodeAt(cur.i) !== 123) return fail(cur, "expected an object");
  cur.i++;
  const keys: string[] = [];
  const values: JsonValue[] = [];
  skip(cur);
  if (cur.i < cur.text.length && cur.text.charCodeAt(cur.i) === 125) {
    cur.i++;
    skip(cur);
    if (cur.i < cur.text.length) return fail(cur, "unexpected trailing text");
    return { ok: true, object: { keys: keys, values: values } };
  }
  while (cur.i < cur.text.length) {
    skip(cur);
    const key = parseString(cur);
    if (key === null) return fail(cur, "expected a string key");
    for (let i = 0; i < keys.length; i++) {
      if (keys[i] === key) return fail(cur, "duplicate key " + quote(key));
    }
    skip(cur);
    if (cur.i >= cur.text.length || cur.text.charCodeAt(cur.i) !== 58) return fail(cur, "expected ':'");
    cur.i++;
    skip(cur);
    const value = parseValue(cur);
    if (typeof value === "string") return fail(cur, value);
    keys.push(key);
    values.push(value);
    skip(cur);
    if (cur.i >= cur.text.length) return fail(cur, "expected '}'");
    const mark = cur.text.charCodeAt(cur.i);
    if (mark === 125) {
      cur.i++;
      skip(cur);
      if (cur.i < cur.text.length) return fail(cur, "unexpected trailing text");
      return { ok: true, object: { keys: keys, values: values } };
    }
    if (mark !== 44) return fail(cur, "expected ',' or '}'");
    cur.i++;
    skip(cur);
    if (cur.i < cur.text.length && cur.text.charCodeAt(cur.i) === 125) return fail(cur, "trailing comma");
  }
  return fail(cur, "expected '}'");
}

function parseValue(cur: Cur): JsonValue | string {
  if (cur.i >= cur.text.length) return "expected a value";
  const code = cur.text.charCodeAt(cur.i);
  if (code === 116 && cur.text.slice(cur.i, cur.i + 4) === "true") {
    const after = cur.i + 4;
    if (after < cur.text.length && isIdent(cur.text.charCodeAt(after))) return "expected a value";
    cur.i = after;
    return { kind: "bool", value: true };
  }
  if (code === 102 && cur.text.slice(cur.i, cur.i + 5) === "false") {
    const after = cur.i + 5;
    if (after < cur.text.length && isIdent(cur.text.charCodeAt(after))) return "expected a value";
    cur.i = after;
    return { kind: "bool", value: false };
  }
  if (code === 110 && cur.text.slice(cur.i, cur.i + 4) === "null") return "null is not allowed";
  if (code === 34) {
    const text = parseString(cur);
    if (text === null) return "unterminated string";
    return { kind: "string", value: text };
  }
  if (code === 45 || isDigit(code)) {
    const parsed = parseIntLiteral(cur);
    if (parsed === null) return "expected an integer";
    return { kind: "int", value: parsed };
  }
  if (code === 123 || code === 91) return "expected a boolean, integer, or string";
  return "expected a value";
}

function parseIntLiteral(cur: Cur): number | null {
  const start = cur.i;
  let negative = false;
  if (cur.text.charCodeAt(cur.i) === 45) {
    negative = true;
    cur.i++;
    if (cur.i >= cur.text.length || !isDigit(cur.text.charCodeAt(cur.i))) {
      cur.i = start;
      return null;
    }
  }
  if (cur.text.charCodeAt(cur.i) === 48) {
    cur.i++;
    if (cur.i < cur.text.length && isDigit(cur.text.charCodeAt(cur.i))) {
      cur.i = start;
      return null;
    }
  } else {
    if (!isDigit(cur.text.charCodeAt(cur.i))) {
      cur.i = start;
      return null;
    }
    while (cur.i < cur.text.length && isDigit(cur.text.charCodeAt(cur.i))) cur.i++;
  }
  if (cur.i < cur.text.length) {
    const code = cur.text.charCodeAt(cur.i);
    if (code === 46 || code === 101 || code === 69) {
      cur.i = start;
      return null;
    }
  }
  const digits = cur.text.slice(negative ? start + 1 : start, cur.i);
  if (digits.length > 9) {
    cur.i = start;
    return null;
  }
  let value = 0;
  for (let i = 0; i < digits.length; i++) value = value * 10 + (digits.charCodeAt(i) - 48);
  return negative ? -value : value;
}

function parseString(cur: Cur): string | null {
  if (cur.i >= cur.text.length || cur.text.charCodeAt(cur.i) !== 34) return null;
  cur.i++;
  let out = "";
  while (cur.i < cur.text.length) {
    const code = cur.text.charCodeAt(cur.i);
    if (code === 34) {
      cur.i++;
      return out;
    }
    if (code === 10 || code === 13) return null;
    if (code === 92) {
      cur.i++;
      if (cur.i >= cur.text.length) return null;
      const esc = cur.text.charCodeAt(cur.i);
      if (esc === 34 || esc === 92 || esc === 47) out += cur.text.slice(cur.i, cur.i + 1);
      else if (esc === 110) out += "\n";
      else if (esc === 114) out += "\r";
      else if (esc === 116) out += "\t";
      else if (esc === 117) {
        if (cur.i + 4 >= cur.text.length) return null;
        let hex = 0;
        for (let h = 1; h <= 4; h++) {
          const digit = hexValue(cur.text.charCodeAt(cur.i + h));
          if (digit < 0) return null;
          hex = hex * 16 + digit;
        }
        out += String.fromCharCode(hex);
        cur.i += 4;
      } else {
        return null;
      }
      cur.i++;
      continue;
    }
    out += cur.text.slice(cur.i, cur.i + 1);
    cur.i++;
  }
  return null;
}

function skip(cur: Cur): void {
  while (cur.i < cur.text.length) {
    const code = cur.text.charCodeAt(cur.i);
    if (code === 10) {
      cur.line++;
      cur.i++;
      continue;
    }
    if (code === 32 || code === 9 || code === 13) {
      cur.i++;
      continue;
    }
    break;
  }
}

function fail(cur: Cur, message: string): JsonResult {
  return { ok: false, line: cur.line, message: message };
}

function quote(value: string): string {
  return "\"" + value + "\"";
}

function isDigit(code: number): boolean {
  return code >= 48 && code <= 57;
}

function isIdent(code: number): boolean {
  return isDigit(code) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || code === 95;
}

function hexValue(code: number): number {
  if (code >= 48 && code <= 57) return code - 48;
  if (code >= 97 && code <= 102) return code - 87;
  if (code >= 65 && code <= 70) return code - 55;
  return -1;
}
