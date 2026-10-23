# Performance

Lint time is dominated by the solver: finding a bad driver situation, then the minimal requirement sets, then checking each candidate repair. A Node CPU profile of the 100-requirement spec put about half of the samples in `imply`, the loop that forces linear comparisons from integer bounds.

## Machine

These before and after numbers are one wall-clock run each on this VM: 4 vCPU Intel Xeon under KVM, Node v24.22.1, ScriptC 0.4.1, clang 18.1.3. Before is commit `1843ce5`. After is `npm run bench` on this branch. `help` is process startup. The other rows are `lint`.

An earlier hyperfine run on an 8-core Xeon (commit `05167b1`, clang 19.1.7, Node v24.22.1) is what set the target. Native startup there was about 0.8 ms, Node about 99 ms. `lint` of `gen-25` was 12.9 s native and 8.1 s Node. The 12-requirement plan-to-problems spec was 16.4 s native and 10.2 s Node. `gen-50` and `gen-100` both exceeded 60 s.

## Before and after

Milliseconds. A cell marked with a greater-than sign did not finish inside that bound.

| workload | before Node | before native | after Node | after native |
| --- | ---: | ---: | ---: | ---: |
| help | 97 | 3 | 97 | 2 |
| gen-10 | 572 | 793 | 141 | 20 |
| gen-15 | 294 | 292 | 160 | 39 |
| gen-20 | 1842 | 2425 | 248 | 134 |
| gen-25 | 7859 | 12591 | 181 | 75 |
| plan-to-problems | 9664 | 15950 | 158 | 40 |
| gen-50 | >20000 | >20000 | 624 | 571 |
| gen-100 | >60000 | >60000 | 5259 | 5903 |

`gen-100` before is the 8-core bound. On this 4-vCPU VM, `gen-50` already exceeded 20 s before the change, so `gen-100` was left to that earlier run. After the change, `gen-100` finishes here.

The report text is unchanged: same findings, same order, same minimal sets, same example scenarios.

## What the solver does differently

Requirements that never share an output, and whose conditions do not read an output, are solved as separate groups. Drivers a group does not mention stay at the low end of the domain, which is where the least bad situation already put them. A uniform integer uses the finitely many comparison boundaries at every span, including spans of 64 and below.

Specs with 12 requirements or fewer still list every minimal conflicting set. Deletion finds each set, and the list is sorted into the same width-then-mask order as the old enumeration. Above 12, when the driver space is still small enough to walk, a subtree that is realizable for every completion is skipped.

A gap for one output branches only the drivers that appear in a condition of a requirement that names that output. The other drivers stay at the top of their domains, which is the gap the old walk selected.

`imply` keeps the unassigned comparisons in a compact list and evaluates one-variable bounds from number arrays, so the native loop does less object traffic.

## Running it

```bash
npm run build
npm run bench
```

`bench/gen-spec.mjs` writes a spec with N requirements (`node bench/gen-spec.mjs 25 > bench/specs/gen-25.ears.md`). The checked-in specs under `bench/specs/` are the ones timed above. CI fails the native `gen-25` lint if it is still running after 20 seconds.

## Next

On `gen-100` the native binary is still a little slower than Node (about 5.9 s and 5.1 s on this VM). The remaining time is repair checking: each accepted repair of a spec with more than 12 requirements runs the full core search again, and `gen-100` does about twenty of those. Reusing the cores in groups a repair does not touch is the next cut. The `imply` loop is still a boxed-number walk in the ScriptC output, so a further native win is fewer of those calls.
