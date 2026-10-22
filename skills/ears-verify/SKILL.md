---
name: ears-verify
description: Use when a product manager is stating or revising requirements. Turn their words into EARS with this grammar, run ears-verify lint, explain any conflict, and ask which requirement should win before anyone builds the system.
---

# ears-verify

You are in a conversation with a product manager. They are telling you what a system should do, often in a few passes, sometimes contradicting what they said earlier. Turn what they say into EARS requirements with the grammar below, then run ears-verify.

Lint is implemented, and it is the check that matters. When it reports a conflict, explain it in plain words: which requirements clash, under what situation, the example scenario, and the suggested fix. Ask which requirement should win. Do not choose one, and do not paper over the clash with a new sentence they did not ask for.

`policy` is planned. Today it only prints `not implemented yet`.

The samples below are the built CLI. `node --experimental-strip-types src/main.ts` prints the same bytes when `build/ears-verify` is not there yet. The same spec always produces the same SMT-LIB.

## Vocabulary

Declare every name before the requirement that uses it. One name per idea, reused every time the PM comes back to that idea. Bind that name to the phrase they actually say. The requirement line uses the phrase, not the name. The name is what a JSON scenario and the SMT-LIB use.

```ears
enum Region { us, eu }
event order_submitted: Bool "The customer submits an order." phrase "an order is submitted"
state inventory_available: Bool "Enough stock is on hand to fill the order." phrase "inventory is available"
input quantity: Int 1..10 "How many units the customer asked for." phrase "the quantity"
input region: Region "The region the order ships to." phrase "the region"
output order_fulfilled: Bool "The order is fulfilled." phrase "fulfill the order"
unwanted event payment_declined: Bool "The payment was declined." phrase "payment fails"
```

Keywords are case-insensitive. Names keep the case you wrote. A phrase match is case-insensitive too.

| Declaration | Form the parser accepts |
| --- | --- |
| Enum | `enum Name { variant, variant }` |
| Event | `event name: Bool "description" phrase "words"` |
| State | `state name: Bool "description" phrase "words"` |
| Input | `input name: Type "description" phrase "words"` |
| Output | `output name: Type "description" phrase "words"` |
| Unwanted event | `unwanted event name: Bool "description" phrase "words"` |

`phrase` is optional. Leave it off only when you are still naming the idea. Once it is there, write requirements with that phrase.

`Type` is `Bool`, `Int min..max`, or an enum name declared above that line. Events and states are `Bool` only. An unwanted marker applies only to an event. Ranges are inclusive and both ends sit inside `-1000000..1000000`. At least one variant is required. Variant names are unique across the whole spec and cannot match a symbol name.

A description and a phrase are double-quoted strings. `\"`, `\\`, `\/`, and `\t` are the escapes. A newline is rejected, and an empty description or phrase is rejected. Extra spaces inside a phrase collapse to one space. A phrase is words: a hyphen may sit inside a word (`user-friendly`), and `+`, `=`, and other punctuation may not. A phrase cannot start with `not`, `and`, or `or`. A one-word phrase cannot be a reserved word. Two phrases that match ignoring case are an error, and a phrase cannot repeat another symbol, enum, or variant.

These words are reserved and cannot be names: `not`, `and`, `or`, `true`, `false`, `while`, `when`, `if`, `where`, `then`, `the`, `shall`, `should`, `must`, `will`, `event`, `state`, `input`, `output`, `unwanted`, `enum`, `bool`, `int`, `phrase`.

Blank lines, `#` headings, `//` comments, and a full-line `<!-- ...` are ignored. A requirement may continue onto the next lines until a blank line, a comment, a declaration, or the next id. The requirement's line number is the line of its id.

## Phrases

Matching is exact. The words in the sentence have to be a declared phrase, compared without regard to case. The longest phrase wins, so `an order` does not steal `an order is submitted` when both are declared. There is no fuzzy match and no stemming.

`not` in front of a phrase is the negation: `not fulfill the order`. Write that. Do not declare a second phrase for the false case.

An unknown run of words is an error. The message names the line and up to three closest phrases, nearest edit distance first:

<!-- verify stderr 2
build/ears-verify
lint
test/fixtures/unknown-phrase.ears.md
-->
```text
error: test/fixtures/unknown-phrase.ears.md:5: unknown phrase "an order was submitted". Closest: "an order is submitted", "inventory is available", "fulfill the order".
```

When you see that, show the PM the sentence and the suggestions. Ask which declared phrase they meant, or add a phrase they just introduced. Do not silently pick one.

A name with no phrase still parses as that name. Prefer the phrase in anything the PM will read.

## Operations

A condition or a response is a boolean expression. This is the whole language. The phrase column is what you write once `phrase` is declared. The name column is the same term with no phrase bound.

| With a phrase | With only the name | What it means |
| --- | --- | --- |
| `an order is submitted` | `order_submitted` | That Bool symbol is true. |
| `not fulfill the order` | `not order_fulfilled` | That Bool symbol is false. |
| `not the quantity is 1` | `not quantity = 1` | `not` applies to the comparison: the quantity is something other than 1. |
| `a and b` | `a and b` | Both sides are true. `and` binds tighter than `or`. |
| `a or b` | `a or b` | Either side is true. |
| `true`, `false` | `true`, `false` | Boolean literals, any case. |
| `the quantity is 1`, `the quantity is not 1` | `quantity = 1`, `quantity != 1` | Equality. Both sides must be Bool, both Int, or the same enum. |
| `the quantity is less than 2`, `is at most`, `is greater than`, `is at least` | `quantity < 2`, `<=`, `>`, `>=` | Integer comparisons only. |
| `the number shipped is the quantity + 1` | `shipped = quantity + 1`, and `quantity - 1` | Integer addition and subtraction. |
| `the offset is -1` | `offset = -1` | A negative integer literal. No leading zeros. |
| `the region is us` | `region = us` | The symbol equals that enum variant. `us` is the variant name. |
| `(a or b) and c` | `(a or b) and c` | Parentheses group the expression. |

`is`, `is not`, `is at most`, `is at least`, `is less than`, and `is greater than` are the same comparisons as `=`, `!=`, `<=`, `>=`, `<`, and `>`. When the left side has a phrase, reports print the English form.

`shall the quantity` is rejected, because the response has to be a boolean. `shall the quantity is 1` is accepted. `+` and `-` expect integers.

## EARS patterns

Clauses that appear go in this order, separated by commas: `while`, `when`, `if`, `where`. `then` is required when `if` is present, and rejected when `if` is absent. The line ends with a period. The id is `R`, digits, then zero or more `.digits` groups, such as `R1` or `R1.2`. One requirement per line.

```ears
While <state>, when <trigger>, if <condition>, where <feature>, then the <system> shall <response>.
```

| Pattern | Use it for | Shape the parser accepts |
| --- | --- | --- |
| Ubiquitous | A response that is always required | `The Order System shall fulfill the order.` |
| When | The normal trigger | `When an order is submitted, the Order System shall fulfill the order.` |
| If, then | An unwanted or exceptional case | `If payment fails, then the Order System shall reject the order.` |
| While | A state that already holds | `While inventory is available, the Order System shall fulfill the order.` |
| Where | A variant, such as a region | `Where the region is us, the Order System shall fulfill the order.` |
| Combined | Any of the above, in the order above | `While inventory is available, when an order is submitted, if the quantity is at least 1, where the region is us, then the Warehouse shall the number shipped is the quantity.` |

`should`, `must`, and `will` are not `shall`. The parser stops and asks for `shall`.

Each requirement with at least one clause becomes one implication. The clauses are joined with `and` in the order while, when, if, where, and that antecedent implies the response. A ubiquitous requirement is asserted as the response itself. Assertion names are the id, `_L`, and the line, such as `R1_L7`. The SMT-LIB uses the symbol names. The comment above each assertion repeats the original sentence.

An unwanted event is written with `if` ... `then`. `when` is the normal trigger. Lint flags an unwanted event used in `when` without an `if`.

The line has to be something a scenario can make true or false. Lint rejects these whole words as too vague to test: `fast`, `slow`, `large`, `small`, `appropriate`, `quickly`, `easy`, `robust`, `flexible`, `user-friendly`, `efficient`. It also rejects solution words: `database`, `api`, `algorithm`, `microservice`, `server`, `class`, `function`. Put the PM's phrasing in the description only after those words are gone, or say the testable fact in the requirement.

## Workflow

1. Listen. Write down the PM's words before you translate them.
2. Add or reuse declarations. If they describe something you already named, use that name and its phrase. Bind a new phrase to the words they keep using.
3. Write one EARS line per requirement, using the phrases. Normal triggers use `when`. Unwanted conditions use `if` ... `then`.
4. Run `build/ears-verify lint <spec>`.
5. Fix what lint reports. For a conflict, tell the PM which requirements clash, the situation, and the example, then ask which requirement should win. Stop until they answer. Do not choose.
6. When they describe a concrete story, write a flat JSON scenario with every declared name and run `build/ears-verify check <spec> --input <scenario>`. `policy` is the planned search for a scenario that breaks a separate property. It is not available yet; say that, and do not invent its result.
7. Report every check violation by requirement ID, line, and sentence, then the values. A passing check can still leave a gap. If lint reported one, say which output is uncovered and in what situation.

`--json` is the same report in a stable shape, for you. Show the PM the text.

A scenario value is `true` or `false`, an integer inside the declared range, or an enum variant string. Every declared name is required. Extra names are rejected. Leading zeros are rejected.

## Milestone 1: one requirement, one scenario

`examples/order.ears.md` says: when an order is submitted and inventory is available, the order is fulfilled. R1 is line 7.

This scenario breaks it. Report `R1`, line 7, and the sentence below:

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
an order is submitted, inventory is available, and not fulfill the order.
```

This scenario fits R1:

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

`emit-smt` prints the implication. The comment maps the assertion back to line 7 and the sentence:

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
; output order_fulfilled: Bool "The order is fulfilled." phrase "fulfill the order"
(declare-fun order_fulfilled () Bool)
; R1_L7 line 7: WHEN an order is submitted AND inventory is available, THE Order System SHALL fulfill the order.
(assert (! (=> (and order_submitted inventory_available) order_fulfilled) :named R1_L7))
```

Lint on that same spec is already useful. The check can pass while a situation is still uncovered:

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
Nothing covers fulfill the order when an order is submitted and not inventory is available.
```

Ask what should happen in that situation. `examples/order-covered.ears.md` answers every situation, and lint is clean:

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

## Combined clauses

`examples/order-combined.ears.md` uses while, when, if, and where. The id is `R1.2`. The printed implication nests `and` in clause order, and the integer range is its own unnamed assertion:

<!-- verify stdout 0
build/ears-verify
emit-smt
examples/order-combined.ears.md
-->
```text
; spec: examples/order-combined.ears.md
(set-logic ALL)
; enum Region { us, eu }
(declare-datatypes ((Region 0)) (((us) (eu))))
; state inventory_available: Bool "Enough stock is on hand to fill the order." phrase "inventory is available"
(declare-fun inventory_available () Bool)
; event order_submitted: Bool "The customer submits an order." phrase "an order is submitted"
(declare-fun order_submitted () Bool)
; input quantity: Int 1..5 "How many units the customer asked for." phrase "the quantity"
(declare-fun quantity () Int)
(assert (and (>= quantity 1) (<= quantity 5)))
; input region: Region "The region the order ships to." phrase "the region"
(declare-fun region () Region)
; output shipped: Int 1..5 "How many units are shipped." phrase "the number shipped"
(declare-fun shipped () Int)
(assert (and (>= shipped 1) (<= shipped 5)))
; R1.2_L10 line 10: While inventory is available, when an order is submitted, if the quantity is at least 1, where the region is us, then the Warehouse shall the number shipped is the quantity.
(assert (! (=> (and (and (and inventory_available order_submitted) (>= quantity 1)) (= region us)) (= shipped quantity)) :named R1.2_L10))
```

## Bad: the PM has said both things

`examples/order-conflict.ears.md` records two answers for a submitted order. Lint is implemented; this is its real report:

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
When an order is submitted, the Order System shall fulfill the order.

R3 line 8
When an order is submitted, the Order System shall not fulfill the order.

They clash when an order is submitted.
R2 requires fulfill the order.
R3 requires not fulfill the order.

Example scenario:
{
  "order_submitted": true,
  "order_fulfilled": true
}
This scenario keeps R2 and breaks R3.

Suggested fix: ask which requirement should win. To keep R2, remove R3. To keep R3, remove R2.
```

Tell the PM: when an order is submitted, R2 says it is fulfilled and R3 says it is not. The example keeps R2 and breaks R3 only because R3 is the last requirement in the set. It is evidence, not a vote. Ask which requirement should win, and wait.

## Unwanted events use if, then

`examples/payment-if.ears.md` writes a declined payment with `if` ... `then`. Lint is clean:

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

`examples/order-misuse.ears.md` uses `when` for that unwanted event. Show the finding and rewrite it with the PM as `If payment fails, then the Order System shall reject the order.`

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
"payment fails" is an unwanted event. Write if ... then, not when.
When payment fails, the Order System shall reject the order.
```

## Vague words and solution words

`examples/order-wording.ears.md` says the system "responds quickly" and stores the order "in the database". Ask what a scenario can check, and what the system must guarantee.

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
output order_fulfilled: Bool "The system responds quickly." phrase "fulfill the order"

wording line 5
"database" names a solution. Say what the system must do, not how to build it.
state saved: Bool "Store the order in the database." phrase "the order is saved"
```

## An event nobody handles

`examples/order-unhandled.ears.md` declares "an order is cancelled" and never says what the system shall do. Tell the PM, and ask them to add the requirement or drop the event. Do not invent the response.

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

gap order_cancelled
No requirement handles "an order is cancelled". Suggested fix: add a requirement that says what the system shall do, or remove the event.
```

## An error condition with no response

`examples/order-unanswered.ears.md` declares "payment fails" and no `if` ... `then` says what happens. Ask what the system shall do. Do not choose.

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

gap payment_declined
No requirement states a response when "payment fails". Suggested fix: add an if ... then requirement, and ask what the system shall do. Do not choose the response.
```

## Vague: fast, appropriate, user-friendly

`examples/order-vague.ears.md` describes the checkout as fast, appropriate, and user-friendly. Each word is a separate finding. Ask what a scenario can check instead.

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

wording line 4
"fast" is too vague to test. Replace it with something a scenario can check.
output order_fulfilled: Bool "The checkout is fast, appropriate, and user-friendly." phrase "fulfill the order"

wording line 4
"appropriate" is too vague to test. Replace it with something a scenario can check.
output order_fulfilled: Bool "The checkout is fast, appropriate, and user-friendly." phrase "fulfill the order"

wording line 4
"user-friendly" is too vague to test. Replace it with something a scenario can check.
output order_fulfilled: Bool "The checkout is fast, appropriate, and user-friendly." phrase "fulfill the order"
```

## Integer clash

`examples/order-quantity.ears.md` says a submitted order accepts at most 10 units, and also that it accepts exactly 12. Show both sentences, the situation, and the example. The example quantity is 0 because that is the first value that keeps R4. Ask which requirement should win.

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

conflict {R4, R5}
R4 and R5 cannot both hold.

R4 line 7
When an order is submitted, the Order System shall the quantity is at most 10.

R5 line 8
When an order is submitted, the Order System shall the quantity is 12.

They clash when an order is submitted.
R4 requires the quantity is at most 10.
R5 requires the quantity is 12.

Example scenario:
{
  "order_submitted": true,
  "quantity": 0
}
This scenario keeps R4 and breaks R5.

Suggested fix: ask which requirement should win. To keep R4, remove R5. To keep R5, remove R4.
```

## Enum clash

`examples/order-status.ears.md` requires the status to be shipped and cancelled. They clash in every situation. Ask which requirement should win.

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

conflict {R6, R7}
R6 and R7 cannot both hold.

R6 line 6
The Order System shall the status is shipped.

R7 line 7
The Order System shall the status is cancelled.

They clash in every situation.
R6 requires the status is shipped.
R7 requires the status is cancelled.

Example scenario:
{
  "status": "shipped"
}
This scenario keeps R6 and breaks R7.

Suggested fix: ask which requirement should win. To keep R6, remove R7. To keep R7, remove R6.
```

## policy is planned

`policy` will search for a scenario that breaks a property stated apart from the requirements. The command exists so the workflow has a place to call it. This is the whole behavior today:

<!-- verify stdout 3
build/ears-verify
policy
-->
```text
not implemented yet
```

Do not describe a scenario `policy` found. It did not look.

## What you do not do

- You do not pick the winning requirement.
- You do not drop a conflict and move on to a design, an API, or a schema for the build.
- You do not treat the example scenario as the behavior they agreed to.
- You do not introduce a second name for an idea that already has one.
- You do not report a check violation without its requirement ID, line, and sentence.
