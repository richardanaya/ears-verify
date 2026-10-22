/**
 * Policy search.
 * With no property, report one scenario the requirements allow and one they
 * forbid. With a property, search for a scenario that satisfies every
 * requirement and violates the property.
 * The first hit is the smallest assignment: false before true, enums in
 * declaration order, integers from low to high.
 */

import { evaluateRequirements, type Violation } from "./check.ts";
import { displayCode, type Requirement, type Spec } from "./spec.ts";
import { firstScenario } from "./solver.ts";
import { Binding, formatScenario } from "./term.ts";
import { formatInt } from "./text.ts";

export interface PolicyReport {
  propertyPath: string;
  holds: boolean;
  note: string;
  accepted: Binding | null;
  rejected: Binding | null;
  counterexample: Binding | null;
  breaks: Violation[];
}

export function analyzePolicy(spec: Spec, propertyPath: string, propertyReqs: Requirement[]): PolicyReport {
  if (propertyPath.length === 0) {
    const accepted = firstScenario(spec, 0, propertyReqs);
    const rejected = firstScenario(spec, 1, propertyReqs);
    const breaks = rejected === null ? [] : evaluateRequirements(spec, spec.requirements, rejected);
    return {
      propertyPath: "",
      holds: true,
      note: "",
      accepted: accepted,
      rejected: rejected,
      counterexample: null,
      breaks: breaks,
    };
  }
  const counterexample = firstScenario(spec, 2, propertyReqs);
  if (counterexample !== null) {
    return {
      propertyPath: propertyPath,
      holds: false,
      note: "",
      accepted: null,
      rejected: null,
      counterexample: counterexample,
      breaks: evaluateRequirements(spec, propertyReqs, counterexample),
    };
  }
  const accepted = firstScenario(spec, 0, propertyReqs);
  const note =
    accepted === null
      ? "No scenario satisfies every requirement, so none violates the property."
      : "No scenario satisfies every requirement and violates the property.";
  return {
    propertyPath: propertyPath,
    holds: true,
    note: note,
    accepted: null,
    rejected: null,
    counterexample: null,
    breaks: [],
  };
}

export function formatPolicyText(specPath: string, spec: Spec, report: PolicyReport): string {
  const lines: string[] = [];
  lines.push("spec: " + specPath);
  if (report.propertyPath.length > 0) lines.push("property: " + report.propertyPath);
  if (report.propertyPath.length === 0) {
    lines.push("accepted:");
    if (report.accepted === null) lines.push("No scenario satisfies every requirement.");
    else {
      lines.push(formatScenario(spec, report.accepted));
      lines.push("This scenario satisfies every requirement.");
    }
    lines.push("rejected:");
    if (report.rejected === null) lines.push("No scenario violates a requirement.");
    else {
      lines.push(formatScenario(spec, report.rejected));
      lines.push("This scenario violates a requirement.");
      appendBreaks(lines, report.breaks);
    }
    return lines.join("\n");
  }
  if (report.counterexample !== null) {
    lines.push("counterexample:");
    lines.push(formatScenario(spec, report.counterexample));
    lines.push("This scenario satisfies every requirement and violates the property.");
    appendBreaks(lines, report.breaks);
    return lines.join("\n");
  }
  lines.push(report.note);
  return lines.join("\n");
}

function appendBreaks(lines: string[], breaks: Violation[]): void {
  for (let i = 0; i < breaks.length; i++) {
    const item = breaks[i];
    lines.push("");
    lines.push(item.id + " line " + formatInt(item.line));
    lines.push(item.sentence);
    lines.push(item.because);
  }
}

interface NameValue {
  name: string;
  value: string;
}

export function formatPolicyJson(specPath: string, spec: Spec, report: PolicyReport): string {
  const breaks: { id: string; line: number; sentence: string; because: string }[] = [];
  for (let i = 0; i < report.breaks.length; i++) {
    const item = report.breaks[i];
    breaks.push({ id: item.id, line: item.line, sentence: item.sentence, because: item.because });
  }
  return JSON.stringify(
    {
      ok: report.holds,
      spec: specPath,
      property: report.propertyPath,
      holds: report.holds,
      note: report.note,
      acceptedFound: report.accepted !== null,
      accepted: pairs(spec, report.accepted),
      rejectedFound: report.rejected !== null,
      rejected: pairs(spec, report.rejected),
      counterexampleFound: report.counterexample !== null,
      counterexample: pairs(spec, report.counterexample),
      breaks: breaks,
    },
    null,
    2,
  );
}

function pairs(spec: Spec, env: Binding | null): NameValue[] {
  const out: NameValue[] = [];
  if (env === null) return out;
  for (let i = 0; i < spec.symbols.length; i++) {
    out.push({ name: spec.symbols[i].name, value: displayCode(spec, spec.symbols[i], env.code[i]) });
  }
  return out;
}
