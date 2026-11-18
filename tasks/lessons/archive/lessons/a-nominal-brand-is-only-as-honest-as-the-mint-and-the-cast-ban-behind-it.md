---
date: 2026-07-15
tier: principle
summary: A nominal brand's guarantee lives in its mints and its cast-ban selector, not the type — and both fail silently, so pin every laundering variant with a behaviour sentinel and name the premise the proof actually rests on
tags:
  [
    types,
    frontend,
    tdd,
    lint,
    guard,
    snapshot-date,
    source-csv-date,
    regression-class,
    eslint,
  ]
---

# Principle — A nominal brand is only as honest as its mint and its cast-ban

**Issue:** #1323 (epic #1319, Sprint 4 — the snapshot-date guard).
**PR:** [#1330](https://github.com/taverns-red/toast-stats/pull/1330)

## Context

Epic #1319 closed a bug that shipped **four times** (#1289/#1292/#1296/#1315):
during month-end closing the as-of `sourceCsvDate` advances past the pinned
snapshot date, so keying a `snapshots/{date}/…` fetch on `data.date` 404s → blank
UI. Sprints 1–3 renamed the field and made divergence the fixture default —
those *catch* the mistake. Sprint 4 made it **unrepresentable**:
`SnapshotDate = string & { __brand }`, required at all seven CDN entry points.

It worked: the compiler enumerated 21 laundering sites, and three of them were
real defects the types had been hiding (a wall-clock `?? new Date()` feeding a
URL that cannot exist; a synthesized `${year+1}-06-30` PY bound; an unvalidated
public export param). Zero casts were needed to thread it.

But **both halves of the guard shipped subtly false**, and fresh-context review —
not the compiler, not 3,684 green tests — is what caught them.

## The trap

**1. The cast ban had holes exactly where they mattered.** The obvious selector

```js
'TSAsExpression > TSTypeReference > Identifier[name="SnapshotDate"]'
```

only matches when the type reference is a **direct child** of the cast. So
`as SnapshotDate` was caught while `as SnapshotDate[]`,
`as SnapshotDate | undefined`, and `as Array<SnapshotDate>` sailed through — a
`TSArrayType` / `TSUnionType` / `TSTypeReference` intervenes. The array form is
the shape the *mint module itself* uses, i.e. the likeliest to be copy-pasted
out of it, and it launders a whole index in one cast. The sentinel was green
because it only tested the two variants that already passed — **Lesson 82's
failure mode, one level up**: I asserted behaviour, but only the behaviour I'd
already assumed worked. An AST selector is an unchecked string; nothing
typechecks it against the ESTree shape.

**2. The proof of a deletion named the wrong premise.** The brand exposed a
`getMostRecentDateInProgramYear(dates, py) || py.endDate` fallback duplicated
across 8 pages + 1 hook. I deleted all nine, documenting them as provably dead
because `getAvailableProgramYears` and `filterDatesByProgramYear` "use the
identical July-boundary predicate." **They don't.** The former derives the PY via
`calendarParts`, whose regex is *unanchored at the end*; the latter compares
lexicographically against the PY bounds. `2026-06-30T00:00:00Z` derives PY 2025
but sorts **above** the `'2026-06-30'` bound — admitted as a year, filtered out
of it, `null` after all.

The fallbacks were still dead — but because `snapshotDatesFrom` filters to strict
ISO first. **The mint was the load-bearing premise, and my comment credited
something else.** A maintainer trusting that comment could loosen the mint's
filter and silently resurrect the bug the epic exists to kill.

## The rule

- **A brand's guarantee lives in its mints and its cast-ban, not in the type.**
  The nominal type is just the enforcement surface. Ask "what can still produce
  one?" — the mints (do they *validate*, or merely assert?) and the cast ban (does
  its selector cover the variants?). `toSnapshotDate(data.asOfDate)` still mints
  the original bug through the front door: format is checkable, provenance isn't.
  **Say that in the module** (L166) instead of implying the brand is a proof.
- **Pin every laundering VARIANT, not just the canonical one.** For a cast ban
  that means the array, union, generic, and `as unknown as` forms — write them
  as failing tests first and watch them fail. A guard tested only on the shape
  you had in mind is a guard tested on nothing.
- **When you delete code as "provably dead," name the premise the proof actually
  rests on — and verify it against the code, not against the two functions'
  names.** Two predicates that agree on your data are not the same predicate. If
  the real premise is an upstream filter, say so and say what breaks if it's
  loosened; that sentence is the whole value of the comment.
- **Corollary — prefer narrowing to minting.** Every branded value in this sprint
  reached its fetch by narrowing an element of a list the pipeline enumerated
  (`dates.find(d => d === urlValue)`, `getMostRecentDateInProgramYear`, generic
  `<T extends string>` helpers). Narrowing carries provenance a format check
  cannot. That's why the diff needed zero casts — and a brand that needs casts to
  thread is telling you the mints are in the wrong place.

## Also worth keeping

- **The two obvious type-test mechanisms were inert here.** `@ts-expect-error` in
  a test asserts nothing (`tsconfig.json` excludes `__tests__` from the program),
  and `*.test-d.ts` matches neither vitest project's include (the R20/#482
  partition hazard). What works: compile known-bad snippets through the real
  `tsconfig` via the **TS compiler API** at a virtual `src/__sentinel__/…` path —
  the direct analogue of the repo's ESLint `lintText` sentinel. Fast (~1.5s), no
  CI wiring, no new project. Give it a **positive control** (a minted date
  compiles clean) or it can false-pass on an unrelated compile error.
- **Don't smuggle behaviour into a type change.** I reflexively "modernised"
  `selectedDate || (await latest())` to `??` in six hooks; a test caught that it
  changes empty-string handling. Reverted — the brand makes `''` unrepresentable
  from typed callers anyway, so `??` bought nothing and risked something.

Related: [[key-per-snapshot-fetches-on-the-snapshot-date-not-the-as-of-sourcecsvdate]]
(the bug class this closes), [[a-lint-rule-can-be-present-but-inert-assert-behavior-not-severity]]
(L82 — whose lesson I re-learned one level up), and
[[a-structural-injection-guard-must-check-value-honesty-not-just-key-presence]]
(L166 — document the guard's blind spots rather than overclaiming).
