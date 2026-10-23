/**
 * Realizability for EARS requirements.
 *
 * A set of requirements conflicts when some situation (an assignment of the
 * events, states, and inputs) has no output assignment that satisfies all of
 * them. Whether that output assignment exists is a decision: DPLL on the
 * boolean skeleton, and bounds propagation for linear integer arithmetic.
 * Enum values are integer indexes in declaration order.
 *
 * Models are the lexicographically least assignment: false before true, enums
 * in declaration order, integers from the low end of the range to the high end.
 * Up to 12 requirements, minimal cores are every unrealizable subset. Above
 * that, cores are shrunk by deletion. A wide driver domain drops a later core
 * that would reuse a requirement already reported.
 */

import { codeAt, domainSize, isDriver, requirementMentions, termMentions, type Requirement, type Spec, type Term } from "./spec.ts";
import { driverWide, firstUnsatDrivers, minimumModel, satisfiable, TheoryQuery } from "./decide.ts";
import { Binding, evalAssertion, evalBool, T_FALSE, T_TRUE, T_UNKNOWN } from "./term.ts";

const PRODUCT_CAP = 9007199254740991;
const GAP_WALK_LIMIT = 100000;

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

class TheoryCache {
  spec: Spec;
  keys: string[];
  queries: TheoryQuery[];

  constructor(spec: Spec) {
    this.spec = spec;
    this.keys = [];
    this.queries = [];
  }

  get(indexes: number[]): TheoryQuery {
    let key = "";
    for (let i = 0; i < indexes.length; i++) {
      if (i > 0) key += ",";
      key += String(indexes[i]);
    }
    for (let i = 0; i < this.keys.length; i++) {
      if (this.keys[i] === key) return this.queries[i];
    }
    const query = new TheoryQuery(this.spec, reqsOf(this.spec, indexes));
    this.keys.push(key);
    this.queries.push(query);
    return query;
  }
}

class Ival {
  known: boolean;
  kind: string;
  lo: number;
  hi: number;

  constructor() {
    this.known = false;
    this.kind = "";
    this.lo = 0;
    this.hi = 0;
  }
}

class GapBox {
  spec: Spec;
  outputIndex: number;
  drivers: number[];
  lo: number[];
  hi: number[];
  best: Binding | null;

  constructor(spec: Spec, outputIndex: number, drivers: number[]) {
    this.spec = spec;
    this.outputIndex = outputIndex;
    this.drivers = drivers;
    this.lo = [];
    this.hi = [];
    this.best = null;
    for (let i = 0; i < spec.symbols.length; i++) {
      this.lo.push(1);
      this.hi.push(0);
    }
    for (let i = 0; i < drivers.length; i++) {
      const si = drivers[i];
      const sym = spec.symbols[si];
      const count = domainSize(spec, sym);
      if (count <= 0) continue;
      this.lo[si] = codeAt(sym, 0);
      this.hi[si] = codeAt(sym, count - 1);
    }
  }

  solve(): Binding | null {
    this.seek(0);
    return this.best;
  }

  seek(pos: number): void {
    const status = boxStatus(this.spec, this.outputIndex, this.lo, this.hi);
    if (status === 0) return;
    if (this.best !== null) {
      const weight = boxWeight(this.spec, this.drivers, this.hi);
      const bestW = gapWeight(this.spec, this.drivers, this.best);
      if (weight < bestW) return;
      if (weight === bestW && !gapBetter(this.spec, this.drivers, this.corner(), this.best)) return;
    }
    if (status === 1) {
      this.consider(this.corner());
      return;
    }
    if (pos >= this.drivers.length) {
      const env = this.pinned();
      if (isGap(this.spec, env, this.outputIndex)) this.consider(env);
      return;
    }
    const si = this.drivers[pos];
    if (this.lo[si] > this.hi[si]) return;
    if (this.lo[si] === this.hi[si]) {
      this.seek(pos + 1);
      return;
    }
    const savedLo = this.lo[si];
    const savedHi = this.hi[si];
    const span = savedHi - savedLo;
    if (span <= 24) {
      for (let v = savedHi; v >= savedLo; v--) {
        this.lo[si] = v;
        this.hi[si] = v;
        this.seek(pos + 1);
      }
      this.lo[si] = savedLo;
      this.hi[si] = savedHi;
      return;
    }
    const mid = savedLo + Math.floor(span / 2);
    this.lo[si] = mid + 1;
    this.hi[si] = savedHi;
    this.seek(pos);
    this.lo[si] = savedLo;
    this.hi[si] = mid;
    this.seek(pos);
    this.lo[si] = savedLo;
    this.hi[si] = savedHi;
  }

  corner(): Binding {
    const env = new Binding(this.spec.symbols.length);
    for (let i = 0; i < this.drivers.length; i++) {
      const si = this.drivers[i];
      env.known[si] = true;
      env.code[si] = this.hi[si];
    }
    return env;
  }

  pinned(): Binding {
    const env = new Binding(this.spec.symbols.length);
    for (let i = 0; i < this.drivers.length; i++) {
      const si = this.drivers[i];
      env.known[si] = true;
      env.code[si] = this.lo[si];
    }
    return env;
  }

  consider(env: Binding): void {
    if (this.best === null || gapBetter(this.spec, this.drivers, env, this.best)) this.best = env;
  }
}

export function spaceSize(spec: Spec): number {
  let product = 1;
  for (let i = 0; i < spec.symbols.length; i++) {
    const size = domainSize(spec, spec.symbols[i]);
    if (size <= 0) return -1;
    if (product > PRODUCT_CAP / size) return PRODUCT_CAP;
    product = product * size;
  }
  return product;
}

export function scanRequirements(spec: Spec, indexes: number[]): SituationScan {
  const holds = reqsOf(spec, indexes);
  return {
    unsat: firstUnsatDrivers(spec, holds),
    sawSat: satisfiable(spec, holds),
  };
}

export function modelFor(spec: Spec, indexes: number[], situation: Binding): Binding | null {
  return minimumModel(spec, reqsOf(spec, indexes), [], null, 0, situation, true);
}

export function conflictingSets(spec: Spec): ConflictGroup[] {
  const n = spec.requirements.length;
  if (n > 12) {
    if (driverWide(spec)) return coresLarge(spec);
    return coresByDeletion(spec);
  }
  const found = coresByHitting(spec);
  sortCores(found);
  return found;
}

/**
 * Every minimal unrealizable subset, for 12 requirements or fewer.
 * Deletion finds one core. Recursing without each of its requirements
 * finds the rest. The caller sorts them into the same order as a
 * width-then-mask listing.
 */
function coresByHitting(spec: Spec): ConflictGroup[] {
  const search = new CoreSearch(spec);
  const pool: number[] = [];
  for (let i = 0; i < spec.requirements.length; i++) pool.push(i);
  gatherCores(search, pool);
  return search.found;
}

class CoreSearch {
  spec: Spec;
  pools: string[];
  keys: string[];
  unsat: boolean[];
  found: ConflictGroup[];

  constructor(spec: Spec) {
    this.spec = spec;
    this.pools = [];
    this.keys = [];
    this.unsat = [];
    this.found = [];
  }
}

function gatherCores(search: CoreSearch, pool: number[]): void {
  if (pool.length === 0) return;
  const poolKey = indexKey(pool);
  for (let i = 0; i < search.pools.length; i++) {
    if (search.pools[i] === poolKey) return;
  }
  search.pools.push(poolKey);
  if (!indexesUnsat(search, pool)) return;
  const core = shrinkCore(search, pool);
  if (core.length === 0) return;
  if (!hasCore(search.found, core)) search.found.push({ indexes: core, minimal: true });
  for (let c = 0; c < core.length; c++) {
    const next: number[] = [];
    for (let i = 0; i < pool.length; i++) {
      if (pool[i] !== core[c]) next.push(pool[i]);
    }
    gatherCores(search, next);
  }
}

function shrinkCore(search: CoreSearch, indexes: number[]): number[] {
  let current = copyIndexes(indexes);
  let i = 0;
  while (i < current.length) {
    const trial = withoutAt(current, i);
    if (trial.length > 0 && indexesUnsat(search, trial)) current = trial;
    else i++;
  }
  return current;
}

function indexesUnsat(search: CoreSearch, indexes: number[]): boolean {
  const key = indexKey(indexes);
  for (let i = 0; i < search.keys.length; i++) {
    if (search.keys[i] === key) return search.unsat[i];
  }
  const unsat = firstUnsatDrivers(search.spec, reqsOf(search.spec, indexes)) !== null;
  search.keys.push(key);
  search.unsat.push(unsat);
  return unsat;
}

function indexKey(indexes: number[]): string {
  let key = "";
  for (let i = 0; i < indexes.length; i++) {
    if (i > 0) key += ",";
    key += String(indexes[i]);
  }
  return key;
}

function sortCores(groups: ConflictGroup[]): void {
  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      if (coreAfter(groups[i], groups[j])) {
        const tmp = groups[i];
        groups[i] = groups[j];
        groups[j] = tmp;
      }
    }
  }
}

function coreAfter(left: ConflictGroup, right: ConflictGroup): boolean {
  if (left.indexes.length !== right.indexes.length) return left.indexes.length > right.indexes.length;
  return coreMask(left.indexes) > coreMask(right.indexes);
}

function coreMask(indexes: number[]): number {
  let mask = 0;
  for (let i = 0; i < indexes.length; i++) mask += pow2(indexes[i]);
  return mask;
}

/**
 * Smallest assignment of every symbol.
 * mode 0: every requirement holds.
 * mode 1: some requirement fails.
 * mode 2: every requirement holds and some extra requirement fails.
 * Values are tried false before true, then low integers before high ones.
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
  return minimumModel(spec, mustHold, mustFail, guard, wantGuard, null, false);
}

/**
 * True when this requirement follows from the other eligible requirements
 * and those others are realizable.
 * eligible[i] is set for requirements that are outside every conflict and
 * are not an exact copy of an earlier requirement. A conflict no longer
 * hides a repeat that sits entirely outside it. An unrealizable eligible
 * set has none.
 */
export function redundantFlags(spec: Spec, eligible: boolean[]): boolean[] {
  const n = spec.requirements.length;
  const flags: boolean[] = [];
  for (let i = 0; i < n; i++) flags.push(false);
  const pool: number[] = [];
  for (let i = 0; i < n; i++) {
    if (i < eligible.length && eligible[i]) pool.push(i);
  }
  if (pool.length < 2) return flags;
  if (firstUnsatDrivers(spec, reqsOf(spec, pool)) !== null) return flags;
  for (let p = 0; p < pool.length; p++) {
    const i = pool[p];
    const others: Requirement[] = [];
    for (let q = 0; q < pool.length; q++) {
      if (q !== p) others.push(spec.requirements[pool[q]]);
    }
    if (!satisfiable(spec, others)) continue;
    const fails: Requirement[] = [];
    fails.push(spec.requirements[i]);
    if (minimumModel(spec, others, fails, null, 0, null, false) === null) flags[i] = true;
  }
  return flags;
}

export function bestGap(spec: Spec, outputIndex: number): Binding | null {
  let mentioned = false;
  for (let r = 0; r < spec.requirements.length; r++) {
    const req = spec.requirements[r];
    if (!requirementMentions(req, outputIndex)) continue;
    mentioned = true;
    if (req.antecedent === null) return null;
  }
  const drivers = driverIndexes(spec);
  if (!mentioned) return maxDriverBinding(spec, drivers);
  const relevant = gapDrivers(spec, outputIndex, drivers);
  if (driverWalkFits(spec, relevant)) {
    const env = new Binding(spec.symbols.length);
    pinGapMax(spec, drivers, relevant, env);
    const state = new GapState();
    walkGaps(spec, outputIndex, relevant, outputIndexes(spec), env, 0, state);
    return state.best;
  }
  const box = new GapBox(spec, outputIndex, drivers);
  pinBoxMax(spec, drivers, relevant, box);
  return box.solve();
}

/** Drivers that appear in a condition of a requirement that names this output. */
function gapDrivers(spec: Spec, outputIndex: number, drivers: number[]): number[] {
  const relevant: number[] = [];
  for (let d = 0; d < drivers.length; d++) {
    const si = drivers[d];
    let hit = false;
    for (let r = 0; r < spec.requirements.length; r++) {
      const req = spec.requirements[r];
      if (!requirementMentions(req, outputIndex)) continue;
      if (req.antecedent !== null && termMentions(req.antecedent, si)) hit = true;
    }
    if (hit) relevant.push(si);
  }
  return relevant;
}

function pinGapMax(spec: Spec, drivers: number[], relevant: number[], env: Binding): void {
  for (let d = 0; d < drivers.length; d++) {
    const si = drivers[d];
    if (hasIndex(relevant, si)) continue;
    const count = domainSize(spec, spec.symbols[si]);
    env.known[si] = true;
    env.code[si] = count <= 0 ? 0 : codeAt(spec.symbols[si], count - 1);
  }
}

function pinBoxMax(spec: Spec, drivers: number[], relevant: number[], box: GapBox): void {
  for (let d = 0; d < drivers.length; d++) {
    const si = drivers[d];
    if (hasIndex(relevant, si)) continue;
    const count = domainSize(spec, spec.symbols[si]);
    const code = count <= 0 ? 0 : codeAt(spec.symbols[si], count - 1);
    box.lo[si] = code;
    box.hi[si] = code;
  }
}

function hasIndex(indexes: number[], value: number): boolean {
  for (let i = 0; i < indexes.length; i++) {
    if (indexes[i] === value) return true;
  }
  return false;
}

function reqsOf(spec: Spec, indexes: number[]): Requirement[] {
  const holds: Requirement[] = [];
  for (let i = 0; i < indexes.length; i++) holds.push(spec.requirements[indexes[i]]);
  return holds;
}

function maxDriverBinding(spec: Spec, drivers: number[]): Binding {
  const env = new Binding(spec.symbols.length);
  for (let i = 0; i < drivers.length; i++) {
    const si = drivers[i];
    const sym = spec.symbols[si];
    const count = domainSize(spec, sym);
    env.known[si] = true;
    env.code[si] = count <= 0 ? 0 : codeAt(sym, count - 1);
  }
  return env;
}

function driverWalkFits(spec: Spec, drivers: number[]): boolean {
  let product = 1;
  for (let i = 0; i < drivers.length; i++) {
    const size = domainSize(spec, spec.symbols[drivers[i]]);
    if (size <= 0 || size > 4096) return false;
    if (product > GAP_WALK_LIMIT / size) return false;
    product = product * size;
  }
  return true;
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

function boxWeight(spec: Spec, drivers: number[], hi: number[]): number {
  let weight = 0;
  for (let i = 0; i < drivers.length; i++) {
    const si = drivers[i];
    const sym = spec.symbols[si];
    if (sym.sort.kind === "int") weight += hi[si] - sym.sort.min;
    else weight += hi[si];
  }
  return weight;
}

function boxStatus(spec: Spec, outputIndex: number, lo: number[], hi: number[]): number {
  let mixed = false;
  for (let r = 0; r < spec.requirements.length; r++) {
    const req = spec.requirements[r];
    if (!requirementMentions(req, outputIndex)) continue;
    if (req.antecedent === null) return 0;
    const guard = rangeBool(req.antecedent, spec, lo, hi);
    if (guard === T_TRUE) return 0;
    if (guard === T_FALSE) continue;
    if (!canBeFalse(req.antecedent, spec, lo, hi)) return 0;
    mixed = true;
  }
  if (mixed) return 2;
  return 1;
}

function rangeBool(term: Term, spec: Spec, lo: number[], hi: number[]): number {
  if (term.kind === "bool") return term.value ? T_TRUE : T_FALSE;
  if (term.kind === "sym") {
    if (lo[term.index] > hi[term.index]) return T_UNKNOWN;
    const sym = spec.symbols[term.index];
    if (sym.sort.kind !== "bool") return T_UNKNOWN;
    if (lo[term.index] !== hi[term.index]) return T_UNKNOWN;
    return lo[term.index] === 1 ? T_TRUE : T_FALSE;
  }
  if (term.kind === "not") {
    const inner = rangeBool(term.term, spec, lo, hi);
    if (inner === T_UNKNOWN) return T_UNKNOWN;
    return inner === T_TRUE ? T_FALSE : T_TRUE;
  }
  if (term.kind === "and") {
    const left = rangeBool(term.left, spec, lo, hi);
    const right = rangeBool(term.right, spec, lo, hi);
    if (left === T_FALSE || right === T_FALSE) return T_FALSE;
    if (left === T_TRUE && right === T_TRUE) return T_TRUE;
    return T_UNKNOWN;
  }
  if (term.kind === "or") {
    const left = rangeBool(term.left, spec, lo, hi);
    const right = rangeBool(term.right, spec, lo, hi);
    if (left === T_TRUE || right === T_TRUE) return T_TRUE;
    if (left === T_FALSE && right === T_FALSE) return T_FALSE;
    return T_UNKNOWN;
  }
  if (
    term.kind === "eq" ||
    term.kind === "neq" ||
    term.kind === "lt" ||
    term.kind === "le" ||
    term.kind === "gt" ||
    term.kind === "ge"
  ) {
    return rangeCmp(term, spec, lo, hi);
  }
  return T_UNKNOWN;
}

function rangeCmp(term: Term, spec: Spec, lo: number[], hi: number[]): number {
  if (
    term.kind !== "eq" &&
    term.kind !== "neq" &&
    term.kind !== "lt" &&
    term.kind !== "le" &&
    term.kind !== "gt" &&
    term.kind !== "ge"
  ) {
    return T_UNKNOWN;
  }
  const left = linRange(term.left, spec, lo, hi);
  const right = linRange(term.right, spec, lo, hi);
  if (!left.known || !right.known) return T_UNKNOWN;
  if (left.kind !== right.kind) return T_UNKNOWN;
  const apart = left.hi < right.lo || right.hi < left.lo;
  const points = left.lo === left.hi && right.lo === right.hi;
  const same = points && left.lo === right.lo;
  if (left.kind !== "int") {
    if (term.kind === "eq") {
      if (same) return T_TRUE;
      if (apart) return T_FALSE;
      return T_UNKNOWN;
    }
    if (term.kind === "neq") {
      if (same) return T_FALSE;
      if (apart) return T_TRUE;
      return T_UNKNOWN;
    }
    return T_UNKNOWN;
  }
  if (term.kind === "eq") {
    if (same) return T_TRUE;
    if (apart) return T_FALSE;
    return T_UNKNOWN;
  }
  if (term.kind === "neq") {
    if (same) return T_FALSE;
    if (apart) return T_TRUE;
    return T_UNKNOWN;
  }
  if (term.kind === "lt") {
    if (left.hi < right.lo) return T_TRUE;
    if (left.lo >= right.hi) return T_FALSE;
    return T_UNKNOWN;
  }
  if (term.kind === "le") {
    if (left.hi <= right.lo) return T_TRUE;
    if (left.lo > right.hi) return T_FALSE;
    return T_UNKNOWN;
  }
  if (term.kind === "gt") {
    if (left.lo > right.hi) return T_TRUE;
    if (left.hi <= right.lo) return T_FALSE;
    return T_UNKNOWN;
  }
  if (left.lo >= right.hi) return T_TRUE;
  if (left.hi < right.lo) return T_FALSE;
  return T_UNKNOWN;
}

function linRange(term: Term, spec: Spec, lo: number[], hi: number[]): Ival {
  const out = new Ival();
  if (term.kind === "int") {
    out.known = true;
    out.kind = "int";
    out.lo = term.value;
    out.hi = term.value;
    return out;
  }
  if (term.kind === "enum") {
    out.known = true;
    out.kind = "enum:" + term.enumName;
    out.lo = term.index;
    out.hi = term.index;
    return out;
  }
  if (term.kind === "bool") {
    out.known = true;
    out.kind = "bool";
    out.lo = term.value ? 1 : 0;
    out.hi = out.lo;
    return out;
  }
  if (term.kind === "sym") {
    if (lo[term.index] > hi[term.index]) return out;
    const sym = spec.symbols[term.index];
    out.known = true;
    if (sym.sort.kind === "bool") out.kind = "bool";
    else if (sym.sort.kind === "int") out.kind = "int";
    else out.kind = "enum:" + sym.sort.enumName;
    out.lo = lo[term.index];
    out.hi = hi[term.index];
    return out;
  }
  if (term.kind === "add" || term.kind === "sub") {
    const left = linRange(term.left, spec, lo, hi);
    const right = linRange(term.right, spec, lo, hi);
    if (!left.known || !right.known || left.kind !== "int" || right.kind !== "int") return out;
    out.known = true;
    out.kind = "int";
    if (term.kind === "add") {
      out.lo = left.lo + right.lo;
      out.hi = left.hi + right.hi;
    } else {
      out.lo = left.lo - right.hi;
      out.hi = left.hi - right.lo;
    }
    return out;
  }
  return out;
}

function canBeFalse(term: Term, spec: Spec, lo: number[], hi: number[]): boolean {
  if (term.kind === "bool") return !term.value;
  if (term.kind === "sym") {
    if (lo[term.index] > hi[term.index]) return false;
    if (spec.symbols[term.index].sort.kind !== "bool") return false;
    return lo[term.index] === 0;
  }
  if (term.kind === "not") return canBeTrue(term.term, spec, lo, hi);
  if (term.kind === "and") return canBeFalse(term.left, spec, lo, hi) || canBeFalse(term.right, spec, lo, hi);
  if (term.kind === "or") return canBeFalse(term.left, spec, lo, hi) && canBeFalse(term.right, spec, lo, hi);
  const value = rangeBool(term, spec, lo, hi);
  if (value === T_FALSE) return true;
  if (value === T_TRUE) return false;
  return true;
}

function canBeTrue(term: Term, spec: Spec, lo: number[], hi: number[]): boolean {
  if (term.kind === "bool") return term.value;
  if (term.kind === "sym") {
    if (lo[term.index] > hi[term.index]) return false;
    if (spec.symbols[term.index].sort.kind !== "bool") return false;
    return hi[term.index] === 1;
  }
  if (term.kind === "not") return canBeFalse(term.term, spec, lo, hi);
  if (term.kind === "and") return canBeTrue(term.left, spec, lo, hi) && canBeTrue(term.right, spec, lo, hi);
  if (term.kind === "or") return canBeTrue(term.left, spec, lo, hi) || canBeTrue(term.right, spec, lo, hi);
  const value = rangeBool(term, spec, lo, hi);
  if (value === T_TRUE) return true;
  if (value === T_FALSE) return false;
  return true;
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
  const env = new Binding(spec.symbols.length);
  const all: number[] = [];
  for (let i = 0; i < spec.requirements.length; i++) all.push(i);
  const cache = new TheoryCache(spec);
  walkCores(spec, all, drivers, env, 0, cores, cache);
  return cores;
}

function walkCores(
  spec: Spec,
  all: number[],
  drivers: number[],
  env: Binding,
  pos: number,
  cores: ConflictGroup[],
  cache: TheoryCache,
): void {
  if (pos === drivers.length) {
    harvestCores(spec, all, env, cores, cache);
    return;
  }
  if (remainWide(spec, drivers, pos) && cache.get(all).provenSat(env)) return;
  const si = drivers[pos];
  const sym = spec.symbols[si];
  const count = domainSize(spec, sym);
  for (let v = 0; v < count; v++) {
    env.known[si] = true;
    env.code[si] = codeAt(sym, v);
    walkCores(spec, all, drivers, env, pos + 1, cores, cache);
  }
  env.known[si] = false;
}

function remainWide(spec: Spec, drivers: number[], pos: number): boolean {
  let product = 1;
  for (let i = pos; i < drivers.length; i++) {
    const size = domainSize(spec, spec.symbols[drivers[i]]);
    if (size <= 0 || size > 64) return true;
    if (product > 64 / size) return true;
    product = product * size;
  }
  return false;
}

function harvestCores(spec: Spec, all: number[], env: Binding, cores: ConflictGroup[], cache: TheoryCache): void {
  let pool = copyIndexes(all);
  while (situationUnsat(pool, env, cache)) {
    let removed = false;
    for (let c = 0; c < cores.length; c++) {
      if (!situationUnsat(cores[c].indexes, env, cache)) continue;
      const next = subtractIndexes(pool, cores[c].indexes);
      if (next.length < pool.length) {
        pool = next;
        removed = true;
      }
    }
    if (removed) continue;
    const local = minimizeSituation(pool, env, cache);
    const global = minimizeGlobal(local, cache);
    if (global.length === 0) return;
    if (!hasCore(cores, global)) cores.push({ indexes: global, minimal: true });
    const next = subtractIndexes(pool, global);
    if (next.length === pool.length) return;
    pool = next;
  }
}

/**
 * Wide driver domains are not listed. Each core is the requirements that fail
 * in the least bad situation still in the pool, then that core is removed.
 * A later core that needs a requirement from an earlier one is not reported.
 */
function coresLarge(spec: Spec): ConflictGroup[] {
  const cores: ConflictGroup[] = [];
  let pool: number[] = [];
  for (let i = 0; i < spec.requirements.length; i++) pool.push(i);
  const cache = new TheoryCache(spec);
  while (pool.length > 0) {
    const bad = cache.get(pool).badDrivers();
    if (bad === null) break;
    const local = minimizeSituation(pool, bad, cache);
    const global = minimizeGlobal(local, cache);
    if (global.length === 0) break;
    if (!hasCore(cores, global)) cores.push({ indexes: global, minimal: true });
    const next = subtractIndexes(pool, global);
    if (next.length === pool.length) break;
    pool = next;
  }
  return cores;
}

function minimizeSituation(indexes: number[], env: Binding, cache: TheoryCache): number[] {
  let current = copyIndexes(indexes);
  let i = 0;
  while (i < current.length) {
    const trial = withoutAt(current, i);
    if (situationUnsat(trial, env, cache)) current = trial;
    else i++;
  }
  return current;
}

function minimizeGlobal(indexes: number[], cache: TheoryCache): number[] {
  let current = copyIndexes(indexes);
  let i = 0;
  while (i < current.length) {
    const trial = withoutAt(current, i);
    const bad = trial.length === 0 ? null : cache.get(trial).badDrivers();
    if (bad !== null) current = trial;
    else i++;
  }
  return current;
}

function situationUnsat(indexes: number[], env: Binding, cache: TheoryCache): boolean {
  if (indexes.length === 0) return false;
  return !cache.get(indexes).pinnedSat(env);
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
