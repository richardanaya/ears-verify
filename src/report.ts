/**
 * Plain-language list of logical problems.
 * Contradictions, uncovered situations, impossible conditions, repeats, and
 * exact duplicates come from lint. A stricter repeat is still explained
 * here by naming the wider requirement. A contradiction asks which
 * requirement should win and does not choose one. Candidate repairs are
 * listed after that question, and none of them is selected.
 */

import type { Conflict, Duplicate, Gap, LintReport, Redundant, Vacuous } from "./lint.ts";
import type { Repair } from "./repair.ts";
import type { Requirement, Spec, Term } from "./spec.ts";
import { satisfiable } from "./decide.ts";
import { termsEqual } from "./term.ts";
import { displayQuote, englishList, formatInt } from "./text.ts";

export interface ProblemDocument {
  text: string;
  count: number;
}

interface Repeated {
  id: string;
  line: number;
  sentence: string;
  byId: string;
  byLine: number;
  bySentence: string;
  text: string;
  fix: string;
}

export function buildProblems(specPath: string, spec: Spec, report: LintReport): ProblemDocument {
  const repeated = collectRepeated(spec, report);
  const count =
    report.conflicts.length + report.gaps.length + report.vacuous.length + repeated.length + report.duplicate.length;
  const lines: string[] = [];
  lines.push("# Logical problems");
  lines.push("");
  lines.push("Spec: " + specPath);
  lines.push("");
  if (count === 0) {
    lines.push("No logical problems.");
    return { text: lines.join("\n"), count: count };
  }
  lines.push(
    "These are the logical problems in the requirements. For a contradiction, which requirement should win? This report does not choose.",
  );
  let n = 1;
  for (let i = 0; i < report.conflicts.length; i++) {
    pushConflict(lines, report.conflicts[i], n);
    n++;
  }
  for (let i = 0; i < report.gaps.length; i++) {
    pushGap(lines, spec, report.gaps[i], n);
    n++;
  }
  for (let i = 0; i < report.vacuous.length; i++) {
    pushVacuous(lines, report.vacuous[i], n);
    n++;
  }
  for (let i = 0; i < repeated.length; i++) {
    pushRepeated(lines, repeated[i], n);
    n++;
  }
  for (let i = 0; i < report.duplicate.length; i++) {
    pushDuplicate(lines, spec, report.duplicate[i], n);
    n++;
  }
  return { text: lines.join("\n"), count: count };
}

function pushConflict(lines: string[], conflict: Conflict, index: number): void {
  lines.push("");
  lines.push("## " + formatInt(index) + ". " + conflict.summary);
  lines.push("");
  lines.push(conflict.clash);
  for (let r = 0; r < conflict.ids.length; r++) {
    lines.push("");
    lines.push(conflict.ids[r] + " line " + formatInt(conflict.lines[r]));
    lines.push(displayQuote(conflict.sentences[r]));
  }
  if (conflict.requires.length > 0) {
    lines.push("");
    for (let r = 0; r < conflict.requires.length; r++) {
      lines.push(conflict.requires[r].name + " requires " + conflict.requires[r].value + ".");
    }
  }
  lines.push("");
  lines.push(winnerQuestion(conflict.ids));
  pushRepairs(lines, conflict.repairs);
}

function pushRepairs(lines: string[], repairs: Repair[]): void {
  if (repairs.length === 0) return;
  lines.push("");
  lines.push("Candidate repairs follow. This report does not choose one.");
  for (let i = 0; i < repairs.length; i++) {
    lines.push("");
    lines.push(repairs[i].text);
    pushQuotedLines(lines, repairs[i].sentence);
  }
}

function pushQuotedLines(lines: string[], sentence: string): void {
  if (sentence.length === 0) return;
  let start = 0;
  for (let i = 0; i <= sentence.length; i++) {
    if (i === sentence.length || sentence.charCodeAt(i) === 10) {
      const part = sentence.slice(start, i);
      if (part.length > 0) lines.push(displayQuote(part));
      start = i + 1;
    }
  }
}

function winnerQuestion(ids: string[]): string {
  if (ids.length === 1) {
    return (
      "Which behavior should replace " +
      ids[0] +
      "? It cannot be satisfied for any allowed values. This report does not choose a behavior."
    );
  }
  if (ids.length === 2) {
    return (
      "Which requirement should win? To keep " +
      ids[0] +
      ", remove " +
      ids[1] +
      ". To keep " +
      ids[1] +
      ", remove " +
      ids[0] +
      ". This report does not choose."
    );
  }
  return (
    "Which requirement should win? Removing any one of " +
    englishList(ids) +
    " leaves the rest consistent. This report does not choose."
  );
}

function pushGap(lines: string[], spec: Spec, gap: Gap, index: number): void {
  lines.push("");
  lines.push("## " + formatInt(index) + ". " + gapTitle(spec, gap));
  lines.push("");
  lines.push(gap.text);
}

function gapTitle(spec: Spec, gap: Gap): string {
  const phrase = phraseOf(spec, gap.output);
  if (phrase === gap.output) return "Nothing covers " + gap.output;
  return "Nothing covers " + phrase + " (" + gap.output + ")";
}

function phraseOf(spec: Spec, name: string): string {
  for (let i = 0; i < spec.symbols.length; i++) {
    if (spec.symbols[i].name === name && spec.symbols[i].phrase.length > 0) return spec.symbols[i].phrase;
  }
  return name;
}

function pushVacuous(lines: string[], item: Vacuous, index: number): void {
  lines.push("");
  lines.push("## " + formatInt(index) + ". " + item.id + " can never trigger");
  lines.push("");
  lines.push(item.id + " line " + formatInt(item.line));
  lines.push(displayQuote(item.sentence));
  lines.push("");
  lines.push(item.text);
  for (let b = 0; b < item.because.length; b++) lines.push("Blocked by " + item.because[b] + ".");
  lines.push(item.fix);
}

function pushDuplicate(lines: string[], spec: Spec, item: Duplicate, index: number): void {
  lines.push("");
  lines.push("## " + formatInt(index) + ". " + item.id + " duplicates " + item.sameAs);
  lines.push("");
  lines.push(item.id + " line " + formatInt(item.line));
  lines.push(displayQuote(item.sentence));
  lines.push("");
  lines.push(item.text);
  const prior = requirementById(spec, item.sameAs);
  if (prior !== null) {
    lines.push("");
    lines.push(prior.id + " line " + formatInt(prior.line));
    lines.push(displayQuote(prior.sentence));
  }
  lines.push("");
  lines.push(item.fix);
}

function requirementById(spec: Spec, id: string): Requirement | null {
  for (let i = 0; i < spec.requirements.length; i++) {
    if (spec.requirements[i].id === id) return spec.requirements[i];
  }
  return null;
}

function pushRepeated(lines: string[], item: Repeated, index: number): void {
  lines.push("");
  lines.push("## " + formatInt(index) + ". " + item.id + " adds nothing");
  lines.push("");
  lines.push(item.id + " line " + formatInt(item.line));
  lines.push(displayQuote(item.sentence));
  lines.push("");
  if (item.byId.length > 0) {
    lines.push(
      item.id +
        " adds nothing. It only repeats " +
        item.byId +
        " in a stricter situation. Whenever " +
        item.byId +
        " holds, " +
        item.id +
        " holds too.",
    );
    lines.push("");
    lines.push(item.byId + " line " + formatInt(item.byLine));
    lines.push(displayQuote(item.bySentence));
    lines.push("");
    lines.push(
      "Ask whether " +
        item.id +
        " was meant to say something " +
        item.byId +
        " does not already require. Do not delete it until the product manager agrees.",
    );
    return;
  }
  lines.push(item.text);
  lines.push(item.fix);
}

function collectRepeated(spec: Spec, report: LintReport): Repeated[] {
  const found = repeatedRequirements(spec);
  const seen: string[] = [];
  for (let i = 0; i < found.length; i++) seen.push(found[i].id);
  for (let i = 0; i < report.redundant.length; i++) {
    const item = report.redundant[i];
    if (hasId(seen, item.id)) continue;
    found.push(fromLint(item));
    seen.push(item.id);
  }
  return found;
}

function fromLint(item: Redundant): Repeated {
  return {
    id: item.id,
    line: item.line,
    sentence: item.sentence,
    byId: "",
    byLine: 0,
    bySentence: "",
    text: item.text,
    fix: item.fix,
  };
}

function hasId(ids: string[], id: string): boolean {
  for (let i = 0; i < ids.length; i++) {
    if (ids[i] === id) return true;
  }
  return false;
}

function repeatedRequirements(spec: Spec): Repeated[] {
  const found: Repeated[] = [];
  const reqs = spec.requirements;
  for (let j = 0; j < reqs.length; j++) {
    const narrower = reqs[j];
    const narrowGuard = guardOf(narrower);
    if (!holdsTerm(spec, narrowGuard)) continue;
    for (let i = 0; i < reqs.length; i++) {
      if (i === j) continue;
      const wider = reqs[i];
      if (!termsEqual(wider.consequent, narrower.consequent)) continue;
      const wideGuard = guardOf(wider);
      if (!holdsTerm(spec, wideGuard)) continue;
      if (!strictlyWider(spec, wideGuard, narrowGuard)) continue;
      found.push({
        id: narrower.id,
        line: narrower.line,
        sentence: narrower.sentence,
        byId: wider.id,
        byLine: wider.line,
        bySentence: wider.sentence,
        text: "",
        fix: "",
      });
      break;
    }
  }
  return found;
}

function strictlyWider(spec: Spec, wide: Term, narrow: Term): boolean {
  if (holdsTerm(spec, andNot(narrow, wide))) return false;
  return holdsTerm(spec, andNot(wide, narrow));
}

function andNot(left: Term, right: Term): Term {
  return { kind: "and", left: left, right: { kind: "not", term: right } };
}

function guardOf(req: Requirement): Term {
  if (req.antecedent === null) return { kind: "bool", value: true };
  return req.antecedent;
}

function holdsTerm(spec: Spec, term: Term): boolean {
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

