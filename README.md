<p align="center"><img src="assets/logo.png" alt="ears-verify" width="480"></p>

# ears-verify

Catch contradictions in your requirements before anyone builds them.

ears-verify is for product managers, and for the AI agents who write requirements with them. You talk through what the product should do. The agent turns that into [EARS](https://alistairmavin.com/ears/) requirements with a fixed vocabulary. ears-verify then looks for requirements that cannot all be true, and explains the clash in plain language: which requirements disagree, in what situation, a concrete example, and a fix.

It will not choose which requirement wins. That question goes back to you.

The same TypeScript runs on Node 24 and compiles to a native binary with [ScriptC](https://scriptc.dev) 0.4.1. A requirement is checked by our own solver. The logic is booleans, integers in a declared range, and enums.

## Try it

You need Node 24 and clang. `npm install` installs ScriptC 0.4.1.

```bash
npm install
npm run build
./build/ears-verify lint examples/order-conflict.ears.md
```

`node --experimental-strip-types src/main.ts` runs the same program and prints the same bytes. The tests fail if the two ever drift.

<!-- verify stdout 1
build/ears-verify
lint
examples/order-conflict.ears.md
-->
```text
spec: examples/order-conflict.ears.md
conflicts: 1
gaps: 0
misuse: 0
wording: 0

conflict {R2, R3}
R2 and R3 cannot both hold.

R2 line 7
When order_submitted, the Order System shall order_fulfilled.

R3 line 8
When order_submitted, the Order System shall not order_fulfilled.

They clash when order_submitted is true.
R2 requires order_fulfilled.
R3 requires not order_fulfilled.

Example scenario:
{
  "order_submitted": true,
  "order_fulfilled": true
}
This scenario keeps R2 and breaks R3.

Suggested fix: ask which requirement should win. To keep R2, remove R3. To keep R3, remove R2.
```

R2 says a submitted order is fulfilled. R3 says it is not. Both apply when the customer submits an order, so no behavior can satisfy both. The example keeps R2 only because R3 is the last requirement in the set. It is a witness, and it is not a recommendation. Ask which requirement should win, then delete or rewrite the other.

## Check one scenario

`examples/order.ears.md` is a single rule: when an order is submitted and inventory is available, the order is fulfilled. A scenario is a JSON object with one value for every declared name.

<!-- verify stdout 1
build/ears-verify
check
examples/order.ears.md
--input
examples/order-fail.json
-->
```text
spec: examples/order.ears.md
scenario: examples/order-fail.json
violations: 1

R1 line 7
When order_submitted and inventory_available, the Order System shall order_fulfilled.
order_submitted is true, inventory_available is true, and order_fulfilled is false.
```

<!-- verify stdout 0
build/ears-verify
check
examples/order.ears.md
--input
examples/order-pass.json
-->
```text
spec: examples/order.ears.md
scenario: examples/order-pass.json
violations: 0
```

`check` answers a different question from `lint`. The passing scenario fits R1. Lint still finds a hole, because nothing says what fulfillment should be when the order was submitted and the inventory is not available:

<!-- verify stdout 1
build/ears-verify
lint
examples/order.ears.md
-->
```text
spec: examples/order.ears.md
conflicts: 0
gaps: 1
misuse: 0
wording: 0

gap order_fulfilled
Nothing covers order_fulfilled when order_submitted is true and inventory_available is false.
```

`examples/order-covered.ears.md` gives every situation a response. Lint is quiet:

<!-- verify stdout 0
build/ears-verify
lint
examples/order-covered.ears.md
-->
```text
spec: examples/order-covered.ears.md
conflicts: 0
gaps: 0
misuse: 0
wording: 0
```

## See the logic

`emit-smt` prints each requirement as one named implication. The comment above the assertion points back at the line and the sentence.

<!-- verify stdout 0
build/ears-verify
emit-smt
examples/order.ears.md
-->
```text
; spec: examples/order.ears.md
(set-logic ALL)
; event order_submitted: Bool "The customer submits an order."
(declare-fun order_submitted () Bool)
; state inventory_available: Bool "Enough stock is on hand to fill the order."
(declare-fun inventory_available () Bool)
; output order_fulfilled: Bool "The order is fulfilled."
(declare-fun order_fulfilled () Bool)
; R1_L7 line 7: When order_submitted and inventory_available, the Order System shall order_fulfilled.
(assert (! (=> (and order_submitted inventory_available) order_fulfilled) :named R1_L7))
```

## Commands

| Command | Question it answers | Status |
| --- | --- | --- |
| `check [--json] <spec> --input <scenario>` | Does this scenario fit the requirements? | Implemented |
| `lint [--json] <spec>` | Do any requirements clash, leave a hole, or use a word a test cannot pin down? | Implemented |
| `emit-smt <spec>` | What is the SMT-LIB for these requirements? | Implemented |
| `canonicalize [--json] <url>` | Is this URL already in the canonical form? | Implemented |
| `policy` | Which scenario breaks a property you hoped was true? | Planned |

<!-- verify stdout 3
build/ears-verify
policy
-->
```text
not implemented yet
```

Exit status is `0` when the command is clean, `1` when a scenario violates a requirement, lint finds something, or a URL is not yet canonical, `2` when the spec, the scenario, the URL, or the arguments are wrong, and `3` when the command is not implemented yet. `--json` is for the agent. The text report is for the product manager.

## What EARS is

An EARS line is one testable response, with the condition in front of it:

```text
While <state>, when <trigger>, if <condition>, where <feature>, then the <system> shall <response>.
```

Each piece is optional. `then` belongs in the line exactly when `if` is there. The names come from declarations at the top of the spec, so the same idea cannot be spelled two ways:

```text
event order_submitted: Bool "The customer submits an order."
state inventory_available: Bool "Enough stock is on hand to fill the order."
input quantity: Int 1..10 "How many units the customer asked for."
output order_fulfilled: Bool "The order is fulfilled."
unwanted event payment_declined: Bool "The payment was declined."
```

Events and states are booleans. Inputs and outputs are booleans, integers with an inclusive range, or enums. An unwanted event, such as a payment being declined, is written with `if` ... `then`. Writing it with `when` is a lint finding, because `when` reads like the normal trigger for the response.

A line with no condition is ubiquitous: the response is always required. `While` is a state that holds. `When` is the trigger. `If` ... `then` is the unwanted or exceptional case. `Where` is a feature or a variant, such as a region.

## How a contradiction is found

Each requirement becomes an implication: when its condition is true, its response must be true. `check` plugs in the scenario you wrote. `lint` searches.

A set such as `{R2, R3}` is reported when some situation has no allowed response, even if other situations are fine. The set is minimal: drop any one requirement and the rest can be satisfied. Sets are listed smallest first. Specs with more than 12 requirements are still checked as a whole; the report says when that list was not narrowed to the smallest set.

The search tries `false` before `true`, enum values in the order you declared them, and integers from the low end of the range to the high end. The example scenario is the first assignment that search finds. Run it twice and you get the same bytes.

An integer has to declare `min..max`, inside `-1000000..1000000`. The product of the domain sizes has to be at most 250000 or lint stops:

<!-- verify stderr 2
build/ears-verify
lint
examples/order-wide.ears.md
-->
```text
error: search space has more than 250000 assignments. Narrow the integer ranges and try again.
```

The finite search covers booleans, integers, and enums. Descriptions stay in the spec, next to the names, and they are where vague words (`quickly`, `appropriate`, `user-friendly`) and solution words (`database`, `api`, `microservice`) are caught. A page or a link also uses seven built-in `url.*` names. Those strings are not enumerated; `check` evaluates them against the scenario you wrote, and `canonicalize` puts the URL into one shape first. The skill has the mapping from English to that shape.

## Where this comes from

The shape of the analysis follows Kiro's requirements analysis: separate behavior from design, and look for what the requirements refuse to allow.

- [Deep spec analysis](https://kiro.dev/blog/deep-spec-analysis/)
- [Analyze requirements](https://kiro.dev/docs/specs/analyze-requirements/)

## For the agent in the conversation

The skill at [`skills/ears-verify/SKILL.md`](skills/ears-verify/SKILL.md) tells an agent how to sit with a product manager. It lists the grammar the parser accepts, shows real `check`, `emit-smt`, `lint`, `canonicalize`, and `policy` output, and says to ask which requirement should win. When the PM describes a page, the same section turns that English into one canonical URL and into requirements over `url.scheme`, `url.userinfo`, `url.host`, `url.port`, `url.path`, `url.query`, and `url.fragment`. If the English fits more than one URL, the agent asks or lists the candidates.

## Questions

**Why our own solver?** The fragment is small and finite, so the binary can decide it directly. There is no Z3, cvc5, or yices to install, and the Node run and the native binary are tested to print the same bytes.

**Why ScriptC?** One TypeScript program is the product. ScriptC 0.4.1 compiles that program to a native binary, and `scriptc coverage` stays fully static. Node 24 runs the same files for day-to-day edits.

**Why do integers need a range?** The search enumerates every allowed value. A declared range keeps that finite, and a range that would blow past 250000 assignments is an error you can fix by narrowing it.

**Will it pick a winner?** It will show who clashes, the situation, and an example that breaks one requirement in the set. The fix says to ask which requirement should win.

## Roadmap

`policy` will search for a scenario that breaks a property you state separately from the requirements. Until then it prints `not implemented yet`.
