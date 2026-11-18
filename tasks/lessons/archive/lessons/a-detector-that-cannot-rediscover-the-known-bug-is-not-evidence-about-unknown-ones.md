---
date: 2026-09-08
tier: principle
summary: Make rediscovering an already-solved instance an acceptance test of a new detector, not a closing sanity check — the census that swept 181 snapshot dates found nothing on its first run, and only the ground-truth criterion revealed the detector had silently narrowed itself
tags:
  [
    analytics,
    data-pipeline,
    absent-is-not-zero,
    verification,
    guards,
    audits,
    calibration,
  ]
---

# A detector that cannot rediscover the known bug is not evidence about the unknown ones

**Date:** 2026-09-08
**Issue:** #1534 (archive-wide absence-as-zero census)

## What happened

#1534 built a census to sweep the snapshot archive for the #1501/#1514 class:
a source column absent for a whole population, defaulted to `0`, and published
as a measured zero. The issue named one acceptance criterion above the others —
before any finding could be believed, the census had to **rediscover the #1514
`Susp` signature unaided**, from population counts alone, with no knowledge of
that bug wired into it.

The classifier was built test-first and every rule passed. The first run over
all 181 archived snapshot dates produced 235 findings and reported **nothing**
on the `Susp` branch.

The rule was fine. The tokenizer was not. `Charter Date/Suspend Date` mostly
holds `Charter 06/30/22` or `Susp 03/31/22`, so branch splitting required a
cell to be exactly two tokens. Live cells are not always: 19 rows at 2026-06-30
and 5 at 2022-06-30 carry `Charter 09/30/25 Susp 03/31/26` — a club chartered
and suspended inside one program year. Those cells failed the "is this a branch
encoding" test; the column-level purity rule (`nonBranchNonEmpty === 0`) then
concluded the column was not branch-encoded at all; and a non-branch,
non-numeric column is dropped from the census. Nineteen unrecognised cells
removed a whole column from the audit **without a word**.

The detector built to find silent narrowing had silently narrowed itself.

## The principle

**A new detector's first acceptance test is an instance you have already
solved, and it must pass before any of its other output is evidence.** Not a
smoke test at the end — a criterion written down before the detector is built,
with a known expected answer, from a real input.

The reason is asymmetry: a detector that finds nothing is indistinguishable
from a clean archive, and both look like success. Every other signal the tool
emits is loud; the failure mode is quiet. The only way to tell the two apart is
to point it at something whose answer you already know. Had #1534 shipped with
"swept 181 dates, no `Susp` finding" it would have read as reassurance and been
exactly backwards.

Two corollaries, both paid for here:

- **Prefer dominance to purity in any "does this shape apply?" test.** The
  purity rule (`nonBranchNonEmpty === 0`) meant one malformed row could switch
  detection off for an entire column. The fix — require 95% of a column's
  values to fit, not all of them — costs nothing (the measured rate across all
  181 dates is 100%) and removes the single-row cliff. A rule that flips from
  "measure this" to "ignore this" on one unrecognised value is a silent-failure
  generator wherever it appears.
- **When the detector fails its ground truth, the bug is usually in the layer
  that decides what to look at, not in the rule that decides what is wrong.**
  Every classifier test was green. The loss happened upstream, in what was
  handed to the classifier at all.

## Where this applies next

Any oracle, census, guard or gate whose success condition is "found nothing":
the CEO-report oracle (#1429), the club-id census (#1450), the snapshot-anomaly
detector, `check-cdn-schema`. Each should be able to name the historical defect
it would still catch — and prove it, in a test, against real archived input.
