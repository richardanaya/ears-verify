/**
 * Parser, scenario check, SMT printer, and lint behavior.
 * The native build of this file must print the same bytes as Node.
 */

import { readFileSync } from "node:fs";
import { bindScenario, evaluate } from "../src/check.ts";
import { parseProperty, parseSpec } from "../src/ears.ts";
import { analyzePolicy } from "../src/policy.ts";
import { parseScenarioJson } from "../src/jsonvalue.ts";
import { lintSpec } from "../src/lint.ts";
import { buildProblems } from "../src/report.ts";
import type { Requirement, Spec } from "../src/spec.ts";
import { formatGeneratedJson, generateScenarios, type GeneratedScenarios } from "../src/gentest.ts";
import { listScenarios } from "../src/scenarios.ts";
import { printSmt } from "../src/smt.ts";
import { spaceSize } from "../src/solver.ts";
import { evalBool, formatTerm, T_FALSE, T_TRUE } from "../src/term.ts";
import { runSoundness } from "./soundness.ts";

let passed = 0;
let failed = 0;

function applySentence(spec: Spec, id: string, sentence: string): Spec | null {
  const parsed = parseProperty(id + " " + sentence, spec);
  if (!parsed.ok || parsed.requirements.length !== 1) return null;
  const requirements: Requirement[] = [];
  for (let i = 0; i < spec.requirements.length; i++) {
    if (spec.requirements[i].id === id) requirements.push(parsed.requirements[0]);
    else requirements.push(spec.requirements[i]);
  }
  return { enums: spec.enums, symbols: spec.symbols, requirements: requirements };
}

function hasArg(flag: string): boolean {
  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i] === flag) return true;
  }
  return false;
}

if (hasArg("--soundness-only")) {
  const started = Date.now();
  const specs = runSoundness();
  console.log("soundness specs: " + String(specs));
  console.log("soundness ms: " + String(Date.now() - started));
  process.exit(0);
}

function check(name: string, cond: boolean): void {
  if (cond) {
    passed++;
    return;
  }
  failed++;
  console.error("FAIL " + name);
}

function mustSpec(text: string): Spec {
  const parsed = parseSpec(text);
  if (!parsed.ok) {
    console.error("FAIL parse line " + String(parsed.line) + ": " + parsed.message);
    process.exit(1);
  }
  return parsed.spec;
}

function parseMessage(text: string): string {
  const parsed = parseSpec(text);
  if (parsed.ok) return "";
  return String(parsed.line) + ": " + parsed.message;
}

function idsOf(spec: Spec): string[] {
  const outcome = lintSpec(spec);
  if (outcome.kind === "error") return [];
  if (outcome.report.conflicts.length === 0) return [];
  return outcome.report.conflicts[0].ids;
}

function scenario(spec: Spec, text: string): { violations: number; because: string } {
  const json = parseScenarioJson(text);
  if (!json.ok) return { violations: -1, because: json.message };
  const bound = bindScenario(spec, json.object);
  if (!bound.ok) return { violations: -1, because: bound.message };
  const violations = evaluate(spec, bound.env);
  if (violations.length === 0) return { violations: 0, because: "" };
  return { violations: violations.length, because: violations[0].because };
}

const orderText = readFileSync("examples/order.ears.md", "utf8");
const order = mustSpec(orderText);
check("order has R1", order.requirements.length === 1 && order.requirements[0].id === "R1");
check("order R1 line", order.requirements[0].line === 7);
check("order symbols", order.symbols.length === 3);
check("order phrase", order.symbols[0].phrase === "an order is submitted" && order.symbols[2].phrase === "fulfill the order");

const failScenario = scenario(
  order,
  '{ "order_submitted": true, "inventory_available": true, "order_fulfilled": false }',
);
check("fail count", failScenario.violations === 1);
check(
  "fail because",
  failScenario.because === "An order was submitted and inventory was available, but the order was not fulfilled.",
);

const passScenario = scenario(
  order,
  '{ "order_submitted": true, "inventory_available": true, "order_fulfilled": true }',
);
check("pass count", passScenario.violations === 0);

const quietScenario = scenario(
  order,
  '{ "order_submitted": false, "inventory_available": true, "order_fulfilled": false }',
);
check("antecedent false passes", quietScenario.violations === 0);

const missing = scenario(order, '{ "order_submitted": true, "order_fulfilled": false }');
check("missing symbol", missing.because === "missing inventory_available");

const extra = scenario(
  order,
  '{ "order_submitted": true, "inventory_available": true, "order_fulfilled": true, "extra": false }',
);
check("extra symbol", extra.because === "unexpected extra");

const wrongType = scenario(
  order,
  '{ "order_submitted": true, "inventory_available": true, "order_fulfilled": 1 }',
);
check("wrong type", wrongType.because === "order_fulfilled must be true or false");

const smt = printSmt("examples/order.ears.md", order);
check("smt logic", smt.indexOf("(set-logic ALL)") !== -1);
check("smt named", smt.indexOf(":named R1_L7") !== -1);
check(
  "smt sentence",
  smt.indexOf(
    "line 7: WHEN an order is submitted AND inventory is available, THE Order System SHALL fulfill the order.",
  ) !== -1,
);
check("smt phrase", smt.indexOf('phrase "fulfill the order"') !== -1);
check(
  "smt outcome",
  smt.indexOf('outcome "the order was fulfilled" / "the order was not fulfilled"') !== -1,
);
check("smt implication", smt.indexOf("(=> (and order_submitted inventory_available) order_fulfilled)") !== -1);

const conflict = mustSpec(readFileSync("examples/order-conflict.ears.md", "utf8"));
const conflictLint = lintSpec(conflict);
check("conflict ran", conflictLint.kind === "report");
if (conflictLint.kind === "report") {
  check("one conflict", conflictLint.report.conflicts.length === 1);
  check("no gap beside conflict", conflictLint.report.gaps.length === 0);
  const item = conflictLint.report.conflicts[0];
  check("conflict ids", item.ids.length === 2 && item.ids[0] === "R2" && item.ids[1] === "R3");
  check("not every situation", item.everySituation === false);
  check("situation submitted", item.situation.length === 1 && item.situation[0].name === "order_submitted" && item.situation[0].value === "true");
  check("example fulfilled", item.example.length === 2 && item.example[1].value === "true");
  check("keeps R2", item.keeps.length === 1 && item.keeps[0] === "R2" && item.breaks === "R3");
  check("clash voice", item.clash === "They clash when an order was submitted.");
  check(
    "requires voice",
    item.requires.length === 2 &&
      item.requires[0].value === "that the order was fulfilled" &&
      item.requires[1].value === "that the order was not fulfilled",
  );
  check("asks who wins", item.fix.indexOf("ask which requirement should win") !== -1);
  check("offers both keeps", item.fix.indexOf("To keep R2, remove R3.") !== -1 && item.fix.indexOf("To keep R3, remove R2.") !== -1);
  const again = lintSpec(conflict);
  check("deterministic", again.kind === "report" && again.report.conflicts[0].exampleJson === item.exampleJson);
}

const gapLint = lintSpec(order);
check("gap ran", gapLint.kind === "report");
if (gapLint.kind === "report") {
  check("order has a gap", gapLint.report.gaps.length === 1 && gapLint.report.conflicts.length === 0);
  const gap = gapLint.report.gaps[0];
  check("gap output", gap.output === "order_fulfilled");
  check(
    "gap text",
    gap.text ===
      "Nothing says whether the order was fulfilled when an order was submitted and inventory was not available. Suggested fix: add a requirement for this situation, and ask what the system shall do. Do not choose the response.",
  );
  check(
    "gap situation",
    gap.situation.length === 2 &&
      gap.situation[0].name === "order_submitted" &&
      gap.situation[0].value === "true" &&
      gap.situation[1].name === "inventory_available" &&
      gap.situation[1].value === "false",
  );
}

const covered = lintSpec(mustSpec(readFileSync("examples/order-covered.ears.md", "utf8")));
check(
  "covered is clean",
  covered.kind === "report" &&
    covered.report.conflicts.length === 0 &&
    covered.report.gaps.length === 0 &&
    covered.report.misuse.length === 0 &&
    covered.report.wording.length === 0 &&
    covered.report.redundant.length === 0,
);

const misuse = lintSpec(mustSpec(readFileSync("examples/order-misuse.ears.md", "utf8")));
check(
  "misuse when",
  misuse.kind === "report" &&
    misuse.report.misuse.length === 1 &&
    misuse.report.misuse[0].id === "R4" &&
    misuse.report.misuse[0].symbols.length === 1 &&
    misuse.report.misuse[0].symbols[0] === "payment_declined" &&
    misuse.report.misuse[0].text === '"payment fails" is an unwanted event. Write if ... then, not when.' &&
    misuse.report.conflicts.length === 0,
);
const bareMisuse = lintSpec(
  mustSpec('unwanted event payment_declined: Bool "Declined."\noutput order_rejected: Bool "Rejected."\n\nR4 When payment_declined, the Order System shall order_rejected.\n'),
);
check(
  "misuse without a phrase",
  bareMisuse.kind === "report" &&
    bareMisuse.report.misuse.length === 1 &&
    bareMisuse.report.misuse[0].text === "payment_declined is an unwanted event. Write if ... then, not when.",
);

const payment = lintSpec(mustSpec(readFileSync("examples/payment-if.ears.md", "utf8")));
check(
  "if then is clean",
  payment.kind === "report" && payment.report.misuse.length === 0 && payment.report.conflicts.length === 0 && payment.report.gaps.length === 0,
);

const wording = lintSpec(mustSpec(readFileSync("examples/order-wording.ears.md", "utf8")));
check("wording ran", wording.kind === "report");
if (wording.kind === "report") {
  check("two wording hits", wording.report.wording.length === 2);
  check("vague quickly", wording.report.wording[0].word === "quickly" && wording.report.wording[0].kind === "vague");
  check("solution database", wording.report.wording[1].word === "database" && wording.report.wording[1].kind === "solution");
  check("wording is not a warning", wording.report.warnings.length === 0);
}

const shouldLint = lintSpec(
  mustSpec('event flag: Bool "Flag." phrase "a flag is set"\noutput done: Bool "Done." phrase "fulfill the order"\n\nR1 When a flag is set, the Order System should fulfill the order.\nR2 When a flag is not set, the Order System shall not fulfill the order.\n'),
);
check(
  "should warns",
  shouldLint.kind === "report" &&
    shouldLint.report.warnings.length === 1 &&
    shouldLint.report.warnings[0].kind === "modal" &&
    shouldLint.report.warnings[0].word === "should" &&
    shouldLint.report.warnings[0].id === "R1" &&
    shouldLint.report.gaps.length === 0 &&
    shouldLint.report.wording.length === 0,
);

const tryLint = lintSpec(
  mustSpec('event flag: Bool "Flag." phrase "a flag is set"\noutput done: Bool "Done." phrase "fulfill the order"\n\nR1 When a flag is set, the Order System will try fulfill the order.\nR2 When a flag is not set, the Order System shall not fulfill the order.\n'),
);
check(
  "will try warns",
  tryLint.kind === "report" && tryLint.report.warnings.length === 1 && tryLint.report.warnings[0].word === "will try" && tryLint.report.gaps.length === 0,
);

const mayLint = lintSpec(
  mustSpec('event flag: Bool "Flag." phrase "a flag is set"\noutput done: Bool "Done." phrase "fulfill the order"\n\nR1 When a flag is set, the Order System may fulfill the order.\nR2 When a flag is not set, the Order System might not fulfill the order.\nR3 When a flag is set, the Order System could fulfill the order.\nR4 When a flag is set, the Order System can fulfill the order.\n'),
);
check(
  "weak modals warn",
  mayLint.kind === "report" &&
    mayLint.report.warnings.length === 4 &&
    mayLint.report.warnings[0].word === "may" &&
    mayLint.report.warnings[1].word === "might" &&
    mayLint.report.warnings[2].word === "could" &&
    mayLint.report.warnings[3].word === "can",
);

const timelyLint = lintSpec(mustSpec(readFileSync("examples/order-timely.ears.md", "utf8")));
check(
  "timely warns",
  timelyLint.kind === "report" &&
    timelyLint.report.warnings.length === 1 &&
    timelyLint.report.warnings[0].kind === "vague" &&
    timelyLint.report.warnings[0].word === "timely" &&
    timelyLint.report.wording.length === 0 &&
    timelyLint.report.gaps.length === 0,
);

const boundLint = lintSpec(
  mustSpec('output done: Bool "Done." phrase "timely fulfill the order"\n\nR1 The Box shall timely fulfill the order.\n'),
);
check("timely inside a phrase", boundLint.kind === "report" && boundLint.report.warnings.length === 0 && boundLint.report.wording.length === 0);

const quickSentence = lintSpec(
  mustSpec('event flag: Bool "Flag." phrase "a flag is set"\noutput done: Bool "Done." phrase "fulfill the order"\n\nR1 When a flag is set, the Box shall fulfill the order quickly.\nR2 When a flag is not set, the Box shall not fulfill the order.\n'),
);
check(
  "quickly stays wording",
  quickSentence.kind === "report" &&
    quickSentence.report.wording.length === 1 &&
    quickSentence.report.wording[0].word === "quickly" &&
    quickSentence.report.warnings.length === 0 &&
    quickSentence.report.gaps.length === 0,
);

const escapeLint = lintSpec(mustSpec(readFileSync("examples/order-escape.ears.md", "utf8")));
check(
  "escapes warn",
  escapeLint.kind === "report" &&
    escapeLint.report.warnings.length === 2 &&
    escapeLint.report.warnings[0].word === "where possible" &&
    escapeLint.report.warnings[1].word === "if possible" &&
    escapeLint.report.gaps.length === 0 &&
    escapeLint.report.wording.length === 0,
);

const splitLint = lintSpec(mustSpec(readFileSync("examples/order-split.ears.md", "utf8")));
check(
  "compound warns",
  splitLint.kind === "report" &&
    splitLint.report.warnings.length === 2 &&
    splitLint.report.warnings[0].kind === "compound" &&
    splitLint.report.warnings[0].word === "and" &&
    splitLint.report.gaps.length === 0,
);

const orLint = lintSpec(
  mustSpec('event flag: Bool "Flag." phrase "a flag is set"\noutput done: Bool "Done." phrase "fulfill the order"\noutput receipt: Bool "Receipt." phrase "send a receipt"\n\nR1 When a flag is set, the Box shall fulfill the order or send a receipt.\n'),
);
check(
  "or warns",
  orLint.kind === "report" && orLint.report.warnings.length === 1 && orLint.report.warnings[0].kind === "compound" && orLint.report.warnings[0].word === "or",
);

const singleJoin = lintSpec(
  mustSpec('output done: Bool "Done." phrase "fulfill the order"\ninput quantity: Int 1..3 "Count." phrase "the quantity"\n\nR1 The Box shall fulfill the order and the quantity is at least 1.\n'),
);
check("one output is not compound", singleJoin.kind === "report" && singleJoin.report.warnings.length === 0);

const failLint = lintSpec(mustSpec(readFileSync("examples/order-untestable.ears.md", "utf8")));
check(
  "untestable warns",
  failLint.kind === "report" &&
    failLint.report.warnings.length === 1 &&
    failLint.report.warnings[0].kind === "untestable" &&
    failLint.report.warnings[0].word === "not fail" &&
    failLint.report.redundant.length === 0 &&
    failLint.report.gaps.length === 0 &&
    failLint.report.conflicts.length === 0,
);
const alwaysLint = lintSpec(mustSpec(readFileSync("examples/order-always-work.ears.md", "utf8")));
check(
  "always work warns",
  alwaysLint.kind === "report" &&
    alwaysLint.report.warnings.length === 1 &&
    alwaysLint.report.warnings[0].word === "always work" &&
    alwaysLint.report.redundant.length === 0 &&
    alwaysLint.report.gaps.length === 0,
);

const worksLint = lintSpec(
  mustSpec('event flag: Bool "Flag." phrase "a flag is set"\n\nR1 When a flag is set, the Box shall always works.\n'),
);
check(
  "always works warns",
  worksLint.kind === "report" && worksLint.report.warnings.length === 1 && worksLint.report.warnings[0].word === "always works",
);

const namedFail = lintSpec(
  mustSpec('output fail: Bool "Fail." phrase "fail"\n\nR1 The Box shall not fail.\n'),
);
check("not fail constrains an output", namedFail.kind === "report" && namedFail.report.warnings.length === 0);

const cleanWarn = lintSpec(mustSpec(readFileSync("examples/order-testable.ears.md", "utf8")));
check(
  "testable is clean",
  cleanWarn.kind === "report" &&
    cleanWarn.report.warnings.length === 0 &&
    cleanWarn.report.gaps.length === 0 &&
    cleanWarn.report.conflicts.length === 0 &&
    cleanWarn.report.wording.length === 0,
);

const wide = mustSpec(readFileSync("examples/order-wide.ears.md", "utf8"));
check("wide space", spaceSize(wide) === 250001);
const wideLint = lintSpec(wide);
check(
  "wide lint clean",
  wideLint.kind === "report" &&
    wideLint.report.conflicts.length === 0 &&
    wideLint.report.gaps.length === 0 &&
    wideLint.report.redundant.length === 0,
);
const widePolicy = analyzePolicy(wide, "", []);
check(
  "wide policy picks the low end",
  widePolicy.accepted !== null &&
    widePolicy.accepted.code[0] === 0 &&
    widePolicy.rejected !== null &&
    widePolicy.rejected.code[0] === 1,
);

const exact = mustSpec('output quantity: Int 1..250000 "A count."\n\nR1 The Counter shall quantity = 1.\n');
check("exact limit", spaceSize(exact) === 250000);
const exactLint = lintSpec(exact);
check("exact lint clean", exactLint.kind === "report" && exactLint.report.conflicts.length === 0);
check("order space", spaceSize(order) === 8);

const selfText = 'output order_fulfilled: Bool "Done."\n\nR3 The Order System shall order_fulfilled and not order_fulfilled.\n';
const self = lintSpec(mustSpec(selfText));
check("self ran", self.kind === "report");
if (self.kind === "report") {
  check("self id", self.report.conflicts.length === 1 && self.report.conflicts[0].ids.length === 1 && self.report.conflicts[0].ids[0] === "R3");
  check("self every", self.report.conflicts[0].everySituation === true);
  check("self asks", self.report.conflicts[0].fix.indexOf("Ask what should happen") !== -1);
  check("self breaks", self.report.conflicts[0].keepsSentence === "This scenario breaks R3.");
}

const countText =
  'output quantity: Int 1..3 "How many ship."\n\nR1 The Warehouse shall quantity = 1.\nR2 The Warehouse shall quantity = 2.\n';
const count = lintSpec(mustSpec(countText));
check("count ran", count.kind === "report");
if (count.kind === "report") {
  check("count ids", count.report.conflicts.length === 1 && count.report.conflicts[0].ids[0] === "R1" && count.report.conflicts[0].ids[1] === "R2");
  check("count every", count.report.conflicts[0].everySituation === true);
  check("count example", count.report.conflicts[0].example.length === 1 && count.report.conflicts[0].example[0].value === "1");
}

const enumText =
  'enum Decision { fulfill, reject }\noutput decision: Decision "The choice."\n\nR1 The Order System shall decision = fulfill.\nR2 The Order System shall decision = reject.\n';
const enumSpec = mustSpec(enumText);
const enumLint = lintSpec(enumSpec);
check("enum ran", enumLint.kind === "report");
if (enumLint.kind === "report") {
  check("enum ids", enumLint.report.conflicts[0].ids[0] === "R1" && enumLint.report.conflicts[0].ids[1] === "R2");
  check("enum example", enumLint.report.conflicts[0].example[0].value === "fulfill");
}
const enumSmt = printSmt("enum.md", enumSpec);
check("enum datatype", enumSmt.indexOf("(declare-datatypes ((Decision 0)) (((fulfill) (reject))))") !== -1);
check("enum assert", enumSmt.indexOf("(= decision fulfill)") !== -1);

const neg = mustSpec('input offset: Int -2..2 "A shift."\n\nR1 The Clock shall offset = -1.\n');
const negSmt = printSmt("neg.md", neg);
check("negative smt", negSmt.indexOf("(- 2)") !== -1 && negSmt.indexOf("(- 1)") !== -1);

const combined = mustSpec(
  'state inventory_available: Bool "Stock."\n' +
    'event order_submitted: Bool "Submitted."\n' +
    'input quantity: Int 1..5 "Count."\n' +
    "enum Region { us, eu }\n" +
    'input region: Region "Where."\n' +
    'output shipped: Int 1..5 "Sent."\n\n' +
    "R5 While inventory_available, when order_submitted, if quantity >= 1, where region = us, then the Warehouse shall shipped = quantity.\n",
);
const combinedSmt = printSmt("combined.md", combined);
check("combined implication", combinedSmt.indexOf("(=> (and (and (and inventory_available order_submitted) (>= quantity 1)) (= region us)) (= shipped quantity))") !== -1);
check("combined term", formatTerm(combined.requirements[0].consequent) === "shipped = quantity");

const compare = mustSpec('input quantity: Int 1..3 "Count."\n\nR1 The Warehouse shall not quantity = 1.\n');
check("not compare format", formatTerm(compare.requirements[0].consequent) === "not (quantity = 1)");
const whenOne = scenario(compare, '{ "quantity": 1 }');
const whenTwo = scenario(compare, '{ "quantity": 2 }');
check("not compare fails at 1", whenOne.violations === 1);
check("not compare passes at 2", whenTwo.violations === 0);

const arithmetic = mustSpec('input quantity: Int 0..3 "Count."\noutput shipped: Int 0..4 "Sent."\n\nR1 The Warehouse shall shipped = quantity + 1.\n');
check("add format", formatTerm(arithmetic.requirements[0].consequent) === "shipped = quantity + 1");
check("add passes", scenario(arithmetic, '{ "quantity": 1, "shipped": 2 }').violations === 0);
check("add fails", scenario(arithmetic, '{ "quantity": 1, "shipped": 1 }').violations === 1);

const constantFalse = mustSpec('output done: Bool "Done."\n\nR1 The Box shall false.\n');
check("false because", scenario(constantFalse, '{ "done": true }').because === "the response is false.");

const triple = mustSpec(
  'output flag: Bool "A flag."\n\nR1 The Box shall flag.\nR2 The Box shall not flag.\nR3 The Box shall flag and not flag.\n',
);
const tripleLint = lintSpec(triple);
check("triple ran", tripleLint.kind === "report");
if (tripleLint.kind === "report") {
  check("triple count", tripleLint.report.conflicts.length === 2);
  check("triple first", tripleLint.report.conflicts[0].ids.length === 1 && tripleLint.report.conflicts[0].ids[0] === "R3");
  check(
    "triple second",
    tripleLint.report.conflicts[1].ids.length === 2 &&
      tripleLint.report.conflicts[1].ids[0] === "R1" &&
      tripleLint.report.conflicts[1].ids[1] === "R2",
  );
}

const both = mustSpec(
  'unwanted event payment_declined: Bool "Declined."\noutput order_rejected: Bool "Rejected."\n\nR4 When payment_declined, if payment_declined, then the Order System shall order_rejected.\n',
);
const bothLint = lintSpec(both);
check("when plus if is not misuse", bothLint.kind === "report" && bothLint.report.misuse.length === 0);

check("must", parseMessage('event flag: Bool "Flag."\n\nR1 When flag, the Order System must flag.\n') === '3: expected "shall"');
check("will", parseMessage('event flag: Bool "Flag."\n\nR1 When flag, the Order System will flag.\n') === '3: expected "shall"');
check("then missing", parseMessage('event flag: Bool "Flag."\n\nR1 If flag, the Order System shall flag.\n') === '3: expected "then"');
check(
  "then extra",
  parseMessage('event flag: Bool "Flag."\n\nR1 Then the Order System shall flag.\n') === '3: unexpected "then" without an if clause',
);
check(
  "clause order",
  parseMessage('event flag: Bool "Flag."\nstate ready: Bool "Ready."\n\nR1 Where flag, when ready, the Order System shall flag.\n') ===
    "4: expected while, when, if, where in that order",
);
check("duplicate id", parseMessage('output flag: Bool "Flag."\n\nR1 The Box shall flag.\nR1 The Box shall flag.\n') === "4: duplicate requirement R1");
check(
  "duplicate symbol",
  parseMessage('event flag: Bool "Flag."\nevent flag: Bool "Again."\n') === '2: "flag" is already a symbol',
);
check("unknown symbol", parseMessage('output flag: Bool "Flag."\n\nR1 The Box shall missing.\n') === '3: unknown symbol "missing"');
check("period", parseMessage('output flag: Bool "Flag."\n\nR1 The Box shall flag\n') === "3: expected a period");
check("event int", parseMessage('event count: Int 1..2 "Count."\n') === "1: events must be Bool");
check("range order", parseMessage('output count: Int 5..4 "Count."\n') === "1: integer range min is greater than max");
check("dotted id", mustSpec('output flag: Bool "Flag."\n\nR1.2 The Box shall flag.\n').requirements[0].id === "R1.2");

const badJson = parseScenarioJson("{");
check("bad json", badJson.ok === false && badJson.message === "expected '}'");
const trail = parseScenarioJson('{ "flag": true, }');
check("trailing comma", trail.ok === false && trail.message === "trailing comma");
const dup = parseScenarioJson('{ "flag": true, "flag": false }');
check("duplicate key", dup.ok === false && dup.message === 'duplicate key "flag"');
const empty = parseScenarioJson("{ }");
check("empty object", empty.ok === true && empty.object.keys.length === 0);
const lead = parseScenarioJson('{ "count": 01 }');
check("leading zero", lead.ok === false);

const outOfRange = mustSpec('output quantity: Int 1..3 "Count."\n\nR1 The Box shall quantity = 1.\n');
check("outside range", scenario(outOfRange, '{ "quantity": 0 }').because === "quantity is 0, outside 1..3");

const enumScenario = mustSpec('enum Decision { fulfill, reject }\noutput decision: Decision "Choice."\n\nR1 The Box shall decision = fulfill.\n');
check("bad variant", scenario(enumScenario, '{ "decision": "nope" }').because === 'decision is "nope", expected fulfill or reject');
check("enum pass", scenario(enumScenario, '{ "decision": "fulfill" }').violations === 0);

const named = mustSpec('output flag: Bool "Flag."\n\nR1 The API Gateway shall flag.\n');
const namedLint = lintSpec(named);
check("solution in the system name", namedLint.kind === "report" && namedLint.report.wording.length === 1 && namedLint.report.wording[0].word === "api");

check("conflict helper", idsOf(conflict).length === 2);

const natural = mustSpec(
  'event order_submitted: Bool "Submitted." phrase "  an   order\tis submitted  "\n' +
    'output order_fulfilled: Bool "Done." phrase "fulfill the order"\n\n' +
    "R1 When AN ORDER IS SUBMITTED, the Order System shall fulfill the order.\n",
);
check("phrase normalized", natural.symbols[0].phrase === "an order is submitted");
check("phrase case", formatTerm(natural.requirements[0].antecedent === null ? natural.requirements[0].consequent : natural.requirements[0].antecedent) === "an order is submitted");
check("negation phrase", formatTerm(mustSpec('output order_fulfilled: Bool "Done." phrase "fulfill the order"\n\nR1 The Order System shall not fulfill the order.\n').requirements[0].consequent) === "not fulfill the order");

const longest = mustSpec(
  'event short: Bool "Short." phrase "an order"\n' +
    'event long: Bool "Long." phrase "an order is submitted"\n' +
    'output flag: Bool "Flag."\n\n' +
    "R1 The Box shall an order is submitted.\n",
);
check("longest phrase", longest.requirements[0].consequent.kind === "sym" && longest.requirements[0].consequent.kind === "sym" && formatTerm(longest.requirements[0].consequent) === "an order is submitted");

const english = mustSpec(
  'input quantity: Int 0..5 "Count." phrase "the quantity"\n' +
    'output shipped: Int 0..5 "Sent." phrase "the number shipped"\n\n' +
    "R1 The Box shall the quantity is at most 4.\n" +
    "R2 The Box shall the quantity is at least 1.\n" +
    "R3 The Box shall the quantity is less than 5.\n" +
    "R4 The Box shall the quantity is greater than 0.\n" +
    "R5 The Box shall the quantity is not 3.\n" +
    "R6 The Box shall the number shipped is the quantity.\n" +
    "R7 The Box shall the quantity <= 4.\n",
);
check("at most", formatTerm(english.requirements[0].consequent) === "the quantity is at most 4");
check("at least", formatTerm(english.requirements[1].consequent) === "the quantity is at least 1");
check("less than", formatTerm(english.requirements[2].consequent) === "the quantity is less than 5");
check("greater than", formatTerm(english.requirements[3].consequent) === "the quantity is greater than 0");
check("is not", formatTerm(english.requirements[4].consequent) === "the quantity is not 3");
check("phrase eq", formatTerm(english.requirements[5].consequent) === "the number shipped is the quantity");
check("symbolic still english", formatTerm(english.requirements[6].consequent) === "the quantity is at most 4");
check("english holds", scenario(english, '{ "quantity": 2, "shipped": 2 }').violations === 0);
check("english misses", scenario(english, '{ "quantity": 0, "shipped": 2 }').violations === 3);

const combinedFile = mustSpec(readFileSync("examples/order-combined.ears.md", "utf8"));
check("combined file phrase", formatTerm(combinedFile.requirements[0].consequent) === "the number shipped is the quantity");
check("combined file smt", printSmt("examples/order-combined.ears.md", combinedFile).indexOf("(= shipped quantity)") !== -1);

check(
  "unknown phrase",
  parseMessage(
    'event order_submitted: Bool "Submitted." phrase "an order is submitted"\n' +
      'output order_fulfilled: Bool "Done." phrase "fulfill the order"\n\n' +
      "R1 The Order System shall an order was submitted.\n",
  ) === '4: unknown phrase "an order was submitted". Closest: "an order is submitted", "fulfill the order".',
);
check(
  "unknown phrase stops at and",
  parseMessage(
    'event order_submitted: Bool "Submitted." phrase "an order is submitted"\n\nR1 The Order System shall an order was submitted and an order is submitted.\n',
  ).indexOf('unknown phrase "an order was submitted"') !== -1,
);
check("duplicate phrase", parseMessage('event a: Bool "A." phrase "an order is submitted"\nevent b: Bool "B." phrase "An Order Is Submitted"\n') === '2: "An Order Is Submitted" is already a phrase');
check("phrase reserved", parseMessage('event a: Bool "A." phrase "when"\n') === '1: "when" is a reserved word');
check("phrase starts with not", parseMessage('event a: Bool "A." phrase "not ready"\n') === '1: a phrase cannot start with "not"');
check("phrase punctuation", parseMessage('input quantity: Int 1..3 "Count." phrase "quantity = 1"\n') === "1: a phrase can only be words");
check("phrase empty", parseMessage('event a: Bool "A." phrase ""\n') === "1: expected a phrase");
check("phrase blank", parseMessage('event a: Bool "A." phrase "   "\n') === "1: expected a phrase");
check("phrase symbol clash", parseMessage('event flag: Bool "F."\nevent other: Bool "O." phrase "flag"\n') === '2: "flag" is already a symbol');
check("name is phrase", parseMessage('event other: Bool "O." phrase "flag"\nevent flag: Bool "F."\n') === '2: "flag" is already a phrase');
check("phrase variant", parseMessage('enum Region { us, eu }\ninput region: Region "Where." phrase "us"\n') === '2: "us" is already an enum variant');
check("phrase enum", parseMessage('enum Region { us, eu }\noutput flag: Bool "F." phrase "region"\n') === '2: "region" is already an enum');
check("bad phrase escape", parseMessage('event a: Bool "A." phrase "bad\\q"\n') === "1: bad escape in phrase");
check("phrase trailing", parseMessage('event a: Bool "A." phrase "ready" extra\n') === "1: unexpected trailing text");
check(
  "is at rewinds",
  parseMessage('input quantity: Int 1..3 "Count." phrase "the quantity"\n\nR1 The Box shall the quantity is at home.\n') === '3: unexpected "is"',
);
check("reserved name phrase", parseMessage('event phrase: Bool "Nope."\n') === '1: "phrase" is a reserved word');
check("reserved name outcome", parseMessage('event outcome: Bool "Nope."\n') === '1: "outcome" is a reserved word');
check(
  "outcome on int",
  parseMessage('output quantity: Int 0..1 "Count." outcome "the quantity was set"\n') === "1: outcome is only for Bool",
);
check(
  "outcome punctuation",
  parseMessage('output done: Bool "Done." outcome "done!"\n') === "1: an outcome can only be words",
);
check(
  "outcome then phrase",
  parseMessage('output done: Bool "Done." outcome "done" phrase "do it"\n') === "1: unexpected trailing text",
);
check(
  "outcome missing half",
  parseMessage('output done: Bool "Done." outcome "done" /\n') === "1: expected an outcome in quotes",
);

const derived = mustSpec('output done: Bool "Done." phrase "fulfill the order" outcome "the order was fulfilled"\n\nR1 The Box shall fulfill the order.\n');
check(
  "derived outcome",
  derived.symbols[0].outcomeYes === "the order was fulfilled" && derived.symbols[0].outcomeNo === "the order was not fulfilled",
);
check("derived because", scenario(derived, '{ "done": false }').because === "The order was not fulfilled.");

const fromIs = mustSpec('output done: Bool "Done." outcome "the order is fulfilled"\n\nR1 The Box shall done.\n');
check("outcome from is", fromIs.symbols[0].outcomeNo === "the order is not fulfilled");

const bareOutcome = mustSpec('output done: Bool "Done." outcome "done"\n\nR1 The Box shall done.\n');
check("outcome prefix not", bareOutcome.symbols[0].outcomeNo === "not done");
check("outcome prefix because", scenario(bareOutcome, '{ "done": false }').because === "Not done.");

const slashed = mustSpec('output done: Bool "Done." outcome "yes please" / "no thanks"\n\nR1 The Box shall done.\n');
check("slash outcome", slashed.symbols[0].outcomeYes === "yes please" && slashed.symbols[0].outcomeNo === "no thanks");
check("slash because", scenario(slashed, '{ "done": false }').because === "No thanks.");

const defaultVoice = mustSpec(
  'event order_submitted: Bool "Submits." phrase "an order is submitted"\n' +
    'state inventory_available: Bool "Stock." phrase "inventory is available"\n' +
    'output done: Bool "Done." phrase "mark the order done"\n\n' +
    "R1 When an order is submitted and inventory is available, the Box shall mark the order done.\n",
);
check(
  "default was because",
  scenario(defaultVoice, '{ "order_submitted": true, "inventory_available": true, "done": false }').because ===
    "An order was submitted and inventory was available, but not mark the order done.",
);
check(
  "unphrased because",
  scenario(mustSpec('output done: Bool "Done."\n\nR1 The Box shall done.\n'), '{ "done": false }').because === "done is false.",
);

const unhandled = lintSpec(mustSpec(readFileSync("examples/order-unhandled.ears.md", "utf8")));
check("unhandled ran", unhandled.kind === "report");
if (unhandled.kind === "report") {
  check("unhandled only that event", unhandled.report.gaps.length === 1 && unhandled.report.conflicts.length === 0);
  check("unhandled output", unhandled.report.gaps[0].output === "order_cancelled");
  check(
    "unhandled text",
    unhandled.report.gaps[0].text ===
      'No requirement handles "an order is cancelled". Suggested fix: add a requirement that says what the system shall do, or remove the event.',
  );
}
const bareEvent = lintSpec(mustSpec('event ping: Bool "Ping."\noutput done: Bool "Done."\n\nR1 The Box shall done.\n'));
check(
  "unhandled name",
  bareEvent.kind === "report" &&
    bareEvent.report.gaps.length === 1 &&
    bareEvent.report.gaps[0].output === "ping" &&
    bareEvent.report.gaps[0].text.indexOf("No requirement handles ping.") === 0,
);

const unanswered = lintSpec(mustSpec(readFileSync("examples/order-unanswered.ears.md", "utf8")));
check("unanswered ran", unanswered.kind === "report");
if (unanswered.kind === "report") {
  check("unanswered gap", unanswered.report.gaps.length === 1 && unanswered.report.gaps[0].output === "payment_declined");
  check(
    "unanswered text",
    unanswered.report.gaps[0].text ===
      'No requirement states a response when "payment fails". Suggested fix: add an if ... then requirement, and ask what the system shall do. Do not choose the response.',
  );
}

const vague = lintSpec(mustSpec(readFileSync("examples/order-vague.ears.md", "utf8")));
check("vague ran", vague.kind === "report");
if (vague.kind === "report") {
  check("vague count", vague.report.wording.length === 3 && vague.report.gaps.length === 0);
  check("vague fast", vague.report.wording[0].word === "fast" && vague.report.wording[0].kind === "vague");
  check("vague appropriate", vague.report.wording[1].word === "appropriate");
  check("vague friendly", vague.report.wording[2].word === "user-friendly");
}

const quantityLint = lintSpec(mustSpec(readFileSync("examples/order-quantity.ears.md", "utf8")));
check("quantity ran", quantityLint.kind === "report");
if (quantityLint.kind === "report") {
  const item = quantityLint.report.conflicts[0];
  check("quantity ids", quantityLint.report.conflicts.length === 1 && quantityLint.report.gaps.length === 0 && item.ids[0] === "R4" && item.ids[1] === "R5");
  check("quantity not every", item.everySituation === false);
  check(
    "quantity requires",
    item.requires[0].value === "that at most 10 units were accepted" && item.requires[1].value === "that 12 units were accepted",
  );
  check("quantity example", item.example.length === 2 && item.example[1].name === "quantity" && item.example[1].value === "0");
  check("quantity keeps", item.keeps.length === 1 && item.keeps[0] === "R4" && item.breaks === "R5");
}

const statusLint = lintSpec(mustSpec(readFileSync("examples/order-status.ears.md", "utf8")));
check("status ran", statusLint.kind === "report");
if (statusLint.kind === "report") {
  const item = statusLint.report.conflicts[0];
  check("status ids", item.ids[0] === "R6" && item.ids[1] === "R7");
  check("status every", item.everySituation === true);
  check(
    "status requires",
    item.requires[0].value === "that the order was shipped" && item.requires[1].value === "that the order was cancelled",
  );
  check("status example", item.example.length === 1 && item.example[0].value === "shipped");
}

const listed = analyzePolicy(order, "", []);
check(
  "policy accepted",
  listed.accepted !== null && listed.accepted.code[0] === 0 && listed.accepted.code[1] === 0 && listed.accepted.code[2] === 0,
);
check(
  "policy rejected",
  listed.rejected !== null && listed.rejected.code[0] === 1 && listed.rejected.code[1] === 1 && listed.rejected.code[2] === 0,
);
const alwaysProp = parseProperty(readFileSync("examples/order-always.ears.md", "utf8"), order);
check("always parsed", alwaysProp.ok === true);
if (alwaysProp.ok) {
  const counter = analyzePolicy(order, "examples/order-always.ears.md", alwaysProp.requirements);
  check(
    "counterexample",
    counter.holds === false &&
      counter.counterexample !== null &&
      counter.breaks.length === 1 &&
      counter.breaks[0].because === "The order was not fulfilled.",
  );
}
const sameProp = parseProperty(readFileSync("examples/order-same.ears.md", "utf8"), order);
if (sameProp.ok) {
  const held = analyzePolicy(order, "examples/order-same.ears.md", sameProp.requirements);
  check("property holds", held.holds === true && held.counterexample === null && held.note === "No scenario satisfies every requirement and violates the property.");
}
const statusSpec = mustSpec(readFileSync("examples/order-status.ears.md", "utf8"));
const statusList = analyzePolicy(statusSpec, "", []);
check("status no model", statusList.accepted === null && statusList.rejected !== null && statusList.breaks.length === 2);
const placedProp = parseProperty(readFileSync("examples/status-placed.ears.md", "utf8"), statusSpec);
if (placedProp.ok) {
  const vacuous = analyzePolicy(statusSpec, "examples/status-placed.ears.md", placedProp.requirements);
  check("vacuous property", vacuous.holds === true && vacuous.note === "No scenario satisfies every requirement, so none violates the property.");
}
const declaredProp = parseProperty('event flag: Bool "Flag."\n', order);
check("property declares", declaredProp.ok === false);
if (!declaredProp.ok) check("property declare message", declaredProp.message === "a property cannot declare symbols" && declaredProp.line === 1);
const emptyProp = parseProperty("", order);
check("empty property", emptyProp.ok === false);
if (!emptyProp.ok) check("empty property message", emptyProp.message === "expected a requirement");

const hyphen = mustSpec('event ready: Bool "Ready." phrase "user-friendly checkout"\n\nR1 The Box shall user-friendly checkout.\n');
check("hyphen phrase", formatTerm(hyphen.requirements[0].consequent) === "user-friendly checkout");

const chain = lintSpec(mustSpec(readFileSync("examples/order-chain.ears.md", "utf8")));
check("chain ran", chain.kind === "report");
if (chain.kind === "report") {
  const item = chain.report.conflicts[0];
  check(
    "chain is one triple",
    chain.report.conflicts.length === 1 &&
      chain.report.gaps.length === 0 &&
      chain.report.redundant.length === 0 &&
      item.minimal === true &&
      item.ids.length === 3 &&
      item.ids[0] === "R1" &&
      item.ids[1] === "R2" &&
      item.ids[2] === "R3",
  );
  check("chain fix", item.fix.indexOf("Removing any one of R1, R2, and R3") !== -1);
  check("chain keeps both", item.keeps.length === 2 && item.keeps[0] === "R1" && item.keeps[1] === "R2" && item.breaks === "R3");
}

const redundantLint = lintSpec(mustSpec(readFileSync("examples/order-redundant.ears.md", "utf8")));
check("redundant ran", redundantLint.kind === "report");
if (redundantLint.kind === "report") {
  check(
    "only R2 is redundant",
    redundantLint.report.conflicts.length === 0 &&
      redundantLint.report.gaps.length === 0 &&
      redundantLint.report.redundant.length === 1 &&
      redundantLint.report.redundant[0].id === "R2" &&
      redundantLint.report.redundant[0].text ===
        "R2 adds nothing. R1 implies it. Whenever the other requirements hold, R2 holds too." &&
      redundantLint.report.redundant[0].impliedBy.length === 1 &&
      redundantLint.report.redundant[0].impliedBy[0] === "R1",
  );
}

const listedScenarios = listScenarios(order);
check("scenario rows", listedScenarios.length === 3);
check(
  "scenario accepted true",
  listedScenarios[0].found === true &&
    listedScenarios[0].kind === "accepted" &&
    listedScenarios[0].trigger === "true" &&
    listedScenarios[0].text === "An order was submitted and inventory was available, and the order was fulfilled.",
);
check(
  "scenario rejected",
  listedScenarios[2].found === true &&
    listedScenarios[2].kind === "rejected" &&
    listedScenarios[2].text === "An order was submitted and inventory was available, but the order was not fulfilled.",
);
const statusRows = listScenarios(statusSpec);
check(
  "ubiquitous has no trigger false",
  statusRows.length === 6 && statusRows[1].found === false && statusRows[1].text === "R6 has no trigger, so there is no case where the trigger is false.",
);
check("status scenarios dedupe", statusRows[5].sameAs === "R6 rejected, trigger true" && statusRows[5].found === true);

let manyText = 'event a: Bool "A happens." phrase "a happens"\n';
manyText += 'event b: Bool "B happens." phrase "b happens"\n';
manyText += 'output o: Bool "O holds." phrase "o holds"\n';
manyText += 'output p: Bool "P holds." phrase "p holds"\n\n';
manyText += "R1 When a happens, the Box shall o holds.\n";
manyText += "R2 When a happens, the Box shall not o holds.\n";
manyText += "R3 When b happens, the Box shall p holds.\n";
manyText += "R4 When b happens, the Box shall not p holds.\n";
for (let extra = 5; extra <= 13; extra++) manyText += "R" + String(extra) + " The Box shall true.\n";
const many = lintSpec(mustSpec(manyText));
check("thirteen requirements ran", many.kind === "report");
if (many.kind === "report") {
  let pairO = false;
  let pairP = false;
  let onlyCores = many.report.conflicts.length === 2;
  for (let i = 0; i < many.report.conflicts.length; i++) {
    const ids = many.report.conflicts[i].ids;
    if (!many.report.conflicts[i].minimal || ids.length !== 2) onlyCores = false;
    if (ids.length === 2 && ids[0] === "R1" && ids[1] === "R2") pairO = true;
    if (ids.length === 2 && ids[0] === "R3" && ids[1] === "R4") pairP = true;
  }
  check("thirteen requirements keep both pairs", pairO && pairP && onlyCores && many.report.redundant.length === 0);
}

const checkout = mustSpec(readFileSync("examples/checkout.ears.md", "utf8"));
check("checkout size", checkout.requirements.length === 50 && spaceSize(checkout) === 196608);
const checkoutLint = lintSpec(checkout);
check("checkout ran", checkoutLint.kind === "report");
if (checkoutLint.kind === "report") {
  const groups = checkoutLint.report.conflicts;
  let accept = false;
  let seats = false;
  let triple = false;
  let shaped = groups.length === 3;
  for (let i = 0; i < groups.length; i++) {
    const ids = groups[i].ids;
    if (!groups[i].minimal) shaped = false;
    if (ids.length === 2 && ids[0] === "R1" && ids[1] === "R4") accept = true;
    if (ids.length === 2 && ids[0] === "R15" && ids[1] === "R16") seats = true;
    if (ids.length === 3 && ids[0] === "R8" && ids[1] === "R12" && ids[2] === "R14") triple = true;
  }
  const gapNames: string[] = [];
  for (let i = 0; i < checkoutLint.report.gaps.length; i++) gapNames.push(checkoutLint.report.gaps[i].output);
  const outside: string[] = [];
  for (let i = 0; i < checkoutLint.report.redundant.length; i++) outside.push(checkoutLint.report.redundant[i].id);
  let sawR10 = false;
  let sawR25 = false;
  let sawR49 = false;
  let sawHidden = false;
  for (let i = 0; i < outside.length; i++) {
    if (outside[i] === "R10") sawR10 = true;
    if (outside[i] === "R25") sawR25 = true;
    if (outside[i] === "R49") sawR49 = true;
    if (outside[i] === "R18" || outside[i] === "R1" || outside[i] === "R8") sawHidden = true;
  }
  check(
    "checkout conflicts and gaps",
    accept &&
      seats &&
      triple &&
      shaped &&
      gapNames.length === 2 &&
      gapNames[0] === "receipt_sent" &&
      gapNames[1] === "billed_seats" &&
      checkoutLint.report.misuse.length === 0 &&
      checkoutLint.report.wording.length === 0 &&
      checkoutLint.report.duplicate.length === 0 &&
      outside.length === 23 &&
      sawR10 &&
      sawR25 &&
      sawR49 &&
      !sawHidden,
  );
}

const clashText =
  'output x: Int 0..1000000 "X." phrase "the level"\n\nR1 The Box shall the level is at most 10.\nR2 The Box shall the level is at least 500000.\n';
const clash = lintSpec(mustSpec(clashText));
check("wide output clash ran", clash.kind === "report");
if (clash.kind === "report") {
  check(
    "wide output clash is one pair",
    clash.report.conflicts.length === 1 &&
      clash.report.conflicts[0].minimal &&
      clash.report.conflicts[0].ids.length === 2 &&
      clash.report.conflicts[0].ids[0] === "R1" &&
      clash.report.conflicts[0].ids[1] === "R2" &&
      clash.report.conflicts[0].everySituation,
  );
}

const driverText =
  'input count: Int 0..300000 "Count." phrase "the count"\noutput ok: Bool "Ok."\n\nR1 The Box shall the count is 0.\n';
const driverWide = lintSpec(mustSpec(driverText));
check("wide driver ran", driverWide.kind === "report");
if (driverWide.kind === "report") {
  const conflict = driverWide.report.conflicts.length === 1 ? driverWide.report.conflicts[0] : null;
  const gap = driverWide.report.gaps.length === 1 ? driverWide.report.gaps[0] : null;
  check(
    "wide driver singleton",
    conflict !== null &&
      conflict.minimal &&
      conflict.ids.length === 1 &&
      conflict.ids[0] === "R1" &&
      conflict.situation.length === 1 &&
      conflict.situation[0].name === "count" &&
      conflict.situation[0].value === "1" &&
      gap !== null &&
      gap.output === "ok" &&
      gap.situation.length === 1 &&
      gap.situation[0].value === "300000" &&
      spaceSize(mustSpec(driverText)) === 600002,
  );
}

const thresholdText =
  'input count: Int 0..300000 "Count." phrase "the count"\noutput ok: Bool "Ok." phrase "it is ok"\n\nR1 When the count is at least 10, the Box shall it is ok.\n';
const threshold = lintSpec(mustSpec(thresholdText));
check("wide threshold ran", threshold.kind === "report");
if (threshold.kind === "report") {
  const gap = threshold.report.gaps.length === 1 ? threshold.report.gaps[0] : null;
  check(
    "wide threshold gap stops at the boundary",
    threshold.report.conflicts.length === 0 &&
      gap !== null &&
      gap.output === "ok" &&
      gap.situation.length === 1 &&
      gap.situation[0].value === "9",
  );
}

const coupledText =
  'input quantity: Int 0..1000000 "Q."\noutput shipped: Int 0..1000000 "S."\n\nR1 The Box shall shipped = quantity + 1.\n';
const coupled = lintSpec(mustSpec(coupledText));
check("wide coupled ran", coupled.kind === "report");
if (coupled.kind === "report") {
  const conflict = coupled.report.conflicts.length === 1 ? coupled.report.conflicts[0] : null;
  const accepted = analyzePolicy(mustSpec(coupledText), "", []).accepted;
  check(
    "wide coupled equality",
    conflict !== null &&
      conflict.minimal &&
      conflict.ids.length === 1 &&
      conflict.ids[0] === "R1" &&
      conflict.situation.length === 1 &&
      conflict.situation[0].value === "1000000" &&
      accepted !== null &&
      accepted.code[0] === 0 &&
      accepted.code[1] === 1,
  );
}

let wideMany = 'event flag: Bool "Flag." phrase "the flag"\n';
wideMany += 'input count: Int 0..300000 "Count." phrase "the count"\n';
wideMany += 'output o: Bool "O."\n';
wideMany += 'output p: Bool "P."\n\n';
wideMany += "R1 When the flag, the Box shall o.\n";
wideMany += "R2 When the flag, the Box shall not o.\n";
wideMany += "R3 When the count is at least 10, the Box shall p.\n";
wideMany += "R4 When the count is at least 10, the Box shall not p.\n";
for (let extra = 5; extra <= 13; extra++) wideMany += "R" + String(extra) + " The Box shall true.\n";
const wideManyLint = lintSpec(mustSpec(wideMany));
check("wide thirteen ran", wideManyLint.kind === "report");
if (wideManyLint.kind === "report") {
  let pairO = false;
  let pairP = false;
  let onlyCores = wideManyLint.report.conflicts.length === 2;
  for (let i = 0; i < wideManyLint.report.conflicts.length; i++) {
    const ids = wideManyLint.report.conflicts[i].ids;
    if (!wideManyLint.report.conflicts[i].minimal || ids.length !== 2) onlyCores = false;
    if (ids.length === 2 && ids[0] === "R1" && ids[1] === "R2") pairO = true;
    if (ids.length === 2 && ids[0] === "R3" && ids[1] === "R4") pairP = true;
  }
  let gapO = false;
  let gapP = false;
  for (let i = 0; i < wideManyLint.report.gaps.length; i++) {
    const gap = wideManyLint.report.gaps[i];
    if (gap.output === "o" && gap.situation.length === 2 && gap.situation[0].value === "false" && gap.situation[1].value === "300000") {
      gapO = true;
    }
    if (gap.output === "p" && gap.situation.length === 2 && gap.situation[0].value === "true" && gap.situation[1].value === "9") {
      gapP = true;
    }
  }
  check("wide thirteen keeps both pairs", pairO && pairP && onlyCores && gapO && gapP && wideManyLint.report.redundant.length === 0);
}

const vacuousLint = lintSpec(mustSpec(readFileSync("examples/order-vacuous.ears.md", "utf8")));
check("vacuous ran", vacuousLint.kind === "report");
if (vacuousLint.kind === "report") {
  check("vacuous count", vacuousLint.report.vacuous.length === 2 && vacuousLint.report.conflicts.length === 0 && vacuousLint.report.gaps.length === 0);
  check("vacuous ids", vacuousLint.report.vacuous[0].id === "R1" && vacuousLint.report.vacuous[1].id === "R2");
  check(
    "vacuous text",
    vacuousLint.report.vacuous[0].text === "R1 can never trigger. Its condition is impossible for every allowed value." &&
      vacuousLint.report.vacuous[1].text.indexOf("R2 can never trigger.") === 0,
  );
  check("vacuous fix", vacuousLint.report.vacuous[0].fix.indexOf("Suggested fix: rewrite the condition in R1") === 0);
  check(
    "vacuous because",
    vacuousLint.report.vacuous[0].because.length === 1 &&
      vacuousLint.report.vacuous[0].because[0] === "the condition contradicts itself" &&
      vacuousLint.report.vacuous[1].because.length === 1 &&
      vacuousLint.report.vacuous[1].because[0] === "the quantity is 1..5",
  );
  check(
    "vacuous is not redundant",
    vacuousLint.report.redundant.length === 0 && vacuousLint.report.duplicate.length === 0,
  );
}
const vacuousCopy = lintSpec(
  mustSpec(
    'input quantity: Int 1..5 "Count." phrase "the quantity"\n' +
      'output order_accepted: Bool "Accepted." phrase "accept the order"\n\n' +
      "R1 When the quantity is at least 9, the Checkout shall accept the order.\n" +
      "R2 When the quantity is at least 9, the Checkout shall accept the order.\n" +
      "R3 The Checkout shall accept the order.\n" +
      "R4 The Checkout shall accept the order.\n",
  ),
);
check("vacuous copy ran", vacuousCopy.kind === "report");
if (vacuousCopy.kind === "report") {
  check(
    "vacuous copy is not a duplicate",
    vacuousCopy.report.vacuous.length === 2 &&
      vacuousCopy.report.vacuous[0].id === "R1" &&
      vacuousCopy.report.vacuous[1].id === "R2" &&
      vacuousCopy.report.redundant.length === 0 &&
      vacuousCopy.report.duplicate.length === 1 &&
      vacuousCopy.report.duplicate[0].id === "R4" &&
      vacuousCopy.report.duplicate[0].sameAs === "R3",
  );
}

const possible = lintSpec(
  mustSpec(
    'state cart_open: Bool "The cart is open." phrase "the cart is open"\noutput order_accepted: Bool "The order is accepted." phrase "accept the order"\n\nR1 When the cart is open, the Checkout shall accept the order.\nR2 When not the cart is open, the Checkout shall not accept the order.\n',
  ),
);
check(
  "possible condition is not vacuous",
  possible.kind === "report" &&
    possible.report.vacuous.length === 0 &&
    possible.report.unused.length === 0 &&
    possible.report.uncovered.length === 0 &&
    possible.report.gaps.length === 0,
);

const unusedLint = lintSpec(mustSpec(readFileSync("examples/order-unused.ears.md", "utf8")));
check("unused ran", unusedLint.kind === "report");
if (unusedLint.kind === "report") {
  check("unused no conflict or gap", unusedLint.report.conflicts.length === 0 && unusedLint.report.gaps.length === 0 && unusedLint.report.vacuous.length === 0);
  check("unused count", unusedLint.report.unused.length === 1);
  check("unused input", unusedLint.report.unused[0].name === "region" && unusedLint.report.unused[0].kind === "input");
  check("uncovered count", unusedLint.report.uncovered.length === 3);
  check("uncovered state", unusedLint.report.uncovered[0].name === "loyalty" && unusedLint.report.uncovered[0].kind === "state");
  check(
    "uncovered output",
    unusedLint.report.uncovered[1].name === "receipt_sent" && unusedLint.report.uncovered[1].kind === "output",
  );
  check(
    "uncovered variant on unused spec",
    unusedLint.report.uncovered[2].name === "Lane.refund" &&
      unusedLint.report.uncovered[2].kind === "variant" &&
      unusedLint.report.uncovered[2].text.indexOf("refund") !== -1,
  );
  check("unused fix", unusedLint.report.unused[0].fix.indexOf("Suggested fix: use region") === 0);
}

const blockedLint = lintSpec(mustSpec(readFileSync("examples/order-blocked.ears.md", "utf8")));
check("blocked ran", blockedLint.kind === "report");
if (blockedLint.kind === "report") {
  check(
    "blocked by both always-true requirements",
    blockedLint.report.conflicts.length === 0 &&
      blockedLint.report.vacuous.length === 1 &&
      blockedLint.report.vacuous[0].id === "R3" &&
      blockedLint.report.vacuous[0].because.length === 2 &&
      blockedLint.report.vacuous[0].because[0] === "R1" &&
      blockedLint.report.vacuous[0].because[1] === "R2" &&
      blockedLint.report.redundant.length === 0 &&
      blockedLint.report.uncovered.length === 0,
  );
}
const reachableLint = lintSpec(mustSpec(readFileSync("examples/order-reachable.ears.md", "utf8")));
check(
  "reachable trigger",
  reachableLint.kind === "report" &&
    reachableLint.report.vacuous.length === 0 &&
    reachableLint.report.redundant.length === 0 &&
    reachableLint.report.uncovered.length === 0 &&
    reachableLint.report.conflicts.length === 0,
);
const uncoveredLint = lintSpec(mustSpec(readFileSync("examples/order-uncovered.ears.md", "utf8")));
check("uncovered ran", uncoveredLint.kind === "report");
if (uncoveredLint.kind === "report") {
  check(
    "uncovered state output and variant",
    uncoveredLint.report.conflicts.length === 0 &&
      uncoveredLint.report.unused.length === 0 &&
      uncoveredLint.report.vacuous.length === 0 &&
      uncoveredLint.report.uncovered.length === 3 &&
      uncoveredLint.report.uncovered[0].name === "loyalty" &&
      uncoveredLint.report.uncovered[0].kind === "state" &&
      uncoveredLint.report.uncovered[1].name === "receipt_sent" &&
      uncoveredLint.report.uncovered[1].kind === "output" &&
      uncoveredLint.report.uncovered[2].name === "Lane.refund" &&
      uncoveredLint.report.uncovered[2].kind === "variant",
  );
}
const laneLint = lintSpec(mustSpec(readFileSync("examples/order-lane.ears.md", "utf8")));
check(
  "every lane value can be produced",
  laneLint.kind === "report" && laneLint.report.uncovered.length === 0 && laneLint.report.unused.length === 0 && laneLint.report.vacuous.length === 0,
);
const oneBlocker = lintSpec(
  mustSpec(
    'output gate_open: Bool "Open." phrase "the gate is open" action "open the gate"\n' +
      'output shift_open: Bool "Shift." phrase "the shift is open" action "open the shift"\n' +
      'output job_done: Bool "Done." phrase "finish the job"\n\n' +
      "R1 The Desk shall not open the gate.\n" +
      "R2 The Desk shall not open the shift.\n" +
      "R3 When the gate is open, the Desk shall finish the job.\n" +
      "R4 When the gate is not open, the Desk shall not finish the job.\n",
  ),
);
check("one blocker ran", oneBlocker.kind === "report");
if (oneBlocker.kind === "report") {
  check(
    "minimal blocker drops the unrelated requirement",
    oneBlocker.report.vacuous.length === 1 &&
      oneBlocker.report.vacuous[0].id === "R3" &&
      oneBlocker.report.vacuous[0].because.length === 1 &&
      oneBlocker.report.vacuous[0].because[0] === "R1" &&
      oneBlocker.report.conflicts.length === 0,
  );
}
const pairImply = lintSpec(
  mustSpec(
    'event order_submitted: Bool "Submitted." phrase "an order is submitted"\n' +
      'state inventory_available: Bool "Stock." phrase "inventory is available"\n' +
      'output order_fulfilled: Bool "Fulfilled." phrase "fulfill the order"\n' +
      'output order_closed: Bool "Closed." phrase "close the order"\n\n' +
      "R1 When an order is submitted, the Order System shall fulfill the order.\n" +
      "R2 When an order is submitted, the Order System shall close the order.\n" +
      "R3 When an order is not submitted, the Order System shall not fulfill the order.\n" +
      "R4 When an order is submitted and inventory is available, the Order System shall fulfill the order and close the order.\n",
  ),
);
check("pair imply ran", pairImply.kind === "report");
if (pairImply.kind === "report") {
  check(
    "two requirements imply the third",
    pairImply.report.redundant.length === 1 &&
      pairImply.report.redundant[0].id === "R4" &&
      pairImply.report.redundant[0].impliedBy.length === 2 &&
      pairImply.report.redundant[0].impliedBy[0] === "R1" &&
      pairImply.report.redundant[0].impliedBy[1] === "R2" &&
      pairImply.report.conflicts.length === 0 &&
      pairImply.report.vacuous.length === 0,
  );
}

const embedded = mustSpec(
  'state cancelling: Bool "Cancels." phrase "the customer is cancelling"\noutput done: Bool "Done."\n\nR1 When the customer is not cancelling, the Box shall done.\nR2 When not the customer is cancelling, the Box shall done.\n',
);
check(
  "embedded is not",
  embedded.requirements[0].antecedent !== null &&
    embedded.requirements[0].antecedent.kind === "not" &&
    embedded.requirements[1].antecedent !== null &&
    embedded.requirements[1].antecedent.kind === "not" &&
    formatTerm(embedded.requirements[0].antecedent) === formatTerm(embedded.requirements[1].antecedent),
);
const seated = mustSpec(
  'output billed_seats: Int 1..3 "Seats." phrase "the billed seats" as "bill {op} {value} seats" says "{value} seats were billed"\n\nR1 The Box shall bill 1 seat.\nR2 The Box shall bill at most 2 seats.\nR3 The Box shall bill 3 seats.\n',
);
check("seat singular", formatTerm(seated.requirements[0].consequent) === "the billed seats is 1");
check("seats at most", formatTerm(seated.requirements[1].consequent) === "the billed seats is at most 2");
check("seats equal", seated.requirements[2].consequent.kind === "eq");
const seatClash = mustSpec(
  'output billed_seats: Int 1..3 "Seats." phrase "the billed seats" as "bill {op} {value} seats" says "{value} seats were billed"\n\nR1 The Box shall bill at most 2 seats.\nR2 The Box shall bill 3 seats.\n',
);
const seatedLint = lintSpec(seatClash);
check(
  "says seats",
  seatedLint.kind === "report" &&
    seatedLint.report.conflicts.length === 1 &&
    seatedLint.report.conflicts[0].requires[0].value === "that at most 2 seats were billed" &&
    seatedLint.report.conflicts[0].requires[1].value === "that 3 seats were billed",
);
const routed = mustSpec(
  'enum Lane { hold, fulfill }\noutput lane: Lane "Lane." phrase "the lane" as "route the order to the {value} lane" says "the order was routed to the {value} lane"\n\nR1 The Box shall route the order to the fulfill lane.\nR2 The Box shall the lane is hold.\n',
);
check("route phrase", formatTerm(routed.requirements[0].consequent) === "the lane is fulfill");
check("old lane still parses", formatTerm(routed.requirements[1].consequent) === "the lane is hold");
const routedLint = lintSpec(routed);
check(
  "says lane",
  routedLint.kind === "report" &&
    routedLint.report.conflicts.length === 1 &&
    routedLint.report.conflicts[0].requires[0].value === "that the order was routed to the fulfill lane",
);
const plainPlural = mustSpec(
  'output billed_seats: Int 1..3 "Seats." phrase "the billed seats"\n\nR1 The Box shall the billed seats is 3.\nR2 The Box shall the billed seats is at most 2.\n',
);
const plainLint = lintSpec(plainPlural);
check(
  "plural default",
  plainLint.kind === "report" &&
    plainLint.report.conflicts.length === 1 &&
    plainLint.report.conflicts[0].requires[0].value === "that the billed seats were set to 3" &&
    plainLint.report.conflicts[0].requires[1].value === "that the billed seats were at most 2",
);
const linked = mustSpec(
  'input quantity: Int 0..5 "Count." phrase "the quantity"\noutput shipped: Int 0..6 "Sent." phrase "the number shipped" says "{value} units were shipped" as "ship {value}"\n\nR1 The Box shall ship the quantity.\n',
);
check("linked ignores says", formatTerm(linked.requirements[0].consequent) === "the number shipped is the quantity");
const formLint = lintSpec(mustSpec(readFileSync("examples/order-awkward.ears.md", "utf8")));
check("awkward ran", formLint.kind === "report");
if (formLint.kind === "report") {
  check("awkward conflicts", formLint.report.conflicts.length === 0 && formLint.report.gaps.length === 0);
  let shalls = 0;
  let whens = 0;
  let nots = 0;
  for (let i = 0; i < formLint.report.wording.length; i++) {
    const item = formLint.report.wording[i];
    if (item.kind === "form" && item.word === "shall") shalls++;
    if (item.kind === "form" && item.word === "when") whens++;
    if (item.kind === "form" && item.word === "not") nots++;
  }
  let negations = 0;
  for (let i = 0; i < formLint.report.wording.length; i++) {
    if (formLint.report.wording[i].kind === "negation") negations++;
  }
  check("awkward forms", shalls === 2 && whens === 2 && nots === 0 && negations === 1 && formLint.report.wording.length === 5);
}
const clearLint = lintSpec(mustSpec(readFileSync("examples/order-clear.ears.md", "utf8")));
check(
  "clear form",
  clearLint.kind === "report" &&
    clearLint.report.wording.length === 0 &&
    clearLint.report.conflicts.length === 0 &&
    clearLint.report.gaps.length === 0 &&
    clearLint.report.unused.length === 0,
);
check("action on int", parseMessage('output n: Int 0..1 "N." action "count it"\n') === "1: action is only for Bool");
check("says on bool", parseMessage('output done: Bool "D." says "done {value}"\n') === "1: says is only for Int or enum");
check("as on bool", parseMessage('output done: Bool "D." as "do {value}"\n') === "1: as is only for Int or enum");
check("says needs value", parseMessage('output n: Int 0..1 "N." says "the count"\n') === "1: says needs {value}");
check("as needs value", parseMessage('output n: Int 0..1 "N." as "count the items"\n') === "1: as needs {value}");
check("reserved name as", parseMessage('output as: Int 0..1 "N."\n') === '1: "as" is a reserved word');
check("reserved name says", parseMessage('event says: Bool "S."\n') === '1: "says" is a reserved word');
check("reserved name action", parseMessage('event action: Bool "A."\n') === '1: "action" is a reserved word');
const acted = mustSpec(
  'output started: Bool "Starts." phrase "the subscription is started" action "start the subscription"\n\nR1 When start the subscription, the Box shall start the subscription.\n',
);
check(
  "action phrase",
  acted.requirements[0].antecedent !== null &&
    acted.requirements[0].antecedent.kind === "sym" &&
    acted.requirements[0].consequent.kind === "sym",
);

const repeatLint = lintSpec(mustSpec(readFileSync("examples/order-repeat.ears.md", "utf8")));
check("repeat under conflict ran", repeatLint.kind === "report");
if (repeatLint.kind === "report") {
  check(
    "repeat survives the clash",
    repeatLint.report.conflicts.length === 1 &&
      repeatLint.report.conflicts[0].ids[0] === "R1" &&
      repeatLint.report.conflicts[0].ids[1] === "R2" &&
      repeatLint.report.redundant.length === 1 &&
      repeatLint.report.redundant[0].id === "R5" &&
      repeatLint.report.redundant[0].text ===
        "R5 adds nothing. R4 implies it. Whenever the requirements outside a conflict hold, R5 holds too." &&
      repeatLint.report.redundant[0].impliedBy.length === 1 &&
      repeatLint.report.redundant[0].impliedBy[0] === "R4" &&
      repeatLint.report.duplicate.length === 0 &&
      repeatLint.report.gaps.length === 0,
  );
}
const copyLint = lintSpec(mustSpec(readFileSync("examples/order-duplicate.ears.md", "utf8")));
check("duplicate ran", copyLint.kind === "report");
if (copyLint.kind === "report") {
  check(
    "exact copy is not called redundant",
    copyLint.report.duplicate.length === 1 &&
      copyLint.report.duplicate[0].id === "R2" &&
      copyLint.report.duplicate[0].sameAs === "R1" &&
      copyLint.report.duplicate[0].text === "R2 duplicates R1. The condition and the response are the same." &&
      copyLint.report.redundant.length === 0 &&
      copyLint.report.conflicts.length === 0 &&
      copyLint.report.gaps.length === 0,
  );
}
const tripleCopy = lintSpec(
  mustSpec(
    'event order_submitted: Bool "Submitted." phrase "an order is submitted"\n' +
      'output order_fulfilled: Bool "Fulfilled." phrase "fulfill the order"\n\n' +
      "R1 When an order is submitted, the Box shall fulfill the order.\n" +
      "R2 When an order is submitted, the Box shall fulfill the order.\n" +
      "R3 When an order is submitted, the Box shall fulfill the order.\n" +
      "R4 When an order is not submitted, the Box shall not fulfill the order.\n",
  ),
);
check(
  "three copies name the first",
  tripleCopy.kind === "report" &&
    tripleCopy.report.duplicate.length === 2 &&
    tripleCopy.report.duplicate[0].sameAs === "R1" &&
    tripleCopy.report.duplicate[1].id === "R3" &&
    tripleCopy.report.duplicate[1].sameAs === "R1" &&
    tripleCopy.report.redundant.length === 0,
);
const negationLint = lintSpec(mustSpec(readFileSync("examples/order-negation.ears.md", "utf8")));
check("negated trigger ran", negationLint.kind === "report");
if (negationLint.kind === "report") {
  check(
    "when not a member",
    negationLint.report.wording.length === 1 &&
      negationLint.report.wording[0].kind === "negation" &&
      negationLint.report.wording[0].word === "not" &&
      negationLint.report.wording[0].line === 6 &&
      negationLint.report.conflicts.length === 0 &&
      negationLint.report.gaps.length === 0,
  );
}
const whileNot = lintSpec(
  mustSpec(
    'state member: Bool "A member." phrase "a member is here"\n' +
      'output open: Bool "Open." phrase "open the desk"\n\n' +
      "R1 While not a member is here, the Desk shall open the desk.\n" +
      "R2 While a member is here, the Desk shall not open the desk.\n",
  ),
);
check(
  "while not stays a form issue",
  whileNot.kind === "report" && whileNot.report.wording.length === 1 && whileNot.report.wording[0].kind === "form",
);
const bareWhile = lintSpec(
  mustSpec(
    'event ping: Bool "Ping." phrase "a member asks"\n' +
      'output open: Bool "Open." phrase "open the desk"\n\n' +
      "R1 While not a member asks, the Desk shall open the desk.\n" +
      "R2 While a member asks, the Desk shall not open the desk.\n",
  ),
);
check(
  "while not without is",
  bareWhile.kind === "report" && bareWhile.report.wording.length === 1 && bareWhile.report.wording[0].kind === "negation",
);
const whereNot = lintSpec(
  mustSpec(
    'input region: Int 1..2 "Region." phrase "the region"\n' +
      'event ping: Bool "Ping." phrase "a member asks"\n' +
      'output open: Bool "Open." phrase "open the desk"\n\n' +
      "R1 Where not a member asks, the Desk shall open the desk.\n" +
      "R2 Where a member asks, the Desk shall not open the desk.\n",
  ),
);
check(
  "where not",
  whereNot.kind === "report" && whereNot.report.wording.length === 1 && whereNot.report.wording[0].kind === "negation",
);
const ifNot = lintSpec(
  mustSpec(
    'unwanted event ping: Bool "Ping." phrase "a member asks"\n' +
      'output open: Bool "Open." phrase "open the desk"\n\n' +
      "R1 If not a member asks, then the Desk shall open the desk.\n" +
      "R2 If a member asks, then the Desk shall not open the desk.\n",
  ),
);
check(
  "if not",
  ifNot.kind === "report" && ifNot.report.wording.length === 1 && ifNot.report.wording[0].kind === "negation",
);
const isNot = lintSpec(
  mustSpec(
    'state fine_owed: Bool "A fine." phrase "a fine is owed"\n' +
      'output open: Bool "Open." phrase "open the desk"\n\n' +
      "R1 While a fine is not owed, the Desk shall open the desk.\n" +
      "R2 While a fine is owed, the Desk shall not open the desk.\n",
  ),
);
check("is not is not a bare negation", isNot.kind === "report" && isNot.report.wording.length === 0 && isNot.report.gaps.length === 0);
const measured = lintSpec(mustSpec(readFileSync("examples/order-unmeasured.ears.md", "utf8")));
check("unmeasured ran", measured.kind === "report");
if (measured.kind === "report") {
  check(
    "as needed and not the bound phrase",
    measured.report.wording.length === 1 &&
      measured.report.wording[0].word === "as needed" &&
      measured.report.wording[0].kind === "vague" &&
      measured.report.gaps.length === 0,
  );
}
const boundNeeded = lintSpec(
  mustSpec(
    'event order_submitted: Bool "Submitted." phrase "an order is submitted"\n' +
      'output shipped: Bool "Left." phrase "ship as needed"\n\n' +
      "R1 When an order is submitted, the Box shall ship as needed.\n" +
      "R2 When an order is not submitted, the Box shall not ship as needed.\n",
  ),
);
check(
  "bound as needed",
  boundNeeded.kind === "report" && boundNeeded.report.wording.length === 0 && boundNeeded.report.gaps.length === 0,
);
const looseFast = lintSpec(
  mustSpec(
    'event order_submitted: Bool "Submitted." phrase "an order is submitted"\n' +
      'output order_fulfilled: Bool "Fulfilled." phrase "fulfill the order"\n\n' +
      "R1 When an order is submitted, the Fast Desk shall fulfill the order.\n" +
      "R2 When an order is not submitted, the Desk shall not fulfill the order.\n",
  ),
);
check(
  "unbound fast in the sentence",
  looseFast.kind === "report" &&
    looseFast.report.wording.length === 1 &&
    looseFast.report.wording[0].word === "fast" &&
    looseFast.report.wording[0].kind === "vague",
);

const repairLint = lintSpec(mustSpec(readFileSync("examples/order-repair.ears.md", "utf8")));
check("repair example ran", repairLint.kind === "report");
if (repairLint.kind === "report") {
  const item = repairLint.report.conflicts[0];
  let drops = 0;
  let strengthenR1 = false;
  let strengthenR2 = false;
  for (let i = 0; i < item.repairs.length; i++) {
    const repair = item.repairs[i];
    if (repair.kind === "drop") drops++;
    if (repair.kind === "strengthen" && repair.id === "R1" && repair.sentence.indexOf("and the copy is not out on loan") !== -1) {
      strengthenR1 = true;
    }
    if (repair.kind === "strengthen" && repair.id === "R2" && repair.sentence.indexOf("and the copy is not in the building") !== -1) {
      strengthenR2 = true;
    }
  }
  check(
    "repair example candidates",
    repairLint.report.conflicts.length === 1 &&
      item.ids[0] === "R1" &&
      item.ids[1] === "R2" &&
      drops === 2 &&
      strengthenR1 &&
      strengthenR2 &&
      item.repairs.length === 4,
  );
  const problems = buildProblems("examples/order-repair.ears.md", mustSpec(readFileSync("examples/order-repair.ears.md", "utf8")), repairLint.report);
  check(
    "repair report asks and does not choose",
    problems.text.indexOf("Which requirement should win?") !== -1 &&
      problems.text.indexOf("This report does not choose.") !== -1 &&
      problems.text.indexOf("Candidate repairs follow. This report does not choose one.") !== -1 &&
      problems.text.indexOf("and the copy is not out on loan") !== -1 &&
      problems.text.indexOf("keeps ") === -1 &&
      problems.text.indexOf("breaks ") === -1,
  );
  let r1Sentence = "";
  for (let i = 0; i < item.repairs.length; i++) {
    if (item.repairs[i].kind === "strengthen" && item.repairs[i].id === "R1") r1Sentence = item.repairs[i].sentence;
  }
  const strengthened = applySentence(mustSpec(readFileSync("examples/order-repair.ears.md", "utf8")), "R1", r1Sentence);
  const again = strengthened === null ? null : lintSpec(strengthened);
  check(
    "strengthen removes that conflict",
    again !== null &&
      again.kind === "report" &&
      again.report.conflicts.length === 0,
  );
}

const sameTrigger = lintSpec(mustSpec(readFileSync("examples/order-conflict.ears.md", "utf8")));
check("same trigger has no strengthen", sameTrigger.kind === "report");
if (sameTrigger.kind === "report") {
  const repairs = sameTrigger.report.conflicts[0].repairs;
  let onlyDrops = repairs.length === 2;
  for (let i = 0; i < repairs.length; i++) {
    if (repairs[i].kind !== "drop") onlyDrops = false;
  }
  check("same trigger repairs are the two drops", onlyDrops && repairs[0].id === "R2" && repairs[1].id === "R3");
}

const boundRepair = lintSpec(
  mustSpec(
    'input length: Int 1..10 "How long." phrase "the length"\n' +
      'output ok: Bool "Allowed." phrase "allow it" outcome "it was allowed" / "it was not allowed"\n\n' +
      "R1 When the length is at least 1, the Desk shall allow it.\n" +
      "R2 When the length is at least 5, the Desk shall not allow it.\n",
  ),
);
check("int bound repair ran", boundRepair.kind === "report");
if (boundRepair.kind === "report") {
  const repairs = boundRepair.report.conflicts[0].repairs;
  let saw = false;
  let strengthenedR2 = false;
  for (let i = 0; i < repairs.length; i++) {
    if (repairs[i].kind === "strengthen" && repairs[i].id === "R1" && repairs[i].sentence.indexOf("less than 5") !== -1) saw = true;
    if (repairs[i].kind === "strengthen" && repairs[i].id === "R2") strengthenedR2 = true;
  }
  check("int bound strengthens only the wider requirement", saw && !strengthenedR2);
}

const enumRepair = lintSpec(
  mustSpec(
    "enum Lane { fast, slow }\n" +
      'input lane: Lane "Which lane." phrase "the lane"\n' +
      'state ready: Bool "Ready." phrase "it is ready"\n' +
      'output go: Bool "Go." phrase "allow it" outcome "it was allowed" / "it was not allowed"\n\n' +
      "R1 When it is ready, the Desk shall allow it.\n" +
      "R2 When it is ready and the lane is fast, the Desk shall not allow it.\n",
  ),
);
check("enum repair ran", enumRepair.kind === "report");
if (enumRepair.kind === "report") {
  const repairs = enumRepair.report.conflicts[0].repairs;
  let saw = false;
  for (let i = 0; i < repairs.length; i++) {
    if (repairs[i].kind === "strengthen" && repairs[i].id === "R1" && repairs[i].text.indexOf("the lane is slow") !== -1) saw = true;
  }
  check("enum equality strengthens the wider requirement", saw);
}

const openRepair = lintSpec(
  mustSpec(
    'state ready: Bool "Ready." phrase "it is ready"\n' +
      'output go: Bool "Go." phrase "allow it" outcome "it was allowed" / "it was not allowed"\n\n' +
      "R1 The Desk shall allow it.\n" +
      "R2 When it is ready, the Desk shall not allow it.\n",
  ),
);
check("ubiquitous repair ran", openRepair.kind === "report");
if (openRepair.kind === "report") {
  const repairs = openRepair.report.conflicts[0].repairs;
  let saw = false;
  for (let i = 0; i < repairs.length; i++) {
    if (repairs[i].kind === "strengthen" && repairs[i].sentence === "When it is not ready, the Desk shall allow it.") saw = true;
  }
  check("ubiquitous repair adds a when clause", saw);
}

const orRepair = lintSpec(
  mustSpec(
    'state ready: Bool "Ready." phrase "it is ready"\n' +
      'state open: Bool "Open." phrase "the desk is open"\n' +
      'output go: Bool "Go." phrase "allow it" outcome "it was allowed" / "it was not allowed"\n\n' +
      "R1 When it is ready or the desk is open, the Desk shall allow it.\n" +
      "R2 When it is ready and the desk is open, the Desk shall not allow it.\n",
  ),
);
check("or repair ran", orRepair.kind === "report");
if (orRepair.kind === "report") {
  const repairs = orRepair.report.conflicts[0].repairs;
  let paren = false;
  for (let i = 0; i < repairs.length; i++) {
    if (repairs[i].kind === "strengthen" && repairs[i].sentence.indexOf("(it is ready or the desk is open)") !== -1) paren = true;
  }
  check("or repair parenthesizes the old condition", paren);
}

function requirementById(spec: Spec, id: string): Requirement | null {
  for (let i = 0; i < spec.requirements.length; i++) {
    if (spec.requirements[i].id === id) return spec.requirements[i];
  }
  return null;
}

function roundGenerated(label: string, spec: Spec): GeneratedScenarios {
  const report = generateScenarios(spec);
  for (let i = 0; i < report.files.length; i++) {
    const file = report.files[i];
    const json = parseScenarioJson(file.body);
    check(label + " " + file.file + " parses", json.ok);
    if (!json.ok) continue;
    const bound = bindScenario(spec, json.object);
    check(label + " " + file.file + " binds", bound.ok);
    if (!bound.ok) continue;
    const violations = evaluate(spec, bound.env);
    const req = requirementById(spec, file.id);
    if (file.kind === "rejected") {
      check(label + " " + file.file + " one break", violations.length === 1 && violations[0].id === file.id);
      if (req !== null && req.antecedent !== null) {
        check(label + " " + file.file + " trigger on", evalBool(req.antecedent, spec, bound.env) === T_TRUE);
      }
    } else {
      check(label + " " + file.file + " holds", violations.length === 0);
      if (req !== null && req.antecedent !== null) {
        const trigger = evalBool(req.antecedent, spec, bound.env);
        if (file.condition === 0) check(label + " " + file.file + " trigger on", trigger === T_TRUE);
        else check(label + " " + file.file + " trigger off", trigger === T_FALSE);
      }
    }
  }
  return report;
}

function generatedBody(report: GeneratedScenarios, name: string): string {
  for (let i = 0; i < report.files.length; i++) {
    if (report.files[i].file === name) return report.files[i].body;
  }
  return "";
}

function generatedText(report: GeneratedScenarios, name: string): string {
  for (let i = 0; i < report.files.length; i++) {
    if (report.files[i].file === name) return report.files[i].text;
  }
  return "";
}

function uncoveredText(report: GeneratedScenarios, id: string, condition: number): string {
  for (let i = 0; i < report.uncovered.length; i++) {
    const item = report.uncovered[i];
    if (item.id === id && item.condition === condition) return item.text;
  }
  return "";
}

const orderGenerated = roundGenerated("order files", order);
check("order file count", orderGenerated.files.length === 5 && orderGenerated.uncovered.length === 0);
check(
  "order accepted body",
  generatedBody(orderGenerated, "R1-accepted.json").indexOf('"order_fulfilled": true') >= 0 &&
    generatedBody(orderGenerated, "R1-accepted.json").indexOf('"order_submitted": true') >= 0,
);
check(
  "order rejected bodies match for and",
  generatedBody(orderGenerated, "R1-rejected-cond1.json") === generatedBody(orderGenerated, "R1-rejected-cond2.json") &&
    generatedBody(orderGenerated, "R1-rejected-cond1.json").indexOf('"order_fulfilled": false') >= 0,
);
check(
  "order flips differ",
  generatedBody(orderGenerated, "R1-accepted-cond1.json") !== generatedBody(orderGenerated, "R1-accepted-cond2.json") &&
    generatedBody(orderGenerated, "R1-accepted-cond1.json").indexOf('"order_submitted": false') >= 0 &&
    generatedBody(orderGenerated, "R1-accepted-cond2.json").indexOf('"inventory_available": false') >= 0,
);
check("order manifest ok", formatGeneratedJson("examples/order.ears.md", "out", orderGenerated).indexOf('"ok": true') >= 0);

const orGenerated = roundGenerated("or files", mustSpec(readFileSync("examples/order-or.ears.md", "utf8")));
check("or file count", orGenerated.files.length === 5 && orGenerated.uncovered.length === 0);
check(
  "or rejected bodies differ",
  generatedBody(orGenerated, "R1-rejected-cond1.json") !== generatedBody(orGenerated, "R1-rejected-cond2.json") &&
    generatedBody(orGenerated, "R1-rejected-cond1.json").indexOf('"rush_order": true') >= 0 &&
    generatedBody(orGenerated, "R1-rejected-cond1.json").indexOf('"fragile_item": false') >= 0 &&
    generatedBody(orGenerated, "R1-rejected-cond2.json").indexOf('"rush_order": false') >= 0 &&
    generatedBody(orGenerated, "R1-rejected-cond2.json").indexOf('"fragile_item": true') >= 0,
);

const coveredGenerated = roundGenerated("covered files", mustSpec(readFileSync("examples/order-covered.ears.md", "utf8")));
check("covered file count", coveredGenerated.files.length === 13 && coveredGenerated.uncovered.length === 0);

const vacuousGenerated = roundGenerated("vacuous files", mustSpec(readFileSync("examples/order-vacuous.ears.md", "utf8")));
check(
  "vacuous only ubiquitous",
  vacuousGenerated.files.length === 2 &&
    vacuousGenerated.files[0].file === "R3-accepted.json" &&
    vacuousGenerated.files[1].file === "R3-rejected.json" &&
    uncoveredText(vacuousGenerated, "R1", 0) === "The trigger is impossible for every allowed value." &&
    uncoveredText(vacuousGenerated, "R2", 0) === "The trigger is impossible for every allowed value.",
);

const combinedGenerated = roundGenerated("combined files", mustSpec(readFileSync("examples/order-combined.ears.md", "utf8")));
check(
  "combined region flip",
  generatedBody(combinedGenerated, "R1.2-accepted-cond4.json").indexOf('"region": "eu"') >= 0 &&
    generatedText(combinedGenerated, "R1.2-accepted-cond4.json").indexOf("set to eu") >= 0 &&
    generatedText(combinedGenerated, "R1.2-accepted-cond4.json").indexOf("set to us") < 0,
);
check(
  "combined quantity cannot flip",
  combinedGenerated.uncovered.length === 1 &&
    uncoveredText(combinedGenerated, "R1.2", 3) ===
      'condition 3 ("the quantity is at least 1") cannot be false while the other conditions let it decide the trigger, so it cannot flip the outcome.',
);

const conflictGenerated = roundGenerated("conflict files", mustSpec(readFileSync("examples/order-conflict.ears.md", "utf8")));
check("conflict has no R2 accepted file", generatedBody(conflictGenerated, "R2-accepted.json").length === 0);
check(
  "conflict uncovered",
  uncoveredText(conflictGenerated, "R2", 0) === "Keeping the other requirements leaves no scenario where this trigger is true." &&
    uncoveredText(conflictGenerated, "R3", 0) === "Keeping the other requirements leaves no scenario where this trigger is true." &&
    uncoveredText(conflictGenerated, "R1", 1).indexOf("No scenario keeps every requirement while condition 1") === 0,
);

const soundnessSpecs = runSoundness();
check("soundness specs", soundnessSpecs === 1010);
console.log("soundness specs: " + String(soundnessSpecs));

if (failed !== 0) {
  console.error(String(failed) + " failed");
  process.exit(1);
}
console.log("passed " + String(passed));
process.exit(0);
