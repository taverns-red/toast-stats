---
id: '158'
category: lesson
tags: [tests, tdd, verification, analytics, floats]
auto_load: true
date: 2026-06-10
issues: [1126, 1097, 798]
---

# Lesson 158 — A test comment that justifies a surprising expectation by MECHANISM ("due to floating-point precision") instead of by RULE is a pinned bug wearing documentation

**Date:** 2026-06-10
**Issue:** #1126 (epic #1097 Sprint 1 — integer-safe recognition targets)
**PR:** _(record on merge)_

## What happened

`TargetCalculator.test.ts` asserted the President's Distinguished target
for a 100-club base as **56**, with a confident explanation:

```ts
// Note: Due to floating-point precision, 100 * 0.55 = 55.00000000000001,
// which Math.ceil() correctly rounds up to 56.
expect(targets.presidents).toBe(56) // 55.00000000000001 → ceil → 56
```

The comment is accurate about the mechanism and wrong about the world:
55% of 100 clubs is exactly 55 (Item 1490). The float artifact had been
observed, investigated, _understood_ — and then enshrined as the
expected value, in two separate tests. The same form was fixed in
`divisionGapAnalysis` back in #798; these survivors stayed live for
months and published wrong targets for D86 (56) and D94 (111) because
the tests "documented" the wrong numbers as correct.

## The transferable principle

**When a test expectation needs a comment explaining the
implementation's mechanism to be believable, the expectation came FROM
the implementation — that's assertion pinning with extra steps. A valid
surprising expectation is justified by citing the domain rule, not the
arithmetic that produced it.** The tell is the direction of derivation:
"the spec says 55, here's why" is a test; "the code computes 56, here's
why" is a bug with a caption. Review-time heuristic: any numeric test
comment containing "due to floating-point", "because Math.ceil", or
similar mechanism-talk should be re-derived from the rule it claims to
encode.

## How to apply

- In review, treat mechanism-justified expectations as red flags: ask
  "what does the PROGRAM RULE say this value is?" before accepting.
- When fixing such a pin, fix every implementation of the formula
  (lesson 61) and pin them to each other with a cross-implementation
  parity/property test so the class dies, not the instance.
- Property tests that re-implement the production formula inherit its
  bugs (this file's ceiling-invariant helpers used the same float form).
  Express the oracle in a _different_, exactness-preserving form
  (integer arithmetic) than the code under test.

## Related

- [[156-a-rekeyed-conversion-field-must-match-the-target-keys-domain-not-just-its-shape]] —
  same epic family: a plausible local justification masking a wrong value.
- [[061-when-fixing-a-formula-audit-every-implementation]] — the fix
  shape: one shared helper (`percentageTarget`/`growthTarget`), all
  callers delegate.
