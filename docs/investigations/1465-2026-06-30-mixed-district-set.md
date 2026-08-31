# `snapshots/2026-06-30/` — a past date stamped with today's district set (#1465)

**Status:** cause fixed in the write path · **archived directory deliberately
left as-is** (see §4) · read-side guard tracked in #1466
**Measured:** 2026-08-31, against `gs://toast-stats-data-ca` (live read).

---

## 1. What is in the directory

|                                                       | files   |
| ----------------------------------------------------- | ------- |
| District files present                                | **158** |
| Listed in the directory's own `manifest.json`         | 94      |
| Present but **not** in the manifest                   | 64      |
| Renumbered PY 2026-27 districts (201–231, 204 absent) | 30      |

Every other archived date is internally consistent — 2026-06-29 has 128,
2026-07-26 onward has 94.

The split is visible in the CSV schema itself. All 30 renumbered files carry the
post-rename column set (`Level 2s or EOM`, cf. #1399); all 128 legacy files
carry the pre-rename one. `metadata.json` records `configuredDistricts` as the
**94-district PY 2026-27 set**, `collectionDate: 2026-07-30`,
`logicalDate: 2026-06-30`, and every object in the prefix was written in one
upload at `2026-07-31T15:05Z`.

**4,673 clubs therefore appear under two districts on that date** (one legacy +
one renumbered each; 3 renumbered-only clubs; no canonical id collision, so
#1450's census is unaffected).

## 2. What it does to a rollup

Measured from the live archive, summing `Total to Date` over `districtPerformance`
(which reconciles exactly with each district's `totals.totalPayments`):

| scope                                                 | payments    |
| ----------------------------------------------------- | ----------- |
| The 128 districts `all-districts-rankings.json` lists | **548,483** |
| Naive sum over all 158 files in the directory         | 575,954     |

548,483 is exactly the membership-payments figure the TI CEO Report publishes
for 2025-26 (`docs/investigations/1426-ceo-report-data-coverage.md` §2). Clubs
inflate +31.1%, membership +32.5%, payments +5.0%. Nothing about the naive
number looks wrong on its face — the silent-failure shape of #1436–#1443.

## 3. Mechanism, and the fix

The run was handed the **then-current** discovery set (94 districts, PY 2026-27)
and pointed at a **closed** date. Districts 201–231 did not exist on 2026-06-30,
but the per-district export endpoint ignores the program-year token (#1342), so
each of those fetches _succeeded_ and returned current-year data. Nothing
failed; 30 new-year district files were written into a closed year's directory,
and the 64 legacy districts that no longer exist in the current set were never
rewritten — they survive only because the upload step copies rather than syncs.

The rule the pipeline now enforces (this PR):

> A snapshot directory must contain only districts that existed on its own date.

`reconcileDistrictsForDate` (`packages/collector-cli/src/utils/districtSetForDate.ts`)
filters the requested district list against the districtsummary CSV that
`resolveActiveProgramYear` already downloaded and validated **for that date** —
the date's own authoritative district list. It costs no extra fetch and no
second program-year computation: the active program year is still resolved once
per run and threaded (#1284), and `calculateProgramYear` stays calendar-pure.
An unreadable summary is undecided, not a verdict (#1129) — the list passes
through untouched. A reconciliation that drops _every_ district fails the run
loudly rather than reporting a quiet zero-district success (R17).

## 4. The archived directory is left as it is — deliberately

`snapshots/2026-06-30/` in `toast-stats-data-ca` is **not** mutated by this
change. Three reasons:

1. **A correction is not a delete.** Removing the 30 renumbered objects would
   leave `metadata.json` and `manifest.json` still describing the 94-district
   run, i.e. a directory that disagrees with its own manifest in the opposite
   direction. A faithful correction is a re-run of that date with the fix in
   place, followed by a prune of the objects the re-run does not write — an
   operator-dispatched pipeline action, not a code change.
2. **The read side must not depend on it.** Any rollup that only becomes correct
   after the archive is rewritten is one restatement away from being wrong
   again. #1466 makes the rollup count each club once — keyed on the canonical
   club id and scoped to the district set the date's `all-districts-rankings.json`
   actually lists — and pins it with a fixture frozen from the **defective**
   directory, so the guard holds whether or not the archive is ever rewritten.
3. **Nothing published today reads the directory naively.** The CEO-report
   oracle reads `all-districts-rankings.json` (128 entries, unaffected), and
   every shipped artifact is per-district. The double-count is latent, not live.

### Remediation runbook, if the archive is ever corrected

1. Dispatch `data-pipeline.yml` in `rescrape` mode for `2026-06-30` with the
   fix deployed; discovery for that date resolves the 128-district set, and the
   reconciliation now drops anything the date's own summary does not list.
2. Delete the objects the re-run does not write — the 30 renumbered files:
   `gsutil -m rm gs://toast-stats-data-ca/snapshots/2026-06-30/district_2[0-3][0-9].json`
   — three-digit ids only, so `district_20.json`…`district_29.json` are not
   matched. List it before removing it and confirm exactly 30 objects, all in
   201–231.
3. Re-verify: `all-districts-rankings.json` still sums to 548,483 and the
   directory's district-file count matches its `manifest.json`.

Until then, #1466's guard is the standing protection.
