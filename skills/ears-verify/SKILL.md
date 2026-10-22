# ears-verify

You are in a conversation with a product manager. They are telling you what a system should do, often in a few passes, sometimes contradicting what they said earlier. Turn what they say into EARS requirements with one fixed vocabulary, then run ears-verify.

Lint is the check that matters. When it reports a conflict, explain it in plain words: which requirements clash, under what situation, the example scenario, and the suggested fix. Ask which requirement should win. Do not choose one, and do not paper over the clash with a new sentence they did not ask for.

The commands below are the built CLI. `node --experimental-strip-types src/main.ts` prints the same bytes if `build/ears-verify` is not there yet.

## Vocabulary

Declare names before the requirements that use them. One name per idea, reused every time the PM comes back to that idea. The description is their English. The requirement line uses the name, so two spellings cannot sneak in as if they were two facts.

```text
event order_submitted: Bool "The customer submits an order."
state inventory_available: Bool "Enough stock is on hand to fill the order."
input quantity: Int 1..10 "How many units the customer asked for."
enum Decision { fulfill, reject }
output decision: Decision "What the system decides."
output order_fulfilled: Bool "The order is fulfilled."
unwanted event payment_declined: Bool "The payment was declined."
```

- Events and states are `Bool`. Inputs and outputs are `Bool`, `Int min..max`, or an enum you declared above them.
- Integer ranges are inclusive and stay inside `-1000000..1000000`. Keep the product of the domain sizes at or below 250000, or lint refuses to search.
- An unwanted event is something going wrong. Write it with `if` ... `then`. `when` is the normal trigger, and lint flags an unwanted event used that way.
- One requirement per line. Ids look like `R1` or `R1.2`. End the sentence with a period.
- The line has to be something a scenario can make true or false. Leave out `fast`, `quickly`, `large`, `appropriate`, `robust`, `user-friendly`, and the other vague words lint knows. Leave out solution words too: `database`, `api`, `algorithm`, `microservice`, `server`, `class`, `function`.
- Descriptions are required. They are where the PM's phrasing lives.

## Patterns the parser accepts

Clauses that appear go in this order. `then` is present exactly when `if` is present.

```text
While <state>, when <trigger>, if <condition>, where <feature>, then the <system> shall <response>.
```

| Pattern | Use it for | Shape |
| --- | --- | --- |
| Ubiquitous | A response that is always required | `The Order System shall order_fulfilled.` |
| When | The normal trigger | `When order_submitted, the Order System shall order_fulfilled.` |
| If, then | An unwanted or exceptional case | `If payment_declined, then the Order System shall order_rejected.` |
| While | A state that is already true | `While inventory_available, the Order System shall order_fulfilled.` |
| Where | A variant, such as a region or a tier | `Where region = us, the Order System shall order_fulfilled.` |

Responses are booleans: a name, `not` a name, comparisons, `and` / `or`, and `+` / `-` on integers. `shall not quantity = 1` means the quantity is something other than 1.

## Workflow

1. Listen. Write down the PM's words before you translate them.
2. Add or reuse declarations. If they describe something you already named, use that name.
3. Write one EARS line per requirement.
4. Run `build/ears-verify lint <spec>`.
5. If lint reports a conflict, tell the PM which requirements clash, the situation, and the example. Read the suggested fix, and ask which requirement should win. Stop there until they answer.
6. Edit the spec to match their answer. Lint again.
7. When they describe a concrete story, write a scenario JSON with every declared name and run `build/ears-verify check <spec> --input <scenario>`. A passing check can still leave a gap. Mention the gap if lint reported one.

`--json` is the same report in a stable shape, for you. Show the PM the text.

## Good: every situation has an answer

`examples/order-covered.ears.md` says what fulfillment does when the order is submitted and stock is on hand, when it is submitted and stock is short, and when nothing was submitted.

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

A story that fits the smaller spec in `examples/order.ears.md`:

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

That spec still has a hole. Say so, and ask what should happen when the order is submitted and the inventory is not available:

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

## Bad: the PM has said both things

`examples/order-conflict.ears.md` records two answers for a submitted order.

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

Tell the PM, in your own words: when an order is submitted, R2 says it is fulfilled and R3 says it is not. The example is one assignment that keeps R2 and breaks R3. It is not a vote for R2. Ask which requirement should win, and wait.

A scenario they dictate can also miss a requirement. Explain the line and the values. Do not change the requirement to make their scenario pass unless they tell you the requirement was wrong.

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

## Unwanted events use if, then

A declined payment is unwanted. `examples/payment-if.ears.md` writes it that way, and lint is clean:

<!-- verify stdout 0
build/ears-verify
lint
examples/payment-if.ears.md
-->
```text
spec: examples/payment-if.ears.md
conflicts: 0
gaps: 0
misuse: 0
wording: 0
```

`examples/order-misuse.ears.md` uses `when` for the same kind of event. Show the PM the finding and rewrite the line with them as `if payment_declined, then ...`.

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

misuse R4 line 6
payment_declined is an unwanted event. Write if ... then, not when.
When payment_declined, the Order System shall order_rejected.
```

## Vague words and solution words

`examples/order-wording.ears.md` says the system "responds quickly" and stores the order "in the database". Ask the PM what a scenario can check, and what the system must guarantee, and put that in the description or in a requirement.

<!-- verify stdout 1
build/ears-verify
lint
examples/order-wording.ears.md
-->
```text
spec: examples/order-wording.ears.md
conflicts: 0
gaps: 0
misuse: 0
wording: 2

wording line 4
"quickly" is too vague to test. Replace it with something a scenario can check.
output order_fulfilled: Bool "The system responds quickly."

wording line 5
"database" names a solution. Say what the system must do, not how to build it.
state saved: Bool "Store the order in the database."
```

## What you do not do

- You do not pick the winning requirement.
- You do not drop a conflict and move on to design, an API, or a schema for the build.
- You do not treat the example scenario as the behavior they agreed to. It is evidence that the set cannot all hold.
- You do not introduce a second name for an idea that already has one.
