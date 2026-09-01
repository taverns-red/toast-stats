---
date: 2026-08-31
tier: lesson
summary: A dependency bump that reds a test may have fixed a false positive the test had pinned — diff the reported violations, don't pin or ignore the dep
tags: [dependabot, dependencies, testing, accessibility, jsdom, test-utils, ci]
---

# A dep bump that reds a test may be fixing a false positive you pinned

**Date:** 2026-08-31
**Issue:** #1503 · **PR:** #1506 · **Unblocked:** Dependabot #1502

## What happened

The dev-deps group (#1502) failed `Test Suite` on a single assertion:

```
AssertionError: expected 'AA' to be 'A' // Object.is equality
```

The reflex reading is "the new dependency broke us." The opposite was true:
the new dependency **stopped** producing a wrong answer, and our test had been
asserting the wrong answer.

`runAccessibilityTestSuite` calls five `expect*` helpers in a row, and each one
rendered the component again without unmounting the previous render. Five copies
of the same tree coexisted in one document, so every `id` was duplicated 5x.
`expectScreenReaderCompatibility` then did:

```ts
const descriptionElement = container.querySelector(`#${describedBy}`)
```

Under jsdom 29's selector engine, a scoped `#id` query takes a document-level id
fast-path: it finds the document's *first* element with that id — one belonging
to an earlier, still-mounted container — sees it is not a descendant of
`container`, and returns `null`. So the util reported

> `aria-describedby references non-existent element: "email-help"`

for a form where `<div id="email-help">` demonstrably existed. That phantom
violation dragged the report from `'AA'` down to `'A'`, and the example test
had been written to expect `'A'`.

jsdom 30 bumped `@asamuzakjp/dom-selector` and fixed the scoping. The phantom
violation vanished, the level rose to the correct `'AA'`, and the pinned
assertion failed.

## The takeaway

When a dependency bump turns a test red, ask **which version is telling the
truth** before you pin, ignore, or quarantine. The cheap way to find out is to
diff the *substance*, not the summary value: print the actual violations /
diffs / rows the assertion is a projection of, under both versions. Here, one
`console.error` of the violation list under each jsdom made the answer obvious —
a violation naming an element that is right there in the JSX is a false
positive by construction, whichever version reports it.

A dep bump is one of the few forces that re-derives a value your test froze
years ago. Sometimes the freeze was the bug.

## Secondary catch — a test helper that renders must unmount

The root cause was not jsdom; it was a test util leaking renders. Any helper
that renders a component and is designed to be *composed* with other such
helpers has to unmount before returning, or callers silently get a document
with N copies of every id. Duplicate ids are exactly the condition under which
selector engines diverge, so the leak is what made us version-sensitive in the
first place. Fix the leak and the two versions agree.

## Falsification probe used

Two renders of the same fragment under jsdom 29:

```
{"firstFound":true,"secondFound":false,"secondFoundViaGetElementsBy":true,"docMatches":2}
```

`secondFound:false` while `secondFoundViaGetElementsBy:true` — the element *is*
a descendant of the second container. That single line converted a hypothesis
into a diagnosis.

## Bonus: `typecheck` is not `typecheck:tests`

`npm run typecheck` passed locally while CI's Quality Gates failed on
`npm run typecheck:tests` (`tsconfig.test.json`, #1368) — a stricter config
covering the frontend test tree that the plain script does not include. It
caught that `renderWithProviders` returns a **union**, and the `skipProviders`
branch has no `cleanup` property. Run `typecheck:tests` locally before pushing
changes under `frontend/src/__tests__/`.
