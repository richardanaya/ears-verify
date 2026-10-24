# Scenario files

`scenarios --out <dir>` uses the solver in this repository to write one JSON file per case. `check --input` reads that file. The same spec writes the same bytes on Node and the native binary.

The name is the requirement id, then `accepted` or `rejected`, then `condN` when the file is about one atomic condition. `R1-accepted.json` keeps the trigger true and the response true, with every requirement holding. `R1-rejected-cond2.json` lets condition 2 decide the trigger and breaks that requirement alone. `R1-accepted-cond2.json` flips condition 2 so the trigger is false and every requirement holds. A requirement with no trigger writes `id-accepted.json` and `id-rejected.json`.

An atomic condition is one comparison, one symbol, or one negation. `and` and `or` split into those conditions. Each one is shown deciding the trigger, and shown flipped, when the solver can find that assignment. For an `and`, the rejected files match, because every condition is true when the trigger is true. For an `or`, each rejected file makes one disjunct true and the others false.

Exit 0 means every required case was written. Exit 1 means `uncovered` names a case the solver could not produce, and why. The directory is created if needed. Files already in the directory with other names are left as they are.

<!-- verify stdout 0
build/plan-verify
scenarios
examples/order.ears.md
--out
build/doc-scenarios
-->
```text
spec: examples/order.ears.md
out: build/doc-scenarios
scenarios: 5
uncovered: 0

R1-accepted.json
accepted R1 line 7
An order was submitted and inventory was available, and the order was fulfilled.

R1-rejected-cond1.json
rejected R1 line 7, condition 1
An order was submitted and inventory was available, but the order was not fulfilled.

R1-accepted-cond1.json
accepted R1 line 7, condition 1
Flipping condition 1 ("an order is submitted") makes the trigger false. An order was not submitted and inventory was available, and the order was not fulfilled.

R1-rejected-cond2.json
rejected R1 line 7, condition 2
An order was submitted and inventory was available, but the order was not fulfilled.

R1-accepted-cond2.json
accepted R1 line 7, condition 2
Flipping condition 2 ("inventory is available") makes the trigger false. An order was submitted and inventory was not available, and the order was not fulfilled.
```

`check` on a rejected file reports that requirement.

<!-- verify stdout 1
build/plan-verify
check
examples/order.ears.md
--input
build/doc-scenarios/R1-rejected-cond2.json
-->
```text
spec: examples/order.ears.md
scenario: build/doc-scenarios/R1-rejected-cond2.json
violations: 1

R1 line 7
WHEN an order is submitted AND inventory is available, THE Order System SHALL fulfill the order.
An order was submitted and inventory was available, but the order was not fulfilled.
```

`examples/order-or.ears.md` is one `or`. The two rejected files are different assignments: rush with a normal item, and a fragile item that is not rush.

<!-- verify stdout 0
build/plan-verify
scenarios
examples/order-or.ears.md
--out
build/doc-or
-->
```text
spec: examples/order-or.ears.md
out: build/doc-or
scenarios: 5
uncovered: 0

R1-accepted.json
accepted R1 line 7
The item was fragile, and the item was packed with care.

R1-rejected-cond1.json
rejected R1 line 7, condition 1
The order was rush, but the item was not packed with care.

R1-accepted-cond1.json
accepted R1 line 7, condition 1
Flipping condition 1 ("the order is rush") makes the trigger false. The order was not rush and the item was not fragile, and the item was not packed with care.

R1-rejected-cond2.json
rejected R1 line 7, condition 2
The item was fragile, but the item was not packed with care.

R1-accepted-cond2.json
accepted R1 line 7, condition 2
Flipping condition 2 ("the item is fragile") makes the trigger false. The order was not rush and the item was not fragile, and the item was not packed with care.
```

## Manifest

`--json` prints `ok`, `spec`, `out`, `scenarios`, and `uncovered`. Each scenario row is `file`, `id`, `line`, `kind`, `condition`, `conditionText`, and `text`. `condition` is 0 for the requirement-level file. `ok` is true when `uncovered` is empty. The assignment itself stays in the file.

<!-- verify stdout 0
build/plan-verify
scenarios
--json
examples/order.ears.md
--out
build/doc-scenarios
-->
```text
{
  "ok": true,
  "spec": "examples/order.ears.md",
  "out": "build/doc-scenarios",
  "scenarios": [
    {
      "file": "R1-accepted.json",
      "id": "R1",
      "line": 7,
      "kind": "accepted",
      "condition": 0,
      "conditionText": "",
      "text": "An order was submitted and inventory was available, and the order was fulfilled."
    },
    {
      "file": "R1-rejected-cond1.json",
      "id": "R1",
      "line": 7,
      "kind": "rejected",
      "condition": 1,
      "conditionText": "an order is submitted",
      "text": "An order was submitted and inventory was available, but the order was not fulfilled."
    },
    {
      "file": "R1-accepted-cond1.json",
      "id": "R1",
      "line": 7,
      "kind": "accepted",
      "condition": 1,
      "conditionText": "an order is submitted",
      "text": "Flipping condition 1 (\"an order is submitted\") makes the trigger false. An order was not submitted and inventory was available, and the order was not fulfilled."
    },
    {
      "file": "R1-rejected-cond2.json",
      "id": "R1",
      "line": 7,
      "kind": "rejected",
      "condition": 2,
      "conditionText": "inventory is available",
      "text": "An order was submitted and inventory was available, but the order was not fulfilled."
    },
    {
      "file": "R1-accepted-cond2.json",
      "id": "R1",
      "line": 7,
      "kind": "accepted",
      "condition": 2,
      "conditionText": "inventory is available",
      "text": "Flipping condition 2 (\"inventory is available\") makes the trigger false. An order was submitted and inventory was not available, and the order was not fulfilled."
    }
  ],
  "uncovered": []
}
```

The listing without `--out` is unchanged. Its JSON is in [json.md](json.md).

## Conditions that cannot be covered

`examples/order-vacuous.ears.md` has two triggers that no allowed value can make true. Those requirements get no scenario file. R3 has no trigger, so it gets an accepted file and a rejected file.

<!-- verify stdout 1
build/plan-verify
scenarios
examples/order-vacuous.ears.md
--out
build/doc-vacuous
-->
```text
spec: examples/order-vacuous.ears.md
out: build/doc-vacuous
scenarios: 2
uncovered: 2

R3-accepted.json
accepted R3 line 9
The order was accepted.

R3-rejected.json
rejected R3 line 9
The order was not accepted.

uncovered R1
The trigger is impossible for every allowed value.

uncovered R2
The trigger is impossible for every allowed value.
```

`examples/order-combined.ears.md` asks for a quantity of at least 1, and the declared range is already 1..5. Condition 3 cannot be false, so it cannot flip the outcome. The rejected file for that condition is still written, because the condition can be true. The flip of the region writes `eu`.

<!-- verify stdout 1
build/plan-verify
scenarios
examples/order-combined.ears.md
--out
build/doc-combined
-->
```text
spec: examples/order-combined.ears.md
out: build/doc-combined
scenarios: 8
uncovered: 1

R1.2-accepted.json
accepted R1.2 line 10
Inventory was available, an order was submitted, the quantity was at least 1, and the region was set to us, and the quantity was 1 and the number shipped was 1.

R1.2-rejected-cond1.json
rejected R1.2 line 10, condition 1
Inventory was available, an order was submitted, the quantity was at least 1, and the region was set to us, but the quantity was 1 and the number shipped was 2.

R1.2-accepted-cond1.json
accepted R1.2 line 10, condition 1
Flipping condition 1 ("inventory is available") makes the trigger false. Inventory was not available, an order was submitted, the quantity was at least 1, and the region was set to us, and the quantity was 1 and the number shipped was 1.

R1.2-rejected-cond2.json
rejected R1.2 line 10, condition 2
Inventory was available, an order was submitted, the quantity was at least 1, and the region was set to us, but the quantity was 1 and the number shipped was 2.

R1.2-accepted-cond2.json
accepted R1.2 line 10, condition 2
Flipping condition 2 ("an order is submitted") makes the trigger false. Inventory was available, an order was not submitted, the quantity was at least 1, and the region was set to us, and the quantity was 1 and the number shipped was 1.

R1.2-rejected-cond3.json
rejected R1.2 line 10, condition 3
Inventory was available, an order was submitted, the quantity was at least 1, and the region was set to us, but the quantity was 1 and the number shipped was 2.

R1.2-rejected-cond4.json
rejected R1.2 line 10, condition 4
Inventory was available, an order was submitted, the quantity was at least 1, and the region was set to us, but the quantity was 1 and the number shipped was 2.

R1.2-accepted-cond4.json
accepted R1.2 line 10, condition 4
Flipping condition 4 ("the region is us") makes the trigger false. Inventory was available, an order was submitted, the quantity was at least 1, and the region was set to eu, and the quantity was 1 and the number shipped was 1.

uncovered R1.2, condition 3
condition 3 ("the quantity is at least 1") cannot be false while the other conditions let it decide the trigger, so it cannot flip the outcome.
```
