---
date: 2026-07-06
tier: principle
summary: During month-end closing the CSV as-of date (sourceCsvDate / data.date) drifts past the pinned snapshot date — key every per-snapshot fetch and date-scoped lookup on the snapshot date, never data.date
tags: [closing-period, reconciliation, frontend, cdn, snapshot-date, source-csv-date, regression-class]
---

# Principle — Key per-snapshot fetches on the snapshot date, not the as-of `sourceCsvDate`

**First filed:** 2026-07-06 (#1315). **Recurrence #4** of one root cause.

## The trap

Toastmasters' month-end reconciliation pins a snapshot to the month-end
(`2026-06-30`) while the dashboard **as-of** date keeps advancing
(`sourceCsvDate = 2026-07-05`). These two dates are **equal mid-month** and
**diverge during the closing window** — so code that conflates them passes every
test and every day of the month, then silently breaks for ~3 weeks each close.

In the frontend the trap is concrete: `fetchCdnRankingsForDate(date)` returns
`{ rankings, date }` where **`data.date` is the `sourceCsvDate`**, not the
snapshot date. Per-snapshot CDN files live under the **snapshot date**
(`snapshots/{snapshotDate}/competitive-awards.json`, `…/all-districts-rankings.json`,
per-district analytics, …). So `useCompetitiveAwards(data?.date)` fetches
`snapshots/2026-07-05/competitive-awards.json` → **404 → null → blank UI, no
error**. The canonical snapshot date to use is `effectiveDate` (from
`useProgramYearControls`, the same value handed to `fetchCdnRankingsForDate`).

## Why it keeps recurring

The two variables look interchangeable and are, 340 days a year. The bug only
appears during closing, and only to whoever is testing then. It has bitten four
times in different subsystems:

- **#1289** — promote gate blocked on "base drift" (bases move during closing).
- **#1292** — counter cap tripped on a legit closing charter spike.
- **#1296** — freshness badge showed the pinned date, not the as-of date.
- **#1315** — `RegionPage` keyed `useCompetitiveAwards(data?.date)` instead of
  `effectiveDate`, blanking the Distinguished-District countdown + tier columns.

## The rule

- **Any per-snapshot fetch or date-scoped lookup keys on the snapshot date
  (`effectiveDate`), never `data.date`.** Treat `data.date` as the *as-of*
  date (display/provenance only).
- When you see `data.date` (or a rankings query result's `date`) flowing into a
  fetch key, a query key, or a comparison, stop — it's almost certainly the
  sourceCsvDate.
- **Test in the divergence.** A unit/render test where `sourceCsvDate !==
  snapshotDate` catches this; one where they're equal never will (that's why the
  existing RegionPage tests missed #1315). Set them apart in the fixture.
- The durable fix is systemic (a shared snapshot-date source, a branded
  `SnapshotDate` type, or a test/lint that flags `data.date → fetch-hook`). See
  the snapshot-date-guard epic.

Related: [[resolve-the-active-program-year-by-data-not-the-calendar]] — the
collector-side sibling of the same calendar-vs-data divergence.
