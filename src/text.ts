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
