/** Quote a string for human and JSON-adjacent messages. */
export function displayQuote(value: string): string {
  let out = "\"";
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code === 34 || code === 92) {
      out += "\\" + value.slice(i, i + 1);
    } else if (code === 10) {
      out += "\\n";
    } else if (code === 13) {
      out += "\\r";
    } else if (code === 9) {
      out += "\\t";
    } else if (code < 32) {
      out += "\\u00" + hexByte(code);
    } else {
      out += value.slice(i, i + 1);
    }
  }
  return out + "\"";
}

export function formatInt(value: number): string {
  return String(Math.trunc(value));
}

/** Capitalize the first letter when it is a lowercase ascii letter. */
export function capitalize(text: string): string {
  if (text.length === 0) return text;
  const code = text.charCodeAt(0);
  if (code >= 97 && code <= 122) return String.fromCharCode(code - 32) + text.slice(1);
  return text;
}

/** Replace the first whole word. The replacement may itself contain spaces. */
export function replaceWord(text: string, word: string, replacement: string): string {
  const end = wordEnd(text, word);
  if (end < 0) return text;
  const start = end - word.length;
  return text.slice(0, start) + replacement + text.slice(end);
}

/** Turn the first "is" into "was". Other words stay put. */
export function pastVoice(text: string): string {
  return replaceWord(text, "is", "was");
}

function wordEnd(text: string, word: string): number {
  const target = lowerAscii(word);
  let start = 0;
  for (let i = 0; i <= text.length; i++) {
    if (i === text.length || text.charCodeAt(i) === 32) {
      if (i > start && lowerAscii(text.slice(start, i)) === target) return i;
      start = i + 1;
    }
  }
  return -1;
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

/** "a", "a and b", or "a, b, and c". */
export function englishList(parts: string[]): string {
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return parts[0] + " and " + parts[1];
  let out = "";
  for (let i = 0; i < parts.length; i++) {
    if (i === parts.length - 1) out += ", and ";
    else if (i > 0) out += ", ";
    out += parts[i];
  }
  return out;
}

export function formatSmtInt(value: number): string {
  const n = Math.trunc(value);
  if (n < 0) return "(- " + formatInt(-n) + ")";
  return formatInt(n);
}

function hexByte(code: number): string {
  const hex = "0123456789abcdef";
  const hi = Math.trunc(code / 16);
  const lo = code - hi * 16;
  return hex.slice(hi, hi + 1) + hex.slice(lo, lo + 1);
}
