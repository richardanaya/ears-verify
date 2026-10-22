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
import type { Spec } from "../src/spec.ts";
import { printSmt } from "../src/smt.ts";
import { spaceSize } from "../src/solver.ts";
import { formatTerm } from "../src/term.ts";

let passed = 0;
let failed = 0;

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
      "Nothing says whether the order was fulfilled when an order was submitted and inventory was not available.",
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
    covered.report.wording.length === 0,
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
}

const wide = mustSpec(readFileSync("examples/order-wide.ears.md", "utf8"));
check("wide space", spaceSize(wide) < 0);
const wideLint = lintSpec(wide);
check("wide lint errors", wideLint.kind === "error" && wideLint.message.indexOf("250000") !== -1);

const exact = mustSpec('output quantity: Int 1..250000 "A count."\n\nR1 The Counter shall quantity = 1.\n');
check("exact limit", spaceSize(exact) === 250000);
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

check("should", parseMessage('event flag: Bool "Flag."\n\nR1 When flag, the Order System should flag.\n') === '3: expected "shall"');
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
    item.requires[0].value === "that the quantity was at most 10" && item.requires[1].value === "that the quantity was 12",
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
    item.requires[0].value === "that the status was shipped" && item.requires[1].value === "that the status was cancelled",
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

if (failed !== 0) {
  console.error(String(failed) + " failed");
  process.exit(1);
}
console.log("passed " + String(passed));
process.exit(0);
