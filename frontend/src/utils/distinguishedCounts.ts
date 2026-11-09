/* The district Distinguished KPI's confirmed / provisional pair (#2554,
   epic #2555; Ron's decision of 2026-11-08).

   Confirmed is the headline and the basis of the rank and % beside it.
   Provisional (clubs that qualify on current membership but are not yet
   confirmed) is shown separately and never summed in.

   Source order (ADR 0019, expand only):
   1. `distinguishedCounts` on `district_{id}_analytics.json` (#2553), the
      pipeline's one source. Published from the daily run after #2553.
   2. Until then, two existing fields:
      - the rankings row's `distinguishedClubs` is the confirmed count (TI's
        count, the one the landing page shows and the rank is computed from);
      - the performance-targets `currentProgress.distinguished` is the
        qualifying-today count (confirmed + provisional).
      Provisional is then their difference, floored at 0 because the two
      files count slightly different club bases (paid-only vs all clubs).
   3. With no confirmed source at all, the qualifying-today figure is shown
      alone, with no provisional part. */

export interface DistinguishedCountPair {
  confirmed: number
  provisional: number
}

export function resolveDistinguishedCounts(input: {
  /** `distinguishedCounts` from the district analytics file, when present. */
  counts?: DistinguishedCountPair | null | undefined
  /** The rankings row's `distinguishedClubs` (confirmed), when loaded. */
  rankingConfirmed?: number | null | undefined
  /** performance-targets `currentProgress.distinguished`. */
  qualifyingToday: number
}): DistinguishedCountPair {
  const { counts, rankingConfirmed, qualifyingToday } = input
  if (counts) {
    return { confirmed: counts.confirmed, provisional: counts.provisional }
  }
  if (rankingConfirmed !== null && rankingConfirmed !== undefined) {
    return {
      confirmed: rankingConfirmed,
      provisional: Math.max(0, qualifyingToday - rankingConfirmed),
    }
  }
  return { confirmed: qualifyingToday, provisional: 0 }
}
