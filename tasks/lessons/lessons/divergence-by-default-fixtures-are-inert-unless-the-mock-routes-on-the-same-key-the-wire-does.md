---
date: 2026-07-15
tier: principle
summary: Divergence-by-default fixtures are inert unless the mock ROUTES on the same key the wire does — a date-blind router serves the right fixture for the wrong key and rubber-stamps the bug the fixture was written to expose
tags:
  [
    tests,
    fixtures,
    mocks,
    cdn,
    snapshot-date,
    verification,
    regression-class,
    test-infra,
  ]
---

# Principle — A fixture only guards what its mock ROUTER can get wrong

**Filed:** 2026-07-15 (#1322, epic #1319 Sprint 3 — the systemic guard for the
`sourceCsvDate` ≠ `snapshotDate` bug class).

## The trap

The epic's layer 2 was "make the divergence the default test world": set
`sourceCsvDate = snapshotDate + 5d` in every fixture so any consumer keying a
per-snapshot fetch on the as-of date fails in CI. Landing that change alone
produced **57/57 integration tests still green** — and it would have shipped as
a guard that guards nothing.

The reason wasn't the fixture. It was the **router**:

```ts
} else if (path.includes('competitive-awards.json')) {   // date-blind
```

The mock matched on filename and ignored the `/snapshots/{date}/` segment
entirely. So a consumer asking for `snapshots/2026-07-05/competitive-awards.json`
(the wrong key) was handed the snapshot's own fixture and passed. The fallback
was worse: an unmatched path returned `{ ok: true, status: 200, json: () => ({}) }`
with a `console.warn`. **The harness could not 404.** Live, that same request
404s → `fetchCdnCompetitiveAwards` returns null → blank UI, which is the entire
#1315 mechanism.

The fixture encoded the divergence. The router erased it. Diverging the *data*
while the *routing* stays key-blind reproduces the original blind spot one layer
down — inside the harness written to catch it.

## The rule

**A fixture's values are only observable through the mock's routing. If the mock
resolves on a looser key than the wire, the fixture's distinctions are
unreachable and every assertion over them is vacuous.**

Ask, of any mock you rely on as a guard: *what request would the real system
reject that this mock happily serves?* Each such gap is a bug class the suite is
structurally blind to. Then close it — mirror the rejection:

```ts
const requestedSnapshotDate = /^\/snapshots\/([^/]+)\//.exec(path)?.[1]
if (requestedSnapshotDate && !KNOWN_SNAPSHOT_DATES.includes(requestedSnapshotDate)) {
  return { ok: false, status: 404, ... } as Response
}
```

Same trap at the per-test level: `mockedAwards.mockResolvedValue(standings)`
returns the payload for **any** date, so a content assertion ("the awards render")
passes under a wrongly-keyed consumer. `mockImplementation(async date => date === SNAPSHOT_DATE ? standings : null)`
mirrors the 404→null mapping and makes the assertion bite. A mock's *return
value* gets scrutiny; its *matching condition* rarely does — that's where this
hides.

## How to apply

- **A route table keyed on `path.includes(filename)` cannot enforce anything
  about the path's other segments** (date, district, program year). If a segment
  carries meaning your code can get wrong, route on it.
- **A 200-only mock is a rubber stamp.** If the real surface has a rejection
  path (404, 403, empty), the harness needs one, or "green" only means "the code
  ran."
- **Prove the guard bites — never assume it.** These consumers were already
  correct, so the tests passed on arrival, which says nothing. Mutating the
  source (re-point each consumer at the as-of date) and the harness (delete the
  404 gate) is what demonstrated they fail for the right reason. A guard you
  haven't seen fail is a guard you haven't tested. This is the general form of
  the mutation check the epic prescribed for one consumer.
- **Guard the harness itself.** `mockCdnHarness.test.ts` asserts both properties
  (dates diverge; wrong dates 404), so a future edit can't quietly flatten the
  divergence back or drop the gate.

## Related

- [[key-per-snapshot-fetches-on-the-snapshot-date-not-the-as-of-sourcecsvdate]]
  — the bug class this guards; this lesson is why its layer-2 recommendation
  needs a routing change, not just a fixture change.
- [[a-dated-cdn-snapshot-is-a-perdistrictdata-envelope-mock-the-wrapper-or-the-page-reads-empty-on-live]]
  — the sibling: there the mock's *shape* was dishonest, here its *routing* is.
  Same root — the mock is more permissive than the wire.
- [[a-structural-injection-guard-must-check-value-honesty-not-just-key-presence]]
  — same shape one level up: presence isn't honesty.
- [[a-year-end-snapshots-source-date-falls-in-july-so-a-program-year-equality-guard-drops-every-year]]
  — "green on mocks, broken on live," date-semantics flavour.
