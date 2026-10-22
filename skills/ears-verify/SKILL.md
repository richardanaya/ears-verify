---
name: ears-verify
description: Use when a product manager is stating or revising requirements, including a page or a link. Turn their words into EARS with this grammar, turn a page description into one canonical URL and requirements over the url.* names, run ears-verify lint, explain any conflict, and ask which requirement should win before anyone builds the system. If the English fits more than one URL, ask or list the candidates.
---

# ears-verify

You are in a conversation with a product manager. They are telling you what a system should do, often in a few passes, sometimes contradicting what they said earlier. Turn what they say into EARS requirements with the grammar below, then run ears-verify.

Lint is implemented, and it is the check that matters. When it reports a conflict, explain it in plain words: which requirements clash, under what situation, the example scenario, and the suggested fix. Ask which requirement should win. Do not choose one, and do not paper over the clash with a new sentence they did not ask for.

`policy` is planned. Today it only prints `not implemented yet`.

The samples below are the built CLI. `node --experimental-strip-types src/main.ts` prints the same bytes when `build/ears-verify` is not there yet. The same spec always produces the same SMT-LIB.

## Vocabulary

Declare every name before the requirement that uses it. One name per idea, reused every time the PM comes back to that idea. The quoted description is their English. The requirement line uses the name.

```ears
enum Region { us, eu }
event order_submitted: Bool "The customer submits an order."
state inventory_available: Bool "Enough stock is on hand to fill the order."
input quantity: Int 1..10 "How many units the customer asked for."
input region: Region "The region the order ships to."
output order_fulfilled: Bool "The order is fulfilled."
unwanted event payment_declined: Bool "The payment was declined."
```

Keywords are case-insensitive. Names keep the case you wrote.

| Declaration | Form the parser accepts |
| --- | --- |
| Enum | `enum Name { variant, variant }` |
| Event | `event name: Bool "description"` |
| State | `state name: Bool "description"` |
| Input | `input name: Type "description"` |
| Output | `output name: Type "description"` |
| Unwanted event | `unwanted event name: Bool "description"` |

`Type` is `Bool`, `Int min..max`, or an enum name declared above that line. Events and states are `Bool` only. An unwanted marker applies only to an event. Ranges are inclusive and both ends sit inside `-1000000..1000000`. At least one variant is required. Variant names are unique across the whole spec and cannot match a symbol name.

A description is a double-quoted string. `\"`, `\\`, `\/`, and `\t` are the escapes. A newline in a description is rejected, and an empty description is rejected.

These words are reserved and cannot be names: `not`, `and`, `or`, `true`, `false`, `while`, `when`, `if`, `where`, `then`, `the`, `shall`, `should`, `must`, `will`, `event`, `state`, `input`, `output`, `unwanted`, `enum`, `bool`, `int`.

Blank lines, `#` headings, `//` comments, and a full-line `<!-- ...` are ignored. A requirement may continue onto the next lines until a blank line, a comment, a declaration, or the next id. The requirement's line number is the line of its id.

## Operations

A condition or a response is a boolean expression. This is the whole language for booleans, integers, and enums. Comparisons against the built-in URL strings are in the URL section.

| Phrase | What it means |
| --- | --- |
| `order_submitted` | That Bool symbol is true. |
| `not order_fulfilled` | That Bool symbol is false. |
| `not quantity = 1` | `not` applies to the comparison: the quantity is something other than 1. |
| `a and b` | Both sides are true. `and` binds tighter than `or`. |
| `a or b` | Either side is true. |
| `true`, `false` | Boolean literals, any case. |
| `quantity = 1`, `quantity != 1` | Equality. Both sides must be Bool, both Int, or the same enum. |
| `quantity < 2`, `<=`, `>`, `>=` | Integer comparisons only. |
| `shipped = quantity + 1`, `shipped = quantity - 1` | Integer addition and subtraction. |
| `offset = -1` | A negative integer literal. No leading zeros. |
| `decision = fulfill` | The symbol equals that enum variant. |
| `(a or b) and c` | Parentheses group the expression. |

`shall quantity` is rejected, because the response has to be a boolean. `shall quantity = 1` is accepted. `+` and `-` expect integers.

## EARS patterns

Clauses that appear go in this order, separated by commas: `while`, `when`, `if`, `where`. `then` is required when `if` is present, and rejected when `if` is absent. The line ends with a period. The id is `R`, digits, then zero or more `.digits` groups, such as `R1` or `R1.2`. One requirement per line.

```ears
While <state>, when <trigger>, if <condition>, where <feature>, then the <system> shall <response>.
```

| Pattern | Use it for | Shape the parser accepts |
| --- | --- | --- |
| Ubiquitous | A response that is always required | `The Order System shall order_fulfilled.` |
| When | The normal trigger | `When order_submitted, the Order System shall order_fulfilled.` |
| If, then | An unwanted or exceptional case | `If payment_declined, then the Order System shall order_rejected.` |
| While | A state that already holds | `While inventory_available, the Order System shall order_fulfilled.` |
| Where | A variant, such as a region | `Where region = us, the Order System shall order_fulfilled.` |
| Combined | Any of the above, in the order above | `While inventory_available, when order_submitted, if quantity >= 1, where region = us, then the Warehouse shall shipped = quantity.` |

`should`, `must`, and `will` are not `shall`. The parser stops and asks for `shall`.

Each requirement with at least one clause becomes one implication. The clauses are joined with `and` in the order while, when, if, where, and that antecedent implies the response. A ubiquitous requirement is asserted as the response itself. Assertion names are the id, `_L`, and the line, such as `R1_L7`.

An unwanted event is written with `if` ... `then`. `when` is the normal trigger. Lint flags an unwanted event used in `when` without an `if`.

The line has to be something a scenario can make true or false. Lint rejects these whole words as too vague to test: `fast`, `slow`, `large`, `small`, `appropriate`, `quickly`, `easy`, `robust`, `flexible`, `user-friendly`, `efficient`. It also rejects solution words: `database`, `api`, `algorithm`, `microservice`, `server`, `class`, `function`. Put the PM's phrasing in the description only after those words are gone, or say the testable fact in the requirement.

## Workflow

1. Listen. Write down the PM's words before you translate them. When they describe a page, a link, or where a request goes, follow the URL section first. If that English fits more than one URL, ask or list the candidates. Do not pick one.
2. Add or reuse declarations. If they describe something you already named, use that name. The `url.*` names are already built in.
3. Write one EARS line per requirement. Normal triggers use `when`. Unwanted conditions use `if` ... `then`.
4. Run `build/ears-verify lint <spec>`.
5. Fix what lint reports. For a conflict, tell the PM which requirements clash, the situation, and the example, then ask which requirement should win. Stop until they answer. Do not choose.
6. When they describe a concrete story, write a flat JSON scenario with every declared name and run `build/ears-verify check <spec> --input <scenario>`. `policy` is the planned search for a scenario that breaks a separate property. It is not available yet; say that, and do not invent its result.
7. Report every check violation by requirement ID, line, and sentence, then the values. A passing check can still leave a gap. If lint reported one, say which output is uncovered and in what situation.

`--json` is the same report in a stable shape, for you. Show the PM the text.

A scenario value is `true` or `false`, an integer inside the declared range, or an enum variant string. Every declared name is required. Extra names are rejected. Leading zeros are rejected.

## Milestone 1: one requirement, one scenario

`examples/order.ears.md` says: when an order is submitted and inventory is available, the order is fulfilled. R1 is line 7.

This scenario breaks it. Report `R1`, line 7, and the sentence below:

<!-- verify stdout 1
build/ears-verify
check
examples/order.ears.md
--input
examples/order-fail.json
-->
```text
spec: examples/order.ears.md
scenario: examples/order-fail.json
violations: 1

R1 line 7
When order_submitted and inventory_available, the Order System shall order_fulfilled.
order_submitted is true, inventory_available is true, and order_fulfilled is false.
```

This scenario fits R1:

<!-- verify stdout 0
build/ears-verify
check
examples/order.ears.md
--input
examples/order-pass.json
-->
```text
spec: examples/order.ears.md
scenario: examples/order-pass.json
violations: 0
```

`emit-smt` prints the implication. The comment maps the assertion back to line 7 and the sentence:

<!-- verify stdout 0
build/ears-verify
emit-smt
examples/order.ears.md
-->
```text
; spec: examples/order.ears.md
(set-logic ALL)
; event order_submitted: Bool "The customer submits an order."
(declare-fun order_submitted () Bool)
; state inventory_available: Bool "Enough stock is on hand to fill the order."
(declare-fun inventory_available () Bool)
; output order_fulfilled: Bool "The order is fulfilled."
(declare-fun order_fulfilled () Bool)
; R1_L7 line 7: When order_submitted and inventory_available, the Order System shall order_fulfilled.
(assert (! (=> (and order_submitted inventory_available) order_fulfilled) :named R1_L7))
```

Lint on that same spec is already useful. The check can pass while a situation is still uncovered:

<!-- verify stdout 1
build/ears-verify
lint
examples/order.ears.md
-->
```text
spec: examples/order.ears.md
conflicts: 0
gaps: 1
misuse: 0
wording: 0

gap order_fulfilled
Nothing covers order_fulfilled when order_submitted is true and inventory_available is false.
```

Ask what should happen in that situation. `examples/order-covered.ears.md` answers every situation, and lint is clean:

<!-- verify stdout 0
build/ears-verify
lint
examples/order-covered.ears.md
-->
```text
spec: examples/order-covered.ears.md
conflicts: 0
gaps: 0
misuse: 0
wording: 0
```

## Combined clauses

`examples/order-combined.ears.md` uses while, when, if, and where. The id is `R1.2`. The printed implication nests `and` in clause order, and the integer range is its own unnamed assertion:

<!-- verify stdout 0
build/ears-verify
emit-smt
examples/order-combined.ears.md
-->
```text
; spec: examples/order-combined.ears.md
(set-logic ALL)
; enum Region { us, eu }
(declare-datatypes ((Region 0)) (((us) (eu))))
; state inventory_available: Bool "Enough stock is on hand to fill the order."
(declare-fun inventory_available () Bool)
; event order_submitted: Bool "The customer submits an order."
(declare-fun order_submitted () Bool)
; input quantity: Int 1..5 "How many units the customer asked for."
(declare-fun quantity () Int)
(assert (and (>= quantity 1) (<= quantity 5)))
; input region: Region "The region the order ships to."
(declare-fun region () Region)
; output shipped: Int 1..5 "How many units are shipped."
(declare-fun shipped () Int)
(assert (and (>= shipped 1) (<= shipped 5)))
; R1.2_L10 line 10: While inventory_available, when order_submitted, if quantity >= 1, where region = us, then the Warehouse shall shipped = quantity.
(assert (! (=> (and (and (and inventory_available order_submitted) (>= quantity 1)) (= region us)) (= shipped quantity)) :named R1.2_L10))
```

## Bad: the PM has said both things

`examples/order-conflict.ears.md` records two answers for a submitted order. Lint is implemented; this is its real report:

<!-- verify stdout 1
build/ears-verify
lint
examples/order-conflict.ears.md
-->
```text
spec: examples/order-conflict.ears.md
conflicts: 1
gaps: 0
misuse: 0
wording: 0

conflict {R2, R3}
R2 and R3 cannot both hold.

R2 line 7
When order_submitted, the Order System shall order_fulfilled.

R3 line 8
When order_submitted, the Order System shall not order_fulfilled.

They clash when order_submitted is true.
R2 requires order_fulfilled.
R3 requires not order_fulfilled.

Example scenario:
{
  "order_submitted": true,
  "order_fulfilled": true
}
This scenario keeps R2 and breaks R3.

Suggested fix: ask which requirement should win. To keep R2, remove R3. To keep R3, remove R2.
```

Tell the PM: when an order is submitted, R2 says it is fulfilled and R3 says it is not. The example keeps R2 and breaks R3 only because R3 is the last requirement in the set. It is evidence, not a vote. Ask which requirement should win, and wait.

## Unwanted events use if, then

`examples/payment-if.ears.md` writes a declined payment with `if` ... `then`. Lint is clean:

<!-- verify stdout 0
build/ears-verify
lint
examples/payment-if.ears.md
-->
```text
spec: examples/payment-if.ears.md
conflicts: 0
gaps: 0
misuse: 0
wording: 0
```

`examples/order-misuse.ears.md` uses `when` for that unwanted event. Show the finding and rewrite it with the PM as `if payment_declined, then ...`.

<!-- verify stdout 1
build/ears-verify
lint
examples/order-misuse.ears.md
-->
```text
spec: examples/order-misuse.ears.md
conflicts: 0
gaps: 0
misuse: 1
wording: 0

misuse R4 line 6
payment_declined is an unwanted event. Write if ... then, not when.
When payment_declined, the Order System shall order_rejected.
```

## Vague words and solution words

`examples/order-wording.ears.md` says the system "responds quickly" and stores the order "in the database". Ask what a scenario can check, and what the system must guarantee.

<!-- verify stdout 1
build/ears-verify
lint
examples/order-wording.ears.md
-->
```text
spec: examples/order-wording.ears.md
conflicts: 0
gaps: 0
misuse: 0
wording: 2

wording line 4
"quickly" is too vague to test. Replace it with something a scenario can check.
output order_fulfilled: Bool "The system responds quickly."

wording line 5
"database" names a solution. Say what the system must do, not how to build it.
state saved: Bool "Store the order in the database."
```

## policy is planned

`policy` will search for a scenario that breaks a property stated apart from the requirements. The command exists so the workflow has a place to call it. This is the whole behavior today:

<!-- verify stdout 3
build/ears-verify
policy
-->
```text
not implemented yet
```

Do not describe a scenario `policy` found. It did not look.

## URLs

When the PM describes a page, a link, or where a request goes, do not invent a URL shape. Translate the English into one canonical URL, then into EARS over the fixed `url.*` vocabulary. The same English meaning always produces the same URL structure.

Flow: English sentence, then canonical URL, then the requirements, then ears-verify.

### Fixed vocabulary

These seven names are built in. You do not declare them. The first requirement that mentions one adds it, in the order scheme, userinfo, host, port, path, query, fragment. A scenario that checks the spec must include every name the requirements used.

| Name | Sort | What it holds |
| --- | --- | --- |
| `url.scheme` | String | Scheme, with no colon. |
| `url.userinfo` | String | Userinfo. A canonical URL has none, so this is empty. |
| `url.host` | String | Host, without brackets. |
| `url.port` | Int `-1..65535` | Port number, or `-1` when the URL omits it. |
| `url.path` | String | Path, empty or starting with `/` when the URL has an authority. |
| `url.query` | String | Query, without the `?`. |
| `url.fragment` | String | Fragment, without the `#`. |

| Phrase | What it means |
| --- | --- |
| `url.scheme = "https"` | The strings are equal. |
| `url.scheme != "http"` | The strings differ. |
| `url.host starts with "shop."` | The host begins with that string. |
| `url.host ends with ".example.com"` | The host ends with that string. |
| `url.query contains "status="` | The query includes that string. |
| `url.userinfo is empty` | The userinfo is `""`. |
| `url.port is empty` | The port was omitted (`-1`). |
| `not url.fragment is empty` | A fragment is present. |

`is empty` is only for a URL string or for `url.port`. `starts with`, `ends with`, and `contains` are only for strings.

Lint does not try values for these strings, so a clean lint does not prove two URL lines can be true together. It does catch two ubiquitous URL strings that name different constants. For a concrete URL, run `check` with every `url.*` name the spec mentioned. `url.port` is an integer: `-1` when it is omitted, otherwise the port number.

### English phrases

Use this table. Do not paraphrase a row into a different shape.

| English | URL part |
| --- | --- |
| secure, encrypted, or https | scheme `https` |
| not secure, or plain http | scheme `http` |
| on example.com exactly | host equals `example.com` |
| on the example.com site or its subdomains | host equals `example.com`, or host ends with `.example.com` |
| the orders page for a customer | path `/customers/{customerId}/orders` |
| the customer page | path `/customers/{customerId}` |
| the items page | path `/items` |
| filtered by status | query `status={status}` |
| filtered by page and status | query `page={page}&status={status}` |
| no user name in the URL | userinfo is empty |
| the default port, or no port written | port is empty |
| no hash, or no fragment | fragment is empty |

Placeholders are `{camelCase}`. Collection names in a path are the plurals in the table below. Query keys are written in alphabetical order.

### Canonical form

`build/ears-verify canonicalize <url>` prints the canonical URL, then the rules the input broke. Exit `0` means the input was already canonical (`violations: 0`). Any other canonicalization exits `1`. A URL the parser rejects exits `2`. `--json` is the same report with `ok`, `input`, `canonical`, and `violations`.

These are the rules, in the order the command prints them. The first group is RFC 3986 section 6 normalization. The second group is ours.

| Rule the command prints | What changes |
| --- | --- |
| `lowercase the scheme` | `HTTPS` becomes `https`. |
| `lowercase the host` | `Example.COM` becomes `example.com`. An IPv6 literal is lowercased inside the brackets. |
| `omit the default port` | `:443` is dropped for `https`, and `:80` is dropped for `http`. Any other port stays, with no leading zeros. |
| `uppercase percent-encoding hex` | `%2f` becomes `%2F`. |
| `decode unreserved characters` | `%7E` becomes `~`. Letters, digits, `-`, `.`, `_`, and `~` are decoded. `%2F` stays encoded, so it is not a path separator. |
| `remove dot segments` | `/a/./b/../c` becomes `/c`. |
| `no trailing slash except the root` | `/orders/` becomes `/orders`. The root path `/` stays `/`. |
| `no empty query` | A trailing `?` is dropped. |
| `no empty fragment` | A trailing `#` is dropped. |
| `lowercase hyphenated path segments` | `New-Orders` becomes `new-orders`. Letters inside `{...}` are left to the placeholder rule. |
| `plural collection nouns` | A whole path segment that is one of the nouns below becomes the lowercase plural. A segment that contains `-` or `{` is not pluralized. |
| `use {camelCase} placeholders` | `{CustomerId}` and `{customer_id}` and `{customer-id}` become `{customerId}`. A placeholder that is already `{camelCase}` is left alone. |
| `sort query keys` | `b=2&a=1` becomes `a=1&b=2`. |
| `no userinfo` | `bob@` is removed. |

| Singular segment | Canonical segment |
| --- | --- |
| `customer` | `customers` |
| `order` | `orders` |
| `user` | `users` |
| `account` | `accounts` |
| `product` | `products` |
| `invoice` | `invoices` |
| `payment` | `payments` |
| `item` | `items` |
| `shipment` | `shipments` |
| `address` | `addresses` |
| `category` | `categories` |
| `company` | `companies` |

`{` and `}` are how a placeholder is written. They are not part of RFC 3986, and the parser accepts them only in the path, the query, and the fragment.

An empty path (`https://example.com`) and the root path (`https://example.com/`) are both already canonical, and they are not the same URL. If the PM did not say which, ask.

Running the canonical form through the command again changes nothing:

<!-- verify stdout 0
build/ears-verify
canonicalize
https://example.com/customers/{customerId}/orders?status={status}
-->
```text
https://example.com/customers/{customerId}/orders?status={status}
violations: 0
```

Percent-encoding, with the path requirement that matches the canonical spelling:

<!-- verify stdout 1
build/ears-verify
canonicalize
https://example.com/a%2fb/%7e
-->
```text
https://example.com/a%2Fb/~
violations: 2
- uppercase percent-encoding hex
- decode unreserved characters
```

`examples/url-tilde.ears.md` is that path:

<!-- verify stdout 0
build/ears-verify
check
examples/url-tilde.ears.md
--input
examples/url-tilde-pass.json
-->
```text
spec: examples/url-tilde.ears.md
scenario: examples/url-tilde-pass.json
violations: 0
```

### One orders page

English: "The orders page for a customer must be served securely on the example.com site or its subdomains, and filtered by status. No user name, no port, and no fragment."

That is one URL. Someone may write it loosely. Canonicalize that spelling, and use the canonical URL in the requirements:

<!-- verify stdout 1
build/ears-verify
canonicalize
HTTPS://Example.COM:443/customer/{CustomerId}/order/?status={status}
-->
```text
https://example.com/customers/{customerId}/orders?status={status}
violations: 6
- lowercase the scheme
- lowercase the host
- omit the default port
- no trailing slash except the root
- plural collection nouns
- use {camelCase} placeholders
```

`--json` is the same result for you. `ok` is false because the input was not canonical:

<!-- verify stdout 1
build/ears-verify
canonicalize
--json
HTTPS://Example.COM:443/customer/{CustomerId}/order/?status={status}
-->
```text
{
  "ok": false,
  "input": "HTTPS://Example.COM:443/customer/{CustomerId}/order/?status={status}",
  "canonical": "https://example.com/customers/{customerId}/orders?status={status}",
  "violations": [
    "lowercase the scheme",
    "lowercase the host",
    "omit the default port",
    "no trailing slash except the root",
    "plural collection nouns",
    "use {camelCase} placeholders"
  ]
}
```

`examples/url-orders.ears.md` is the requirement set for that URL. The host line is the "site or its subdomains" row, so a subdomain is allowed. `shop.example.com` passes:

<!-- verify stdout 0
build/ears-verify
check
examples/url-orders.ears.md
--input
examples/url-orders-pass.json
-->
```text
spec: examples/url-orders.ears.md
scenario: examples/url-orders-pass.json
violations: 0
```

`http` fails R1. Report the id, the line, and the sentence:

<!-- verify stdout 1
build/ears-verify
check
examples/url-orders.ears.md
--input
examples/url-orders-fail.json
-->
```text
spec: examples/url-orders.ears.md
scenario: examples/url-orders-fail.json
violations: 1

R1 line 5
The Shop shall url.scheme = "https".
url.scheme is "http".
```

`emit-smt` quotes the dotted names and uses `str.suffixof` for "ends with". `url.port is empty` is the omitted port, `-1`:

<!-- verify stdout 0
build/ears-verify
emit-smt
examples/url-orders.ears.md
-->
```text
; spec: examples/url-orders.ears.md
(set-logic ALL)
; input url.scheme: String "The URL scheme."
(declare-fun |url.scheme| () String)
; input url.userinfo: String "The userinfo. A canonical URL has none."
(declare-fun |url.userinfo| () String)
; input url.host: String "The URL host."
(declare-fun |url.host| () String)
; input url.port: Int -1..65535 "The TCP port, or -1 when the URL omits it."
(declare-fun |url.port| () Int)
(assert (and (>= |url.port| (- 1)) (<= |url.port| 65535)))
; input url.path: String "The URL path."
(declare-fun |url.path| () String)
; input url.query: String "The URL query, without the question mark."
(declare-fun |url.query| () String)
; input url.fragment: String "The URL fragment, without the hash."
(declare-fun |url.fragment| () String)
; R1_L5 line 5: The Shop shall url.scheme = "https".
(assert (! (= |url.scheme| "https") :named R1_L5))
; R2_L6 line 6: The Shop shall url.userinfo is empty.
(assert (! (= |url.userinfo| "") :named R2_L6))
; R3_L7 line 7: The Shop shall url.host = "example.com" or url.host ends with ".example.com".
(assert (! (or (= |url.host| "example.com") (str.suffixof ".example.com" |url.host|)) :named R3_L7))
; R4_L8 line 8: The Shop shall url.port is empty.
(assert (! (= |url.port| (- 1)) :named R4_L8))
; R5_L9 line 9: The Shop shall url.path = "/customers/{customerId}/orders".
(assert (! (= |url.path| "/customers/{customerId}/orders") :named R5_L9))
; R6_L10 line 10: The Shop shall url.query = "status={status}".
(assert (! (= |url.query| "status={status}") :named R6_L10))
; R7_L11 line 11: The Shop shall url.fragment is empty.
(assert (! (= |url.fragment| "") :named R7_L11))
```

### A pasted URL with a user name

English: "Take off the user name, use the default https port, and clean the path."

<!-- verify stdout 1
build/ears-verify
canonicalize
HTTPS://bob@Example.COM:443/a/./b/%7Ehome/
-->
```text
https://example.com/a/b/~home
violations: 7
- lowercase the scheme
- lowercase the host
- omit the default port
- decode unreserved characters
- remove dot segments
- no trailing slash except the root
- no userinfo
```

The matching requirement on the orders page is R2, userinfo is empty. A scenario that still carries `bob` fails it:

<!-- verify stdout 1
build/ears-verify
check
examples/url-orders.ears.md
--input
examples/url-orders-userinfo.json
-->
```text
spec: examples/url-orders.ears.md
scenario: examples/url-orders-userinfo.json
violations: 1

R2 line 6
The Shop shall url.userinfo is empty.
url.userinfo is "bob".
```

### Items, with the query keys sorted

English: "The items page on example.com, served securely, filtered by page and status, with no fragment and no userinfo."

<!-- verify stdout 1
build/ears-verify
canonicalize
HTTPS://Example.COM/item/?status={status}&page={page}#
-->
```text
https://example.com/items?page={page}&status={status}
violations: 6
- lowercase the scheme
- lowercase the host
- no trailing slash except the root
- no empty fragment
- plural collection nouns
- sort query keys
```

`examples/url-items.ears.md` is that URL. The canonical scenario passes:

<!-- verify stdout 0
build/ears-verify
check
examples/url-items.ears.md
--input
examples/url-items-pass.json
-->
```text
spec: examples/url-items.ears.md
scenario: examples/url-items-pass.json
violations: 0
```

### Two schemes that cannot both be true

English: "The page is served securely, and the page is served over plain http."

Those are two ubiquitous requirements, and they cannot both hold. Lint says so. Ask which scheme should win. Do not pick `https` because it came first.

<!-- verify stdout 1
build/ears-verify
lint
examples/url-scheme-clash.ears.md
-->
```text
spec: examples/url-scheme-clash.ears.md
conflicts: 1
gaps: 0
misuse: 0
wording: 0

conflict {R1, R2}
R1 and R2 cannot both hold.

R1 line 3
The Shop shall url.scheme = "https".

R2 line 4
The Shop shall url.scheme = "http".

They clash in every situation.
R1 requires url.scheme = "https".
R2 requires url.scheme = "http".

Suggested fix: ask which requirement should win. To keep R1, remove R2. To keep R2, remove R1.
```

### When the English fits more than one URL

Stop. Ask which one they mean, or list the candidates. Do not guess, and do not write the path requirement until they answer.

English: "The customer orders page on example.com."

That sentence fits both of these, and each one is already canonical:

<!-- verify stdout 0
build/ears-verify
canonicalize
https://example.com/customers/{customerId}/orders
-->
```text
https://example.com/customers/{customerId}/orders
violations: 0
```

<!-- verify stdout 0
build/ears-verify
canonicalize
https://example.com/orders?customer={customerId}
-->
```text
https://example.com/orders?customer={customerId}
violations: 0
```

The same rule covers the site root. `https://example.com` and `https://example.com/` are both already canonical. Ask which one they meant.

<!-- verify stdout 0
build/ears-verify
canonicalize
https://example.com
-->
```text
https://example.com
violations: 0
```

<!-- verify stdout 0
build/ears-verify
canonicalize
https://example.com/
-->
```text
https://example.com/
violations: 0
```

## What you do not do

- You do not pick the winning requirement.
- You do not guess one URL when the English fits more than one. You ask, or you list the candidates.
- You do not drop a conflict and move on to a design, an API, or a schema for the build.
- You do not treat the example scenario as the behavior they agreed to.
- You do not introduce a second name for an idea that already has one.
- You do not report a check violation without its requirement ID, line, and sentence.
