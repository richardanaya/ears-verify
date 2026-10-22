<p align="center"><img src="assets/logo.png" alt="ears-verify" width="480"></p>

# ears-verify

Catch contradictions in your requirements before anyone builds them.

ears-verify is for product managers, and for the AI agents who write requirements with them. You talk through what the product should do. The agent turns that into [EARS](https://alistairmavin.com/ears/) requirements. Each name in the schema is bound to a phrase, and the requirement is written with those phrases, so a line reads the way you would say it. ears-verify then looks for requirements that cannot all be true, and explains the clash in plain language: which requirements disagree, in what situation, a concrete example, and a fix.

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
redundant: 0
vacuous: 0
unused: 0

conflict {R2, R3}
R2 and R3 cannot both hold.

R2 line 7
When an order is submitted, the Order System shall fulfill the order.

R3 line 8
When an order is submitted, the Order System shall not fulfill the order.

They clash when an order was submitted.
R2 requires that the order was fulfilled.
R3 requires that the order was not fulfilled.

Example scenario:
{
  "order_submitted": true,
  "order_fulfilled": true
}
This scenario keeps R2 and breaks R3.

Suggested fix: ask which requirement should win. To keep R2, remove R3. To keep R3, remove R2.
```

R2 says the order was fulfilled. R3 says the order was not fulfilled. Both apply when the customer submits an order, so no behavior can satisfy both. The example keeps R2 only because R3 is the last requirement in the set. It is a witness, and it is not a recommendation. Ask which requirement should win, then delete or rewrite the other.

## A conversation

A product manager says: "When no order has been submitted, do not fulfill it. When an order is submitted, fulfill it. And when an order is submitted, do not fulfill it."

The agent writes that as EARS. Each declared name is bound to a phrase, and the requirements use those phrases:

```ears
event order_submitted: Bool "The customer submits an order." phrase "an order is submitted"
output order_fulfilled: Bool "The order is fulfilled." phrase "fulfill the order" outcome "the order was fulfilled" / "the order was not fulfilled"

R1 When not an order is submitted, the Order System shall not fulfill the order.
R2 When an order is submitted, the Order System shall fulfill the order.
R3 When an order is submitted, the Order System shall not fulfill the order.
```

That is `examples/order-conflict.ears.md`. Lint names the clash. R2 and R3 both apply when an order was submitted, and the example keeps R2 and breaks R3.

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
redundant: 0
vacuous: 0
unused: 0

conflict {R2, R3}
R2 and R3 cannot both hold.

R2 line 7
When an order is submitted, the Order System shall fulfill the order.

R3 line 8
When an order is submitted, the Order System shall not fulfill the order.

They clash when an order was submitted.
R2 requires that the order was fulfilled.
R3 requires that the order was not fulfilled.

Example scenario:
{
  "order_submitted": true,
  "order_fulfilled": true
}
This scenario keeps R2 and breaks R3.

Suggested fix: ask which requirement should win. To keep R2, remove R3. To keep R3, remove R2.
```

The product manager chooses to keep fulfillment of a submitted order and to remove the refusal. The agent deletes R3. `examples/order-chosen.ears.md` is what remains:

```ears
R1 When not an order is submitted, the Order System shall not fulfill the order.
R2 When an order is submitted, the Order System shall fulfill the order.
```

Lint again, and the spec is clean:

<!-- verify stdout 0
build/ears-verify
lint
examples/order-chosen.ears.md
-->
```text
spec: examples/order-chosen.ears.md
conflicts: 0
gaps: 0
misuse: 0
wording: 0
redundant: 0
vacuous: 0
unused: 0
```

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
WHEN an order is submitted AND inventory is available, THE Order System SHALL fulfill the order.
An order was submitted and inventory was available, but the order was not fulfilled.
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
redundant: 0
vacuous: 0
unused: 0

gap order_fulfilled
Nothing says whether the order was fulfilled when an order was submitted and inventory was not available. Suggested fix: add a requirement for this situation, and ask what the system shall do. Do not choose the response.
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
redundant: 0
vacuous: 0
unused: 0
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
; event order_submitted: Bool "The customer submits an order." phrase "an order is submitted"
(declare-fun order_submitted () Bool)
; state inventory_available: Bool "Enough stock is on hand to fill the order." phrase "inventory is available"
(declare-fun inventory_available () Bool)
; output order_fulfilled: Bool "The order is fulfilled." phrase "fulfill the order" outcome "the order was fulfilled" / "the order was not fulfilled"
(declare-fun order_fulfilled () Bool)
; R1_L7 line 7: WHEN an order is submitted AND inventory is available, THE Order System SHALL fulfill the order.
(assert (! (=> (and order_submitted inventory_available) order_fulfilled) :named R1_L7))
```

## Commands

| Command | Question it answers | Status |
| --- | --- | --- |
| `check [--json] <spec> --input <scenario>` | Does this scenario fit the requirements? | Implemented |
| `lint [--json] <spec>` | Do any requirements clash, leave a hole, never trigger, leave schema unused, repeat each other, or use a word a test cannot pin down? | Implemented |
| `scenarios [--json] <spec>` | What accepted and rejected examples show each requirement's trigger? | Implemented |
| `emit-smt [--json] <spec>` | What is the SMT-LIB for these requirements? | Implemented |
| `policy [--json] <spec> [--property <file>]` | Which scenarios do the requirements allow and forbid? Does any allowed scenario break a property? | Implemented |
| `help` | What commands are available? | Implemented |

<!-- verify stdout 0
build/ears-verify
help
-->
```text
usage:
  ears-verify check [--json] <spec> --input <scenario>
  ears-verify emit-smt [--json] <spec>
  ears-verify lint [--json] <spec>
  ears-verify scenarios [--json] <spec>
  ears-verify policy [--json] <spec> [--property <file>]
  ears-verify help
```

With no property, `policy` prints one scenario the requirements allow and one they forbid. Both are the first assignment the search finds, false before true. A requirement whose condition is false counts as satisfied, so the allowed scenario is not a recommendation.

<!-- verify stdout 0
build/ears-verify
policy
examples/order.ears.md
-->
```text
spec: examples/order.ears.md
accepted:
{
  "order_submitted": false,
  "inventory_available": false,
  "order_fulfilled": false
}
This scenario satisfies every requirement.
rejected:
{
  "order_submitted": true,
  "inventory_available": true,
  "order_fulfilled": false
}
This scenario violates a requirement.

R1 line 7
WHEN an order is submitted AND inventory is available, THE Order System SHALL fulfill the order.
An order was submitted and inventory was available, but the order was not fulfilled.
```

Exit status is `0` when the command is clean, `1` when a scenario violates a requirement, lint finds something, or a property has a counterexample, and `2` when the spec, the scenario, the property, or the arguments are wrong. `--json` is for the agent. The text report is for the product manager.

## JSON

`--json` prints one object on stdout and leaves stderr empty. The keys below do not change. Wrong arguments, and a file that cannot be read or parsed, are exit 2:

<!-- verify stdout 2
build/ears-verify
emit-smt
--json
-->
```text
{
  "ok": false,
  "error": "usage: ears-verify emit-smt [--json] <spec>"
}
```

`check` is `ok`, `spec`, `scenario`, and `violations`. Each violation is `id`, `line`, `sentence`, and `because`. `ok` is true when `violations` is empty.

<!-- verify stdout 1
build/ears-verify
check
--json
examples/order.ears.md
--input
examples/order-fail.json
-->
```text
{
  "ok": false,
  "spec": "examples/order.ears.md",
  "scenario": "examples/order-fail.json",
  "violations": [
    {
      "id": "R1",
      "line": 7,
      "sentence": "WHEN an order is submitted AND inventory is available, THE Order System SHALL fulfill the order.",
      "because": "An order was submitted and inventory was available, but the order was not fulfilled."
    }
  ]
}
```

`lint` is `ok`, `spec`, `conflicts`, `gaps`, `misuse`, `wording`, `redundant`, `vacuous`, and `unused`. A conflict is `ids`, `minimal`, `everySituation`, `summary`, `clash`, `requirements` (`id`, `line`, `sentence`), `situation` and `example` (`name`, `value`), `requires` (`id`, `text`), `keeps`, `breaks`, and `fix`. A gap is `output`, `situation`, and `text`. Misuse is `id`, `line`, `symbols`, `sentence`, and `text`. Wording is `line`, `word`, `kind`, `text`, and `context`. A redundant requirement is `id`, `line`, `sentence`, `text`, and `fix`. A vacuous requirement has the same fields. An unused entry is `name`, `kind` (`state`, `input`, `output`, or `variant`), `text`, and `fix`.

<!-- verify stdout 1
build/ears-verify
lint
--json
examples/order-conflict.ears.md
-->
```text
{
  "ok": false,
  "spec": "examples/order-conflict.ears.md",
  "conflicts": [
    {
      "ids": [
        "R2",
        "R3"
      ],
      "minimal": true,
      "everySituation": false,
      "summary": "R2 and R3 cannot both hold.",
      "clash": "They clash when an order was submitted.",
      "requirements": [
        {
          "id": "R2",
          "line": 7,
          "sentence": "When an order is submitted, the Order System shall fulfill the order."
        },
        {
          "id": "R3",
          "line": 8,
          "sentence": "When an order is submitted, the Order System shall not fulfill the order."
        }
      ],
      "situation": [
        {
          "name": "order_submitted",
          "value": "true"
        }
      ],
      "requires": [
        {
          "id": "R2",
          "text": "that the order was fulfilled"
        },
        {
          "id": "R3",
          "text": "that the order was not fulfilled"
        }
      ],
      "example": [
        {
          "name": "order_submitted",
          "value": "true"
        },
        {
          "name": "order_fulfilled",
          "value": "true"
        }
      ],
      "keeps": [
        "R2"
      ],
      "breaks": "R3",
      "fix": "Suggested fix: ask which requirement should win. To keep R2, remove R3. To keep R3, remove R2."
    }
  ],
  "gaps": [],
  "misuse": [],
  "wording": [],
  "redundant": [],
  "vacuous": [],
  "unused": []
}
```

`policy` is `ok`, `spec`, `property`, `holds`, `note`, `acceptedFound`, `accepted`, `rejectedFound`, `rejected`, `counterexampleFound`, `counterexample`, and `breaks`. A scenario is a list of `name` and `value`. The list is empty when the matching `Found` flag is false. A break is `id`, `line`, `sentence`, and `because`.

<!-- verify stdout 1
build/ears-verify
policy
--json
examples/order.ears.md
--property
examples/order-always.ears.md
-->
```text
{
  "ok": false,
  "spec": "examples/order.ears.md",
  "property": "examples/order-always.ears.md",
  "holds": false,
  "note": "",
  "acceptedFound": false,
  "accepted": [],
  "rejectedFound": false,
  "rejected": [],
  "counterexampleFound": true,
  "counterexample": [
    {
      "name": "order_submitted",
      "value": "false"
    },
    {
      "name": "inventory_available",
      "value": "false"
    },
    {
      "name": "order_fulfilled",
      "value": "false"
    }
  ],
  "breaks": [
    {
      "id": "P1",
      "line": 3,
      "sentence": "The Order System shall fulfill the order.",
      "because": "The order was not fulfilled."
    }
  ]
}
```

`emit-smt` is `ok`, `spec`, and `smt`. `smt` is the same SMT-LIB text as the plain command, with a newline between lines and none after the last line.

<!-- verify stdout 0
build/ears-verify
emit-smt
--json
examples/order.ears.md
-->
```text
{
  "ok": true,
  "spec": "examples/order.ears.md",
  "smt": "; spec: examples/order.ears.md\n(set-logic ALL)\n; event order_submitted: Bool \"The customer submits an order.\" phrase \"an order is submitted\"\n(declare-fun order_submitted () Bool)\n; state inventory_available: Bool \"Enough stock is on hand to fill the order.\" phrase \"inventory is available\"\n(declare-fun inventory_available () Bool)\n; output order_fulfilled: Bool \"The order is fulfilled.\" phrase \"fulfill the order\" outcome \"the order was fulfilled\" / \"the order was not fulfilled\"\n(declare-fun order_fulfilled () Bool)\n; R1_L7 line 7: WHEN an order is submitted AND inventory is available, THE Order System SHALL fulfill the order.\n(assert (! (=> (and order_submitted inventory_available) order_fulfilled) :named R1_L7))"
}
```

## What EARS is

An EARS line is one testable response, with the condition in front of it:

```text
While <state>, when <trigger>, if <condition>, where <feature>, then the <system> shall <response>.
```

Each piece is optional. `then` belongs in the line exactly when `if` is there. The names come from declarations at the top of the spec, so the same idea cannot be spelled two ways:

```text
event order_submitted: Bool "The customer submits an order." phrase "an order is submitted"
state inventory_available: Bool "Enough stock is on hand to fill the order." phrase "inventory is available"
input quantity: Int 1..10 "How many units the customer asked for." phrase "the quantity"
output order_fulfilled: Bool "The order is fulfilled." phrase "fulfill the order" outcome "the order was fulfilled" / "the order was not fulfilled"
unwanted event payment_declined: Bool "The payment was declined." phrase "payment fails"
```

The phrase is the only wording a requirement may use for that name. `not fulfill the order` is the phrase with `not` in front. `the quantity is at most 10` is how an integer comparison is written. Matching is exact and case-insensitive: the words have to be the phrase you declared, and the longest phrase wins. A sentence that says `an order was submitted` is not close enough to count. The error names the line and the nearest phrases.

A Bool can also say how a report states the result, after the phrase: `outcome "the order was fulfilled" / "the order was not fulfilled"`. One string is enough. The false form inserts `not` after the first `was` or `is`, or prefixes `not` when neither word is there. Two strings separated by `/` are used as written. `outcome` is only for Bool, and `not` is allowed in that wording. When it is left off, a phrase that contains `is` is reported with `was` or `was not`. The violation line for the order above is `An order was submitted and inventory was available, but the order was not fulfilled.`

<!-- verify stderr 2
build/ears-verify
lint
test/fixtures/unknown-phrase.ears.md
-->
```text
error: test/fixtures/unknown-phrase.ears.md:5: unknown phrase "an order was submitted". Closest: "an order is submitted", "inventory is available", "fulfill the order".
```

Scenarios and the SMT-LIB still use the declared names (`order_submitted`, `quantity`). The sentences you read, and the explanations under them, use the phrases and the outcome wording.

Events and states are booleans. Inputs and outputs are booleans, integers with an inclusive range, or enums. An unwanted event, such as a payment being declined, is written with `if` ... `then`. Writing it with `when` is a lint finding, because `when` reads like the normal trigger for the response.

A line with no condition is ubiquitous: the response is always required. `While` is a state that holds. `When` is the trigger. `If` ... `then` is the unwanted or exceptional case. `Where` is a feature or a variant, such as a region.

## How a contradiction is found

Each requirement becomes an implication: when its condition is true, its response must be true. `check` plugs in the scenario you wrote. `lint` asks whether some situation has no response that satisfies the set.

Booleans are decided by DPLL over the clauses of those implications. Integers, and enum values numbered in the order you declared them, are linear arithmetic: bounds tighten until a comparison is forced, and the search branches where a bound or a comparison can change. A model is the lexicographically least assignment. The search tries `false` before `true`, enum values in declaration order, and integers from the low end of the range to the high end. The example scenario is that first assignment. Run it twice and you get the same bytes.

A set such as `{R2, R3}` is reported when some situation has no allowed response, even if other situations are fine. The set is minimal: drop any one requirement and the rest can be satisfied. With 12 requirements or fewer, every such set is listed, smallest first. With more than 12, each set is shrunk by deleting requirements from a failing situation, and situations are tried in that same order. Two sets that share a requirement and fail in exactly the same situations can collapse to one of them. If a driver domain is wider than 64 values, or the driver combinations exceed 8192, each set is removed before the next search, so a later set that needs a requirement from an earlier one is not reported.

An integer has to declare `min..max`, inside `-1000000..1000000`. The procedure decides the range. It does not list every value, so a wide range is still checked:

<!-- verify stdout 0
build/ears-verify
lint
examples/order-wide.ears.md
-->
```text
spec: examples/order-wide.ears.md
conflicts: 0
gaps: 0
misuse: 0
wording: 0
redundant: 0
vacuous: 0
unused: 0
```

A comparison that ties two wide integers together is still decided, by splitting the range. A boolean combination of those comparisons can take longer than a single bound.

There are no strings in the logic. Descriptions and phrases stay next to the names. Vague words (`quickly`, `appropriate`, `user-friendly`) and solution words (`database`, `api`, `microservice`) are caught in descriptions and in requirement sentences.

Lint also reports an event no requirement handles, an error condition with no response, an unwanted event written with `when`, and vague words. An integer cap can clash with a larger accepted quantity, and an enum can be pinned to two variants at once. The fix still asks which requirement should win. A condition that can never be true, a state or input no requirement mentions, an enum variant no requirement mentions, and an output no response sets are reported on their own. An output no requirement mentions at all stays a gap. An event nobody handles stays a gap. A free input that some requirement already mentions is not a finding: the environment is allowed to choose it.

<!-- verify stdout 1
build/ears-verify
lint
examples/order-unhandled.ears.md
-->
```text
spec: examples/order-unhandled.ears.md
conflicts: 0
gaps: 1
misuse: 0
wording: 0
redundant: 0
vacuous: 0
unused: 0

gap order_cancelled
No requirement handles "an order is cancelled". Suggested fix: add a requirement that says what the system shall do, or remove the event.
```

<!-- verify stdout 1
build/ears-verify
lint
examples/order-unanswered.ears.md
-->
```text
spec: examples/order-unanswered.ears.md
conflicts: 0
gaps: 1
misuse: 0
wording: 0
redundant: 0
vacuous: 0
unused: 0

gap payment_declined
No requirement states a response when "payment fails". Suggested fix: add an if ... then requirement, and ask what the system shall do. Do not choose the response.
```

<!-- verify stdout 1
build/ears-verify
lint
examples/order-misuse.ears.md
-->
```text
spec: examples/order-misuse.ears.md
conflicts: 0
gaps: 0
misuse: 1
wording: 0
redundant: 1
vacuous: 0
unused: 0

misuse R4 line 6
"payment fails" is an unwanted event. Write if ... then, not when.
When payment fails, the Order System shall reject the order.

redundant R4 line 6
R4 adds nothing. Whenever the other requirements hold, R4 holds too.
When payment fails, the Order System shall reject the order.
Suggested fix: remove R4, or ask whether it was meant to say something the others do not already require. Do not delete it until the PM agrees.
```

<!-- verify stdout 1
build/ears-verify
lint
examples/order-vague.ears.md
-->
```text
spec: examples/order-vague.ears.md
conflicts: 0
gaps: 0
misuse: 0
wording: 3
redundant: 0
vacuous: 0
unused: 0

wording line 4
"fast" is too vague to test. Replace it with something a scenario can check.
output order_fulfilled: Bool "The checkout is fast, appropriate, and user-friendly." phrase "fulfill the order" outcome "the order was fulfilled" / "the order was not fulfilled"

wording line 4
"appropriate" is too vague to test. Replace it with something a scenario can check.
output order_fulfilled: Bool "The checkout is fast, appropriate, and user-friendly." phrase "fulfill the order" outcome "the order was fulfilled" / "the order was not fulfilled"

wording line 4
"user-friendly" is too vague to test. Replace it with something a scenario can check.
output order_fulfilled: Bool "The checkout is fast, appropriate, and user-friendly." phrase "fulfill the order" outcome "the order was fulfilled" / "the order was not fulfilled"
```

<!-- verify stdout 1
build/ears-verify
lint
examples/order-quantity.ears.md
-->
```text
spec: examples/order-quantity.ears.md
conflicts: 1
gaps: 0
misuse: 0
wording: 0
redundant: 0
vacuous: 0
unused: 0

conflict {R4, R5}
R4 and R5 cannot both hold.

R4 line 7
When an order is submitted, the Order System shall the quantity is at most 10.

R5 line 8
When an order is submitted, the Order System shall the quantity is 12.

They clash when an order was submitted.
R4 requires that the quantity was at most 10.
R5 requires that the quantity was 12.

Example scenario:
{
  "order_submitted": true,
  "quantity": 0
}
This scenario keeps R4 and breaks R5.

Suggested fix: ask which requirement should win. To keep R4, remove R5. To keep R5, remove R4.
```

R4 says a submitted order accepts at most 10 units. R5 says that same order accepts exactly 12. The example keeps R4 with a quantity of 0 only because that is the first value that satisfies R4. It is a witness, and it is not a recommendation.

`examples/order-status.ears.md` requires the status to be shipped and cancelled in every situation. `placed` is declared on the enum and no requirement mentions it.

<!-- verify stdout 1
build/ears-verify
lint
examples/order-status.ears.md
-->
```text
spec: examples/order-status.ears.md
conflicts: 1
gaps: 0
misuse: 0
wording: 0
redundant: 0
vacuous: 0
unused: 1

conflict {R6, R7}
R6 and R7 cannot both hold.

R6 line 6
The Order System shall the status is shipped.

R7 line 7
The Order System shall the status is cancelled.

They clash in every situation.
R6 requires that the status was shipped.
R7 requires that the status was cancelled.

Example scenario:
{
  "status": "shipped"
}
This scenario keeps R6 and breaks R7.

Suggested fix: ask which requirement should win. To keep R6, remove R7. To keep R7, remove R6.

unused Status.placed
Status.placed is never mentioned.
Suggested fix: use placed in a requirement, or remove it from Status.
```

## Where this comes from

The shape of the analysis follows Kiro's requirements analysis: separate behavior from design, and look for what the requirements refuse to allow.

- [Deep spec analysis](https://kiro.dev/blog/deep-spec-analysis/)
- [Analyze requirements](https://kiro.dev/docs/specs/analyze-requirements/)

## For the agent in the conversation

The skill at [`skills/ears-verify/SKILL.md`](skills/ears-verify/SKILL.md) tells an agent how to sit with a product manager. It lists the grammar the parser accepts, shows real `check`, `lint`, `scenarios`, `emit-smt`, `policy`, and `help` output, including the sentences a product manager would read, and says to ask which requirement should win.

## Questions

**Why our own solver?** The decision procedure is in this repository: DPLL for the boolean structure, and bounds for linear integer arithmetic. There is no Z3, cvc5, or yices to install, and the Node run and the native binary are tested to print the same bytes.

**Why ScriptC?** One TypeScript program is the product. ScriptC 0.4.1 compiles that program to a native binary, and `scriptc coverage` stays fully static. Node 24 runs the same files for day-to-day edits.

**Why do integers need a range?** The arithmetic is bounded. A declared range, inside `-1000000..1000000`, keeps every integer finite. The solver does not walk that range one value at a time.

**Will it pick a winner?** It will show who clashes, the situation, and an example that breaks one requirement in the set. The fix says to ask which requirement should win.

## Policy

A property is a separate file of requirement lines. It uses the spec's names and phrases, and it does not declare symbols. `P1` is the usual id.

`examples/order-always.ears.md` hopes the order is fulfilled in every scenario. The requirements do not say that. The counterexample is a scenario they allow where the order is not fulfilled:

<!-- verify stdout 1
build/ears-verify
policy
examples/order.ears.md
--property
examples/order-always.ears.md
-->
```text
spec: examples/order.ears.md
property: examples/order-always.ears.md
counterexample:
{
  "order_submitted": false,
  "inventory_available": false,
  "order_fulfilled": false
}
This scenario satisfies every requirement and violates the property.

P1 line 3
The Order System shall fulfill the order.
The order was not fulfilled.
```

`examples/order-same.ears.md` repeats R1. Nothing the requirements allow can break it:

<!-- verify stdout 0
build/ears-verify
policy
examples/order.ears.md
--property
examples/order-same.ears.md
-->
```text
spec: examples/order.ears.md
property: examples/order-same.ears.md
No scenario satisfies every requirement and violates the property.
```

When the requirements themselves cannot all hold, there is no scenario to test the property against. `examples/order-status.ears.md` is that spec: the status would have to be shipped and cancelled.

<!-- verify stdout 0
build/ears-verify
policy
examples/order-status.ears.md
--property
examples/status-placed.ears.md
-->
```text
spec: examples/order-status.ears.md
property: examples/status-placed.ears.md
No scenario satisfies every requirement, so none violates the property.
```

## Three requirements, no pair

`examples/order-chain.ears.md` is unsatisfiable only as a set. A submitted order must be accepted, an accepted order must be shipped, and a submitted order must not be shipped. Each pair can still hold. The example keeps the first two and breaks the third. It is a witness, and it is not a recommendation. Ask which requirement should change.

<!-- verify stdout 1
build/ears-verify
lint
examples/order-chain.ears.md
-->
```text
spec: examples/order-chain.ears.md
conflicts: 1
gaps: 0
misuse: 0
wording: 0
redundant: 0
vacuous: 0
unused: 0

conflict {R1, R2, R3}
R1, R2, and R3 cannot all hold.

R1 line 7
When an order is submitted, the Order System shall accept the order.

R2 line 8
When accept the order, the Order System shall ship the order.

R3 line 9
When an order is submitted, the Order System shall not ship the order.

They clash when an order was submitted.
R1 requires that the order was accepted.
R3 requires that the order was not shipped.

Example scenario:
{
  "order_submitted": true,
  "order_accepted": true,
  "order_shipped": true
}
This scenario keeps R1 and R2 and breaks R3.

Suggested fix: ask which requirement should win. Removing any one of R1, R2, and R3 leaves the rest consistent.
```

## A requirement that adds nothing

`examples/order-redundant.ears.md` says a submitted order is fulfilled, and also that a submitted order with inventory is fulfilled. The second one is already required by the first. Lint names it and asks. It does not delete it. If the whole spec already conflicts, nothing is marked redundant.

<!-- verify stdout 1
build/ears-verify
lint
examples/order-redundant.ears.md
-->
```text
spec: examples/order-redundant.ears.md
conflicts: 0
gaps: 0
misuse: 0
wording: 0
redundant: 1
vacuous: 0
unused: 0

redundant R2 line 8
R2 adds nothing. Whenever the other requirements hold, R2 holds too.
When an order is submitted and inventory is available, the Order System shall fulfill the order.
Suggested fix: remove R2, or ask whether it was meant to say something the others do not already require. Do not delete it until the PM agrees.
```

## A condition that can never be true

`examples/order-vacuous.ears.md` has a condition that contradicts itself, and a quantity comparison outside the declared range. The response is never demanded. Lint names each one. When the rest of the spec can be satisfied, the same requirements are also redundant, because a condition that is never true cannot add a constraint. The vacuous line says to rewrite the condition. It does not pick a response.

<!-- verify stdout 1
build/ears-verify
lint
examples/order-vacuous.ears.md
-->
```text
spec: examples/order-vacuous.ears.md
conflicts: 0
gaps: 0
misuse: 0
wording: 0
redundant: 2
vacuous: 2
unused: 0

redundant R1 line 7
R1 adds nothing. Whenever the other requirements hold, R1 holds too.
When the cart is open and not the cart is open, the Checkout shall accept the order.
Suggested fix: remove R1, or ask whether it was meant to say something the others do not already require. Do not delete it until the PM agrees.

redundant R2 line 8
R2 adds nothing. Whenever the other requirements hold, R2 holds too.
When the quantity is at least 9, the Checkout shall accept the order.
Suggested fix: remove R2, or ask whether it was meant to say something the others do not already require. Do not delete it until the PM agrees.

vacuous R1 line 7
R1 can never trigger. Its condition is impossible for every allowed value.
When the cart is open and not the cart is open, the Checkout shall accept the order.
Suggested fix: rewrite the condition in R1 so a real situation can make it true, or remove the requirement. Do not invent a response.

vacuous R2 line 8
R2 can never trigger. Its condition is impossible for every allowed value.
When the quantity is at least 9, the Checkout shall accept the order.
Suggested fix: rewrite the condition in R2 so a real situation can make it true, or remove the requirement. Do not invent a response.
```

## Schema the requirements never use

`examples/order-unused.ears.md` declares a state and an input that no sentence mentions, an enum variant that no sentence mentions, and an output that requirements only read. An output that no requirement mentions at all is still a gap, not a second finding. An event that nobody handles stays a gap.

<!-- verify stdout 1
build/ears-verify
lint
examples/order-unused.ears.md
-->
```text
spec: examples/order-unused.ears.md
conflicts: 0
gaps: 0
misuse: 0
wording: 0
redundant: 0
vacuous: 0
unused: 4

unused loyalty
loyalty ("the customer is loyal") is a state and no requirement mentions it.
Suggested fix: use loyalty in a requirement, or remove it from the schema.

unused region
region ("the region") is an input and no requirement mentions it.
Suggested fix: use region in a requirement, or remove it from the schema.

unused receipt_sent
Nothing sets receipt_sent ("send a receipt"). Requirements mention it, but no response says what it shall be.
Suggested fix: add a shall requirement that sets receipt_sent, or declare it as an input if the environment provides it. Do not choose the value.

unused Lane.refund
Lane.refund is never mentioned.
Suggested fix: use refund in a requirement, or remove it from Lane.
```

<!-- verify stdout 1
build/ears-verify
lint
--json
examples/order-unused.ears.md
-->
```text
{
  "ok": false,
  "spec": "examples/order-unused.ears.md",
  "conflicts": [],
  "gaps": [],
  "misuse": [],
  "wording": [],
  "redundant": [],
  "vacuous": [],
  "unused": [
    {
      "name": "loyalty",
      "kind": "state",
      "text": "loyalty (\"the customer is loyal\") is a state and no requirement mentions it.",
      "fix": "Suggested fix: use loyalty in a requirement, or remove it from the schema."
    },
    {
      "name": "region",
      "kind": "input",
      "text": "region (\"the region\") is an input and no requirement mentions it.",
      "fix": "Suggested fix: use region in a requirement, or remove it from the schema."
    },
    {
      "name": "receipt_sent",
      "kind": "output",
      "text": "Nothing sets receipt_sent (\"send a receipt\"). Requirements mention it, but no response says what it shall be.",
      "fix": "Suggested fix: add a shall requirement that sets receipt_sent, or declare it as an input if the environment provides it. Do not choose the value."
    },
    {
      "name": "Lane.refund",
      "kind": "variant",
      "text": "Lane.refund is never mentioned.",
      "fix": "Suggested fix: use refund in a requirement, or remove it from Lane."
    }
  ]
}
```

## Scenarios

`scenarios` lists a small set of examples so a product manager can check that a requirement means what they think. For each requirement it looks for an accepted scenario with the trigger true, an accepted scenario with the trigger false, and a rejected scenario with the trigger true. Each one is the first assignment the search finds, false before true. A requirement with no trigger says so, instead of inventing a trigger-false case. The same assignment is printed once.

<!-- verify stdout 0
build/ears-verify
scenarios
examples/order.ears.md
-->
```text
spec: examples/order.ears.md
scenarios: 3

R1 accepted, trigger true
{
  "order_submitted": true,
  "inventory_available": true,
  "order_fulfilled": true
}
An order was submitted and inventory was available, and the order was fulfilled.

R1 accepted, trigger false
{
  "order_submitted": false,
  "inventory_available": false,
  "order_fulfilled": false
}
An order was not submitted and inventory was not available, and the order was not fulfilled.

R1 rejected, trigger true
{
  "order_submitted": true,
  "inventory_available": true,
  "order_fulfilled": false
}
An order was submitted and inventory was available, but the order was not fulfilled.
```

`--json` is `ok`, `spec`, and `scenarios`. Each row is `id`, `line`, `kind` (`accepted` or `rejected`), `trigger` (`true` or `false`), `found`, `sameAs`, `scenario` (`name` and `value`), and `text`. `scenario` is empty when `found` is false. `sameAs` names an earlier row when the assignment was already listed.

<!-- verify stdout 0
build/ears-verify
scenarios
--json
examples/order.ears.md
-->
```text
{
  "ok": true,
  "spec": "examples/order.ears.md",
  "scenarios": [
    {
      "id": "R1",
      "line": 7,
      "kind": "accepted",
      "trigger": "true",
      "found": true,
      "sameAs": "",
      "scenario": [
        {
          "name": "order_submitted",
          "value": "true"
        },
        {
          "name": "inventory_available",
          "value": "true"
        },
        {
          "name": "order_fulfilled",
          "value": "true"
        }
      ],
      "text": "An order was submitted and inventory was available, and the order was fulfilled."
    },
    {
      "id": "R1",
      "line": 7,
      "kind": "accepted",
      "trigger": "false",
      "found": true,
      "sameAs": "",
      "scenario": [
        {
          "name": "order_submitted",
          "value": "false"
        },
        {
          "name": "inventory_available",
          "value": "false"
        },
        {
          "name": "order_fulfilled",
          "value": "false"
        }
      ],
      "text": "An order was not submitted and inventory was not available, and the order was not fulfilled."
    },
    {
      "id": "R1",
      "line": 7,
      "kind": "rejected",
      "trigger": "true",
      "found": true,
      "sameAs": "",
      "scenario": [
        {
          "name": "order_submitted",
          "value": "true"
        },
        {
          "name": "inventory_available",
          "value": "true"
        },
        {
          "name": "order_fulfilled",
          "value": "false"
        }
      ],
      "text": "An order was submitted and inventory was available, but the order was not fulfilled."
    }
  ]
}
```
