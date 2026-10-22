/**
 * Candidate repairs for one minimal conflict.
 * A repair drops one requirement in the set, or adds one driver literal
 * (a Bool, an enum equality, or an Int bound) to one requirement's condition.
 * Nothing here chooses a winner. A suggestion is kept only when the patched
 * spec no longer has this conflict and has no conflict it did not already have.
 */

import { parseProperty } from "./ears.ts";
import { firstUnsatDrivers, satisfiable } from "./decide.ts";
import { isDriver, findEnum, type Requirement, type Spec, type SymbolDecl, type Term } from "./spec.ts";
import { conflictingSets } from "./solver.ts";
import { englishList, formatInt } from "./text.ts";
import { termsEqual } from "./term.ts";

export interface Repair {
  kind: string;
  id: string;
  text: string;
  sentence: string;
}

interface Attempt {
  literal: Term;
  words: string;
  requirement: Requirement;
}

export function conflictKey(spec: Spec, indexes: number[]): string {
  let key = "";
  for (let i = 0; i < indexes.length; i++) {
    if (i > 0) key += ",";
    key += spec.requirements[indexes[i]].id;
  }
  return key;
}

export function findRepairs(spec: Spec, indexes: number[], originalKeys: string[]): Repair[] {
  const found: Repair[] = [];
  if (indexes.length === 0) return found;
  const target = conflictKey(spec, indexes);
  const ids: string[] = [];
  for (let i = 0; i < indexes.length; i++) ids.push(spec.requirements[indexes[i]].id);
  for (let i = 0; i < indexes.length; i++) {
    const dropped = dropRepair(spec, indexes, i, ids, originalKeys, target);
    if (dropped !== null) found.push(dropped);
  }
  for (let i = 0; i < indexes.length; i++) {
    const strengthened = strengthenRepairs(spec, indexes, i, ids, originalKeys, target);
    for (let s = 0; s < strengthened.length; s++) found.push(strengthened[s]);
  }
  return found;
}

function dropRepair(
  spec: Spec,
  indexes: number[],
  pos: number,
  ids: string[],
  originalKeys: string[],
  target: string,
): Repair | null {
  const at = indexes[pos];
  if (!verified(spec, indexes, at, null, true, originalKeys, target)) return null;
  const keptIds: string[] = [];
  const keptSentences: string[] = [];
  for (let i = 0; i < indexes.length; i++) {
    if (i === pos) continue;
    keptIds.push(ids[i]);
    keptSentences.push(spec.requirements[indexes[i]].sentence);
  }
  let sentence = "";
  for (let i = 0; i < keptSentences.length; i++) {
    if (i > 0) sentence += "\n";
    sentence += keptSentences[i];
  }
  return { kind: "drop", id: ids[pos], text: dropText(ids[pos], keptIds), sentence: sentence };
}

function dropText(id: string, kept: string[]): string {
  if (kept.length === 0) return "One repair is to drop " + id + ".";
  if (kept.length === 1) return "One repair is to drop " + id + " and keep " + kept[0] + " as written.";
  return "One repair is to drop " + id + " and keep " + englishList(kept) + " as written.";
}

function strengthenRepairs(
  spec: Spec,
  indexes: number[],
  pos: number,
  ids: string[],
  originalKeys: string[],
  target: string,
): Repair[] {
  const at = indexes[pos];
  const req = spec.requirements[at];
  const raw: Attempt[] = [];
  for (let s = 0; s < spec.symbols.length; s++) {
    const sym = spec.symbols[s];
    if (!isDriver(sym)) continue;
    if (sym.sort.kind === "bool") {
      consider(spec, indexes, at, req, notTerm(symTerm(spec, s)), boolWords(sym, false), raw);
      consider(spec, indexes, at, req, symTerm(spec, s), boolWords(sym, true), raw);
      continue;
    }
    if (sym.sort.kind === "enum") {
      const decl = findEnum(spec, sym.sort.enumName);
      if (decl === null) continue;
      for (let v = 0; v < decl.variants.length; v++) {
        const literal: Term = {
          kind: "eq",
          left: symTerm(spec, s),
          right: { kind: "enum", enumName: decl.name, variant: decl.variants[v], index: v },
        };
        consider(spec, indexes, at, req, literal, enumWords(sym, decl.variants[v]), raw);
      }
      continue;
    }
    const constants = intConstants(spec, sym.sort.min, sym.sort.max);
    const ops = ["lt", "gt", "le", "ge", "eq"];
    for (let c = 0; c < constants.length; c++) {
      for (let o = 0; o < ops.length; o++) {
        if (!usefulBound(ops[o], constants[c], sym.sort.min, sym.sort.max)) continue;
        const literal = boundTerm(spec, s, ops[o], constants[c]);
        consider(spec, indexes, at, req, literal, boundWords(sym, ops[o], constants[c]), raw);
      }
    }
  }
  const keep = pareto(spec, req.antecedent, raw);
  const found: Repair[] = [];
  for (let i = 0; i < raw.length; i++) {
    if (!keep[i]) continue;
    if (!verified(spec, indexes, at, raw[i].requirement, false, originalKeys, target)) continue;
    found.push({
      kind: "strengthen",
      id: req.id,
      text: strengthenText(req.id, raw[i].words, ids),
      sentence: raw[i].requirement.sentence,
    });
  }
  return found;
}

function consider(
  spec: Spec,
  indexes: number[],
  at: number,
  req: Requirement,
  literal: Term,
  words: string,
  raw: Attempt[],
): void {
  const sentence = rewriteSentence(req.sentence, words);
  const parsed = parseProperty(req.id + " " + sentence, spec);
  if (!parsed.ok || parsed.requirements.length !== 1) return;
  const got = parsed.requirements[0];
  if (!termsEqual(got.consequent, req.consequent)) return;
  if (got.antecedent === null) return;
  if (!equivalent(spec, got.antecedent, andTerm(req.antecedent, literal))) return;
  if (!conditionPossible(spec, got.antecedent)) return;
  const holds: Requirement[] = [];
  for (let i = 0; i < indexes.length; i++) {
    if (indexes[i] === at) holds.push(withLine(got, req));
    else holds.push(spec.requirements[indexes[i]]);
  }
  if (firstUnsatDrivers(spec, holds) !== null) return;
  raw.push({ literal: literal, words: words, requirement: withLine(got, req) });
}

function withLine(parsed: Requirement, original: Requirement): Requirement {
  return {
    id: original.id,
    line: original.line,
    sentence: parsed.sentence,
    system: parsed.system,
    antecedent: parsed.antecedent,
    consequent: parsed.consequent,
    hasWhen: parsed.hasWhen,
    hasIf: parsed.hasIf,
    whenTerm: parsed.whenTerm,
  };
}

function pareto(spec: Spec, antecedent: Term | null, raw: Attempt[]): boolean[] {
  const keep: boolean[] = [];
  for (let i = 0; i < raw.length; i++) keep.push(true);
  for (let i = 0; i < raw.length; i++) {
    for (let j = 0; j < raw.length; j++) {
      if (i === j || !keep[i]) continue;
      const iSub = excludesSubset(spec, antecedent, raw[i].literal, raw[j].literal);
      const jSub = excludesSubset(spec, antecedent, raw[j].literal, raw[i].literal);
      if (iSub && jSub && i > j) keep[i] = false;
      if (jSub && !iSub) keep[i] = false;
    }
  }
  return keep;
}

function excludesSubset(spec: Spec, antecedent: Term | null, smaller: Term, larger: Term): boolean {
  return !conditionPossible(spec, andTerm(antecedent, andTerm(notTerm(smaller), larger)));
}

function verified(
  spec: Spec,
  indexes: number[],
  at: number,
  replacement: Requirement | null,
  drop: boolean,
  originalKeys: string[],
  target: string,
): boolean {
  const requirements: Requirement[] = [];
  for (let i = 0; i < spec.requirements.length; i++) {
    if (drop && i === at) continue;
    if (!drop && i === at && replacement !== null) requirements.push(replacement);
    else requirements.push(spec.requirements[i]);
  }
  const patched: Spec = { enums: spec.enums, symbols: spec.symbols, requirements: requirements };
  const targetReqs: Requirement[] = [];
  for (let i = 0; i < indexes.length; i++) {
    const idx = indexes[i];
    if (drop && idx === at) continue;
    if (!drop && idx === at && replacement !== null) targetReqs.push(replacement);
    else targetReqs.push(spec.requirements[idx]);
  }
  if (targetReqs.length > 0 && firstUnsatDrivers(patched, targetReqs) !== null) return false;
  const keys = patchedKeys(patched);
  for (let i = 0; i < keys.length; i++) {
    if (keys[i] === target) return false;
    let known = false;
    for (let j = 0; j < originalKeys.length; j++) {
      if (originalKeys[j] === keys[i]) known = true;
    }
    if (!known && !alreadyUnsat(spec, keys[i])) return false;
  }
  return true;
}

function alreadyUnsat(spec: Spec, key: string): boolean {
  const ids: string[] = [];
  let start = 0;
  for (let i = 0; i <= key.length; i++) {
    if (i === key.length || key.charCodeAt(i) === 44) {
      if (i > start) ids.push(key.slice(start, i));
      start = i + 1;
    }
  }
  const holds: Requirement[] = [];
  for (let i = 0; i < ids.length; i++) {
    let found: Requirement | null = null;
    for (let r = 0; r < spec.requirements.length; r++) {
      if (spec.requirements[r].id === ids[i]) found = spec.requirements[r];
    }
    if (found === null) return false;
    holds.push(found);
  }
  if (holds.length === 0) return false;
  return firstUnsatDrivers(spec, holds) !== null;
}

function patchedKeys(spec: Spec): string[] {
  if (spec.requirements.length > 12) {
    const groups = conflictingSets(spec);
    const keys: string[] = [];
    for (let i = 0; i < groups.length; i++) keys.push(conflictKey(spec, groups[i].indexes));
    return keys;
  }
  const keys: string[] = [];
  const pool: number[] = [];
  for (let i = 0; i < spec.requirements.length; i++) pool.push(i);
  collectCores(spec, pool, keys, new UnsatCache());
  return keys;
}

class UnsatCache {
  keys: string[];
  unsat: boolean[];
  pools: string[];

  constructor() {
    this.keys = [];
    this.unsat = [];
    this.pools = [];
  }
}

function collectCores(spec: Spec, pool: number[], keys: string[], cache: UnsatCache): void {
  if (pool.length === 0) return;
  const poolKey = indexKey(pool);
  for (let i = 0; i < cache.pools.length; i++) {
    if (cache.pools[i] === poolKey) return;
  }
  cache.pools.push(poolKey);
  if (!indexesUnsat(spec, pool, cache)) return;
  const core = shrinkCore(spec, pool, cache);
  if (core.length === 0) return;
  const key = conflictKey(spec, core);
  let seen = false;
  for (let i = 0; i < keys.length; i++) {
    if (keys[i] === key) seen = true;
  }
  if (!seen) keys.push(key);
  for (let c = 0; c < core.length; c++) {
    const next: number[] = [];
    for (let i = 0; i < pool.length; i++) {
      if (pool[i] !== core[c]) next.push(pool[i]);
    }
    collectCores(spec, next, keys, cache);
  }
}

function shrinkCore(spec: Spec, indexes: number[], cache: UnsatCache): number[] {
  let current: number[] = [];
  for (let i = 0; i < indexes.length; i++) current.push(indexes[i]);
  let i = 0;
  while (i < current.length) {
    const trial: number[] = [];
    for (let j = 0; j < current.length; j++) {
      if (j !== i) trial.push(current[j]);
    }
    if (trial.length > 0 && indexesUnsat(spec, trial, cache)) current = trial;
    else i++;
  }
  return current;
}

function indexKey(indexes: number[]): string {
  let key = "";
  for (let i = 0; i < indexes.length; i++) {
    if (i > 0) key += ",";
    key += String(indexes[i]);
  }
  return key;
}

function indexesUnsat(spec: Spec, indexes: number[], cache: UnsatCache): boolean {
  const key = indexKey(indexes);
  for (let i = 0; i < cache.keys.length; i++) {
    if (cache.keys[i] === key) return cache.unsat[i];
  }
  const holds: Requirement[] = [];
  for (let i = 0; i < indexes.length; i++) holds.push(spec.requirements[indexes[i]]);
  const unsat = firstUnsatDrivers(spec, holds) !== null;
  cache.keys.push(key);
  cache.unsat.push(unsat);
  return unsat;
}

function strengthenText(id: string, words: string, ids: string[]): string {
  return "One repair is to add \"and " + words + "\" to the condition of " + id + "." + stays(id, ids);
}

function stays(id: string, ids: string[]): string {
  const rest: string[] = [];
  for (let i = 0; i < ids.length; i++) {
    if (ids[i] !== id) rest.push(ids[i]);
  }
  if (rest.length === 0) return "";
  if (rest.length === 1) return " " + rest[0] + " stays as written.";
  return " " + englishList(rest) + " stay as written.";
}

function rewriteSentence(sentence: string, extra: string): string {
  let body = sentence;
  if (body.length > 0 && body.charCodeAt(body.length - 1) === 46) body = body.slice(0, body.length - 1);
  const parts = splitTopCommas(body);
  if (parts === null || parts.length <= 1) {
    let base = body.trim();
    if (base.length >= 4 && base.slice(0, 4) === "The ") base = "the " + base.slice(4);
    return "When " + extra + ", " + base + ".";
  }
  const idx = parts.length - 2;
  parts[idx] = extendClause(parts[idx], extra);
  let out = parts[0];
  for (let i = 1; i < parts.length; i++) out += ", " + parts[i];
  return out + ".";
}

function extendClause(clause: string, extra: string): string {
  const trimmed = clause.trim();
  let space = -1;
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed.charCodeAt(i) === 32) {
      space = i;
      break;
    }
  }
  if (space < 0) return trimmed + " and " + extra;
  const keyword = trimmed.slice(0, space);
  const rest = trimmed.slice(space + 1).trim();
  if (hasTopOr(rest)) return keyword + " (" + rest + ") and " + extra;
  return keyword + " " + rest + " and " + extra;
}

function hasTopOr(text: string): boolean {
  let depth = 0;
  let start = 0;
  for (let i = 0; i <= text.length; i++) {
    const code = i < text.length ? text.charCodeAt(i) : 32;
    if (code === 40) depth++;
    else if (code === 41 && depth > 0) depth--;
    if (depth === 0 && (code === 32 || i === text.length)) {
      if (text.slice(start, i) === "or") return true;
      start = i + 1;
    }
  }
  return false;
}

function splitTopCommas(text: string): string[] | null {
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

function symTerm(spec: Spec, index: number): Term {
  const sym = spec.symbols[index];
  return { kind: "sym", name: sym.name, index: index, phrase: sym.phrase };
}

function notTerm(term: Term): Term {
  return { kind: "not", term: term };
}

function andTerm(left: Term | null, right: Term): Term {
  if (left === null) return right;
  return { kind: "and", left: left, right: right };
}

function boundTerm(spec: Spec, index: number, rel: string, value: number): Term {
  const right: Term = { kind: "int", value: value };
  const left = symTerm(spec, index);
  if (rel === "lt") return { kind: "lt", left: left, right: right };
  if (rel === "gt") return { kind: "gt", left: left, right: right };
  if (rel === "le") return { kind: "le", left: left, right: right };
  if (rel === "ge") return { kind: "ge", left: left, right: right };
  return { kind: "eq", left: left, right: right };
}

function boolWords(sym: SymbolDecl, isTrue: boolean): string {
  const phrase = sym.phrase.length > 0 ? sym.phrase : sym.name;
  if (isTrue) return phrase;
  return negateCondition(phrase);
}

function negateCondition(phrase: string): string {
  const token = " is ";
  const at = phrase.indexOf(token);
  if (at >= 0) return phrase.slice(0, at) + " is not " + phrase.slice(at + token.length);
  return "not " + phrase;
}

function enumWords(sym: SymbolDecl, variant: string): string {
  const name = sym.phrase.length > 0 ? sym.phrase : sym.name;
  return name + " is " + variant;
}

function boundWords(sym: SymbolDecl, rel: string, value: number): string {
  const name = sym.phrase.length > 0 ? sym.phrase : sym.name;
  return name + " is " + relationWords(rel, formatInt(value));
}

function relationWords(rel: string, shown: string): string {
  if (rel === "lt") return "less than " + shown;
  if (rel === "gt") return "greater than " + shown;
  if (rel === "le") return "at most " + shown;
  if (rel === "ge") return "at least " + shown;
  return shown;
}

function usefulBound(rel: string, value: number, min: number, max: number): boolean {
  if (rel === "eq") return value >= min && value <= max;
  if (rel === "le") return value >= min && value < max;
  if (rel === "ge") return value > min && value <= max;
  if (rel === "lt") return value > min && value <= max;
  if (rel === "gt") return value >= min && value < max;
  return false;
}

function intConstants(spec: Spec, min: number, max: number): number[] {
  const found: number[] = [];
  pushUnique(found, min);
  pushUnique(found, max);
  for (let r = 0; r < spec.requirements.length; r++) {
    const req = spec.requirements[r];
    if (req.antecedent !== null) collectInts(req.antecedent, found);
    collectInts(req.consequent, found);
  }
  for (let i = 0; i < found.length; i++) {
    for (let j = i + 1; j < found.length; j++) {
      if (found[j] < found[i]) {
        const tmp = found[i];
        found[i] = found[j];
        found[j] = tmp;
      }
    }
  }
  return found;
}

function collectInts(term: Term, found: number[]): void {
  if (term.kind === "int") {
    pushUnique(found, term.value);
    return;
  }
  if (term.kind === "not") {
    collectInts(term.term, found);
    return;
  }
  if (
    term.kind === "and" ||
    term.kind === "or" ||
    term.kind === "eq" ||
    term.kind === "neq" ||
    term.kind === "lt" ||
    term.kind === "le" ||
    term.kind === "gt" ||
    term.kind === "ge" ||
    term.kind === "add" ||
    term.kind === "sub"
  ) {
    collectInts(term.left, found);
    collectInts(term.right, found);
  }
}

function pushUnique(found: number[], value: number): void {
  for (let i = 0; i < found.length; i++) {
    if (found[i] === value) return;
  }
  found.push(value);
}

function equivalent(spec: Spec, left: Term, right: Term): boolean {
  if (termsEqual(left, right)) return true;
  return !conditionPossible(spec, andTerm(left, notTerm(right))) && !conditionPossible(spec, andTerm(right, notTerm(left)));
}

function conditionPossible(spec: Spec, term: Term): boolean {
  const probe: Requirement = {
    id: "probe",
    line: 0,
    sentence: "",
    system: "",
    antecedent: null,
    consequent: term,
    hasWhen: false,
    hasIf: false,
    whenTerm: null,
  };
  const holds: Requirement[] = [];
  holds.push(probe);
  return satisfiable(spec, holds);
}
