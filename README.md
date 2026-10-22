# ears-verify

`ears-verify` checks requirements written in [EARS](https://alistairmavin.com/ears/) (Easy Approach to Requirements Syntax) against a concrete input. Milestone 1 checks URLs.

A spec is a markdown-ish list of requirement ids and EARS sentences. The tool translates each sentence into one named SMT-LIB assertion, then a small evaluator built in this repository decides that assertion for the URL you pass in. The translation is deterministic: the same spec and the same URL always produce the same bytes.

There is no Z3, cvc5, yices, or other SMT solver, in-process or over a socket. The checker is the TypeScript in `src/`.

The same source runs on Node and compiles with [ScriptC](https://github.com/vercel-labs/scriptc) 0.4.1 to a native binary. `npm test` runs the unit tests and the golden CLI cases under both and requires identical stdout, stderr, and exit codes.

## Install and build

You need Node.js 24 or newer (ScriptC's package requirement), npm, and a linker:

- glibc Linux: `clang`
- macOS: Xcode Command Line Tools
- Windows and musl Linux: `zig`

ScriptC is pinned to **0.4.1**, the release published on 21 October 2026.

Install method: an exact npm devDependency. `package-lock.json` locks `scriptc@0.4.1` and the matching platform packages (`@scriptc/cli-<os>-<arch>@0.4.1`). On install, `scriptc`'s postinstall script `scripts/install-native.mjs` copies the platform binary into `node_modules/scriptc/bin`. `package.json` sets `allowScripts` so npm 11 is allowed to run that script. `scripts/install-scriptc.sh` repeats the install and checks that `scriptc --version` prints `0.4.1`.

```console
npm install
npx scriptc --version
# 0.4.1
```

If a policy blocks install scripts, run the installer by hand after `npm install`:

```console
node node_modules/scriptc/scripts/install-native.mjs
npx scriptc --version
```

Build the native CLI:

```console
npm run build
# npx scriptc build src/main.ts -o build/ears-verify
./build/ears-verify check examples/url-safety.ears.md https://example.com/path
```

`scriptc coverage src/main.ts` on this tree reports 100% of the analyzed statements compiling statically (`fully static`). `npm test` runs that gate with `--fail-on=blockers` for `src/main.ts`, `test/unit.ts`, and `test/run-all.ts`.

Run the TypeScript directly while developing:

```console
node --experimental-strip-types src/main.ts check examples/url-safety.ears.md https://example.com/path
```

## Usage

Exit codes:

| Code | Meaning |
| --- | --- |
| 0 | `check` found no violations, `emit-smt` printed the script, or `help` ran |
| 1 | One or more requirements are violated |
| 2 | Usage error, unreadable spec, spec parse error, or malformed URL |
| 3 | `policy` or `lint` — recognized, and not implemented yet |

`check` and `emit-smt` print the spec path as you passed it. They do not rewrite it to an absolute path, so a Node run and a native run match.

### check

`examples/url-safety.ears.md` says:

- R1.1 the userinfo must be empty
- R1.2 the host must be `example.com`
- R1.3 when the scheme is `https` and the host is anything else, the port must be the explicit integer 443

`https://bob@evil.com` breaks all three (userinfo `bob`, host `evil.com`, port omitted):

```console
$ ./build/ears-verify check examples/url-safety.ears.md https://bob@evil.com
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
$ echo $?
1
```

`https://example.com/path` satisfies every requirement. R1.3's condition is false because the host is `example.com`, so the implication holds even though the port is omitted:

```console
$ ./build/ears-verify check examples/url-safety.ears.md https://example.com/path
check: 0 violations
spec: examples/url-safety.ears.md
url: https://example.com/path
$ echo $?
0
```

### check --json

`--json` may appear anywhere after `check`. Violations and parse errors are both a single JSON document on stdout. Parse errors still exit 2.

```console
$ ./build/ears-verify check --json examples/url-safety.ears.md https://bob@evil.com
{
  "command": "check",
  "ok": false,
  "spec": "examples/url-safety.ears.md",
  "url": "https://bob@evil.com",
  "violations": [
    {
      "id": "R1.1",
      "line": 5,
      "sentence": "The url-parser shall reject a non-empty userinfo.",
      "reason": "userinfo is \"bob\"; required empty userinfo"
    },
    {
      "id": "R1.2",
      "line": 7,
      "sentence": "The url-parser shall accept only host \"example.com\".",
      "reason": "host is \"evil.com\"; required host \"example.com\""
    },
    {
      "id": "R1.3",
      "line": 9,
      "sentence": "When scheme is \"https\", if host is not \"example.com\", the url-parser shall require an explicit port of 443.",
      "reason": "port is omitted; required explicit port 443"
    }
  ]
}
```

### emit-smt

Prints SMT-LIB 2. One named assertion per requirement. A comment above each assertion records the spec line and the original sentence.

```console
$ ./build/ears-verify emit-smt examples/url-safety.ears.md
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

A ubiquitous requirement (no while/when/if/where) is `(=> true <shall-result>)`. The name is `<id>_L<line>`, which is a legal SMT-LIB simple symbol.

### policy and lint

Both commands are recognized so later milestones can take the names. They print a fixed line and exit 3. Extra arguments are ignored.

```console
$ ./build/ears-verify policy
not implemented yet
$ echo $?
3

$ ./build/ears-verify lint examples/url-safety.ears.md
not implemented yet
```

### Parse errors

A sentence that does not use `shall` is a spec error (exit 2), on stderr:

```console
$ ./build/ears-verify check test/fixtures/malformed.ears.md https://example.com/
error: test/fixtures/malformed.ears.md:3: expected "shall"
```

A URL that is outside the RFC 3986 grammar this tool accepts is also exit 2:

```console
$ ./build/ears-verify check examples/url-safety.ears.md "http://ex ample.com"
error: malformed URL "http://ex ample.com": invalid character in host
```

With `--json`, that same failure is a JSON object on stdout (`{"command":"check","ok":false,"error":"..."}`) and stderr is empty.

`ears-verify` with no arguments prints usage on stderr and exits 2. `ears-verify help` prints usage on stdout and exits 0.

## Spec language

A requirement line starts with an id: `R` plus a number and optional dot-separated numeric segments (`R1`, `R1.1`, `R1.2.3`). The rest of the line is an EARS sentence, which may continue on following lines until a blank line, a heading, a comment, or the next id. The recorded line number is the line of the id.

Ignored lines: blanks, `#` headings, `//` comments, and lines that start with `<!--`.

Sentence shape. Each clause is optional. Present clauses stay in this order, and each ends with a comma:

```text
While <state>, when <trigger>, if <condition>, where <feature>, the <system> shall <response>.
```

`While`/`while`, `When`/`when`, `If`/`if`, `Where`/`where`, and `The`/`the` are accepted. `shall` is lowercase. The system name is one or more words of letters, digits, `_`, and `-` (`url-parser`, `URL parser`). The sentence ends with `.`.

Clauses and responses are a small predicate language, so the translation to SMT-LIB is a function of the syntax and does not guess at English.

Components: `scheme`, `userinfo`, `host`, `path`, `query`, `fragment`, and `port`.

Predicates:

- `<component> is empty` / `<component> is not empty`
- `<component> is "..."` / `<component> is not "..."`
- `<component> is one of "a" or "b"`
- `<component> starts with "..."`
- `port is 443` (the URI writes that integer)
- `port is omitted` / `port is explicit`

Responses also accept these phrasings, which lower to the same predicates:

- `reject a non-empty userinfo` → userinfo is empty
- `accept only host "example.com"` and `accept only host "a" or "b"`
- `require an explicit port of 443`, `require explicit port 443`, `require port 443`
- `require an omitted port`, `require port omitted`

`scheme` and `host` literals are lowercased, matching the parser. Other literals keep their case. A string literal is double quotes with no escapes.

Several clauses on one sentence are conjoined. The assertion is always an implication from that conjunction (or `true`, when there are no clauses) to the shall-result. Each requirement is checked on its own. A later requirement still runs when an earlier one fails.

## Design

```text
spec text
  -> EARS requirement records (id, line, clauses, shall-predicate)
  -> term AST
  -> SMT-LIB text, one named assertion per requirement
  -> ground evaluator on the parsed URL
  -> violation list (id, line, sentence, component reason)
```

`src/smt.ts` is the term AST: booleans, integers, strings, variables, equality, `not`, `and`, `or`, `=>`, and `str.prefixof`. Nodes are plain data. `evalTerm` decides a term in an environment whose fields are the URL components. A later symbolic or automata search can walk those same nodes. Milestone 1 only needs the ground case, so `check` substitutes the parsed URL and evaluates.

URL variables, in declaration order:

| Symbol | Sort | Meaning |
| --- | --- | --- |
| `scheme` | String | lowercased scheme |
| `userinfo` | String | raw userinfo, empty when absent |
| `host` | String | lowercased reg-name, or the IPv6 / IPvFuture literal without brackets |
| `port` | Int | the integer written after `:`, or `-1` when the URI omits the port |
| `path` | String | path, empty when absent |
| `query` | String | query without `?`, empty when absent |
| `fragment` | String | fragment without `#`, empty when absent |

`-1` is printed as the SMT-LIB term `(- 1)`. An omitted https port stays `-1`. The tool does not fill in 443 or 80. That is why R1.3 can tell `https://evil.com` from `https://evil.com:443`.

The reason string names the component value that made the shall-result false. For an `or` of equalities (an allowlist) it lists the allowed literals. For a false implication the antecedent held, so the reason is the failing consequent.

ScriptC's numeric type is IEEE-754 f64, same as JavaScript `number`. Ports and line numbers are small integers, well inside the exact integer range. The printer uses `Math.trunc` and `String` so SMT integers stay `443` and `(- 1)`. The program does not use FFI. ScriptC's FFI can take a string in, and it cannot return a string or a pointer, which this tool never needs.

Output is a pure function of the arguments and the file bytes. Reports use `\n`, fixed field order, and `JSON.stringify` with a two-space indent. The tool does not read the clock, the locale, or `process.argv[0]`.

## URL parsing and WHATWG gaps

`src/url.ts` is a recursive-descent parser for the RFC 3986 absolute-URI grammar: scheme, optional `//` authority (`[userinfo@] host [:port]`), path, optional query, optional fragment. Character classes follow the RFC (`unreserved`, `sub-delims`, `pct-encoded`, `pchar`). Bracketed IPv6 (including a dotted IPv4 tail and `::` compression) and `IPvFuture` (`v` + hex + `.` + unreserved/sub-delims/colon) are accepted. IPv4 dotted quads are accepted when they are a legal `reg-name`. Percent-encodings must be well-formed and are kept as written.

Deliberate strictness against the RFC text:

- An empty port (`https://example.com:`) is rejected. RFC 3986's `port = *DIGIT` allows it. The component model has no third state between "omitted" and "an integer".
- Digit strings longer than five characters are out of range, so a port cannot leave the exact integer range of an f64.

Known gaps relative to the [WHATWG URL Standard](https://url.spec.whatwg.org/):

- Tab and newline are not stripped before parsing. Those characters fail the RFC character classes.
- `\` is not a path separator. WHATWG special URLs treat it as `/`.
- Non-ASCII host text is rejected. WHATWG runs IDNA (ToASCII) and the domain-to-ASCII mapping. There is no punycode conversion here.
- A trailing dot on a reg-name is preserved. WHATWG strips a single trailing dot in the host parser.
- The userinfo is one string. WHATWG splits username and password and percent-encodes a different set of bytes. `bob:secret` stays `bob:secret`.
- An omitted port stays `-1`, including for `http` and `https`. WHATWG stores a null port when the written port equals the scheme default, and `URL.port` then serializes as empty.
- An empty host (`https://` or `https:///path`) is a parsed URI with `host` equal to `""`. WHATWG reports a validation error for an empty host on a special scheme.
- Invalid bytes are errors. WHATWG percent-encodes many C0 controls and spaces inside the path, query, and fragment states.
- IPv4 is not parsed with WHATWG's decimal/octal/hex "IPv4 number" rules. A bracket-less host is a reg-name.
- IPv6 zone identifiers (RFC 6874, a `%` after the address) are rejected.
- There is no base URL, no `URL` object, and no origin serialization. Inputs are absolute URIs.

## Tests

```console
npm test
```

That command:

1. Checks `scriptc --version` is `0.4.1`.
2. Runs `tsc --noEmit`.
3. Runs `scriptc coverage --fail-on=blockers` and requires a fully static 100% report.
4. Builds `build/ears-verify` and `build/unit-tests` with ScriptC.
5. Runs `test/unit.ts` under Node and as `build/unit-tests`.
6. Runs the CLI goldens the same way.

Checked-in goldens (`test/golden/<name>.stdout`, `.stderr`, `.exit`):

- `check-bad`, `check-good`, `check-bad-json`
- `emit-smt`
- `malformed-spec`, `malformed-url`
- `unit` (EARS parser and URL parser, plus the evaluator)
- `policy`, `lint`, `usage`

Refresh the files after an intentional output change with:

```console
node --experimental-strip-types test/run-all.ts --write-golden
```

Review the diff. The runner still requires the Node process and the native binary to match before it writes.

CI is `.github/workflows/ci.yml`: Node 24, `clang`, `npm ci`, `npm test`.

## Roadmap

`policy` will search for a counterexample URL. The search should be an automata (or other finite) construction over the term AST already produced here, still with no external SMT solver. The question is: is there a URL, inside the fragment of the grammar we can decide, for which a named assertion is false?

`lint` will look for conflicts and gaps in a spec: two shall-results that cannot hold together, a clause that makes a requirement vacuously true for every URL the grammar can build, an allowlist that nothing in the spec ever mentions. The shape of that analysis is the one described in AWS Kiro's requirements write-up, [Deep spec analysis](https://kiro.dev/blog/deep-spec-analysis/): read the requirements against each other, and report overlap, contradiction, and missing cases. Milestone 1 only parses and ground-checks.

## Layout

```text
src/main.ts     CLI
src/ears.ts     spec and EARS sentence parser
src/url.ts      RFC 3986 parser
src/smt.ts      term AST, SMT-LIB printer, ground evaluator
src/check.ts    violation report, text and JSON
src/text.ts     quoting and integer formatting
examples/url-safety.ears.md
test/unit.ts    parser and evaluator tests (also a ScriptC entry)
test/run-all.ts npm test
test/golden/    expected stdout, stderr, and exit code
scripts/install-scriptc.sh
```
