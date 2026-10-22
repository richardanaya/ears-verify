/**
 * Unit tests for the EARS parser, RFC 3986 URL parser, and SMT evaluator.
 * This file is itself a ScriptC entry so the same checks run under Node
 * and in the native binary. Keep the output free of paths, timings, and
 * anything else that would differ between the two.
 */

import { readFileSync } from "node:fs";
import { parseSentence, parseSpec } from "../src/ears.ts";
import { checkUrl } from "../src/check.ts";
import { assertionsFrom, judge, predToTerm, printSmt, printTerm } from "../src/smt.ts";
import { formatInt } from "../src/text.ts";
import { parseUrl } from "../src/url.ts";
import type { UrlParts } from "../src/url.ts";

let passed = 0;
let failed = 0;

function expectEq(name: string, actual: string, expected: string): void {
  if (actual === expected) {
    console.log("PASS " + name);
    passed++;
    return;
  }
  console.log("FAIL " + name);
  console.log("  actual: " + actual);
  console.log("  expected: " + expected);
  failed++;
}

function dump(url: UrlParts): string {
  return (
    url.scheme +
    "|" +
    url.userinfo +
    "|" +
    url.host +
    "|" +
    formatInt(url.port) +
    "|" +
    url.path +
    "|" +
    url.query +
    "|" +
    url.fragment
  );
}

function expectUrl(input: string, expected: string): void {
  const parsed = parseUrl(input);
  if (!parsed.ok) {
    expectEq("url " + input, "ERROR " + parsed.message, expected);
    return;
  }
  expectEq("url " + input, dump(parsed.url), expected);
}

function expectUrlError(input: string, message: string): void {
  const parsed = parseUrl(input);
  if (parsed.ok) {
    expectEq("url error " + input, "parsed " + dump(parsed.url), message);
    return;
  }
  expectEq("url error " + input, parsed.message, message);
}

function run(): void {
  expectUrl("https://example.com/path", "https||example.com|-1|/path||");
  expectUrl("https://bob@evil.com", "https|bob|evil.com|-1|||");
  expectUrl("https://bob:secret@example.com:8443/a/b?x=1#f", "https|bob:secret|example.com|8443|/a/b|x=1|f");
  expectUrl("HTTPS://Example.COM/Path", "https||example.com|-1|/Path||");
  expectUrl("https://127.0.0.1:8080/x", "https||127.0.0.1|8080|/x||");
  expectUrl("https://[::1]/", "https||::1|-1|/||");
  expectUrl("https://[2001:DB8::1]/a", "https||2001:db8::1|-1|/a||");
  expectUrl("https://bob@[::1]:443/x", "https|bob|::1|443|/x||");
  expectUrl("https://[v1.fe80]/", "https||v1.fe80|-1|/||");
  expectUrl("https://example.com:0/", "https||example.com|0|/||");
  expectUrl("https://example.com:65535/", "https||example.com|65535|/||");
  expectUrl("https://example.com/a%20b", "https||example.com|-1|/a%20b||");
  expectUrl("https://example.com?#f", "https||example.com|-1|||f");
  expectUrl("urn:example:animal", "urn|||-1|example:animal||");
  expectUrl("http:/absolute", "http|||-1|/absolute||");
  expectUrl("https://example.com", "https||example.com|-1|||");
  expectUrl("https://@example.com", "https||example.com|-1|||");

  expectUrlError("", "empty input");
  expectUrlError("not a url", "missing scheme");
  expectUrlError("1http://example.com", "invalid scheme");
  expectUrlError("http://ex ample.com", "invalid character in host");
  expectUrlError("http://example.com:99999", "port out of range");
  expectUrlError("http://example.com:abc", "invalid port");
  expectUrlError("http://example.com:", "empty port");
  expectUrlError("https://example.com/%", "invalid character in path");
  expectUrlError("https://example.com/%2G", "invalid character in path");
  expectUrlError("https://example.com/a\\b", "invalid character in path");
  expectUrlError("http://[:::1]/", "invalid IPv6 address");
  expectUrlError("http://[gggg::1]/", "invalid IPv6 address");

  const specText = readFileSync("examples/url-safety.ears.md", "utf8");
  const spec = parseSpec(specText);
  if (!spec.ok) {
    expectEq("example spec", spec.message, "ok");
  } else {
    expectEq("example count", String(spec.requirements.length), "3");
    expectEq("example id0", spec.requirements[0].id, "R1.1");
    expectEq("example line0", String(spec.requirements[0].line), "5");
    expectEq("example id1", spec.requirements[1].id, "R1.2");
    expectEq("example line1", String(spec.requirements[1].line), "7");
    expectEq("example id2", spec.requirements[2].id, "R1.3");
    expectEq("example line2", String(spec.requirements[2].line), "9");
    expectEq("example clauses0", String(spec.requirements[0].clauses.length), "0");
    expectEq("example kw2-0", spec.requirements[2].clauses[0].keyword, "when");
    expectEq("example kw2-1", spec.requirements[2].clauses[1].keyword, "if");
    expectEq("example system", spec.requirements[0].system, "url-parser");

    const bad = parseUrl("https://bob@evil.com");
    const good = parseUrl("https://example.com/path");
    if (!bad.ok || !good.ok) {
      expectEq("example urls", "parse failed", "ok");
    } else {
      const badReport = checkUrl(spec.requirements, bad.url);
      const goodReport = checkUrl(spec.requirements, good.url);
      expectEq("bad count", String(badReport.violations.length), "3");
      expectEq("bad id0", badReport.violations[0].id + ":" + String(badReport.violations[0].line), "R1.1:5");
      expectEq("bad reason0", badReport.violations[0].reason, "userinfo is \"bob\"; required empty userinfo");
      expectEq("bad id1", badReport.violations[1].id + ":" + String(badReport.violations[1].line), "R1.2:7");
      expectEq("bad reason1", badReport.violations[1].reason, "host is \"evil.com\"; required host \"example.com\"");
      expectEq("bad id2", badReport.violations[2].id + ":" + String(badReport.violations[2].line), "R1.3:9");
      expectEq("bad reason2", badReport.violations[2].reason, "port is omitted; required explicit port 443");
      expectEq("good count", String(goodReport.violations.length), "0");
      const again = checkUrl(spec.requirements, bad.url);
      expectEq(
        "deterministic",
        badReport.violations[0].reason + "|" + badReport.violations[2].reason,
        again.violations[0].reason + "|" + again.violations[2].reason,
      );

      const smt = printSmt("examples/url-safety.ears.md", assertionsFrom(spec.requirements));
      expectEq("smt stable", smt, printSmt("examples/url-safety.ears.md", assertionsFrom(spec.requirements)));
      expectEq(
        "smt R1.1",
        assertLine(smt, "R1.1_L5"),
        "(assert (! (=> true (= userinfo \"\")) :named R1.1_L5))",
      );
      expectEq(
        "smt R1.2",
        assertLine(smt, "R1.2_L7"),
        "(assert (! (=> true (= host \"example.com\")) :named R1.2_L7))",
      );
      expectEq(
        "smt R1.3",
        assertLine(smt, "R1.3_L9"),
        "(assert (! (=> (and (= scheme \"https\") (not (= host \"example.com\"))) (= port 443)) :named R1.3_L9))",
      );
      expectEq(
        "smt comment",
        commentHas(smt, "line 5: The url-parser shall reject a non-empty userinfo.") ? "yes" : "no",
        "yes",
      );
    }
  }

  const wrapped = parseSpec("R2.1 The url-parser shall\n  reject a non-empty userinfo.\n");
  if (!wrapped.ok) expectEq("wrapped", wrapped.message, "ok");
  else {
    expectEq("wrapped line", String(wrapped.requirements[0].line), "1");
    expectEq(
      "wrapped sentence",
      wrapped.requirements[0].sentence,
      "The url-parser shall reject a non-empty userinfo.",
    );
    expectEq("wrapped kind", wrapped.requirements[0].response.kind, "empty");
  }

  const duplicate = parseSpec(
    'R1.1 The url-parser shall reject a non-empty userinfo.\n\nR1.1 The url-parser shall accept only host "example.com".\n',
  );
  expectEq("duplicate", duplicate.ok ? "ok" : duplicate.message, "duplicate requirement id R1.1");

  const order = parseSpec(
    'R1.1 If scheme is "https", when host is "evil.com", the url-parser shall reject a non-empty userinfo.\n',
  );
  expectEq(
    "clause order",
    order.ok ? "ok" : order.message,
    "clauses must appear in order: while, when, if, where",
  );

  const should = parseSentence("The url-parser should reject a non-empty userinfo.");
  expectEq("should", should.ok ? "ok" : should.message, "expected \"shall\"");

  const where = parseSentence('Where path starts with "/", the url-parser shall accept only host "example.com".');
  if (!where.ok) expectEq("where", where.message, "ok");
  else {
    expectEq("where keyword", where.clauses[0].keyword, "where");
    expectEq("where kind", where.clauses[0].pred.kind, "prefix");
  }

  const chain = parseSpec(
    'R4.1 While userinfo is empty, when scheme is "https", if host is "example.com", where path starts with "/", the url-parser shall accept only host "example.com".\n',
  );
  if (!chain.ok) expectEq("chain", chain.message, "ok");
  else {
    expectEq("chain keywords", clauseKeys(chain.requirements[0].clauses), "while,when,if,where");
    const good = parseUrl("https://example.com/path");
    if (!good.ok) expectEq("chain url", "error", "ok");
    else expectEq("chain holds", checkUrl(chain.requirements, good.url).ok ? "yes" : "no", "yes");
  }

  const hosts = parseSentence(
    'The url-parser shall accept only host "Example.COM" or "www.example.com".',
  );
  if (!hosts.ok) expectEq("hosts", hosts.message, "ok");
  else expectEq("hosts term", printTerm(predToTerm(hosts.response)), "(or (= host \"example.com\") (= host \"www.example.com\"))");

  const omitted = parseSentence("The url-parser shall require an omitted port.");
  if (!omitted.ok) expectEq("omitted parse", omitted.message, "ok");
  else {
    expectEq("omitted term", printTerm(predToTerm(omitted.response)), "(= port (- 1))");
    const withPort = parseUrl("https://example.com:443/");
    if (!withPort.ok) expectEq("omitted url", "error", "ok");
    else {
      const verdict = judge(
        { kind: "implies", left: { kind: "bool", value: true }, right: predToTerm(omitted.response) },
        withPort.url,
      );
      expectEq("omitted reason", verdict.holds ? "holds" : verdict.reason, "port is 443; required omitted port");
    }
  }

  const none = parseSpec("# only a heading\n");
  expectEq("empty spec", none.ok ? "ok" : none.message, "no requirements found");

  console.log("unit: " + String(passed) + " passed, " + String(failed) + " failed");
  if (failed !== 0) process.exit(1);
  process.exit(0);
}

function assertLine(smt: string, name: string): string {
  const lines = smt.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].indexOf(":named " + name) !== -1) return lines[i];
  }
  return "";
}

function commentHas(smt: string, needle: string): boolean {
  return smt.indexOf(needle) !== -1;
}

function clauseKeys(clauses: { keyword: string }[]): string {
  let out = "";
  for (let i = 0; i < clauses.length; i++) {
    if (i > 0) out += ",";
    out += clauses[i].keyword;
  }
  return out;
}

run();
