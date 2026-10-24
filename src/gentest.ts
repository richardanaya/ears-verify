/**
 * Concrete scenarios for `check`, one file per case.
 * Each requirement gets a scenario where its trigger is true and its
 * response holds, and scenarios where one atomic condition decides the
 * trigger. The rejected file breaks that requirement and no other.
 * A condition that cannot flip the outcome is reported, with the reason.
 */

import { evaluateRequirements, explainHold } from "./check.ts";
import { satisfiable } from "./decide.ts";
import type { Requirement, Spec, Term } from "./spec.ts";
import { firstMatching } from "./solver.ts";
import { evalBool, formatScenario, formatTerm, type Binding, T_FALSE, T_TRUE } from "./term.ts";
import { displayQuote, formatInt } from "./text.ts";

export interface GeneratedFile {
  file: string;
  id: string;
  line: number;
  kind: string;
  condition: number;
  conditionText: string;
  text: string;
  body: string;
}

export interface UncoveredCondition {
  id: string;
  line: number;
  condition: number;
  conditionText: string;
  text: string;
}

export interface GeneratedScenarios {
  files: GeneratedFile[];
  uncovered: UncoveredCondition[];
}

export function generateScenarios(spec: Spec): GeneratedScenarios {
  const files: GeneratedFile[] = [];
  const uncovered: UncoveredCondition[] = [];
  for (let i = 0; i < spec.requirements.length; i++) {
    coverRequirement(spec, i, files, uncovered);
  }
  return { files: files, uncovered: uncovered };
}

export function formatGeneratedText(specPath: string, outDir: string, report: GeneratedScenarios): string {
  const lines: string[] = [];
  lines.push("spec: " + specPath);
  lines.push("out: " + outDir);
  lines.push("scenarios: " + formatInt(report.files.length));
  lines.push("uncovered: " + formatInt(report.uncovered.length));
  for (let i = 0; i < report.files.length; i++) {
    const file = report.files[i];
    lines.push("");
    lines.push(file.file);
    lines.push(fileLabel(file.kind, file.id, file.line, file.condition));
    lines.push(file.text);
  }
  for (let i = 0; i < report.uncovered.length; i++) {
    const item = report.uncovered[i];
    lines.push("");
    lines.push("uncovered " + item.id + conditionSuffix(item.condition));
    lines.push(item.text);
  }
  return lines.join("\n");
}

export function formatGeneratedJson(specPath: string, outDir: string, report: GeneratedScenarios): string {
  const scenarios = [];
  for (let i = 0; i < report.files.length; i++) {
    const file = report.files[i];
    scenarios.push({
      file: file.file,
      id: file.id,
      line: file.line,
      kind: file.kind,
      condition: file.condition,
      conditionText: file.conditionText,
      text: file.text,
    });
  }
  const uncovered = [];
  for (let i = 0; i < report.uncovered.length; i++) {
    const item = report.uncovered[i];
    uncovered.push({
      id: item.id,
      line: item.line,
      condition: item.condition,
      conditionText: item.conditionText,
      text: item.text,
    });
  }
  return JSON.stringify(
    {
      ok: report.uncovered.length === 0,
      spec: specPath,
      out: outDir,
      scenarios: scenarios,
      uncovered: uncovered,
    },
    null,
    2,
  );
}

function coverRequirement(spec: Spec, index: number, files: GeneratedFile[], uncovered: UncoveredCondition[]): void {
  const req = spec.requirements[index];
  const others = othersOf(spec, index);
  const atoms: Term[] = [];
  if (req.antecedent !== null) collectAtoms(req.antecedent, atoms);
  const acceptedEnv = solve(spec, spec.requirements, [], triggerTerms(req));
  if (acceptedEnv === null && req.antecedent !== null && !termPossible(spec, req.antecedent)) {
    uncovered.push(gap(req, 0, "", "The trigger is impossible for every allowed value."));
    return;
  }
  if (acceptedEnv === null) uncovered.push(gap(req, 0, "", acceptedWhy(spec, req, others)));
  else files.push(made(spec, req, "accepted", 0, "", req.id + "-accepted.json", acceptedEnv, ""));
  if (atoms.length === 0) {
    const rejectedEnv = solve(spec, others, single(req), []);
    if (rejectedEnv === null || !exactBreak(spec, req, rejectedEnv)) {
      uncovered.push(gap(req, 0, "", rejectedWhy(spec, req, others)));
      return;
    }
    files.push(made(spec, req, "rejected", 0, "", req.id + "-rejected.json", rejectedEnv, ""));
    return;
  }
  const shared = solve(spec, others, single(req), triggerTerms(req));
  const sharedBreaks = shared !== null && exactBreak(spec, req, shared);
  for (let a = 0; a < atoms.length; a++) {
    const n = a + 1;
    const atom = atoms[a];
    const condText = formatTerm(atom);
    const label = conditionLabel(n, condText);
    const mask = req.antecedent === null ? [] : maskOf(req.antecedent, atom);
    const onTerms = copyTerms(mask);
    onTerms.push(atom);
    if (req.antecedent !== null) onTerms.push(req.antecedent);
    const offTerms = copyTerms(mask);
    offTerms.push(negateTerm(atom));
    let rejectedEnv: Binding | null = null;
    if (sharedBreaks && shared !== null && maskHolds(spec, mask, shared) && evalBool(atom, spec, shared) === T_TRUE) {
      rejectedEnv = shared;
    } else if (shared !== null) {
      rejectedEnv = solve(spec, others, single(req), onTerms);
    }
    if (
      rejectedEnv !== null &&
      exactBreak(spec, req, rejectedEnv) &&
      evalBool(atom, spec, rejectedEnv) === T_TRUE
    ) {
      files.push(made(spec, req, "rejected", n, condText, req.id + "-rejected-cond" + formatInt(n) + ".json", rejectedEnv, ""));
    } else {
      uncovered.push(gap(req, n, condText, rejectedCondWhy(spec, req, others, onTerms, label, rejectedEnv)));
    }
    const flipEnv = solve(spec, spec.requirements, [], offTerms);
    if (flipEnv !== null && flipHolds(spec, req, atom, flipEnv)) {
      const prefix = "Flipping " + label + " makes the trigger false. ";
      files.push(made(spec, req, "accepted", n, condText, req.id + "-accepted-cond" + formatInt(n) + ".json", flipEnv, prefix));
    } else {
      uncovered.push(gap(req, n, condText, flipWhy(spec, req, atom, offTerms, label, flipEnv)));
    }
  }
}

function maskHolds(spec: Spec, mask: Term[], env: Binding): boolean {
  for (let i = 0; i < mask.length; i++) {
    if (evalBool(mask[i], spec, env) !== T_TRUE) return false;
  }
  return true;
}

function flipHolds(spec: Spec, req: Requirement, atom: Term, env: Binding): boolean {
  if (evalBool(atom, spec, env) !== T_FALSE) return false;
  if (requirementFails(spec, req, env)) return false;
  if (req.antecedent !== null && evalBool(req.antecedent, spec, env) !== T_FALSE) return false;
  return true;
}

function fileLabel(kind: string, id: string, line: number, condition: number): string {
  return kind + " " + id + " line " + formatInt(line) + conditionSuffix(condition);
}

function conditionSuffix(condition: number): string {
  if (condition <= 0) return "";
  return ", condition " + formatInt(condition);
}

function conditionLabel(n: number, text: string): string {
  return "condition " + formatInt(n) + " (" + displayQuote(text) + ")";
}

function made(
  spec: Spec,
  req: Requirement,
  kind: string,
  condition: number,
  conditionText: string,
  file: string,
  env: Binding,
  prefix: string,
): GeneratedFile {
  let text = explainHold(spec, env, req.antecedent, req.consequent);
  if (kind === "rejected") {
    const breaks = evaluateRequirements(spec, single(req), env);
    if (breaks.length > 0) text = breaks[0].because;
  }
  return {
    file: file,
    id: req.id,
    line: req.line,
    kind: kind,
    condition: condition,
    conditionText: conditionText,
    text: prefix + text,
    body: formatScenario(spec, env) + "\n",
  };
}

function gap(req: Requirement, condition: number, conditionText: string, text: string): UncoveredCondition {
  return { id: req.id, line: req.line, condition: condition, conditionText: conditionText, text: text };
}

function acceptedWhy(spec: Spec, req: Requirement, others: Requirement[]): string {
  if (req.antecedent === null) return "The requirements cannot all hold together.";
  if (!satisfiable(spec, others)) return "The other requirements cannot hold together, so there is no scenario where every requirement holds.";
  return "Keeping the other requirements leaves no scenario where this trigger is true.";
}

function rejectedWhy(spec: Spec, req: Requirement, others: Requirement[]): string {
  if (!satisfiable(spec, others)) return "The other requirements cannot hold together.";
  const held = copyReqs(others);
  if (req.antecedent !== null) held.push(forceTerm(req.antecedent));
  if (!satisfiable(spec, held)) return "Keeping the other requirements leaves no scenario where this trigger is true.";
  return "Whenever the other requirements hold and this trigger is true, " + req.id + " holds too.";
}

function rejectedCondWhy(
  spec: Spec,
  req: Requirement,
  others: Requirement[],
  onTerms: Term[],
  label: string,
  env: Binding | null,
): string {
  if (!termsPossible(spec, onTerms)) {
    return label + " cannot be true while the other conditions let it decide the trigger.";
  }
  if (env !== null && !exactBreak(spec, req, env)) {
    return "Breaking " + req.id + " while " + label + " decides the trigger also breaks " + otherBreaks(spec, req, env) + ".";
  }
  const held = copyReqs(others);
  held.push(forceTerm(conjoin(onTerms)));
  if (!satisfiable(spec, held)) return "Keeping the other requirements leaves no scenario where " + label + " decides the trigger.";
  return "Whenever the other requirements hold and " + label + " decides the trigger, " + req.id + " holds too.";
}

function flipWhy(spec: Spec, req: Requirement, atom: Term, offTerms: Term[], label: string, env: Binding | null): string {
  if (!termsPossible(spec, offTerms)) {
    return label + " cannot be false while the other conditions let it decide the trigger, so it cannot flip the outcome.";
  }
  if (env === null) return "No scenario keeps every requirement while " + label + " is false.";
  if (evalBool(atom, spec, env) !== T_FALSE) return "No scenario makes " + label + " false while the other conditions let it decide the trigger.";
  if (requirementFails(spec, req, env)) return "Flipping " + label + " still breaks " + req.id + ".";
  return "Flipping " + label + " does not make the trigger false.";
}

function otherBreaks(spec: Spec, req: Requirement, env: Binding): string {
  const found = evaluateRequirements(spec, spec.requirements, env);
  let text = "";
  for (let i = 0; i < found.length; i++) {
    if (found[i].id === req.id) continue;
    if (text.length > 0) text += " and ";
    text += found[i].id;
  }
  if (text.length === 0) return "another requirement";
  return text;
}

function exactBreak(spec: Spec, req: Requirement, env: Binding): boolean {
  if (req.antecedent !== null && evalBool(req.antecedent, spec, env) !== T_TRUE) return false;
  const found = evaluateRequirements(spec, spec.requirements, env);
  if (found.length !== 1) return false;
  return found[0].id === req.id;
}

function requirementFails(spec: Spec, req: Requirement, env: Binding): boolean {
  return evaluateRequirements(spec, single(req), env).length > 0;
}

function solve(spec: Spec, holds: Requirement[], fails: Requirement[], guardTerms: Term[]): Binding | null {
  if (guardTerms.length === 0) return firstMatching(spec, holds, fails, null, 0);
  return firstMatching(spec, holds, fails, conjoin(guardTerms), 1);
}

function triggerTerms(req: Requirement): Term[] {
  const terms: Term[] = [];
  if (req.antecedent !== null) terms.push(req.antecedent);
  return terms;
}

function othersOf(spec: Spec, index: number): Requirement[] {
  const others: Requirement[] = [];
  for (let i = 0; i < spec.requirements.length; i++) {
    if (i !== index) others.push(spec.requirements[i]);
  }
  return others;
}

function single(req: Requirement): Requirement[] {
  const list: Requirement[] = [];
  list.push(req);
  return list;
}

function copyReqs(reqs: Requirement[]): Requirement[] {
  const copy: Requirement[] = [];
  for (let i = 0; i < reqs.length; i++) copy.push(reqs[i]);
  return copy;
}

function copyTerms(terms: Term[]): Term[] {
  const copy: Term[] = [];
  for (let i = 0; i < terms.length; i++) copy.push(terms[i]);
  return copy;
}

function collectAtoms(term: Term, out: Term[]): void {
  if (term.kind === "and" || term.kind === "or") {
    collectAtoms(term.left, out);
    collectAtoms(term.right, out);
    return;
  }
  out.push(term);
}

function maskOf(root: Term, atom: Term): Term[] {
  const found = maskWalk(root, atom);
  if (found === null) {
    const empty: Term[] = [];
    return empty;
  }
  return found;
}

function maskWalk(term: Term, atom: Term): Term[] | null {
  if (term === atom) {
    const empty: Term[] = [];
    return empty;
  }
  if (term.kind !== "and" && term.kind !== "or") return null;
  const left = maskWalk(term.left, atom);
  if (left !== null) {
    left.push(term.kind === "and" ? term.right : negateTerm(term.right));
    return left;
  }
  const right = maskWalk(term.right, atom);
  if (right !== null) {
    right.push(term.kind === "and" ? term.left : negateTerm(term.left));
    return right;
  }
  return null;
}

function negateTerm(term: Term): Term {
  if (term.kind === "not") return term.term;
  return { kind: "not", term: term };
}

function conjoin(terms: Term[]): Term {
  let acc = terms[0];
  for (let i = 1; i < terms.length; i++) {
    const next: Term = { kind: "and", left: acc, right: terms[i] };
    acc = next;
  }
  return acc;
}

function termPossible(spec: Spec, term: Term): boolean {
  const holds: Requirement[] = [];
  holds.push(forceTerm(term));
  return satisfiable(spec, holds);
}

function termsPossible(spec: Spec, terms: Term[]): boolean {
  if (terms.length === 0) return true;
  return termPossible(spec, conjoin(terms));
}

function forceTerm(term: Term): Requirement {
  return {
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
}
