/**
 * A small, deterministic set of accepted and rejected scenarios.
 * Each requirement is shown with its trigger true, its trigger false, and
 * a case that breaks it. The first hit is the smallest assignment.
 */

import { evaluateRequirements, explainHold } from "./check.ts";
import { displayCode, type Requirement, type Spec } from "./spec.ts";
import { firstMatching } from "./solver.ts";
import { Binding, formatScenario } from "./term.ts";
import { formatInt } from "./text.ts";

export interface ScenarioPair {
  name: string;
  value: string;
}

export interface ScenarioRow {
  id: string;
  line: number;
  kind: string;
  trigger: string;
  found: boolean;
  sameAs: string;
  scenario: ScenarioPair[];
  exampleJson: string;
  text: string;
}

export function listScenarios(spec: Spec): ScenarioRow[] {
  const rows: ScenarioRow[] = [];
  for (let i = 0; i < spec.requirements.length; i++) {
    const req = spec.requirements[i];
    pushKind(spec, rows, req, "accepted", "true", 1);
    pushKind(spec, rows, req, "accepted", "false", 2);
    pushKind(spec, rows, req, "rejected", "true", 1);
  }
  return rows;
}

function pushKind(spec: Spec, rows: ScenarioRow[], req: Requirement, kind: string, trigger: string, wantGuard: number): void {
  if (wantGuard === 2 && req.antecedent === null) {
    rows.push(emptyRow(req, kind, trigger, req.id + " has no trigger, so there is no case where the trigger is false."));
    return;
  }
  const env =
    kind === "accepted"
      ? firstMatching(spec, spec.requirements, [], req.antecedent, wantGuard)
      : firstMatching(spec, [], [req], req.antecedent, wantGuard);
  if (env === null) {
    rows.push(emptyRow(req, kind, trigger, missingText(req.id, kind, trigger)));
    return;
  }
  const sameAs = earlierLabel(spec, rows, env);
  let text = explainHold(spec, env, req.antecedent, req.consequent);
  if (kind === "rejected") {
    const breaks = evaluateRequirements(spec, [req], env);
    if (breaks.length > 0) text = breaks[0].because;
  }
  rows.push({
    id: req.id,
    line: req.line,
    kind: kind,
    trigger: trigger,
    found: true,
    sameAs: sameAs,
    scenario: pairs(spec, env),
    exampleJson: formatScenario(spec, env),
    text: text,
  });
}

function emptyRow(req: Requirement, kind: string, trigger: string, text: string): ScenarioRow {
  return {
    id: req.id,
    line: req.line,
    kind: kind,
    trigger: trigger,
    found: false,
    sameAs: "",
    scenario: [],
    exampleJson: "",
    text: text,
  };
}

function missingText(id: string, kind: string, trigger: string): string {
  if (kind === "rejected") return "No scenario makes this trigger true and breaks " + id + ".";
  if (trigger === "false") return "No scenario satisfies every requirement while this trigger is false.";
  return "No scenario satisfies every requirement while this trigger is true.";
}

function earlierLabel(spec: Spec, rows: ScenarioRow[], env: Binding): string {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row.found || row.scenario.length !== spec.symbols.length) continue;
    let same = true;
    for (let s = 0; s < spec.symbols.length; s++) {
      if (row.scenario[s].value !== displayCode(spec, spec.symbols[s], env.code[s])) same = false;
    }
    if (same) return rowLabel(row);
  }
  return "";
}

function pairs(spec: Spec, env: Binding): ScenarioPair[] {
  const out: ScenarioPair[] = [];
  for (let i = 0; i < spec.symbols.length; i++) {
    out.push({ name: spec.symbols[i].name, value: displayCode(spec, spec.symbols[i], env.code[i]) });
  }
  return out;
}

export function rowLabel(row: ScenarioRow): string {
  return row.id + " " + row.kind + ", trigger " + row.trigger;
}

export function formatScenariosText(specPath: string, rows: ScenarioRow[]): string {
  const lines: string[] = [];
  lines.push("spec: " + specPath);
  lines.push("scenarios: " + formatInt(rows.length));
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    lines.push("");
    lines.push(rowLabel(row));
    if (row.found && row.sameAs.length === 0) lines.push(row.exampleJson);
    if (row.sameAs.length > 0) lines.push("Same scenario as " + row.sameAs + ".");
    lines.push(row.text);
  }
  return lines.join("\n");
}

export function formatScenariosJson(specPath: string, rows: ScenarioRow[]): string {
  const scenarios = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    scenarios.push({
      id: row.id,
      line: row.line,
      kind: row.kind,
      trigger: row.trigger,
      found: row.found,
      sameAs: row.sameAs,
      scenario: row.scenario,
      text: row.text,
    });
  }
  return JSON.stringify({ ok: true, spec: specPath, scenarios: scenarios }, null, 2);
}
