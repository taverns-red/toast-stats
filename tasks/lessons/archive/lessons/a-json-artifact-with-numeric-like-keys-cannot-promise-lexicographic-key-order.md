---
date: 2026-06-10
tier: lesson
summary: A JSON artifact with numeric-like keys cannot promise lexicographic key order; test permutation-invariance of the serialized bytes instead
tags: [data-pipeline, tests, tdd, verification, json, determinism]
legacy_id: "158"
---

# Lesson 158 — A JSON artifact with numeric-like keys cannot promise lexicographic key order; test permutation-invariance of the serialized bytes instead

**Date:** 2026-06-10
**Issue:** #1134 (epic #1101 Sprint 1 — global divisions/areas index artifact)
**PR:** _(record on merge)_

## What happened

The divisions/areas index builder inserts district keys into its output
object in sorted order, and the Red test pinned that:
`expect(Object.keys(index.districts)).toEqual([...keys].sort())`. It failed —
`Object.keys` returned `['61', '01', '04']` for sorted insertion of
`['01', '04', '61']`.

The ES spec orders object properties in two tiers: **array-index-like keys
first, ascending numerically**, then string keys in insertion order. `'61'`
is array-index-like (canonical round-trip: `String(61) === '61'`), but
`'01'` is **not** (`String(1) === '1' ≠ '01'`) — a leading zero demotes a
key to the string tier. So a key set mixing `'61'` with `'01'` can never be
lexicographic in a plain object, no matter how you insert. `JSON.stringify`
follows the same order, so the published artifact inherits it.

The property that actually matters for a daily-regenerated artifact is
**clean day-over-day diffs**, and the achievable, falsifiable form of that
is **permutation-invariance**: same input files in any order → identical
serialized bytes. Sorted insertion (string tier) + the spec's deterministic
integer-tier ordering deliver exactly that. The test was amended to assert
`JSON.stringify(build(files)) === JSON.stringify(build(reverse(files)))` —
not to match the bug, but because the original assertion encoded an
unrepresentable spec.

## The transferable lesson

**When a deterministic JSON artifact has numeric-like string keys (district
ids, ports, years), "keys are sorted" is not a property a JS object can
hold — the integer-hoisting tier reorders them at insertion. Specify and
test the real requirement (identical serialized output regardless of input
order), and document why lexicographic order is off the table so the next
reader doesn't "fix" the key ordering into a test that can never pass.**
Distinguish this from assertion pinning: pinning bends the expectation to
match defective behavior; this bends the expectation to the strongest
property the platform can represent — after verifying the original
expectation was impossible, not merely failing.

## How to apply

- Emitting a keyed JSON artifact for daily diffing? Insert string-tier keys
  sorted, then assert permutation-invariance of the bytes, not key order.
- If true lexicographic order is a hard requirement (e.g. for a
  line-oriented differ), use an array of `[key, value]` pairs — objects
  cannot represent it.
- When a Red test fails on its own expectation, check whether the
  expectation is representable at all before touching the implementation.

## Related

- [[157-in-a-zod-union-a-non-strict-all-optional-object-schema-swallows-any-object]]
  — same family: the platform's silent semantics (strip mode / key
  hoisting) reshape what your contract can actually promise.
- `scripts/lib/divisionsAreasIndex.ts` (the ordering note),
  `scripts/lib/__tests__/divisionsAreasIndex.test.ts` (the
  permutation-invariance test).
