/**
 * Ground-check translated requirements and format the report.
 * Text and JSON are built from fixed fields so Node and the native
 * binary emit the same bytes.
 */

import type { Requirement } from "./ears.ts";
import { assertionsFrom, judge } from "./smt.ts";
import type { UrlParts } from "./url.ts";

export interface Violation {
  id: string;
  line: number;
  sentence: string;
  reason: string;
}

export interface CheckReport {
  ok: boolean;
  violations: Violation[];
}

interface JsonBody {
  command: string;
  ok: boolean;
  spec: string;
  url: string;
  violations: Violation[];
}

interface JsonError {
  command: string;
  ok: boolean;
  error: string;
}

export function checkUrl(requirements: Requirement[], url: UrlParts): CheckReport {
  const assertions = assertionsFrom(requirements);
  const violations: Violation[] = [];
  for (let i = 0; i < assertions.length; i++) {
    const assertion = assertions[i];
    const verdict = judge(assertion.term, url);
    if (!verdict.holds) {
      violations.push({
        id: assertion.id,
        line: assertion.line,
        sentence: assertion.sentence,
        reason: verdict.reason,
      });
    }
  }
  return { ok: violations.length === 0, violations: violations };
}

export function formatText(specPath: string, rawUrl: string, report: CheckReport): string {
  let out = "check: " + String(report.violations.length) + " violations\n";
  out += "spec: " + specPath + "\n";
  out += "url: " + rawUrl + "\n";
  for (let i = 0; i < report.violations.length; i++) {
    const violation = report.violations[i];
    out += violation.id + " line " + String(violation.line) + "\n";
    out += "  sentence: " + violation.sentence + "\n";
    out += "  reason: " + violation.reason + "\n";
  }
  return out;
}

export function formatJson(specPath: string, rawUrl: string, report: CheckReport): string {
  const violations: Violation[] = [];
  for (let i = 0; i < report.violations.length; i++) {
    const violation = report.violations[i];
    violations.push({
      id: violation.id,
      line: violation.line,
      sentence: violation.sentence,
      reason: violation.reason,
    });
  }
  const body: JsonBody = {
    command: "check",
    ok: report.ok,
    spec: specPath,
    url: rawUrl,
    violations: violations,
  };
  return JSON.stringify(body, null, 2) + "\n";
}

export function formatErrorJson(message: string): string {
  const body: JsonError = {
    command: "check",
    ok: false,
    error: message,
  };
  return JSON.stringify(body, null, 2) + "\n";
}
