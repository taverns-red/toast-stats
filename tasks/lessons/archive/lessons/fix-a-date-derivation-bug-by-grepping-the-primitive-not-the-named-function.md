---
date: 2026-06-13
tier: lesson
summary: Fix a date-derivation bug by grepping the PRIMITIVE, not the named function
tags: [analytics, date, timezone, frontend, monorepo, verification, refactor]
legacy_id: "170"
---

# Lesson 170 — Fix a date-derivation bug by grepping the PRIMITIVE, not the named function

**Date:** 2026-06-13
**Issue:** #1116 (epic #1192 Sprint 1)
**PR:** #1207

## What happened

The audit named two sites for the "timezone-sensitive program-month" defect:
`AnalyticsUtils.getCurrentProgramMonth` and "the same pattern in frontend
`programYear.ts`." The actual root cause is a one-line **primitive**:
`new Date("YYYY-MM-DD")` parses as UTC midnight, but `.getMonth()` /
`.getFullYear()` read **local** time — so a first-of-month (and at Jan 1 /
Jul 1, a first-of-year) date rolls back a month/year in any UTC-negative
zone, mis-assigning the DCP checkpoint and the program year.

Fixing the two named functions plus the three buggy `programYear.ts`
derivers felt complete and all suites were green. The fresh-context
**review** then found a fourth instance the issue never mentioned —
`useRankHistory.deriveProgramYear`, on a **live** path (`useRankHistory` →
`useGlobalRankings` → DistrictsPage) — carrying the exact
`new Date(str).getMonth() >= 6` shape. The author's grep had keyed on the
issue's function names; the primitive recurred in a function with an
unrelated name. (A repo-wide sweep for the primitive afterwards also
surfaced `MembershipTrendChart.tsx:205`, a low-impact display heuristic, and
confirmed `areaRecognitionState.ts` already string-slices on purpose.)

The same sprint's YoY defect had the same shape at the **selection** layer:
`snapshotYear === currentYear - 1` (calendar year) lived identically in the
Distinguished module **and** two `MembershipAnalyticsModule` twins; only one
was named.

## The transferable principle

**When the bug is a reusable primitive (a date parse, a comparison idiom, a
formula), the issue's named site is a lower bound. Grep for the PRIMITIVE
pattern repo-wide — `new Date(<string>).getMonth()`,
`snapshotYear === currentYear - 1` — not for the function the ticket
named.** A primitive recurs in functions whose names give no hint they share
the defect, so a name-scoped search misses live twins. This is R61 ("fix the
formula everywhere") sharpened to the lexical level, and it is exactly what a
fresh-context review is for: the author greps what they were thinking about;
the reviewer greps the shape.

## How to apply

- Reduce the defect to its smallest lexical signature, then
  `grep -rn '<signature>' packages frontend` (all packages) before declaring
  the fix complete. Treat every hit as a co-equal fix site until proven
  benign (a `new Date(dateObj.getMonth())` on a Date, not a string, is fine;
  an intentional string-slice with a comment is fine).
- Prefer routing the twins through one already-fixed, already-tested helper
  (`getProgramYearForDate`, `selectPreviousProgramYearSnapshot`) over
  re-patching each inline — the next twin then can't drift.
- For a timezone derivation, prove the fix with a suite run under a
  UTC-negative `TZ` (`TZ=America/New_York`): the bug is invisible under UTC,
  so a CI that only runs UTC passes the buggy code vacuously.

## Related

- [[061-fix-the-formula-everywhere-not-just-the-one-in-the-bug-report]] — the
  formula-level parent; this lesson extends it to the primitive/lexical level.
- [[156-an-audits-defect-list-for-a-forked-implementation-is-a-lower-bound]] —
  an audit's defect list is a lower bound; re-derive the full diff.
