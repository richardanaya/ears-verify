/**
 * Diff two EARS specs for a product manager.
 * Requirements match by id. Behavior is one scenario each way, found by
 * the same least-assignment search as policy: false before true.
 * Comparison uses names declared in both specs. An Int range or an enum
 * variant list is narrowed to the overlap. A type with no overlap is an error.
 */

import { evaluateRequirements, type Violation } from "./check.ts";
import { lintSpec, type Conflict, type Gap } from "./lint.ts";
import { findEnum, findSymbol, displayCode, type EnumDecl, type Requirement, type Sort, type Spec, type SymbolDecl, type Term } from "./spec.ts";
import { firstMatching } from "./solver.ts";
import { formatScenario, type Binding } from "./term.ts";
import { englishList, formatInt } from "./text.ts";

export interface ReqLine {
  id: string;
  line: number;
  sentence: string;
}

export interface RewordLine {
  id: string;
  oldLine: number;
  oldSentence: string;
  newLine: number;
  newSentence: string;
}

export interface SchemaNote {
  name: string;
  text: string;
}

export interface AssignmentRow {
  name: string;
  value: string;
}

export interface ConflictDelta {
  ids: string[];
  summary: string;
}

export interface GapDelta {
  output: string;
  text: string;
}

export interface DiffReport {
  added: ReqLine[];
  removed: ReqLine[];
  reworded: RewordLine[];
  onlyOld: string[];
  onlyNew: string[];
  changed: SchemaNote[];
  oldAcceptsNewRejectsFound: boolean;
  oldAcceptsNewRejectsText: string;
  oldAcceptsNewRejects: AssignmentRow[];
  oldAcceptsBreaks: Violation[];
  newAcceptsOldRejectsFound: boolean;
  newAcceptsOldRejectsText: string;
  newAcceptsOldRejects: AssignmentRow[];
  newAcceptsBreaks: Violation[];
  note: string;
  conflictsFixed: ConflictDelta[];
  conflictsNew: ConflictDelta[];
  gapsFixed: GapDelta[];
  gapsNew: GapDelta[];
}

export type DiffOutcome = { kind: "report"; report: DiffReport } | { kind: "error"; message: string };

interface Aligned {
  spec: Spec;
  oldMap: number[];
  newMap: number[];
  onlyOld: string[];
  onlyNew: string[];
  changed: SchemaNote[];
}

type Fail = { kind: "error"; message: string };
type AlignOutcome = { kind: "ok"; aligned: Aligned } | Fail;
type SortDecision = { kind: "ok"; sort: Sort; note: string } | Fail;
type RemapOutcome = { kind: "ok"; term: Term } | Fail;
type ReqOutcome = { kind: "ok"; req: Requirement } | Fail;
type ReqsOutcome = { kind: "ok"; reqs: Requirement[] } | Fail;

const SAME = "No scenario changes acceptance.";

export function diffSpecs(oldPath: string, oldSpec: Spec, newPath: string, newSpec: Spec): DiffOutcome {
  const lintOld = lintSpec(oldSpec);
  if (lintOld.kind === "error") return { kind: "error", message: oldPath + ": " + lintOld.message };
  const lintNew = lintSpec(newSpec);
  if (lintNew.kind === "error") return { kind: "error", message: newPath + ": " + lintNew.message };

  const aligned = alignSchema(oldPath, oldSpec, newPath, newSpec);
  if (aligned.kind === "error") return aligned;

  const excluded = excludedIds(oldSpec, newSpec, aligned.aligned.oldMap, aligned.aligned.newMap);
  const oldReqs = collectReqs(oldPath, oldSpec, aligned.aligned.oldMap, aligned.aligned.spec, excluded);
  if (oldReqs.kind === "error") return oldReqs;
  const newReqs = collectReqs(newPath, newSpec, aligned.aligned.newMap, aligned.aligned.spec, excluded);
  if (newReqs.kind === "error") return newReqs;

  const shared = aligned.aligned.spec;
  const voiced = overlayVoice(shared, newSpec);
  const oldAccepts = newReqs.reqs.length === 0 ? null : firstMatching(shared, oldReqs.reqs, newReqs.reqs, null, 0);
  const newAccepts = oldReqs.reqs.length === 0 ? null : firstMatching(shared, newReqs.reqs, oldReqs.reqs, null, 0);
  const oldBreaks = oldAccepts === null ? [] : evaluateRequirements(voiced, newReqs.reqs, oldAccepts);
  const newBreaks = newAccepts === null ? [] : evaluateRequirements(shared, oldReqs.reqs, newAccepts);
  const changedAcceptance = oldAccepts !== null || newAccepts !== null;

  const report: DiffReport = {
    added: addedLines(oldSpec, newSpec),
    removed: removedLines(oldSpec, newSpec),
    reworded: rewordedLines(oldSpec, newSpec),
    onlyOld: aligned.aligned.onlyOld,
    onlyNew: aligned.aligned.onlyNew,
    changed: aligned.aligned.changed,
    oldAcceptsNewRejectsFound: oldAccepts !== null,
    oldAcceptsNewRejectsText: oldAccepts === null ? "" : formatScenario(shared, oldAccepts),
    oldAcceptsNewRejects: rowsOf(shared, oldAccepts),
    oldAcceptsBreaks: oldBreaks,
    newAcceptsOldRejectsFound: newAccepts !== null,
    newAcceptsOldRejectsText: newAccepts === null ? "" : formatScenario(shared, newAccepts),
    newAcceptsOldRejects: rowsOf(shared, newAccepts),
    newAcceptsBreaks: newBreaks,
    note: changedAcceptance ? "" : SAME,
    conflictsFixed: conflictDelta(lintOld.report.conflicts, lintNew.report.conflicts),
    conflictsNew: conflictDelta(lintNew.report.conflicts, lintOld.report.conflicts),
    gapsFixed: gapDelta(lintOld.report.gaps, lintNew.report.gaps),
    gapsNew: gapDelta(lintNew.report.gaps, lintOld.report.gaps),
  };
  return { kind: "report", report: report };
}

export function formatDiffText(oldPath: string, newPath: string, report: DiffReport): string {
  const lines: string[] = [];
  lines.push("old: " + oldPath);
  lines.push("new: " + newPath);
  lines.push("added:");
  pushReqs(lines, report.added);
  lines.push("removed:");
  pushReqs(lines, report.removed);
  lines.push("reworded:");
  pushReworded(lines, report.reworded);
  lines.push("schema:");
  pushSchema(lines, report);
  lines.push("behavior:");
  pushBehavior(lines, report);
  lines.push("lint:");
  lines.push("conflicts fixed:");
  pushConflicts(lines, report.conflictsFixed);
  lines.push("conflicts new:");
  pushConflicts(lines, report.conflictsNew);
  lines.push("gaps fixed:");
  pushGaps(lines, report.gapsFixed);
  lines.push("gaps new:");
  pushGaps(lines, report.gapsNew);
  return lines.join("\n");
}

export function formatDiffJson(oldPath: string, newPath: string, report: DiffReport): string {
  const changed = report.oldAcceptsNewRejectsFound || report.newAcceptsOldRejectsFound;
  return JSON.stringify(
    {
      ok: !changed,
      old: oldPath,
      new: newPath,
      added: report.added,
      removed: report.removed,
      reworded: report.reworded,
      onlyOld: report.onlyOld,
      onlyNew: report.onlyNew,
      changed: report.changed,
      oldAcceptsNewRejectsFound: report.oldAcceptsNewRejectsFound,
      oldAcceptsNewRejects: report.oldAcceptsNewRejects,
      oldAcceptsBreaks: breakRows(report.oldAcceptsBreaks),
      newAcceptsOldRejectsFound: report.newAcceptsOldRejectsFound,
      newAcceptsOldRejects: report.newAcceptsOldRejects,
      newAcceptsBreaks: breakRows(report.newAcceptsBreaks),
      note: report.note,
      conflictsFixed: report.conflictsFixed,
      conflictsNew: report.conflictsNew,
      gapsFixed: report.gapsFixed,
      gapsNew: report.gapsNew,
    },
    null,
    2,
  );
}

function breakRows(items: Violation[]): { id: string; line: number; sentence: string; because: string }[] {
  const out: { id: string; line: number; sentence: string; because: string }[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    out.push({ id: item.id, line: item.line, sentence: item.sentence, because: item.because });
  }
  return out;
}

function pushReqs(lines: string[], reqs: ReqLine[]): void {
  if (reqs.length === 0) {
    lines.push("none");
    return;
  }
  for (let i = 0; i < reqs.length; i++) {
    if (i > 0) lines.push("");
    lines.push(reqs[i].id + " line " + formatInt(reqs[i].line));
    lines.push(reqs[i].sentence);
  }
}

function pushReworded(lines: string[], items: RewordLine[]): void {
  if (items.length === 0) {
    lines.push("none");
    return;
  }
  for (let i = 0; i < items.length; i++) {
    if (i > 0) lines.push("");
    const item = items[i];
    lines.push(item.id);
    lines.push("old line " + formatInt(item.oldLine));
    lines.push(item.oldSentence);
    lines.push("new line " + formatInt(item.newLine));
    lines.push(item.newSentence);
  }
}

function pushSchema(lines: string[], report: DiffReport): void {
  if (report.onlyOld.length === 0 && report.onlyNew.length === 0 && report.changed.length === 0) {
    lines.push("none");
    return;
  }
  if (report.onlyOld.length > 0) lines.push("only in the old spec: " + joinWords(report.onlyOld));
  if (report.onlyNew.length > 0) lines.push("only in the new spec: " + joinWords(report.onlyNew));
  for (let i = 0; i < report.changed.length; i++) lines.push(report.changed[i].text);
}

function pushBehavior(lines: string[], report: DiffReport): void {
  if (!report.oldAcceptsNewRejectsFound && !report.newAcceptsOldRejectsFound) {
    lines.push(report.note);
    return;
  }
  if (report.oldAcceptsNewRejectsFound) {
    lines.push("The old spec accepts this scenario and the new spec rejects it.");
    lines.push(report.oldAcceptsNewRejectsText);
    pushBreaks(lines, report.oldAcceptsBreaks);
  } else {
    lines.push("No scenario is accepted by the old spec and rejected by the new spec.");
  }
  lines.push("");
  if (report.newAcceptsOldRejectsFound) {
    lines.push("The new spec accepts this scenario and the old spec rejects it.");
    lines.push(report.newAcceptsOldRejectsText);
    pushBreaks(lines, report.newAcceptsBreaks);
  } else {
    lines.push("No scenario is accepted by the new spec and rejected by the old spec.");
  }
}

function pushBreaks(lines: string[], items: Violation[]): void {
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    lines.push("");
    lines.push(item.id + " line " + formatInt(item.line));
    lines.push(item.sentence);
    lines.push(item.because);
  }
}

function pushConflicts(lines: string[], items: ConflictDelta[]): void {
  if (items.length === 0) {
    lines.push("none");
    return;
  }
  for (let i = 0; i < items.length; i++) {
    if (i > 0) lines.push("");
    lines.push(joinWords(items[i].ids));
    lines.push(items[i].summary);
  }
}

function pushGaps(lines: string[], items: GapDelta[]): void {
  if (items.length === 0) {
    lines.push("none");
    return;
  }
  for (let i = 0; i < items.length; i++) {
    if (i > 0) lines.push("");
    lines.push(items[i].output);
    lines.push(items[i].text);
  }
}

function addedLines(oldSpec: Spec, newSpec: Spec): ReqLine[] {
  const out: ReqLine[] = [];
  for (let i = 0; i < newSpec.requirements.length; i++) {
    const req = newSpec.requirements[i];
    if (findReq(oldSpec, req.id) === null) out.push(lineOf(req));
  }
  return out;
}

function removedLines(oldSpec: Spec, newSpec: Spec): ReqLine[] {
  const out: ReqLine[] = [];
  for (let i = 0; i < oldSpec.requirements.length; i++) {
    const req = oldSpec.requirements[i];
    if (findReq(newSpec, req.id) === null) out.push(lineOf(req));
  }
  return out;
}

function rewordedLines(oldSpec: Spec, newSpec: Spec): RewordLine[] {
  const out: RewordLine[] = [];
  for (let i = 0; i < oldSpec.requirements.length; i++) {
    const req = oldSpec.requirements[i];
    const other = findReq(newSpec, req.id);
    if (other === null) continue;
    if (other.sentence === req.sentence) continue;
    out.push({
      id: req.id,
      oldLine: req.line,
      oldSentence: req.sentence,
      newLine: other.line,
      newSentence: other.sentence,
    });
  }
  return out;
}

function lineOf(req: Requirement): ReqLine {
  return { id: req.id, line: req.line, sentence: req.sentence };
}

function findReq(spec: Spec, id: string): Requirement | null {
  for (let i = 0; i < spec.requirements.length; i++) {
    if (spec.requirements[i].id === id) return spec.requirements[i];
  }
  return null;
}

function alignSchema(oldPath: string, oldSpec: Spec, newPath: string, newSpec: Spec): AlignOutcome {
  const onlyOld: string[] = [];
  const onlyNew: string[] = [];
  const sharedOld: number[] = [];
  for (let i = 0; i < oldSpec.symbols.length; i++) {
    if (findSymbol(newSpec, oldSpec.symbols[i].name) < 0) onlyOld.push(oldSpec.symbols[i].name);
    else sharedOld.push(i);
  }
  for (let i = 0; i < newSpec.symbols.length; i++) {
    if (findSymbol(oldSpec, newSpec.symbols[i].name) < 0) onlyNew.push(newSpec.symbols[i].name);
  }

  const oldMap: number[] = [];
  for (let i = 0; i < oldSpec.symbols.length; i++) oldMap.push(-1);
  const newMap: number[] = [];
  for (let i = 0; i < newSpec.symbols.length; i++) newMap.push(-1);

  const symbols: SymbolDecl[] = [];
  const enums: EnumDecl[] = [];
  const changed: SchemaNote[] = [];
  for (let s = 0; s < sharedOld.length; s++) {
    const oi = sharedOld[s];
    const name = oldSpec.symbols[oi].name;
    const ni = findSymbol(newSpec, name);
    const decided = decideSort(oldPath, oldSpec, newPath, newSpec, oi, ni, enums);
    if (decided.kind === "error") return decided;
    if (decided.note.length > 0) changed.push({ name: name, text: decided.note });
    const sharedIndex = symbols.length;
    symbols.push(withSort(oldSpec.symbols[oi], decided.sort));
    oldMap[oi] = sharedIndex;
    newMap[ni] = sharedIndex;
  }
  return {
    kind: "ok",
    aligned: {
      spec: { enums: enums, symbols: symbols, requirements: [] },
      oldMap: oldMap,
      newMap: newMap,
      onlyOld: onlyOld,
      onlyNew: onlyNew,
      changed: changed,
    },
  };
}

function decideSort(
  oldPath: string,
  oldSpec: Spec,
  newPath: string,
  newSpec: Spec,
  oi: number,
  ni: number,
  enums: EnumDecl[],
): SortDecision {
  const name = oldSpec.symbols[oi].name;
  const left = oldSpec.symbols[oi].sort;
  const right = newSpec.symbols[ni].sort;
  if (left.kind !== right.kind) return typeError(name, left, oldPath, right, newPath);
  if (left.kind === "bool") return { kind: "ok", sort: { kind: "bool" }, note: "" };
  if (left.kind === "int") {
    if (right.kind !== "int") return typeError(name, left, oldPath, right, newPath);
    const lo = left.min > right.min ? left.min : right.min;
    const hi = left.max < right.max ? left.max : right.max;
    if (lo > hi) {
      return {
        kind: "error",
        message:
          name +
          " ranges do not overlap: " +
          formatInt(left.min) +
          ".." +
          formatInt(left.max) +
          " in " +
          oldPath +
          " and " +
          formatInt(right.min) +
          ".." +
          formatInt(right.max) +
          " in " +
          newPath +
          ".",
      };
    }
    let note = "";
    if (left.min !== right.min || left.max !== right.max) {
      note =
        name +
        " was " +
        formatInt(left.min) +
        ".." +
        formatInt(left.max) +
        " and is " +
        formatInt(right.min) +
        ".." +
        formatInt(right.max) +
        ". Compared over " +
        formatInt(lo) +
        ".." +
        formatInt(hi) +
        ".";
    }
    return { kind: "ok", sort: { kind: "int", min: lo, max: hi }, note: note };
  }
  if (right.kind !== "enum") return typeError(name, left, oldPath, right, newPath);
  if (left.enumName !== right.enumName) return typeError(name, left, oldPath, right, newPath);
  const oldEnum = findEnum(oldSpec, left.enumName);
  const newEnum = findEnum(newSpec, right.enumName);
  if (oldEnum === null) {
    return { kind: "error", message: name + " enum " + left.enumName + " is not declared in " + oldPath + "." };
  }
  if (newEnum === null) {
    return { kind: "error", message: name + " enum " + left.enumName + " is not declared in " + newPath + "." };
  }
  const sharedVars = overlap(oldEnum.variants, newEnum.variants);
  if (sharedVars.length === 0) {
    return {
      kind: "error",
      message:
        name +
        " variants do not overlap: " +
        englishList(oldEnum.variants) +
        " in " +
        oldPath +
        " and " +
        englishList(newEnum.variants) +
        " in " +
        newPath +
        ".",
    };
  }
  ensureEnum(enums, left.enumName, sharedVars, oldEnum.line);
  let note = "";
  if (!sameWords(oldEnum.variants, newEnum.variants)) {
    note =
      name +
      " variants changed from " +
      englishList(oldEnum.variants) +
      " to " +
      englishList(newEnum.variants) +
      ". Compared over " +
      englishList(sharedVars) +
      ".";
  }
  return { kind: "ok", sort: { kind: "enum", enumName: left.enumName }, note: note };
}

function typeError(name: string, left: Sort, oldPath: string, right: Sort, newPath: string): Fail {
  return {
    kind: "error",
    message: name + " is " + sortLabel(left) + " in " + oldPath + " and " + sortLabel(right) + " in " + newPath + ".",
  };
}

function sortLabel(sort: Sort): string {
  if (sort.kind === "bool") return "Bool";
  if (sort.kind === "int") return "Int";
  return sort.enumName;
}

function overlap(oldVars: string[], newVars: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < oldVars.length; i++) {
    if (hasWord(newVars, oldVars[i])) out.push(oldVars[i]);
  }
  return out;
}

function sameWords(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i++) {
    if (left[i] !== right[i]) return false;
  }
  return true;
}

function ensureEnum(enums: EnumDecl[], name: string, variants: string[], line: number): void {
  for (let i = 0; i < enums.length; i++) {
    if (enums[i].name === name) return;
  }
  enums.push({ name: name, variants: variants, line: line });
}

function withSort(sym: SymbolDecl, sort: Sort): SymbolDecl {
  return {
    role: sym.role,
    name: sym.name,
    sort: sort,
    description: sym.description,
    phrase: sym.phrase,
    outcomeYes: sym.outcomeYes,
    outcomeNo: sym.outcomeNo,
    action: sym.action,
    says: sym.says,
    asText: sym.asText,
    unwanted: sym.unwanted,
    line: sym.line,
    source: sym.source,
  };
}

function overlayVoice(shared: Spec, from: Spec): Spec {
  const symbols: SymbolDecl[] = [];
  for (let i = 0; i < shared.symbols.length; i++) {
    const base = shared.symbols[i];
    const at = findSymbol(from, base.name);
    if (at < 0) symbols.push(base);
    else symbols.push(withVoice(base, from.symbols[at]));
  }
  return { enums: shared.enums, symbols: symbols, requirements: [] };
}

function withVoice(base: SymbolDecl, from: SymbolDecl): SymbolDecl {
  return {
    role: base.role,
    name: base.name,
    sort: base.sort,
    description: from.description,
    phrase: from.phrase,
    outcomeYes: from.outcomeYes,
    outcomeNo: from.outcomeNo,
    action: from.action,
    says: from.says,
    asText: from.asText,
    unwanted: from.unwanted,
    line: from.line,
    source: from.source,
  };
}

function excludedIds(oldSpec: Spec, newSpec: Spec, oldMap: number[], newMap: number[]): string[] {
  const ids: string[] = [];
  collectExcluded(oldSpec, oldMap, ids);
  collectExcluded(newSpec, newMap, ids);
  return ids;
}

function collectExcluded(spec: Spec, map: number[], ids: string[]): void {
  for (let i = 0; i < spec.requirements.length; i++) {
    const req = spec.requirements[i];
    if (!reqOutside(req, map)) continue;
    if (!hasWord(ids, req.id)) ids.push(req.id);
  }
}

function reqOutside(req: Requirement, map: number[]): boolean {
  if (termOutside(req.antecedent, map)) return true;
  if (termOutside(req.consequent, map)) return true;
  return termOutside(req.whenTerm, map);
}

function termOutside(term: Term | null, map: number[]): boolean {
  if (term === null) return false;
  if (term.kind === "sym") return map[term.index] < 0;
  if (term.kind === "not") return termOutside(term.term, map);
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
    return termOutside(term.left, map) || termOutside(term.right, map);
  }
  return false;
}

function collectReqs(path: string, spec: Spec, map: number[], shared: Spec, excluded: string[]): ReqsOutcome {
  const reqs: Requirement[] = [];
  for (let i = 0; i < spec.requirements.length; i++) {
    const req = spec.requirements[i];
    if (hasWord(excluded, req.id)) continue;
    const mapped = remapReq(path, req, map, shared);
    if (mapped.kind === "error") return mapped;
    reqs.push(mapped.req);
  }
  return { kind: "ok", reqs: reqs };
}

function remapReq(path: string, req: Requirement, map: number[], shared: Spec): ReqOutcome {
  let antecedent: Term | null = null;
  if (req.antecedent !== null) {
    const mapped = remapTerm(path, req.id, req.antecedent, map, shared);
    if (mapped.kind === "error") return mapped;
    antecedent = mapped.term;
  }
  const consequent = remapTerm(path, req.id, req.consequent, map, shared);
  if (consequent.kind === "error") return consequent;
  let whenTerm: Term | null = null;
  if (req.whenTerm !== null) {
    const mapped = remapTerm(path, req.id, req.whenTerm, map, shared);
    if (mapped.kind === "error") return mapped;
    whenTerm = mapped.term;
  }
  return {
    kind: "ok",
    req: {
      id: req.id,
      line: req.line,
      sentence: req.sentence,
      system: req.system,
      antecedent: antecedent,
      consequent: consequent.term,
      hasWhen: req.hasWhen,
      hasIf: req.hasIf,
      whenTerm: whenTerm,
    },
  };
}

function remapTerm(path: string, id: string, term: Term, map: number[], shared: Spec): RemapOutcome {
  if (term.kind === "bool" || term.kind === "int") return { kind: "ok", term: term };
  if (term.kind === "enum") {
    const decl = findEnum(shared, term.enumName);
    const index = decl === null ? -1 : variantAt(decl, term.variant);
    if (index < 0) {
      return {
        kind: "error",
        message:
          "cannot compare " +
          id +
          " in " +
          path +
          " because it uses " +
          term.variant +
          ", which is outside the shared variants of " +
          term.enumName +
          ".",
      };
    }
    return { kind: "ok", term: { kind: "enum", enumName: term.enumName, variant: term.variant, index: index } };
  }
  if (term.kind === "sym") {
    const index = map[term.index];
    if (index < 0) {
      return {
        kind: "error",
        message: "cannot compare " + id + " in " + path + " because it uses " + term.name + ", which is not in both specs.",
      };
    }
    return { kind: "ok", term: { kind: "sym", name: term.name, index: index, phrase: term.phrase } };
  }
  if (term.kind === "not") {
    const inner = remapTerm(path, id, term.term, map, shared);
    if (inner.kind === "error") return inner;
    return { kind: "ok", term: { kind: "not", term: inner.term } };
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
    const left = remapTerm(path, id, term.left, map, shared);
    if (left.kind === "error") return left;
    const right = remapTerm(path, id, term.right, map, shared);
    if (right.kind === "error") return right;
    const built = binaryTerm(term.kind, left.term, right.term);
    if (built === null) {
      return { kind: "error", message: "cannot compare " + id + " in " + path + " because a term could not be remapped." };
    }
    return { kind: "ok", term: built };
  }
  return { kind: "error", message: "cannot compare " + id + " in " + path + " because a term could not be remapped." };
}

function binaryTerm(kind: string, left: Term, right: Term): Term | null {
  if (kind === "and") return { kind: "and", left: left, right: right };
  if (kind === "or") return { kind: "or", left: left, right: right };
  if (kind === "eq") return { kind: "eq", left: left, right: right };
  if (kind === "neq") return { kind: "neq", left: left, right: right };
  if (kind === "lt") return { kind: "lt", left: left, right: right };
  if (kind === "le") return { kind: "le", left: left, right: right };
  if (kind === "gt") return { kind: "gt", left: left, right: right };
  if (kind === "ge") return { kind: "ge", left: left, right: right };
  if (kind === "add") return { kind: "add", left: left, right: right };
  if (kind === "sub") return { kind: "sub", left: left, right: right };
  return null;
}

function variantAt(decl: EnumDecl, name: string): number {
  for (let i = 0; i < decl.variants.length; i++) {
    if (decl.variants[i] === name) return i;
  }
  return -1;
}

function rowsOf(spec: Spec, env: Binding | null): AssignmentRow[] {
  const out: AssignmentRow[] = [];
  if (env === null) return out;
  for (let i = 0; i < spec.symbols.length; i++) {
    out.push({ name: spec.symbols[i].name, value: displayCode(spec, spec.symbols[i], env.code[i]) });
  }
  return out;
}

function conflictDelta(source: Conflict[], other: Conflict[]): ConflictDelta[] {
  const out: ConflictDelta[] = [];
  for (let i = 0; i < source.length; i++) {
    const ids = sortedIds(source[i].ids);
    const key = joinComma(ids);
    if (hasConflict(other, key)) continue;
    out.push({ ids: ids, summary: source[i].summary });
  }
  return out;
}

function hasConflict(items: Conflict[], key: string): boolean {
  for (let i = 0; i < items.length; i++) {
    if (joinComma(sortedIds(items[i].ids)) === key) return true;
  }
  return false;
}

function gapDelta(source: Gap[], other: Gap[]): GapDelta[] {
  const out: GapDelta[] = [];
  const seen: string[] = [];
  for (let i = 0; i < source.length; i++) {
    const name = source[i].output;
    if (hasWord(seen, name)) continue;
    seen.push(name);
    if (hasGap(other, name)) continue;
    out.push({ output: name, text: source[i].text });
  }
  return out;
}

function hasGap(items: Gap[], name: string): boolean {
  for (let i = 0; i < items.length; i++) {
    if (items[i].output === name) return true;
  }
  return false;
}

function sortedIds(ids: string[]): string[] {
  const copy: string[] = [];
  for (let i = 0; i < ids.length; i++) copy.push(ids[i]);
  for (let i = 0; i < copy.length; i++) {
    for (let j = i + 1; j < copy.length; j++) {
      if (textLess(copy[j], copy[i])) {
        const tmp = copy[i];
        copy[i] = copy[j];
        copy[j] = tmp;
      }
    }
  }
  return copy;
}

function textLess(left: string, right: string): boolean {
  const n = left.length < right.length ? left.length : right.length;
  for (let i = 0; i < n; i++) {
    const lc = left.charCodeAt(i);
    const rc = right.charCodeAt(i);
    if (lc < rc) return true;
    if (lc > rc) return false;
  }
  return left.length < right.length;
}

function joinComma(ids: string[]): string {
  let out = "";
  for (let i = 0; i < ids.length; i++) {
    if (i > 0) out += ",";
    out += ids[i];
  }
  return out;
}

function joinWords(words: string[]): string {
  let out = "";
  for (let i = 0; i < words.length; i++) {
    if (i > 0) out += ", ";
    out += words[i];
  }
  return out;
}

function hasWord(words: string[], word: string): boolean {
  for (let i = 0; i < words.length; i++) {
    if (words[i] === word) return true;
  }
  return false;
}
