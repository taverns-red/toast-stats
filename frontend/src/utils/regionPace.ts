import type {
  DistrictRecognitionTier,
  DistrictTierCounts,
} from '@taverns-red/analytics-core'
import type { DistinguishedDistrictTier } from '../services/cdn'

/* "On track, based on last year's pace" (#2307; rule approved by Ron on
   2026-10-27). A district is on track for a tier when each of
     paid clubs ÷ club base, payments ÷ payment base,
     Distinguished clubs ÷ club base
   is at least the median of the districts that earned that tier or higher
   at the reference program year's end (its June 30 snapshot), measured on
   the same day of the reference year — or the nearest earlier snapshot.

   Ratios to the district's own base, not raw counts: at 2025-09-30 the
   districts that went on to earn Distinguished or higher ran from 45 to 207
   paid clubs, so raw medians measure size, not pace (Smedley earners' median
   of 86 paid clubs sat below the Distinguished-or-higher median of 116.5).
   The tiers themselves are defined against the same bases (Item 1490).

   Reference years are listed explicitly: 2025-26's per-date Distinguished
   counts were verified after the CSP-rule rebuild (run 40494853216). Add a
   year here only once its published dates have been checked the same way. */

export const PACE_REFERENCE_YEARS: Readonly<Record<string, string>> = {
  '2026-2027': '2025-2026',
}

export interface PaceRatios {
  clubs: number
  payments: number
  distinguished: number
}

export interface PaceMedian extends PaceRatios {
  /** Districts the median is taken over. */
  districts: number
}

/** The reference year's snapshot for `snapshotDate`'s day of the year: the
    same calendar day a year earlier (29 Feb → 28 Feb), else the nearest
    earlier date, never before the reference year's July 1. */
export function paceReferenceDate(
  snapshotDate: string,
  referenceProgramYear: string,
  dates: ReadonlyArray<string>
): string | null {
  const year = Number(snapshotDate.slice(0, 4)) - 1
  let monthDay = snapshotDate.slice(5)
  if (monthDay === '02-29') monthDay = '02-28'
  const target = `${year}-${monthDay}`
  const start = `${referenceProgramYear.slice(0, 4)}-07-01`
  let best: string | null = null
  for (const d of dates) {
    if (d >= start && d <= target && (best === null || d > best)) best = d
  }
  return best
}

/** The reference year's June 30 snapshot (its year-end tiers), if published. */
export function paceYearEndDate(
  referenceProgramYear: string,
  dates: ReadonlyArray<string>
): string | null {
  const end = `${referenceProgramYear.slice(5, 9)}-06-30`
  return dates.includes(end) ? end : null
}

export function paceRatios(c: DistrictTierCounts): PaceRatios | null {
  if (!(c.paidClubBase > 0) || !(c.paymentBase > 0)) return null
  return {
    clubs: c.paidClubs / c.paidClubBase,
    payments: c.totalPayments / c.paymentBase,
    distinguished: c.distinguishedClubs / c.paidClubBase,
  }
}

const median = (values: number[]): number => {
  const v = [...values].sort((a, b) => a - b)
  const mid = Math.floor(v.length / 2)
  return v.length % 2 === 1 ? v[mid]! : (v[mid - 1]! + v[mid]!) / 2
}

const TIER_RANK: Record<DistinguishedDistrictTier, number> = {
  Unknown: 0,
  NotDistinguished: 0,
  Distinguished: 1,
  Select: 2,
  Presidents: 3,
  Smedley: 4,
}

/** Per tier, the median ratios on the reference date of the districts that
    earned it or higher at the reference year's end; null when none did. */
export function paceMedians(
  referenceRows: ReadonlyArray<DistrictTierCounts & { districtId: string }>,
  yearEndTiers: Record<string, { currentTier: DistinguishedDistrictTier }>,
  tiers: ReadonlyArray<DistrictRecognitionTier>
): Partial<Record<DistrictRecognitionTier, PaceMedian | null>> {
  const out: Partial<Record<DistrictRecognitionTier, PaceMedian | null>> = {}
  for (const tier of tiers) {
    const ratios: PaceRatios[] = []
    for (const r of referenceRows) {
      const earned = yearEndTiers[r.districtId]?.currentTier
      if (!earned || TIER_RANK[earned] < TIER_RANK[tier]) continue
      const p = paceRatios(r)
      if (p) ratios.push(p)
    }
    out[tier] =
      ratios.length === 0
        ? null
        : {
            clubs: median(ratios.map(p => p.clubs)),
            payments: median(ratios.map(p => p.payments)),
            distinguished: median(ratios.map(p => p.distinguished)),
            districts: ratios.length,
          }
  }
  return out
}

export function isOnTrack(c: DistrictTierCounts, m: PaceRatios): boolean {
  const p = paceRatios(c)
  return (
    p !== null &&
    p.clubs >= m.clubs &&
    p.payments >= m.payments &&
    p.distinguished >= m.distinguished
  )
}
