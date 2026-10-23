#!/usr/bin/env node
// Generates a valid plan-verify EARS spec with exactly N requirements.
// Usage: node gen-spec.mjs <requirements> [intMax=10] > spec.ears.md
//
// Shape: one shared bounded Int input ("the order amount", 0..intMax) and,
// per group of 5 requirements, one desk with a Bool event, a Bool state,
// a Bool output and a bounded Int output (0..9). Requirements mix While/When,
// negation, and Int comparisons (at least, at most, less than, greater than).
// Every third group plants a conflict, alternating an Int clash and a Bool
// clash, so lint reports real conflicts.
const n = Number(process.argv[2] ?? 10);
const max = Number(process.argv[3] ?? 10);
const words = ["amber","birch","cedar","dune","ember","fern","glade","harbor","iris","juniper",
  "kelp","larch","maple","nettle","opal","pine","quartz","reed","sage","thistle",
  "umber","violet","willow","yarrow","zinnia","aspen","bramble","clover","delta","elm"];
const groups = Math.ceil(n / 5);
if (groups > words.length) throw new Error(`at most ${words.length * 5} requirements`);
const hi = Math.max(2, Math.round(max * 0.6)), top = Math.max(3, Math.round(max * 0.8)), lo = Math.max(1, Math.round(max * 0.2));
const decl = [`input order_amount: Int 0..${max} "How much the customer asks for." phrase "the order amount"`];
const reqs = [];
for (let g = 0; g < groups; g++) {
  const w = words[g];
  decl.push(`event ${w}_requested: Bool "A customer asks the ${w} desk for service." phrase "a ${w} request is made"`);
  decl.push(`state ${w}_open: Bool "The ${w} desk is staffed." phrase "the ${w} desk is open"`);
  decl.push(`output ${w}_approved: Bool "The ${w} request is approved." phrase "approve the ${w} request" outcome "the ${w} request was approved" / "the ${w} request was not approved"`);
  decl.push(`output ${w}_points: Int 0..9 "How many ${w} points are granted." phrase "the ${w} points" as "grant {op} {value} ${w} points" says "{value} ${w} points were granted"`);
}
let id = 1;
const push = (s) => { if (reqs.length < n) reqs.push(`R${id++} ${s}`); };
for (let g = 0; g < groups; g++) {
  const w = words[g];
  const sys = `the ${w[0].toUpperCase() + w.slice(1)} Desk`;
  const planted = g % 3 === 0;
  push(`While the ${w} desk is open, when a ${w} request is made, ${sys} shall approve the ${w} request.`);
  push(`While the ${w} desk is not open, when a ${w} request is made, ${sys} shall not approve the ${w} request.`);
  push(`When a ${w} request is made and the order amount is at least ${hi}, ${sys} shall grant at most 5 ${w} points.`);
  if (planted && (g / 3) % 2 === 0)
    // Int clash with the line above whenever the amount is above `top`.
    push(`When a ${w} request is made and the order amount is greater than ${top}, ${sys} shall grant 7 ${w} points.`);
  else if (planted)
    // Bool clash with the first line of the group for small amounts.
    push(`While the ${w} desk is open, when a ${w} request is made and the order amount is less than ${lo}, ${sys} shall not approve the ${w} request.`);
  else
    push(`When a ${w} request is made and the order amount is less than ${lo}, ${sys} shall grant 2 ${w} points.`);
  push(`When a ${w} request is not made, ${sys} shall grant 0 ${w} points.`);
}
console.log(`# Generated benchmark spec: ${reqs.length} requirements, ${groups} desks, order amount 0..${max}.\n`);
console.log(decl.join("\n") + "\n");
console.log(reqs.join("\n"));
