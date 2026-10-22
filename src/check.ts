/**
 * Evaluate one fully assigned scenario. This does not search.
 * A requirement fails when its condition holds and its response does not.
 */

import type { JsonObject, JsonValue } from "./jsonvalue.ts";
import { describeAssignment, displayCode, literalShown, reportBool, speakBound, type Requirement, type Spec, type Term } from "./spec.ts";
import { Binding, evalAssertion, evalBool, formatTerm, mentionedIndexes, T_FALSE, T_TRUE, T_UNKNOWN } from "./term.ts";
import { capitalize, displayQuote, englishList, formatInt, pastVoice } from "./text.ts";

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
  return evaluateRequirements(spec, spec.requirements, env);
}

export function evaluateRequirements(spec: Spec, requirements: Requirement[], env: Binding): Violation[] {
  const violations: Violation[] = [];
  for (let i = 0; i < requirements.length; i++) {
    const req = requirements[i];
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

export function explainHold(spec: Spec, env: Binding, antecedent: Term | null, consequent: Term): string {
  return narrate(spec, env, antecedent, consequent, "and");
}

function because(spec: Spec, env: Binding, antecedent: Term | null, consequent: Term): string {
  return narrate(spec, env, antecedent, consequent, "but");
}

function narrate(spec: Spec, env: Binding, antecedent: Term | null, consequent: Term, join: string): string {
  const indexes = mentionedIndexes(antecedent, consequent);
  if (indexes.length === 0) return "the response is false.";
  if (!usesVoice(spec, indexes)) {
    const parts: string[] = [];
    for (let i = 0; i < indexes.length; i++) {
      const sym = spec.symbols[indexes[i]];
      const code = env.code[indexes[i]];
      parts.push(describeAssignment(sym, displayCode(spec, sym, code), code === 1));
    }
    return englishList(parts) + ".";
  }
  const held: string[] = [];
  if (antecedent !== null) collectHeld(spec, env, antecedent, held);
  const actual = describeActual(spec, env, consequent);
  if (held.length === 0) return capitalize(actual) + ".";
  return capitalize(englishList(held)) + ", " + join + " " + actual + ".";
}

function usesVoice(spec: Spec, indexes: number[]): boolean {
  for (let i = 0; i < indexes.length; i++) {
    const sym = spec.symbols[indexes[i]];
    if (sym.phrase.length > 0 || sym.outcomeYes.length > 0) return true;
  }
  return false;
}

function collectHeld(spec: Spec, env: Binding, term: Term, out: string[]): void {
  if (term.kind === "and") {
    collectHeld(spec, env, term.left, out);
    collectHeld(spec, env, term.right, out);
    return;
  }
  if (term.kind === "or") {
    const leftTrue = evalBool(term.left, spec, env) === T_TRUE;
    const rightTrue = evalBool(term.right, spec, env) === T_TRUE;
    if (leftTrue) collectHeld(spec, env, term.left, out);
    if (rightTrue) collectHeld(spec, env, term.right, out);
    if (!leftTrue && !rightTrue) out.push(spokenOrPast(spec, term));
    return;
  }
  if (term.kind === "sym") {
    const sym = spec.symbols[term.index];
    if (sym.sort.kind === "bool") {
      out.push(reportBool(sym, env.code[term.index] === 1));
      return;
    }
  }
  if (term.kind === "not") {
    const inner = term.term;
    if (inner.kind === "sym") {
      const sym = spec.symbols[inner.index];
      if (sym.sort.kind === "bool") {
        out.push(reportBool(sym, env.code[inner.index] === 1));
        return;
      }
    }
  }
  out.push(spokenOrPast(spec, term));
}

function spokenOrPast(spec: Spec, term: Term): string {
  const spoken = spokenComparison(spec, term);
  if (spoken.length > 0) return spoken;
  return pastVoice(formatTerm(term));
}

function spokenComparison(spec: Spec, term: Term): string {
  if (
    term.kind !== "eq" &&
    term.kind !== "neq" &&
    term.kind !== "lt" &&
    term.kind !== "le" &&
    term.kind !== "gt" &&
    term.kind !== "ge"
  ) {
    return "";
  }
  if (term.left.kind !== "sym") return "";
  const sym = spec.symbols[term.left.index];
  if (sym.sort.kind === "bool") return "";
  const shown = literalShown(term.right);
  if (shown.length > 0) return speakBound(sym, shown, term.kind, false);
  return speakBound(sym, formatTerm(term.right), term.kind, true);
}

function describeActual(spec: Spec, env: Binding, term: Term): string {
  if (term.kind === "sym") {
    const sym = spec.symbols[term.index];
    if (sym.sort.kind === "bool") return reportBool(sym, env.code[term.index] === 1);
  }
  if (term.kind === "not") {
    const inner = term.term;
    if (inner.kind === "sym") {
      const sym = spec.symbols[inner.index];
      if (sym.sort.kind === "bool") return reportBool(sym, env.code[inner.index] === 1);
    }
  }
  const indexes = mentionedIndexes(null, term);
  if (indexes.length === 0) return pastVoice(formatTerm(term));
  const parts: string[] = [];
  for (let i = 0; i < indexes.length; i++) {
    const sym = spec.symbols[indexes[i]];
    const code = env.code[indexes[i]];
    parts.push(describeAssignment(sym, displayCode(spec, sym, code), code === 1));
  }
  return englishList(parts);
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
