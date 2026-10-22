/**
 * Finite-domain search for EARS requirements.
 *
 * A set of requirements conflicts when some situation (an assignment of the
 * events, states, and inputs) has no output assignment that satisfies all of
 * them. Two responses can each be possible on their own and still clash when
 * the same situation makes both of them apply.
 *
 * Values are tried false before true, enums in declaration order, and integers
 * from min to max, so the first result is stable. The product of the domain
 * sizes is capped.
 */

import { codeAt, domainSize, isDriver, requirementMentions, type Requirement, type Spec } from "./spec.ts";
import { Binding, evalAssertion, evalBool, T_FALSE, T_TRUE } from "./term.ts";

export const SEARCH_LIMIT = 250000;

export interface SituationScan {
  unsat: Binding | null;
  sawSat: boolean;
}

export interface ConflictGroup {
  indexes: number[];
  minimal: boolean;
}

class GapState {
  best: Binding | null;

  constructor() {
    this.best = null;
  }
}

export function spaceSize(spec: Spec): number {
  let product = 1;
  for (let i = 0; i < spec.symbols.length; i++) {
    const size = domainSize(spec, spec.symbols[i]);
    if (size <= 0) return -1;
    if (product > SEARCH_LIMIT / size) return -1;
    product = product * size;
  }
  return product;
}

export function scanRequirements(spec: Spec, indexes: number[]): SituationScan {
  const env = new Binding(spec.symbols.length);
  const scan: SituationScan = { unsat: null, sawSat: false };
  walkSituations(spec, indexes, driverIndexes(spec), outputIndexes(spec), env, 0, scan);
  return scan;
}

export function modelFor(spec: Spec, indexes: number[], situation: Binding): Binding | null {
  const env = situation.copy();
  const outputs = outputIndexes(spec);
  clearKnown(env, outputs);
  if (searchOutputs(spec, indexes, outputs, env, 0)) return env;
  return null;
}

export function conflictingSets(spec: Spec): ConflictGroup[] {
  const n = spec.requirements.length;
  if (n > 12) {
    const all: number[] = [];
    for (let i = 0; i < n; i++) all.push(i);
    const scan = scanRequirements(spec, all);
    if (scan.unsat === null) return [];
    return [{ indexes: all, minimal: false }];
  }
  let size = 1;
  for (let i = 0; i < n; i++) size = size * 2;
  const cacheKnown: boolean[] = [];
  const cacheReal: boolean[] = [];
  for (let i = 0; i < size; i++) {
    cacheKnown.push(false);
    cacheReal.push(false);
  }
  const found: number[] = [];
  for (let width = 1; width <= n; width++) {
    for (let mask = 1; mask < size; mask++) {
      if (popcount(mask) !== width) continue;
      let skip = false;
      for (let f = 0; f < found.length; f++) {
        if (includesAll(mask, found[f])) {
          skip = true;
          break;
        }
      }
      if (skip) continue;
      if (maskRealizable(spec, mask, n, cacheKnown, cacheReal)) continue;
      let minimal = true;
      for (let bit = 0; bit < n; bit++) {
        if (!hasBit(mask, bit)) continue;
        if (!maskRealizable(spec, mask - pow2(bit), n, cacheKnown, cacheReal)) {
          minimal = false;
          break;
        }
      }
      if (minimal) found.push(mask);
    }
  }
  const groups: ConflictGroup[] = [];
  for (let i = 0; i < found.length; i++) {
    groups.push({ indexes: maskIndexes(found[i], n), minimal: true });
  }
  return groups;
}

/**
 * Smallest assignment of every symbol.
 * mode 0: every requirement holds.
 * mode 1: some requirement fails.
 * mode 2: every requirement holds and some extra requirement fails.
 * Values are tried in the same order as the linter: false, then true.
 */
export function firstScenario(spec: Spec, mode: number, extra: Requirement[]): Binding | null {
  const found = new ScenarioFound();
  const env = new Binding(spec.symbols.length);
  walkAll(spec, mode, extra, env, 0, found);
  return found.env;
}

class ScenarioFound {
  env: Binding | null;

  constructor() {
    this.env = null;
  }
}

function walkAll(spec: Spec, mode: number, extra: Requirement[], env: Binding, pos: number, found: ScenarioFound): void {
  if (found.env !== null) return;
  if (pos === spec.symbols.length) {
    if (scenarioMatches(spec, mode, extra, env)) found.env = env.copy();
    return;
  }
  const sym = spec.symbols[pos];
  const count = domainSize(spec, sym);
  for (let v = 0; v < count; v++) {
    env.known[pos] = true;
    env.code[pos] = codeAt(sym, v);
    walkAll(spec, mode, extra, env, pos + 1, found);
    if (found.env !== null) break;
  }
  env.known[pos] = false;
}

function scenarioMatches(spec: Spec, mode: number, extra: Requirement[], env: Binding): boolean {
  if (mode === 1) return anyReqFalse(spec, spec.requirements, env);
  if (!allReqTrue(spec, spec.requirements, env)) return false;
  if (mode === 2) return anyReqFalse(spec, extra, env);
  return true;
}

function allReqTrue(spec: Spec, reqs: Requirement[], env: Binding): boolean {
  for (let i = 0; i < reqs.length; i++) {
    if (evalAssertion(reqs[i].antecedent, reqs[i].consequent, spec, env) !== T_TRUE) return false;
  }
  return true;
}

function anyReqFalse(spec: Spec, reqs: Requirement[], env: Binding): boolean {
  for (let i = 0; i < reqs.length; i++) {
    if (evalAssertion(reqs[i].antecedent, reqs[i].consequent, spec, env) === T_FALSE) return true;
  }
  return false;
}

export function bestGap(spec: Spec, outputIndex: number): Binding | null {
  const env = new Binding(spec.symbols.length);
  const state = new GapState();
  walkGaps(spec, outputIndex, driverIndexes(spec), outputIndexes(spec), env, 0, state);
  return state.best;
}

function walkSituations(
  spec: Spec,
  indexes: number[],
  drivers: number[],
  outputs: number[],
  env: Binding,
  pos: number,
  scan: SituationScan,
): void {
  if (scan.unsat !== null && scan.sawSat) return;
  if (pos === drivers.length) {
    clearKnown(env, outputs);
    const sat = searchOutputs(spec, indexes, outputs, env, 0);
    if (sat) scan.sawSat = true;
    else if (scan.unsat === null) {
      const snap = env.copy();
      clearKnown(snap, outputs);
      scan.unsat = snap;
    }
    return;
  }
  const si = drivers[pos];
  const sym = spec.symbols[si];
  const count = domainSize(spec, sym);
  for (let v = 0; v < count; v++) {
    env.known[si] = true;
    env.code[si] = codeAt(sym, v);
    walkSituations(spec, indexes, drivers, outputs, env, pos + 1, scan);
    if (scan.unsat !== null && scan.sawSat) break;
  }
  env.known[si] = false;
}

function walkGaps(
  spec: Spec,
  outputIndex: number,
  drivers: number[],
  outputs: number[],
  env: Binding,
  pos: number,
  state: GapState,
): void {
  if (pos === drivers.length) {
    clearKnown(env, outputs);
    if (!isGap(spec, env, outputIndex)) return;
    if (state.best === null || gapBetter(spec, drivers, env, state.best)) {
      const snap = env.copy();
      clearKnown(snap, outputs);
      state.best = snap;
    }
    return;
  }
  const si = drivers[pos];
  const sym = spec.symbols[si];
  const count = domainSize(spec, sym);
  for (let v = 0; v < count; v++) {
    env.known[si] = true;
    env.code[si] = codeAt(sym, v);
    walkGaps(spec, outputIndex, drivers, outputs, env, pos + 1, state);
  }
  env.known[si] = false;
}

function isGap(spec: Spec, env: Binding, outputIndex: number): boolean {
  for (let r = 0; r < spec.requirements.length; r++) {
    const req = spec.requirements[r];
    if (!requirementMentions(req, outputIndex)) continue;
    const guard = req.antecedent === null ? T_TRUE : evalBool(req.antecedent, spec, env);
    if (guard !== T_FALSE) return false;
  }
  return true;
}

function gapBetter(spec: Spec, drivers: number[], env: Binding, best: Binding): boolean {
  const left = gapWeight(spec, drivers, env);
  const right = gapWeight(spec, drivers, best);
  if (left > right) return true;
  if (left < right) return false;
  for (let i = 0; i < drivers.length; i++) {
    const si = drivers[i];
    if (env.code[si] > best.code[si]) return true;
    if (env.code[si] < best.code[si]) return false;
  }
  return false;
}

function gapWeight(spec: Spec, drivers: number[], env: Binding): number {
  let weight = 0;
  for (let i = 0; i < drivers.length; i++) {
    const si = drivers[i];
    const sym = spec.symbols[si];
    if (sym.sort.kind === "int") weight += env.code[si] - sym.sort.min;
    else weight += env.code[si];
  }
  return weight;
}

function searchOutputs(spec: Spec, indexes: number[], outputs: number[], env: Binding, pos: number): boolean {
  if (pos === outputs.length) return allTrue(spec, indexes, env);
  if (anyFalse(spec, indexes, env)) return false;
  const si = outputs[pos];
  const sym = spec.symbols[si];
  const count = domainSize(spec, sym);
  for (let v = 0; v < count; v++) {
    env.known[si] = true;
    env.code[si] = codeAt(sym, v);
    if (searchOutputs(spec, indexes, outputs, env, pos + 1)) return true;
  }
  env.known[si] = false;
  return false;
}

function allTrue(spec: Spec, indexes: number[], env: Binding): boolean {
  for (let i = 0; i < indexes.length; i++) {
    const req = spec.requirements[indexes[i]];
    if (evalAssertion(req.antecedent, req.consequent, spec, env) !== T_TRUE) return false;
  }
  return true;
}

function anyFalse(spec: Spec, indexes: number[], env: Binding): boolean {
  for (let i = 0; i < indexes.length; i++) {
    const req = spec.requirements[indexes[i]];
    if (evalAssertion(req.antecedent, req.consequent, spec, env) === T_FALSE) return true;
  }
  return false;
}

function clearKnown(env: Binding, indexes: number[]): void {
  for (let i = 0; i < indexes.length; i++) env.known[indexes[i]] = false;
}

function driverIndexes(spec: Spec): number[] {
  const indexes: number[] = [];
  for (let i = 0; i < spec.symbols.length; i++) {
    if (isDriver(spec.symbols[i])) indexes.push(i);
  }
  return indexes;
}

function outputIndexes(spec: Spec): number[] {
  const indexes: number[] = [];
  for (let i = 0; i < spec.symbols.length; i++) {
    if (!isDriver(spec.symbols[i])) indexes.push(i);
  }
  return indexes;
}

function maskRealizable(spec: Spec, mask: number, n: number, cacheKnown: boolean[], cacheReal: boolean[]): boolean {
  if (mask === 0) return true;
  if (cacheKnown[mask]) return cacheReal[mask];
  const scan = scanRequirements(spec, maskIndexes(mask, n));
  const ok = scan.unsat === null;
  cacheKnown[mask] = true;
  cacheReal[mask] = ok;
  return ok;
}

function maskIndexes(mask: number, n: number): number[] {
  const indexes: number[] = [];
  for (let bit = 0; bit < n; bit++) {
    if (hasBit(mask, bit)) indexes.push(bit);
  }
  return indexes;
}

function includesAll(candidate: number, found: number): boolean {
  let bit = 0;
  let rest = found;
  while (rest > 0) {
    if (rest % 2 === 1 && !hasBit(candidate, bit)) return false;
    rest = Math.trunc(rest / 2);
    bit++;
  }
  return true;
}

function hasBit(mask: number, bit: number): boolean {
  const bitValue = pow2(bit);
  return Math.trunc(mask / bitValue) % 2 === 1;
}

function pow2(bit: number): number {
  let value = 1;
  for (let i = 0; i < bit; i++) value = value * 2;
  return value;
}

function popcount(mask: number): number {
  let count = 0;
  let rest = mask;
  while (rest > 0) {
    if (rest % 2 === 1) count++;
    rest = Math.trunc(rest / 2);
  }
  return count;
}
