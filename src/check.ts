/**
 * Evaluate one fully assigned scenario. This does not search.
 * A requirement fails when its condition holds and its response does not.
 */

import type { JsonObject, JsonValue } from "./jsonvalue.ts";
import { describeAssignment, displayCode, type Spec } from "./spec.ts";
import { Binding, evalAssertion, mentionedIndexes, T_FALSE, T_UNKNOWN } from "./term.ts";
import { displayQuote, englishList, formatInt } from "./text.ts";

export interface Violation {
  id: string;
  line: number;
  sentence: string;
  because: string;
}

export type BindResult = { ok: true; env: Binding } | { ok: false; message: string };

export function bindScenario(spec: Spec, object: JsonObject): BindResult {
  const env = new Binding(spec.symbols.length);
  const used: boolean[] = [];
  for (let i = 0; i < object.keys.length; i++) used.push(false);
  for (let s = 0; s < spec.symbols.length; s++) {
    const sym = spec.symbols[s];
    let found = -1;
    for (let k = 0; k < object.keys.length; k++) {
      if (object.keys[k] === sym.name) found = k;
    }
    if (found < 0) return { ok: false, message: "missing " + sym.name };
    used[found] = true;
    const value = object.values[found];
    const bound = bindValue(spec, s, value);
    if (!bound.ok) return bound;
    env.known[s] = true;
    env.code[s] = bound.code;
  }
  for (let k = 0; k < object.keys.length; k++) {
    if (!used[k]) return { ok: false, message: "unexpected " + object.keys[k] };
  }
  return { ok: true, env: env };
}

function bindValue(spec: Spec, index: number, value: JsonValue): { ok: true; code: number } | { ok: false; message: string } {
  const sym = spec.symbols[index];
  if (sym.sort.kind === "bool") {
    if (value.kind !== "bool") return { ok: false, message: sym.name + " must be true or false" };
    return { ok: true, code: value.value ? 1 : 0 };
  }
  if (sym.sort.kind === "int") {
    if (value.kind !== "int") {
      return { ok: false, message: sym.name + " must be an integer from " + formatInt(sym.sort.min) + " to " + formatInt(sym.sort.max) };
    }
    if (value.value < sym.sort.min || value.value > sym.sort.max) {
      return {
        ok: false,
        message: sym.name + " is " + formatInt(value.value) + ", outside " + formatInt(sym.sort.min) + ".." + formatInt(sym.sort.max),
      };
    }
    return { ok: true, code: value.value };
  }
  const decl = spec.enums;
  let variants: string[] = [];
  for (let i = 0; i < decl.length; i++) {
    if (decl[i].name === sym.sort.enumName) variants = decl[i].variants;
  }
  let expected = "";
  for (let i = 0; i < variants.length; i++) {
    if (i > 0) expected += " or ";
    expected += variants[i];
  }
  if (value.kind !== "string") return { ok: false, message: sym.name + " must be " + expected };
  for (let i = 0; i < variants.length; i++) {
    if (variants[i] === value.value) return { ok: true, code: i };
  }
  return { ok: false, message: sym.name + " is " + displayQuote(value.value) + ", expected " + expected };
}

export function evaluate(spec: Spec, env: Binding): Violation[] {
  const violations: Violation[] = [];
  for (let i = 0; i < spec.requirements.length; i++) {
    const req = spec.requirements[i];
    const result = evalAssertion(req.antecedent, req.consequent, spec, env);
    if (result === T_FALSE) {
      violations.push({
        id: req.id,
        line: req.line,
        sentence: req.sentence,
        because: because(spec, env, req.antecedent, req.consequent),
      });
    } else if (result === T_UNKNOWN) {
      violations.push({
        id: req.id,
        line: req.line,
        sentence: req.sentence,
        because: "could not decide this requirement from the scenario.",
      });
    }
  }
  return violations;
}

function because(spec: Spec, env: Binding, antecedent: import("./spec.ts").Term | null, consequent: import("./spec.ts").Term): string {
  const indexes = mentionedIndexes(antecedent, consequent);
  if (indexes.length === 0) return "the response is false.";
  const parts: string[] = [];
  for (let i = 0; i < indexes.length; i++) {
    const sym = spec.symbols[indexes[i]];
    const code = env.code[indexes[i]];
    parts.push(describeAssignment(sym, displayCode(spec, sym, code), code === 1));
  }
  return englishList(parts) + ".";
}

export function formatCheckText(specPath: string, scenarioPath: string, violations: Violation[]): string {
  const lines: string[] = [];
  lines.push("spec: " + specPath);
  lines.push("scenario: " + scenarioPath);
  lines.push("violations: " + formatInt(violations.length));
  for (let i = 0; i < violations.length; i++) {
    const item = violations[i];
    lines.push("");
    lines.push(item.id + " line " + formatInt(item.line));
    lines.push(item.sentence);
    lines.push(item.because);
  }
  return lines.join("\n");
}

export function formatCheckJson(specPath: string, scenarioPath: string, violations: Violation[]): string {
  const items: { id: string; line: number; sentence: string; because: string }[] = [];
  for (let i = 0; i < violations.length; i++) {
    const item = violations[i];
    items.push({ id: item.id, line: item.line, sentence: item.sentence, because: item.because });
  }
  return JSON.stringify({ ok: violations.length === 0, spec: specPath, scenario: scenarioPath, violations: items }, null, 2);
}

export function formatErrorJson(message: string): string {
  return JSON.stringify({ ok: false, error: message }, null, 2);
}
