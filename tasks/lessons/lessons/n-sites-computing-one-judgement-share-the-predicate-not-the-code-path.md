---
date: 2026-08-22
tier: principle
summary: When several call sites reach the same judgement over different data sources there is no chokepoint to consolidate — the shareable unit is the predicate, not the code path, and it belongs in the lowest package all of them already depend on
tags:
  [
    monorepo,
    shared-contracts,
    refactoring,
    call-graph,
    analytics,
    frontend,
    r6,
  ]
---

# N sites computing one judgement share the predicate, not the code path

**Date:** 2026-08-22
**Issue:** #1442 (district year-over-year compares a post-merge district against
only its own pre-merge self)

## What happened

Four sites computed year-over-year independently, and the issue's own
acceptance criteria framed the choice as binary: find the chokepoint they all
pass through, or patch four places. R6 says trace the call graph before
assuming either.

Tracing it showed a third shape. The four sites are in **three packages** and
read **four different data structures** — two dated district snapshots, a
time-series program-year index, a flat `paymentsTrend` array, and a list of
yearly rank summaries. No two of them call each other. There is no chokepoint,
and consolidating them would mean inventing one: a common intermediate shape
that four unrelated readers would have to marshal into, which is a much larger
change than the bug warrants and couples four features that are otherwise
independent.

But the four sites were not duplicating a *computation*. They were each about
to make the same **judgement** — "are these two things comparable?" — and the
judgement needs only two dates and two population counts, which every one of
them already holds in some form. That is the piece that is genuinely shared.

So `detectReformationDiscontinuity` went into `shared-contracts` (the one
package analytics-core, collector-cli and the frontend all already depend on),
and each of the four sites calls it and acts in its own idiom: the pipeline
returns its existing `dataAvailable: false` + `message`, two hooks return
`null`, and the rankings component drops a prop. Four application sites, one
detector, no new coupling.

## The transferable lesson

**Duplication of a decision is not duplication of code.** When you find N call
sites that will each need to answer the same question, ask what the *answer*
depends on before asking how to merge the *callers*. If the inputs to the
question are small and every site already has them, extract the predicate —
not the function, not a shared base class, and not a new intermediate data
shape that exists only to give the sites something to pass through.

Two corollaries that made this concrete:

- **A predicate has a natural home: the lowest package every caller already
  depends on.** Putting it anywhere else creates a dependency edge that did not
  exist. `shared-contracts` already had precedent for this
  (`naming/snapshotFileNames.ts`, the "one matcher decides what
  `district_<id>.json` means" module from #1428).
- **A predicate consulted about a pair must be fed the same pair the caller
  divides.** In `useTimeSeriesYoY` the prior/current point resolution was
  copy-pasted across two functions; the detector had to be given the identical
  pair, so that resolution became one `resolveYearOverYearPair` first. A
  discontinuity detected against a different pair than the one being divided is
  worthless — worse than none, because it looks like a guard.

## How to apply

- On any "fix it in N places or find the chokepoint" issue, add a third option
  to the list before choosing: **share the decision, keep the actions.**
- Name the extracted predicate for the question it answers, not for the caller
  that needed it first — a sibling issue (#1443) needed the identical signal for
  an unrelated feature and could adopt it as a one-line import.
- Export the thresholds a heuristic predicate uses. A tuned constant buried in
  its own module is a number nobody can find when live data says it is wrong.

## Related

- `tasks/rules.md` R6 — trace the actual call graph before refactoring. This is
  the case where tracing it says "do not consolidate", which is a real answer
  and not a failure to find one.
- [[a-sentinel-keyed-on-one-field-cannot-detect-a-rename-of-any-other]] — a
  shared signal is only as good as the inputs it is keyed on.
