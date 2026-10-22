/**
 * Print a spec as SMT-LIB. Each requirement becomes one named implication.
 * Integer ranges are unnamed assertions. The file is for people to read;
 * lint uses the solver in solver.ts and does not call an external prover.
 */

import { findEnum, type Spec, type SymbolDecl } from "./spec.ts";
import { formatSmtTerm } from "./term.ts";
import { formatInt, formatSmtInt } from "./text.ts";

export function printSmt(specPath: string, spec: Spec): string {
  const lines: string[] = [];
  lines.push("; spec: " + specPath);
  lines.push("(set-logic ALL)");
  for (let i = 0; i < spec.enums.length; i++) {
    const decl = spec.enums[i];
    let variants = "";
    for (let v = 0; v < decl.variants.length; v++) {
      if (v > 0) variants += " ";
      variants += "(" + decl.variants[v] + ")";
    }
    lines.push("; enum " + decl.name + " { " + decl.variants.join(", ") + " }");
    lines.push("(declare-datatypes ((" + decl.name + " 0)) ((" + variants + ")))");
  }
  for (let i = 0; i < spec.symbols.length; i++) {
    const sym = spec.symbols[i];
    lines.push("; " + symbolComment(spec, sym));
    lines.push("(declare-fun " + sym.name + " () " + sortName(sym) + ")");
    if (sym.sort.kind === "int") {
      lines.push(
        "(assert (and (>= " +
          sym.name +
          " " +
          formatSmtInt(sym.sort.min) +
          ") (<= " +
          sym.name +
          " " +
          formatSmtInt(sym.sort.max) +
          ")))",
      );
    }
  }
  for (let i = 0; i < spec.requirements.length; i++) {
    const req = spec.requirements[i];
    const name = req.id + "_L" + formatInt(req.line);
    lines.push("; " + name + " line " + formatInt(req.line) + ": " + req.sentence);
    const body =
      req.antecedent === null
        ? formatSmtTerm(req.consequent)
        : "(=> " + formatSmtTerm(req.antecedent) + " " + formatSmtTerm(req.consequent) + ")";
    lines.push("(assert (! " + body + " :named " + name + "))");
  }
  return lines.join("\n");
}

function symbolComment(spec: Spec, sym: SymbolDecl): string {
  const prefix = sym.unwanted ? "unwanted " + sym.role : sym.role;
  let text = prefix + " " + sym.name + ": " + sortComment(spec, sym) + " \"" + escapeComment(sym.description) + "\"";
  if (sym.phrase.length > 0) text += " phrase \"" + escapeComment(sym.phrase) + "\"";
  return text;
}

function sortComment(spec: Spec, sym: SymbolDecl): string {
  if (sym.sort.kind === "bool") return "Bool";
  if (sym.sort.kind === "int") return "Int " + formatInt(sym.sort.min) + ".." + formatInt(sym.sort.max);
  const decl = findEnum(spec, sym.sort.enumName);
  if (decl === null) return sym.sort.enumName;
  return decl.name;
}

function sortName(sym: SymbolDecl): string {
  if (sym.sort.kind === "bool") return "Bool";
  if (sym.sort.kind === "int") return "Int";
  return sym.sort.enumName;
}

function escapeComment(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code === 10 || code === 13) out += " ";
    else if (code === 34) out += "\\\"";
    else out += text.slice(i, i + 1);
  }
  return out;
}
