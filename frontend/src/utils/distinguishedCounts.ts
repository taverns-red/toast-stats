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

/** Which source the resolved figures came from (#2580). */
export type DistinguishedSource = 'analytics' | 'rankings' | 'qualifying-today'

export interface ResolvedDistinguishedCounts extends DistinguishedCountPair {
  source: DistinguishedSource
}

/** Without a qualifying-today figure, provisional is unknown unless the
 *  pipeline pair is present, and with no source at all nothing resolves. */
export interface PartialDistinguishedCounts {
  confirmed: number | null
  provisional: number | null
  source: DistinguishedSource | 'none'
}

interface ResolveInput {
  /** `distinguishedCounts` from the district analytics file, when present. */
  counts?: DistinguishedCountPair | null | undefined
  /** The rankings row's `distinguishedClubs` (confirmed), when loaded. */
  rankingConfirmed?: number | null | undefined
}

export function resolveDistinguishedCounts<
  Q extends number | null | undefined = undefined,
>(
  input: ResolveInput & { qualifyingToday?: Q }
): Q extends number ? ResolvedDistinguishedCounts : PartialDistinguishedCounts {
  type Out = Q extends number
    ? ResolvedDistinguishedCounts
    : PartialDistinguishedCounts
  const { counts, rankingConfirmed, qualifyingToday } = input
  if (counts) {
    return {
      confirmed: counts.confirmed,
      provisional: counts.provisional,
    } as unknown as Out
  }
  if (rankingConfirmed !== null && rankingConfirmed !== undefined) {
    return {
      confirmed: rankingConfirmed,
      provisional: Math.max(0, (qualifyingToday ?? 0) - rankingConfirmed),
    } as unknown as Out
  }
  return {
    confirmed: qualifyingToday ?? undefined,
    provisional: 0,
  } as unknown as Out
}
