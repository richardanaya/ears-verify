<p align="center"><img src="assets/logo.png" alt="ears-verify" width="480"></p>

# ears-verify

Requirements written in EARS often hide contradictions and gaps. A sentence looks settled on its own. In a pile of them, two can demand opposite behavior, and a case nobody wrote down falls through. ears-verify is for catching that before any code is written.

Today it checks a real URL against the spec and points at the exact line that URL breaks: the requirement id, the sentence, and the piece of the address that failed. Reading the requirements against each other (contradictions and gaps) is the planned `lint` command.

## Quick start

You need Node.js 24 or newer, npm, and a linker: `clang` on Linux, Xcode Command Line Tools on macOS, or `zig` on Windows.

The native build uses [ScriptC](https://github.com/vercel-labs/scriptc) **0.4.1** (21 October 2026). That version is pinned in `package.json` and `package-lock.json`. `sh scripts/install-scriptc.sh` installs it and checks `scriptc --version`.

```console
npm install
npm run build
./build/ears-verify check examples/url-safety.ears.md https://bob@evil.com
```

`npm install` fetches ScriptC 0.4.1. `npm run build` writes `./build/ears-verify`. The last line is the whole tool: a spec, a URL, a report.

## A URL that breaks the spec

`examples/url-safety.ears.md` has three rules. The userinfo must be empty. The host must be `example.com`. And when the scheme is `https` and the host is anything else, the port must be written as `443`. `https://bob@evil.com` breaks all three. The process exits 1.

<!-- verify stdout 1
build/ears-verify
check
examples/url-safety.ears.md
https://bob@evil.com
-->
```text
check: 3 violations
spec: examples/url-safety.ears.md
url: https://bob@evil.com
R1.1 line 5
  sentence: The url-parser shall reject a non-empty userinfo.
  reason: userinfo is "bob"; required empty userinfo
R1.2 line 7
  sentence: The url-parser shall accept only host "example.com".
  reason: host is "evil.com"; required host "example.com"
R1.3 line 9
  sentence: When scheme is "https", if host is not "example.com", the url-parser shall require an explicit port of 443.
  reason: port is omitted; required explicit port 443
```

`npm test` runs this binary again and fails if any fenced sample in this file drifts from what the CLI prints.

## Commands

Exit 0 means the check was clean (or `emit-smt` printed the formulas). Exit 1 means at least one requirement failed. Exit 2 means the spec or the URL could not be read. Exit 3 means the command is recognized and still planned.

### `check` — implemented

Pass a spec and a URL. This address satisfies the example spec, so the process exits 0. R1.3 does not apply, because the host is `example.com`.

<!-- verify stdout 0
build/ears-verify
check
examples/url-safety.ears.md
https://example.com/path
-->
```text
check: 0 violations
spec: examples/url-safety.ears.md
url: https://example.com/path
```

Add `--json` anywhere after `check` when a CI job needs a machine-readable report.

### `emit-smt` — implemented

Print each requirement as one named SMT-LIB assertion. The comment above an assertion is the spec line and the original sentence. The name is the id plus that line (`R1.1_L5`). This command only prints. It exits 0.

<!-- verify stdout 0
build/ears-verify
emit-smt
examples/url-safety.ears.md
-->
```text
; ears-verify SMT-LIB 2
; spec: examples/url-safety.ears.md
; port is the integer written in the URI, or (- 1) when the port is omitted.
; Scheme defaults are not filled in. No solver is invoked by ears-verify.
(set-logic ALL)
(declare-fun scheme () String)
(declare-fun userinfo () String)
(declare-fun host () String)
(declare-fun port () Int)
(declare-fun path () String)
(declare-fun query () String)
(declare-fun fragment () String)

; R1.1_L5 line 5: The url-parser shall reject a non-empty userinfo.
(assert (! (=> true (= userinfo "")) :named R1.1_L5))

; R1.2_L7 line 7: The url-parser shall accept only host "example.com".
(assert (! (=> true (= host "example.com")) :named R1.2_L7))

; R1.3_L9 line 9: When scheme is "https", if host is not "example.com", the url-parser shall require an explicit port of 443.
(assert (! (=> (and (= scheme "https") (not (= host "example.com"))) (= port 443)) :named R1.3_L9))
```

### `policy` — planned

The name is reserved. Running it today prints one line and exits 3. The planned command searches for a URL that would break a requirement.

<!-- verify stdout 3
build/ears-verify
policy
-->
```text
not implemented yet
```

### `lint` — planned

Same status for now: one line, exit 3. The planned command reads the requirements against each other and reports contradictions and gaps.

<!-- verify stdout 3
build/ears-verify
lint
-->
```text
not implemented yet
```

## What is EARS?

EARS (Easy Approach to Requirements Syntax) writes one requirement as one sentence:

```text
While <state>, when <trigger>, if <condition>, where <feature>, the <system> shall <response>.
```

`While`, `when`, `if`, and `where` are optional. They stay in that order. The sentence always names a system and finishes with **shall**. A requirement with none of the optional clauses applies all the time.

The example spec is three sentences:

- `The url-parser shall reject a non-empty userinfo.`
- `The url-parser shall accept only host "example.com".`
- `When scheme is "https", if host is not "example.com", the url-parser shall require an explicit port of 443.`

The first two always apply. The third applies only when both its conditions hold, which is why a normal `https://example.com/path` is fine with the port left off.

## How it works

1. Parse the spec. Every requirement keeps its id and the line it came from.
2. Translate the sentence into SMT-LIB. Each one becomes a named assertion, `(assert (! (=> <condition> <shall-result>) :named R1.1_L5))`, over the URL fields scheme, userinfo, host, port, path, query, and fragment.
3. Decide that assertion with our own TypeScript. ScriptC compiles the same source into the native binary.

The checker is that TypeScript. It does not call Z3, cvc5, yices, or any other solver. The SMT-LIB is the requirement written down so a person can read it, and so the checker can evaluate it on the URL you passed in. A missing port is the integer `-1` (printed `(- 1)`). The tool leaves it missing, which is what lets a requirement demand an explicit `443`.

## Inspiration

The planned `lint` pass follows the requirements analysis described by AWS Kiro: read a spec for contradictions, duplicates, and missing cases before implementation starts.

- [Deep spec analysis](https://kiro.dev/blog/deep-spec-analysis/)
- [Analyze requirements](https://kiro.dev/docs/specs/analyze-requirements/)

## FAQ

### Why not Z3?

The decision is code in this repository. A check has no solver to install and no solver version to drift between machines. The assertions are still SMT-LIB, so the formula stays a readable artifact, and a later search can reuse the same terms.

### Why ScriptC?

The checker is ordinary TypeScript, so you can run `src/main.ts` under Node while you edit. ScriptC 0.4.1 compiles that same file to a native binary that runs without Node. The pin is deliberate: ScriptC is experimental, and `npm test` requires `scriptc coverage` to stay at 100% on this source.

### Why RFC 3986, when browsers follow WHATWG?

The parser follows the RFC 3986 grammar, so a requirement talks about the URI as written. Browsers follow the WHATWG URL Standard, and a few differences show up in reports:

- A missing port stays missing. `https://bob@evil.com` is not quietly given port 443.
- `\` is an illegal character. WHATWG turns it into `/` for schemes such as `https`.
- A non-ASCII host is rejected. WHATWG runs IDNA.
- `bob:secret` stays one userinfo string. WHATWG splits a username and a password.
- An empty host, as in `https:///path`, is accepted. WHATWG rejects an empty host on `https`.

### Will two runs disagree?

The same spec and the same URL produce the same bytes, from Node and from the native binary. `npm test` runs both and diffs them. The report prints the spec path as you typed it. It does not read the clock or the locale.

## Roadmap

- **`policy`.** Search for a counterexample URL with automata over the same terms. Still no external solver.
- **`lint`.** Report contradictions, overlap, and gaps in the spec, in the spirit of Kiro's requirements analysis.
- **More than URLs.** Other inputs, once the URL checker has settled.
