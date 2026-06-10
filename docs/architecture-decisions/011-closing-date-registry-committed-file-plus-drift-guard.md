# ADR-011: Closing-date registry stays a committed file; the daily pipeline guards its freshness instead of writing it

- **Status:** Accepted
- **Date:** 2026-06-10
- **Issue:** #1128 (epic #1098, subsumes #1110; audit `docs/audits/deep-dive-review-2026-06-09.md` §9b)

## Context

`docs/month-end-closing-dates.json` maps each Toastmasters data month to its
closing date — the asOf the dashboard export serves that month's final data
under. It feeds `scripts/rescrape-historical.ts` (the historical-backfill
tool) and, from Sprint 2 (#1129), the rebuild's fail-closed closing remap.

`ClosingDateRegistry` (#203) claimed to be "used by the daily pipeline" but
had **zero production callers**, and the registry went stale for 3 months
(last entry 2026-01, generatedAt 2026-03-19) with nothing noticing. #1128's
charter: wire the class into the daily pipeline so closing scrapes append
entries, **or** delete it and document a manual process.

## Decision

**Keep the class. Keep the committed file as the single canonical registry.
Do NOT auto-append from CI. Wire the daily pipeline as a freshness GUARD,
and maintain the file with a derivation script run locally.**

1. `scripts/lib/registryFreshness.ts` — pure, unit-tested decision logic:
   derive the expected entries for **completed** closing months from raw-csv
   metadata (a month is complete only when a later collection exists), and
   compare against the committed registry.
2. `scripts/update-closing-date-registry.ts` — derives + appends via
   `ClosingDateRegistry` (its production caller). `--set YYYY-MM=YYYY-MM-DD`
   records outage months that metadata cannot prove (provenance: TI's own
   dashboard as-of lists). The operator commits the diff.
3. `data-pipeline.yml` (daily mode) runs `scripts/closing-registry-check.ts`
   after the GCS upload. Drift files/refreshes a **self-clearing**
   `closing-registry-stale` issue (the promotion-held alert shape, #1073).
   The step never blocks the data publish, and a feed failure alerts rather
   than passes (L107: "cannot tell" is stale).

## Why not auto-append from CI

- **Auto-append is blind exactly where the registry matters most.** The
  missing months that motivated this epic (2026-02, 2022-04) had **no
  closing scrapes at all** (collection outages) — a pipeline appender would
  have missed them identically. Outage months can only come from TI behavior
  (its dashboard as-of lists), i.e. a human-reviewed entry.
- **CI→main commits are a new, race-prone capability** (push collisions with
  PR merges, workflow-token write scope, self-triggering CI) bought for ~12
  events/year, every one of which is already derivable on demand from GCS
  metadata.
- **The real failure was silence, not labor.** Appending was never the hard
  part; _knowing the file was behind_ was. A loud, self-clearing drift alert
  fixes the observed failure mode directly (L107/L155).

## Why not delete the class

Sprint 2 (#1129) makes the registry a production input to the rebuild's
fail-closed remap, and `rescrape-historical.ts` already consumes the file.
The class is the single validated writer (dedupe, same-month update, sort,
atomic write) for both derived and manual entries.

## Notable evidence recorded with this decision

TI's dashboard month dropdown (`district.aspx?id=61&month=N`) exposes each
month's full as-of list; the newest option is the closing date. Validated
against 6 known months with zero misses (2025-12, 2022-03, 2022-05,
2026-03, 2026-04, 2026-05), then used for the backfill:

- **2026-02 → 2026-03-05** (collection outage; underivable from metadata).
- **2022-04 → 2022-04-30** — same-month: TI never archived a May-2022
  reconciliation (its export returns header-only CSVs for every May asOf;
  2022-05 itself closed late, 06-17). April 2022's final archived data is
  the in-month 04-30 daily.
- **2026-01 corrected 2026-02-13 → 2026-02-05.** TI's Jan-2026 as-of list
  ends at 02-05, and **02-13 appears in TI's FEB-2026 as-of list** — the
  stray `raw-csv/2026-02-13` is a February daily scrape, not a January
  closing collection. This falsifies the audit's "remap 2026-02-13 →
  2026-01-31" assumption; Sprint 2's stray-handling decision must use this
  finding (the stray's raw date appears to be legitimately 2026-02-13).

## Consequences

- The registry's staleness is now red within one daily run instead of
  silently unbounded.
- Operators update the file with one command + one commit; manual entries
  carry provenance in the file's top-level `note`.
- The freshness check trusts a registry date LATER than the derivable one
  (a manual entry can know more than partial metadata), and only alarms
  when reality provably moved past the committed entry.
