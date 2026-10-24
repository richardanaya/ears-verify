/**
 * Diff two EARS specs for a product manager.
 * Requirements match by id, then by identical text. Behavior is one scenario
 * each way, the least assignment: false before true. A formula that already
 * has to hold is already satisfied, so the search ignores it. Those scenarios
 * are the JSON files `check --input` reads. A shared Int range or enum variant
 * list is the overlap. A name whose types, ranges, or variants do not meet is
 * left out, and the rest of the spec is compared.
 */

import { evaluateRequirements, type Violation } from "./check.ts";
import { lintSpec, type Conflict, type Gap } from "./lint.ts";
import { findEnum, findSymbol, displayCode, type EnumDecl, type Requirement, type Sort, type Spec, type SymbolDecl, type Term } from "./spec.ts";
import { firstMatching } from "./solver.ts";
import { formatScenario, termsEqual, type Binding } from "./term.ts";
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
  sameMeaning: boolean;
}

export interface RenamedLine {
  oldId: string;
  oldLine: number;
  newId: string;
  newLine: number;
  sentence: string;
}

export interface WitnessSide {
  id: string;
  line: number;
  present: boolean;
  sentence: string;
  holds: boolean;
  because: string;
}

export interface DiffFile {
  file: string;
  body: string;
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
  renamed: RenamedLine[];
  reworded: RewordLine[];
  onlyOld: string[];
  onlyNew: string[];
  changed: SchemaNote[];
  skipped: SchemaNote[];
  oldAcceptsNewRejectsFound: boolean;
  oldAcceptsNewRejectsText: string;
  oldAcceptsNewRejects: AssignmentRow[];
  oldAcceptsBreaks: Violation[];
  oldAcceptsOldSides: WitnessSide[];
  newAcceptsOldRejectsFound: boolean;
  newAcceptsOldRejectsText: string;
  newAcceptsOldRejects: AssignmentRow[];
  newAcceptsBreaks: Violation[];
  newAcceptsNewSides: WitnessSide[];
  files: DiffFile[];
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
  skipped: SchemaNote[];
}

type Fail = { kind: "error"; message: string };
type AlignOutcome = { kind: "ok"; aligned: Aligned } | Fail;
type SortDecision = { kind: "ok"; sort: Sort; note: string } | { kind: "skip"; note: string } | Fail;
type RemapOutcome = { kind: "ok"; term: Term } | Fail;
type ReqOutcome = { kind: "ok"; req: Requirement } | Fail;
type ReqsOutcome = { kind: "ok"; reqs: Requirement[]; skipped: SchemaNote[] } | Fail;

interface MatchPair {
  oldReq: Requirement;
  newReq: Requirement;
  byText: boolean;
}

const SAME = "No scenario changes acceptance.";

export function diffMeaningChanged(report: DiffReport): boolean {
  return report.oldAcceptsNewRejectsFound || report.newAcceptsOldRejectsFound || report.skipped.length > 0;
}

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
  const matched = pairRequirements(oldSpec, newSpec);
  const reworded = rewordedFrom(shared, matched.pairs, oldReqs.reqs, newReqs.reqs);
  const oldAccepts = acceptanceWitness(shared, oldReqs.reqs, newReqs.reqs);
  const newAccepts = acceptanceWitness(shared, newReqs.reqs, oldReqs.reqs);
  const oldBreaks = oldAccepts === null ? [] : evaluateRequirements(voiced, newReqs.reqs, oldAccepts);
  const newBreaks = newAccepts === null ? [] : evaluateRequirements(shared, oldReqs.reqs, newAccepts);
  const changedAcceptance = oldAccepts !== null || newAccepts !== null;
  const skipped = mergeNotes(aligned.aligned.skipped, oldReqs.skipped, newReqs.skipped);
  const files: DiffFile[] = [];
  if (oldAccepts !== null) {
    files.push({ file: "old-accepts-new-rejects.json", body: formatScenario(shared, oldAccepts) + "\n" });
  }
  if (newAccepts !== null) {
    files.push({ file: "new-accepts-old-rejects.json", body: formatScenario(shared, newAccepts) + "\n" });
  }

  const report: DiffReport = {
    added: linesOf(matched.added),
    removed: linesOf(matched.removed),
    renamed: renamedFrom(matched.pairs),
    reworded: reworded,
    onlyOld: aligned.aligned.onlyOld,
    onlyNew: aligned.aligned.onlyNew,
    changed: aligned.aligned.changed,
    skipped: skipped,
    oldAcceptsNewRejectsFound: oldAccepts !== null,
    oldAcceptsNewRejectsText: oldAccepts === null ? "" : formatScenario(shared, oldAccepts),
    oldAcceptsNewRejects: rowsOf(shared, oldAccepts),
    oldAcceptsBreaks: oldBreaks,
    oldAcceptsOldSides: oldAccepts === null ? [] : counterpartSides(oldBreaks, matched.pairs, true, oldReqs.reqs, shared, oldAccepts),
    newAcceptsOldRejectsFound: newAccepts !== null,
    newAcceptsOldRejectsText: newAccepts === null ? "" : formatScenario(shared, newAccepts),
    newAcceptsOldRejects: rowsOf(shared, newAccepts),
    newAcceptsBreaks: newBreaks,
    newAcceptsNewSides: newAccepts === null ? [] : counterpartSides(newBreaks, matched.pairs, false, newReqs.reqs, voiced, newAccepts),
    files: files,
    note: changedAcceptance ? "" : SAME,
    conflictsFixed: conflictDelta(lintOld.report.conflicts, lintNew.report.conflicts),
    conflictsNew: conflictDelta(lintNew.report.conflicts, lintOld.report.conflicts),
    gapsFixed: gapDelta(lintOld.report.gaps, lintNew.report.gaps),
    gapsNew: gapDelta(lintNew.report.gaps, lintOld.report.gaps),
  };
  return { kind: "report", report: report };
}

export function formatDiffText(oldPath: string, newPath: string, report: DiffReport, outDir: string): string {
  const lines: string[] = [];
  lines.push("old: " + oldPath);
  lines.push("new: " + newPath);
  if (outDir.length > 0) lines.push("out: " + outDir);
  lines.push("schema:");
  pushSchema(lines, report);
  lines.push("added:");
  pushReqs(lines, report.added);
  lines.push("removed:");
  pushReqs(lines, report.removed);
  lines.push("renamed:");
  pushRenamed(lines, report.renamed);
  lines.push("reworded:");
  pushReworded(lines, report.reworded);
  lines.push("behavior:");
  pushBehavior(lines, report, outDir);
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

export function formatDiffJson(oldPath: string, newPath: string, report: DiffReport, outDir: string): string {
  const fileRows: { file: string; kind: string }[] = [];
  for (let i = 0; i < report.files.length; i++) {
    const file = report.files[i];
    const kind = file.file.length > 5 ? file.file.slice(0, file.file.length - 5) : file.file;
    fileRows.push({ file: file.file, kind: kind });
  }
  return JSON.stringify(
    {
      ok: !diffMeaningChanged(report),
      old: oldPath,
      new: newPath,
      out: outDir,
      schema: {
        onlyOld: report.onlyOld,
        onlyNew: report.onlyNew,
        changed: report.changed,
        skipped: report.skipped,
      },
      added: report.added,
      removed: report.removed,
      renamed: report.renamed,
      reworded: report.reworded,
      files: fileRows,
      oldAcceptsNewRejectsFound: report.oldAcceptsNewRejectsFound,
      oldAcceptsNewRejects: report.oldAcceptsNewRejects,
      oldAcceptsBreaks: breakRows(report.oldAcceptsBreaks),
      oldAcceptsOldSides: report.oldAcceptsOldSides,
      newAcceptsOldRejectsFound: report.newAcceptsOldRejectsFound,
      newAcceptsOldRejects: report.newAcceptsOldRejects,
      newAcceptsBreaks: breakRows(report.newAcceptsBreaks),
      newAcceptsNewSides: report.newAcceptsNewSides,
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

function pushRenamed(lines: string[], items: RenamedLine[]): void {
  if (items.length === 0) {
    lines.push("none");
    return;
  }
  for (let i = 0; i < items.length; i++) {
    if (i > 0) lines.push("");
    const item = items[i];
    lines.push(item.oldId + " line " + formatInt(item.oldLine) + " is " + item.newId + " line " + formatInt(item.newLine));
    lines.push(item.sentence);
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
    if (item.sameMeaning) lines.push("reworded, same meaning");
  }
}

function pushSchema(lines: string[], report: DiffReport): void {
  if (report.onlyOld.length === 0 && report.onlyNew.length === 0 && report.changed.length === 0 && report.skipped.length === 0) {
    lines.push("none");
    return;
  }
  if (report.onlyOld.length > 0) lines.push("only in the old spec: " + joinWords(report.onlyOld));
  if (report.onlyNew.length > 0) lines.push("only in the new spec: " + joinWords(report.onlyNew));
  for (let i = 0; i < report.changed.length; i++) lines.push(report.changed[i].text);
  for (let i = 0; i < report.skipped.length; i++) lines.push(report.skipped[i].text);
}

function pushBehavior(lines: string[], report: DiffReport, outDir: string): void {
  if (!report.oldAcceptsNewRejectsFound && !report.newAcceptsOldRejectsFound) {
    lines.push(report.note);
    return;
  }
  if (report.oldAcceptsNewRejectsFound) {
    lines.push("The old spec accepts this scenario and the new spec rejects it.");
    if (outDir.length > 0) lines.push("old-accepts-new-rejects.json");
    lines.push(report.oldAcceptsNewRejectsText);
    lines.push("old:");
    pushSides(lines, report.oldAcceptsOldSides, "old");
    lines.push("new:");
    pushBreaks(lines, report.oldAcceptsBreaks);
  } else {
    lines.push("No scenario is accepted by the old spec and rejected by the new spec.");
  }
  lines.push("");
  if (report.newAcceptsOldRejectsFound) {
    lines.push("The new spec accepts this scenario and the old spec rejects it.");
    if (outDir.length > 0) lines.push("new-accepts-old-rejects.json");
    lines.push(report.newAcceptsOldRejectsText);
    lines.push("old:");
    pushBreaks(lines, report.newAcceptsBreaks);
    lines.push("new:");
    pushSides(lines, report.newAcceptsNewSides, "new");
  } else {
    lines.push("No scenario is accepted by the new spec and rejected by the old spec.");
  }
}

function pushSides(lines: string[], items: WitnessSide[], which: string): void {
  if (items.length === 0) {
    lines.push("none");
    return;
  }
  for (let i = 0; i < items.length; i++) {
    if (i > 0) lines.push("");
    const item = items[i];
    if (!item.present) {
      lines.push(item.id + " is not in the " + which + " spec.");
      continue;
    }
    lines.push(item.id + " line " + formatInt(item.line));
    lines.push(item.sentence);
    if (item.holds) lines.push("The requirement holds.");
    else if (item.because.length > 0) lines.push(item.because);
  }
}

function pushBreaks(lines: string[], items: Violation[]): void {
  if (items.length === 0) {
    lines.push("none");
    return;
  }
  for (let i = 0; i < items.length; i++) {
    if (i > 0) lines.push("");
    const item = items[i];
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

function linesOf(reqs: Requirement[]): ReqLine[] {
  const out: ReqLine[] = [];
  for (let i = 0; i < reqs.length; i++) out.push(lineOf(reqs[i]));
  return out;
}

function pairRequirements(oldSpec: Spec, newSpec: Spec): { pairs: MatchPair[]; added: Requirement[]; removed: Requirement[] } {
  const usedNew: boolean[] = [];
  for (let i = 0; i < newSpec.requirements.length; i++) usedNew.push(false);
  const usedOld: boolean[] = [];
  for (let i = 0; i < oldSpec.requirements.length; i++) usedOld.push(false);
  const pairs: MatchPair[] = [];
  for (let i = 0; i < oldSpec.requirements.length; i++) {
    const req = oldSpec.requirements[i];
    const at = findReqIndex(newSpec, req.id);
    if (at < 0 || usedNew[at]) continue;
    usedNew[at] = true;
    usedOld[i] = true;
    pairs.push({ oldReq: req, newReq: newSpec.requirements[at], byText: false });
  }
  for (let i = 0; i < oldSpec.requirements.length; i++) {
    if (usedOld[i]) continue;
    const req = oldSpec.requirements[i];
    let at = -1;
    for (let j = 0; j < newSpec.requirements.length; j++) {
      if (usedNew[j]) continue;
      if (newSpec.requirements[j].sentence !== req.sentence) continue;
      at = j;
      break;
    }
    if (at < 0) continue;
    usedNew[at] = true;
    usedOld[i] = true;
    pairs.push({ oldReq: req, newReq: newSpec.requirements[at], byText: true });
  }
  const removed: Requirement[] = [];
  for (let i = 0; i < oldSpec.requirements.length; i++) {
    if (!usedOld[i]) removed.push(oldSpec.requirements[i]);
  }
  const added: Requirement[] = [];
  for (let j = 0; j < newSpec.requirements.length; j++) {
    if (!usedNew[j]) added.push(newSpec.requirements[j]);
  }
  return { pairs: pairs, added: added, removed: removed };
}

function renamedFrom(pairs: MatchPair[]): RenamedLine[] {
  const out: RenamedLine[] = [];
  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i];
    if (!pair.byText) continue;
    out.push({
      oldId: pair.oldReq.id,
      oldLine: pair.oldReq.line,
      newId: pair.newReq.id,
      newLine: pair.newReq.line,
      sentence: pair.oldReq.sentence,
    });
  }
  return out;
}

function rewordedFrom(shared: Spec, pairs: MatchPair[], oldReqs: Requirement[], newReqs: Requirement[]): RewordLine[] {
  const out: RewordLine[] = [];
  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i];
    if (pair.oldReq.sentence === pair.newReq.sentence) continue;
    const oldMapped = findReqIn(oldReqs, pair.oldReq.id);
    const newMapped = findReqIn(newReqs, pair.newReq.id);
    const same = oldMapped !== null && newMapped !== null && formulasMatch(shared, oldMapped, newMapped);
    out.push({
      id: pair.oldReq.id,
      oldLine: pair.oldReq.line,
      oldSentence: pair.oldReq.sentence,
      newLine: pair.newReq.line,
      newSentence: pair.newReq.sentence,
      sameMeaning: same,
    });
  }
  return out;
}

function acceptanceWitness(shared: Spec, holds: Requirement[], fails: Requirement[]): Binding | null {
  const pending: Requirement[] = [];
  for (let i = 0; i < fails.length; i++) {
    if (!formulaCopied(holds, fails[i])) pending.push(fails[i]);
  }
  if (pending.length === 0) return null;
  return firstMatching(shared, holds, pending, null, 0);
}

function formulaCopied(holds: Requirement[], fail: Requirement): boolean {
  for (let i = 0; i < holds.length; i++) {
    if (sameFormula(holds[i], fail)) return true;
  }
  return false;
}

function sameFormula(left: Requirement, right: Requirement): boolean {
  if (!termsSame(left.antecedent, right.antecedent)) return false;
  return termsEqual(left.consequent, right.consequent);
}

function termsSame(left: Term | null, right: Term | null): boolean {
  if (left === null || right === null) return left === null && right === null;
  return termsEqual(left, right);
}

function formulasMatch(shared: Spec, left: Requirement, right: Requirement): boolean {
  const leftHolds: Requirement[] = [];
  leftHolds.push(left);
  const rightHolds: Requirement[] = [];
  rightHolds.push(right);
  const rightFails: Requirement[] = [];
  rightFails.push(right);
  const leftFails: Requirement[] = [];
  leftFails.push(left);
  if (firstMatching(shared, leftHolds, rightFails, null, 0) !== null) return false;
  return firstMatching(shared, rightHolds, leftFails, null, 0) === null;
}

function counterpartSides(
  breaks: Violation[],
  pairs: MatchPair[],
  breakIsNew: boolean,
  accepting: Requirement[],
  narrateSpec: Spec,
  env: Binding,
): WitnessSide[] {
  const sides: WitnessSide[] = [];
  for (let i = 0; i < breaks.length; i++) {
    const item = breaks[i];
    const other = findCounterpart(pairs, item.id, breakIsNew);
    if (other === null) {
      sides.push({ id: item.id, line: 0, present: false, sentence: "", holds: false, because: "" });
      continue;
    }
    const mapped = findReqIn(accepting, other.id);
    if (mapped === null) {
      sides.push({
        id: other.id,
        line: other.line,
        present: true,
        sentence: other.sentence,
        holds: false,
        because: "Left out of the comparison.",
      });
      continue;
    }
    const one: Requirement[] = [];
    one.push(mapped);
    const found = evaluateRequirements(narrateSpec, one, env);
    sides.push({
      id: other.id,
      line: other.line,
      present: true,
      sentence: other.sentence,
      holds: found.length === 0,
      because: found.length === 0 ? "" : found[0].because,
    });
  }
  return sides;
}

function findCounterpart(pairs: MatchPair[], id: string, breakIsNew: boolean): Requirement | null {
  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i];
    if (breakIsNew && pair.newReq.id === id) return pair.oldReq;
    if (!breakIsNew && pair.oldReq.id === id) return pair.newReq;
  }
  return null;
}

function findReqIn(reqs: Requirement[], id: string): Requirement | null {
  for (let i = 0; i < reqs.length; i++) {
    if (reqs[i].id === id) return reqs[i];
  }
  return null;
}

function findReqIndex(spec: Spec, id: string): number {
  for (let i = 0; i < spec.requirements.length; i++) {
    if (spec.requirements[i].id === id) return i;
  }
  return -1;
}

function mergeNotes(first: SchemaNote[], second: SchemaNote[], third: SchemaNote[]): SchemaNote[] {
  const out: SchemaNote[] = [];
  copyNotes(out, first);
  copyNotes(out, second);
  copyNotes(out, third);
  return out;
}

function copyNotes(out: SchemaNote[], notes: SchemaNote[]): void {
  for (let i = 0; i < notes.length; i++) out.push(notes[i]);
}

function lineOf(req: Requirement): ReqLine {
  return { id: req.id, line: req.line, sentence: req.sentence };
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
  const skipped: SchemaNote[] = [];
  for (let s = 0; s < sharedOld.length; s++) {
    const oi = sharedOld[s];
    const name = oldSpec.symbols[oi].name;
    const ni = findSymbol(newSpec, name);
    const decided = decideSort(oldPath, oldSpec, newPath, newSpec, oi, ni, enums);
    if (decided.kind === "error") return decided;
    if (decided.kind === "skip") {
      skipped.push({ name: name, text: decided.note });
      continue;
    }
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
      skipped: skipped,
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
  if (left.kind !== right.kind) return skipType(name, left, oldPath, right, newPath);
  if (left.kind === "bool") return { kind: "ok", sort: { kind: "bool" }, note: "" };
  if (left.kind === "int") {
    if (right.kind !== "int") return skipType(name, left, oldPath, right, newPath);
    const lo = left.min > right.min ? left.min : right.min;
    const hi = left.max < right.max ? left.max : right.max;
    if (lo > hi) {
      return {
        kind: "skip",
        note:
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
          ". Left out of the comparison.",
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
  if (right.kind !== "enum") return skipType(name, left, oldPath, right, newPath);
  if (left.enumName !== right.enumName) return skipType(name, left, oldPath, right, newPath);
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
      kind: "skip",
      note:
        name +
        " variants do not overlap: " +
        englishList(oldEnum.variants) +
        " in " +
        oldPath +
        " and " +
        englishList(newEnum.variants) +
        " in " +
        newPath +
        ". Left out of the comparison.",
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

function skipType(name: string, left: Sort, oldPath: string, right: Sort, newPath: string): SortDecision {
  return {
    kind: "skip",
    note:
      name +
      " is " +
      sortLabel(left) +
      " in " +
      oldPath +
      " and " +
      sortLabel(right) +
      " in " +
      newPath +
      ". Left out of the comparison.",
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
  const skipped: SchemaNote[] = [];
  for (let i = 0; i < spec.requirements.length; i++) {
    const req = spec.requirements[i];
    if (hasWord(excluded, req.id)) continue;
    const mapped = remapReq(path, req, map, shared);
    if (mapped.kind === "error") {
      skipped.push({ name: req.id, text: mapped.message + " Left out of the comparison." });
      continue;
    }
    reqs.push(mapped.req);
  }
  return { kind: "ok", reqs: reqs, skipped: skipped };
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
