---
date: 2026-09-13
tier: lesson
summary: A deadline turns copy into a function of the viewed date — resolve the as-of state once at the data boundary, so generators stay pure and no surface reaches for a clock
tags: [r3, dates, copy, narratives, analytics, testing, csp]
---

# A deadline turns copy into a function of the viewed date

**Date:** 2026-09-13
**Issue:** #1565 (per-club Club Success Plan due dates; corrects #1555)

## What happened

The Club Success Plan copy shipped in #1555 read _"No club can be
Distinguished until its plan is in."_ True on 11 September. False from
1 October: the DCP (Item 1111, p. 5) makes 30 September a hard deadline
after which the club has lost Distinguished eligibility for the year. The
sentence told a district leader to chase something that could no longer be
recovered, and it would have started lying seventeen days after it shipped.

The same sentence was wrong for a second class of club on the day it
shipped: a club chartered in-year has 90 days from its charter date, and one
chartered after 1 April has automatic credit (p. 11) — so it was listing
clubs that had no deadline at all.

## The transferable takeaway

**Any copy that mentions a deadline is a function of two dates — the due
date and the date being viewed — and the second one is not "today".** A
pinned historical snapshot must render the wording that was correct on its
own date, and the before/after branch must be testable without a mocked
clock. Both fall out of one design choice:

> Resolve the time-dependent state **once, at the data boundary**, and carry
> it on the row. Presentation code reads a flag; it never reads a date.

Here that is `MissingCspClub { cspDueDate, cspOverdue }`, filled in
`extractDivisionPerformance` (raw path) and `summarizeCspCompletion`
(analytics path) from the caller's pinned `snapshotDate` (R3). The four
surfaces — area and division narratives, action list, overview line — then
branch on `cspOverdue` and format `cspDueDate`. Every "on 30 September it is
still pending / on 1 October it is lost" case is a plain fixture with a
boolean flipped. `Date.now()` appears nowhere on the path.

The rule itself (`cspDueDate`, `isCspOverdue`) sits in analytics-core beside
`isCspRequired`, so the year gate and the per-club date come from one home
(lessons 61/76). `charterDate` was already on every club row — no collector
or schema change (R7).

## Two smaller things worth keeping

- **A club exempt from a requirement must leave both sides of the ratio.**
  "N of M" with the exempt club in M but never in N understates the gap; in
  neither, and footnoted, is honest. Reuse the existing exclusion path
  (`pushByEligibility` + footnote) with a tagged reason rather than adding a
  parallel list — one mechanism, one footnote sentence per reason.
- **Search the shipped copy for "until".** It is the word that promises a
  fix is still available. A deadline makes that promise conditional on the
  date; if the sentence cannot say which date, it should not say "until".

## Falsifiability

`isCspOverdue('2026-09-30', '2026-09-30')` is false and
`isCspOverdue('2026-09-30', '2026-10-01')` is true; the overview, action
list and both narratives each have a test pinned to a pre-deadline and a
post-deadline date with the same rows, asserting the two sentences differ
and the second contains no "until".
