# Performance

Lint time is dominated by the solver: finding a bad driver situation, then the minimal requirement sets, then checking each candidate repair. A Node CPU profile of the 100-requirement spec put about half of the samples in `imply`, the loop that forces linear comparisons from integer bounds. After the cuts below, that share is about one percent, and `gen-100` native is under 1.5 s and faster than Node.

## Machine

These numbers are one wall-clock run each on this VM: 4 vCPU Intel Xeon under KVM, Node v24.22.1, ScriptC 0.4.1, clang 18.1.3. Before is commit `1843ce5`. The middle pair is commit `65b21fd`. The last pair is `npm run bench` on this branch. `help` is process startup. The other rows are `lint`.

An earlier hyperfine run on an 8-core Xeon (commit `05167b1`, clang 19.1.7, Node v24.22.1) is what set the target. Native startup there was about 0.8 ms, Node about 99 ms. `lint` of `gen-25` was 12.9 s native and 8.1 s Node. The 12-requirement plan-to-problems spec was 16.4 s native and 10.2 s Node. `gen-50` and `gen-100` both exceeded 60 s.

## Before and after

Milliseconds. A cell marked with a greater-than sign did not finish inside that bound.

| workload | before Node | before native | 65b21fd Node | 65b21fd native | grouped Node | grouped native |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| help | 97 | 3 | 97 | 2 | 100 | 2 |
| gen-10 | 572 | 793 | 141 | 20 | 121 | 11 |
| gen-15 | 294 | 292 | 160 | 39 | 140 | 22 |
| gen-20 | 1842 | 2425 | 248 | 134 | 176 | 43 |
| gen-25 | 7859 | 12591 | 181 | 75 | 156 | 34 |
| plan-to-problems | 9664 | 15950 | 158 | 40 | 126 | 22 |
| gen-50 | >20000 | >20000 | 624 | 571 | 243 | 114 |
| gen-100 | >60000 | >60000 | 5259 | 5903 | 538 | 466 |

`gen-100` before is the 8-core bound. On this 4-vCPU VM, `gen-50` already exceeded 20 s before the change, so `gen-100` was left to that earlier run. Both later columns finish here. On `gen-100`, grouped native is 466 ms and grouped Node is 538 ms.

The report text is unchanged: same findings, same order, same minimal sets, same example scenarios.

## What the solver does differently

Requirements that never share an output, and whose conditions do not read an output, are solved as separate groups. Drivers a group does not mention stay at the low end of the domain, which is where the least bad situation already put them. A uniform integer uses the finitely many comparison boundaries at every span, including spans of 64 and below.

Specs with 12 requirements or fewer still list every minimal conflicting set. Deletion finds each set, and the list is sorted into the same width-then-mask order as the old enumeration. Above 12, when the driver space is still small enough to walk, a subtree that is realizable for every completion is skipped.

A gap for one output branches only the drivers that appear in a condition of a requirement that names that output. The other drivers stay at the top of their domains, which is the gap the old walk selected.

`imply` keeps the unassigned comparisons in a compact list and evaluates one-variable bounds from number arrays, so the native loop does less object traffic.

## Reusing cores

A repair of a spec with more than 12 requirements used to run the full core search on every candidate. The requirements are already split by output. Cores for a group the repair does not touch are saved and reused. A group whose requirement changed is searched again with the same algorithm the full spec used, and only on the drivers that group mentions. Specs that do not split, including checkout, still search the whole spec.

A driver literal whose symbols do not appear in the conflict cannot remove it, so that candidate is dropped before the sentence is parsed. The rewritten sentence is parsed only after the literal has removed the conflict, and only when the parsed condition is the literal added to the old one.

`search` walks past symbols whose bounds are already a single value without calling `imply` again.

## Why native caught Node on gen-100

In `build/main.ll`, `imply` loads a slot from the live-comparison list and uses that number as an index into the coefficient and bound arrays. ScriptC lowers that second load through `arr_idxOr`. The in-range path still builds a tagged union, and one of those loads allocates with `scr_union_new_f64`. Node keeps the same arrays as packed numbers, so the full scan was cheaper there.

A comparison that is not forced is parked. `setLo`, `setHi`, and backtracking wake only the comparisons that read the bound that changed. Bools whose bounds did not change stay parked the same way. The native binary then does far fewer of those boxed loads. On this VM, `gen-100` native went from 5903 ms at `65b21fd` to 466 ms, ahead of Node.

## Running it

```bash
npm run build
npm run bench
```

`bench/gen-spec.mjs` writes a spec with N requirements (`node bench/gen-spec.mjs 25 > bench/specs/gen-25.ears.md`). The checked-in specs under `bench/specs/` are the ones timed above. CI fails the native `gen-25` lint if it is still running after 20 seconds.

## Next

`gen-100` native is under 1.5 s and faster than Node on the run above. Specs that do not split into output groups still search every repair against the whole core set. Checkout is one of those: native lint is about 1.2 s on this VM, down from about 1.5 s at `65b21fd`, and Node is still ahead on that file. When `imply` does run, the indexed load is still a boxed union in the ScriptC output.
