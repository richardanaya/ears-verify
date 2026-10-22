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

import { codeAt, domainSize, isDriver, requirementMentions, type Requirement, type Spec, type Term } from "./spec.ts";
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
  if (n > 12) return coresByDeletion(spec);
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
  if (mode === 1) return firstMatching(spec, [], spec.requirements, null, 0);
  if (mode === 2) return firstMatching(spec, spec.requirements, extra, null, 0);
  return firstMatching(spec, spec.requirements, [], null, 0);
}

/**
 * Smallest assignment where every mustHold requirement holds and, when
 * mustFail is non-empty, at least one of those requirements fails.
 * wantGuard 0 ignores guard, 1 requires it true, 2 requires it false.
 * A null guard is already true, so wantGuard 2 with a null guard finds nothing.
 */
export function firstMatching(
  spec: Spec,
  mustHold: Requirement[],
  mustFail: Requirement[],
  guard: Term | null,
  wantGuard: number,
): Binding | null {
  if (wantGuard === 2 && guard === null) return null;
  const found = new ScenarioFound();
  const env = new Binding(spec.symbols.length);
  walkMatch(spec, mustHold, mustFail, guard, wantGuard, env, 0, found);
  return found.env;
}

class ScenarioFound {
  env: Binding | null;

  constructor() {
    this.env = null;
  }
}

function walkMatch(
  spec: Spec,
  mustHold: Requirement[],
  mustFail: Requirement[],
  guard: Term | null,
  wantGuard: number,
  env: Binding,
  pos: number,
  found: ScenarioFound,
): void {
  if (found.env !== null) return;
  if (pos === spec.symbols.length) {
    if (matching(spec, mustHold, mustFail, guard, wantGuard, env)) found.env = env.copy();
    return;
  }
  const sym = spec.symbols[pos];
  const count = domainSize(spec, sym);
  for (let v = 0; v < count; v++) {
    env.known[pos] = true;
    env.code[pos] = codeAt(sym, v);
    walkMatch(spec, mustHold, mustFail, guard, wantGuard, env, pos + 1, found);
    if (found.env !== null) break;
  }
  env.known[pos] = false;
}

function matching(
  spec: Spec,
  mustHold: Requirement[],
  mustFail: Requirement[],
  guard: Term | null,
  wantGuard: number,
  env: Binding,
): boolean {
  if (wantGuard === 1 && guard !== null && evalBool(guard, spec, env) !== T_TRUE) return false;
  if (wantGuard === 2 && (guard === null || evalBool(guard, spec, env) !== T_FALSE)) return false;
  if (!allReqTrue(spec, mustHold, env)) return false;
  if (mustFail.length === 0) return true;
  return anyReqFalse(spec, mustFail, env);
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

/**
 * True when the other requirements are realizable and every full assignment
 * that satisfies them satisfies this requirement too.
 * An unrealizable spec has none: if the others were realizable and this
 * requirement followed from them, the whole spec would be realizable.
 */
export function redundantFlags(spec: Spec): boolean[] {
  const n = spec.requirements.length;
  const flags: boolean[] = [];
  for (let i = 0; i < n; i++) flags.push(false);
  if (n < 2) return flags;
  const all: number[] = [];
  for (let i = 0; i < n; i++) all.push(i);
  if (scanRequirements(spec, all).unsat !== null) return flags;
  const witnessed: boolean[] = [];
  const broken: boolean[] = [];
  for (let i = 0; i < n; i++) {
    witnessed.push(false);
    broken.push(false);
  }
  const env = new Binding(spec.symbols.length);
  walkRedundant(spec, env, 0, witnessed, broken);
  for (let i = 0; i < n; i++) {
    if (witnessed[i] && !broken[i]) flags[i] = true;
  }
  return flags;
}

function walkRedundant(spec: Spec, env: Binding, pos: number, witnessed: boolean[], broken: boolean[]): void {
  if (pos === spec.symbols.length) {
    noteRedundant(spec, env, witnessed, broken);
    return;
  }
  const sym = spec.symbols[pos];
  const count = domainSize(spec, sym);
  for (let v = 0; v < count; v++) {
    env.known[pos] = true;
    env.code[pos] = codeAt(sym, v);
    walkRedundant(spec, env, pos + 1, witnessed, broken);
  }
  env.known[pos] = false;
}

function noteRedundant(spec: Spec, env: Binding, witnessed: boolean[], broken: boolean[]): void {
  const n = spec.requirements.length;
  let trueCount = 0;
  let falseCount = 0;
  let falseIndex = 0;
  for (let i = 0; i < n; i++) {
    const req = spec.requirements[i];
    const value = evalAssertion(req.antecedent, req.consequent, spec, env);
    if (value === T_TRUE) trueCount++;
    else if (value === T_FALSE) {
      falseCount++;
      falseIndex = i;
    }
  }
  if (falseCount === 0 && trueCount === n) {
    for (let i = 0; i < n; i++) witnessed[i] = true;
    return;
  }
  if (falseCount === 1 && trueCount === n - 1) {
    witnessed[falseIndex] = true;
    broken[falseIndex] = true;
  }
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

/**
 * More than 12 requirements is too many subsets to list. Walk each driver
 * situation instead, and shrink the requirements that fail there by deletion.
 * Cores that share a requirement and are unsatisfiable in exactly the same
 * situations can collapse to one of those cores.
 */
function coresByDeletion(spec: Spec): ConflictGroup[] {
  const cores: ConflictGroup[] = [];
  const drivers = driverIndexes(spec);
  const outputs = outputIndexes(spec);
  const env = new Binding(spec.symbols.length);
  const all: number[] = [];
  for (let i = 0; i < spec.requirements.length; i++) all.push(i);
  walkCores(spec, all, drivers, outputs, env, 0, cores);
  return cores;
}

function walkCores(
  spec: Spec,
  all: number[],
  drivers: number[],
  outputs: number[],
  env: Binding,
  pos: number,
  cores: ConflictGroup[],
): void {
  if (pos === drivers.length) {
    harvestCores(spec, all, outputs, env, cores);
    return;
  }
  const si = drivers[pos];
  const sym = spec.symbols[si];
  const count = domainSize(spec, sym);
  for (let v = 0; v < count; v++) {
    env.known[si] = true;
    env.code[si] = codeAt(sym, v);
    walkCores(spec, all, drivers, outputs, env, pos + 1, cores);
  }
  env.known[si] = false;
}

function harvestCores(spec: Spec, all: number[], outputs: number[], env: Binding, cores: ConflictGroup[]): void {
  let pool = copyIndexes(all);
  while (situationUnsat(spec, pool, outputs, env)) {
    let removed = false;
    for (let c = 0; c < cores.length; c++) {
      if (!situationUnsat(spec, cores[c].indexes, outputs, env)) continue;
      const next = subtractIndexes(pool, cores[c].indexes);
      if (next.length < pool.length) {
        pool = next;
        removed = true;
      }
    }
    if (removed) continue;
    const local = minimizeSituation(spec, pool, outputs, env);
    const global = minimizeGlobal(spec, local);
    if (global.length === 0) return;
    if (!hasCore(cores, global)) cores.push({ indexes: global, minimal: true });
    const next = subtractIndexes(pool, global);
    if (next.length === pool.length) return;
    pool = next;
  }
}

function minimizeSituation(spec: Spec, indexes: number[], outputs: number[], env: Binding): number[] {
  let current = copyIndexes(indexes);
  let i = 0;
  while (i < current.length) {
    const trial = withoutAt(current, i);
    if (situationUnsat(spec, trial, outputs, env)) current = trial;
    else i++;
  }
  return current;
}

function minimizeGlobal(spec: Spec, indexes: number[]): number[] {
  let current = copyIndexes(indexes);
  let i = 0;
  while (i < current.length) {
    const trial = withoutAt(current, i);
    if (scanRequirements(spec, trial).unsat !== null) current = trial;
    else i++;
  }
  return current;
}

function situationUnsat(spec: Spec, indexes: number[], outputs: number[], env: Binding): boolean {
  if (indexes.length === 0) return false;
  clearKnown(env, outputs);
  return !searchOutputs(spec, indexes, outputs, env, 0);
}

function hasCore(cores: ConflictGroup[], indexes: number[]): boolean {
  for (let i = 0; i < cores.length; i++) {
    const known = cores[i].indexes;
    if (known.length !== indexes.length) continue;
    let same = true;
    for (let j = 0; j < known.length; j++) {
      if (known[j] !== indexes[j]) same = false;
    }
    if (same) return true;
  }
  return false;
}

function copyIndexes(indexes: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < indexes.length; i++) out.push(indexes[i]);
  return out;
}

function withoutAt(indexes: number[], drop: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < indexes.length; i++) {
    if (i !== drop) out.push(indexes[i]);
  }
  return out;
}

function subtractIndexes(indexes: number[], remove: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < indexes.length; i++) {
    let drop = false;
    for (let j = 0; j < remove.length; j++) {
      if (indexes[i] === remove[j]) drop = true;
    }
    if (!drop) out.push(indexes[i]);
  }
  return out;
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
