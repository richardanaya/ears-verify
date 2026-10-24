# Lint

What `lint` and `report` print. JSON fields are in [json.md](json.md). Grammar, the solver, and the other commands are in [reference.md](reference.md).

## A conversation

A product manager says: "When no order has been submitted, do not fulfill it. When an order is submitted, fulfill it. And when an order is submitted, do not fulfill it."

The agent writes that as EARS. Each declared name is bound to a phrase, and the requirements use those phrases:

```ears
event order_submitted: Bool "The customer submits an order." phrase "an order is submitted"
output order_fulfilled: Bool "The order is fulfilled." phrase "fulfill the order" outcome "the order was fulfilled" / "the order was not fulfilled"

R1 When an order is not submitted, the Order System shall not fulfill the order.
R2 When an order is submitted, the Order System shall fulfill the order.
R3 When an order is submitted, the Order System shall not fulfill the order.
```

That is `examples/order-conflict.ears.md`. Lint names the clash. R2 and R3 both apply when an order was submitted, and the example keeps R2 and breaks R3.

<!-- verify stdout 1
build/plan-verify
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
duplicate: 0
vacuous: 0
unused: 0
uncovered: 0
warnings: 0

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

Candidate repairs follow. This report does not choose one.

repair drop R2
One repair is to drop R2 and keep R3 as written.
When an order is submitted, the Order System shall not fulfill the order.

repair drop R3
One repair is to drop R3 and keep R2 as written.
When an order is submitted, the Order System shall fulfill the order.
```

R2 says the order was fulfilled. R3 says the order was not fulfilled. Both apply when the customer submits an order, so no behavior can satisfy both. The example keeps R2 only because R3 is the last requirement in the set. It is a witness, and it is not a recommendation. Ask which requirement should win, then delete or rewrite the other. The candidate repairs under the clash are the same question in sentence form: drop one requirement, or, when a single extra condition can separate them, the rewritten line. None of those repairs is chosen.

The product manager chooses to keep fulfillment of a submitted order and to remove the refusal. The agent deletes R3. `examples/order-chosen.ears.md` is what remains:

```ears
R1 When an order is not submitted, the Order System shall not fulfill the order.
R2 When an order is submitted, the Order System shall fulfill the order.
```

Lint again, and the spec is clean:

<!-- verify stdout 0
build/plan-verify
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
duplicate: 0
vacuous: 0
unused: 0
uncovered: 0
warnings: 0
```

## A condition that separates the clash

`examples/order-repair.ears.md` lends a copy that is in the building and refuses a copy that is out on loan. Those two states can both be true, so the requirements clash. Lint still asks which requirement should win. It also shows candidate repairs it has checked: drop either requirement, or add one existing state to one condition. Adding "and the copy is not out on loan" to R1 leaves R2 unchanged, and the patched spec no longer has that conflict. Adding "and the copy is not in the building" to R2 is the other strengthening. The report does not pick one.

<!-- verify stdout 1
build/plan-verify
lint
examples/order-repair.ears.md
-->
```text
spec: examples/order-repair.ears.md
conflicts: 1
gaps: 1
misuse: 0
wording: 0
redundant: 0
duplicate: 0
vacuous: 0
unused: 0
uncovered: 0
warnings: 0

conflict {R1, R2}
R1 and R2 cannot both hold.

R1 line 8
While the copy is in the building, when a member asks to take a copy home, the Desk shall allow the loan.

R2 line 9
While the copy is out on loan, when a member asks to take a copy home, the Desk shall not allow the loan.

They clash when the copy was in the building, the copy was out on loan, and a member asks to take a copy home.
R1 requires that the loan was allowed.
R2 requires that the loan was not allowed.

Example scenario:
{
  "copy_in_building": true,
  "copy_on_loan": true,
  "borrow_requested": true,
  "loan_allowed": true
}
This scenario keeps R1 and breaks R2.

Suggested fix: ask which requirement should win. To keep R1, remove R2. To keep R2, remove R1.

Candidate repairs follow. This report does not choose one.

repair drop R1
One repair is to drop R1 and keep R2 as written.
While the copy is out on loan, when a member asks to take a copy home, the Desk shall not allow the loan.

repair drop R2
One repair is to drop R2 and keep R1 as written.
While the copy is in the building, when a member asks to take a copy home, the Desk shall allow the loan.

repair strengthen R1
One repair is to add "and the copy is not out on loan" to the condition of R1. R2 stays as written.
While the copy is in the building, when a member asks to take a copy home and the copy is not out on loan, the Desk shall allow the loan.

repair strengthen R2
One repair is to add "and the copy is not in the building" to the condition of R2. R1 stays as written.
While the copy is out on loan, when a member asks to take a copy home and the copy is not in the building, the Desk shall not allow the loan.

gap loan_allowed
Nothing says whether the loan was allowed when the copy was in the building, the copy was out on loan, and not a member asks to take a copy home. Suggested fix: add a requirement for this situation, and ask what the system shall do. Do not choose the response.
```

## A gap

`examples/order.ears.md` is a single rule: when an order is submitted and inventory is available, the order is fulfilled. Lint still finds a hole, because nothing says what fulfillment should be when the order was submitted and the inventory is not available:

<!-- verify stdout 1
build/plan-verify
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
duplicate: 0
vacuous: 0
unused: 0
uncovered: 0
warnings: 0

gap order_fulfilled
Nothing says whether the order was fulfilled when an order was submitted and inventory was not available. Suggested fix: add a requirement for this situation, and ask what the system shall do. Do not choose the response.
```

`examples/order-covered.ears.md` gives every situation a response. Lint is quiet:

<!-- verify stdout 0
build/plan-verify
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
duplicate: 0
vacuous: 0
unused: 0
uncovered: 0
warnings: 0
```

## A wide integer range

An integer has to declare `min..max`, inside `-1000000..1000000`. The procedure decides the range. It does not list every value, so a wide range is still checked:

<!-- verify stdout 0
build/plan-verify
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
duplicate: 0
vacuous: 0
unused: 0
uncovered: 0
warnings: 0
```

There are no strings in the logic. Descriptions and phrases stay next to the names. Vague words (`as needed`, `quickly`, `appropriate`, `user-friendly`, `fast`, `slow`, `large`, `small`, `easy`, `robust`, `flexible`, `efficient`) and solution words (`database`, `api`, `algorithm`, `microservice`, `server`, `class`, `function`) are caught in descriptions and in requirement sentences. A word that sits inside a declared phrase or action is already bound to a schema item, so that use is not a wording finding.

Lint also reports an event no requirement handles, an error condition with no response, an unwanted event written with `when`, and vague words. A testability warning, below, leaves the exit status at 0 when it is the only finding. An integer cap can clash with a larger accepted quantity, and an enum can be pinned to two variants at once. The fix still asks which requirement should win. A condition that can never be true, a state or input no requirement mentions, an enum variant no requirement mentions, and an output no response sets are reported on their own. An output no requirement mentions at all stays a gap. An event nobody handles stays a gap. A free input that some requirement already mentions is not a finding: the environment is allowed to choose it.

<!-- verify stdout 1
build/plan-verify
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
duplicate: 0
vacuous: 0
unused: 0
uncovered: 0
warnings: 0

gap order_cancelled
No requirement handles "an order is cancelled". Suggested fix: add a requirement that says what the system shall do, or remove the event.
```

<!-- verify stdout 1
build/plan-verify
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
duplicate: 0
vacuous: 0
unused: 0
uncovered: 0
warnings: 0

gap payment_declined
No requirement states a response when "payment fails". Suggested fix: add an if ... then requirement, and ask what the system shall do. Do not choose the response.
```

<!-- verify stdout 1
build/plan-verify
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
duplicate: 0
vacuous: 0
unused: 0
uncovered: 0
warnings: 0

misuse R4 line 6
"payment fails" is an unwanted event. Write if ... then, not when.
When payment fails, the Order System shall reject the order.

redundant R4 line 6
R4 adds nothing. R5 implies it. Whenever the other requirements hold, R4 holds too.
When payment fails, the Order System shall reject the order.
Suggested fix: remove R4, or ask whether it was meant to say something the others do not already require. Do not delete it until the PM agrees.
```

<!-- verify stdout 1
build/plan-verify
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
duplicate: 0
vacuous: 0
unused: 0
uncovered: 0
warnings: 0

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

## Testability warnings

A warning names the requirement id, the line, the sentence, and a short fix. The count is `warnings`. `--json` puts the same findings in `warnings`, and `ok` stays true when warnings are the only findings. A redundant requirement and an uncovered output, state, or enum value are separate counts. They also leave `ok` true and exit 0 when nothing else is wrong. A conflict, a gap, misuse, a wording finding, a duplicate, a vacuous requirement, or an unused input or variant still exits 1. A word the schema does not declare is a parse error and exits 2.

These words are already wording findings, so a warning does not repeat them: `as needed`, `fast`, `slow`, `large`, `small`, `appropriate`, `quickly`, `easy`, `robust`, `flexible`, `user-friendly`, `efficient`. The warning list, scanned in requirement sentences only, is `appropriately`, `reasonable`, `etc`, `adequate`, `sufficient`, `timely`, `normally`, `usually`, `some`, `several`, `many`, `few`, `minimal`, `optimal`. A word inside a declared phrase or action is skipped. `if possible` and `where possible` are escape warnings. `should`, `may`, `might`, `could`, `can`, and `will try` are weak modals. `must` and a bare `will` still fail to parse.

### A vague word

`examples/order-timely.ears.md` says the system shall timely fulfill the order.

<!-- verify stdout 0
build/plan-verify
lint
examples/order-timely.ears.md
-->
```text
spec: examples/order-timely.ears.md
conflicts: 0
gaps: 0
misuse: 0
wording: 0
redundant: 0
duplicate: 0
vacuous: 0
unused: 0
uncovered: 0
warnings: 1

warning R1 line 6
"timely" is too vague to test. Replace it with a value a scenario can check.
When an order is submitted, the Order System shall timely fulfill the order.
Suggested fix: replace "timely" with a declared bound.
```

The fixed sentence drops the vague word and names the output:

```ears
When an order is submitted, the Order System shall fulfill the order.
```

### A weak modal

`examples/order-should.ears.md` uses `should` where the response needs `shall`. `may`, `might`, `could`, `can`, and `will try` are the same warning.

<!-- verify stdout 0
build/plan-verify
lint
examples/order-should.ears.md
-->
```text
spec: examples/order-should.ears.md
conflicts: 0
gaps: 0
misuse: 0
wording: 0
redundant: 0
duplicate: 0
vacuous: 0
unused: 0
uncovered: 0
warnings: 1

warning R1 line 6
R1 uses "should" instead of "shall".
When an order is submitted, the Order System should fulfill the order.
Suggested fix: write "shall" so the response is required.
```

The fixed sentence:

```ears
When an order is submitted, the Order System shall fulfill the order.
```

### An escape clause

`examples/order-escape.ears.md` lets the response slip with `where possible` and `if possible`.

<!-- verify stdout 0
build/plan-verify
lint
examples/order-escape.ears.md
-->
```text
spec: examples/order-escape.ears.md
conflicts: 0
gaps: 0
misuse: 0
wording: 0
redundant: 0
duplicate: 0
vacuous: 0
unused: 0
uncovered: 0
warnings: 2

warning R1 line 6
R1 uses "where possible", which lets the response slip.
When an order is submitted, the Order System shall fulfill the order where possible.
Suggested fix: delete "where possible" and keep "shall".

warning R2 line 7
R2 uses "if possible", which lets the response slip.
When an order is not submitted, the Order System shall not fulfill the order if possible.
Suggested fix: delete "if possible" and keep "shall".
```

The fixed sentences:

```ears
When an order is submitted, the Order System shall fulfill the order.
When an order is not submitted, the Order System shall not fulfill the order.
```

### Two outputs in one response

`examples/order-split.ears.md` joins two outputs with `and`. The same warning is raised for `or`. One output joined to an input bound stays quiet, and `not` of a single output stays quiet.

<!-- verify stdout 0
build/plan-verify
lint
examples/order-split.ears.md
-->
```text
spec: examples/order-split.ears.md
conflicts: 0
gaps: 0
misuse: 0
wording: 0
redundant: 0
duplicate: 0
vacuous: 0
unused: 0
uncovered: 0
warnings: 2

warning R1 line 7
R1 joins "fulfill the order" and "send a receipt" with "and" in one response.
When an order is submitted, the Order System shall fulfill the order and send a receipt.
Suggested fix: split this into one requirement per output.

warning R2 line 8
R2 joins "fulfill the order" and "send a receipt" with "and" in one response.
When an order is not submitted, the Order System shall not fulfill the order and not send a receipt.
Suggested fix: split this into one requirement per output.
```

The fixed sentences give each output its own requirement:

```ears
When an order is submitted, the Order System shall fulfill the order.
When an order is submitted, the Order System shall send a receipt.
When an order is not submitted, the Order System shall not fulfill the order.
When an order is not submitted, the Order System shall not send a receipt.
```

### A result no scenario can fail

`examples/order-untestable.ears.md` says the system shall not fail, and no output is constrained. `shall always work` and `shall always works` are the same warning. `examples/order-always-work.ears.md` is the `always work` case.

<!-- verify stdout 0
build/plan-verify
lint
examples/order-untestable.ears.md
-->
```text
spec: examples/order-untestable.ears.md
conflicts: 0
gaps: 0
misuse: 0
wording: 0
redundant: 0
duplicate: 0
vacuous: 0
unused: 0
uncovered: 0
warnings: 1

warning R1 line 5
R1 says "not fail", and no output is constrained.
When an order is submitted, the Order System shall not fail.
Suggested fix: name the output the response sets.
```

<!-- verify stdout 0
build/plan-verify
lint
examples/order-always-work.ears.md
-->
```text
spec: examples/order-always-work.ears.md
conflicts: 0
gaps: 0
misuse: 0
wording: 0
redundant: 0
duplicate: 0
vacuous: 0
unused: 0
uncovered: 0
warnings: 1

warning R1 line 5
R1 says "always work", and no output is constrained.
When a shipment is requested, the Order System shall always work.
Suggested fix: name the output the response sets.
```

The fixed sentences name an output:

```ears
When an order is submitted, the Order System shall fulfill the order.
When a shipment is requested, the Order System shall send a receipt.
```

### A word the schema does not declare

Lint already reports this as a parse error, so there is no second warning. `test/fixtures/unknown-phrase.ears.md` says "an order was submitted", and the declared phrase is "an order is submitted".

<!-- verify stderr 2
build/plan-verify
lint
test/fixtures/unknown-phrase.ears.md
-->
```text
error: test/fixtures/unknown-phrase.ears.md:5: unknown phrase "an order was submitted". Closest: "an order is submitted", "inventory is available", "fulfill the order".
```

The fixed sentence uses the declared phrase:

```ears
When an order is submitted, the Order System shall fulfill the order.
```

### The same rules, written so a scenario can check them

`examples/order-testable.ears.md` is those sentences after the fixes. Lint is quiet, including warnings:

<!-- verify stdout 0
build/plan-verify
lint
examples/order-testable.ears.md
-->
```text
spec: examples/order-testable.ears.md
conflicts: 0
gaps: 0
misuse: 0
wording: 0
redundant: 0
duplicate: 0
vacuous: 0
unused: 0
uncovered: 0
warnings: 0
```

## A word that is not bound

`examples/order-unmeasured.ears.md` says "as needed" in a description. That phrase is not a schema item. The requirements also say "respond quickly", and that phrase is declared, so "quickly" is bound and is not a finding.

<!-- verify stdout 1
build/plan-verify
lint
examples/order-unmeasured.ears.md
-->
```text
spec: examples/order-unmeasured.ears.md
conflicts: 0
gaps: 0
misuse: 0
wording: 1
redundant: 0
duplicate: 0
vacuous: 0
unused: 0
uncovered: 0
warnings: 0

wording line 4
"as needed" is too vague to test. Replace it with something a scenario can check.
output order_fulfilled: Bool "Handle it as needed." phrase "fulfill the order" outcome "the order was fulfilled" / "the order was not fulfilled"
```

<!-- verify stdout 1
build/plan-verify
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
duplicate: 0
vacuous: 0
unused: 0
uncovered: 0
warnings: 0

conflict {R4, R5}
R4 and R5 cannot both hold.

R4 line 7
When an order is submitted, the Order System shall accept at most 10 units.

R5 line 8
When an order is submitted, the Order System shall accept 12 units.

They clash when an order was submitted.
R4 requires that at most 10 units were accepted.
R5 requires that 12 units were accepted.

Example scenario:
{
  "order_submitted": true,
  "quantity": 0
}
This scenario keeps R4 and breaks R5.

Suggested fix: ask which requirement should win. To keep R4, remove R5. To keep R5, remove R4.

Candidate repairs follow. This report does not choose one.

repair drop R4
One repair is to drop R4 and keep R5 as written.
When an order is submitted, the Order System shall accept 12 units.

repair drop R5
One repair is to drop R5 and keep R4 as written.
When an order is submitted, the Order System shall accept at most 10 units.
```

R4 says a submitted order accepts at most 10 units. R5 says that same order accepts exactly 12. The example keeps R4 with a quantity of 0 only because that is the first value that satisfies R4. It is a witness, and it is not a recommendation.

`examples/order-status.ears.md` requires the status to be shipped and cancelled in every situation. `placed` is declared on the enum and no requirement mentions it.

<!-- verify stdout 1
build/plan-verify
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
duplicate: 0
vacuous: 0
unused: 1
uncovered: 0
warnings: 0

conflict {R6, R7}
R6 and R7 cannot both hold.

R6 line 6
The Order System shall mark the order shipped.

R7 line 7
The Order System shall mark the order cancelled.

They clash in every situation.
R6 requires that the order was shipped.
R7 requires that the order was cancelled.

Example scenario:
{
  "status": "shipped"
}
This scenario keeps R6 and breaks R7.

Suggested fix: ask which requirement should win. To keep R6, remove R7. To keep R7, remove R6.

Candidate repairs follow. This report does not choose one.

repair drop R6
One repair is to drop R6 and keep R7 as written.
The Order System shall mark the order cancelled.

repair drop R7
One repair is to drop R7 and keep R6 as written.
The Order System shall mark the order shipped.

unused Status.placed
Status.placed is never mentioned.
Suggested fix: use placed in a requirement, or remove it from Status.
```

## Three requirements, no pair

`examples/order-chain.ears.md` is unsatisfiable only as a set. A submitted order must be accepted, an accepted order must be shipped, and a submitted order must not be shipped. Each pair can still hold. The example keeps the first two and breaks the third. It is a witness, and it is not a recommendation. Ask which requirement should change.

<!-- verify stdout 1
build/plan-verify
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
duplicate: 0
vacuous: 0
unused: 0
uncovered: 0
warnings: 0

conflict {R1, R2, R3}
R1, R2, and R3 cannot all hold.

R1 line 7
When an order is submitted, the Order System shall accept the order.

R2 line 8
When the order is accepted, the Order System shall ship the order.

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

Candidate repairs follow. This report does not choose one.

repair drop R1
One repair is to drop R1 and keep R2 and R3 as written.
When the order is accepted, the Order System shall ship the order.
When an order is submitted, the Order System shall not ship the order.

repair drop R2
One repair is to drop R2 and keep R1 and R3 as written.
When an order is submitted, the Order System shall accept the order.
When an order is submitted, the Order System shall not ship the order.

repair drop R3
One repair is to drop R3 and keep R1 and R2 as written.
When an order is submitted, the Order System shall accept the order.
When the order is accepted, the Order System shall ship the order.

repair strengthen R2
One repair is to add "and an order is not submitted" to the condition of R2. R1 and R3 stay as written.
When the order is accepted and an order is not submitted, the Order System shall ship the order.
```

## A requirement that adds nothing

`examples/order-redundant.ears.md` says a submitted order is fulfilled, and also that a submitted order with inventory is fulfilled. The second one is already required by the first. Lint names R2, says R1 implies it, and asks. It does not delete it. That finding is a warning: this spec exits 0. A conflict does not hide a repeat that sits outside that conflict. Lint checks redundancy on the requirements that are not part of any conflict.

<!-- verify stdout 0
build/plan-verify
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
duplicate: 0
vacuous: 0
unused: 0
uncovered: 0
warnings: 0

redundant R2 line 8
R2 adds nothing. R1 implies it. Whenever the other requirements hold, R2 holds too.
When an order is submitted and inventory is available, the Order System shall fulfill the order.
Suggested fix: remove R2, or ask whether it was meant to say something the others do not already require. Do not delete it until the PM agrees.
```

## A repeat next to a conflict

`examples/order-repeat.ears.md` conflicts on whether a submitted order is fulfilled. Separately, closing a submitted order already requires closing it when inventory is available. `R5` is not part of the conflict, so lint still names it.

<!-- verify stdout 1
build/plan-verify
lint
examples/order-repeat.ears.md
-->
```text
spec: examples/order-repeat.ears.md
conflicts: 1
gaps: 0
misuse: 0
wording: 0
redundant: 1
duplicate: 0
vacuous: 0
unused: 0
uncovered: 0
warnings: 0

conflict {R1, R2}
R1 and R2 cannot both hold.

R1 line 8
When an order is submitted, the Order System shall fulfill the order.

R2 line 9
When an order is submitted, the Order System shall not fulfill the order.

They clash when an order was submitted and inventory was not available.
R1 requires that the order was fulfilled.
R2 requires that the order was not fulfilled.

Example scenario:
{
  "order_submitted": true,
  "inventory_available": false,
  "order_fulfilled": true,
  "order_closed": false
}
This scenario keeps R1 and breaks R2.

Suggested fix: ask which requirement should win. To keep R1, remove R2. To keep R2, remove R1.

Candidate repairs follow. This report does not choose one.

repair drop R1
One repair is to drop R1 and keep R2 as written.
When an order is submitted, the Order System shall not fulfill the order.

repair drop R2
One repair is to drop R2 and keep R1 as written.
When an order is submitted, the Order System shall fulfill the order.

redundant R5 line 12
R5 adds nothing. R4 implies it. Whenever the requirements outside a conflict hold, R5 holds too.
When an order is submitted and inventory is available, the Order System shall close the order.
Suggested fix: remove R5, or ask whether it was meant to say something the others do not already require. Do not delete it until the PM agrees.
```

## The same condition and the same response

`examples/order-duplicate.ears.md` states the fulfilled-order rule twice. That is a duplicate, not a redundant requirement: the two lines are the same condition and the same response. Lint names the later line and the earlier id. It does not call it redundant.

<!-- verify stdout 1
build/plan-verify
lint
examples/order-duplicate.ears.md
-->
```text
spec: examples/order-duplicate.ears.md
conflicts: 0
gaps: 0
misuse: 0
wording: 0
redundant: 0
duplicate: 1
vacuous: 0
unused: 0
uncovered: 0
warnings: 0

duplicate R2 line 7
R2 duplicates R1. The condition and the response are the same.
When an order is submitted, the Order System shall fulfill the order.
Suggested fix: remove R2, or ask whether it was meant to differ from R1. Do not delete it until the PM agrees.
```

<!-- verify stdout 1
build/plan-verify
report
examples/order-duplicate.ears.md
-->
```text
# Logical problems

Spec: examples/order-duplicate.ears.md

These are the logical problems in the requirements. For a contradiction, which requirement should win? This report does not choose.

## 1. R2 duplicates R1

R2 line 7
"When an order is submitted, the Order System shall fulfill the order."

R2 duplicates R1. The condition and the response are the same.

R1 line 6
"When an order is submitted, the Order System shall fulfill the order."

Suggested fix: remove R2, or ask whether it was meant to differ from R1. Do not delete it until the PM agrees.
```

## A trigger that starts with not

`examples/order-negation.ears.md` says `When not a member asks`. The trigger is a bare negation. Lint asks for a positive condition, such as `When a non-member asks`, or a positive event. `is not` stays the normal way to negate a phrase that contains `is`.

<!-- verify stdout 1
build/plan-verify
lint
examples/order-negation.ears.md
-->
```text
spec: examples/order-negation.ears.md
conflicts: 0
gaps: 0
misuse: 0
wording: 1
redundant: 0
duplicate: 0
vacuous: 0
unused: 0
uncovered: 0
warnings: 0

wording line 6
The trigger is a bare negation. Write a positive condition, such as "When a non-member asks", or declare a positive event.
When not a member asks to take a copy home, the Desk shall not allow the loan.
```

## A condition that can never be true

`examples/order-vacuous.ears.md` has a condition that contradicts itself, and a quantity comparison outside the declared range. The response is never demanded. Lint names each one as vacuous and lists the smallest reason under `Blocked by`. A self-contradiction says the condition contradicts itself. A comparison outside a declared range names that range. It does not also call that requirement redundant or a duplicate, because a condition that can never be true is implied by anything. The vacuous line says to rewrite the condition. It does not pick a response. This finding exits 1.

<!-- verify stdout 1
build/plan-verify
lint
examples/order-vacuous.ears.md
-->
```text
spec: examples/order-vacuous.ears.md
conflicts: 0
gaps: 0
misuse: 0
wording: 0
redundant: 0
duplicate: 0
vacuous: 2
unused: 0
uncovered: 0
warnings: 0

vacuous R1 line 7
R1 can never trigger. Its condition is impossible for every allowed value.
When the cart is open and the cart is not open, the Checkout shall accept the order.
Blocked by the condition contradicts itself.
Suggested fix: rewrite the condition in R1 so a real situation can make it true, or remove the requirement. Do not invent a response.

vacuous R2 line 8
R2 can never trigger. Its condition is impossible for every allowed value.
When the quantity is at least 9, the Checkout shall accept the order.
Blocked by the quantity is 1..5.
Suggested fix: rewrite the condition in R2 so a real situation can make it true, or remove the requirement. Do not invent a response.
```

## Always-true requirements that block a trigger

`examples/order-blocked.ears.md` always keeps the gate closed and the shift closed. R3 fires only when one of them is open, so it can never fire. `Blocked by` names the smallest set of always-true requirements that make the trigger impossible. R1 alone is not enough, and R2 alone is not enough. This finding exits 1.

<!-- verify stdout 1
build/plan-verify
lint
examples/order-blocked.ears.md
-->
```text
spec: examples/order-blocked.ears.md
conflicts: 0
gaps: 0
misuse: 0
wording: 0
redundant: 0
duplicate: 0
vacuous: 1
unused: 0
uncovered: 0
warnings: 0

vacuous R3 line 9
R3 can never trigger. Its condition is impossible for every allowed value.
When the gate is open or the shift is open, the Desk shall finish the job.
Blocked by R1.
Blocked by R2.
Suggested fix: rewrite the condition in R3 so a real situation can make it true, or remove the requirement. Do not invent a response.
```

`examples/order-reachable.ears.md` is the same shape of desk with a trigger that can happen. Lint is quiet.

<!-- verify stdout 0
build/plan-verify
lint
examples/order-reachable.ears.md
-->
```text
spec: examples/order-reachable.ears.md
conflicts: 0
gaps: 0
misuse: 0
wording: 0
redundant: 0
duplicate: 0
vacuous: 0
unused: 0
uncovered: 0
warnings: 0
```

## Outputs, states, and enum values nothing produces

`examples/order-uncovered.ears.md` declares a loyalty state no requirement mentions, a receipt output that requirements only read, and a refund lane that no requirement can produce. Hold and fulfill are produced, so the lane itself is constrained. Uncovered findings are warnings. This spec exits 0.

<!-- verify stdout 0
build/plan-verify
lint
examples/order-uncovered.ears.md
-->
```text
spec: examples/order-uncovered.ears.md
conflicts: 0
gaps: 0
misuse: 0
wording: 0
redundant: 0
duplicate: 0
vacuous: 0
unused: 0
uncovered: 3
warnings: 0

uncovered loyalty
No requirement constrains loyalty ("the customer is loyal").
Suggested fix: use loyalty in a requirement, or remove it from the schema.

uncovered receipt_sent
No requirement constrains receipt_sent ("a receipt is sent").
Suggested fix: add a shall requirement that sets receipt_sent, or remove it from the schema. Do not choose the value.

uncovered Lane.refund
No requirement can set "the lane" to refund.
Suggested fix: add a requirement that produces refund, or remove it from Lane.
```

`examples/order-lane.ears.md` produces both declared lane values. Lint is quiet.

<!-- verify stdout 0
build/plan-verify
lint
examples/order-lane.ears.md
-->
```text
spec: examples/order-lane.ears.md
conflicts: 0
gaps: 0
misuse: 0
wording: 0
redundant: 0
duplicate: 0
vacuous: 0
unused: 0
uncovered: 0
warnings: 0
```

## Schema the requirements never use

`examples/order-unused.ears.md` declares an input that no sentence mentions. That stays an error. A state no requirement mentions, an output no response sets, and an enum value a constrained output can never produce are uncovered warnings on the same spec. An output that no requirement mentions at all is still a gap. An event that nobody handles stays a gap. When the spec already conflicts, lint does not also list every enum value as unreachable.

<!-- verify stdout 1
build/plan-verify
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
duplicate: 0
vacuous: 0
unused: 1
uncovered: 3
warnings: 0

unused region
region ("the region") is an input and no requirement mentions it.
Suggested fix: use region in a requirement, or remove it from the schema.

uncovered loyalty
No requirement constrains loyalty ("the customer is loyal").
Suggested fix: use loyalty in a requirement, or remove it from the schema.

uncovered receipt_sent
No requirement constrains receipt_sent ("a receipt is sent").
Suggested fix: add a shall requirement that sets receipt_sent, or remove it from the schema. Do not choose the value.

uncovered Lane.refund
No requirement can set "the lane" to refund.
Suggested fix: add a requirement that produces refund, or remove it from Lane.
```

The `--json` object for this spec is in [json.md](json.md).
