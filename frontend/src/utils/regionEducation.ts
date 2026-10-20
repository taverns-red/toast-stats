/**
 * Region education page model (#1810, epic #1781) over the #1801 rollup.
 *
 * Ledger only, read as the rollup computed it: the region block's totals,
 * KPIs and Pathways-only level × path matrix (rows via the same
 * `pathwaysBreakdown` the district page uses, so both read a matrix alike),
 * and one row per district the block names — summed or not available. The
 * districts come from the block's own two lists, so the table and the totals
 * can never disagree on membership (that PY's regions, #1820).
 *
 * Absent is never 0: a district without a ledger is a `not-available` row
 * with the rollup's reason; a figure the rollup did not measure stays
 * `null`; no rollup, no regions for the PY, or a region the PY does not have
 * is `not-available` with its own reason.
 */
import type {
  EducationAwardTotals,
  EducationRollupAggregate,
  EducationRollupIndex,
  EducationRollupProgramYear,
} from '@taverns-red/shared-contracts'
import {
  PATHWAYS_PATHS,
  pathwaysBreakdown,
  type EducationSummary,
} from './districtEducation'

export type RegionEducationUnavailableReason =
  /** No rollup object for the PY (a 404 or an off-contract body). */
  | 'no-rollup'
  /** The PY predates the region history (#1820 starts in 2016-17). */
  | 'no-regions'
  /** The PY's regions do not include this one. */
  | 'region-absent'

export type RegionEducationDistrictRow =
  | {
      id: string
      status: 'available'
      totals: EducationAwardTotals
      clubsWithAward: number
      /** `null` = not measured (archive years). */
      membersWithAward: number | null
    }
  | {
      id: string
      status: 'not-available'
      reason: string
    }

export type RegionEducation =
  | { status: 'not-available'; reason: RegionEducationUnavailableReason }
  | {
      status: 'available'
      summary: EducationSummary
      kpis: EducationKpis
      districts: RegionEducationDistrictRow[]
      coverage: { available: number; notAvailable: number }
      source: {
        source: EducationRollupProgramYear['source']
        sourceDate: string | null
      }
    }

export interface BuildRegionEducationInput {
  rollup: EducationRollupProgramYear | null
  /** The padded region id from the URL (#2130). */
  region: string
}

const byCountThenCode = (
  a: { code: string; count: number },
  b: { code: string; count: number }
) => b.count - a.count || a.code.localeCompare(b.code)

const codeCounts = (m: Record<string, number>) =>
  Object.entries(m)
    .map(([code, count]) => ({ code, count }))
    .sort(byCountThenCode)

const TITLES: ReadonlyMap<string, string> = new Map(
  PATHWAYS_PATHS.map(p => [p.code, p.title])
)

const numeric = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true })

export interface EducationKpis {
  awards: number
  /** `null` = not measured (archive years). */
  membersWithAward: number | null
  dtms: number
  tripleCrownAchievers: number | null
  clubsWithAward: number
}

/** A rollup aggregate (a region's or the world's block) read as a page
 *  summary and KPI strip: the block's own totals, its Pathways-only matrix
 *  as path and level rows (the district page's `pathwaysBreakdown`). */
export function summariseEducationAggregate(block: EducationRollupAggregate): {
  summary: EducationSummary
  kpis: EducationKpis
} {
  const cells = new Map(Object.entries(block.pathwaysMatrix))
  return {
    summary: {
      totals: { ...block.totals },
      ...pathwaysBreakdown(cells, TITLES, block.totals.dtm),
      legacyByCode: codeCounts(block.legacyByCode),
      otherByCode: codeCounts(block.otherByCode),
    },
    kpis: {
      awards: block.totals.awards,
      membersWithAward: block.membersWithAward,
      dtms: block.totals.dtm,
      tripleCrownAchievers: block.tripleCrownAchievers,
      clubsWithAward: block.clubsWithAward,
    },
  }
}

export function buildRegionEducation({
  rollup,
  region,
}: BuildRegionEducationInput): RegionEducation {
  if (!rollup) return { status: 'not-available', reason: 'no-rollup' }
  if (!rollup.regions) return { status: 'not-available', reason: 'no-regions' }
  const block = rollup.regions[region]
  if (!block) return { status: 'not-available', reason: 'region-absent' }

  const { summary, kpis } = summariseEducationAggregate(block)

  const ids = [...block.districtsAvailable, ...block.districtsNotAvailable]
  const districts: RegionEducationDistrictRow[] = ids.sort(numeric).map(id => {
    const d = rollup.districts[id]
    if (d?.status === 'available') {
      return {
        id,
        status: 'available',
        totals: { ...d.awards.totals },
        clubsWithAward: d.awards.clubsWithAward,
        membersWithAward: d.awards.membersWithAward,
      }
    }
    return {
      id,
      status: 'not-available',
      reason: d?.status === 'not-available' ? d.reason : 'no-data',
    }
  })

  return {
    status: 'available',
    summary,
    kpis,
    districts,
    coverage: {
      available: block.districtsAvailable.length,
      notAvailable: block.districtsNotAvailable.length,
    },
    source: { source: rollup.source, sourceDate: rollup.sourceDate },
  }
}

/** The region's totals per program year, oldest first, from the index's
 *  trend (each year over that year's districts with a ledger). */
export function regionEducationTrend(
  index: EducationRollupIndex | null,
  region: string
): { programYear: string; totals: EducationAwardTotals }[] {
  const byYear = index?.trend.regions[region]
  if (!byYear) return []
  return Object.entries(byYear)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([programYear, totals]) => ({ programYear, totals }))
}
