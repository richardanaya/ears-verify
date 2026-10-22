/**
 * Seeded differential test. Random small specs are checked two ways:
 * the solver's minimal conflict sets, and a brute-force enumerator that
 * tries every driver situation and every output assignment.
 * The seed is fixed, so Node and the native binary see the same specs.
 */

import { readFileSync } from "node:fs";
import { parseSpec } from "../src/ears.ts";
import { codeAt, domainSize, isDriver, type Spec } from "../src/spec.ts";
import { conflictingSets } from "../src/solver.ts";
import { Binding, evalAssertion, T_TRUE } from "../src/term.ts";

const SEED = 20261022;
const RANDOM_SPECS = 1000;

class Rng {
  state: number;

  constructor(seed: number) {
    this.state = seed % 2147483647;
    if (this.state <= 0) this.state = 1;
  }

  next(bound: number): number {
    this.state = (this.state * 48271) % 2147483647;
    return this.state % bound;
  }
}

interface Named {
  name: string;
  kind: string;
}

export function runSoundness(): number {
  let count = 0;
  const files = [
    "examples/order.ears.md",
    "examples/order-conflict.ears.md",
    "examples/order-chain.ears.md",
    "examples/order-covered.ears.md",
    "examples/order-quantity.ears.md",
    "examples/order-status.ears.md",
    "examples/order-redundant.ears.md",
    "examples/payment-if.ears.md",
  ];
  for (let i = 0; i < files.length; i++) {
    const text = readFileSync(files[i], "utf8");
    const parsed = parseSpec(text);
    if (!parsed.ok) failSound("example parse " + files[i], text);
    else if (parsed.spec.requirements.length <= 8 && domainProduct(parsed.spec) <= 4000) {
      compareSpec(parsed.spec, text);
      count++;
    }
  }
  const rng = new Rng(SEED);
  for (let i = 0; i < RANDOM_SPECS; i++) {
    const text = randomSpec(rng);
    const parsed = parseSpec(text);
    if (!parsed.ok) failSound("random parse " + parsed.message, text);
    else {
      compareSpec(parsed.spec, text);
      count++;
    }
  }
  return count;
}

function compareSpec(spec: Spec, text: string): void {
  const groups = conflictingSets(spec);
  const lists: number[][] = [];
  for (let i = 0; i < groups.length; i++) lists.push(groups[i].indexes);
  const solverCores = coreKey(lists);
  const bruteCores = bruteKey(spec);
  const solverUnsat = solverCores.length > 0;
  const bruteUnsat = bruteCores.length > 0;
  if (solverUnsat !== bruteUnsat || solverCores !== bruteCores) {
    failSound("mismatch solver [" + solverCores + "] brute [" + bruteCores + "]", text);
  }
}

function coreKey(groups: number[][]): string {
  const parts: string[] = [];
  for (let i = 0; i < groups.length; i++) {
    const ids = groups[i];
    let part = "";
    for (let j = 0; j < ids.length; j++) {
      if (j > 0) part += ",";
      part += String(ids[j]);
    }
    parts.push(part);
  }
  for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j < parts.length; j++) {
      if (parts[j] < parts[i]) {
        const tmp = parts[i];
        parts[i] = parts[j];
        parts[j] = tmp;
      }
    }
  }
  return parts.join(";");
}

function bruteKey(spec: Spec): string {
  const n = spec.requirements.length;
  const found: number[] = [];
  const limit = pow2(n);
  for (let width = 1; width <= n; width++) {
    for (let mask = 1; mask < limit; mask++) {
      if (popcount(mask) !== width) continue;
      let covered = false;
      for (let f = 0; f < found.length; f++) {
        if (includesAll(mask, found[f])) covered = true;
      }
      if (covered) continue;
      if (realizable(spec, maskIndexes(mask, n))) continue;
      let minimal = true;
      for (let bit = 0; bit < n; bit++) {
        if (!hasBit(mask, bit)) continue;
        if (!realizable(spec, maskIndexes(mask - pow2(bit), n))) minimal = false;
      }
      if (minimal) found.push(mask);
    }
  }
  const groups: number[][] = [];
  for (let i = 0; i < found.length; i++) groups.push(maskIndexes(found[i], n));
  return coreKey(groups);
}

function realizable(spec: Spec, indexes: number[]): boolean {
  if (indexes.length === 0) return true;
  const drivers: number[] = [];
  const outputs: number[] = [];
  for (let i = 0; i < spec.symbols.length; i++) {
    if (isDriver(spec.symbols[i])) drivers.push(i);
    else outputs.push(i);
  }
  const env = new Binding(spec.symbols.length);
  return everyDriver(spec, indexes, drivers, outputs, env, 0);
}

function everyDriver(spec: Spec, indexes: number[], drivers: number[], outputs: number[], env: Binding, pos: number): boolean {
  if (pos === drivers.length) return someOutput(spec, indexes, outputs, env, 0);
  const si = drivers[pos];
  const count = domainSize(spec, spec.symbols[si]);
  for (let v = 0; v < count; v++) {
    env.known[si] = true;
    env.code[si] = codeAt(spec.symbols[si], v);
    if (!everyDriver(spec, indexes, drivers, outputs, env, pos + 1)) return false;
  }
  env.known[si] = false;
  return true;
}

function someOutput(spec: Spec, indexes: number[], outputs: number[], env: Binding, pos: number): boolean {
  if (pos === outputs.length) return allHold(spec, indexes, env);
  const si = outputs[pos];
  const count = domainSize(spec, spec.symbols[si]);
  for (let v = 0; v < count; v++) {
    env.known[si] = true;
    env.code[si] = codeAt(spec.symbols[si], v);
    if (someOutput(spec, indexes, outputs, env, pos + 1)) return true;
  }
  env.known[si] = false;
  return false;
}

function allHold(spec: Spec, indexes: number[], env: Binding): boolean {
  for (let i = 0; i < indexes.length; i++) {
    const req = spec.requirements[indexes[i]];
    if (evalAssertion(req.antecedent, req.consequent, spec, env) !== T_TRUE) return false;
  }
  return true;
}

function randomSpec(rng: Rng): string {
  const lines: string[] = [];
  const useEnum = rng.next(2) === 1;
  if (useEnum) lines.push("enum Color { red, blue, green }");
  const bools: Named[] = [];
  const ints: Named[] = [];
  const enums: Named[] = [];
  const count = 3 + rng.next(2);
  let drivers = 0;
  let outputs = 0;
  for (let i = 0; i < count; i++) {
    const kindRoll = rng.next(useEnum ? 3 : 2);
    let kind = "bool";
    if (kindRoll === 1) kind = "int";
    if (kindRoll === 2) kind = "enum";
    let role = "input";
    if (kind === "bool") {
      const roleRoll = rng.next(4);
      if (roleRoll === 0) role = "event";
      else if (roleRoll === 1) role = "state";
      else if (roleRoll === 2) role = "input";
      else role = "output";
    } else if (rng.next(2) === 1) role = "output";
    const name = kind.slice(0, 1) + String(i);
    if (role === "output") outputs++;
    else drivers++;
    if (kind === "bool") {
      bools.push({ name: name, kind: kind });
      lines.push(role + " " + name + ': Bool "D."');
    } else if (kind === "int") {
      const max = 1 + rng.next(2);
      ints.push({ name: name, kind: kind });
      lines.push(role + " " + name + ": Int 0.." + String(max) + ' "D."');
    } else {
      enums.push({ name: name, kind: kind });
      lines.push(role + " " + name + ': Color "D."');
    }
  }
  if (drivers === 0) {
    bools.push({ name: "bd", kind: "bool" });
    lines.push('event bd: Bool "D."');
  }
  if (outputs === 0) {
    bools.push({ name: "bo", kind: "bool" });
    lines.push('output bo: Bool "D."');
  }
  const reqs = 1 + rng.next(4);
  for (let r = 0; r < reqs; r++) {
    const shape = rng.next(3);
    const guard = expr(rng, bools, ints, enums);
    const body = expr(rng, bools, ints, enums);
    if (shape === 0) lines.push("R" + String(r + 1) + " The Box shall " + body + ".");
    else if (shape === 1) lines.push("R" + String(r + 1) + " When " + guard + ", the Box shall " + body + ".");
    else lines.push("R" + String(r + 1) + " If " + guard + ", then the Box shall " + body + ".");
  }
  return lines.join("\n") + "\n";
}

function expr(rng: Rng, bools: Named[], ints: Named[], enums: Named[]): string {
  const roll = rng.next(6);
  if (roll === 0 && bools.length > 0) return bools[rng.next(bools.length)].name;
  if (roll === 1 && bools.length > 0) return "not " + bools[rng.next(bools.length)].name;
  if (roll === 2 && bools.length > 1) {
    const left = bools[rng.next(bools.length)].name;
    const right = bools[rng.next(bools.length)].name;
    if (rng.next(2) === 0) return left + " and " + right;
    return left + " or " + right;
  }
  if (roll === 3 && ints.length > 0) {
    const name = ints[rng.next(ints.length)].name;
    const value = rng.next(3);
    const opRoll = rng.next(3);
    if (opRoll === 0) return name + " = " + String(value);
    if (opRoll === 1) return name + " <= " + String(value);
    return name + " >= " + String(value);
  }
  if (roll === 4 && enums.length > 0) {
    const name = enums[rng.next(enums.length)].name;
    const variants = ["red", "blue", "green"];
    return name + " = " + variants[rng.next(3)];
  }
  if (bools.length > 0) return bools[rng.next(bools.length)].name;
  if (ints.length > 0) return ints[0].name + " = 0";
  if (enums.length > 0) return enums[0].name + " = red";
  return "true";
}

function domainProduct(spec: Spec): number {
  let product = 1;
  for (let i = 0; i < spec.symbols.length; i++) {
    product = product * domainSize(spec, spec.symbols[i]);
  }
  return product;
}

function failSound(message: string, text: string): void {
  console.error("FAIL soundness " + message);
  console.error(text);
  process.exit(1);
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
