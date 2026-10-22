/**
 * Parser, scenario check, SMT printer, and lint behavior.
 * The native build of this file must print the same bytes as Node.
 */

import { readFileSync } from "node:fs";
import { bindScenario, evaluate } from "../src/check.ts";
import { parseSpec } from "../src/ears.ts";
import { parseScenarioJson } from "../src/jsonvalue.ts";
import { lintSpec } from "../src/lint.ts";
import type { Spec } from "../src/spec.ts";
import { printSmt } from "../src/smt.ts";
import { spaceSize } from "../src/solver.ts";
import { formatTerm } from "../src/term.ts";
import { canonicalizeUrl } from "../src/url.ts";

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

const failScenario = scenario(
  order,
  '{ "order_submitted": true, "inventory_available": true, "order_fulfilled": false }',
);
check("fail count", failScenario.violations === 1);
check(
  "fail because",
  failScenario.because === "order_submitted is true, inventory_available is true, and order_fulfilled is false.",
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
check("smt sentence", smt.indexOf("line 7: When order_submitted and inventory_available, the Order System shall order_fulfilled.") !== -1);
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
    misuse.report.conflicts.length === 0,
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

function canon(input: string): { url: string; rules: string; error: string } {
  const result = canonicalizeUrl(input);
  if (!result.ok) return { url: "", rules: "", error: result.message };
  let rules = "";
  for (let i = 0; i < result.violations.length; i++) {
    if (i > 0) rules += "|";
    rules += result.violations[i];
  }
  return { url: result.canonical, rules: rules, error: "" };
}

const ordersUrl = canon("HTTPS://Example.COM:443/customer/{CustomerId}/order/?status={status}");
check(
  "orders canonical",
  ordersUrl.url === "https://example.com/customers/{customerId}/orders?status={status}" && ordersUrl.error === "",
);
check(
  "orders rules",
  ordersUrl.rules ===
    "lowercase the scheme|lowercase the host|omit the default port|no trailing slash except the root|plural collection nouns|use {camelCase} placeholders",
);
const ordersAgain = canon(ordersUrl.url);
check("orders idempotent", ordersAgain.url === ordersUrl.url && ordersAgain.rules === "");

const pasted = canon("HTTPS://bob@Example.COM:443/a/./b/%7Ehome/");
check("pasted canonical", pasted.url === "https://example.com/a/b/~home" && pasted.error === "");
check(
  "pasted rules",
  pasted.rules ===
    "lowercase the scheme|lowercase the host|omit the default port|decode unreserved characters|remove dot segments|no trailing slash except the root|no userinfo",
);

const sorted = canon("https://example.com/items?b=2&a=1#");
check("sorted canonical", sorted.url === "https://example.com/items?a=1&b=2" && sorted.error === "");
check("sorted rules", sorted.rules === "no empty fragment|sort query keys");

const hyphen = canon("https://example.com/New-Orders/address/");
check("hyphen and plural", hyphen.url === "https://example.com/new-orders/addresses");
check("hyphen rules", hyphen.rules.indexOf("lowercase hyphenated path segments") !== -1 && hyphen.rules.indexOf("plural collection nouns") !== -1);

const camel = canon("https://example.com/customers/{customer_id}/orders");
check("snake placeholder", camel.url === "https://example.com/customers/{customerId}/orders" && camel.rules === "use {camelCase} placeholders");

const percent = canon("https://example.com/a%2fb");
check("uppercase hex", percent.url === "https://example.com/a%2Fb" && percent.rules === "uppercase percent-encoding hex");

const httpPort = canon("HTTP://Example.COM:80/Orders");
check("http default port", httpPort.url === "http://example.com/orders");

const ipv6 = canon("https://[2001:DB8::1]/a/../b");
check("ipv6 dot", ipv6.url === "https://[2001:db8::1]/b");

const root = canon("https://example.com/");
check("root slash stays", root.url === "https://example.com/" && root.rules === "");

const emptyPath = canon("https://example.com");
check("empty path stays", emptyPath.url === "https://example.com" && emptyPath.rules === "");

check("empty url", canon("").error === "empty input");
check("bad scheme", canon("1https://example.com").error === "invalid scheme");
check("missing scheme", canon("example.com").error === "missing scheme");
check("bad port", canon("https://example.com:").error === "empty port");
check("huge port", canon("https://example.com:99999").error === "port out of range");
check("bad ipv6", canon("https://[:::]/").error === "invalid IPv6 address");
check("userinfo ipv6", canon("https://bob@[2001:db8::1]/a").url === "https://[2001:db8::1]/a");

const urlSpec = mustSpec(readFileSync("examples/url-orders.ears.md", "utf8"));
check("url symbols", urlSpec.symbols.length === 7 && urlSpec.symbols[0].name === "url.scheme" && urlSpec.symbols[3].name === "url.port");
const portSort = urlSpec.symbols[3].sort;
check("url port range", portSort.kind === "int" && portSort.min === -1 && portSort.max === 65535);
const passUrl = scenario(urlSpec, readFileSync("examples/url-orders-pass.json", "utf8"));
check("url pass", passUrl.violations === 0);
const failUrl = scenario(urlSpec, readFileSync("examples/url-orders-fail.json", "utf8"));
check("url fail", failUrl.violations === 1 && failUrl.because === 'url.scheme is "http".');
const urlSmt = printSmt("examples/url-orders.ears.md", urlSpec);
check("url smt suffix", urlSmt.indexOf('(str.suffixof ".example.com" |url.host|)') !== -1);
check("url smt port", urlSmt.indexOf("(= |url.port| (- 1))") !== -1);
check("url smt empty", urlSmt.indexOf('(= |url.userinfo| "")') !== -1);

const clash = lintSpec(mustSpec(readFileSync("examples/url-scheme-clash.ears.md", "utf8")));
check("scheme clash", clash.kind === "report" && clash.report.conflicts.length === 1);
if (clash.kind === "report") {
  check("scheme clash ids", clash.report.conflicts[0].ids[0] === "R1" && clash.report.conflicts[0].ids[1] === "R2");
  check("scheme clash example hidden", clash.report.conflicts[0].exampleJson === "");
  check("scheme clash every", clash.report.conflicts[0].everySituation === true);
}

const selfUrl = lintSpec(mustSpec('R1 The Shop shall url.scheme = "https" and url.scheme = "http".\n'));
check("self url clash", selfUrl.kind === "report" && selfUrl.report.conflicts.length === 1 && selfUrl.report.conflicts[0].ids.length === 1);

const either = lintSpec(mustSpec('R1 The Shop shall url.scheme = "https" or url.scheme = "http".\n'));
check("or is not a clash", either.kind === "report" && either.report.conflicts.length === 0);

const suffixClash = lintSpec(
  mustSpec('R1 The Shop shall url.host = "evil.com".\nR2 The Shop shall url.host ends with ".example.com".\n'),
);
check("suffix clash", suffixClash.kind === "report" && suffixClash.report.conflicts.length === 1);

const textOps = mustSpec(
  'R1 The Shop shall url.host starts with "shop.".\nR2 The Shop shall url.query contains "status=".\nR3 The Shop shall not url.userinfo is empty.\n',
);
check(
  "starts with holds",
  scenario(textOps, '{ "url.host": "shop.example.com", "url.query": "status={status}", "url.userinfo": "ada" }').violations === 0,
);
check(
  "contains fails",
  scenario(textOps, '{ "url.host": "shop.example.com", "url.query": "page=1", "url.userinfo": "ada" }').violations === 1,
);
check("string required", scenario(textOps, '{ "url.host": "shop.example.com", "url.query": "status={status}", "url.userinfo": 1 }').because === "url.userinfo must be a string");
check("starts with term", formatTerm(textOps.requirements[0].consequent) === 'url.host starts with "shop."');

const items = mustSpec(readFileSync("examples/url-items.ears.md", "utf8"));
check("items pass", scenario(items, readFileSync("examples/url-items-pass.json", "utf8")).violations === 0);
check("mailto lower", canon("Mailto:User@Example.COM").url === "mailto:User@Example.COM");

if (failed !== 0) {
  console.error(String(failed) + " failed");
  process.exit(1);
}
console.log("passed " + String(passed));
process.exit(0);
