---
date: 2026-08-02
tier: lesson
summary: A suppression directive only reads as a safety signal if something checks the file — excluded from tsc and transpiled by esbuild, every `@ts-expect-error` in the test tree was inert, and the fixtures behind them had drifted 218 errors from the types they declared
tags: [typescript, tests, test-infra, ci, fixtures, tsconfig]
---

# A suppression directive in an unchecked file is a false safety signal

**Date:** 2026-08-02
**Issue:** #1368 (test-infra: the frontend test tree is excluded from tsc)
**Tags:** typescript, tests, test-infra, ci, fixtures, tsconfig

## What happened

`frontend/tsconfig.json` excluded `src/**/__tests__/**` and `*.test.*`. Vitest
transpiles with esbuild, which **strips** types rather than checking them. So
between the exclude and the transpiler, no gate — `quality:check` included —
ever typechecked a test file.

Two consequences, and the second is the expensive one.

**1. Every suppression directive was inert.** Five files carried

```ts
// @ts-expect-error - jest-axe matcher types vs vitest expect
expect.extend(toHaveNoViolations)
```

The underlying cause was mundane: `src/types/jest-axe.d.ts` declared
`toHaveNoViolations` as a bare function when it is a matchers *object*. But the
directives could neither fire nor protect anything — they sat in files no
compiler read. They looked, to every reviewer since, like a known-and-handled
type wrinkle. Correcting the declaration made all five report **TS2578, unused
`@ts-expect-error`** — which is how we learned they had been live-looking and
dead for their whole existence.

**2. Fixtures had drifted from the types they declared.** 218 errors under the
real strictness (796 with `noUncheckedIndexedAccess` on). Not noise — 65
`TS2741`s, each a fixture building an object missing a property its own
annotation requires:

- `useMembershipData`'s `createMockDistrictStatistics` was annotated
  `DistrictStatistics` and returned a wholly invented shape — top-level
  `asOfDate` (the phantom #1321 deleted from the envelope) plus
  `membership.totalMembers`, `clubs.totalClubs`, `education.pathwaysCompletions`,
  none of which exist. Two assertions read the phantom back.
- `DivisionPerformanceCards.snapshotTimestamp` is a **required** prop. 33 render
  sites omitted it — and one test had hardened the omission into an assertion:
  `expect(extractDivisionPerformance).toHaveBeenCalledWith(mockSnapshot, undefined)`,
  with a comment explaining that is what happens "when no `snapshotTimestamp`
  prop is provided". Production always passes `effectiveEndDate`.
- `DivisionAreaPerformance.accessibility.test.tsx` imported three types from two
  modules that **do not exist** (`../../types/district`,
  `../../types/performance`). Type-only imports are erased by esbuild without
  resolution, so a dead import is indistinguishable from a live one.
- `ClubsTable.reskin` set `yearsChartered` directly on a `ClubTrend`. It is
  DERIVED from `charterDate` by `processClubTrends`, so the value was dropped
  and the cell rendered the em-dash placeholder the fixture's own comment said
  it was avoiding.
- 42 sites handed a raw `string` to an API taking the branded `SnapshotDate` —
  the brand whose entire purpose (#1323) is that a string must not satisfy a
  per-snapshot entry point.

## The transferable takeaway

**A suppression directive is only evidence of a considered decision if
something evaluates it.** `@ts-expect-error`, `eslint-disable`, `# type:
ignore`, `@SuppressWarnings` — each is a *claim* that a checker would object
here. In a file the checker never opens, the claim is unfalsifiable, and it
reads to every subsequent reader as "handled".

The corollary for fixtures: **a type annotation on a fixture is a promise the
compiler has to be asked to keep.** `const x: Foo = {...}` in an unchecked file
is a comment. Tests then pass against shapes production would reject — which is
precisely the class of bug a fixture exists to prevent.

## What to do instead

- When you exclude files from a typechecker, add a **second config that
  includes them**, even at relaxed strictness. A relaxed check is enormously
  more valuable than none — relaxing four index-access flags here cut 796
  errors to 218 while keeping every "missing required property" and "wrong
  literal" finding.
- **Sequence the gate last.** Add the config, drive it to zero, *then* wire it
  into `quality:check` and CI. Adding the gate first creates a red nobody can
  land against, which is how R1 violations start.
- When a suppression stops being needed, the checker tells you: TS2578 /
  `--report-unused-disable-directives`. Turn those on — an unused suppression
  is the cheapest available signal that a file's assumptions have moved.
- Grep for suppression directives in any tree you are about to bring under a
  checker for the first time. Treat each as **unverified** until it either
  fires or reports unused.

## Related

- `renaming-a-typed-field-the-prod-compiler-misses-test-only-typed-fixtures-and-untyped-mocks.md`
  named the same blind spot from the other direction (#1273). It notes
  `typecheck:test` as non-CI; as of #1368 it runs in `quality:check` and CI, so
  the "typed test fixture" half of that gap is closed. Untyped mocks (`as
  unknown as`, `vi.mock` factories) remain uncovered.
- `a-nominal-brand-is-only-as-honest-as-the-mint-and-the-cast-ban-behind-it.md`
  (#1323) — the `SnapshotDate` brand's cast ban held, but the brand itself was
  unenforced across 42 test sites because nothing compiled them.
- `a-phantom-field-is-a-live-default-every-read-of-it-silently-becomes-the-fallback.md`
  (#1321) — the `asOfDate` phantom this sweep found still living in fixtures.
