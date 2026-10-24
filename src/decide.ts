/**
 * Decision procedure for EARS requirements.
 *
 * Boolean structure is a DPLL search over a Tseitin CNF. Linear integer
 * constraints, including enum indexes encoded as bounded integers, are posted
 * into a bounds propagator. The search returns the lexicographically least
 * model: false before true, enums in declaration order, integers from low to
 * high. A conflict is a driver situation for which the output constraints are
 * unsatisfiable. Large integer domains are decided from bounds and from the
 * finitely many points where a comparison changes, not by listing the domain.
 */

import { domainSize, findEnum, isDriver, requirementMentions, termMentions, type Requirement, type Spec, type Term } from "./spec.ts";
import { Binding, evalAssertion, evalBool, T_FALSE, T_TRUE } from "./term.ts";

const TRUE_ATOM = 0;
const OP_LE = 0;
const OP_GE = 1;
const OP_EQ = 2;
const OP_NE = 3;

/**
 * One linear comparison. Number fields stay raw in the native imply loop.
 * A number[] read is number | undefined, and ScriptC boxes that on the heap.
 */
class TheoryRow {
  si: number;
  coeff: number;
  op: number;
  constant: number;

  constructor(si: number, coeff: number, op: number, constant: number) {
    this.si = si;
    this.coeff = coeff;
    this.op = op;
    this.constant = constant;
  }
}

class AtomInfo {
  kind: number;
  sym: number;
  vars: number[];
  coeffs: number[];
  constant: number;
  op: number;

  constructor() {
    this.kind = 2;
    this.sym = -1;
    this.vars = [];
    this.coeffs = [];
    this.constant = 0;
    this.op = OP_LE;
  }
}

class Ineq {
  vars: number[];
  coeffs: number[];
  rhs: number;

  constructor() {
    this.vars = [];
    this.coeffs = [];
    this.rhs = 0;
  }
}

class Diseq {
  vars: number[];
  coeffs: number[];
  rhs: number;

  constructor() {
    this.vars = [];
    this.coeffs = [];
    this.rhs = 0;
  }
}

class Lin {
  vars: number[];
  coeffs: number[];
  constant: number;

  constructor() {
    this.vars = [];
    this.coeffs = [];
    this.constant = 0;
  }
}

/**
 * Lexicographically least full assignment satisfying every holds requirement,
 * with at least one fails requirement false when that list is non-empty.
 * wantGuard 0 ignores guard, 1 requires it true, 2 requires it false.
 * A null guard with wantGuard 2 has no model.
 * pins, when present, fixes every driver (pinDrivers true) or every known symbol.
 */
export function minimumModel(
  spec: Spec,
  holds: Requirement[],
  fails: Requirement[],
  guard: Term | null,
  wantGuard: number,
  pins: Binding | null,
  pinDrivers: boolean,
): Binding | null {
  if (wantGuard === 2 && guard === null) return null;
  const engine = new Engine(spec);
  if (!engine.compile(holds, fails, guard, wantGuard)) return null;
  engine.reset();
  if (pins !== null && !engine.applyPins(pins, pinDrivers)) return null;
  if (!engine.propagate()) return null;
  if (!engine.search(0, true)) return null;
  return engine.toBinding(true);
}

/** True when some full assignment satisfies every requirement in holds. */
export function satisfiable(spec: Spec, holds: Requirement[]): boolean {
  return new TheoryQuery(spec, holds).hasModel();
}

/**
 * Lexicographically least driver assignment for which holds has no output model.
 * Null when every driver situation has an output model.
 */
export function firstUnsatDrivers(spec: Spec, holds: Requirement[]): Binding | null {
  return new TheoryQuery(spec, holds).badDrivers();
}

/** True when the pinned driver situation still has an output model. */
export function outputsSat(spec: Spec, holds: Requirement[], drivers: Binding): boolean {
  return new TheoryQuery(spec, holds).pinnedSat(drivers);
}

class Engine {
  spec: Spec;
  nsym: number;
  baseLo: number[];
  baseHi: number[];
  isBool: boolean[];
  drivers: number[];
  atoms: AtomInfo[];
  /** Indexes of linear-comparison atoms. */
  theoryAtoms: number[];
  /** Parallel to atoms. Theory-atom slot, or -1. */
  atomSlot: number[];
  /** Parallel to theoryAtoms. Index in thLive, or -1 when the atom is assigned. */
  thPos: number[];
  /** Unassigned theory-atom slots. */
  thLive: number[];
  /**
   * Unassigned slots whose bounds changed since the last check.
   * Parked slots stay out of this list until setLo, setHi, or restore wakes them.
   */
  thHot: number[];
  /** Parallel to theory atoms. Index in thHot, or -1 when parked or assigned. */
  thHotPos: number[];
  /** Parallel to symbols. Theory slots that read that symbol's bounds. */
  thWatch: number[][];
  /** Bool symbols whose bounds changed and may force the bool atom. */
  boolHot: number[];
  /** Parallel to symbols. Index in boolHot, or -1. */
  boolHotPos: number[];
  /** One-variable comparison data. si is -1 when the atom is not unary. */
  thRow: TheoryRow[];
  boolAtom: number[];
  clauses: number[][];
  holds: Requirement[];
  fails: Requirement[];
  guard: Term | null;
  wantGuard: number;
  val: number[];
  lo: number[];
  hi: number[];
  ineq: Ineq[];
  ne: Diseq[];
  assigned: number;
  ticks: number;
  trailK: number[];
  trailI: number[];
  trailP: number[];
  trailN: number;
  snapStack: number[];
  snapN: number;
  w1: number[];
  w2: number[];
  watches: number[][];
  units: number[];
  emptyClause: boolean;
  propQ: number[];
  propH: number;
  propN: number;
  scratch: Binding;
  /** Driver symbols that searchBad may branch on. Others stay at the low end. */
  activeDriver: boolean[];

  constructor(spec: Spec) {
    this.spec = spec;
    this.nsym = spec.symbols.length;
    this.baseLo = [];
    this.baseHi = [];
    this.isBool = [];
    this.drivers = [];
    this.atoms = [];
    this.theoryAtoms = [];
    this.atomSlot = [];
    this.thPos = [];
    this.thLive = [];
    this.thHot = [];
    this.thHotPos = [];
    this.thWatch = [];
    this.boolHot = [];
    this.boolHotPos = [];
    this.thRow = [];
    this.boolAtom = [];
    this.clauses = [];
    this.holds = [];
    this.fails = [];
    this.guard = null;
    this.wantGuard = 0;
    this.val = [];
    this.lo = [];
    this.hi = [];
    this.ineq = [];
    this.ne = [];
    this.assigned = 0;
    this.ticks = 0;
    this.trailK = [];
    this.trailI = [];
    this.trailP = [];
    this.trailN = 0;
    this.snapStack = [];
    this.snapN = 0;
    this.w1 = [];
    this.w2 = [];
    this.watches = [];
    this.units = [];
    this.emptyClause = false;
    this.propQ = [];
    this.propH = 0;
    this.propN = 0;
    this.scratch = new Binding(this.nsym);
    this.activeDriver = [];
    const truth = new AtomInfo();
    truth.kind = 3;
    this.pushAtom(truth);
    for (let i = 0; i < this.nsym; i++) {
      const sym = spec.symbols[i];
      if (sym.sort.kind === "bool") {
        this.baseLo.push(0);
        this.baseHi.push(1);
        this.isBool.push(true);
        const info = new AtomInfo();
        info.kind = 0;
        info.sym = i;
        this.boolAtom.push(this.atoms.length);
        this.pushAtom(info);
      } else if (sym.sort.kind === "int") {
        this.baseLo.push(sym.sort.min);
        this.baseHi.push(sym.sort.max);
        this.isBool.push(false);
        this.boolAtom.push(-1);
      } else {
        const decl = findEnum(spec, sym.sort.enumName);
        const last = decl === null || decl.variants.length === 0 ? 0 : decl.variants.length - 1;
        this.baseLo.push(0);
        this.baseHi.push(last);
        this.isBool.push(false);
        this.boolAtom.push(-1);
      }
      if (isDriver(sym)) this.drivers.push(i);
      this.activeDriver.push(true);
      this.thWatch.push([]);
      this.boolHotPos.push(-1);
    }
  }

  limitDrivers(active: number[]): void {
    for (let i = 0; i < this.drivers.length; i++) this.activeDriver[this.drivers[i]] = false;
    for (let i = 0; i < active.length; i++) this.activeDriver[active[i]] = true;
  }

  pinInactive(): void {
    for (let i = 0; i < this.drivers.length; i++) {
      const si = this.drivers[i];
      if (this.activeDriver[si]) continue;
      this.force(si, this.baseLo[si]);
    }
  }

  compile(holds: Requirement[], fails: Requirement[], guard: Term | null, wantGuard: number): boolean {
    this.holds = holds;
    this.fails = fails;
    this.guard = guard;
    this.wantGuard = wantGuard;
    this.clauses.push([this.pos(TRUE_ATOM)]);
    for (let i = 0; i < holds.length; i++) {
      const req = holds[i];
      const body = this.compileBool(req.consequent);
      if (body < 0) return false;
      if (req.antecedent === null) this.clauses.push([body]);
      else {
        const ante = this.compileBool(req.antecedent);
        if (ante < 0) return false;
        this.clauses.push([this.neg(ante), body]);
      }
    }
    if (fails.length > 0) {
      const flags: number[] = [];
      for (let i = 0; i < fails.length; i++) {
        const req = fails[i];
        const body = this.compileBool(req.consequent);
        if (body < 0) return false;
        const flag = this.fresh();
        if (req.antecedent === null) {
          this.clauses.push([this.neg(flag), this.neg(body)]);
          this.clauses.push([flag, body]);
        } else {
          const ante = this.compileBool(req.antecedent);
          if (ante < 0) return false;
          this.clauses.push([this.neg(flag), ante]);
          this.clauses.push([this.neg(flag), this.neg(body)]);
          this.clauses.push([this.neg(ante), body, flag]);
        }
        flags.push(flag);
      }
      this.clauses.push(flags);
    }
    if (wantGuard === 1 && guard !== null) {
      const g = this.compileBool(guard);
      if (g < 0) return false;
      this.clauses.push([g]);
    }
    if (wantGuard === 2 && guard !== null) {
      const g = this.compileBool(guard);
      if (g < 0) return false;
      this.clauses.push([this.neg(g)]);
    }
    this.buildWatches();
    return true;
  }

  buildWatches(): void {
    let maxLit = 1;
    this.emptyClause = false;
    for (let c = 0; c < this.clauses.length; c++) {
      const clause = this.clauses[c];
      if (clause.length === 0) this.emptyClause = true;
      for (let i = 0; i < clause.length; i++) {
        const lit = clause[i];
        if (lit > maxLit) maxLit = lit;
        const flipped = lit % 2 === 0 ? lit + 1 : lit - 1;
        if (flipped > maxLit) maxLit = flipped;
      }
    }
    this.w1 = [];
    this.w2 = [];
    this.watches = [];
    this.units = [];
    for (let lit = 0; lit <= maxLit; lit++) this.watches.push([]);
    for (let c = 0; c < this.clauses.length; c++) {
      const clause = this.clauses[c];
      if (clause.length === 0) {
        this.w1.push(-1);
        this.w2.push(-1);
        continue;
      }
      const first = clause[0];
      let second = -1;
      for (let i = 1; i < clause.length; i++) {
        if (clause[i] !== first) {
          second = clause[i];
          break;
        }
      }
      this.w1.push(first);
      this.w2.push(second);
      this.watches[first].push(c);
      if (second >= 0) this.watches[second].push(c);
      else this.units.push(first);
    }
  }

  reset(): void {
    this.trailN = 0;
    this.snapN = 0;
    this.propH = 0;
    this.propN = 0;
    while (this.ineq.length > 0) this.ineq.pop();
    while (this.ne.length > 0) this.ne.pop();
    while (this.val.length < this.atoms.length) this.val.push(-1);
    for (let i = 0; i < this.atoms.length; i++) this.val[i] = -1;
    while (this.lo.length < this.nsym) {
      this.lo.push(0);
      this.hi.push(0);
    }
    for (let i = 0; i < this.nsym; i++) {
      this.lo[i] = this.baseLo[i];
      this.hi[i] = this.baseHi[i];
    }
    this.val[TRUE_ATOM] = 1;
    this.assigned = 1;
    this.ticks = 1;
    this.reviveAllTheory();
  }

  setVal(atom: number, truth: number): void {
    if (this.val[atom] === truth) return;
    const prev = this.val[atom];
    this.remember(0, atom, prev);
    this.val[atom] = truth;
    this.ticks++;
    this.retargetTheory(atom, prev, truth);
  }

  setLo(si: number, value: number): void {
    if (this.lo[si] === value) return;
    this.remember(1, si, this.lo[si]);
    this.lo[si] = value;
    this.ticks++;
    this.wakeBounds(si);
  }

  setHi(si: number, value: number): void {
    if (this.hi[si] === value) return;
    this.remember(2, si, this.hi[si]);
    this.hi[si] = value;
    this.ticks++;
    this.wakeBounds(si);
  }

  remember(kind: number, index: number, prev: number): void {
    const n = this.trailN;
    if (n === this.trailK.length) {
      this.trailK.push(kind);
      this.trailI.push(index);
      this.trailP.push(prev);
    } else {
      this.trailK[n] = kind;
      this.trailI[n] = index;
      this.trailP[n] = prev;
    }
    this.trailN = n + 1;
  }

  applyPins(pins: Binding, driversOnly: boolean): boolean {
    for (let i = 0; i < this.nsym; i++) {
      const use = driversOnly ? isDriver(this.spec.symbols[i]) : pins.known[i];
      if (!use) continue;
      if (!pins.known[i] && driversOnly) continue;
      const code = pins.code[i];
      if (code < this.lo[i] || code > this.hi[i]) return false;
      this.setLo(i, code);
      this.setHi(i, code);
      if (this.isBool[i]) {
        const lit = code === 1 ? this.pos(this.boolAtom[i]) : this.neg(this.pos(this.boolAtom[i]));
        if (!this.assignLit(lit)) return false;
      }
    }
    return true;
  }

  search(pos: number, wantMin: boolean): boolean {
    if (!this.propagate()) return false;
    while (pos < this.nsym && this.lo[pos] === this.hi[pos]) pos++;
    if (pos >= this.nsym) return this.fulfilled();
    const lo = this.lo[pos];
    const hi = this.hi[pos];
    if (wantMin && hi - lo > 48 && !this.isBool[pos]) {
      if (!this.anyIn(pos, lo, hi)) return false;
      let low = lo;
      let high = hi;
      while (low < high) {
        const mid = low + Math.floor((high - low) / 2);
        if (this.anyIn(pos, low, mid)) high = mid;
        else low = mid + 1;
      }
      return this.withPoint(pos, low, true);
    }
    if (!wantMin && hi - lo > 48 && !this.isBool[pos]) {
      const mid = lo + Math.floor((hi - lo) / 2);
      if (this.withSpan(pos, lo, mid, false)) return true;
      return this.withSpan(pos, mid + 1, hi, false);
    }
    const step = wantMin ? 1 : -1;
    const start = wantMin ? lo : hi;
    const stop = wantMin ? hi : lo;
    for (let v = start; wantMin ? v <= stop : v >= stop; v += step) {
      if (this.withPoint(pos, v, wantMin)) return true;
    }
    return false;
  }

  anyBad(pos: number): boolean {
    if (!this.propagate()) return true;
    if (pos >= this.drivers.length) return !this.existsOut();
    const si = this.drivers[pos];
    if (!this.activeDriver[si]) return this.anyBad(pos + 1);
    let lo = this.lo[si];
    let hi = this.hi[si];
    if (lo < this.baseLo[si]) lo = this.baseLo[si];
    if (hi > this.baseHi[si]) hi = this.baseHi[si];
    if (lo > hi) return true;
    for (let v = lo; v <= hi; v++) {
      if (this.pinAny(pos, si, v)) return true;
    }
    return false;
  }

  pinAny(pos: number, si: number, value: number): boolean {
    const snap = this.snap();
    if (!this.force(si, value) || !this.propagate()) {
      this.restore(snap);
      return true;
    }
    const bad = this.anyBad(pos + 1);
    this.restore(snap);
    return bad;
  }

  searchBad(pos: number): boolean {
    if (!this.propagate()) {
      this.fillMins(pos);
      return true;
    }
    if (pos >= this.drivers.length) return !this.existsOut();
    const si = this.drivers[pos];
    if (!this.activeDriver[si]) return this.searchBad(pos + 1);
    const domLo = this.baseLo[si];
    const domHi = this.baseHi[si];
    let lo = this.lo[si];
    let hi = this.hi[si];
    if (lo < domLo) lo = domLo;
    if (hi > domHi) hi = domHi;
    if (lo > domLo) {
      this.choiceFill(pos, si, domLo);
      return true;
    }
    if (lo > hi) {
      this.choiceFill(pos, si, domLo);
      return true;
    }
    const span = hi - lo;
    if (this.isBool[si] || span <= 0) {
      for (let v = lo; v <= hi; v++) {
        if (this.pinBad(pos, si, v)) return true;
      }
      if (hi < domHi) {
        this.choiceFill(pos, si, hi + 1);
        return true;
      }
      return false;
    }
    if (this.uniform(si)) return this.badIntervals(pos, si, lo, hi, domHi);
    if (span <= 64) {
      for (let v = lo; v <= hi; v++) {
        if (this.pinBad(pos, si, v)) return true;
      }
      if (hi < domHi) {
        this.choiceFill(pos, si, hi + 1);
        return true;
      }
      return false;
    }
    if (this.solid(si)) return this.badSolid(pos, si, lo, hi, domHi);
    return this.badSplit(pos, si, lo, hi, domHi);
  }

  badIntervals(pos: number, si: number, lo: number, hi: number, domHi: number): boolean {
    const pts = this.boundsOf(si, lo, hi);
    for (let i = 0; i < pts.length; i++) {
      const left = pts[i];
      if (this.pinBad(pos, si, left)) return true;
      const right = i + 1 < pts.length ? pts[i + 1] : left;
      if (right > left + 1) {
        if (this.pinBad(pos, si, left + 1)) return true;
      }
    }
    if (hi < domHi) {
      this.choiceFill(pos, si, hi + 1);
      return true;
    }
    return false;
  }

  badSolid(pos: number, si: number, lo: number, hi: number, domHi: number): boolean {
    if (this.pinBad(pos, si, lo)) return true;
    if (hi < domHi) {
      this.choiceFill(pos, si, hi + 1);
      return true;
    }
    return false;
  }

  badSplit(pos: number, si: number, lo: number, hi: number, domHi: number): boolean {
    const snap = this.snap();
    if (lo > this.lo[si]) this.setLo(si, lo);
    if (hi < this.hi[si]) this.setHi(si, hi);
    const live = this.propagate();
    this.restore(snap);
    if (!live) {
      this.choiceFill(pos, si, lo);
      return true;
    }
    if (lo === hi) return this.pinBad(pos, si, lo);
    const mid = lo + Math.floor((hi - lo) / 2);
    if (this.badSplit(pos, si, lo, mid, domHi)) return true;
    return this.badSplit(pos, si, mid + 1, hi, domHi);
  }

  pinBad(pos: number, si: number, value: number): boolean {
    const snap = this.snap();
    if (!this.force(si, value) || !this.propagate()) {
      this.restore(snap);
      this.setLo(si, value);
      this.setHi(si, value);
      this.fillMins(pos + 1);
      return true;
    }
    if (this.searchBad(pos + 1)) {
      this.setLo(si, value);
      this.setHi(si, value);
      return true;
    }
    this.restore(snap);
    return false;
  }

  choiceFill(pos: number, si: number, value: number): void {
    this.setLo(si, value);
    this.setHi(si, value);
    this.fillMins(pos + 1);
  }

  fillMins(pos: number): void {
    for (let i = pos; i < this.drivers.length; i++) {
      const si = this.drivers[i];
      this.setLo(si, this.baseLo[si]);
      this.setHi(si, this.baseLo[si]);
    }
  }

  existsOut(): boolean {
    const snap = this.snap();
    const ok = this.propagate() && !this.blocked() && this.search(0, false);
    this.restore(snap);
    return ok;
  }

  anyIn(pos: number, lo: number, hi: number): boolean {
    const snap = this.snap();
    if (lo > this.lo[pos]) this.setLo(pos, lo);
    if (hi < this.hi[pos]) this.setHi(pos, hi);
    const ok = this.propagate() && !this.blocked() && this.search(pos, false);
    this.restore(snap);
    return ok;
  }

  withPoint(pos: number, value: number, wantMin: boolean): boolean {
    const snap = this.snap();
    if (!this.force(pos, value) || !this.search(pos + 1, wantMin)) {
      this.restore(snap);
      return false;
    }
    return true;
  }

  withSpan(pos: number, lo: number, hi: number, wantMin: boolean): boolean {
    const snap = this.snap();
    if (lo > this.lo[pos]) this.setLo(pos, lo);
    if (hi < this.hi[pos]) this.setHi(pos, hi);
    if (!this.propagate() || this.blocked() || !this.search(pos, wantMin)) {
      this.restore(snap);
      return false;
    }
    return true;
  }

  force(si: number, value: number): boolean {
    if (value < this.lo[si] || value > this.hi[si]) return false;
    this.setLo(si, value);
    this.setHi(si, value);
    if (this.isBool[si]) {
      const lit = value === 1 ? this.pos(this.boolAtom[si]) : this.neg(this.pos(this.boolAtom[si]));
      return this.assignLit(lit);
    }
    return true;
  }

  propagate(): boolean {
    if (this.emptyClause) return false;
    for (let i = 0; i < this.units.length; i++) {
      if (!this.assignLit(this.units[i])) return false;
    }
    for (let spin = 0; spin < 10000; spin++) {
      const mark = this.ticks;
      const queued = this.propN;
      if (!this.drain()) return false;
      if (this.ineq.length > 0 || this.ne.length > 0) {
        if (!this.tighten()) return false;
      }
      if (!this.imply()) return false;
      if (this.ticks === mark && this.propN === queued) return true;
    }
    return false;
  }

  drain(): boolean {
    while (this.propH < this.propN) {
      const lit = this.propQ[this.propH];
      this.propH++;
      if (!this.wake(this.neg(lit))) return false;
    }
    return true;
  }

  wake(falseLit: number): boolean {
    if (falseLit < 0 || falseLit >= this.watches.length) return true;
    const list = this.watches[falseLit];
    let i = 0;
    while (i < list.length) {
      const ci = list[i];
      const other = this.w1[ci] === falseLit ? this.w2[ci] : this.w1[ci];
      if (other >= 0 && this.litSat(other)) {
        i++;
        continue;
      }
      const repl = this.otherOpen(ci, falseLit, other);
      if (repl >= 0) {
        const last = list.length - 1;
        list[i] = list[last];
        list.pop();
        if (this.w1[ci] === falseLit) this.w1[ci] = repl;
        else this.w2[ci] = repl;
        this.watches[repl].push(ci);
        continue;
      }
      if (other < 0 || this.litFalse(other)) return false;
      if (!this.assignLit(other)) return false;
      i++;
    }
    return true;
  }

  otherOpen(ci: number, falseLit: number, other: number): number {
    const clause = this.clauses[ci];
    for (let k = 0; k < clause.length; k++) {
      const lit = clause[k];
      if (lit === falseLit || lit === other) continue;
      if (!this.litFalse(lit)) return lit;
    }
    return -1;
  }

  litSat(lit: number): boolean {
    const want = lit % 2 === 0 ? 1 : 0;
    return this.val[this.atomOf(lit)] === want;
  }

  litFalse(lit: number): boolean {
    const atom = this.atomOf(lit);
    if (this.val[atom] < 0) return false;
    const want = lit % 2 === 0 ? 1 : 0;
    return this.val[atom] !== want;
  }

  assignLit(lit: number): boolean {
    const atom = this.atomOf(lit);
    const truth = lit % 2 === 0 ? 1 : 0;
    if (this.val[atom] >= 0) return this.val[atom] === truth;
    this.setVal(atom, truth);
    this.assigned++;
    const info = this.atoms[atom];
    if (info.kind === 0) {
      const bit = truth === 1 ? 1 : 0;
      if (bit < this.lo[info.sym] || bit > this.hi[info.sym]) return false;
      this.setLo(info.sym, bit);
      this.setHi(info.sym, bit);
    } else if (info.kind === 1 && !this.postTheory(info, truth === 1)) return false;
    const n = this.propN;
    if (n === this.propQ.length) this.propQ.push(lit);
    else this.propQ[n] = lit;
    this.propN = n + 1;
    return true;
  }

  postTheory(info: AtomInfo, truth: boolean): boolean {
    const expr = new Lin();
    expr.vars = info.vars;
    expr.coeffs = info.coeffs;
    expr.constant = info.constant;
    let op = info.op;
    if (!truth) {
      if (op === OP_LE) {
        op = OP_GE;
        expr.constant = expr.constant - 1;
      } else if (op === OP_GE) {
        op = OP_LE;
        expr.constant = expr.constant + 1;
      } else if (op === OP_EQ) op = OP_NE;
      else op = OP_EQ;
    }
    if (expr.vars.length === 0) {
      if (this.constHolds(expr.constant, op)) return true;
      return false;
    }
    if (op === OP_EQ) {
      if (!this.pushLe(expr, 0)) return false;
      return this.pushLe(this.scaled(expr, -1), 0);
    }
    if (op === OP_NE) {
      const row = new Diseq();
      row.vars = expr.vars;
      row.coeffs = expr.coeffs;
      row.rhs = -expr.constant;
      this.ne.push(row);
      return true;
    }
    if (op === OP_GE) return this.pushLe(this.scaled(expr, -1), 0);
    return this.pushLe(expr, 0);
  }

  pushLe(expr: Lin, slack: number): boolean {
    const row = new Ineq();
    for (let i = 0; i < expr.vars.length; i++) {
      if (expr.coeffs[i] === 0) continue;
      row.vars.push(expr.vars[i]);
      row.coeffs.push(expr.coeffs[i]);
    }
    row.rhs = -expr.constant + slack;
    this.ineq.push(row);
    return true;
  }

  tighten(): boolean {
    for (let spin = 0; spin < this.nsym + this.ineq.length + 4; spin++) {
      const mark = this.ticks;
      for (let i = 0; i < this.ineq.length; i++) {
        if (!this.tightenOne(this.ineq[i])) return false;
      }
      for (let i = 0; i < this.ne.length; i++) {
        if (!this.tightenNe(this.ne[i])) return false;
      }
      if (this.ticks === mark) return true;
    }
    return true;
  }

  tightenOne(row: Ineq): boolean {
    for (let i = 0; i < row.vars.length; i++) {
      const si = row.vars[i];
      const a = row.coeffs[i];
      if (a === 0) continue;
      let othersMin = 0;
      for (let j = 0; j < row.vars.length; j++) {
        if (j === i) continue;
        const b = row.coeffs[j];
        const sj = row.vars[j];
        if (b > 0) othersMin += b * this.lo[sj];
        else othersMin += b * this.hi[sj];
      }
      const room = row.rhs - othersMin;
      if (a > 0) {
        const cap = Math.floor(room / a);
        if (cap < this.hi[si]) this.setHi(si, cap);
      } else {
        const floor = Math.ceil(room / a);
        if (floor > this.lo[si]) this.setLo(si, floor);
      }
      if (this.lo[si] > this.hi[si]) return false;
    }
    return true;
  }

  tightenNe(row: Diseq): boolean {
    let open = -1;
    let value = row.rhs;
    for (let i = 0; i < row.vars.length; i++) {
      const si = row.vars[i];
      const a = row.coeffs[i];
      if (this.lo[si] !== this.hi[si]) {
        if (open >= 0) return true;
        open = i;
        continue;
      }
      value -= a * this.lo[si];
    }
    if (open < 0) return value !== 0;
    const si = row.vars[open];
    const a = row.coeffs[open];
    if (a === 0) return value !== 0;
    if (value % a !== 0) return true;
    const ban = value / a;
    if (ban < this.lo[si] || ban > this.hi[si]) return true;
    if (this.lo[si] === this.hi[si]) return false;
    if (this.lo[si] === ban) this.setLo(si, ban + 1);
    else if (this.hi[si] === ban) this.setHi(si, ban - 1);
    return this.lo[si] <= this.hi[si];
  }

  imply(): boolean {
    const hot = this.thHot;
    let i = 0;
    while (i < hot.length) {
      const slot = hot[i];
      const a = this.theoryAtoms[slot];
      if (this.val[a] >= 0) {
        this.retireTheory(slot);
        continue;
      }
      const row = this.thRow[slot];
      const si = row.si;
      let forced = -1;
      if (si >= 0) {
        const coeff = row.coeff;
        const constant = row.constant;
        const op = row.op;
        const boundLo = this.lo[si];
        const boundHi = this.hi[si];
        let low = constant;
        let high = constant;
        if (coeff > 0) {
          low += coeff * boundLo;
          high += coeff * boundHi;
        } else {
          low += coeff * boundHi;
          high += coeff * boundLo;
        }
        if (op === OP_LE) {
          if (high <= 0) forced = 1;
          else if (low > 0) forced = 0;
        } else if (op === OP_GE) {
          if (low >= 0) forced = 1;
          else if (high < 0) forced = 0;
        } else if (op === OP_EQ) {
          if (low === 0 && high === 0) forced = 1;
          else if (low > 0 || high < 0) forced = 0;
        } else if (low === 0 && high === 0) forced = 0;
        else if (low > 0 || high < 0) forced = 1;
      } else forced = this.forced(this.atoms[a]);
      if (forced < 0) {
        this.parkHot(slot);
        continue;
      }
      const lit = forced === 1 ? this.pos(a) : this.neg(this.pos(a));
      if (!this.assignLit(lit)) return false;
      if (i < hot.length && hot[i] === slot) i++;
    }
    const bools = this.boolHot;
    let b = 0;
    while (b < bools.length) {
      const si = bools[b];
      const atom = this.boolAtom[si];
      if (atom < 0 || this.val[atom] >= 0 || this.lo[si] !== this.hi[si]) {
        this.parkBool(si);
        continue;
      }
      const lit = this.lo[si] === 1 ? this.pos(atom) : this.neg(this.pos(atom));
      if (!this.assignLit(lit)) return false;
      if (b < bools.length && bools[b] === si) b++;
    }
    return true;
  }

  retargetTheory(atom: number, prev: number, next: number): void {
    if (atom < 0 || atom >= this.atomSlot.length) return;
    const slot = this.atomSlot[atom];
    if (slot < 0) return;
    if (prev < 0 && next >= 0) this.retireTheory(slot);
    else if (prev >= 0 && next < 0) this.reviveTheory(slot);
  }

  retireTheory(slot: number): void {
    this.parkHot(slot);
    const pos = this.thPos[slot];
    if (pos < 0) return;
    const last = this.thLive.length - 1;
    const moved = this.thLive[last];
    this.thLive[pos] = moved;
    this.thPos[moved] = pos;
    this.thLive.pop();
    this.thPos[slot] = -1;
  }

  reviveTheory(slot: number): void {
    if (this.thPos[slot] >= 0) return;
    this.thPos[slot] = this.thLive.length;
    this.thLive.push(slot);
    this.noteHot(slot);
  }

  reviveAllTheory(): void {
    while (this.thLive.length > 0) this.thLive.pop();
    while (this.thHot.length > 0) this.thHot.pop();
    for (let slot = 0; slot < this.theoryAtoms.length; slot++) {
      this.thPos[slot] = this.thLive.length;
      this.thLive.push(slot);
      this.thHotPos[slot] = this.thHot.length;
      this.thHot.push(slot);
    }
    while (this.boolHot.length > 0) this.boolHot.pop();
    for (let si = 0; si < this.nsym; si++) {
      this.boolHotPos[si] = -1;
      if (!this.isBool[si] || this.boolAtom[si] < 0) continue;
      this.boolHotPos[si] = this.boolHot.length;
      this.boolHot.push(si);
    }
  }

  noteHot(slot: number): void {
    if (slot < 0 || slot >= this.thHotPos.length) return;
    if (this.thHotPos[slot] >= 0) return;
    this.thHotPos[slot] = this.thHot.length;
    this.thHot.push(slot);
  }

  parkHot(slot: number): void {
    if (slot < 0 || slot >= this.thHotPos.length) return;
    const pos = this.thHotPos[slot];
    if (pos < 0) return;
    const last = this.thHot.length - 1;
    const moved = this.thHot[last];
    this.thHot[pos] = moved;
    this.thHotPos[moved] = pos;
    this.thHot.pop();
    this.thHotPos[slot] = -1;
  }

  noteBool(si: number): void {
    if (si < 0 || si >= this.boolHotPos.length) return;
    if (this.boolHotPos[si] >= 0) return;
    this.boolHotPos[si] = this.boolHot.length;
    this.boolHot.push(si);
  }

  parkBool(si: number): void {
    if (si < 0 || si >= this.boolHotPos.length) return;
    const pos = this.boolHotPos[si];
    if (pos < 0) return;
    const last = this.boolHot.length - 1;
    const moved = this.boolHot[last];
    this.boolHot[pos] = moved;
    this.boolHotPos[moved] = pos;
    this.boolHot.pop();
    this.boolHotPos[si] = -1;
  }

  wakeBounds(si: number): void {
    if (si < 0 || si >= this.thWatch.length) return;
    const slots = this.thWatch[si];
    for (let k = 0; k < slots.length; k++) {
      const slot = slots[k];
      if (this.thPos[slot] < 0) continue;
      this.noteHot(slot);
    }
    if (si < this.isBool.length && this.isBool[si]) this.noteBool(si);
  }

  forced(info: AtomInfo): number {
    let low = info.constant;
    let high = info.constant;
    for (let i = 0; i < info.vars.length; i++) {
      const a = info.coeffs[i];
      const si = info.vars[i];
      if (a > 0) {
        low += a * this.lo[si];
        high += a * this.hi[si];
      } else {
        low += a * this.hi[si];
        high += a * this.lo[si];
      }
    }
    if (info.op === OP_LE) {
      if (high <= 0) return 1;
      if (low > 0) return 0;
      return -1;
    }
    if (info.op === OP_GE) {
      if (low >= 0) return 1;
      if (high < 0) return 0;
      return -1;
    }
    if (info.op === OP_EQ) {
      if (low === 0 && high === 0) return 1;
      if (low > 0 || high < 0) return 0;
      return -1;
    }
    if (low === 0 && high === 0) return 0;
    if (low > 0 || high < 0) return 1;
    return -1;
  }

  blocked(): boolean {
    const env = this.toBinding(false);
    for (let i = 0; i < this.holds.length; i++) {
      const req = this.holds[i];
      if (evalAssertion(req.antecedent, req.consequent, this.spec, env) === T_FALSE) return true;
    }
    if (this.fails.length === 0) return false;
    let open = false;
    for (let i = 0; i < this.fails.length; i++) {
      const req = this.fails[i];
      const value = evalAssertion(req.antecedent, req.consequent, this.spec, env);
      if (value !== T_TRUE) open = true;
    }
    return !open;
  }

  fulfilled(): boolean {
    const env = this.toBinding(true);
    for (let i = 0; i < this.holds.length; i++) {
      const req = this.holds[i];
      if (evalAssertion(req.antecedent, req.consequent, this.spec, env) !== T_TRUE) return false;
    }
    if (this.wantGuard === 1 && this.guard !== null && evalBool(this.guard, this.spec, env) !== T_TRUE) return false;
    if (this.wantGuard === 2 && (this.guard === null || evalBool(this.guard, this.spec, env) !== T_FALSE)) return false;
    if (this.fails.length === 0) return true;
    for (let i = 0; i < this.fails.length; i++) {
      const req = this.fails[i];
      if (evalAssertion(req.antecedent, req.consequent, this.spec, env) === T_FALSE) return true;
    }
    return false;
  }

  toBinding(fill: boolean): Binding {
    const env = this.scratch;
    for (let i = 0; i < this.nsym; i++) {
      if (this.lo[i] === this.hi[i]) {
        env.known[i] = true;
        env.code[i] = this.lo[i];
      } else if (fill) {
        env.known[i] = true;
        env.code[i] = this.lo[i];
      } else {
        env.known[i] = false;
      }
    }
    return env;
  }

  driverBinding(): Binding {
    const env = new Binding(this.nsym);
    for (let i = 0; i < this.drivers.length; i++) {
      const si = this.drivers[i];
      env.known[si] = true;
      if (si < this.lo.length && this.lo[si] === this.hi[si]) env.code[si] = this.lo[si];
      else env.code[si] = this.baseLo[si];
    }
    return env;
  }

  uniform(si: number): boolean {
    for (let a = 0; a < this.atoms.length; a++) {
      const info = this.atoms[a];
      if (info.kind !== 1) continue;
      if (this.coupled(info.vars, info.coeffs, si)) return false;
    }
    for (let i = 0; i < this.ne.length; i++) {
      if (this.coupled(this.ne[i].vars, this.ne[i].coeffs, si)) return false;
    }
    return true;
  }

  coupled(vars: number[], coeffs: number[], si: number): boolean {
    let hit = false;
    let open = false;
    for (let i = 0; i < vars.length; i++) {
      if (coeffs[i] === 0) continue;
      if (vars[i] === si) hit = true;
      else if (this.lo[vars[i]] !== this.hi[vars[i]]) open = true;
    }
    return hit && open;
  }

  solid(si: number): boolean {
    for (let a = 0; a < this.atoms.length; a++) {
      const info = this.atoms[a];
      if (info.kind !== 1) continue;
      if (!this.atomMentions(info, si)) continue;
      if (this.val[a] < 0) return false;
      for (let i = 0; i < info.coeffs.length; i++) {
        const c = info.coeffs[i];
        if (c !== 1 && c !== -1) return false;
      }
    }
    for (let i = 0; i < this.ne.length; i++) {
      if (this.rowMentions(this.ne[i].vars, this.ne[i].coeffs, si)) return false;
    }
    return true;
  }

  atomMentions(info: AtomInfo, si: number): boolean {
    return this.rowMentions(info.vars, info.coeffs, si);
  }

  rowMentions(vars: number[], coeffs: number[], si: number): boolean {
    for (let i = 0; i < vars.length; i++) {
      if (vars[i] === si && coeffs[i] !== 0) return true;
    }
    return false;
  }

  boundsOf(si: number, lo: number, hi: number): number[] {
    const pts: number[] = [];
    pts.push(lo);
    pts.push(hi);
    for (let a = 0; a < this.atoms.length; a++) {
      const info = this.atoms[a];
      if (info.kind !== 1) continue;
      const root = this.isolate(info.vars, info.coeffs, info.constant, si);
      if (root === null) continue;
      this.addRoot(pts, root, lo, hi);
    }
    for (let i = 0; i < this.ne.length; i++) {
      const row = this.ne[i];
      const root = this.isolate(row.vars, row.coeffs, -row.rhs, si);
      if (root === null) continue;
      this.addRoot(pts, root, lo, hi);
    }
    return this.sortUnique(pts);
  }

  isolate(vars: number[], coeffs: number[], constant: number, si: number): number | null {
    let coeff = 0;
    let rest = constant;
    for (let i = 0; i < vars.length; i++) {
      if (coeffs[i] === 0) continue;
      if (vars[i] === si) coeff = coeffs[i];
      else if (this.lo[vars[i]] !== this.hi[vars[i]]) return null;
      else rest += coeffs[i] * this.lo[vars[i]];
    }
    if (coeff === 0) return null;
    return -rest / coeff;
  }

  addRoot(pts: number[], root: number, lo: number, hi: number): void {
    const base = Math.floor(root);
    this.pushPoint(pts, base - 1, lo, hi);
    this.pushPoint(pts, base, lo, hi);
    this.pushPoint(pts, base + 1, lo, hi);
    this.pushPoint(pts, Math.ceil(root), lo, hi);
  }

  sortUnique(pts: number[]): number[] {
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        if (pts[j] < pts[i]) {
          const tmp = pts[i];
          pts[i] = pts[j];
          pts[j] = tmp;
        }
      }
    }
    const out: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      if (i === 0 || pts[i] !== pts[i - 1]) out.push(pts[i]);
    }
    return out;
  }

  pushPoint(pts: number[], value: number, lo: number, hi: number): void {
    if (value >= lo && value <= hi) pts.push(value);
  }

  compileBool(term: Term): number {
    if (term.kind === "bool") return term.value ? this.pos(TRUE_ATOM) : this.neg(this.pos(TRUE_ATOM));
    if (term.kind === "sym") {
      if (this.isBool[term.index]) return this.pos(this.boolAtom[term.index]);
      return this.pos(TRUE_ATOM);
    }
    if (term.kind === "not") {
      const inner = this.compileBool(term.term);
      if (inner < 0) return -1;
      return this.neg(inner);
    }
    if (term.kind === "and" || term.kind === "or") {
      const left = this.compileBool(term.left);
      const right = this.compileBool(term.right);
      if (left < 0 || right < 0) return -1;
      const t = this.fresh();
      if (term.kind === "and") {
        this.clauses.push([this.neg(t), left]);
        this.clauses.push([this.neg(t), right]);
        this.clauses.push([this.neg(left), this.neg(right), t]);
      } else {
        this.clauses.push([this.neg(t), left, right]);
        this.clauses.push([this.neg(left), t]);
        this.clauses.push([this.neg(right), t]);
      }
      return t;
    }
    if (
      term.kind === "eq" ||
      term.kind === "neq" ||
      term.kind === "lt" ||
      term.kind === "le" ||
      term.kind === "gt" ||
      term.kind === "ge"
    ) {
      if (this.boolCmp(term.left) && this.boolCmp(term.right) && (term.kind === "eq" || term.kind === "neq")) {
        return this.compileBoolEq(term.left, term.right, term.kind === "eq");
      }
      return this.compileCmp(term);
    }
    return this.pos(TRUE_ATOM);
  }

  boolCmp(term: Term): boolean {
    if (term.kind === "bool") return true;
    if (term.kind === "sym") return this.isBool[term.index];
    if (term.kind === "not") return this.boolCmp(term.term);
    return term.kind === "and" || term.kind === "or";
  }

  compileBoolEq(left: Term, right: Term, same: boolean): number {
    const a = this.compileBool(left);
    const b = this.compileBool(right);
    if (a < 0 || b < 0) return -1;
    const t = this.fresh();
    if (same) {
      this.clauses.push([this.neg(t), this.neg(a), b]);
      this.clauses.push([this.neg(t), a, this.neg(b)]);
      this.clauses.push([t, a, b]);
      this.clauses.push([t, this.neg(a), this.neg(b)]);
    } else {
      this.clauses.push([this.neg(t), a, b]);
      this.clauses.push([this.neg(t), this.neg(a), this.neg(b)]);
      this.clauses.push([t, this.neg(a), b]);
      this.clauses.push([t, a, this.neg(b)]);
    }
    return t;
  }

  compileCmp(term: Term): number {
    if (
      term.kind !== "eq" &&
      term.kind !== "neq" &&
      term.kind !== "lt" &&
      term.kind !== "le" &&
      term.kind !== "gt" &&
      term.kind !== "ge"
    ) {
      return -1;
    }
    const left = this.linOf(term.left);
    const right = this.linOf(term.right);
    if (left === null || right === null) return this.neg(this.pos(TRUE_ATOM));
    const expr = new Lin();
    this.addLin(expr, left, 1);
    this.addLin(expr, right, -1);
    let op = OP_EQ;
    if (term.kind === "neq") op = OP_NE;
    if (term.kind === "lt") {
      op = OP_LE;
      expr.constant = expr.constant + 1;
    }
    if (term.kind === "le") op = OP_LE;
    if (term.kind === "gt") {
      op = OP_GE;
      expr.constant = expr.constant - 1;
    }
    if (term.kind === "ge") op = OP_GE;
    if (expr.vars.length === 0) {
      if (this.constHolds(expr.constant, op)) return this.pos(TRUE_ATOM);
      return this.neg(this.pos(TRUE_ATOM));
    }
    const info = new AtomInfo();
    info.kind = 1;
    info.vars = expr.vars;
    info.coeffs = expr.coeffs;
    info.constant = expr.constant;
    info.op = op;
    const id = this.pushAtom(info);
    this.val.push(-1);
    return this.pos(id);
  }

  constHolds(constant: number, op: number): boolean {
    if (op === OP_LE) return constant <= 0;
    if (op === OP_GE) return constant >= 0;
    if (op === OP_EQ) return constant === 0;
    return constant !== 0;
  }

  linOf(term: Term): Lin | null {
    if (term.kind === "int") {
      const lin = new Lin();
      lin.constant = term.value;
      return lin;
    }
    if (term.kind === "enum") {
      const lin = new Lin();
      lin.constant = term.index;
      return lin;
    }
    if (term.kind === "sym") {
      if (this.isBool[term.index]) return null;
      const lin = new Lin();
      lin.vars.push(term.index);
      lin.coeffs.push(1);
      return lin;
    }
    if (term.kind === "add" || term.kind === "sub") {
      const left = this.linOf(term.left);
      const right = this.linOf(term.right);
      if (left === null || right === null) return null;
      const lin = new Lin();
      this.addLin(lin, left, 1);
      this.addLin(lin, right, term.kind === "add" ? 1 : -1);
      return lin;
    }
    return null;
  }

  addLin(into: Lin, extra: Lin, sign: number): void {
    into.constant += sign * extra.constant;
    for (let i = 0; i < extra.vars.length; i++) {
      const v = extra.vars[i];
      const c = sign * extra.coeffs[i];
      let found = -1;
      for (let j = 0; j < into.vars.length; j++) {
        if (into.vars[j] === v) found = j;
      }
      if (found < 0) {
        if (c !== 0) {
          into.vars.push(v);
          into.coeffs.push(c);
        }
      } else {
        into.coeffs[found] += c;
        if (into.coeffs[found] === 0) {
          const last = into.vars.length - 1;
          into.vars[found] = into.vars[last];
          into.coeffs[found] = into.coeffs[last];
          into.vars.pop();
          into.coeffs.pop();
        }
      }
    }
  }

  scaled(expr: Lin, sign: number): Lin {
    const out = new Lin();
    this.addLin(out, expr, sign);
    return out;
  }

  fresh(): number {
    const info = new AtomInfo();
    info.kind = 2;
    const id = this.pushAtom(info);
    this.val.push(-1);
    return this.pos(id);
  }

  pushAtom(info: AtomInfo): number {
    const id = this.atoms.length;
    this.atoms.push(info);
    if (info.kind === 1) {
      const slot = this.theoryAtoms.length;
      this.theoryAtoms.push(id);
      this.atomSlot.push(slot);
      this.thPos.push(-1);
      this.thHotPos.push(-1);
      if (info.vars.length === 1) {
        this.thRow.push(new TheoryRow(info.vars[0], info.coeffs[0], info.op, info.constant));
        this.thWatch[info.vars[0]].push(slot);
      } else {
        this.thRow.push(new TheoryRow(-1, 0, info.op, info.constant));
        for (let v = 0; v < info.vars.length; v++) this.thWatch[info.vars[v]].push(slot);
      }
    } else this.atomSlot.push(-1);
    return id;
  }

  pos(atom: number): number {
    return atom * 2;
  }

  neg(litOrAtom: number): number {
    if (litOrAtom % 2 === 0) return litOrAtom + 1;
    return litOrAtom - 1;
  }

  atomOf(lit: number): number {
    return Math.floor(lit / 2);
  }

  snap(): number {
    const n = this.snapN;
    const base = n * 7;
    if (base === this.snapStack.length) {
      this.snapStack.push(this.trailN);
      this.snapStack.push(this.ineq.length);
      this.snapStack.push(this.ne.length);
      this.snapStack.push(this.assigned);
      this.snapStack.push(this.ticks);
      this.snapStack.push(this.propH);
      this.snapStack.push(this.propN);
    } else {
      this.snapStack[base] = this.trailN;
      this.snapStack[base + 1] = this.ineq.length;
      this.snapStack[base + 2] = this.ne.length;
      this.snapStack[base + 3] = this.assigned;
      this.snapStack[base + 4] = this.ticks;
      this.snapStack[base + 5] = this.propH;
      this.snapStack[base + 6] = this.propN;
    }
    this.snapN = n + 1;
    return n;
  }

  restore(level: number): void {
    const base = level * 7;
    const trail = this.snapStack[base];
    const ineqLen = this.snapStack[base + 1];
    const neLen = this.snapStack[base + 2];
    while (this.trailN > trail) {
      this.trailN--;
      const kind = this.trailK[this.trailN];
      const index = this.trailI[this.trailN];
      const prev = this.trailP[this.trailN];
      if (kind === 0) {
        this.retargetTheory(index, this.val[index], prev);
        this.val[index] = prev;
      } else if (kind === 1) {
        this.lo[index] = prev;
        this.wakeBounds(index);
      } else {
        this.hi[index] = prev;
        this.wakeBounds(index);
      }
    }
    while (this.ineq.length > ineqLen) this.ineq.pop();
    while (this.ne.length > neLen) this.ne.pop();
    this.assigned = this.snapStack[base + 3];
    this.ticks = this.snapStack[base + 4];
    this.propH = this.snapStack[base + 5];
    this.propN = this.snapStack[base + 6];
    this.snapN = level;
  }
}

/**
 * One compile of a requirement set, reused across driver situations.
 * Clauses stay; each query resets bounds and boolean assignments.
 */
export class TheoryQuery {
  engine: Engine;
  ok: boolean;
  /** True after partList is filled. Empty partList means this set is not split. */
  partReady: boolean;
  partList: TheoryQuery[];

  constructor(spec: Spec, holds: Requirement[]) {
    this.engine = new Engine(spec);
    this.ok = this.engine.compile(holds, [], null, 0);
    this.partReady = false;
    this.partList = [];
  }

  hasModel(): boolean {
    if (!this.ok) return false;
    this.engine.reset();
    if (!this.engine.propagate()) return false;
    if (this.engine.blocked()) return false;
    return this.engine.search(0, false);
  }

  pinnedSat(drivers: Binding): boolean {
    if (!this.ok) return false;
    this.engine.reset();
    if (!this.engine.applyPins(drivers, true)) return false;
    if (!this.engine.propagate()) return false;
    if (this.engine.blocked()) return false;
    return this.engine.search(0, false);
  }

  /**
   * True when every completion of the unpinned drivers is realizable.
   * False when that is not known, including when the requirements do not split
   * into independent output groups. A false result still allows a later search.
   */
  provenSat(prefix: Binding): boolean {
    const parts = this.parts();
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].anyBad(prefix)) return false;
    }
    return parts.length > 0;
  }

  /**
   * Independent output groups, compiled once. Empty when the requirements
   * share an output or a condition reads an output, so the split would be unsound.
   */
  parts(): TheoryQuery[] {
    if (this.partReady) return this.partList;
    this.partReady = true;
    if (!this.ok) return this.partList;
    const groups = factorize(this.engine.spec, this.engine.holds);
    if (groups === null || groups.length <= 1) return this.partList;
    for (let g = 0; g < groups.length; g++) {
      const query = new TheoryQuery(this.engine.spec, groups[g].holds);
      query.engine.limitDrivers(groups[g].drivers);
      this.partList.push(query);
    }
    return this.partList;
  }

  anyBad(prefix: Binding): boolean {
    if (!this.ok) return true;
    this.engine.reset();
    this.engine.pinInactive();
    const drivers = this.engine.drivers;
    for (let i = 0; i < drivers.length; i++) {
      const si = drivers[i];
      if (!this.engine.activeDriver[si]) continue;
      if (!prefix.known[si]) continue;
      if (!this.engine.force(si, prefix.code[si])) return true;
    }
    if (!this.engine.propagate()) return true;
    return this.engine.anyBad(0);
  }

  badDrivers(): Binding | null {
    if (!this.ok) {
      this.engine.reset();
      return this.engine.driverBinding();
    }
    const groups = factorize(this.engine.spec, this.engine.holds);
    if (groups === null || groups.length <= 1) {
      if (groups !== null && groups.length === 1) this.engine.limitDrivers(groups[0].drivers);
      return this.badDriversRaw();
    }
    let best: Binding | null = null;
    for (let g = 0; g < groups.length; g++) {
      const query = new TheoryQuery(this.engine.spec, groups[g].holds);
      query.engine.limitDrivers(groups[g].drivers);
      const bad = query.badDriversRaw();
      if (bad === null) continue;
      if (best === null || driverBefore(this.engine.spec, bad, best)) best = bad;
    }
    return best;
  }

  badDriversRaw(): Binding | null {
    if (!this.ok) {
      this.engine.reset();
      this.engine.pinInactive();
      return this.engine.driverBinding();
    }
    this.engine.reset();
    this.engine.pinInactive();
    if (!this.engine.propagate()) return this.engine.driverBinding();
    if (!this.engine.searchBad(0)) return null;
    return this.engine.driverBinding();
  }
}

class FactorGroup {
  holds: Requirement[];
  drivers: number[];

  constructor() {
    this.holds = [];
    this.drivers = [];
  }
}

/**
 * Requirements that never share an output, and whose conditions do not
 * read an output, split into independent groups. A driver situation is bad
 * exactly when one group is bad. Drivers a group does not mention stay at
 * the low end, which is where the least bad situation puts them.
 * Null means the split would be unsound.
 */
/**
 * Independent output groups, or null when a requirement mentions two outputs
 * or a condition reads an output. Driver-only requirements form one group.
 * Order inside a group follows holds.
 */
export function independentGroups(spec: Spec, holds: Requirement[]): Requirement[][] | null {
  const groups = factorize(spec, holds);
  if (groups === null) return null;
  const out: Requirement[][] = [];
  for (let i = 0; i < groups.length; i++) out.push(groups[i].holds);
  return out;
}

export interface SplitGroup {
  holds: Requirement[];
  drivers: number[];
}

/** Output groups with the drivers each one reads. Null when a split would be unsound. */
export function splitGroups(spec: Spec, holds: Requirement[]): SplitGroup[] | null {
  const groups = factorize(spec, holds);
  if (groups === null) return null;
  const out: SplitGroup[] = [];
  for (let i = 0; i < groups.length; i++) {
    out.push({ holds: groups[i].holds, drivers: groups[i].drivers });
  }
  return out;
}

function factorize(spec: Spec, holds: Requirement[]): FactorGroup[] | null {
  const buckets: Requirement[][] = [];
  for (let i = 0; i < spec.symbols.length; i++) buckets.push([]);
  const driverOnly: Requirement[] = [];
  for (let r = 0; r < holds.length; r++) {
    const req = holds[r];
    if (antecedentMentionsOutput(spec, req)) return null;
    const outs = outputMentions(spec, req);
    if (outs.length > 1) return null;
    if (outs.length === 0) driverOnly.push(req);
    else buckets[outs[0]].push(req);
  }
  const groups: FactorGroup[] = [];
  if (driverOnly.length > 0) groups.push(makeGroup(spec, driverOnly));
  for (let i = 0; i < buckets.length; i++) {
    if (buckets[i].length === 0) continue;
    groups.push(makeGroup(spec, buckets[i]));
  }
  return groups;
}

function makeGroup(spec: Spec, holds: Requirement[]): FactorGroup {
  const group = new FactorGroup();
  group.holds = holds;
  group.drivers = mentionedDrivers(spec, holds);
  return group;
}

function outputMentions(spec: Spec, req: Requirement): number[] {
  const outs: number[] = [];
  for (let i = 0; i < spec.symbols.length; i++) {
    if (isDriver(spec.symbols[i])) continue;
    if (requirementMentions(req, i)) outs.push(i);
  }
  return outs;
}

function antecedentMentionsOutput(spec: Spec, req: Requirement): boolean {
  if (req.antecedent === null) return false;
  for (let i = 0; i < spec.symbols.length; i++) {
    if (isDriver(spec.symbols[i])) continue;
    if (termMentions(req.antecedent, i)) return true;
  }
  return false;
}

function mentionedDrivers(spec: Spec, holds: Requirement[]): number[] {
  const drivers: number[] = [];
  for (let i = 0; i < spec.symbols.length; i++) {
    if (!isDriver(spec.symbols[i])) continue;
    let hit = false;
    for (let r = 0; r < holds.length; r++) {
      if (requirementMentions(holds[r], i)) hit = true;
    }
    if (hit) drivers.push(i);
  }
  return drivers;
}

export function driverBefore(spec: Spec, left: Binding, right: Binding): boolean {
  for (let i = 0; i < spec.symbols.length; i++) {
    if (!isDriver(spec.symbols[i])) continue;
    if (left.code[i] < right.code[i]) return true;
    if (left.code[i] > right.code[i]) return false;
  }
  return false;
}

export function driverWide(spec: Spec): boolean {
  let product = 1;
  for (let i = 0; i < spec.symbols.length; i++) {
    if (!isDriver(spec.symbols[i])) continue;
    const size = domainSize(spec, spec.symbols[i]);
    if (size > 64) return true;
    if (product > 8192 / size) return true;
    product = product * size;
  }
  return false;
}
