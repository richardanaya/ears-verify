# From a plan to a list of problems

A product plan goes in as plain English. A list of its logical problems comes out as plain English.

**`generated.ears.md` is a hand-written placeholder.** It translates `plan.md` by hand so this pipeline and the offline test work before a model has been called. Phase 2 replaces that file with real model output. Until then, do not treat it as something a model wrote.

## Flow

1. `plan.md` is the product plan, written the way a product manager talks. It has no EARS syntax. The problems planted in it are listed for a person in `expected-problems.md`. `planted.txt` is the same list in a small machine-readable form: two direct contradictions (`R1`/`R2` and `R5`/`R6`), one gap (`reminder_sent`), one condition that can never be true (`R9`), and one redundant requirement (`R11`).
2. `generate.mjs` reads the agent skill and the plan and asks a model for an EARS spec. It writes only the spec text to the output file. This step is live and needs a key. The offline test does not run it.
3. `ears-verify lint --json` checks the spec and prints `lint.json`.
4. `ears-verify report` turns that lint result into `problems.md`. Each logical problem is plain English, with requirement ids, line numbers, and the EARS sentences quoted. For a contradiction it asks which requirement should win and does not choose one. No model is involved.

Lint leaves redundancy blank while the spec still contradicts itself. That is existing lint behavior. The report still names `R11`, because `R11` only repeats `R10` in a stricter situation, and that repetition does not depend on the rest of the spec being consistent. It does not delete `R11`.

## Live command

`generate.mjs` has no packages. It runs on Node 18 or later with `fetch`. The key is read only from `XAI_API_KEY` and is never printed. `XAI_MODEL` overrides the model. The default is `grok-4.7`. The call goes to the OpenAI-compatible chat completions endpoint at `api.x.ai`. The skill text is the system prompt and the plan is the user message.

From the repo root:

```bash
node examples/plan-to-problems/generate.mjs \
  skills/ears-verify/SKILL.md \
  examples/plan-to-problems/plan.md \
  examples/plan-to-problems/generated.ears.md
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
./build/ears-verify lint --json examples/plan-to-problems/generated.ears.md
./build/ears-verify report examples/plan-to-problems/generated.ears.md
```

`node --experimental-strip-types src/main.ts report examples/plan-to-problems/generated.ears.md` prints the same report.

## Offline test

`npm test` runs an offline check that needs no key. It lints `generated.ears.md` and runs `report`, under Node and as the native binary. Stdout must match the committed `lint.json` and `problems.md`, stderr must be empty, and the exit status is 1 because problems were found. It then checks that every line in `planted.txt` is detected and is also named in `expected-problems.md`. Contradictions, the gap, and the impossible condition must show up in `lint.json`. The redundant requirement must show up in `problems.md`. The report must ask which requirement should win once per contradiction and must not pick one.
