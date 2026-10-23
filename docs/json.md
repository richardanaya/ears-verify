# JSON

`--json` prints one object on stdout and leaves stderr empty. The keys below do not change. Wrong arguments, and a file that cannot be read or parsed, are exit 2. Plain-text findings are in [lint.md](lint.md). Grammar and the solver are in [reference.md](reference.md).

<!-- verify stdout 2
build/plan-verify
emit-smt
--json
-->
```text
{
  "ok": false,
  "error": "usage: plan-verify emit-smt [--json] <spec>"
}
```

`check` is `ok`, `spec`, `scenario`, and `violations`. Each violation is `id`, `line`, `sentence`, and `because`. `ok` is true when `violations` is empty.

<!-- verify stdout 1
build/plan-verify
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

`lint` is `ok`, `spec`, `conflicts`, `gaps`, `misuse`, `wording`, `redundant`, `duplicate`, `vacuous`, `unused`, and `warnings`. A conflict is `ids`, `minimal`, `everySituation`, `summary`, `clash`, `requirements` (`id`, `line`, `sentence`), `situation` and `example` (`name`, `value`), `requires` (`id`, `text`), `keeps`, `breaks`, and `fix`. A gap is `output`, `situation`, and `text`. Misuse is `id`, `line`, `symbols`, `sentence`, and `text`. Wording is `line`, `word`, `kind`, `text`, and `context`. `kind` is `vague`, `solution`, `form`, or `negation`. A redundant requirement is `id`, `line`, `sentence`, `text`, and `fix`. An exact duplicate is `id`, `line`, `sameAs`, `sentence`, `text`, and `fix`. A vacuous requirement has the same fields as a redundant requirement. An unused entry is `name`, `kind` (`state`, `input`, `output`, or `variant`), `text`, and `fix`. A warning is `id`, `line`, `sentence`, `kind` (`vague`, `modal`, `compound`, or `untestable`), `word`, `text`, and `fix`. `ok` stays true when warnings are the only findings, and the exit status stays 0. The other lint arrays still make `ok` false and exit 1.

<!-- verify stdout 1
build/plan-verify
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
      "fix": "Suggested fix: ask which requirement should win. To keep R2, remove R3. To keep R3, remove R2.",
      "repairs": [
        {
          "kind": "drop",
          "id": "R2",
          "text": "One repair is to drop R2 and keep R3 as written.",
          "sentence": "When an order is submitted, the Order System shall not fulfill the order."
        },
        {
          "kind": "drop",
          "id": "R3",
          "text": "One repair is to drop R3 and keep R2 as written.",
          "sentence": "When an order is submitted, the Order System shall fulfill the order."
        }
      ]
    }
  ],
  "gaps": [],
  "misuse": [],
  "wording": [],
  "redundant": [],
  "duplicate": [],
  "vacuous": [],
  "unused": [],
  "warnings": []
}
```

`policy` is `ok`, `spec`, `property`, `holds`, `note`, `acceptedFound`, `accepted`, `rejectedFound`, `rejected`, `counterexampleFound`, `counterexample`, and `breaks`. A scenario is a list of `name` and `value`. The list is empty when the matching `Found` flag is false. A break is `id`, `line`, `sentence`, and `because`.

<!-- verify stdout 1
build/plan-verify
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

`diff` is `ok`, `old`, `new`, `added`, `removed`, `reworded`, `onlyOld`, `onlyNew`, `changed`, `oldAcceptsNewRejectsFound`, `oldAcceptsNewRejects`, `oldAcceptsBreaks`, `newAcceptsOldRejectsFound`, `newAcceptsOldRejects`, `newAcceptsBreaks`, `note`, `conflictsFixed`, `conflictsNew`, `gapsFixed`, and `gapsNew`. `ok` is true when neither scenario exists. `note` is then `No scenario changes acceptance.`, and otherwise it is empty. An added or removed requirement is `id`, `line`, and `sentence`. A reworded requirement is `id`, `oldLine`, `oldSentence`, `newLine`, and `newSentence`. `onlyOld` and `onlyNew` are names declared in one spec. `changed` is `name` and `text` for a range or a variant list that was narrowed to the overlap. A scenario is a list of `name` and `value`, empty when the matching `Found` flag is false. A break is `id`, `line`, `sentence`, and `because`. A conflict delta is `ids` and `summary`. A gap delta is `output` and `text`. A type, range, or variant that cannot be compared is the usual error object and exit 2.

<!-- verify stdout 1
build/plan-verify
diff
--json
examples/order-v1.ears.md
examples/order-v2.ears.md
-->
```text
{
  "ok": false,
  "old": "examples/order-v1.ears.md",
  "new": "examples/order-v2.ears.md",
  "added": [
    {
      "id": "R2",
      "line": 8,
      "sentence": "WHEN an order is submitted AND inventory is not available, THE Order System SHALL not fulfill the order."
    },
    {
      "id": "R3",
      "line": 9,
      "sentence": "WHEN an order is not submitted, THE Order System SHALL not fulfill the order."
    }
  ],
  "removed": [],
  "reworded": [],
  "onlyOld": [],
  "onlyNew": [],
  "changed": [],
  "oldAcceptsNewRejectsFound": true,
  "oldAcceptsNewRejects": [
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
      "value": "true"
    }
  ],
  "oldAcceptsBreaks": [
    {
      "id": "R3",
      "line": 9,
      "sentence": "WHEN an order is not submitted, THE Order System SHALL not fulfill the order.",
      "because": "An order was not submitted, but the order was fulfilled."
    }
  ],
  "newAcceptsOldRejectsFound": false,
  "newAcceptsOldRejects": [],
  "newAcceptsBreaks": [],
  "note": "",
  "conflictsFixed": [],
  "conflictsNew": [],
  "gapsFixed": [
    {
      "output": "order_fulfilled",
      "text": "Nothing says whether the order was fulfilled when an order was submitted and inventory was not available. Suggested fix: add a requirement for this situation, and ask what the system shall do. Do not choose the response."
    }
  ],
  "gapsNew": []
}
```

<!-- verify stdout 2
build/plan-verify
diff
--json
test/fixtures/diff-type-old.ears.md
test/fixtures/diff-type-new.ears.md
-->
```text
{
  "ok": false,
  "error": "order_fulfilled is Bool in test/fixtures/diff-type-old.ears.md and Int in test/fixtures/diff-type-new.ears.md."
}
```

`emit-smt` is `ok`, `spec`, and `smt`. `smt` is the same SMT-LIB text as the plain command, with a newline between lines and none after the last line.

<!-- verify stdout 0
build/plan-verify
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

## Unused schema

<!-- verify stdout 1
build/plan-verify
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
  "duplicate": [],
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
      "text": "Nothing sets receipt_sent (\"a receipt is sent\"). Requirements mention it, but no response says what it shall be.",
      "fix": "Suggested fix: add a shall requirement that sets receipt_sent, or declare it as an input if the environment provides it. Do not choose the value."
    },
    {
      "name": "Lane.refund",
      "kind": "variant",
      "text": "Lane.refund is never mentioned.",
      "fix": "Suggested fix: use refund in a requirement, or remove it from Lane."
    }
  ],
  "warnings": []
}
```

## Warnings

`examples/order-timely.ears.md` has one vague-word warning. `ok` stays true, and the exit status is 0.

<!-- verify stdout 0
build/plan-verify
lint
--json
examples/order-timely.ears.md
-->
```text
{
  "ok": true,
  "spec": "examples/order-timely.ears.md",
  "conflicts": [],
  "gaps": [],
  "misuse": [],
  "wording": [],
  "redundant": [],
  "duplicate": [],
  "vacuous": [],
  "unused": [],
  "warnings": [
    {
      "id": "R1",
      "line": 6,
      "sentence": "When an order is submitted, the Order System shall timely fulfill the order.",
      "kind": "vague",
      "word": "timely",
      "text": "\"timely\" is too vague to test. Replace it with a value a scenario can check.",
      "fix": "Suggested fix: replace \"timely\" with a declared bound."
    }
  ]
}
```

## Scenarios

`--json` is `ok`, `spec`, and `scenarios`. Each row is `id`, `line`, `kind` (`accepted` or `rejected`), `trigger` (`true` or `false`), `found`, `sameAs`, `scenario` (`name` and `value`), and `text`. `scenario` is empty when `found` is false. `sameAs` names an earlier row when the assignment was already listed.

<!-- verify stdout 0
build/plan-verify
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
