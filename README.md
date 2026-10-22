<p align="center"><img src="assets/logo.png" alt="plan-verify" width="480"></p>

# plan-verify

Catch contradictions in your requirements before anyone builds them.

<!-- demo video -->

## What it does

You write a plan. You, or an AI agent, turn that plan into EARS requirements. plan-verify finds contradictions, gaps, rules that can never fire, and repeats, explains them in plain English, and never picks a winner.

## Why

- A clash in the requirements is cheaper to settle than a clash in the product.
- The report names which requirements disagree, the situation, and a question to take back to the author.
- plan-verify does not choose which requirement wins.
- The same TypeScript runs on Node and as a native binary, and the solver is part of this repository.

## Quick start

You need Node 24 and clang.

```bash
npm install
npm run build
./build/plan-verify lint examples/order-conflict.ears.md
./build/plan-verify report examples/order-conflict.ears.md
```

## Example

`examples/order-conflict.ears.md` is three rules about one submitted order:

```ears
event order_submitted: Bool "The customer submits an order." phrase "an order is submitted"
output order_fulfilled: Bool "The order is fulfilled." phrase "fulfill the order" outcome "the order was fulfilled" / "the order was not fulfilled"

R1 When an order is not submitted, the Order System shall not fulfill the order.
R2 When an order is submitted, the Order System shall fulfill the order.
R3 When an order is submitted, the Order System shall not fulfill the order.
```

`plan-verify report` starts like this:

```text
## 1. R2 and R3 cannot both hold.

They clash when an order was submitted.

R2 line 7
"When an order is submitted, the Order System shall fulfill the order."

R3 line 8
"When an order is submitted, the Order System shall not fulfill the order."

Which requirement should win? To keep R2, remove R3. To keep R3, remove R2. This report does not choose.
```

The rest of the report lists repairs and does not choose one. The full output is in [the lint notes](docs/lint.md).

## Commands

| Command | What it answers |
| --- | --- |
| `check` | Does this scenario fit the requirements? |
| `lint` | Do any requirements clash, leave a hole, never fire, or repeat? |
| `report` | What are the logical problems, in plain English? |
| `emit-smt` | What is the SMT-LIB for these requirements? |
| `policy` | Which scenarios do the requirements allow, and does any of them break a property? |
| `scenarios` | What accepted and rejected examples show each requirement? |
| `help` | What commands are available? |

Exit status is `0` when the command is clean, `1` when something is wrong in the requirements, and `2` when the files or the arguments are wrong.

## How it works

Each requirement becomes an implication: when its condition holds, its response must hold. plan-verify prints that logic as SMT-LIB and decides it with its own solver. Booleans go through DPLL. Integers and enums tighten bounds. ScriptC compiles the same TypeScript to a native binary, and Node runs the same source.

## Agentic neurosymbolic verification

An AI agent (the neural part) turns a plain-English plan into EARS requirements. plan-verify (the symbolic part) converts them to SMT-LIB and proves contradictions, gaps, rules that can never fire, and repeats with its own solver. The agent reads those plain-English findings, asks the human about the choices, revises, and runs lint again until the spec is clean. [skills/plan-verify/SKILL.md](skills/plan-verify/SKILL.md) is how an agent runs this loop.

- The neural side writes.
- The symbolic side checks with math.
- The human decides.

## Examples

The specs in [examples](examples) cover each kind of finding. [A plan to the problems](examples/plan-to-problems/README.md) starts from a plain plan and ends with a plain list of problems.

## Read more

- [Reference](docs/reference.md): grammar, the solver, the build, and the other commands
- [Lint](docs/lint.md): each finding, with the command output
- [JSON](docs/json.md): the `--json` objects and their fields
