# From a plan to a list of problems

A product plan goes in as plain English. A list of its logical problems comes out as plain English.

`generated.ears.md` is a recorded run from grok-4.7 on 2026-10-22. The model translated `plan.md`. The file is that reply, unedited.

## Flow

1. `plan.md` is the product plan, written the way a product manager talks. It has no EARS syntax. The problems planted in it are listed for a person in `expected-problems.md`. `planted.txt` is the same list in a small machine-readable form: two direct contradictions (`R2`/`R3` and `R5`/`R6`), one gap (`reminder_sent`), one condition that can never be true (`R9`), and one redundant requirement (`R11`).
2. `generate.mjs` reads the agent skill and the plan and asks a model for an EARS spec. The user message tells the model it has no tools, must translate every rule faithfully, and must reply with only the spec in one fenced block. The request is streamed. It writes only the spec text to the output file. This step is live and needs a key. The offline test does not run it.
3. `plan-verify lint --json` checks the spec and prints `lint.json`.
4. `plan-verify report` turns that lint result into `problems.md`. Each logical problem is plain English, with requirement ids, line numbers, and the EARS sentences quoted. For a contradiction it asks which requirement should win and does not choose one. No model is involved.

Lint names redundancy on the requirements that are not part of any conflict. `R11` repeats `R10`, and neither requirement is in a conflict, so lint reports `R11` itself. The report still explains that `R11` only repeats `R10` in a stricter situation. It does not delete `R11`. A requirement whose condition can never be true stays vacuous only. `R9` is not also called redundant.

For each conflict the report asks which requirement should win, then lists candidate repairs and does not choose one. A repair drops one requirement in the conflicting set, or adds one Bool, enum equality, or integer bound to one requirement's condition. A suggestion is shown only after lint on the patched spec no longer has that conflict and has no new one. `R1` and `R2` can be separated by adding "and the copy is not out on loan" to `R1`, or "and the copy is not in the building" to `R2`. `R2` against `R3`, and `R5` against `R6`, share a condition, so the only candidates are to drop one of the two.

The recorded spec also has findings that were not planted. `R1` and `R2` contradict when the copy is both in the building and out on loan, because those two states are independent. `loan_allowed` is uncovered when a member asks and the copy is neither in the building nor out on loan. `renewal_allowed` is uncovered when nobody asks to renew. `R4` and `R12` negate a trigger with "When not …". Lint flags each one as wording kind `negation` and asks for a positive condition, such as "When a non-member asks", or a positive event.

## Live command

`generate.mjs` has no packages. It runs on Node 18 or later with `fetch`. The key is read only from `XAI_API_KEY` and is never printed. `XAI_MODEL` overrides the model. The default is `grok-4.7`. The call goes to the OpenAI-compatible chat completions endpoint at `api.x.ai`. The skill text is the system prompt. The plan is wrapped in the user message.

From the repo root:

```bash
XAI_API_KEY=... node examples/plan-to-problems/generate.mjs skills/plan-verify/SKILL.md examples/plan-to-problems/plan.md out.ears.md
```

The script is self-contained. Copied next to `skill.md`, `plan.md`, and the output path, the same command is:

```bash
node generate.mjs skill.md plan.md out.ears.md
```

If the spec fails to parse, pass the parser error and the previous spec. The model is asked for a corrected spec:

```bash
node generate.mjs skill.md plan.md out.ears.md repair-error.txt previous.ears.md
```

Then print the problems. Either Node or the native binary works. They must print the same bytes.

```bash
npm run build
./build/plan-verify lint --json examples/plan-to-problems/generated.ears.md
./build/plan-verify report examples/plan-to-problems/generated.ears.md
```

`node --experimental-strip-types src/main.ts report examples/plan-to-problems/generated.ears.md` prints the same report.

## Offline test

`npm test` runs an offline check that needs no key. It lints `generated.ears.md` and runs `report`, under Node and as the native binary. Stdout must match the committed `lint.json` and `problems.md`, stderr must be empty, and the exit status is 1 because problems were found. It then checks that every line in `planted.txt` is detected and is also named in `expected-problems.md`. Contradictions, the gap, and the impossible condition must show up in `lint.json`. The redundant requirement must show up in `lint.json` and in `problems.md`. The two bare negations must show up in `lint.json` as wording kind `negation`. The report must ask which requirement should win for every planted contradiction, and for any further contradiction the spec contains, and must not pick one.
