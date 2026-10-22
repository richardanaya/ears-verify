/**
 * Lint a spec for contradictions, uncovered outputs, events nobody handles,
 * error conditions with no response, EARS pattern mistakes, words a test
 * cannot pin down, conditions that can never be true, and schema the
 * requirements never use. Contradiction reports name the smallest set, the
 * situation, an example, and a fix that does not pick a winner.
 */

import { describeAssignment, displayCode, isDriver, literalShown, reportBool, requirementMentions, speakBound, termMentions, type Requirement, type Spec, type SymbolDecl, type Term } from "./spec.ts";
import { satisfiable } from "./decide.ts";
import { bestGap, conflictingSets, modelFor, redundantFlags, scanRequirements, spaceSize, type ConflictGroup } from "./solver.ts";
import { Binding, evalAssertion, evalBool, formatScenario, formatTerm, T_FALSE, T_TRUE, T_UNKNOWN } from "./term.ts";
import { displayQuote, englishList, formatInt, pastVoice } from "./text.ts";

interface WordRule {
  word: string;
  kind: string;
}

const WORD_RULES: WordRule[] = [
  { word: "user-friendly", kind: "vague" },
  { word: "appropriate", kind: "vague" },
  { word: "efficient", kind: "vague" },
  { word: "flexible", kind: "vague" },
  { word: "quickly", kind: "vague" },
  { word: "robust", kind: "vague" },
  { word: "large", kind: "vague" },
  { word: "small", kind: "vague" },
  { word: "fast", kind: "vague" },
  { word: "slow", kind: "vague" },
  { word: "easy", kind: "vague" },
  { word: "microservice", kind: "solution" },
  { word: "algorithm", kind: "solution" },
  { word: "database", kind: "solution" },
  { word: "function", kind: "solution" },
  { word: "server", kind: "solution" },
  { word: "class", kind: "solution" },
  { word: "api", kind: "solution" },
];

export interface NameValue {
  name: string;
  value: string;
}

export interface Conflict {
  ids: string[];
  lines: number[];
  sentences: string[];
  minimal: boolean;
  everySituation: boolean;
  situation: NameValue[];
  requires: NameValue[];
  example: NameValue[];
  exampleJson: string;
  keeps: string[];
  breaks: string;
  summary: string;
  clash: string;
  fix: string;
  keepsSentence: string;
}

export interface Gap {
  output: string;
  situation: NameValue[];
  text: string;
}

export interface Misuse {
  id: string;
  line: number;
  symbols: string[];
  sentence: string;
  text: string;
}

export interface Wording {
  line: number;
  word: string;
  kind: string;
  context: string;
  text: string;
}

export interface Redundant {
  id: string;
  line: number;
  sentence: string;
  text: string;
  fix: string;
}

export interface Vacuous {
  id: string;
  line: number;
  sentence: string;
  text: string;
  fix: string;
}

export interface Unused {
  name: string;
  kind: string;
  text: string;
  fix: string;
}

export interface LintReport {
  conflicts: Conflict[];
  gaps: Gap[];
  misuse: Misuse[];
  wording: Wording[];
  redundant: Redundant[];
  vacuous: Vacuous[];
  unused: Unused[];
}

export type LintOutcome = { kind: "report"; report: LintReport } | { kind: "error"; message: string };

export function lintSpec(spec: Spec): LintOutcome {
  if (spaceSize(spec) < 0) {
    return {
      kind: "error",
      message: "a symbol has an empty domain. Declare at least one allowed value.",
    };
  }
  const conflicts: Conflict[] = [];
  const groups = conflictingSets(spec);
  for (let i = 0; i < groups.length; i++) conflicts.push(explainConflict(spec, groups[i]));
  const gaps: Gap[] = [];
  for (let i = 0; i < spec.symbols.length; i++) {
    if (isDriver(spec.symbols[i])) continue;
    const situation = bestGap(spec, i);
    if (situation === null) continue;
    gaps.push(explainGap(spec, i, situation));
  }
  for (let i = 0; i < spec.symbols.length; i++) {
    if (spec.symbols[i].role !== "event") continue;
    if (eventMentioned(spec, i)) continue;
    gaps.push(explainUnhandled(spec, i));
  }
  return {
    kind: "report",
    report: {
      conflicts: conflicts,
      gaps: gaps,
      misuse: findMisuse(spec),
      wording: findWording(spec),
      redundant: findRedundant(spec),
      vacuous: findVacuous(spec),
      unused: findUnused(spec),
    },
  };
}

function findVacuous(spec: Spec): Vacuous[] {
  const found: Vacuous[] = [];
  for (let i = 0; i < spec.requirements.length; i++) {
    const req = spec.requirements[i];
    if (req.antecedent === null) continue;
    if (conditionPossible(spec, req.antecedent)) continue;
    found.push({
      id: req.id,
      line: req.line,
      sentence: req.sentence,
      text: req.id + " can never trigger. Its condition is impossible for every allowed value.",
      fix:
        "Suggested fix: rewrite the condition in " +
        req.id +
        " so a real situation can make it true, or remove the requirement. Do not invent a response.",
    });
  }
  return found;
}

function conditionPossible(spec: Spec, term: Term): boolean {
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

function findUnused(spec: Spec): Unused[] {
  const found: Unused[] = [];
  for (let i = 0; i < spec.symbols.length; i++) {
    const sym = spec.symbols[i];
    if (sym.role === "event") continue;
    const mentioned = symbolMentioned(spec, i);
    if (sym.role === "output") {
      if (!mentioned) continue;
      if (!consequentMentions(spec, i)) {
        const label = symbolLabel(sym);
        found.push({
          name: sym.name,
          kind: "output",
          text: "Nothing sets " + label + ". Requirements mention it, but no response says what it shall be.",
          fix:
            "Suggested fix: add a shall requirement that sets " +
            sym.name +
            ", or declare it as an input if the environment provides it. Do not choose the value.",
        });
      }
      continue;
    }
    if (mentioned) continue;
    const label = symbolLabel(sym);
    found.push({
      name: sym.name,
      kind: sym.role,
      text: label + " is " + article(sym.role) + " " + sym.role + " and no requirement mentions it.",
      fix: "Suggested fix: use " + sym.name + " in a requirement, or remove it from the schema.",
    });
  }
  for (let e = 0; e < spec.enums.length; e++) {
    const decl = spec.enums[e];
    for (let v = 0; v < decl.variants.length; v++) {
      const variant = decl.variants[v];
      if (variantMentioned(spec, decl.name, variant)) continue;
      const name = decl.name + "." + variant;
      found.push({
        name: name,
        kind: "variant",
        text: name + " is never mentioned.",
        fix: "Suggested fix: use " + variant + " in a requirement, or remove it from " + decl.name + ".",
      });
    }
  }
  return found;
}

function article(role: string): string {
  if (role === "input") return "an";
  return "a";
}

function symbolLabel(sym: SymbolDecl): string {
  if (sym.phrase.length > 0) return sym.name + " (" + displayQuote(sym.phrase) + ")";
  return sym.name;
}

function symbolMentioned(spec: Spec, index: number): boolean {
  for (let r = 0; r < spec.requirements.length; r++) {
    if (requirementMentions(spec.requirements[r], index)) return true;
  }
  return false;
}

function consequentMentions(spec: Spec, index: number): boolean {
  for (let r = 0; r < spec.requirements.length; r++) {
    if (termMentions(spec.requirements[r].consequent, index)) return true;
  }
  return false;
}

function variantMentioned(spec: Spec, enumName: string, variant: string): boolean {
  for (let r = 0; r < spec.requirements.length; r++) {
    const req = spec.requirements[r];
    if (req.antecedent !== null && termHasVariant(req.antecedent, enumName, variant)) return true;
    if (termHasVariant(req.consequent, enumName, variant)) return true;
  }
  return false;
}

function termHasVariant(term: Term, enumName: string, variant: string): boolean {
  if (term.kind === "enum") return term.enumName === enumName && term.variant === variant;
  if (term.kind === "not") return termHasVariant(term.term, enumName, variant);
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
    return termHasVariant(term.left, enumName, variant) || termHasVariant(term.right, enumName, variant);
  }
  return false;
}

function findRedundant(spec: Spec): Redundant[] {
  const found: Redundant[] = [];
  const flags = redundantFlags(spec);
  for (let i = 0; i < flags.length; i++) {
    if (!flags[i]) continue;
    const req = spec.requirements[i];
    found.push({
      id: req.id,
      line: req.line,
      sentence: req.sentence,
      text: req.id + " adds nothing. Whenever the other requirements hold, " + req.id + " holds too.",
      fix:
        "Suggested fix: remove " +
        req.id +
        ", or ask whether it was meant to say something the others do not already require. Do not delete it until the PM agrees.",
    });
  }
  return found;
}

function eventMentioned(spec: Spec, index: number): boolean {
  for (let r = 0; r < spec.requirements.length; r++) {
    if (requirementMentions(spec.requirements[r], index)) return true;
  }
  return false;
}

function explainUnhandled(spec: Spec, index: number): Gap {
  const sym = spec.symbols[index];
  const label = sym.phrase.length > 0 ? displayQuote(sym.phrase) : sym.name;
  if (sym.unwanted) {
    return {
      output: sym.name,
      situation: [],
      text:
        "No requirement states a response when " +
        label +
        ". Suggested fix: add an if ... then requirement, and ask what the system shall do. Do not choose the response.",
    };
  }
  return {
    output: sym.name,
    situation: [],
    text:
      "No requirement handles " +
      label +
      ". Suggested fix: add a requirement that says what the system shall do, or remove the event.",
  };
}

function explainConflict(spec: Spec, group: ConflictGroup): Conflict {
  const ids: string[] = [];
  const lines: number[] = [];
  const sentences: string[] = [];
  for (let i = 0; i < group.indexes.length; i++) {
    const req = spec.requirements[group.indexes[i]];
    ids.push(req.id);
    lines.push(req.line);
    sentences.push(req.sentence);
  }
  const scan = scanRequirements(spec, group.indexes);
  const situation = scan.unsat === null ? new Binding(spec.symbols.length) : scan.unsat;
  const everySituation = !scan.sawSat;
  const situationPairs = driverPairs(spec, situation);
  const active = activeRequires(spec, group.indexes, situation);
  const lastPos = group.indexes.length - 1;
  const keptIndexes: number[] = [];
  for (let i = 0; i < lastPos; i++) keptIndexes.push(group.indexes[i]);
  const exampleEnv = modelFor(spec, keptIndexes, situation);
  const examplePairs: NameValue[] = [];
  let exampleJson = "";
  let keeps: string[] = [];
  let keepsSentence = "";
  const breaks = ids[lastPos];
  if (exampleEnv !== null) {
    for (let i = 0; i < spec.symbols.length; i++) {
      examplePairs.push({ name: spec.symbols[i].name, value: displayCode(spec, spec.symbols[i], exampleEnv.code[i]) });
    }
    exampleJson = formatScenario(spec, exampleEnv);
    let faithful = true;
    for (let i = 0; i < keptIndexes.length; i++) {
      const req = spec.requirements[keptIndexes[i]];
      if (evalAssertion(req.antecedent, req.consequent, spec, exampleEnv) !== T_TRUE) faithful = false;
    }
    const broken = spec.requirements[group.indexes[lastPos]];
    if (evalAssertion(broken.antecedent, broken.consequent, spec, exampleEnv) !== T_FALSE) faithful = false;
    if (faithful) {
      for (let i = 0; i < lastPos; i++) keeps.push(ids[i]);
      keepsSentence = keepsText(keeps, breaks);
    }
  }
  const summary = summaryText(ids, group.minimal);
  const clash = clashText(spec, everySituation, situationPairs);
  const fix = fixText(ids, group.minimal);
  return {
    ids: ids,
    lines: lines,
    sentences: sentences,
    minimal: group.minimal,
    everySituation: everySituation,
    situation: situationPairs,
    requires: active,
    example: examplePairs,
    exampleJson: exampleJson,
    keeps: keeps,
    breaks: breaks,
    summary: summary,
    clash: clash,
    fix: fix,
    keepsSentence: keepsSentence,
  };
}

function activeRequires(spec: Spec, indexes: number[], situation: Binding): NameValue[] {
  const chosen: number[] = [];
  let sawTrue = false;
  for (let i = 0; i < indexes.length; i++) {
    const req = spec.requirements[indexes[i]];
    const guard = req.antecedent === null ? T_TRUE : evalBool(req.antecedent, spec, situation);
    if (guard === T_TRUE) {
      if (!sawTrue) {
        chosen.length = 0;
        sawTrue = true;
      }
      chosen.push(indexes[i]);
    } else if (!sawTrue && guard === T_UNKNOWN) {
      chosen.push(indexes[i]);
    }
  }
  if (chosen.length === 0) {
    for (let i = 0; i < indexes.length; i++) chosen.push(indexes[i]);
  }
  const pairs: NameValue[] = [];
  for (let i = 0; i < chosen.length; i++) {
    const req = spec.requirements[chosen[i]];
    pairs.push({ name: req.id, value: obligationValue(spec, req.consequent) });
  }
  return pairs;
}

function obligationValue(spec: Spec, term: Term): string {
  const plain = formatTerm(term);
  const voiced = voiceObligation(spec, term);
  if (voiced !== plain) return "that " + voiced;
  return plain;
}

function voiceObligation(spec: Spec, term: Term): string {
  if (term.kind === "sym") {
    const sym = spec.symbols[term.index];
    if (sym.sort.kind === "bool" && (sym.phrase.length > 0 || sym.outcomeYes.length > 0)) return reportBool(sym, true);
    return formatTerm(term);
  }
  if (term.kind === "not") {
    const inner = term.term;
    if (inner.kind === "sym") {
      const sym = spec.symbols[inner.index];
      if (sym.sort.kind === "bool" && (sym.phrase.length > 0 || sym.outcomeYes.length > 0)) return reportBool(sym, false);
    }
  }
  const spoken = voiceBound(spec, term);
  if (spoken.length > 0) return spoken;
  return pastVoice(formatTerm(term));
}

function voiceBound(spec: Spec, term: Term): string {
  if (
    term.kind !== "eq" &&
    term.kind !== "neq" &&
    term.kind !== "lt" &&
    term.kind !== "le" &&
    term.kind !== "gt" &&
    term.kind !== "ge"
  ) {
    return "";
  }
  if (term.left.kind !== "sym") return "";
  const sym = spec.symbols[term.left.index];
  if (sym.sort.kind === "bool") return "";
  const shown = literalShown(term.right);
  if (shown.length > 0) return speakBound(sym, shown, term.kind, false);
  return speakBound(sym, formatTerm(term.right), term.kind, true);
}

function explainGap(spec: Spec, outputIndex: number, situation: Binding): Gap {
  const sym = spec.symbols[outputIndex];
  const name = sym.name;
  const pairs = driverPairs(spec, situation);
  const voiced = sym.sort.kind === "bool" && (sym.phrase.length > 0 || sym.outcomeYes.length > 0);
  let text = voiced ? "Nothing says whether " + reportBool(sym, true) : "Nothing covers " + (sym.phrase.length > 0 ? sym.phrase : name);
  if (pairs.length === 0) text += ".";
  else text += " when " + pairClause(spec, pairs) + ".";
  text += " Suggested fix: add a requirement for this situation, and ask what the system shall do. Do not choose the response.";
  return { output: name, situation: pairs, text: text };
}

function findMisuse(spec: Spec): Misuse[] {
  const found: Misuse[] = [];
  for (let r = 0; r < spec.requirements.length; r++) {
    const req = spec.requirements[r];
    if (!req.hasWhen || req.hasIf || req.whenTerm === null) continue;
    const names: string[] = [];
    const labels: string[] = [];
    for (let s = 0; s < spec.symbols.length; s++) {
      if (!spec.symbols[s].unwanted) continue;
      if (!mentions(req.whenTerm, s)) continue;
      names.push(spec.symbols[s].name);
      const phrase = spec.symbols[s].phrase;
      labels.push(phrase.length > 0 ? displayQuote(phrase) : spec.symbols[s].name);
    }
    if (names.length === 0) continue;
    const label = labels.length === 1 ? labels[0] + " is an unwanted event" : englishList(labels) + " are unwanted events";
    found.push({
      id: req.id,
      line: req.line,
      symbols: names,
      sentence: req.sentence,
      text: label + ". Write if ... then, not when.",
    });
  }
  return found;
}

function findWording(spec: Spec): Wording[] {
  const found: Wording[] = [];
  for (let i = 0; i < spec.symbols.length; i++) {
    collectWords(spec.symbols[i].description, spec.symbols[i].line, spec.symbols[i].source, found);
  }
  for (let i = 0; i < spec.requirements.length; i++) {
    collectWords(spec.requirements[i].sentence, spec.requirements[i].line, spec.requirements[i].sentence, found);
    collectForm(spec, spec.requirements[i].sentence, spec.requirements[i].line, found);
  }
  return found;
}

function collectForm(spec: Spec, text: string, line: number, found: Wording[]): void {
  const lower = lowerAscii(text);
  if (hasAwkwardShall(lower)) {
    found.push({
      line: line,
      word: "shall",
      kind: "form",
      context: text,
      text:
        '"shall the ... is ..." is awkward. Write the response as a verb phrase, such as "bill at most 2 seats", and bind it with as.',
    });
  }
  if (hasBareWhen(spec, lower)) {
    found.push({
      line: line,
      word: "when",
      kind: "form",
      context: text,
      text: '"When" needs a condition with "is", not a bare verb. "When the subscription is started" is the form.',
    });
  }
  if (hasMisplacedNot(lower)) {
    found.push({
      line: line,
      word: "not",
      kind: "form",
      context: text,
      text: 'Put "not" after "is": "the customer is not cancelling", not "not the customer is cancelling".',
    });
  }
}

function hasAwkwardShall(lower: string): boolean {
  const at = wordIndex(lower, "shall", 0);
  if (at < 0) return false;
  if (wordAt(lower, at + 5) !== "the") return false;
  return wordIndex(lower, "is", at + 5) >= 0;
}

function hasBareWhen(spec: Spec, lower: string): boolean {
  let from = 0;
  while (from < lower.length) {
    const at = wordIndex(lower, "when", from);
    if (at < 0) return false;
    const stop = clauseEnd(lower, at + 4);
    if (clauseHasBareVerb(spec, lower.slice(at + 4, stop))) return true;
    from = stop + 1;
  }
  return false;
}

function clauseHasBareVerb(spec: Spec, clause: string): boolean {
  const parts = splitConjuncts(clause);
  for (let i = 0; i < parts.length; i++) {
    let part = trimSpaces(parts[i]);
    if (startsWithWord(part, "not")) {
      const notAt = wordIndex(part, "not", 0);
      part = trimSpaces(part.slice(notAt + 3));
    }
    if (wordIndex(part, "is", 0) >= 0) continue;
    if (matchesResponsePhrase(spec, part)) return true;
  }
  return false;
}

function matchesResponsePhrase(spec: Spec, text: string): boolean {
  const target = trimSpaces(text);
  if (target.length === 0) return false;
  for (let i = 0; i < spec.symbols.length; i++) {
    const sym = spec.symbols[i];
    if (sym.action.length > 0 && lowerAscii(sym.action) === target) return true;
    if (sym.role === "output" && sym.phrase.length > 0 && wordIndex(lowerAscii(sym.phrase), "is", 0) < 0 && lowerAscii(sym.phrase) === target) {
      return true;
    }
  }
  return false;
}

function splitConjuncts(clause: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let i = 0;
  while (i < clause.length) {
    const atAnd = wordIndex(clause, "and", i);
    const atOr = wordIndex(clause, "or", i);
    let at = -1;
    if (atAnd >= 0 && (atOr < 0 || atAnd <= atOr)) at = atAnd;
    else at = atOr;
    if (at < 0) break;
    parts.push(clause.slice(start, at));
    let j = at;
    while (j < clause.length && isWordChar(clause.charCodeAt(j))) j++;
    start = j;
    i = j;
  }
  parts.push(clause.slice(start));
  return parts;
}

function startsWithWord(text: string, word: string): boolean {
  const at = wordIndex(text, word, 0);
  if (at < 0) return false;
  for (let i = 0; i < at; i++) {
    if (text.charCodeAt(i) !== 32) return false;
  }
  return true;
}

function trimSpaces(text: string): string {
  let start = 0;
  let end = text.length;
  while (start < end && text.charCodeAt(start) === 32) start++;
  while (end > start && text.charCodeAt(end - 1) === 32) end--;
  return text.slice(start, end);
}

function hasMisplacedNot(lower: string): boolean {
  let from = 0;
  while (from < lower.length) {
    const at = wordIndex(lower, "not", from);
    if (at < 0) return false;
    if (previousWord(lower, at) !== "is") {
      const stop = notSpanEnd(lower, at + 3);
      const span = lower.slice(at + 3, stop);
      const isAt = wordIndex(span, "is", 0);
      if (isAt >= 0 && wordAt(span, isAt + 2) !== "not") return true;
    }
    from = at + 3;
  }
  return false;
}

function clauseEnd(text: string, from: number): number {
  for (let i = from; i < text.length; i++) {
    if (text.charCodeAt(i) === 44) return i;
  }
  return text.length;
}

function notSpanEnd(text: string, from: number): number {
  let i = from;
  while (i < text.length) {
    if (text.charCodeAt(i) === 44) return i;
    if (isWordChar(text.charCodeAt(i))) {
      const start = i;
      while (i < text.length && isWordChar(text.charCodeAt(i))) i++;
      const word = text.slice(start, i);
      if (word === "and" || word === "or") return start;
      continue;
    }
    i++;
  }
  return text.length;
}

function wordIndex(text: string, word: string, from: number): number {
  let i = from;
  while (i < text.length) {
    while (i < text.length && !isWordChar(text.charCodeAt(i))) i++;
    if (i >= text.length) return -1;
    const start = i;
    while (i < text.length && isWordChar(text.charCodeAt(i))) i++;
    if (text.slice(start, i) === word) return start;
  }
  return -1;
}

function wordAt(text: string, from: number): string {
  let i = from;
  while (i < text.length && !isWordChar(text.charCodeAt(i))) i++;
  if (i >= text.length) return "";
  const start = i;
  while (i < text.length && isWordChar(text.charCodeAt(i))) i++;
  return text.slice(start, i);
}

function previousWord(text: string, index: number): string {
  let i = index - 1;
  while (i >= 0 && !isWordChar(text.charCodeAt(i))) i--;
  if (i < 0) return "";
  const end = i + 1;
  while (i >= 0 && isWordChar(text.charCodeAt(i))) i--;
  return text.slice(i + 1, end);
}

function collectWords(text: string, line: number, context: string, found: Wording[]): void {
  const lower = lowerAscii(text);
  let i = 0;
  while (i < lower.length) {
    if (!boundaryBefore(lower, i)) {
      i++;
      continue;
    }
    let matched = -1;
    for (let w = 0; w < WORD_RULES.length; w++) {
      const word = WORD_RULES[w].word;
      if (lower.slice(i, i + word.length) !== word) continue;
      if (!boundaryAfter(lower, i + word.length)) continue;
      if (matched < 0 || word.length > WORD_RULES[matched].word.length) matched = w;
    }
    if (matched < 0) {
      i++;
      continue;
    }
    const rule = WORD_RULES[matched];
    const message =
      rule.kind === "vague"
        ? "\"" + rule.word + "\" is too vague to test. Replace it with something a scenario can check."
        : "\"" + rule.word + "\" names a solution. Say what the system must do, not how to build it.";
    found.push({ line: line, word: rule.word, kind: rule.kind, context: context, text: message });
    i += rule.word.length;
  }
}

function mentions(term: import("./spec.ts").Term, index: number): boolean {
  if (term.kind === "sym") return term.index === index;
  if (term.kind === "not") return mentions(term.term, index);
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
    return mentions(term.left, index) || mentions(term.right, index);
  }
  return false;
}

function driverPairs(spec: Spec, env: Binding): NameValue[] {
  const pairs: NameValue[] = [];
  for (let i = 0; i < spec.symbols.length; i++) {
    if (!isDriver(spec.symbols[i]) || !env.known[i]) continue;
    pairs.push({ name: spec.symbols[i].name, value: displayCode(spec, spec.symbols[i], env.code[i]) });
  }
  return pairs;
}

function pairClause(spec: Spec, pairs: NameValue[]): string {
  const parts: string[] = [];
  for (let i = 0; i < pairs.length; i++) parts.push(phrasePair(spec, pairs[i]));
  return englishList(parts);
}

function phrasePair(spec: Spec, pair: NameValue): string {
  for (let i = 0; i < spec.symbols.length; i++) {
    const sym = spec.symbols[i];
    if (sym.name !== pair.name) continue;
    return describeAssignment(sym, pair.value, pair.value === "true");
  }
  return pair.name + " is " + pair.value;
}

function summaryText(ids: string[], minimal: boolean): string {
  if (!minimal) return englishList(ids) + " cannot all hold.";
  if (ids.length === 1) return ids[0] + " cannot hold.";
  if (ids.length === 2) return ids[0] + " and " + ids[1] + " cannot both hold.";
  return englishList(ids) + " cannot all hold.";
}

function clashText(spec: Spec, everySituation: boolean, situation: NameValue[]): string {
  if (everySituation || situation.length === 0) return "They clash in every situation.";
  return "They clash when " + pairClause(spec, situation) + ".";
}

function fixText(ids: string[], minimal: boolean): string {
  if (!minimal) {
    return (
      "Suggested fix: ask which requirements should change. There are more than 12 requirements, so this is not yet the smallest conflicting set."
    );
  }
  if (ids.length === 1) {
    return (
      "Suggested fix: rewrite " +
      ids[0] +
      ". It cannot be satisfied for any allowed values. Ask what should happen instead of choosing a behavior on your own."
    );
  }
  if (ids.length === 2) {
    return (
      "Suggested fix: ask which requirement should win. To keep " +
      ids[0] +
      ", remove " +
      ids[1] +
      ". To keep " +
      ids[1] +
      ", remove " +
      ids[0] +
      "."
    );
  }
  return "Suggested fix: ask which requirement should win. Removing any one of " + englishList(ids) + " leaves the rest consistent.";
}

function keepsText(keeps: string[], breaks: string): string {
  if (keeps.length === 0) return "This scenario breaks " + breaks + ".";
  if (keeps.length === 1) return "This scenario keeps " + keeps[0] + " and breaks " + breaks + ".";
  return "This scenario keeps " + englishList(keeps) + " and breaks " + breaks + ".";
}

export function formatLintText(specPath: string, report: LintReport): string {
  const lines: string[] = [];
  lines.push("spec: " + specPath);
  lines.push("conflicts: " + formatInt(report.conflicts.length));
  lines.push("gaps: " + formatInt(report.gaps.length));
  lines.push("misuse: " + formatInt(report.misuse.length));
  lines.push("wording: " + formatInt(report.wording.length));
  lines.push("redundant: " + formatInt(report.redundant.length));
  lines.push("vacuous: " + formatInt(report.vacuous.length));
  lines.push("unused: " + formatInt(report.unused.length));
  for (let i = 0; i < report.conflicts.length; i++) {
    const conflict = report.conflicts[i];
    lines.push("");
    lines.push("conflict " + brace(conflict.ids));
    lines.push(conflict.summary);
    if (!conflict.minimal) {
      lines.push("There are more than 12 requirements, so this set may be bigger than the smallest clash.");
    }
    for (let r = 0; r < conflict.ids.length; r++) {
      lines.push("");
      lines.push(conflict.ids[r] + " line " + formatInt(conflict.lines[r]));
      lines.push(conflict.sentences[r]);
    }
    lines.push("");
    lines.push(conflict.clash);
    for (let r = 0; r < conflict.requires.length; r++) {
      lines.push(conflict.requires[r].name + " requires " + conflict.requires[r].value + ".");
    }
    if (conflict.exampleJson.length > 0) {
      lines.push("");
      lines.push("Example scenario:");
      lines.push(conflict.exampleJson);
      if (conflict.keepsSentence.length > 0) lines.push(conflict.keepsSentence);
    }
    lines.push("");
    lines.push(conflict.fix);
  }
  for (let i = 0; i < report.gaps.length; i++) {
    lines.push("");
    lines.push("gap " + report.gaps[i].output);
    lines.push(report.gaps[i].text);
  }
  for (let i = 0; i < report.misuse.length; i++) {
    const item = report.misuse[i];
    lines.push("");
    lines.push("misuse " + item.id + " line " + formatInt(item.line));
    lines.push(item.text);
    lines.push(item.sentence);
  }
  for (let i = 0; i < report.wording.length; i++) {
    const item = report.wording[i];
    lines.push("");
    lines.push("wording line " + formatInt(item.line));
    lines.push(item.text);
    lines.push(item.context);
  }
  for (let i = 0; i < report.redundant.length; i++) {
    const item = report.redundant[i];
    lines.push("");
    lines.push("redundant " + item.id + " line " + formatInt(item.line));
    lines.push(item.text);
    lines.push(item.sentence);
    lines.push(item.fix);
  }
  for (let i = 0; i < report.vacuous.length; i++) {
    const item = report.vacuous[i];
    lines.push("");
    lines.push("vacuous " + item.id + " line " + formatInt(item.line));
    lines.push(item.text);
    lines.push(item.sentence);
    lines.push(item.fix);
  }
  for (let i = 0; i < report.unused.length; i++) {
    const item = report.unused[i];
    lines.push("");
    lines.push("unused " + item.name);
    lines.push(item.text);
    lines.push(item.fix);
  }
  return lines.join("\n");
}

export function formatLintJson(specPath: string, report: LintReport): string {
  const conflicts = [];
  for (let i = 0; i < report.conflicts.length; i++) {
    const item = report.conflicts[i];
    const requirements = [];
    for (let r = 0; r < item.ids.length; r++) {
      requirements.push({ id: item.ids[r], line: item.lines[r], sentence: item.sentences[r] });
    }
    const requires = [];
    for (let r = 0; r < item.requires.length; r++) {
      requires.push({ id: item.requires[r].name, text: item.requires[r].value });
    }
    conflicts.push({
      ids: item.ids,
      minimal: item.minimal,
      everySituation: item.everySituation,
      summary: item.summary,
      clash: item.clash,
      requirements: requirements,
      situation: item.situation,
      requires: requires,
      example: item.example,
      keeps: item.keeps,
      breaks: item.breaks,
      fix: item.fix,
    });
  }
  const gaps = [];
  for (let i = 0; i < report.gaps.length; i++) {
    gaps.push({ output: report.gaps[i].output, situation: report.gaps[i].situation, text: report.gaps[i].text });
  }
  const misuse = [];
  for (let i = 0; i < report.misuse.length; i++) {
    const item = report.misuse[i];
    misuse.push({ id: item.id, line: item.line, symbols: item.symbols, sentence: item.sentence, text: item.text });
  }
  const wording = [];
  for (let i = 0; i < report.wording.length; i++) {
    const item = report.wording[i];
    wording.push({ line: item.line, word: item.word, kind: item.kind, text: item.text, context: item.context });
  }
  const redundant = [];
  for (let i = 0; i < report.redundant.length; i++) {
    const item = report.redundant[i];
    redundant.push({ id: item.id, line: item.line, sentence: item.sentence, text: item.text, fix: item.fix });
  }
  const vacuous = [];
  for (let i = 0; i < report.vacuous.length; i++) {
    const item = report.vacuous[i];
    vacuous.push({ id: item.id, line: item.line, sentence: item.sentence, text: item.text, fix: item.fix });
  }
  const unused = [];
  for (let i = 0; i < report.unused.length; i++) {
    const item = report.unused[i];
    unused.push({ name: item.name, kind: item.kind, text: item.text, fix: item.fix });
  }
  const ok =
    conflicts.length === 0 &&
    gaps.length === 0 &&
    misuse.length === 0 &&
    wording.length === 0 &&
    redundant.length === 0 &&
    vacuous.length === 0 &&
    unused.length === 0;
  return JSON.stringify(
    {
      ok: ok,
      spec: specPath,
      conflicts: conflicts,
      gaps: gaps,
      misuse: misuse,
      wording: wording,
      redundant: redundant,
      vacuous: vacuous,
      unused: unused,
    },
    null,
    2,
  );
}

function brace(ids: string[]): string {
  let out = "{";
  for (let i = 0; i < ids.length; i++) {
    if (i > 0) out += ", ";
    out += ids[i];
  }
  return out + "}";
}

function boundaryBefore(text: string, index: number): boolean {
  if (index === 0) return true;
  return !isWordChar(text.charCodeAt(index - 1));
}

function boundaryAfter(text: string, index: number): boolean {
  if (index >= text.length) return true;
  return !isWordChar(text.charCodeAt(index));
}

function isWordChar(code: number): boolean {
  return (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || code === 95;
}

function lowerAscii(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 65 && code <= 90) out += String.fromCharCode(code + 32);
    else out += text.slice(i, i + 1);
  }
  return out;
}
