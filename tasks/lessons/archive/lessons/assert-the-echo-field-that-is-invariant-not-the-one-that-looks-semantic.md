---
date: 2026-08-02
tier: lesson
summary: When an upstream echoes your request back, assert the echo field that is invariant across every response shape — not the one that reads most semantically
tags: [data-pipeline, collector, external-api, verification, backfill, program-year]
---

# Lesson — Assert the echo field that is *invariant*, not the one that looks semantic

**Date:** 2026-08-02
**Issue:** #1384 (backfill could not reach the live program year)
**Related:** #1342 (the export endpoint moved), #1284 (resolve the PY by data)

## What happened

`export.aspx` returns a footer that echoes the request:

```
Month of Jul, As of 07/26/2026
```

Two things about it are ignorable by the server — the `~{programYear}` token
and, when the month-end URL slot is left empty, the as-of date — so a backfill
can get a 200, a valid `DISTRICT` header, and data for entirely the wrong
period. The fix was to verify the footer against the request. The interesting
part was choosing *which half* of the footer to verify.

`Month of X` is the obvious candidate. It is the semantic field: it names the
reporting period, it is what `parseFooterDataMonth` already extracts, and it is
what the issue proposed asserting. It is also **wrong**.

Twelve probes against the live endpoint showed `Month of` behaves differently
depending on whether the response has data:

| response | `Month of` tracks |
| --- | --- |
| has data rows | the **as-of** month |
| no data rows | the requested **month-end slot** |

Asserting it would have hard-failed every legitimate empty response — of which
there are many, because old archives no longer retain arbitrary daily as-of
dates. `As of`, by contrast, echoed the requested date in 12 of 12 probes, with
the single exception being the exact bug we were trying to catch.

The derived program year had the same problem in a subtler form: for the #1342
classic (a historical year fetched from the root path), the footer-derived year
*agrees* with the request, because July > June rolls the year back. The check
that looks like the primary defence catches nothing there; the as-of date is
what fires.

## The transferable bit

An echoed request parameter is only a useful assertion if it is echoed the
**same way in every response shape** — success, empty, error, edge case. Rank
candidate fields by measured invariance, not by how well they describe the
thing you care about. The semantically-richest field is often the one the
server computes, and anything the server computes can vary with state you do
not control.

Concretely, before asserting on an upstream echo:

1. Probe every response shape you can produce, including the empty and
   error-adjacent ones. Six probes would have suggested `Month of` was fine.
2. Tabulate which fields are byte-stable against the request across *all* of
   them.
3. Assert the invariant one. Keep the semantic one only as defence in depth,
   and only with an explicit carve-out for the states where it legitimately
   diverges — here, July, when the prior year's June close is still running.

The failure mode you are avoiding is not a missed bug. It is a guard that
hard-fails correct traffic, which gets weakened or removed the first time it
blocks someone — and then catches nothing at all.

## Also worth remembering

`computeMonthEndDate()` returns the *previous* month's end (6/30/2026 for
2026-07-26) despite a docstring promising a July special case that was never
implemented. It happens not to matter, because the endpoint only checks that
the month-end slot is **non-empty** — populated with the "wrong" value it
returns byte-identical data. A parameter whose value is ignored but whose
presence is load-bearing is worth a comment at the call site; nobody reading
`monthEndDate: computeMonthEndDate(date)` would guess it.
