# Semantic diff

`diff` compares two versions of a spec by what they accept. The solver in this repository finds one witness each way: a scenario the new spec now allows that the old one forbade, and a scenario the old spec allows that the new one forbids. Each witness is the first assignment, false before true, in the JSON shape `check --input` reads. `--out <dir>` writes `old-accepts-new-rejects.json` and `new-accepts-old-rejects.json` when those witnesses exist.

Schema changes are listed first: names only in one file, ranges and enum values compared on the overlap, and names left out when the type, the range, or the variants do not meet. The rest of the spec is still compared. Requirements match by id. An id that changed, with the same sentence, is renamed. A matched requirement whose text changed and whose formula is the same is marked `reworded, same meaning`.

Exit 0 means the compared meaning is the same. Exit 1 means a witness exists, or a name was left out of the comparison. Exit 2 is a file that cannot be read or parsed.

## Same meaning

`test/fixtures/diff-reword-old.ears.md` and `test/fixtures/diff-reword-new.ears.md` say the same rule. The second file spells it in sentence case.

<!-- verify stdout 0
build/plan-verify
diff
test/fixtures/diff-reword-old.ears.md
test/fixtures/diff-reword-new.ears.md
-->
```text
old: test/fixtures/diff-reword-old.ears.md
new: test/fixtures/diff-reword-new.ears.md
schema:
none
added:
none
removed:
none
renamed:
none
reworded:
R1
old line 5
WHEN an order is submitted AND inventory is available, THE Order System SHALL fulfill the order.
new line 5
When an order is submitted and inventory is available, the Order System shall fulfill the order.
reworded, same meaning
behavior:
No scenario changes acceptance.
lint:
conflicts fixed:
none
conflicts new:
none
gaps fixed:
none
gaps new:
none
```

## Tightened

`examples/order-v2.ears.md` adds the responses `examples/order-v1.ears.md` left open. The witness is an order that was never submitted and was fulfilled anyway. R3 is the new requirement that forbids it. R3 is absent from the old spec.

<!-- verify stdout 1
build/plan-verify
diff
examples/order-v1.ears.md
examples/order-v2.ears.md
--out
build/doc-diff
-->
```text
old: examples/order-v1.ears.md
new: examples/order-v2.ears.md
out: build/doc-diff
schema:
none
added:
R2 line 8
WHEN an order is submitted AND inventory is not available, THE Order System SHALL not fulfill the order.

R3 line 9
WHEN an order is not submitted, THE Order System SHALL not fulfill the order.
removed:
none
renamed:
none
reworded:
none
behavior:
The old spec accepts this scenario and the new spec rejects it.
old-accepts-new-rejects.json
{
  "order_submitted": false,
  "inventory_available": false,
  "order_fulfilled": true
}
old:
R3 is not in the old spec.
new:
R3 line 9
WHEN an order is not submitted, THE Order System SHALL not fulfill the order.
An order was not submitted, but the order was fulfilled.

No scenario is accepted by the new spec and rejected by the old spec.
lint:
conflicts fixed:
none
conflicts new:
none
gaps fixed:
order_fulfilled
Nothing says whether the order was fulfilled when an order was submitted and inventory was not available. Suggested fix: add a requirement for this situation, and ask what the system shall do. Do not choose the response.
gaps new:
none
```

`check` on the new spec reports that requirement.

<!-- verify stdout 1
build/plan-verify
check
examples/order-v2.ears.md
--input
build/doc-diff/old-accepts-new-rejects.json
-->
```text
spec: examples/order-v2.ears.md
scenario: build/doc-diff/old-accepts-new-rejects.json
violations: 1

R3 line 9
WHEN an order is not submitted, THE Order System SHALL not fulfill the order.
An order was not submitted, but the order was fulfilled.
```

## Loosened

The same pair in the other direction. The new spec allows the scenario the old spec forbids, because R3 is gone.

<!-- verify stdout 1
build/plan-verify
diff
examples/order-v2.ears.md
examples/order-v1.ears.md
-->
```text
old: examples/order-v2.ears.md
new: examples/order-v1.ears.md
schema:
none
added:
none
removed:
R2 line 8
WHEN an order is submitted AND inventory is not available, THE Order System SHALL not fulfill the order.

R3 line 9
WHEN an order is not submitted, THE Order System SHALL not fulfill the order.
renamed:
none
reworded:
none
behavior:
No scenario is accepted by the old spec and rejected by the new spec.

The new spec accepts this scenario and the old spec rejects it.
{
  "order_submitted": false,
  "inventory_available": false,
  "order_fulfilled": true
}
old:
R3 line 9
WHEN an order is not submitted, THE Order System SHALL not fulfill the order.
An order was not submitted, but the order was fulfilled.
new:
R3 is not in the new spec.
lint:
conflicts fixed:
none
conflicts new:
none
gaps fixed:
none
gaps new:
order_fulfilled
Nothing says whether the order was fulfilled when an order was submitted and inventory was not available. Suggested fix: add a requirement for this situation, and ask what the system shall do. Do not choose the response.
```

## Schema change

`order_fulfilled` is a Bool in one file and an Int in the other. That name is left out, and the command still prints the requirement text. Exit 1, because the skipped name was part of the meaning.

<!-- verify stdout 1
build/plan-verify
diff
test/fixtures/diff-type-old.ears.md
test/fixtures/diff-type-new.ears.md
-->
```text
old: test/fixtures/diff-type-old.ears.md
new: test/fixtures/diff-type-new.ears.md
schema:
order_fulfilled is Bool in test/fixtures/diff-type-old.ears.md and Int in test/fixtures/diff-type-new.ears.md. Left out of the comparison.
added:
none
removed:
none
renamed:
none
reworded:
R1
old line 3
The Order System shall fulfill the order.
new line 3
The Order System shall fulfill 1 orders.
behavior:
No scenario changes acceptance.
lint:
conflicts fixed:
none
conflicts new:
none
gaps fixed:
none
gaps new:
none
```

## Parse error

A spec that does not parse exits 2. The message names the file and the line.

<!-- verify stderr 2
build/plan-verify
diff
test/fixtures/malformed.ears.md
examples/order-v1.ears.md
-->
```text
error: test/fixtures/malformed.ears.md:3: expected "shall"
```
