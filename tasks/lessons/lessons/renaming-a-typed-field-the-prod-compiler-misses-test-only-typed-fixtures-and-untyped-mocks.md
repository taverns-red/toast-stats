---
date: 2026-07-06
tier: lesson
summary: When you rename a widely-typed field, the prod `tsc` enumerates prod consumers but is blind to test-only typed fixtures (caught only by non-CI `typecheck:test`) and to untyped mocks (caught by nothing) — sweep both by hand
tags: [refactor, typescript, testing, blast-radius, rename, cdn, frontend]
---

# Lesson — Renaming a typed field: the prod compiler misses test-only typed fixtures and untyped mocks

**Date:** 2026-07-06
**Issue:** #1320 (epic #1319 Sprint 1 — remove the ambiguous `date` field from the rankings fetch API)

## What happened

Sprint 1 renamed `CdnRankingsData.date` → `asOfDate` (+ added `snapshotDate?`).
The plan leaned on "the compiler enumerates consumers": run `tsc`, fix each
error, done. `npm run build:frontend`'s `tsc` (which uses `tsconfig.json`) went
green and the full frontend suite (3617 tests) passed. Looked shipped.

The fresh-context `/review` caught a consumer the prod compiler never saw:
`src/__tests__/lighthouse-cdn-fixtures.test.ts` types the raw served fixture as
`const typedRankings: CdnRankingsData = rankings` and asserts `typedRankings.date`.
After the rename that's two errors (missing `asOfDate`; `date` gone) — but
`tsconfig.json` **excludes the test directories**, so `build:frontend` never
type-checks it. Only the **non-CI** `typecheck:test` (`tsconfig.test.json`) does.
The `scripts/lib` "Test Suite" CI job runs it and went red *after* local green.

Two distinct blind spots bit here:

1. **Test-only typed fixtures.** A fixture annotated with the renamed type lives
   in a dir the prod build doesn't compile. `tsc` (prod) is silent; the failure
   surfaces only in `typecheck:test` / a CI job that runs it.
2. **Untyped mocks.** ~30 test files build rankings-shaped mocks as bare object
   literals (`{ rankings, date: '…' }`). TypeScript does zero excess/missing
   checking on those, so a stale `date` key silently feeds `undefined` into the
   renamed consumer — a *runtime* wrong-value bug a render test that passes the
   value as a prop will never catch.

## The principle

**A compiler's "it enumerates all consumers" guarantee is scoped to the files
that compiler actually compiles.** A rename's blast radius includes:

- Prod consumers — `tsc` finds these. ✅
- Fixtures/helpers typed as the renamed shape but sitting in an excluded test
  dir — found only by `typecheck:test` (or whatever project includes them).
  **Run `typecheck:test` / `typecheck:all`, not just `build:*`, after a rename.**
- Untyped mock literals of the shape — found by *nothing*; grep them.

## How to apply

- After renaming a widely-used typed field, run the **broadest** typecheck the
  repo has (`typecheck:all`), not just the prod build — the prod `tsconfig` very
  often excludes `__tests__`.
- `grep` the *old* field name across the whole tree (`\bdate:` narrowed to the
  shape) to catch untyped mocks the compiler can't. A rename isn't done until the
  old key name is gone from mocks too, or they silently emit `undefined`.
- The served/raw shape and the mapped/returned shape can legitimately differ
  (here the CDN file keeps bare `date`; `fetchCdnRankings` maps it to `asOfDate`).
  Type a raw fixture as the *raw* shape (`Omit<Mapped, 'asOfDate'|'snapshotDate'>
  & { date }`), not the mapped type — conflating them is what drifted.
- A fresh-context reviewer that actually compiles/greps beyond your local gate is
  the backstop for exactly this "green locally, red in a CI job you didn't run"
  class.

## Related

- [[a-fields-name-and-comment-can-lie-about-whether-its-populated-in-your-surface]]
  — sibling: the value, not the name/type, is the source of truth.
- [[key-per-snapshot-fetches-on-the-snapshot-date-not-the-as-of-sourcecsvdate]]
  — the root principle this sprint's rename hardens into the type system.
- R7 in `tasks/rules.md` — inventory existing fields; this adds "and inventory
  every surface that references the one you're renaming, incl. test-only ones."
